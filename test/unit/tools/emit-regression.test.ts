// MIT License — see LICENSE
//
// Unit tests for scripts/emit-regression.mjs: the regression-test
// emitter (LOCK-01/LOCK-02). Task 2 (Tests A-G, G2, G3): the refusal
// gate (judgeRefusal) + the fixtureDir-relative, path-sandboxed
// baseline-diff materializer (materializeFixtureFiles). Task 3
// (Tests H-K): matrix-entry compose (composeEntry), matrix write
// (writeMatrixEntry), and the shared match comparator
// (matchesExpected). Pure logic + filesystem only — zero real Agda
// spawn required for any test in this file.

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { judgeRefusal, materializeFixtureFiles } from "../../../scripts/emit-regression.mjs";

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

// ── judgeRefusal (Task 2) ────────────────────────────────────────────

// Test A
test("judgeRefusal: non-null naming the probe when ORCL-01 is inconclusive", () => {
  const verdict = {
    orcl01: { kind: "inconclusive", probe: "version" },
    orcl02: { kind: "clean", findings: [] },
    orcl03: { kind: "vacuous-no-expected-signature" },
  };
  const reason = judgeRefusal(verdict);
  expect(reason).not.toBeNull();
  expect(reason).toContain("version");
});

// Test B
test("judgeRefusal: non-null when ORCL-02 is cheat-flagged", () => {
  const verdict = {
    orcl01: {
      kind: "server-false-green-candidate",
      warmTuple: {},
      coldTuple: {},
      warmCategories: [],
      coldCategories: [],
    },
    orcl02: {
      kind: "cheat-flagged",
      findings: [{ kind: "postulate", line: 1, detail: "foo", sanctioned: false }],
    },
    orcl03: { kind: "vacuous-no-expected-signature" },
  };
  expect(judgeRefusal(verdict)).not.toBeNull();
});

// Test C
test("judgeRefusal: non-null when ORCL-02 is no-policy with non-empty findings", () => {
  const verdict = {
    orcl01: {
      kind: "server-false-green-candidate",
      warmTuple: {},
      coldTuple: {},
      warmCategories: [],
      coldCategories: [],
    },
    orcl02: {
      kind: "no-policy",
      findings: [{ kind: "postulate", line: 1, detail: "foo", sanctioned: false }],
    },
    orcl03: { kind: "vacuous-no-expected-signature" },
  };
  expect(judgeRefusal(verdict)).not.toBeNull();
});

// Test D
test("judgeRefusal: non-null when ORCL-01 has nothing meaningful to lock and --force is not set; null when forced", () => {
  const verdict = {
    orcl01: { kind: "pass" },
    orcl02: { kind: "clean", findings: [] },
    orcl03: { kind: "vacuous-no-expected-signature" },
  };
  expect(judgeRefusal(verdict)).not.toBeNull();
  expect(judgeRefusal(verdict, { force: true })).toBeNull();
});

// Test E
test("judgeRefusal: null (no refusal) when ORCL-01 is a false-green candidate and ORCL-02 is clean; ORCL-03 is never read", () => {
  const verdict = {
    orcl01: {
      kind: "server-false-green-candidate",
      warmTuple: {},
      coldTuple: {},
      warmCategories: [],
      coldCategories: [],
    },
    orcl02: { kind: "clean", findings: [] },
    orcl03: { kind: "vacuous-no-expected-signature" },
  };
  expect(judgeRefusal(verdict)).toBeNull();

  // ORCL-03 is advisory only (D-06) — even a flagged ORCL-03 must never
  // flip this decision.
  const verdictWithFlaggedOrcl03 = {
    ...verdict,
    orcl03: { kind: "conformance-flagged", provenSignature: "A", expectedSignature: "B" },
  };
  expect(judgeRefusal(verdictWithFlaggedOrcl03)).toBeNull();
});

// ── materializeFixtureFiles (Task 2) ─────────────────────────────────

// Test F
test("materializeFixtureFiles: a deeply '..'-escaping inlinedFirstPartySources path is skipped, never written outside test/fixtures/agda/", () => {
  const repoRoot = makeTempDir("agda-mcp-emit-regression-sandbox-");
  const primaryArtifact = {
    manifest: {
      inlinedFirstPartySources: [
        { path: "Good.agda", content: "module Good where\n" },
        { path: "../../../../../PWNED.agda", content: "pwned" },
      ],
    },
    recordedActions: [],
  };

  const { mutation, entryFile, writtenFiles } = materializeFixtureFiles({
    primaryArtifact,
    baselineArtifact: undefined,
    fixtureDir: ".",
    repoRoot,
  });

  expect(mutation).toBeUndefined();
  expect(entryFile).toBeUndefined();
  expect(readFileSync(join(repoRoot, "test/fixtures/agda/Good.agda"), "utf8")).toBe(
    "module Good where\n",
  );
  expect(existsSync(join(repoRoot, "PWNED.agda"))).toBe(false);
  expect(writtenFiles).toEqual([join(repoRoot, "test/fixtures/agda/Good.agda")]);
});

