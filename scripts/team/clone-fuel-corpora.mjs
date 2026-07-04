// MIT License — see LICENSE
//
// TEAM-05: shared fuel-corpus clone/checkout primitive (D-04/D-05).
// Reads scripts/data/fuel-corpora.json (the SSOT for corpus keys,
// pinned refs, and access levels) and clones/checks-out each entry at
// its pinnedRef under a configurable root — D-04's visible
// `~/agda-mcp-fuel/<corpus-key>` default, D-05's mandatory env-var
// override. This module is reused VERBATIM by 08-02's Dockerfile
// image build, not re-derived there.
//
// Must run under plain `node` — no `tsx`, no devDependencies, no
// `npm ci` prerequisite. A fresh teammate running install-pinned-env.sh
// has neither `node_modules` nor `tsx` yet, so every import in this
// file resolves under Node's native ESM loader with zero
// `.ts`-backed specifiers (no src/repo-root.js, no zod).
//
// Run with: node scripts/team/clone-fuel-corpora.mjs [--root <path>]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainModule } from "../test-with-sentinel.mjs";

/**
 * Resolve the fuel-corpus root directory. `AGDA_MCP_FUEL_ROOT` wins
 * when set (D-05: mandatory env-var override — the container's clones
 * live at an in-image path, the maintainer's own clones live
 * elsewhere); otherwise defaults to a VISIBLE `~/agda-mcp-fuel` (D-04
 * — chosen over a hidden dotfile path because teammates work inside
 * these clones with an editor + agent).
 */
export function resolveFuelRoot() {
  const override = process.env.AGDA_MCP_FUEL_ROOT?.trim();
  if (override) {
    return override;
  }
  return join(homedir(), "agda-mcp-fuel");
}

/** The real scripts/data/fuel-corpora.json path, computed relative to
 *  THIS file's own location — never via src/repo-root.js (a
 *  `.ts`-backed module this plain-node script must not import). */
function resolveFuelCorporaJsonPath() {
  return fileURLToPath(new URL("../data/fuel-corpora.json", import.meta.url));
}

/**
 * Read the fuel-corpora array at `fuelCorporaJsonPath` (defaults to
 * the real SSOT). An absent file, malformed JSON, or a non-array JSON
 * value all degrade to an empty array — never throws. Mirrors
 * scripts/team/issue-key.mjs's readKeyRegistry contract exactly.
 */
