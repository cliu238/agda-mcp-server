// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/agent-log-selection.mjs:
// slugifyCorpusRoot / selectClaudeCodeLogs / selectCodexSessionLogs —
// TEAM-02's "which agent-session log files belong to this run"
// discovery step. Every test drives a fixture `homeDir` (never the
// real ~/.claude or ~/.codex), matching this project's mkdtempSync-
// per-test + afterEach cleanup convention.

import { afterEach, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
  selectClaudeCodeLogs,
  selectCodexSessionLogs,
  slugifyCorpusRoot,
  // @ts-expect-error script module lacks types
} from "../../../scripts/dogfood/agent-log-selection.mjs";

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

/** Sets a file's mtime (and atime) to an exact millisecond timestamp. */
function setMtime(filePath: string, ms: number): void {
  const date = new Date(ms);
  utimesSync(filePath, date, date);
}

// ── slugifyCorpusRoot ────────────────────────────────────────────────

test("slugifyCorpusRoot replaces every path separator with a hyphen", () => {
  expect(slugifyCorpusRoot("/Users/eric/projects6/Codex-Homotopy-Group")).toBe(
    "-Users-eric-projects6-Codex-Homotopy-Group",
  );
});

// ── selectClaudeCodeLogs ─────────────────────────────────────────────

test("selectClaudeCodeLogs returns only the .jsonl file whose mtime falls inside the window", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-claude-");
  const corpusRoot = "/Users/eric/projects6/Codex-Homotopy-Group";
  const slug = slugifyCorpusRoot(corpusRoot);
  const projectDir = join(homeDir, ".claude", "projects", slug);
  mkdirSync(projectDir, { recursive: true });

  const now = Date.now();
  const aPath = join(projectDir, "a.jsonl");
  const bPath = join(projectDir, "b.jsonl");
  writeFileSync(aPath, `${JSON.stringify({ type: "message" })}\n`, "utf8");
  writeFileSync(bPath, `${JSON.stringify({ type: "message" })}\n`, "utf8");
  setMtime(aPath, now);
  // Far in the past — outside the window.
  setMtime(bPath, now - 30 * 24 * 60 * 60 * 1000);

  const result = selectClaudeCodeLogs(corpusRoot, {
    homeDir,
    sinceMs: now - 60_000,
    untilMs: now + 60_000,
  });

  expect(result).toEqual([aPath]);
});

test("selectClaudeCodeLogs returns [] (never throws) when the project directory does not exist", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-claude-missing-");
  expect(selectClaudeCodeLogs("/some/corpus", { homeDir })).toEqual([]);
});

// ── selectCodexSessionLogs ───────────────────────────────────────────

test("selectCodexSessionLogs returns only the rollout file whose payload.cwd matches and whose mtime is inside the window (real nested date-tree fixture)", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-codex-");
  const corpusRoot = "/Users/eric/projects6/Codex-Homotopy-Group";
  const dayDir = join(homeDir, ".codex", "sessions", "2026", "07", "01");
  mkdirSync(dayDir, { recursive: true });

  const now = Date.now();
  const matchingPath = join(dayDir, "rollout-a.jsonl");
  const otherCwdPath = join(dayDir, "rollout-b.jsonl");

  const sessionMetaLine = (cwd: string) =>
    JSON.stringify({ type: "session_meta", payload: { cwd, id: "fixture-session" } });

  writeFileSync(
    matchingPath,
    `${sessionMetaLine(corpusRoot)}\n${JSON.stringify({ type: "response_item" })}\n`,
    "utf8",
  );
  writeFileSync(
    otherCwdPath,
    `${sessionMetaLine("/some/other/corpus")}\n${JSON.stringify({ type: "response_item" })}\n`,
    "utf8",
  );
  setMtime(matchingPath, now);
  setMtime(otherCwdPath, now);

  const result = selectCodexSessionLogs(corpusRoot, {
    homeDir,
    sinceMs: now - 60_000,
    untilMs: now + 60_000,
  });

  expect(result).toEqual([matchingPath]);
});

