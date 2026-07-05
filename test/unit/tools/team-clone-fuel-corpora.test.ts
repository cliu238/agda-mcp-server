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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cloneAllFuelCorpora,
  cloneFuelCorpus,
  readFuelCorpora,
  resolveCloneUrl,
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

test("resolveCloneUrl builds the x-access-token URL pre-scrub, the plain URL without a token, and honors the test seam (WR-10)", () => {
  expect(resolveCloneUrl({ key: "k", repo: "example/private-corpus" }, {}, "tok")).toBe(
    "https://x-access-token:tok@github.com/example/private-corpus.git",
  );
  expect(resolveCloneUrl({ key: "k", repo: "example/pub" }, {}, null)).toBe(
    "https://github.com/example/pub.git",
  );
  expect(
    resolveCloneUrl({ key: "k", repo: "example/pub" }, { cloneUrl: () => "/local/fixture.git" }, "tok"),
  ).toBe("/local/fixture.git");
});

test("a credentialed private clone scrubs the embedded token from origin immediately after cloning", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = { key: "private-corpus", repo: "example/private-corpus", access: "private", pinnedRef };
  const destDir = join(destRoot, "private-corpus");
  const tokenUrl = "https://x-access-token:fake-token-value@github.com/example/private-corpus.git";

  // NO deps.cloneUrl override: the clone argv carries the PRODUCTION
  // token-bearing URL (WR-10 — the old cloneUrl-seam version never got
  // the token anywhere near .git/config, making the negative
  // assertions below vacuous). The spy intercepts only the
  // network-bound `git clone`: it clones from the local fixture
  // instead, then persists the token URL as origin — byte-for-byte
  // what a real `git clone <token-url>` leaves in .git/config.
  // Everything after (the scrub under test, checkout, submodule) runs
  // against real git.
  const calls: string[][] = [];
  const spy = (cmd: string, args: string[], opts: unknown) => {
    calls.push([cmd, ...args]);
    if (cmd === "git" && args[0] === "clone") {
      execFileSync("git", ["clone", bareRepoPath, args[2]], GIT_OPTS);
      execFileSync("git", ["-C", args[2], "remote", "set-url", "origin", args[1]], GIT_OPTS);
      return Buffer.from("");
    }
    return execFileSync(cmd, args, opts as never);
  };

  const result = cloneFuelCorpus(entry, destRoot, {
    ghToken: "fake-token-value",
    execFileSync: spy,
  });

  expect(result.ok).toBe(true);

  // (a) The clone argv contained the production x-access-token URL.
  const cloneCallIndex = calls.findIndex((call) => call[1] === "clone");
  expect(cloneCallIndex).toBeGreaterThanOrEqual(0);
  expect(calls[cloneCallIndex]).toEqual(["git", "clone", tokenUrl, destDir]);

  // (b) The T-08-02 scrub was the IMMEDIATE next call, with the clean URL.
  expect(calls[cloneCallIndex + 1]).toEqual([
    "git",
    "-C",
    destDir,
    "remote",
    "set-url",
    "origin",
    "https://github.com/example/private-corpus.git",
  ]);

  // (c) Final on-disk state, now NON-vacuous: the token genuinely was
  // in .git/config after the clone (planted above exactly as git
  // persists it), so a deleted scrub turns these assertions red.
  const config = readFileSync(join(destDir, ".git", "config"), "utf8");
  expect(config.includes("x-access-token")).toBe(false);
  expect(config.includes("fake-token-value")).toBe(false);
  expect(config.includes("https://github.com/example/private-corpus.git")).toBe(true);
});

// ── re-run hygiene: WR-01 re-scrub, WR-03 credentialed fetch, WR-12 origin preservation ──