// Test G
test("materializeFixtureFiles: throws when baseline and primary differ on 2+ paths (ambiguous mutation)", () => {
  const repoRoot = makeTempDir("agda-mcp-emit-regression-ambiguous-");
  const primaryArtifact = {
    manifest: {
      inlinedFirstPartySources: [
        { path: "A.agda", content: "primary A" },
        { path: "B.agda", content: "primary B" },
      ],
    },
    recordedActions: [],
  };
  const baselineArtifact = {
    manifest: {
      inlinedFirstPartySources: [
        { path: "A.agda", content: "baseline A" },
        { path: "B.agda", content: "baseline B" },
      ],
    },
    recordedActions: [],
  };

  expect(() =>
    materializeFixtureFiles({ primaryArtifact, baselineArtifact, fixtureDir: "Ambiguous", repoRoot }),
  ).toThrow(/A\.agda/);
});

// Test G2 (BLOCKER regression — the real flagship shape)
test("materializeFixtureFiles: fixtureDir-PREFIXED captured paths (the real flagship shape) are stripped before use — never double-prepended", () => {
  const repoRoot = makeTempDir("agda-mcp-emit-regression-g2-");
  const fixtureDir = "FixtureDeps/TransitiveStaleness";
  const primaryArtifact = {
    manifest: {
      inlinedFirstPartySources: [
        {
          path: `${fixtureDir}/Main.agda`,
          content: "module FixtureDeps.TransitiveStaleness.Main where\n",
        },
        { path: `${fixtureDir}/Dep.agda`, content: "healthy" },
      ],
    },
    recordedActions: [
      {
        tool: "agda_load",
        args: { file: `${fixtureDir}/Main.agda` },
        timestamp: Date.now(),
        normalizedResponse: {
          classification: "ok-complete",
          data: {
            file: `${fixtureDir}/Main.agda`,
            success: true,
            goalCount: 0,
            invisibleGoalCount: 0,
            hasHoles: false,
            classification: "ok-complete",
            errors: [],
            warnings: [],
          },
        },
      },
    ],
  };
  const baselineArtifact = {
    manifest: {
      inlinedFirstPartySources: [{ path: `${fixtureDir}/Dep.agda`, content: "original-broken" }],
    },
    recordedActions: [],
  };

  const { mutation, entryFile } = materializeFixtureFiles({
    primaryArtifact,
    baselineArtifact,
    fixtureDir,
    repoRoot,
  });

  expect(
    readFileSync(join(repoRoot, "test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda"), "utf8"),
  ).toBe("module FixtureDeps.TransitiveStaleness.Main where\n");
  expect(
    existsSync(
      join(
        repoRoot,
        "test/fixtures/agda/FixtureDeps/TransitiveStaleness/FixtureDeps/TransitiveStaleness/Main.agda",
      ),
    ),
  ).toBe(false);
  expect(mutation).toEqual({ targetFile: "Dep.agda", sourceFile: "Dep.broken.agda" });
  expect(entryFile).toBe("Main.agda");
});

// Test G3 (defensive fallback)
test("materializeFixtureFiles: already-BARE captured paths pass through stripFixtureDirPrefix unchanged", () => {
  const repoRoot = makeTempDir("agda-mcp-emit-regression-g3-");
  const fixtureDir = "FixtureDeps/TransitiveStaleness";
  const primaryArtifact = {
    manifest: {
      inlinedFirstPartySources: [
        { path: "Main.agda", content: "module FixtureDeps.TransitiveStaleness.Main where\n" },
        { path: "Dep.agda", content: "healthy" },
      ],
    },
    recordedActions: [
      {
        tool: "agda_load",
        args: { file: "Main.agda" },
        timestamp: Date.now(),
        normalizedResponse: {
          classification: "ok-complete",
          data: {
            file: "Main.agda",
            success: true,
            goalCount: 0,
            invisibleGoalCount: 0,
            hasHoles: false,
            classification: "ok-complete",
            errors: [],
            warnings: [],
          },
        },
      },
    ],
  };
  const baselineArtifact = {
    manifest: { inlinedFirstPartySources: [{ path: "Dep.agda", content: "original-broken" }] },
    recordedActions: [],
  };

  const { mutation, entryFile } = materializeFixtureFiles({
    primaryArtifact,
    baselineArtifact,
    fixtureDir,
    repoRoot,
  });

  expect(
    readFileSync(join(repoRoot, "test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda"), "utf8"),
  ).toBe("module FixtureDeps.TransitiveStaleness.Main where\n");
  expect(mutation).toEqual({ targetFile: "Dep.agda", sourceFile: "Dep.broken.agda" });
  expect(entryFile).toBe("Main.agda");
});
