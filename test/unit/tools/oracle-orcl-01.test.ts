// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/orcl-01-differential.mjs: ORCL-01, the
// server-faithfulness differential oracle predicate.
//
// Task 1 (5 tests): materializeCaptureEnvironment / runProbeGate —
// pure/filesystem-only, no real Agda spawn required.
// Task 2 (5 tests): the cold Cmd_load + tuple/category-set diff +
// judgeOrcl01()/scriptMain — 3 tests are RUN_AGDA_INTEGRATION-gated
// (real cold-replay path against a real local Agda binary), 2 are pure.

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractErrorCategory,
  judgeOrcl01,
  materializeCaptureEnvironment,
  runProbeGate,
  // @ts-expect-error script module lacks types
} from "../../../scripts/oracle/orcl-01-differential.mjs";

import { AgdaSession } from "../../../src/agda-process.js";
import { buildReplayManifest } from "../../../src/agda/session-capture/manifest-builder.js";
import { hashImportClosure, inlineFirstPartySources } from "../../../src/agda/session-capture/import-closure-hash.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";
import type { ReplayManifest } from "../../../src/agda/session-capture/artifact-types.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

let tempDirs: string[] = [];
let cleanupFns: Array<() => void> = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function findFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursive(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

interface FakeArtifact {
  capturedAt: string;
  manifest: ReplayManifest;
  recordedActions: unknown[];
  oracleSubstrate: null;
  dedup: { kind: string; fingerprint: string; recurrence: number };
}

function baseArtifact(overrides: {
  manifest?: Partial<ReplayManifest>;
  recordedActions?: unknown[];
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
    oracleSubstrate: null,
    dedup: { kind: "new-bug", fingerprint: "test-fingerprint", recurrence: 1 },
  };
}

function writeArtifact(artifact: unknown): string {
  const dir = makeTempDir("agda-mcp-orcl01-artifact-");
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

// ── Task 1: materializeCaptureEnvironment + runProbeGate ────────────

test("materializeCaptureEnvironment: writes inlinedFirstPartySources verbatim; refuses a ..-escaping path entry", async () => {
  const artifact = baseArtifact({
    manifest: {
      inlinedFirstPartySources: [
        { path: "Good.agda", content: "module Good where\n" },
        { path: "../PWNED.txt", content: "pwned" },
      ],
    },
  });

  const materialized = await materializeCaptureEnvironment(artifact);
  cleanupFns.push(materialized.cleanup);

  expect(readFileSync(join(materialized.tmpDir, "Good.agda"), "utf8")).toBe("module Good where\n");
  expect(existsSync(join(tmpdir(), "PWNED.txt"))).toBe(false);
});

test("materializeCaptureEnvironment: writes agdaDirContents.libraries/.defaults verbatim, byte-for-byte", async () => {
  const artifact = baseArtifact({
    manifest: {
      agdaDirContents: {
        libraries: ["/some/absolute/path/foo.agda-lib", "/some/absolute/path/bar.agda-lib"],
        defaults: ["foo"],
      },
    },
  });

  const materialized = await materializeCaptureEnvironment(artifact);
  cleanupFns.push(materialized.cleanup);

  expect(readFileSync(join(materialized.agdaDirTmp, "libraries"), "utf8")).toBe(
    "/some/absolute/path/foo.agda-lib\n/some/absolute/path/bar.agda-lib\n",
  );
  expect(readFileSync(join(materialized.agdaDirTmp, "defaults"), "utf8")).toBe("foo\n");
});

test("runProbeGate: agdaDir-hash probe reports ok:false when a replayed library path is missing on this machine", async () => {
  const missingPath = "/definitely/does/not/exist/on/this/machine/foo.agda-lib";
  const artifact = baseArtifact({
    manifest: {
      agdaBinaryPath: "/no/such/agda-binary-anywhere",
      importClosureHash: null,
      agdaDirContents: { libraries: [missingPath], defaults: [] },
    },
  });
  const materialized = await materializeCaptureEnvironment(artifact);
  cleanupFns.push(materialized.cleanup);

  const { probes } = runProbeGate(artifact, materialized, {});
  const agdaDirHash = probes.find((probe: { probe: string }) => probe.probe === "agdaDir-hash");
  expect(agdaDirHash.ok).toBe(false);
  expect(agdaDirHash.detail).toContain(missingPath);
});

test("materialization round-trips through hashImportClosure bit-for-bit for a synthetic single-file closure", async () => {
  const content = "module RoundTrip where\n\ndata Unit : Set where\n  tt : Unit\n";
  const relPath = "RoundTrip.agda";

  // Independently write the SAME content directly (never through
  // materializeCaptureEnvironment) to get a ground-truth hash to
  // compare against — proves the materialize step is not silently
  // corrupting content (encoding, line endings, truncation, etc.).
  const referenceDir = makeTempDir("agda-mcp-orcl01-reference-");
  writeFileSync(join(referenceDir, relPath), content, "utf8");
  const referenceHash = hashImportClosure(referenceDir, relPath, undefined);

  const artifact = baseArtifact({
    manifest: { inlinedFirstPartySources: [{ path: relPath, content }] },
  });
  const materialized = await materializeCaptureEnvironment(artifact);
  cleanupFns.push(materialized.cleanup);

  const recomputedHash = hashImportClosure(materialized.tmpDir, relPath, undefined);
  expect(recomputedHash).not.toBeNull();
  expect(recomputedHash).toBe(referenceHash);
});

test("inlineFirstPartySources never includes .agda-lib; neither does the materialized replay dir (RESEARCH.md Open Question 2)", async () => {
  const { sources } = inlineFirstPartySources(TEST_FIXTURE_PROJECT_ROOT, "CompleteFixture.agda", undefined);
  expect(sources.length).toBeGreaterThan(0);
  expect(sources.some((source) => source.path.endsWith(".agda-lib"))).toBe(false);

  const artifact = baseArtifact({ manifest: { inlinedFirstPartySources: sources } });
  const materialized = await materializeCaptureEnvironment(artifact);
  cleanupFns.push(materialized.cleanup);

  const allMaterializedFiles = findFilesRecursive(materialized.tmpDir);
  expect(allMaterializedFiles.length).toBeGreaterThan(0);
  expect(allMaterializedFiles.some((file) => file.endsWith(".agda-lib"))).toBe(false);
});

// ── Task 2: cold Cmd_load + diff + judgeOrcl01() ────────────────────

it("judgeOrcl01: a faithful capture of a clean load returns { kind: 'pass' }", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let artifactPath: string;
  try {
    const loadResult = await session.load("CompleteFixture.agda");
    expect(loadResult.classification).toBe("ok-complete");

    const manifest = buildReplayManifest(session);
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        loadFamilyAction("CompleteFixture.agda", {
          file: "CompleteFixture.agda",
          success: loadResult.success,
          goalCount: loadResult.goalCount,
          invisibleGoalCount: loadResult.invisibleGoalCount,
          hasHoles: loadResult.hasHoles,
          isComplete: loadResult.isComplete,
          classification: loadResult.classification,
          errors: loadResult.errors,
          warnings: loadResult.warnings,
        }),
      ],
    });
    artifactPath = writeArtifact(artifact);
  } finally {
    await session.destroy();
  }

  const outcome = await judgeOrcl01(artifactPath);
  expect(outcome).toEqual({ kind: "pass" });
});

