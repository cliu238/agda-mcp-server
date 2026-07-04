// MIT License — see LICENSE
//
// caseSplit() rejection-detection regression coverage (CR-02): a
// rejected/invalid Cmd_make_case (e.g. an unsplittable or unknown
// variable name) arrives as an Error DisplayInfo response with no
// MakeCase response at all — decodeCaseSplitResponses() falls back to
// that raw error text, which the tool layer must not mistake for real
// clauses (a fabricated case-split clause silently overwriting a real
// function clause is the CR-02 data-loss scenario). Mirrors
// test/unit/agda/goal-operations-give.test.ts.

import { expect, test } from "vitest";

import { caseSplit } from "../../../src/agda/goal-operations.js";
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

test("caseSplit() marks a rejected Cmd_make_case (Error DisplayInfo, no MakeCase response) as rejected", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message: "1.1-5: error: Cannot split on variable notAVariable",
      },
    },
  ];

  const result = await caseSplit(fakeCtx(responses), 0, "notAVariable");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("Cannot split");
});

test("caseSplit() does not mark a successful case-split (MakeCase response present) as rejected", async () => {
  const responses: AgdaResponse[] = [
    { kind: "MakeCase", clauses: ["f zero = ?", "f (suc n) = ?"] },
  ];

  const result = await caseSplit(fakeCtx(responses), 0, "n");

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
  expect(result.clauses).toEqual(["f zero = ?", "f (suc n) = ?"]);
});
