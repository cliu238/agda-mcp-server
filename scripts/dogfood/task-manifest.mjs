// MIT License — see LICENSE
//
// PROC-01's D-03 mechanical pre-flight hard gate: a dogfooding proving
// run requires a task manifest carrying the expected top-level
// signature per proof target before it may start. CHG's multi-week
// campaign produced ZERO structured captures despite runbook-prose
// instructions alone (D-03) — this makes the gate MECHANICAL instead:
// loadTaskManifest() throws (never silently degrades) on a missing
// path, unparsable JSON, or an empty array; only Plan 05-02's
// dogfood-run.mjs (the sole CLI caller) translates a thrown failure
// into a non-zero exit + a stderr message naming
// .agents/skills/agda-dogfooding/SKILL.md.
//
// Ships as a scripts/ + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface. Must be imported via `npx tsx` (not
// plain `node`) by any CLI wrapper, since it imports a .ts sibling
// (test/fixtures/task-manifest-schema.ts) via a .js-suffixed specifier
// — Node's native TS type-stripping does not rewrite .js -> .ts, so
// plain node fails with ERR_MODULE_NOT_FOUND on that import. tsx
// resolves this correctly, and so does vitest's own resolver when this
// module is imported from a .test.ts file.

import { readFileSync } from "node:fs";

import { taskManifestSchema } from "../../test/fixtures/task-manifest-schema.js";

/**
 * Load and validate the task manifest at `manifestPath` against
 * `taskManifestSchema`. This IS PROC-01's D-03 mechanical hard gate:
 *
 * - `manifestPath` falsy/undefined -> throws, naming `--manifest`.
 * - the file cannot be read or does not parse as JSON -> throws,
 *   naming `manifestPath` and the underlying error's message.
 * - the parsed value fails schema validation (including the
 *   `.min(1)` empty-array case, the gate's core mechanical assertion)
 *   -> throws, naming `manifestPath` and the zod detail.
 * - a well-formed non-empty array -> returned fully typed.
 *
 * Synchronous (mirrors scripts/oracle/run-oracle.mjs's own sync
 * `JSON.parse(readFileSync(...))` artifact-reading pattern) and NEVER
 * terminates the runtime or sets an exit code itself — it only
 * throws. This is a library function, not a standalone CLI; the sole
 * place a thrown gate failure becomes a non-zero CLI termination is
 * Plan 05-02's `dogfood-run.mjs` pre-flight.
 */
export function loadTaskManifest(manifestPath) {
  if (!manifestPath) {
    throw new Error(
      "Task manifest required: pass --manifest <path-to-task-manifest.json>. "
        + "PROC-01's D-03 hard gate refuses to start a dogfooding run "
        + "without one — see .agents/skills/agda-dogfooding/SKILL.md.",
    );
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Task manifest at ${manifestPath} could not be read or parsed as `
        + `JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    return taskManifestSchema.parse(raw);
  } catch (err) {
    throw new Error(
      `Task manifest at ${manifestPath} failed validation: `
        + `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
