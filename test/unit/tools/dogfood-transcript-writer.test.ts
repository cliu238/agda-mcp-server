// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/transcript-writer.mjs: Plan 05-02's
// run-recorder interface. Covers the pending-request/response
// correlation (createRunRecorder), the transcript's on-disk NDJSON
// shape, the pure markdown renderer, and resolveRunsRoot's env-var
// override. Mirrors test/unit/tools/queue-intake.test.ts's tmpdir-per-
// test + afterEach cleanup shape — never writes into a real repo path.

import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { createRunRecorder, renderRunReportMarkdown, resolveRunsRoot } from "../../../scripts/dogfood/transcript-writer.mjs";
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

const REQUEST_LINE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "agda_capture_session", arguments: {} },
});
const RESPONSE_LINE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: {
    structuredContent: {
      data: { stagedPath: "/tmp/x.json", fingerprint: "abc", kind: "new-bug", recurrence: 1 },
    },
  },
});

// ── Behavior 1: correlated capture-session request/response ─────────

test("recordToClientLine correlates a capture-session request/response and stages the capture", () => {
  const dir = makeTempDir("agda-mcp-dogfood-transcript-");
  const transcriptPath = join(dir, "transcript.jsonl");
  const recorder = createRunRecorder({ transcriptPath });

  recorder.recordToServerLine(REQUEST_LINE);
  const event = recorder.recordToClientLine(RESPONSE_LINE);

  expect(event).toEqual({
    toolName: "agda_capture_session",
    isCaptureSession: true,
    elapsedMs: expect.any(Number),
    stagedCapture: { stagedPath: "/tmp/x.json", fingerprint: "abc", kind: "new-bug", recurrence: 1 },
  });

  const report = recorder.getReport({
    runId: "r1",
    startedAt: new Date().toISOString(),
    corpusRoot: "/tmp/corpus",
    manifestPath: "/tmp/manifest.json",
  });
  expect(report.stagedCaptures).toHaveLength(1);
  expect(report.stagedCaptures[0].stagedPath).toBe("/tmp/x.json");
});

// ── Behavior 1b: a FAILED capture-session response stages nothing and returns stagedCapture null ──

test("recordToClientLine returns stagedCapture null for a failed capture-session response and never re-stages the previous capture", () => {
  const dir = makeTempDir("agda-mcp-dogfood-transcript-");
  const transcriptPath = join(dir, "transcript.jsonl");
  const recorder = createRunRecorder({ transcriptPath });

  // First: a successful capture.
  recorder.recordToServerLine(REQUEST_LINE);
  const first = recorder.recordToClientLine(RESPONSE_LINE);
  expect(first?.stagedCapture?.stagedPath).toBe("/tmp/x.json");

  // Then: a FAILED capture call — its error envelope's data carries no stagedPath.
  recorder.recordToServerLine(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "agda_capture_session", arguments: {} },
    }),
  );
  const second = recorder.recordToClientLine(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      result: { isError: true, structuredContent: { ok: false, data: {} } },
    }),
  );

  expect(second?.isCaptureSession).toBe(true);
  expect(second?.stagedCapture).toBeNull();
  // Only the first capture is staged — the failed one must not surface
  // the previous capture again (the at(-1) re-promotion hazard).
  expect(recorder.stagedCaptures).toHaveLength(1);
});

// ── Behavior 2: a non-capture-session tool tallies but never stages ──

test("recordToClientLine tallies a non-capture-session tool without staging a capture", () => {
  const dir = makeTempDir("agda-mcp-dogfood-transcript-");
  const transcriptPath = join(dir, "transcript.jsonl");
  const recorder = createRunRecorder({ transcriptPath });

  const requestLine = JSON.stringify({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "agda_tools_catalog", arguments: {} },
  });
  const responseLine = JSON.stringify({
    jsonrpc: "2.0",
    id: 7,
    result: { structuredContent: { data: { tools: [] } } },
  });

  recorder.recordToServerLine(requestLine);
  const event = recorder.recordToClientLine(responseLine);

  expect(event?.toolName).toBe("agda_tools_catalog");
  expect(event?.isCaptureSession).toBe(false);

  const report = recorder.getReport({
    runId: "r1",
    startedAt: new Date().toISOString(),
    corpusRoot: "/tmp/corpus",
    manifestPath: "/tmp/manifest.json",
  });
  expect(report.perTool["agda_tools_catalog"].count).toBe(1);
  expect(report.stagedCaptures).toHaveLength(0);
});

// ── Behavior 3: an unmatched response id never throws ────────────────

