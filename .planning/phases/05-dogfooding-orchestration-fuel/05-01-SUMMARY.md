---
phase: 05-dogfooding-orchestration-fuel
plan: 01
subsystem: infra
tags: [zod, vitest, oracle-policy, fuel-corpora, task-manifest, dogfooding]

# Dependency graph
requires:
  - phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
    provides: "loadOraclePolicy() + oraclePolicySchema (scripts/oracle/orcl-02-soundness-scan.mjs), unchanged and reused as the cross-reference target for every new policyKey"
  - phase: 04-triage-fix-queue
    provides: "the matrix-as-SSOT typed-loader idiom (test/fixtures/fix-queue.ts) and the queue-intake.mjs hard-fail-with-clear-message shape mirrored here"
provides:
  - "scripts/data/fuel-corpora.json — PROC-02's pinned fuel-pointer manifest: 4 corpora at real, resolved 40-char commit SHAs, each cross-referencing a policyKey"
  - "3 new scripts/data/oracle-policy/*.json siblings (agda-stdlib, codex-homotopy-group, autoformalizing-hopf) validating against the existing oraclePolicySchema"
  - "test/fixtures/fuel-corpora.ts — typed loader exporting fuelCorpora/fuelCorpusEntrySchema/FuelCorpusEntry"
  - "test/fixtures/task-manifest-schema.ts — the PROC-01 task-manifest zod contract (schema only, no data instance)"
  - "scripts/dogfood/task-manifest.mjs — loadTaskManifest(), PROC-01's D-03 mechanical pre-flight hard gate"
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "matrix-as-SSOT typed-loader idiom (zod + loadValidatedJsonData) extended from test/fixtures/*.json siblings to a cross-directory scripts/data/*.json source"
    - "schema-only fixture module (task-manifest-schema.ts) with deliberately no committed data instance, for per-run/private-corpus data that must never be checked in"
    - "library-throws-never-exits hard-gate function: loadTaskManifest() throws descriptive Errors and never calls process exit APIs itself, leaving CLI-exit translation to the sole future caller (05-02's dogfood-run.mjs)"

key-files:
  created:
    - scripts/data/fuel-corpora.json
    - scripts/data/oracle-policy/agda-stdlib.json
    - scripts/data/oracle-policy/codex-homotopy-group.json
    - scripts/data/oracle-policy/autoformalizing-hopf.json
    - test/fixtures/fuel-corpora.ts
    - test/unit/fixtures/fuel-corpora.test.ts
    - test/fixtures/task-manifest-schema.ts
    - scripts/dogfood/task-manifest.mjs
    - test/unit/tools/dogfood-task-manifest.test.ts
  modified: []

key-decisions:
  - "codex-homotopy-group and autoformalizing-hopf oracle-policy files mirror agda-unimath.json's sanctioned axioms/required flags verbatim, since both corpora build on agda-unimath (D-02)."
  - "agda-stdlib's oracle-policy file is intentionally near-empty (no sanctioned axioms/required flags) — it is a general-purpose library with no HoTT/univalent axiom regime, so ORCL-02 honestly reports against an empty whitelist rather than a fabricated one."
  - "fuel-corpora.json is a bare top-level array (not an object wrapper), matching the existing capture-regression-matrix.json/fix-queue.json bare-array convention for a list of like entries."

patterns-established:
  - "Pattern: cross-directory typed loader — test/fixtures/fuel-corpora.ts reads scripts/data/fuel-corpora.json (two directories away) via loadValidatedJsonData(import.meta.dirname, \"../../scripts/data/fuel-corpora.json\", schema), the first typed-loader instance whose JSON source is NOT a same-directory sibling."
  - "Pattern: mechanical pre-flight hard gate as a pure throwing library function (never process.exit/exitCode), so the eventual CLI caller owns the single translation point from thrown failure to process exit."

requirements-completed: [PROC-01, PROC-02]

# Metrics
duration: 12min
completed: 2026-07-02
---

# Phase 5 Plan 01: Fuel-Pointer Manifest + Task-Manifest Hard Gate Summary

