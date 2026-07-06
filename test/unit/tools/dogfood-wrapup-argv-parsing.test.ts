// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/dogfood-wrapup.mjs's parseWrapupArgv:
// IN-01's fix. The run-id is a POSITIONAL argv[0] (unlike
// dogfood-run.mjs's --run-id flag), so the failure mode is subtly
// different — omitting the run-id entirely while still passing another
// flag (e.g. `--rerun-n 3` with no run-id) lets that flag token itself
// land in the positional run-id slot. A separate new file (rather than
// extending dogfood-wrapup-filing.test.ts) per this plan's own
// file-ownership note, avoiding any overlap with plan 09-04's edits to
// that file. Mirrors dogfood-run-spawn-options.test.ts's
// mkdtempSync-free style — parseWrapupArgv never touches the
// filesystem.

import { expect, test } from "vitest";

// @ts-expect-error script module lacks types
import { parseWrapupArgv } from "../../../scripts/dogfood/dogfood-wrapup.mjs";

// ── IN-01: parseWrapupArgv rejects a flag-shaped/path-traversing run-id ──

test("parseWrapupArgv throws when the positional run-id is flag-shaped (no run-id given, --rerun-n lands in its slot)", () => {
  expect(() => parseWrapupArgv(["--rerun-n", "3"])).toThrow(/invalid --run-id value/);
});

test("parseWrapupArgv throws when the positional run-id could escape the runs root via path traversal", () => {
  expect(() => parseWrapupArgv([".."])).toThrow(/invalid --run-id value/);
});

test("parseWrapupArgv accepts a normal positional run-id value unchanged", () => {
  const result = parseWrapupArgv(["my-run-1"]);
  expect(result.runId).toBe("my-run-1");
});

// ── Regression: an entirely absent run-id is still left for scriptMain's own usage message, not thrown here ──

test("parseWrapupArgv does not throw when argv is empty (no run-id at all) — scriptMain's own usage-message branch handles this", () => {
  let result: { runId: string | undefined };
  expect(() => {
    result = parseWrapupArgv([]);
  }).not.toThrow();
  expect(result!.runId).toBeUndefined();
});
