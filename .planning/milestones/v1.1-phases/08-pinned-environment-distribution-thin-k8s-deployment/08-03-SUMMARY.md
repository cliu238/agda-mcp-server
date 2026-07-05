---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
plan: 03
subsystem: testing
tags: [onboarding, integration-test, team-distribution, dogfood-upload, wsl2]

# Dependency graph
requires:
  - phase: 08-01
    provides: scripts/team/install-pinned-env.mjs, scripts/team/clone-fuel-corpora.mjs (Agda verify + fuel-corpus clone orchestration)
  - phase: 07
    provides: scripts/team/ingest-server.mjs, scripts/team/issue-key.mjs, scripts/dogfood/upload-run.mjs, scripts/dogfood/transcript-writer.mjs (the local team feedback channel this plan proves end to end)
provides:
  - docs/TEAM-ONBOARDING.md — the documented zero-to-uploading path (prerequisites, WSL2, installer, overnight first build, upload-key setup with local fallback, dogfood-run -> upload, known limitations)
  - test/integration/team/team-onboarding-walkthrough.test.ts — a genuine, non-gated acceptance test proving a simulated fresh teammate reaches a real successful upload against a real local ingest endpoint
affects: [08-04, 08-05, 08-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fresh-teammate acceptance walkthrough: mkdtempSync scratch env + execFileSync DI fakes for the expensive/external steps (Agda verify, git clone) chained into REAL local server + REAL upload over loopback"
    - "Test-hygiene log-selector stubbing: selectClaudeCodeLogs/selectCodexSessionLogs stubbed to empty arrays in tests whose run report claims no agent logs, per agent-log-selection.mjs's own 'never let a test touch the real ~/.claude' convention"

key-files:
  created:
    - docs/TEAM-ONBOARDING.md
    - test/integration/team/team-onboarding-walkthrough.test.ts
  modified: []

key-decisions:
  - "Interpreted the plan frontmatter's illustrative key_link (import { scriptMain }) as non-binding: the detailed <behavior> block explicitly calls for driving install-pinned-env.mjs's individual exported functions (locateAgdaBinary/getAgdaVersion/versionSatisfies/writeRunPinnedAgdaScript) directly rather than scriptMain — followed the more specific, numbered spec; the traceability grep pattern (install-pinned-env\\.mjs) is satisfied either way."
  - "Overrode AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH (in addition to the plan-specified AGDA_MCP_DOGFOOD_RUNS_ROOT) so runUploadForRun's retry-queue machinery never touches the real repo's .agda-mcp/team/ — required by the task's own <done> criterion ('leaves zero residue in the real repo's .agda-mcp/ directory'), matching the exact env-override pattern dogfood-upload-run.test.ts already uses for the same function."

patterns-established:
  - "Team onboarding docs live at docs/TEAM-ONBOARDING.md, plain prose + fenced command blocks, no doc-generation tooling — matches docs/extensions.md's existing style."

requirements-completed: [TEAM-05]

# Metrics
duration: ~25min
completed: 2026-07-04
---

# Phase 8 Plan 03: Team Onboarding Doc + Fresh-Teammate Acceptance Walkthrough Summary

**Zero-to-uploading onboarding doc plus a genuinely-executed fresh-teammate test that drives install-pinned-env.mjs's Agda-verify/clone orchestration into a real local ingest-server.mjs upload over loopback — proving TEAM-05's local-mode fallback before any k8s cluster exists.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-04 (session start, after worktree base sync)
- **Completed:** 2026-07-04T23:17:39Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (both newly created)

## Accomplishments

- `docs/TEAM-ONBOARDING.md`: a complete 7-section walkthrough (prerequisites through known limitations) citing D-01 (git install, no npm account), D-02 (WSL2-only Windows path), D-03 (verify-and-instruct Agda), D-04/D-05 (fuel-corpus clone convention + mandatory env override), and D-09 (durable fix-queue vs. diagnostic-only flaky log) — 7 total `D-NN` citations.
- `test/integration/team/team-onboarding-walkthrough.test.ts`: one deterministic, non-`RUN_AGDA_INTEGRATION`-gated test that drives a simulated fresh teammate (clean `mkdtempSync` scratch dirs standing in for fuel root / runs root / keys path / storage dir) through the exact chain described in the doc — Agda locate+verify (execFileSync fakes for a pinned-2.8.0 happy path), `writeRunPinnedAgdaScript` (real file write, asserted executable with an `exec` line), `cloneAllFuelCorpora` against the real 4-entry `fuel-corpora.json` (no-op-success execFileSync fake), a REAL `createIngestServer` on an OS-assigned loopback port, a REAL `issueKey`, and a REAL `runUploadForRun` — asserting the literal `{ attempted: true, uploaded: true }` result and the exact `<storageDir>/fresh-teammate/<date>/<runId>.tar.gz` archive path on disk.
- Confirmed zero regressions: full `test/unit/` suite (170 files, 1547 tests) passes unchanged; `test/integration/team/` passes; `tsc -p tsconfig.test.json --noEmit` is clean for the new file.
- Confirmed zero residue in the real repo's `.agda-mcp/` directory and no leftover scratch directories after the test run (verified via `git status --short` and a post-run `find`/`ls` sweep).

## Task Commits

Each task was committed atomically:

1. **Task 1: docs/TEAM-ONBOARDING.md — the documented zero-to-uploading path (D-01, D-02, D-03, D-04)** - `babd7ec` (docs)
2. **Task 2: fresh-teammate acceptance walkthrough — installer to a real local upload** - `17fabaa` (test)

**Plan metadata:** (this commit, created after this Summary)

_Note: Task 2 is marked `tdd="true"` in the plan but has no paired `<implementation>` block — its `files_modified` scope is the test file alone. All underlying production code (install-pinned-env.mjs, clone-fuel-corpora.mjs, ingest-server.mjs, issue-key.mjs, upload-run.mjs) predates this plan (delivered in Plan 08-01 and Phase 7). The test passed on first correct write — this is the expected, intended outcome for an integration test proving a pre-existing chain, not a TDD RED-phase violation (the plan's own action text states this test's job is "the end-to-end CHAIN, not re-proving git mechanics"). See "TDD Gate Compliance" below._

## Files Created/Modified

- `docs/TEAM-ONBOARDING.md` - Zero-to-uploading walkthrough: prerequisites, WSL2, installer, overnight corpus build, upload-key + local-fallback setup, dogfood-run -> upload flow, known limitations.
- `test/integration/team/team-onboarding-walkthrough.test.ts` - Fresh-teammate acceptance test; real local ingest server + real upload over loopback, zero real Agda dependency.

## Decisions Made

- Drove `install-pinned-env.mjs`'s individual exported functions directly (per the plan's detailed `<behavior>` spec) rather than importing `scriptMain` (per the plan frontmatter's illustrative `key_links` example) — the two are inconsistent in that one detail; the numbered `<behavior>` steps are authoritative and the traceability grep pattern (`install-pinned-env\.mjs`) is satisfied regardless of which named export is imported.
- Stubbed `selectClaudeCodeLogs`/`selectCodexSessionLogs` to `() => []` in the `runUploadForRun` call and overrode `AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH` alongside the plan-specified `AGDA_MCP_DOGFOOD_RUNS_ROOT` — both required to satisfy the task's own `<done>` criterion ("leaves zero residue in the real repo's `.agda-mcp/` directory") and `agent-log-selection.mjs`'s own explicit test-isolation comment ("never let a test touch the real `~/.claude`"/`~/.codex`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree base was missing Wave 1's outputs; fast-forwarded to `main` to pick them up**
- **Found during:** Pre-task setup, before Task 1
- **Issue:** The orchestrator-provided base-correction SHA (`b3df1f0f2e7a297cfa1622b1e7ba31b3735c934f`) did not exist in the object database (`git cat-file`/`merge-base` both failed to resolve it) — it shared only the 7-character prefix with `main`'s real tip (`b3df1f0b04cb4d592bd716228d381087025ac46c`), indicating a corrupted/truncated hash in the orchestrator prompt. Independently, `scripts/team/install-pinned-env.mjs`, `clone-fuel-corpora.mjs`, `Dockerfile`, and `k8s/` — all declared as "in your base" — were absent from the worktree's HEAD (`d36e031`), which was cut before two sibling `worktree-agent-*` merges landed on `main`.
- **Fix:** Verified `git merge-base HEAD main` equals `HEAD` itself (HEAD is a clean ancestor of `main`, zero unique commits at risk), verified `main` does contain the missing wave-1 deliverables plus explicit "merge executor worktree" commits, then ran `git merge --ff-only main` — a safe, non-destructive fast-forward (not the prohibited `git reset --hard` to an unverified hash). Landed exactly at `b3df1f0`, confirming the intended target all along.
- **Files modified:** None directly (git history sync only) — brought in `Dockerfile`, `k8s/*.yaml`, `scripts/team/install-pinned-env.{sh,mjs}`, `scripts/team/clone-fuel-corpora.mjs`, and their unit tests from Plans 08-01/08-02.
- **Verification:** `git show main:scripts/team/install-pinned-env.mjs` (and siblings) resolved before the merge; `ls scripts/team/` confirmed presence after.
- **Committed in:** N/A (no new commit — a fast-forward moves the branch pointer without creating one).

**2. [Rule 3 - Blocking] `tsc -p tsconfig.test.json --noEmit` errors on untyped `.mjs` imports**
- **Found during:** Task 2, before the first test run
- **Issue:** Importing named exports from `install-pinned-env.mjs` and `clone-fuel-corpora.mjs` (no `.d.ts`) produced `TS7016`/`TS7006` errors under this repo's strict test tsconfig.
- **Fix:** Added `// @ts-expect-error script module lacks types` immediately before each `.mjs` import's closing `from` line (matching `test/unit/tools/dogfood-upload-run.test.ts`'s own established convention exactly), and an explicit `: any` annotation on the one array-callback parameter (`result: any`) whose type could no longer be inferred once the import resolved to `any`.
- **Files modified:** `test/integration/team/team-onboarding-walkthrough.test.ts` (part of its single commit, not a separate fix-up).
- **Verification:** `npx tsc -p tsconfig.test.json --noEmit` reports zero errors for the new file.
- **Committed in:** `17fabaa` (Task 2 commit — folded in before first commit, not a follow-up)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues preventing task execution)
**Impact on plan:** Neither touched application logic or plan scope; one was a git-sync correction, the other a type-hygiene fix matching pre-existing codebase convention. No scope creep.

