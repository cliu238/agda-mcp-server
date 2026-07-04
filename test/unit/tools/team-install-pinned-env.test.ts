// MIT License — see LICENSE
//
// Unit tests for scripts/team/install-pinned-env.{mjs,sh} (D-01,
// D-03): Agda locate+verify, run-pinned-agda.sh generation, npm ci
// orchestration, and the bash-to-node hand-off contract. Pure
// functions are driven via the deps.execFileSync DI seam (never real
// `agda`/`npm`); the .sh hand-off contract is covered by two real
// subprocess tests (a stub adjacent .mjs, and a PATH-shimmed fake
// `node` for the version gate) — no PATH shimming needed for the
// success-path test since real node/git already satisfy the gate in
// this dev/CI environment.

import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PINNED_AGDA_VERSION,
  checkNodeVersion,
  generateRunPinnedAgdaScript,
  getAgdaVersion,
  locateAgdaBinary,
  runNpmCi,
  scriptMain,
  versionSatisfies,
  writeRunPinnedAgdaScript,
  // @ts-expect-error script module lacks types
} from "../../../scripts/team/install-pinned-env.mjs";

import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";

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

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}

// ── PINNED_AGDA_VERSION / versionSatisfies (D-03: exact match) ──────────

test("PINNED_AGDA_VERSION is the exact D-03 pin", () => {
  expect(PINNED_AGDA_VERSION).toBe("2.8.0");
});

test("versionSatisfies is an exact-match comparison, trimming both sides, never a range", () => {
  expect(versionSatisfies("2.8.0")).toBe(true);
  expect(versionSatisfies(" 2.8.0 ")).toBe(true);
  expect(versionSatisfies("2.8.0", "2.8.0")).toBe(true);
  expect(versionSatisfies("2.8.1")).toBe(false);
  expect(versionSatisfies("2.7.0")).toBe(false);
  expect(versionSatisfies(null)).toBe(false);
  expect(versionSatisfies(undefined)).toBe(false);
});

// ── checkNodeVersion ──────────────────────────────────────────────────

test("checkNodeVersion is ok for Node >= 24 and not ok below", () => {
  expect(checkNodeVersion({ nodeVersions: { node: "24.1.0" } })).toEqual({ ok: true, detected: "24.1.0" });
  expect(checkNodeVersion({ nodeVersions: { node: "18.20.0" } })).toEqual({ ok: false, detected: "18.20.0" });
});

// ── generateRunPinnedAgdaScript ──────────────────────────────────────────

test("generateRunPinnedAgdaScript produces a bash wrapper that execs the resolved path with all args", () => {
  const script = generateRunPinnedAgdaScript("/opt/agda/bin/agda");
  expect(script).toMatch(/^#!\/usr\/bin\/env bash/);
  expect(script).toContain("set -euo pipefail");
  expect(script).toContain('exec "/opt/agda/bin/agda" "$@"');
});

test("writeRunPinnedAgdaScript writes an executable wrapper at tooling/scripts/run-pinned-agda.sh", () => {
  const repoRoot = makeTempDir("agda-mcp-install-repo-");
  const scriptPath = writeRunPinnedAgdaScript(repoRoot, "/opt/agda/bin/agda");
  expect(scriptPath).toBe(join(repoRoot, "tooling", "scripts", "run-pinned-agda.sh"));
  expect(existsSync(scriptPath)).toBe(true);
  expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
  expect(readFileSync(scriptPath, "utf8")).toContain('exec "/opt/agda/bin/agda" "$@"');
});

// ── locateAgdaBinary / getAgdaVersion via deps.execFileSync fakes ───────

test("locateAgdaBinary prefers AGDA_BIN when set, without invoking execFileSync", () => {
  withEnv("AGDA_BIN", "/custom/agda", () => {
    const fakeExecFileSync = () => {
      throw new Error("should not be called");
    };
    expect(locateAgdaBinary({ execFileSync: fakeExecFileSync })).toBe("/custom/agda");
  });
});

test("locateAgdaBinary falls back to `which agda` and returns null on non-zero exit", () => {
  withEnv("AGDA_BIN", undefined, () => {
    const found = locateAgdaBinary({ execFileSync: () => Buffer.from("/usr/local/bin/agda\n") });
    expect(found).toBe("/usr/local/bin/agda");

    const missing = locateAgdaBinary({
      execFileSync: () => {
        throw new Error("not found");
      },
    });
    expect(missing).toBeNull();
  });
});

test("getAgdaVersion extracts the version from Agda's --version banner, null on mismatch/failure", () => {
  const found = getAgdaVersion("/usr/local/bin/agda", {
    execFileSync: () => Buffer.from("Agda version 2.8.0\n"),
  });
  expect(found).toBe("2.8.0");

  const noMatch = getAgdaVersion("/usr/local/bin/agda", {
    execFileSync: () => Buffer.from("garbage output\n"),
  });
  expect(noMatch).toBeNull();

  const failed = getAgdaVersion("/usr/local/bin/agda", {
    execFileSync: () => {
      throw new Error("ENOENT");
    },
  });
  expect(failed).toBeNull();
});

// ── runNpmCi ──────────────────────────────────────────────────────────

test("runNpmCi invokes `npm ci` with the given cwd, inherited stdio, and shell:false", () => {
  let captured: unknown;
  const fakeExecFileSync = (cmd: string, args: string[], opts: unknown) => {
    captured = { cmd, args, opts };
    return Buffer.from("");
  };
  runNpmCi("/some/repo", { execFileSync: fakeExecFileSync });
  expect(captured).toEqual({
    cmd: "npm",
    args: ["ci"],
    opts: { cwd: "/some/repo", stdio: "inherit", shell: false },
  });
});

// ── scriptMain: missing-Agda early exit never touches npm ci / clone ────

test("scriptMain's missing-Agda early-exit path never calls npm ci or clones any fuel corpus", () => {
  const calls: string[] = [];
  const fakeExecFileSync = (cmd: string, args: string[]) => {
    calls.push(cmd);
    if (cmd === "which") {
      throw new Error("not found");
    }
    throw new Error(`unexpected exec during missing-Agda early exit: ${cmd} ${args.join(" ")}`);
  };

  const repoRoot = makeTempDir("agda-mcp-install-repo-");
  let stderrOutput = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => {
    stderrOutput += chunk;
    return true;
  }) as typeof process.stderr.write;

  try {
    withEnv("AGDA_BIN", undefined, () => {
      scriptMain([], { execFileSync: fakeExecFileSync, repoRoot });
    });
  } finally {
    process.stderr.write = originalWrite;
  }

  expect(calls).toEqual(["which"]);
  expect(process.exitCode).toBe(1);
  expect(stderrOutput).toMatch(/Agda/);
  expect(existsSync(join(repoRoot, "tooling", "scripts", "run-pinned-agda.sh"))).toBe(false);

  // Reset — this test intentionally sets process.exitCode; do not let
  // it leak into the overall test-run's own exit code.
  process.exitCode = 0;
});

