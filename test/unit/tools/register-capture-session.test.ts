// MIT License — see LICENSE
//
// Tests for the capstone `agda_capture_session` MCP tool
// (CAP-01..CAP-05). Asserts the tool is state-agnostic (D-01:
// callable with zero prior interaction), returns a lightweight
// `CaptureReference` rather than the full `CaptureArtifact` (D-09/P2),
// routes CAP-02 dedup correctly on a first-time capture, always
// threads the underlying session's load/typecheck verdict into the
// reference (D-10 guardrail) even when no load ever occurred, and
// wires the CAP-04 recorded action log + CAP-05 oracle substrate into
// one full-fidelity artifact with D-02/D-06-mandated warning
// diagnostics when that substrate is missing.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AgdaSession } from "../../../src/agda-process.js";
import { classifyAgdaError } from "../../../src/agda/agent-ux.js";
import { registerCaptureSession } from "../../../src/tools/register-capture-session.js";
import { getServerVersion } from "../../../src/server-version.js";
import {
  drainRecordedActions,
  resetRecordedActions,
} from "../../../src/agda/session-capture/recorded-transport.js";
import { clearToolManifest } from "../../../src/tools/manifest.js";
import { registerStructuredTool } from "../../../src/tools/tool-registration.js";
import {
  makeToolResult,
  okEnvelope,
} from "../../../src/tools/tool-envelope.js";

function makeCapturingServer() {
  const registrations = new Map<string, { callback: (args: any) => any }>();
  return {
    registerTool(name: string, _spec: unknown, callback: (args: any) => any) {
      registrations.set(name, { callback });
    },
    get(name: string) {
      return registrations.get(name);
    },
  };
}

// WR-12: every test below gets its own throwaway repoRoot via
// makeTempDir() rather than the shared, tracked test/fixtures/agda/
// tree — this file never calls session.load(), so no real .agda
// fixture content is needed, only a valid-looking directory path.
// Mirrors team-issue-key.test.ts's exact tempDirs/makeTempDir/afterEach
// shape.
let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

let originalCaptureEnv: string | undefined;

beforeEach(() => {
  originalCaptureEnv = process.env.AGDA_MCP_CAPTURE;
  delete process.env.AGDA_MCP_CAPTURE;
  resetRecordedActions();
});

