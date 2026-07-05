# Deploy Operations

Maintainer runbook for the `agda-mcp-server` ingest endpoint + cron judge running
on the JHU IDIES k8s-dev cluster (Phase 8, DEPLOY-01). This file is extended
further by later plans (08-05, 08-06) as more of the deployment is verified.

## Cluster access recap

Full details, the 3-hop SSH pattern, and all cluster facts live in
[`.claude/skills/agda-mcp-k8s-deploy/SKILL.md`](../.claude/skills/agda-mcp-k8s-deploy/SKILL.md)
— read that file before touching the cluster by hand. Do not duplicate its
content here; this doc only lists the repeatable command recipes that build on
top of it.

Two distinct access paths exist — do not conflate them:

- **CI (GitHub Actions) → cluster**: a direct 2-hop SSH from the runner
  (`dslogin01.pha.jhu.edu` → `k8slgn.idies.jhu.edu:14132`) using the
  `K8S_SSH_PRIVATE_KEY` repository secret, decoded on the ephemeral runner
  itself. No Tailscale hop — GitHub-hosted runners reach `dslogin01` directly
  over the public internet. See `.github/workflows/deploy-ingest.yml`.
- **Human/interactive → cluster**: the documented 3-hop path (this Mac →
  `ericliu@100.120.232.115` over Tailscale → `cliu238@dslogin01.pha.jhu.edu` →
  `k8slgn.idies.jhu.edu:14132`), used only for one-off maintenance like the
  secret-rotation recipes below. The SSH private key
  (`~/.ssh/github_actions_k8s`) lives ONLY on the Tailscale-reachable JHU work
  Mac.

## Secret rotation

Both cluster secrets below live in the `llm-gateway` namespace and are synced
imperatively (never `kubectl edit`'d directly, never committed to a manifest —
see `k8s/team-keys-secret.yaml.template` for why). Re-running either sync
command is safe (idempotent `--dry-run=client -o yaml | kubectl apply -f -`).

### `agda-mcp-ghcr` (GHCR image pull secret)

This project uses its OWN pull secret, `agda-mcp-ghcr` — never litellm's
shared `ghcr-credentials`. Verified 2026-07-05: that secret's credential
cannot pull `ghcr.io/cliu238/agda-mcp-server` (403), and a cliu238
`read:packages` PAT cannot pull `ghcr.io/jh-dsai/litellm` (403), so the two
apps need separate credentials and neither secret may overwrite the other.

The credential is a **classic** PAT for `cliu238` with ONLY the
`read:packages` scope (GHCR does not accept fine-grained PATs for container
pulls; `repo` scope does not cover package pulls). To rotate:

1. Mint the PAT at https://github.com/settings/tokens (classic, `read:packages`
   only), save it to `~/.agda-mcp-ghcr-token` (`chmod 600`).
2. Sanity-check it can pull, without echoing it (expect `200`):

   ```bash
   TOKEN=$(tr -d '\n' < ~/.agda-mcp-ghcr-token)
   BEARER=$(curl -s -u "cliu238:${TOKEN}" "https://ghcr.io/token?service=ghcr.io&scope=repository:cliu238/agda-mcp-server:pull" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
   curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer ${BEARER}" \
     -H "Accept: application/vnd.oci.image.index.v1+json" \
     https://ghcr.io/v2/cliu238/agda-mcp-server/manifests/latest
   ```

3. Run the one-shot script pattern from SKILL.md's "Cluster Access" section,
   interpolating the token value into the remote step when writing the script
   (never echo it):

   ```bash
   kubectl create secret docker-registry agda-mcp-ghcr \
     --namespace=llm-gateway \
     --docker-server=ghcr.io \
     --docker-username=cliu238 \
     --docker-password="<token value>" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

4. Delete `~/.agda-mcp-ghcr-token` once the rollout pulls successfully.

Never echo the token value in any script output — only the resulting
`secret/agda-mcp-ghcr configured` confirmation line should ever be printed.

### `agda-mcp-team-keys` (team upload Bearer-key registry)

Adding or revoking a teammate's key is a two-step local-then-sync flow:

1. **Locally**, mint or revoke the key:

   ```bash
   npx tsx scripts/team/issue-key.mjs issue <person-slug>    # mint/rotate
   npx tsx scripts/team/issue-key.mjs revoke <person-slug>   # revoke
   npx tsx scripts/team/issue-key.mjs list                   # audit (no secrets printed)
   ```

   This updates the local, gitignored `scripts/team/data/team-keys.json`
   registry. The raw key is printed to stdout exactly once at issuance —
   capture it immediately and hand it to the teammate out-of-band; it is
   never written to disk anywhere.

2. **Sync to the cluster**, via the same one-shot script pattern:

   ```bash
   base64 -i scripts/team/data/team-keys.json | tr -d '\n'
   # embed the resulting single-line blob in the remote step:
   echo '<base64 blob>' | base64 -d > /tmp/agda-mcp-team-keys.json.sync
   kubectl create secret generic agda-mcp-team-keys \
     --namespace=llm-gateway \
     --from-file=team-keys.json=/tmp/agda-mcp-team-keys.json.sync \
     --dry-run=client -o yaml | kubectl apply -f -
   rm -f /tmp/agda-mcp-team-keys.json.sync
   ```

   `readKeyRegistry` (`scripts/team/issue-key.mjs`) always re-reads from disk
   on every request, so a Secret-volume update propagates to the ingest
   pod's next request within the kubelet's own sync period — no pod restart
   required.

Confirm both secrets landed with:

```bash
kubectl get secret agda-mcp-ghcr agda-mcp-team-keys -n llm-gateway
```

## Pre-deploy quota check

Before rolling out a change that adds pods (a new Deployment, a CronJob), check
both dimensions of the `llm-gateway-compute` ResourceQuota — not just CPU and
memory:

```bash
kubectl get pods -n llm-gateway --no-headers | wc -l
kubectl describe resourcequota llm-gateway-compute -n llm-gateway
```

The hard pod-count limit is **5**. As of this writing, `llm-gateway` runs 1
pod (litellm); the ingest Deployment (1 replica) plus at most 1 cron-judge pod
at a time (`concurrencyPolicy: Forbid` in `k8s/cronjob.yaml`) brings the peak
to 3 — comfortable headroom under the hard limit. Count any lingering
`Completed`/`Evicted` pods too; they still consume quota until garbage
collected.

## Verification

_Placeholder — extended by Plans 08-05 and 08-06 with the deploy-verification
and cron-judge-verification command recipes once those plans land._
