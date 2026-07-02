// MIT License — see LICENSE
//
// CAP-02 dedup routing (D-03, repointed per Phase-4 D-04): a minimal,
// READ-ONLY prior-report index used to decide whether a capture is a
// first-time report (`new-bug`) or a recurrence of a previously seen
// fingerprint (`update`). Capture only reads this index (honors
// emit-only); scripts/queue/intake.mjs writes it out-of-band.
//
// D-04: this now reads the in-repo, git-tracked fix queue
// (test/fixtures/fix-queue.json) instead of the old gitignored,
// machine-local capture-staging index it superseded — recurrence
// history now survives clones and machine switches. The queue is a
// JSON ARRAY of entries (test/fixtures/fix-queue.ts), not an object
// keyed by fingerprint, so the parse loop below duck-types each array
// item rather than each object value; this stays defensive/never-throw
// per this function's own established contract and does NOT import the
// zod-throwing loader.
//
// Reuses `fingerprintBugReport()` verbatim from bug-report.ts — do
// not reimplement the hash.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export { fingerprintBugReport } from "../../reporting/bug-report.js";

import type { DedupRouting } from "./artifact-types.js";

export interface DedupIndexEntry {
  recurrence: number;
  kind: "new-bug" | "update";
}

/**
 * Read the minimal fingerprint -> {recurrence, kind} index from
 * `<repoRoot>/test/fixtures/fix-queue.json` (D-04). Guarded the same
 * way `readNonCommentLines()` guards library-registration reads
 * (existsSync check before the read) — an absent or malformed file
 * never throws, it just downgrades to an empty Map. `kind` is derived
 * from `recurrence` since the queue schema stores no `kind` field of
 * its own — `kind` is CAP-02's own routing vocabulary, a separate axis
 * from the queue's own `status` field.
 */
export function readDedupIndex(repoRoot: string): Map<string, DedupIndexEntry> {
  const indexPath = join(repoRoot, "test", "fixtures", "fix-queue.json");
  if (!existsSync(indexPath)) {
    return new Map();
  }

  try {
    const raw: unknown = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!Array.isArray(raw)) {
      return new Map();
    }

    const entries = new Map<string, DedupIndexEntry>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      const fingerprint = candidate.fingerprint;
      const recurrence = candidate.recurrence;
      if (typeof fingerprint !== "string") continue;
      if (typeof recurrence !== "number") continue;
      entries.set(fingerprint, { recurrence, kind: recurrence > 1 ? "update" : "new-bug" });
    }
    return entries;
  } catch {
    // Malformed fix-queue.json — never throw, never leak a stack trace
    // to the tool caller (T-01-02/T-04-01-02). Downgrade to an empty Map.
    return new Map();
  }
}

/**
 * Route a fingerprint against the dedup index: absent -> first-time
 * `new-bug` at recurrence 1; present -> `update` at
 * `priorEntry.recurrence + 1`.
 */
export function routeDedup(
  index: Map<string, DedupIndexEntry>,
  fingerprint: string,
): DedupRouting {
  const prior = index.get(fingerprint);
  if (!prior) {
    return { kind: "new-bug", fingerprint, recurrence: 1 };
  }
  return { kind: "update", fingerprint, recurrence: prior.recurrence + 1 };
}
