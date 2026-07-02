---
phase: 03-regression-lock-pipeline
plan: 02
subsystem: testing
tags: [regression-matrix, mcp-harness, oracle-triad, path-sandbox, tdd, capture-replay]

# Dependency graph
requires:
  - phase: 03-regression-lock-pipeline (Plan 01)
    provides: "capture-regression matrix typed contract (test/fixtures/capture-regression-matrix.{ts,json}) — the CaptureRegressionEntry schema this plan codes against + collision-proof capture staging"
  - phase: 02-the-oracle-triad
    provides: "runOracle/composeVerdict D-02 verdict + judgeOrcl02 kind enum + findWarmLoadTuple/categorySet/materializeCaptureEnvironment (scripts/oracle/*.mjs)"
  - phase: 01-capture-foundation
    provides: "CaptureArtifact/ReplayManifest shape + inlinedFirstPartySources (src/agda/session-capture/*)"
provides:
  - "Shared MCP-boundary replay function (test/helpers/capture-regression-runner.ts → replayCaptureRegressionEntry) reused by the emitter's D-05 self-check AND Wave-3's vitest runner — no duplicated harness/mutation logic"
  - "Complete regression-test emitter (scripts/emit-regression.mjs): refusal gate + fresh-oracle run + fixtureDir-relative bare-path materializer + compose + RED self-check + CLI"
  - "matchesExpected — the single shared observed-vs-expected comparator Wave-3's runner will import (no independent-drift risk)"
  - "The fixtureDir double-prepend BLOCKER fix (stripFixtureDirPrefix) verified against the real flagship-shape capture (Test G2)"