test("a re-run against an existing clone re-scrubs a token-bearing origin left by an interrupted prior run (WR-01)", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = { key: "fixture-corpus", repo: "example/fixture-corpus", access: "public", pinnedRef };

  const first = cloneFuelCorpus(entry, destRoot, { cloneUrl: () => bareRepoPath });
  expect(first.ok).toBe(true);
  const destDir = join(destRoot, "fixture-corpus");

  // Simulate a prior run killed between `git clone <token-url>` and the
  // T-08-02 set-url scrub: the token-bearing URL persists as origin.
  execFileSync(
    "git",
    [
      "-C",
      destDir,
      "remote",
      "set-url",
      "origin",
      "https://x-access-token:leaked-token@github.com/example/fixture-corpus.git",
    ],
    GIT_OPTS,
  );

  const second = cloneFuelCorpus(entry, destRoot, { cloneUrl: () => bareRepoPath });

  expect(second.ok).toBe(true);
  const config = readFileSync(join(destDir, ".git", "config"), "utf8");
  expect(config.includes("x-access-token")).toBe(false);
  expect(config.includes("leaked-token")).toBe(false);
});

test("a private-corpus re-run scrubs a token-bearing origin, then fetches via an explicit credentialed URL with GIT_TERMINAL_PROMPT=0 (WR-03/WR-12)", () => {
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const destDir = join(destRoot, "private-corpus");
  mkdirSync(destDir, { recursive: true });
  const entry = {
    key: "private-corpus",
    repo: "example/private-corpus",
    access: "private",
    pinnedRef: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  };

  const calls: string[][] = [];
  const optsSeen: Array<{ env?: Record<string, string | undefined> }> = [];
  const fakeExecFileSync = (
    cmd: string,
    args: string[],
    opts: { env?: Record<string, string | undefined> },
  ) => {
    calls.push([cmd, ...args]);
    optsSeen.push(opts);
    // The interrupted-prior-run state: origin still carries a token
    // (WR-12 made the scrub conditional — it must SEE a credentialed
    // origin to fire at all).
    if (cmd === "git" && args[2] === "remote" && args[3] === "get-url") {
      return Buffer.from("https://x-access-token:stale@github.com/example/private-corpus.git\n");
    }
    return Buffer.from("");
  };

  // No deps.cloneUrl override: this exercises the PRODUCTION URL
  // resolution for both the re-scrub and the credentialed fetch.
  const result = cloneFuelCorpus(entry, destRoot, { ghToken: "tok", execFileSync: fakeExecFileSync });

  expect(result.ok).toBe(true);
  // Origin is inspected first (WR-12: the scrub is conditional)...
  expect(calls[0]).toEqual(["git", "-C", destDir, "remote", "get-url", "origin"]);
  // ...the token-bearing origin triggers the WR-01 re-scrub with the clean URL...
  expect(calls[1]).toEqual([
    "git",
    "-C",
    destDir,
    "remote",
    "set-url",
    "origin",
    "https://github.com/example/private-corpus.git",
  ]);
  // ...then fetch via the explicit token URL — never `fetch origin`,
  // which would have no credential path at all (git never reads GH_TOKEN).
  expect(calls[2]).toEqual([
    "git",
    "-C",
    destDir,
    "fetch",
    "https://x-access-token:tok@github.com/example/private-corpus.git",
    entry.pinnedRef,
  ]);
  // WR-03: every git invocation is prompt-proof — fail fast, never hang.
  expect(optsSeen.length).toBeGreaterThan(0);
  for (const opts of optsSeen) {
    expect(opts.env?.GIT_TERMINAL_PROMPT).toBe("0");
  }
});

