// MIT License — see LICENSE
//
// Regression tests for the fix-queue defect 0bc76d15c2fec8df
// ("dogfood-run.mjs never writes run-report.json when the proxy
// process is hard-killed"), filed during 07-06's E2E-01 live
// acceptance session: finalize() in scripts/dogfood/dogfood-run.mjs
// used to write run-report.json ONLY on child-close/child-error/
// agent-stdin-close, with no signal handlers registered. Codex
// hard-kills the proxy process it directly manages on both
// interactive quit and `codex exec` completion, triggering none of
// those three events — so run-report.json was never written and
// dogfood-wrapup.mjs refused the run outright.
//
// These tests spawn scripts/dogfood/dogfood-run.mjs as a REAL OS
// subprocess (via a resolved node_modules/.bin/tsx, mirroring
// test/integration/mcp/dogfood-proxy-passthrough.test.ts's own
// invocation shape) and send it REAL SIGKILL/SIGTERM signals — the
// same style test/unit/agda/process-termination.test.ts already uses
// for signal-handling correctness elsewhere in this codebase.
//
// PROCESS-GROUP targeting is load-bearing, not cosmetic:
// `node_modules/.bin/tsx` is itself a thin wrapper that spawns a
// SEPARATE grandchild Node process (`--require preflight.cjs --import
// loader.mjs scripts/dogfood/dogfood-run.mjs`) to actually run the
// target script — verified empirically via `ps` during this suite's
// own development (three real OS processes: the tsx wrapper, the
// grandchild running dogfood-run.mjs's actual JS, and its own spawned
// fake-mcp-child.mjs). Sending SIGKILL to ONLY the top-level spawned
// PID (the wrapper) kills the wrapper, but the grandchild — running
// every line of code this suite cares about — is merely orphaned: its
// own stdin pipe (relayed through the now-dead wrapper) then sees a
// GRACEFUL EOF, which the pre-existing `fromAgent.on("close",
// finalize)` handler reacts to, letting a full graceful finalize() run
// to completion. That is a real, useful resilience property, but it
// is NOT the failure mode this defect is about: it would make this
// suite pass even against code with no incremental checkpointing at
// all, since the OLD close-triggered finalize() path is what would be
// doing the work. To exercise the genuine "uncatchable, zero-grace"
// scenario (Codex's own observed behavior — "no stdin close, no
// signal catchable"), every proxy here is spawned `detached: true`
// (its own process group) and killed via `process.kill(-pid,
// signal)`, delivering the signal to the ENTIRE tree (wrapper +
// grandchild + the grandchild's own fake-mcp-child) simultaneously,
// with no cascade for any single process to react to.
//
// The proxy's own inner child is swapped for
// test/fixtures/dogfood-fake-mcp-child.mjs via the test-only
// AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY env override (mirrors
// AGDA_MCP_DOGFOOD_RUNS_ROOT's existing precedent in
// scripts/dogfood/transcript-writer.mjs) — no real Agda binary and no
// `npm run build` are required to run this file.

import { afterEach, expect, test } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";

const FAKE_CHILD_PATH = resolve(SERVER_REPO_ROOT, "test/fixtures/dogfood-fake-mcp-child.mjs");
const DOGFOOD_RUN_PATH = resolve(SERVER_REPO_ROOT, "scripts/dogfood/dogfood-run.mjs");
const TSX_BIN = resolve(SERVER_REPO_ROOT, "node_modules/.bin/tsx");

// POSIX-only: process groups (negative-PID kill targeting) and POSIX
// signal semantics are not meaningful on Windows the same way — mirrors
// test/unit/agda/process-termination.test.ts's own `testPosix` gate.
const testPosix = process.platform === "win32" ? test.skip : test;

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

let spawnedChildren: ChildProcessWithoutNullStreams[] = [];

/** Delivers `signal` to the ENTIRE process group rooted at `child`
 *  (see the file-header comment for why a plain `child.kill()` — which
 *  only targets the top-level tsx-wrapper PID — is not sufficient).
 *  Swallows ESRCH (already-dead group) since this is also used for
 *  best-effort cleanup in `afterEach`. */
function killGroup(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (typeof child.pid !== "number") return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH (no such process/group) — already dead, nothing to do.
  }
}

afterEach(async () => {
  // Belt-and-suspenders: a test that fails an assertion before reaching
  // its own kill() call must never leak a live proxy process (or its
  // own grandchild/fake-mcp-child) into later tests/the CI runner.
  for (const child of spawnedChildren) {
    if (child.exitCode === null && child.signalCode === null) {
      killGroup(child, "SIGKILL");
    }
  }
  spawnedChildren = [];
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function writeManifest(corpusRoot: string): string {
  const manifestPath = join(corpusRoot, "task-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify([
      {
        target: "dogfood-run-report-checkpoint synthetic target",
        expectedSignature: "smoke : Smoke",
        corpus: "dogfood-run-report-checkpoint-fixture",
        notes: "Synthetic single-entry manifest for this signal-handling test — the inner child is a fake fixture, no real corpus is ever loaded.",
      },
    ]),
    "utf8",
  );
  return manifestPath;
}

