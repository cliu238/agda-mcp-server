// MIT License — see LICENSE
//
// PROC-01's task-manifest zod contract (D-03). This file is a SCHEMA
// ONLY — deliberately no committed task-manifest JSON data instance,
// since a real task manifest is per-run and often references a
// private/access-gated corpus (scripts/data/fuel-corpora.json's
// "private" access entries). scripts/dogfood/task-manifest.mjs's
// loadTaskManifest() is the mechanical hard gate that parses a
// caller-supplied manifest path against this schema; the non-empty-
// array requirement (`.min(1)`) IS the D-03 hard gate's core mechanical
// assertion — a manifest that parses but is empty must still refuse.

import { z } from "zod";

export const taskManifestEntrySchema = z.object({
  // Human-readable description of the proof target.
  target: z.string().min(1),
  // The D-03 hard-gate payload. Reuses the SAME "name : Type"
  // top-level-colon-split convention scripts/oracle/orcl-03-
  // conformance.mjs's parseExpectedSignature and agda_capture_session's
  // own expectedSignature input already use, so this field feeds
  // directly into the capture verb without reformatting.
  expectedSignature: z.string().min(1),
  // Cross-references a scripts/data/fuel-corpora.json entry's `key`
  // field BY CONVENTION only — this schema does not enforce that
  // cross-reference, since a task manifest may reference a corpus not
  // yet in the pinned set.
  corpus: z.string().min(1),
  notes: z.string().optional(),
});

export const taskManifestSchema = z.array(taskManifestEntrySchema).min(1);

export type TaskManifestEntry = z.infer<typeof taskManifestEntrySchema>;