afterEach(() => {
  if (originalCaptureEnv !== undefined) {
    process.env.AGDA_MCP_CAPTURE = originalCaptureEnv;
  } else {
    delete process.env.AGDA_MCP_CAPTURE;
  }
  resetRecordedActions();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

test("agda_capture_session is state-agnostic, returns a reference (not the artifact), routes new-bug dedup, and warns when recording/expectedSignature are absent", async () => {
  const server = makeCapturingServer();
  const repoRoot = makeTempDir("agda-mcp-capture-session-");
  // State-agnostic per D-01: constructed but never loaded/sent a
  // command — capture must still work with zero prior interaction.
  const session = new AgdaSession(repoRoot);

  try {
    registerCaptureSession(
      server as unknown as McpServer,
      session,
      repoRoot,
    );

    // AGDA_MCP_CAPTURE unset (beforeEach) and no expectedSignature —
    // both warning diagnostics should fire.
    const result = await server.get("agda_capture_session")!.callback({});

    expect(result.structuredContent.ok).toBe(true);

    const data = result.structuredContent.data;
    expect(Object.keys(data).sort()).toEqual(
      [
        "fingerprint",
        "keyDiagnostics",
        "kind",
        "nextAction",
        "recurrence",
        "sessionClassification",
        "stagedPath",
        "summary",
      ].sort(),
    );
    // Proves it is a reference, not the payload (P2/D-09) — the heavy
    // fields must never leak into the returned data.
    expect(data).not.toHaveProperty("manifest");
    expect(data).not.toHaveProperty("recordedActions");

    // First-time capture (empty/absent dedup index) routes new-bug/1.
    expect(data.kind).toBe("new-bug");
    expect(data.recurrence).toBe(1);

    // D-10 guardrail: the reference must still surface the session
    // verdict field even when it is null (no load ever occurred), and
    // that field must survive this plan's extensions unchanged.
    expect(data.sessionClassification).toBeNull();
    expect(Object.keys(data)).toContain("sessionClassification");

    const diagnosticCodes = result.structuredContent.diagnostics.map(
      (d: { code?: string }) => d.code,
    );
    expect(diagnosticCodes).toContain("capture-recording-disabled");
    expect(diagnosticCodes).toContain("capture-no-expected-signature");
    expect(data.keyDiagnostics.length).toBe(2);

    // The full artifact is staged as real JSON on disk.
    expect(existsSync(data.stagedPath)).toBe(true);
    const staged = JSON.parse(readFileSync(data.stagedPath, "utf8"));
    expect(staged.manifest.serverVersion).toBe(getServerVersion());
    expect(staged.recordedActions).toEqual([]);
    // QUEUE-03/D-10: no load-family action ever recorded an error (no
    // recorded actions at all in this zero-interaction session), so
    // triage must be explicit null, never omitted.
    expect(staged.triage).toBeNull();
  } finally {
    await session.destroy();
  }
});

test("agda_capture_session drains real recorded actions when AGDA_MCP_CAPTURE=1 and carries no recording-disabled warning", async () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  clearToolManifest();

  const server = makeCapturingServer();
  const repoRoot = makeTempDir("agda-mcp-capture-session-");
  const session = new AgdaSession(repoRoot);

  try {
    // Register a couple of other tools through the same
    // registerStructuredTool boundary that feeds the CAP-04 recorder,
    // then call them so the ring buffer has real entries before
    // capture drains it.
    registerStructuredTool({
      server: server as unknown as McpServer,
      name: "prior_tool_one",
      description: "test",
      category: "analysis",
      outputDataSchema: z.object({}),
      callback: async () =>
        makeToolResult(
          okEnvelope({ tool: "prior_tool_one", summary: "ok", data: {} }),
        ),
    });
    registerStructuredTool({
      server: server as unknown as McpServer,
      name: "prior_tool_two",
      description: "test",
      category: "analysis",
      outputDataSchema: z.object({}),
      callback: async () =>
        makeToolResult(
          okEnvelope({ tool: "prior_tool_two", summary: "ok", data: {} }),
        ),
    });

    await server.get("prior_tool_one")!.callback({});
    await server.get("prior_tool_two")!.callback({});

    registerCaptureSession(
      server as unknown as McpServer,
      session,
      repoRoot,
    );

    const result = await server.get("agda_capture_session")!.callback({
      expectedSignature: "id : {A : Set} -> A -> A",
    });

    expect(result.structuredContent.ok).toBe(true);
    const data = result.structuredContent.data;

    const diagnosticCodes = result.structuredContent.diagnostics.map(
      (d: { code?: string }) => d.code,
    );
    expect(diagnosticCodes).not.toContain("capture-recording-disabled");
    expect(diagnosticCodes).not.toContain("capture-no-expected-signature");

    const staged = JSON.parse(readFileSync(data.stagedPath, "utf8"));
    expect(staged.recordedActions.length).toBeGreaterThan(0);
    const toolNames = staged.recordedActions.map(
      (a: { tool: string }) => a.tool,
    );
    expect(toolNames).toContain("prior_tool_one");
    expect(toolNames).toContain("prior_tool_two");

    // D-10 guardrail still holds across this test's env/expectedSignature path.
    expect(Object.keys(data)).toContain("sessionClassification");
  } finally {
    await session.destroy();
  }
});

test("agda_capture_session embeds a real triage classification from the last load-family action's error text", async () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  clearToolManifest();

  const server = makeCapturingServer();
  const repoRoot = makeTempDir("agda-mcp-capture-session-");
  const session = new AgdaSession(repoRoot);

  try {
    const errorText = "Parse error: could not parse the expression";

    // A fake `agda_load` call - real load-family tool name, recorded
    // through the SAME registerStructuredTool boundary CAP-04 feeds -
    // carrying a deterministic, classifier-matching error string.
    registerStructuredTool({
      server: server as unknown as McpServer,
      name: "agda_load",
      description: "test",
      category: "analysis",
      outputDataSchema: z.object({
        errors: z.array(z.string()),
        success: z.boolean(),
      }),
      callback: async () =>
        makeToolResult(
          okEnvelope({
            tool: "agda_load",
            summary: "type-error",
            classification: "type-error",
            data: { errors: [errorText], success: false },
          }),
        ),
    });

    await server.get("agda_load")!.callback({});

    registerCaptureSession(
      server as unknown as McpServer,
      session,
      repoRoot,
    );

    const result = await server.get("agda_capture_session")!.callback({});
    expect(result.structuredContent.ok).toBe(true);

    const data = result.structuredContent.data;
    const staged = JSON.parse(readFileSync(data.stagedPath, "utf8"));

    // Never a hardcoded expected number/category - call the real
    // classifier once to derive the expected value.
    const expectedTriage = classifyAgdaError(errorText);
    expect(staged.triage.category).toBe(expectedTriage.category);
    expect(staged.triage.confidence).toBe(expectedTriage.confidence);
  } finally {
    await session.destroy();
  }
});

