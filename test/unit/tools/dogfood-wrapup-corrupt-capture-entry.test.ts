// MIT License — see LICENSE
//
// Regression for IN-05: dogfood-wrapup.mjs's scriptMain per-capture
// loop must isolate a corrupt/malformed stagedCaptures entry (e.g. a
// `null` element from a hand-edited or corrupted run-report.json)
// rather than aborting the whole judging run. Before the fix, the
// loop's catch block re-read `stagedPath` a second time directly off
// `staged` — which itself throws a TypeError on a null `staged`,
// escaping the `for` loop entirely and leaving every remaining
// capture (including perfectly valid ones after the corrupt entry)
// unjudged, with no wrapup-report.json ever written.
//
// A new file (rather than extending dogfood-wrapup-filing.test.ts or
// dogfood-wrapup-nonfinalized-report.test.ts) per this plan's own
// file-ownership note, avoiding any overlap with plan 09-04's edits.
//
// This drives the REAL scriptMain end to end (the buggy loop lives
// there, not in any DI-testable helper) with a deliberately VACUOUS
// second capture artifact (empty recordedActions, no oracleSubstrate)
// so the real runOracle/judgeOrcl02 pipeline abstains fast on every
// predicate (no load-family action to diff/scan/infer against) — zero
// Agda subprocess cost, matching this suite's "no real Agda cost"
// convention while still exercising the genuine per-capture loop.
// `node:child_process`'s `spawn` is partially mocked (importOriginal,
// only `spawn` overridden — mirrors test/unit/agda/
// spawn-error-listener.test.ts's own precedent for avoiding a real
// subprocess spawn in a fast unit test) so scriptMain's own
// unconditional D-12 upload-chain tail step never spawns a real
// `npx tsx` process here; the fake child immediately emits a clean
// `close` event, matching chainUploadRun's own DI-tested "normal
// close" contract.

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child as unknown as ReturnType<typeof actual.spawn>;
    },
  };
});

// @ts-expect-error script module lacks types
import { scriptMain } from "../../../scripts/dogfood/dogfood-wrapup.mjs";

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const priorExitCode = process.exitCode;

/** Temporarily overrides `process.env` entries for the duration of an
 *  async callback, restoring the previous values (or deleting the key
 *  entirely if it was previously unset) afterward — even on throw.
 *  Mirrors dogfood-upload-run.test.ts's own local helper. */
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

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
  process.exitCode = priorExitCode;
});

interface WrapupResultEntry {
  stagedPath: string;
  filed: boolean;
  classification: string;
  [key: string]: unknown;
}

interface WrapupReport {
  totalCaptures: number;
  errors: number;
  results: WrapupResultEntry[];
}

test("dogfood-wrapup scriptMain: a null stagedCaptures entry is recorded as classification 'error' and does not abort judging of the remaining valid entry", async () => {
  const runsRoot = makeTempDir("agda-mcp-wrapup-corrupt-runs-");
  const runId = "corrupt-entry-run";
  const runDir = join(runsRoot, runId);
  mkdirSync(runDir, { recursive: true });

  const captureDir = makeTempDir("agda-mcp-wrapup-corrupt-capture-");
  const validArtifactPath = join(captureDir, "capture.json");
  writeFileSync(
    validArtifactPath,
    JSON.stringify({
      capturedAt: new Date().toISOString(),
      manifest: {},
      // Deliberately vacuous: no load-family recorded action, so
      // ORCL-01/ORCL-02/ORCL-03 all abstain fast (no Agda cold-spawn,
      // no file scan) — this entry is genuinely judged, just never
      // filed.
      recordedActions: [],
      oracleSubstrate: null,
      triage: null,
      dedup: { kind: "new-bug", fingerprint: "corrupt-entry-test-fp", recurrence: 1 },
    }),
    "utf8",
  );

  writeFileSync(
    join(runDir, "run-report.json"),
    JSON.stringify({
      runId,
      startedAt: new Date().toISOString(),
      finalized: true,
      stagedCaptures: [null, { stagedPath: validArtifactPath }],
    }),
    "utf8",
  );

  const queueJsonPath = join(makeTempDir("agda-mcp-wrapup-corrupt-queue-"), "fix-queue.json");

  await withEnvOverride({ AGDA_MCP_DOGFOOD_RUNS_ROOT: runsRoot }, async () => {
    await scriptMain([runId, "--queue-path", queueJsonPath]);
  });

  const wrapupReport = JSON.parse(
    readFileSync(join(runDir, "wrapup-report.json"), "utf8"),
  ) as WrapupReport;

  expect(wrapupReport.totalCaptures).toBe(2);
  expect(wrapupReport.errors).toBe(1);

  const [firstResult, secondResult] = wrapupReport.results;
  expect(firstResult.classification).toBe("error");
  expect(firstResult.filed).toBe(false);
  // The second (valid) entry was reached and genuinely judged — the
  // loop was never aborted by the first entry's corruption.
  expect(secondResult.stagedPath).toBe(validArtifactPath);
  expect(secondResult.classification).not.toBe("error");
  expect(secondResult.filed).toBe(false);
});
