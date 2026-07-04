// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/upload-run.mjs: the TEAM-02 upload
// client — no-key/no-url gate, staging, tar+gzip packing with
// AppleDouble exclusion, fail-open retry queuing, and D-08 bound
// enforcement (drop-oldest). Every network call goes through an
// injected `deps.fetch` fake — this suite NEVER hits a real network
// endpoint. `tar`/gzip/filesystem operations run for real (system
// `tar` is available in this project's test environment and archive
// fixtures are tiny), matching this project's "only fetch needs
// mocking" dependency-injection convention.

import { afterEach, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import {
  acquireRetryQueueLock,
  appendRetryQueueEntry,
  buildArchiveStaging,
  flushRetryQueue,
  packStagingDir,
  readRetryQueue,
  resolvePendingArchiveDir,
  resolveRetryMaxBytes,
  resolveRetryMaxCount,
  resolveRetryQueuePath,
  resolveUploadKey,
  resolveUploadUrl,
  runUploadForRun,
  scriptMain,
  uploadArchive,
} from "../../../scripts/dogfood/upload-run.mjs";

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

/** Temporarily overrides `process.env` entries for the duration of an
 *  async callback, restoring the previous values (or deleting the key
 *  entirely if it was previously unset) afterward — even on throw. */
async function withEnvOverride<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function writeRunFixture(
  runsRoot: string,
  runId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const runDir = join(runsRoot, runId);
  mkdirSync(runDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    runId,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    endedAt: new Date().toISOString(),
    corpusRoot: "/fake/corpus/for-upload-run-tests",
    manifestPath: "/fake/manifest.json",
    totalToolCalls: 1,
    perTool: {},
    stagedCaptures: [],
    transcriptPath: join(runDir, "transcript.jsonl"),
    ...overrides,
  };
  writeFileSync(join(runDir, "run-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(runDir, "transcript.jsonl"), "", "utf8");
  return report;
}

// ── resolvers ────────────────────────────────────────────────────────

test("resolveUploadKey/resolveUploadUrl trim and blank-to-undefined; resolveRetryQueuePath/resolvePendingArchiveDir derive a consistent pending subdirectory", async () => {
  await withEnvOverride(
    {
      AGDA_MCP_TEAM_UPLOAD_KEY: "  abc  ",
      AGDA_MCP_TEAM_UPLOAD_URL: "",
      AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH: "/tmp/fake-agda-mcp-test/queue.jsonl",
    },
    async () => {
      expect(resolveUploadKey()).toBe("abc");
      expect(resolveUploadUrl()).toBeUndefined();
      expect(resolveRetryQueuePath()).toBe("/tmp/fake-agda-mcp-test/queue.jsonl");
      expect(resolvePendingArchiveDir()).toBe("/tmp/fake-agda-mcp-test/pending");
    },
  );
});

test("resolveRetryMaxCount/resolveRetryMaxBytes default to 20 / 2 GiB and honor a positive-integer env override; never NaN/0 through a bad value", async () => {
  await withEnvOverride(
    { AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT: undefined, AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES: undefined },
    async () => {
      expect(resolveRetryMaxCount()).toBe(20);
      expect(resolveRetryMaxBytes()).toBe(2 * 1024 * 1024 * 1024);
    },
  );

  await withEnvOverride(
    { AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT: "5", AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES: "1024" },
    async () => {
      expect(resolveRetryMaxCount()).toBe(5);
      expect(resolveRetryMaxBytes()).toBe(1024);
    },
  );

  await withEnvOverride(
    { AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT: "not-a-number", AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES: "-5" },
    async () => {
      expect(resolveRetryMaxCount()).toBe(20);
      expect(resolveRetryMaxBytes()).toBe(2 * 1024 * 1024 * 1024);
    },
  );
});

// ── no-key / no-url gate (TEAM-01) ───────────────────────────────────

test("runUploadForRun: an unset key never calls fetch and returns {attempted:false, reason:'no-key'}", async () => {
  const fetchFn = vi.fn();
  const result = await runUploadForRun("irrelevant-run", {
    key: undefined,
    url: "http://example.invalid/ingest",
    deps: { fetch: fetchFn },
  });

  expect(result).toEqual({ attempted: false, reason: "no-key" });
  expect(fetchFn).not.toHaveBeenCalled();
});

test("runUploadForRun: an unset url never calls fetch and returns {attempted:false, reason:'no-url'}", async () => {
  const fetchFn = vi.fn();
  const result = await runUploadForRun("irrelevant-run", {
    key: "some-key",
    url: undefined,
    deps: { fetch: fetchFn },
  });

  expect(result).toEqual({ attempted: false, reason: "no-url" });
  expect(fetchFn).not.toHaveBeenCalled();
});

// ── buildArchiveStaging ──────────────────────────────────────────────

test("buildArchiveStaging: stages runs/<run-id>/*, captures/<basename>, and agent-logs/{claude,codex}/*; cleanup() removes the staging directory", async () => {
  const runsRoot = makeTempDir("agda-mcp-upload-runs-staging-");
  const runId = "run-staging-1";
  const capturePath = join(makeTempDir("agda-mcp-upload-staging-capture-"), "capture-1.json");
  writeFileSync(capturePath, "{}", "utf8");
  const claudeLogPath = join(makeTempDir("agda-mcp-upload-staging-claude-"), "claude-a.jsonl");
  writeFileSync(claudeLogPath, "{}\n", "utf8");
  const codexLogPath = join(makeTempDir("agda-mcp-upload-staging-codex-"), "codex-a.jsonl");
  writeFileSync(codexLogPath, "{}\n", "utf8");

  const report = writeRunFixture(runsRoot, runId, { stagedCaptures: [{ stagedPath: capturePath }] });
  writeFileSync(join(runsRoot, runId, "extra-artifact.txt"), "hello", "utf8");

  const staged = await withEnvOverride({ AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot }, () =>
    buildArchiveStaging(runId, report, {
      deps: {
        selectClaudeCodeLogs: () => [claudeLogPath],
        selectCodexSessionLogs: () => [codexLogPath],
      },
    }),
  );

  expect(existsSync(join(staged.stagingDir, "runs", runId, "run-report.json"))).toBe(true);
  expect(existsSync(join(staged.stagingDir, "runs", runId, "extra-artifact.txt"))).toBe(true);
  expect(existsSync(join(staged.stagingDir, "captures", "capture-1.json"))).toBe(true);
  expect(existsSync(join(staged.stagingDir, "agent-logs", "claude", "claude-a.jsonl"))).toBe(true);
  expect(existsSync(join(staged.stagingDir, "agent-logs", "codex", "codex-a.jsonl"))).toBe(true);

  staged.cleanup();
  expect(existsSync(staged.stagingDir)).toBe(false);
});

test("buildArchiveStaging: a missing capture file or run directory is logged and skipped, never aborts staging", async () => {
  const runsRoot = makeTempDir("agda-mcp-upload-runs-missing-");
  const runId = "run-missing-sources";
  const report = writeRunFixture(runsRoot, runId, {
    stagedCaptures: [{ stagedPath: "/does/not/exist/capture.json" }],
  });

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const staged = await withEnvOverride({ AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot }, () =>
    buildArchiveStaging(runId, report, {
      deps: { selectClaudeCodeLogs: () => [], selectCodexSessionLogs: () => [] },
    }),
  );
  stderrSpy.mockRestore();

  expect(existsSync(join(staged.stagingDir, "runs", runId, "run-report.json"))).toBe(true);
  expect(existsSync(join(staged.stagingDir, "captures"))).toBe(true);
  staged.cleanup();
});

// ── packStagingDir: AppleDouble exclusion ────────────────────────────

test("packStagingDir excludes .DS_Store and ._* AppleDouble junk from the produced archive (pack-then-extract round trip)", async () => {
  const stagingDir = makeTempDir("agda-mcp-upload-pack-staging-");
  writeFileSync(join(stagingDir, "real-file.txt"), "real content", "utf8");
  writeFileSync(join(stagingDir, ".DS_Store"), "junk", "utf8");
  writeFileSync(join(stagingDir, "._junk"), "resource fork junk", "utf8");

  const archivePath = join(makeTempDir("agda-mcp-upload-pack-out-"), "archive.tar.gz");
  await packStagingDir(stagingDir, archivePath);

  expect(existsSync(archivePath)).toBe(true);

  const extractDir = makeTempDir("agda-mcp-upload-pack-extract-");
  execFileSync("tar", ["-xzf", archivePath, "-C", extractDir], { stdio: "pipe" });

  expect(existsSync(join(extractDir, "real-file.txt"))).toBe(true);
  expect(existsSync(join(extractDir, ".DS_Store"))).toBe(false);
  expect(existsSync(join(extractDir, "._junk"))).toBe(false);
});

// ── uploadArchive ────────────────────────────────────────────────────

test("uploadArchive: resolves { ok, status } from a successful fake fetch, sending Authorization/run-id headers over a duplex-streamed body", async () => {
  const archivePath = join(makeTempDir("agda-mcp-upload-archive-direct-"), "direct.tar.gz");
  writeFileSync(archivePath, "fake archive bytes", "utf8");

  const fetchFn = vi.fn(async (_url: string, opts: any) => {
    expect(opts.headers.Authorization).toBe("Bearer direct-key");
    expect(opts.headers["X-Agda-Mcp-Run-Id"]).toBe("direct-run");
    expect(opts.duplex).toBe("half");
    return { ok: true, status: 200 };
  });

  const result = await uploadArchive(
    archivePath,
    { key: "direct-key", url: "http://x.invalid", runId: "direct-run" },
    { fetch: fetchFn },
  );

  expect(result).toEqual({ ok: true, status: 200 });
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test("uploadArchive: a rejecting fetch surfaces as a rejected promise (the caller, not this function, is the try/catch boundary)", async () => {
  const archivePath = join(makeTempDir("agda-mcp-upload-archive-direct-reject-"), "direct.tar.gz");
  writeFileSync(archivePath, "fake archive bytes", "utf8");

  const fetchFn = vi.fn(async () => {
    throw new Error("simulated failure");
  });

  await expect(
    uploadArchive(archivePath, { key: "k", url: "http://x.invalid", runId: "r" }, { fetch: fetchFn }),
  ).rejects.toThrow("simulated failure");
});

// ── runUploadForRun: full success path ───────────────────────────────

test("runUploadForRun: with key+url configured, packs runs/captures/agent-logs into one tar.gz and POSTs it with Bearer + run-id headers; no stray retry-queue entry is left behind", async () => {
  const runsRoot = makeTempDir("agda-mcp-upload-runs-success-");
  const queueDir = makeTempDir("agda-mcp-upload-queue-success-");
  const queuePath = join(queueDir, "upload-queue.jsonl");
  const runId = "run-success-1";

  const capturePath = join(makeTempDir("agda-mcp-upload-success-capture-"), "capture-xyz.json");
  writeFileSync(capturePath, JSON.stringify({ fake: "capture" }), "utf8");
  const claudeLogPath = join(makeTempDir("agda-mcp-upload-success-claude-"), "session.jsonl");
  writeFileSync(claudeLogPath, `${JSON.stringify({ type: "message" })}\n`, "utf8");
  const codexLogPath = join(makeTempDir("agda-mcp-upload-success-codex-"), "rollout-x.jsonl");
  writeFileSync(
    codexLogPath,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: "/fake" } })}\n`,
    "utf8",
  );

  writeRunFixture(runsRoot, runId, {
    stagedCaptures: [{ stagedPath: capturePath, fingerprint: "xyz", kind: "bug", recurrence: 1 }],
  });

  let capturedHeaders: Record<string, string> | undefined;
  let capturedArchiveBytes: Buffer | undefined;
  const fetchFn = vi.fn(async (_url: string, opts: any) => {
    capturedHeaders = opts.headers;
    const chunks: Uint8Array[] = [];
    const reader = opts.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    capturedArchiveBytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return { ok: true, status: 200 };
  });

  const result = await withEnvOverride(
    { AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot, AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH: queuePath },
    () =>
      runUploadForRun(runId, {
        key: "test-key-123",
        url: "http://example.invalid/ingest",
        deps: {
          fetch: fetchFn,
          selectClaudeCodeLogs: () => [claudeLogPath],
          selectCodexSessionLogs: () => [codexLogPath],
        },
      }),
  );

  expect(result).toEqual({ attempted: true, uploaded: true });
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(capturedHeaders?.Authorization).toBe("Bearer test-key-123");
  expect(capturedHeaders?.["X-Agda-Mcp-Run-Id"]).toBe(runId);

  // No stray pending-archive/retry-queue entry left behind on success.
  expect(existsSync(queuePath)).toBe(false);

  // The uploaded bytes really are the packed archive (runs/captures/agent-logs all present).
  const archiveCopyPath = join(makeTempDir("agda-mcp-upload-captured-archive-"), "captured.tar.gz");
  writeFileSync(archiveCopyPath, capturedArchiveBytes ?? Buffer.alloc(0));
  const extractDir = makeTempDir("agda-mcp-upload-captured-extract-");
  execFileSync("tar", ["-xzf", archiveCopyPath, "-C", extractDir], { stdio: "pipe" });
  expect(existsSync(join(extractDir, "runs", runId, "run-report.json"))).toBe(true);
  expect(existsSync(join(extractDir, "captures", "capture-xyz.json"))).toBe(true);
  expect(existsSync(join(extractDir, "agent-logs", "claude", "session.jsonl"))).toBe(true);
  expect(existsSync(join(extractDir, "agent-logs", "codex", "rollout-x.jsonl"))).toBe(true);
});

// ── runUploadForRun: fail-open on network/status failure ─────────────

test("runUploadForRun: a rejecting fetch never throws, is queued for retry, and returns {attempted:true, uploaded:false}", async () => {
  const runsRoot = makeTempDir("agda-mcp-upload-runs-fail-net-");
  const queuePath = join(makeTempDir("agda-mcp-upload-queue-fail-net-"), "upload-queue.jsonl");
  const runId = "run-fail-network-1";
  writeRunFixture(runsRoot, runId);

  const fetchFn = vi.fn(async () => {
    throw new Error("simulated network failure");
  });

  const result = await withEnvOverride(
    { AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot, AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH: queuePath },
    () =>
      runUploadForRun(runId, {
        key: "test-key",
        url: "http://example.invalid/ingest",
        deps: { fetch: fetchFn, selectClaudeCodeLogs: () => [], selectCodexSessionLogs: () => [] },
      }),
  );

  expect(result).toEqual({ attempted: true, uploaded: false });
  const queueEntries = readRetryQueue(queuePath);
  expect(queueEntries).toHaveLength(1);
  expect(queueEntries[0].runId).toBe(runId);
  expect(queueEntries[0].key).toBe("test-key");
  expect(existsSync(queueEntries[0].archivePath)).toBe(true);
});

test("runUploadForRun: a non-2xx response never throws and is queued for retry the same way", async () => {
  const runsRoot = makeTempDir("agda-mcp-upload-runs-fail-status-");
  const queuePath = join(makeTempDir("agda-mcp-upload-queue-fail-status-"), "upload-queue.jsonl");
  const runId = "run-fail-status-1";
  writeRunFixture(runsRoot, runId);

  const fetchFn = vi.fn(async () => ({ ok: false, status: 503 }));

  const result = await withEnvOverride(
    { AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot, AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH: queuePath },
    () =>
      runUploadForRun(runId, {
        key: "test-key",
        url: "http://example.invalid/ingest",
        deps: { fetch: fetchFn, selectClaudeCodeLogs: () => [], selectCodexSessionLogs: () => [] },
      }),
  );

  expect(result).toEqual({ attempted: true, uploaded: false });
  const queueEntries = readRetryQueue(queuePath);
  expect(queueEntries).toHaveLength(1);
  expect(String(queueEntries[0].error)).toContain("503");
});

// ── appendRetryQueueEntry: D-08 bound enforcement ────────────────────

test("appendRetryQueueEntry: appending a 21st entry drops the oldest entry first, deletes its pending archive, and warns on stderr", async () => {
  const dir = makeTempDir("agda-mcp-upload-append-count-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const pendingDir = join(dir, "pending");
  mkdirSync(pendingDir, { recursive: true });

  const firstArchivePath = join(pendingDir, "run-0.tar.gz");
  for (let i = 0; i < 20; i += 1) {
    const archivePath = join(pendingDir, `run-${i}.tar.gz`);
    writeFileSync(archivePath, "x", "utf8");
    await appendRetryQueueEntry(
      { ts: i, runId: `run-${i}`, archivePath, url: "http://x", key: "k", bytes: 1 },
      { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
    );
  }
  expect(readRetryQueue(queuePath)).toHaveLength(20);
  expect(existsSync(firstArchivePath)).toBe(true);

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const newArchivePath = join(pendingDir, "run-20.tar.gz");
  writeFileSync(newArchivePath, "x", "utf8");
  await appendRetryQueueEntry(
    { ts: 20, runId: "run-20", archivePath: newArchivePath, url: "http://x", key: "k", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );
  // Assert BEFORE mockRestore(): vitest's mockRestore() also resets the
  // call history (like mockReset()), so checking toHaveBeenCalled()
  // after restoring would always report false regardless of what
  // actually happened.
  expect(stderrSpy).toHaveBeenCalled();
  stderrSpy.mockRestore();

  const finalQueue = readRetryQueue(queuePath);
  expect(finalQueue).toHaveLength(20);
  expect(finalQueue.find((entry: any) => entry.runId === "run-0")).toBeUndefined();
  expect(finalQueue.find((entry: any) => entry.runId === "run-20")).toBeDefined();
  expect(existsSync(firstArchivePath)).toBe(false);
});

test("appendRetryQueueEntry: exceeding the byte bound drops the oldest entry first even when the count bound is not reached", async () => {
  const dir = makeTempDir("agda-mcp-upload-append-bytes-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const pendingDir = join(dir, "pending");
  mkdirSync(pendingDir, { recursive: true });

  const oldArchivePath = join(pendingDir, "run-old.tar.gz");
  writeFileSync(oldArchivePath, "x", "utf8");
  await appendRetryQueueEntry(
    { ts: 1, runId: "run-old", archivePath: oldArchivePath, url: "http://x", key: "k", bytes: 1000 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: 1500 },
  );

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const newArchivePath = join(pendingDir, "run-new.tar.gz");
  writeFileSync(newArchivePath, "x", "utf8");
  await appendRetryQueueEntry(
    { ts: 2, runId: "run-new", archivePath: newArchivePath, url: "http://x", key: "k", bytes: 1000 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: 1500 },
  );
  // Assert BEFORE mockRestore() — see note in the count-bound test above.
  expect(stderrSpy).toHaveBeenCalled();
  stderrSpy.mockRestore();

  const finalQueue = readRetryQueue(queuePath);
  expect(finalQueue).toHaveLength(1);
  expect(finalQueue[0].runId).toBe("run-new");
  expect(existsSync(oldArchivePath)).toBe(false);
});

// ── flushRetryQueue ──────────────────────────────────────────────────

test("flushRetryQueue: drains 2 pending entries using each entry's own stored key/url/run-id, removing both entries and their pending archive files on success", async () => {
  const dir = makeTempDir("agda-mcp-upload-flush-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const pendingDir = join(dir, "pending");
  mkdirSync(pendingDir, { recursive: true });

  const archive1 = join(pendingDir, "run-1.tar.gz");
  const archive2 = join(pendingDir, "run-2.tar.gz");
  writeFileSync(archive1, "x", "utf8");
  writeFileSync(archive2, "x", "utf8");

  await appendRetryQueueEntry(
    { ts: 1, runId: "run-1", archivePath: archive1, url: "http://one.invalid", key: "key-one", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );
  await appendRetryQueueEntry(
    { ts: 2, runId: "run-2", archivePath: archive2, url: "http://two.invalid", key: "key-two", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );

  const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
  const result = await flushRetryQueue({ queuePath, deps: { fetch: fetchFn } });

  expect(result).toEqual({ flushed: 2, remaining: 0 });
  expect(fetchFn).toHaveBeenCalledTimes(2);
  const [, firstOpts] = fetchFn.mock.calls[0] as [string, any];
  const [, secondOpts] = fetchFn.mock.calls[1] as [string, any];
  expect(firstOpts.headers.Authorization).toBe("Bearer key-one");
  expect(secondOpts.headers.Authorization).toBe("Bearer key-two");

  expect(readRetryQueue(queuePath)).toEqual([]);
  expect(existsSync(archive1)).toBe(false);
  expect(existsSync(archive2)).toBe(false);
});

test("flushRetryQueue: a failing entry is left in place and never blocks draining the rest", async () => {
  const dir = makeTempDir("agda-mcp-upload-flush-partial-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const pendingDir = join(dir, "pending");
  mkdirSync(pendingDir, { recursive: true });

  const archiveFail = join(pendingDir, "run-fail.tar.gz");
  const archiveOk = join(pendingDir, "run-ok.tar.gz");
  writeFileSync(archiveFail, "x", "utf8");
  writeFileSync(archiveOk, "x", "utf8");

  await appendRetryQueueEntry(
    { ts: 1, runId: "run-fail", archivePath: archiveFail, url: "http://x", key: "k1", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );
  await appendRetryQueueEntry(
    { ts: 2, runId: "run-ok", archivePath: archiveOk, url: "http://x", key: "k2", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );

  const fetchFn = vi.fn(async (_url: string, opts: any) => {
    if (opts.headers.Authorization === "Bearer k1") {
      return { ok: false, status: 500 };
    }
    return { ok: true, status: 200 };
  });

  const result = await flushRetryQueue({ queuePath, deps: { fetch: fetchFn } });

  expect(result).toEqual({ flushed: 1, remaining: 1 });
  const remainingQueue = readRetryQueue(queuePath);
  expect(remainingQueue).toHaveLength(1);
  expect(remainingQueue[0].runId).toBe("run-fail");
  expect(existsSync(archiveFail)).toBe(true);
  expect(existsSync(archiveOk)).toBe(false);
});

// ── WR-03: retry-queue TOCTOU race (advisory lock + reconciled flush) ──

test("appendRetryQueueEntry: two CONCURRENT appends to the same queue never clobber each other — both entries survive (WR-03, from-RED)", async () => {
  const dir = makeTempDir("agda-mcp-upload-race-append-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const pendingDir = join(dir, "pending");
  mkdirSync(pendingDir, { recursive: true });

  const archiveA = join(pendingDir, "run-a.tar.gz");
  const archiveB = join(pendingDir, "run-b.tar.gz");
  writeFileSync(archiveA, "x", "utf8");
  writeFileSync(archiveB, "x", "utf8");

  // Fired concurrently (no await between them) — pre-fix, both read the
  // SAME initial empty array, both mutate their own in-memory copy, and
  // whichever writeFileAtomic rename lands LAST silently wins, dropping
  // the other append's entry (and orphaning its pending archive file).
  await Promise.all([
    appendRetryQueueEntry(
      { ts: 1, runId: "run-a", archivePath: archiveA, url: "http://a.invalid", key: "key-a", bytes: 1 },
      { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
    ),
    appendRetryQueueEntry(
      { ts: 2, runId: "run-b", archivePath: archiveB, url: "http://b.invalid", key: "key-b", bytes: 1 },
      { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
    ),
  ]);

  const finalQueue = readRetryQueue(queuePath);
  expect(finalQueue).toHaveLength(2);
  expect(finalQueue.find((entry: any) => entry.runId === "run-a")).toBeDefined();
  expect(finalQueue.find((entry: any) => entry.runId === "run-b")).toBeDefined();
});

test("flushRetryQueue: an appendRetryQueueEntry call that lands WHILE a slow upload is in flight survives the flush's own write-back (WR-03, from-RED)", async () => {
  const dir = makeTempDir("agda-mcp-upload-race-flush-append-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const pendingDir = join(dir, "pending");
  mkdirSync(pendingDir, { recursive: true });

  const archiveSlow = join(pendingDir, "run-slow.tar.gz");
  const archiveLate = join(pendingDir, "run-late.tar.gz");
  writeFileSync(archiveSlow, "x", "utf8");
  writeFileSync(archiveLate, "x", "utf8");

  await appendRetryQueueEntry(
    { ts: 1, runId: "run-slow", archivePath: archiveSlow, url: "http://slow.invalid", key: "key-slow", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );

  let resolveUploadStarted: () => void = () => {};
  const uploadStarted = new Promise<void>((r) => {
    resolveUploadStarted = r;
  });
  let releaseUpload: () => void = () => {};
  const fetchFn = vi.fn(async () => {
    resolveUploadStarted();
    await new Promise<void>((r) => {
      releaseUpload = r;
    });
    return { ok: true, status: 200 };
  });

  // flushRetryQueue reads the queue (1 entry: run-slow) and starts its
  // (deliberately stalled) "network" upload.
  const flushPromise = flushRetryQueue({ queuePath, deps: { fetch: fetchFn } });
  await uploadStarted;

  // A completely independent append lands WHILE that upload is still in
  // flight — mirrors the review's own "a manual --retry-only flush
  // racing a live run's own failed-upload append" scenario.
  await appendRetryQueueEntry(
    { ts: 2, runId: "run-late", archivePath: archiveLate, url: "http://late.invalid", key: "key-late", bytes: 1 },
    { queuePath, pendingDir, maxCount: 20, maxBytes: Number.MAX_SAFE_INTEGER },
  );

  releaseUpload();
  const result = await flushPromise;

  expect(result.flushed).toBe(1);
  const finalQueue = readRetryQueue(queuePath);
  // run-slow was uploaded and removed by the flush; run-late — appended
  // DURING the flush's own network call — must still be present, never
  // clobbered by the flush's own write-back.
  expect(finalQueue.find((entry: any) => entry.runId === "run-slow")).toBeUndefined();
  expect(finalQueue.find((entry: any) => entry.runId === "run-late")).toBeDefined();
});

test("acquireRetryQueueLock: a stale lock file (older than staleMs) is reclaimed rather than blocking for the full timeout", async () => {
  const dir = makeTempDir("agda-mcp-upload-lock-stale-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const lockPath = `${queuePath}.lock`;
  writeFileSync(lockPath, "", "utf8");
  const old = new Date(Date.now() - 10_000);
  utimesSync(lockPath, old, old);

  const release = await acquireRetryQueueLock(queuePath, { timeoutMs: 2000, staleMs: 1000, pollIntervalMs: 10 });

  expect(release).not.toBeNull();
  expect(existsSync(lockPath)).toBe(true);
  release?.();
  expect(existsSync(lockPath)).toBe(false);
});

test("acquireRetryQueueLock: a reclaimed stale lock is written with a non-empty, per-attempt owner token — proves the new self-verifying reclaim path ran, not the plain unlink-then-recreate it replaces (WR-08)", async () => {
  // A TRUE two-OS-process race is not reproducible deterministically
  // inside a single Node process — every syscall this reclaim performs
  // (statSync/unlinkSync/openSync/writeFileSync/readFileSync) is
  // synchronous, so there is no scheduling point for a second
  // in-process "reclaimer" to interleave between them, and this
  // module's lock functions take no fs dependency-injection seam (the
  // real syscalls are the whole point — see the header comment).
  // Attempting to fake it by mutating the shared `node:fs` module
  // object fails outright in this project's ESM test environment
  // ("Module namespace is not configurable in ESM"). This test instead
  // asserts the OBSERVABLE difference the fix introduces: the pre-fix
  // reclaim (a plain unlinkSync that fell through to the NEXT loop
  // iteration's top-level openSync("wx")) always left an EMPTY lock
  // file behind, which is indistinguishable from "nobody is
  // self-verifying ownership." The new reclaim branch writes and reads
  // back a real, unique, PID-tagged owner token in the SAME step that
  // recreates the file — this proves that code path actually executed.
  const dir = makeTempDir("agda-mcp-upload-lock-stale-token-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const lockPath = `${queuePath}.lock`;
  writeFileSync(lockPath, "", "utf8");
  const old = new Date(Date.now() - 10_000);
  utimesSync(lockPath, old, old);

  const release = await acquireRetryQueueLock(queuePath, { timeoutMs: 2000, staleMs: 1000, pollIntervalMs: 10 });

  expect(release).not.toBeNull();
  const content = readFileSync(lockPath, "utf8");
  const expectedPrefix = `${process.pid}-`;
  expect(content.startsWith(expectedPrefix)).toBe(true);
  expect(content.length).toBeGreaterThan(expectedPrefix.length);

  release?.();
  expect(existsSync(lockPath)).toBe(false);
});

test("acquireRetryQueueLock: an unreleased, non-stale lock FAILS OPEN (returns null) within timeoutMs rather than blocking forever", async () => {
  const dir = makeTempDir("agda-mcp-upload-lock-timeout-");
  const queuePath = join(dir, "upload-queue.jsonl");
  const lockPath = `${queuePath}.lock`;
  // A fresh lock, well within staleMs — never reclaimed, and never
  // released by anyone else during this test.
  writeFileSync(lockPath, "", "utf8");

  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const release = await acquireRetryQueueLock(queuePath, { timeoutMs: 150, staleMs: 60_000, pollIntervalMs: 10 });
  expect(stderrSpy).toHaveBeenCalled();
  stderrSpy.mockRestore();

  expect(release).toBeNull();
});

// ── scriptMain ───────────────────────────────────────────────────────

test("scriptMain: a missing run-id positional prints usage and sets exitCode 1", async () => {
  const previousExitCode = process.exitCode;
  await scriptMain([]);
  expect(process.exitCode).toBe(1);
  process.exitCode = previousExitCode;
});

test("scriptMain: with a run-id but no key/url configured, still exits 0 (fail-open all the way to the process exit code)", async () => {
  const previousExitCode = process.exitCode;
  await withEnvOverride(
    { AGDA_MCP_TEAM_UPLOAD_KEY: undefined, AGDA_MCP_TEAM_UPLOAD_URL: undefined },
    async () => {
      await scriptMain(["some-run-id-that-does-not-exist"]);
    },
  );
  expect(process.exitCode).toBe(0);
  process.exitCode = previousExitCode;
});

test("scriptMain: --retry-only runs ONLY flushRetryQueue and exits 0 without requiring a run-id", async () => {
  const previousExitCode = process.exitCode;
  const queuePath = join(makeTempDir("agda-mcp-upload-retry-only-"), "upload-queue.jsonl");
  await withEnvOverride({ AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH: queuePath }, async () => {
    await scriptMain(["--retry-only"]);
  });
  expect(process.exitCode).toBe(0);
  process.exitCode = previousExitCode;
});
