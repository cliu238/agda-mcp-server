import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/examples/**/*.test.ts",
      "test/unit/**/*.test.ts",
      "test/property/**/*.test.ts",
      "test/integration/**/*.test.ts",
    ],
    testTimeout: 30_000,
    // The capture-regression matrix (test/fixtures/capture-regression-
    // matrix.json) is data-driven — its ONE generic runner
    // (test/integration/mcp/capture-regression.test.ts) registers zero
    // `test()` calls when the matrix is empty (Plan 03-01's seed
    // state). Without this, vitest 4's collector treats a file with
    // zero collected tasks as an error ("No test suite found in
    // file"), which would make a legitimately-empty matrix fail the
    // suite — contradicting this phase's own requirement that "zero
    // entries is a valid, green, zero-test run" (03-03-PLAN.md
    // must_haves). No other file in this suite currently reaches zero
    // collected tasks (every other gated integration test still
    // registers `test.skip(...)` tasks even without
    // RUN_AGDA_INTEGRATION=1), so this only changes behavior for the
    // legitimately-empty-matrix case.
    passWithNoTests: true,
  },
});
