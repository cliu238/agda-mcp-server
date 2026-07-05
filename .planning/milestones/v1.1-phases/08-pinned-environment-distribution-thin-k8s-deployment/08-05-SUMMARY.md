---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
plan: 05
subsystem: infra
tags: [k8s, cronjob, cephfs, nginx-ingress, ghcr, bearer-auth, pvc]

# Dependency graph
requires:
  - phase: 08-04
    provides: first live deploy — ingest Deployment + cron-judge CronJob applied, healthz green at dev.sites.idies.jhu.edu/agda-mcp, agda-mcp-ghcr pull secret, team-keys secret bootstrap
provides:
  - "DEPLOY-01 functional core proven live: real off-cluster upload via runUploadForRun + real rotated Bearer key -> public ingress -> Ceph PVC landing at eric/2026-07-05/08-05-accept-20260705T031840Z.tar.gz, every level owned 2231:2231"
  - "Manual cron-judge Job (unmodified template, D-08) Completed against the real uploaded archive: honest zero-candidate digest, .processed.json marker durable on PVC across pod death"
  - "D-09 write-back-disabled proven in practice via three independent layers (no /app/.git; queue-path-outside-repo structural short-circuit; --no-push) + byte-identity of the baked-in fix-queue.json"
  - "docs/DEPLOY-OPERATIONS.md Verification section: complete copy-pasteable runbook (upload end-to-end, two-job cron verification, PVC-ownership initContainer note)"
