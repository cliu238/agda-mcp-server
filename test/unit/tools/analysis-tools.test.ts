import { expect, test } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerAnalysisTools } from "../../../src/tools/analysis-tools.js";
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

test("agda_term_search imported scope labels candidates as imported", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const session = {
    getGoalIds: () => [1],
    getLastClassification: () => null,
    getLoadedFile: () => "/repo/Example.agda",
    isFileStale: () => false,
    goal: {
      typeContext: async () => ({
        type: "Nat",
        context: ["x : Nat"],
      }),
    },
    query: {
      searchAbout: async () => ({
        query: "Nat",
        results: [{ name: "helper", term: "Nat" }],
        text: "",
      }),
    },
    load: async () => ({ success: true, errors: [], warnings: [], goals: [], allGoalsText: "", invisibleGoalCount: 0, goalCount: 0, hasHoles: false, isComplete: true, classification: "ok-complete", profiling: null }),
  } as any;

  registerAnalysisTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_term_search")!.callback({
    goalId: 1,
    scope: "imported",
  });

  expect(result.isError).toBe(false);
  expect(result.content[0].text).toContain("(imported)");
  expect(result.content[0].text).not.toContain("(module)");
});

// ── agda_proof_status ───────────────────────────────────────────
//
// Fingerprint fdc90bfde12fb938: a stale reload can leave a real error
// parked in constraintsText (hasConstraints:true) while goals.length
// is 0 — the tool must never contradict its own Constraints section
// by appending "All goals solved." right after it.

test("agda_proof_status reports NOT confirmed complete when goals are empty but constraints remain", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const session = {
    getGoalIds: () => [],
    getLastClassification: () => null,
    getLoadedFile: () => "/repo/Example.agda",
    isFileStale: () => false,
    goal: {
      metas: async () => ({ goals: [] }),
    },
    query: {
      constraints: async () => ({
        text: "1.1-5: error: [UnequalTerms]\nBool !=< Nat",
      }),
    },
  } as any;

  registerAnalysisTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_proof_status")!.callback({});

  expect(result.isError).toBe(false);
  const text: string = result.content[0].text;
  expect(text).not.toContain("All goals solved.");
  expect(text).toContain("NOT confirmed complete");
});

test("agda_proof_status reports All goals solved when there are no goals and no constraints", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const session = {
    getGoalIds: () => [],
    getLastClassification: () => null,
    getLoadedFile: () => "/repo/Example.agda",
    isFileStale: () => false,
    goal: {
      metas: async () => ({ goals: [] }),
    },
    query: {
      constraints: async () => ({ text: "" }),
    },
  } as any;

  registerAnalysisTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_proof_status")!.callback({});

  expect(result.isError).toBe(false);
  const text: string = result.content[0].text;
  expect(text).toContain("All goals solved.");
  expect(text).not.toContain("NOT confirmed complete");
});

test("agda_proof_status lists open goals and omits the completeness taglines while goals remain", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const session = {
    getGoalIds: () => [0],
    getLastClassification: () => null,
    getLoadedFile: () => "/repo/Example.agda",
    isFileStale: () => false,
    goal: {
      metas: async () => ({ goals: [{ goalId: 0, type: "Nat" }] }),
    },
    query: {
      constraints: async () => ({ text: "" }),
    },
  } as any;

  registerAnalysisTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_proof_status")!.callback({});

  expect(result.isError).toBe(false);
  const text: string = result.content[0].text;
  expect(text).toContain("**?0** : `Nat`");
  expect(text).not.toContain("All goals solved.");
  expect(text).not.toContain("NOT confirmed complete");
});

