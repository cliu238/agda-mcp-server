// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/flake-classify.mjs's
// classifyFlakiness(): the N-times warm-replay stability check
// (success criterion 4). Fully DI-driven — every test injects a fake
// materializeCaptureEnvironment/createMcpHarness via `options.deps`,
// so no real Agda/subprocess cost is ever paid here (the real-Agda
// proof lives in test/integration/mcp/dogfood-flake-classify-live.test.ts).

import { expect, test, vi } from "vitest";

// @ts-expect-error script module lacks types
import { classifyFlakiness } from "../../../scripts/dogfood/flake-classify.mjs";

function loadAction(tool: string, args: Record<string, unknown>, file: string, classification: string) {
  return {
    tool,
    args,
    timestamp: Date.now(),
    normalizedResponse: {
      data: {
        file,
        success: true,
        goalCount: 0,
        invisibleGoalCount: 0,
        hasHoles: false,
        classification,
        errors: [],
        warnings: [],
      },
    },
  };
}

function baseArtifact(recordedActions: unknown[] = []) {
  return {
    capturedAt: new Date().toISOString(),
    manifest: {
      agdaVersion: null,
      agdaBinaryPath: "agda",
      serverVersion: "0.0.0-test",
      node: process.version,
      os: `${process.platform}-${process.arch}`,
      cwd: process.cwd(),
      repoRoot: "/tmp/fake-repo",
      mergedArgv: [],
      agdaDirContents: null,
      buildMode: "unknown",
      importClosureHash: null,
      inlinedFirstPartySources: [],
    },
    recordedActions,
    oracleSubstrate: null,
    dedup: { kind: "new-bug", fingerprint: "test-fingerprint", recurrence: 1 },
  };
}

/** A fake harness whose `callTool` yields the given classifications in
 *  order (the last entry repeats if `callTool` is invoked more times
 *  than the array's length — never needed by these tests, but keeps
 *  the fake total). `close` is its own spy so tests can assert cleanup
 *  happened without caring about its return value. */
function fakeHarnessReturning(classifications: Array<string | null>) {
  let call = 0;
  const callTool = vi.fn(async () => {
    const classification = classifications[Math.min(call, classifications.length - 1)];
    call += 1;
    return { structuredContent: { data: { classification } } };
  });
  const close = vi.fn(async () => {});
  return { callTool, close };
}

// ── Test 1 (Pitfall 4 gate): no load-family action -> not-applicable, zero dep calls ──

test("classifyFlakiness: an artifact with an empty recordedActions array returns not-applicable without calling any injected dep", async () => {
  const artifact = baseArtifact([]);
  const materializeSpy = vi.fn();
  const createHarnessSpy = vi.fn();

  const result = await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  expect(result).toEqual({ classification: "not-applicable" });
  expect(materializeSpy).not.toHaveBeenCalled();
  expect(createHarnessSpy).not.toHaveBeenCalled();
});

test("classifyFlakiness: a recordedActions array with no load-family tool also returns not-applicable without calling any injected dep", async () => {
  const artifact = baseArtifact([loadAction("agda_case_split", { goalId: 0 }, "Main.agda", "ok-complete")]);
  const materializeSpy = vi.fn();
  const createHarnessSpy = vi.fn();

  const result = await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  expect(result).toEqual({ classification: "not-applicable" });
  expect(materializeSpy).not.toHaveBeenCalled();
  expect(createHarnessSpy).not.toHaveBeenCalled();
});

// ── Test 2: N replays that all agree -> deterministic ────────────────

test("classifyFlakiness: N replays that all agree on the same classification report deterministic", async () => {
  const action = loadAction("agda_load", { file: "Main.agda" }, "Main.agda", "ok-complete");
  const artifact = baseArtifact([action]);

  const materializeSpy = vi.fn(async () => ({ tmpDir: "/fake", cleanup: vi.fn() }));
  const harness = fakeHarnessReturning(["ok-complete", "ok-complete", "ok-complete"]);
  const createHarnessSpy = vi.fn(async () => harness);

  const result = await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  expect(result).toEqual({
    classification: "deterministic",
    observedClassifications: ["ok-complete", "ok-complete", "ok-complete"],
  });
});

