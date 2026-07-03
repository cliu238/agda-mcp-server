// MIT License — see LICENSE
//
// Unit tests for the PROC-01 Skill packaging (D-07): the canonical
// runbook at .agents/skills/agda-dogfooding/SKILL.md must be tracked
// (not gitignored — Pitfall 1) and must mechanically document the
// hard gate, the capture verb, the scaffold-hole workflow, and the
// local-checkout launch caveat (Pitfall 2). Task 2 extends this file
// with 3 more behaviors covering install-dogfood-skill.mjs's
// idempotent .claude/skills/ symlink installer.

import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

// @ts-expect-error script module lacks types
import { installDogfoodSkill } from "../../../scripts/dogfood/install-dogfood-skill.mjs";
import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";

const SKILL_MD_RELATIVE_PATH = ".agents/skills/agda-dogfooding/SKILL.md";
const SKILL_MD_PATH = join(SERVER_REPO_ROOT, ...SKILL_MD_RELATIVE_PATH.split("/"));

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

/**
 * A fresh temp directory simulating this repo's own checkout shape:
 * `.agents/skills/agda-dogfooding/` already populated (the canonical,
 * TRACKED content installDogfoodSkill must symlink to) — never the
 * real repo's own `.claude/skills/` directory.
 */
function makeFakeServerRepoRoot(): string {
  const root = makeTempDir("agda-mcp-install-skill-");
  const canonicalDir = join(root, ".agents", "skills", "agda-dogfooding");
  mkdirSync(canonicalDir, { recursive: true });
  writeFileSync(join(canonicalDir, "SKILL.md"), "placeholder canonical content\n", "utf8");
  return root;
}

// ── Task 1: SKILL.md is tracked and content-complete ─────────────────

test("SKILL.md is not gitignored", () => {
  // `git check-ignore -v` exits 1 (and execFileSync throws on a
  // non-zero exit code) EXACTLY when the path is NOT excluded by any
  // .gitignore rule — the desired/passing state per D-07's Pitfall-1
  // fix (.agents/skills/ is never listed in this repo's .gitignore,
  // unlike .claude/ and .codex/, which are both wholesale-excluded).
  expect(() =>
    execFileSync("git", ["check-ignore", "-v", SKILL_MD_RELATIVE_PATH], {
      cwd: SERVER_REPO_ROOT,
    }),
  ).toThrow();
});

test("SKILL.md documents the hard gate, the capture verb, the scaffold-hole workflow, the trust-retraction framing, and the local-checkout launch caveat", () => {
  const content = readFileSync(SKILL_MD_PATH, "utf8");

  expect(content).toContain("expectedSignature");
  expect(/hard gate|refuse/i.test(content)).toBe(true);
  expect(content).toContain("agda_capture_session");
  expect(/scaffold-hole|--allow-unsolved-metas/.test(content)).toBe(true);
  expect(content).toContain("dogfood-wrapup");
  expect(/npm run build|local|checkout/i.test(content)).toBe(true);
});

// ── Task 2: install-dogfood-skill.mjs — idempotent .claude/skills/ symlink ──

test("installDogfoodSkill creates a .claude/skills/agda-dogfooding symlink pointing at the canonical .agents/ content", () => {
  const serverRepoRoot = makeFakeServerRepoRoot();

  const result = installDogfoodSkill({ serverRepoRoot });

  expect(result.action).toBe("created");
  const claudeLink = join(serverRepoRoot, ".claude", "skills", "agda-dogfooding");
  expect(lstatSync(claudeLink).isSymbolicLink()).toBe(true);
  expect(readlinkSync(claudeLink)).toBe(
    join(serverRepoRoot, ".agents", "skills", "agda-dogfooding"),
  );
});

test("installDogfoodSkill is idempotent: a second run against the same tree leaves the same correct symlink in place and does not throw", () => {
  const serverRepoRoot = makeFakeServerRepoRoot();

  const first = installDogfoodSkill({ serverRepoRoot });
  expect(first.action).toBe("created");

  let second: { action: string };
  expect(() => {
    second = installDogfoodSkill({ serverRepoRoot });
  }).not.toThrow();

  expect(second!.action).toBe("already-linked");
  const claudeLink = join(serverRepoRoot, ".claude", "skills", "agda-dogfooding");
  expect(lstatSync(claudeLink).isSymbolicLink()).toBe(true);
  expect(readlinkSync(claudeLink)).toBe(
    join(serverRepoRoot, ".agents", "skills", "agda-dogfooding"),
  );
});

test("installDogfoodSkill never overwrites a pre-existing REAL (non-symlink) directory at .claude/skills/agda-dogfooding", () => {
  const serverRepoRoot = makeFakeServerRepoRoot();
  const claudeLink = join(serverRepoRoot, ".claude", "skills", "agda-dogfooding");
  mkdirSync(claudeLink, { recursive: true });
  writeFileSync(join(claudeLink, "unrelated-local-file.txt"), "do not touch\n", "utf8");

  let result: { action: string };
  expect(() => {
    result = installDogfoodSkill({ serverRepoRoot });
  }).not.toThrow();

  expect(result!.action).toBe("skipped-existing-non-symlink");
  // Untouched: still a real directory, never replaced by a symlink,
  // and its pre-existing (unrelated) content survives unchanged.
  expect(lstatSync(claudeLink).isSymbolicLink()).toBe(false);
  expect(lstatSync(claudeLink).isDirectory()).toBe(true);
  expect(readFileSync(join(claudeLink, "unrelated-local-file.txt"), "utf8")).toBe(
    "do not touch\n",
  );
});