test("selectCodexSessionLogs matches a relative or trailing-slash corpusRoot against Codex's own recorded absolute cwd (WR-06, from-RED)", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-codex-normalize-");
  const absoluteCorpusRoot = "/Users/eric/projects6/Codex-Homotopy-Group";
  const dayDir = join(homeDir, ".codex", "sessions", "2026", "07", "01");
  mkdirSync(dayDir, { recursive: true });

  const now = Date.now();
  const matchingPath = join(dayDir, "rollout-normalize.jsonl");
  writeFileSync(
    matchingPath,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: absoluteCorpusRoot, id: "fixture-session" } })}\n`,
    "utf8",
  );
  setMtime(matchingPath, now);

  // A trailing slash is a completely ordinary thing to type on a
  // command line and differs SYNTACTICALLY from Codex's own recorded
  // absolute cwd, even though it resolves to the identical path.
  const trailingSlashResult = selectCodexSessionLogs(`${absoluteCorpusRoot}/`, {
    homeDir,
    sinceMs: now - 60_000,
    untilMs: now + 60_000,
  });
  expect(trailingSlashResult).toEqual([matchingPath]);

  // A genuinely RELATIVE corpusRoot (relative to process.cwd()) that
  // resolves to the exact same absolute path — again, a completely
  // ordinary thing to type on a command line.
  const relativeCorpusRoot = relative(process.cwd(), absoluteCorpusRoot);
  const relativeResult = selectCodexSessionLogs(relativeCorpusRoot, {
    homeDir,
    sinceMs: now - 60_000,
    untilMs: now + 60_000,
  });
  expect(relativeResult).toEqual([matchingPath]);
});

test("selectCodexSessionLogs: a non-string corpusRoot returns [] rather than throwing (WR-06 defensive guard)", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-codex-nonstring-");
  const dayDir = join(homeDir, ".codex", "sessions", "2026", "07", "01");
  mkdirSync(dayDir, { recursive: true });
  writeFileSync(
    join(dayDir, "rollout-x.jsonl"),
    `${JSON.stringify({ type: "session_meta", payload: { cwd: "/whatever" } })}\n`,
    "utf8",
  );

  expect(() => selectCodexSessionLogs(undefined, { homeDir })).not.toThrow();
  expect(selectCodexSessionLogs(undefined, { homeDir })).toEqual([]);
});

test("selectCodexSessionLogs excludes a matching-cwd file whose mtime falls outside the window", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-codex-window-");
  const corpusRoot = "/Users/eric/projects6/Codex-Homotopy-Group";
  const dayDir = join(homeDir, ".codex", "sessions", "2026", "07", "01");
  mkdirSync(dayDir, { recursive: true });

  const now = Date.now();
  const stalePath = join(dayDir, "rollout-stale.jsonl");
  writeFileSync(
    stalePath,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: corpusRoot } })}\n`,
    "utf8",
  );
  setMtime(stalePath, now - 30 * 24 * 60 * 60 * 1000);

  const result = selectCodexSessionLogs(corpusRoot, {
    homeDir,
    sinceMs: now - 60_000,
    untilMs: now + 60_000,
  });

  expect(result).toEqual([]);
});

test("selectCodexSessionLogs skips (never throws on) a file whose first line is not valid JSON or lacks payload.cwd", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-codex-corrupt-");
  const corpusRoot = "/Users/eric/projects6/Codex-Homotopy-Group";
  const dayDir = join(homeDir, ".codex", "sessions", "2026", "07", "01");
  mkdirSync(dayDir, { recursive: true });

  const now = Date.now();
  const corruptPath = join(dayDir, "rollout-corrupt.jsonl");
  const missingCwdPath = join(dayDir, "rollout-missing-cwd.jsonl");
  writeFileSync(corruptPath, "not valid json at all\n", "utf8");
  writeFileSync(missingCwdPath, `${JSON.stringify({ type: "session_meta", payload: {} })}\n`, "utf8");
  setMtime(corruptPath, now);
  setMtime(missingCwdPath, now);

  expect(() =>
    selectCodexSessionLogs(corpusRoot, { homeDir, sinceMs: now - 60_000, untilMs: now + 60_000 }),
  ).not.toThrow();
  expect(
    selectCodexSessionLogs(corpusRoot, { homeDir, sinceMs: now - 60_000, untilMs: now + 60_000 }),
  ).toEqual([]);
});

test("selectCodexSessionLogs returns [] (never throws) when .codex/sessions/ does not exist", () => {
  const homeDir = makeTempDir("agda-mcp-agent-log-codex-missing-");
  expect(selectCodexSessionLogs("/some/corpus", { homeDir })).toEqual([]);
});
