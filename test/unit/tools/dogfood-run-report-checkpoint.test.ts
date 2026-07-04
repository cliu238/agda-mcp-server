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
// for signal-handling correctness elsewhere in this codebase. A
// SIGKILL cannot be intercepted by definition, so the ONLY way to
// verify the primary defense (incremental checkpointing) is to prove
// the report file already exists on disk with the right shape at the
// moment the signal lands — this suite does that for real, rather
// than only asserting "our code would have run" in-process.
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

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

let spawnedChildren: ChildProcessWithoutNullStreams[] = [];

afterEach(async () => {
  // Belt-and-suspenders: a test that fails an assertion before reaching
  // its own kill() call must never leak a live proxy process into
  // later tests/the CI runner.
  for (const child of spawnedChildren) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
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

test(
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

    child.kill("SIGKILL");
    await waitForExit(child);
  },
  10_000,
);

// ── Test (a): the primary SIGKILL defense ────────────────────────────

test(
  "a hard SIGKILL after one recorded action still leaves run-report.json on disk with finalized:false (the primary SIGKILL defense)",
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

    child.kill("SIGKILL");
    await waitForExit(child);

    const report = readReport(runsRoot, runId);
    expect(report.finalized).toBe(false);
    expect(report.totalToolCalls).toBe(1);
  },
  10_000,
);

// ── Test (b): the graceful SIGTERM path ──────────────────────────────

test(
  "a graceful SIGTERM finalizes the report (finalized:true) with exit metadata, after killing the still-live inner child",
  async () => {
    const corpusRoot = makeTempDir("agda-mcp-checkpoint-corpus-sigterm-");
    const runsRoot = makeTempDir("agda-mcp-checkpoint-runs-sigterm-");
    const manifestPath = writeManifest(corpusRoot);
    const runId = "sigterm-checkpoint-test";

    const child = spawnProxy({ manifestPath, corpusRoot, runId, runsRoot });
    await sendOneToolCall(child, 1);
    await waitFor(() => existsSync(join(runsRoot, runId, "run-report.json")));

    child.kill("SIGTERM");
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
