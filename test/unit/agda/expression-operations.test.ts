// MIT License — see LICENSE
//
// compute()/infer() rejection-detection regression coverage
// (fingerprint e5f6de1fa365b887, RT2): an out-of-scope identifier is
// rejected by Agda via a normal DisplayInfo/Error response, not a
// fatal stderr line and not a NormalForm/InferredType payload — so a
// naive decode silently returns "" and the caller reports ok:true.
// Verified empirically against a live Agda 2.8.0 session: a rejected
// Cmd_infer_toplevel/Cmd_compute_toplevel/Cmd_infer/Cmd_compute comes
// back as exactly `{ kind: "DisplayInfo", info: { kind: "Error", ... } }`
// with no stderr output at all, so throwOnFatalProtocolStderr (used
// elsewhere in this codebase) cannot catch it — the same
// `info.kind === "Error"` scan idiom goal-operations.ts's give() uses
// (fingerprint bfcba437f5426fd6) must be applied here too.

import { expect, test } from "vitest";

import { compute, computeTopLevel, infer, inferTopLevel } from "../../../src/agda/expression-operations.js";
import type { AgdaCommandContext, AgdaResponse } from "../../../src/agda/types.js";

function fakeCtx(responses: AgdaResponse[]): AgdaCommandContext {
  return {
    requireFile: () => "/repo/Test.agda",
    sendCommand: async () => responses,
    iotcm: (cmd: string) => cmd,
    syncGoalIdsFromResponses: () => {},
    getAgdaVersion: () => null,
    goalIds: [],
  };
}

const notInScopeError: AgdaResponse[] = [
  {
    kind: "DisplayInfo",
    info: {
      kind: "Error",
      message:
        "1.1-24: error: [NotInScope]\nNot in scope:\n  definitelyNotInScopeXyz at 1.1-24\nwhen scope checking definitelyNotInScopeXyz",
    },
  },
];

// ── computeTopLevel ──────────────────────────────────────────────────

test("computeTopLevel throws instead of returning ok on an Error DisplayInfo (NotInScope)", async () => {
  await expect(computeTopLevel(fakeCtx(notInScopeError), "definitelyNotInScopeXyz"))
    .rejects.toThrow(/NotInScope/);
});

test("computeTopLevel still returns the normal form for a successful evaluation", async () => {
  const responses: AgdaResponse[] = [
    { kind: "DisplayInfo", info: { kind: "NormalForm", expr: "1" } },
  ];
  const result = await computeTopLevel(fakeCtx(responses), "1");
  expect(result.normalForm).toBe("1");
});

// ── inferTopLevel ────────────────────────────────────────────────────

test("inferTopLevel throws instead of returning ok on an Error DisplayInfo (NotInScope)", async () => {
  await expect(inferTopLevel(fakeCtx(notInScopeError), "definitelyNotInScopeXyz"))
    .rejects.toThrow(/NotInScope/);
});

test("inferTopLevel still returns the inferred type for a successful inference", async () => {
  const responses: AgdaResponse[] = [
    { kind: "DisplayInfo", info: { kind: "InferredType", type: "Nat -> Nat -> Nat" } },
  ];
  const result = await inferTopLevel(fakeCtx(responses), "add");
  expect(result.type).toBe("Nat -> Nat -> Nat");
});

// ── compute() / infer() (goal-scoped) — same shared root cause ──────

test("compute() (goal-scoped) throws instead of returning ok on an Error DisplayInfo (NotInScope)", async () => {
  await expect(compute(fakeCtx(notInScopeError), 0, "definitelyNotInScopeXyz"))
    .rejects.toThrow(/NotInScope/);
});

test("infer() (goal-scoped) throws instead of returning ok on an Error DisplayInfo (NotInScope)", async () => {
  await expect(infer(fakeCtx(notInScopeError), 0, "definitelyNotInScopeXyz"))
    .rejects.toThrow(/NotInScope/);
});

test("infer() (goal-scoped) still returns the inferred type for a successful inference", async () => {
  const responses: AgdaResponse[] = [
    { kind: "DisplayInfo", info: { kind: "InferredType", type: "Nat" } },
  ];
  const result = await infer(fakeCtx(responses), 0, "x");
  expect(result.type).toBe("Nat");
});
