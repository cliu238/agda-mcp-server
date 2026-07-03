// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/dogfood-wrapup.mjs's wrapUpCapture():
// the auto-chained oracle -> flake-gate -> file-or-sidechannel
// pipeline (D-04). Fully DI-driven — every test injects a fake
// runOracle/classifyFlakiness/upsertQueueEntry/appendFlakyLog via
// `config.deps`, so no real Agda/subprocess/filesystem cost is ever
// paid here. `config.queueJsonPath` is always a mkdtempSync-created
// THROWAWAY temp file path, never the real tracked
// test/fixtures/fix-queue.json, even though upsertQueueEntry itself is
// mocked in every test below and would not literally touch it — this
// keeps each test's OWN config honest and safe if a future refactor
// ever removes the mock.

import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { buildQueueEntryFromVerdict, wrapUpCapture } from "../../../scripts/dogfood/dogfood-wrapup.mjs";

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

/** A throwaway temp file path — NEVER the real tracked fix-queue.json. */
function throwawayQueuePath(): string {
  return join(makeTempDir("agda-mcp-wrapup-queue-"), "fix-queue.json");
}

function throwawayFlakyLogPath(): string {
  return join(makeTempDir("agda-mcp-wrapup-flakylog-"), "flaky-captures.jsonl");
}

function baseArtifact(overrides: { recordedActions?: unknown[] } = {}) {
  return {
    capturedAt: new Date().toISOString(),
    manifest: {},
    recordedActions: overrides.recordedActions ?? [
      { tool: "agda_load", args: { file: "Main.agda" }, timestamp: Date.now(), normalizedResponse: {} },
    ],
    oracleSubstrate: null,
    triage: null,
    dedup: { kind: "new-bug", fingerprint: "wrapup-test-fingerprint", recurrence: 1 },
  };
}

function fakeVerdict(overrides: {
  orcl01?: Record<string, unknown>;
  orcl02?: Record<string, unknown>;
}) {
  const orcl01 = overrides.orcl01 ?? { kind: "pass" };
  const orcl02 = overrides.orcl02 ?? { kind: "clean" };
  return {
    schemaVersion: 1,
    capturePath: "fake-capture.json",
    fingerprint: "wrapup-test-fingerprint",
    recurrence: 1,
    computedAt: new Date().toISOString(),
    orcl01,
    orcl02,
    orcl03: { kind: "vacuous-no-expected-signature" },
    consistencyProbe: { attempted: false },
    trueGreen: orcl01.kind === "pass" && orcl02.kind === "clean",
  };
}

function cheatFindings() {
  return [{ file: "Postulates.agda", line: 4, kind: "postulate", detail: "unsafeAxiom", sanctioned: false }];
}

// ── Test 1: true-green -> not filed; classifyFlakiness/upsertQueueEntry never called ──

test("wrapUpCapture: a true-green verdict (orcl01=pass, orcl02=clean) is never filed and never classified for flakiness", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "pass" }, orcl02: { kind: "clean" } }));
  const classifyFn = vi.fn();
  const upsertFn = vi.fn();
  const appendFlakyFn = vi.fn();

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn, appendFlakyLog: appendFlakyFn },
  });

  expect(result.filed).toBe(false);
  expect(result.classification).toBe("not-a-candidate");
  expect(upsertFn).not.toHaveBeenCalled();
  expect(classifyFn).not.toHaveBeenCalled();
  expect(appendFlakyFn).not.toHaveBeenCalled();
});

// ── Test 2: an abstention (INCONCLUSIVE / no-policy) is never auto-filed ──

test("wrapUpCapture: an INCONCLUSIVE orcl01 + no-policy orcl02 abstention is never auto-filed as a defect", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () =>
    fakeVerdict({
      orcl01: { kind: "inconclusive", probe: "spawn", detail: "env probe failed" },
      orcl02: { kind: "no-policy", findings: [] },
    }),
  );
  const upsertFn = vi.fn();

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, upsertQueueEntry: upsertFn },
  });

  expect(result.filed).toBe(false);
  expect(result.classification).toBe("not-a-candidate");
  expect(upsertFn).not.toHaveBeenCalled();
});

// ── Test 3: deterministic ORCL-01 candidate -> filed ─────────────────

