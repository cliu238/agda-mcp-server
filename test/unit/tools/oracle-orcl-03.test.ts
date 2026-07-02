// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/orcl-03-conformance.mjs: ORCL-03, the
// conformance proxy oracle predicate (advisory only).
//
// Task 1 (7 tests): parseExpectedSignature / normalizeSignatureText /
// compareSignatures — pure, no real Agda spawn required. The 7th test
// (arrow-notation normalization) is an addition beyond the plan's own
// 6 — see 02-04-SUMMARY.md's Deviations section for why it was needed.
// Task 2 (5 tests): the cold Cmd_load + Cmd_infer_toplevel + judgeOrcl03() —
// 3 tests are RUN_AGDA_INTEGRATION-gated (real cold-replay path against a
// real local Agda binary), 2 are pure. The 5th (no recorded load) is an
// addition beyond the plan's own 4 — see the same Deviations section.

import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import {
  compareSignatures,
  judgeOrcl03,
  normalizeSignatureText,
  parseExpectedSignature,
  runColdInferAndCompare,
} from "../../../scripts/oracle/orcl-03-conformance.mjs";

import { AgdaSession } from "../../../src/agda-process.js";
import { buildReplayManifest } from "../../../src/agda/session-capture/manifest-builder.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";

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

interface FakeArtifact {
  capturedAt: string;
  manifest: Record<string, unknown>;
  recordedActions: unknown[];
  oracleSubstrate: FakeOracleSubstrate | null;
  dedup: { kind: string; fingerprint: string; recurrence: number };
}

function baseArtifact(overrides: {
  manifest?: Record<string, unknown>;
  recordedActions?: unknown[];
  oracleSubstrate?: FakeOracleSubstrate | null;
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
    dedup: { kind: "new-bug", fingerprint: "test-fingerprint", recurrence: 1 },
  };
}

function writeArtifact(artifact: unknown): string {
  const dir = makeTempDir("agda-mcp-orcl03-artifact-");
  const artifactPath = join(dir, "artifact.json");
  writeFileSync(artifactPath, JSON.stringify(artifact), "utf8");
  return artifactPath;
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

// ── Task 1: parseExpectedSignature / normalizeSignatureText / compareSignatures ──

test("parseExpectedSignature: splits a simple 'name : type' signature on the first top-level colon", () => {
  expect(parseExpectedSignature("hopfMap : S3 -> S2")).toEqual({
    name: "hopfMap",
    expectedType: "S3 -> S2",
  });
});

test("parseExpectedSignature: a colon nested inside parens is NOT the split point — the first TOP-LEVEL colon is", () => {
  expect(parseExpectedSignature("(f : A -> B) : C")).toEqual({
    name: "(f : A -> B)",
    expectedType: "C",
  });
});

test("parseExpectedSignature: no colon at all degenerates to the whole trimmed string as both name and expectedType", () => {
  expect(parseExpectedSignature("justAName")).toEqual({
    name: "justAName",
    expectedType: "justAName",
  });
});

test("compareSignatures: identical types are consistent", () => {
  expect(compareSignatures("Nat -> Nat", "Nat -> Nat")).toEqual({ kind: "consistent" });
});

test("compareSignatures: differing whitespace only is still consistent (whitespace-normalized comparison)", () => {
  expect(compareSignatures("Nat -> Nat", "  Nat   ->   Nat  ")).toEqual({ kind: "consistent" });
});

test("compareSignatures: a genuinely different type is conformance-flagged, carrying both signatures verbatim", () => {
  expect(compareSignatures("Nat -> Nat", "Bool -> Nat")).toEqual({
    kind: "conformance-flagged",
    provenSignature: "Nat -> Nat",
    expectedSignature: "Bool -> Nat",
  });
});

test("normalizeSignatureText: collapses whitespace runs AND normalizes ASCII '->' to Agda's own Unicode '→' token spelling", () => {
  // Confirmed empirically against a real local Agda 2.8.0 binary during
  // this plan's implementation: Cmd_infer_toplevel Normalised always
  // prints "→", regardless of whether the ORIGINAL source used "->" or
  // "→". Without this, an expectedSignature typed with the ASCII
  // spelling would spuriously conformance-flag against every proven
  // signature Agda ever emits (see 02-04-SUMMARY.md Deviations).
  expect(normalizeSignatureText("  Nat   ->   Nat  ")).toBe("Nat → Nat");
  expect(normalizeSignatureText("Nat → Nat")).toBe("Nat → Nat");
  expect(compareSignatures("Nat → Nat", "Nat -> Nat")).toEqual({ kind: "consistent" });
});

// ── Task 2: cold Cmd_load + Cmd_infer_toplevel + judgeOrcl03() ──────

it("judgeOrcl03: a real expectedSignature matching the real inferred type of 'add' returns { kind: 'consistent' }", async () => {
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
    artifactPath = writeArtifact(artifact);
  } finally {
    await session.destroy();
  }

  const outcome = await judgeOrcl03(artifactPath);
  expect(outcome).toEqual({ kind: "consistent" });
});

