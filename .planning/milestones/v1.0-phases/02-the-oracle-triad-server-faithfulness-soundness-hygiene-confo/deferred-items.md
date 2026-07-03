# Deferred Items — Phase 02, Plan 01

Items discovered incidentally while executing 02-01-PLAN.md but out of scope for this
plan's tasks (per the executor's SCOPE BOUNDARY rule — only auto-fix issues directly
caused by the current task's changes).

## Pre-existing `tsconfig.test.json` type errors (unrelated files)

While self-checking Task 1's edits, `npx tsc -p tsconfig.test.json --noEmit` was run as an
extra precaution (beyond the plan's own `<verify>` commands, which only use `vitest`).
`npx tsc -p tsconfig.json --noEmit` (the main build config used by `npm run build` /
`pretest`) is clean with zero errors. `tsconfig.test.json` (a separate, stricter config not
wired into any `npm run` script) reports pre-existing errors in files this plan never
touches:

- `test/helpers/typecheck-disposable.ts` — `LoadResult`/`TypeCheckResult` missing `profiling`
- `test/property/reporting/bug-report.property.test.ts` — `BugReportBundleInput` shape drift
- `test/property/session/session-snapshot.property.test.ts` — `SnapshotInput` missing `projectRootExists`
- `test/property/session/tool-recommendation.property.test.ts` — `ToolManifestEntry` missing `requiresLoadedSession`
- `test/unit/agda/command-serialization.test.ts` — implicit-`any` parameters
- `test/unit/agda/completeness.test.ts` — `LoadResult`/`TypeCheckResult` missing `profiling`
- `test/unit/agda/process-termination.test.ts` — `setTimeout`/`Timeout` type mismatches
- `test/unit/session/agda-transport.test.ts` — mock `ChildProcess` shape mismatches

None of these files are in either task's `<files>` list for 02-01-PLAN.md, and `npm test`
(`vitest run`, which does not type-check via `tsconfig.test.json`) is unaffected. Not fixed
here — flagged for a future gap-closure plan or a dedicated `tsconfig.test.json` hardening
pass.
