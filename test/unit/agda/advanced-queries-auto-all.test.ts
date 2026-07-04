// MIT License — see LICENSE
//
// autoAll() rejection-detection regression coverage (CR-04):
// decodeGiveLikeResponse() falls back to the last DisplayInfo event's
// text whenever no GiveAction response is present, so a
// rejection/internal-failure result can otherwise be written into the
// tool's `solution` field as a fabricated "solved everything" answer
// with `hasSolution: true`, exactly the same shape CR-03 closed for
// autoOne(). rejected requires BOTH an Error display AND no genuine
// GiveAction response, the same two-sided guard autoOne()/give() use.
// Mirrors test/unit/agda/goal-operations-auto-one.test.ts.

import { expect, test } from "vitest";

import { autoAll } from "../../../src/agda/advanced-queries.js";
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

test("autoAll() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected instead of a fabricated solution", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message: "1.1-24: error: [NotInScope]\nNot in scope:\n  someHint at 1.1-24",
      },
    },
  ];

  const result = await autoAll(fakeCtx(responses));

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("NotInScope");
});

test("autoAll() does not mark a successful auto-solve (GiveAction present) as rejected", async () => {
  const responses: AgdaResponse[] = [
    { kind: "GiveAction", giveResult: "refl" },
  ];

  const result = await autoAll(fakeCtx(responses));

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
  expect(result.solution).toBe("refl");
});
