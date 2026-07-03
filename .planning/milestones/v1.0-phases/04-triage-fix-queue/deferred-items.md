# Deferred Items — Phase 04 (Triage / Fix Queue)

Out-of-scope discoveries logged during plan execution per the executor's
SCOPE BOUNDARY rule (issues not directly caused by the current task's
changes are logged here, not fixed).

## Plan 04-03

- **`npx tsc -p tsconfig.test.json --noEmit` reports pre-existing errors
  in unrelated files** — `test/unit/session/agda-transport.test.ts`,
  `test/unit/session/tool-recommendation.test.ts`,
  `test/unit/tools/emit-regression.test.ts`,
  `test/unit/tools/oracle-orcl-01.test.ts`,
  `test/unit/tools/oracle-orcl-02.test.ts`,
  `test/unit/tools/oracle-orcl-03.test.ts`,
  `test/unit/tools/oracle-run-oracle.test.ts`,
  `test/unit/tools/output-schema-invariants.test.ts`. None of these
  files were touched by this plan (04-03 only modifies
  `test/fixtures/fix-queue.json`, `scripts/queue/seed-initial-cargo.mjs`,
  and `test/unit/fixtures/fix-queue.test.ts`, all of which typecheck
  cleanly under the same config). This separate `tsconfig.test.json`
  compile step is not part of `npm test` (`vitest run`) or `npm run
  build` (`tsc -p tsconfig.json`, confirmed clean) — both of which pass.
  Not fixed here per the SCOPE BOUNDARY rule; flagged for a future
  maintainer pass on `tsconfig.test.json`.
