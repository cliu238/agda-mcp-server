---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
plan: 05
subsystem: oracle-triad
tags: [agda, mcp, oracle, verdict-composition, cold-replay, vitest, tsx, tdd]

# Dependency graph
requires:
  - phase: 02-02
    provides: "judgeOrcl02(artifactPath, options) — standalone ORCL-02 soundness-hygiene predicate"
  - phase: 02-03
    provides: "materializeCaptureEnvironment(), findWarmLoadTuple(), runColdLoadAndDiff(), judgeOrcl01() from scripts/oracle/orcl-01-differential.mjs; spawnColdAgdaSession()/runEnvironmentProbes() from scripts/oracle/cold-agda-session.mjs"
  - phase: 02-04
    provides: "parseExpectedSignature(), runColdInferAndCompare(), judgeOrcl03() from scripts/oracle/orcl-03-conformance.mjs"
provides:
  - "composeVerdict({orcl01,orcl02,orcl03,capturePath,fingerprint,recurrence}) — the D-02 verdict composition contract; trueGreen iff orcl01=pass AND orcl02=clean, orcl03 always advisory"
  - "abstentionMetricLine(verdict) — the exact JSONL-line shape for the abstention/INCONCLUSIVE cumulative metric"
  - "runOracle(artifactPath, options) — the single composed CLI: runs ORCL-01/02/03 per --only, shares one materialized environment + one cold Agda process between ORCL-01/ORCL-03 when both run, writes a verdict sidecar next to the capture, appends one oracle-metrics.jsonl line per run"
  - "runColdLoadAndDiff(artifact, materialized, warm, options) gains a backward-compatible keepSessionAlive + spawnColdAgdaSession override, letting a caller reuse the still-open cold session for ORCL-03 instead of a second spawn"
  - "COMPLETENESS_CLASSIFICATIONS exported from orcl-01-differential.mjs (was previously module-private)"
  - "CLI: npx tsx scripts/oracle/run-oracle.mjs <artifact.json> [--only orcl-01,orcl-02,orcl-03] — exit 0 iff trueGreen, else 1"
