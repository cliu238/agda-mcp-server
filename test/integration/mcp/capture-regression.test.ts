// MIT License — see LICENSE
//
// The ONE generic capture-regression replay runner (D-01, D-04):
// iterates every entry in the capture-regression matrix and replays
// it at the MCP tool-call boundary via the shared
// `replayCaptureRegressionEntry` helper (Plan 03-02, Task 1), then
// asserts the observed result against the entry's `expected` value
// using the SAME `matchesExpected` comparator the emitter's own D-05
// self-check uses at emit time (`scripts/emit-regression.mjs`, Plan
// 03-02, Task 3) — so this runner and the emitter can never silently
// diverge on what counts as a match (Warning-2 fix).
//
// `status: "red"` entries run as `test.fails`: the suite stays green
// while the underlying defect is live, and vitest fails loudly the
// moment the wrapped assertion starts unexpectedly passing (forcing
// promotion to `status: "locked"`). `status: "locked"` entries run as
// a plain `test`.
//
// Zero matrix entries (Plan 03-01's seed state) is a legitimate,
// green, zero-test run — this file only drives whatever the matrix
// currently contains.

import { test, expect } from "vitest";
import { resolve } from "node:path";

import { detectAgdaVersion } from "../../helpers/agda-version.js";
import { replayCaptureRegressionEntry } from "../../helpers/capture-regression-runner.js";
import { captureRegressionMatrix } from "../../fixtures/capture-regression-matrix.js";
// @ts-expect-error script module lacks types
import { matchesExpected } from "../../../scripts/emit-regression.mjs";

const FIXTURES_ROOT = resolve(import.meta.dirname, "../../fixtures/agda");

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;

const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

for (const entry of captureRegressionMatrix) {
  const runEntry = entry.status === "red" ? it.fails : it;
  runEntry(`${entry.id}: ${entry.tool} matches ORCL-01 cold expected value`, async () => {
    const { observed } = await replayCaptureRegressionEntry(entry, FIXTURES_ROOT);
    expect(matchesExpected(observed, entry.expected)).toBe(true);
  });
}