function spawnProxy({
  manifestPath,
  corpusRoot,
  runId,
  runsRoot,
}: {
  manifestPath: string;
  corpusRoot: string;
  runId: string;
  runsRoot: string;
}): ChildProcessWithoutNullStreams {
  const child = spawn(
    TSX_BIN,
    [DOGFOOD_RUN_PATH, "--manifest", manifestPath, "--corpus-root", corpusRoot, "--run-id", runId],
    {
      cwd: SERVER_REPO_ROOT,
      env: {
        ...process.env,
        AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot,
        AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY: FAKE_CHILD_PATH,
      },
      stdio: ["pipe", "pipe", "pipe"],
      // New, own process group (setsid) — see file header. Every
      // descendant this spawns (the tsx wrapper's own grandchild, and
      // in turn ITS OWN spawned fake-mcp-child.mjs) inherits this same
      // group, since none of them pass `detached` themselves.
      detached: true,
    },
  ) as ChildProcessWithoutNullStreams;
  spawnedChildren.push(child);
  // Drain stderr so the proxy's own diagnostic writes (e.g. the
  // finished-run summary line) can never fill the pipe buffer and
  // stall the child — this test suite does not assert on stderr
  // content, only on the on-disk report.
  child.stderr.on("data", () => {});
  return child;
}

function waitForExit(
  child: ChildProcessWithoutNullStreams,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    child.once("close", (code, signal) => resolveExit({ code, signal }));
  });
}

async function waitFor(predicate: () => boolean, { timeoutMs = 5000, intervalMs = 20 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: predicate never became true within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Sends one `tools/call` line to the proxy's stdin and resolves once
 *  a matching response (by id) is observed on the proxy's own stdout
 *  — i.e. once the round trip through the (fake) inner child and back
 *  out to "the agent" (this test) has genuinely completed. */
function sendOneToolCall(child: ChildProcessWithoutNullStreams, id: number): Promise<void> {
  return new Promise((resolveGot) => {
    const rl = createInterface({ input: child.stdout });
    const onLine = (line: string): void => {
      if (line.includes(`"id":${id}`)) {
        rl.off("line", onLine);
        resolveGot();
      }
    };
    rl.on("line", onLine);
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "fake_tool", arguments: {} } })}\n`,
    );
  });
}

function readReport(runsRoot: string, runId: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(runsRoot, runId, "run-report.json"), "utf8")) as Record<string, unknown>;
}

// ── Test: initial checkpoint at startup ──────────────────────────────

testPosix(
  "writes an initial run-report.json (finalized:false, zero tool calls) immediately at startup, before any tool call is made",
  async () => {
    const corpusRoot = makeTempDir("agda-mcp-checkpoint-corpus-startup-");
    const runsRoot = makeTempDir("agda-mcp-checkpoint-runs-startup-");
    const manifestPath = writeManifest(corpusRoot);
    const runId = "startup-checkpoint-test";

    const child = spawnProxy({ manifestPath, corpusRoot, runId, runsRoot });
    await waitFor(() => existsSync(join(runsRoot, runId, "run-report.json")));

    const report = readReport(runsRoot, runId);
    expect(report.finalized).toBe(false);
    expect(report.totalToolCalls).toBe(0);

    killGroup(child, "SIGKILL");
    await waitForExit(child);
  },
  10_000,
);

// ── Test (a): the primary SIGKILL defense ────────────────────────────

testPosix(
  "a hard SIGKILL delivered to the whole process group after one recorded action still leaves run-report.json on disk with finalized:false (the primary SIGKILL defense)",
  async () => {
    const corpusRoot = makeTempDir("agda-mcp-checkpoint-corpus-sigkill-");
    const runsRoot = makeTempDir("agda-mcp-checkpoint-runs-sigkill-");
    const manifestPath = writeManifest(corpusRoot);
    const runId = "sigkill-checkpoint-test";

    const child = spawnProxy({ manifestPath, corpusRoot, runId, runsRoot });
    await sendOneToolCall(child, 1);

    // Bounded poll rather than a fixed sleep: the incremental write is
    // fire-and-forget relative to forwarding the response (so forwarding
    // a live session never blocks on disk I/O), so there is a short,
    // real window between "the agent saw the response" and "the write
    // landed." A SIGKILL sent inside that window is exactly the failure
    // mode this defense targets, so the test must wait past it, not
    // race it.
    await waitFor(() => {
      if (!existsSync(join(runsRoot, runId, "run-report.json"))) return false;
      return readReport(runsRoot, runId).totalToolCalls === 1;
    });

    killGroup(child, "SIGKILL");
    await waitForExit(child);

    const report = readReport(runsRoot, runId);
    expect(report.finalized).toBe(false);
    expect(report.totalToolCalls).toBe(1);
  },
  10_000,
);

// ── Test (b): the graceful SIGTERM path ──────────────────────────────

testPosix(
  "a graceful SIGTERM delivered to the whole process group finalizes the report (finalized:true) with exit metadata",
  async () => {
    const corpusRoot = makeTempDir("agda-mcp-checkpoint-corpus-sigterm-");
    const runsRoot = makeTempDir("agda-mcp-checkpoint-runs-sigterm-");
    const manifestPath = writeManifest(corpusRoot);
    const runId = "sigterm-checkpoint-test";

    const child = spawnProxy({ manifestPath, corpusRoot, runId, runsRoot });
    await sendOneToolCall(child, 1);
    await waitFor(() => existsSync(join(runsRoot, runId, "run-report.json")));

    killGroup(child, "SIGTERM");
    const { code } = await waitForExit(child);

    const report = readReport(runsRoot, runId);
    expect(report.finalized).toBe(true);
    expect(report.totalToolCalls).toBe(1);
    expect(report.exit).toBeTruthy();
    expect((report.exit as Record<string, unknown>).proxyExitCode).toBe(0);
    // The proxy's own process.exit(0) call on this graceful path — the
    // OS-level exit code the test just observed must agree with what
    // got persisted into the report.
    expect(code).toBe(0);
  },
  10_000,
);
