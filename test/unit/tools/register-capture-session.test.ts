// MIT License — see LICENSE
//
// RED test for the walking-skeleton `agda_capture_session` MCP tool
// (CAP-03). Asserts the tool is state-agnostic (D-01: callable with
// zero prior interaction), returns a lightweight `CaptureReference`
// rather than the full `CaptureArtifact` (D-09/P2), routes CAP-02
// dedup correctly on a first-time capture, and always threads the
// underlying session's load/typecheck verdict into the reference
// (D-10 guardrail) even when no load ever occurred.

import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

import { test, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { AgdaSession } from "../../../src/agda-process.js";
import { registerCaptureSession } from "../../../src/tools/register-capture-session.js";
import { getServerVersion } from "../../../src/server-version.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../helpers/repo-root.js";

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

test("agda_capture_session is state-agnostic, returns a reference (not the artifact), and routes new-bug dedup", async () => {
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
    // verdict field even when it is null (no load ever occurred).
    expect(data.sessionClassification).toBeNull();

    // The full artifact is staged as real JSON on disk.
    expect(existsSync(data.stagedPath)).toBe(true);
    const staged = JSON.parse(readFileSync(data.stagedPath, "utf8"));
    expect(staged.manifest.serverVersion).toBe(getServerVersion());
  } finally {
    await session.destroy();
  }
});