test("wrapUpCapture: a server-false-green-candidate that N-reruns as deterministic is filed as status new", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }));
  const classifyFn = vi.fn(async () => ({ classification: "deterministic", observedClassifications: ["type-error", "type-error", "type-error"] }));
  const upsertFn = vi.fn(async (entry: unknown) => entry);

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn },
  });

  expect(result.filed).toBe(true);
  expect(upsertFn).toHaveBeenCalledTimes(1);
  const [entry] = upsertFn.mock.calls[0];
  expect(entry.status).toBe("new");
  expect(entry.defectKind).toBe("false-green");
  expect(entry.fingerprint).toBe(artifact.dedup.fingerprint);
});

// ── Test 4: flaky ORCL-01 candidate -> not filed, appended to side-channel ──

test("wrapUpCapture: a server-false-green-candidate that N-reruns as flaky is never filed and is appended to the side-channel exactly once", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }));
  const classifyFn = vi.fn(async () => ({ classification: "flaky", observedClassifications: ["ok-complete", "type-error", "ok-complete"] }));
  const upsertFn = vi.fn();
  const appendFlakyFn = vi.fn();

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn, appendFlakyLog: appendFlakyFn },
  });

  expect(result.filed).toBe(false);
  expect(result.classification).toBe("flaky");
  expect(upsertFn).not.toHaveBeenCalled();
  expect(appendFlakyFn).toHaveBeenCalledTimes(1);
});

// ── Test 5: ORCL-02 cheat-flagged alone -> filed WITHOUT ever calling classifyFlakiness ──

test("wrapUpCapture: an orcl02 cheat-flagged verdict (orcl01=skip) is filed directly, without ever calling classifyFlakiness", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () =>
    fakeVerdict({
      orcl01: { kind: "skip", reason: "no load-family recorded action to diff against" },
      orcl02: { kind: "cheat-flagged", findings: cheatFindings() },
    }),
  );
  const classifyFn = vi.fn();
  const upsertFn = vi.fn(async (entry: unknown) => entry);

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn },
  });

  expect(result.filed).toBe(true);
  expect(upsertFn).toHaveBeenCalledTimes(1);
  expect(classifyFn).not.toHaveBeenCalled();
});

// ── Test 6 (precedence / the blocker fix): a co-occurring ORCL-02 cheat always wins ──

test("wrapUpCapture: an orcl02 cheat-flagged signal files even when a co-occurring orcl01 server-false-green-candidate would N-rerun as flaky, and never touches the flake gate", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () =>
    fakeVerdict({
      orcl01: { kind: "server-false-green-candidate" },
      orcl02: { kind: "cheat-flagged", findings: cheatFindings() },
    }),
  );
  // A deliberate trap: if precedence were implemented wrong, this
  // "flaky" classification would route the whole capture to the
  // side-channel instead of filing it.
  const classifyFn = vi.fn(async () => ({ classification: "flaky", observedClassifications: ["ok-complete", "type-error"] }));
  const upsertFn = vi.fn(async (entry: unknown) => entry);
  const appendFlakyFn = vi.fn();

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn, appendFlakyLog: appendFlakyFn },
  });

  expect(result.filed).toBe(true);
  expect(upsertFn).toHaveBeenCalledTimes(1);
  expect(classifyFn).not.toHaveBeenCalled();
  expect(appendFlakyFn).not.toHaveBeenCalled();
});

// ── buildQueueEntryFromVerdict: direct coverage of the exported pure helper ──

test("buildQueueEntryFromVerdict: verdictPath is a pure suffix-replace on the input artifactPath", () => {
  const artifact = baseArtifact();
  const verdict = fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } });

  const entry = buildQueueEntryFromVerdict(artifact, "/runs/abc/staged/my-capture.json", verdict);

  expect(entry.capturePath).toBe("/runs/abc/staged/my-capture.json");
  expect(entry.verdictPath).toBe("/runs/abc/staged/my-capture.verdict.json");
});

test("buildQueueEntryFromVerdict: the summary differs between an orcl01 candidate and an orcl02 cheat-flagged finding", () => {
  const artifact = baseArtifact();

  const orcl01Entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }),
  );
  const orcl02Entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({
      orcl01: { kind: "pass" },
      orcl02: { kind: "cheat-flagged", findings: cheatFindings() },
    }),
  );

  expect(orcl01Entry.summary).toContain("ORCL-01");
  expect(orcl02Entry.summary).toContain("ORCL-02");
  expect(orcl02Entry.summary).toContain("postulate");
  expect(orcl01Entry.defectKind).toBe("false-green");
  expect(orcl02Entry.defectKind).toBe("false-green");
});
