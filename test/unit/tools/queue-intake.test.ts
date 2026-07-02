// MIT License — see LICENSE
//
// Unit tests for scripts/queue/intake.mjs: readQueueFile / upsertQueueEntry
// (append-new / bump-in-place). D-06's graveyard guard — re-intake bumps
// the existing entry's recurrence, it never appends a second row for the
// same fingerprint.

import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { readQueueFile, upsertQueueEntry } from "../../../scripts/queue/intake.mjs";

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

function baseEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fingerprint: "fp-1",
    status: "new",
    defectKind: "crash",
    triageClass: null,
    triageConfidence: null,
    recurrence: 1,
    title: "Example defect",
    summary: "A short summary.",
    affectedTool: "agda_load",
    capturePath: null,
    verdictPath: null,
    matrixEntryId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

test("upsertQueueEntry appends a brand-new fingerprint to an empty queue file", async () => {
  const dir = makeTempDir("agda-mcp-queue-intake-");
  const queueJsonPath = join(dir, "fix-queue.json");
  writeFileSync(queueJsonPath, "[]\n", "utf8");

  const entry = baseEntry();
  const result = await upsertQueueEntry(entry, queueJsonPath);

  expect(result).toEqual(entry);
  const onDisk = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(onDisk).toHaveLength(1);
  expect(onDisk[0]).toEqual(entry);
});

test("upsertQueueEntry bumps an existing fingerprint in place instead of duplicating it", async () => {
  const dir = makeTempDir("agda-mcp-queue-intake-");
  const queueJsonPath = join(dir, "fix-queue.json");
  writeFileSync(queueJsonPath, "[]\n", "utf8");

  await upsertQueueEntry(baseEntry({ recurrence: 1 }), queueJsonPath);
  const second = await upsertQueueEntry(
    baseEntry({ title: "Updated title", summary: "Updated summary.", recurrence: 999 }),
    queueJsonPath,
  );

  expect(second.recurrence).toBe(2);
  expect(second.title).toBe("Updated title");
  expect(second.summary).toBe("Updated summary.");

  const onDisk = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(onDisk).toHaveLength(1);
  expect(onDisk[0].recurrence).toBe(2);
  expect(onDisk[0].title).toBe("Updated title");
});

test("upsertQueueEntry throws on an invalid entry and leaves the file unchanged", async () => {
  const dir = makeTempDir("agda-mcp-queue-intake-");
  const queueJsonPath = join(dir, "fix-queue.json");
  writeFileSync(queueJsonPath, "[]\n", "utf8");

  const invalidEntry = baseEntry();
  delete invalidEntry.title;

  await expect(upsertQueueEntry(invalidEntry, queueJsonPath)).rejects.toThrow();

  const onDisk = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(onDisk).toEqual([]);
});

test("readQueueFile returns [] for an absent path and for malformed JSON", () => {
  const dir = makeTempDir("agda-mcp-queue-intake-");
  const absentPath = join(dir, "does-not-exist.json");
  expect(readQueueFile(absentPath)).toEqual([]);

  const malformedPath = join(dir, "malformed.json");
  writeFileSync(malformedPath, "{ not valid json", "utf8");
  expect(readQueueFile(malformedPath)).toEqual([]);
});

test("upsertQueueEntry with { bumpRecurrence: false } preserves recurrence (CR-01: metadata-only backlink write must not shift priority/dedup)", async () => {
  const dir = makeTempDir("agda-mcp-queue-intake-");
  const queueJsonPath = join(dir, "fix-queue.json");
  const entry = baseEntry({ recurrence: 1 });
  writeFileSync(queueJsonPath, JSON.stringify([entry]) + "\n", "utf8");

  // Default (bump) path still bumps.
  await upsertQueueEntry(baseEntry({ recurrence: 99, githubIssue: 7 }), queueJsonPath);
  let onDisk = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(onDisk).toHaveLength(1);
  expect(onDisk[0].recurrence).toBe(2);

  // Metadata-only (backlink) path leaves recurrence untouched.
  await upsertQueueEntry(baseEntry({ recurrence: 99, githubIssue: 42 }), queueJsonPath, {
    bumpRecurrence: false,
  });
  onDisk = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(onDisk).toHaveLength(1);
  expect(onDisk[0].recurrence).toBe(2);
  expect(onDisk[0].githubIssue).toBe(42);
});
