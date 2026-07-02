// MIT License — see LICENSE
//
// Unit tests for readDedupIndex / routeDedup (CAP-02, D-03).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "vitest";

import {
  readDedupIndex,
  routeDedup,
} from "../../../../src/agda/session-capture/dedup-index.js";

test("readDedupIndex returns an empty Map when .agda-mcp/ is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "agda-mcp-dedup-index-"));
  try {
    const index = readDedupIndex(dir);
    expect(index.size).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readDedupIndex never throws on a malformed index.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "agda-mcp-dedup-index-"));
  try {
    const captureDir = join(dir, ".agda-mcp", "captures");
    mkdirSync(captureDir, { recursive: true });
    writeFileSync(join(captureDir, "index.json"), "{ not valid json", "utf8");

    const index = readDedupIndex(dir);
    expect(index.size).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("routeDedup routes an absent fingerprint as new-bug/recurrence 1", () => {
  const emptyIndex = new Map();
  expect(routeDedup(emptyIndex, "abc123")).toEqual({
    kind: "new-bug",
    fingerprint: "abc123",
    recurrence: 1,
  });
});

test("routeDedup routes a present fingerprint as update/recurrence+1", () => {
  const index = new Map([["abc123", { recurrence: 3, kind: "update" as const }]]);
  expect(routeDedup(index, "abc123")).toEqual({
    kind: "update",
    fingerprint: "abc123",
    recurrence: 4,
  });
});
