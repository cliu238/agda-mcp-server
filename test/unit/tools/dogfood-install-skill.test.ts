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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";

const SKILL_MD_RELATIVE_PATH = ".agents/skills/agda-dogfooding/SKILL.md";
const SKILL_MD_PATH = join(SERVER_REPO_ROOT, ...SKILL_MD_RELATIVE_PATH.split("/"));

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
