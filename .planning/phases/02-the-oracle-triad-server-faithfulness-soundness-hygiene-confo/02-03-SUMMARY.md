---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
plan: 03
subsystem: infra
tags: [agda, mcp, oracle, cold-replay, differential-testing, false-green, vitest, tsx]

# Dependency graph
requires:
  - phase: 02-01
    provides: "scripts/oracle/cold-agda-session.mjs's spawnColdAgdaSession() multi-command lifecycle + runEnvironmentProbes() 7-probe gate"
provides:
  - "ORCL-01 complete: scripts/oracle/orcl-01-differential.mjs — materializeCaptureEnvironment(), runProbeGate(), findWarmLoadTuple(), categorySet()/extractErrorCategory(), runColdLoadAndDiff(), judgeOrcl01(), scriptMain CLI"
  - "scripts/oracle/cold-agda-session.mjs: spawnColdAgdaSession() gains an optional, backward-compatible extraSpawnArgs param (needed for faithful -l library-flag replay)"
  - "Empirical finding (general, not nix-specific): -l NAME library flags must be replayed as cold-spawn argv, never embedded in Cmd_load's own per-call option list, or a spurious library-resolution error gets misattributed to the wrong logical command"
affects: [02-05-verdict-composition, 03-regression-emitter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-stage probe gate: runProbeGate() called once pre-spawn (environment-only probes, safe placeholder cold-response defaults) and once post-spawn (real coldResponses/timedOut) — never spawns cold Agda after a failed pre-spawn probe"
    - "Priming round trip: send a harmless Cmd_show_version IOTCM command immediately after a fresh cold spawn, before the real command, to absorb process-startup stdout noise — mirrors AgdaSession's own preflightVersionDetection so the real command's response stream is never contaminated by unrelated startup output"
    - "Argv-role split: manifest.mergedArgv (which mixes spawn-time -l flags with Cmd_load-time flags for record-keeping) must be split back into spawnColdAgdaSession's extraSpawnArgs vs Cmd_load's own per-call option list before replay — treating it as one monolithic Cmd_load option list is semantically wrong"

key-files:
  created:
    - scripts/oracle/orcl-01-differential.mjs
    - test/unit/tools/oracle-orcl-01.test.ts
  modified:
    - scripts/oracle/cold-agda-session.mjs

key-decisions:
  - "-l NAME library flags are replayed via spawnColdAgdaSession's new extraSpawnArgs (spawn-time argv), never via Cmd_load's own per-call option list — empirically confirmed necessary, not a style preference"
  - "A priming Cmd_show_version round trip runs before the real cold Cmd_load on every replay, discarding its response — the version PROBE itself still uses the plan-mandated execFileSync check; the priming command exists solely to give process-startup noise somewhere harmless to land"
  - "runProbeGate() recomputes the environment-only probes (execFileSync version check, build-fresh, closure-hash) internally from artifact+materialized data on every call, rather than requiring the caller to precompute and pass them in — makes the pre-spawn/post-spawn two-call pattern trivial to wire correctly"

patterns-established:
  - "runProbeGate({loadedRelativePath, spawnError, coldResponses, timedOut}) — a thin, call-twice-safe wrapper around Plan 02-01's runEnvironmentProbes that owns computing the 4 environment-only probe inputs itself"
  - "splitMergedArgv(mergedArgv) — separates '-l NAME' pairs from a flat manifest.mergedArgv array; the shape Plan 02-04 (ORCL-03, which shares this same cold session) will also need if it ever needs to re-derive spawn argv"

requirements-completed: [ORCL-01]

# Metrics
duration: ~50min
completed: 2026-07-02
---

# Phase 2 Plan 3: ORCL-01 server-faithfulness differential Summary

**Cold-replays a captured Agda load as a fresh `agda --interaction-json Cmd_load` in an isolated temp directory and diffs the normalized classification tuple + error/warning category set against the warm capture, emitting `pass` / `server-false-green-candidate` / `INCONCLUSIVE(probe)` / `skip` — proven end-to-end against a real local Agda 2.8.0 binary, including two empirically-discovered replay-fidelity bugs fixed along the way.**

## Performance

- **Duration:** ~50 min (estimate; base commit `bdf2114` at 04:06, task commits at 04:43 and 04:46 local time — most of the wall-clock time was spent on real-Agda empirical debugging of the two fidelity bugs described below, not on writing the initial implementation)
- **Completed:** 2026-07-02T08:46:14Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (1 new script, 1 new test file, 1 modified shared script)

## Accomplishments
- Built `scripts/oracle/orcl-01-differential.mjs`: `materializeCaptureEnvironment()` (faithful, path-traversal-safe source + AGDA_DIR replay into a fresh temp dir), `runProbeGate()` (the 7-probe environment gate wired from real artifact/materialized data), `findWarmLoadTuple()`/`categorySet()`/`extractErrorCategory()` (warm-side extraction + diagnostic-tag normalization), `runColdLoadAndDiff()` (the actual cold `Cmd_load` + tuple/category-set diff), `judgeOrcl01()` (the standalone-runnable predicate), and a CLI entry point.
- Proved ORCL-01 end-to-end against a real local Agda 2.8.0 binary: a faithful replay of a clean load reports `pass`; a forged warm `ok-complete` over a genuinely cold-failing load reports `server-false-green-candidate` carrying both full tuples; a deliberately mismatched `manifest.agdaVersion` reports `INCONCLUSIVE(version)` naming the probe, never "server bug".
- Resolved RESEARCH.md Open Question 2 with a direct empirical test: `inlineFirstPartySources()` for a project containing an `.agda-lib` file never includes that `.agda-lib` in its output, and the materialized replay directory built from those sources likewise never contains one anywhere under it.
- Discovered and fixed two genuine, general (not project-specific) replay-fidelity bugs during real-Agda verification — see Deviations below. Without these fixes, ORCL-01 would emit a false `server-false-green-candidate` for essentially any captured artifact from a project with a registered project-local `.agda-lib` (a routine scenario, not an edge case — this repo's own `test/fixtures/agda/test-fixtures.agda-lib` triggered it immediately).

## Task Commits

Each task was committed atomically:

1. **Task 1: Materialize the captured environment + replay library registration + run the probe gate** - `0b63b6a` (feat)
2. **Task 2: Cold Cmd_load + normalized tuple/category-set diff + judgeOrcl01() + CLI** - `b99c988` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `scripts/oracle/orcl-01-differential.mjs` - new: the complete ORCL-01 differential (see Accomplishments)
- `test/unit/tools/oracle-orcl-01.test.ts` - new: 10 tests (5 pure/filesystem-only from Task 1, 5 from Task 2 — 3 `RUN_AGDA_INTEGRATION`-gated against real Agda, 2 pure)
- `scripts/oracle/cold-agda-session.mjs` - modified: `spawnColdAgdaSession()` gained an optional `extraSpawnArgs` parameter (default `[]`, fully backward compatible — Wave 1's own 13 tests still pass unchanged)

## Decisions Made
- **`-l NAME` library flags replay as cold-spawn argv, never as part of `Cmd_load`'s own option list.** `manifest.mergedArgv` (built in Phase 1) deliberately mixes spawn-time `-l` flags with `Cmd_load`-time flags into one flat array for the manifest's own record-keeping purposes. `scripts/verify-cold-replay.mjs` (Phase 1's seed script) and this phase's own `02-RESEARCH.md` code example both treat that flat array as Cmd_load's whole option list — empirically this is wrong: the live server only ever dispatches `-l` at process-spawn time (`agda-process-spawn.ts`), never through `Cmd_load`'s per-call option list, and replaying it the wrong way produces a spurious library-resolution error attributed to the wrong logical command. `splitMergedArgv()` restores the split; the `-l` pairs feed `spawnColdAgdaSession`'s new `extraSpawnArgs`, the rest feed `Cmd_load`'s own option list.
- **A priming `Cmd_show_version` round trip runs immediately after every cold spawn, before the real `Cmd_load`.** Once `-l` flags are (correctly) spawn-time argv again, Agda's own process-startup output (specifically, its attempt to resolve those libraries) arrives asynchronously, shortly after spawn but before any deliberate stdin write — whichever `sendCommand()` happens to be in flight when that line arrives absorbs it. `AgdaSession` avoids this exact problem by always running `Cmd_show_version` as its own first command on a fresh process (`agda-version-detection.ts`'s `preflightVersionDetection`); this priming step reproduces that same shape for the cold replay so the real `Cmd_load`'s response stream is never contaminated by unrelated startup noise. The response is discarded — the version *probe* itself is still driven by the plan-mandated `execFileSync` check, exactly as specified.
- **`runProbeGate()` recomputes its own environment-only probe inputs on every call** (the `execFileSync` version check, `_build` freshness, closure-hash) rather than requiring the caller to precompute them once and thread them through — this makes the pre-spawn/post-spawn two-call pattern (checking a different probe subset each time) trivial and self-consistent, at the cost of a second (cheap, local) `execFileSync`/hash computation per replay — a non-issue for an offline batch oracle tool (D-04).
- **Normalizing cold responses via `normalizeAgdaResponse` before `parseLoadResponses`.** The plan's action text called `parseLoadResponses` directly on the raw cold response array; the live server always normalizes each response immediately after `JSON.parse` (`src/session/agda-transport.ts`) before any load logic sees it, so the warm side's captured classification was always computed from normalized responses. Applying the same normalization to the cold side keeps both halves of the diff comparing like for like.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `-l` library flags misrouted through `Cmd_load`'s own option list produce a false server-false-green-candidate**
- **Found during:** Task 2, real-Agda verification of the "pass" test case (a project-local `.agda-lib`-registered fixture directory, `test/fixtures/agda/`)
- **Issue:** Following the plan's literal action text (and `verify-cold-replay.mjs`'s/`02-RESEARCH.md`'s prior art) of passing the whole `manifest.mergedArgv` as `Cmd_load`'s own option list caused a real cold `agda --interaction-json` process to emit `error: [LibraryError]\nLibrary 'test-fixtures' not found...` as part of the `Cmd_load` response, flipping `success` to `false` and the classification to `type-error` — even though the loaded file (`CompleteFixture.agda`) type-checks cleanly and needs nothing from that library. Confirmed via direct empirical testing (isolated `spawn()` scripts, with and without `AGDA_MCP_DEBUG=1` trace logging) that this reproduces identically against the exact code path `agda-process-spawn.ts` uses for the live server — it is not specific to this machine's nix-packaged Agda binary (whose wrapper hardcodes `--library-file=<nix-store path>`, which is what makes the failure *visible* here, but the underlying spawn-time-vs-command-time distinction for `-l` is a general Agda protocol property).
- **Fix:** Added `splitMergedArgv()` to `orcl-01-differential.mjs`, separating `-l NAME` pairs out of `mergedArgv` into `libraryFlags` (fed to the cold spawn's own argv) and `remainingFlags` (fed to `Cmd_load`'s own option list, matching `lastDispatchedLoadArgv`'s true semantics). This required extending `scripts/oracle/cold-agda-session.mjs`'s `spawnColdAgdaSession()` with a new optional `extraSpawnArgs` parameter (default `[]`) — a minimal, additive, fully backward-compatible change (Wave 1's own 13 tests, including the 1 real-Agda-gated test, still pass unmodified).
- **Files modified:** `scripts/oracle/orcl-01-differential.mjs`, `scripts/oracle/cold-agda-session.mjs`
- **Verification:** `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-orcl-01.test.ts` — the "pass" test now genuinely passes against real Agda; re-ran 3 times to rule out flakiness (identical result each time). `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-cold-agda-session.test.ts` (Wave 1's own suite) still passes unchanged.
- **Committed in:** `b99c988` (Task 2 commit)

**2. [Rule 1 - Bug] Process-startup noise misattributed to the first in-flight command**
- **Found during:** Same investigation as #1, immediately after fixing the `-l`-flag routing
- **Issue:** With `-l` flags correctly moved to spawn-time argv, Agda's own process-startup output (its own attempt to resolve those libraries, now happening at spawn instead of at `Cmd_load` time) still landed in whichever `sendCommand()` call was in flight — which, with no priming step, was the real `Cmd_load` itself, reproducing the same false failure via a different path. Confirmed via a timestamped raw-buffer capture that this startup output arrives ~80ms after spawn, well before any deliberate stdin write, and that `AgdaSession` avoids this exact failure mode by always sending `Cmd_show_version` as its first command on a fresh process.
- **Fix:** `runColdLoadAndDiff()` now sends a priming `iotcmEnvelope(materializedPath, topLevelCommand("Cmd_show_version"))` round trip immediately after spawning, discarding the response, before issuing the real `Cmd_load`.
- **Files modified:** `scripts/oracle/orcl-01-differential.mjs`
- **Verification:** Same as #1 — the combined fix (routing + priming) makes the "pass" test pass reliably; without the priming step alone (library flags correctly split but no priming), the same false `server-false-green-candidate` reproduced, confirming both fixes were independently necessary.
- **Committed in:** `b99c988` (Task 2 commit)

**3. [Rule 2 - Missing coverage] Reworded two doc comments to avoid the literal string `createLibraryRegistration`**
- **Found during:** Task 1/2 acceptance-criteria self-check (`grep -c "createLibraryRegistration" scripts/oracle/orcl-01-differential.mjs` must be `0`)
- **Issue:** Explanatory doc comments referenced `createLibraryRegistration` by name (to document why it must never be called) — the mechanical grep check doesn't distinguish comments from code, so the literal string's presence at all would fail the acceptance criterion even though the function is never imported or called.
- **Fix:** Reworded both comments to describe the function by its role ("`library-registration.ts`'s own non-deterministic per-call registration minter") instead of its literal export name, preserving the explanation while satisfying the mechanical check.
- **Files modified:** `scripts/oracle/orcl-01-differential.mjs`
- **Verification:** `grep -c "createLibraryRegistration" scripts/oracle/orcl-01-differential.mjs` returns `0`; all 10 tests still pass after the wording change.
- **Committed in:** `0b63b6a` (Task 1 commit, before the wording was introduced) — the fix landed before Task 1's own commit, since it was caught during Task 1's own acceptance-criteria check.

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs affecting real correctness for any project with a registered `.agda-lib`, 1 Rule 2 mechanical-check wording fix)
**Impact on plan:** The two Rule 1 fixes are load-bearing for ORCL-01's actual purpose — without them, the differential would false-positive on essentially every real-world capture (this repo's own fixtures, and very likely agda-unimath, which is this milestone's primary motivating corpus, since both register a project-local `.agda-lib`). No scope creep beyond fixing what was needed for the plan's own success criteria ("`judgeOrcl01` correctly emits `pass` on a faithful cold replay") to actually hold against a real captured artifact rather than only against synthetic fixtures with no library registration.

## Issues Encountered
None beyond the two deviations documented above (both fully resolved).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02-04 (ORCL-03 conformance) can reuse `spawnColdAgdaSession`'s new `extraSpawnArgs` parameter and the `splitMergedArgv`-style argv-role split if it needs to derive spawn argv for the shared cold session (Pitfall 7: ORCL-01 and ORCL-03 are meant to share one cold session — `spawnColdAgdaSession`'s process object supports this already; `runColdLoadAndDiff` currently kills the session itself after diffing, so Plan 02-05's composition work will need to thread a "don't kill yet" option through if it wants ORCL-03 to run `Cmd_infer_toplevel` against the SAME still-open process rather than a second spawn).
- Plan 02-05 (verdict composition) can call `judgeOrcl01(artifactPath)` directly — it returns exactly the D-02 schema's ORCL-01 outcome shape (`pass` / `server-false-green-candidate` / `inconclusive(probe)` / `skip`).
- No blockers. `npm test` is green (173 test files / 1427 tests passed, 12 files / 164 tests skipped — all Agda-integration-gated, expected without `RUN_AGDA_INTEGRATION=1`); zero regressions introduced. `RUN_AGDA_INTEGRATION=1` re-run across `test/unit/tools/`, `test/unit/agda/`, and this plan's own test file all green.

---
*Phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Completed: 2026-07-02*

## Self-Check: PASSED

- All 3 claimed source files verified present on disk (`scripts/oracle/orcl-01-differential.mjs`, `test/unit/tools/oracle-orcl-01.test.ts`, `scripts/oracle/cold-agda-session.mjs`) plus this SUMMARY.md.
- Both commit hashes (`0b63b6a`, `b99c988`) verified present in `git log --oneline --all`.
