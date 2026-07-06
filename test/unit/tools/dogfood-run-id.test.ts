// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/run-id.mjs's assertSafeRunId(): the
// IN-01 guard shared by both dogfood CLIs (dogfood-run.mjs's --run-id
// flag and dogfood-wrapup.mjs's positional run-id) since Health Report
// CUT-01 extracted the previously-duplicated (and already-drifted)
// per-CLI copies into this one shared module. The message text is the
// more-informative `--run-id`-flag-shaped form for both callers, per
// 12-PATTERNS.md Pattern 3's own recommendation — a deliberate,
// documented behavior change for dogfood-wrapup.mjs's positional
// caller (whose own local copy previously said "invalid run-id"), not
// a pure refactor.

import { expect, test } from "vitest";

// @ts-expect-error script module lacks types
import { assertSafeRunId } from "../../../scripts/dogfood/run-id.mjs";

// ── IN-01: rejects a flag-shaped, path-traversing, or separator-bearing run-id ──

test('assertSafeRunId throws when the run-id starts with "--" (an accidentally-swallowed flag token)', () => {
  expect(() => assertSafeRunId("--corpus-root")).toThrow(/invalid --run-id value/);
});

test("assertSafeRunId throws when the run-id contains a forward slash", () => {
  expect(() => assertSafeRunId("foo/bar")).toThrow(/invalid --run-id value/);
});

test("assertSafeRunId throws when the run-id contains a backslash", () => {
  expect(() => assertSafeRunId("foo\\bar")).toThrow(/invalid --run-id value/);
});

test('assertSafeRunId throws on a bare "."', () => {
  expect(() => assertSafeRunId(".")).toThrow(/invalid --run-id value/);
});

test('assertSafeRunId throws on a bare ".." (path-traversal escape)', () => {
  expect(() => assertSafeRunId("..")).toThrow(/invalid --run-id value/);
});

test("assertSafeRunId does not throw on a normal run-id value", () => {
  expect(() => assertSafeRunId("my-run-1")).not.toThrow();
});

test("assertSafeRunId's thrown message names the offending value and the violated rule", () => {
  expect(() => assertSafeRunId("--bad")).toThrow(
    'invalid --run-id value "--bad": must not start with "--" or contain a path separator',
  );
});
