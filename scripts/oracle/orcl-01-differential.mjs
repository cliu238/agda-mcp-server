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

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";
import { spawnColdAgdaSession, runEnvironmentProbes } from "./cold-agda-session.mjs";

import { PathSandboxError, resolveFileWithinRoot } from "../../src/repo-root.js";
import { command, iotcmEnvelope, quoted, stringList, topLevelCommand } from "../../src/protocol/command-builder.js";
import { classifyLoadResult, countExplicitSourceHoles } from "../../src/agda/session-load-helpers.js";
import { parseLoadResponses } from "../../src/agda/parse-load-responses.js";
import { normalizeAgdaResponse } from "../../src/agda/normalize-response.js";
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

/** Probes checked BEFORE any cold spawn is attempted — a failure here
 *  means the replay environment itself cannot be trusted, so cold
 *  Agda must never be spawned at all. */
const PRE_SPAWN_PROBE_NAMES = ["version", "agdaDir-hash", "closure-hash", "build-fresh"];

// ── Tuple / category-set diff ────────────────────────────────────────

const TUPLE_FIELDS = ["success", "goalCount", "invisibleGoalCount", "hasHoles", "classification"];

/** Only these 3 warm classifications ever had a real Agda round-trip
 *  (Pitfall 4 / RESEARCH.md): "invalid-command-line-options",
 *  "load-incomplete-no-terminus", "process-died-during-reconciliation",
 *  "not-found", etc. are infra-level sentinels with no meaningful cold
 *  counterpart. */
const COMPLETENESS_CLASSIFICATIONS = new Set(["ok-complete", "ok-with-holes", "type-error"]);

const LOAD_FAMILY_TOOL_PATTERN = /^agda_(load|typecheck)/;

/** Extracts the bracketed Agda diagnostic category tag (e.g.
 *  `"[SafeFlagPostulate]"` -> `"SafeFlagPostulate"`) from a single
 *  error/warning message string. Messages with no such tag normalize
 *  to `"uncategorized"` rather than being dropped, so the category set
 *  still reflects "this message existed" even when it carries no
 *  machine-readable tag. */
export function extractErrorCategory(message) {
  const match = /\[([A-Za-z][A-Za-z0-9]*)\]/.exec(typeof message === "string" ? message : "");
  return match ? match[1] : "uncategorized";
}

/** Sorted, deduplicated category array (never a `Set`, so JSON output
 *  is deterministic and diffable). */
export function categorySet(messages) {
  const unique = new Set((Array.isArray(messages) ? messages : []).map(extractErrorCategory));
  return [...unique].sort();
}

/**
 * Scan `artifact.recordedActions` for the LAST entry whose `tool`
 * matches `/^agda_(load|typecheck)/` (this single regex already
 * matches `agda_load`, `agda_load_no_metas`, and `agda_typecheck` via
 * prefix matching). Returns `null` if none found; otherwise the warm
 * tuple + category set read from `action.normalizedResponse.data`.
 */
export function findWarmLoadTuple(artifact) {
  const actions = Array.isArray(artifact?.recordedActions) ? artifact.recordedActions : [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (typeof action?.tool !== "string" || !LOAD_FAMILY_TOOL_PATTERN.test(action.tool)) {
      continue;
    }
    const data = action?.normalizedResponse?.data;
    if (!data || typeof data.file !== "string" || typeof data.classification !== "string") {
      continue;
    }
    const errors = Array.isArray(data.errors) ? data.errors : [];
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    return {
      file: data.file,
      tuple: {
        success: data.success,
        goalCount: data.goalCount,
        invisibleGoalCount: data.invisibleGoalCount,
        hasHoles: data.hasHoles,
        classification: data.classification,
      },
      categories: categorySet([...errors, ...warnings]),
    };
  }
  return null;
}

/**
 * Separates "-l NAME" library-registration pairs out of a flat,
 * order-preserving `mergedArgv` array. `manifest.mergedArgv`
 * deliberately mixes spawn-time `-l` flags (`library-registration.ts`'s
 * `agdaArgs`) with `Cmd_load`-time flags (`lastDispatchedLoadArgv`) for
 * the manifest's own record-keeping purposes (`manifest-builder.ts`) —
 * but the live server only ever dispatches "-l" flags to the Agda
 * process's SPAWN argv (`agda-process-spawn.ts`), never through
 * `Cmd_load`'s own per-call option list. Replaying "-l" the wrong way
 * (embedded in Cmd_load's own options) was empirically confirmed
 * (Plan 02-03) to attribute a spurious library-resolution error to the
 * wrong logical command, corrupting the diff with a false mismatch —
 * this split restores the same spawn-vs-command-time distinction the
 * live session already maintains. `libraryFlags` feeds the cold
 * spawn's own argv (`extraSpawnArgs`); `remainingFlags` feeds
 * `Cmd_load`'s own per-call option list.
 */
