---
phase: 01-capture-foundation
plan: 03
subsystem: capture
tags: [mcp-tool, session-capture, ring-buffer, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/agda/session-capture/artifact-types.ts (RecordedAction interface), src/tools/tool-registration.ts's timedCallback interception point"
provides:
  - "src/agda/session-capture/recorded-transport.ts — recordAction()/drainRecordedActions()/resetRecordedActions(), CAP-04's bounded ring-buffer recorder"
  - "registerStructuredTool's timedCallback now feeds every MCP tool call into the recorder when AGDA_MCP_CAPTURE=1"
affects: ["01-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level state scoped to the single AgdaSession-per-process invariant (issue #39) — no session-instance keying needed for the recorder buffer"
    - "Drop-newest-once-full ring buffer (not the naive drop-oldest) to preserve the earliest actions of a long dogfooding session"
    - "Env-gate lives entirely inside the recorder module (recordAction checks AGDA_MCP_CAPTURE itself); call sites stay unconditional and free of capture-specific logic"

key-files:
  created:
    - src/agda/session-capture/recorded-transport.ts
    - test/unit/agda/session-capture/recorded-transport.test.ts
  modified:
    - src/tools/tool-registration.ts

key-decisions:
  - "recordAction() takes an optional RecordedActionCapacityOverride second parameter so tests can exercise the drop-newest-once-full path at a small capacity without waiting for 2000 calls, while the exported public API for production callers (recordAction/drainRecordedActions/resetRecordedActions) stays unchanged"
  - "The recorder hook in tool-registration.ts re-reads structuredContent in a second guarded if-block after the existing elapsedMs-stamping block, rather than hoisting the const, to leave the pre-existing elapsedMs logic untouched (per the plan's interfaces section)"

patterns-established:
  - "CAP-04 recorder module: zero-cost-when-disabled env gate checked first inside the exported function body, before any allocation or Date.now() call — future capture-adjacent modules (e.g. 01-05's drain-and-reset wiring) should follow the same shape"

requirements-completed: [CAP-04]

# Metrics
duration: ~12min
completed: 2026-07-02
---

# Phase 1 Plan 3: CAP-04 Recorded Session Action Log Summary

**Bounded 2000-entry ring-buffer recorder (`recordAction`/`drainRecordedActions`/`resetRecordedActions`) hooked into every `registerStructuredTool` MCP call, gated by `AGDA_MCP_CAPTURE=1` with a drop-newest-once-full truncation policy that preserves the earliest actions of a long dogfooding session.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-02
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `src/agda/session-capture/recorded-transport.ts`: module-level ring buffer with `recordAction`/`drainRecordedActions`/`resetRecordedActions`, gated by `AGDA_MCP_CAPTURE=1`, zero-cost no-op when unset (returns before any array mutation, `Date.now()` call, or allocation)
- Drop-newest-once-full truncation policy confirmed by test: at capacity, the FIRST N actions survive and later ones are dropped with `truncated: true`/`droppedCount` incrementing — the opposite of a naive ring buffer, per D-05's explicit requirement that the earliest actions of a long session (which set up the reproduction) must never be silently lost
- `registerStructuredTool`'s `timedCallback` in `src/tools/tool-registration.ts` now calls `recordAction()` unconditionally after `structuredContent` is available, immediately before `return result;` — the env-gate lives entirely inside `recordAction`, keeping `tool-registration.ts` free of capture-specific logic
- Full TDD cycle: Task 1 RED (module-not-found) → GREEN (6/6 behaviors passing) → Task 2 extends the same file with an integration-shaped test using the `makeCapturingServer()` harness from `test/unit/tools/tool-registration-error-safety.test.ts`
- Zero regressions: `npm test`-equivalent run of `test/unit` shows 1081 passed / 5 skipped (skips are `requiresLiveAgda` — no local Agda binary in this sandbox), `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the bounded ring-buffer recorder** - `ea6f234` (test, RED) → `14a9b22` (feat, GREEN)
2. **Task 2: Hook the recorder into the MCP tool-call boundary** - `5551394` (feat)

_Task 1 followed the full RED/GREEN TDD cycle within the task; no separate refactor commit was needed since the GREEN implementation required no cleanup._

## Files Created/Modified
- `src/agda/session-capture/recorded-transport.ts` - `MAX_RECORDED_ACTIONS = 2000`; `recordAction(action, capacityOverride?)`, `drainRecordedActions()` (read-only snapshot), `resetRecordedActions()` (clears buffer/truncated/droppedCount); module-level `RecordedAction[]` buffer per the single-`AgdaSession`-per-process invariant
- `src/tools/tool-registration.ts` - added the `recordAction` import and a second guarded block inside `timedCallback` that feeds the recorder with `{tool: args.name, args: toolArgs, timestamp: startMs, normalizedResponse}` whenever `result` has a `structuredContent` object
- `test/unit/agda/session-capture/recorded-transport.test.ts` - 7 tests: no-op-when-unset, ordered recording, drop-newest-once-full truncation, `MAX_RECORDED_ACTIONS` sizing pin, `resetRecordedActions` clearing, read-only `drainRecordedActions`, and the `registerStructuredTool` integration hook

## Decisions Made
- `recordAction`'s optional `RecordedActionCapacityOverride` parameter is test-only plumbing (a small `{ capacity }` object) rather than a mutable exported `let MAX_RECORDED_ACTIONS`, keeping the production constant `2000` immutable while still letting the truncation test run at capacity 5 instead of 2000
- The tool-registration.ts hook re-reads `structuredContent` in a second `if` block (same shape guard as the pre-existing elapsedMs branch) rather than restructuring the existing block, per the plan's explicit interface note that the elapsedMs-stamping logic must stay untouched

## Deviations from Plan

None - plan executed exactly as written. Both the `RecordedAction` interface (from `artifact-types.ts`, Plan 01-01) and the `timedCallback` interception point (from `tool-registration.ts`) were consumed exactly as specified in `<interfaces>`.

## Issues Encountered
- Fresh worktree had no `node_modules` (sandbox default Node is v22, project requires >=24) — resolved with `mise exec node@24 -- npm ci` before running any tests, consistent with the environment note in this plan's execution context. No repo files were changed to work around this.

## User Setup Required

None - no external service configuration required. No new dependencies were installed.

## Next Phase Readiness
- `recordAction`/`drainRecordedActions`/`resetRecordedActions` are ready for Plan 01-05 to drain into the staged `CaptureArtifact`'s `recordedActions` field (currently always `[]` per 01-01's placeholder) and call `resetRecordedActions()` after each capture
- Every MCP tool registered via `registerStructuredTool` now feeds the recorder when `AGDA_MCP_CAPTURE=1`; tools registered via `registerTextTool`/`registerGoalTextTool` are covered transitively since both delegate to `registerStructuredTool` internally
- No blockers for 01-05

## Self-Check: PASSED

Both created files verified present on disk; all 3 task commit hashes (`ea6f234`, `14a9b22`, `5551394`) verified present in `git log`.

---
*Phase: 01-capture-foundation*
*Completed: 2026-07-02*
