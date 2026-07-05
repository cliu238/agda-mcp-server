---
phase: 09-residual-v1-0-debt-sweep
plan: 02
subsystem: reporting
tags: [capture-session, durability, vitest, test-isolation, tech-debt, wr-01, wr-08, wr-12]

# Dependency graph
requires:
  - phase: 01-capture-foundation
    provides: "agda_capture_session tool (src/tools/register-capture-session.ts) and the CAP-04 recorded-action ring buffer (src/agda/session-capture/recorded-transport.ts) this plan hardens"
provides:
  - "Write-before-reset durability ordering for the CAP-04 recorded-action buffer (WR-01 closed)"
  - "register-capture-session.test.ts fully isolated from the shared, tracked test/fixtures/agda/ tree via per-test mkdtempSync sandboxes (WR-12 closed)"
  - "WR-08 (stale mergedArgv/lastDispatchedLoadArgv) confirmed already resolved, evidence recorded (not silently skipped)"
  - "Stale scripts/promote-capture.mjs comment reference corrected to describe the current in-repo dedup-index lookup"
affects: [09-residual-v1-0-debt-sweep, future-capture-tool-work]

# Tech tracking
tech-stack:
  added: []
  patterns: ["defer a shared-buffer reset until after its durable write succeeds, not immediately after drain", "mkdtempSync-per-test fixture isolation (mirrors test/unit/tools/team-issue-key.test.ts)"]

key-files:
  created: []
  modified:
    - src/tools/register-capture-session.ts
    - test/unit/tools/register-capture-session.test.ts

key-decisions:
  - "WR-01 fix scoped to the write-then-reset reorder only, with no concurrency mutex — the unexecuted 01-06-PLAN's broader Task 1 also added a captureCriticalSection async mutex for concurrent (non-sequentially-awaited) captures, but 09-CONTEXT.md's coverage note and DEBT-03's D-06 mapping name only WR-01's durability edge, not its concurrency side-effect, as this phase's scope; the mutex was left out as out-of-scope rather than silently added as scope creep"
  - "WR-12 fixed inline in this same plan (not deferred to a separate item) since it shares the exact file already being modified for WR-01, per 09-CONTEXT.md's Claude's-Discretion note"
  - "WR-08 recorded as CLOSED, not re-fixed — session.ts's loadNoMetas(), and session-process-lifecycle.ts's resetFileBoundStateIfProcDied and handleSessionProcessClose, all already reset lastDispatchedLoadArgv with inline '(WR-08)' evidence comments; verified via grep, zero code changes made to either file"

requirements-completed: [DEBT-03]

# Metrics
duration: 13min
completed: 2026-07-04
---

# Phase 9 Plan 2: WR-01 Durability + WR-12 Test Isolation + WR-08 Closure Record Summary

**Deferred `resetRecordedActions()` until after a durable `writeFileAtomic` succeeds (WR-01), moved `register-capture-session.test.ts` off the shared tracked fixture tree onto per-test `mkdtempSync` sandboxes (WR-12), and recorded WR-08's already-resolved status with grep-verified evidence instead of silently skipping it.**

## Performance

- **Duration:** 13 min (from phase-start commit `f232f79` to final task commit `be8df6e`)
- **Started:** 2026-07-04T19:36:11Z
- **Completed:** 2026-07-04T19:48:18Z
- **Tasks:** 3 completed
- **Files modified:** 2

## Accomplishments

