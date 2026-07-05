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

Every recipe below was proven live against the deployed cluster on 2026-07-05
(Plan 08-05). Re-run the whole section after any redeploy — it is the
functional acceptance for DEPLOY-01, on top of 08-04's deploy-pipeline checks.

### PVC directory ownership (pvc-dirs initContainer) — read before adding any subPath

First real PVC write initially failed `EACCES` (mkdir under
`/data/team-uploads`). Root cause chain, all verified live:

1. kubelet auto-creates a missing `subPath` directory **root-owned** at pod
   start.
2. This CephFS volume is ACL-enabled, and the ACL **mask** defeats
   `fsGroup`-granted group-`rwx`: `drwxrwsr-x+ root:agdamcp` still denies a
   uid/gid-2231 write. Only uid **ownership** grants write on this mount
   (same lesson as litellm's `/data/logs`, owned `2231:2231`).
3. A root-`chown` pod cannot fix it: the namespace enforces PodSecurity
   `restricted:latest`, which rejects any root pod (`FailedCreate`, tested).
4. The `llm-gateway-compute` ResourceQuota also rejects **init containers**
   without explicit `resources.requests`+`limits` (`FailedCreate`, tested).

The live fix (commit `bc2f873`): both workloads run a restricted-compliant
`pvc-dirs` initContainer (runs as 2231, explicit resources) that mounts the
PVC **root** and `mkdir -p`s the data tree *before* the main container's
`subPath` resolution, so kubelet finds the directories already existing and
2231-owned. Storage subPaths moved to `agda-mcp-data/team-storage` and
`agda-mcp-data/cluster-fix-queue`; in-pod mount paths are unchanged
(`/data/team-uploads`, `/data/cluster-queue`).

Rules going forward:

- Any NEW `subPath` for this project MUST live under a parent that the
  `pvc-dirs` initContainer pre-creates 2231-owned (extend its `mkdir -p`
  list in `k8s/deployment.yaml` **and** `k8s/cronjob.yaml` together).
- The old kubelet-created, root-owned `agda-mcp/` tree on the PVC is
  orphaned junk — only an IDIES admin (root on the Ceph mount) can remove
  it. Pending IDIES-side cleanup; harmless meanwhile.

### Real upload end-to-end (off-cluster → ingress → Ceph PVC)

Proves TEAM-02's client → TEAM-03's ingest → D-07/D-10 storage layout on
the real cluster. Run from any off-cluster machine (this is the teammate
path — no SSH needed until the final landing check).

1. **Healthz** (no auth):

   ```bash
   curl -sf https://dev.sites.idies.jhu.edu/agda-mcp/healthz   # → ok
   ```

2. **Key on hand?** If not, mint/rotate + sync per "Secret rotation" above
   (`issue-key.mjs issue <person>` → base64 registry → `kubectl apply`).
   Hold the raw key ONLY in a `chmod 600` scratch file outside the repo;
   never echo it. After the sync, poll for kubelet Secret propagation
   (measured ~15–90 s; do NOT restart the pod):

   ```bash
   KEY=$(cat /path/to/scratch/key.txt)
   curl -s -o /dev/null -w '%{http_code}' -X POST \
     -H "Authorization: Bearer ${KEY}" \
     https://dev.sites.idies.jhu.edu/agda-mcp/ingest
   # 401 = key not propagated yet, retry after ~20s; 400 = auth OK
   # (missing run-id header), proceed.
   ```

3. **Minimal run fixture**, OUTSIDE the repo (`stagedCaptures: []` keeps the
   later cron-judge run fast — transport proof, not verdict proof):

   ```bash
   SCRATCH=/path/to/scratch   # chmod 700
   RUN_ID="08-05-accept-$(date -u +%Y%m%dT%H%M%SZ)"   # [A-Za-z0-9._-]+ only
   mkdir -p "$SCRATCH/runs/$RUN_ID"
   cat > "$SCRATCH/runs/$RUN_ID/run-report.json" <<EOF
   {
     "schemaVersion": 1,
     "runId": "$RUN_ID",
     "startedAt": "$(date -u -v-60S +%Y-%m-%dT%H:%M:%S.000Z)",
     "endedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
     "corpusRoot": "/nonexistent/agda-mcp-acceptance-fixture",
     "manifestPath": "/nonexistent/manifest.json",
     "totalToolCalls": 0,
     "perTool": {},
     "stagedCaptures": [],
     "transcriptPath": "$SCRATCH/runs/$RUN_ID/transcript.jsonl"
   }
   EOF
   : > "$SCRATCH/runs/$RUN_ID/transcript.jsonl"
   ```

   A nonexistent `corpusRoot` guarantees the agent-log selectors match
   nothing — no real session logs get swept into a test archive (T-08-17).

4. **Upload via the real exported function** (same call pattern as the
   Plan 08-03 acceptance test — no CLI env plumbing needed for key/url):

   ```bash
   cat > "$SCRATCH/upload-driver.mjs" <<'EOF'
   import { readFileSync } from "node:fs";
   import { runUploadForRun } from "<repo>/scripts/dogfood/upload-run.mjs";

   const [runId, keyPath] = process.argv.slice(2);
   const key = readFileSync(keyPath, "utf8").trim();
   const result = await runUploadForRun(runId, {
     key,
     url: "https://dev.sites.idies.jhu.edu/agda-mcp/ingest",
   });
   console.log(JSON.stringify(result));
   EOF
   cd <repo>
   AGDA_MCP_DOGFOOD_RUNS_ROOT="$SCRATCH/runs" \
   AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH="$SCRATCH/upload-queue.jsonl" \
     npx tsx "$SCRATCH/upload-driver.mjs" "$RUN_ID" "$SCRATCH/key.txt"
   ```

   Expected output, exactly: `{"attempted":true,"uploaded":true}`.
   (`AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH` points the failure-path retry queue —
   which would persist the raw key — at the scratch dir, never the repo.)

5. **PVC landing check**, via the one-shot SSH pattern (SKILL.md):

   ```bash
   kubectl exec deployment/agda-mcp-ingest -n llm-gateway -- \
     find /data/team-uploads -name '*.tar.gz'
   ```

   Literal output from the 2026-07-05 acceptance run:

   ```text
   /data/team-uploads/eric/2026-07-05/08-05-accept-20260705T031840Z.tar.gz
   ```

   i.e. the documented `<person>/<UTC-date>/<runId>.tar.gz` layout, with
   every directory level owned `2231:2231` (`ls -lanR /data/team-uploads`).

6. **Hygiene**: shred/delete the scratch key file and driver once done.
