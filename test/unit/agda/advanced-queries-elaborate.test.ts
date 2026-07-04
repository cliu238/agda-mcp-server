// MIT License — see LICENSE
//
// elaborate() rejection-detection regression coverage (CR-04): an
// ill-typed expression arrives as a normal DisplayInfo/Error response,
// not a fatal stderr line. Without an explicit check,
// decodeGiveLikeResponse()'s raw-DisplayInfo fallback would render
// Agda's own rejection text as if it were "the fully explicit form" of
// the expression (agda_elaborate's tool description), with ok:true.
// elaborate() must reject explicitly instead, the same
// info.kind === "Error" idiom goalTypeContextCheck() uses for the
// identical shape. Mirrors
// test/unit/agda/goal-operations-context-check.test.ts.

import { expect, test } from "vitest";

import { elaborate } from "../../../src/agda/advanced-queries.js";
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

test("elaborate() throws on a NotInScope Error DisplayInfo instead of returning it as the elaborated form", async () => {
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

  await expect(elaborate(fakeCtx(responses), 0, "definitelyNotInScopeXyz"))
    .rejects.toThrow(/NotInScope/);
});

test("elaborate() still returns the elaborated form for a well-typed expr", async () => {
  const responses: AgdaResponse[] = [
    { kind: "GiveAction", giveResult: "\\ x -> x" },
  ];

  const result = await elaborate(fakeCtx(responses), 0, "id");
  expect(result.elaboration).toBe("\\ x -> x");
});
