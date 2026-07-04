// MIT License — see LICENSE
//
// refine()/refineExact()/intro() rejection-detection regression
// coverage (CR-01, fingerprint bfcba437f5426fd6): this phase fixed
// give() so an Agda-rejected expression (an Error DisplayInfo, never
// stderr) is detected and surfaced as rejected/rejectionText — but
// left the identical bug alive in these three sibling functions,
// which share give()'s decodeGiveLikeResponse() decode helper and
// protocol shape. Mirrors test/unit/agda/goal-operations-give.test.ts.

import { expect, test } from "vitest";

import { refine, refineExact, intro } from "../../../src/agda/goal-operations.js";
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

const rejectionResponses: AgdaResponse[] = [
  {
    kind: "DisplayInfo",
    info: {
      kind: "Error",
      message:
        "1.1-5: error: [UnequalTerms]\nBool !=< Nat\nwhen checking that the expression zero has type Bool",
    },
  },
];

const acceptedResponses: AgdaResponse[] = [
  { kind: "GiveAction", giveResult: JSON.stringify({ paren: false }) },
];

test("refine() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected", async () => {
  const result = await refine(fakeCtx(rejectionResponses), 0, "zero");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("UnequalTerms");
  expect(result.replacementText ?? null).toBeNull();
});

test("refine() does not mark a successful refine (GiveAction present) as rejected", async () => {
  const result = await refine(fakeCtx(acceptedResponses), 0, "refl");

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
  expect(result.replacementText).toBe("refl");
});

test("refineExact() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected", async () => {
  const result = await refineExact(fakeCtx(rejectionResponses), 0, "zero");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("UnequalTerms");
  expect(result.replacementText ?? null).toBeNull();
});

test("refineExact() does not mark a successful refine (GiveAction present) as rejected", async () => {
  const result = await refineExact(fakeCtx(acceptedResponses), 0, "refl");

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
  expect(result.replacementText).toBe("refl");
});

test("intro() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected", async () => {
  const result = await intro(fakeCtx(rejectionResponses), 0, "zero");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("UnequalTerms");
  expect(result.replacementText ?? null).toBeNull();
});

test("intro() does not mark a successful intro (GiveAction present) as rejected", async () => {
  const result = await intro(fakeCtx(acceptedResponses), 0);

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
});
