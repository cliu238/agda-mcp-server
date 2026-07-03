---
phase: 03-regression-lock-pipeline
verified: 2026-07-02T17:40:22Z
status: passed
score: 4/4 roadmap success criteria verified; 20/20 plan-level must-have truths verified
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
---

# Phase 3: Regression Lock Pipeline Verification Report

**Phase Goal:** A captured defect becomes a minimal reproduction and a durable vitest regression that starts RED, asserts the oracle's correct behavior on the normalized envelope, and turns green only when fixed — proven end-to-end on the #64/#61 false-green.
**Verified:** 2026-07-02T17:40:22Z
**Status:** passed
**Re-verification:** No — initial verification

**Note on ROADMAP `Mode: mvp` annotation:** ROADMAP.md tags this phase (and Phases 1/2) `Mode: mvp`, but the phase goal text is not in User Story format — `gsd-sdk query user-story.validate --story "..." --pick valid` returns `false` against it — and all 3 plans/summaries use the traditional `must_haves: {truths, artifacts, key_links}` structure, not MVP-mode user-flow steps. This is consistent with how Phases 1 and 2 were verified (`01-VERIFICATION.md`, `02-VERIFICATION.md` both note the identical situation and apply standard goal-backward verification). Standard goal-backward verification was applied here for consistency. Informational only, not a gap.

## Methodology

