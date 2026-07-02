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
import {
  resolveBeforeSource,
  buildOracleSubstrate,
} from "../../../../src/agda/session-capture/oracle-substrate.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../../helpers/agda-version.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it =
  agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

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

// ── Task 2: buildOracleSubstrate ─────────────────────────────────

test("buildOracleSubstrate: no loaded file, still returns a full substrate without a live command attempt", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  try {
    const substrate = await buildOracleSubstrate(session, {
      expectedSignature: "Nat -> Nat",
    });
    expect(substrate).toEqual({
      intendedGoalType: null,
      expectedSignature: "Nat -> Nat",
      beforeSource: null,
      beforeSourceOrigin: "unavailable",
      afterSource: null,
    });
  } finally {
    await session.destroy();
  }
});

test("buildOracleSubstrate: afterSource reflects current on-disk content when a file is loaded", async () => {
  const dir = makeTempDir();
  const filePath = join(dir, "OnDisk.agda");
  writeFileSync(filePath, "module OnDisk where\n");

  const session = new AgdaSession(dir);
  session.currentFile = filePath;
  try {
    const substrate = await buildOracleSubstrate(session, {});
    expect(substrate.afterSource).toBe("module OnDisk where\n");
    // No goals loaded (goalIds stays empty without a real load()), so
    // no live Cmd_goal_type attempt is made — intendedGoalType stays null.
    expect(substrate.intendedGoalType).toBeNull();
  } finally {
    await session.destroy();
  }
});

test("buildOracleSubstrate: afterSource is null when nothing is loaded", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  try {
    const substrate = await buildOracleSubstrate(session, {});
    expect(substrate.afterSource).toBeNull();
  } finally {
    await session.destroy();
  }
});

it("buildOracleSubstrate: intendedGoalType is a non-empty string for a real loaded file with an open goal", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  try {
    const loadResult = await session.load("AbstractHoleMultiple.agda");
    expect(loadResult.goals.length).toBeGreaterThan(0);
    expect(session.goalIds.length).toBeGreaterThan(0);

    const substrate = await buildOracleSubstrate(session, {});
    expect(typeof substrate.intendedGoalType).toBe("string");
    expect(substrate.intendedGoalType).not.toBe("");
  } finally {
    await session.destroy();
  }
});
