// MIT License — see LICENSE
//
// Envelope-level regression coverage for CR-04: agda_elaborate must
// surface an Agda rejection (elaborate() now throws on an Error
// DisplayInfo instead of returning it as "the fully explicit form" of
// the expression) as ok:false, instead of an ok:true envelope wrapping
// Agda's own rejection text as the `elaboration` result. No tool-layer
// branch-and-throw is needed here (unlike agda_auto_all) — elaborate()
// throws a bare Error and registerGoalTextTool's wrapper already
// converts an uncaught throw into an error envelope, the same pattern
// goalTypeContextCheck()/agda_goal_type_context_check already use for
// the identical shape.

import { expect, test, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerExpressionTools } from "../../../src/tools/expression-tools.js";
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

function fakeSession(elaborate: any) {
  return {
    getLoadedFile: () => "/repo/Example.agda",
    getLastClassification: () => null,
    getGoalIds: () => [0],
    isFileStale: () => false,
    query: { elaborate },
  } as any;
}

test("agda_elaborate surfaces an Agda rejection (e.g. NotInScope) as ok:false instead of echoing it as the elaborated form", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const rejectionMessage = "1.1-24: error: [NotInScope]\nNot in scope:\n  someHint at 1.1-24";
  const elaborate = vi.fn().mockRejectedValue(new Error(rejectionMessage));
  const session = fakeSession(elaborate);

  registerExpressionTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_elaborate")!.callback({ goalId: 0, expr: "someHint" });

  expect(result.isError).toBe(true);
  expect(result.structuredContent.diagnostics[0].message).toContain("NotInScope");
});

test("agda_elaborate still returns an ok envelope with the elaborated form for a well-typed expr", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const elaborate = vi.fn().mockResolvedValue({ elaboration: "\\ x -> x" });
  const session = fakeSession(elaborate);

  registerExpressionTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_elaborate")!.callback({ goalId: 0, expr: "id" });

  expect(result.isError).toBe(false);
  expect(result.structuredContent.classification).toBe("ok");
  expect(result.structuredContent.data.elaboration).toBe("\\ x -> x");
});
