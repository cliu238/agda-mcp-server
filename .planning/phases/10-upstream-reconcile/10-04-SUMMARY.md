---
phase: 10-upstream-reconcile
plan: 04
subsystem: test-infrastructure
tags: [warn-guard, vitest, full-suite-verification, merge-acceptance]

# Dependency graph
requires:
  - phase: 10-01 (merge upstream v0.6.8)
    provides: the merged candidate carrying upstream's warn-guard harness (test/helpers/warn-guard.ts, vitest.config.ts's setupFiles) already active globally
  - phase: 10-02 (MERGE-03 load-terminus adjudication)
    provides: the GREEN-adjudicated session-load-impl.ts/agda-transport.ts/command-completion.ts candidate this plan's full-suite run exercises
  - phase: 10-03 (ADOPT-01/02 feature wiring)
    provides: agda_goal_candidates wired into tool-recommendation/docs, including its own new logger.warn call site already covered by a carried-in test
provides:
  - Empirical, authoritative confirmation that the full ~2000-test combined suite is GREEN under upstream's fail-on-unexpected-logger.warn harness, with zero code changes needed
  - A cross-referenced inventory of all 9 logger.warn call sites in src/ against test coverage, confirming 6 are correctly registered (expectWarning) and 3 are genuinely dormant (untested, therefore non-guard-triggering)
