---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
plan: 06
subsystem: infra
tags: [k8s, kubectl, vitest, git-tag, policy-01, deploy-01, team-05, cephfs]

# Dependency graph
requires:
  - phase: 08-01..08-05
    provides: "installer + Dockerfile + k8s manifests + CI/CD pipeline + live deployed ingest/cron-judge (all local commits, unpushed until this plan)"
  - phase: 06-backlog-digestion
    provides: "POLICY-01 case-exact loud-fail policy resolution + the 6-test POLICY-01 suite in oracle-orcl-02.test.ts (proven on ubuntu-latest CI)"
  - phase: 07-team-feedback-channel-local-wiring
    provides: "the local ingest/upload/cron path (TEAM-01..04) whose regression suite this plan re-runs at phase end"
provides:
  - "POLICY-01 6/6 green ON THE DEPLOYED CLUSTER POD's own filesystem (kubectl exec vitest run, exit 0) — DEPLOY-01's third acceptance criterion closed"
  - "Local-mode regression 96/96 green at PHASE END — DEPLOY-01's 'local mode remains a working fallback' criterion holds after all packaging changes"
  - "Annotated tag v1.1 on 6c0d716d, pushed to origin — the real tag TEAM-05's installer pins (D-11); tree verified to contain install-pinned-env.sh, Dockerfile, k8s/deployment.yaml"
  - "docs/DEPLOY-OPERATIONS.md final section: phase-end acceptance evidence (cluster POLICY-01 run, regression count, tag record, image-layer-vs-PVC distinction)"
