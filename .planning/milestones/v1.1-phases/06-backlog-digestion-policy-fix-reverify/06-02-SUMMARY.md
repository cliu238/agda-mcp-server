---
phase: 06-backlog-digestion-policy-fix-reverify
plan: 02
subsystem: testing
tags: [agda, mcp, dogfooding, fix-queue, oracle-triad, regression-triage, backlog-digestion]

# Dependency graph
requires:
  - phase: 05
    provides: "dogfood-run.mjs recording proxy, dogfood-wrapup.mjs oracle-triad+flake-gate pipeline, agda_capture_session verb, agda-dogfooding Agent Skill runbook"
  - phase: 04
    provides: "fix-queue.json frozen schema (statuses new|triaged|fixing|locked|rejected, needsReverify boolean annotation, terminal-status closedAt/rejectedReason invariants)"
provides:
  - "Definitive, pipeline-measured verdicts for RT1-RT4 (4 of the 8 needsReverify CHG defect specs): RT1 cannot-reproduce, RT2/RT3/RT4 CONFIRMED"
  - "test/fixtures/fix-queue.json transitions: RT1 -> rejected/cannot-reproduce; RT2, RT3, RT4 -> triaged, needsReverify:false; affectedTool corrected for RT2 (agda_query -> agda_infer) and RT3 (agda_context -> agda_goal_type_context_check)"
  - "Committed evidence report .planning/research/RT-REVERIFY.md with per-RT verdict/repro/observed/implication sections and run-ids"
  - "RT4's D-12-mandated pre-fix measurement, cross-attached to the related agda_auto entry (5abecc959e43fef3) without flipping its status — unblocks the D-08-gated fix in a later wave"
  - "Proven, reusable RT re-verification driver pattern (tmp/rt-driver.mjs) for RT5-RT8 in plan 06-03"
