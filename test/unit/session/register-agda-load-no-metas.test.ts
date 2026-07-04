// MIT License — see LICENSE
//
// agda_load_no_metas session-history regression coverage (fingerprint
// 3306edf4c2d01c53, RT8): registerAgdaLoadNoMetas previously hardcoded
// `reloaded: false` / `staleBeforeLoad: false` and never read
// session.getLastClassification()/getLastLoadedAt() at all, unlike
// agda_load's own registration (register-agda-load.ts) — so a genuine
// reload regression (a dependency changed underneath an already-loaded
// file) was reported identically to a first-ever load, with no
// previousClassification field and no session-regression diagnostic.
// Mirrors load-tool-registration.test.ts's own agda_load coverage of
// the identical signal.

import { test, expect } from "vitest";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerSessionLoadTools } from "../../../src/session/load-tool-registration.js";
import { clearToolManifest } from "../../../src/tools/manifest.js";

function createCapturingServer() {
  const registrations = new Map<string, { name: string; spec: unknown; callback: (args: any) => any }>();

  return {
    registerTool(name: string, spec: unknown, callback: (args: any) => any) {
      registrations.set(name, { name, spec, callback });
    },
    get(name: string) {
      return registrations.get(name);
    },
  };
}

test("agda_load_no_metas surfaces regression diagnostic and previousClassification when reload drops from ok-complete to failure", async () => {
  clearToolManifest();
  const server = createCapturingServer();

  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "agda-mcp-no-metas-regression-")));
  const fileName = "Probe.agda";
  const absPath = resolve(root, fileName);
  writeFileSync(absPath, "module Probe where\n", "utf8");

  const session = {
    getAgdaVersion: () => null,
    getLoadedFile() {
      return absPath;
    },
    getGoalIds() {
      return [];
    },
    isFileStale() {
      return false;
    },
    getLastClassification() {
      return "ok-complete";
    },
    getLastLoadedAt() {
      return Date.now() - 3000;
    },
    load: async () => {
      throw new Error("unreachable");
    },
    loadNoMetas: async () => ({
      success: false,
      errors: ["Type mismatch in Probe.agda:3"],
      warnings: [],
      goals: [],
      allGoalsText: "",
      invisibleGoalCount: 0,
      goalCount: 0,
      hasHoles: false,
      isComplete: false,
      classification: "type-error",
      profiling: null,
    }),
  };

  try {
    registerSessionLoadTools(server as unknown as McpServer, session as any, root);
    const result = await server.get("agda_load_no_metas")!.callback({ file: fileName });

    expect(result.isError).toBe(false);
    expect(result.structuredContent.data.reloaded).toBe(true);
    expect(result.structuredContent.data.previousClassification).toBe("ok-complete");
    expect(typeof result.structuredContent.data.previousLoadedAtMs).toBe("number");

    const regressionDiag = result.structuredContent.diagnostics.find(
      (diag: { code: string }) => diag.code === "session-regression",
    );
    expect(regressionDiag).toBeDefined();
    expect(regressionDiag.severity).toBe("info");
    expect(regressionDiag.message).toContain("ok-complete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("agda_load_no_metas reports reloaded:false and previousClassification:null on a first load", async () => {
  clearToolManifest();
  const server = createCapturingServer();

  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "agda-mcp-no-metas-first-load-")));
  const fileName = "Probe.agda";
  writeFileSync(resolve(root, fileName), "module Probe where\n", "utf8");

  const session = {
    getAgdaVersion: () => null,
    getLoadedFile() {
      return null;
    },
    getGoalIds() {
      return [];
    },
    isFileStale() {
      return false;
    },
    getLastClassification() {
      return null;
    },
    getLastLoadedAt() {
      return null;
    },
    load: async () => {
      throw new Error("unreachable");
    },
    loadNoMetas: async () => ({
      success: false,
      errors: ["Some error"],
      warnings: [],
      goals: [],
      allGoalsText: "",
      invisibleGoalCount: 0,
      goalCount: 0,
      hasHoles: false,
      isComplete: false,
      classification: "type-error",
      profiling: null,
    }),
  };

  try {
    registerSessionLoadTools(server as unknown as McpServer, session as any, root);
    const result = await server.get("agda_load_no_metas")!.callback({ file: fileName });

    expect(result.isError).toBe(false);
    expect(result.structuredContent.data.reloaded).toBe(false);
    expect(result.structuredContent.data.previousClassification ?? null).toBeNull();
    expect(result.structuredContent.data.previousLoadedAtMs ?? null).toBeNull();

    const regressionDiag = result.structuredContent.diagnostics.find(
      (diag: { code: string }) => diag.code === "session-regression",
    );
    expect(regressionDiag).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
