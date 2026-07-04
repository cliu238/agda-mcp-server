// MIT License — see LICENSE
//
// Shared, disposable cold `agda --interaction-json` process lifecycle
// (spawnColdAgdaSession) plus the 7 named environment probes
// (runEnvironmentProbes) that ORCL-01 (Plan 02-03) and ORCL-03 (Plan
// 02-04) both consume. Pure shared infrastructure — per D-05 this
// lives entirely under scripts/ (no new MCP verb, no new src/ tool
// surface). Reuses src/ logic (version parsing/comparison) via a
// plain relative import rather than re-deriving a second copy.
//
// spawnColdAgdaSession() generalizes a since-deleted single-command
// cold-replay script's runColdLoad() (deleted 2026-07 as DEBT-01 — see
// PROJECT.md Key Decisions for the exact former filename and
// evidence), which killed the process after exactly ONE command, into
// a reusable, MULTI-command lifecycle: ONE spawn for the
// lifetime of the returned object; each sendCommand() call arms its
// OWN idle timer (reset on every subsequent stdout chunk) and
// resolves independently, so ORCL-01 can issue Cmd_load and ORCL-03
// can issue a second Cmd_infer_toplevel against the SAME still-open
// process before either predicate calls kill().
//
// runEnvironmentProbes() implements the 7 gates that must all pass
// before ORCL-01's differential is trusted. Every probe is a pure
// function over caller-supplied plain data (no live subprocess, no
// spawning) — Plan 02-03 wires the actual materialization / spawn /
// hash-computation and passes the results in here. An evidence-free
// or environment-mismatched cold run must report INCONCLUSIVE (ok:
// false, naming itself), never a false PASS — this generalizes the
// CR-02 fix into the probe framework.
//
// D-04: the cold run never reuses the live server's interactive
// per-command wait budget (a completely separate env var driving
// AgdaSession's own command dispatch). The oracle is offline batch:
// `hardTimeoutMs` is OPTIONAL and uncapped by default.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { isMainModule } from "../test-with-sentinel.mjs";
import { parseAgdaVersion, compareVersions } from "../../src/agda/agda-version.js";

/**
 * Spawn ONE disposable `agda --interaction-json` process and return a
 * `{ sendCommand(iotcm) -> Promise<{ responses, timedOut, stderr }>,
 * kill() }` lifecycle object that can send MULTIPLE sequential IOTCM
 * commands against the SAME process before the caller kills it.
 *
 * Reuses the exact `"JSON> "`-prefix-stripping + per-line
 * `JSON.parse`-with-raw-fallback parsing loop originally written for
 * the since-deleted cold-replay script's single-command `runColdLoad()`.
 * Complete lines are always drained from the buffer as they arrive
 * (even between commands, when nothing is pending) so stray output can
 * never leak into the WRONG command's response array; a line is only
 * recorded into a response array while a `sendCommand()` call is in
 * flight.
 *
 * `spawn(agdaBin, ["--interaction-json"], {...})` always uses the
 * argv-array form, never a shell string, so an untrusted/corrupted
 * `agdaBin` path (read from a captured artifact) cannot inject shell
 * syntax.
 *
 * @param {object} options
 * @param {string} options.agdaBin - Path to (or bare name of) the
 *   `agda` binary to spawn.
 * @param {string} [options.cwd] - Working directory for the spawned
 *   process (the materialized replay directory).
 * @param {NodeJS.ProcessEnv} [options.env] - Environment for the
 *   spawned process. Defaults to `spawn`'s own default (`process.env`)
 *   when omitted.
 * @param {number} [options.idleMs] - Idle window (ms) with no new
 *   stdout data after a `sendCommand()` write before that call's
 *   promise resolves. Reset on every call independently — never
 *   shared across commands. Defaults to 2000.
 * @param {number} [options.hardTimeoutMs] - Optional per-call hard
 *   cap (ms). When omitted, a `sendCommand()` call runs to completion
 *   with no upper bound (D-04: the oracle is offline batch).
 * @param {string[]} [options.extraSpawnArgs] - Extra argv appended
 *   after `--interaction-json` (e.g. `["-l", "some-library"]`).
 *   Mirrors `agda-process-spawn.ts`'s `[..."--interaction-json",
 *   ...registration.agdaArgs]` shape — library registration (`-l`)
 *   is a SPAWN-time-only concern in the live server; Plan 02-03
 *   empirically confirmed that replaying a "-l NAME" pair via
 *   `Cmd_load`'s own per-call option list instead produces a spurious
 *   library-resolution error attributed to the wrong logical command
 *   (observed against a nix-packaged Agda binary whose wrapper
 *   hardcodes `--library-file=<nix-store path>`, but the underlying
 *   spawn-time-vs-command-time distinction is a general Agda protocol
 *   property, not a nix-specific one). Defaults to `[]` — fully
 *   backward compatible with every existing caller.
 * @returns {{
 *   sendCommand: (iotcm: string) => Promise<{ responses: unknown[], timedOut: boolean, stderr: string }>,
 *   kill: () => void,
 * }}
 */
