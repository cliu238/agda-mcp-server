// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/run-oracle.mjs: the single composed
// CLI entry point wiring ORCL-01/02/03 into ONE D-02 verdict sidecar +
// cumulative abstention metric.
//
// Tests 1/2/5 are RUN_AGDA_INTEGRATION-gated (real cold-replay against
// a real local Agda binary, via the SAME real-fixture-load pattern
// Plans 02-03/02-04's own integration tests use). Tests 3/4 are pure
// (no Agda subprocess: --only orcl-02 alone never spawns Agda, and
// --only [] with no recorded load-family action skips every
// predicate entirely).

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { runOracle } from "../../../scripts/oracle/run-oracle.mjs";
// @ts-expect-error script module lacks types
import { spawnColdAgdaSession } from "../../../scripts/oracle/cold-agda-session.mjs";
// @ts-expect-error script module lacks types
import { PolicyResolutionError } from "../../../scripts/oracle/orcl-02-soundness-scan.mjs";

import { AgdaSession } from "../../../src/agda-process.js";
import { buildReplayManifest } from "../../../src/agda/session-capture/manifest-builder.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";
import type { ReplayManifest } from "../../../src/agda/session-capture/artifact-types.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

let tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

interface FakeOracleSubstrate {
  beforeSource: string | null;
  beforeSourceOrigin: string;
  afterSource: string | null;
  intendedGoalType: string | null;
  expectedSignature: string | null;
}

function oracleSubstrateWith(expectedSignature: string | null): FakeOracleSubstrate {
  return {
    beforeSource: null,
    beforeSourceOrigin: "unavailable",
    afterSource: null,
    intendedGoalType: null,
    expectedSignature,
  };
}

interface FakeDedup {
  kind: string;
  fingerprint: string;
  recurrence: number;
}

interface FakeArtifact {
  capturedAt: string;
  manifest: ReplayManifest;
  recordedActions: unknown[];
  oracleSubstrate: FakeOracleSubstrate | null;
  dedup: FakeDedup;
}

function baseArtifact(overrides: {
  manifest?: Partial<ReplayManifest>;
  recordedActions?: unknown[];
  oracleSubstrate?: FakeOracleSubstrate | null;
  dedup?: FakeDedup;
} = {}): FakeArtifact {
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
      ...overrides.manifest,
    },
    recordedActions: overrides.recordedActions ?? [],
    oracleSubstrate: overrides.oracleSubstrate ?? null,
    dedup: overrides.dedup ?? { kind: "new-bug", fingerprint: "test-fingerprint", recurrence: 1 },
  };
}

function writeArtifact(artifact: unknown, filename = "artifact.json"): { dir: string; artifactPath: string } {
  const dir = makeTempDir("agda-mcp-run-oracle-artifact-");
  const artifactPath = join(dir, filename);
  writeFileSync(artifactPath, JSON.stringify(artifact), "utf8");
  return { dir, artifactPath };
}

function loadFamilyAction(file: string, data: Record<string, unknown>) {
  return {
    tool: "agda_load",
    args: { file },
    timestamp: Date.now(),
    normalizedResponse: {
      classification: data.classification,
      data,
    },
  };
}

interface FakeLoadResult {
  success: boolean;
  goalCount: number;
  invisibleGoalCount: number;
  hasHoles: boolean;
  isComplete: boolean;
  classification: string;
  errors: string[];
  warnings: string[];
}

function loadFieldsFrom(loadResult: FakeLoadResult, file: string) {
  return {
    file,
    success: loadResult.success,
    goalCount: loadResult.goalCount,
    invisibleGoalCount: loadResult.invisibleGoalCount,
    hasHoles: loadResult.hasHoles,
    isComplete: loadResult.isComplete,
    classification: loadResult.classification,
    errors: loadResult.errors,
    warnings: loadResult.warnings,
  };
}

function countingSpawnWrapper() {
  let count = 0;
  const wrapper = (opts: unknown) => {
    count += 1;
    return spawnColdAgdaSession(opts);
  };
  return { wrapper, getCount: () => count };
}

// ── Test 1 (RUN_AGDA_INTEGRATION-gated, end-to-end) ─────────────────

