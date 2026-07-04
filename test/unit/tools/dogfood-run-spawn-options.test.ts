// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/dogfood-run.mjs's pure,
// side-effect-free functions — buildDogfoodChildOptions and
// computeProxyExitCode (no dependency injection or mocking needed) —
// plus the #39 source-text invariant: this proxy must never import
// AgdaSession. Mirrors test/unit/tools/queue-intake.test.ts's shape
// (no temp dirs needed here since neither function touches the
// filesystem).

import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { buildDogfoodChildOptions, computeProxyExitCode } from "../../../scripts/dogfood/dogfood-run.mjs";
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

// ── Behavior 6: proxy exit code — spawn/signal deaths are never a clean 0 ──

test("computeProxyExitCode: a spawn failure (error event, child never ran) exits 1, never 0", () => {
  // The WR-03 regression: `child.exitCode ?? 0` read a never-spawned
  // child (exitCode === null) as a clean exit 0, so a CI wrapper
  // gating on the proxy's status saw total startup failure as success.
  expect(
    computeProxyExitCode({
      childExitCode: null,
      childSignalCode: null,
      childFailed: true,
      proxyKilledChild: false,
    }),
  ).toBe(1);
});

test("computeProxyExitCode: childFailed dominates even when finalize's kill guard also ran", () => {
  // finalize()'s guard calls child.kill() whenever exitCode/signalCode
  // are both null — including on the error-event path. The 'error'
  // death must stay non-zero regardless of what that kill attempt
  // reported.
  expect(
    computeProxyExitCode({
      childExitCode: null,
      childSignalCode: null,
      childFailed: true,
      proxyKilledChild: true,
    }),
  ).toBe(1);
});

test("computeProxyExitCode: a spontaneous signal death (not proxy-initiated) exits 1", () => {
  // iter2 IN-03's facet, folded into WR-03: an OOM kill or an
  // operator's kill -9 aimed at the server leaves exitCode === null
  // with a signalCode — that is a failed run, not a clean one.
  expect(
    computeProxyExitCode({
      childExitCode: null,
      childSignalCode: "SIGKILL",
      childFailed: false,
      proxyKilledChild: false,
    }),
  ).toBe(1);
});

test("computeProxyExitCode: the proxy's own child.kill() teardown (agent disconnect) legitimately exits 0", () => {
  expect(
    computeProxyExitCode({
      childExitCode: null,
      childSignalCode: "SIGTERM",
      childFailed: false,
      proxyKilledChild: true,
    }),
  ).toBe(0);
});

test("computeProxyExitCode: childFailed is consulted in the SIGNAL branch too, not just the both-null branch (WR-10, from-RED)", () => {
  // The pre-WR-07 formula was
  // `childFailed || (childSignalCode != null && !proxyKilledChild) ? 1 : 0`,
  // which ORs childFailed into the failure condition regardless of
  // proxyKilledChild. WR-07's rewrite silently dropped childFailed once
  // childSignalCode became non-null, so a child that fired an 'error'
  // event and ALSO later received a legitimate, proxy-initiated signal
  // death reported a false clean 0 (see the review's own direct
  // repro: OLD => 1, WR-07-regressed => 0). Same inputs as the test
  // directly above except childFailed:true — this must still be a
  // failure, exactly like the pre-WR-07 formula.
  expect(
    computeProxyExitCode({
      childExitCode: null,
      childSignalCode: "SIGTERM",
      childFailed: true,
      proxyKilledChild: true,
    }),
  ).toBe(1);
});

test("computeProxyExitCode: a child that exited on its own passes its exit code straight through", () => {
  expect(
    computeProxyExitCode({
      childExitCode: 0,
      childSignalCode: null,
      childFailed: false,
      proxyKilledChild: false,
    }),
  ).toBe(0);
  expect(
    computeProxyExitCode({
      childExitCode: 3,
      childSignalCode: null,
      childFailed: false,
      proxyKilledChild: false,
    }),
  ).toBe(3);
});

test("computeProxyExitCode: a still-UNCONFIRMED child at report time (no code, no signal, no failure) now exits 1, never a false-clean 0 (WR-07, from-RED)", () => {
  // WR-07: this is the EXACT false-negative the review reported — the
  // bounded 2s drain race (and, pre-fix, no SIGKILL escalation at all)
  // can elapse before a killed child has actually exited. The OLD
  // behavior treated `proxyKilledChild:true` here as "nothing abnormal
  // was observed, so 0" — but `child.kill()` returning true only means a
  // signal was DELIVERABLE, never that the process died, so a wedged
  // child could be leaked as an orphan while run-report.json still
  // claimed a clean, successful exit. An unconfirmed child (both
  // childExitCode and childSignalCode null) is now ALWAYS a failure,
  // regardless of proxyKilledChild — finalize() itself (see
  // dogfood-run.mjs) additionally escalates to SIGKILL and waits a
  // second bounded window before ever reaching this state, so this
  // branch should only fire in the rare case even SIGKILL didn't
  // produce a confirmed death in time.
  expect(
    computeProxyExitCode({
      childExitCode: null,
      childSignalCode: null,
      childFailed: false,
      proxyKilledChild: true,
    }),
  ).toBe(1);
});
