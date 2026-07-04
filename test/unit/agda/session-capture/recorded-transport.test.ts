// MIT License — see LICENSE
//
// Pin CAP-04's bounded ring-buffer recorder: gated by
// AGDA_MCP_CAPTURE=1 (zero-cost no-op otherwise), drop-newest-once-
// full (earliest actions of a long dogfooding session survive, per
// D-05/D-06), read-only drain (only resetRecordedActions/
// commitDrainedActions clear).

import { test, expect, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  recordAction,
  drainRecordedActions,
  resetRecordedActions,
  commitDrainedActions,
  MAX_RECORDED_ACTIONS,
  type RecordedActionCapacityOverride,
} from "../../../../src/agda/session-capture/recorded-transport.js";
import { clearToolManifest } from "../../../../src/tools/manifest.js";
import { registerStructuredTool } from "../../../../src/tools/tool-registration.js";
import { makeToolResult, okEnvelope } from "../../../../src/tools/tool-envelope.js";

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

let originalEnv: string | undefined;

beforeEach(() => {
  originalEnv = process.env.AGDA_MCP_CAPTURE;
  delete process.env.AGDA_MCP_CAPTURE;
  resetRecordedActions();
});

afterEach(() => {
  if (originalEnv !== undefined) process.env.AGDA_MCP_CAPTURE = originalEnv;
  else delete process.env.AGDA_MCP_CAPTURE;
  resetRecordedActions();
});

// ── Disabled by default (zero-cost no-op) ────────────────────────────

test("recordAction is a no-op when AGDA_MCP_CAPTURE is unset", () => {
  for (let i = 0; i < 5; i++) {
    recordAction({
      tool: "agda_load",
      args: { file: `Foo${i}.agda` },
      timestamp: Date.now(),
      normalizedResponse: undefined,
    });
  }
  const drained = drainRecordedActions();
  expect(drained.actions).toEqual([]);
  expect(drained.truncated).toBe(false);
  expect(drained.droppedCount).toBe(0);
});

// ── Enabled: ordered recording ────────────────────────────────────────

test("recordAction records entries in order when AGDA_MCP_CAPTURE=1", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  const entries = [
    { tool: "agda_load", args: { file: "A.agda" }, timestamp: 1, normalizedResponse: { ok: true } },
    { tool: "agda_goal_type", args: { goalId: 0 }, timestamp: 2, normalizedResponse: { ok: true } },
    { tool: "agda_give", args: { goalId: 0, expr: "refl" }, timestamp: 3, normalizedResponse: { ok: false } },
  ];
  for (const entry of entries) recordAction(entry);

  const drained = drainRecordedActions();
  expect(drained.actions).toEqual(entries);
  expect(drained.truncated).toBe(false);
  expect(drained.droppedCount).toBe(0);
});

// ── Enabled: drop-newest-once-full truncation policy ──────────────────

test("drops newest actions once at capacity, preserving the earliest ones", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  const capacity = 5;
  const override: RecordedActionCapacityOverride = { capacity };
  const total = capacity + 5;
  for (let i = 0; i < total; i++) {
    recordAction(
      {
        tool: "agda_load",
        args: { seq: i },
        timestamp: i,
        normalizedResponse: undefined,
      },
      override,
    );
  }

  const drained = drainRecordedActions();
  expect(drained.actions).toHaveLength(capacity);
  // The FIRST `capacity` actions (seq 0..capacity-1) must survive —
  // drop-newest, not drop-oldest.
  expect(drained.actions.map((a) => a.args.seq)).toEqual([0, 1, 2, 3, 4]);
  expect(drained.truncated).toBe(true);
  expect(drained.droppedCount).toBe(5);
});

test("MAX_RECORDED_ACTIONS is generously sized for a realistic dogfooding session", () => {
  expect(MAX_RECORDED_ACTIONS).toBe(2000);
});

// ── resetRecordedActions ───────────────────────────────────────────────

test("resetRecordedActions clears the buffer, truncated flag, and dropped count", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  const override: RecordedActionCapacityOverride = { capacity: 2 };
  for (let i = 0; i < 5; i++) {
    recordAction(
      { tool: "agda_load", args: { seq: i }, timestamp: i, normalizedResponse: undefined },
      override,
    );
  }
  expect(drainRecordedActions().truncated).toBe(true);

  resetRecordedActions();

  const drained = drainRecordedActions();
  expect(drained.actions).toEqual([]);
  expect(drained.truncated).toBe(false);
  expect(drained.droppedCount).toBe(0);
});