export function spawnColdAgdaSession({
  agdaBin,
  cwd,
  env,
  idleMs = 2000,
  hardTimeoutMs,
  extraSpawnArgs = [],
} = {}) {
  let proc;
  try {
    proc = spawn(agdaBin, ["--interaction-json", ...extraSpawnArgs], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const spawnError = err instanceof Error ? err : new Error(String(err));
    // spawn() itself threw synchronously (rare — e.g. a bad cwd).
    // Every sendCommand() call rejects with the same error; kill() is
    // a harmless noop since there is no process to terminate.
    return {
      sendCommand: () => Promise.reject(spawnError),
      kill: () => {},
    };
  }

  let buffer = "";
  const stderrChunks = [];
  let killed = false;
  let fatalError = null;
  // The single in-flight sendCommand() call, if any. Only one command
  // may be in flight at a time — the underlying process is a single
  // stdin/stdout pipe, so a second overlapping sendCommand() would
  // corrupt both response arrays.
  let pending = null;

  function settlePending(timedOut) {
    if (!pending) return;
    const { resolve, responses, idleTimer, hardTimer } = pending;
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    pending = null;
    resolve({ responses, timedOut, stderr: stderrChunks.join("") });
  }

  function rejectPending(err) {
    if (!pending) return;
    const { reject, idleTimer, hardTimer } = pending;
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    pending = null;
    reject(err);
  }

  function bumpIdleTimer() {
    if (!pending) return;
    if (pending.idleTimer) clearTimeout(pending.idleTimer);
    pending.idleTimer = setTimeout(() => settlePending(false), idleMs);
  }

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      // Agda's --interaction-json prefixes each line with "JSON> " in
      // interactive mode; strip it defensively.
      const jsonText = trimmed.startsWith("JSON> ") ? trimmed.slice("JSON> ".length) : trimmed;
      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = { raw: jsonText };
      }
      // Only attribute a line to a command that is actually in
      // flight — output arriving between commands (none expected in
      // practice) is drained but discarded, never mis-attributed.
      if (pending) {
        pending.responses.push(parsed);
      }
    }
    bumpIdleTimer();
  });

  proc.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString("utf8"));
  });

  proc.on("error", (err) => {
    fatalError = err;
    rejectPending(err);
  });

  proc.on("close", () => {
    // Process closed mid-command (e.g. it crashed) — settle whatever
    // was collected so far rather than leaving the caller waiting
    // forever.
    settlePending(false);
  });

  function sendCommand(iotcmString) {
    if (killed) {
      return Promise.reject(new Error("spawnColdAgdaSession: sendCommand() called after kill()"));
    }
    if (fatalError) {
      return Promise.reject(fatalError);
    }
    if (pending) {
      return Promise.reject(
        new Error("spawnColdAgdaSession: sendCommand() called while a previous command is still in flight"),
      );
    }
    return new Promise((resolvePromise, rejectPromise) => {
      pending = {
        resolve: resolvePromise,
        reject: rejectPromise,
        responses: [],
        idleTimer: null,
        hardTimer: null,
      };
      if (hardTimeoutMs !== undefined) {
        pending.hardTimer = setTimeout(() => settlePending(true), hardTimeoutMs);
      }
      try {
        proc.stdin.write(`${iotcmString}\n`);
      } catch (err) {
        rejectPending(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      // Arm the idle clock immediately at write time (not only on the
      // first stdout byte) — if Agda emits NO output at all for this
      // command, the call still resolves after `idleMs` rather than
      // hanging forever.
      bumpIdleTimer();
    });
  }

  function kill() {
    if (killed) return;
    killed = true;
    if (pending) settlePending(false);
    try {
      proc.kill("SIGTERM");
    } catch {
      // already gone
    }
  }

  return { sendCommand, kill };
}

// ── Environment probes (D-04 / must_haves truth 3) ──────────────────

/**
 * "version" probe: the cold run's detected Agda version must exactly
 * match the CAPTURED session's version (never `maxTestedAgdaVersion`
 * — per ORACLE-VALIDITY.md correction #8, that field is a compatibility
 * ceiling, not the environment this specific capture ran under).
 */
function versionProbe({ manifestAgdaVersion, detectedAgdaVersion }) {
  if (manifestAgdaVersion === null || manifestAgdaVersion === undefined) {
    return {
      probe: "version",
      ok: false,
      detail: "captured session never detected an Agda version",
    };
  }
  if (detectedAgdaVersion === null || detectedAgdaVersion === undefined) {
    return {
      probe: "version",
      ok: false,
      detail: "cold run could not detect an Agda version",
    };
  }
  // WR-02: `manifestAgdaVersion` is read straight from the untrusted
  // capture manifest (`artifact.manifest.agdaVersion`), and
  // `detectedAgdaVersion` from a cold `agda --version` probe. A non-null
  // but unparseable value (no digit run) makes `parseAgdaVersion` throw;
  // that exception previously propagated out through runProbeGate ->
  // runColdLoadAndDiff -> runOracle, aborting the whole CLI with no
  // verdict written. An unparseable version is evidence the environments
  // cannot be matched — abstain (INCONCLUSIVE), never throw and never a
  // false PASS (this module's stated contract).
  let coldVersion;
  let capturedVersion;
  try {
    coldVersion = parseAgdaVersion(detectedAgdaVersion);
    capturedVersion = parseAgdaVersion(manifestAgdaVersion);
  } catch {
    return {
      probe: "version",
      ok: false,
      detail: `could not parse an Agda version for comparison (captured="${manifestAgdaVersion}", cold="${detectedAgdaVersion}")`,
    };
  }
  if (compareVersions(coldVersion, capturedVersion) === 0) {
    return { probe: "version", ok: true };
  }
  return {
    probe: "version",
    ok: false,
    detail: `cold Agda version "${detectedAgdaVersion}" does not match the captured session's version "${manifestAgdaVersion}"`,
  };
}

/**
 * "agdaDir-hash" probe: every absolute library file path replayed
 * from `manifest.agdaDirContents.libraries` must actually exist on
 * THIS machine. Nothing to check (ok) when the manifest recorded no
 * AGDA_DIR contents at all.
 */
function agdaDirHashProbe({ agdaDirContents }) {
  if (agdaDirContents === null || agdaDirContents === undefined) {
    return { probe: "agdaDir-hash", ok: true };
  }
  const libraries = Array.isArray(agdaDirContents.libraries) ? agdaDirContents.libraries : [];
  const missing = libraries.filter((path) => typeof path === "string" && !existsSync(path));
  if (missing.length > 0) {
    return {
      probe: "agdaDir-hash",
      ok: false,
      detail: `missing library file path(s) on this machine: ${missing.join(", ")}`,
    };
  }
  return { probe: "agdaDir-hash", ok: true };
}

/**
 * "closure-hash" probe: compares two ALREADY-COMPUTED hash strings
 * (this module never calls `hashImportClosure` itself — Plan 02-03
 * recomputes it over the materialized replay directory and passes
 * both values in). Nothing to pin (ok) when the manifest recorded no
 * closure hash at all.
 */
function closureHashProbe({ capturedImportClosureHash, recomputedImportClosureHash }) {
  if (capturedImportClosureHash === null || capturedImportClosureHash === undefined) {
    return { probe: "closure-hash", ok: true };
  }
  if (capturedImportClosureHash === recomputedImportClosureHash) {
    return { probe: "closure-hash", ok: true };
  }
  return {
    probe: "closure-hash",
    ok: false,
    detail: `recomputed import-closure hash (${recomputedImportClosureHash ?? "null"}) does not match the captured hash (${capturedImportClosureHash})`,
  };
}

/**
 * "build-fresh" probe: construction-bug defense. The materialized
 * temp dir must NOT already contain a `_build` entry before the cold
 * Cmd_load runs — should be unreachable in practice since the temp
 * dir is freshly created by the caller, but a genuine collision would
 * silently corrupt the differential's "isolated fresh _build"
 * guarantee.
 */
function buildFreshProbe({ buildDirExistedBeforeLoad }) {
  if (buildDirExistedBeforeLoad) {
    return {
      probe: "build-fresh",
      ok: false,
      detail: "materialized replay directory already contained a _build entry before the cold Cmd_load ran",
    };
  }
  return { probe: "build-fresh", ok: true };
}

/**
 * "spawn" probe: did `spawn()` itself throw or emit an `"error"`
 * event? The caller (Plan 02-03) observes this via a rejected
 * `sendCommand()` promise and reports it here as plain data.
 */
function spawnProbe({ spawnError, attemptedAgdaBin }) {
  if (spawnError) {
    return {
      probe: "spawn",
      ok: false,
      detail: `failed to spawn "${attemptedAgdaBin ?? "<unknown agda binary>"}": ${spawnError}`,
    };
  }
  return { probe: "spawn", ok: true };
}

/**
 * "terminus" probe: re-derives src/agda/parse-load-responses.ts's
 * `sawLoadTerminus` check locally (this module deliberately does not
 * import that decoder — it is pure protocol-shape logic, cheap enough
 * to duplicate here rather than reach into src/'s response-schema
 * layer from a synthetic-data-only probe). This IS the CR-02 fix
 * generalized: an evidence-free response stream is INCONCLUSIVE,
 * never a false pass.
 */
function terminusProbe({ coldResponses }) {
  const responses = Array.isArray(coldResponses) ? coldResponses : [];
  const sawTerminus =
    responses.some((r) => r && r.kind === "InteractionPoints") ||
    responses.some(
      (r) => r && r.kind === "DisplayInfo" && r.info && (r.info.kind === "AllGoalsWarnings" || r.info.kind === "Error"),
    );
  if (sawTerminus) {
    return { probe: "terminus", ok: true };
  }
  return {
    probe: "terminus",
    ok: false,
    detail:
      "cold response stream had no InteractionPoints and no AllGoalsWarnings/Error DisplayInfo event (evidence-free stream)",
  };
}

/**
 * "timeout" probe: ok iff the cold `sendCommand()` call did not
 * report `timedOut: true`.
 */
function timeoutProbe({ timedOut }) {
  if (timedOut) {
    return {
      probe: "timeout",
      ok: false,
      detail: "cold sendCommand() call reported timedOut: true",
    };
  }
  return { probe: "timeout", ok: true };
}

/**
 * Run all 7 named environment probes against plain, pre-computed
 * data and return one `{ probe, ok, detail? }` result per probe (in
 * the fixed order below). Never spawns a process; the only
 * filesystem access is `existsSync` inside the agdaDir-hash probe
 * (checking THIS machine's filesystem is that probe's entire point).
 * Every other input is caller-supplied plain data, so every probe is
 * independently unit-testable with synthetic fixtures — Plan 02-03
 * wires the real materialization/spawn/hash-computation and passes
 * the results in.
 *
 * @param {object} input
 * @param {string|null} [input.manifestAgdaVersion] - The captured
 *   session's detected Agda version (`ReplayManifest.agdaVersion`).
 * @param {string|null} [input.detectedAgdaVersion] - The cold run's
 *   own detected Agda version string.
 * @param {{ libraries: string[], defaults: string[] } | null} [input.agdaDirContents] -
 *   The replayed `ReplayManifest.agdaDirContents`.
 * @param {string|null} [input.capturedImportClosureHash] -
 *   `ReplayManifest.importClosureHash`.
 * @param {string|null} [input.recomputedImportClosureHash] - The hash
 *   recomputed over the materialized replay directory.
 * @param {boolean} [input.buildDirExistedBeforeLoad] - Whether the
 *   materialized temp dir already contained a `_build` entry before
 *   the cold Cmd_load ran.
 * @param {string|null} [input.spawnError] - Non-null when `spawn()`
 *   itself threw or emitted an `"error"` event.
 * @param {string} [input.attemptedAgdaBin] - The binary path attempted
 *   (used in the spawn probe's failure detail).
 * @param {unknown[]} [input.coldResponses] - The cold response array
 *   to scan for a terminal goal-state event.
 * @param {boolean} [input.timedOut] - Whether the cold `sendCommand()`
 *   call reported `timedOut: true`.
 * @returns {{ probe: string, ok: boolean, detail?: string }[]}
 */
export function runEnvironmentProbes(input = {}) {
  return [
    versionProbe(input),
    agdaDirHashProbe(input),
    closureHashProbe(input),
    buildFreshProbe(input),
    spawnProbe(input),
    terminusProbe(input),
    timeoutProbe(input),
  ];
}

export function scriptMain() {
  process.stderr.write(
    "scripts/oracle/cold-agda-session.mjs is shared infrastructure with no standalone CLI use; " +
      "import spawnColdAgdaSession/runEnvironmentProbes from it instead.\n",
  );
  process.exitCode = 1;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  scriptMain();
}