it("judgeOrcl03: a real expectedSignature that does NOT match the real inferred type returns conformance-flagged with both signatures", async () => {
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
      oracleSubstrate: oracleSubstrateWith("add : Bool"),
    });
    artifactPath = writeArtifact(artifact);
  } finally {
    await session.destroy();
  }

  const outcome = await judgeOrcl03(artifactPath);
  expect(outcome).toEqual({
    kind: "conformance-flagged",
    provenSignature: "Nat → Nat → Nat",
    expectedSignature: "Bool",
  });
});

it("judgeOrcl03: a null expectedSignature returns vacuous-no-expected-signature", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let artifactPath: string;
  try {
    const loadResult = await session.load("CompleteFixture.agda");
    const manifest = buildReplayManifest(session);
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        loadFamilyAction("CompleteFixture.agda", loadFieldsFrom(loadResult, "CompleteFixture.agda")),
      ],
      oracleSubstrate: oracleSubstrateWith(null),
    });
    artifactPath = writeArtifact(artifact);
  } finally {
    await session.destroy();
  }

  const outcome = await judgeOrcl03(artifactPath);
  expect(outcome).toEqual({ kind: "vacuous-no-expected-signature" });
});

test("runColdInferAndCompare: issues exactly one sendCommand call for Cmd_infer_toplevel, never its own Cmd_load", async () => {
  const sendCommand = vi.fn().mockResolvedValue({
    responses: [{ kind: "DisplayInfo", info: { kind: "InferredType", expr: "Nat → Nat → Nat" } }],
    timedOut: false,
    stderr: "",
  });
  const stubSession = { sendCommand };

  const outcome = await runColdInferAndCompare(
    stubSession,
    "/fake/CompleteFixture.agda",
    "add",
    "Nat -> Nat -> Nat",
  );

  expect(sendCommand).toHaveBeenCalledTimes(1);
  const [iotcm] = sendCommand.mock.calls[0];
  expect(iotcm).toContain("Cmd_infer_toplevel");
  expect(iotcm).not.toContain("Cmd_load");
  expect(outcome).toEqual({ kind: "consistent" });
});

test("judgeOrcl03: an expectedSignature with no recorded load-family action returns an advisory conformance-flagged note, never a thrown exception", async () => {
  const artifact = baseArtifact({
    recordedActions: [],
    oracleSubstrate: oracleSubstrateWith("foo : Bar"),
  });
  const artifactPath = writeArtifact(artifact);

  const outcome = await judgeOrcl03(artifactPath);
  expect(outcome.kind).toBe("conformance-flagged");
  expect(outcome.provenSignature).toBeNull();
  expect(outcome.expectedSignature).toBe("Bar");
});
