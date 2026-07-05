---
phase: 09-residual-v1-0-debt-sweep
plan: 04
subsystem: testing
tags: [typescript, vitest, tsconfig, zod, fast-check]

# Dependency graph
requires: []
provides:
  - 20 of the 21 tsconfig.test.json-erroring files (per the 2026-07-04 live audit) now compile with zero tsc errors
  - The `@ts-expect-error` multi-line-import placement fix applied consistently across 8 files, reusing test-all-continuing.test.ts's own precedent
  - ReplayManifest properly typed (not Record<string, unknown>) in 3 oracle test files' FakeArtifact mocks
  - W5 closed: dogfood-wrapup-filing.test.ts's mocked upsertQueueEntry payload is now schema-validated against the real fixQueueEntrySchema in two distinct filing code paths
affects: [09-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step `as unknown as X` cast for type-incompatible mock assignments (matches process-termination.test.ts's own pre-existing idiom)"
    - "@ts-expect-error placed on the closing `} from \"...\";` line of a multi-line import, not above `import {` — TS only suppresses the line immediately below the directive"

key-files:
  created: []
  modified:
    - test/helpers/capture-regression-runner.ts
    - test/helpers/typecheck-disposable.ts
    - test/property/reporting/bug-report.property.test.ts
    - test/property/session/session-snapshot.property.test.ts
    - test/property/session/tool-recommendation.property.test.ts
    - test/unit/agda/command-serialization.test.ts
    - test/unit/agda/completeness.test.ts
    - test/unit/agda/process-termination.test.ts
    - test/unit/session/tool-recommendation.test.ts
    - test/unit/tools/dogfood-agent-log-selection.test.ts
    - test/unit/tools/dogfood-upload-run.test.ts
    - test/unit/tools/dogfood-wrapup-filing.test.ts
    - test/unit/tools/dogfood-wrapup-upload-chain.test.ts
    - test/unit/tools/emit-regression.test.ts
    - test/unit/tools/oracle-orcl-01.test.ts
    - test/unit/tools/oracle-orcl-02.test.ts
    - test/unit/tools/oracle-orcl-03.test.ts
    - test/unit/tools/oracle-run-oracle.test.ts
    - test/unit/tools/output-schema-invariants.test.ts
    - test/unit/tools/team-issue-key.test.ts

key-decisions:
  - "W5's 'Test 3 and Test 7' targets are positional (the 3rd and 7th sequential test() calls in the file), not the file's own comment-banner numbering — comment-Test-7 (POLICY-01, line ~262) never calls upsertQueueEntry, so it cannot host the schema assertion; positional-Test-7 is comment-Test-6 (the ORCL-01+ORCL-02-cheat precedence test), which does file"
  - "Fixed a Rule-1 masked bug in output-schema-invariants.test.ts: two LoadResult/TypeCheckResult literals declared `context: unknown[]` where AgdaGoal requires `context: string[]`; this was hidden behind the higher-priority 'missing profiling' error and only surfaced once profiling was added"

requirements-completed: [DEBT-06]

# Metrics
duration: ~20min
completed: 2026-07-04
---

# Phase 9 Plan 04: tsconfig.test.json Cleanup (20 files) Summary

**Cleared 20 of 21 tsconfig.test.json-erroring test files to zero tsc errors via six mechanical error families (missing `profiling`/`requiresLoadedSession`/`projectRootExists` fields, `@ts-expect-error` multi-line-import placement, `ReplayManifest` mistyped as `Record<string,unknown>`, and mock-arity inference collapse), plus closed the W5 audit gap by schema-validating dogfood-wrapup-filing.test.ts's mocked fix-queue entries against the real `fixQueueEntrySchema`.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-04T15:36:11-04:00 (approx., phase-start commit)
- **Completed:** 2026-07-04T15:57:00-04:00 (approx.)
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- All 20 files this plan owns compile cleanly under `npx tsc -p tsconfig.test.json --noEmit` — confirmed by re-running the full tsc check after every single file edit (per plan discipline) and once more at the end; only the out-of-scope `test/unit/session/agda-transport.test.ts` (deferred to plan 09-06) still errors.
- `@ts-expect-error` placement fixed in 8 files by moving the directive from above `import {` to directly above the closing `} from "...";` line, reusing this repo's own working precedent in `test-all-continuing.test.ts` rather than inventing a new workaround.
- W5 (v1.0 audit residual, folded into this plan since it already owned `dogfood-wrapup-filing.test.ts`) closed: imported the real `fixQueueEntrySchema` and added `expect(() => fixQueueEntrySchema.parse(upsertFn.mock.calls[0][0])).not.toThrow()` to the two tests that actually file a queue entry through two structurally distinct code paths (a plain ORCL-01 candidate, and the ORCL-01+ORCL-02-cheat precedence path) — both pass against the real production `buildQueueEntryFromVerdict` output.
- Full `npm test` (build + vitest run) is green: 214 test files passed / 16 skipped, 1791 tests passed / 179 skipped, zero failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix independent type-literal and cast defects (9 files)** - `865740f` (fix)
2. **Task 2: Fix @ts-expect-error placement, ReplayManifest typing, and mock-arity defects (11 files)** - `6720cec` (fix)

**Plan metadata:** (this commit) `docs(09-04): complete tsconfig.test.json cleanup plan`

## Files Created/Modified

- `test/helpers/typecheck-disposable.ts` - Return `profiling: result.profiling` (the real value) instead of omitting the now-required `TypeCheckResult` field
- `test/helpers/capture-regression-runner.ts` - Two-step cast `(result.structuredContent as { data: unknown }).data as {...}` instead of a single unsafe cast off an `unknown`-typed field
- `test/property/reporting/bug-report.property.test.ts` - Assign the spread to a typed `const withNewTitle: BugReportBundleInput` before calling `fingerprintBugReport`, avoiding an excess-property check on an inline literal
- `test/property/session/session-snapshot.property.test.ts` - Add `projectRootExists: fc.boolean()` to the `SnapshotInput` generator
- `test/property/session/tool-recommendation.property.test.ts` - Add `requiresLoadedSession` (13 entries, mapped session/reporting→false, proof/process/navigation→true per `manifest.ts`'s own doc comment)
- `test/unit/session/tool-recommendation.test.ts` - Same `requiresLoadedSession` fix (13 fakeManifest entries + 1 one-off literal at the "only recommends tools from the manifest" test)
- `test/unit/agda/completeness.test.ts` - Add `profiling: null` to two `LoadResult`/`TypeCheckResult` literals
- `test/unit/agda/command-serialization.test.ts` - Annotate 3 implicit-any mock param lists (`_proc: unknown, _cmd: unknown, options: { armEscalation?: boolean } | undefined`)
- `test/unit/agda/process-termination.test.ts` - Convert two single-step casts (`as typeof setTimeout`, `as NodeJS.Timeout`) to two-step `as unknown as X`, matching the file's own pre-existing idiom
- `test/unit/tools/dogfood-agent-log-selection.test.ts` - `@ts-expect-error` moved to the closing import line
- `test/unit/tools/emit-regression.test.ts` - Same `@ts-expect-error` fix
- `test/unit/tools/oracle-orcl-02.test.ts` - Same `@ts-expect-error` fix
- `test/unit/tools/team-issue-key.test.ts` - Same `@ts-expect-error` fix
- `test/unit/tools/output-schema-invariants.test.ts` - Add `profiling: null` to 5 literal/baseline sites; fix a masked `context: unknown[]` vs. `AgdaGoal`'s `context: string[]` mismatch (Rule 1 — see Deviations)
- `test/unit/tools/oracle-orcl-01.test.ts` - `@ts-expect-error` fix + `FakeArtifact.manifest`/`baseArtifact` overrides retyped from `Record<string, unknown>` to `ReplayManifest`/`Partial<ReplayManifest>`
- `test/unit/tools/oracle-orcl-03.test.ts` - Same `@ts-expect-error` + `ReplayManifest` fix
- `test/unit/tools/oracle-run-oracle.test.ts` - `ReplayManifest` fix only (its imports were already single-line, no `@ts-expect-error` placement issue)
- `test/unit/tools/dogfood-upload-run.test.ts` - `@ts-expect-error` fix; cast `withEnvOverride(...)`'s awaited result to `{ stagingDir: string; cleanup: () => void }` at both call sites; give the `flushRetryQueue` fetch mock two ignored params so `.mock.calls[0]` indexes as a real tuple
- `test/unit/tools/dogfood-wrapup-filing.test.ts` - `@ts-expect-error` fix; give `runOracleFn` two ignored params in the two POLICY-01 tests; import `fixQueueEntrySchema` and add the W5 schema-conformance assertion to the two tests that file
- `test/unit/tools/dogfood-wrapup-upload-chain.test.ts` - Give the `spawn` mock three REQUIRED (non-optional) ignored params so the destructure and `.shell` access both resolve without an undefined check

## Decisions Made

- **W5's "Test 3 and Test 7" are positional, not comment-label numbers.** The file's own `// ── Test N ──` comment banners are non-sequential (there's a "Test 4b"), so "Test 7" per the interfaces spec means the 7th `test(...)` call in source order, which is the comment-labeled "Test 6" (the ORCL-01+ORCL-02-cheat precedence test) — not the comment-labeled "Test 7" (POLICY-01 key-wiring), which never calls `upsertQueueEntry` and so cannot host a `upsertFn.mock.calls[0][0]` assertion. Verified this reading is the only one consistent with the spec's own caveat that Test 1 is excluded "because it asserts upsertFn NOT called" — the same logic excludes comment-Test-7.
- **Fixed the masked `context: unknown[]` bug in `output-schema-invariants.test.ts` under Rule 1**, not left for a future plan — it was a genuine pre-existing type error masked by the higher-priority "missing profiling" diagnostic (TypeScript reports only one elaboration reason per failed object-literal assignability check), and leaving it would have kept the file failing `tsc` after the family-A fix landed. Both empty-array `goals` literals fixed identically; zero runtime behavior change (arrays are always empty at these two sites).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed masked `context: unknown[]` vs. `AgdaGoal.context: string[]` type mismatch in output-schema-invariants.test.ts**
- **Found during:** Task 2, after applying FAMILY A's `profiling: null` fix to this file
- **Issue:** Two local `baseline` object literals declared `goals: [] as Array<{ goalId: number; type: string; context: unknown[] }>`. This was always structurally incompatible with `AgdaGoal.context: string[]`, but TypeScript's object-literal assignability check only surfaces one elaboration reason at a time, and the "missing required property `profiling`" error took priority — so this second, independent error was invisible until the first was fixed.
- **Fix:** Changed both literals' annotation from `context: unknown[]` to `context: string[]`. Both arrays are always empty at these two call sites, so this is a pure type-annotation correction with zero behavioral change.
- **Files modified:** test/unit/tools/output-schema-invariants.test.ts
- **Verification:** `npx tsc -p tsconfig.test.json --noEmit` shows zero errors for this file; `npx vitest run test/unit/tools/output-schema-invariants.test.ts` passes with no new failures (part of the Task 2 batch run: 8 files, 105 passed, 6 skipped, 0 failed).
- **Committed in:** `6720cec` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule-1 bug fix)
**Impact on plan:** Necessary to reach the plan's own "zero tsc errors" success criterion for this file; no scope creep — same file, same task, type-only.

## Issues Encountered

None beyond the one deviation above. The live tsc error count at start of execution (95 errors / 21 files, per this plan's `<objective>`) matched this plan's 20-file inventory exactly once `test/unit/session/agda-transport.test.ts` (09-06's file) was excluded — no further drift beyond what the plan's `<interfaces>` section already diagnosed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npx tsc -p tsconfig.test.json --noEmit` now reports errors in exactly one file (`test/unit/session/agda-transport.test.ts`), which is plan 09-06's explicit scope — 09-06 can proceed immediately without any further drift-diagnosis work.
- The permanent CI gate DEBT-06/D-03 calls for (`tsc -p tsconfig.test.json --noEmit` as a CI step) is meaningful once 09-06 lands, since this plan cleared all but the one file 09-06 owns.
- W5 (v1.0 audit residual) is now fully closed and does not need separate tracking in a future plan.

---
*Phase: 09-residual-v1-0-debt-sweep*
*Completed: 2026-07-04*

## Self-Check: PASSED

- All 20 plan files + this SUMMARY.md verified present on disk.
- Both task commits (`865740f`, `6720cec`) verified present in `git log --oneline --all`.
