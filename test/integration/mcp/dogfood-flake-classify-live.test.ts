// MIT License — see LICENSE
//
// Real-Agda proof (Task 3 of Plan 05-03): the flagship #64/#61
// transitive-staleness false-green fixture (test/fixtures/agda/
// FixtureDeps/TransitiveStaleness/, now LOCKED post-Phase-3.1-fix)
// N-reruns as deterministic under scripts/dogfood/flake-classify.mjs's
// REAL classifyFlakiness() — no DI overrides, exercising the actual
// materializeCaptureEnvironment/createMcpHarness path end to end
// against 3 fresh, real Agda subprocesses.
//
// This test does NOT read test/fixtures/capture-regression-matrix.json
// (a DIFFERENT, incompatible schema serving Phase 3's own
// CaptureRegressionEntry replay mechanism) — it hand-constructs a
// minimal CaptureArtifact-shaped object instead, the shape
// classifyFlakiness actually consumes, representing "a capture taken
// AFTER Dep.agda had already been mutated to the broken content
// underneath the session" (the real historical false-green shape).
//
// Gated with the SAME agdaAvailable && RUN_AGDA_INTEGRATION === "1"
// idiom every test/integration/mcp/*.test.ts file in this repo uses.
// Requires a real `npm run build`-produced dist/index.js (`pretest`
// already guarantees this for `npm test`; a standalone `vitest run`
// invocation must `npm run build` first — see this file's own
// verification command in 05-03-PLAN.md).

import { beforeAll, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { classifyFlakiness } from "../../../scripts/dogfood/flake-classify.mjs";

import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

const FIXTURE_DIR = join(SERVER_REPO_ROOT, "test/fixtures/agda/FixtureDeps/TransitiveStaleness");

let mainSource: string;
let depBrokenSource: string;

beforeAll(() => {
  mainSource = readFileSync(join(FIXTURE_DIR, "Main.agda"), "utf8");
  depBrokenSource = readFileSync(join(FIXTURE_DIR, "Dep.broken.agda"), "utf8");
});

it(
  "classifyFlakiness: the flagship #64/#61 transitive-staleness fixture (post-fix) N-reruns as deterministic type-error across 3 fresh warm sessions",
  async () => {
    const artifact = {
      capturedAt: new Date().toISOString(),
      manifest: {
        inlinedFirstPartySources: [
          { path: "FixtureDeps/TransitiveStaleness/Main.agda", content: mainSource },
          // The historical false-green shape: Dep.agda's INLINED
          // content is the BROKEN (mutated) content, written under the
          // Dep.agda path — simulating a capture taken after Dep.agda
          // changed underneath a warm session (Nat -> Bool on
          // getValue's result type, the exact #64/#61 trigger).
          { path: "FixtureDeps/TransitiveStaleness/Dep.agda", content: depBrokenSource },
        ],
        agdaDirContents: null,
      },
      recordedActions: [
        {
          tool: "agda_load_no_metas",
          args: { file: "FixtureDeps/TransitiveStaleness/Main.agda" },
          timestamp: Date.now(),
          normalizedResponse: {
            data: {
              file: "FixtureDeps/TransitiveStaleness/Main.agda",
              success: true,
              goalCount: 0,
              invisibleGoalCount: 0,
              hasHoles: false,
              // Represents what the HISTORICAL false-green capture
              // would have recorded — classifyFlakiness never
              // compares against this warm value, it only uses this
              // shape to satisfy findWarmLoadTuple's applicability
              // gate (Pitfall 4).
              classification: "ok-complete",
              errors: [],
              warnings: [],
            },
          },
        },
      ],
      dedup: { kind: "new-bug", fingerprint: "dogfood-flake-live-test", recurrence: 1 },
      triage: null,
      oracleSubstrate: null,
    };

    // No forced serverEnv/idle-timing override — the fix must hold
    // under this test's own default timing, not only the pathological
    // fast-idle env Phase 3.1's own regression fixture forces to
    // reliably TRIGGER the original bug.
    const result = await classifyFlakiness(artifact, 3);

    expect(result.classification).toBe("deterministic");
    expect(result.observedClassifications).toEqual(["type-error", "type-error", "type-error"]);
  },
  60_000,
);
