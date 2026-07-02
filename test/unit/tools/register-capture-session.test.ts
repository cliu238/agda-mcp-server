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

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

import { test, expect, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AgdaSession } from "../../../src/agda-process.js";
import { registerCaptureSession } from "../../../src/tools/register-capture-session.js";
import { getServerVersion } from "../../../src/server-version.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";
import { resetRecordedActions } from "../../../src/agda/session-capture/recorded-transport.js";
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
});

test("agda_capture_session is state-agnostic, returns a reference (not the artifact), routes new-bug dedup, and warns when recording/expectedSignature are absent", async () => {
  const server = makeCapturingServer();
  // State-agnostic per D-01: constructed but never loaded/sent a
  // command — capture must still work with zero prior interaction.
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    registerCaptureSession(
      server as unknown as McpServer,
      session,
      TEST_FIXTURE_PROJECT_ROOT,
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
  } finally {
    await session.destroy();
  }
});

test("agda_capture_session drains real recorded actions when AGDA_MCP_CAPTURE=1 and carries no recording-disabled warning", async () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  clearToolManifest();

  const server = makeCapturingServer();
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

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
      TEST_FIXTURE_PROJECT_ROOT,
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
