// MIT License — see LICENSE
//
// D-01's mandated idiom (03-CONTEXT.md): a checked-in JSON array is
// the capture-regression matrix's SSOT; this sibling module validates
// it once via zod + loadValidatedJsonData (the release-bug-matrix.ts
// / fixture-matrix.ts idiom) and exports a typed constant. Consumers
// import captureRegressionMatrix, never the raw JSON.
//
// Wave 2 (emitter) appends entries by running the emitter against a
// real capture; Wave 3 (replay runner + flagship rehearsal) reads
// this matrix to drive replay. No hand-authored entries (D-09 part1:
// "no hand-built synthetic bundles"). This restriction is about a
// captured DEFECT's content provenance -- an entry must not fabricate
// a fake bug -- not a blanket ban on ever adding an entry by hand; a
// mutation-less guard entry over already-real, already-captured
// fixture content (e.g. "guard-no-metas-clean-load-under-fault-
// injection", Phase 03.1) is not a synthetic bundle.
//
// What that guard entry proves, precisely (Phase 03.1 D-05): the
// widened strict-terminus idle window does NOT break a legitimately
// goal-less strict load -- it still classifies ok-complete under the
// same fault-injection serverEnv that exposed the flagship false-green,
// i.e. the fix does not over-correct clean loads into false-REDs or
// hangs. It is NOT fix-discriminating: a clean load is ok-complete with
// or without the strict mode, since the idle timer fires either way and
// only the resolution DELAY changes. The single fix-discriminating lock
// is the MUTATION entry "issue-64-61-transitive-staleness" (plus the
// load-terminus-tracker unit tests), which flips red->green only when
// the strict guard is present.

import { z } from "zod";

import { loadValidatedJsonData } from "../helpers/json-data.js";

// Both paths are relative to the entry's own fixtureDir: the replay
// runner loads entryFile once (warm), overwrites targetFile's content
// with sourceFile's content, then reloads entryFile - the recorded
// "trigger sequence" REPRO-01 requires.
const mutationSchema = z.object({
  targetFile: z.string().min(1),
  sourceFile: z.string().min(1),
});

// D-03's normalized classification tuple + error/warning category
// set - ORCL-01's own cold-result shape, never raw text/wire
// order/timing (LOCK-02's "robust across Agda 2.6.4.3-2.9.0").
const expectedResultSchema = z.object({
  classification: z.string(),
  success: z.boolean(),
  goalCount: z.number().int().nonnegative(),
  invisibleGoalCount: z.number().int().nonnegative(),
  hasHoles: z.boolean(),
  errorCategories: z.array(z.string()),
});

export const captureRegressionEntrySchema = z.object({
  id: z.string().min(1),
  issue: z.array(z.number().int().positive()),
  status: z.enum(["red", "locked"]),
  tool: z.string().min(1),
  // Relative to test/fixtures/agda/, e.g. "FixtureDeps/TransitiveStaleness" - no leading slash.
  fixtureDir: z.string().min(1),
  // Relative to fixtureDir - the file passed to `tool`.
  entryFile: z.string().min(1),
  mutation: mutationSchema.optional(),
  // Additive-only: threaded into createMcpHarness's extraEnv by the
  // generic runner - never touches Phase-1's ReplayManifest or
  // Phase-2's verdict schema (03-RESEARCH.md Pitfall 4).
  serverEnv: z.record(z.string(), z.string()).optional(),
  expected: expectedResultSchema,
});

export type CaptureRegressionEntry = z.infer<
  typeof captureRegressionEntrySchema
>;

export const captureRegressionMatrix: CaptureRegressionEntry[] =
  loadValidatedJsonData(
    import.meta.dirname,
    "./capture-regression-matrix.json",
    z.array(captureRegressionEntrySchema),
  );