affects: [03-regression-emitter, 04-fix-queue, 05-dogfooding-orchestration-fuel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runColdLoadAndDiff's finish(outcome, session) closure: keepSessionAlive=false (default) makes it an identity wrapper — zero behavior change for existing callers (judgeOrcl01); keepSessionAlive=true wraps every return as {outcome, session, materializedPath}, with session non-null ONLY on the real success path (terminus reached), so the caller has an unambiguous signal for 'is there a live process to reuse'"
    - "run-oracle.mjs-local excluded-placeholder convention: a predicate excluded by --only gets a locally-defined placeholder ({kind:'skip',reason:'excluded by --only'} for orcl01/orcl02, {kind:'vacuous-no-expected-signature'} for orcl03, matching its own existing enum) — documented as NOT a new addition to any individual predicate module's own outcome union, purely a run-oracle.mjs-local composition concept"
    - "Dependency-injection seam for spawn-count testing: runColdLoadAndDiff's options.spawnColdAgdaSession (defaulting to the real import) threads through run-oracle.mjs's options.deps.spawnColdAgdaSession, letting a test count cold-process spawns without any production code path ever needing to know about it"

key-files:
  created:
    - scripts/oracle/verdict-schema.mjs
    - scripts/oracle/run-oracle.mjs
    - test/unit/tools/oracle-verdict-schema.test.ts
    - test/unit/tools/oracle-run-oracle.test.ts
  modified:
    - scripts/oracle/orcl-01-differential.mjs

key-decisions:
  - "runColdLoadAndDiff's signature grew a 4th `options` parameter (keepSessionAlive, spawnColdAgdaSession override) — a file NOT listed in this plan's files_modified frontmatter. Required because the function unconditionally killed its cold session immediately after the load response, per Plan 02-03's own SUMMARY.md readiness note ('Plan 02-05's composition work will need to thread a don't kill yet option through'). Default behavior (no options) is byte-for-byte identical to before; all 10 pre-existing oracle-orcl-01 tests pass unchanged."
  - "COMPLETENESS_CLASSIFICATIONS exported (one-word addition) rather than duplicated as a second Set literal in run-oracle.mjs, to avoid drift risk between the two skip-decision copies — a much smaller, lower-risk touch than the keepSessionAlive change to the same already-being-modified file."
  - "runColdInferAndCompare called with all 4 real params (session, materializedPath, name, expectedType) per the ACTUAL exported function signature (verified by reading the source file directly), even though both the plan's <interfaces> and <action> text shorthand it as a 3-arg call omitting materializedPath."
  - "Task 1 test file adds a 6th supplementary test for abstentionMetricLine (zero direct coverage in the plan's own 5-item behavior list, which is entirely composeVerdict-focused) — same category of gap 02-02-SUMMARY.md already documented and filled the same way."

requirements-completed: [ORCL-01, ORCL-02, ORCL-03]

# Metrics
duration: ~32min
completed: 2026-07-02
---

# Phase 2 Plan 5: Single Oracle CLI — Verdict Composition Summary

**One CLI (`run-oracle.mjs`) composes ORCL-01/02/03 into a D-02 verdict sidecar via `composeVerdict()`, sharing one materialized environment and one cold Agda process between ORCL-01 and ORCL-03 (proven via a real spawn-count test against local Agda 2.8.0), with every `--only` combination — including `orcl-03` alone — producing a real, non-placeholder outcome for each included predicate.**

## Performance

- **Duration:** ~32 min (base commit `63aa726`; first task commit `2d4a0c6` at 05:39:27, last task commit `5514348` at 05:47:20, plus the full-repo `RUN_AGDA_INTEGRATION=1` verification pass after)
- **Started:** 2026-07-02T09:19:25Z (base commit)
- **Completed:** 2026-07-02T09:50:00Z (approx.)
- **Tasks:** 2/2 completed
- **Files modified:** 4 created, 1 modified

## Accomplishments
- Built `scripts/oracle/verdict-schema.mjs`: `composeVerdict()` (the D-02 composition contract — `trueGreen` iff `orcl01.kind === "pass" && orcl02.kind === "clean"`, ORCL-03 always advisory, `consistencyProbe: { attempted: false }` always present per D-06) and `abstentionMetricLine()` (the exact JSONL-line shape for the cumulative abstention metric).
- Built `scripts/oracle/run-oracle.mjs`: the single composed CLI entry point (`runOracle(artifactPath, options)` + `scriptMain`). Handles all three documented `--only` cases: (a) ORCL-01 included (± ORCL-03) shares ONE materialized environment + ONE cold Agda process; (b) `--only orcl-03` alone falls back to the full standalone `judgeOrcl03`; (c) neither included, both get the excluded-placeholder. Writes the verdict sidecar via `writeFileAtomic` (D-01: never a mutation of the artifact) and appends one `oracle-metrics.jsonl` line per run (D-04).
- **Proved session-sharing end-to-end against real local Agda 2.8.0**: a dedicated test with a counting `spawnColdAgdaSession` wrapper confirms `--only orcl-01,orcl-03` spawns exactly ONE cold Agda process — ORCL-01's cold `Cmd_load` and ORCL-03's `Cmd_infer_toplevel` genuinely share the same still-open process, with ORCL-03 producing a REAL `"consistent"` outcome (not a vacuous placeholder) from that shared session.
- **Proved the Warning-4 fix end-to-end**: `--only orcl-03` alone (ORCL-01 excluded, so no shared session exists) falls back to the standalone `judgeOrcl03`, producing a real `"consistent"` result rather than silently downgrading to `vacuous-no-expected-signature`.
- **Proved the full pipeline end-to-end**: running `runOracle` with no `--only` (all three predicates) against a real staged capture produced `orcl01=pass orcl02=clean orcl03=consistent trueGreen=true` — a genuine true-green verdict — with exactly one verdict sidecar written, the artifact's own JSON byte-for-byte unchanged, and exactly one new `oracle-metrics.jsonl` line appended.
- Extended `scripts/oracle/orcl-01-differential.mjs`'s `runColdLoadAndDiff` with a backward-compatible `options` parameter (`keepSessionAlive`, `spawnColdAgdaSession` override) — the session-sharing mechanism this plan's must-haves require. Verified byte-for-byte behavioral parity for existing callers: all 10 pre-existing `oracle-orcl-01.test.ts` tests pass completely unchanged.
- Full regression sweep: `npm test` (176 files / 1444 tests passed, 12 files / 170 tests skipped — expected without the env var) and a full `RUN_AGDA_INTEGRATION=1 npx vitest run` (184 files / 1609 tests passed, 4 files / 5 tests skipped) both green — zero regressions across the entire Phase 2 test surface.

## Task Commits

Each task was committed atomically (both `tdd="true"`, each with its own RED/GREEN cycle):

1. **Task 1: D-02 verdict schema + composeVerdict()**
   - `2d4a0c6` (test) — 6 failing tests, module doesn't exist yet (RED)
   - `279e51b` (feat) — `composeVerdict`/`abstentionMetricLine` (GREEN)
2. **Task 2: Single CLI entry point — shared session, sidecar write, abstention metric**
   - `ea9165d` (test) — 5 failing tests, module doesn't exist yet (RED)
   - `5514348` (feat) — `run-oracle.mjs` + the `orcl-01-differential.mjs` session-sharing extension (GREEN)

**Plan metadata:** (this commit, docs: complete plan)

_TDD gate compliance: both tasks have a `test(...)` commit strictly before their `feat(...)` commit, each verified RED (import failure — module didn't exist) before GREEN (all tests passing)._

## Files Created/Modified
- `scripts/oracle/verdict-schema.mjs` (90 lines) - `composeVerdict`, `abstentionMetricLine`
- `scripts/oracle/run-oracle.mjs` (295 lines) - `runOracle`, `scriptMain`/CLI, the shared-vs-standalone ORCL-01/ORCL-03 composition helpers
- `test/unit/tools/oracle-verdict-schema.test.ts` (124 lines, 6 tests) - full behavior coverage for Task 1 plus one supplementary test
- `test/unit/tools/oracle-run-oracle.test.ts` (299 lines, 5 tests: 3 `RUN_AGDA_INTEGRATION`-gated, 2 pure) - end-to-end pipeline, shared-session spawn-count proxy, `--only orcl-02` exclusion, sidecar-path purity, `--only orcl-03`-alone fallback
- `scripts/oracle/orcl-01-differential.mjs` (548 → 593 lines) - `runColdLoadAndDiff` gains the `options` parameter; `COMPLETENESS_CLASSIFICATIONS` now exported

## Decisions Made

1. **`runColdLoadAndDiff` extended with a backward-compatible `options` parameter, touching a file outside this plan's `files_modified` frontmatter.** The plan's own `<action>` text requires calling `runColdLoadAndDiff` directly (not `judgeOrcl01`) so ORCL-01 and ORCL-03 can share a session — but the function as written by Plan 02-03 unconditionally calls `session.kill()` immediately after the cold load response, before any diff is even computed, making the returned outcome the ONLY thing ever visible to a caller. Plan 02-03's own SUMMARY.md explicitly flagged this as expected follow-up work: "`runColdLoadAndDiff` currently kills the session itself after diffing, so Plan 02-05's composition work will need to thread a 'don't kill yet' option through if it wants ORCL-03 to run `Cmd_infer_toplevel` against the SAME still-open process." I implemented exactly that: `options.keepSessionAlive` (default `false`) and `options.spawnColdAgdaSession` (default: the real import, overridable for the spawn-count test). The `finish(outcome, session)` closure makes `keepSessionAlive: false` a pure identity wrapper — confirmed byte-for-byte via all 10 pre-existing `oracle-orcl-01.test.ts` tests passing completely unchanged, with zero modifications to that test file.
2. **`COMPLETENESS_CLASSIFICATIONS` exported rather than duplicated.** `run-oracle.mjs` needs to replicate `judgeOrcl01`'s own "is this warm classification worth a cold replay" decision (to decide whether ORCL-03 can share a session at all) without calling `judgeOrcl01` itself. Since `orcl-01-differential.mjs` was already being modified for the `keepSessionAlive` change, adding the `export` keyword to this one existing constant was a strictly smaller, lower-risk addition than hand-copying the 3-string Set literal into a second file (which would drift silently if the source set ever changes).
3. **`runColdInferAndCompare` called with its real 4-argument signature** (`session, materializedPath, targetName, expectedType`), not the 3-argument shorthand both the plan's `<interfaces>` section and `<action>` text use (`runColdInferAndCompare(session, name, expectedType)`, omitting `materializedPath`). Confirmed by reading `scripts/oracle/orcl-03-conformance.mjs`'s actual `export async function runColdInferAndCompare(session, materializedPath, targetName, expectedType)` directly, per the plan's own "read the actual file for exact exports" instruction.
4. **The `--only`-excluded placeholder convention uses two different shapes per predicate**, exactly as Test 3's own description specifies: ORCL-01/ORCL-02 excluded get `{ kind: "skip", reason: "excluded by --only" }`; ORCL-03 excluded gets `{ kind: "vacuous-no-expected-signature" }` (its own enum has no "skip"-equivalent kind, and "nothing to compare" is already the correct advisory-safe fit). Documented once in `run-oracle.mjs` as a local composition concept, never fed back into any individual predicate module.
5. **`--only []` (an explicit empty array) means "run nothing"**, distinct from the default (`options.only` omitted entirely) meaning "run all three" — this is the exact mechanism Test 4 uses to get a fully pure (zero subprocess, zero real scan) test run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - internal plan inconsistency + blocking] `runColdLoadAndDiff` cannot share its session with ORCL-03 as originally written**
- **Found during:** Task 2 design, before writing the implementation (anticipated directly from Plan 02-03's own SUMMARY.md readiness note, not discovered via a failing test)
- **Issue:** The plan's own must-have ("When ORCL-01 and ORCL-03 both run, they share ONE materialized environment and ONE cold Agda process") and Task 2's own Test 2 (asserting exactly one `spawnColdAgdaSession` call across both predicates) are structurally impossible to satisfy by calling `runColdLoadAndDiff` as a black box, since that function killed its session unconditionally before ever returning to the caller — there was no way to get a live session out of it.
- **Fix:** Extended `runColdLoadAndDiff`'s signature with a 4th, optional, backward-compatible `options` parameter (see Decision 1 above). `keepSessionAlive: false` (the default, used by every existing caller) preserves the exact prior behavior.
- **Files modified:** `scripts/oracle/orcl-01-differential.mjs`
- **Verification:** `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-orcl-01.test.ts` — all 10 pre-existing tests pass unchanged. `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-run-oracle.test.ts` — the new spawn-count test (Test 2) confirms exactly one spawn.
- **Committed in:** `5514348` (Task 2 GREEN commit)

**2. [Rule 1 - mechanical correctness] `runColdInferAndCompare` called with the real 4-arg signature, not the plan's 3-arg shorthand**
- **Found during:** Task 2 implementation, while reading `orcl-03-conformance.mjs`'s actual export
- **Issue:** Both the plan's `<interfaces>` section and `<action>` text describe `runColdInferAndCompare(session, name, expectedType)` — omitting the `materializedPath` parameter the real function actually requires as its 2nd argument.
- **Fix:** Called the function with its real signature: `runColdInferAndCompare(session, materializedPath, name, expectedType)`.
- **Files modified:** `scripts/oracle/run-oracle.mjs`
- **Verification:** Tests 1/2/5 (all RUN_AGDA_INTEGRATION-gated, exercising this exact call) pass, producing real `"consistent"`/`"conformance-flagged"` outcomes.
- **Committed in:** `5514348` (Task 2 GREEN commit)

**3. [Rule 2 - missing test coverage] Added a 6th supplementary test for `abstentionMetricLine`**
- **Found during:** Task 1 implementation, cross-checking the plan's own acceptance criteria ("exports `composeVerdict` and `abstentionMetricLine`") against its 5-item `<behavior>` list (every one of which is `composeVerdict`-focused; none directly exercises `abstentionMetricLine`)
- **Issue:** `abstentionMetricLine` is a required, load-bearing export (Task 2 depends on it directly to build the metrics line) with zero direct test coverage from the plan's own literal behavior list.
- **Fix:** Added one supplementary test asserting `abstentionMetricLine`'s shape for both an inconclusive and a passing `orcl01` outcome.
- **Files modified:** `test/unit/tools/oracle-verdict-schema.test.ts`
- **Verification:** All 6 tests pass (`npx vitest run test/unit/tools/oracle-verdict-schema.test.ts --reporter=dot`).
- **Committed in:** `2d4a0c6` (Task 1 RED commit — written as part of the initial test file, before the GREEN implementation)

---

**Total deviations:** 3 auto-fixed (1 Rule 1/3 structural fix load-bearing for the plan's own must-haves, 1 Rule 1 mechanical-signature correction, 1 Rule 2 missing-coverage addition)
**Impact on plan:** The session-sharing fix (#1) is load-bearing — without it, the plan's own central must-have (ORCL-01/ORCL-03 sharing one cold process) and Test 2 could not be satisfied at all by following the plan's explicit instruction to call `runColdLoadAndDiff` directly. All three deviations were anticipated by either this plan's own dependency chain (Plan 02-03's SUMMARY.md) or discoverable by reading the actual source files the plan itself instructs reading first. No scope creep: no new finding kinds, no new CLI surface beyond what the plan specifies, no file touched beyond the one already-necessary extension to `orcl-01-differential.mjs`.

## Issues Encountered
None beyond the three deviations documented above (all fully resolved and verified against real local Agda 2.8.0).

## User Setup Required
None - no external service configuration required. A local `agda` binary was available on this machine (2.8.0) and used to fully verify every `RUN_AGDA_INTEGRATION`-gated test rather than relying solely on the pure subset.

## Next Phase Readiness
- The D-02 verdict schema (`composeVerdict`/`abstentionMetricLine`) and the composed CLI (`runOracle`) are the complete Phase 2 deliverable Phase 3's regression emitter and Phase 4's fix-queue prioritization both consume directly: Phase 3 reads a verdict sidecar's `orcl01`/`orcl02` outcomes to refuse ORCL-02-failing/ORCL-01-INCONCLUSIVE captures per STATE.md's roadmap note; Phase 4 reads `trueGreen` + per-predicate detail for queue prioritization.
- `oracle-metrics.jsonl`'s cumulative append-per-run shape is ready for Phase 5's dogfooding orchestration to report the abstention/INCONCLUSIVE rate (ROADMAP success criterion 2) by simply counting lines where `orcl01Kind === "inconclusive"`.
- No blockers. `npm test` (176/188 files, 1444/1614 tests) and `RUN_AGDA_INTEGRATION=1 npx vitest run` (184/188 files, 1609/1614 tests) are both fully green — this is the full Phase 2 gate (all 5 plans in this phase), confirming zero regressions.
- This is the last plan (wave 4) of Phase 2 — the Oracle Triad (ORCL-01/02/03) is now a complete, independently-testable-and-composable predicate set with one real CLI entry point.

## Self-Check: PASSED

- All 4 created files verified present on disk (`scripts/oracle/verdict-schema.mjs`, `scripts/oracle/run-oracle.mjs`, `test/unit/tools/oracle-verdict-schema.test.ts`, `test/unit/tools/oracle-run-oracle.test.ts`) plus the modified `scripts/oracle/orcl-01-differential.mjs` and this SUMMARY.md.
- All 4 referenced commit hashes (`2d4a0c6`, `279e51b`, `ea9165d`, `5514348`) verified present in `git log --oneline --all`.

---
*Phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Completed: 2026-07-02*
