// MIT License — see LICENSE
//
// TEAM-05 acceptance walkthrough (08-CONTEXT.md's onboarding-doc-plus-
// proof plan): simulates a fresh teammate's clean machine driving
// scripts/team/install-pinned-env.mjs's exported pieces to a real,
// successful upload against a REAL local scripts/team/ingest-server.mjs
// instance — proving TEAM-05's local-mode fallback works end to end
// BEFORE any k8s cluster exists (DEPLOY-01's "local mode remains a
// working fallback" criterion, at its point of first truth).
//
// Zero real Agda dependency: the Agda locate/verify step is driven
// through `deps.execFileSync` FAKES simulating a correctly-pinned Agda
// 2.8.0 (this codebase's own DI-first convention for expensive/external
// operations — see test/unit/tools/team-install-pinned-env.test.ts for
// the same pattern applied to install-pinned-env.mjs's unit tests). The
// fuel-corpus clone is likewise driven through a no-op `execFileSync`
// fake — Task 1 of Plan 08-01 already separately proves the REAL
// git-clone mechanics against a local bare-repo fixture; this test's
// job is the end-to-end CHAIN, not re-proving git mechanics.
//
// The ONE real network call in this file is a loopback HTTP POST to a
// server this SAME test process starts and closes — see this plan's
// own threat register (T-08-13): the acceptance test's fixture
// run-report.json is written to a mkdtempSync scratch dir this test
// creates and cleans up, never a shared or persistent path.
//
// NOT gated behind RUN_AGDA_INTEGRATION — needs zero real Agda binary
// and must run on every `npm test`/CI invocation, proving TEAM-05's
// local-mode path continuously, not just once during phase execution.

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

import {
  getAgdaVersion,
  locateAgdaBinary,
  versionSatisfies,
  writeRunPinnedAgdaScript,
  // @ts-expect-error script module lacks types
} from "../../../scripts/team/install-pinned-env.mjs";
import {
  cloneAllFuelCorpora,
  // @ts-expect-error script module lacks types
} from "../../../scripts/team/clone-fuel-corpora.mjs";
// @ts-expect-error script module lacks types
import { createIngestServer } from "../../../scripts/team/ingest-server.mjs";
// @ts-expect-error script module lacks types
import { issueKey } from "../../../scripts/team/issue-key.mjs";
// @ts-expect-error script module lacks types
import { runUploadForRun } from "../../../scripts/dogfood/upload-run.mjs";

/** Temporarily overrides `process.env` entries for the duration of an
 *  async callback, restoring the previous values (or deleting the key
 *  entirely if it was previously unset) afterward — even on throw.
 *  Verbatim copy of test/unit/tools/dogfood-upload-run.test.ts's own
 *  helper — reused, not reinvented, per this plan's own action text. */
async function withEnvOverride<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

let scratchDir: string | undefined;
let server: Server | undefined;

afterEach(async () => {
  if (server) {
    const closingServer = server;
    await new Promise<void>((resolveClose) => closingServer.close(() => resolveClose()));
    server = undefined;
  }
  if (scratchDir) {
    rmSync(scratchDir, { recursive: true, force: true });
    scratchDir = undefined;
  }
});

