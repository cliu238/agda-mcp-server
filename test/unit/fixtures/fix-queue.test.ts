// MIT License — see LICENSE
//
// Unit tests for the fix queue's typed loader + schema (D-01 idiom,
// mirrors test/unit/fixtures/capture-regression-matrix.test.ts): the
// queue must parse (even empty), a minimal valid entry must be
// accepted, and the two terminal-status refinements (Open Question 3)
// must reject a malformed entry loudly rather than silently.

import { test, expect } from "vitest";

import { fixQueue, fixQueueEntrySchema } from "../../fixtures/fix-queue.js";

test("fix queue loads and validates, even when empty", () => {
  expect(Array.isArray(fixQueue)).toBe(true);
});

test("fixQueueEntrySchema accepts a minimal valid entry", () => {
  const candidate = {
    fingerprint: "abc123",
    status: "new",
    defectKind: "crash",
    triageClass: null,
    triageConfidence: null,
    recurrence: 1,
    title: "Example defect",
    summary: "A short summary of the example defect.",
    affectedTool: "agda_load",
    capturePath: null,
    verdictPath: null,
    matrixEntryId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    closedAt: null,
  };

  expect(() => fixQueueEntrySchema.parse(candidate)).not.toThrow();
});

test("fixQueueEntrySchema rejects status: rejected without a rejectedReason", () => {
  const candidate = {
    fingerprint: "abc123",
    status: "rejected",
    defectKind: "crash",
    triageClass: null,
    triageConfidence: null,
    recurrence: 1,
    title: "Example defect",
    summary: "A short summary of the example defect.",
    affectedTool: "agda_load",
    capturePath: null,
    verdictPath: null,
    matrixEntryId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    closedAt: "2026-07-02T01:00:00.000Z",
  };

  expect(() => fixQueueEntrySchema.parse(candidate)).toThrow();
});

test("fixQueueEntrySchema rejects status: locked with closedAt: null", () => {
  const candidate = {
    fingerprint: "abc123",
    status: "locked",
    defectKind: "crash",
    triageClass: null,
    triageConfidence: null,
    recurrence: 1,
    title: "Example defect",
    summary: "A short summary of the example defect.",
    affectedTool: "agda_load",
    capturePath: null,
    verdictPath: null,
    matrixEntryId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    closedAt: null,
  };

  expect(() => fixQueueEntrySchema.parse(candidate)).toThrow();
});
