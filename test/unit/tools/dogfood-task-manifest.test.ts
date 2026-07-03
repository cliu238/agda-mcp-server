// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/task-manifest.mjs's loadTaskManifest():
// PROC-01's D-03 mechanical pre-flight hard gate. An undefined path, a
// non-JSON file, or an empty-array JSON file must all throw (never
// silently degrade) — this IS the mechanical assertion CHG's multi-week
// prose-only campaign proved is required. A valid non-empty manifest
// must be accepted and returned fully typed. Mirrors
// test/unit/tools/queue-intake.test.ts's tmpdir-per-test shape.

import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { loadTaskManifest } from "../../../scripts/dogfood/task-manifest.mjs";

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

test("loadTaskManifest(undefined) throws mentioning --manifest", () => {
  expect(() => loadTaskManifest(undefined)).toThrow(/--manifest/);
});

test("loadTaskManifest(pathToNonJsonFile) throws including the offending path", () => {
  const dir = makeTempDir("agda-mcp-task-manifest-");
  const badPath = join(dir, "not-json.json");
  writeFileSync(badPath, "{ not valid json", "utf8");

  expect(() => loadTaskManifest(badPath)).toThrow(
    new RegExp(badPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("loadTaskManifest(pathToEmptyArrayJson) throws (D-03's non-empty-array hard gate)", () => {
  const dir = makeTempDir("agda-mcp-task-manifest-");
  const emptyPath = join(dir, "empty.json");
  writeFileSync(emptyPath, "[]\n", "utf8");

  expect(() => loadTaskManifest(emptyPath)).toThrow();
});

test("loadTaskManifest(pathToOneEntryValidJson) returns a typed array of length 1 matching the input", () => {
  const dir = makeTempDir("agda-mcp-task-manifest-");
  const validPath = join(dir, "valid.json");
  const entry = {
    target: "join-assoc",
    expectedSignature: "join-assoc : (a b c : A) -> join a (join b c) == join (join a b) c",
    corpus: "codex-homotopy-group",
    notes: "Off-by-one index disagreement between two formalization plans.",
  };
  writeFileSync(validPath, JSON.stringify([entry]), "utf8");

  const result = loadTaskManifest(validPath);

  expect(result).toHaveLength(1);
  expect(result[0].target).toBe(entry.target);
  expect(result[0].expectedSignature).toBe(entry.expectedSignature);
  expect(result[0].corpus).toBe(entry.corpus);
  expect(result[0].notes).toBe(entry.notes);
});

test("loadTaskManifest(pathToOneEntryValidJson) omits notes when absent from the input", () => {
  const dir = makeTempDir("agda-mcp-task-manifest-");
  const validPath = join(dir, "valid-no-notes.json");
  const entry = {
    target: "unit-is-contr",
    expectedSignature: "unit-is-contr : is-contr unit",
    corpus: "agda-unimath",
  };
  writeFileSync(validPath, JSON.stringify([entry]), "utf8");

  const result = loadTaskManifest(validPath);

  expect(result).toHaveLength(1);
  expect(result[0].notes).toBeUndefined();
});
