// MIT License — see LICENSE
//
// give() rejection-detection regression coverage (fingerprint
// bfcba437f5426fd6): an ill-typed expression arrives as a normal
// DisplayInfo/Error response, not a fatal stderr line, so give() must
// scan for it explicitly (the same info.kind === "Error" idiom used by
// parse-load-responses.ts / backend.ts) rather than always returning a
// success-shaped GiveResult.

import { expect, test } from "vitest";

import { give } from "../../../src/agda/goal-operations.js";
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

test("give() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message:
          "1.1-5: error: [UnequalTerms]\nBool !=< Nat\nwhen checking that the expression zero has type Bool",
      },
    },
  ];

  const result = await give(fakeCtx(responses), 0, "zero");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("UnequalTerms");
  expect(result.replacementText ?? null).toBeNull();
});

test("give() does not mark a successful give (GiveAction present) as rejected", async () => {
  const responses: AgdaResponse[] = [
    { kind: "GiveAction", giveResult: JSON.stringify({ paren: false }) },
  ];

  const result = await give(fakeCtx(responses), 0, "refl");

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
  expect(result.replacementText).toBe("refl");
});
