---
phase: 09-residual-v1-0-debt-sweep
plan: 01
subsystem: tooling
tags: [dead-code-removal, dogfood-proxy, oracle-triad, technical-debt, decision-records]

# Dependency graph
requires:
  - phase: 01-capture-foundation
    provides: "scripts/verify-cold-replay.mjs (unexecuted hardening plan 01-07 targeted this file; now closed as superseded-by-deletion)"
  - phase: 04-triage-fix-queue
    provides: "readDedupIndex() repointed to test/fixtures/fix-queue.json, which is what made scripts/promote-capture.mjs's index.json write a dead end"
  - phase: 05-dogfooding-orchestration-fuel
    provides: "scripts/dogfood/dogfood-run.mjs recording proxy and transcript-writer.mjs, whose stagedCaptures population this plan verified is independent of the removed promoteCapture call"
provides:
  - "scripts/verify-cold-replay.mjs and scripts/promote-capture.mjs deleted (DEBT-01, DEBT-02)"
  - "dogfood-run.mjs proxy no longer imports or calls promoteCapture; header comment corrected"
  - "Four scripts (orcl-01-differential.mjs, cold-agda-session.mjs x2, run-oracle.mjs, queue/intake.mjs) no longer reference the deleted files as if they still exist"
  - "PROJECT.md Key Decisions table records DEBT-01/DEBT-02 with zero-importer evidence"
