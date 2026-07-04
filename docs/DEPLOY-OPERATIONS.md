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

### `ghcr-credentials` (GHCR image pull secret)

Rotate whenever the underlying `gh` session's token changes, or on a schedule
if required by policy. Uses this project's own already-authenticated `gh` CLI
session (`gh auth status` must show an account with `repo` scope).

Run the one-shot script pattern from SKILL.md's "Cluster Access" section,
embedding this remote step:

```bash
kubectl create secret docker-registry ghcr-credentials \
  --namespace=llm-gateway \
  --docker-server=ghcr.io \
  --docker-username=<gh-username> \
  --docker-password=<token from `gh auth token`, obtained LOCALLY> \
  --dry-run=client -o yaml | kubectl apply -f -
```

Never echo the token value in any script output — only the resulting
`secret/ghcr-credentials configured` confirmation line should ever be printed.

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
kubectl get secret ghcr-credentials agda-mcp-team-keys -n llm-gateway
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