export function readFuelCorpora(fuelCorporaJsonPath = resolveFuelCorporaJsonPath()) {
  if (!existsSync(fuelCorporaJsonPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(readFileSync(fuelCorporaJsonPath, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Resolve the URL `git clone` should use for `entry`. `deps.cloneUrl`
 * — when supplied — overrides this entirely; it exists ONLY so this
 * module's own tests can substitute a local bare-repo fixture path
 * for the real `https://github.com/...` URL. Production behavior
 * embeds `token` (x-access-token basic-auth form) for a credentialed
 * private clone, else builds the plain public URL.
 */
function resolveCloneUrl(entry, deps, token) {
  if (deps.cloneUrl) {
    return deps.cloneUrl(entry);
  }
  if (token) {
    return `https://x-access-token:${token}@github.com/${entry.repo}.git`;
  }
  return `https://github.com/${entry.repo}.git`;
}

/**
 * Clone (or update, if already present) one `{key, repo, access,
 * pinnedRef}` fuel-corpus entry into `<destRoot>/<entry.key>`.
 *
 * - Already cloned (destDir exists): `git fetch origin <pinnedRef>`
 *   (idempotent re-run — never re-clones from scratch).
 * - Public, fresh: `git clone https://github.com/<repo>.git destDir`.
 * - Private, fresh, credentialed (GH_TOKEN/GITHUB_TOKEN/deps.ghToken):
 *   clone via an embedded x-access-token URL, then IMMEDIATELY scrub
 *   the credential with `git remote set-url origin <clean-url>` —
 *   git persists the clone URL (token included) in plaintext into
 *   destDir/.git/config, and 08-02's Dockerfile ships this clone as
 *   an image layer (T-08-02).
 * - Private, fresh, no credential but an authenticated `gh` session:
 *   clone via `gh repo clone`.
 * - Private, fresh, no credential and no `gh` session: skipped —
 *   returns `{ ok: false, reason: "private-repo-no-credential" }`
 *   WITHOUT throwing. One missing corpus must never abort the batch.
 *
 * After any successful clone/update: checks out `pinnedRef`, then
 * runs `git submodule update --init --recursive` (defensive —
 * codex-homotopy-group vendors agda-unimath as a submodule; a
 * harmless no-op for corpora with none).
 *
 * Every git/gh invocation is `deps.execFileSync ?? execFileSync` with
 * an argv array and `shell: false` (CWE-78 discipline, matching
 * upload-run.mjs's own `spawn(..., { shell: false })` convention).
 * Returns `{ ok: true, key, destDir }` or `{ ok: false, key, reason,
 * error? }` — never throws, so one bad corpus never aborts the batch.
 */
export function cloneFuelCorpus(entry, destRoot, deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  const destDir = join(destRoot, entry.key);
  const gitOpts = { stdio: "pipe", shell: false };

  try {
    if (existsSync(destDir)) {
      execFile("git", ["-C", destDir, "fetch", "origin", entry.pinnedRef], gitOpts);
    } else if (entry.access === "public") {
      const url = resolveCloneUrl(entry, deps, null);
      execFile("git", ["clone", url, destDir], gitOpts);
    } else {
      const token = deps.ghToken ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
      if (token) {
        const url = resolveCloneUrl(entry, deps, token);
        execFile("git", ["clone", url, destDir], gitOpts);
        // T-08-02: scrub the embedded credential immediately — never
        // let a token-bearing remote URL persist in .git/config.
        execFile(
          "git",
          ["-C", destDir, "remote", "set-url", "origin", `https://github.com/${entry.repo}.git`],
          gitOpts,
        );
      } else {
        let ghAuthed = false;
        try {
          execFile("gh", ["auth", "status"], gitOpts);
          ghAuthed = true;
        } catch {
          ghAuthed = false;
        }
        if (!ghAuthed) {
          return { ok: false, key: entry.key, reason: "private-repo-no-credential" };
        }
        execFile("gh", ["repo", "clone", entry.repo, destDir], gitOpts);
      }
    }

    execFile("git", ["-C", destDir, "checkout", entry.pinnedRef], gitOpts);
    execFile("git", ["-C", destDir, "submodule", "update", "--init", "--recursive"], gitOpts);

    return { ok: true, key: entry.key, destDir };
  } catch (error) {
    return {
      ok: false,
      key: entry.key,
      reason: "clone-failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Clone/update every entry from `readFuelCorpora()` (or
 * `deps.fuelCorporaJsonPath` when supplied, for tests) into
 * `destRoot`. Writes one loud stderr line per failed entry — never
 * silent, matching TEAM-04's own abstention discipline applied here
 * to corpus provisioning — and always returns the full results array
 * regardless of individual failures.
 */
export function cloneAllFuelCorpora(destRoot, deps = {}) {
  const entries = deps.fuelCorporaJsonPath
    ? readFuelCorpora(deps.fuelCorporaJsonPath)
    : readFuelCorpora();

  const results = [];
  for (const entry of entries) {
    const result = cloneFuelCorpus(entry, destRoot, deps);
    if (!result.ok) {
      process.stderr.write(`clone-fuel-corpora: skipping ${result.key}: ${result.reason}\n`);
    }
    results.push(result);
  }
  return results;
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * CLI entry point. Optional `--root <path>` flag overrides
 * resolveFuelRoot(). Prints a one-line summary and sets
 * `process.exitCode = 1` (never `process.exit()`, so this stays
 * importable/testable) if any corpus failed to clone.
 */
export function scriptMain(argv = process.argv.slice(2)) {
  const rootFlagIndex = argv.indexOf("--root");
  const root =
    rootFlagIndex !== -1 && argv[rootFlagIndex + 1] !== undefined
      ? argv[rootFlagIndex + 1]
      : resolveFuelRoot();

  const results = cloneAllFuelCorpora(root);
  const okCount = results.filter((result) => result.ok).length;
  process.stdout.write(`clone-fuel-corpora: ${okCount}/${results.length} corpora ready under ${root}\n`);
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  scriptMain();
}
