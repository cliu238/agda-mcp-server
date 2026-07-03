// MIT License — see LICENSE
//
// Unit tests for the fuel-corpora typed loader (PROC-02, D-02): the
// pinned fuel-pointer manifest must parse as exactly the four
// requirement-named corpora (agda-stdlib, agda-unimath,
// codex-homotopy-group, autoformalizing-hopf), every pinnedRef must be
// a full 40-hex-char commit SHA (never a short SHA or a bare tag/
// branch name), and every policyKey must cross-resolve via the
// EXISTING (unchanged) loadOraclePolicy() to a real, non-null policy
// object — proving the cross-reference into the Phase-2 policy loader
// is live, not just a string that happens to match nothing.

import { test, expect } from "vitest";

import { fuelCorpora } from "../../fixtures/fuel-corpora.js";
// @ts-expect-error script module lacks types
import { loadOraclePolicy } from "../../../scripts/oracle/orcl-02-soundness-scan.mjs";

test("fuel corpora manifest loads and validates as exactly 4 entries", () => {
  expect(Array.isArray(fuelCorpora)).toBe(true);
  expect(fuelCorpora).toHaveLength(4);
});

test("fuel corpora manifest keys are exactly the 4 D-02 corpora, no duplicates or extras", () => {
  const keys = fuelCorpora.map((entry) => entry.key).sort();
  expect(keys).toEqual([
    "agda-stdlib",
    "agda-unimath",
    "autoformalizing-hopf",
    "codex-homotopy-group",
  ]);
});

test("fuel corpora entries pin a full 40-hex-char commit SHA, never a short SHA or tag/branch name", () => {
  for (const entry of fuelCorpora) {
    expect(entry.pinnedRef).toMatch(/^[0-9a-f]{40}$/i);
  }
});

test("fuel corpora entries' policyKey resolves via the existing loadOraclePolicy() to a real, non-null policy", () => {
  for (const entry of fuelCorpora) {
    expect(loadOraclePolicy(entry.policyKey)).not.toBeNull();
  }
});

test("codex-homotopy-group is documented as the first official dogfood-run target (D-02)", () => {
  const entry = fuelCorpora.find((e) => e.key === "codex-homotopy-group");
  expect(entry).toBeDefined();
  expect(entry?.notes ?? "").toMatch(/first official dogfood-run target/i);
});
