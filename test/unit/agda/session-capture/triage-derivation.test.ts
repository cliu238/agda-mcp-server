// MIT License — see LICENSE
//
// Focused unit tests for the QUEUE-03 triage-derivation helper,
// directly against deriveTriageFromActions() — no MCP server/tool-
// registration scaffolding needed. See
// test/unit/tools/register-capture-session.test.ts for the
// tool-integration-level coverage of the same behavior.

import { test, expect } from "vitest";

import { classifyAgdaError } from "../../../../src/agda/agent-ux.js";
import { deriveTriageFromActions } from "../../../../src/agda/session-capture/triage-derivation.js";
import type { RecordedAction } from "../../../../src/agda/session-capture/artifact-types.js";

const FALLBACK = {
  affectedTool: "agda_capture_session",
  observed: "session capture",
};

function makeAction(
  tool: string,
  normalizedResponse: Record<string, unknown> | undefined,
): RecordedAction {
  return { tool, args: {}, timestamp: Date.now(), normalizedResponse };
}

test("deriveTriageFromActions returns the fallback shape for an empty actions array", () => {
  const result = deriveTriageFromActions([], FALLBACK);
  expect(result).toEqual({
    triage: null,
    fingerprintAffectedTool: FALLBACK.affectedTool,
    fingerprintObserved: FALLBACK.observed,
  });
});

test("deriveTriageFromActions classifies the last load-family action's real error and surfaces richer fingerprint fields", () => {
  const errorText = "Parse error: could not parse the expression";
  const actions: RecordedAction[] = [
    makeAction("agda_load", { data: { errors: [errorText] } }),
  ];

  const result = deriveTriageFromActions(actions, FALLBACK);

  // Never a hardcoded expected category/confidence — call the real
  // classifier once to derive the expected value.
  const expectedTriage = classifyAgdaError(errorText);
  expect(result.triage).not.toBeNull();
  expect(result.triage?.category).toBe(expectedTriage.category);
  expect(result.triage?.confidence).toBe(expectedTriage.confidence);
  expect(result.fingerprintAffectedTool).toBe("agda_load");
  expect(result.fingerprintObserved).toBe(errorText);
});

test("deriveTriageFromActions falls back to the exact fallback shape when the load-family action's data.errors is malformed/missing, without throwing", () => {
  const actions: RecordedAction[] = [makeAction("agda_load", { data: {} })];

  expect(() => deriveTriageFromActions(actions, FALLBACK)).not.toThrow();
  const result = deriveTriageFromActions(actions, FALLBACK);
  expect(result).toEqual({
    triage: null,
    fingerprintAffectedTool: FALLBACK.affectedTool,
    fingerprintObserved: FALLBACK.observed,
  });
});
