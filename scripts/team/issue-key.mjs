// MIT License — see LICENSE
//
// TEAM-01: a maintainer-run key registry + CLI for minting, rotating,
// revoking, and verifying per-person revocable Bearer keys used by the
// local team feedback channel (07-03's ingest endpoint authenticates
// uploads via this module's readKeyRegistry/verifyBearerToken exports —
// see 07-CONTEXT.md D-13/D-14).
//
// Security invariants (D-13; threat register T-07-01..T-07-05):
//   - The on-disk registry never stores a plaintext key — only
//     sha256(key) per entry. The raw key is printed to stdout exactly
//     once, at issuance, and is never written to any file.
//   - Bearer comparison uses crypto.timingSafeEqual, never `===`, so a
//     timing side-channel can't leak how many hash bytes matched.
//   - The registry file is chmod'd 0o600 after every write.
//   - readKeyRegistry always re-reads from disk (no in-memory cache),
//     so a revocation takes effect on the very next lookup.
//
// Run with: npx tsx scripts/team/issue-key.mjs issue|revoke|list <person>
// (NOT plain `node` — mirrors scripts/queue/intake.mjs's header note:
// the .js-suffixed specifiers below point at sibling .ts files, and
// only tsx/vitest's resolver rewrites those correctly.)

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";

/**
 * The exact consent text printed at issuance (D-06): names precisely
 * what a teammate's upload contains so consent is informed, not
 * boilerplate. Every noun here must stay true to what upload-run.mjs
 * (07-02) actually sends — update both together if the upload payload
 * ever changes shape.
 */
export const CONSENT_STATEMENT = `
By using this Bearer key to upload, you are sending to the maintainer:
  - structured captures (.agda-mcp/captures/)
  - full session run reports and transcripts (.agda-mcp/runs/)
  - your COMPLETE, UNREDACTED agent session logs (Claude Code / Codex)

Nothing is filtered, summarized, or redacted before upload — the
maintainer can see this content in full. Do not use this key for a
session containing anything you are not comfortable sharing in full.
`.trim();

/**
 * Resolve the on-disk path of the (gitignored) key registry.
 * `AGDA_MCP_TEAM_KEYS_PATH` wins when set (the same env-override shape
 * every `resolveXxx()` in this codebase uses, e.g.
 * transcript-writer.mjs's `resolveRunsRoot`); otherwise defaults to
 * scripts/team/data/team-keys.json under the repo root.
 */
export function resolveKeysPath() {
  const override = process.env.AGDA_MCP_TEAM_KEYS_PATH?.trim();
  if (override) {
    return override;
  }
  return join(SERVER_REPO_ROOT, "scripts", "team", "data", "team-keys.json");
}

/**
 * Read the key registry array at `keysPath`. An absent file, malformed
 * JSON, or a non-array JSON value all degrade to an empty array —
 * never throws. Mirrors scripts/queue/intake.mjs's readQueueFile
 * exactly; the consumer of this file (07-03's ingest endpoint) relies
 * on this never-cache-never-throw contract for T-07-03 (revocation
 * takes effect on the very next lookup, since nothing is cached
 * in-process).
 */