affects: [milestone-audit, v1.1-review-chain, team-onboarding, any-future-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: ["phase-end acceptance sweep: re-run prior phases' proofs on the final deployed artifact before tagging", "tag-then-document: the closing runbook section records the tag SHA, so it necessarily lands in a post-tag commit"]

key-files:
  created: []
  modified:
    - docs/DEPLOY-OPERATIONS.md

key-decisions:
  - "Tag+push sequencing (orchestrator-decided deviation from plan text): tag v1.1 first, then push origin main (the FIRST push of the session's batched 08-01..08-06 commits — deliberately triggers the D-06 auto-deploy workflow), then push the tag; the plan text only mentioned pushing the tag"
  - "The v1.1 tree intentionally excludes the final post-tag runbook commit (d157134) — inherent to the plan's own tag-then-document sequence, documentation-only, no code affected"
  - "POLICY-01 cluster evidence captured as the vitest summary (6 passed | 29 skipped, exit 0) without a verbose per-test rerun — the -t filter selects exactly the 6-test POLICY-01 describe block, so 6/6 passing is unambiguous"

patterns-established:
  - "Cluster test-run recipe: kubectl exec deployment/<name> -c <main-container> -- npx vitest run <file> -t '<describe filter>' (works because the image ships full devDependencies and WORKDIR /app is the repo checkout)"

requirements-completed: [DEPLOY-01, TEAM-05]

# Metrics
duration: 7min
completed: 2026-07-05
---

# Phase 8 Plan 06: Phase-End Acceptance Sweep + v1.1 Tag Summary

**POLICY-01 re-proven 6/6 on the live cluster pod's own filesystem, local mode re-proven 96/96 at phase end, and annotated tag v1.1 cut on 6c0d716d and pushed — the installer's latest-tag resolution now lands on a tag that actually contains Phases 6-9 (D-11).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-05T03:38:32Z
- **Completed:** 2026-07-05T03:45:00Z
- **Tasks:** 2/2
- **Files modified:** 1 (docs/DEPLOY-OPERATIONS.md, two appends)

## Accomplishments

- **DEPLOY-01 third acceptance criterion closed**: `kubectl exec deployment/agda-mcp-ingest -c agda-mcp-ingest -n llm-gateway -- npx vitest run test/unit/tools/oracle-orcl-02.test.ts -t "policy resolution is case-exact and loud"` on live pod `agda-mcp-ingest-6845d86cbc-zrpjt` → **6 passed | 29 skipped, exit 0** (1.12s). Includes Test A, the real CHG shape (`Codex-Homotopy-Group` vs `codex-homotopy-group.json`) asserting a thrown `PolicyResolutionError` — loud hard failure on the cluster, never silent no-policy abstention.
- **Image-layer vs PVC distinction confirmed and documented** (a job of Task 1 per the plan): the policy files under test live in the image layer (`/app/scripts/data/oracle-policy/` on overlay fs — `ls` showed all 4 policy JSONs; `df` showed `/app` on `overlay` vs `/data/team-uploads` on the CephFS mon-mount `…:/LittleLLM`). CephFS semantics play no part in this test.
- **DEPLOY-01 local-fallback criterion holds at PHASE END**: the full TEAM-0x regression (`team-ingest-server`, `team-issue-key`, `team-archive-extract`, `team-cron-ingest-wrapup`, `dogfood-upload-run`, `test/integration/team/`) on Node 24 (`v24.16.0`) → **6 files, 96/96 tests, exit 0** — nothing in the phase's packaging work regressed the shipped local path.
- **v1.1 tagged and pushed (D-11)**: annotated tag on commit `6c0d716d7afeb59c3c97e71d9d045b0f3e17fffd`; `git ls-remote --tags origin` shows `refs/tags/v1.1` (tag object `8c50103b`); `git show v1.1:scripts/team/install-pinned-env.sh` / `:Dockerfile` / `:k8s/deployment.yaml` all exit 0; `git tag --sort=-v:refname | head -1` → `v1.1`, so `docs/TEAM-ONBOARDING.md`'s documented checkout step now resolves to a tag containing TEAM-01..TEAM-05 and DEPLOY-01's deliverables. v1.0 (165 commits stale at phase planning) is superseded as the pin target.

## Task Commits

Each task was committed atomically:

1. **Task 1: POLICY-01 case-sensitivity re-verify on the cluster** - `6c0d716` (docs) — **this is the commit v1.1 tags**
2. **Task 2: local-mode regression re-run + cut and push the v1.1 git tag** - `d157134` (docs, post-tag, intentionally unpushed)

**Plan metadata:** see final docs commit (unpushed)

## Files Created/Modified

- `docs/DEPLOY-OPERATIONS.md` - New final section "Phase-end acceptance (Plan 08-06)": the exact cluster kubectl-exec command + literal vitest output, the image-layer-vs-PVC filesystem distinction, the local regression command + 96/96 result, the v1.1 tag record (SHA, remote proof, tree checks, installer resolution), and the D-11 rationale for why v1.1 (not v1.0) is what the installer pins.

## Decisions Made

- **Tag-then-push-main-then-push-tag sequencing** (orchestrator-decided, recorded as directed): the plan text only said `git push origin v1.1`; the executed sequence was (1) `git tag -a v1.1 …` on the clean final Phase 8 commit, (2) `git push origin main` — the FIRST push of the session's 8 batched local commits, which triggers the auto-deploy workflow per D-06 (expected and accepted; not waited on), (3) `git push origin v1.1`.
- **The v1.1 tree does not contain the final runbook block**: the closing section records the tag's own SHA, so it can only exist in a post-tag commit (`d157134`). Inherent to the plan's own tag-then-document ordering; documentation-only.

## Deviations from Plan

**1. [Orchestrator-directed] `git push origin main` inserted between the tag cut and the tag push**
- **Found during:** Task 2
- **Issue:** Plan text specified only the tag push; but 08-01..08-06's commits were deliberately batched locally (unpushed by design), and a pushed tag pointing at a commit absent from any pushed branch would leave `origin/main` stale and the auto-deploy (D-06) never exercising the tagged state.
- **Fix:** Pushed `main` (ece6ff1..6c0d716, 8 commits) immediately after cutting the tag and before pushing the tag, per explicit orchestrator instruction. This is the only main push of the session; the auto-deploy trigger is expected and accepted.
- **Files modified:** none (git ref operation)
- **Verification:** `git ls-remote` shows both `refs/tags/v1.1` and main at `6c0d716`.

**2. [Note, not a fix] Post-tag doc commit stays unpushed**
- The final runbook commit `d157134` (and this SUMMARY's metadata commit) intentionally remain local — the orchestrator batches the final push after the review chain. The tag content is unaffected (code-complete at `6c0d716`).

---

**Total deviations:** 1 orchestrator-directed sequencing addition, 0 auto-fixes (Rules 1-4 never triggered)
**Impact on plan:** None on scope; the sequencing addition is required for the tag to be usable (an installer cloning origin must be able to reach the tagged commit from a pushed ref).

## Issues Encountered

None. The cluster run passed first try (pod was Running 1/1, healthz `ok` pre-checked); the regression passed first try on Node 24; both pushes succeeded first try.

## Authentication Gates

None — the 3-hop SSH path (Tailscale Mac → dslogin01 → k8slgn) worked non-interactively per SKILL.md, and the git pushes used the session's existing credential (threat model T-08-19: accepted, ordinary repo-write access).

## Known Stubs

None — this plan wrote documentation and git refs only; no code paths, no placeholders.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The only trust-boundary action (tag/branch push to origin) is the plan's own threat register entry T-08-19, disposition accept.

## Next Phase Readiness

- Phase 8 is 6/6 plans complete — DEPLOY-01 and TEAM-05 fully closed; milestone v1.1 execution is 24/24 plans (100%).
- Remaining before milestone close: review chain + verifier + milestone lifecycle (audit/complete). The final batch push (d157134 + this SUMMARY's metadata commit + any review-chain commits) happens after that.
- The v1.1 tag is live NOW: a teammate running the documented installer today gets the correct pinned state.

## Self-Check: PASSED

- docs/DEPLOY-OPERATIONS.md: exists
- 08-06-SUMMARY.md: exists
- Commits 6c0d716 (Task 1, tagged) and d157134 (Task 2, unpushed): exist
- Tag v1.1 -> 6c0d716d locally AND present on origin (git ls-remote)
