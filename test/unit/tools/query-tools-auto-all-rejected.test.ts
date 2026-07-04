// MIT License — see LICENSE
//
// Envelope-level regression coverage for CR-04: agda_auto_all must
// surface an Agda rejection (an Error DisplayInfo, decoded by
// advanced-queries.ts's autoAll() into `result.rejected`/
// `result.rejectionText`) as ok:false with an `auto-all-rejected`
// classification, instead of unconditionally reporting ok:true with
// `hasSolution` derived from decodeGiveLikeResponse()'s raw-DisplayInfo
// fallback. Mirrors test/unit/tools/goal-tools-write-rejected.test.ts's
// coverage of the sibling agda_auto tool (CR-03) — agda_auto_all has no
// goalId (whole-file operation), so the classification is derived the
// same way but the error data carries no goalId field.

import { expect, test, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerQueryTools } from "../../../src/tools/query-tools.js";
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

function fakeSession(autoAll: any) {
  return {
    getLoadedFile: () => "/repo/Example.agda",
    getLastClassification: () => null,
    getGoalIds: () => [],
    isFileStale: () => false,
    query: { autoAll },
  } as any;
}

test("agda_auto_all surfaces an Agda rejection (e.g. NotInScope) as ok:false / auto-all-rejected", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const rejectionMessage = "1.1-24: error: [NotInScope]\nNot in scope:\n  someHint at 1.1-24";
  const autoAll = vi.fn().mockResolvedValue({
    solution: rejectionMessage,
    rejected: true,
    rejectionText: rejectionMessage,
  });
  const session = fakeSession(autoAll);

  registerQueryTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_auto_all")!.callback({});

  expect(result.isError).toBe(true);
  expect(result.structuredContent.classification).toBe("auto-all-rejected");
  expect(result.structuredContent.diagnostics[0].message).toContain("NotInScope");
  expect(result.structuredContent.data.goalId).toBeUndefined();
});

test("agda_auto_all still returns an ok envelope with hasSolution for a successful auto-solve-all", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const autoAll = vi.fn().mockResolvedValue({
    solution: "refl",
    rejected: false,
    rejectionText: null,
  });
  const session = fakeSession(autoAll);

  registerQueryTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_auto_all")!.callback({});

  expect(result.isError).toBe(false);
  expect(result.structuredContent.classification).toBe("ok");
  expect(result.structuredContent.data.solution).toBe("refl");
  expect(result.structuredContent.data.hasSolution).toBe(true);
});
