---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
plan: 02
subsystem: oracle-triad
tags: [static-analysis, agda, soundness-scan, pragma-scan, zod, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-capture-foundation
    provides: "CaptureArtifact / ReplayManifest / RecordedAction shape (src/agda/session-capture/artifact-types.ts) — the staged JSON judgeOrcl02 reads"
provides:
  - "judgeOrcl02(artifactPath, options) — standalone ORCL-02 soundness-hygiene predicate: clean / cheat-flagged / no-policy / no-target"
  - "scanPragmaVocabulary/scanOptionsFlags — reusable static scan primitives (postulate, TERMINATING, NO_POSITIVITY_CHECK, NO_UNIVERSE_CHECK, primTrustMe, COMPILE/FOREIGN FFI, residual holes)"
  - "walkClosureFiles/scanClosure — transitive dependency closure scan mirroring agda_postulate_closure's composition"
  - "diffAgainstWhitelist — sanctioned-axiom whitelist diff + D-08 residual-hole cross-predicate gate"
  - "scripts/data/oracle-policy/agda-unimath.json — interim pre-PROC-02 policy file (sanctioned axioms + required flags) for the agda-unimath fuel corpus"
  - "CLI: npx tsx scripts/oracle/orcl-02-soundness-scan.mjs <artifact.json> [--policy <key>] — exit 0/1/2 for clean|no-target / cheat-flagged / no-policy"
affects: [03-regression-emitter, 04-fix-queue, 05-dogfooding-orchestration-fuel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Oracle scripts import src/ server logic directly via tsx-resolved .js-to-.ts specifiers (loadJsonData, extractPostulateSites, parseOptionsPragmas, buildImportGraph, computeImpact, parseAgdaLibraryName, parseAgdaVersion) — no duplication of server logic in scripts/ (SSOT, D-05)"
    - "Pragma-preserving block-comment stripper: a THIRD local copy of import-graph.ts's depth-counter technique, but one that special-cases a {-#-prefixed run as a pragma to KEEP (not discard) — the naive reuse would have stripped the exact pragma content this scanner exists to detect"
    - "isMainModule CLI guard reused directly from scripts/test-with-sentinel.mjs rather than reimplemented"

key-files:
  created:
    - scripts/oracle/orcl-02-soundness-scan.mjs
    - scripts/data/oracle-policy/agda-unimath.json
    - test/unit/tools/oracle-orcl-02.test.ts
    - test/fixtures/agda/TerminatingExample.agda
    - test/fixtures/agda/PrimTrustMeExample.agda
    - test/fixtures/agda/CompilePragmaExample.agda
    - test/fixtures/agda/LibBase.agda
    - test/fixtures/agda/WithKOverride.agda
  modified: []

key-decisions:
  - "scanClosure's signature grew a 4th `policy` parameter beyond the plan's literal scanClosure(repoRoot, filePath, agdaVersion) — the --with-K-vs-required---without-K override finding must be produced at scan time (diffAgainstWhitelist only marks sanctioned:true/false on findings that already exist), so the policy has to be available to scanClosure itself"
  - "Task 1's with-k-override behavior test was reinterpreted as a precondition-data test (scanOptionsFlags + loadOraclePolicy raw values) rather than a finding-object assertion, since scanPragmaVocabulary(source) is single-file/policy-blind by design — the actual kind:\"with-k-override\" finding is asserted end-to-end in Task 2's judgeOrcl02 Test 4"
  - "Implemented a pragma-preserving stripPlainBlockComments instead of literally reusing import-graph.ts's stripBlockComments — the naive version conflates {-# ... #-} pragmas with {- ... -} comments and would strip every pragma this scanner needs to read"

requirements-completed: [ORCL-02]

# Metrics
duration: ~25min
completed: 2026-07-02
---

# Phase 2 Plan 02: ORCL-02 Soundness-Hygiene Scan Summary

**Standalone `judgeOrcl02` predicate that walks a capture's full transitive dependency closure for postulates/unsafe pragmas/FFI/`--with-K` overrides/residual holes, diffs against a per-project sanctioned-axiom whitelist, and never false-reds the legitimate scaffold-hole workflow (D-08).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-02T07:51Z (approx.)
- **Completed:** 2026-07-02T07:59Z
- **Tasks:** 2 (both `tdd="true"`, full RED/GREEN cycles)
- **Files modified:** 8 created, 0 modified

## Accomplishments
- `scanPragmaVocabulary` detects all 7 named cheat shapes (postulate, TERMINATING/NON_TERMINATING, NO_POSITIVITY_CHECK, NO_UNIVERSE_CHECK, primTrustMe, `{-# COMPILE #-}`/`{-# FOREIGN #-}` FFI, residual holes as bare `?` or `{! !}`) with 1-based line numbers, confirmed `primEraseEquality` is never flagged
- `walkClosureFiles`/`scanClosure` reuse `agda_postulate_closure`'s exact `buildImportGraph`/`computeImpact` composition to scan a target's FULL transitive closure, not just the file itself — proven against a postulate declared only in an upstream dependency
- `diffAgainstWhitelist` implements D-03 (no-policy carries all findings, never silent pass/blanket fail) and D-08 (a residual hole is excused only when the warm classification is exactly `"ok-with-holes"`, never for `"ok-complete"` or absent)
- `judgeOrcl02` composes the full predicate end-to-end: resolves the last load-family recorded action's target file + warm classification, derives a default policy key from the project's `.agda-lib` name (or accepts an explicit override), and returns `clean` / `cheat-flagged` / `no-policy` / `no-target`
- The empirically-verified LibBase/WithKOverride `--with-K` override cheat (confirmed against local Agda 2.8.0 — exit 0, zero diagnostics) is caught as `cheat-flagged`, unsanctioned regardless of the policy's `sanctionedAxioms` content
- CLI (`npx tsx scripts/oracle/orcl-02-soundness-scan.mjs <artifact> [--policy <key>]`) manually smoke-tested against synthetic staged captures with correct exit codes (0/1/2); no real `.agda-mcp/captures/*.json` existed locally to check against, per the plan's fallback instruction
- `scripts/data/oracle-policy/agda-unimath.json`: real interim policy (3 sanctioned axioms, 6 required flags) sourced from `.planning/research/FUEL-CORPORA.md`
- 23 tests in `test/unit/tools/oracle-orcl-02.test.ts`, all green; full `npm test` run twice (before and after the coverage-completion commit) — 1406/1406 non-skipped tests pass, zero regressions

## Task Commits

Each task was committed atomically (both tasks are `tdd="true"`, each with its own RED/GREEN cycle):

1. **Task 1: Interim policy file + widened pragma/FFI scan vocabulary + new fixtures**
   - `6341476` (test) — failing tests + 5 new fixtures (RED)
   - `bc331b8` (feat) — `loadOraclePolicy`/`scanPragmaVocabulary`/`scanOptionsFlags` + policy JSON (GREEN)
2. **Task 2: Transitive closure walk + whitelist-diff + judgeOrcl02() + CLI**
   - `d0b42f0` (test) — failing tests for closure walk / D-08 gate / judgeOrcl02 (RED)
   - `0d5e387` (feat) — `walkClosureFiles`/`scanClosure`/`diffAgainstWhitelist`/`judgeOrcl02`/CLI (GREEN)
3. **Coverage completion** (Rule 2 — see Deviations)
   - `37d8946` (test) — direct assertions for NO_POSITIVITY_CHECK/NO_UNIVERSE_CHECK/bare-hole/extended-hole, closing a gap against the plan's own overall success criteria

_TDD gate compliance: both tasks have a `test(...)` commit strictly before their `feat(...)` commit, each verified RED (failing for the expected reason — missing export/module) before GREEN (all tests passing)._

## Files Created/Modified
- `scripts/oracle/orcl-02-soundness-scan.mjs` (459 lines) - `loadOraclePolicy`, `scanPragmaVocabulary`, `scanOptionsFlags`, `walkClosureFiles`, `scanClosure`, `diffAgainstWhitelist`, `judgeOrcl02`, `scriptMain`/CLI
- `scripts/data/oracle-policy/agda-unimath.json` (13 lines) - interim sanctioned-axiom whitelist + required-flag baseline
- `test/unit/tools/oracle-orcl-02.test.ts` (304 lines, 23 tests) - full behavior coverage for both tasks plus the coverage-completion commit
- `test/fixtures/agda/TerminatingExample.agda`, `PrimTrustMeExample.agda`, `CompilePragmaExample.agda` - one-concept-per-file fixtures for the pragma/FFI vocabulary
- `test/fixtures/agda/LibBase.agda`, `WithKOverride.agda` - the empirically-verified `--with-K`-override cheat pair (verbatim from RESEARCH.md)

## Decisions Made

1. **`scanClosure` signature extended to `(repoRoot, filePath, agdaVersion, policy)`.** The plan's action prose describes `scanClosure` as calling `scanOptionsFlags` "vs the policy's requiredFlags" to detect the `--with-K` override, but `diffAgainstWhitelist`'s own spec only ever *marks* `sanctioned: true/false` on findings that already carry `kind: "with-k-override"` — it does not synthesize new findings from raw flags. The only place that override finding can be produced is where both the file's own flags and the policy are simultaneously in scope, i.e. inside `scanClosure` itself. Extending the signature (rather than duplicating the check separately in `judgeOrcl02`) keeps `scanClosure`'s documented per-file behavior ("runs scanPragmaVocabulary + scanOptionsFlags ... on each") literally true, and keeps `diffAgainstWhitelist` a pure sanctioned/unsanctioned marker as its own spec describes.

2. **Task 1's Behavior Test 4 (with-K override) reinterpreted as a precondition-data test.** The plan's Task 1 `<behavior>` list asks for a `kind: "with-k-override"` finding from "the same function" (i.e. `scanPragmaVocabulary`), but that function's signature is `scanPragmaVocabulary(source)` — single file, no policy — and cannot by construction know that a *different* file's project policy requires `--without-K`. Task 1's exports are exactly `loadOraclePolicy`/`scanPragmaVocabulary`/`scanOptionsFlags` per its own `<action>` and acceptance criteria; the closure+policy composition that actually detects the override (`scanClosure`) is a Task 2 deliverable. Task 1's test instead confirms the raw data both halves of the override depend on (`scanOptionsFlags(WithKOverride.agda)` contains `--with-K`; `scanOptionsFlags(LibBase.agda)` and the loaded policy both contain `--without-K`); Task 2's `judgeOrcl02` Test 4 is the first place the actual `kind: "with-k-override"`, `sanctioned: false` finding is asserted end-to-end — satisfying the plan's overall success criteria ("with-K override... regardless of the policy's sanctionedAxioms content") without inventing test-only glue logic that Task 2 would then have to match.

3. **`stripPlainBlockComments` reimplemented rather than literally copying `import-graph.ts`'s `stripBlockComments`.** The plan explicitly asks for "the SAME character-by-character depth-counter approach ... reimplement locally". A byte-for-byte copy of that function treats `{-#`-opened runs identically to plain `{-`-opened comments (both close on `-}`) and discards their content entirely — which would silently strip every `{-# TERMINATING #-}` / `{-# COMPILE ... #-}` pragma this scanner exists to detect, breaking Task 1's own most basic acceptance criteria. The local reimplementation keeps the same depth-counting technique (a genuine third copy per D-05) but special-cases a `{-#`-prefixed run as a pragma to preserve verbatim, discarding only genuine `{- ... -}` comments (with newlines kept so line numbers stay accurate). This is a correctness fix to an internally-contradictory instruction, not a scope change.

4. **Added 4 supplementary tests** (NO_POSITIVITY_CHECK, NO_UNIVERSE_CHECK, bare `?` hole, extended `{! !}` hole) beyond the per-task `<behavior>` lists, because the plan's plan-level `<success_criteria>` names all 7 cheat shapes as requiring fixture-backed detection, and 2 of them (plus both hole shapes) had implementation but no direct assertion after Task 1/2's literal behavior lists were satisfied. Used inline source strings (matching the existing `primEraseEquality` precedent) rather than new fixture files, since the plan's `files_modified` frontmatter didn't list any.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - internal plan inconsistency] `stripPlainBlockComments` diverges from a literal copy of `import-graph.ts`'s `stripBlockComments`**
- **Found during:** Task 1 (scan vocabulary design)
- **Issue:** A literal reuse of the referenced function's algorithm strips `{-# ... #-}` pragma bodies as if they were plain comments, which would make `scanPragmaVocabulary` structurally incapable of ever detecting a TERMINATING/COMPILE/etc. pragma
- **Fix:** Reimplemented the depth-counter with a pragma-preserving special case (see Decision 3 above)
- **Files modified:** `scripts/oracle/orcl-02-soundness-scan.mjs`
- **Verification:** All 4 pragma-detection tests (terminating, prim-trust-me, ffi-compile, no-positivity-check, no-universe-check) pass with correct line numbers
- **Committed in:** `bc331b8` (Task 1 GREEN commit)

**2. [Rule 1/3 - signature gap] `scanClosure` gains a 4th `policy` parameter**
- **Found during:** Task 2 (closure walk + whitelist-diff design)
- **Issue:** The plan's shorthand signature `scanClosure(repoRoot, filePath, agdaVersion)` omits the parameter its own described behavior (with-K-override detection "vs the policy's requiredFlags") requires
- **Fix:** Extended the signature to accept `policy` as a 4th argument, resolved by `judgeOrcl02` before the call (matching the composition order already described in `judgeOrcl02`'s own spec: resolve policy, then scan, then diff)
- **Files modified:** `scripts/oracle/orcl-02-soundness-scan.mjs`
- **Verification:** `judgeOrcl02` Test 4 (LibBase/WithKOverride pair) returns `cheat-flagged` with an unsanctioned `with-k-override` finding
- **Committed in:** `0d5e387` (Task 2 GREEN commit)

**3. [Rule 2 - missing test coverage] Added 4 supplementary tests for named cheat shapes not directly asserted by Task 1/2's literal behavior lists**
- **Found during:** Post-implementation self-review against the plan's plan-level success criteria
- **Issue:** `NO_POSITIVITY_CHECK`, `NO_UNIVERSE_CHECK`, and both residual-hole shapes were implemented (regex vocabulary present since Task 1's GREEN commit) but never directly asserted by a dedicated test — only the per-task `<behavior>` lists' 5+6 tests were required, but the plan's overall `<success_criteria>` names all 7 shapes as requiring fixture-backed proof
- **Fix:** Added 4 direct `scanPragmaVocabulary` assertions using inline source strings
- **Files modified:** `test/unit/tools/oracle-orcl-02.test.ts`
- **Verification:** All 4 new tests pass; full suite still 23/23
- **Committed in:** `37d8946`

---

**Total deviations:** 3 auto-fixed (2 internal-plan-inconsistency fixes, 1 missing-coverage addition)
**Impact on plan:** All three are necessary for the implementation to be internally consistent and to actually satisfy the plan's own stated success criteria. No scope creep — no new finding kinds, no new CLI surface, no new file beyond what the plan's `files_modified` frontmatter already listed.

## Issues Encountered
- Confirmed (via a throwaway `tsx`-executed script, not committed) that `.mjs` scripts under `scripts/` CAN import `src/*.ts` modules directly via `.js`-suffixed relative specifiers, both under `vitest` (Vite's resolver) and under `npx tsx` directly — this was an assumption in the plan's `<interfaces>` section ("tsx-importable") that I verified empirically before committing to the design, since a failure here would have required a different import strategy (e.g. dynamic `import()` of a pre-built `dist/` output).
- No real staged `.agda-mcp/captures/*.json` existed locally to run the manual CLI smoke check against (Task 2's acceptance criteria explicitly permits skipping this and relying on automated tests instead) — ran the CLI against a synthetic hand-built capture instead, confirming exit codes 0/1/2 for clean/cheat-flagged/no-policy.

## Known Stubs
None — this plan ships a CLI script + static data file, not a UI surface. No hardcoded empty values flow to any rendering layer.

## Threat Flags
None beyond what the plan's own `<threat_model>` already discloses. `resolveDefaultPolicyKey`'s `.agda-lib` directory listing reads only the top-level of `manifest.repoRoot` (itself part of the captured artifact's manifest, already covered by the "Captured artifact's recorded file path + closure -> filesystem reads" trust-boundary row) — not a new category of surface.

## User Setup Required
None - no external service configuration required. Requires a local `agda` binary on PATH for the (pre-existing, unrelated) integration test suite; this plan's own tests are pure text scans with no Agda subprocess.

## Next Phase Readiness
- ORCL-02 is a complete, standalone-runnable predicate: `judgeOrcl02(artifactPath, options)` is directly importable by Phase 3's regression emitter (to refuse ORCL-02-failing captures, per STATE.md's roadmap note) and Phase 4's queue prioritization.
- The verdict shape (`{ kind: "clean" | "cheat-flagged" | "no-policy" | "no-target", findings: [...] }`) is ready to be composed with ORCL-01's and ORCL-03's outcomes into the full D-02 sidecar verdict schema once Plan 02-01/02-03/02-04 land (this plan ran independently and in parallel with them, per its own `<objective>`).
- The interim `agda-unimath.json` policy file is a real, loadable artifact — Phase 5's PROC-02 has a concrete file to formalize/relocate rather than starting from nothing.
- No blockers. The `--with-K`-override detection is intentionally narrow (v1 scope: only the one empirically-verified negated-flag pair) — a general flag-negation table is explicitly deferred to AUTO-07 (v2), consistent with STATE.md's scope-line guardrail.

---
*Phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Completed: 2026-07-02*