it("judgeOrcl01: a forged warm ok-complete over a genuinely cold-failing load returns server-false-green-candidate", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let artifactPath: string;
  try {
    const loadResult = await session.load("ImportedTypeError.agda");
    // Sanity: this fixture really does fail to type-check (verified
    // fixture, see test/integration/agda/agda-load.test.ts).
    expect(loadResult.success).toBe(false);

    const manifest = buildReplayManifest(session);
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        // Forged: claims ok-complete even though the real load above
        // just failed — simulates the server told the truth captured,
        // this line lies about it, exactly the false-green shape
        // ORCL-01 exists to catch.
        loadFamilyAction("ImportedTypeError.agda", {
          file: "ImportedTypeError.agda",
          success: true,
          goalCount: 0,
          invisibleGoalCount: 0,
          hasHoles: false,
          isComplete: true,
          classification: "ok-complete",
          errors: [],
          warnings: [],
        }),
      ],
    });
    artifactPath = writeArtifact(artifact);
  } finally {
    await session.destroy();
  }

  const outcome = await judgeOrcl01(artifactPath);
  expect(outcome.kind).toBe("server-false-green-candidate");
  expect(outcome.warmTuple.classification).toBe("ok-complete");
  expect(outcome.coldTuple.classification).toBe("type-error");
  expect(outcome.coldTuple.success).toBe(false);
});

it("judgeOrcl01: a manifest.agdaVersion mismatch against the real cold binary returns INCONCLUSIVE(version), never a false verdict", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  let artifactPath: string;
  try {
    const loadResult = await session.load("CompleteFixture.agda");
    const manifest = { ...buildReplayManifest(session), agdaVersion: "0.0.1" };
    const artifact = baseArtifact({
      manifest,
      recordedActions: [
        loadFamilyAction("CompleteFixture.agda", {
          file: "CompleteFixture.agda",
          success: loadResult.success,
          goalCount: loadResult.goalCount,
          invisibleGoalCount: loadResult.invisibleGoalCount,
          hasHoles: loadResult.hasHoles,
          isComplete: loadResult.isComplete,
          classification: loadResult.classification,
          errors: loadResult.errors,
          warnings: loadResult.warnings,
        }),
      ],
    });
    artifactPath = writeArtifact(artifact);
  } finally {
    await session.destroy();
  }

  const outcome = await judgeOrcl01(artifactPath);
  expect(outcome.kind).toBe("inconclusive");
  expect(outcome.probe).toBe("version");
});

test("judgeOrcl01: a non-completeness warm classification (invalid-command-line-options) returns skip without any cold spawn attempt", async () => {
  const artifact = baseArtifact({
    recordedActions: [
      loadFamilyAction("Whatever.agda", {
        file: "Whatever.agda",
        success: false,
        goalCount: 0,
        invisibleGoalCount: 0,
        hasHoles: false,
        isComplete: false,
        classification: "invalid-command-line-options",
        errors: ["Unknown flag: --not-a-real-flag"],
        warnings: [],
      }),
    ],
  });
  const artifactPath = writeArtifact(artifact);

  const outcome = await judgeOrcl01(artifactPath);
  expect(outcome.kind).toBe("skip");
  expect(outcome.reason).toContain("invalid-command-line-options");
});

test("extractErrorCategory extracts the bracketed error-category tag, or 'uncategorized' when absent", () => {
  expect(extractErrorCategory("error: [SafeFlagPostulate]\nCannot postulate under --safe")).toBe(
    "SafeFlagPostulate",
  );
  expect(extractErrorCategory("a message with no bracket tag")).toBe("uncategorized");
});
