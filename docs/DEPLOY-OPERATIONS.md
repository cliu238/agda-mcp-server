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

### Manual cron-judge trigger + write-back-disabled proof (D-08, D-09)

Two sequential one-off Jobs — NEVER in parallel: the namespace pod quota is
a hard 5 (litellm + ingest + 1 job = 3). Delete each job after capturing
evidence; lingering `Completed` pods still count against the quota.

**Job 1 — the UNMODIFIED CronJob template.** D-08: the judge shares the
ingest Deployment's image + PVC, so `create job --from=cronjob` exercises
exactly what the nightly schedule will run (including its `pvc-dirs`
initContainer). Via the one-shot SSH pattern:

```bash
kubectl delete job agda-mcp-cron-judge-manual-verify -n llm-gateway --ignore-not-found
kubectl create job --from=cronjob/agda-mcp-cron-judge agda-mcp-cron-judge-manual-verify -n llm-gateway
kubectl wait --for=condition=complete --timeout=1800s job/agda-mcp-cron-judge-manual-verify -n llm-gateway
kubectl logs job/agda-mcp-cron-judge-manual-verify -n llm-gateway -c agda-mcp-cron-judge
kubectl logs job/agda-mcp-cron-judge-manual-verify -n llm-gateway -c pvc-dirs
```

Literal main-container log from the 2026-07-05 acceptance run (judging
Task 1's zero-capture archive — completes in seconds; a real
`stagedCaptures`-bearing archive can legitimately take hours, bounded by
`activeDeadlineSeconds: 21600`):

```text
[cron-ingest-wrapup] processed 1 archive(s), 0 capture(s) — 0 filed, 0 abstained (0.0%), 0 terminal-conflict(s), 0 error(s).
```

Durable-PVC-accumulation check (the cron pod is gone; read its write back
through the INGEST pod — pod-lifetime independence is the point):

```bash
kubectl exec deployment/agda-mcp-ingest -n llm-gateway -c agda-mcp-ingest -- \
  find /data/team-uploads -name '*.processed.json'
# → /data/team-uploads/eric/2026-07-05/08-05-accept-20260705T031840Z.tar.gz.processed.json
#   content: { "processedAt": "...", "ok": true, "runId": "...", "results": [] }
```

**Job 2 — the write-back-disabled proof (D-09).** `kubectl exec` into a
`Completed` pod is impossible, so the proof commands are baked INTO the job
via a wrapped command; the evidence lands in the job's own logs. Build a
Job manifest that copies `k8s/cronjob.yaml`'s `jobTemplate` verbatim
(explicit `resources` on ALL containers incl. the initContainer — the
quota rejects any container without them), name it
`agda-mcp-cron-judge-manual-verify-2`, and replace only the main
container's `command` with:

```yaml
command:
  - sh
  - -c
  - |
    npx tsx scripts/team/cron-ingest-wrapup.mjs --queue-path /data/cluster-queue/fix-queue.json --no-push
    ec=$?
    echo "=== write-back-disabled proof ==="
    git -C /app status --short
    echo "=== proof end (wrapup rc=$ec) ==="
    ls -la /app/.git 2>/dev/null || echo "(no /app/.git — image excludes it by design)"
    echo "=== baked-in fix-queue sha256 ==="
    sha256sum /app/test/fixtures/fix-queue.json
    echo "=== fix-queue.json on PVC ==="
    cat /data/cluster-queue/fix-queue.json 2>/dev/null || echo "(absent)"
    echo "=== fix-queue end ==="
    ls -lan /data/cluster-queue
    exit $ec
```

Apply it, `kubectl wait --for=condition=complete --timeout=540s`, then
`kubectl logs job/agda-mcp-cron-judge-manual-verify-2 -n llm-gateway -c
agda-mcp-cron-judge`. Literal output from 2026-07-05:

```text
[cron-ingest-wrapup] processed 0 archive(s), 0 capture(s) — 0 filed, 0 abstained (0.0%), 0 terminal-conflict(s), 0 error(s).
=== write-back-disabled proof ===
fatal: not a git repository (or any of the parent directories): .git
=== proof end (wrapup rc=0) ===
(no /app/.git — image excludes it by design)
=== baked-in fix-queue sha256 ===
8787091029a5c6e88e96395f3ccacd98d89f9be5b1bd1f82ab59483513d1de62  /app/test/fixtures/fix-queue.json
=== fix-queue.json on PVC ===
(absent)
=== fix-queue end ===
total 0
drwxrwsr-x+ 2 2231 2231  0 Jul  5 03:11 .
```

