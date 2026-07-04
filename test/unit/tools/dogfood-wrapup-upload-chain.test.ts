// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/dogfood-wrapup.mjs's chainUploadRun():
// D-12's unconditional upload-chain tail step. Fully DI-driven — every
// test injects a fake `spawn` via `options.deps.spawn`, so no real
// tsx/upload-run.mjs subprocess or network call is ever paid here.
// The fake child mirrors test/unit/agda/spawn-error-listener.test.ts's
// "a bare EventEmitter is close enough to a ChildProcess for `.on()`
// wiring" convention — chainUploadRun only ever calls `.on("error", ...)`
// / `.on("close", ...)` on the spawned handle (stdio is fully
// ["ignore","inherit","inherit"], so no stdout/stderr listeners are
// attached by this module itself).
//
// The critical invariant under test (T-07-16): chainUploadRun's own
// return value is informational only and must NEVER be read by its
// caller to set process.exitCode — proven directly here by asserting
// process.exitCode is unaffected by calling chainUploadRun, in both
// directions (already-1 stays 1; already-unset stays unset).

import { afterEach, expect, test, vi } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { chainUploadRun } from "../../../scripts/dogfood/dogfood-wrapup.mjs";
import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";

const DOGFOOD_WRAPUP_PATH = join(SERVER_REPO_ROOT, "scripts", "dogfood", "dogfood-wrapup.mjs");
const EXPECTED_UPLOAD_RUN_PATH = join(SERVER_REPO_ROOT, "scripts", "dogfood", "upload-run.mjs");

function makeFakeChild(): EventEmitter {
  return new EventEmitter();
}

const priorExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = priorExitCode;
});

// ── Behavior 1: spawns npx tsx <sibling upload-run.mjs> <runId>, shell:false ──

test("chainUploadRun spawns npx tsx against the sibling upload-run.mjs with runId as the argument, shell:false", () => {
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn((_command: string, _args: string[], _options: { shell?: boolean }) => fakeChild);

  const resultPromise = chainUploadRun("run-123", { deps: { spawn: spawnFn } });

  expect(spawnFn).toHaveBeenCalledTimes(1);
  const [command, args, options] = spawnFn.mock.calls[0];
  expect(command).toBe("npx");
  expect(args).toEqual(["tsx", EXPECTED_UPLOAD_RUN_PATH, "run-123"]);
  expect(options.shell).toBe(false);

  fakeChild.emit("close", 0);
  return resultPromise;
});

// ── Behavior 2: resolves {attempted:true} on a normal close, regardless of the child's own exit code ──

test("chainUploadRun resolves {attempted:true} on a normal close, even when the child's own exit code is non-zero", async () => {
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn(() => fakeChild);

  const resultPromise = chainUploadRun("run-abc", { deps: { spawn: spawnFn } });
  fakeChild.emit("close", 1);
  const result = await resultPromise;

  expect(result).toEqual({ attempted: true });
});

// ── Behavior 3: never throws — an async spawn 'error' event resolves {attempted:false, reason:"spawn-failed"} ──

test("chainUploadRun never throws: a spawn 'error' event (missing tsx, ENOENT) resolves {attempted:false, reason:'spawn-failed'}", async () => {
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn(() => fakeChild);

  const resultPromise = chainUploadRun("run-xyz", { deps: { spawn: spawnFn } });
  fakeChild.emit("error", new Error("spawn npx ENOENT"));

  await expect(resultPromise).resolves.toEqual({ attempted: false, reason: "spawn-failed" });
});

test("chainUploadRun never throws even when spawnFn itself throws synchronously", async () => {
  const spawnFn = vi.fn(() => {
    throw new Error("boom");
  });

  await expect(chainUploadRun("run-sync-throw", { deps: { spawn: spawnFn } })).resolves.toEqual({
    attempted: false,
    reason: "spawn-failed",
  });
});

// ── Behavior 4: process.exitCode invariant — never clears/downgrades an already-set non-zero exit code ──

test("chainUploadRun's own invocation never clears an already-set non-zero process.exitCode (success path)", async () => {
  process.exitCode = 1;
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn(() => fakeChild);

  const resultPromise = chainUploadRun("run-exitcode-1-ok", { deps: { spawn: spawnFn } });
  fakeChild.emit("close", 0);
  await resultPromise;

  expect(process.exitCode).toBe(1);
});

test("chainUploadRun's own invocation never clears an already-set non-zero process.exitCode (spawn-failed path)", async () => {
  process.exitCode = 1;
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn(() => fakeChild);

  const resultPromise = chainUploadRun("run-exitcode-1-fail", { deps: { spawn: spawnFn } });
  fakeChild.emit("error", new Error("spawn npx ENOENT"));
  await resultPromise;

  expect(process.exitCode).toBe(1);
});

// ── Behavior 5: process.exitCode invariant — never SETS a non-zero exit code on its own ──

test("chainUploadRun never sets a non-zero process.exitCode on its own, even on a failed/no-op chain attempt", async () => {
  process.exitCode = undefined;
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn(() => fakeChild);

  const resultPromise = chainUploadRun("run-exitcode-unset", { deps: { spawn: spawnFn } });
  fakeChild.emit("error", new Error("spawn npx ENOENT"));
  await resultPromise;

  expect(process.exitCode).toBeUndefined();
});

test("chainUploadRun never sets a non-zero process.exitCode on its own, on a successful close", async () => {
  process.exitCode = undefined;
  const fakeChild = makeFakeChild();
  const spawnFn = vi.fn(() => fakeChild);

  const resultPromise = chainUploadRun("run-exitcode-unset-ok", { deps: { spawn: spawnFn } });
  fakeChild.emit("close", 0);
  await resultPromise;

  expect(process.exitCode).toBeUndefined();
});

// ── Behavior 6: source-text order invariant — the chain call sits strictly AFTER the errors>0 exit-code branch ──

test("dogfood-wrapup.mjs's scriptMain calls chainUploadRun strictly AFTER the summary.errors > 0 exit-code branch", () => {
  const source = readFileSync(DOGFOOD_WRAPUP_PATH, "utf8");
  const exitCodeBranchIndex = source.indexOf("if (summary.errors > 0)");
  const chainCallIndex = source.indexOf("await chainUploadRun(runId)");

  expect(exitCodeBranchIndex).toBeGreaterThan(-1);
  expect(chainCallIndex).toBeGreaterThan(-1);
  expect(chainCallIndex).toBeGreaterThan(exitCodeBranchIndex);
});

// ── Behavior 7: spawn (never execFileSync) is used for the chain step (CWE-78 discipline) ──

test("dogfood-wrapup.mjs imports spawn (not execFileSync) from node:child_process for the upload chain step", () => {
  const source = readFileSync(DOGFOOD_WRAPUP_PATH, "utf8");
  // Narrowly checks the actual node:child_process import specifier list
  // (not the whole file) — a comment elsewhere explaining "spawn, never
  // execFileSync, because ..." is legitimate established prose in this
  // codebase and must not fail this check.
  const importMatch = source.match(/import\s*\{([^}]*)\}\s*from\s*["']node:child_process["']/);
  expect(importMatch).not.toBeNull();
  expect(importMatch?.[1]).toMatch(/\bspawn\b/);
  expect(importMatch?.[1]).not.toMatch(/execFileSync/);
});
