// MIT License — see LICENSE
//
// QUEUE-01's intake primitive (D-01/D-04/D-06): the low-level "upsert
// one already-identified fix-queue entry" operation. Finds an existing
// element by fingerprint and either appends a brand-new entry or bumps
// the existing one's recurrence in place — the D-06 graveyard guard:
// re-intake NEVER creates a second row for the same fingerprint. Both
// Plan 04-03's hand-seeding and any future live-capture promotion
// funnel through this same low-level primitive; deriving an entry from
// a live CaptureArtifact is out of this plan's scope.
//
// Run with: npx tsx scripts/queue/intake.mjs <path-to-entry.json> [queue-json-path]
// (NOT plain `node` — this script's src/ + test/ imports use
// .js-suffixed specifiers pointing at sibling .ts files; Node's native
// TS type-stripping does not rewrite .js -> .ts, so plain node fails
// with ERR_MODULE_NOT_FOUND on the first such import. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file — see scripts/emit-regression.mjs's
// header for the same note.)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";

import { fixQueueEntrySchema } from "../../test/fixtures/fix-queue.js";
import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";

/**
 * Read the queue JSON array at `queueJsonPath`. An absent file or
 * malformed/non-array JSON both degrade to an empty array — never
 * throws. Mirrors scripts/promote-capture.mjs's readExistingIndex
 * guard, adapted for an array instead of an object keyed by
 * fingerprint.
 */
export function readQueueFile(queueJsonPath) {
  if (!existsSync(queueJsonPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(readFileSync(queueJsonPath, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Upsert `entryData` into the queue file at `queueJsonPath`: appends a
 * brand-new entry when no existing element shares its `fingerprint`, or
 * replaces the existing element in place when one does (D-06's
 * graveyard guard — re-intake bumps, it never duplicates). On the
 * update path, `recurrence` is ALWAYS derived by bumping the existing
 * stored value by exactly 1 — the caller's own `entryData.recurrence`
 * is never trusted there. Every candidate is validated via
 * `fixQueueEntrySchema.parse` BEFORE anything is written; an invalid
 * candidate throws the zod error verbatim and the on-disk file is left
 * untouched. Returns the validated candidate entry.
 */
export async function upsertQueueEntry(entryData, queueJsonPath) {
  const existing = readQueueFile(queueJsonPath);
  const existingIndex = existing.findIndex((entry) => entry.fingerprint === entryData.fingerprint);

  const candidate =
    existingIndex === -1
      ? entryData
      : { ...existing[existingIndex], ...entryData, recurrence: existing[existingIndex].recurrence + 1 };

  const validated = fixQueueEntrySchema.parse(candidate);

  const updated = [...existing];
  if (existingIndex === -1) {
    updated.push(validated);
  } else {
    updated[existingIndex] = validated;
  }

  await writeFileAtomic(queueJsonPath, `${JSON.stringify(updated, null, 2)}\n`);
  return validated;
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * CLI entry point. Positional arg 1 = path to a JSON file containing a
 * single entry-shaped object (not a whole CaptureArtifact). Positional
 * arg 2 = the queue JSON path, defaulting to test/fixtures/fix-queue.json
 * under SERVER_REPO_ROOT when omitted. On success, prints the resulting
 * fingerprint/status/recurrence to stdout; on failure, writes to stderr
 * and sets `process.exitCode = 1` — never `process.exit()` inside this
 * reusable function.
 */
export async function scriptMain(argv = process.argv.slice(2)) {
  const entryPath = argv[0];
  if (!entryPath) {
    process.stderr.write(
      "Usage: npx tsx scripts/queue/intake.mjs <path-to-entry.json> [queue-json-path]\n",
    );
    process.exitCode = 1;
    return;
  }
  const queueJsonPath = argv[1] ?? join(SERVER_REPO_ROOT, "test/fixtures/fix-queue.json");

  try {
    const entryData = JSON.parse(readFileSync(entryPath, "utf8"));
    const result = await upsertQueueEntry(entryData, queueJsonPath);
    process.stdout.write(
      `Upserted ${result.fingerprint} (${result.status}, recurrence ${result.recurrence}) into ${queueJsonPath}\n`,
    );
  } catch (err) {
    process.stderr.write(`queue intake failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