affects: [06-03, 06-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RT re-verification driver: a spec-parameterized MCP client (tmp/rt-driver.mjs, gitignored) connecting through scripts/dogfood/dogfood-run.mjs's StdioClientTransport, printing each callTool's structuredContent as evidence, always ending with agda_capture_session"
    - "Per-RT disposable corpus dirs (tmp/rt-reverify/rtN/) containing one copied existing test fixture + a minimal task-manifest.json with corpus: 'rt-local-fixture' (D-05: no new committed fixtures, no CHG corpus)"

key-files:
  created:
    - .planning/research/RT-REVERIFY.md
  modified:
    - test/fixtures/fix-queue.json
    - test/unit/fixtures/fix-queue.test.ts

key-decisions:
  - "RT1 verdict is cannot-reproduce, not confirmed: classifyLoadResult() now derives isComplete=success&&!hasHoles structurally, and Agda's own protocol assigns a goal ID to a bare '?' hole exactly like '{!!}' -- no independent fileComplete:true claim is possible in the current schema."
  - "RT2 confirmed on BOTH probed tools (agda_infer and agda_compute); affectedTool corrected from the placeholder agda_query (no such tool exists) to agda_infer, with agda_compute's identical reproduction recorded in notes."
  - "RT3 confirmed via agda_goal_type_context_check, the one goal-operation that never calls throwOnFatalProtocolStderr(); affectedTool corrected from the placeholder agda_context to the real tool name."
  - "RT4 confirmed byte-for-byte against the already-triaged agda_auto entry (5abecc959e43fef3); this is the D-12 pre-fix measurement, so 5abe's status was NOT flipped, only its notes gained the cross-reference (D-08 no-race rule)."
  - "The oracle triad auto-filed nothing across all 5 wrapup runs (0 filed every time) -- ORCL-01's differential and ORCL-02's soundness scan are not designed to catch this response-envelope/schema bug class, so the D-08 manual-merge sweep legitimately found zero disconnected duplicate rows to reconcile."
  - "test/unit/fixtures/fix-queue.test.ts's hardcoded needsReverify count (8) was updated to 4 as a direct, necessary companion to the SSOT data file this plan transitions -- the plan's own verify/acceptance-criteria gates require this exact test to pass after the edits."

requirements-completed: [REVERIFY-01]

# Metrics
duration: ~25min
completed: 2026-07-04
---

# Phase 6 Plan 02: RT1-RT4 Backlog Re-Verification Summary

**Re-verified RT1-RT4 live through the shipped dogfood-run/capture/wrapup pipeline against current main: RT1 does not reproduce (response schema now structurally prevents the v0.6.7 shape), RT2/RT3/RT4 all confirmed alive with corrected affectedTool identities and root causes pinpointed in source.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-04
- **Tasks:** 2/2 completed
- **Files modified:** 3 (1 created, 2 modified) across 2 commits

## Accomplishments

- Ran 5 live MCP sessions (rt1, rt2, rt3, rt3b, rt4) through `dogfood-run.mjs` -> `agda_capture_session` -> `dogfood-wrapup.mjs` against small disposable fixtures, exercising the real Loop-2 pipeline end-to-end for the first time on fresh cargo (D-06).
- Reached a definitive, schema-valid verdict for all 4 assigned RT specs: 1 rejected as cannot-reproduce (with honest measurement conditions recorded, never "never existed"), 3 confirmed with corrected `affectedTool` fields and pinpointed source-level root causes.
- Recorded RT4's D-12-mandated pre-fix measurement and cross-attached it to the related `5abecc959e43fef3` entry without racing the future `agda_auto` fix (D-08).
- Confirmed the D-08 manual-merge landmine did not materialize this run (0 auto-filed across all 5 wrapup runs) and documented why (this bug class is outside the oracle triad's current predicate coverage).
- Self-corrected an invalid "ill-typed" control probe mid-investigation (RT3's first attempt used a well-typed expression by mistake) rather than reporting a misleading data point — re-ran cleanly and documented the correction transparently.

## Task Commits

Each task was committed atomically:

1. **Task 1: Stand up the RT session rig and re-verify RT1 + RT2** - `2e131ef` (fix)
2. **Task 2: Re-verify RT3 + RT4 and finish the RT1-RT4 evidence sections** - `f547c1f` (fix)

_Note: both tasks touch the same two plan-scoped files (`test/fixtures/fix-queue.json`, `.planning/research/RT-REVERIFY.md`); the commits are split to reflect the true intermediate state after each task (RT1/RT2 transitioned first, RT3/RT4 transitioned second), including the companion test-count assertion (8 -> 6 -> 4)._

## Files Created/Modified

- `.planning/research/RT-REVERIFY.md` - Committed evidence report: header (date, agda version, current-main commit, node/tsx), summary table, and per-RT Verdict/v0.6.7-claim/Repro/Observed/Implication sections for RT1-RT4, plus a Methodology Notes section documenting the RT3 self-correction and the D-08 sweep result. Left open-ended with an explicit "RT5-RT8: see continuation (plan 06-03)" marker.
- `test/fixtures/fix-queue.json` - RT1 (`03f7c711c0209369`) -> `status: "rejected"`, `rejectedReason: "cannot-reproduce"`, `needsReverify: false`, `closedAt` set. RT2 (`e5f6de1fa365b887`) -> `status: "triaged"`, `needsReverify: false`, `affectedTool: "agda_infer"` (was placeholder `agda_query`). RT3 (`eaea6321183bdf7b`) -> `status: "triaged"`, `needsReverify: false`, `affectedTool: "agda_goal_type_context_check"` (was placeholder `agda_context`). RT4 (`004d161b839ce725`) -> `status: "triaged"`, `needsReverify: false`. Linked entry `5abecc959e43fef3` notes gained the RT4 cross-reference (status unchanged). All four RT entries' `notes` append the re-verification date, run-id, and one-line observed evidence per D-07.
- `test/unit/fixtures/fix-queue.test.ts` - Updated the hardcoded `needsReverify: true` seed-data count assertion from 8 to 4, tracking the RT1-RT4 transition this plan performs (necessary companion to the SSOT file per the plan's own verify gate).

## Decisions Made

- Verdicts were determined by direct inspection of each driver call's printed `structuredContent` envelope against the plan's literal per-RT predicate (e.g., RT1: "confirmed iff classification is ok-complete... unreproducible iff ok-with-holes with hasHoles:true"), not by whether the oracle triad auto-filed anything — the two are independent, and the oracle triad's silence across all 5 runs is itself a documented, explained finding (Methodology Notes in RT-REVERIFY.md), not a gap.
- RT3's first-attempt "ill-typed" control probe (`expr: "true"` into a `Bool`-typed goal) was actually well-typed, since both of `WriteCaseSplit.agda`'s goals return `Bool`. Corrected in a fresh run (`rt3-20260703b`, using `zero` — a genuine `Nat`-into-`Bool` mismatch) rather than silently reporting the misleading result; both run-ids' pipeline artifacts remain on disk, and the correction is documented transparently in the report per the 260702-29k honesty precedent.
- Chose to split the two task commits along the true intermediate data state (RT1+RT2 first, RT3+RT4 second) rather than a single combined commit, including two intermediate edits to the companion test's hardcoded count (8 -> 6 -> 4), so each commit's own `<verify>` block (which explicitly re-runs `fix-queue.test.ts`) is independently green — matching the plan's per-task atomic-commit requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale hardcoded seed-data count in fix-queue.json's validating companion test**
- **Found during:** Task 1 (after applying RT1/RT2 queue transitions)
- **Issue:** `test/unit/fixtures/fix-queue.test.ts` asserted `exactly 8 entries are flagged needsReverify: true` as a snapshot of the pre-plan seed data. This plan's entire purpose is to transition RT1-RT4 out of `needsReverify:true`, so the assertion goes stale by design the moment any RT entry is edited.
- **Fix:** Updated the assertion's expected count in lockstep with the actual data transitions (8 -> 6 after Task 1's RT1+RT2 edits, 6 -> 4 after Task 2's RT3+RT4 edits), renaming the test description to name which RT specs remain vs. were re-verified.
- **Files modified:** `test/unit/fixtures/fix-queue.test.ts`
- **Verification:** `npx vitest run test/unit/fixtures/fix-queue.test.ts` (10/10 passing) re-run after every edit to `fix-queue.json` in both commits.
- **Committed in:** `2e131ef` (Task 1 partial fix, 8->6) and `f547c1f` (Task 2 final fix, 6->4)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Necessary to satisfy the plan's own stated acceptance criteria (`npx vitest run test/unit/fixtures/fix-queue.test.ts` passes after the edits, for both tasks) and to keep the SSOT file's own validating companion test truthful. No scope creep — this file is the direct, single-purpose validator for `test/fixtures/fix-queue.json`, one of this plan's two declared files.

## Issues Encountered

None beyond the RT3 control-probe self-correction documented above (caught and fixed within Task 2, not a blocker).

## User Setup Required

None - no external service configuration required. All work ran and verified on the local machine using the already-installed `agda` 2.8.0 binary and the existing built `dist/index.js`.

## Next Phase Readiness

- REVERIFY-01's first half is complete: RT1-RT4 all have definitive, schema-valid, evidence-backed verdicts. `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` == 4 (RT5-RT8 remain), confirmed by `npx vitest run test/unit/fixtures/fix-queue.test.ts` (10/10 green).
- Plan 06-03 can proceed directly to RT5-RT8 using the exact same proven rig pattern (`tmp/rt-driver.mjs` spec-parameterized driver, per-RT disposable corpus dirs under `tmp/rt-reverify/`) — RT-REVERIFY.md's own closing marker line ("RT5-RT8: see continuation (plan 06-03)") is the handoff point; plan 06-03 should extend the SAME file rather than create a new report.
- RT4's D-12 pre-fix measurement is now on record and cross-attached to `5abecc959e43fef3` — the D-08-gated `agda_auto` fix (in a later wave) is unblocked to proceed without racing this re-verification.
- No blockers. `tmp/rt-reverify/`, `tmp/rt-driver.mjs`, and `.agda-mcp/runs/rt{1,2,3,4}-20260703{,b}/` remain on disk (gitignored) as durable local evidence per the sequential-execution instruction not to delete or relocate capture artifacts.
- REQUIREMENTS.md/STATE.md/ROADMAP.md tracking updates for this plan are intentionally NOT performed here — per this session's explicit instruction, the orchestrator centrally owns tracking writes for this wave (a parallel worktree agent is executing plan 06-01 concurrently on POLICY-01).

## Self-Check: PASSED

- FOUND: `.planning/research/RT-REVERIFY.md`
- FOUND: `test/fixtures/fix-queue.json`
- FOUND: `test/unit/fixtures/fix-queue.test.ts`
- FOUND: `.agda-mcp/runs/rt1-20260703/wrapup-report.json`
- FOUND: `.agda-mcp/runs/rt2-20260703/wrapup-report.json`
- FOUND: `.agda-mcp/runs/rt3-20260703b/wrapup-report.json`
- FOUND: `.agda-mcp/runs/rt4-20260703/wrapup-report.json`
- FOUND commit: `2e131ef`
- FOUND commit: `f547c1f`
- VERIFIED: `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` == 4
- VERIFIED: `npx vitest run test/unit/fixtures/fix-queue.test.ts` == 10/10 passing

---
*Phase: 06-backlog-digestion-policy-fix-reverify*
*Completed: 2026-07-04*
