// MIT License — see LICENSE
//
// ORCL-01: server-faithfulness differential (Phase 2 oracle triad).
//
// Re-runs a captured load as a fresh, cold `agda --interaction-json
// Cmd_load`, replaying the manifest's exact binary+version, library
// registration, ordered flag argv, and closure-hash-pinned sources
// into an isolated fresh temp directory, then diffs the normalized
// classification tuple + error/warning category set against the warm
// (captured) result. Emits a candidate server false-green ONLY when
// every environment probe (scripts/oracle/cold-agda-session.mjs)
// passes — an unfaithful replay is always INCONCLUSIVE(probe), never
// a false "server bug" and never a false "server is fine".
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 (see
// .planning/phases/02-.../02-CONTEXT.md) — no new MCP verb, no new
// src/ tool surface. Server logic (command-builder, classifyLoadResult,
// parseLoadResponses, import-closure-hash, repo-root containment) is
// imported directly rather than duplicated, per this project's SSOT
// convention — this is what makes ORCL-01 compliant with the "no
// hand-built IOTCM strings" invariant for the first time in the
// capture/oracle code path (scripts/verify-cold-replay.mjs, the seed
// this plan supersedes, predates the tsx-import finding and hand-rolls
// its own escaping).
//
// Run with: npx tsx scripts/oracle/orcl-01-differential.mjs <path>
// (NOT plain `node` — this script's src/ imports use .js-suffixed
// specifiers pointing at sibling .ts files; Node's native TS
// type-stripping does not rewrite .js -> .ts, so plain node fails with
// ERR_MODULE_NOT_FOUND on the first src/ import. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file.)
//
// Task 1 (this commit): materializeCaptureEnvironment + runProbeGate.
// Task 2 (next commit): the cold Cmd_load + tuple/category-set diff +
// judgeOrcl01()/scriptMain built on top of these.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { runEnvironmentProbes } from "./cold-agda-session.mjs";

import { PathSandboxError, resolveFileWithinRoot } from "../../src/repo-root.js";
import { hashImportClosure } from "../../src/agda/session-capture/import-closure-hash.js";
import { parseAgdaVersion } from "../../src/agda/agda-version.js";

// ── materializeCaptureEnvironment ───────────────────────────────────

/**
 * `.agda-lib` is never part of `manifest.inlinedFirstPartySources`
 * (RESEARCH.md Open Question 2, resolved): it is project metadata Agda
 * reads from the current working directory, never an `import`/`open
 * import` target, so `buildImportGraph`'s closure walk (which is the
 * SAME walk `inlineFirstPartySources`/`hashImportClosure` both use)
 * never reaches it. A materialized replay directory therefore always
 * falls back to Agda's legacy per-file `.agdai` interface-cache
 * placement rather than the versioned `_build/<agda-version>/` layout
 * a warm session with an `.agda-lib` may have used. This is an
 * accepted fidelity nuance, not a soundness gap: both caching layouts
 * are freshly isolated in a brand-new temp dir either way, so the
 * "build-fresh" probe (which only checks for a pre-existing `_build`
 * entry) is unaffected regardless of which layout the cold run ends
 * up using.
 *
 * Writes every entry of `artifact.manifest.inlinedFirstPartySources`
 * into a fresh temp dir at its given (repo-root-relative) path, and
 * replays `artifact.manifest.agdaDirContents` (never re-derived via
 * `library-registration.ts`'s own non-deterministic per-call
 * registration minter) verbatim into a second fresh temp dir usable as
 * `AGDA_DIR`. A path-traversal entry (`entry.path` containing `..`
 * segments) is silently skipped — matching the existing
 * malformed-entry `continue` style — never written outside the
 * materialized replay directory.
 */
export async function materializeCaptureEnvironment(artifact) {
  const tmpDir = mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-src-"));
  const agdaDirTmp = mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-agdadir-"));

  const root = resolve(tmpDir);
  const sources = Array.isArray(artifact?.manifest?.inlinedFirstPartySources)
    ? artifact.manifest.inlinedFirstPartySources
    : [];
  for (const entry of sources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string") {
      continue;
    }
    let dest;
    try {
      dest = resolveFileWithinRoot(root, entry.path);
    } catch (err) {
      if (err instanceof PathSandboxError) {
        // Path-traversal entry — skip, never write outside tmpDir.
        continue;
      }
      throw err;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.content, "utf8");
  }

  const agdaDirContents = artifact?.manifest?.agdaDirContents ?? null;
  if (agdaDirContents !== null) {
    writeAgdaDirConfigFile(
      join(agdaDirTmp, "libraries"),
      Array.isArray(agdaDirContents.libraries) ? agdaDirContents.libraries : [],
    );
    writeAgdaDirConfigFile(
      join(agdaDirTmp, "defaults"),
      Array.isArray(agdaDirContents.defaults) ? agdaDirContents.defaults : [],
    );
  }

  return {
    tmpDir,
    agdaDirTmp,
    cleanup() {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(agdaDirTmp, { recursive: true, force: true });
    },
  };
}