affects: [09-02, 09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dead-code deletion paired with a PROJECT.md Key Decisions row citing re-verified zero-importer grep evidence and the superseding mechanism"

key-files:
  created: []
  modified:
    - scripts/dogfood/dogfood-run.mjs
    - scripts/oracle/orcl-01-differential.mjs
    - scripts/oracle/cold-agda-session.mjs
    - scripts/oracle/run-oracle.mjs
    - scripts/queue/intake.mjs
    - .planning/PROJECT.md
    - test/integration/mcp/dogfood-proxy-passthrough.test.ts

key-decisions:
  - "DEBT-01: delete scripts/verify-cold-replay.mjs — zero real importers, superseded by ORCL-01's materializeCaptureEnvironment which already guards the path traversal verify-cold-replay.mjs's own CR-01 finding left unguarded; closes unexecuted plan 01-07 as superseded-by-deletion"
  - "DEBT-02: delete scripts/promote-capture.mjs and its one real call site in dogfood-run.mjs — Phase 4 repointed readDedupIndex() to test/fixtures/fix-queue.json, so the .agda-mcp/captures/index.json write had zero readers"
  - "[Rule 1] Removed the obsolete dedup-index integration test in dogfood-proxy-passthrough.test.ts that asserted the exact side effect DEBT-02 retires — confirmed regressing via a green-before/red-after baseline run, not assumed"

patterns-established:
  - "When rephrasing a historical comment that names a file scheduled for literal-grep-verified deletion, avoid the literal filename string entirely (defer readers to PROJECT.md Key Decisions for the exact former name) rather than annotating it as '(deleted)' in place — a plan's acceptance grep may target the bare filename pattern"

requirements-completed: [DEBT-01, DEBT-02]

# Metrics
duration: 13min
completed: 2026-07-04
---

# Phase 9 Plan 1: Delete verify-cold-replay.mjs and promote-capture.mjs Summary

**Deleted two orphaned/dead-ended v1.0 maintainer scripts (verify-cold-replay.mjs, promote-capture.mjs), removed promote-capture's one real call site from the dogfood-run.mjs proxy, corrected four scripts' dangling comment references, and recorded both decisions in PROJECT.md with re-verified zero-importer evidence.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-04T19:36:11Z
- **Completed:** 2026-07-04T19:49:00Z
- **Tasks:** 2 completed
- **Files modified:** 9 (8 declared in plan frontmatter + 1 deviation)

## Accomplishments
- `scripts/verify-cold-replay.mjs` (DEBT-01) and `scripts/promote-capture.mjs` (DEBT-02) deleted after re-confirming zero real (non-comment) importers via fresh repo-wide grep
- `scripts/dogfood/dogfood-run.mjs`'s live proxy no longer imports or calls `promoteCapture`; its header comment no longer claims an auto-persist step that doesn't exist
- Four scripts' comments (`orcl-01-differential.mjs`, `cold-agda-session.mjs` x2, `run-oracle.mjs`, `queue/intake.mjs`) rephrased so none imply the deleted files still exist
- `PROJECT.md`'s Key Decisions table gained DEBT-01 and DEBT-02 rows with evidence and the superseding mechanism
- Full `npm test` suite green after both tasks (226 files / 1964 tests passed, 4 files / 5 tests skipped — pre-existing, unrelated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete verify-cold-replay.mjs and promote-capture.mjs, and remove promote-capture.mjs's one real call site** - `a88e369` (feat)
2. **Task 2: Fix dangling comment references and record both decisions in PROJECT.md** - `433d6eb` (docs)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified
- `scripts/verify-cold-replay.mjs` - deleted (DEBT-01)
- `scripts/promote-capture.mjs` - deleted (DEBT-02)
- `scripts/dogfood/dogfood-run.mjs` - removed `promoteCapture` import + the `if (event?.isCaptureSession) {...}` call-site block; corrected header comment
- `scripts/oracle/orcl-01-differential.mjs` - rephrased the "seed this plan supersedes" comment to note the deletion (DEBT-01) without a bare filename
- `scripts/oracle/cold-agda-session.mjs` - rephrased two comments (module header + `spawnColdAgdaSession` JSDoc) describing the multi-command lifecycle's origin without naming the deleted file
- `scripts/oracle/run-oracle.mjs` - rephrased the `appendFileSync` precedent comment to describe the pattern inline (single-writer, out-of-band, best-effort)
- `scripts/queue/intake.mjs` - rephrased the `readQueueFile` guard-behavior comment to describe the guard inline
- `.planning/PROJECT.md` - appended DEBT-01 and DEBT-02 rows to the Key Decisions table
- `test/integration/mcp/dogfood-proxy-passthrough.test.ts` - removed the test asserting the now-retired dedup-index auto-persist behavior; updated header comment (deviation, see below)

## Decisions Made
- DEBT-01 and DEBT-02 recorded in PROJECT.md exactly as specified by the plan (Decision/Rationale/Outcome), with the requirement IDs added as explicit row-prefix tags (`DEBT-01: ...` / `DEBT-02: ...`) since the plan's literal example text for the rows omitted the ID string but the plan's own acceptance criteria (`grep -c "DEBT-01"` / `grep -c "DEBT-02"` both `>= 1`) required it to appear.
- When rephrasing the four scripts' dangling comments, avoided the literal filename strings `verify-cold-replay.mjs` / `promote-capture.mjs` entirely (deferring to PROJECT.md for the exact former name) rather than annotating them in place as `(deleted)`, because Task 2's own acceptance criteria greps for the literal filename pattern and requires zero matches in `scripts/` outside `install-dogfood-skill.mjs`. The plan's `<action>` text suggested keeping a "marked as deleted" filename reference, which would have failed that same grep — resolved in favor of the grep-verified acceptance criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed an integration test asserting the exact behavior DEBT-02 retires**
- **Found during:** Task 1 (verifying zero-real-importer evidence before deletion)
- **Issue:** The plan's `<interfaces>` section claimed "Neither script has a test/ file exercising it (confirmed: `grep -rln "verify-cold-replay\|promote-capture" test/` returns zero hits)". That grep pattern used kebab-case filenames and missed `test/integration/mcp/dogfood-proxy-passthrough.test.ts`, which contains a test titled "auto-persists the observed agda_capture_session result into the corpus-root's dedup index after the connection closes" — it directly exercises the `promoteCapture`-driven side effect (checking `.agda-mcp/captures/index.json` after the proxy closes), reached transitively through the dogfood-run.mjs subprocess rather than via a literal `import` of `promote-capture.mjs`. This test is gated behind `RUN_AGDA_INTEGRATION=1` (set in CI at `.github/workflows/ci.yml:62`), so it runs in CI but is silently skipped in a default local run — the plan's own narrow Task 1 `<verify>` step (2 specific unit test files) would not have caught this either.
- **Fix:** Confirmed the regression empirically with a green-before / red-after baseline (ran the test before Task 1's edit: 4/4 passed; ran again immediately after Task 1's dogfood-run.mjs edit, before touching the test: 1 failed with `ENOENT` on `.agda-mcp/captures/index.json`, 3 passed). Removed the obsolete test block and updated the file's header comment to state plainly that the dedup-index auto-persist step was retired (DEBT-02, pointing to PROJECT.md). The sibling test in the same file ("writes a run report under the runs-root recording the staged capture after the connection closes") was left untouched and confirmed still green, verifying `stagedCaptures`/run-report population is independent of the removed call, per the plan's own must-haves truth #2.
- **Files modified:** `test/integration/mcp/dogfood-proxy-passthrough.test.ts`
- **Verification:** `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/dogfood-proxy-passthrough.test.ts` — 3/3 passed after the fix; full `npm test` (`RUN_AGDA_INTEGRATION=1`) green afterward (226 files / 1964 tests passed, 4 files / 5 tests skipped, pre-existing).
- **Committed in:** `a88e369` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/broken-test)
**Impact on plan:** Necessary to satisfy the plan's own explicit "npm test passes" success criterion under CI conditions (`RUN_AGDA_INTEGRATION=1`); the plan's interfaces evidence had a grep-pattern gap (kebab-case vs. camelCase) that this deviation closes. No scope creep — the single additional file is a direct, necessary consequence of Task 1's own declared action.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DEBT-01 and DEBT-02 fully closed: both files deleted, the one real call site removed, all dangling comments corrected, decisions recorded with evidence.
- `scripts/dogfood/install-dogfood-skill.mjs` (2 comment mentions of `promote-capture.mjs`) and `src/tools/register-capture-session.ts` (1 comment mention) were deliberately left untouched per the plan's interfaces note — owned by sibling plan 09-05 (Task 2) and 09-02 respectively. Confirmed via `git diff --stat` that neither file appears in this plan's changeset.
- No blockers for the remaining phase 9 plans (09-02 through 09-06).

---
*Phase: 09-residual-v1-0-debt-sweep*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: `.planning/phases/09-residual-v1-0-debt-sweep/09-01-SUMMARY.md`
- FOUND (confirmed deleted): `scripts/verify-cold-replay.mjs`
- FOUND (confirmed deleted): `scripts/promote-capture.mjs`
- FOUND: `scripts/dogfood/dogfood-run.mjs`
- FOUND: `test/integration/mcp/dogfood-proxy-passthrough.test.ts`
- FOUND commit: `a88e369`
- FOUND commit: `433d6eb`
