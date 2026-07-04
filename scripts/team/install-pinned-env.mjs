// MIT License — see LICENSE
//
// TEAM-05: locates and verifies the pinned Agda version (D-03:
// verify-and-instruct, NEVER force-install), generates the
// repo-pinned tooling/scripts/run-pinned-agda.sh wrapper that
// src/agda/binary-discovery.ts's findAgdaBinary() already resolves
// first, orchestrates a full fuel-corpus clone via
// clone-fuel-corpora.mjs (D-04/D-05), and finishes with `npm ci`.
//
// This is the ".mjs" engine invoked by the bash entry point
// install-pinned-env.sh once Node itself is already confirmed to
// exist — see that file's header for the bootstrap-ordering
// rationale. A fresh teammate has neither `npm ci` nor `tsx` yet, so
// this file (and clone-fuel-corpora.mjs, which it imports) must stay
// plain-node-loadable end to end: zero `.ts`-backed imports, zero
// devDependencies.
//
// Run with: node scripts/team/install-pinned-env.mjs
// (plain `node` — no tsx/ts-node.)

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cloneAllFuelCorpora, resolveFuelRoot } from "./clone-fuel-corpora.mjs";
import { isMainModule } from "../test-with-sentinel.mjs";

/**
 * D-03: the EXACT Agda version the pinned fuel corpora target — a
 * narrower, exact-match check than package.json's own
 * minAgdaVersion/maxTestedAgdaVersion range. A corpus tuned to
 * exactly 2.8.0 is not guaranteed to typecheck identically on a
 * different minor/patch version.
 */
export const PINNED_AGDA_VERSION = "2.8.0";

/**
 * Belt-and-suspenders Node version check. install-pinned-env.sh
 * already gates on Node >= 24 before this file is ever invoked, but a
 * teammate who runs `node install-pinned-env.mjs` directly (bypassing
 * the .sh) should still get an instructive failure here instead of a
 * confusing crash deeper in the script. Never throws.
 */
export function checkNodeVersion(deps = {}) {
  const detected = (deps.nodeVersions ?? process.versions).node;
  const major = Number.parseInt(String(detected).split(".")[0], 10);
  return { ok: Number.isInteger(major) && major >= 24, detected };
}

/**
 * Resolve the Agda binary to verify. `AGDA_BIN` wins when set
 * (mirrors src/agda/binary-discovery.ts's own resolution order);
 * otherwise shells out to `which agda`. Returns `null` — never throws
 * — on any non-zero exit (e.g. Agda not on PATH).
 */
export function locateAgdaBinary(deps = {}) {
  if (process.env.AGDA_BIN) {
    return process.env.AGDA_BIN;
  }
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    const stdout = execFile("which", ["agda"], { stdio: "pipe", shell: false }).toString();
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Runs `<agdaPath> --version` and extracts the version string from
 * Agda's own "Agda version X.Y.Z" banner. Returns `null` on any
 * failure (binary missing, unexpected output) — never throws.
 */
export function getAgdaVersion(agdaPath, deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    const stdout = execFile(agdaPath, ["--version"], { stdio: "pipe", shell: false }).toString();
    const match = stdout.match(/Agda version (\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * D-03: exact-match comparison (after trimming both sides) against
 * `pinned` — NOT a semver range.
 */
export function versionSatisfies(detected, pinned = PINNED_AGDA_VERSION) {
  return typeof detected === "string" && detected.trim() === pinned.trim();
}

/**
 * The wrapper's full text content — a fixed exec-with-args template.
 * `resolvedAgdaPath` is written verbatim, but per T-08-04 it is
 * always the output of locateAgdaBinary's own which/AGDA_BIN
 * resolution, never teammate-supplied free text.
 */
export function generateRunPinnedAgdaScript(resolvedAgdaPath) {
  return `#!/usr/bin/env bash
set -euo pipefail
exec "${resolvedAgdaPath}" "$@"
`;
}

/**
 * Writes the wrapper to tooling/scripts/run-pinned-agda.sh (creating
 * parent directories) and marks it executable — the exact
 * repo-relative path src/agda/binary-discovery.ts's findAgdaBinary()
 * already checks for.
 */
export function writeRunPinnedAgdaScript(repoRoot, resolvedAgdaPath, deps = {}) {
  const scriptPath = join(repoRoot, "tooling", "scripts", "run-pinned-agda.sh");
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, generateRunPinnedAgdaScript(resolvedAgdaPath));
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

/** Runs `npm ci` in `repoRoot` with inherited stdio so the teammate
 *  sees npm's own progress output directly. */
export function runNpmCi(repoRoot, deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  execFile("npm", ["ci"], { cwd: repoRoot, stdio: "inherit", shell: false });
}

function repoRootFromThisFile() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * Orchestrates the full install: Node version -> Agda locate+verify
 * -> run-pinned-agda.sh generation -> fuel-corpus clone -> npm ci.
 *
 * D-03's verify-and-instruct policy, never force-install: on a
 * missing or version-mismatched Agda, prints install instructions
 * (nix or ghcup — teammate's choice) and exits early with
 * `process.exitCode = 1` — `tooling/scripts/run-pinned-agda.sh` is
 * NOT written, `npm ci` is NOT run, and no fuel corpus is cloned.
 *
 * `deps.repoRoot` overrides the default (this file's own `../..`) —
 * used by this module's own tests to avoid writing into the real
 * repo tree.
 */
export function scriptMain(argv = process.argv.slice(2), deps = {}) {
  const repoRoot = deps.repoRoot ?? repoRootFromThisFile();

  const nodeCheck = checkNodeVersion(deps);
  if (!nodeCheck.ok) {
    process.stderr.write(
      `install-pinned-env: detected Node ${nodeCheck.detected}, but Node >= 24 is required. ` +
        `Install Node >= 24 (nvm/fnm/homebrew: https://nodejs.org/), then re-run this script.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const agdaPath = locateAgdaBinary(deps);
  const agdaVersion = agdaPath ? getAgdaVersion(agdaPath, deps) : null;
  if (!agdaPath || !versionSatisfies(agdaVersion)) {
    const found = agdaPath
      ? `found Agda ${agdaVersion ?? "unknown"} at ${agdaPath}, but the pinned version is ${PINNED_AGDA_VERSION}`
      : "no Agda binary found on PATH (and AGDA_BIN is unset)";
    process.stderr.write(
      `install-pinned-env: ${found}.\n` +
        `Install Agda ${PINNED_AGDA_VERSION} via nix or ghcup (your choice), then re-run this script:\n` +
        "  nix:   https://nixos.org/download.html\n" +
        "  ghcup: https://www.haskell.org/ghcup/\n",
    );
    process.exitCode = 1;
    return;
  }

  writeRunPinnedAgdaScript(repoRoot, agdaPath, deps);
  cloneAllFuelCorpora(resolveFuelRoot(), deps);
  runNpmCi(repoRoot, deps);

  process.stdout.write(
    "\ninstall-pinned-env: done.\n" +
      "Next steps: see docs/TEAM-ONBOARDING.md for your upload key + first dogfood-run walkthrough.\n",
  );
}

if (isMainModule(import.meta.url, process.argv[1])) {
  scriptMain();
}
