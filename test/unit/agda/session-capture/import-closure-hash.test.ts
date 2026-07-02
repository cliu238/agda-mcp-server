// MIT License — see LICENSE
//
// Unit tests for hashImportClosure / inlineFirstPartySources (CAP-01,
// D-07). Uses mkdtempSync-built minimal two-file Agda projects for
// full control over content-sensitivity, portability, and oversize
// assertions; TEST_FIXTURE_PROJECT_ROOT's CompleteFixture.agda (zero
// imports) covers the "closure of one" case.

import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  hashImportClosure,
  inlineFirstPartySources,
} from "../../../../src/agda/session-capture/import-closure-hash.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../../helpers/repo-root.js";
import { MAX_AGDA_SOURCE_BYTES } from "../../../../src/session/safe-source-io.js";

const MAIN_CONTENT = "module Main where\nopen import Helper\nx = y\n";
const HELPER_CONTENT = "module Helper where\ny = 1\n";

function writeTwoFileProject(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "agda-mcp-closure-"));
  writeFileSync(join(repoRoot, "Main.agda"), MAIN_CONTENT, "utf8");
  writeFileSync(join(repoRoot, "Helper.agda"), HELPER_CONTENT, "utf8");
  return repoRoot;
}

// ── Behavior 1: determinism ──────────────────────────────────────────

test("hashImportClosure is deterministic across repeated calls", () => {
  const repoRoot = writeTwoFileProject();

  const first = hashImportClosure(repoRoot, "Main.agda");
  const second = hashImportClosure(repoRoot, "Main.agda");

  expect(first).not.toBeNull();
  expect(first).toBe(second);
});

// ── Behavior 2: content-sensitivity ──────────────────────────────────

test("hashImportClosure changes when a closure file's content changes", () => {
  const repoRoot = writeTwoFileProject();

  const before = hashImportClosure(repoRoot, "Main.agda");
  writeFileSync(join(repoRoot, "Helper.agda"), "module Helper where\ny = 2\n", "utf8");
  const after = hashImportClosure(repoRoot, "Main.agda");

  expect(after).not.toBeNull();
  expect(after).not.toBe(before);
});

// ── Behavior 3: closure of one (zero imports) ────────────────────────

test("hashImportClosure on a file with zero imports still returns a non-empty digest", () => {
  const digest = hashImportClosure(TEST_FIXTURE_PROJECT_ROOT, "CompleteFixture.agda");

  expect(digest).not.toBeNull();
  expect(digest!.length).toBeGreaterThan(0);
});

// ── Behavior 4: portability (no absolute paths / platform separators) ─

test("hashImportClosure is portable: two directory copies of the same tree hash identically", () => {
  const repoRootA = writeTwoFileProject();
  const repoRootB = mkdtempSync(join(tmpdir(), "agda-mcp-closure-"));
  writeFileSync(join(repoRootB, "Main.agda"), MAIN_CONTENT, "utf8");
  writeFileSync(join(repoRootB, "Helper.agda"), HELPER_CONTENT, "utf8");

  const hashA = hashImportClosure(repoRootA, "Main.agda");
  const hashB = hashImportClosure(repoRootB, "Main.agda");

  expect(hashA).not.toBeNull();
  expect(hashA).toBe(hashB);
});

// ── Behavior 5: inlineFirstPartySources completeness ─────────────────

test("inlineFirstPartySources returns every closure file including the loaded file itself", () => {
  const repoRoot = writeTwoFileProject();

  const result = inlineFirstPartySources(repoRoot, "Main.agda");

  expect(result.skipped).toEqual([]);
  const paths = result.sources.map((s) => s.path).sort();
  expect(paths).toEqual(["Helper.agda", "Main.agda"]);

  const main = result.sources.find((s) => s.path === "Main.agda");
  const helper = result.sources.find((s) => s.path === "Helper.agda");
  expect(main?.content).toBe(MAIN_CONTENT);
  expect(helper?.content).toBe(HELPER_CONTENT);
});

// ── Behavior 6: oversized files excluded, never fabricated ──────────

test("inlineFirstPartySources excludes oversized closure files, listing them in skipped (never truncated/faked)", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "agda-mcp-closure-"));
  writeFileSync(join(repoRoot, "Main.agda"), "module Main where\nopen import Big\nx = y\n", "utf8");
  const bigContent =
    "module Big where\n" +
    "-- " + "a".repeat(MAX_AGDA_SOURCE_BYTES + 1024) + "\n" +
    "y = 1\n";
  writeFileSync(join(repoRoot, "Big.agda"), bigContent, "utf8");

  const result = inlineFirstPartySources(repoRoot, "Main.agda");

  expect(result.skipped).toEqual(["Big.agda"]);
  expect(result.sources.find((s) => s.path === "Big.agda")).toBeUndefined();
  expect(result.sources.find((s) => s.path === "Main.agda")).toBeDefined();
});
