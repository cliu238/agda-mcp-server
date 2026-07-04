// MIT License — see LICENSE
//
// Unit tests for the fix queue's typed loader + schema (D-01 idiom,
// mirrors test/unit/fixtures/capture-regression-matrix.test.ts): the
// queue must parse (even empty), a minimal valid entry must be
// accepted, and the two terminal-status refinements (Open Question 3)
// must reject a malformed entry loudly rather than silently.
//
// Plan 04-03 extends this file with seed-data assertions covering the
// real 13-entry cargo: count, fingerprint uniqueness, relatedFingerprint
// referential integrity, the flagship's matrix linkage, the
// needsReverify:true tally, and a classifyAgdaError() re-derivation
// that re-proves the 3 grounded entries' precomputed triageClass/
// triageConfidence values against their own raw error text.

import { test, expect } from "vitest";

import { fixQueue, fixQueueEntrySchema } from "../../fixtures/fix-queue.js";
import { classifyAgdaError } from "../../../src/agda/error-classifier.js";

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

// ── Seed data (Plan 04-03) ───────────────────────────────────────────

test("fixQueue holds the 13 real seeded entries plus dogfood-wrapup auto-filings from Phase 6 plan 06-03's RT5/RT6 live sessions", () => {
  expect(fixQueue.length).toBe(15);
});

test("every fixQueue entry has a unique fingerprint", () => {
  const fingerprints = fixQueue.map((entry) => entry.fingerprint);
  expect(new Set(fingerprints).size).toBe(fixQueue.length);
});

test("every relatedFingerprint cross-reference resolves to another entry's fingerprint in fixQueue", () => {
  const fingerprints = new Set(fixQueue.map((entry) => entry.fingerprint));
  for (const entry of fixQueue) {
    for (const related of entry.relatedFingerprint ?? []) {
      expect(fingerprints.has(related)).toBe(true);
    }
  }
});

test("the flagship #64/#61 entry is locked and linked to its capture-regression-matrix row", () => {
  const flagship = fixQueue.find((entry) => entry.fingerprint === "e6f0c1169032b9d5");
  expect(flagship).toBeDefined();
  expect(flagship?.status).toBe("locked");
  expect(flagship?.closedAt).not.toBeNull();
  expect(flagship?.matrixEntryId).toBe("issue-64-61-transitive-staleness");
  expect(flagship?.issue).toEqual(expect.arrayContaining([64, 61]));
});

test("zero entries are flagged needsReverify: true (all 8 RT1-RT8 specs re-verified: RT1-RT4 in Phase 6 plan 06-02, RT5-RT8 in plan 06-03)", () => {
  const needsReverifyCount = fixQueue.filter((entry) => entry.needsReverify === true).length;
  expect(needsReverifyCount).toBe(0);
});

test("classifyAgdaError on each grounded entry's own raw error text matches its seeded triageClass/triageConfidence", () => {
  // Raw error text transcribed verbatim from this plan's Task 1 seed
  // entries (04-03-PLAN.md) — the same literals CHG-REVERIFY.md
  // captured for the flagship, agda_auto, and agda_give defects.
  const flagshipErrorText =
    "6.12-20: error: [UnequalTerms]\nBool !=< Nat\nwhen checking that the expression getValue has type Nat";
  const autoErrorText = "1.1-3: error: [NotInScope]\nNot in scope:\n  -d at 1.1-3\nwhen scope checking -d";
  const giveErrorText =
    "1.1-5: error: [UnequalTerms]\nBool !=< Nat\nwhen checking that the expression true has type Nat";

  const flagship = fixQueue.find((entry) => entry.fingerprint === "e6f0c1169032b9d5");
  const autoEntry = fixQueue.find((entry) => entry.fingerprint === "5abecc959e43fef3");
  const giveEntry = fixQueue.find((entry) => entry.fingerprint === "bfcba437f5426fd6");
  expect(flagship).toBeDefined();
  expect(autoEntry).toBeDefined();
  expect(giveEntry).toBeDefined();

  const flagshipResult = classifyAgdaError(flagshipErrorText);
  const autoResult = classifyAgdaError(autoErrorText);
  const giveResult = classifyAgdaError(giveErrorText);

  expect(flagshipResult.category).toBe(flagship?.triageClass);
  expect(flagshipResult.confidence).toBe(flagship?.triageConfidence);
  expect(autoResult.category).toBe(autoEntry?.triageClass);
  expect(autoResult.confidence).toBe(autoEntry?.triageConfidence);
  expect(giveResult.category).toBe(giveEntry?.triageClass);
  expect(giveResult.confidence).toBe(giveEntry?.triageConfidence);
});