// ── Test 3: N replays that disagree -> flaky ─────────────────────────

test("classifyFlakiness: N replays that disagree on classification report flaky", async () => {
  const action = loadAction("agda_load", { file: "Main.agda" }, "Main.agda", "ok-complete");
  const artifact = baseArtifact([action]);

  const materializeSpy = vi.fn(async () => ({ tmpDir: "/fake", cleanup: vi.fn() }));
  const harness = fakeHarnessReturning(["ok-complete", "type-error", "ok-complete"]);
  const createHarnessSpy = vi.fn(async () => harness);

  const result = await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  expect(result.classification).toBe("flaky");
  expect(result.observedClassifications).toEqual(["ok-complete", "type-error", "ok-complete"]);
});

// ── Test 4: exactly n independent fresh materializations/sessions ────

test("classifyFlakiness: materializeCaptureEnvironment and createMcpHarness are each called exactly n times, not reused across iterations", async () => {
  const action = loadAction("agda_load", { file: "Main.agda" }, "Main.agda", "ok-complete");
  const artifact = baseArtifact([action]);

  const materializeSpy = vi.fn(async () => ({ tmpDir: "/fake", cleanup: vi.fn() }));
  const harness = fakeHarnessReturning(["ok-complete", "type-error", "ok-complete"]);
  const createHarnessSpy = vi.fn(async () => harness);

  await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  expect(materializeSpy).toHaveBeenCalledTimes(3);
  expect(createHarnessSpy).toHaveBeenCalledTimes(3);
  expect(harness.close).toHaveBeenCalledTimes(3);
});

// ── Test 5: replay is faithful to the artifact's own recorded tool+args ──

test("classifyFlakiness: replays the SAME tool+args as the artifact's own last load-family recordedAction, not a hardcoded default", async () => {
  const args = { file: "Sub/Main.agda", ignoreAllInterfaces: true };
  const action = loadAction("agda_load_no_metas", args, "Sub/Main.agda", "ok-complete");
  const artifact = baseArtifact([action]);

  const materializeSpy = vi.fn(async () => ({ tmpDir: "/fake", cleanup: vi.fn() }));
  const harness = fakeHarnessReturning(["ok-complete", "ok-complete", "ok-complete"]);
  const createHarnessSpy = vi.fn(async () => harness);

  await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  expect(harness.callTool).toHaveBeenCalledTimes(3);
  for (const call of harness.callTool.mock.calls) {
    expect(call[0]).toBe("agda_load_no_metas");
    expect(call[1]).toEqual(args);
  }
});

// ── Extra: last load-family action wins when multiple are present ────

test("classifyFlakiness: uses the LAST load-family recordedAction when multiple are present", async () => {
  const firstArgs = { file: "First.agda" };
  const lastArgs = { file: "Second.agda" };
  const artifact = baseArtifact([
    loadAction("agda_load", firstArgs, "First.agda", "ok-complete"),
    loadAction("agda_case_split", { goalId: 0 }, "Second.agda", "ok-complete"),
    loadAction("agda_typecheck", lastArgs, "Second.agda", "ok-complete"),
  ]);

  const materializeSpy = vi.fn(async () => ({ tmpDir: "/fake", cleanup: vi.fn() }));
  const harness = fakeHarnessReturning(["ok-complete", "ok-complete", "ok-complete"]);
  const createHarnessSpy = vi.fn(async () => harness);

  await classifyFlakiness(artifact, 3, {
    deps: { materializeCaptureEnvironment: materializeSpy, createMcpHarness: createHarnessSpy },
  });

  for (const call of harness.callTool.mock.calls) {
    expect(call[0]).toBe("agda_typecheck");
    expect(call[1]).toEqual(lastArgs);
  }
});
