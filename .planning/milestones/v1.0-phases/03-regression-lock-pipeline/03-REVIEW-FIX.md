---
phase: 03-regression-lock-pipeline
review_path: .planning/phases/03-regression-lock-pipeline/03-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 5
fixed: 5
skipped: 0
iteration: 1
status: all_fixed
applied: 2026-07-02
---

# Phase 3: Code Review Fix Report

**Scope:** Critical + Warning (Info findings IN-01..IN-04 intentionally out of scope — `--all` not passed).

Applied directly by the orchestrator after the gsd-code-fixer agent stalled (no commits/edits — clean re-entry). Each fix is committed atomically with a regression test where testable.

## Fixes Applied

| Finding | Severity | Commit | Change |
|---------|----------|--------|--------|
| CR-01 | BLOCKER | (fix(03): CR-01 …) | `writeFixtureFile` now sandboxes against `<repoRoot>/test/fixtures/agda/` (containing `fixtureDir` then `barePath`), not the whole `repoRoot` — a `..`-laden artifact path can no longer overwrite arbitrary tracked files while staying inside the repo. Regression test added (Test F2: an escape resolving inside the repo but outside the fixtures tree is skipped, the in-repo `src/index.ts` sentinel untouched). |
| CR-02 | BLOCKER | (fix(03): CR-02 …) | `judgeRefusal` fails closed (before any write) when `--force` is applied to a coldTuple-less ORCL-01 outcome (pass/skip); `composeEntry` throws a legible Error instead of an `undefined.classification` TypeError. Tests D (updated) + D2 (new). |
| WR-01 | WARNING | (fix(03): WR-01 …) | `scriptMain` hoists `writtenFiles` into catch scope and calls `rollbackWrittenFiles` on any post-materialization throw, so a failed emit never orphans fixtures in the tracked tree. |
| WR-02 | WARNING | (fix(03): WR-02 …) | Replaced `test.fails` for `status:"red"` entries with a plain `test` asserting the defect is still live (`matchesExpected(...) === false`). Harness throws now fail loudly instead of being masked as "expected fail"; a genuine Phase-03.1 fix flips the assertion to force promotion to `locked`. The flagship now runs green (defect live) rather than as an "expected fail". |
| WR-03 | WARNING | (fix(03): WR-03 …) | Appended `randomUUID()` to the staged capture filename so two separate server processes (each with a counter reset to 0) can't clobber across restarts. Counter retained for intra-process ordering. `tsc` clean; UUID-shape assertion added to the collision test. |

## Info findings NOT fixed (out of scope)

- IN-01: global `passWithNoTests` could mask a mis-globbed run (prefer a sentinel task).
- IN-02: emitter CLI doesn't validate required flags up front.
- IN-03: `matchesExpected` hand-mirrors ORCL-01's comparator (structural reuse preferred).
- IN-04: G2/G3 assert filenames but not baseline-vs-primary content routing.

These are non-blocking robustness/clarity items; leave for a future `--all` pass or a follow-up.

## Verification

- `npx tsc -p tsconfig.json --noEmit` — clean.
- `npx vitest run test/unit/tools/emit-regression.test.ts` — 15 passed (incl. new F2, D2).
- `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` — 1 passed (flagship, defect-live green).
- `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/register-capture-session.test.ts` — 3 passed (incl. UUID assertion).
- Full `npm test` — 1471 passed / 173 skipped, 0 failures.

## Status: all_fixed