## TDD Gate Compliance

Task 2 carries `tdd="true"` but the plan supplies only a `<behavior>` block (no `<implementation>` block), and its `files_modified` frontmatter scope is the test file alone — there is no companion production-code change for this task in this plan. All functions the test drives (`install-pinned-env.mjs`, `clone-fuel-corpora.mjs`, `ingest-server.mjs`, `issue-key.mjs`, `upload-run.mjs`) were implemented in Plan 08-01 and Phase 7, prior to this plan. The test passed on the first correct write (after fixing the typecheck-only issues above) — expected for an acceptance test proving a pre-existing chain, not a RED-phase violation. A single `test(08-03): ...` commit (`17fabaa`) is the complete, correct gate sequence for this task's actual scope.

## Issues Encountered

- Worktree branch was cut from `main` before two sibling `worktree-agent-*` branches (Plans 08-01, 08-02) were merged back — resolved via the fast-forward documented above before any task work began. See "Deviations from Plan" #1.

## User Setup Required

None - no external service configuration required. (The plan's own upload-key setup is documented as a maintainer-to-teammate out-of-band step in `docs/TEAM-ONBOARDING.md` itself, not a setup action for this execution.)

## Next Phase Readiness

- TEAM-05's local-mode fallback is now proven end to end and documented — satisfies DEPLOY-01's "local mode remains a working fallback" criterion at its point of first truth, ahead of any cluster existing.
- `docs/TEAM-ONBOARDING.md`'s Step 4 references the real cluster endpoint URL (`https://dev.sites.idies.jhu.edu/agda-mcp/ingest`) as "live once Plan 08-04 deploys it" — no blocker, but Plan 08-04 (or whichever plan performs the actual deploy) should confirm that exact URL matches the final ingress host once cut.
- No blockers for Plans 08-04/08-05/08-06.

---
*Phase: 08-pinned-environment-distribution-thin-k8s-deployment*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: docs/TEAM-ONBOARDING.md
- FOUND: test/integration/team/team-onboarding-walkthrough.test.ts
- FOUND: .planning/phases/08-pinned-environment-distribution-thin-k8s-deployment/08-03-SUMMARY.md
- FOUND commit: babd7ec (Task 1)
- FOUND commit: 17fabaa (Task 2)
- FOUND commit: b0012fa (Summary)
