// MIT License — see LICENSE
//
// Unit tests for scripts/queue/priority.mjs: QUEUE-02's forced priority
// ordering (comparePriority/sortByPriority). Pure, deterministic, no
// filesystem/subprocess access — every input is a minimal
// { defectKind, recurrence }-shaped synthetic object (a full
// FixQueueEntry is not required for this pure function's own tests —
// only the two fields it reads).

import { expect, test } from "vitest";

// @ts-expect-error script module lacks types
import { comparePriority, DEFECT_KIND_WEIGHT, sortByPriority } from "../../../scripts/queue/priority.mjs";

function entry(defectKind: string, recurrence = 1): { defectKind: string; recurrence: number } {
  return { defectKind, recurrence };
}

// Test 1
test("sortByPriority orders false-green > crash > wrong-result > missing-feature regardless of input order", () => {
  const shuffled = [entry("missing-feature"), entry("wrong-result"), entry("false-green"), entry("crash")];

  const sorted = sortByPriority(shuffled);

  expect(sorted.map((e: { defectKind: string }) => e.defectKind)).toEqual([
    "false-green",
    "crash",
    "wrong-result",
    "missing-feature",
  ]);
});

// Test 2
test("sortByPriority breaks ties within the same defectKind by recurrence descending", () => {
  const entries = [entry("crash", 2), entry("crash", 5)];

  const sorted = sortByPriority(entries);

  expect(sorted.map((e: { recurrence: number }) => e.recurrence)).toEqual([5, 2]);
});

// Test 3
test("sortByPriority does not mutate its input array's own element order", () => {
  const entries = [entry("missing-feature"), entry("false-green"), entry("crash")];
  const before = [...entries];

  sortByPriority(entries);

  expect(entries).toEqual(before);
});

// Test 4
test("sortByPriority is deterministic — calling it twice on the same input produces deep-equal results", () => {
  const entries = [
    entry("wrong-result", 1),
    entry("false-green", 3),
    entry("crash", 1),
    entry("crash", 9),
    entry("missing-feature", 2),
  ];

  const first = sortByPriority(entries);
  const second = sortByPriority(entries);

  expect(first).toEqual(second);
});

// Supplementary (Rule 2): direct coverage of the exported comparator +
// weight table the acceptance criteria's own source assertions require,
// not just indirect coverage via the sortByPriority wrapper.
test("comparePriority returns negative/positive/zero matching QUEUE-02's band ordering", () => {
  expect(comparePriority(entry("false-green"), entry("crash"))).toBeLessThan(0);
  expect(comparePriority(entry("crash"), entry("false-green"))).toBeGreaterThan(0);
  expect(comparePriority(entry("crash", 1), entry("crash", 1))).toBe(0);
});

test("DEFECT_KIND_WEIGHT is frozen and encodes false-green as the lowest (highest-priority) weight", () => {
  expect(Object.isFrozen(DEFECT_KIND_WEIGHT)).toBe(true);
  expect(DEFECT_KIND_WEIGHT["false-green"]).toBeLessThan(DEFECT_KIND_WEIGHT["crash"]);
  expect(DEFECT_KIND_WEIGHT["crash"]).toBeLessThan(DEFECT_KIND_WEIGHT["wrong-result"]);
  expect(DEFECT_KIND_WEIGHT["wrong-result"]).toBeLessThan(DEFECT_KIND_WEIGHT["missing-feature"]);
});
