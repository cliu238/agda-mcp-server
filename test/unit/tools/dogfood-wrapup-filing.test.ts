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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import {
  buildQueueEntryFromVerdict,
  resolveWrapupPolicyKey,
  wrapUpCapture,
} from "../../../scripts/dogfood/dogfood-wrapup.mjs";

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

/** Minimal fixQueueEntrySchema-shaped surface this test file asserts
 *  on — typed (rather than `unknown`) so `upsertFn.mock.calls[0][0]`
 *  field accesses typecheck. */
interface FakeQueueEntry {
  fingerprint: string;
  status: string;
  defectKind: string;
  summary: string;
  [key: string]: unknown;
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
  const upsertFn = vi.fn(async (entry: FakeQueueEntry) => entry);

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

// ── Test 4b: replay-inconclusive -> side-channel with the distinct replay-failed tag ──

test("wrapUpCapture: a server-false-green-candidate whose replays are all inconclusive is side-channeled with a replay-failed tag, never filed and never tagged timing/nondeterministic", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }));
  const classifyFn = vi.fn(async () => ({ classification: "replay-inconclusive", observedClassifications: [null, null, null] }));
  const upsertFn = vi.fn();
  const appendFlakyFn = vi.fn();

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn, appendFlakyLog: appendFlakyFn },
  });

  expect(result.filed).toBe(false);
  expect(result.classification).toBe("replay-inconclusive");
  expect(result.tag).toBe("replay-failed");
  expect(upsertFn).not.toHaveBeenCalled();
  expect(appendFlakyFn).toHaveBeenCalledTimes(1);
  // The 5th argument is the side-channel tag — distinct from the flaky path's default.
  expect(appendFlakyFn.mock.calls[0][4]).toBe("replay-failed");
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
  const upsertFn = vi.fn(async (entry: FakeQueueEntry) => entry);

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
  const upsertFn = vi.fn(async (entry: FakeQueueEntry) => entry);
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

// ── Test 7 (POLICY-01, key_links wiring): config.policyKey reaches runOracleFn ──

test("wrapUpCapture: config.policyKey reaches runOracleFn as { policyKey } (the exact key_links wiring)", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "pass" }, orcl02: { kind: "clean" } }));

  await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    policyKey: "some-key",
    deps: { runOracle: runOracleFn },
  });

  expect(runOracleFn).toHaveBeenCalledTimes(1);
  expect(runOracleFn.mock.calls[0][0]).toBe("fake-capture.json");
  expect(runOracleFn.mock.calls[0][1]).toEqual({ policyKey: "some-key" });
});

test("wrapUpCapture: an omitted config.policyKey reaches runOracleFn as {} (judgeOrcl02's own .agda-lib-derived default)", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "pass" }, orcl02: { kind: "clean" } }));

  await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn },
  });

  expect(runOracleFn.mock.calls[0][1]).toEqual({});
});

// ── resolveWrapupPolicyKey: direct unit coverage of the D-01 precedence chain ──

test("resolveWrapupPolicyKey: an explicit --policy flag wins over everything, even a resolvable manifest", () => {
  const dir = makeTempDir("agda-mcp-wrapup-policykey-flag-");
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify([{ target: "Foo.agda", expectedSignature: "foo : Set", corpus: "codex-homotopy-group" }]),
    "utf8",
  );

  expect(resolveWrapupPolicyKey({ policyFlag: "explicit-key", manifestPath })).toBe("explicit-key");
});

test("resolveWrapupPolicyKey: a manifest whose entries unanimously share one known fuel-corpora key resolves that corpus's policyKey column", () => {
  const dir = makeTempDir("agda-mcp-wrapup-policykey-unanimous-");
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify([
      { target: "Foo.agda", expectedSignature: "foo : Set", corpus: "codex-homotopy-group" },
      { target: "Bar.agda", expectedSignature: "bar : Set", corpus: "codex-homotopy-group" },
    ]),
    "utf8",
  );

  expect(resolveWrapupPolicyKey({ policyFlag: undefined, manifestPath })).toBe("codex-homotopy-group");
});

test("resolveWrapupPolicyKey: mixed corpus values across manifest entries fall back to undefined (never guesses)", () => {
  const dir = makeTempDir("agda-mcp-wrapup-policykey-mixed-");
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify([
      { target: "Foo.agda", expectedSignature: "foo : Set", corpus: "codex-homotopy-group" },
      { target: "Bar.agda", expectedSignature: "bar : Set", corpus: "agda-unimath" },
    ]),
    "utf8",
  );

  expect(resolveWrapupPolicyKey({ policyFlag: undefined, manifestPath })).toBeUndefined();
});