/** Matches `library-registration.ts`'s own (private) `writeConfigFile`
 *  format exactly: one entry per line, trailing newline, or an empty
 *  file when there are no entries — so a replayed AGDA_DIR is
 *  byte-for-byte what that module's own registration minter would
 *  have written for the same logical contents. */
function writeAgdaDirConfigFile(filePath, lines) {
  const output = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  writeFileSync(filePath, output, "utf8");
}

// ── runProbeGate ─────────────────────────────────────────────────────

/** A synthetic, trivially-passing cold-response array — used as the
 *  default `coldResponses` input when the caller hasn't attempted a
 *  cold spawn yet (the pre-spawn probe gate only cares about
 *  version/agdaDir-hash/closure-hash/build-fresh; spawn/terminus/
 *  timeout are re-checked for real once a cold response exists). */
const TRIVIALLY_PASSING_COLD_RESPONSES = [{ kind: "InteractionPoints", interactionPoints: [] }];

/**
 * Compute all 7 named environment probes (scripts/oracle/cold-agda-
 * session.mjs's `runEnvironmentProbes`) for a materialized capture
 * replay, and return `{ probes, firstFailure }` (`firstFailure` is the
 * first `ok: false` entry across ALL 7, or `null`).
 *
 * Internally (re)computes the environment-only probe inputs from
 * `artifact`/`materialized` on every call: the cold Agda version (via
 * `execFileSync(artifact.manifest.agdaBinaryPath, ["--version"])`,
 * argv-array form — `agdaBinaryPath` is untrusted artifact data, never
 * shell-interpolated), whether `_build` already existed before any
 * cold load, and — when `coldSpawnResult.loadedRelativePath` is
 * supplied — the recomputed import-closure hash over the materialized
 * directory. `coldSpawnResult.spawnError` / `.coldResponses` /
 * `.timedOut` default to safe, trivially-passing placeholders so a
 * caller can invoke this BEFORE attempting a cold spawn (checking only
 * the environment-only probes) and again AFTER a real cold response is
 * available (checking spawn/terminus/timeout for real).
 */
export function runProbeGate(artifact, materialized, coldSpawnResult = {}) {
  const {
    loadedRelativePath = null,
    spawnError = null,
    coldResponses = TRIVIALLY_PASSING_COLD_RESPONSES,
    timedOut = false,
  } = coldSpawnResult;

  let detectedAgdaVersionRaw = null;
  try {
    detectedAgdaVersionRaw = execFileSync(artifact.manifest.agdaBinaryPath, ["--version"], {
      stdio: "pipe",
    }).toString();
  } catch {
    detectedAgdaVersionRaw = null;
  }

  const buildDirExistedBeforeLoad = existsSync(join(materialized.tmpDir, "_build"));

  let recomputedImportClosureHash = null;
  if (loadedRelativePath !== null) {
    try {
      const parsedVersion = detectedAgdaVersionRaw
        ? parseAgdaVersion(detectedAgdaVersionRaw)
        : undefined;
      recomputedImportClosureHash = hashImportClosure(
        materialized.tmpDir,
        loadedRelativePath,
        parsedVersion,
      );
    } catch {
      recomputedImportClosureHash = null;
    }
  }

  const probes = runEnvironmentProbes({
    manifestAgdaVersion: artifact.manifest.agdaVersion,
    detectedAgdaVersion: detectedAgdaVersionRaw,
    agdaDirContents: artifact.manifest.agdaDirContents,
    capturedImportClosureHash: artifact.manifest.importClosureHash,
    recomputedImportClosureHash,
    buildDirExistedBeforeLoad,
    spawnError,
    attemptedAgdaBin: artifact.manifest.agdaBinaryPath,
    coldResponses,
    timedOut,
  });

  const firstFailure = probes.find((probe) => !probe.ok) ?? null;
  return { probes, firstFailure };
}