test("agda_capture_session never collides on stagedPath for two same-session, same-fingerprint captures (closes 01-VERIFICATION.md CR-03 BLOCKER)", async () => {
  clearToolManifest();

  const server = makeCapturingServer();
  const repoRoot = makeTempDir("agda-mcp-capture-session-");
  const session = new AgdaSession(repoRoot);

  try {
    registerCaptureSession(
      server as unknown as McpServer,
      session,
      repoRoot,
    );

    // No `note` on either call - both calls share the identical
    // fingerprint/recurrence (new-bug/1), exactly CR-03's repro shape:
    // two "ok-complete"-classified captures in the same session.
    const result1 = await server.get("agda_capture_session")!.callback({});
    // A zero-interaction session's two capture calls can otherwise
    // complete within the same millisecond, making `capturedAt`
    // ambiguous evidence of independent writes even when the
    // underlying files are genuinely distinct - force a tick so the
    // capturedAt-divergence assertion below is deterministic rather
    // than timing-flaky.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result2 = await server.get("agda_capture_session")!.callback({});

    const data1 = result1.structuredContent.data;
    const data2 = result2.structuredContent.data;

    expect(data1.kind).toBe("new-bug");
    expect(data1.recurrence).toBe(1);
    expect(data2.kind).toBe("new-bug");
    expect(data2.recurrence).toBe(1);

    // The fix under test: two captures sharing the identical
    // fingerprint/recurrence pair must still produce structurally
    // distinct staged paths.
    expect(data1.stagedPath).not.toBe(data2.stagedPath);
    expect(existsSync(data1.stagedPath)).toBe(true);
    expect(existsSync(data2.stagedPath)).toBe(true);

    // WR-03: the staged filename carries a cross-process-unique UUID
    // component, so two SEPARATE server processes (each with a counter
    // freshly reset to 0) cannot clobber one another across restarts.
    const uuidJson = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/u;
    expect(data1.stagedPath).toMatch(uuidJson);
    expect(data2.stagedPath).toMatch(uuidJson);

    // Proves the first artifact survived on disk (not just that a
    // file exists at both paths) - the second capture must not have
    // silently overwritten the first's data.
    const staged1 = JSON.parse(readFileSync(data1.stagedPath, "utf8"));
    const staged2 = JSON.parse(readFileSync(data2.stagedPath, "utf8"));
    expect(staged1.capturedAt).not.toBe(staged2.capturedAt);
  } finally {
    await session.destroy();
  }
});

