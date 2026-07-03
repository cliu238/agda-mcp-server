---
phase: 03-regression-lock-pipeline
plan: 03
subsystem: testing
tags: [regression-matrix, mcp-harness, vitest, test-fails, oracle-triad, false-green, capture-replay]

# Dependency graph
requires:
  - phase: 03-regression-lock-pipeline (Plan 02)
    provides: "replayCaptureRegressionEntry (test/helpers/capture-regression-runner.ts) + the complete emitter (scripts/emit-regression.mjs: judgeRefusal, materializeFixtureFiles, composeEntry, writeMatrixEntry, matchesExpected, scriptMain)"
  - phase: 03-regression-lock-pipeline (Plan 01)
    provides: "capture-regression matrix typed contract (test/fixtures/capture-regression-matrix.{ts,json}) + the stagedFileSequence collision fix in register-capture-session.ts"
  - phase: 02-the-oracle-triad
    provides: "runOracle/composeVerdict verdict + findWarmLoadTuple/categorySet (scripts/oracle/*.mjs) — the fresh ORCL-01/02/03 judgment the emitter's refusal gate reads"
provides:
  - "The ONE generic capture-regression vitest runner (test/integration/mcp/capture-regression.test.ts) — iterates the matrix, test.fails for red/plain test for locked, imports matchesExpected from the emitter (Warning-2 anti-drift fix)"
  - "The #64/#61 transitive-staleness false-green flagship: a REAL end-to-end capture -> oracle -> emit proof, not a synthetic bundle — the phase's single closed-loop demonstration (LOCK-03)"
  - "The flagship fixture trio (test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda) + its one matrix entry (status: red)"
  - "vitest.config.ts passWithNoTests:true — lets a data-driven matrix runner legitimately register zero tests without failing the suite"
