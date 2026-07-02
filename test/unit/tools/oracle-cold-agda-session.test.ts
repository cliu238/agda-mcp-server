// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/cold-agda-session.mjs: the shared
// disposable cold-Agda-session lifecycle (spawnColdAgdaSession) and
// the 7 named environment probes (runEnvironmentProbes) that ORCL-01
// (Plan 02-03) and ORCL-03 (Plan 02-04) both consume.

import { test, expect } from "vitest";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { spawnColdAgdaSession, runEnvironmentProbes } from "../../../scripts/oracle/cold-agda-session.mjs";

import { command, iotcmEnvelope, modeTopLevelCommand, quoted, stringList } from "../../../src/protocol/command-builder.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

interface ProbeResult {
  probe: string;
  ok: boolean;
  detail?: string;
}

function findProbe(probes: ProbeResult[], name: string): ProbeResult {
  const found = probes.find((p) => p.probe === name);
  if (!found) {
    throw new Error(`No probe named "${name}" in result set: ${JSON.stringify(probes)}`);
  }
  return found;
}

/** A synthetic input that passes all 7 probes — each test overrides
 *  only the field(s) relevant to the probe under test. */
function baseValidInput() {
  return {
    manifestAgdaVersion: "2.8.0",
    detectedAgdaVersion: "2.8.0",
    agdaDirContents: null,
    capturedImportClosureHash: null,
    recomputedImportClosureHash: null,
    buildDirExistedBeforeLoad: false,
    spawnError: null,
    attemptedAgdaBin: "agda",
    coldResponses: [{ kind: "InteractionPoints", interactionPoints: [] }],
    timedOut: false,
  };
}

// ── Test 1: spawnColdAgdaSession — real 2-command lifecycle ─────────
// (RUN_AGDA_INTEGRATION-gated: requires a local `agda` binary.)

it("spawnColdAgdaSession: sendCommand() runs two sequential IOTCM commands against the SAME disposable process", async () => {
  const filePath = join(TEST_FIXTURE_PROJECT_ROOT, "CompleteFixture.agda");
  const session = spawnColdAgdaSession({
    agdaBin: "agda",
    cwd: TEST_FIXTURE_PROJECT_ROOT,
    idleMs: 500,
  });

  try {
    const loadCommand = iotcmEnvelope(filePath, command("Cmd_load", quoted(filePath), stringList([])));
    const loadResult = await session.sendCommand(loadCommand);
    expect(loadResult.timedOut).toBe(false);
    expect(loadResult.responses.length).toBeGreaterThan(0);

    const inferCommand = iotcmEnvelope(
      filePath,
      modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", quoted("add")),
    );
    const inferResult = await session.sendCommand(inferCommand);
    expect(inferResult.timedOut).toBe(false);
    expect(inferResult.responses.length).toBeGreaterThan(0);
  } finally {
    session.kill();
  }
});

// ── Tests 2-5 + full-7-probe coverage: runEnvironmentProbes (pure) ──

test("runEnvironmentProbes: baseline synthetic input passes all 7 named probes", () => {
  const probes: ProbeResult[] = runEnvironmentProbes(baseValidInput());
  expect(probes).toHaveLength(7);
  expect(probes.map((p) => p.probe).sort()).toEqual(
    ["agdaDir-hash", "build-fresh", "closure-hash", "spawn", "terminus", "timeout", "version"].sort(),
  );
  for (const result of probes) {
    expect(result.ok).toBe(true);
  }
});

test("runEnvironmentProbes: version probe fails on a mismatch, passes on an exact match against the CAPTURED version", () => {
  const mismatched: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    manifestAgdaVersion: "2.8.0",
    detectedAgdaVersion: "2.9.0",
  });
  const mismatchedResult = findProbe(mismatched, "version");
  expect(mismatchedResult.ok).toBe(false);
  expect(mismatchedResult.detail).toContain("2.8.0");
  expect(mismatchedResult.detail).toContain("2.9.0");

  const matched: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    manifestAgdaVersion: "2.8.0",
    detectedAgdaVersion: "2.8.0",
  });
  expect(findProbe(matched, "version")).toEqual({ probe: "version", ok: true });
});

test("runEnvironmentProbes: version probe fails when the captured manifest never detected a version", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    manifestAgdaVersion: null,
  });
  const result = findProbe(probes, "version");
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("never detected");
});

test("runEnvironmentProbes: agdaDir-hash probe fails when a replayed library path is missing on this machine", () => {
  const missingPath = "/definitely/does/not/exist/on/this/machine/foo.agda-lib";
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    agdaDirContents: { libraries: [missingPath], defaults: [] },
  });
  const result = findProbe(probes, "agdaDir-hash");
  expect(result.ok).toBe(false);
  expect(result.detail).toContain(missingPath);
});

test("runEnvironmentProbes: agdaDir-hash probe passes when agdaDirContents is null (nothing to check)", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({ ...baseValidInput(), agdaDirContents: null });
  expect(findProbe(probes, "agdaDir-hash")).toEqual({ probe: "agdaDir-hash", ok: true });
});

test("runEnvironmentProbes: closure-hash probe fails when the recomputed hash differs from the captured hash", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    capturedImportClosureHash: "abc123",
    recomputedImportClosureHash: "def456",
  });
  const result = findProbe(probes, "closure-hash");
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("abc123");
  expect(result.detail).toContain("def456");
});

test("runEnvironmentProbes: closure-hash probe passes when the recomputed hash matches the captured hash", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    capturedImportClosureHash: "abc123",
    recomputedImportClosureHash: "abc123",
  });
  expect(findProbe(probes, "closure-hash")).toEqual({ probe: "closure-hash", ok: true });
});

test("runEnvironmentProbes: build-fresh probe fails when the materialized dir already had a _build entry", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    buildDirExistedBeforeLoad: true,
  });
  expect(findProbe(probes, "build-fresh").ok).toBe(false);
});

test("runEnvironmentProbes: spawn probe fails when spawn() reported an error, naming the attempted binary", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    spawnError: "ENOENT",
    attemptedAgdaBin: "/no/such/agda",
  });
  const result = findProbe(probes, "spawn");
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("/no/such/agda");
});

test("runEnvironmentProbes: terminus probe fails on an evidence-free response stream (CR-02 fix, generalized)", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    coldResponses: [{ kind: "Status", status: {} }],
  });
  const result = findProbe(probes, "terminus");
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("evidence-free");
});

test("runEnvironmentProbes: terminus probe passes on an AllGoalsWarnings DisplayInfo event with no InteractionPoints", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({
    ...baseValidInput(),
    coldResponses: [{ kind: "DisplayInfo", info: { kind: "AllGoalsWarnings" } }],
  });
  expect(findProbe(probes, "terminus")).toEqual({ probe: "terminus", ok: true });
});

test("runEnvironmentProbes: timeout probe fails when the cold sendCommand() call reported timedOut: true", () => {
  const probes: ProbeResult[] = runEnvironmentProbes({ ...baseValidInput(), timedOut: true });
  expect(findProbe(probes, "timeout").ok).toBe(false);
});
