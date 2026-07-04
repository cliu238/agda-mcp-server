import { test, expect } from "vitest";

import {
  decodeCaseSplitResponses,
  decodeGiveLikeResponse,
  decodeSolveResponses,
  hasGiveActionResponse,
  hasMakeCaseResponse,
} from "../../../src/protocol/responses/proof-actions.js";

test("decodeGiveLikeResponse prefers GiveAction payloads", () => {
  const result = decodeGiveLikeResponse([
    { kind: "GiveAction", giveResult: "refl" },
    { kind: "DisplayInfo", info: { kind: "Auto", message: "ignored" } },
  ]);

  expect(result).toBe("refl");
});

test("decodeSolveResponses formats SolveAll object payloads", () => {
  const result = decodeSolveResponses([
    {
      kind: "SolveAll",
      solutions: [
        { interactionPoint: 3, expression: "refl" },
      ],
    },
  ]);

  expect(result).toEqual(["?3 := refl"]);
});

test("decodeCaseSplitResponses prefers MakeCase clauses", () => {
  const result = decodeCaseSplitResponses([
    {
      kind: "MakeCase",
      clauses: ["f zero = ?", "f (suc n) = ?"],
    },
  ]);

  expect(result).toEqual(["f zero = ?", "f (suc n) = ?"]);
});

// ── WR-04: hasGiveActionResponse/hasMakeCaseResponse require a ──────
// non-empty payload, not just response-kind presence ────────────────
//
// giveActionResponseSchema/makeCaseResponseSchema both permit an
// empty/absent payload (giveResult/result/clauses are all .optional()),
// and decodeGiveLikeResponse()/decodeCaseSplitResponses() both treat
// such a response as "no real result" and fall through to raw
// DisplayInfo text. Pre-WR-04, hasGiveActionResponse()/
// hasMakeCaseResponse() checked kind-presence only, so a
// schema-conformant-but-empty-payload response would make them report
// `true` even though the decoder falls through to the Error text.

test("hasGiveActionResponse returns false for a GiveAction response with an empty giveResult", () => {
  expect(hasGiveActionResponse([{ kind: "GiveAction", giveResult: "" }])).toBe(false);
});

test("hasGiveActionResponse returns false for a GiveAction response with no giveResult/result at all", () => {
  expect(hasGiveActionResponse([{ kind: "GiveAction" }])).toBe(false);
});

test("hasGiveActionResponse still returns true for a GiveAction response with a real payload", () => {
  expect(hasGiveActionResponse([{ kind: "GiveAction", giveResult: "refl" }])).toBe(true);
});

test("hasMakeCaseResponse returns false for a MakeCase response with empty clauses", () => {
  expect(hasMakeCaseResponse([{ kind: "MakeCase", clauses: [] }])).toBe(false);
});

test("hasMakeCaseResponse returns false for a MakeCase response with no clauses field at all", () => {
  expect(hasMakeCaseResponse([{ kind: "MakeCase" }])).toBe(false);
});

test("hasMakeCaseResponse still returns true for a MakeCase response with real clauses", () => {
  expect(hasMakeCaseResponse([{ kind: "MakeCase", clauses: ["f zero = ?"] }])).toBe(true);
});
