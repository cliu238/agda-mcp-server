// MIT License — see LICENSE
//
// Success criterion 6 (Phase 1 ROADMAP): prove a staged CaptureArtifact
// self-replays cold, on data alone, without the original checkout.
//
// This script is intentionally standalone/out-of-server per
// RESEARCH.md's Architectural Responsibility Map ("cold-replay
// proof... explicitly a scripts-tier validation exercise, not server
// runtime behavior"). It does NOT import from src/ — it re-derives the
// tiny slice of protocol it needs (the IOTCM envelope + Cmd_load
// shape) by hand. That is an explicit, documented exception to the
// "no bare command strings outside command-builder.ts" rule, which
// only applies to src/.
//
// Scope is strictly first-party-source replay fidelity (D-07): only
// `manifest.inlinedFirstPartySources` is materialized onto disk.
// Third-party library files are pinned/replayed via the manifest's
// `agdaDirContents`, never inlined — this script does not attempt to
// reconstruct AGDA_DIR/library registration, so library-dependent
// captures may fail to load cold on a machine with different
// globally-registered libraries. That is a known, documented
// limitation of this manual verification tool, not a bug in it.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

/** Hand-written equivalent of src/protocol/command-builder.ts's
 *  `escapeAgdaString`/`quoted` — this script deliberately does not
 *  import from src/ (see module header). */
function escapeAgdaString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function quoted(text) {
  return `"${escapeAgdaString(text)}"`;
}

function stringList(values) {
  if (values.length === 0) return "[]";
  return `[${values.map((value) => quoted(value)).join(", ")}]`;
}

/** Same envelope shape as src/protocol/command-builder.ts's
 *  `iotcmEnvelope`: `IOTCM "<path>" NonInteractive Direct (<inner>)`. */
function iotcmEnvelope(filePath, innerCommand) {
  return `IOTCM "${escapeAgdaString(filePath)}" NonInteractive Direct (${innerCommand})`;
}

/**
 * Find the LAST recordedActions entry that looks like a load-family
 * tool call (agda_load / agda_typecheck / agda_load_no_metas), and
 * pull the recorded classification + the loaded file's repo-relative
 * path out of it. Returns null when no such entry exists — expected
 * for non-load captures.
 */
function findLoadClassification(recordedActions) {
  const loadFamily = /^agda_(load|typecheck)/;
  for (let i = recordedActions.length - 1; i >= 0; i--) {
    const action = recordedActions[i];
    if (typeof action?.tool !== "string" || !loadFamily.test(action.tool))
      continue;
    const classification = action?.normalizedResponse?.classification;
    if (typeof classification !== "string") continue;
    const filePath =
      typeof action?.args?.file === "string"
        ? action.args.file
        : typeof action?.args?.path === "string"
          ? action.args.path
          : null;
    if (filePath === null) continue;
    return { classification, filePath };
  }
  return null;
}

/** Success vs failure, not full classification-string equality —
 *  full-fidelity comparison is Phase 2's ORCL-01 job, not this
 *  manual script's. */
function classificationIsSuccess(classification) {
  return !/error|fail/i.test(classification);
}

/** Resolve the pinned agda binary, falling back to plain "agda" on
 *  PATH when the pinned absolute path does not exist on THIS machine
 *  — a genuinely different machine will not have the same absolute
 *  pinned path, which is exactly the "second machine" reality this
 *  script proves against. */
function resolveAgdaBinary(pinnedPath) {
  if (
    typeof pinnedPath === "string" &&
    pinnedPath.startsWith("/") &&
    existsSync(pinnedPath)
  ) {
    return pinnedPath;
  }
  return "agda";
}

/** Materialize D-07's inlined first-party sources onto a fresh temp
 *  dir so replay does not depend on the original checkout being
 *  present. */
function materializeSources(tmpDir, inlinedFirstPartySources) {
  for (const entry of inlinedFirstPartySources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string")
      continue;
    const destPath = join(tmpDir, entry.path);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, entry.content, "utf8");
  }
}

