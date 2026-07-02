---
phase: 03-regression-lock-pipeline
plan: 01
subsystem: testing
tags: [zod, vitest, tdd, capture-session, regression-matrix, dedup]

# Dependency graph
requires:
  - phase: 01-capture-foundation
    provides: "agda_capture_session MCP tool + CaptureArtifact staging (src/tools/register-capture-session.ts, src/agda/session-capture/*)"
provides:
  - "Collision-proof staged capture filenames (closes 01-VERIFICATION.md CR-03 BLOCKER)"
  - "capture-regression matrix typed contract (D-01 idiom), seeded empty, ready for Wave 2 (emitter) and Wave 3 (replay runner + flagship rehearsal)"
affects: [03-02, 03-03, 03.1-fix-transitive-staleness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Matrix-plus-typed-loader idiom (zod schema + loadValidatedJsonData) reused verbatim for a new SSOT: test/fixtures/capture-regression-matrix.{ts,json}"
    - "Per-process monotonic sequence counter appended to a filesystem write path to guarantee uniqueness independent of session-static identifiers"

key-files:
  created:
    - test/fixtures/capture-regression-matrix.ts
    - test/fixtures/capture-regression-matrix.json
    - test/unit/fixtures/capture-regression-matrix.test.ts
  modified:
    - src/tools/register-capture-session.ts
    - test/unit/tools/register-capture-session.test.ts

key-decisions:
  - "Followed the plan's exact fix: append stagedFileSequence (module-level monotonic counter) to the staged filename, leaving dedup.fingerprint/recurrence, promote-capture.mjs, and dedup-index.ts untouched"
  - "Left resetRecordedActions() ordering (01-VERIFICATION.md WR-01) untouched as explicitly scoped out - deferred to a future Phase-1 gap-closure pass, not silently dropped"
  - "Matrix schema fields match the plan's exact spec (fixtureDir + entryFile split, not 03-RESEARCH.md's earlier fixtureEntry sketch) - the PLAN.md action text is the authoritative, more-refined design"

patterns-established:
  - "capture-regression-matrix.{ts,json} + test/unit/fixtures/capture-regression-matrix.test.ts: the fixed schema Wave 2/3 code against; no future task should reshape it"

requirements-completed: [REPRO-01, LOCK-02]

# Metrics
duration: 12min
completed: 2026-07-02
---

# Phase 3 Plan 1: Capture-Staging Collision Fix + Regression Matrix Contract Summary

**Collision-proof `agda_capture_session` staging via a per-process sequence counter, plus a zod-validated capture-regression matrix contract (empty seed) matching the release-bug-matrix.ts idiom.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-02T12:54:00Z (approx.)
- **Completed:** 2026-07-02T12:59:00Z (approx.)
- **Tasks:** 2 completed
- **Files modified:** 5 (2 modified, 3 created)

## Accomplishments
- Closed the Phase-1 CR-03 BLOCKER: two `agda_capture_session` calls in one session sharing the identical fingerprint/recurrence (`new-bug`/`1`) now produce two structurally distinct, both-durable staged files instead of silently colliding
- Defined `test/fixtures/capture-regression-matrix.{ts,json}` - the fixed, zod-validated schema Wave 2 (emitter) and Wave 3 (replay runner + #64/#61 flagship rehearsal) will code against, seeded as an empty array per D-09 part1 (no hand-built synthetic entries)
- Full TDD RED -> GREEN cycle for the collision fix, with the RED test empirically reproducing the exact CR-03 shape before the fix landed

## Task Commits

Each task was committed atomically:

1. **Task 1: Close the Phase-1 capture-staging collision (BLOCKER)** - TDD cycle:
   - `e285781` (test) - failing test reproducing CR-03's same-session, same-fingerprint collision
   - `0a79b73` (feat) - `stagedFileSequence` monotonic counter fix + test-timing determinism fix
2. **Task 2: Define the capture-regression matrix contract (D-01 idiom)** - `808aa62` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/tools/register-capture-session.ts` - added module-level `stagedFileSequence` counter; staged filename is now `${fingerprint}-${recurrence}-${stagedFileSequence++}.json` (215 lines, under the 500-line ceiling)
- `test/unit/tools/register-capture-session.test.ts` - added a 3rd test asserting two same-session, same-fingerprint captures never collide on `stagedPath` and both artifacts remain independently readable (248 lines)
- `test/fixtures/capture-regression-matrix.ts` - zod schema `captureRegressionEntrySchema` + typed constant `captureRegressionMatrix`, loaded via `loadValidatedJsonData` (65 lines)
- `test/fixtures/capture-regression-matrix.json` - seeded empty array `[]`
- `test/unit/fixtures/capture-regression-matrix.test.ts` - id-uniqueness, fixture/mutation path-existence, and bare-tag `errorCategories` checks (66 lines)

## Decisions Made
- Reused the `release-bug-matrix.ts`/`fixture-matrix.ts` idiom exactly (as directed) rather than inventing a new loader pattern
- Kept the matrix schema fields exactly as specified in PLAN.md's Task 2 action text (`fixtureDir` + `entryFile` split, optional `mutation`/`serverEnv`, `expected` as D-03's normalized tuple) - this is a more refined design than 03-RESEARCH.md's earlier `fixtureEntry`-only sketch, and PLAN.md is authoritative
- Did not touch `resetRecordedActions()` ordering (01-VERIFICATION.md's WR-01) - explicitly out of scope per the plan's own instruction; flagged here as intentionally deferred to a future Phase-1 gap-closure pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New Task 1 test needed `clearToolManifest()` before registering**
- **Found during:** Task 1, first RED-phase test run
- **Issue:** The module-level tool manifest (`src/tools/manifest.ts`) throws `"Duplicate tool registration for agda_capture_session"` if the same tool name is registered twice across tests in one file without clearing the manifest in between; the new 3rd test registers `agda_capture_session` again, colliding with whatever the prior test left registered
- **Fix:** Added `clearToolManifest();` at the top of the new test, mirroring the existing 2nd test's own pattern
- **Files modified:** `test/unit/tools/register-capture-session.test.ts`
- **Verification:** Test now fails only on the actual collision assertion (RED), not on infrastructure noise
- **Committed in:** `e285781` (Task 1 RED commit)

**2. [Rule 1 - Bug] `capturedAt` divergence assertion was timing-flaky**
- **Found during:** Task 1, GREEN-phase verification
- **Issue:** After landing the `stagedFileSequence` fix, the test's final assertion (`staged1.capturedAt !== staged2.capturedAt`) still failed intermittently: a zero-interaction session's two sequential capture calls can complete within the same millisecond, so `new Date().toISOString()` produced identical values even though the two staged files were genuinely distinct (the `stagedPath` and `existsSync` assertions immediately above it already passed, proving the fix itself works)
- **Fix:** Inserted a deterministic `await new Promise((resolve) => setTimeout(resolve, 5))` between the two capture calls so the timestamps are guaranteed to differ, without adding a `note` (which would have changed the fingerprint and broken the "identical fingerprint/recurrence" precondition the test needs)
- **Files modified:** `test/unit/tools/register-capture-session.test.ts`
- **Verification:** `npx vitest run test/unit/tools/register-capture-session.test.ts` passes consistently (3/3) across repeated runs
- **Committed in:** `0a79b73` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking test-infra fix, 1 test-determinism bug fix)
**Impact on plan:** Both fixes are test-only, scoped to the new test added by this plan. No production behavior changed beyond what the plan specified. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed the full RED -> GREEN cycle:
- RED gate: `e285781` `test(03-01): add failing test for capture-staging collision (CR-03)` - confirmed failing on the actual collision (`data1.stagedPath === data2.stagedPath`), not on setup noise
- GREEN gate: `0a79b73` `feat(03-01): make staged capture filenames collision-proof` - confirmed all 3 tests in the file pass
- No REFACTOR commit was needed (the fix is a 2-line, already-minimal change)

Gate sequence verified via `git log --oneline`: `test(...)` precedes `feat(...)`. Compliant.

## Known Stubs

- `test/fixtures/capture-regression-matrix.json` is intentionally seeded as an empty array `[]`. This is not an oversight: per the plan's `must_haves` and D-09(part1) ("no hand-built synthetic bundles"), Wave 2's emitter appends the real flagship entry by running against a genuine capture, never by hand-authoring JSON. `test/unit/fixtures/capture-regression-matrix.test.ts` already asserts against the empty array today and will continue to assert against real entries once 03-02/03-03 populate it - no further schema change is expected (per the plan's own success criteria).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The Phase-1 CR-03 BLOCKER is closed; the #64/#61 flagship rehearsal (03-03) can now safely capture the same session twice (baseline, then false-green) without losing the first artifact
- The capture-regression matrix contract is fixed and unit-tested; Wave 2 (emitter) and Wave 3 (replay runner) have a stable schema to code against
- No blockers identified for 03-02/03-03

---
*Phase: 03-regression-lock-pipeline*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commits (`e285781`, `0a79b73`, `808aa62`) confirmed present in `git log`.
