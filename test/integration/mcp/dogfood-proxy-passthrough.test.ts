// MIT License — see LICENSE
//
// End-to-end proof of Plan 05-02's D-01 transparent recording proxy:
// an MCP `Client` connected THROUGH `scripts/dogfood/dogfood-run.mjs`
// (rather than directly at `dist/index.js`, as `createMcpHarness`
// does) sees the same tool set and can successfully round-trip a
// `tools/call` for `agda_capture_session` — proving the proxy
// transparently wraps the ONE real spawned server process without
// ever constructing a second `AgdaSession` (#39) itself. The observed
// capture must also be recorded into a run report, with no separate
// manual step. (The proxy's prior auto-persist-into-dedup-index step,
// scripts/promote-capture.mjs, was retired 2026-07 — DEBT-02, see
// PROJECT.md Key Decisions — since Phase 4 repointed readDedupIndex()
// to test/fixtures/fix-queue.json, leaving that index with zero
// readers.)
//
// This test intentionally does NOT reuse `createMcpHarness`
// (test/helpers/mcp-harness.ts): `buildHarnessServerParameters`
// hardcodes `args: [resolve(serverRepoRoot, "dist/index.js")]` — it
// always targets the bare server, never a custom command. Instead this
// file builds the SAME underlying SDK primitives
// (`Client`/`StdioClientTransport`) directly, pointed at the proxy
// script.
//
// RED-state note (Task 1 of 3): `scripts/dogfood/dogfood-run.mjs` and
// `scripts/dogfood/transcript-writer.mjs` do not exist yet at the time
// this file is committed — running this test now MUST fail with a
// spawn/module-resolution error naming the missing
// `dogfood-run.mjs` script (surfaced as a connection failure on
// `client.connect(transport)`, since `tsx` itself reports "Cannot find
// module .../dogfood-run.mjs" on its stderr and exits before ever
// speaking MCP). This is the expected RED state; Task 3
// (`dogfood-run.mjs`) turns it GREEN.
//
// Gated with the SAME `agdaAvailable && RUN_AGDA_INTEGRATION === "1"`
// idiom every `test/integration/mcp/*.test.ts` file in this repo uses
// (see test/integration/mcp/capture-regression.test.ts), even though
// this file never calls into Agda directly — the gate really means
// "requires a real `npm run build`-produced `dist/index.js` and a
// spawned subprocess," which this proxy test needs just as much as any
// sibling file in this directory. `pretest` already guarantees the
// build ran before `npm test`; standalone `vitest run` invocations
// must `npm run build` first, exactly like every other file here.

import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";
import { detectAgdaVersion } from "../../helpers/agda-version.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;

const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

// A fixed, test-chosen run id so every test in this file can assert on
// a KNOWN run-report path (`<runsRoot>/<RUN_ID>/run-report.json`)
// rather than having to discover a generated id first.
const RUN_ID = "proxy-passthrough-test";

/** Same shape as mcp-harness.ts's own private helper — StdioServerParameters.env
 *  is typed `Record<string, string>` (no `undefined` values allowed), while
 *  `process.env` is `Record<string, string | undefined>`. */
function filterStringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

let corpusRoot: string;
let runsRoot: string;
let manifestPath: string;
let priorRunsRootEnv: string | undefined;

beforeAll(() => {
  // The fake "corpus" this proxy run targets. No real Agda file is
  // needed since only `tools/list` and `agda_capture_session` are
  // exercised (agda_capture_session is state-agnostic per D-01 —
  // callable with zero prior agda_load, per src/tools/register-
  // capture-session.ts's `requiresLoadedSession: false`).
  corpusRoot = mkdtempSync(join(tmpdir(), "agda-mcp-dogfood-proxy-corpus-"));
  // The proxy's OWN run artifacts (transcript/run-report) go to a
  // SEPARATE temp dir via AGDA_MCP_DOGFOOD_RUNS_ROOT, so this test
  // never writes into the real repo's .agda-mcp/runs/.
  runsRoot = mkdtempSync(join(tmpdir(), "agda-mcp-dogfood-proxy-runs-"));

  manifestPath = join(corpusRoot, "task-manifest.json");
  // A valid one-entry task manifest — matches Plan 05-01's
  // taskManifestEntrySchema (target/expectedSignature/corpus/notes).
  writeFileSync(
    manifestPath,
    JSON.stringify([
      {
        target: "dogfood-proxy-passthrough smoke target",
        expectedSignature: "smoke : Smoke",
        corpus: "dogfood-proxy-passthrough-fixture",
        notes: "Synthetic single-entry manifest for the proxy passthrough test — no real corpus needed.",
      },
    ]),
    "utf8",
  );

  priorRunsRootEnv = process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT;
  process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT = runsRoot;
});

