// MIT License — see LICENSE
//
// Unit tests for CAP-05's oracle substrate builder
// (resolveBeforeSource / buildOracleSubstrate). Pins D-04's
// beforeSource resolution priority (agent-supplied > git-diff >
// unavailable) and D-02's optional-and-non-throwing contract for the
// whole substrate, regardless of session state.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect, afterEach } from "vitest";

import { AgdaSession } from "../../../../src/agda-process.js";
import { resolveBeforeSource } from "../../../../src/agda/session-capture/oracle-substrate.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agda-mcp-oracle-substrate-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

// ── Task 1: resolveBeforeSource ──────────────────────────────────

test("resolveBeforeSource: explicit beforeSource wins, no git shell-out attempted", async () => {
  const dir = makeTempDir();
  const session = new AgdaSession(dir);
  try {
    const result = resolveBeforeSource(session, "explicit source content");
    expect(result).toEqual({
      beforeSource: "explicit source content",
      beforeSourceOrigin: "agent-supplied",
    });
  } finally {
    await session.destroy();
  }
});

test("resolveBeforeSource: falls back to git HEAD content for a tracked, committed file", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "Example.agda");
  writeFileSync(filePath, "module Example where\n");

  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["add", "Example.agda"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "test"], { cwd: dir });

  const session = new AgdaSession(dir);
  session.currentFile = filePath;
  try {
    const result = resolveBeforeSource(session);
    expect(result).toEqual({
      beforeSource: "module Example where\n",
      beforeSourceOrigin: "git-diff",
    });
  } finally {
    await session.destroy();
  }
});

test("resolveBeforeSource: never throws when the file is not inside a git repo", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "Untracked.agda");
  writeFileSync(filePath, "module Untracked where\n");

  const session = new AgdaSession(dir);
  session.currentFile = filePath;
  try {
    const result = resolveBeforeSource(session);
    expect(result).toEqual({
      beforeSource: null,
      beforeSourceOrigin: "unavailable",
    });
  } finally {
    await session.destroy();
  }
});

test("resolveBeforeSource: never throws when currentFile is null", async () => {
  const dir = makeTempDir();
  const session = new AgdaSession(dir);
  try {
    const result = resolveBeforeSource(session);
    expect(result).toEqual({
      beforeSource: null,
      beforeSourceOrigin: "unavailable",
    });
  } finally {
    await session.destroy();
  }
});

test("resolveBeforeSource imports execFileSync (never execSync) from node:child_process", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const sourcePath = fileURLToPath(
    new URL(
      "../../../../src/agda/session-capture/oracle-substrate.ts",
      import.meta.url,
    ),
  );
  const source = readFileSync(sourcePath, "utf8");
  expect(source).toMatch(
    /import\s*\{\s*execFileSync\s*\}\s*from\s*"node:child_process"/u,
  );
  expect(source).not.toMatch(/\bexecSync\b/u);
});
