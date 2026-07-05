---
phase: 06-backlog-digestion-policy-fix-reverify
plan: 04
subsystem: proof-tools
tags: [agda, mcp-tool, agda_auto, agda_give, tdd, regression-test, ToolInvocationError, injection-mitigation]

# Dependency graph
requires:
  - phase: 06-backlog-digestion-policy-fix-reverify
    plan: 03
    provides: "All 8 RT1-RT8 pre-fix measurements against current main (RT-REVERIFY.md), including RT4's pre-fix agda_auto measurement — the D-08/D-12 no-race gate that had to complete before this plan's agda_auto fix could land"
provides:
  - "buildAutoSearchPayload() boundary validation: flag-shaped or whitespace-containing hints/excludeHints tokens are rejected before joining the Agsy search payload (closes fingerprint 5abecc959e43fef3 and RT4 004d161b839ce725's shared root cause)"
  - "give() rejection detection: an Agda Error DisplayInfo with no confirmed replacement now surfaces GiveResult.rejected/rejectionText instead of silently reporting success (closes fingerprint bfcba437f5426fd6)"
  - "giveRejectedError() ToolInvocationError factory (classification give-rejected) in src/tools/tool-errors.ts, re-exported from the tool-helpers.ts barrel"
  - "4 from-RED regression tests across 3 test files, each demonstrated failing against pre-fix code before its corresponding fix landed"
affects: [06-06-lock-in-plan, agda_auto, agda_give, agda_refine, agda_refine_exact, agda_intro]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Boundary validation at a pure-function payload builder (buildAutoSearchPayload) instead of downstream escaping — mirrors command-builder.ts's quoted()/escapeAgdaString precedent for 'never trust a caller string into a wire payload verbatim'"
    - "info.kind === \"Error\" DisplayInfo-scan idiom (parse-load-responses.ts / backend.ts) reused a third time inside src/agda/goal-operations.ts's new detectResponseError() helper"
    - "Domain-level rejection signal (GiveResult.rejected/rejectionText) computed in src/agda/ (service layer), translated to a thrown ToolInvocationError in the tool adapter — keeps src/tools/goal-tools.ts's agda_give guard to 3 lines, no fat tool handler"

key-files:
  created:
    - test/unit/tools/goal-tools-give.test.ts
    - test/unit/agda/goal-operations-give.test.ts
  modified:
    - src/agda/refactor-helpers.ts
    - test/unit/agda/agent-ux.test.ts
    - src/agda/types.ts
    - src/agda/goal-operations.ts
    - src/tools/tool-errors.ts
    - src/tools/tool-helpers.ts
    - src/tools/goal-tools.ts

key-decisions:
  - "Validation lives inside buildAutoSearchPayload (pure function, src/agda/refactor-helpers.ts) rather than in the agda_auto tool callback — keeps the injection boundary at the single production call site and matches the plan's 'reject at the payload-builder boundary' interface contract"
  - "give()'s rejection requires BOTH an Error DisplayInfo AND no confirmed replacement text (rejected = errorText !== null && !hasReplacementText(replacementText)) — a successful give that also emits an unrelated warning display must never be misclassified as rejected"
  - "giveRejectedError() re-exported from the tool-helpers.ts barrel (extending its existing tool-errors.ts re-export list) rather than importing directly from tool-errors.js in goal-tools.ts, keeping the barrel-is-the-single-import-surface convention search-definitions.ts already established"
  - "refine()/refineExact()/intro() are deliberately left unpopulated for rejected/rejectionText — GiveResult's new fields are optional so those three functions stay type-correct with zero code changes (give-only fix per the plan's explicit no-scope-creep instruction)"

patterns-established:
  - "TDD RED/GREEN commit pairs per task: a test(06-04) commit demonstrating the new assertions failing against pre-fix code, followed by a feat(06-04) commit implementing the fix — both tasks in this plan followed this cycle exactly"

requirements-completed: [REVERIFY-02]

# Metrics
duration: ~15min
completed: 2026-07-04
---

# Phase 6 Plan 04: Fix agda_auto Hint Injection and agda_give Rejection Wrapping Summary

**Closed the two highest-priority QUEUE-02 confirmed live defects — agda_auto's CLI-flag hint injection and agda_give's ok:true-wrapping-rejection — each with a from-RED regression pair proving the fix.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-04T01:57Z (worktree branch check / context load)
- **Completed:** 2026-07-04T02:04:46Z
- **Tasks:** 2 completed (both `tdd="true"`, each executed as a RED commit followed by a GREEN commit)
- **Files modified:** 7 (2 new test files, 5 existing files modified)

## Accomplishments