function splitMergedArgv(mergedArgv) {
  const libraryFlags = [];
  const remainingFlags = [];
  for (let i = 0; i < mergedArgv.length; i++) {
    if (mergedArgv[i] === "-l" && i + 1 < mergedArgv.length) {
      libraryFlags.push("-l", mergedArgv[i + 1]);
      i++;
      continue;
    }
    remainingFlags.push(mergedArgv[i]);
  }
  return { libraryFlags, remainingFlags };
}

/**
 * Given an ALREADY-materialized environment and an ALREADY-extracted
 * warm tuple (so Plan 02-05 can share one materialization + one cold
 * session across ORCL-01 and ORCL-03), runs the cold `Cmd_load` and
 * diffs the result against the warm side. Environment probes gate
 * BEFORE and AFTER the cold spawn — an unfaithful replay is always
 * `{ kind: "inconclusive", probe: <name> }`, never a diff verdict.
 */
export async function runColdLoadAndDiff(artifact, materialized, warm) {
  const root = resolve(materialized.tmpDir);
  let materializedPath;
  try {
    materializedPath = resolveFileWithinRoot(root, warm.file);
  } catch (err) {
    if (err instanceof PathSandboxError) {
      return {
        kind: "inconclusive",
        probe: "spawn",
        detail: `warm.file "${warm.file}" escapes the materialized replay directory — nothing to load cold`,
      };
    }
    throw err;
  }

  // Pre-spawn gate: version / agdaDir-hash / closure-hash / build-fresh
  // must ALL pass before cold Agda is ever spawned.
  const preGate = runProbeGate(artifact, materialized, { loadedRelativePath: warm.file });
  const preFailure = preGate.probes.find(
    (probe) => PRE_SPAWN_PROBE_NAMES.includes(probe.probe) && !probe.ok,
  );
  if (preFailure) {
    return { kind: "inconclusive", probe: preFailure.probe, detail: preFailure.detail };
  }

  const mergedArgv = Array.isArray(artifact.manifest.mergedArgv) ? artifact.manifest.mergedArgv : [];
  const { libraryFlags, remainingFlags } = splitMergedArgv(mergedArgv);
  const innerCommand = command("Cmd_load", quoted(materializedPath), stringList(remainingFlags));
  const iotcm = iotcmEnvelope(materializedPath, innerCommand);

  const session = spawnColdAgdaSession({
    agdaBin: artifact.manifest.agdaBinaryPath,
    cwd: materialized.tmpDir,
    env: { ...process.env, AGDA_DIR: materialized.agdaDirTmp },
    idleMs: 2000,
    extraSpawnArgs: libraryFlags,
  });

  // Prime the fresh process with a harmless Cmd_show_version round trip
  // BEFORE the real Cmd_load, exactly mirroring AgdaSession's own
  // pre-flight version-detection behavior (src/agda/agda-version-
  // detection.ts's preflightVersionDetection, which every warm session
  // runs before its first real command whenever a fresh process just
  // spawned). Empirically confirmed (Plan 02-03): with `-l` flags
  // present at spawn time, Agda emits its own process-startup output
  // (here, a library-resolution error from the replayed AGDA_DIR)
  // asynchronously, shortly after spawn but before any stdin write —
  // whichever sendCommand() happens to be in flight when that line
  // arrives absorbs it. The live session's own first command is always
  // Cmd_show_version for exactly this reason; without an equivalent
  // priming step here, that startup noise would land in the real
  // Cmd_load's response array instead and corrupt the diff. Discarding
  // this priming response is safe — the version PROBE itself is still
  // driven by the execFileSync check in runProbeGate, per this plan's
  // explicit instruction; this call exists only to give startup noise
  // somewhere harmless to land.
  try {
    await session.sendCommand(iotcmEnvelope(materializedPath, topLevelCommand("Cmd_show_version")));
  } catch (err) {
    session.kill();
    return {
      kind: "inconclusive",
      probe: "spawn",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let coldResult;
  try {
    coldResult = await session.sendCommand(iotcm);
  } catch (err) {
    session.kill();
    return {
      kind: "inconclusive",
      probe: "spawn",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  session.kill();

  // The live server always normalizes each response immediately after
  // JSON.parse (src/session/agda-transport.ts) before any load logic
  // sees it — the warm side's captured classification was therefore
  // always computed from normalized responses. Apply the same
  // normalization to the cold side so both halves of the diff are
  // truly comparing like for like (a raw, un-normalized response can
  // carry a polymorphic string where an array is expected).
  const normalizedResponses = coldResult.responses.map((resp) => normalizeAgdaResponse(resp));

  const postGate = runProbeGate(artifact, materialized, {
    loadedRelativePath: warm.file,
    coldResponses: normalizedResponses,
    timedOut: coldResult.timedOut,
  });
  const terminusResult = postGate.probes.find((probe) => probe.probe === "terminus");
  if (terminusResult && !terminusResult.ok) {
    return { kind: "inconclusive", probe: "terminus", detail: terminusResult.detail };
  }
  const timeoutResult = postGate.probes.find((probe) => probe.probe === "timeout");
  if (timeoutResult && !timeoutResult.ok) {
    return { kind: "inconclusive", probe: "timeout", detail: timeoutResult.detail };
  }

  const parsed = parseLoadResponses(normalizedResponses);
  const sourceHoleCount = countExplicitSourceHoles(materializedPath);
  const coldClassified = classifyLoadResult({
    success: parsed.success,
    goalCount: parsed.goalCount,
    invisibleGoalCount: parsed.invisibleGoalCount,
    sourceHoleCount,
  });
  const coldTuple = {
    success: parsed.success,
    goalCount: parsed.goalCount,
    invisibleGoalCount: parsed.invisibleGoalCount,
    hasHoles: coldClassified.hasHoles,
    classification: coldClassified.classification,
  };
  const coldCategories = categorySet([...parsed.errors, ...parsed.warnings]);

  // Deliberate design choice: an EXACT match on every tuple field AND
  // the category set is required for `pass`. ANY mismatch — regardless
  // of direction (warm-green/cold-red, warm-red/cold-green, or a
  // same-family classification with a different goal count) — is
  // surfaced as a server-false-green-candidate for human review. This
  // project's anti-false-green posture means a divergence, once replay
  // fidelity is confirmed by the probe gate, is never silently waved
  // through just because it doesn't match the exact #64/#61 shape.
  const tupleMatches = TUPLE_FIELDS.every((field) => warm.tuple[field] === coldTuple[field]);
  const categoriesMatch =
    warm.categories.length === coldCategories.length &&
    warm.categories.every((category, index) => category === coldCategories[index]);

  if (tupleMatches && categoriesMatch) {
    return { kind: "pass" };
  }
  return {
    kind: "server-false-green-candidate",
    warmTuple: warm.tuple,
    coldTuple,
    warmCategories: warm.categories,
    coldCategories,
  };
}

// ── judgeOrcl01: the standalone-runnable ORCL-01 predicate ──────────

/**
 * Judge a staged CaptureArtifact against ORCL-01. Reads the artifact,
 * finds the last load-family warm tuple, and:
 *   - `skip`: no load-family recorded action, or the warm
 *     classification is not one of the 3 completeness values (Pitfall
 *     4) — never attempts a cold spawn in either case.
 *   - `pass` / `server-false-green-candidate` / `inconclusive(probe)`:
 *     from `runColdLoadAndDiff`, after materializing the captured
 *     environment. `cleanup()` always runs (`finally`), so the
 *     materialized temp dirs never leak regardless of outcome.
 */
export async function judgeOrcl01(artifactPath, options = {}) {
  void options; // reserved for a future explicit budget/opt-out flag; unused today.
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const warm = findWarmLoadTuple(artifact);
  if (warm === null) {
    return { kind: "skip", reason: "no load-family recorded action to diff against" };
  }
  if (!COMPLETENESS_CLASSIFICATIONS.has(warm.tuple.classification)) {
    return {
      kind: "skip",
      reason: `warm classification "${warm.tuple.classification}" has no meaningful cold counterpart`,
    };
  }

  const materialized = await materializeCaptureEnvironment(artifact);
  try {
    return await runColdLoadAndDiff(artifact, materialized, warm);
  } finally {
    materialized.cleanup();
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

const EXIT_CODE_BY_KIND = {
  pass: 0,
  skip: 0,
  "server-false-green-candidate": 1,
  inconclusive: 2,
};

export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: npx tsx scripts/oracle/orcl-01-differential.mjs <path-to-artifact.json>\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const outcome = await judgeOrcl01(artifactPath);
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    process.exitCode = EXIT_CODE_BY_KIND[outcome.kind] ?? 0;
  } catch (err) {
    process.stderr.write(
      `orcl-01-differential failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