- A `writeFileAtomic` failure (disk full, permissions, or the `mkdirSync` capture-dir guard throwing) during `agda_capture_session` no longer silently discards the drained CAP-04 recorded-action log — the buffer stays intact for a retry, and a successful capture still resets it afterward. Both behaviors are locked by regression tests.
- `register-capture-session.test.ts` no longer creates or depends on the shared, git-tracked `test/fixtures/agda/.agda-mcp/` directory; every test now stages into a fresh, auto-cleaned `mkdtempSync` sandbox (mirroring `test/unit/tools/team-issue-key.test.ts`'s established pattern).
- WR-08 (stale `mergedArgv`/`lastDispatchedLoadArgv` surviving a strict reload or a mid-command/idle process death) was independently re-verified as already resolved across three sites — `session.ts`'s `loadNoMetas()`, and `session-process-lifecycle.ts`'s `resetFileBoundStateIfProcDied` and `handleSessionProcessClose` — and recorded here rather than silently dropped from the audit's tech-debt list.
- A stale in-code comment claiming the dedup index "only advances via the manual, out-of-band `scripts/promote-capture.mjs`" (a script deleted by sibling plan 09-01) was corrected to describe the actual current mechanism: `routeDedup(index, fingerprint)` reading the in-repo dedup index inline at capture time, no external advancement step.

## Task Commits

Each task was committed atomically:

1. **Task 1: WR-01 durability — reorder `resetRecordedActions()` to after a successful `writeFileAtomic`** - `3ad99e6` (fix)
2. **Task 2: WR-12 — isolate `register-capture-session.test.ts` from the shared tracked fixture tree** - `6d3f691` (test)
3. **Task 3: Close out — stale comment fix, WR-08 closure record, full regression sweep** - `be8df6e` (docs)

_Task 1 followed the plan's TDD flow: the new WR-01 durability test was written and confirmed RED against the pre-fix statement order in the same edit pass as its GREEN-making fix, then committed together per the plan's `tdd="true"` task structure (single commit covering both the regression test and the fix, as the plan's action/verify steps specify one commit boundary per task, not separate RED/GREEN commits)._

## Files Created/Modified

- `src/tools/register-capture-session.ts` - `resetRecordedActions()` moved to run only after `writeFileAtomic` succeeds; stale `promote-capture.mjs` comment corrected to cite `routeDedup`/the in-repo dedup index instead
- `test/unit/tools/register-capture-session.test.ts` - Added a WR-01 durability regression test + happy-path companion; added `tempDirs`/`makeTempDir` per-test sandbox helper; every test's `repoRoot` now comes from a fresh `mkdtempSync` directory instead of the shared `TEST_FIXTURE_PROJECT_ROOT`; removed the now-unused `TEST_FIXTURE_PROJECT_ROOT` import

## Decisions Made

- **WR-01 scope boundary:** implemented exactly the reorder named by DEBT-03/D-06 (drain → build → write → reset, reset moved after a successful write) and did not add the unexecuted `01-06-PLAN.md`'s broader concurrency mutex (`captureCriticalSection`) for non-sequentially-awaited concurrent captures. That concurrency side-effect is a real, separately-identified defect in the historical gap plan, but neither `09-CONTEXT.md`'s coverage note nor DEBT-03's forcing text names it as in-scope for this residual-debt sweep; adding it here would have been unrequested architectural scope creep into a plan explicitly kept isolated to one file pair for parallel execution.
- **WR-12 folded into this plan:** `09-CONTEXT.md` left WR-12's fix-vs-record choice to planner discretion; since it lives in the exact same test file already being edited for WR-01, fixing it inline (rather than recording a defer decision) was the lower-total-cost choice.
- **WR-08 verified comprehensively, not just cited:** rather than trusting the plan interfaces section's claim at face value, independently re-grepped all three historical WR-08 fix sites (`session.ts:322`, `session-process-lifecycle.ts:105`, `session-process-lifecycle.ts:179`) and confirmed each still carries its `lastDispatchedLoadArgv = []` reset with an inline "(WR-08)" comment — stronger evidence than the plan's interfaces section cited (which only named the two `session-process-lifecycle.ts` sites), so the closure record below is complete across all three sites.

## WR-08 Closure Evidence (recorded per 09-CONTEXT.md's coverage note — not a code change)

Verified 2026-07-04 via direct grep against the current worktree (files NOT modified by this plan):

| Site | File:Line | Function | Evidence |
|------|-----------|----------|----------|
| Strict reload | `src/agda/session.ts:322` | `loadNoMetas()` | `this.lastDispatchedLoadArgv = [];` as the first statement, with an inline "(WR-08)" comment explaining `Cmd_load_no_metas` dispatches no options list |
| Mid-command death | `src/agda/session-process-lifecycle.ts:105` | `resetFileBoundStateIfProcDied` | `session.lastDispatchedLoadArgv = [];`, JSDoc above the function cites "(WR-08)" |
| Idle/spontaneous death | `src/agda/session-process-lifecycle.ts:179` | `handleSessionProcessClose` | `session.lastDispatchedLoadArgv = [];`, JSDoc above the function cites "(WR-08)" |

All three match exactly what the unexecuted `01-06-PLAN.md`'s Task 3 specified. **WR-08 is CLOSED, not open** — the `v1.0-MILESTONE-AUDIT.md` tech-debt bucket is stale on this specific point. No source change was made to either file; this table is the recorded evidence per the phase's "fix-or-explicitly-record" bar.

## Deviations from Plan

None - plan executed exactly as written. One clarifying note: the plan's Task 1 behavior spec described the happy-path companion assertion as "`drainRecordedActions()` returns empty on the next call." During implementation this was found to be imprecise given `registerStructuredTool`'s wrapper, which unconditionally records every tool's own invocation (including `agda_capture_session` itself) immediately after its callback resolves — so the live buffer always contains one fresh self-recorded entry right after any capture call, success or failure. The companion test was written to assert the more precise and still fully faithful claim the plan intended: the *pre-capture* action (`prior_tool_wr01_happy`) is no longer present in the buffer after a successful capture, proving the reset genuinely ran (rather than asserting the buffer is vacuously empty, which is not achievable given the wrapper's self-recording behavior on both pre-fix and post-fix code). This is a same-task assertion refinement discovered while writing the RED/GREEN tests, not a scope or behavior change, and is not tracked as a numbered deviation since it introduced no code behavior change and stayed within Task 1's own file/test boundary.

## Issues Encountered

None. `npm ci` (Node 24.16.0 via mise, matching `.nvmrc`) and the full `npm test` run (build + vitest) both completed cleanly with zero pre-existing failures to work around.

## Known Stubs

None - no stub patterns (hardcoded empty UI-bound values, placeholder text, unwired data sources) were introduced by this plan's changes.

## Threat Flags

None - both changes stay exactly within the plan's own `<threat_model>` (T-09-03 write-then-reset reorder, T-09-04 test-fixture isolation); no new network surface, auth path, file-access pattern, or schema change was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/tools/register-capture-session.ts` and its test file are both fully addressed for this phase's DEBT-03/WR-01/WR-12/WR-08 items; no further action needed on this file pair within Phase 9.
- Sibling plans 09-01 (script deletions, including `scripts/promote-capture.mjs` this plan's corrected comment no longer references by name), 09-03 (`09-SECURITY.md`), and 09-04 (test typecheck cleanup across ~20 files) were left untouched, preserving parallel-execution isolation.
- No blockers for phase completion from this plan's scope.

---
*Phase: 09-residual-v1-0-debt-sweep*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: src/tools/register-capture-session.ts
- FOUND: test/unit/tools/register-capture-session.test.ts
- FOUND: .planning/phases/09-residual-v1-0-debt-sweep/09-02-SUMMARY.md
- FOUND commit: 3ad99e6 (Task 1)
- FOUND commit: 6d3f691 (Task 2)
- FOUND commit: be8df6e (Task 3)