affects: [03-03, 03.1-fix-transitive-staleness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-replay-function pattern: ONE replay helper drives the MCP tool-call boundary; the emitter self-check and the Wave-3 runner both call it, so mutation/harness semantics can never drift"
    - "fixtureDir-relative bare-path derivation (stripFixtureDirPrefix): defensive-only prefix stripping so captured session-repoRoot-relative paths never double-prepend fixtureDir at the write site"
    - "D-08's new containment site: resolveFileWithinRoot applied to writes into the TRACKED test/fixtures/agda/ tree (not just a tmpdir), skip-on-traversal mirroring materializeCaptureEnvironment"

key-files:
  created:
    - test/helpers/capture-regression-runner.ts
    - test/unit/tools/capture-regression-runner.test.ts
    - scripts/emit-regression.mjs
    - test/unit/tools/emit-regression.test.ts
  modified: []

key-decisions:
  - "Copied fixtureDir into the isolated tmpdir via cpSync with a _build/.agda-mcp-tmp-* filter (mirroring mcp-end-to-end-parity.test.ts's isolateFixtures), never a hand-rolled recursive walker"
  - "judgeRefusal's first three conditions (inconclusive / cheat-flagged / no-policy-with-findings) are NEVER overridable by --force; only the fourth (nothing-meaningful-to-lock) is, since that is a 'nothing to prove RED for' call not a trust/soundness concern"
  - "The emitter always derives entryFile from findWarmLoadTuple(primaryArtifact) — there is deliberately NO --entry-file CLI flag; entryFile is artifact-derived, never user input"
  - "writeMatrixEntry uses writeFileAtomic (not plain writeFileSync) for the repeatedly-hand-updated matrix JSON, per PATTERNS.md's explicit write-safety note"

patterns-established:
  - "replayCaptureRegressionEntry(entry, fixturesRoot): the single reusable MCP-boundary replay vehicle — Wave 3's runner imports this, never re-implements harness driving"
  - "matchesExpected(observed, expected): the single match comparator (scalar equality + same-length/same-index errorCategories array equality, mirroring runColdLoadAndDiff's tupleMatches/categoriesMatch) shared by the emitter and the Wave-3 runner"

requirements-completed: [LOCK-01, LOCK-02]

# Metrics
duration: 20min
completed: 2026-07-02
---

# Phase 3 Plan 2: Shared Replay Helper + Regression Emitter Summary

**A single path-sandboxed MCP-boundary replay function plus the complete refusal-gated regression emitter (fresh-oracle → fixtureDir-relative bare-path materialize → compose → demonstrate-RED → matrix write), fully unit-tested against synthetic artifacts including the real flagship's fixtureDir-prefix double-prepend BLOCKER.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-02T13:10:00Z (approx.)
- **Completed:** 2026-07-02T13:26:00Z (approx.)
- **Tasks:** 3 completed
- **Files modified:** 4 (all created)

## Accomplishments
- **Shared replay helper (LOCK-01/LOCK-02):** `replayCaptureRegressionEntry` copies a matrix entry's `fixtureDir` into an isolated tmpdir (sandboxed), drives the entry's tool at the MCP tool-call boundary, optionally splices a mutation's content over the target and reloads (authoritative), and normalizes the observed result through the SAME `categorySet` the oracle uses. Harness + tmpdir always torn down in `finally`.
- **Complete emitter (LOCK-02):** `scripts/emit-regression.mjs` runs a FRESH `runOracle`, refuses to lock ORCL-01-inconclusive / ORCL-02-cheat-flagged / ORCL-02-no-policy-with-findings captures (D-06), materializes fixture files into the tracked `test/fixtures/agda/` tree with `resolveFileWithinRoot` sandboxing (D-08), derives bare `entryFile`/`mutation` even from fixtureDir-prefixed captures, composes a schema-validated matrix entry, and demonstrates RED via the shared replay + `matchesExpected` before writing (rolling back on a non-RED self-check).
- **Cross-plan BLOCKER closed:** the `stripFixtureDirPrefix` logic (Tests G2/G3) proves the real flagship shape — where every captured `inlinedFirstPartySources[].path` is already `FixtureDeps/TransitiveStaleness/`-prefixed — materializes to exactly `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda`, never a doubled path, with bare `mutation`/`entryFile` fields.
- **Anti-drift guarantee:** `matchesExpected` is exported from the emitter and is the ONLY place match semantics live — Wave-3's runner imports it verbatim.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared replay mechanics helper** - `0dc1e6f` (feat)
2. **Task 2: Emitter refusal gate + baseline-diff materializer** (TDD):
   - `acfc5ff` (test) - failing Tests A-G, G2, G3 (judgeRefusal/materializeFixtureFiles absent)
   - `0e7345d` (feat) - implementation, all 9 tests green
3. **Task 3: Emitter compose + RED self-check + CLI** (TDD):
   - `4e56a5b` (test) - failing Tests H-K (composeEntry/writeMatrixEntry/matchesExpected absent)
   - `c92eaf3` (feat) - implementation, all 13 tests green

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `test/helpers/capture-regression-runner.ts` - `replayCaptureRegressionEntry`: shared isolated-copy + drive-tool + optional-mutate-reload + normalize replay mechanics (the D-05 self-check and Wave-3 runner both call this) (133 lines)
- `test/unit/tools/capture-regression-runner.test.ts` - RUN_AGDA_INTEGRATION-gated coverage for the plain and mutation-round-trip replay shapes, against synthetic single-file fixture roots (145 lines)
- `scripts/emit-regression.mjs` - the complete emitter: `judgeRefusal`, `materializeFixtureFiles`, `composeEntry`, `writeMatrixEntry`, `matchesExpected`, `scriptMain` + internal `stripFixtureDirPrefix`/`insertBrokenSuffix`/`writeFixtureFile` (446 lines)
- `test/unit/tools/emit-regression.test.ts` - 13 tests (A-G, G2, G3, H-K): pure logic + filesystem, zero real Agda spawn (445 lines)

## Decisions Made
- Reused `cpSync` (with the `_build`/`.agda-mcp-tmp-*` filter) for the isolated fixtureDir copy, mirroring `mcp-end-to-end-parity.test.ts`'s existing `isolateFixtures()` precedent, rather than hand-rolling a recursive copier.
- `judgeRefusal`'s three trust/soundness refusals are hard (never `--force`-overridable); only the "nothing meaningful to lock" refusal honors `--force`, per the plan's `<behavior>` block.
- No `--entry-file` CLI flag: `entryFile` is always derived from the artifact by `materializeFixtureFiles` (via `findWarmLoadTuple`), never accepted as user input — matches the plan's explicit BLOCKER-fix instruction.
- Matrix write uses `writeFileAtomic`; the whole array is re-serialized on every append with a duplicate-`id` refusal guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `materializeFixtureFiles` returns `writtenFiles` (not documented in the interface sketch but required by the plan's own action text)**
- **Found during:** Task 2 (materializer implementation)
- **Issue:** The plan's `<action>` text for Task 3's `scriptMain` requires step (d)/(e) to "delete the fixture files just written in step (b) (roll back)" on a non-RED self-check or `--dry-run` — but the interface sketch for `materializeFixtureFiles` only names `{ mutation, entryFile }` as its return. Without the absolute-path write list, `scriptMain` cannot roll back.
- **Fix:** `materializeFixtureFiles` returns `{ mutation, entryFile, writtenFiles }`; `writeFixtureFile` returns the absolute path written (or `null` on a skipped traversal entry) so the list is exact. Test F asserts on `writtenFiles` directly.
- **Files modified:** `scripts/emit-regression.mjs`, `test/unit/tools/emit-regression.test.ts`
- **Verification:** Tests F/G2/G3 assert both the write locations and the returned metadata; the full-chain smoke test confirmed rollback-eligible paths are exact.
- **Committed in:** `0e7345d` (Task 2), consumed in `c92eaf3` (Task 3)

**2. [Rule 2 - Missing Critical] `insertBrokenSuffix` handles extension-less and directory-prefixed bare paths**
- **Found during:** Task 2 (materializer implementation)
- **Issue:** The plan specifies inserting `.broken` before the file extension (`Dep.agda` → `Dep.broken.agda`) but does not define behavior for a bare path with no extension or one that still carries a subdirectory segment — either would corrupt the write target.
- **Fix:** `insertBrokenSuffix` splits off any directory prefix, then appends `.broken` before the extension (or as a trailing suffix when there is no extension), preserving the directory.
- **Files modified:** `scripts/emit-regression.mjs`
- **Verification:** Test G2 asserts `Dep.agda` → `Dep.broken.agda`; the extension-less branch is covered by construction.
- **Committed in:** `0e7345d` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 blocking return-shape fix, 1 missing-critical edge-case fix)
**Impact on plan:** Both are minor completeness fixes strictly inside this plan's own new files, required to satisfy the plan's own `scriptMain` rollback requirement and the mutation-payload naming contract. No scope creep, no change to any other file, no behavior beyond what the plan specified.

## Issues Encountered
- **Node/toolchain bootstrap:** the worktree had no `node_modules` and the repo pins Node >= 24 (via `.nvmrc`/mise), while the ambient `node` on PATH was 22. Ran all `npm`/`npx`/`tsx` commands through `mise exec --` (which resolves the worktree's pinned Node 24.16.0) after a one-time `npm install`. No source or config change; purely an execution-environment detail.

## TDD Gate Compliance

Tasks 2 and 3 (`tdd="true"`) each followed the full RED → GREEN cycle:
- Task 2 RED gate: `acfc5ff` `test(03-02): add failing tests for emitter refusal gate + materializer` — confirmed failing on the missing module import (Tests A-G, G2, G3).
- Task 2 GREEN gate: `0e7345d` `feat(03-02): implement emitter refusal gate + materializer` — all 9 tests pass.
- Task 3 RED gate: `4e56a5b` `test(03-02): add failing tests for emitter compose/write/self-check` — confirmed 4 new failures (composeEntry/writeMatrixEntry/matchesExpected absent), 9 prior tests still green.
- Task 3 GREEN gate: `c92eaf3` `feat(03-02): implement emitter compose/self-check/CLI` — all 13 tests pass.

No REFACTOR commits were needed. Gate sequence (`test(...)` precedes `feat(...)`) verified via `git log --oneline`. Compliant.

## Known Stubs
None. Every exported function is fully implemented and unit-tested. The capture-regression matrix (`test/fixtures/capture-regression-matrix.json`) remains the empty `[]` seed from Plan 01 — this is by design (D-09 part 1: no hand-authored entries; Wave 3 appends the real flagship entry by running the emitter against a genuine capture). The emitter's `scriptMain` was manually smoke-tested against a real capture (refusal path) and its `materialize → compose → replay` chain against a real two-file Agda fixture + real mutation + real reload, but per the plan's own success criteria ("Zero real captures or matrix entries exist yet — this plan proves the mechanism, Wave 3 proves it against the real flagship") no matrix entry is written by this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 3 (03-03) can import `replayCaptureRegressionEntry` and `matchesExpected` directly for its generic vitest runner, and invoke `scripts/emit-regression.mjs` against the real #64/#61 flagship capture (baseline + false-green) to append the first matrix entry and demonstrate RED.
- The fixtureDir double-prepend BLOCKER (flagged in the wave-2 cross-plan review) is closed and regression-tested (Tests G2/G3), so the flagship's nested-projectRoot capture shape will materialize correctly.
- No blockers identified for 03-03.

---
*Phase: 03-regression-lock-pipeline*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 4 created files confirmed present on disk (`test/helpers/capture-regression-runner.ts`, `test/unit/tools/capture-regression-runner.test.ts`, `scripts/emit-regression.mjs`, `test/unit/tools/emit-regression.test.ts`) plus this SUMMARY; all 5 task commits (`0dc1e6f`, `acfc5ff`, `0e7345d`, `4e56a5b`, `c92eaf3`) confirmed present in `git log`. Full unit suite green (1190 passed / 17 skipped); the plan's `<verification>` (`RUN_AGDA_INTEGRATION=1 npm run build` then the two named test files) passes 15/15, and `grep materializeSources scripts/emit-regression.mjs` returns nothing (CR-01 materializer never copied).
