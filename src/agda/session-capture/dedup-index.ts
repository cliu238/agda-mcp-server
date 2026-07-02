// MIT License — see LICENSE
//
// CAP-02 dedup routing (D-03): a minimal, READ-ONLY prior-report
// index used to decide whether a capture is a first-time report
// (`new-bug`) or a recurrence of a previously seen fingerprint
// (`update`). Capture only reads this index (honors emit-only); an
// out-of-band script (outside this plan's scope) writes it.
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
 * Read the minimal fingerprint -> {recurrence, kind} index at
 * `<repoRoot>/.agda-mcp/captures/index.json`. Guarded the same way
 * `readNonCommentLines()` guards library-registration reads
 * (existsSync check before the read) — an absent or malformed file
 * never throws, it just downgrades to an empty Map.
 */
export function readDedupIndex(repoRoot: string): Map<string, DedupIndexEntry> {
  const indexPath = join(repoRoot, ".agda-mcp", "captures", "index.json");
  if (!existsSync(indexPath)) {
    return new Map();
  }

  try {
    const raw: unknown = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!raw || typeof raw !== "object") {
      return new Map();
    }

    const entries = new Map<string, DedupIndexEntry>();
    for (const [fingerprint, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const candidate = value as Record<string, unknown>;
      const recurrence = candidate.recurrence;
      const kind = candidate.kind;
      if (typeof recurrence !== "number") continue;
      if (kind !== "new-bug" && kind !== "update") continue;
      entries.set(fingerprint, { recurrence, kind });
    }
    return entries;
  } catch {
    // Malformed index.json — never throw, never leak a stack trace to
    // the tool caller (T-01-02). Downgrade to an empty Map.
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
