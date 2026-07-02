// MIT License — see LICENSE
//
// Unit tests for scripts/oracle/verdict-schema.mjs: the D-02 verdict
// composition contract (composeVerdict/abstentionMetricLine). Pure,
// no filesystem/subprocess access — every input is a plain
// already-judged predicate outcome object.

import { expect, test } from "vitest";

// @ts-expect-error script module lacks types
import { abstentionMetricLine, composeVerdict } from "../../../scripts/oracle/verdict-schema.mjs";

test("composeVerdict: orcl01 pass + orcl02 clean + orcl03 consistent -> trueGreen true", () => {
  const verdict = composeVerdict({
    orcl01: { kind: "pass" },
    orcl02: { kind: "clean" },
    orcl03: { kind: "consistent" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-1",
    recurrence: 1,
  });
  expect(verdict.trueGreen).toBe(true);
});

test("composeVerdict: orcl02 cheat-flagged -> trueGreen false even though orcl01 passes", () => {
  const verdict = composeVerdict({
    orcl01: { kind: "pass" },
    orcl02: { kind: "cheat-flagged", findings: [] },
    orcl03: { kind: "consistent" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-2",
    recurrence: 1,
  });
  expect(verdict.trueGreen).toBe(false);
});

test("composeVerdict: an INCONCLUSIVE orcl01 is never treated as a pass -> trueGreen false", () => {
  const verdict = composeVerdict({
    orcl01: { kind: "inconclusive", probe: "version" },
    orcl02: { kind: "clean" },
    orcl03: { kind: "vacuous-no-expected-signature" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-3",
    recurrence: 1,
  });
  expect(verdict.trueGreen).toBe(false);
});

test("composeVerdict: orcl03 conformance-flagged is recorded verbatim but never flips trueGreen (advisory-only, D-02/D-06)", () => {
  const verdict = composeVerdict({
    orcl01: { kind: "pass" },
    orcl02: { kind: "clean" },
    orcl03: { kind: "conformance-flagged", provenSignature: "A", expectedSignature: "B" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-4",
    recurrence: 1,
  });
  expect(verdict.trueGreen).toBe(true);
  expect(verdict.orcl03).toEqual({
    kind: "conformance-flagged",
    provenSignature: "A",
    expectedSignature: "B",
  });
});

test("composeVerdict: always includes consistencyProbe: { attempted: false } regardless of input (D-06)", () => {
  const verdictA = composeVerdict({
    orcl01: { kind: "pass" },
    orcl02: { kind: "clean" },
    orcl03: { kind: "consistent" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-5a",
    recurrence: 0,
  });
  const verdictB = composeVerdict({
    orcl01: { kind: "skip", reason: "no load-family recorded action to diff against" },
    orcl02: { kind: "no-policy", findings: [] },
    orcl03: { kind: "vacuous-no-expected-signature" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-5b",
    recurrence: 0,
  });
  expect(verdictA.consistencyProbe).toEqual({ attempted: false });
  expect(verdictB.consistencyProbe).toEqual({ attempted: false });
});

// Supplementary: `abstentionMetricLine` is a required export (Task 1's
// own acceptance criteria: "exports composeVerdict and
// abstentionMetricLine") with no direct coverage in the plan's own
// 5-item behavior list above — every one of which exercises
// composeVerdict only. Added per Rule 2 (missing critical test
// coverage for a load-bearing, plan-mandated export Task 2 depends on
// directly), mirroring 02-02-SUMMARY.md's identical precedent.
test("abstentionMetricLine: carries the ORCL-01 kind + probe name only when inconclusive, null otherwise", () => {
  const inconclusive = composeVerdict({
    orcl01: { kind: "inconclusive", probe: "closure-hash" },
    orcl02: { kind: "clean" },
    orcl03: { kind: "vacuous-no-expected-signature" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-6",
    recurrence: 2,
  });
  expect(abstentionMetricLine(inconclusive)).toEqual({
    timestamp: inconclusive.computedAt,
    fingerprint: "fp-6",
    orcl01Kind: "inconclusive",
    probe: "closure-hash",
  });

  const passed = composeVerdict({
    orcl01: { kind: "pass" },
    orcl02: { kind: "clean" },
    orcl03: { kind: "consistent" },
    capturePath: "/tmp/fake.json",
    fingerprint: "fp-7",
    recurrence: 0,
  });
  expect(abstentionMetricLine(passed)).toEqual({
    timestamp: passed.computedAt,
    fingerprint: "fp-7",
    orcl01Kind: "pass",
    probe: null,
  });
});