- `agda_auto`'s CLI-flag hint injection path (fingerprint `5abecc959e43fef3`, shared root cause with RT4 `004d161b839ce725`) is closed: `buildAutoSearchPayload()` now rejects any `hints`/`excludeHints` token that starts with `-` or contains whitespace, throwing before the token can be concatenated into the Agsy search payload.
- `agda_give`'s ok:true-wrapping-rejection (fingerprint `bfcba437f5426fd6`) is closed: `give()` now detects an Agda-rejected expression (an Error `DisplayInfo` with no confirmed replacement) and the `agda_give` tool callback surfaces it as `ok:false` / classification `give-rejected` instead of silently reporting success.
- Both fixes carry from-RED regression tests, each demonstrated failing against pre-fix code before the corresponding source change landed (see Task Commits and the Regression Test Identifiers section below).
- `src/tools/goal-tools.ts` stays at 497/500 lines; all rejection-detection domain logic lives in `src/agda/goal-operations.ts`, not the tool adapter.

## Task Commits

Each task followed the RED → GREEN TDD cycle with two commits:

1. **Task 1: agda_auto — reject flag-shaped hint tokens at the buildAutoSearchPayload boundary**
   - `26f8356` (test) — RED: 3 new throw assertions in `test/unit/agda/agent-ux.test.ts` + new `test/unit/tools/goal-tools-give.test.ts` envelope-level test, all failing against pre-fix `buildAutoSearchPayload`.
   - `235b0b2` (feat) — GREEN: `assertValidAutoHint()` boundary check added inside `buildAutoSearchPayload` in `src/agda/refactor-helpers.ts`.
2. **Task 2: agda_give — detect Agda's rejection and surface ok:false / give-rejected**
   - `c9c9b5b` (test) — RED: new `test/unit/agda/goal-operations-give.test.ts` + extended `test/unit/tools/goal-tools-give.test.ts`, all failing against pre-fix `give()`/`agda_give`.
   - `e11211c` (feat) — GREEN: `GiveResult.rejected`/`rejectionText` (types.ts), `detectResponseError()` + updated `give()` (goal-operations.ts), `giveRejectedError()` factory (tool-errors.ts, re-exported via tool-helpers.ts), 3-line guard in `agda_give` (goal-tools.ts).

**Plan metadata commit:** pending (this SUMMARY.md + its own commit, created next).

_Note: both tasks are TDD tasks; each has exactly one test(→RED) commit and one feat(→GREEN) commit, no REFACTOR commit was needed._

## TDD Gate Compliance

RED and GREEN gate commits are present for both tasks (verified via `git log --oneline`):

| Task | RED commit | GREEN commit |
|------|-----------|---------------|
| Task 1 (agda_auto) | `26f8356` test(06-04) | `235b0b2` feat(06-04) |
| Task 2 (agda_give) | `c9c9b5b` test(06-04) | `e11211c` feat(06-04) |

No REFACTOR commits were needed for either task.

## Regression Test Identifiers (for plan 06-06 lock references)

**Fingerprint `5abecc959e43fef3`** (agda_auto CLI-flag hint injection; shared root cause with RT4 `004d161b839ce725`):

- `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a flag-shaped hints token instead of injecting it into the payload`
- `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a flag-shaped excludeHints token instead of injecting it into the payload`
- `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a hint token containing whitespace (would split into a second Agsy token)`
- `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > allows a hyphenated identifier that does not lead with '-'` (preserved-behavior guard)
- `test/unit/tools/goal-tools-give.test.ts` :: `agda_auto rejects a flag-shaped hint before calling session.goal.autoOne`

**Fingerprint `bfcba437f5426fd6`** (agda_give ok:true-wrapping-rejection):

- `test/unit/agda/goal-operations-give.test.ts` :: `give() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected`
- `test/unit/agda/goal-operations-give.test.ts` :: `give() does not mark a successful give (GiveAction present) as rejected`
- `test/unit/tools/goal-tools-give.test.ts` :: `agda_give surfaces a rejected expression as ok:false / give-rejected`
- `test/unit/tools/goal-tools-give.test.ts` :: `agda_give still returns an ok envelope for an accepted expression`

## Files Created/Modified