it("runOracle: end-to-end against a real staged capture writes one verdict sidecar + appends exactly one metrics line, never mutating the artifact itself", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let dir: string;
  let artifactPath: string;
  let fingerprint: string;
  try {
    const loadResult = await session.load("CompleteFixture.agda");
    expect(loadResult.classification).toBe("ok-complete");
    const manifest = buildReplayManifest(session);
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        loadFamilyAction("CompleteFixture.agda", loadFieldsFrom(loadResult, "CompleteFixture.agda")),
      ],
      oracleSubstrate: oracleSubstrateWith("add : Nat -> Nat -> Nat"),
    });
    fingerprint = artifact.dedup.fingerprint;
    ({ dir, artifactPath } = writeArtifact(artifact, "capture.json"));
  } finally {
    await session.destroy();
  }

  const artifactContentBefore = readFileSync(artifactPath, "utf8");
  const sidecarPath = join(dir, "capture.verdict.json");
  const metricsPath = join(dir, "oracle-metrics.jsonl");
  expect(existsSync(sidecarPath)).toBe(false);
  expect(existsSync(metricsPath)).toBe(false);

  const verdict = await runOracle(artifactPath);

  expect(sidecarPath).not.toBe(artifactPath);
  expect(existsSync(sidecarPath)).toBe(true);
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
  expect(sidecar).toEqual(verdict);
  expect(typeof sidecar.orcl01.kind).toBe("string");
  expect(typeof sidecar.orcl02.kind).toBe("string");
  expect(typeof sidecar.orcl03.kind).toBe("string");
  expect(sidecar.trueGreen).toBe(sidecar.orcl01.kind === "pass" && sidecar.orcl02.kind === "clean");

  // Never a mutation of the artifact's own JSON content (D-01).
  expect(readFileSync(artifactPath, "utf8")).toBe(artifactContentBefore);

  expect(existsSync(metricsPath)).toBe(true);
  const lines = readFileSync(metricsPath, "utf8").trim().split("\n").filter(Boolean);
  expect(lines).toHaveLength(1);
  const metricLine = JSON.parse(lines[0]);
  expect(metricLine.fingerprint).toBe(fingerprint);
});

// ── Test 2 (RUN_AGDA_INTEGRATION-gated, shared-session wall-clock proxy) ──

it("runOracle: --only orcl-01,orcl-03 spawns at most ONE cold Agda process (shared materialization + session)", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let artifactPath: string;
  try {
    const loadResult = await session.load("CompleteFixture.agda");
    expect(loadResult.classification).toBe("ok-complete");
    const manifest = buildReplayManifest(session);
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        loadFamilyAction("CompleteFixture.agda", loadFieldsFrom(loadResult, "CompleteFixture.agda")),
      ],
      oracleSubstrate: oracleSubstrateWith("add : Nat -> Nat -> Nat"),
    });
    ({ artifactPath } = writeArtifact(artifact));
  } finally {
    await session.destroy();
  }

  const { wrapper, getCount } = countingSpawnWrapper();
  const verdict = await runOracle(artifactPath, {
    only: ["orcl-01", "orcl-03"],
    deps: { spawnColdAgdaSession: wrapper },
  });

  expect(getCount()).toBeLessThanOrEqual(1);
  expect(getCount()).toBeGreaterThanOrEqual(1);
  expect(verdict.orcl02).toEqual({ kind: "skip", reason: "excluded by --only" });
  expect(["consistent", "conformance-flagged"]).toContain(verdict.orcl03.kind);
});

// ── Test 3 (pure): --only orcl-02 excludes ORCL-01/ORCL-03 ──────────

test("runOracle: --only orcl-02 skips ORCL-01/ORCL-03 with documented excluded-placeholders; a partial run's trueGreen is always false", async () => {
  const artifact = baseArtifact({ recordedActions: [] });
  const { artifactPath } = writeArtifact(artifact);

  const verdict = await runOracle(artifactPath, { only: ["orcl-02"] });

  expect(verdict.orcl01).toEqual({ kind: "skip", reason: "excluded by --only" });
  expect(verdict.orcl03).toEqual({ kind: "vacuous-no-expected-signature" });
  expect(verdict.orcl02.kind).toBe("no-target");
  expect(verdict.trueGreen).toBe(false);
});

// ── Test 4 (pure): sidecar path is a pure suffix-replace on the INPUT path ──

