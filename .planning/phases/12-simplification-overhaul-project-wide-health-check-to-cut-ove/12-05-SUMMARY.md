---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 05
subsystem: testing
tags: [fix-queue, regression-lock, rt6, rt7, load-terminus, agda_load, vitest, audit, c-01, d-04]

# Dependency graph
requires:
  - phase: 10-upstream-reconcile
    provides: docs/LOAD-TERMINUS-ADJUDICATION.md (the Phase 10 empirical adjudication record this plan's RT6/RT7 verdicts cite to prove orthogonality to the merge)
provides:
  - The complete C-01 regression-lock exclusion list (12 rows: 10 locked fix-queue.json entries + 2 capture-regression-matrix.json entries; 11 distinct test files; 26 individually-named, existence-verified vitest test cases)
  - RT6 (ad2b6d31f58f1759) and RT7 (b6821f42952c6ff8) definitive, HEAD-grounded, independent re-evaluation verdicts (both HOW) with target-shape sketches and zero implementation, per D-04
affects: [12-06 (consolidated health report — transcribes both verdicts verbatim into fix-queue.json's notes fields), 12-08, 12-09, 12-10, 12-11 (every back-half execution plan must cross-check touched files against the exclusion list before any test/ modification)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-method regression-lock extraction: RESEARCH.md's regex snippet (extended to match both 'Regression lock:' and 'Regression evidence:' phrasings) PLUS a full manual read of every locked entry's notes field, never one method alone"
    - "Existence verification goes beyond file-exists: every individually-quoted vitest test-case string is also grep -F byte-for-byte verified present in its file's current contents"

key-files:
  created:
    - .planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-LOCKS-RT6RT7.md
  modified: []

key-decisions:
  - "RT6 (ad2b6d31f58f1759) verdict: HOW — agda_load's schema still has no sourceHoleCount/constraints field and the needsExplicitHoleScan gate in session-load-impl.ts still hides a hole co-occurring with an unrelated hard error, confirmed unchanged at current post-Phase-10-merge HEAD; orthogonal to the load-terminus adjudication, deferred to a dedicated future phase"
  - "RT7 (b6821f42952c6ff8) verdict: HOW — processErrorResult (load-tool-shared.ts) still hardcodes a 'crashed or could not be started' classification/nextAction for every session.load() throw, including a timeout where the transport's own responseCount/sawStatusDone/lastResponseKind evidence proves Agda was alive and mid-flight; confirmed unchanged, byte-for-byte identical wording, at current HEAD; deferred to a dedicated future phase"
  - "Exclusion list built from a full manual read of all 10 locked entries' notes, not the regex or matrix alone — this discovered fingerprint 0bc76d15c2fec8df's notes undercount its own regression lock (claims 6 tests across 2 files, actual count is 8; 2 extra WR-07/WR-09 tests in dogfood-run-report-checkpoint.test.ts were never folded into this fingerprint's notes text). All 8 actual tests are included in the exclusion list, not just the 6 described."

requirements-completed: [C-01, D-04]

# Metrics
duration: ~20min
completed: 2026-07-06
---

# Phase 12 Plan 05: C-01 Regression-Lock Exclusion List + RT6/RT7 Verdicts Summary

**Built the definitive 12-row C-01 regression-lock exclusion list (11 test files, 26 named vitest test cases, dual-method extraction + byte-for-byte existence verification) and independent HEAD-grounded HOW verdicts for RT6/RT7, both confirmed unchanged and orthogonal to Phase 10's load-terminus merge — zero implementation, zero fix-queue.json changes.**

## Performance

- **Duration:** ~20 min (estimate — precise start epoch was not captured at session start)
- **Completed:** 2026-07-06
- **Tasks:** 2/2
- **Files modified:** 1 (created)

## Accomplishments

- Built the C-01 regression-lock exclusion list: 12 rows (10 locked `fix-queue.json` entries + 2 `capture-regression-matrix.json` entries), covering 11 distinct test files and 26 individually-named vitest test cases, every one existence-checked (`test -f`) and byte-for-byte verified present (`grep -F`) against current file contents.
- Discovered and flagged a real notes-undercount: fingerprint `0bc76d15c2fec8df`'s `notes` field claims 6 regression-locked tests but `test/unit/tools/dogfood-run-report-checkpoint.test.ts` actually contains 5 (not 3) — two additional tests (`WR-07`, `WR-09`) guard the same mechanism but were never folded into this fingerprint's own notes text. All 8 actual tests (not just the 6 described) are now in the exclusion list.
- Produced independent, definitive, HEAD-grounded verdicts for both RT6 and RT7 (fingerprints `ad2b6d31f58f1759` / `b6821f42952c6ff8`) per D-04: both **HOW**, both confirmed to reproduce unchanged at current (post-Phase-10-merge) HEAD, both confirmed orthogonal to everything Phase 10's load-terminus adjudication touched (cited against `docs/LOAD-TERMINUS-ADJUDICATION.md`'s Decision table and "Codebase state after this plan" section), and both given a target-shape sketch sufficient for a future phase to plan from — with zero implementation and zero change to `test/fixtures/fix-queue.json`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the C-01 regression-lock exclusion list** - `8abf1f4` (docs)
2. **Task 2: RT6 and RT7 definitive re-evaluation verdicts** - `a226ed5` (docs)

_Note: this is a `type: execute` plan with two `docs`-classified tasks (no `feat`/`fix`/`test` commit types apply — the plan is a read-only audit producing a single Markdown artifact); per the parallel-worktree execution contract, STATE.md/ROADMAP.md updates and the final metadata commit are deferred to the orchestrator._

## Files Created/Modified

- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-LOCKS-RT6RT7.md` - The complete C-01 exclusion list (Task 1) plus the RT6/RT7 verdict sections and a Provenance/Self-Check footer (Task 2).

## Decisions Made

- RT6 and RT7 both received a **HOW** verdict (not a bare "do it" or "do not") because the plan's own interfaces spec asks for a target-shape sketch, and both defects already have enough fix-queue-documented + freshly HEAD-verified root-cause detail to sketch a concrete, bounded target shape — see the two Key Decisions above and the full verdict sections in the artifact itself for the four-point sketches.
- Where the fix-queue's notes paraphrased rather than literally quoted a regression lock (fingerprint `0bc76d15c2fec8df`'s "Regression evidence:" phrasing), the actual test files were opened directly and every real `test()`/`testPosix()` registration enumerated by hand, rather than trusting the paraphrase — this is what surfaced the 6-vs-8 undercount.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` were followed literally, including the explicit instruction not to modify `test/fixtures/fix-queue.json` (recording the verdict there is Plan 12-06's Task 2 responsibility) and not to implement any part of RT6/RT7.

## Issues Encountered

None blocking. One noteworthy investigative finding (not a plan issue): `test/unit/tools/dogfood-run-report-checkpoint.test.ts` contains 5 `testPosix(...)` registrations, not the 3 fingerprint `0bc76d15c2fec8df`'s notes name — resolved by including all 5 (plus the file's sibling's 3) in the exclusion list rather than trusting the notes' count, and documenting the discrepancy explicitly in the artifact's own "Flagged Discrepancy" section.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The exclusion list and both RT6/RT7 verdicts are ready for every other Phase 12 plan to consult. Any plan touching `test/` should cross-check against the "Quick-reference file list" in `12-AUDIT-LOCKS-RT6RT7.md` before deleting or weakening anything.
- Plan 12-06 (consolidated health report) can transcribe both verdicts verbatim into `test/fixtures/fix-queue.json`'s `notes` fields per this plan's own key_links — no further re-derivation needed.
- No blockers. This plan is read-only with respect to `test/`, `src/`, and `test/fixtures/fix-queue.json` — confirmed via `git diff --stat` against the pre-plan commit showing zero changes to any of those paths.

## Self-Check: PASSED

- FOUND: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-LOCKS-RT6RT7.md`
- FOUND: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-05-SUMMARY.md`
- FOUND commit `8abf1f4` (Task 1: exclusion list)
- FOUND commit `a226ed5` (Task 2: RT6/RT7 verdicts)
- FOUND commit `5e43a24` (this SUMMARY)
- Working tree clean; zero changes to any file under `test/`, `src/`, or `test/fixtures/fix-queue.json` across the whole plan (`git diff --stat` against the pre-plan commit confirms empty output for those paths)

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*
