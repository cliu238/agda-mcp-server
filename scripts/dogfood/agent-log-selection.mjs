// MIT License — see LICENSE
//
// TEAM-02's agent-session log discovery: "which Claude Code / Codex
// session log files belong to THIS dogfooding run" — split out from
// scripts/dogfood/upload-run.mjs so the discovery logic (empirically
// confirmed log-location conventions, not a stable public API) is
// independently testable against a fixture home directory.
//
// Claude Code project logs live at ~/.claude/projects/<slug>/*.jsonl,
// where <slug> is the corpus root with every "/" replaced by "-"
// (empirically confirmed: an exact directory-name match on a real
// machine — see
// .planning/phases/07-team-feedback-channel-local-wiring/07-PATTERNS.md).
// Codex session logs live at
// ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-*.jsonl, each file's
// FIRST line carrying `{"type":"session_meta","payload":{"cwd":...}}`.
//
// Both selectors are best-effort: a missing home-directory structure,
// an unreadable file, or a corrupt/malformed first line all degrade to
// "skip this entry", never a thrown exception — this feeds a fail-open
// uploader (scripts/dogfood/upload-run.mjs, D-12) where a discovery
// failure must never block the upload attempt.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Corpus root -> Claude Code project-directory slug: every path
 * separator becomes a literal hyphen. POSIX-only (a literal "/"
 * replace) — this project's platform targets are macOS/Linux per
 * CLAUDE.md's Platform Requirements, and this matches Claude Code's
 * own observed slugging convention exactly (empirically confirmed:
 * "/Users/eric/projects6/agda-mcp-server" ->
 * "-Users-eric-projects6-agda-mcp-server").
 */
export function slugifyCorpusRoot(corpusRoot) {
  return resolve(corpusRoot).replaceAll("/", "-");
}

/** True when `mtimeMs` falls within `[sinceMs, untilMs]` inclusive. An
 *  undefined bound on either side is treated as unbounded on that side
 *  — the CALLER (scripts/dogfood/upload-run.mjs) is responsible for
 *  any grace-period widening before calling in; this module takes the
 *  window verbatim. */
function isWithinWindow(mtimeMs, sinceMs, untilMs) {
  if (typeof sinceMs === "number" && mtimeMs < sinceMs) {
    return false;
  }
  if (typeof untilMs === "number" && mtimeMs > untilMs) {
    return false;
  }
  return true;
}

/** Sorts `{ path, mtimeMs }` candidates ascending by mtime and returns
 *  the bare path array — shared tail for both selectors below. */
function sortedPaths(candidates) {
  return candidates.sort((a, b) => a.mtimeMs - b.mtimeMs).map((candidate) => candidate.path);
}

/**
 * Recursively collect every `*.jsonl` file under `dir`. A manual walk
 * (rather than `readdirSync(dir, { recursive: true })`) so this never
 * depends on `Dirent#parentPath`/`Dirent#path` naming differences
 * across Node versions — each recursive step re-joins from the
 * directory it is currently reading. Returns `[]` (never throws) for
 * an unreadable directory, matching this module's overall best-effort
 * contract.
 */
function walkJsonlFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Claude Code project logs for `corpusRoot`: every `*.jsonl` file
 * directly under `~/.claude/projects/<slug>/` (no further nesting)
 * whose mtime falls within `[options.sinceMs, options.untilMs]`.
 * `options.homeDir` overrides `homedir()` — always pass this in tests,
 * never let a test touch the real `~/.claude`. Returns `[]` (never
 * throws) when the project directory does not exist.
 */
export function selectClaudeCodeLogs(corpusRoot, options = {}) {
  const homeDir = options.homeDir ?? homedir();
  const dir = join(homeDir, ".claude", "projects", slugifyCorpusRoot(corpusRoot));
  if (!existsSync(dir)) {
    return [];
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      let mtimeMs;
      try {
        mtimeMs = statSync(fullPath).mtimeMs;
      } catch {
        continue;
      }
      if (isWithinWindow(mtimeMs, options.sinceMs, options.untilMs)) {
        candidates.push({ path: fullPath, mtimeMs });
      }
    }
    return sortedPaths(candidates);
  } catch {
    return [];
  }
}

/**
 * Codex session logs for `corpusRoot`: every `*.jsonl` file anywhere
 * under `~/.codex/sessions/` whose FIRST line parses as JSON with
 * `payload.cwd === corpusRoot` and whose mtime falls within
 * `[options.sinceMs, options.untilMs]`. `options.homeDir` overrides
 * `homedir()` the same way as `selectClaudeCodeLogs`. Each candidate's
 * own read/parse is independently try/caught, so one corrupt session
 * file never aborts the whole scan. Returns `[]` (never throws) when
 * `~/.codex/sessions/` does not exist.
 */
export function selectCodexSessionLogs(corpusRoot, options = {}) {
  const homeDir = options.homeDir ?? homedir();
  const root = join(homeDir, ".codex", "sessions");
  if (!existsSync(root)) {
    return [];
  }

  const candidates = [];
  for (const filePath of walkJsonlFiles(root)) {
    try {
      const raw = readFileSync(filePath, "utf8");
      const firstLine = raw.split("\n")[0];
      const parsed = JSON.parse(firstLine);
      if (parsed?.payload?.cwd !== corpusRoot) {
        continue;
      }
      const mtimeMs = statSync(filePath).mtimeMs;
      if (isWithinWindow(mtimeMs, options.sinceMs, options.untilMs)) {
        candidates.push({ path: filePath, mtimeMs });
      }
    } catch {
      // Malformed first line, unreadable file, or a stat race — skip
      // this one candidate, never abort the whole scan.
      continue;
    }
  }
  return sortedPaths(candidates);
}