test("runOracle: verdict sidecar path is a pure suffix-replace on the INPUT path, never re-derived from dedup.fingerprint/recurrence", async () => {
  const artifact = baseArtifact({
    recordedActions: [],
    dedup: { kind: "new-bug", fingerprint: "totally-unrelated-fingerprint-xyz", recurrence: 42 },
  });
  const { dir, artifactPath } = writeArtifact(artifact, "my-capture-name.json");

  await runOracle(artifactPath, { only: [] });

  expect(existsSync(join(dir, "my-capture-name.verdict.json"))).toBe(true);
  expect(existsSync(join(dir, "totally-unrelated-fingerprint-xyz.verdict.json"))).toBe(false);
});

// ── POLICY-01 (pure, no Agda subprocess): options.policyKey threads ──
// ── through runOracle to judgeOrcl02 (--only orcl-02 never spawns Agda) ──

/** A minimal load-family recorded action shaped exactly like
 *  test/unit/tools/oracle-orcl-02.test.ts's own writeCaptureArtifact
 *  helper — sufficient for judgeOrcl02's findLastLoadFamilyAction to
 *  resolve a scan target, with no real AgdaSession/loadResult needed. */
function orcl02LoadFamilyAction(file: string, classification = "ok-complete") {
  return {
    tool: "agda_load",
    args: { file },
    timestamp: Date.now(),
    normalizedResponse: { data: { file, classification } },
  };
}

/** A single-file fixture directly under `dir` postulating `name` — no
 *  upstream/downstream closure needed for these policy-threading tests. */
function writeSinglePostulateFixture(dir: string, file: string, name: string): void {
  writeFileSync(join(dir, file), `module Target where\n\npostulate\n  ${name} : Set\n`, "utf8");
}

test("runOracle: options.policyKey threads through to judgeOrcl02 — an explicit exact-case key resolves normally and is NOT the excluded --only placeholder", async () => {
  const dir = makeTempDir("agda-mcp-run-oracle-policy-");
  writeSinglePostulateFixture(dir, "Target.agda", "univalence");
  const artifact = baseArtifact({
    manifest: { repoRoot: dir },
    recordedActions: [orcl02LoadFamilyAction("Target.agda")],
  });
  const { artifactPath } = writeArtifact(artifact);

  const verdict = await runOracle(artifactPath, { only: ["orcl-02"], policyKey: "codex-homotopy-group" });

  expect(verdict.orcl01).toEqual({ kind: "skip", reason: "excluded by --only" });
  expect(verdict.orcl03).toEqual({ kind: "vacuous-no-expected-signature" });
  expect(verdict.orcl02).not.toEqual({ kind: "skip", reason: "excluded by --only" });
  expect(verdict.orcl02.kind).toBe("clean");
});

test("runOracle: a mismatched-case options.policyKey propagates judgeOrcl02's PolicyResolutionError uncaught", async () => {
  const dir = makeTempDir("agda-mcp-run-oracle-policy-mismatch-");
  writeSinglePostulateFixture(dir, "Target.agda", "univalence");
  const artifact = baseArtifact({
    manifest: { repoRoot: dir },
    recordedActions: [orcl02LoadFamilyAction("Target.agda")],
  });
  const { artifactPath } = writeArtifact(artifact);

  await expect(
    runOracle(artifactPath, { only: ["orcl-02"], policyKey: "Codex-Homotopy-Group" }),
  ).rejects.toThrow(PolicyResolutionError);
});

// ── Test 5 (RUN_AGDA_INTEGRATION-gated): --only orcl-03 alone (Warning 4) ──

it("runOracle: --only orcl-03 alone falls back to the standalone judgeOrcl03, producing a REAL comparison never a bare vacuous placeholder", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let artifactPath: string;
  try {
    const loadResult = await session.load("CompleteFixture.agda");
    expect(loadResult.classification).toBe("ok-complete");
    const manifest = buildReplayManifest(session);
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        loadFamilyAction("CompleteFixture.agda", loadFieldsFrom(loadResult, "CompleteFixture.agda")),
      ],
      oracleSubstrate: oracleSubstrateWith("add : Nat -> Nat -> Nat"),
    });
    ({ artifactPath } = writeArtifact(artifact));
  } finally {
    await session.destroy();
  }

  const verdict = await runOracle(artifactPath, { only: ["orcl-03"] });

  expect(["consistent", "conformance-flagged"]).toContain(verdict.orcl03.kind);
  expect(verdict.orcl01).toEqual({ kind: "skip", reason: "excluded by --only" });
  expect(verdict.trueGreen).toBe(false);
});