// ── install-pinned-env.sh: hand-off contract (real subprocess) ──────────

const REAL_SH_PATH = join(SERVER_REPO_ROOT, "scripts", "team", "install-pinned-env.sh");

test("the .sh hand-off contract resolves and execs an adjacent .mjs by its own directory", () => {
  const workDir = makeTempDir("agda-mcp-install-sh-handoff-");
  const shPath = join(workDir, "install-pinned-env.sh");
  copyFileSync(REAL_SH_PATH, shPath);
  chmodSync(shPath, 0o755);

  const markerPath = join(workDir, "marker.txt");
  writeFileSync(
    join(workDir, "install-pinned-env.mjs"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(markerPath)}, "stub ran\\n");\n`,
  );

  execFileSync("bash", [shPath], { stdio: "pipe" });

  expect(existsSync(markerPath)).toBe(true);
  expect(readFileSync(markerPath, "utf8")).toBe("stub ran\n");
});

test("the .sh version gate exits 1 with an instructive stderr message before ever reaching the exec line", () => {
  const workDir = makeTempDir("agda-mcp-install-sh-gate-");
  const shPath = join(workDir, "install-pinned-env.sh");
  copyFileSync(REAL_SH_PATH, shPath);
  chmodSync(shPath, 0o755);

  // Present so we can prove the exec line was never reached.
  const markerPath = join(workDir, "marker.txt");
  writeFileSync(
    join(workDir, "install-pinned-env.mjs"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(markerPath)}, "stub ran\\n");\n`,
  );

  // A PATH-shimmed fake `node` that always reports major version 18,
  // matching exactly what the .sh's own
  // `node -e '...process.versions.node.split(".")[0]...'` one-liner
  // would print for a real Node 18 install.
  const fakeBinDir = makeTempDir("agda-mcp-install-fake-node-");
  const fakeNodePath = join(fakeBinDir, "node");
  writeFileSync(fakeNodePath, "#!/usr/bin/env bash\nprintf '18'\n");
  chmodSync(fakeNodePath, 0o755);

  let caught: { status?: number; stderr?: Buffer } | undefined;
  try {
    execFileSync("bash", [shPath], {
      stdio: "pipe",
      env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH}` },
    });
  } catch (err) {
    caught = err as { status?: number; stderr?: Buffer };
  }

  expect(caught).toBeDefined();
  expect(caught?.status).toBe(1);
  expect(caught?.stderr?.toString()).toMatch(/Node/);
  expect(existsSync(markerPath)).toBe(false);
});
