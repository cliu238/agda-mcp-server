// MIT License — see LICENSE
//
// Unit tests for test/helpers/capture-regression-runner.ts: the shared
// replay function (LOCK-01/LOCK-02) both scripts/emit-regression.mjs's
// D-05 self-check and Wave-3's vitest runner call. Proven against real
// Agda for both replay shapes — plain (no mutation) and mutation
// round-trip — using synthetic, self-contained single-file fixture
// roots (never the shared 139-file test/fixtures/agda/ tree, which
// does not yet contain the flagship fixture and would be needlessly
// expensive to copy wholesale for a single-file replay).

import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { replayCaptureRegressionEntry } from "../../helpers/capture-regression-runner.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";

import type { CaptureRegressionEntry } from "../../fixtures/capture-regression-matrix.js";

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

// ── Test 1: plain replay (no mutation) ──────────────────────────────

it("replayCaptureRegressionEntry: a plain (no-mutation) entry drives the tool once and normalizes the observed result", async () => {
  const root = makeTempDir("agda-mcp-capture-regression-runner-plain-");
  writeFileSync(
    join(root, "Complete.agda"),
    [
      "module Complete where",
      "",
      "data Nat : Set where",
      "  zero : Nat",
      "  suc  : Nat -> Nat",
      "",
      "add : Nat -> Nat -> Nat",
      "add zero    m = m",
      "add (suc n) m = suc (add n m)",
      "",
    ].join("\n"),
    "utf8",
  );

  const entry: CaptureRegressionEntry = {
    id: "synthetic-plain",
    issue: [],
    status: "red",
    tool: "agda_load",
    fixtureDir: ".",
    entryFile: "Complete.agda",
    expected: {
      classification: "ok-complete",
      success: true,
      goalCount: 0,
      invisibleGoalCount: 0,
      hasHoles: false,
      errorCategories: [],
    },
  };

  const { observed } = await replayCaptureRegressionEntry(entry, root);
  expect(observed.classification).toBe("ok-complete");
  expect(observed.success).toBe(true);
  expect(observed.hasHoles).toBe(false);
});

// ── Test 2: mutation round-trip ──────────────────────────────────────

it("replayCaptureRegressionEntry: a mutation entry copies-then-swaps-then-reloads, and the SECOND (post-mutation) load is authoritative", async () => {
  const root = makeTempDir("agda-mcp-capture-regression-runner-mutation-");
  writeFileSync(
    join(root, "Target.agda"),
    [
      "module Target where",
      "",
      "data Nat : Set where",
      "  zero : Nat",
      "  suc  : Nat -> Nat",
      "",
      "add : Nat -> Nat -> Nat",
      "add zero    m = m",
      "add (suc n) m = suc (add n m)",
      "",
    ].join("\n"),
    "utf8",
  );
  // Never loaded directly by Agda — its CONTENT is spliced over
  // Target.agda mid-replay, so it must declare the SAME module name
  // Target.agda uses (mirrors the FixtureDeps/TransitiveStaleness/
  // Dep.broken.agda convention documented in 03-PATTERNS.md).
  writeFileSync(
    join(root, "Broken.agda"),
    [
      "module Target where",
      "",
      "data Nat : Set where",
      "  zero : Nat",
      "",
      "bad : Nat",
      "bad = Set",
      "",
    ].join("\n"),
    "utf8",
  );

  const entry: CaptureRegressionEntry = {
    id: "synthetic-mutation",
    issue: [],
    status: "red",
    tool: "agda_load",
    fixtureDir: ".",
    entryFile: "Target.agda",
    mutation: { targetFile: "Target.agda", sourceFile: "Broken.agda" },
    expected: {
      classification: "type-error",
      success: false,
      goalCount: 0,
      invisibleGoalCount: 0,
      hasHoles: false,
      errorCategories: [],
    },
  };

  const { observed } = await replayCaptureRegressionEntry(entry, root);
  expect(observed.classification).toBe("type-error");
  expect(observed.success).toBe(false);
});
