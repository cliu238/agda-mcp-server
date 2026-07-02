// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/orcl-03-conformance.mjs: ORCL-03, the
// conformance proxy oracle predicate (advisory only).
//
// Task 1 (7 tests): parseExpectedSignature / normalizeSignatureText /
// compareSignatures — pure, no real Agda spawn required. The 7th test
// (arrow-notation normalization) is an addition beyond the plan's own
// 6 — see 02-04-SUMMARY.md's Deviations section for why it was needed.
// Task 2 adds the cold Cmd_load + Cmd_infer_toplevel + judgeOrcl03()
// coverage in a follow-up commit.

import { expect, test } from "vitest";

// @ts-expect-error script module lacks types
import {
  compareSignatures,
  normalizeSignatureText,
  parseExpectedSignature,
} from "../../../scripts/oracle/orcl-03-conformance.mjs";

// ── Task 1: parseExpectedSignature / normalizeSignatureText / compareSignatures ──

test("parseExpectedSignature: splits a simple 'name : type' signature on the first top-level colon", () => {
  expect(parseExpectedSignature("hopfMap : S3 -> S2")).toEqual({
    name: "hopfMap",
    expectedType: "S3 -> S2",
  });
});

test("parseExpectedSignature: a colon nested inside parens is NOT the split point — the first TOP-LEVEL colon is", () => {
  expect(parseExpectedSignature("(f : A -> B) : C")).toEqual({
    name: "(f : A -> B)",
    expectedType: "C",
  });
});

test("parseExpectedSignature: no colon at all degenerates to the whole trimmed string as both name and expectedType", () => {
  expect(parseExpectedSignature("justAName")).toEqual({
    name: "justAName",
    expectedType: "justAName",
  });
});

test("compareSignatures: identical types are consistent", () => {
  expect(compareSignatures("Nat -> Nat", "Nat -> Nat")).toEqual({ kind: "consistent" });
});

test("compareSignatures: differing whitespace only is still consistent (whitespace-normalized comparison)", () => {
  expect(compareSignatures("Nat -> Nat", "  Nat   ->   Nat  ")).toEqual({ kind: "consistent" });
});

test("compareSignatures: a genuinely different type is conformance-flagged, carrying both signatures verbatim", () => {
  expect(compareSignatures("Nat -> Nat", "Bool -> Nat")).toEqual({
    kind: "conformance-flagged",
    provenSignature: "Nat -> Nat",
    expectedSignature: "Bool -> Nat",
  });
});

test("normalizeSignatureText: collapses whitespace runs AND normalizes ASCII '->' to Agda's own Unicode '→' token spelling", () => {
  // Confirmed empirically against a real local Agda 2.8.0 binary during
  // this plan's implementation: Cmd_infer_toplevel Normalised always
  // prints "→", regardless of whether the ORIGINAL source used "->" or
  // "→". Without this, an expectedSignature typed with the ASCII
  // spelling would spuriously conformance-flag against every proven
  // signature Agda ever emits (see 02-04-SUMMARY.md Deviations).
  expect(normalizeSignatureText("  Nat   ->   Nat  ")).toBe("Nat → Nat");
  expect(normalizeSignatureText("Nat → Nat")).toBe("Nat → Nat");
  expect(compareSignatures("Nat → Nat", "Nat -> Nat")).toEqual({ kind: "consistent" });
});
