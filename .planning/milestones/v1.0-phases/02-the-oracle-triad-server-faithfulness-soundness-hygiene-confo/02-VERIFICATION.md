---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
verified: 2026-07-02T10:52:32Z
status: passed
score: 5/5 roadmap success criteria verified; 24/24 plan-level must-have truths verified
overrides_applied: 0
---

# Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance) Verification Report

**Phase Goal:** A capture can be judged "true green" only when three composable predicates agree — because a fresh `agda` re-run on identical source+flags is a sound oracle for exactly one false-green family (the server's own), and structurally blind to the two the real agda-unimath/Hopf dogfooding makes first-class (agent soundness cheats; proved-the-wrong-statement).
**Verified:** 2026-07-02T10:52:32Z
**Status:** passed
**Re-verification:** No — initial verification

## Process Note: MVP Mode / Goal Format

Phase 2 is tagged `mode: mvp` in ROADMAP.md, but its goal text fails the User Story
format guard (`gsd-sdk query user-story.validate` returns `valid: false` — the
ROADMAP goal is outcome-technical prose, not "As a X, I want Y, so that Z."). Per
the MVP-mode-verification guard, forcing a User Flow Coverage table onto an
architecture/oracle-predicate phase like this would be low-quality, so this
report applies **standard goal-backward verification** against the ROADMAP's 5
explicit Success Criteria instead. This is not a phase gap: every one of this
phase's 5 PLAN.md files already documents this exact discrepancy verbatim
("ROADMAP.md's Phase 2 `Goal:` line is written in outcome-technical prose, not
native 'As a / I want to / so that' form... Run `/gsd mvp-phase 2` if you want
ROADMAP.md's own Goal line rewritten to match") and supplies a faithful
reformatted user story that carries no new scope. Informational only.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ORCL-01 re-runs the capture as a fresh `agda --interaction-json Cmd_load` (never batch), replaying binary+version, library registration, ordered flag argv, cwd/root, isolated fresh `_build`, and pinned import closure; diffs normalized classification tuple + error/warning category set, never raw text/timing | VERIFIED | `scripts/oracle/orcl-01-differential.mjs`: `spawnColdAgdaSession({agdaBin, ...})` spawns `agda --interaction-json` (never batch); `command("Cmd_load", quoted(materializedPath), stringList(remainingFlags))` builds a real `Cmd_load`; `materializeCaptureEnvironment` replays `agdaDirContents` verbatim into a fresh temp `AGDA_DIR` (grep confirms `createLibraryRegistration` is never imported/called anywhere under `scripts/oracle/`); `splitMergedArgv` preserves argv order; fresh `mkdtempSync` dirs + `buildFreshProbe` guarantee isolated `_build`; `hashImportClosure`-recomputed closure hash gates via `closureHashProbe`. Diff logic (`TUPLE_FIELDS`, `categorySet()`/`extractErrorCategory()`) only ever compares the 5-field classification tuple + bracketed-category sets — never wire text or timing. Confirmed live: `judgeOrcl01: a faithful capture of a clean load returns { kind: 'pass' }` passed against a real local Agda 2.8.0 binary. |
| 2 | ORCL-01 emits a candidate server false-green only when warm-green/cold-red AND every environment probe passes; any failing probe → INCONCLUSIVE naming the probe, never "server bug"; abstention/INCONCLUSIVE rate is a first-class metric | VERIFIED | `runColdLoadAndDiff` pre-gates on version/agdaDir-hash/closure-hash/build-fresh BEFORE any spawn, then post-gates on terminus/timeout — every failure path returns `{ kind: "inconclusive", probe: <name>, detail }`, never a "server bug" label. Confirmed live: `judgeOrcl01: a forged warm ok-complete over a genuinely cold-failing load returns server-false-green-candidate` PASSED (real Agda); `judgeOrcl01: a manifest.agdaVersion mismatch against the real cold binary returns INCONCLUSIVE(version), never a false verdict` PASSED (real Agda). Abstention metric: `abstentionMetricLine()` (`verdict-schema.mjs`) + `run-oracle.mjs`'s `appendFileSync(metricsPath, ...)` append exactly one `oracle-metrics.jsonl` line per run recording `orcl01Kind`/`probe`; confirmed by the passing end-to-end test asserting exactly one appended line. |
| 3 | ORCL-02 (cheap half) scans the captured diff + target's fully-transitive closure for postulate/TERMINATING/NO_*_CHECK/primTrustMe/FFI COMPILE/unsafe OPTIONS/`--with-K` override/residual holes, diffed against a sanctioned-axiom whitelist, distinguishing cheats from legitimate HIT postulates | VERIFIED | `scripts/oracle/orcl-02-soundness-scan.mjs`'s `scanPragmaVocabulary()` matches all 8 named categories (postulate via reused `extractPostulateSites`, `(NON_)?TERMINATING`, `NO_POSITIVITY_CHECK`, `NO_UNIVERSE_CHECK`, `primTrustMe` word-bounded so `primEraseEquality` is never matched, `{-# COMPILE\|FOREIGN #-}`, bare `?`/`{! !}` holes); `scanClosure` additionally flags a `--with-K` override of a `--without-K` project policy. `walkClosureFiles` (`buildImportGraph`+`computeImpact`, reusing the existing `agda_postulate_closure` composition) walks the FULL transitive closure, not just the target file. `diffAgainstWhitelist` marks `postulate` findings sanctioned only by whitelist membership (`scripts/data/oracle-policy/agda-unimath.json`: `sanctionedAxioms: ["univalence", "function-extensionality", "replacement"]`, matching FUEL-CORPORA.md verbatim). `no-policy` outcome is distinct from `clean`/`cheat-flagged` (D-03). All confirmed by 29 passing `oracle-orcl-02.test.ts` tests including real-fixture closure-walk tests (`LibBase.agda`/`WithKOverride.agda`/upstream-postulate scenarios). |
| 4 | ORCL-03 (advisory) alpha-diffs the proven `Cmd_infer_toplevel` signature against CAP-05's expected signature, flagging narrowing/added-premises/renames/target-edits — never a hard gate; may carry a consistency-probe hook | VERIFIED | `scripts/oracle/orcl-03-conformance.mjs`'s `judgeOrcl03`/`runColdInferAndCompare` issue a real `Cmd_infer_toplevel "Normalised"` against a cold-loaded session and `compareSignatures()` alpha-diffs (whitespace + `->`/`→` token-normalized) against `oracleSubstrate.expectedSignature`. `verdict-schema.mjs`'s `composeVerdict` never reads `orcl03` when computing `trueGreen` — structurally impossible to gate on it. `EXIT_CODE_BY_KIND` in `orcl-03-conformance.mjs` maps every one of its 3 outcome kinds to exit 0 (only a genuine thrown script error exits 1), so no automated caller can mistake an ORCL-03 outcome for pass/fail. `consistencyProbe: { attempted: false }` is unconditionally emitted by `composeVerdict` (D-06 hook, nothing mechanized). Confirmed live: both `judgeOrcl03: ... matching the real inferred type of 'add' returns { kind: 'consistent' }` and `... does NOT match ... returns conformance-flagged` PASSED against real Agda. |
| 5 | ORCL-01 passing is necessary-but-insufficient: only all three predicates together justify "true green", and ORCL-01's cold result is the correct expected value handed to Phase 3 | VERIFIED | `verdict-schema.mjs`: `trueGreen: orcl01.kind === "pass" && orcl02.kind === "clean"` — structurally requires BOTH; ORCL-03 is persisted verbatim alongside but never read by this expression. Directly tested: `composeVerdict: orcl02 cheat-flagged -> trueGreen false even though orcl01 passes` PASSED — the literal necessary-but-insufficient case. The module's header comment explicitly documents this as "the shared contract Phase 3 (regression-emitter refusal logic)... consumes." On a divergence, `server-false-green-candidate` carries the concrete `coldTuple`/`coldCategories` (the correct expected value); on an exact match, cold≡warm by construction, so nothing further is needed for Phase 3 to consume. |

**Score:** 5/5 roadmap success criteria verified

### Plan-Level Must-Haves (all 5 PLAN.md frontmatter blocks)

All 24 `must_haves.truths` entries across the 5 plans were individually checked against the actual code (not the SUMMARY narrative). All 24 VERIFIED — 11 of them backed by tests that ran against a **real local Agda 2.8.0 binary** (not mocks), which is unusually strong evidence for this kind of infrastructure phase.

| Plan | Truth (abbreviated) | Status | Key Evidence |
|------|----------------------|--------|---------------|
| 02-01 | Replay manifest argv never stale after loadNoMetas/mid-command death/idle crash | VERIFIED | `session.ts:321`, `session-process-lifecycle.ts:105,179` all reset `lastDispatchedLoadArgv = []` on their respective path (WR-08) |
| 02-01 | Disposable cold session sends 2 sequential IOTCM commands, returns both response arrays | VERIFIED | Real-Agda test "sendCommand() runs two sequential IOTCM commands against the SAME disposable process" PASSED (1225ms real subprocess) |
| 02-01 | Each of the 7 named probes independently reports INCONCLUSIVE naming itself | VERIFIED | `runEnvironmentProbes()` implements version/agdaDir-hash/closure-hash/build-fresh/spawn/terminus/timeout; each has a dedicated pass+fail unit test, all passing |
| 02-02 | Scan flags postulate/TERMINATING/NO_*_CHECK/primTrustMe/COMPILE/with-K override | VERIFIED | `scanPragmaVocabulary`/`scanClosure`; all 8 categories individually unit-tested |
| 02-02 | Whitelist membership distinguishes sanctioned vs. cheat | VERIFIED | `diffAgainstWhitelist`; Tests 2/3 in `oracle-orcl-02.test.ts` PASSED |
| 02-02 | No-policy project → distinct `no-policy` outcome carrying every finding | VERIFIED | `judgeOrcl02`'s `no-policy` branch; Test 1 PASSED |
| 02-02 | Postulate discharged via upstream dependency still caught (transitive closure) | VERIFIED | `walkClosureFiles`; "closure includes an upstream dependency" test PASSED against real fixtures |
| 02-02 | D-08: residual hole sanctioned iff warm classification is `ok-with-holes` | VERIFIED | `diffAgainstWhitelist`; Test 5 (`ok-with-holes` → not a cheat) + Test 6 (`ok-complete` → cheat) both PASSED |
| 02-03 | Exact warm/cold match → `pass` | VERIFIED | Real-Agda test "a faithful capture of a clean load returns pass" PASSED |
| 02-03 | Mismatch once probes pass → `server-false-green-candidate` with both tuples | VERIFIED | Real-Agda test "a forged warm ok-complete over a genuinely cold-failing load returns server-false-green-candidate" PASSED |
| 02-03 | Unfaithful environment → INCONCLUSIVE naming the specific probe | VERIFIED | Real-Agda test "a manifest.agdaVersion mismatch... returns INCONCLUSIVE(version)" PASSED |
| 02-03 | Path-traversal `inlinedFirstPartySources[].path` refused, never written outside temp dir | VERIFIED | `resolveFileWithinRoot` in `materializeCaptureEnvironment`; "refuses a ..-escaping path entry" test PASSED |
| 02-03 | Cold `Cmd_load` never calls `createLibraryRegistration`; replays `agdaDirContents` verbatim | VERIFIED | Grep confirms zero references to `createLibraryRegistration` under `scripts/oracle/`; `writeAgdaDirConfigFile` byte-matches the live registration format |
| 02-03 | `.agda-lib` never present in materialized replay dir (RESEARCH.md Open Q2) | VERIFIED | Dedicated passing test "inlineFirstPartySources never includes .agda-lib; neither does the materialized replay dir" |
| 02-04 | expectedSignature + successful cold load → `Cmd_infer_toplevel` on SAME session → consistent/conformance-flagged | VERIFIED | Both real-Agda tests ("matching the real inferred type of 'add'" / "does NOT match") PASSED |
| 02-04 | No expectedSignature → `vacuous-no-expected-signature`, no extra cold spawn | VERIFIED | `judgeOrcl03` checks `expectedSignature` BEFORE `materializeCaptureEnvironment` is ever called; test PASSED |
| 02-04 | ORCL-03 outcome kind never gates true-green | VERIFIED | `composeVerdict` never reads `orcl03`; `EXIT_CODE_BY_KIND` maps every ORCL-03 outcome to exit 0 |
| 02-04 | `consistencyProbe: { attempted: false }` reserved, nothing mechanized (D-06) | VERIFIED | `composeVerdict` unconditionally emits this; dedicated passing test |
| 02-05 | One CLI run → exactly one verdict sidecar with all 3 outcomes + `trueGreen` | VERIFIED | Real-Agda end-to-end test "writes one verdict sidecar + appends exactly one metrics line, never mutating the artifact itself" PASSED |
| 02-05 | `trueGreen` true only when ORCL-01=pass AND ORCL-02=clean; ORCL-03 never affects it | VERIFIED | `composeVerdict` formula; unit tests for both clauses PASSED |
| 02-05 | Verdict sidecar is a NEW file, never mutates the capture artifact (D-01) | VERIFIED | Suffix-replace `sidecarPath` logic; test explicitly asserts artifact bytes are unchanged after a run |
| 02-05 | One metrics line appended per run recording ORCL-01 abstention + probe (D-04) | VERIFIED | `abstentionMetricLine` + `appendFileSync`; confirmed by passing end-to-end test |
| 02-05 | ORCL-01 + ORCL-03 share ONE materialized env + ONE cold process | VERIFIED | Real-Agda test "`--only orcl-01,orcl-03` spawns at most ONE cold Agda process (shared materialization + session)" PASSED |
| 02-05 | `--only orcl-03` alone still produces a REAL outcome, never a bare placeholder | VERIFIED | Real-Agda test "`--only orcl-03` alone falls back to the standalone judgeOrcl03, producing a REAL comparison never a bare vacuous placeholder" PASSED |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/oracle/cold-agda-session.mjs` | `spawnColdAgdaSession()` + `runEnvironmentProbes()`, ≥150 lines | VERIFIED | 477 lines; both exports present, substantive, tested |
| `scripts/oracle/orcl-01-differential.mjs` | `materializeCaptureEnvironment()`, `runColdLoadAndDiff()`, `judgeOrcl01()` + CLI, ≥250 lines | VERIFIED | 593 lines; all exports present, substantive, tested against real Agda |
| `scripts/oracle/orcl-02-soundness-scan.mjs` | `judgeOrcl02()` + CLI, ≥160 lines | VERIFIED | 601 lines; substantive, 29 passing tests |
| `scripts/oracle/orcl-03-conformance.mjs` | `compareSignatures()`, `runColdInferAndCompare()`, `judgeOrcl03()` + CLI, ≥130 lines | VERIFIED | 451 lines; substantive, tested against real Agda |
| `scripts/oracle/verdict-schema.mjs` | `OracleVerdict` shape + `composeVerdict()`, ≥70 lines | VERIFIED | 90 lines; `composeVerdict`/`abstentionMetricLine` both present and tested |
| `scripts/oracle/run-oracle.mjs` | Single CLI entry point wiring judge01/02/03 + sidecar + metric, ≥100 lines | VERIFIED | 295 lines; substantive, end-to-end tested against real Agda |
| `scripts/data/oracle-policy/agda-unimath.json` | Sanctioned-axiom whitelist + required-flag baseline, ≥8 lines | VERIFIED | 13 lines; matches FUEL-CORPORA.md values exactly |
| `src/agda/session.ts` | `loadNoMetas()` resets `lastDispatchedLoadArgv` to `[]`, ≥460 lines | VERIFIED | 476 lines; fix present at line 321 |
| `src/agda/session-process-lifecycle.ts` | Both death paths reset `lastDispatchedLoadArgv`, ≥260 lines | VERIFIED | 280 lines; fix present at lines 105 and 179 |

Note: `orcl-01-differential.mjs` (593) and `orcl-02-soundness-scan.mjs` (601) exceed 500 lines. This is **not** a violation — CLAUDE.md and 02-CONTEXT.md both explicitly scope the hard 500-line ceiling to `src/` only ("500-line ceiling applies to `src/` only, but keep scripts modular anyway"); `scripts/` is exempt by design (D-05: the whole oracle triad intentionally ships as a `scripts/`-tier artifact, not a `src/` tool surface).

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `orcl-01-differential.mjs` | `src/repo-root.ts` | `resolveFileWithinRoot` containment on every `inlinedFirstPartySources[].path` | WIRED | Confirmed by grep + passing path-traversal regression test |
| `orcl-02-soundness-scan.mjs` | `src/repo-root.ts` | `resolveFileWithinRoot` containment on scan target + every closure dep (CR-02 fix) | WIRED | Confirmed by grep + passing "absolute/`..`-escaping target contained" regression test |
| `orcl-02-soundness-scan.mjs` | policy key resolution | Allowlist regex rejecting non-bare filename segments (CR-01 fix) | WIRED | Confirmed by grep + passing traversal-key regression test |
| `orcl-01-differential.mjs` | `src/agda/session-load-helpers.ts` | `classifyLoadResult` applied to cold side | WIRED | `classifyLoadResult({success, goalCount, invisibleGoalCount, sourceHoleCount})` call present, drives `coldTuple` |
| `orcl-01-differential.mjs` | `scripts/oracle/cold-agda-session.mjs` | `spawnColdAgdaSession` + `runEnvironmentProbes` imported and driven | WIRED | Import present; both pre- and post-spawn probe gates invoked |
| `orcl-03-conformance.mjs` | `orcl-01-differential.mjs` | `materializeCaptureEnvironment` reused, never reimplemented | WIRED | Import present; no second materialization implementation found |
| `orcl-03-conformance.mjs` | `src/protocol/command-builder.ts` | `modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", ...)` | WIRED | Exact call present, never a hand-built IOTCM string |
| `run-oracle.mjs` | `verdict-schema.mjs` | `composeVerdict(...)` computes persisted `trueGreen` | WIRED | Call present; verified by passing unit + end-to-end tests |
| `run-oracle.mjs` | verdict sidecar file | `writeFileAtomic` writes suffix-replaced `.verdict.json`, never mutates artifact | WIRED | Confirmed by passing end-to-end test asserting artifact bytes unchanged |
| `run-oracle.mjs` | `oracle-metrics.jsonl` | One appended line per run via `abstentionMetricLine` | WIRED | Confirmed by passing end-to-end test |
| `run-oracle.mjs` | `orcl-03-conformance.mjs` | Standalone `judgeOrcl03` called directly for `--only orcl-03` alone | WIRED | Confirmed by passing real-Agda test |

All 19 key_links declared across the 5 plans' frontmatter were checked; all WIRED. Table above shows the most safety-critical subset (path containment, SSOT reuse, composition, persistence).

### Data-Flow Trace (Level 4 — adapted: verdict computation flow, no UI in this phase)

| Artifact | Computed Value | Source | Produces Real Data | Status |
|----------|-----------------|--------|---------------------|--------|
| `verdict.orcl01` | `judgeOrcl01`/shared `runColdLoadAndDiff` outcome | Real cold `agda --interaction-json Cmd_load` subprocess output, parsed via `parseLoadResponses`/`classifyLoadResult` | Yes — confirmed against real Agda 2.8.0, both `pass` and `server-false-green-candidate` cases produced from genuine subprocess I/O | FLOWING |
| `verdict.orcl02` | `judgeOrcl02` outcome | Real `readFileSync` scan of fixture source + transitive closure via `buildImportGraph`/`computeImpact` | Yes — confirmed against real `.agda` fixture files (postulates, pragmas, with-K override) | FLOWING |
| `verdict.orcl03` | `judgeOrcl03`/`runColdInferAndCompare` outcome | Real cold `Cmd_infer_toplevel` subprocess response, decoded via `decodeExpressionDisplayResponses` | Yes — confirmed against real Agda 2.8.0 inferring the actual type of a real `add` definition | FLOWING |
| `verdict.trueGreen` | `composeVerdict` boolean | `orcl01.kind`/`orcl02.kind` (both real, not hardcoded) | Yes — flips correctly in both directions per passing unit tests | FLOWING |

No hollow/disconnected data paths found — every predicate's outcome is driven by a real subprocess or real filesystem scan, not a stub or hardcoded placeholder.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `run-oracle.mjs` is standalone-runnable, prints usage, exits 1 with no args | `npx tsx scripts/oracle/run-oracle.mjs` | Printed usage line, exit 1 | PASS |
| `orcl-01-differential.mjs` is standalone-runnable | `npx tsx scripts/oracle/orcl-01-differential.mjs` | Printed usage line, exit 1 | PASS |
| `orcl-02-soundness-scan.mjs` is standalone-runnable | `npx tsx scripts/oracle/orcl-02-soundness-scan.mjs` | Printed usage line, exit 1 | PASS |
| `orcl-03-conformance.mjs` is standalone-runnable | `npx tsx scripts/oracle/orcl-03-conformance.mjs` | Printed usage line, exit 1 | PASS |
| Oracle unit+integration suite passes against a real local Agda 2.8.0 binary | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-*.test.ts` | 6 files / 76 tests, all passed (0 skipped) | PASS |
| Full project test suite is green (no regressions from this phase) | `npx vitest run` | 176 files / 1451 tests passed, 12 files / 170 tests skipped (all `RUN_AGDA_INTEGRATION`-gated, expected) | PASS |
| Full project type-checks cleanly | `npx tsc --noEmit -p tsconfig.json` | Exit 0, no output | PASS |

### Probe Execution

SKIPPED — this project has no `scripts/*/tests/probe-*.sh` convention (checked via `find` + grep across PLAN/SUMMARY files; zero matches). The project's own `vitest` test files (including the `RUN_AGDA_INTEGRATION=1`-gated real-Agda tests run directly above) serve the equivalent role and were executed directly by this verifier, not merely cited from SUMMARY.md.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| ORCL-01 | 02-01, 02-03 | Server-faithfulness differential: fresh cold `Cmd_load`, replayed manifest, normalized tuple+category diff, probe-gated, INCONCLUSIVE naming, abstention metric | SATISFIED | See Observable Truths #1–#2 and plan-level truths table above; validated against a real Agda 2.8.0 binary |
| ORCL-02 | 02-02 | Soundness-hygiene scan: pragma/postulate/FFI/hole vocabulary over the transitive closure, whitelist-diffed, D-03/D-08 honored | SATISFIED | See Observable Truth #3 and plan-level truths table above; 29 passing tests including real-fixture closure walks |
| ORCL-03 | 02-04, 02-05 | Conformance proxy: alpha-diffed `Cmd_infer_toplevel` vs. expected signature, always advisory, consistency-probe hook reserved | SATISFIED | See Observable Truth #4 and plan-level truths table above; validated against a real Agda 2.8.0 binary |

**Orphaned requirements check:** `.planning/REQUIREMENTS.md`'s traceability table maps exactly ORCL-01/ORCL-02/ORCL-03 to "Phase 2" — identical to the set declared across the 5 plans' `requirements:` frontmatter fields. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Debt markers (TBD/FIXME/XXX) | none found | — |
| — | — | TODO/HACK/PLACEHOLDER | none found | — |
| — | — | Empty implementations (`return null`/`{}`/`[]`, `=> {}`) | none found | — |

Independently re-ran a full grep sweep across all 16 files this phase created/modified (6 `.mjs` scripts, 1 policy JSON, 3 `src/agda/session*.ts` files, 6 test files) — zero blocker-gate matches.

This phase's own code review (`.planning/phases/02-.../02-REVIEW.md`, iteration 2) independently found and the fixer resolved 2 BLOCKER + 2 WARNING findings before this verification ran. This verifier independently re-confirmed all 4 fixes are actually present in the shipped code (not just claimed in `02-REVIEW-FIX.md`):

- **CR-01** (policy-key path traversal → whitelist bypass): confirmed fixed — `loadOraclePolicy` now requires `/^[A-Za-z0-9._-]+$/u` + a non-dot character, rejecting `../`-bearing keys.
- **CR-02** (missing `repoRoot` containment in the closure scan): confirmed fixed — `walkClosureFiles`/`scanClosure` now call `resolveFileWithinRoot` before seeding or reading any file.
- **WR-01** (comment/string-blind scanner): confirmed fixed — `stripCommentsAndStrings` now masks `--` line comments and string/char literals while preserving pragma bodies.
- **WR-02** (version-probe crash on unparseable input): confirmed fixed — `versionProbe` wraps both `parseAgdaVersion` calls in `try/catch`, abstaining instead of throwing.

Three INFO-level items remain (non-gating per this project's own review classification, independently confirmed by this verifier as narrow/fail-safe, not affecting any must-have):

- **IN-01**: `stripCommentsAndStrings`'s char-literal branch can mis-parse a primed identifier immediately followed by a char literal (e.g. `foo' '?'`), producing a spurious `residual-hole` finding. Fail-safe (over-flags only, can never mask a real cheat into a false green); does not occur in the target agda-unimath/HoTT corpora vocabulary. No regression test yet.
- **IN-02**: `run-oracle.mjs`'s `--only` flag with no following value dereferences `undefined.split` outside the CLI's `try` block, producing a raw stack trace instead of the tidy `run-oracle failed: ...` message used elsewhere. CLI misuse-only edge case.
- **IN-03**: `splitMergedArgv`, the load-family regex, and the terminus check are each duplicated 2–3× across `orcl-01-differential.mjs`/`orcl-03-conformance.mjs`/`cold-agda-session.mjs`, per each plan's own file-scope boundary. Documented maintenance hazard, not a functional defect.

### Human Verification Required

None. This phase delivers backend CLI scripts consumed by a maintainer/AI agent (no UI, no user-facing flow) and its most safety-critical behaviors (real subprocess spawning, real cold `Cmd_load`/`Cmd_infer_toplevel` round-trips, real false-green forgery detection) were independently exercised by this verifier against a real local Agda 2.8.0 binary rather than left to human judgment.

### Gaps Summary

No gaps found. All 5 ROADMAP success criteria and all 24 plan-level must-have truths are verified against the actual codebase, with the majority independently re-executed against a real Agda 2.8.0 binary by this verifier (not merely cited from SUMMARY.md). The full project test suite (1451 passed / 170 skipped, skips are `RUN_AGDA_INTEGRATION`-gated) and `tsc --noEmit` are both clean. The phase's own code review reached `status: clean` after fixing 2 blockers + 2 warnings, and this verifier independently re-confirmed all 4 fixes are present in the shipped code. D-01 through D-08 (verdict sidecar-not-mutation, trueGreen composition, no-policy honesty, offline-batch timeout independence, scripts-tier placement, consistency-probe hook-only, vacuous-signature handling, D-08 residual-hole cross-predicate gating) were each individually traced to concrete code and passing tests. Three INFO-level findings remain, all independently confirmed as narrow, fail-safe, and non-gating.

---

_Verified: 2026-07-02T10:52:32Z_
_Verifier: Claude (gsd-verifier)_
