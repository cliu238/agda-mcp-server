// MIT License — see LICENSE
//
// autoOne() rejection-detection regression coverage (CR-03):
// decodeGiveLikeResponse() falls back to the last DisplayInfo event's
// text whenever no GiveAction response is present, and both Error-
// kind and Auto-kind DisplayInfo responses decode to non-empty text
// through that fallback -- so a rejection/internal-failure result
// (the exact "NotInScope reported as hasSolution:true" shape recorded
// in test/fixtures/fix-queue.json fingerprints
// 5abecc959e43fef3/004d161b839ce725) can otherwise be written into
// the goal's hole as a fabricated "solution". Mirrors
// test/unit/agda/goal-operations-give.test.ts.

import { expect, test } from "vitest";

import { autoOne } from "../../../src/agda/goal-operations.js";
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

test("autoOne() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected, matching the empirically-observed NotInScope shape", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message: "1.1-24: error: [NotInScope]\nNot in scope:\n  someHint at 1.1-24",
      },
    },
  ];

  const result = await autoOne(fakeCtx(responses), 0, "-h someHint");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("NotInScope");
});

test("autoOne() does not mark a successful auto-solve (GiveAction present) as rejected", async () => {
  const responses: AgdaResponse[] = [
    { kind: "GiveAction", giveResult: "refl" },
  ];

  const result = await autoOne(fakeCtx(responses), 0);

  expect(result.rejected).toBe(false);
  expect(result.rejectionText ?? null).toBeNull();
  expect(result.solution).toBe("refl");
});

// WR-04: hasGiveActionResponse() must check payload non-emptiness, not
// just kind presence — an Error DisplayInfo co-occurring with a
// schema-conformant-but-empty-payload GiveAction response must still
// be classified as rejected. Pre-WR-04, hasGiveActionResponse() would
// have reported true for the empty-payload GiveAction (kind presence
// only), making this compute rejected: false.
test("autoOne() marks a result as rejected even when an empty-payload GiveAction co-occurs with an Error DisplayInfo", async () => {
  const responses: AgdaResponse[] = [
    {
      kind: "DisplayInfo",
      info: {
        kind: "Error",
        message: "1.1-24: error: [NotInScope]\nNot in scope:\n  someHint at 1.1-24",
      },
    },
    { kind: "GiveAction", giveResult: "" },
  ];

  const result = await autoOne(fakeCtx(responses), 0, "-h someHint");

  expect(result.rejected).toBe(true);
  expect(result.rejectionText).toContain("NotInScope");
});
