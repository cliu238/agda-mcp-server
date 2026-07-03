// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/dogfood-run.mjs's
// buildDogfoodChildOptions (a pure, side-effect-free function — no
// dependency injection or mocking needed) plus the #39 source-text
// invariant: this proxy must never import AgdaSession. Mirrors
// test/unit/tools/queue-intake.test.ts's shape (no temp dirs needed
// here since buildDogfoodChildOptions touches no filesystem).

import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { buildDogfoodChildOptions } from "../../../scripts/dogfood/dogfood-run.mjs";
import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";

const DOGFOOD_RUN_PATH = join(SERVER_REPO_ROOT, "scripts", "dogfood", "dogfood-run.mjs");

// ── Behavior 1: AGDA_MCP_CAPTURE is unconditional, never shadowed ────

test("buildDogfoodChildOptions unconditionally sets AGDA_MCP_CAPTURE=1, even when extraEnv tries to override it", () => {
  const options = buildDogfoodChildOptions({ corpusRoot: "/tmp/foo" });
  expect(options.env.AGDA_MCP_CAPTURE).toBe("1");

  const shadowed = buildDogfoodChildOptions({
    corpusRoot: "/tmp/foo",
    extraEnv: { AGDA_MCP_CAPTURE: "0" },
  });
  expect(shadowed.env.AGDA_MCP_CAPTURE).toBe("1");
});

// ── Behavior 2: AGDA_MCP_ROOT + dist/index.js resolved under SERVER_REPO_ROOT ──

test("buildDogfoodChildOptions sets AGDA_MCP_ROOT to corpusRoot and resolves dist/index.js under SERVER_REPO_ROOT", () => {
  const options = buildDogfoodChildOptions({ corpusRoot: "/tmp/foo" });
  expect(options.env.AGDA_MCP_ROOT).toBe("/tmp/foo");

  const distArg = options.args.find((arg: string) => arg.endsWith("dist/index.js"));
  expect(distArg).toBeTruthy();
  expect(distArg?.startsWith(SERVER_REPO_ROOT)).toBe(true);
  expect(distArg?.startsWith("/tmp/foo")).toBe(false);
});

// ── Behavior 3: fixed pipe/pipe/pipe stdio, never inherited ──────────

test("buildDogfoodChildOptions returns a fixed ['pipe','pipe','pipe'] stdio tuple", () => {
  const options = buildDogfoodChildOptions({ corpusRoot: "/tmp/foo" });
  expect(options.stdio).toEqual(["pipe", "pipe", "pipe"]);
});

// ── Behavior 4: #39 source-text invariant — never imports AgdaSession ─

test("dogfood-run.mjs's own source text never imports AgdaSession (#39)", () => {
  const source = readFileSync(DOGFOOD_RUN_PATH, "utf8");
  // Anchored, real-import-statement check (not a bare substring match)
  // — a comment merely MENTIONING "AgdaSession" while explaining this
  // invariant must not self-invalidate the test.
  expect(source).not.toMatch(/^import\s*\{[^}]*\bAgdaSession\b/m);
});

// ── Behavior 5: source-text invariant — proxy stdout/stderr carry 'error' listeners ──

test("dogfood-run.mjs registers 'error' listeners on process.stdout and process.stderr so an abrupt agent death cannot EPIPE-crash the proxy before run-report.json is written", () => {
  const source = readFileSync(DOGFOOD_RUN_PATH, "utf8");
  // An agent dying mid-session closes the read ends of the proxy's
  // stdout/stderr pipes; any line still draining during the finalize
  // window then raises an ASYNC 'error' (EPIPE) event on the stream.
  // Without a listener that is an uncaught exception that kills the
  // proxy BEFORE writeRunReport — losing the whole run's judgeable
  // record. These listeners are the crash guard; removing either one
  // silently reintroduces the loss.
  expect(source).toMatch(/process\.stdout\.on\(\s*["']error["']/);
  expect(source).toMatch(/process\.stderr\.on\(\s*["']error["']/);
});
