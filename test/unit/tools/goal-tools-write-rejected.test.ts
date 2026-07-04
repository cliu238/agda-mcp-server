// MIT License — see LICENSE
//
// Envelope-level regression coverage for CR-01/CR-02/CR-03: every
// write-capable proof-action tool (agda_refine, agda_refine_exact,
// agda_intro, agda_case_split, agda_auto) must surface an Agda
// rejection (an Error DisplayInfo, decoded by goal-operations.ts into
// `result.rejected`/`result.rejectionText`) as ok:false with a
// tool-specific `<op>-rejected` classification, and must NEVER
// attempt a file write for a rejected result — mirroring
// test/unit/tools/goal-tools-give.test.ts's existing agda_give
// coverage of the same root-cause shape (fingerprint bfcba437f5426fd6)
// for `agda_give` itself. Uses the same Map-backed fake-server +
// inline fake-session harness as goal-tools-give.test.ts /
// analysis-tools.test.ts — no real Agda subprocess involved.

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

function fakeSession(
  overrides: {
    refine?: any;
    refineExact?: any;
    intro?: any;
    caseSplit?: any;
    autoOne?: any;
  } = {},
) {
  return {
    getGoalIds: () => [0],
    getLoadedFile: () => "/repo/Example.agda",
    getLastClassification: () => null,
    isFileStale: () => false,
    currentFile: "/repo/Example.agda",
    goal: {
      refine: overrides.refine ?? vi.fn(),
      refineExact: overrides.refineExact ?? vi.fn(),
      intro: overrides.intro ?? vi.fn(),
      caseSplit: overrides.caseSplit ?? vi.fn(),
      autoOne: overrides.autoOne ?? vi.fn(),
    },
  } as any;
}

const rejectionText =
  "1.1-5: error: [UnequalTerms]\nBool !=< Nat\nwhen checking that the expression zero has type Bool";

// ── CR-01: agda_refine / agda_refine_exact / agda_intro ──────────

test("agda_refine surfaces a rejected expression as ok:false / refine-rejected, without writing to the file", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const refine = vi.fn().mockResolvedValue({
    result: rejectionText,
    replacementText: null,
    rejected: true,
    rejectionText,
  });
  const session = fakeSession({ refine });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_refine")!.callback({
    goalId: 0,
    expr: "zero",
    writeToFile: true,
  });

  expect(result.isError).toBe(true);
  expect(result.structuredContent.classification).toBe("refine-rejected");
  expect(result.structuredContent.diagnostics[0].message).toContain("UnequalTerms");
  expect(result.structuredContent.data.written).toBe(false);
});

test("agda_refine still returns an ok envelope for an accepted expression", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const refine = vi.fn().mockResolvedValue({
    result: "Term accepted",
    replacementText: "true",
    rejected: false,
    rejectionText: null,
  });
  const session = fakeSession({ refine });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_refine")!.callback({
    goalId: 0,
    expr: "true",
    writeToFile: false,
  });

  expect(result.isError).toBe(false);
  expect(result.structuredContent.classification).toBe("ok");
  expect(result.structuredContent.data.replacementText).toBe("true");
});

test("agda_refine_exact surfaces a rejected expression as ok:false / refine-exact-rejected, without writing to the file", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const refineExact = vi.fn().mockResolvedValue({
    result: rejectionText,
    replacementText: null,
    rejected: true,
    rejectionText,
  });
  const session = fakeSession({ refineExact });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_refine_exact")!.callback({
    goalId: 0,
    expr: "zero",
    writeToFile: true,
  });

  expect(result.isError).toBe(true);
  expect(result.structuredContent.classification).toBe("refine-exact-rejected");
  expect(result.structuredContent.data.written).toBe(false);
});

test("agda_intro surfaces a rejected expression as ok:false / intro-rejected, without writing to the file", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const intro = vi.fn().mockResolvedValue({
    result: rejectionText,
    replacementText: null,
    rejected: true,
    rejectionText,
  });
  const session = fakeSession({ intro });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_intro")!.callback({
    goalId: 0,
    writeToFile: true,
  });

  expect(result.isError).toBe(true);
  expect(result.structuredContent.classification).toBe("intro-rejected");
  expect(result.structuredContent.data.written).toBe(false);
});

// ── CR-02: agda_case_split ────────────────────────────────────────

test("agda_case_split surfaces a rejected Cmd_make_case as ok:false / case-split-rejected, without writing to the file", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const rejectionMessage = "1.1-5: error: Cannot split on variable notAVariable";
  const caseSplit = vi.fn().mockResolvedValue({
    clauses: [rejectionMessage],
    rejected: true,
    rejectionText: rejectionMessage,
  });
  const session = fakeSession({ caseSplit });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  // writeToFile defaults to true (and currentFile is set) so a
  // regression that skips the rejection check would fall through to
  // the real applyEditAndReload() against an incompatible fake
  // session — surfacing as a crash/generic tool-error rather than the
  // specific case-split-rejected classification asserted below.
  const result = await server.get("agda_case_split")!.callback({
    goalId: 0,
    variable: "notAVariable",
  });

  expect(result.isError).toBe(true);
  expect(result.structuredContent.classification).toBe("case-split-rejected");
  expect(result.structuredContent.diagnostics[0].message).toContain("Cannot split");
  expect(result.structuredContent.data.written).toBe(false);
});

test("agda_case_split still returns an ok envelope and writes clauses for a successful split", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const caseSplit = vi.fn().mockResolvedValue({
    clauses: ["f zero = ?", "f (suc n) = ?"],
    rejected: false,
    rejectionText: null,
  });
  const session = fakeSession({ caseSplit });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_case_split")!.callback({
    goalId: 0,
    variable: "n",
    writeToFile: false,
  });

  expect(result.isError).toBe(false);
  expect(result.structuredContent.classification).toBe("ok");
  expect(result.structuredContent.data.clauses).toEqual(["f zero = ?", "f (suc n) = ?"]);
});

// ── CR-03: agda_auto (Error-kind rejection, distinct from the ─────
// pre-existing flag-injection coverage in goal-tools-give.test.ts) ─

test("agda_auto surfaces an Agda rejection (e.g. NotInScope) as ok:false / auto-rejected, without writing to the file", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const rejectionMessage = "1.1-24: error: [NotInScope]\nNot in scope:\n  someHint at 1.1-24";
  const autoOne = vi.fn().mockResolvedValue({
    solution: rejectionMessage,
    rejected: true,
    rejectionText: rejectionMessage,
  });
  const session = fakeSession({ autoOne });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  // writeToFile left at its default (true) so a regression that skips
  // the rejection check would fall through to the real
  // applyEditAndReload() against an incompatible fake session.
  const result = await server.get("agda_auto")!.callback({
    goalId: 0,
    hints: ["someHint"],
  });

  expect(result.isError).toBe(true);
  expect(result.structuredContent.classification).toBe("auto-rejected");
  expect(result.structuredContent.diagnostics[0].message).toContain("NotInScope");
  expect(result.structuredContent.data.written).toBe(false);
});

test("agda_auto still returns an ok envelope and writes the solution for a successful auto-solve", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const autoOne = vi.fn().mockResolvedValue({
    solution: "refl",
    rejected: false,
    rejectionText: null,
  });
  const session = fakeSession({ autoOne });

  registerGoalTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_auto")!.callback({
    goalId: 0,
    writeToFile: false,
  });

  expect(result.isError).toBe(false);
  expect(result.structuredContent.classification).toBe("ok");
  expect(result.structuredContent.data.solution).toBe("refl");
  expect(result.structuredContent.data.hasSolution).toBe(true);
});