- `src/agda/refactor-helpers.ts` - `buildAutoSearchPayload()` now validates every hint/excludeHints token via a new private `assertValidAutoHint()` helper before pushing it onto the Agsy flags array
- `src/agda/types.ts` - `GiveResult` gains optional `rejected?: boolean` / `rejectionText?: string | null` fields (refine/refineExact/intro untouched, stay type-correct via optionality)
- `src/agda/goal-operations.ts` - new private `detectResponseError()` helper (the `info.kind === "Error"` idiom); `give()` now computes and returns `rejected`/`rejectionText`
- `src/tools/tool-errors.ts` - new `giveRejectedError(goalId, expr, rejectionText)` factory, classification `give-rejected`
- `src/tools/tool-helpers.ts` - barrel re-export list extended with `giveRejectedError`
- `src/tools/goal-tools.ts` - `agda_give` callback throws `giveRejectedError(...)` when `result.rejected`, before building the success output; import line extended (497/500 lines)
- `test/unit/agda/agent-ux.test.ts` - 4 new `buildAutoSearchPayload` test cases (3 throw assertions + 1 preserved-passthrough assertion)
- `test/unit/tools/goal-tools-give.test.ts` (new) - envelope-level fake-session/fake-server tests for both fixes (agda_auto rejection, agda_give rejected/accepted pair)
- `test/unit/agda/goal-operations-give.test.ts` (new) - pure-function tests for `give()`'s rejection detection against synthetic `AgdaResponse[]` fixtures

## Decisions Made

- Validation placed inside `buildAutoSearchPayload` itself (pure function boundary) rather than in the `agda_auto` tool callback — this is the single production call site (per the plan's own interface note) and matches the codebase's `command-builder.ts` `quoted()` precedent of validating/escaping untrusted strings at the function that assembles the wire payload, not at every caller.
- `give()`'s `rejected` flag requires **both** an Error DisplayInfo **and** the absence of a confirmed replacement text (`errorText !== null && !hasReplacementText(replacementText)`) — this guards against misclassifying a successful give that happens to also emit an unrelated warning-level display.
- `giveRejectedError` was added to the `tool-helpers.ts` barrel's existing tool-errors re-export list (rather than having `goal-tools.ts` import directly from `tool-errors.js`) since the barrel already re-exports `ToolInvocationError`/`missingPathToolError`/etc. from the same module — keeps a single consistent import surface.
- `refine()`, `refineExact()`, and `intro()` were deliberately left unpopulated for the new `GiveResult.rejected`/`rejectionText` fields — the plan explicitly scoped this fix to `give()` only (fingerprint `bfcba437f5426fd6` is give-specific; extending rejection-detection to the other three proof-action tools is out of scope here and would be a separate future fix).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<behavior>` blocks were implemented as specified; all acceptance criteria were verified directly (see Issues Encountered for one clarifying note on test design, not a deviation from the plan's instructions).

## Issues Encountered

- The RED run for the `agda_auto` envelope-level test (`test/unit/tools/goal-tools-give.test.ts`) failed with an unrelated crash (`Cannot read properties of undefined (reading 'solution')`) rather than a clean assertion mismatch — pre-fix code let the flag-shaped hint reach the fake `session.goal.autoOne` mock (which returns `undefined` with no implementation), and the callback's next line dereferenced `.solution` on that `undefined`. This is still valid RED evidence: it proves `autoOne` was reached with the malformed hint pre-fix (the defect), and disappears cleanly post-fix once `buildAutoSearchPayload` throws before `autoOne` is ever called.
- Node.js in this worktree defaulted to v22.22.0, but `package.json` requires `>=24` (`engine-strict=true` in `.npmrc`), so a bare `npm ci` failed with `EBADENGINE`. Resolved by using the Node 24.16.0 toolchain already installed via `mise` at `/Users/eric/.local/share/mise/installs/node/24/bin` (prepended to `PATH` for every subsequent `npm`/`npx` invocation in this session) — no changes to `.nvmrc`, `package.json`, or any tracked file were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both confirmed defects (`5abecc959e43fef3` / RT4 `004d161b839ce725`, and `bfcba437f5426fd6`) now have durable from-RED regression tests on `main`-bound commits, ready for plan 06-06 to reference as the lock mechanism per this plan's own `<objective>` note: neither defect is a load-family tool, so the Phase-3 emit-regression pipeline (`judgeRefusal`/`replayCaptureRegressionEntry`) structurally cannot lock them via a matrix entry — the vitest tests listed above under "Regression Test Identifiers" ARE the durable lock artifact plan 06-06 should cite (with `matrixEntryId` left `null`, which the frozen `fix-queue.ts` schema permits as long as `closedAt` is set for `locked`).
- `npx vitest run test/unit` (1324 tests), `npx tsc -p tsconfig.json --noEmit`, and `npm run build` are all green with no collateral regressions from either fix.
- No blockers for plan 06-06 (fix-queue status transitions / lock-in for these two entries plus RT6's oracle-tooling fidelity gap and other REVERIFY-01/-02 findings).

---
*Phase: 06-backlog-digestion-policy-fix-reverify*
*Completed: 2026-07-04*

## Self-Check: PASSED

All 10 files (7 src/test files touched + 2 new test files + this SUMMARY.md) confirmed present on disk; all 4 task commits (`26f8356`, `235b0b2`, `c9c9b5b`, `e11211c`) confirmed present in `git log --oneline --all`.