**PROC-02's 4-corpus pinned fuel manifest (real 40-char SHAs + 3 new oracle-policy siblings) and PROC-01's `loadTaskManifest()` mechanical D-03 hard gate, both TDD'd against the existing zod/loadValidatedJsonData matrix-as-SSOT idiom.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-02T20:50:16-04:00 (worktree base commit)
- **Completed:** 2026-07-02T20:57:10-04:00 (last task commit)
- **Tasks:** 2 completed
- **Files modified:** 9 created, 0 modified

## Accomplishments
- `scripts/data/fuel-corpora.json` pins exactly the 4 D-02 fuel corpora (agda-stdlib, agda-unimath, codex-homotopy-group, autoformalizing-hopf) to real, resolved 40-character commit SHAs — every `policyKey` cross-resolves via the existing, unchanged `loadOraclePolicy()` to a non-null policy object.
- 3 new `scripts/data/oracle-policy/*.json` siblings formalize the per-corpus ORCL-02 policy: `agda-stdlib.json` intentionally near-empty, `codex-homotopy-group.json`/`autoformalizing-hopf.json` mirroring `agda-unimath.json`'s sanctioned axioms + required flags verbatim (both build on agda-unimath).
- `test/fixtures/fuel-corpora.ts` exports a validated typed loader (`fuelCorpora`/`fuelCorpusEntrySchema`/`FuelCorpusEntry`) mirroring `capture-regression-matrix.ts`'s idiom, adapted for a cross-directory JSON source.
- `test/fixtures/task-manifest-schema.ts` + `scripts/dogfood/task-manifest.mjs`'s `loadTaskManifest()` together implement PROC-01's D-03 mechanical hard gate: an undefined path, unparsable JSON, or an empty array all throw; a valid non-empty manifest is accepted and returned fully typed.
- All 10 new tests pass (5 fuel-corpora + 5 task-manifest, one test beyond the plan's 4 specified behaviors added for thoroughness on the notes-absent case); full existing suite (1535 tests, 187 files) remains green.

## Task Commits

Each task was committed atomically (TDD: test -> feat per task):

1. **Task 1: PROC-02 fuel-pointer manifest + 3 oracle-policy siblings + typed loader**
   - `09444d8` (test) — failing test for fuel-corpora manifest loader (RED)
   - `b30d72e` (feat) — fuel-corpora.json + 3 policy siblings + fuel-corpora.ts typed loader (GREEN)
2. **Task 2: PROC-01 task-manifest schema + loadTaskManifest() hard gate**
   - `04facba` (test) — failing test for loadTaskManifest hard gate (RED)
   - `b8d28ba` (feat) — task-manifest-schema.ts + task-manifest.mjs's loadTaskManifest() (GREEN)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `scripts/data/fuel-corpora.json` - PROC-02 pinned fuel-pointer manifest (4 entries: key/repo/access/pinnedRef/policyKey/notes)
- `scripts/data/oracle-policy/agda-stdlib.json` - near-empty ORCL-02 policy (no HoTT axiom regime)
- `scripts/data/oracle-policy/codex-homotopy-group.json` - ORCL-02 policy mirroring agda-unimath's axioms/flags; documents D-02's first-official-dogfood-run-target designation
- `scripts/data/oracle-policy/autoformalizing-hopf.json` - ORCL-02 policy mirroring agda-unimath's axioms/flags
- `test/fixtures/fuel-corpora.ts` - typed loader: `fuelCorpora`, `fuelCorpusEntrySchema`, `FuelCorpusEntry`
- `test/unit/fixtures/fuel-corpora.test.ts` - 5 tests: count/keys, SHA shape, policyKey cross-resolution, D-02 documentation
- `test/fixtures/task-manifest-schema.ts` - zod contract: `taskManifestEntrySchema`, `taskManifestSchema` (`.min(1)`), `TaskManifestEntry` — schema only, no data instance
- `scripts/dogfood/task-manifest.mjs` - `loadTaskManifest()`, the D-03 mechanical hard gate
- `test/unit/tools/dogfood-task-manifest.test.ts` - 5 tests: undefined path, non-JSON, empty array, valid entry (with/without notes)

## Decisions Made
- Mirrored `agda-unimath.json`'s policy shape exactly for the 3 new siblings, per the plan's explicit instruction — no new schema fields invented.
- Used the exact pinned SHAs already resolved in the plan text verbatim (constraint: do not invent/placeholder). Verified all 4 are well-formed 40-character hex strings before writing.
- `fuel-corpora.ts`'s relative path to its JSON source is `../../scripts/data/fuel-corpora.json` (cross-directory, not a same-directory sibling like every prior `test/fixtures/*.ts` loader) — deliberate per the plan, since the fuel-pointer manifest's SSOT lives alongside the `oracle-policy/` directory it cross-references.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded `task-manifest.mjs`'s doc comments to avoid a false acceptance-criteria failure**
- **Found during:** Task 2, acceptance-criteria verification
- **Issue:** The plan's acceptance criteria runs `grep -c "process.exit" scripts/dogfood/task-manifest.mjs` expecting `0` (this library function must never terminate the process itself). `grep`'s BRE treats `.` as "any character," so the prose in my first draft's JSDoc — "NEVER calls `process.exit`/sets `process.exitCode` itself" and "...becomes a process exit is Plan 05-02's..." — matched the pattern twice (`process` + any-char + `exit`), even though no actual `process.exit()`/`process.exitCode` call exists anywhere in the file. The literal grep check would have falsely reported non-compliance.
- **Fix:** Reworded the two comment lines to convey the same meaning ("NEVER terminates the runtime or sets an exit code itself"; "...becomes a non-zero CLI termination is Plan 05-02's...") without the literal `process`+anychar+`exit` substring, while keeping the actual code's behavior (no process-exit calls) unchanged.
- **Files modified:** `scripts/dogfood/task-manifest.mjs`
- **Verification:** `grep -c "process.exit" scripts/dogfood/task-manifest.mjs` now returns `0`; `grep -c "taskManifestSchema"` returns `3` (>= 1 required); all 5 task-manifest tests still pass.
- **Committed in:** `b8d28ba` (Task 2 commit — caught before commit, not a separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — comment wording, no functional code change)
**Impact on plan:** Cosmetic-only; no behavior change. No scope creep.

## Issues Encountered
- Ambient Node was v22.22.0 (repo requires >=24); used `mise exec node@24 --` for every `npm`/`npx` invocation per the parallel-execution instructions. `node_modules` was absent (fresh worktree) — ran `npm install` once up front.
- `npx vitest run` (bypassing `pretest`'s `npm run build`) initially showed 4 failing MCP integration tests (`Connection closed` — `dist/index.js` didn't exist yet). Ran `npm run build` once and re-ran; all 4 passed, confirming this was a build-order artifact of my invocation, not a regression. Full suite re-run after building: 187 test files / 1535 tests passed, 14 files / 174 tests skipped (pre-existing `RUN_AGDA_INTEGRATION`-gated skips), 0 failures.
- `npx tsc -p tsconfig.test.json --noEmit` (a stricter check than the plan's mandated `tsc -p tsconfig.json`, which only covers `src/**`) surfaces pre-existing type errors in unrelated files (`agda-transport.test.ts`, `tool-recommendation.test.ts`, `oracle-*.test.ts`, `output-schema-invariants.test.ts`, etc.) — none reference any file this plan touched, and `tsconfig.test.json` is not wired into any npm script or CI job. Left untouched per the scope-boundary rule (pre-existing failures in unrelated files are out of scope). The plan's own mandated command, `npx tsc -p tsconfig.json --noEmit`, is clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `scripts/data/fuel-corpora.json` + `test/fixtures/fuel-corpora.ts` are ready for Plan 05-04's runbook Skill to document the four pinned corpora by name, and for the wrap-up pipeline's policy cross-references.
- `scripts/dogfood/task-manifest.mjs`'s `loadTaskManifest()` is ready for Plan 05-02's `dogfood-run.mjs` to import directly as its pre-flight hard gate (the plan explicitly designed the throw-only contract for this hand-off — the CLI-exit translation lives in 05-02, not here).
- No blockers. `test/fixtures/task-manifest-schema.ts` deliberately ships with no committed task-manifest JSON data instance (schema only) — Plan 05-02 (or a real dogfood run) is expected to supply a real, per-run manifest via `--manifest`.

---
*Phase: 05-dogfooding-orchestration-fuel*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 9 created source/test files verified present on disk; all 4 task commit hashes (`09444d8`, `b30d72e`, `04facba`, `b8d28ba`) verified present in git history.