test("resolveWrapupPolicyKey: an unreadable manifestPath falls back to undefined", () => {
  const dir = makeTempDir("agda-mcp-wrapup-policykey-unreadable-");
  const manifestPath = join(dir, "does-not-exist.json");

  expect(resolveWrapupPolicyKey({ policyFlag: undefined, manifestPath })).toBeUndefined();
});

test("resolveWrapupPolicyKey: a unanimous but unknown (not in fuel-corpora.json) corpus value falls back to undefined", () => {
  const dir = makeTempDir("agda-mcp-wrapup-policykey-unknown-corpus-");
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify([{ target: "Foo.agda", expectedSignature: "foo : Set", corpus: "not-a-real-corpus-zzz" }]),
    "utf8",
  );

  expect(resolveWrapupPolicyKey({ policyFlag: undefined, manifestPath })).toBeUndefined();
});

test("resolveWrapupPolicyKey: no manifestPath and no flag falls back to undefined", () => {
  expect(resolveWrapupPolicyKey({ policyFlag: undefined, manifestPath: undefined })).toBeUndefined();
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

test("buildQueueEntryFromVerdict: a co-occurring ORCL-02 cheat leads the summary (mirroring filing precedence) and the ORCL-01 signal is still mentioned", () => {
  const artifact = baseArtifact();

  const entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({
      orcl01: { kind: "server-false-green-candidate" },
      orcl02: { kind: "cheat-flagged", findings: cheatFindings() },
    }),
  );

  // On this path the entry is filed BECAUSE OF the ORCL-02 cheat (the
  // flake gate is skipped), so the cheat findings must lead — but the
  // co-occurring ORCL-01 signal must not be dropped either.
  expect(entry.summary).toContain("ORCL-02");
  expect(entry.summary).toContain("postulate");
  expect(entry.summary).toContain("ORCL-01");
  expect(entry.summary.indexOf("ORCL-02")).toBeLessThan(entry.summary.indexOf("ORCL-01"));
});

test("buildQueueEntryFromVerdict: affectedTool is the last LOAD-FAMILY action, not an unrelated trailing call", () => {
  const artifact = baseArtifact({
    recordedActions: [
      { tool: "agda_load", args: { file: "Main.agda" }, timestamp: Date.now(), normalizedResponse: {} },
      { tool: "agda_capture_session", args: {}, timestamp: Date.now(), normalizedResponse: {} },
    ],
  });

  const entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }),
  );

  expect(entry.affectedTool).toBe("agda_load");
});

// ── WR-03: affectedTool fallback must not throw on a non-array recordedActions ──
//
// lastLoadFamilyToolName() defensively coerces a missing/non-array
// recordedActions to []; the `?? artifact.recordedActions.at(-1)?.tool`
// fallback on the next line called .at(-1) directly with no such
// guard, throwing an uncaught TypeError for a malformed/adversarial
// staged capture instead of degrading to "unknown" like the rest of
// this pure helper.

test("buildQueueEntryFromVerdict: affectedTool falls back to \"unknown\" instead of throwing when recordedActions is missing", () => {
  const artifact = baseArtifact();
  delete (artifact as any).recordedActions;

  const entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }),
  );

  expect(entry.affectedTool).toBe("unknown");
});

// WR-05: a string value (e.g. "not-an-array") does NOT reproduce the
// crash this suite is guarding against — String.prototype.at() has
// existed since ES2022, so the pre-fix formula
// (`artifact.recordedActions.at(-1)?.tool`) evaluates to
// "not-an-array".at(-1) ("y"), then "y".tool (undefined), then falls
// through to `?? "unknown"` on BOTH the pre-fix and fixed code —
// verified empirically by extracting the literal pre-fix formula and
// running it against a string vs. a plain object/number. A plain
// object (or a number) genuinely lacks `.at()` and throws
// "recordedActions.at is not a function" pre-fix, so it is the
// fixture that actually exercises the guard this test claims to
// cover.
test("buildQueueEntryFromVerdict: affectedTool falls back to \"unknown\" instead of throwing when recordedActions is a plain object", () => {
  const artifact = { ...baseArtifact(), recordedActions: { not: "an-array" } };

  const entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }),
  );

  expect(entry.affectedTool).toBe("unknown");
});
