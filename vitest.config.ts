import { configDefaults, defineConfig } from "vitest/config";

// CI-only quarantine for KNOWN pre-existing Linux+real-Agda lane deltas
// (fix-queue fb57abbe7df6dfe8, DEFERRED v1.1). Comma-separated file
// paths; set ONLY by .github/workflows/ci.yml's integration job so the
// lane keeps failing loudly on any NEW regression while the documented
// legacy set is excluded. Local runs are unaffected (env unset).
const ciQuarantine = (process.env.AGDA_MCP_CI_QUARANTINE ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...ciQuarantine],
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
