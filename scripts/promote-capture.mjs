// MIT License — see LICENSE
//
// Out-of-band CAP-02 dedup-index write-side (D-03/D-09). Reads a
// staged CaptureArtifact JSON (produced by the agda_capture_session
// MCP tool) and appends/updates the fingerprint -> {recurrence, kind}
// entry in <repoRoot>/.agda-mcp/captures/index.json — the same file
// src/agda/session-capture/dedup-index.ts's readDedupIndex() reads.
//
// This is a plain, single-writer, out-of-band script (mirrors
// copy-json-assets.mjs's plain-script style — there is no closer
// in-repo analog, per PATTERNS.md's "No Analog Found" finding). It is
// meant to run on the SAME machine/checkout that captured the
// artifact: promotion resolves the index path from the artifact's own
// manifest.repoRoot when that path exists locally, falling back to
// process.cwd() otherwise. Cross-machine promotion (running this
// script against an artifact staged on a different machine) is out of
// scope — see scripts/verify-cold-replay.mjs for the cold-replay path
// that IS meant to run on a second machine.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Read the existing index.json (empty object if absent), same
 * guarded-read style as dedup-index.ts's readDedupIndex(): an absent
 * or malformed file never throws, it just downgrades to an empty
 * object.
 */
function readExistingIndex(indexPath) {
  if (!existsSync(indexPath)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    return raw;
  } catch {
    return {};
  }
}

export function promoteCapture(artifactPath) {
  if (!existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Artifact at ${artifactPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const dedup = artifact?.dedup;
  const fingerprint = dedup?.fingerprint;
  const kind = dedup?.kind;
  const recurrence = dedup?.recurrence;
  if (
    typeof fingerprint !== "string" ||
    typeof kind !== "string" ||
    typeof recurrence !== "number"
  ) {
    throw new Error(
      `Artifact at ${artifactPath} is missing a well-formed dedup.{fingerprint,kind,recurrence}`,
    );
  }

  // Prefer the artifact's own manifest.repoRoot (the checkout that
  // captured it); fall back to process.cwd() only when that path is
  // not present on this machine — promotion is meant to run on the
  // SAME machine/checkout that captured, not as a cross-machine sync.
  const manifestRepoRoot = artifact?.manifest?.repoRoot;
  const repoRoot =
    typeof manifestRepoRoot === "string" && existsSync(manifestRepoRoot)
      ? manifestRepoRoot
      : process.cwd();

  const indexPath = join(repoRoot, ".agda-mcp", "captures", "index.json");
  const index = readExistingIndex(indexPath);
  // Object key overwrite (not array append) — re-promoting the same
  // fingerprint updates the entry in place rather than duplicating it.
  index[fingerprint] = { recurrence, kind };

  mkdirSync(dirname(indexPath), { recursive: true });
  // Single-writer, out-of-band script — atomic-write is a src/ concern
  // for concurrent MCP tool calls (writeFileAtomic), not needed here
  // since this script is run by hand, one invocation at a time.
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  return { fingerprint, kind, recurrence, indexPath };
}

export function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: node scripts/promote-capture.mjs <path-to-staged-artifact.json>\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const { fingerprint, kind, recurrence, indexPath } =
      promoteCapture(artifactPath);
    process.stdout.write(
      `Promoted ${fingerprint} (${kind}, recurrence ${recurrence}) into ${indexPath}\n`,
    );
  } catch (err) {
    process.stderr.write(
      `promote-capture failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}

const modulePath = new URL(import.meta.url).pathname;
if (process.argv[1] === modulePath) {
  scriptMain();
}