test("agda_capture_session leaves the recorded-action buffer intact when the staged write never succeeds (WR-01 durability)", async () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  clearToolManifest();

  const server = makeCapturingServer();
  const repoRoot = makeTempDir("agda-mcp-capture-session-");
  const session = new AgdaSession(repoRoot);
  const blockedPath = join(repoRoot, ".agda-mcp");

  try {
    // Belt-and-suspenders: repoRoot is now a fresh per-test temp dir
    // (WR-12), so blockedPath cannot already exist as a populated
    // directory the way the shared fixture root once could - but this
    // cleanup stays harmless (rmSync with force:true no-ops on an
    // absent path) and keeps this test's control flow unchanged.
    rmSync(blockedPath, { recursive: true, force: true });
    // Pre-create .agda-mcp as a plain FILE (not a directory) so the
    // callback's mkdirSync(captureDir, { recursive: true }) throws
    // before writeFileAtomic ever runs.
    writeFileSync(blockedPath, "blocking-file", "utf8");

    registerStructuredTool({
      server: server as unknown as McpServer,
      name: "prior_tool_wr01",
      description: "test",
      category: "analysis",
      outputDataSchema: z.object({}),
      callback: async () =>
        makeToolResult(
          okEnvelope({ tool: "prior_tool_wr01", summary: "ok", data: {} }),
        ),
    });
    await server.get("prior_tool_wr01")!.callback({});

    registerCaptureSession(
      server as unknown as McpServer,
      session,
      repoRoot,
    );

    const result = await server.get("agda_capture_session")!.callback({});
    expect(result.structuredContent.ok).toBe(false);

    // The fix under test: a write failure that happens before
    // writeFileAtomic ever runs must leave the drained action log
    // intact for a retry, not silently discard it.
    const { actions } = drainRecordedActions();
    const toolNames = actions.map((a: { tool: string }) => a.tool);
    expect(toolNames).toContain("prior_tool_wr01");
  } finally {
    rmSync(blockedPath, { recursive: true, force: true });
    await session.destroy();
  }
});

test("agda_capture_session still resets the recorded-action buffer after a successful write (WR-01 happy path)", async () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  clearToolManifest();

  const server = makeCapturingServer();
  const repoRoot = makeTempDir("agda-mcp-capture-session-");
  const session = new AgdaSession(repoRoot);

  try {
    registerStructuredTool({
      server: server as unknown as McpServer,
      name: "prior_tool_wr01_happy",
      description: "test",
      category: "analysis",
      outputDataSchema: z.object({}),
      callback: async () =>
        makeToolResult(
          okEnvelope({
            tool: "prior_tool_wr01_happy",
            summary: "ok",
            data: {},
          }),
        ),
    });
    await server.get("prior_tool_wr01_happy")!.callback({});

    registerCaptureSession(
      server as unknown as McpServer,
      session,
      repoRoot,
    );

    const result = await server.get("agda_capture_session")!.callback({});
    expect(result.structuredContent.ok).toBe(true);

    // The prior action was genuinely captured into the artifact (this
    // is not a vacuous pass caused by an early return).
    const data = result.structuredContent.data;
    const staged = JSON.parse(readFileSync(data.stagedPath, "utf8"));
    const stagedToolNames = staged.recordedActions.map(
      (a: { tool: string }) => a.tool,
    );
    expect(stagedToolNames).toContain("prior_tool_wr01_happy");

    // Proves the fix does not simply stop resetting — a successful
    // capture still clears the pre-capture actions from the LIVE
    // buffer afterward. (The buffer is not asserted empty here: the
    // registerStructuredTool wrapper unconditionally records every
    // tool's own invocation — including agda_capture_session itself —
    // immediately after its callback resolves, so one fresh entry for
    // this very call is expected and correct, not a leftover.)
    const { actions } = drainRecordedActions();
    const toolNames = actions.map((a: { tool: string }) => a.tool);
    expect(toolNames).not.toContain("prior_tool_wr01_happy");
  } finally {
    await session.destroy();
  }
});
