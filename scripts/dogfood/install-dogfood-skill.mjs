// MIT License — see LICENSE
//
// D-07's Pitfall-1 fix: the canonical agda-dogfooding Skill content
// lives at .agents/skills/agda-dogfooding/ (TRACKED — confirmed NOT
// excluded by this repo's own .gitignore, unlike .claude/ and
// .codex/, which are both wholesale-excluded). Codex CLI discovers
// project skills natively from .agents/skills/, but Claude Code only
// discovers .claude/skills/ — so this script creates a LOCAL,
// gitignored symlink at .claude/skills/agda-dogfooding pointing back
// at the canonical content, letting Claude Code's own project-skill
// discovery find the same file without a second copy to keep in
// sync.
//
// Idempotent and safe to re-run: a fresh run creates the symlink, a
// second run is a no-op, and a genuinely pre-existing REAL
// (non-symlink) directory at that path is never overwritten
// (T-05-04-01 in this plan's threat register).
//
// Ships as a scripts/ + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface.

import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
import { isMainModule } from "../test-with-sentinel.mjs";

/**
 * `lstatSync`, but returns `null` instead of throwing when
 * `path` does not exist (any other error still propagates) — the
 * "check first, degrade gracefully, never throw on the common/
 * expected case" shape, applied here to a symlink/file-existence
 * check.
 */
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Idempotently link `.claude/skills/agda-dogfooding` to the canonical
 * `.agents/skills/agda-dogfooding` content under `serverRepoRoot`.
 *
 * `serverRepoRoot` defaults to `SERVER_REPO_ROOT` (this checkout, via
 * src/repo-root.ts) rather than a caller-cwd-dependent fallback — this
 * installer must behave identically regardless of the caller's cwd
 * (unlike a cross-machine capture-promotion tool, where a
 * cwd-dependent fallback would exist for a different reason), so it
 * accepts an explicit override for testability instead.
 *
 * Returns `{ action, canonicalPath, claudeLinkPath }` where `action`
 * is one of:
 * - "created" — no prior entry existed; a fresh symlink was made.
 * - "already-linked" — a correct symlink already existed; nothing
 *   was touched.
 * - "relinked" — a symlink existed but pointed somewhere else (a
 *   stale/dangling link from a prior partial run); it was replaced.
 * - "skipped-existing-non-symlink" — a REAL file or directory already
 *   occupies the path; NOTHING was touched (never `symlinkSync`/
 *   `unlinkSync` in this branch). The CLI entry point (`scriptMain`),
 *   not this function, is responsible for warning about this case —
 *   this function stays a pure, side-effect-minimal library call with
 *   no console/stderr output of its own.
 */
export function installDogfoodSkill({ serverRepoRoot = SERVER_REPO_ROOT } = {}) {
  const canonical = join(serverRepoRoot, ".agents", "skills", "agda-dogfooding");
  const claudeSkillsDir = join(serverRepoRoot, ".claude", "skills");
  const claudeLink = join(claudeSkillsDir, "agda-dogfooding");

  mkdirSync(claudeSkillsDir, { recursive: true });

  const existing = lstatOrNull(claudeLink);

  if (existing === null) {
    // IN-02: a partial checkout (canonical content never cloned/
    // restored) must never report "created" for a symlink that
    // resolves to nothing — check BEFORE the symlinkSync call, not
    // after.
    if (lstatOrNull(canonical) === null) {
      throw new Error(
        `install-dogfood-skill: canonical Skill directory not found at ${canonical} — `
          + "refusing to create a dangling symlink (partial checkout?).",
      );
    }
    symlinkSync(canonical, claudeLink, "dir");
    return { action: "created", canonicalPath: canonical, claudeLinkPath: claudeLink };
  }

  if (existing.isSymbolicLink()) {
    const currentTarget = readlinkSync(claudeLink);
    if (currentTarget === canonical) {
      return { action: "already-linked", canonicalPath: canonical, claudeLinkPath: claudeLink };
    }
    // IN-02: same existence check as the "created" branch above,
    // before EITHER of this branch's own filesystem mutations
    // (unlinkSync/symlinkSync) — a stale link must never be replaced
    // with a new dangling one.
    if (lstatOrNull(canonical) === null) {
      throw new Error(
        `install-dogfood-skill: canonical Skill directory not found at ${canonical} — `
          + "refusing to relink to a dangling target (partial checkout?).",
      );
    }
    // A stale/misdirected link from some prior partial run — still
    // idempotent with respect to the DESIRED end state.
    unlinkSync(claudeLink);
    symlinkSync(canonical, claudeLink, "dir");
    return { action: "relinked", canonicalPath: canonical, claudeLinkPath: claudeLink };
  }

  // A genuinely pre-existing real file or directory. Change NOTHING.
  return {
    action: "skipped-existing-non-symlink",
    canonicalPath: canonical,
    claudeLinkPath: claudeLink,
  };
}

export async function scriptMain() {
  // IN-02: any thrown error (including the new canonical-existence
  // checks above) must surface as a one-line stderr message +
  // process.exitCode = 1, never a raw stack trace.
  try {
    const result = installDogfoodSkill();

    if (result.action === "skipped-existing-non-symlink") {
      process.stderr.write(
        `install-dogfood-skill: ${result.claudeLinkPath} already exists and is not a `
          + "symlink — left untouched. Remove it manually first if you want the agda-dogfooding "
          + "Skill symlink installed there.\n",
      );
    }

    process.stdout.write(`${result.action} ${result.claudeLinkPath}\n`);
  } catch (err) {
    process.stderr.write(`install-dogfood-skill: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