affects: [08-06, redeploys, team-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pvc-dirs initContainer pattern: pre-create the 2231-owned PVC tree BEFORE subPath resolution — kubelet root-creates missing subPath dirs, the ACL-enabled CephFS mask defeats fsGroup group-write, and PSA restricted:latest forbids any root chown pod (bc2f873)"
    - "wrapped-command one-off Job: bake in-pod proof commands into the job's own logs, since kubectl exec into a Completed pod is impossible"

key-files:
  created: []
  modified:
    - docs/DEPLOY-OPERATIONS.md

key-decisions:
  - "fix-queue.json absent on the PVC IS the honest empty-queue state (readQueueFile: absent -> []; the file is created only by the first upsertQueueEntry) — never seed an empty file just to satisfy an exists-check"
  - "write-back-disabled proof strengthened: /app ships no .git at all (.dockerignore), so git write-back is impossible by construction; supplemented with sha256 byte-identity of the baked-in test/fixtures/fix-queue.json against the committed version"
  - "DEPLOY-01 left Pending in REQUIREMENTS.md: 08-06 carries the same requirement and owns its remaining criteria (POLICY-01 cluster re-verify, local-fallback phase-end check)"

patterns-established:
  - "PVC subPath rule: any NEW subPath must live under a parent the pvc-dirs initContainer pre-creates 2231-owned (extend deployment.yaml AND cronjob.yaml together)"
  - "Manual cron verification is two sequential jobs (pod quota hard 5): unmodified-template job first, wrapped-command proof job second, delete both after evidence"

requirements-completed: [DEPLOY-01]

# Metrics
duration: 19min
completed: 2026-07-05
---

# Phase 8 Plan 05: Cluster Functional Acceptance Summary

**Real teammate-shaped upload landed on the live Ceph PVC through the public ingress with a real rotated Bearer key, and a real manual cron-judge run completed with the D-09 write-back-disabled property proven in-pod — DEPLOY-01's functional core works, not just deploys.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-07-05T03:13:54Z
- **Completed:** 2026-07-05T03:32:55Z
- **Tasks:** 2
- **Files modified:** 1 (docs/DEPLOY-OPERATIONS.md; plus cluster-side state — secret sync, PVC archive + marker, two throwaway Jobs created and deleted)

## Accomplishments

- **Task 1 — real upload end-to-end:** `runUploadForRun` (the real exported function, per the 08-03 call pattern) against `https://dev.sites.idies.jhu.edu/agda-mcp/ingest` with a freshly rotated `eric` key returned exactly `{"attempted":true,"uploaded":true}`. Remote `find /data/team-uploads -name '*.tar.gz'` shows `/data/team-uploads/eric/2026-07-05/08-05-accept-20260705T031840Z.tar.gz` — the documented `<person>/<UTC-date>/<runId>.tar.gz` layout (D-07/D-10) live, every directory level owned `2231:2231`.
- **Task 2 — manual cron-judge + D-08/D-09 proof:** Job 1 (`kubectl create job --from=cronjob/agda-mcp-cron-judge`, template unmodified — D-08: same image + PVC as ingest) reached `Complete succeeded=1` in seconds and printed the honest digest `processed 1 archive(s), 0 capture(s) — 0 filed, 0 abstained (0.0%), 0 terminal-conflict(s), 0 error(s).` The `.processed.json` marker (`ok: true, results: []`) persisted on the PVC and was read back through the ingest pod after the cron pod died. Job 2 (wrapped command) baked the write-back proof into its logs and confirmed Job 1's marker prevents re-judging (`processed 0 archive(s)`).
- **Runbook complete:** `docs/DEPLOY-OPERATIONS.md` Verification section now carries the full copy-pasteable recipes with literal outputs: healthz, key issuance + secret sync + 401→400 propagation probe, outside-repo fixture, upload driver, PVC landing check, two-job cron verification, three-layer write-back-disable explanation, and the PVC-directory-ownership note (initContainer pattern, why, orphaned `agda-mcp/` tree, new-subPath rule).

## Task Commits

1. **Task 1: real upload through the deployed cluster endpoint + PVC landing verification** - `b69a99e` (docs)
2. **Task 2: manual cron-judge trigger + PVC queue-accumulation + write-back-disabled proof (D-08, D-09)** - `860fc7d` (docs)

Pre-plan blocker-resolution commits (previous blocked attempt + fix, cited for traceability): `c261a2f` (blocker record), `bc2f873` (pvc-dirs initContainer fix, verified live before this run).

## Files Created/Modified

- `docs/DEPLOY-OPERATIONS.md` - Verification section: real-upload recipe, two-job cron-judge recipe with literal outputs, PVC directory ownership note (pvc-dirs initContainer pattern + new-subPath rule)

## Decisions Made

- **Absent `fix-queue.json` = honest empty queue.** `readQueueFile` treats an absent file as `[]` and only the first `upsertQueueEntry` creates it; a zero-capture archive files nothing. Seeding an empty file to satisfy the exists-check would have been evidence fabrication.
- **Write-back proof reads stronger than planned.** `/app` is not a git repository (image excludes `.git` via `.dockerignore`), so the git-credential-free property holds by construction; byte-identity of the baked-in `test/fixtures/fix-queue.json` (sha256 `8787...de62` in-pod == `git show HEAD:` locally) supplies the functional "zero working-tree drift" evidence for the one file the wrapup could have touched.
- **DEPLOY-01 not marked complete in REQUIREMENTS.md** — 08-06 (wave 4) carries DEPLOY-01 + TEAM-05 and owns the remaining criteria (POLICY-01 cluster re-verify, local-mode fallback at phase end). Frontmatter records this plan's contribution per convention (same as 08-04).

## Deviations from Plan

### Resolved Blocker (carried in from the previous executor attempt)

**1. [Blocker resolved — commit `bc2f873`] First real PVC write EACCES (PVC ownership)**
- **Found during:** previous 08-05 executor attempt, Task 1 (recorded in `c261a2f`)
- **Issue:** kubelet auto-creates missing CephFS subPath dirs root-owned; this ACL-enabled mount's mask defeats fsGroup group-write (`drwxrwsr-x+ root:agdamcp` still denies uid/gid-2231 writes); PodSecurity `restricted:latest` rejects any root chown pod (FailedCreate, tested live); the compute quota also rejects init containers lacking explicit requests+limits (FailedCreate, tested live)
- **Fix:** `pvc-dirs` initContainer (runs as 2231, restricted-compliant, explicit resources) mounts the PVC root and pre-creates `agda-mcp-data/{team-storage,cluster-fix-queue}` before subPath resolution; subPaths renamed `agda-mcp/*` → `agda-mcp-data/*` (in-pod mount paths unchanged); old root-owned `agda-mcp/` tree orphaned pending IDIES-side removal
- **Files modified:** k8s/deployment.yaml, k8s/cronjob.yaml (commit `bc2f873`, verified live 03:11Z: tree owned 2231:2231, `WRITE-OK-AS-2231`, healthz ok)
- **Verification (this run):** the entire Task 1 upload and Task 2 cron run succeeded against the new layout; initContainer log re-confirmed 2231:2231 ownership

**2. [Rule 3 - Blocking] `eric` raw key unavailable — re-issued (rotation) + secret re-sync**
- **Found during:** Task 1
- **Issue:** the previous attempt's raw key was wiped per hygiene rules; only hashes exist in the registry
- **Fix:** `issue-key.mjs issue eric` (rotates the hash), base64 registry sync to the `agda-mcp-team-keys` Secret, then 401→400 propagation probe (2×401 then 400 at ~40 s — inside the measured 15–90 s kubelet window; no pod restart)
- **Files modified:** `scripts/team/data/team-keys.json` (gitignored local registry) + cluster Secret
- **Verification:** upload succeeded with the new key; raw key held only in a chmod-600 scratch file, overwritten and deleted after use

### Plan-Assumption Corrections (documented honestly, not worked around)

**3. [Plan assumed /app is a git checkout] `git -C /app status --short` cannot print empty output**
- **Found during:** Task 2 (pre-flight Dockerfile read)
- **Issue:** the plan's `<interfaces>` expected empty output; `.dockerignore` excludes `.git`, so the literal in-pod output is `fatal: not a git repository (or any of the parent directories): .git`
- **Resolution:** documented as the STRONGER guarantee (no repo ⇒ no possible git write-back), plus two corroborating layers (`--queue-path` outside `SERVER_REPO_ROOT` short-circuits `writeBackQueue` with `queue-path-outside-repo` before any git call; `--no-push`), plus sha256 byte-identity of the baked-in `test/fixtures/fix-queue.json` against the committed version as the functional clean-working-tree evidence
- **Verification:** Job 2 logs (literal output reproduced in the runbook)

**4. [Plan assumed fix-queue.json would exist] Absent file is the honest zero-candidate outcome**
- **Found during:** Task 2
- **Issue:** acceptance criterion said `/data/cluster-queue/fix-queue.json` exists and parses as valid JSON; with `stagedCaptures: []` nothing files, and the code creates the file only on first upsert
- **Resolution:** verified `(absent)` from inside the job pod and documented the semantics in the runbook; the 2231-owned `cluster-fix-queue` dir exists on the PVC, and durable cron-pod→PVC writes are proven by the `.processed.json` marker surviving pod death (D-09's accumulation path is writable + durable; the file's absence is correct)

**5. [Method] `kubectl exec` into a Completed pod is impossible**
- **Found during:** Task 2
- **Issue:** the plan's proof command assumed exec against the finished Job's pod
- **Resolution:** second Job built from the cronjob template verbatim (explicit resources on ALL containers incl. init — quota requirement) with only the main command wrapped in `sh -c`, so the proof + fix-queue state land in the job's own logs; jobs run sequentially (pod quota hard 5) and were deleted after evidence capture

---

**Total deviations:** 1 resolved blocker (initContainer fix, pre-run), 1 auto-fixed blocking (key rotation), 3 plan-assumption/method corrections (documented, no code changes needed).
**Impact on plan:** No scope creep. All corrections strengthen the evidence or record honest semantics; the two cluster-behavior corrections (no-git-image, absent-queue-file) are now permanent runbook knowledge.

## Authentication Gates

- **Kubelet Secret propagation** (expected flow, not a deviation): after `agda-mcp-team-keys` re-sync, the ingest pod served 401 for ~40 s until the projected Secret volume refreshed, then 400 (auth OK, missing run-id header). Handled by the documented poll-don't-restart probe.

## Issues Encountered

- Job 1 completed in 5 s — suspiciously fast, so completion alone was not trusted: logs + the on-PVC `.processed.json` marker were pulled to confirm the archive was genuinely discovered, extracted, and judged (it was; zero-capture archives are simply cheap).

## Threat Flags

None new. T-08-17 honored: the uploaded fixture is synthetic (`stagedCaptures: []`, nonexistent `corpusRoot` so the agent-log selectors provably match nothing — no real session logs swept onto the shared PVC). T-08-18 (this plan's own mitigate item) is now CLOSED live: the first non-manifest confirmation that a full cron run completes with zero possibility of git write-back.

## Next Phase Readiness

- 08-06 (wave 4, final Phase 8 plan) unblocked: POLICY-01 case-sensitivity re-verify on the cluster's Linux/CephFS + local-mode fallback regression + TEAM-05 packaging.
- The nightly CronJob (06:00 UTC) will now run against real storage; first scheduled tick is ~2.5 h after this plan's completion — its digest line lands in the job logs if anyone wants a free confirmation.
- Orphaned root-owned `agda-mcp/` PVC tree still pending IDIES-side removal (cosmetic; documented in the runbook).

## Self-Check: PASSED

- `docs/DEPLOY-OPERATIONS.md` exists and contains both `create job --from=cronjob` and `git -C /app status --short` — verified
- `.planning/phases/08-pinned-environment-distribution-thin-k8s-deployment/08-05-SUMMARY.md` exists — verified
- Commits `b69a99e` and `860fc7d` exist in git log — verified
- Plan-level verification: healthz `ok`; both tasks' acceptance evidence captured live on 2026-07-05

---
*Phase: 08-pinned-environment-distribution-thin-k8s-deployment*
*Completed: 2026-07-05*