/** Idle window (ms) with no new stdout data before the cold round trip
 *  is considered complete. NOTE: an earlier revision of this script
 *  closed the response on the FIRST `"kind":"Status"` line, matching
 *  this script's original design note. Verified against a real local
 *  Agda 2.8.0 binary that this is unsound: a successful load emits
 *  exactly ONE `Status` line mid-stream (before the closing
 *  `AllGoalsWarnings`/`InteractionPoints` terminus), while a load that
 *  fails before type-checking starts (e.g. a library-resolution error)
 *  emits Status twice, with the second one closing the stream. Neither
 *  shape reliably identifies "the last line" from content alone, so
 *  this script instead uses idle-on-stdout completion — the same
 *  general strategy (simplified, no goal-terminus tracking) as
 *  src/session/agda-transport.ts's idle completion, re-derived here
 *  rather than imported (per the module header's no-src/-imports
 *  constraint). */
const COLD_IDLE_MS = 500;
const COLD_HARD_TIMEOUT_MS = 30_000;

/** Spawn a cold, disposable `agda --interaction-json` subprocess and
 *  send one Cmd_load, collecting newline-delimited JSON stdout lines
 *  until stdout goes idle for `COLD_IDLE_MS` (this script's minimal
 *  completion heuristic — the full idle/terminus detection in
 *  src/session/agda-transport.ts is server runtime behavior, out of
 *  scope here per the module header). Resolves with the collected
 *  response lines (parsed where possible, raw text otherwise). */
function runColdLoad(agdaBin, cwd, iotcmCommand) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(agdaBin, ["--interaction-json"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    const responses = [];
    let settled = false;
    const stderrChunks = [];
    let idleTimer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeoutHandle);
      if (idleTimer) clearTimeout(idleTimer);
      try {
        proc.kill("SIGTERM");
      } catch {
        // already gone
      }
      resolvePromise(result);
    };

    const hardTimeoutHandle = setTimeout(() => {
      finish({ responses, timedOut: true, stderr: stderrChunks.join("") });
    }, COLD_HARD_TIMEOUT_MS);

    const bumpIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        finish({ responses, timedOut: false, stderr: stderrChunks.join("") });
      }, COLD_IDLE_MS);
    };

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        // Agda's --interaction-json prefixes each line with
        // "JSON> " in interactive mode; strip it defensively.
        const jsonText = trimmed.startsWith("JSON> ")
          ? trimmed.slice("JSON> ".length)
          : trimmed;
        try {
          responses.push(JSON.parse(jsonText));
        } catch {
          responses.push({ raw: jsonText });
        }
      }
      bumpIdleTimer();
    });

    proc.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString("utf8"));
    });

    proc.on("error", (err) => {
      clearTimeout(hardTimeoutHandle);
      if (idleTimer) clearTimeout(idleTimer);
      rejectPromise(err);
    });

    proc.on("close", () => {
      finish({ responses, timedOut: false, stderr: stderrChunks.join("") });
    });

    proc.stdin.write(`${iotcmCommand}\n`);
  });
}

function coldResponsesLookLikeSuccess(responses) {
  for (const response of responses) {
    if (response?.kind !== "DisplayInfo") continue;
    if (response?.info?.kind === "Error") return false;
  }
  return true;
}

/** Detect the specific, EXPECTED library-resolution failure mode this
 *  script cannot avoid (D-07 scope: third-party libraries are never
 *  replayed cold). Used only to make a FAIL verdict's reason honest
 *  about *why* it failed, rather than implying a genuine replay-
 *  fidelity bug. */
function coldResponsesShowLibraryError(responses) {
  return responses.some(
    (response) =>
      response?.kind === "DisplayInfo" &&
      response?.info?.kind === "Error" &&
      typeof response.info.error?.message === "string" &&
      response.info.error.message.includes("[LibraryError]"),
  );
}

