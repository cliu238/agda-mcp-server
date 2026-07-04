// MIT License — see LICENSE
//
// goalTypeContextCheck() rejection-detection regression coverage
// (fingerprint eaea6321183bdf7b, RT3): a rejected `expr` (NotInScope,
// UnequalTerms, ...) arrives as a normal DisplayInfo/Error response,
// not a fatal stderr line. Verified empirically against a live Agda
// 2.8.0 session: with no dedicated schema match for an Error display,
// decodeGoalDisplayResponses's own catch-all dumps the raw error text
// into `goalType` while `checkedExpr` stays "", rendering the literal
// string "(no checked term returned)" inside what the caller reports
// as a success. goalTypeContextCheck() must reject explicitly instead,
// reusing the same `info.kind === "Error"` scan (detectResponseError)
// give() already uses for the identical shape (fingerprint
// bfcba437f5426fd6).

import { expect, test } from "vitest";

import { goalTypeContextCheck } from "../../../src/agda/goal-operations.js";
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

test("goalTypeContextCheck throws on a NotInScope Error DisplayInfo instead of embedding it in goalType", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message:
          "1.1-24: error: [NotInScope]\nNot in scope:\n  definitelyNotInScopeXyz at 1.1-24\nwhen scope checking definitelyNotInScopeXyz",
      },
    },
  ];

  await expect(goalTypeContextCheck(fakeCtx(responses), 0, "definitelyNotInScopeXyz"))
    .rejects.toThrow(/NotInScope/);
});

test("goalTypeContextCheck throws on a genuinely ill-typed (UnequalTerms) Error DisplayInfo", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message: "1.1-5: error: [UnequalTerms]\nNat !=< Bool\nwhen checking that the expression zero has type Bool",
      },
    },
  ];

  await expect(goalTypeContextCheck(fakeCtx(responses), 0, "zero"))
    .rejects.toThrow(/UnequalTerms/);
});

test("goalTypeContextCheck still returns the goal type/context/checked term for a well-typed expr", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "GoalSpecific",
        interactionPoint: { id: 0, range: [] },
        goalInfo: {
          kind: "GoalType",
          type: "Bool",
          rewrite: "Normalised",
          entries: [{ originalName: "b", reifiedName: "b", binding: "Bool", inScope: true }],
          outputForms: [],
          boundary: [],
          typeAux: { kind: "GoalAndElaboration", term: "b" },
        },
      },
    },
  ];

  const result = await goalTypeContextCheck(fakeCtx(responses), 0, "b");
  expect(result.goalType).toBe("Bool");
  expect(result.checkedExpr).toBe("b");
  expect(result.context).toEqual(["b : Bool"]);
});