export function readKeyRegistry(keysPath) {
  if (!existsSync(keysPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(readFileSync(keysPath, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Write the full registry array back to `keysPath` atomically, then
 * chmod it 0o600 (T-07-02: unreadable by other local users). Creates
 * the parent directory first since scripts/team/data/ does not exist
 * until the first key is ever issued.
 */
export async function writeKeyRegistry(keysPath, entries) {
  mkdirSync(dirname(keysPath), { recursive: true });
  await writeFileAtomic(keysPath, `${JSON.stringify(entries, null, 2)}\n`);
  await chmod(keysPath, 0o600);
}

/**
 * Deterministic sha256 hex digest of a raw key. Never store or log the
 * input to this function anywhere except as this hash (D-13).
 */
export function hashKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * True only for a non-empty lowercase-kebab slug — the same shape as
 * a GitHub-handle-derived person identifier. Rejects capitals, spaces,
 * dots, and path-traversal-shaped input (`../etc`) so a person value
 * can never be mistaken for a filesystem path segment elsewhere in the
 * team channel.
 */
export function isValidPersonSlug(person) {
  return typeof person === "string" && /^[a-z0-9-]+$/.test(person);
}

/**
 * Mint (or rotate) a Bearer key for `person`. Validates the slug
 * BEFORE any file I/O so an invalid value never touches disk. A
 * first-time person gets a brand-new entry; a person who already has
 * one has it fully replaced (rotation) — the previous key's hash is
 * discarded, so it stops verifying immediately after this call
 * returns. The raw key is returned exactly once; only its hash is
 * ever persisted.
 */
export async function issueKey(person, keysPath) {
  if (!isValidPersonSlug(person)) {
    throw new Error(`Invalid person slug: ${JSON.stringify(person)} (expected /^[a-z0-9-]+$/)`);
  }

  const rawKey = randomBytes(32).toString("hex");
  const keyHash = hashKey(rawKey);
  const issuedAt = new Date().toISOString();

  const entries = readKeyRegistry(keysPath).filter((entry) => entry.person !== person);
  entries.push({ person, keyHash, issuedAt, revoked: false, revokedAt: null });
  await writeKeyRegistry(keysPath, entries);

  return { person, rawKey, issuedAt };
}

/**
 * Revoke `person`'s active key in place (sets revoked:true +
 * revokedAt). Never throws for a person with no registry entry —
 * returns { person, revoked: false } instead, so the CLI can report a
 * clean "no such person" outcome rather than crashing.
 */
export async function revokeKey(person, keysPath) {
  const entries = readKeyRegistry(keysPath);
  const entry = entries.find((candidate) => candidate.person === person);
  if (!entry) {
    return { person, revoked: false };
  }

  entry.revoked = true;
  entry.revokedAt = new Date().toISOString();
  await writeKeyRegistry(keysPath, entries);

  return { person, revoked: true };
}

/**
 * Resolve a Bearer `token` to the person it authenticates for, or
 * `null` if there is no match. Matches only ACTIVE (revoked: false)
 * entries via crypto.timingSafeEqual (D-13 — never `===`, which would
 * leak match-length via timing). Never throws: a malformed/empty
 * token, a malformed registry entry, or a timingSafeEqual length
 * mismatch all resolve to "no match" rather than propagating an
 * exception into the caller's request-handling path.
 */
export function verifyBearerToken(token, registryEntries) {
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }

  const candidateBuffer = Buffer.from(hashKey(token));

  for (const entry of registryEntries) {
    if (entry?.revoked === true) {
      continue;
    }
    if (typeof entry?.keyHash !== "string" || entry.keyHash.length !== 64) {
      continue;
    }
    try {
      if (timingSafeEqual(candidateBuffer, Buffer.from(entry.keyHash))) {
        return entry.person;
      }
    } catch {
      // timingSafeEqual throws on a buffer-length mismatch — treat
      // that as "no match" rather than letting it propagate.
    }
  }

  return null;
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * CLI entry point. argv[0] is the subcommand (issue | revoke | list),
 * argv[1] is the person slug for issue/revoke. Always resolves the
 * registry path via resolveKeysPath() — there is no CLI override,
 * matching the env-var-is-the-only-override convention used
 * throughout this codebase. Never `process.exit()` inside this
 * reusable function — sets `process.exitCode` instead so vitest can
 * import and call this directly without killing the test process.
 */
export async function scriptMain(argv = process.argv.slice(2)) {
  const [subcommand, person] = argv;
  const keysPath = resolveKeysPath();

  if (subcommand === "issue") {
    try {
      const result = await issueKey(person, keysPath);
      process.stdout.write(`${CONSENT_STATEMENT}\n\n`);
      process.stdout.write(
        `Bearer key for ${result.person} (store this now — it will not be shown again):\n${result.rawKey}\n`,
      );
    } catch (err) {
      process.stderr.write(`issue-key: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "revoke") {
    const result = await revokeKey(person, keysPath);
    if (result.revoked) {
      process.stdout.write(`Revoked key for ${result.person}\n`);
    } else {
      process.stderr.write(`issue-key: no such person: ${JSON.stringify(person)}\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "list") {
    const entries = readKeyRegistry(keysPath);
    for (const entry of entries) {
      process.stdout.write(`${entry.person}  issued=${entry.issuedAt}  revoked=${entry.revoked}\n`);
    }
    return;
  }

  process.stderr.write("Usage: npx tsx scripts/team/issue-key.mjs issue|revoke|list <person>\n");
  process.exitCode = 1;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
