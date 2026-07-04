// MIT License — see LICENSE
//
// Unit tests for scripts/team/clone-fuel-corpora.mjs (D-04/D-05): the
// shared fuel-corpus clone/checkout primitive reused verbatim by
// TEAM-05's installer AND 08-02's Dockerfile image build. Drives
// cloneFuelCorpus against a real local bare-repo fixture (mkdtempSync
// + real git, no network) via the deps.cloneUrl DI seam, and fakes
// deps.execFileSync for the `gh auth status` no-credential path —
// never invokes real `gh`. mkdtempSync-per-test + afterEach cleanup,
// mirroring test/unit/tools/team-issue-key.test.ts exactly.

import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cloneAllFuelCorpora,
  cloneFuelCorpus,
  readFuelCorpora,
  resolveFuelRoot,
  // @ts-expect-error script module lacks types
} from "../../../scripts/team/clone-fuel-corpora.mjs";

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

const GIT_OPTS = { stdio: "pipe" as const };

/** Real local bare-repo fixture — one commit, no network required. */
function createBareFixtureRepo(): { bareRepoPath: string; pinnedRef: string } {
  const workDir = makeTempDir("agda-mcp-fuel-fixture-work-");
  const bareDir = makeTempDir("agda-mcp-fuel-fixture-bare-");
  const bareRepoPath = join(bareDir, "fixture.git");

  execFileSync("git", ["init", "--bare", bareRepoPath], GIT_OPTS);
  execFileSync("git", ["init", workDir], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "config", "user.email", "test@example.com"], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "config", "user.name", "Test"], GIT_OPTS);
  writeFileSync(join(workDir, "README.md"), "fixture\n");
  execFileSync("git", ["-C", workDir, "add", "README.md"], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "commit", "-m", "init"], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "remote", "add", "origin", bareRepoPath], GIT_OPTS);
  const branch = execFileSync("git", ["-C", workDir, "branch", "--show-current"], GIT_OPTS)
    .toString()
    .trim();
  execFileSync("git", ["-C", workDir, "push", "origin", branch], GIT_OPTS);
  const pinnedRef = execFileSync("git", ["-C", workDir, "rev-parse", "HEAD"], GIT_OPTS)
    .toString()
    .trim();

  return { bareRepoPath, pinnedRef };
}

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const original = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}

// ── readFuelCorpora: never-throws contract ──────────────────────────────

test("readFuelCorpora returns [] for an absent file", () => {
  const missingPath = join(makeTempDir("agda-mcp-fuel-absent-"), "does-not-exist.json");
  expect(readFuelCorpora(missingPath)).toEqual([]);
});

test("readFuelCorpora returns [] for malformed JSON and for non-array JSON", () => {
  const dir = makeTempDir("agda-mcp-fuel-malformed-");

  const malformedPath = join(dir, "malformed.json");
  writeFileSync(malformedPath, "{ not valid json");
  expect(readFuelCorpora(malformedPath)).toEqual([]);

  const nonArrayPath = join(dir, "non-array.json");
  writeFileSync(nonArrayPath, JSON.stringify({ notAnArray: true }));
  expect(readFuelCorpora(nonArrayPath)).toEqual([]);
});

test("readFuelCorpora with no argument reads the real scripts/data/fuel-corpora.json SSOT", () => {
  const entries = readFuelCorpora();
  expect(Array.isArray(entries)).toBe(true);
  expect(entries.length).toBeGreaterThanOrEqual(4);
  expect(entries.map((entry: { key: string }) => entry.key)).toContain("agda-stdlib");
});

// ── resolveFuelRoot: mandatory env override (D-05) + visible default (D-04) ──

test("resolveFuelRoot honors a trimmed AGDA_MCP_FUEL_ROOT override", () => {
  withEnv("AGDA_MCP_FUEL_ROOT", "  /tmp/custom-fuel-root  ", () => {
    expect(resolveFuelRoot()).toBe("/tmp/custom-fuel-root");
  });
});

test("resolveFuelRoot defaults to a visible (not hidden) ~/agda-mcp-fuel", () => {
  withEnv("AGDA_MCP_FUEL_ROOT", undefined, () => {
    const root = resolveFuelRoot();
    expect(root).toMatch(/agda-mcp-fuel$/);
    expect(root.split("/").pop()?.startsWith(".")).toBe(false);
  });
});

// ── cloneFuelCorpus: fresh clone + idempotent re-run ─────────────────────

test("cloneFuelCorpus clones a public entry fresh and lands at the pinned SHA", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = { key: "fixture-corpus", repo: "example/fixture-corpus", access: "public", pinnedRef };

  const result = cloneFuelCorpus(entry, destRoot, { cloneUrl: () => bareRepoPath });

  expect(result).toEqual({ ok: true, key: "fixture-corpus", destDir: join(destRoot, "fixture-corpus") });
  const headSha = execFileSync("git", ["-C", result.destDir, "rev-parse", "HEAD"], GIT_OPTS)
    .toString()
    .trim();
  expect(headSha).toBe(pinnedRef);
});