This report combines: (a) reading all 3 PLAN.md/SUMMARY.md pairs and 03-CONTEXT.md's locked decisions (D-01..D-10); (b) reading every artifact's actual source in full (`scripts/emit-regression.mjs`, `test/helpers/capture-regression-runner.ts`, `test/integration/mcp/capture-regression.test.ts`, the matrix `.ts`/`.json`, the flagship fixture trio, `src/tools/register-capture-session.ts`); (c) independently running the test suite (`npm test`: 1471 passed/173 skipped, matches SUMMARY's claim exactly) and the RUN_AGDA_INTEGRATION-gated flagship integration test against a real local Agda 2.8.0 binary (`/Users/eric/.nix-profile/bin/agda`); (d) **independently reproducing the defect myself, twice, outside of any test framework** — a raw cold `agda --no-libraries` batch compile of the exact fixture pair (bypassing the MCP server and the emitter entirely) to confirm the "expected" (correct) value is real, and a standalone `tsx` probe script that calls the shipped `replayCaptureRegressionEntry` directly to print the live server's actual "observed" tuple; (e) verifying `git diff --stat` across the phase's full commit span for `src/` to confirm the D-09 boundary (this phase never touches the actual defect) held; (f) reading the code-review artifacts (`03-REVIEW.md`, `03-REVIEW.iter2.md`, `03-REVIEW-FIX.md`) and independently confirming their claimed fixes are present in the current code, not just claimed.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REPRO-01: A captured defect yields a minimal reproduction — offending source snapshotted into a fixture plus the recorded trigger sequence — deterministically re-triggerable | VERIFIED | `test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda` — 3 files, 8-11 lines each, no filler content. The "trigger sequence" is the matrix entry's `mutation: {targetFile:"Dep.agda", sourceFile:"Dep.broken.agda"}`, replayed by `replayCaptureRegressionEntry` (load `entryFile` warm → overwrite `targetFile` with `sourceFile`'s content → reload). **I personally re-triggered this twice, independently of all shipped tooling**: (1) a bare `agda --no-libraries` cold batch compile of the fixture pair with the broken `Dep.agda` produced `error: [UnequalTerms] Bool !=< Nat` (exit 42) — proving the fixture is real and the "expected" value in the matrix is not invented; (2) a standalone `tsx` script calling `replayCaptureRegressionEntry` directly against the real fixtures + a real live MCP harness printed `observed: {classification:"ok-complete", success:true, errorCategories:[]}` vs `expected: {classification:"type-error", ..., errorCategories:["UnequalTerms"]}` — the live server really does report the false green when replayed. |
| 2 | LOCK-01: Fixture materialization writes the minimal `.agda` repro under `test/fixtures/agda/` with automated placement + naming, mirroring #65/#66 | VERIFIED | `scripts/emit-regression.mjs`'s `materializeFixtureFiles`/`writeFixtureFile` (lines 118-233) writes into `test/fixtures/agda/<fixtureDir>/<barePath>` automatically (no hand-authored paths) — confirmed by the git history: commit `26fdf50` shows the 3 `.agda` files and the matrix entry added together, produced by running the emitter's CLI, not hand-typed. Placement follows the existing `FixtureDeps/`-subdirectory, PascalCase, fully-dotted-module-name convention identical to sibling `test/fixtures/agda/FixtureDeps/{Transitive,Chain}/*.agda`. Naming: `insertBrokenSuffix` produces `Dep.broken.agda` from `Dep.agda` mechanically. |
| 3 | LOCK-02: The emitter turns a captured bundle + fixture into a durable vitest test that starts RED, asserts correct behavior via ORCL-01's cold result, asserts on the normalized envelope (not wire order/timing); refuses to lock a capture that fails ORCL-02 or is ORCL-01 INCONCLUSIVE | VERIFIED | `judgeRefusal` (`scripts/emit-regression.mjs:52-77`) refuses on `orcl01.kind==="inconclusive"`, `orcl02.kind==="cheat-flagged"`, `orcl02.kind==="no-policy"` with findings, and (fail-closed, CR-02) on a coldTuple-less `--force`. `composeEntry` copies `verdict.orcl01.coldTuple`/`coldCategories` **verbatim** into `expected` — confirmed by direct code read (lines 250-281), no transformation. The matrix schema's `expected` object is exactly the D-03 normalized tuple (`classification, success, goalCount, invisibleGoalCount, hasHoles, errorCategories`) — schema-enforced via zod in `capture-regression-matrix.ts`, no raw-text field exists. D-05's RED self-check (`scriptMain` step (d)) replays via the shared helper and rolls back+refuses if the entry would already be green — code confirmed present and unit-tested (`emit-regression.test.ts` Tests H-K). |
| 4 | LOCK-03: The #64/#61 transitive-staleness/false-green defect is produced through the emitter as a from-RED test + fixture that goes green only when fixed — proving the scaffold works end-to-end | VERIFIED | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` — I ran this myself: **1 test file passed, 1 test passed**, verbose name `issue-64-61-transitive-staleness: agda_load_no_metas does NOT yet match ORCL-01 cold expected value`. The matrix has exactly 1 entry (`status:"red"`), and my standalone probe (above) confirms the live server's replayed observed tuple genuinely differs from the cold/correct expected tuple — this is a real, live, currently-unfixed defect, not a synthetic assertion. `git diff --stat 33ee3ec..HEAD -- src/` shows only `src/tools/register-capture-session.ts` (+16/-1, the collision + WR-03 UUID fix) — `src/agda/session-load-impl.ts` (the actual `runLoadNoMetas` defect) is untouched, confirming D-09 part 2 (Phase 3.1's job, not this phase's). |

**Score:** 4/4 ROADMAP success criteria verified.

### Plan-Level Must-Haves Detail

All 20 granular `must_haves.truths` across the 3 plans, checked individually (not blanket-passed):

| # | Plan | Truth (abbreviated) | Status | Evidence |
|---|------|---------------------|--------|----------|
| 1 | 03-01 | Two same-session, same-fingerprint captures never collide on `stagedPath`; both durably readable | VERIFIED | `register-capture-session.ts:57,179-182`: `stagedFileSequence++` + `randomUUID()` in filename. Ran `test/unit/tools/register-capture-session.test.ts` myself — 3 tests pass, including the collision test asserting `stagedPath` divergence + both files readable + differing `capturedAt`. |
| 2 | 03-01 | Matrix loads through zod-validated typed loader (release-bug-matrix.ts idiom); malformed entry rejected at load | VERIFIED | `capture-regression-matrix.ts:39-65` — `captureRegressionEntrySchema` (zod) + `loadValidatedJsonData(import.meta.dirname, "./capture-regression-matrix.json", z.array(...))`, identical idiom to `release-bug-matrix.ts`. |
| 3 | 03-01 | `expected` object is exactly D-03's normalized tuple + category set, schema-enforced | VERIFIED | `expectedResultSchema` (`capture-regression-matrix.ts:30-37`): `classification, success, goalCount, invisibleGoalCount, hasHoles, errorCategories` — no raw-text/timing field exists in the schema. |
| 4 | 03-01 | `serverEnv`/`mutation` are additive-only — never touch Phase-1 ReplayManifest or Phase-2 verdict schema | VERIFIED | `git diff --stat 33ee3ec..HEAD -- src/agda/session-capture/artifact-types.ts scripts/oracle/verdict-schema.mjs` is empty — neither file was touched anywhere in the phase. |
| 5 | 03-01 | REPRO-01's "still reproduces" predicate reuses Phase-2's `judgeOrcl01`/`runColdLoadAndDiff` — no new trimming heuristic/ddmin script built | VERIFIED | `grep -i "ddmin\|minimiz"` across all phase-3 files returns nothing. `emit-regression.mjs` imports `runOracle`/`findWarmLoadTuple` from `scripts/oracle/*.mjs` (Phase 2's own modules) rather than reimplementing the differential. |
| 6 | 03-02 | ONE shared replay function drives the MCP boundary; emitter's D-05 self-check AND Wave-3 runner both call it | VERIFIED | `scripts/emit-regression.mjs:36` imports `replayCaptureRegressionEntry` from `test/helpers/capture-regression-runner.ts`; `test/integration/mcp/capture-regression.test.ts:33` imports the identical function. Single implementation, confirmed by direct read of both files. |
| 7 | 03-02 | Emitter refuses on ORCL-01 inconclusive / ORCL-02 cheat-flagged / ORCL-02 no-policy+findings; refusals exit non-zero naming the predicate | VERIFIED | `judgeRefusal` (lines 52-77) implements exactly these branches, each returning a reason string naming the failing predicate; `scriptMain` sets `process.exitCode = 1` and writes the reason to stderr on refusal (lines 426-430). |
| 8 | 03-02 | Emitter never golden-masters an already-matching capture; D-05 self-check runs before matrix write, rolls back materialized files on a non-RED result | VERIFIED | `scriptMain` steps (d)/(e) (lines 448-472): calls `matchesExpected(observed, entry.expected)`, rolls back via `rollbackWrittenFiles(writtenFiles)` and refuses (exit 1) if `true`, before ever reaching `writeMatrixEntry`. |
| 9 | 03-02 | Fixture writes into tracked `test/fixtures/agda/` are path-sandboxed via `resolveFileWithinRoot`/`PathSandboxError` (D-08, new containment site) | VERIFIED | `writeFixtureFile` (lines 128-151): `resolveFileWithinRoot(fixturesRoot, fixtureDir)` then `resolveFileWithinRoot(fixtureBase, barePath)`, catching `PathSandboxError` and skipping (never writing) an escaping path. This is the CR-01-fixed version (sandboxed against `test/fixtures/agda/`, not the whole repoRoot — confirmed via `03-REVIEW.iter2.md`'s independent probe and my own read of the current code, which matches the fixed shape, not the original vulnerable one). |
| 10 | 03-02 | Emitter emits data (matrix entry), never a per-defect `.test.ts`; `expected` copied verbatim from ORCL-01's cold tuple/categories | VERIFIED | `composeEntry` (lines 250-281) builds a plain object, validated via `captureRegressionEntrySchema.parse`, with `expected` fields assigned directly from `cold.classification`/`cold.success`/etc. — no code-generation anywhere in the emitter. |
| 11 | 03-02 | `entryFile`/`mutation.*` derived as BARE paths even when captured `inlinedFirstPartySources[].path` is fixtureDir-prefixed (the real flagship shape) | VERIFIED | `stripFixtureDirPrefix` (lines 94-99) + Test G2 in `emit-regression.test.ts` (synthetic fixtureDir-prefixed shape). **Empirically confirmed against the REAL flagship artifact**, not just the synthetic test: `test/fixtures/capture-regression-matrix.json`'s live entry has `entryFile:"Main.agda"`, `mutation.targetFile:"Dep.agda"`, `mutation.sourceFile:"Dep.broken.agda"` — all bare (no `/`), and `test ! -d test/fixtures/agda/FixtureDeps/TransitiveStaleness/FixtureDeps` confirms no doubled nesting. |
| 12 | 03-02 | `matchesExpected` exported from the emitter, reused verbatim by Wave-3's runner (no independent drift) | VERIFIED | `scripts/emit-regression.mjs:321` exports `matchesExpected`; `test/integration/mcp/capture-regression.test.ts:36` imports it from `../../../scripts/emit-regression.mjs` — same function, not reimplemented. |
| 13 | 03-03 | Generic runner iterates whatever the matrix contains; zero entries is a valid, green, zero-test run | VERIFIED | `capture-regression.test.ts:45-55` is a pure `for` loop over `captureRegressionMatrix` with no static sentinel test. `vitest.config.ts:26` adds `passWithNoTests: true` (confirmed present) specifically so the zero-entry state (Plan 03-01's seed) stays green — this mechanism is still in place even though the matrix is now non-empty. |
| 14 | 03-03 | The #64/#61 flagship is captured through a REAL live session (two real `agda_capture_session` calls, baseline then false-green), never a hand-built bundle | VERIFIED (strong circumstantial + behavioral evidence) | Commit `26fdf50`'s message documents the exact live-session recipe (mkdtempSync → warm-load → capture baseline → out-of-band edit → warm reload → capture false-green → real emitter CLI run) and adds the fixture trio + matrix entry together in one commit, consistent with running the emitter rather than hand-typing JSON. My own independent cold-agda run reproduces the exact same `UnequalTerms` category recorded in `expected` — an implausible coincidence if hand-invented, since the category must come from a real compiler run. |
| 15 | 03-03 | The flagship's `expected` value is ORCL-01's own cold-replay tuple/categories, not invented | VERIFIED | `expected.errorCategories: ["UnequalTerms"]` / `classification: "type-error"` in `capture-regression-matrix.json` matches **exactly** what my own from-scratch `agda --no-libraries` cold compile of the identical fixture pair produced (`error: [UnequalTerms] Bool !=< Nat`). |
| 16 | 03-03 | `RUN_AGDA_INTEGRATION=1` flagship run reports the entry as a passing "from-RED" proof (originally spec'd as `test.fails`, later changed by code review) | VERIFIED (mechanism changed by a reviewed, documented fix — intent preserved) | The literal PLAN wording ("passing `test.fails`") is now stale: code review finding WR-02 replaced `test.fails` with a plain `test`/`it` asserting `matchesExpected(...) === false` structurally, specifically so a harness/infra fault fails loudly instead of being masked as an "expected failure" — a strict improvement. I ran the test myself: **1 passed**, name `...does NOT yet match ORCL-01 cold expected value` — the from-RED proof holds under the new (better) mechanism. See "Deviations" note below. |
| 17 | 03-03 | Matrix contains exactly one entry after this plan; no CHG specs/candidate defects locked here (D-10) | VERIFIED | `test/fixtures/capture-regression-matrix.json` — read directly, exactly 1 entry, `id:"issue-64-61-transitive-staleness"`. |
| 18 | 03-03 | Fixture is already minimal (2 healthy-state files, no filler); "still reproduces" reuses Phase 2's differential via ORCL-01 inside the emitter — no new heuristic | VERIFIED | `Main.agda`/`Dep.agda` are 8-11 lines each, no unused content. `grep -i "ddmin\|minimiz"` across phase-3 files: no matches. |
| 19 | 03-03 | This plan never modifies `src/agda/session-load-impl.ts` or any other `src/` load-path file (D-09 part 2) | VERIFIED | `git diff --stat 33ee3ec..HEAD -- src/` shows only `src/tools/register-capture-session.ts`. `git log --oneline 33ee3ec..HEAD -- src/` shows only 2 commits (`0a79b73` collision fix, `af34cc7` WR-03 UUID), both touching only that one file. `session-load-impl.ts` is untouched. |
| 20 | 03-03 | Flagship's `entryFile`/`mutation.*` fields are bare filenames, confirming the 03-02 BLOCKER fix holds against the REAL captured artifact | VERIFIED | Read directly from `capture-regression-matrix.json`: `"Main.agda"`, `"Dep.agda"`, `"Dep.broken.agda"` — none contain `/`. Independently re-derived via a Node one-liner (`bare.some(p=>p.includes('/'))` → exit 0). |

**Score:** 20/20 plan-level must-have truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/tools/register-capture-session.ts` | Collision-proof staged capture filenames | VERIFIED | 221 lines (well under the 500-line ceiling). Contains `stagedFileSequence` declaration (line 57) and use in the filename template (line 181), plus the WR-03 `randomUUID()` addition. |
| `test/fixtures/capture-regression-matrix.ts` | Zod-validated typed loader | VERIFIED | Exports `captureRegressionEntrySchema` and `captureRegressionMatrix`, loaded via `loadValidatedJsonData`. 65 lines. |
| `test/fixtures/capture-regression-matrix.json` | Matrix SSOT (seeded empty at 03-01, populated by 03-03) | VERIFIED | Now contains exactly 1 real entry (`issue-64-61-transitive-staleness`, `status:"red"`) — the seed-empty state was correctly superseded, per plan design. |
| `test/helpers/capture-regression-runner.ts` | Shared replay mechanics | VERIFIED, WIRED | Exports `replayCaptureRegressionEntry`. 130 lines. Imported by both `scripts/emit-regression.mjs` and `test/integration/mcp/capture-regression.test.ts`. |
| `scripts/emit-regression.mjs` | The complete emitter | VERIFIED, WIRED | Exports `judgeRefusal`, `materializeFixtureFiles`, `composeEntry`, `writeMatrixEntry`, `matchesExpected`, `scriptMain`. 495 lines. CLI entry point confirmed via `isMainModule` guard; unit-tested by 15 tests in `test/unit/tools/emit-regression.test.ts` (all pass, ran directly). |
| `test/integration/mcp/capture-regression.test.ts` | The one generic replay runner | VERIFIED, WIRED, DATA-FLOWING | 55 lines. Iterates `captureRegressionMatrix`, calls `replayCaptureRegressionEntry`, asserts via imported `matchesExpected`. Ran with `RUN_AGDA_INTEGRATION=1` against real Agda: 1 passed. |
| `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda` | Flagship fixture — importing module | VERIFIED | `module FixtureDeps.TransitiveStaleness.Main where`, fully-dotted, 11 lines. |
| `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.agda` | Flagship fixture — healthy baseline | VERIFIED | `module FixtureDeps.TransitiveStaleness.Dep where`, `getValue : Nat`, 9 lines. |
| `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.broken.agda` | Flagship fixture — mutation payload | VERIFIED | Same module name (by design, see SUMMARY's Forward-Compat note), `getValue : Bool`, 12 lines. Independently confirmed to produce a real `UnequalTerms` error when cold-compiled in place of `Dep.agda`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `test/fixtures/capture-regression-matrix.ts` | `test/helpers/json-data.ts` | `loadValidatedJsonData` | WIRED | Confirmed by direct read of both files. |
| `src/tools/register-capture-session.ts` | stagedPath construction | `stagedFileSequence` pattern | WIRED | Confirmed at lines 57, 181. |
| `scripts/emit-regression.mjs` | `scripts/oracle/run-oracle.mjs` | `runOracle(artifactPath)` import, called fresh at emit time | WIRED | Line 30 import, line 424 call (never reads a pre-existing `.verdict.json` sidecar). |
| `scripts/emit-regression.mjs` | `test/helpers/capture-regression-runner.ts` | `replayCaptureRegressionEntry` import for D-05 self-check | WIRED | Line 36 import, line 450 call. |
| `scripts/emit-regression.mjs` | `src/repo-root.ts` | `resolveFileWithinRoot` for every fixture write | WIRED | Line 33 import; used in `writeFixtureFile` (2 call sites, lines 140-141). |
| `scripts/emit-regression.mjs` | `scripts/oracle/orcl-01-differential.mjs` | `findWarmLoadTuple` import, derives bare `entryFile` | WIRED | Line 31 import, line 229 call. |
| `test/integration/mcp/capture-regression.test.ts` | `test/helpers/capture-regression-runner.ts` | `replayCaptureRegressionEntry` import | WIRED | Line 33. |
| `test/fixtures/capture-regression-matrix.json` | `test/fixtures/agda/FixtureDeps/TransitiveStaleness` | `entry.fixtureDir` field | WIRED | Value is exactly `"FixtureDeps/TransitiveStaleness"`, and that directory exists with the 3 expected files. |
| `test/integration/mcp/capture-regression.test.ts` | `scripts/emit-regression.mjs` | `matchesExpected` import (shared D-05 comparator) | WIRED | Line 36; confirmed the SAME exported function, not a re-implementation. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `test/integration/mcp/capture-regression.test.ts` | `observed` (per matrix entry) | `replayCaptureRegressionEntry` → real `createMcpHarness` → real spawned `agda --interaction-json` process → `result.structuredContent.data` | Yes — **directly confirmed** via a standalone probe script I wrote and ran (`RUN_AGDA_INTEGRATION=1 npx tsx probe-observed.mjs`), which printed the live tuple `{classification:"ok-complete", success:true, goalCount:0, invisibleGoalCount:0, hasHoles:false, errorCategories:[]}` — a real, non-hardcoded, non-empty result from an actual Agda process, not a stub/default value | FLOWING |
| `scripts/emit-regression.mjs`'s `composeEntry` | `expected` | `verdict.orcl01.coldTuple`/`coldCategories`, itself from a fresh `runOracle()` cold `Cmd_load` | Yes — confirmed the persisted `expected` in the matrix JSON (`UnequalTerms`/`type-error`) exactly matches my own independent from-scratch cold `agda` compile of the same fixture pair | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full default suite green | `npm test` | `178 passed \| 14 skipped (192 files)`, `1471 passed \| 173 skipped (1644 tests)`, 0 failures | PASS |
| Flagship integration test (real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` | `1 passed`, verbose name confirms "does NOT yet match" (defect live) | PASS |
| Phase-3 unit suites | `npx vitest run test/unit/tools/register-capture-session.test.ts test/unit/fixtures/capture-regression-matrix.test.ts test/unit/tools/emit-regression.test.ts` | `3 files / 22 tests passed` | PASS |
| RUN_AGDA_INTEGRATION-gated helper tests | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/capture-regression-runner.test.ts test/unit/tools/register-capture-session.test.ts` | `2 files / 5 tests passed` | PASS |
| TypeScript compiles clean | `npx tsc -p tsconfig.json --noEmit` | exit 0, no output | PASS |
| Cold ground-truth reproduction (independent of all shipped tooling) | Hand-built temp dir + `agda --no-libraries FixtureDeps/TransitiveStaleness/Main.agda` with `Dep.broken.agda`'s content as `Dep.agda` | `error: [UnequalTerms] Bool !=< Nat` (exit 42) | PASS |
| Direct observed-vs-expected probe (bypassing the test framework's PASS/FAIL label) | Standalone `tsx` script calling `replayCaptureRegressionEntry` directly | `observed` = live false-green (`ok-complete`/`success:true`), `expected` = cold truth (`type-error`/`UnequalTerms`) — genuinely different | PASS |
| No nested fixtureDir double-prepend | `test ! -d test/fixtures/agda/FixtureDeps/TransitiveStaleness/FixtureDeps` | directory does not exist | PASS |
| `src/` untouched except the collision/UUID fix | `git diff --stat 33ee3ec..HEAD -- src/` | only `src/tools/register-capture-session.ts` (+16/-1) | PASS |

### Probe Execution

N/A — this project has no `scripts/*/tests/probe-*.sh` convention (confirmed via `find`/`grep`, no matches); vitest integration tests serve the equivalent role and were executed directly above (Behavioral Spot-Checks).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REPRO-01 | 03-01, 03-03 | Captured defect yields a minimal, deterministically re-triggerable reproduction | SATISFIED | Truths #1, #14, #16, #18 above; independently re-triggered by me via raw cold Agda. |
| LOCK-01 | 03-02, 03-03 | Fixture materialization writes minimal `.agda` repro under `test/fixtures/agda/` with automated placement + naming | SATISFIED | Truths #2, #9, #11 above. |
| LOCK-02 | 03-01, 03-02 | Emitter turns capture+fixture into a durable, from-RED vitest test on the normalized envelope; refuses ORCL-02-failed/ORCL-01-INCONCLUSIVE captures | SATISFIED | Truths #3, #6, #7, #8, #10, #12 above. |
| LOCK-03 | 03-03 | #64/#61 transitive-staleness defect produced through the emitter as a from-RED test+fixture, proving end-to-end | SATISFIED | Truths #4, #15, #16, #17, #19, #20 above; the only requirement independently, behaviorally re-verified against a live Agda process by the verifier (not just read from code). |

**Orphan check:** `REQUIREMENTS.md`'s traceability table maps exactly these 4 IDs to "Phase 3" (`REPRO-01`, `LOCK-01`, `LOCK-02`, `LOCK-03`) and no others — matches the union of `requirements:` frontmatter across all 3 plans exactly (`03-01: [REPRO-01, LOCK-02]`, `03-02: [LOCK-01, LOCK-02]`, `03-03: [REPRO-01, LOCK-01, LOCK-03]`). No orphaned requirements.

**Documentation-sync finding (non-blocking):** `REQUIREMENTS.md` still shows `- [ ]` (unchecked) for all 4 IDs and "Pending" (not "Complete") in its traceability table, even though `ROADMAP.md` marks Phase 3 `[x]` complete and all 3 SUMMARY.md files declare `requirements-completed`. Phase 2 closed this exact gap with a dedicated commit (`f542d37 docs(02-05): mark ORCL-02 complete in REQUIREMENTS.md traceability`); no equivalent commit exists for Phase 3. This is a bookkeeping lag, not a functional gap — recommend a follow-up one-line edit updating the 4 checkboxes and the traceability table's "Status" column to "Complete" before milestone audit.

### Anti-Patterns Found

None newly found. A full `grep` for `TODO|FIXME|XXX|HACK|PLACEHOLDER|TBD` (case-insensitive) plus "placeholder/coming soon/not yet implemented" across all 9 phase-3-authored files returned zero matches. `npx tsc --noEmit` is clean. The phase's own code review (`03-REVIEW.md` iteration 1, `03-REVIEW.iter2.md` iteration 2) already found and fixed 2 BLOCKER + 3 WARNING findings (CR-01 path-traversal containment, CR-02 `--force` fail-closed, WR-01 rollback, WR-02 `test.fails` masking removal, WR-03 cross-process UUID) — I independently re-confirmed each fix is present in the current code (see "Methodology" and per-truth evidence above), not merely claimed. 5 INFO-level items remain, intentionally deferred by the maintainer (`--all` not passed) and carried forward unchanged in `03-REVIEW.iter2.md`:

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `vitest.config.ts:26` | Global `passWithNoTests: true` could mask a mis-globbed run | INFO (carried forward, IN-01) | Deferred; not a Phase-3 regression. |
| `scripts/emit-regression.mjs:400-415` | CLI doesn't validate required flags up front (raw TypeError/zod error on missing `--id`/`--fixture-dir`) | INFO (carried forward, IN-02) | Deferred; rollback (WR-01) already prevents orphaned fixtures from this path. |
| `scripts/emit-regression.mjs:321-329` | `matchesExpected` hand-mirrors ORCL-01's comparator rather than importing a shared field-list | INFO (carried forward, IN-03) | Deferred; both implementations currently agree (confirmed by the passing flagship test). |
| `test/unit/tools/emit-regression.test.ts` G2/G3 | Tests assert filenames but not baseline-vs-primary content routing | INFO (carried forward, IN-04) | Deferred; would only catch a future accidental swap of two `writeFixtureFile` calls. |
| `scripts/emit-regression.mjs:470-483` | WR-01's broadened `catch` could roll back fixtures after a post-commit `stdout.write` throw (narrow window) | INFO (new this iteration, IN-05) | Deferred; low-severity, already fixed for the reachable throw sites (composeEntry/replay/duplicate-id). |

None of these are BLOCKER or WARNING severity; all are already triaged and explicitly deferred by the maintainer's own review process.

### Human Verification Required

None. Every must-have truth was verifiable programmatically — including the flagship's core claim, which I additionally verified through direct, independent behavioral execution (a standalone cold-Agda compile and a standalone probe script) rather than trusting the test framework's PASS label alone. No PLAN.md files in this phase contain deferred `<verify><human-check>` blocks (grep confirmed zero matches).

### Gaps Summary

No gaps block the phase goal. All 4 ROADMAP success criteria and all 20 plan-level must-have truths are verified against the actual codebase, not merely claimed in SUMMARY.md. The one non-blocking finding — `REQUIREMENTS.md`'s traceability table not yet updated to "Complete" for REPRO-01/LOCK-01/LOCK-02/LOCK-03 — is a documentation-sync lag with a trivial fix, tracked above, and does not affect the functional verification score.

The single most rigorous check performed: this phase's entire reason for existing is proving that a real, captured, unfixed defect (#64/#61) becomes a genuine from-RED regression. Rather than trusting `npx vitest run`'s green/red label, I independently reproduced both sides of the differential myself — a bare cold `agda` compile (bypassing this server entirely) confirming the "correct" expected value, and a standalone script invoking the shipped `replayCaptureRegressionEntry` directly to observe the live server's actual (wrong) answer. The two differ exactly as the matrix entry claims. The scaffold works end-to-end, on real Agda 2.8.0, for the exact issue named in the phase goal.

---

*Verified: 2026-07-02T17:40:22Z*
*Verifier: Claude (gsd-verifier)*
