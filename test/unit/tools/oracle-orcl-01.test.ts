// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/orcl-01-differential.mjs: ORCL-01, the
// server-faithfulness differential oracle predicate.
//
// Task 1 (5 tests, this commit): materializeCaptureEnvironment /
// runProbeGate — pure/filesystem-only, no real Agda spawn required.
// Task 2 (5 more tests, next commit): the cold Cmd_load + tuple/
// category-set diff + judgeOrcl01()/scriptMain.

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { materializeCaptureEnvironment, runProbeGate } from "../../../scripts/oracle/orcl-01-differential.mjs";

import { hashImportClosure, inlineFirstPartySources } from "../../../src/agda/session-capture/import-closure-hash.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";

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
  manifest: Record<string, unknown>;
  recordedActions: unknown[];
  oracleSubstrate: null;
  dedup: { kind: string; fingerprint: string; recurrence: number };
}

function baseArtifact(overrides: {
  manifest?: Record<string, unknown>;
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
