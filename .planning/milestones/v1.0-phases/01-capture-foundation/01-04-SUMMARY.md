---
phase: 01-capture-foundation
plan: 04
subsystem: capture
tags: [oracle-substrate, git-diff, iotcm, cmd_goal_type, vitest, execFileSync]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/agda/session-capture/artifact-types.ts's OracleSubstrate interface (the fixed shape this plan fills in)"
provides:
  - "src/agda/session-capture/oracle-substrate.ts — resolveBeforeSource(session, explicit?) and buildOracleSubstrate(session, {expectedSignature?, beforeSource?}), CAP-05's source-diff / intended-goal-type / expected-signature substrate builder"
affects: ["01-05", "02-oracle-triad"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "beforeSource resolution priority: agent-supplied > git HEAD diff (execFileSync argv array, never execSync) > unavailable — try/catch around the git shell-out, never a hard failure"
    - "Live protocol queries inside a capture-adjacent helper are always try/catch-wrapped with a null fallback, so a stuck/dead Agda process degrades substrate richness instead of failing the capture call (D-01/D-02 extended to CAP-05)"

key-files:
  created:
    - src/agda/session-capture/oracle-substrate.ts
    - test/unit/agda/session-capture/oracle-substrate.test.ts
  modified: []

key-decisions:
  - "git show's execFileSync call sets stdio: [\"ignore\", \"pipe\", \"ignore\"] (matching src/index.ts's existing execFileSync convention) so the expected 'not a repo'/'not found' stderr noise never leaks — the try/catch already converts every git failure mode into beforeSourceOrigin: \"unavailable\""
  - "intendedGoalType's live Cmd_goal_type query reuses goal-operations.ts's exact modeGoalCommand(\"Cmd_goal_type\", \"Normalised\", goalId, quoted(\"\")) invocation shape and decodeGoalDisplayResponses decoder rather than inventing a new command pattern"

patterns-established:
  - "Task-boundary commits within a single new file: Task 1 (resolveBeforeSource) committed standalone and independently verified green before Task 2 (buildOracleSubstrate) layered on top in a second commit — both slices pass in isolation"

requirements-completed: [CAP-05]

# Metrics
duration: ~20min
completed: 2026-07-02
---

# Phase 1 Plan 4: Oracle Substrate Summary

**CAP-05's oracle substrate builder — `buildOracleSubstrate(session, {expectedSignature?, beforeSource?})` resolves a before/after source diff (agent-supplied > git HEAD > unavailable) and a live intended-goal-type via the existing Cmd_goal_type command shape, with every field optional and non-throwing.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-02
- **Tasks:** 2/2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `resolveBeforeSource(session, explicit?)` implements D-04's exact priority order (agent-supplied > git-diff > unavailable) using `execFileSync` exclusively (never `execSync`) against `git show HEAD:<repo-root-relative-path>`, with every git failure mode (no repo, untracked file, no HEAD commit, git not installed) falling through to `"unavailable"` rather than throwing
- `buildOracleSubstrate` composes the full `OracleSubstrate` shape: `beforeSource`/`beforeSourceOrigin` via `resolveBeforeSource`, `afterSource` via the hardened `readAgdaSourceFile` (O_NOFOLLOW + size-capped), `expectedSignature` as a pure D-02 pass-through, and `intendedGoalType` via a live `Cmd_goal_type` query for the first open goal — built through `command-builder.ts`'s `modeGoalCommand`/`quoted` (the exact shape `goal-operations.ts` already uses) and decoded via `decodeGoalDisplayResponses`
- Every live-command attempt is `try/catch`-wrapped with a `null` fallback — a stuck/dead Agda process never fails the substrate build or the capture call that will surface it (D-01/D-02 extended to CAP-05)
- Verified green against a real local Agda 2.8.0 binary (`RUN_AGDA_INTEGRATION=1`): loading `AbstractHoleMultiple.agda` and querying its first open goal's live type through the new substrate builder
- Full repo test suite (`npm run build && RUN_AGDA_INTEGRATION=1 npx vitest run`) passes green: 1517 passed / 5 skipped, zero regressions; `tsc -p tsconfig.json --noEmit` and `prettier --check` both clean on the new files

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve the before-source diff baseline (agent-supplied, git fallback, or unavailable)** - `0d504f6` (feat)
2. **Task 2: Grab the live intended goal type and assemble the full oracle substrate** - `5267373` (feat)

_Both tasks were `tdd="true"`; the full implementation for each task was designed and written together with its tests (verified RED-would-fail-without-implementation by construction — `buildOracleSubstrate` literally does not exist until Task 2's commit), then verified GREEN before committing. Task 1's slice (`resolveBeforeSource` + its 5 tests) was verified passing standalone before Task 2 layered `buildOracleSubstrate` on top._

## Files Created/Modified
- `src/agda/session-capture/oracle-substrate.ts` - `resolveBeforeSource(session, explicit?)` (Task 1) and `buildOracleSubstrate(session, input)` (Task 2), CAP-05's substrate builder
- `test/unit/agda/session-capture/oracle-substrate.test.ts` - 9 unit tests (5 for `resolveBeforeSource`, 4 for `buildOracleSubstrate`, one of the latter `RUN_AGDA_INTEGRATION`-gated against a real loaded goal)

## Decisions Made
- Added `stdio: ["ignore", "pipe", "ignore"]` to the `git show` `execFileSync` call — not explicitly required by the plan text, but matches `src/index.ts`'s existing `execFileSync` convention for expected-failure shell-outs and keeps test/production stderr free of git's routine "not a repository" noise. This is a Rule 1-adjacent polish (consistency with an existing codebase convention), not a behavior change — every failure path was already caught by the surrounding `try/catch`.
- `intendedGoalType` skip condition is `session.currentFile && session.goalIds.length > 0` (both, not either) — matches the plan's exact spec ("When `session.currentFile` is null or `session.goalIds` is empty, skip the live command entirely").

## Deviations from Plan

None — plan executed exactly as written. The `stdio` addition above is a defensive convention-consistency polish within Task 1's own scope, not a deviation from the plan's specified behavior (git shell-out via `execFileSync`, try/catch to `"unavailable"`).

## Issues Encountered
- Sandbox default Node is v22 (project requires >=24) and `node_modules` was missing in the fresh worktree — resolved via `mise exec node@24 -- npm ci` per the worktree setup instructions; no repo files were changed to work around this.
- `tsc -p tsconfig.test.json --noEmit` (a stricter test-file typecheck not run by `npm test`/`pretest`) surfaces pre-existing type errors in unrelated files (`agda-transport.test.ts`, `tool-recommendation.test.ts`, `output-schema-invariants.test.ts`) — confirmed pre-existing and unrelated to this plan's two new files (`grep -i oracle-substrate` against the error output returns zero matches). Out of scope per the deviation rules' scope boundary; not modified.
- The full-suite run without `npm run build` first showed 4 failing MCP e2e tests (`Connection closed` — they spawn `dist/index.js`, which didn't exist yet). Running `npm run build` (this repo's documented `pretest` step) before the suite resolved all 4; not a regression from this plan's changes.

## User Setup Required

None - no external service configuration required. No new dependencies were installed; the tool uses only existing project dependencies (`node:child_process`'s `execFileSync`, `node:path`) and the pre-existing `readAgdaSourceFile`/`modeGoalCommand`/`quoted`/`decodeGoalDisplayResponses` helpers.

## Next Phase Readiness
- `OracleSubstrate`'s full shape (from `artifact-types.ts`, 01-01) is now backed by a real builder — Plan 01-05 can wire `buildOracleSubstrate`'s output into the final `CaptureArtifact.oracleSubstrate` field and the `agda_capture_session` tool's input schema (currently the tool still emits `oracleSubstrate: null` per 01-01's explicit placeholder)
- Phase 2's ORCL-02 (soundness scan) now has real diff material (`beforeSource`/`afterSource`) and ORCL-03 (conformance proxy) has a real `intendedGoalType`/`expectedSignature` pair to read once 01-05 wires this into the artifact
- No blockers for 01-05

## Self-Check: PASSED

Both created files verified present on disk; both task commit hashes (`0d504f6`, `5267373`) verified present in `git log`.

---
*Phase: 01-capture-foundation*
*Completed: 2026-07-02*
