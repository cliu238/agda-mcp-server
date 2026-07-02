// MIT License — see LICENSE
//
// D-01's mandated SSOT (04-CONTEXT.md): a checked-in JSON array is the
// fix queue's single source of truth. This sibling module validates it
// once via zod + loadValidatedJsonData — the exact same idiom already
// used twice in this repo (capture-regression-matrix.{json,ts},
// release-bug-matrix.{json,ts}) — and exports a typed constant.
// Consumers import fixQueue, never the raw JSON.
//
// The sibling .json+.ts pair (both under test/fixtures/) was chosen for
// maximal idiom consistency with those two existing matrices, rather
// than the alternative docs/fix-queue.json split location RESEARCH.md
// also considered.
//
// This plan (04-01) defines the CONTRACT only — the file starts as an
// empty array; Plan 04-03 populates the real seed cargo (the flagship
// #64/#61 capture plus the 8 CHG turn-key specs + 4 CHG candidate
// defects, entered as needs-reverify entries per D-05).
//
// There is deliberately NO stored `priority` field: priority is always
// computed on the fly from `defectKind` + `recurrence` by Plan 04-05's
// `comparePriority`, never persisted, so it can never drift out of sync
// with the data it is derived from — the same reasoning D-02 applies to
// rejecting a second event log (status transitions mutate this one
// array in place; git history over the tracked file is the audit trail).

import { z } from "zod";

import { loadValidatedJsonData } from "../helpers/json-data.js";

// D-09: two separate classification axes, never merged. `triageClass`
// enums against error-classifier.ts's own TriageClass union verbatim —
// nothing invented here.
const TRIAGE_CLASSES = [
  "mechanical-import",
  "mechanical-rename",
  "parser-regression",
  "coverage-missing",
  "proof-obligation",
  "dep-failure",
  "toolchain",
] as const;

export const fixQueueEntrySchema = z
  .object({
    // QUEUE-01's key — stable content-addressed defect identity
    // (fingerprintBugReport(), reused verbatim elsewhere in the repo).
    fingerprint: z.string().min(1),
    // D-07's four plus the fifth terminal `rejected` state.
    status: z.enum(["new", "triaged", "fixing", "locked", "rejected"]),
    rejectedReason: z.enum(["not-a-bug", "wont-fix", "cannot-reproduce"]).optional(),
    // D-05: never a sixth status value — a boolean annotation instead.
    needsReverify: z.boolean().optional(),
    // QUEUE-02's server-defect axis — the forced priority ordering
    // (false-green > crash > wrong-result > missing-feature).
    defectKind: z.enum(["false-green", "crash", "wrong-result", "missing-feature"]),
    // QUEUE-03's Agda-error axis — null when not applicable/unavailable.
    // D-09: never merged with, or derived from, defectKind.
    triageClass: z.enum(TRIAGE_CLASSES).nullable(),
    triageConfidence: z.number().min(0).max(1).nullable(),
    recurrence: z.number().int().positive(),
    title: z.string().min(1),
    summary: z.string().min(1),
    affectedTool: z.string().min(1),
    capturePath: z.string().nullable(),
    verdictPath: z.string().nullable(),
    // Links to capture-regression-matrix.json's own `id` field (D-08).
    matrixEntryId: z.string().nullable(),
    // PRE-EXISTING known GitHub issue numbers, distinct from the
    // mirror's own backlink below.
    issue: z.array(z.number().int().positive()).optional(),
    // The Phase-4-mirror's OWN backlink once it publishes (D-12) —
    // idempotent re-runs update this same issue, never duplicate it.
    githubIssue: z.number().int().positive().nullable().optional(),
    // Cross-references another entry sharing the same root cause
    // without merging them into one row (RESEARCH.md Open Question 1).
    relatedFingerprint: z.array(z.string()).optional(),
    createdAt: z.string(),
    closedAt: z.string().nullable(),
    notes: z.string().optional(),
  })
  // Open Question 3's resolution: enforce both terminal-status
  // invariants in the schema itself, not by convention — a manual edit
  // that forgets one of these fails loudly at the next script/test run
  // instead of silently corrupting the close-rate metric.
  .superRefine((entry, ctx) => {
    if (entry.status === "rejected" && entry.rejectedReason === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rejectedReason"],
        message: "rejectedReason is required when status is \"rejected\"",
      });
    }
    if ((entry.status === "locked" || entry.status === "rejected") && entry.closedAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["closedAt"],
        message: "closedAt must be non-null when status is \"locked\" or \"rejected\"",
      });
    }
  });

export type FixQueueEntry = z.infer<typeof fixQueueEntrySchema>;

export const fixQueue: FixQueueEntry[] = loadValidatedJsonData(
  import.meta.dirname,
  "./fix-queue.json",
  z.array(fixQueueEntrySchema),
);