affects: ["03.1-fix-the-64-61-transitive-staleness-false-green-and-flip-the-", "04-fix-queue"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-driven matrix runner with zero required static tests: a for-loop over a typed matrix array is the ENTIRE test file body; vitest 4's passWithNoTests config (not a per-file sentinel test) keeps a legitimately-empty matrix green"
    - "Throwaway rehearsal driver (scratchpad, never committed): drives createMcpHarness twice in one session to capture a REAL baseline + REAL false-green artifact via agda_capture_session, then feeds both stagedPaths into the emitter CLI verbatim — no hand-built synthetic bundle anywhere in the committed history"

key-files:
  created:
    - test/integration/mcp/capture-regression.test.ts
    - test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda
    - test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.agda
    - test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.broken.agda
  modified:
    - test/fixtures/capture-regression-matrix.json
    - vitest.config.ts

key-decisions:
  - "vitest.config.ts gets passWithNoTests:true rather than a hand-added static sentinel test in the runner file — keeps the runner file a PURE data-driven loop (D-01's 'one generic runner' intent) with no per-file authored assertion outside the matrix"
  - "Throwaway driver script canonicalizes (realpathSync) its own mkdtempSync projectRoot before passing it to createMcpHarness, working around a pre-existing session.repoRoot-vs-realpath'd-currentFile mismatch entirely inside the (uncommitted) driver — no src/ change, preserving this plan's 'never touches the load path' boundary"

patterns-established:
  - "Flagship rehearsal recipe (reusable for future LOCK-03-style captures): mkdtempSync -> realpathSync -> two agda_load_no_metas/agda_capture_session round trips in ONE createMcpHarness session -> feed both real stagedPaths to scripts/emit-regression.mjs's CLI verbatim"

requirements-completed: [REPRO-01, LOCK-01, LOCK-03]

# Metrics
duration: 24min
completed: 2026-07-02
---

# Phase 3 Plan 3: Generic Replay Runner + the #64/#61 Flagship Lock Summary

**The ONE generic capture-regression vitest runner plus a REAL, end-to-end (capture → oracle → emit) `test.fails`-protected regression for the #64/#61 `agda_load_no_metas` transitive-staleness false-green — driven through a live MCP session and the actually-shipped emitter, never a hand-built bundle.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-07-02T14:14:00Z (approx.)
- **Completed:** 2026-07-02T14:37:21Z
- **Tasks:** 2 completed
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- **Generic replay runner (D-01, D-04):** `test/integration/mcp/capture-regression.test.ts` iterates `captureRegressionMatrix`, replays each entry via Plan 03-02's `replayCaptureRegressionEntry`, and asserts the observed result against `entry.expected` using the emitter's own `matchesExpected` (imported, never re-implemented — Warning-2 anti-drift fix). `status:"red"` entries run as `test.fails`; `status:"locked"` entries would run as plain `test`.
- **The #64/#61 flagship, captured for real (D-09 part 1, LOCK-03):** drove ONE real `createMcpHarness` MCP session through the empirically-verified trigger sequence (03-RESEARCH.md) — warm-loaded the two-file `FixtureDeps/TransitiveStaleness/{Main,Dep}.agda` fixture under `AGDA_MCP_IDLE_COMPLETION_MS=1` / `AGDA_MCP_POST_STATUS_IDLE_MS=1` / `AGDA_MCP_CAPTURE=1`, captured the healthy baseline via `agda_capture_session`, overwrote `Dep.agda` out-of-band with a signature-only change (`Nat` → `Bool`), reloaded in the SAME warm session (`ok-complete`/`success:true` — the false green, reproduced deterministically), and captured that too.
- **Real emitter run (LOCK-02 pipeline, exercised end-to-end):** `scripts/emit-regression.mjs` ran a fresh `runOracle` (`orcl01=server-false-green-candidate`, `orcl02=clean`, `trueGreen=false`), passed the refusal gate, materialized the fixture trio into the tracked `test/fixtures/agda/FixtureDeps/TransitiveStaleness/` tree with bare (non-`fixtureDir`-prefixed) `entryFile`/`mutation` fields, composed + validated the matrix entry, self-checked RED, and appended the ONE matrix entry — closing the loop this whole phase exists to prove.
- **Confirmed RED, concretely:** `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` → 1 test file passed, 1 "expected fail" (the `test.fails`-wrapped flagship's inner assertion currently fails against the live, unfixed `runLoadNoMetas` — exactly the from-RED proof LOCK-03 requires). Full suite (`RUN_AGDA_INTEGRATION=1 npx vitest run`, no path filter): 188 test files passed / 4 skipped, 1636 tests passed / 1 expected fail / 5 skipped, exit 0.
- **`src/` untouched:** `git diff --stat b6c709c HEAD -- src/` is empty across both tasks — this plan never fixes `runLoadNoMetas` (Phase 3.1's job, D-09 part 2).

## Task Commits

Each task was committed atomically:

1. **Task 1: Generic capture-regression replay runner** - `547ec70` (feat)
2. **Task 2: Flagship end-to-end proof — capture, emit, and verify the #64/#61 RED lock** - `26fdf50` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `test/integration/mcp/capture-regression.test.ts` - the one generic runner: gates on `RUN_AGDA_INTEGRATION=1` + `detectAgdaVersion()`, loops `captureRegressionMatrix`, `test.fails` for `red`/`test` for `locked`, asserts via the shared `matchesExpected` (45 lines)
- `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda` - flagship fixture, the importing module (fully-dotted `module FixtureDeps.TransitiveStaleness.Main`)
- `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.agda` - flagship fixture, the healthy transitive dependency (replay's baseline state, `getValue : Nat`)
- `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.broken.agda` - flagship fixture, the mutation payload spliced over `Dep.agda` mid-replay (`getValue : Bool`) — same module name as `Dep.agda` by design (see Forward-Compat Note below)
- `test/fixtures/capture-regression-matrix.json` - now contains exactly one entry, `id: "issue-64-61-transitive-staleness"`, `status: "red"`, `expected` copied verbatim from ORCL-01's real cold-replay tuple (`type-error`/`success:false`/`errorCategories:["UnequalTerms"]`)
- `vitest.config.ts` - added `passWithNoTests: true` (see Deviations)

## Decisions Made

- Kept `test/integration/mcp/capture-regression.test.ts` as a PURE data-driven loop with no static sentinel test — the "zero entries is a valid, green, zero-test run" requirement is satisfied via `vitest.config.ts`'s `passWithNoTests`, not by diluting the runner with an extra always-passing assertion.
- The throwaway rehearsal driver (session scratchpad, deleted before returning) canonicalizes its own `mkdtempSync` root via `realpathSync` before handing it to `createMcpHarness` as `projectRoot` — see Deviations/Issues for why this was necessary and why it stayed entirely out of the committed diff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vitest.config.ts` needs `passWithNoTests: true` for the empty-matrix state to actually be green**
- **Found during:** Task 1 (running the plan's own literal verify command)
- **Issue:** The plan's acceptance criteria assumes `npx vitest run test/integration/mcp/capture-regression.test.ts` exits 0 with 0 tests when the matrix is empty. Empirically, installed vitest 4.1.2 treats a test file that registers zero `test()` calls as a hard failure ("No test suite found in file ...", exit 1) unless `passWithNoTests` is set — confirmed by reading `@vitest/runner/dist/chunk-artifact.js`'s `runFiles()` (`if (!file.tasks.length && !runner.config.passWithNoTests) { ...error... }`). This directly contradicts the plan's own `must_haves.truths`: "zero entries is a valid, green, zero-test run."
- **Fix:** Added `passWithNoTests: true` to `vitest.config.ts`'s `test` block, with an inline comment explaining why. No other file in the suite currently reaches zero collected tasks (every other gated integration test still registers `test.skip(...)` tasks even without `RUN_AGDA_INTEGRATION=1`), so this only changes behavior for the legitimately-empty-matrix case this phase's own design anticipates.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run test/integration/mcp/capture-regression.test.ts` and the same with `RUN_AGDA_INTEGRATION=1` both exit 0 with "no tests" before Task 2 populated the matrix; full suite run (`RUN_AGDA_INTEGRATION=1 npx vitest run`) after Task 2 is fully green (188 files / 1636 tests passed, 1 expected fail, 0 failed).
- **Committed in:** `547ec70` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking test-infra config gap)
**Impact on plan:** Config-only, additive, scoped to the exact "empty matrix" edge case this phase's own requirements describe. No behavior change for any other test file in the suite (verified via a full `RUN_AGDA_INTEGRATION=1` suite run, 0 unexpected failures). No scope creep.

## Issues Encountered

- **macOS symlink mismatch silently empties `inlinedFirstPartySources`/`importClosureHash` (pre-existing latent gap, worked around in the throwaway driver only — nothing committed):** The first flagship rehearsal attempt (before any workaround) produced two REAL, correctly-classified captures (`ok-complete` baseline, `ok-complete`/false-green primary — the trigger sequence itself worked immediately, 1/1), but both artifacts' `manifest.inlinedFirstPartySources` came back `[]`. Root cause: `os.tmpdir()` on macOS returns a path under `/var/folders/...`, itself a symlink to `/private/var/folders/...`. `AgdaSession.repoRoot` (`src/agda/session.ts:180`) stores whatever raw path it is constructed with (never realpathed), while `agda_load_no_metas` resolves the loaded file's absolute path via `resolveExistingPathWithinRoot` (`src/repo-root.ts:82-95`), which DOES realpath. With a non-canonical `projectRoot`, `session.repoRoot` and `session.currentFile` disagree on the canonical prefix, so `computeImpact`'s `relative(projectRoot, absPath)` lookup in `buildImportGraph` (`src/agda/import-graph.ts:298-303`) never finds the loaded module in the graph, and `closureFileSet`/`inlineFirstPartySources` silently return `[]`/`null` rather than throwing. This is the SAME class of asymmetry `src/agda/agdai-cache.ts` and `src/tools/impact-tool.ts` already carry defensive comments about (`"keys built from realpath(repoRoot) won't match"`) — not a newly-introduced bug, but a previously-undocumented instance of it specifically affecting `agda_capture_session`'s manifest builder.
  - **Workaround applied (throwaway driver only, never committed, no `src/` change):** the rehearsal driver calls `realpathSync()` on its own `mkdtempSync` root before passing it as `createMcpHarness`'s `projectRoot`. Re-running the rehearsal with this one-line change produced both artifacts with correctly-populated `inlinedFirstPartySources` (both `FixtureDeps/TransitiveStaleness/{Dep,Main}.agda`, with the expected differing `Dep.agda` content between baseline and primary), and the emitter's `materializeFixtureFiles` then worked exactly as designed.
  - **Not fixed in `src/`:** doing so would mean canonicalizing `session.repoRoot` (or every call site currently working around the asymmetry piecemeal) — a cross-cutting change well outside this plan's declared file list and its explicit "never touches the load path" boundary (`git diff --stat -- src/` must stay empty).
  - **Flagging for Phase 4 queue intake:** `agda_capture_session`'s manifest can silently produce an artifact with an empty `inlinedFirstPartySources`/`null` `importClosureHash` whenever the server's project root is reached through a symlink (the macOS-default case for any scratch/temp directory, and plausibly for any project checked out under a symlinked path more generally) — with no diagnostic or warning surfaced to the caller. This is a genuine, previously-unflagged candidate defect surfaced by this phase's own dogfooding-style rehearsal, distinct from the #64/#61 defect itself and from the existing CHG-REVERIFY candidate list. Recommend Phase 4 intake re-verify and consider a `agda_capture_session` diagnostic (e.g. a warning when `inlinedFirstPartySources` is empty but a file IS loaded) as a Rule-2-style hardening candidate.
- **Vitest reporter wording nuance (no functional gap):** the plan's acceptance criteria says the flagship run should show "1 passed"; installed vitest 4.1.2's reporter instead labels a passing `test.fails` case "1 expected fail" (with a green checkmark, `Test Files 1 passed (1)`). Functionally identical — confirmed via `--reporter=verbose` showing a green `✓` against the flagship's test name — just a difference in vitest's own summary line wording, not a discrepancy in behavior.

## Forward-Compat Note (per plan instruction, no code change needed this phase)

`Dep.broken.agda` deliberately declares the SAME module name as `Dep.agda` (`module FixtureDeps.TransitiveStaleness.Dep where`) because the replay runner's mutation step overwrites `Dep.agda`'s file CONTENT with `Dep.broken.agda`'s content in place — the swapped-in content's module name must match what `Main.agda`'s `open import` expects, so the shared module name is correct and required, not a bug. This does mean a future broad `buildImportGraph`/ORCL-02 scan that recursively walks the ENTIRE `test/fixtures/agda/` tree would find two files declaring the same module name — not a Phase-3 threat today since no current test performs such a scan, and the RED mechanism here never depends on `buildImportGraph`/module-name uniqueness, only on path-based file content swapping.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 3.1** has a concrete, currently-RED `test.fails` regression (`issue-64-61-transitive-staleness`) to flip GREEN by extending `runLoadNoMetas` (`src/agda/session-load-impl.ts`) with a terminus-tracking guard mirroring `runLoad`'s existing `awaitGoalTerminus` mechanism (per 03-RESEARCH.md's own root-cause analysis) — then promoting the matrix entry's `status` from `"red"` to `"locked"` (one-line edit).
- **Phase 4 queue** gains one additional candidate defect beyond the existing CHG-REVERIFY list: `agda_capture_session`'s manifest silently loses `inlinedFirstPartySources`/`importClosureHash` under a symlinked project root (see Issues Encountered) — worth a re-verification pass and a possible diagnostic-on-empty-closure hardening.
- No blockers for Phase 3.1 or Phase 4 identified beyond the above.

---
*Phase: 03-regression-lock-pipeline*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk (`test/integration/mcp/capture-regression.test.ts`, `test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda`, `test/fixtures/capture-regression-matrix.json`, `vitest.config.ts`) plus this SUMMARY; both task commits (`547ec70`, `26fdf50`) confirmed present in `git log`. `RUN_AGDA_INTEGRATION=1 npx vitest run` (full suite) is green: 188 test files passed / 4 skipped, 1636 tests passed / 1 expected fail / 5 skipped, exit 0. `git diff --stat b6c709c HEAD -- src/` is empty.