test("a re-run with an SSH origin and a failing fetch still succeeds when the pinned SHA is local — origin untouched (WR-12)", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const destDir = join(destRoot, "private-corpus");
  const entry = { key: "private-corpus", repo: "example/private-corpus", access: "private", pinnedRef };
  const sshOrigin = "git@github.com:example/private-corpus.git";

  // What a prior successful `gh repo clone` over the SSH protocol left
  // behind: a full clone at the pinned SHA with an SSH origin.
  execFileSync("git", ["clone", bareRepoPath, destDir], GIT_OPTS);
  execFileSync("git", ["-C", destDir, "remote", "set-url", "origin", sshOrigin], GIT_OPTS);

  // Credential-less re-run whose update-fetch FAILS (no ssh agent /
  // offline — the fast failure GIT_TERMINAL_PROMPT=0 forces). Every
  // call except the fetch runs against real git.
  const calls: string[][] = [];
  const spy = (cmd: string, args: string[], opts: unknown) => {
    calls.push([cmd, ...args]);
    if (cmd === "git" && args[2] === "fetch") {
      throw new Error("ssh: connect to host github.com port 22: Network is unreachable");
    }
    return execFileSync(cmd, args, opts as never);
  };

  withEnv("GH_TOKEN", undefined, () => {
    withEnv("GITHUB_TOKEN", undefined, () => {
      const result = cloneFuelCorpus(entry, destRoot, { execFileSync: spy });
      expect(result).toMatchObject({ ok: true, key: "private-corpus" });
    });
  });

  // The no-token fetch went via the EXISTING origin remote (the SSH
  // transport), never a forced-https URL...
  const fetchCall = calls.find((call) => call[3] === "fetch");
  expect(fetchCall).toEqual(["git", "-C", destDir, "fetch", "origin", pinnedRef]);
  // ...the SSH origin survived the re-run (no unconditional rewrite)...
  expect(calls.some((call) => call.includes("set-url"))).toBe(false);
  const origin = execFileSync("git", ["-C", destDir, "remote", "get-url", "origin"], GIT_OPTS)
    .toString()
    .trim();
  expect(origin).toBe(sshOrigin);
  // ...and the corpus is checked out at its pinned SHA regardless.
  const headSha = execFileSync("git", ["-C", destDir, "rev-parse", "HEAD"], GIT_OPTS)
    .toString()
    .trim();
  expect(headSha).toBe(pinnedRef);
});

test("a re-run with an already-clean https origin never rewrites it — no set-url call (WR-12)", () => {
  const { bareRepoPath, pinnedRef } = createBareFixtureRepo();
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const destDir = join(destRoot, "fixture-corpus");
  const entry = { key: "fixture-corpus", repo: "example/fixture-corpus", access: "public", pinnedRef };
  const cleanOrigin = "https://github.com/example/fixture-corpus.git";

  execFileSync("git", ["clone", bareRepoPath, destDir], GIT_OPTS);
  execFileSync("git", ["-C", destDir, "remote", "set-url", "origin", cleanOrigin], GIT_OPTS);

  const calls: string[][] = [];
  const spy = (cmd: string, args: string[], opts: unknown) => {
    calls.push([cmd, ...args]);
    if (cmd === "git" && args[2] === "fetch") {
      return Buffer.from(""); // never hit the network in a unit test
    }
    return execFileSync(cmd, args, opts as never);
  };

  const result = cloneFuelCorpus(entry, destRoot, { execFileSync: spy });

  expect(result).toMatchObject({ ok: true });
  expect(calls.some((call) => call.includes("set-url"))).toBe(false);
  const origin = execFileSync("git", ["-C", destDir, "remote", "get-url", "origin"], GIT_OPTS)
    .toString()
    .trim();
  expect(origin).toBe(cleanOrigin);
});

// ── clone-failed error strings: token never retained (WR-02) ────────────

test("clone-failed error strings scrub the raw token before it is stored (WR-02)", () => {
  const destRoot = makeTempDir("agda-mcp-fuel-dest-");
  const entry = {
    key: "private-corpus",
    repo: "example/private-corpus",
    access: "private",
    pinnedRef: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  };

  // Mimic execFileSync's real failure shape: error.message embeds the
  // full argv, token-bearing clone URL included.
  const fakeExecFileSync = (cmd: string, args: string[]) => {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  };

  const result = cloneFuelCorpus(entry, destRoot, {
    ghToken: "sekret-token",
    execFileSync: fakeExecFileSync,
  });

  expect(result).toMatchObject({ ok: false, key: "private-corpus", reason: "clone-failed" });
  expect(result.error).toContain("***");
  expect(result.error.includes("sekret-token")).toBe(false);
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