test("fresh teammate: install -> issue key -> local ingest -> real upload succeeds", async () => {
  // Step 1: a clean scratch dir simulating a fresh teammate's machine —
  // never the real repo's .agda-mcp/ or ~/agda-mcp-fuel/.
  scratchDir = mkdtempSync(join(tmpdir(), "agda-mcp-onboarding-"));
  const fuelRoot = join(scratchDir, "fuel");
  const runsRoot = join(scratchDir, "runs");
  const keysPath = join(scratchDir, "keys", "team-keys.json");
  const storageDir = join(scratchDir, "storage");
  const uploadQueuePath = join(scratchDir, "upload-queue.jsonl");
  mkdirSync(storageDir, { recursive: true });

  // Step 2a: Agda locate + verify, driven through execFileSync FAKES
  // simulating a correctly-pinned Agda 2.8.0 — no real Agda binary
  // needed, this proves the SCRIPT LOGIC's happy path.
  const fakeExecFileSync = (command: string, args: readonly string[]) => {
    if (command === "which" && args[0] === "agda") {
      return Buffer.from("/usr/bin/agda\n");
    }
    if (command === "/usr/bin/agda" && args[0] === "--version") {
      return Buffer.from("Agda version 2.8.0\n");
    }
    throw new Error(`unexpected execFileSync invocation in Agda-verify fake: ${command} ${args.join(" ")}`);
  };

  const agdaPath = locateAgdaBinary({ execFileSync: fakeExecFileSync });
  expect(agdaPath).toBe("/usr/bin/agda");
  const agdaVersion = getAgdaVersion(agdaPath!, { execFileSync: fakeExecFileSync });
  expect(agdaVersion).toBe("2.8.0");
  expect(versionSatisfies(agdaVersion)).toBe(true);

  // Step 2b: writeRunPinnedAgdaScript runs FOR REAL against the temp
  // scratch dir (standing in for repoRoot) — asserts the generated file
  // is executable and contains an `exec` line.
  const runPinnedAgdaScriptPath = writeRunPinnedAgdaScript(scratchDir, agdaPath!);
  const scriptContent = readFileSync(runPinnedAgdaScriptPath, "utf8");
  expect(scriptContent).toContain("exec ");
  const scriptMode = statSync(runPinnedAgdaScriptPath).mode;
  expect(scriptMode & 0o111).not.toBe(0);

  // Step 2c: cloneAllFuelCorpora against the REAL scripts/data/fuel-corpora.json
  // (4 entries), with a no-op-success execFileSync fake standing in for
  // every git/gh invocation — proves the ORCHESTRATION wiring across all
  // 4 configured corpora, not the git mechanics themselves.
  const noopExecFileSync = () => Buffer.from("");
  const cloneResults = cloneAllFuelCorpora(fuelRoot, { execFileSync: noopExecFileSync });
  expect(cloneResults).toHaveLength(4);
  expect(cloneResults.every((result: any) => result.ok)).toBe(true);

  // Step 3: a REAL createIngestServer, listening on an OS-assigned
  // loopback port (avoids collisions with any other test/process).
  server = createIngestServer({ storageDir, maxBytes: 536_870_912, keysPath }) as Server;
  await new Promise<void>((resolveListen) => server!.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected createIngestServer to bind a TCP address with a port");
  }
  const port = address.port;

  // Step 4: a REAL issueKey call against the temp keys path.
  const { rawKey } = await issueKey("fresh-teammate", keysPath);
  expect(typeof rawKey).toBe("string");
  expect(rawKey.length).toBeGreaterThan(0);

  // Step 5: a minimal, valid run-report.json — an empty stagedCaptures
  // array is a legitimate, valid run report (the archive simply
  // contains no capture files).
  const runId = "fresh-teammate-onboarding-run-1";
  const runDir = join(runsRoot, runId);
  mkdirSync(runDir, { recursive: true });
  const runReport = {
    schemaVersion: 1,
    runId,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    endedAt: new Date().toISOString(),
    corpusRoot: join(fuelRoot, "agda-stdlib"),
    manifestPath: join(fuelRoot, "manifest.json"),
    totalToolCalls: 0,
    perTool: {},
    stagedCaptures: [] as unknown[],
    transcriptPath: join(runDir, "transcript.jsonl"),
    taskManifestCorpora: [] as unknown[],
  };
  writeFileSync(join(runDir, "run-report.json"), JSON.stringify(runReport, null, 2), "utf8");

  // Steps 6-8: AGDA_MCP_DOGFOOD_RUNS_ROOT points runUploadForRun at this
  // run's temp run directory; AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH keeps its
  // (unused on this success path, but always resolved) retry-queue
  // machinery off the real repo's .agda-mcp/ entirely — restored in a
  // finally by withEnvOverride, mirroring dogfood-upload-run.test.ts.
  // No `deps.fetch` override: this hits the real local server over a
  // real loopback socket. selectClaudeCodeLogs/selectCodexSessionLogs
  // ARE stubbed to empty arrays — agent-log-selection.mjs's own header
  // comment states real callers must "never let a test touch the real
  // ~/.claude"/~/.codex, and this run report claims no agent logs.
  const result = await withEnvOverride(
    { AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot, AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH: uploadQueuePath },
    () =>
      runUploadForRun(runId, {
        key: rawKey,
        url: `http://127.0.0.1:${port}/ingest`,
        deps: {
          selectClaudeCodeLogs: () => [],
          selectCodexSessionLogs: () => [],
        },
      }),
  );

  expect(result).toEqual({ attempted: true, uploaded: true });

  // Step 9: the archive really landed at ingest-server.mjs's own
  // documented <person>/<date>/<runId>.tar.gz layout.
  const today = new Date().toISOString().slice(0, 10);
  const archivePath = join(storageDir, "fresh-teammate", today, `${runId}.tar.gz`);
  expect(existsSync(archivePath)).toBe(true);

  // Step 10: server close + scratch-dir cleanup happen in afterEach.
});