affects: [10-05 (final push/acceptance — this plan is MERGE-02's closing evidence)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Full-suite-run-as-ground-truth triage (RESEARCH.md Pitfall 6): never estimate warn-guard blast radius from a static grep count — run the guarded suite once and use its actual (possibly empty) failure list as the authoritative triage input"

key-files:
  created: []
  modified: []
  deleted: []

key-decisions:
  - "No expectWarning/ackWarnings registrations were added — the live guarded full-suite run (Task 1) surfaced zero failures of any kind (warn-guard or ordinary assertion), meaning Plans 10-01/10-02/10-03's own targeted test fixes had already brought every test-exercised logger.warn call site into compliance as a side effect of their own work. Task 2's fix loop had nothing to iterate on."
  - "Confirmed via direct grep + read that all 6 already-covered call sites' expectWarning() calls exist and match the current live logger.warn message text exactly (no drift from Plan 10-02's adjudication), and confirmed via a targeted grep sweep of test/ that the 3 dormant sites (session-load-helpers.ts:189 'explicit hole scan failed', register-goal-catalog.ts:104 'goal typeContext query failed', agda-transport.ts:280 'sendCommand still waiting') are genuinely never exercised by any test — not silently miscounted as passing."

requirements-completed: [MERGE-02]

# Metrics
duration: 10min
completed: 2026-07-05
---

# Phase 10 Plan 04: Full guarded suite acceptance (MERGE-02) Summary

**Ran the exact LOCAL verification gate (`npm ci && npm run build && npx tsc -p tsconfig.test.json --noEmit && RUN_AGDA_INTEGRATION=1 npx vitest run`) against the Plan 10-01/10-02/10-03 merge candidate — the full ~2000-test suite is GREEN under upstream's fail-on-unexpected-`logger.warn` harness with zero failures, so zero new `expectWarning`/`ackWarnings` registrations were needed; a full cross-reference confirms all 9 `logger.warn` call sites in `src/` are either correctly test-registered (6) or genuinely dormant/untested (3), never silently unguarded.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-05T19:24:00Z
- **Completed:** 2026-07-05T19:28:47Z
- **Tasks:** 2/2 (both evidence-gathering/verification-only — no source edits)
- **Files modified:** 0

## Accomplishments

- Re-verified the Node 24 mise toolchain and real Agda binary are on PATH (`node v24.16.0`, `agda 2.8.0`) before running anything, per the environment gotcha both 10-CONTEXT.md and RESEARCH.md flag (ambient shell default resolves to Node 22).
- `npm ci` — clean install, 145 packages, 0 vulnerabilities, no unexpected lockfile diff.
- `npm run build` (`tsc -p tsconfig.json && node scripts/copy-json-assets.mjs`) — exits 0, no output (silent success).
- `npx tsc -p tsconfig.test.json --noEmit` — exits 0, no output (silent success).
- `RUN_AGDA_INTEGRATION=1 npx vitest run` (the full, real-Agda, warn-guard-active suite) — **233 test files passed, 4 skipped (237 total); 2038 tests passed, 5 skipped (2043 total); zero failures.** Duration 159.64s (import 37.13s, tests 413.74s across parallel workers). This is the authoritative Task 1 evidence: the full suite ran to completion (not aborted early) and produced a clean final pass/fail summary with nothing to triage.
- Grepped the log for any failure/error signal beyond expected best-effort console noise (dogfood-wrapup fixture warnings, deliberate ENOENT/spawn-failure test fixtures already asserted as expected by their own tests) — confirmed zero `FAIL`/test-level error lines anywhere in the run.
- Cross-referenced all 9 `logger.warn(` call sites in `src/` against `test/`'s `expectWarning`/`ackWarnings` usages (grep + read, not assumption):
  - `src/agda/agda-process-spawn.ts:140` ("Late error from abandoned Agda process") → `test/unit/agda/spawn-error-listener.test.ts:74` `expectWarning("Late error from abandoned Agda process")` — exact match, confirmed.
  - `src/agda/session-load-helpers.ts:130` ("post-load metas reconciliation failed") → `test/unit/agda/session-load-impl.test.ts:421,476` (both `expectWarning("post-load metas reconciliation failed")`) — exact match, confirmed.
  - `src/session/agda-transport.ts:217` ("Control command not acknowledged...") → `test/unit/session/agda-transport.test.ts:401` `expectWarning("Control command not acknowledged")` — exact match, confirmed.
  - `src/session/agda-transport.ts:302` ("sendCommand timed out") → `test/unit/session/agda-transport.test.ts:708` `expectWarning("sendCommand timed out")` — exact match, confirmed.
  - `src/session/project-config.ts:322` ("Failed to parse .agda-mcp.json") → `test/unit/session/project-config.test.ts:79` `expectWarning("Failed to parse .agda-mcp.json")` — exact match, confirmed.
  - `src/tools/register-goal-candidates.ts:101` ("goal_candidates typeContext query failed") → `test/unit/tools/goal-candidates.test.ts:96` `expectWarning("goal_candidates typeContext query failed")` — exact match, confirmed (this is the new ADOPT-01 call site the plan's interfaces block specifically flagged; carried in already-covered by the merge).
  - `src/agda/session-load-helpers.ts:189` ("explicit hole scan failed") → **confirmed genuinely dormant**: a repo-wide grep for `countExplicitSourceHoles`/"explicit hole scan failed" in `test/` returns zero hits touching the actual warn path (only unrelated `fix-queue.json` prose mentioning the function name in a deferred RT6 note). No test drives this branch's error path, so the guard correctly never fires for it — not a coverage gap this plan's scope calls for closing (per the plan's own explicit "do not manufacture new tests" instruction).
  - `src/tools/register-goal-catalog.ts:104` ("goal typeContext query failed") → **confirmed genuinely dormant**: zero hits in `test/` for this exact message. Same disposition as above.
  - `src/session/agda-transport.ts:280` ("sendCommand still waiting", gated behind `AGDA_MCP_WAITING_SENTRY_MS`, default 0/disabled) → **confirmed genuinely dormant**: `test/unit/session/command-completion.test.ts` only unit-tests the pure `configuredWaitingSentryMs()` config-parsing function, never triggers the actual transport-level warn firing. Same disposition.
- No `expect(...)` assertion, `test(...)` block, or `logger.warn(...)` call was touched, deleted, or weakened — there was nothing to change.

## Task Commits

Both tasks were evidence-gathering/verification-only per their own `<files>` annotations ("no source edits") — the live guarded suite run surfaced zero failures, so Task 2's fix loop had zero iterations to perform. No `feat`/`fix`/`test` commit exists for this plan's task work because no file in the tree changed as a result of it. This mirrors Plan 10-01's Task 1 pattern (a pure verification step produces no commit of its own) and Plan 10-02's Task 1 (referee run, no source edits, verdict fed directly into Task 2 — here the verdict was "already green," so there was no Task 2 work either).

**Plan metadata:** committed separately after this summary (see final_commit step).

## Files Created/Modified

None — this plan's two tasks (run the guarded suite, triage failures to green) both completed with zero code changes because the full suite was already green on the first live run.

## Decisions Made

- Treated the full guarded-suite run's actual (empty) failure list as ground truth per RESEARCH.md Pitfall 6 and the plan's own explicit instruction, rather than assuming the plan's own pre-computed grounded-starting-point list needed re-verification work beyond a read-only cross-check. The cross-check was performed anyway (see Accomplishments) to satisfy the plan's literal acceptance criteria text ("grep -rn logger.warn src/ cross-referenced against every exercising test"), even though the live run alone already proved MERGE-02's core requirement.
- Did not manufacture new tests for the 3 dormant call sites (`explicit hole scan failed`, `goal typeContext query failed`, `sendCommand still waiting`) — the plan explicitly forbids this ("Do not manufacture new tests solely to exercise these paths; that is out of MERGE-02's literal scope"). Their dormancy is a pre-existing coverage characteristic, not a MERGE-02 regression to fix.

## Deviations from Plan

None — plan executed exactly as written. The plan's Task 2 action text anticipated a real fix loop ("For each warn-guard failure Task 1 surfaced...Re-run the full guarded suite after each fix batch until it is fully green"), but the live Task 1 run's actual outcome (zero failures) meant Task 2 degenerated to a verification-only cross-check, which is itself an explicitly anticipated outcome path in the plan's own acceptance criteria (they are phrased as "shows each site either has a registration... or is confirmed genuinely untested," not "N registrations must be added").

## Issues Encountered

- None. The full suite's own background console noise (dogfood-wrapup fixture warnings for deliberately-malformed test manifests, expected `spawn npx ENOENT`/`boom` fail-open upload-chain test fixtures, a git `hint:` about default branch naming from a throwaway test repo) is all expected output from tests that are themselves asserting fail-open/graceful-degradation behavior — none of it is a warn-guard failure or an ordinary assertion failure; confirmed via a targeted grep for `FAIL`/error-level signals across the full log, which returned nothing beyond this expected noise.
- Per the plan's own `<sequential_execution>` framing note, `test/unit/tools/team-install-pinned-env.test.ts`'s previously-logged 6-test environmental failure set (network/Node-version dependent, `.planning/phases/10-upstream-reconcile/deferred-items.md`) did NOT reproduce in this run — the full suite's 233/237 files and 2038/2043 tests all passed or skipped cleanly, with no failures attributable to that file. Documented here per the plan's instruction to note if it fails, and equally to note if it does NOT (it didn't) — no action needed either way.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- MERGE-02 is satisfied: the full combined suite is green under the warn-guard, and every test-exercised `logger.warn` call site carries an explicit, message-matching `expectWarning` registration (6 of 9 sites); the remaining 3 are confirmed genuinely dormant, not silently unguarded.
- Combined with 10-01 (MERGE-01), 10-02 (MERGE-03), and 10-03 (ADOPT-01/02), all of Phase 10's requirements except ACCEPT-01/02/03 are now complete. Plan 10-05 (full acceptance: dogfood session, final push, deploy watch) has a fully green, fully-verified tree to build on — this plan's own `RUN_AGDA_INTEGRATION=1 npx vitest run` result already satisfies ACCEPT-01's literal full-suite-green requirement as a side effect; 10-05 should re-confirm rather than re-run from scratch if no further commits land first.
- Nothing pushed to origin (D-10) — exactly one push happens at the end of the whole phase (Plan 10-05).

---
*Phase: 10-upstream-reconcile*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: .planning/phases/10-upstream-reconcile/10-04-SUMMARY.md
- FOUND commit: e56b2fd (docs(10-04): add plan summary)