How to read this — three independent write-back-disable layers held:

1. **No repo to write to**: `/app` is not a git repository at all
   (`.dockerignore` excludes `.git` from the image), so
   `writeBackQueue`'s `git add/commit/push` can never operate — stronger
   than the "empty `git status` output" originally expected.
2. **Structural disable**: `--queue-path /data/cluster-queue/fix-queue.json`
   is outside `SERVER_REPO_ROOT`, so `writeBackQueue` short-circuits with
   `queue-path-outside-repo` BEFORE any git subprocess call.
3. **Explicit flag**: `--no-push` (redundant by design with layer 2).

The baked-in checkout is also byte-identical to the committed repo: the
in-pod `sha256sum test/fixtures/fix-queue.json` matches
`git show HEAD:test/fixtures/fix-queue.json | shasum -a 256` locally —
the cron judge never touched the default (in-repo) queue path.

`fix-queue.json` **absent on the PVC is the honest empty-queue state**, not
a failure: `readQueueFile` (scripts/queue/intake.mjs) treats an absent file
as `[]`, and the file is only created by the first `upsertQueueEntry` when
a capture actually files a candidate. A zero-capture archive files nothing.
`processed 0 archive(s)` in Job 2 is Job 1's `.processed.json` marker doing
its idempotency job — the same archive is never judged twice.

Cleanup (always):

```bash
kubectl delete job agda-mcp-cron-judge-manual-verify agda-mcp-cron-judge-manual-verify-2 \
  -n llm-gateway --ignore-not-found
kubectl get pods -n llm-gateway   # back to litellm + ingest only
```

## Phase-end acceptance (Plan 08-06)

The final DEPLOY-01 acceptance sweep, run 2026-07-05 against the live
deployment.

### POLICY-01 case-sensitivity re-verify on the cluster pod

This is the SAME 6-test suite (`describe("policy resolution is case-exact
and loud (POLICY-01)")`, Tests A–F in
`test/unit/tools/oracle-orcl-02.test.ts`) that Phase 6 already proved on
`ubuntu-latest` CI's case-sensitive ext4. This run's value is NOT new test
coverage — it is confirming the suite ALSO passes on the deployed pod's own
filesystem, closing the loop the phase planning called for (the maintainer
Mac is case-insensitive APFS; a case-mismatch bug would hide there).

Filesystem distinction that makes this run meaningful (verified in the same
session): the policy files under test live in the **image layer** at
`/app/scripts/data/oracle-policy/` (overlay filesystem — `agda-stdlib.json`,
`agda-unimath.json`, `autoformalizing-hopf.json`,
`codex-homotopy-group.json`), **not** on the CephFS PVC. The PVC
(`…:6789:/LittleLLM`, mounted at `/data/team-uploads`) plays no part in this
test — CephFS case semantics are irrelevant here; what is exercised is the
image's own Linux overlay fs, which is case-sensitive like CI's ext4 but a
genuinely different filesystem on the genuinely deployed artifact.

Exact command (via the one-shot SSH pattern; the pod has two containers, so
`-c agda-mcp-ingest` is required — `pvc-dirs` is the init container; working
dir is `/app`, the image `WORKDIR`, and the image carries full
devDependencies because 08-02's `npm ci` deliberately omitted `--omit=dev`):

```bash
kubectl exec deployment/agda-mcp-ingest -c agda-mcp-ingest -n llm-gateway -- \
  npx vitest run test/unit/tools/oracle-orcl-02.test.ts -t "policy resolution is case-exact and loud"
```

Literal output from the 2026-07-05 run (pod
`agda-mcp-ingest-6845d86cbc-zrpjt`), exit code 0:

```text
 RUN  v4.1.2 /app

 ✓ test/unit/tools/oracle-orcl-02.test.ts (35 tests | 29 skipped) 14ms

 Test Files  1 passed (1)
      Tests  6 passed | 29 skipped (35)
   Start at  03:39:25
   Duration  1.12s (transform 509ms, setup 0ms, import 725ms, tests 14ms, environment 0ms)
```

All 6 tests in the POLICY-01 describe block passed (the 29 skips are the
rest of the file, excluded by the `-t` filter). That includes Test A — the
real CHG shape (`.agda-lib` name `Codex-Homotopy-Group` vs on-disk
`codex-homotopy-group.json`) asserting a thrown `PolicyResolutionError`
naming the key, the expected filename, and the `oracle-policy` dir — a
case mismatch is a LOUD hard failure on the cluster, never a silent
no-policy abstention.
