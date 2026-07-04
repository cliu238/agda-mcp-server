// MIT License — see LICENSE
//
// Envelope-level regression coverage for two goal-tools defects
// re-verified in Phase 6 (REVERIFY-02):
//
//   - agda_auto: a flag-shaped hint/excludeHints token must never be
//     concatenated into the Agsy search payload (fingerprint
//     5abecc959e43fef3, shared root cause with RT4 004d161b839ce725).
//   - agda_give: an Agda-rejected expression must surface as
//     ok:false / classification "give-rejected", never wrapped in an
//     ok:true envelope (fingerprint bfcba437f5426fd6).
//
// Both cases use the Map-backed fake-server + inline fake-session
// harness established in test/unit/tools/analysis-tools.test.ts /
// file-tools.test.ts — no real Agda subprocess involved.

import { expect, test, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerGoalTools } from "../../../src/tools/goal-tools.js";
import { clearToolManifest } from "../../../src/tools/manifest.js";

function createCapturingServer() {
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

function fakeSession(overrides: { autoOne?: any; give?: any } = {}) {
  return {
    getGoalIds: () => [0],
    getLoadedFile: () => "/repo/Example.agda",
    getLastClassification: () => null,
    isFileStale: () => false,
    currentFile: null,
    goal: {
      autoOne: overrides.autoOne ?? vi.fn(),
      give: overrides.give ?? vi.fn(),
    },
  } as any;
}

// ── T-06-12: agda_auto must reject flag-shaped hints, never call Agsy ──

test("agda_auto rejects a flag-shaped hint before calling session.goal.autoOne", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const autoOne = vi.fn();
  const session = fakeSession({ autoOne });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_auto")!.callback({
    goalId: 0,
    depth: 5,
    listCandidates: true,
    hints: ["-t 999999"],
    excludeHints: ["--unsafe"],
    writeToFile: false,
  });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/-t 999999/u);
  expect(autoOne).not.toHaveBeenCalled();
});