// ── drainRecordedActions is read-only ──────────────────────────────────

test("drainRecordedActions does not clear the buffer — calling it twice returns the same contents", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  recordAction({ tool: "agda_load", args: { file: "A.agda" }, timestamp: 1, normalizedResponse: undefined });
  recordAction({ tool: "agda_goal_type", args: { goalId: 0 }, timestamp: 2, normalizedResponse: undefined });

  const first = drainRecordedActions();
  const second = drainRecordedActions();
  expect(first).toEqual(second);
  expect(second.actions).toHaveLength(2);
});

// ── commitDrainedActions (WR-01 concurrent-drop fix) ────────────────────

test("commitDrainedActions removes only the drained prefix, preserving an action recorded after the drain", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  recordAction({ tool: "A", args: {}, timestamp: 1, normalizedResponse: undefined });

  // Non-destructive snapshot — exactly what a capture's drain call sees.
  const { actions } = drainRecordedActions();
  expect(actions.map((a) => a.tool)).toEqual(["A"]);

  // Simulate a second, concurrently in-flight tool call landing in the
  // buffer AFTER the snapshot above but BEFORE the commit below — the
  // exact WR-01 race window (a capture's own async write pipeline).
  recordAction({ tool: "B", args: {}, timestamp: 2, normalizedResponse: undefined });

  // On pre-fix code (a blanket `buffer = []`), this would silently
  // discard "B" along with "A". The fix commits only what was drained.
  commitDrainedActions(actions.length);

  const remaining = drainRecordedActions();
  expect(remaining.actions.map((a) => a.tool)).toEqual(["B"]);
});

test("commitDrainedActions clears the whole buffer when nothing was recorded concurrently", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  recordAction({ tool: "A", args: {}, timestamp: 1, normalizedResponse: undefined });
  const { actions } = drainRecordedActions();

  commitDrainedActions(actions.length);

  const drained = drainRecordedActions();
  expect(drained.actions).toEqual([]);
});

test("commitDrainedActions only resets truncated/droppedCount once the buffer is genuinely empty afterward", () => {
  process.env.AGDA_MCP_CAPTURE = "1";
  const override: RecordedActionCapacityOverride = { capacity: 2 };
  for (let i = 0; i < 4; i++) {
    recordAction(
      { tool: "agda_load", args: { seq: i }, timestamp: i, normalizedResponse: undefined },
      override,
    );
  }
  const { actions, truncated } = drainRecordedActions();
  expect(truncated).toBe(true);

  // A concurrently-recorded action survives the commit below (capacity
  // override does not apply to this call — plenty of room left in the
  // real MAX_RECORDED_ACTIONS-sized buffer).
  recordAction({ tool: "concurrent", args: {}, timestamp: 99, normalizedResponse: undefined });

  commitDrainedActions(actions.length);

  // The buffer still holds the concurrently-recorded action, so the
  // still-truncated window's flag/count must NOT be cleared yet.
  const drained = drainRecordedActions();
  expect(drained.actions.map((a) => a.tool)).toEqual(["concurrent"]);
  expect(drained.truncated).toBe(true);
  expect(drained.droppedCount).toBeGreaterThan(0);
});

// ── Hooked into registerStructuredTool's timedCallback ─────────────────

test("every registerStructuredTool call feeds the recorder when AGDA_MCP_CAPTURE=1", async () => {
  resetRecordedActions();
  process.env.AGDA_MCP_CAPTURE = "1";
  clearToolManifest();
  const server = makeCapturingServer();
  registerStructuredTool({
    server: server as unknown as McpServer,
    name: "test_tool",
    description: "test",
    category: "analysis",
    outputDataSchema: z.object({}),
    callback: async () =>
      makeToolResult(
        okEnvelope({ tool: "test_tool", summary: "ok", data: {} }),
      ),
  });

  await server.get("test_tool")!.callback({ exampleArg: 1 });
  await server.get("test_tool")!.callback({ exampleArg: 1 });

  const drained = drainRecordedActions();
  expect(drained.actions).toHaveLength(2);
  for (const action of drained.actions) {
    expect(action.tool).toBe("test_tool");
    expect(action.args).toEqual({ exampleArg: 1 });
  }
  resetRecordedActions();
});