test("a second call against an already-cloned destDir takes the fetch+checkout branch, never re-clones", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = { key: "fixture-corpus", repo: "example/fixture-corpus", access: "public", pinnedRef };

  const first = cloneFuelCorpus(entry, destRoot, { cloneUrl: () => bareRepoPath });
  expect(first.ok).toBe(true);

  const calls: string[][] = [];
  const spy = (cmd: string, args: string[], opts: unknown) => {
    calls.push([cmd, ...args]);
    return execFileSync(cmd, args, opts as never);
  };

  const second = cloneFuelCorpus(entry, destRoot, { cloneUrl: () => bareRepoPath, execFileSync: spy });

  expect(second.ok).toBe(true);
  expect(calls.some((call) => call.includes("clone"))).toBe(false);
  expect(calls.some((call) => call.includes("fetch"))).toBe(true);
});

test("cloneFuelCorpus runs git submodule update --init --recursive after a successful clone", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = { key: "fixture-corpus", repo: "example/fixture-corpus", access: "public", pinnedRef };

  const calls: string[][] = [];
  const spy = (cmd: string, args: string[], opts: unknown) => {
    calls.push([cmd, ...args]);
    return execFileSync(cmd, args, opts as never);
  };

  const result = cloneFuelCorpus(entry, destRoot, { cloneUrl: () => bareRepoPath, execFileSync: spy });

  expect(result.ok).toBe(true);
  expect(calls.some((call) => call.join(" ").includes("submodule update --init --recursive"))).toBe(true);
});

// ── cloneFuelCorpus: private repo, no credential — skip, never throw ─────

test("a private entry with no GH_TOKEN/gh auth returns ok:false without throwing", () => {
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = {
    key: "private-corpus",
    repo: "example/private-corpus",
    access: "private",
    pinnedRef: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  };

  const fakeExecFileSync = (cmd: string, args: string[]) => {
    if (cmd === "gh" && args[0] === "auth") {
      throw new Error("gh: not authenticated");
    }
    throw new Error(`unexpected exec: ${cmd} ${args.join(" ")}`);
  };

  withEnv("GH_TOKEN", undefined, () => {
    withEnv("GITHUB_TOKEN", undefined, () => {
      const result = cloneFuelCorpus(entry, destRoot, { execFileSync: fakeExecFileSync });
      expect(result).toEqual({ ok: false, key: "private-corpus", reason: "private-repo-no-credential" });
    });
  });
});

// ── cloneFuelCorpus: credentialed private clone scrubs the token ────────

test("a credentialed private clone scrubs the embedded token from origin immediately after cloning", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = { key: "private-corpus", repo: "example/private-corpus", access: "private", pinnedRef };

  const calls: string[][] = [];
  const spy = (cmd: string, args: string[], opts: unknown) => {
    calls.push([cmd, ...args]);
    return execFileSync(cmd, args, opts as never);
  };

  const result = cloneFuelCorpus(entry, destRoot, {
    ghToken: "fake-token-value",
    cloneUrl: () => bareRepoPath,
    execFileSync: spy,
  });

  expect(result.ok).toBe(true);
  const destDir = join(destRoot, "private-corpus");

  const cloneCallIndex = calls.findIndex((call) => call.includes("clone"));
  expect(cloneCallIndex).toBeGreaterThanOrEqual(0);
  expect(calls[cloneCallIndex + 1]).toEqual([
    "git",
    "-C",
    destDir,
    "remote",
    "set-url",
    "origin",
    "https://github.com/example/private-corpus.git",
  ]);

  const config = readFileSync(join(destDir, ".git", "config"), "utf8");
  expect(config.includes("x-access-token")).toBe(false);
  expect(config.includes("fake-token-value")).toBe(false);
  expect(config.includes("https://github.com/example/private-corpus.git")).toBe(true);
});

// ── cloneAllFuelCorpora: one bad entry never aborts the batch ────────────

test("cloneAllFuelCorpora continues past one failing entry and still processes the rest", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const dataDir = makeTempDir("agda-mcp-fuel-data-");
  const fuelCorporaJsonPath = join(dataDir, "fuel-corpora.json");
  writeFileSync(
    fuelCorporaJsonPath,
    JSON.stringify([
      {
        key: "private-corpus",
        repo: "example/private-corpus",
        access: "private",
        pinnedRef: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
      { key: "public-corpus", repo: "example/public-corpus", access: "public", pinnedRef },
    ]),
  );

  const fakeExecFileSync = (cmd: string, args: string[], opts: unknown) => {
    if (cmd === "gh") {
      throw new Error("gh: not authenticated");
    }
    return execFileSync(cmd, args, opts as never);
  };

  withEnv("GH_TOKEN", undefined, () => {
    withEnv("GITHUB_TOKEN", undefined, () => {
      const results = cloneAllFuelCorpora(destRoot, {
        fuelCorporaJsonPath,
        cloneUrl: () => bareRepoPath,
        execFileSync: fakeExecFileSync,
      });

      expect(results).toHaveLength(2);
      expect(results.find((r: { key: string }) => r.key === "private-corpus")).toMatchObject({
        ok: false,
        reason: "private-repo-no-credential",
      });
      expect(results.find((r: { key: string }) => r.key === "public-corpus")).toMatchObject({ ok: true });
      expect(existsSync(join(destRoot, "public-corpus"))).toBe(true);
    });
  });
});