test("recordToClientLine on an unmatched response id is recorded but does not throw or affect tallies", () => {
  const dir = makeTempDir("agda-mcp-dogfood-transcript-");
  const transcriptPath = join(dir, "transcript.jsonl");
  const recorder = createRunRecorder({ transcriptPath });

  const orphanResponse = JSON.stringify({ jsonrpc: "2.0", id: 999, result: {} });

  expect(() => recorder.recordToClientLine(orphanResponse)).not.toThrow();
  const event = recorder.recordToClientLine(orphanResponse);
  expect(event).toBeUndefined();

  const report = recorder.getReport({
    runId: "r1",
    startedAt: new Date().toISOString(),
    corpusRoot: "/tmp/corpus",
    manifestPath: "/tmp/manifest.json",
  });
  expect(Object.keys(report.perTool)).toHaveLength(0);
  expect(report.stagedCaptures).toHaveLength(0);

  const transcriptContent = readFileSync(transcriptPath, "utf8");
  expect(transcriptContent.trim().split("\n")).toHaveLength(2);
});

// ── Behavior 3b: a server-initiated request never consumes a pending id ──

test("recordToClientLine ignores a server-initiated request whose id collides with a pending tools/call, so the real response still correlates", () => {
  const dir = makeTempDir("agda-mcp-dogfood-transcript-");
  const transcriptPath = join(dir, "transcript.jsonl");
  const recorder = createRunRecorder({ transcriptPath });

  recorder.recordToServerLine(REQUEST_LINE); // pending id 1

  // A server-initiated request (carries BOTH method and id) whose id
  // numerically collides with the pending agent request id — JSON-RPC
  // ids are per-direction namespaces, so this is legal on the wire.
  const serverInitiatedRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "sampling/createMessage",
    params: {},
  });
  expect(recorder.recordToClientLine(serverInitiatedRequest)).toBeUndefined();

  // The REAL response afterwards must still correlate and stage the capture.
  const event = recorder.recordToClientLine(RESPONSE_LINE);
  expect(event?.toolName).toBe("agda_capture_session");
  expect(event?.stagedCapture?.stagedPath).toBe("/tmp/x.json");
  expect(recorder.stagedCaptures).toHaveLength(1);
});

// ── Behavior 4: on-disk transcript shape ──────────────────────────────

test("the transcript file on disk contains one newline-delimited JSON line per recorded line, each with direction + numeric ts", () => {
  const dir = makeTempDir("agda-mcp-dogfood-transcript-");
  const transcriptPath = join(dir, "transcript.jsonl");
  const recorder = createRunRecorder({ transcriptPath });

  recorder.recordToServerLine(REQUEST_LINE);
  recorder.recordToClientLine(RESPONSE_LINE);

  const rawLines = readFileSync(transcriptPath, "utf8").trim().split("\n");
  expect(rawLines).toHaveLength(2);

  const parsedLines = rawLines.map((line) => JSON.parse(line));
  expect(parsedLines[0].direction).toBe("to-server");
  expect(parsedLines[1].direction).toBe("to-client");
  for (const line of parsedLines) {
    expect(typeof line.ts).toBe("number");
  }
});

// ── Behavior 5: renderRunReportMarkdown ───────────────────────────────

test("renderRunReportMarkdown includes the tool name, its count, and the staged fingerprint", () => {
  const report = {
    schemaVersion: 1,
    runId: "r1",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    corpusRoot: "/tmp/corpus",
    manifestPath: "/tmp/manifest.json",
    totalToolCalls: 1,
    perTool: { agda_capture_session: { count: 1, totalElapsedMs: 42 } },
    stagedCaptures: [{ stagedPath: "/tmp/x.json", fingerprint: "abc123", kind: "new-bug", recurrence: 1 }],
    transcriptPath: "/tmp/corpus/transcript.jsonl",
  };

  const markdown = renderRunReportMarkdown(report);

  expect(markdown).toContain("agda_capture_session");
  expect(markdown).toContain("1");
  expect(markdown).toContain("abc123");
});

// ── Behavior 6: resolveRunsRoot ────────────────────────────────────────

test("resolveRunsRoot defaults to <SERVER_REPO_ROOT>/.agda-mcp/runs and honors AGDA_MCP_DOGFOOD_RUNS_ROOT verbatim", () => {
  const prior = process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT;
  try {
    delete process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT;
    expect(resolveRunsRoot()).toBe(join(SERVER_REPO_ROOT, ".agda-mcp", "runs"));

    process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT = "/tmp/some-custom-runs-root";
    expect(resolveRunsRoot()).toBe("/tmp/some-custom-runs-root");
  } finally {
    if (prior === undefined) {
      delete process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT;
    } else {
      process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT = prior;
    }
  }
});