export async function verifyColdReplay(artifactPath) {
  if (!existsSync(artifactPath)) {
    return { verdict: "FAIL", reason: `Artifact not found: ${artifactPath}` };
  }

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch (err) {
    return {
      verdict: "FAIL",
      reason: `Artifact is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const manifest = artifact?.manifest ?? {};
  const recordedActions = Array.isArray(artifact?.recordedActions)
    ? artifact.recordedActions
    : [];
  const loadInfo = findLoadClassification(recordedActions);

  if (loadInfo === null) {
    return {
      verdict: "SKIP",
      reason:
        "This artifact has no load-family recorded action to replay a classification against.",
    };
  }

  const agdaBin = resolveAgdaBinary(manifest.agdaBinaryPath);
  const mergedArgv = Array.isArray(manifest.mergedArgv)
    ? manifest.mergedArgv
    : [];
  const inlinedFirstPartySources = Array.isArray(
    manifest.inlinedFirstPartySources,
  )
    ? manifest.inlinedFirstPartySources
    : [];

  const tmpDir = mkdtempSync(join(tmpdir(), "agda-mcp-cold-replay-"));
  materializeSources(tmpDir, inlinedFirstPartySources);

  const repoRoot =
    typeof manifest.repoRoot === "string" ? manifest.repoRoot : process.cwd();
  // recordedActions' args.file is normally already repo-relative (the
  // same convention manifest.inlinedFirstPartySources' `path` field
  // uses); only re-derive a relative path when the recorded arg
  // happens to be absolute (some callers pass an absolute path).
  const loadedRelativePath = isAbsolute(loadInfo.filePath)
    ? relative(repoRoot, loadInfo.filePath)
    : loadInfo.filePath;
  const materializedPath = join(tmpDir, loadedRelativePath);

  if (!existsSync(materializedPath)) {
    return {
      verdict: "SKIP",
      reason: `Loaded file ${loadedRelativePath} was not among the inlined first-party sources — nothing to replay cold (library-only or out-of-closure file).`,
    };
  }

  const innerCommand = `Cmd_load ${quoted(materializedPath)} ${stringList(mergedArgv)}`;
  const iotcmCommand = iotcmEnvelope(materializedPath, innerCommand);

  let coldResult;
  try {
    coldResult = await runColdLoad(agdaBin, tmpDir, iotcmCommand);
  } catch (err) {
    return {
      verdict: "FAIL",
      reason: `Failed to spawn cold agda process (${agdaBin}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (coldResult.timedOut) {
    return {
      verdict: "FAIL",
      reason:
        "Cold agda process timed out before emitting a closing Status line.",
    };
  }

  const coldSuccess = coldResponsesLookLikeSuccess(coldResult.responses);
  const recordedSuccess = classificationIsSuccess(loadInfo.classification);

  if (coldSuccess === recordedSuccess) {
    return {
      verdict: "PASS",
      reason: `Cold replay verdict (${coldSuccess ? "success" : "failure"}) matches the recorded classification family ("${loadInfo.classification}").`,
    };
  }

  const libraryErrorHint = coldResponsesShowLibraryError(coldResult.responses)
    ? " NOTE: the cold response shows a [LibraryError] — this artifact likely depends on a third-party library, which this script deliberately does not replay cold (D-07: only first-party sources are inlined; library-dependent captures are a known, documented limitation of this manual tool, not necessarily a replay-fidelity bug)."
    : "";

  return {
    verdict: "FAIL",
    reason: `Cold replay verdict (${coldSuccess ? "success" : "failure"}) does NOT match the recorded classification family ("${loadInfo.classification}").${libraryErrorHint}`,
  };
}

export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: node scripts/verify-cold-replay.mjs <path-to-staged-artifact.json>\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const { verdict, reason } = await verifyColdReplay(artifactPath);
    process.stdout.write(`${verdict}: ${reason}\n`);
    process.exitCode = verdict === "FAIL" ? 1 : 0;
  } catch (err) {
    process.stdout.write(
      `FAIL: unexpected error - ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}

const modulePath = new URL(import.meta.url).pathname;
if (process.argv[1] === modulePath) {
  await scriptMain();
}