afterAll(() => {
  if (priorRunsRootEnv === undefined) {
    delete process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT;
  } else {
    process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT = priorRunsRootEnv;
  }
  rmSync(corpusRoot, { recursive: true, force: true });
  rmSync(runsRoot, { recursive: true, force: true });
});

// Every connection opened by a test is tracked here and force-closed
// in afterEach, so a failing assertion mid-test can never leak a
// spawned proxy (and its own spawned server child) past that test.
let openTransports: StdioClientTransport[] = [];

afterEach(async () => {
  const transports = openTransports;
  openTransports = [];
  for (const transport of transports) {
    await transport.close();
  }
});

async function connectThroughDogfoodProxy({
  manifestPath: manifest,
  corpusRoot: corpus,
  runId,
}: {
  manifestPath: string;
  corpusRoot: string;
  runId: string;
}): Promise<{ client: Client; transport: StdioClientTransport; close(): Promise<void> }> {
  const transport = new StdioClientTransport({
    // Resolved node_modules/.bin/tsx (not `npx tsx`) — avoids npx's own
    // package-resolution overhead in a hot test path.
    command: resolve(SERVER_REPO_ROOT, "node_modules/.bin/tsx"),
    args: [
      resolve(SERVER_REPO_ROOT, "scripts/dogfood/dogfood-run.mjs"),
      "--manifest",
      manifest,
      "--corpus-root",
      corpus,
      "--run-id",
      runId,
    ],
    cwd: SERVER_REPO_ROOT,
    env: filterStringEnv(process.env),
    stderr: "pipe",
  });
  openTransports.push(transport);

  const client = new Client({ name: "dogfood-proxy-test", version: "0.0.0" });
  await client.connect(transport);

  return {
    client,
    transport,
    async close() {
      await transport.close();
      openTransports = openTransports.filter((t) => t !== transport);
    },
  };
}

it("connecting through dogfood-run.mjs transparently reaches the real server's tool list", async () => {
  const { client, close } = await connectThroughDogfoodProxy({ manifestPath, corpusRoot, runId: RUN_ID });
  try {
    const result = await client.listTools();
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.some((tool) => tool.name === "agda_capture_session")).toBe(true);
    expect(result.tools.some((tool) => tool.name === "agda_load")).toBe(true);
  } finally {
    await close();
  }
});

it("calling agda_capture_session through the proxy succeeds and returns a staged path", async () => {
  const { client, close } = await connectThroughDogfoodProxy({ manifestPath, corpusRoot, runId: RUN_ID });
  try {
    const result = await client.callTool({ name: "agda_capture_session", arguments: {} });
    expect(result.isError).toBeFalsy();
    const data = (result.structuredContent as { data?: { stagedPath?: unknown; fingerprint?: unknown } } | undefined)
      ?.data;
    expect(typeof data?.stagedPath).toBe("string");
    expect(typeof data?.fingerprint).toBe("string");
  } finally {
    await close();
  }
});

it("writes a run report under the runs-root recording the staged capture after the connection closes", async () => {
  const { client, close } = await connectThroughDogfoodProxy({ manifestPath, corpusRoot, runId: RUN_ID });
  let stagedPath: string;
  try {
    const result = await client.callTool({ name: "agda_capture_session", arguments: {} });
    const data = (result.structuredContent as { data?: { stagedPath?: unknown } } | undefined)?.data;
    expect(typeof data?.stagedPath).toBe("string");
    stagedPath = data!.stagedPath as string;
  } finally {
    await close();
  }

  const reportPath = join(runsRoot, RUN_ID, "run-report.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    stagedCaptures: Array<{ stagedPath: string }>;
  };
  expect(Array.isArray(report.stagedCaptures)).toBe(true);
  expect(report.stagedCaptures.some((entry) => entry.stagedPath === stagedPath)).toBe(true);
});
