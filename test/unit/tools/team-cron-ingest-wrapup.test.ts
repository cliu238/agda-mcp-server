// MIT License — see LICENSE
//
// Unit tests for scripts/team/cron-ingest-wrapup.mjs: the unattended
// TEAM-04 judge. Fully DI-driven — every test injects fake
// extractArchiveSafely/wrapUpCapture/upsertQueueEntry/execFileSync via
// `config.deps`, so no real Agda/tar/git/subprocess cost is ever paid
// here. `queueJsonPath`/`flakyLogPath` are always mkdtempSync-created
// THROWAWAY temp file paths, never the real tracked
// test/fixtures/fix-queue.json.

import { afterEach, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

// @ts-expect-error script module lacks types
import { discoverUnprocessedArchives, processArchive, resolveCronPolicyKey, scriptMain, summarizeArchiveResults, writeBackQueue } from "../../../scripts/team/cron-ingest-wrapup.mjs";

import { SERVER_REPO_ROOT } from "../../../src/repo-root.js";
import { getServerVersion } from "../../../src/server-version.js";

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

function throwawayQueuePath(): string {
  return join(makeTempDir("agda-mcp-cron-queue-"), "fix-queue.json");
}

function throwawayFlakyLogPath(): string {
  return join(makeTempDir("agda-mcp-cron-flakylog-"), "flaky.jsonl");
}

function baseArtifact(overrides: { fingerprint?: string; serverVersion?: string } = {}) {
  return {
    capturedAt: new Date().toISOString(),
    manifest: { serverVersion: overrides.serverVersion ?? getServerVersion() },
    recordedActions: [{ tool: "agda_load", args: {}, timestamp: Date.now(), normalizedResponse: {} }],
    oracleSubstrate: null,
    triage: null,
    dedup: { kind: "new-bug", fingerprint: overrides.fingerprint ?? "cron-test-fingerprint", recurrence: 1 },
  };
}

/** Builds a REAL on-disk "extracted scratch dir" layout
 *  (runs/<runId>/run-report.json + captures/<basename>.json) —
 *  extraction ITSELF is always faked in these tests (no real
 *  tar/subprocess cost), but everything processArchive reads AFTER
 *  extraction is real filesystem content, matching the archive
 *  internal layout 07-02's upload-run.mjs actually produces. */
function buildFakeScratchDir(
  options: {
    runId?: string;
    taskManifestCorpora?: string[];
    stagedPaths?: string[];
    artifacts?: Record<string, unknown>;
  } = {},
): string {
  const scratchDir = makeTempDir("agda-mcp-cron-scratch-");
  const runId = options.runId ?? "run-1";
  const runDir = join(scratchDir, "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const stagedPaths = options.stagedPaths ?? ["/uploader/machine/staged/capture-1.json"];
  const report = {
    schemaVersion: 1,
    runId,
    taskManifestCorpora: options.taskManifestCorpora ?? [],
    stagedCaptures: stagedPaths.map((stagedPath) => ({ stagedPath })),
  };
  writeFileSync(join(runDir, "run-report.json"), JSON.stringify(report), "utf8");

  const capturesDir = join(scratchDir, "captures");
  mkdirSync(capturesDir, { recursive: true });
  for (const stagedPath of stagedPaths) {
    const base = basename(stagedPath);
    const artifact = options.artifacts?.[base] ?? baseArtifact();
    writeFileSync(join(capturesDir, base), JSON.stringify(artifact), "utf8");
  }

  return scratchDir;
}

function fakeExtractOk(scratchDir: string) {
  return vi.fn(async (..._args: any[]) => ({
    ok: true,
    scratchDir,
    cleanup: vi.fn(() => rmSync(scratchDir, { recursive: true, force: true })),
  }));
}

function makeArchiveFile(): string {
  const archiveDir = makeTempDir("agda-mcp-cron-archive-");
  const archivePath = join(archiveDir, "run-1.tar.gz");
  writeFileSync(archivePath, "placeholder archive bytes", "utf8");
  return archivePath;
}

// ── discoverUnprocessedArchives ───────────────────────────────────────

test("discoverUnprocessedArchives: walks <storageDir>/<person>/<date>/*.tar.gz three levels deep, skipping archives with a .processed.json sidecar", () => {
  const storageDir = makeTempDir("agda-mcp-cron-storage-");
  const dateDir = join(storageDir, "alice", "2026-07-04");
  mkdirSync(dateDir, { recursive: true });
  writeFileSync(join(dateDir, "run-1.tar.gz"), "archive bytes", "utf8");
  writeFileSync(join(dateDir, "run-2.tar.gz"), "archive bytes", "utf8");
  writeFileSync(join(dateDir, "run-2.tar.gz.processed.json"), JSON.stringify({ ok: true }), "utf8");
  // A stray non-directory file directly under storageDir (e.g. macOS's
  // .DS_Store) must never be mis-walked as a "person" directory.
  writeFileSync(join(storageDir, ".DS_Store"), "", "utf8");

  const found = discoverUnprocessedArchives(storageDir);

  expect(found).toHaveLength(1);
  expect(found[0].archivePath).toBe(join(dateDir, "run-1.tar.gz"));
  expect(found[0].person).toBe("alice");
  expect(found[0].date).toBe("2026-07-04");
});

test("discoverUnprocessedArchives: an absent storageDir returns [] rather than throwing", () => {
  expect(discoverUnprocessedArchives(join(tmpdir(), "agda-mcp-does-not-exist-storage-dir"))).toEqual([]);
});

test("discoverUnprocessedArchives: a second call after a .processed.json sidecar is written no longer returns that archive", () => {
  const storageDir = makeTempDir("agda-mcp-cron-storage-idempotent-");
  const dateDir = join(storageDir, "bob", "2026-07-04");
  mkdirSync(dateDir, { recursive: true });
  const archivePath = join(dateDir, "run-1.tar.gz");
  writeFileSync(archivePath, "archive bytes", "utf8");

  expect(discoverUnprocessedArchives(storageDir)).toHaveLength(1);

  writeFileSync(`${archivePath}.processed.json`, JSON.stringify({ ok: true }), "utf8");

  expect(discoverUnprocessedArchives(storageDir)).toHaveLength(0);
});

// ── resolveCronPolicyKey ──────────────────────────────────────────────

test("resolveCronPolicyKey: a single known corpus resolves that corpus's fuel-corpora.json policyKey", () => {
  expect(resolveCronPolicyKey(["codex-homotopy-group"])).toBe("codex-homotopy-group");
});

test("resolveCronPolicyKey: an empty array returns undefined (never guesses)", () => {
  expect(resolveCronPolicyKey([])).toBeUndefined();
});

test("resolveCronPolicyKey: a multi-corpus array returns undefined (never guesses)", () => {
  expect(resolveCronPolicyKey(["codex-homotopy-group", "agda-unimath"])).toBeUndefined();
});

test("resolveCronPolicyKey: an unknown corpus key returns undefined", () => {
  expect(resolveCronPolicyKey(["not-a-real-corpus-zzz"])).toBeUndefined();
});

test("resolveCronPolicyKey: a non-array input returns undefined without throwing", () => {
  expect(resolveCronPolicyKey(undefined)).toBeUndefined();
});

// ── processArchive: extraction failure ────────────────────────────────

test("processArchive: an extraction failure marks the archive processed (terminal, never retried) and never calls wrapUpCapture", async () => {
  const archivePath = makeArchiveFile();
  const extractFn = vi.fn(async () => ({ ok: false, reason: "unsafe-entry-path", detail: "../evil.txt" }));
  const wrapUpFn = vi.fn();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn },
    },
  );

  expect(result.error).toBe("unsafe-entry-path");
  expect(result.results).toEqual([]);
  expect(wrapUpFn).not.toHaveBeenCalled();
  expect(existsSync(`${archivePath}.processed.json`)).toBe(true);
  const marker = JSON.parse(readFileSync(`${archivePath}.processed.json`, "utf8"));
  expect(marker.ok).toBe(false);
  expect(marker.reason).toBe("unsafe-entry-path");
});

// ── processArchive: true-green never files, marks processed ──────────

test("processArchive: a true-green capture (fake wrapUpCapture returns not-a-candidate) never calls upsertQueueEntry and marks the archive processed", async () => {
  const scratchDir = buildFakeScratchDir();
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async () => ({
    filed: false,
    classification: "not-a-candidate",
    verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "clean" } },
  }));
  const upsertFn = vi.fn();
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn, upsertQueueEntry: upsertFn },
    },
  );

  expect(result.results).toHaveLength(1);
  expect(result.results[0].filed).toBe(false);
  expect(upsertFn).not.toHaveBeenCalled();
  expect(existsSync(`${archivePath}.processed.json`)).toBe(true);
});

// ── processArchive: filed capture counted + correct on-disk path ─────

test("processArchive: a filed capture is reflected in results, and the artifact path passed to wrapUpCapture is <scratchDir>/captures/<basename>, NEVER the original uploader-absolute stagedPath", async () => {
  const originalStagedPath = "/uploader/only/staged/my-capture.json";
  const scratchDir = buildFakeScratchDir({ stagedPaths: [originalStagedPath] });
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async (..._args: any[]) => ({
    filed: true,
    classification: "deterministic",
    verdict: { orcl01: { kind: "server-false-green-candidate" }, orcl02: { kind: "clean" } },
  }));
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn },
    },
  );

  expect(result.results).toHaveLength(1);
  expect(result.results[0].filed).toBe(true);
  const expectedArtifactPath = join(scratchDir, "captures", "my-capture.json");
  expect(wrapUpFn.mock.calls[0][0]).toBe(expectedArtifactPath);
  expect(wrapUpFn.mock.calls[0][0]).not.toBe(originalStagedPath);
});

// ── processArchive: corpus-bearing unresolvable policy = loud error ──

test("processArchive: a corpus-bearing bundle whose corpus cannot be resolved to a policyKey is a loud archive-level error, and wrapUpCapture is never called for any of its captures", async () => {
  const scratchDir = buildFakeScratchDir({ taskManifestCorpora: ["not-a-real-corpus-zzz"] });
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn();
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn },
    },
  );

  expect(result.error).toBe("unresolvable-policy-key");
  expect(result.results).toEqual([]);
  expect(wrapUpFn).not.toHaveBeenCalled();
  const marker = JSON.parse(readFileSync(`${archivePath}.processed.json`, "utf8"));
  expect(marker.reason).toBe("unresolvable-policy-key");
});

test("processArchive: a bundle with NO declared corpus is not an error — it flows through with policyKey undefined and lets the oracle honestly abstain", async () => {
  const scratchDir = buildFakeScratchDir({ taskManifestCorpora: [] });
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async (..._args: any[]) => ({
    filed: false,
    classification: "not-a-candidate",
    verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "no-policy" } },
  }));
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn },
    },
  );

  expect(result.error).toBeUndefined();
  expect(wrapUpFn).toHaveBeenCalledTimes(1);
  expect(wrapUpFn.mock.calls[0][2].policyKey).toBeUndefined();
});

// ── processArchive: unexpected run count ──────────────────────────────

test("processArchive: an extracted archive with zero or multiple runs/<runId> dirs is a loud archive-level error (unexpected-run-count)", async () => {
  const scratchDir = makeTempDir("agda-mcp-cron-scratch-multi-run-");
  mkdirSync(join(scratchDir, "runs", "run-a"), { recursive: true });
  mkdirSync(join(scratchDir, "runs", "run-b"), { recursive: true });
  const extractFn = fakeExtractOk(scratchDir);
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn },
    },
  );

  expect(result.error).toBe("unexpected-run-count");
});

// ── processArchive: version-skew annotation (Pitfall 10) ─────────────

test("processArchive: a server-version mismatch on a FILED capture annotates the queue entry's notes via a metadata-only upsertQueueEntry call, and is counted as versionSkew in the result", async () => {
  const scratchDir = buildFakeScratchDir({
    artifacts: { "capture-1.json": baseArtifact({ serverVersion: "0.0.1-old", fingerprint: "skew-fp" }) },
  });
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async (..._args: any[]) => ({
    filed: true,
    classification: "deterministic",
    verdict: { orcl01: { kind: "server-false-green-candidate" }, orcl02: { kind: "clean" } },
  }));
  const upsertFn = vi.fn(async (entry: { fingerprint: string; notes: string }, _queueJsonPath: string, opts: { bumpRecurrence: boolean }) => ({
    entry,
    opts,
  }));
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn, upsertQueueEntry: upsertFn },
    },
  );

  expect(result.results[0].versionSkew).toBe(true);
  expect(upsertFn).toHaveBeenCalledTimes(1);
  const [entry, , upsertOptions] = upsertFn.mock.calls[0];
  expect(entry.fingerprint).toBe("skew-fp");
  expect(entry.notes).toBe(`version-skew: captured=0.0.1-old judged=${getServerVersion()}`);
  expect(upsertOptions).toEqual({ bumpRecurrence: false });
  // Verdicts are never invalidated by skew.
  expect(result.results[0].filed).toBe(true);
});

test("processArchive: a server-version mismatch on a NOT-FILED capture never calls upsertQueueEntry (nothing to annotate)", async () => {
  const scratchDir = buildFakeScratchDir({
    artifacts: { "capture-1.json": baseArtifact({ serverVersion: "0.0.1-old" }) },
  });
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async () => ({
    filed: false,
    classification: "not-a-candidate",
    verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "clean" } },
  }));
  const upsertFn = vi.fn();
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn, upsertQueueEntry: upsertFn },
    },
  );

  expect(result.results[0].versionSkew).toBe(true);
  expect(upsertFn).not.toHaveBeenCalled();
});

test("processArchive: a matching server version is never flagged as a skew", async () => {
  const scratchDir = buildFakeScratchDir({
    artifacts: { "capture-1.json": baseArtifact({ serverVersion: getServerVersion() }) },
  });
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async () => ({
    filed: true,
    classification: "deterministic",
    verdict: { orcl01: { kind: "server-false-green-candidate" }, orcl02: { kind: "clean" } },
  }));
  const upsertFn = vi.fn();
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn, upsertQueueEntry: upsertFn },
    },
  );

  expect(result.results[0].versionSkew).toBe(false);
  expect(upsertFn).not.toHaveBeenCalled();
});

// ── processArchive: per-capture error isolation ───────────────────────

test("processArchive: a corrupt/unreadable staged capture is isolated as a per-capture error and does not abort the rest of the archive", async () => {
  const scratchDir = buildFakeScratchDir({ stagedPaths: ["/uploader/a.json", "/uploader/b.json"] });
  writeFileSync(join(scratchDir, "captures", "a.json"), "{ not valid json", "utf8");
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn(async () => ({
    filed: false,
    classification: "not-a-candidate",
    verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "clean" } },
  }));
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn },
    },
  );

  expect(result.results).toHaveLength(2);
  expect(result.results[0].classification).toBe("error");
  expect(result.results[1].classification).toBe("not-a-candidate");
  expect(wrapUpFn).toHaveBeenCalledTimes(1);
});

// ── processArchive: cleanup always runs ───────────────────────────────

test("processArchive: extracted.cleanup() is always called, even on the unexpected-run-count early-return path", async () => {
  const scratchDir = makeTempDir("agda-mcp-cron-scratch-cleanup-");
  const cleanupFn = vi.fn(() => rmSync(scratchDir, { recursive: true, force: true }));
  const extractFn = vi.fn(async () => ({ ok: true, scratchDir, cleanup: cleanupFn }));
  const archivePath = makeArchiveFile();

  await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn },
    },
  );

  expect(cleanupFn).toHaveBeenCalledTimes(1);
});

// ── processArchive: CR-01 (fingerprint-collision terminal-entry guard) ──

/** A fake runOracle that always returns an ORCL-02 cheat-flagged
 *  verdict — reaches wrapUpCapture's UNCONDITIONAL, flake-gate-skipping
 *  filing branch with zero need to also fake classifyFlakiness. */
function fakeCheatFlaggedRunOracle() {
  return vi.fn(async () => ({
    orcl01: { kind: "skip", reason: "no load-family recorded action to diff against" },
    orcl02: {
      kind: "cheat-flagged",
      findings: [{ file: "Postulates.agda", line: 4, kind: "postulate", detail: "unsafeAxiom", sanctioned: false }],
    },
  }));
}

function lockedQueueEntry(overrides: Record<string, unknown> = {}) {
  return {
    fingerprint: "locked-fp-cr01",
    status: "locked",
    defectKind: "false-green",
    triageClass: null,
    triageConfidence: null,
    recurrence: 1,
    title: "Pre-existing locked flagship entry",
    summary: "A real, previously-resolved defect.",
    affectedTool: "agda_load",
    capturePath: null,
    verdictPath: null,
    matrixEntryId: "matrix-locked-entry",
    createdAt: "2025-01-01T00:00:00.000Z",
    closedAt: "2025-06-01T00:00:00.000Z",
    ...overrides,
  };
}

test("processArchive: a colliding dedup.fingerprint from an untrusted archive is REFUSED against a locked entry — status/closedAt/matrixEntryId/recurrence all survive unchanged (CR-01, from-RED)", async () => {
  const queueJsonPath = throwawayQueuePath();
  writeFileSync(queueJsonPath, JSON.stringify([lockedQueueEntry()], null, 2), "utf8");

  const originalStagedPath = "/uploader/only/staged/attack-capture.json";
  const scratchDir = buildFakeScratchDir({
    stagedPaths: [originalStagedPath],
    artifacts: { "attack-capture.json": baseArtifact({ fingerprint: "locked-fp-cr01" }) },
  });
  const extractFn = fakeExtractOk(scratchDir);
  const archivePath = makeArchiveFile();
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath,
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, runOracle: fakeCheatFlaggedRunOracle() },
    },
  );
  // Assert BEFORE mockRestore(): vitest's mockRestore() also resets the
  // call history (like mockReset()), so checking toHaveBeenCalled()
  // after restoring would always report false regardless of what
  // actually happened (see the same note on the append-count test above).
  expect(stderrSpy).toHaveBeenCalled();
  stderrSpy.mockRestore();

  // Never reported as a genuine filing.
  expect(result.results).toHaveLength(1);
  expect(result.results[0].filed).toBe(false);
  expect(result.results[0].classification).toBe("terminal-conflict");

  // The persisted queue entry is BYTE-FOR-BYTE unchanged on every
  // terminal-status field — no regression, no cleared closedAt/matrixEntryId.
  const queueAfter = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(queueAfter).toHaveLength(1);
  expect(queueAfter[0].status).toBe("locked");
  expect(queueAfter[0].closedAt).toBe("2025-06-01T00:00:00.000Z");
  expect(queueAfter[0].matrixEntryId).toBe("matrix-locked-entry");
  expect(queueAfter[0].recurrence).toBe(1);
  expect(queueAfter[0].title).toBe("Pre-existing locked flagship entry");
  // Loud: a new evidence note IS appended, and the run summary tallies it.
  expect(queueAfter[0].notes).toContain("CONFLICT");
  expect(summarizeArchiveResults(1, [result]).terminalConflicts).toBe(1);
});

test("processArchive: a colliding fingerprint against a REJECTED entry is refused the same way as locked (CR-01)", async () => {
  const queueJsonPath = throwawayQueuePath();
  writeFileSync(
    queueJsonPath,
    JSON.stringify([lockedQueueEntry({ status: "rejected", rejectedReason: "not-a-bug" })], null, 2),
    "utf8",
  );

  const scratchDir = buildFakeScratchDir({
    stagedPaths: ["/uploader/attack-2.json"],
    artifacts: { "attack-2.json": baseArtifact({ fingerprint: "locked-fp-cr01" }) },
  });
  const extractFn = fakeExtractOk(scratchDir);
  const archivePath = makeArchiveFile();
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath,
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, runOracle: fakeCheatFlaggedRunOracle() },
    },
  );
  stderrSpy.mockRestore();

  expect(result.results[0].classification).toBe("terminal-conflict");
  const queueAfter = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(queueAfter[0].status).toBe("rejected");
});

test("processArchive: a NON-colliding (brand-new fingerprint) filing is unaffected by the CR-01 guard and still succeeds", async () => {
  const queueJsonPath = throwawayQueuePath();
  writeFileSync(queueJsonPath, JSON.stringify([lockedQueueEntry()], null, 2), "utf8");

  const scratchDir = buildFakeScratchDir({
    stagedPaths: ["/uploader/brand-new.json"],
    artifacts: { "brand-new.json": baseArtifact({ fingerprint: "brand-new-fp" }) },
  });
  const extractFn = fakeExtractOk(scratchDir);
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath,
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, runOracle: fakeCheatFlaggedRunOracle() },
    },
  );

  expect(result.results[0].filed).toBe(true);
  expect(result.results[0].classification).not.toBe("terminal-conflict");
  const queueAfter = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  expect(queueAfter).toHaveLength(2);
  const newEntry = queueAfter.find((entry: { fingerprint: string }) => entry.fingerprint === "brand-new-fp");
  expect(newEntry.status).toBe("new");
});

// ── processArchive: CR-02 (malformed run-report.json) ─────────────────

test("processArchive: a malformed run-report.json is marked processed as a terminal failure instead of throwing — never re-processed on the next tick (CR-02, from-RED)", async () => {
  const scratchDir = buildFakeScratchDir({ runId: "run-malformed" });
  writeFileSync(join(scratchDir, "runs", "run-malformed", "run-report.json"), "{ not valid json at all", "utf8");
  const extractFn = fakeExtractOk(scratchDir);
  const wrapUpFn = vi.fn();
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn, wrapUpCapture: wrapUpFn },
    },
  );

  expect(result.error).toBe("malformed-run-report");
  expect(result.results).toEqual([]);
  expect(wrapUpFn).not.toHaveBeenCalled();
  expect(existsSync(`${archivePath}.processed.json`)).toBe(true);
  const marker = JSON.parse(readFileSync(`${archivePath}.processed.json`, "utf8"));
  expect(marker.ok).toBe(false);
  expect(marker.reason).toBe("malformed-run-report");
  expect(typeof marker.detail).toBe("string");
  expect(marker.detail.length).toBeGreaterThan(0);
});

test("processArchive: a MISSING run-report.json (the single runs/ entry lacks the file entirely) is also a terminal, marked failure", async () => {
  const scratchDir = makeTempDir("agda-mcp-cron-scratch-missing-report-");
  mkdirSync(join(scratchDir, "runs", "run-1"), { recursive: true });
  // Deliberately never writes run-report.json under runs/run-1/.
  const extractFn = fakeExtractOk(scratchDir);
  const archivePath = makeArchiveFile();

  const result = await processArchive(
    { archivePath },
    {
      queueJsonPath: throwawayQueuePath(),
      flakyLogPath: throwawayFlakyLogPath(),
      deps: { extractArchiveSafely: extractFn },
    },
  );

  expect(result.error).toBe("malformed-run-report");
  const marker = JSON.parse(readFileSync(`${archivePath}.processed.json`, "utf8"));
  expect(marker.reason).toBe("malformed-run-report");
});

// ── writeBackQueue ─────────────────────────────────────────────────────

test("writeBackQueue: filedCount > 0 and no --no-push calls execFileSync exactly 3 times in order (add, commit, push), each with shell:false and cwd:SERVER_REPO_ROOT", () => {
  const execFileSpy = vi.fn((..._args: any[]) => "");
  const queueJsonPath = join(SERVER_REPO_ROOT, "test", "fixtures", "fix-queue.json");

  const result = writeBackQueue({ queueJsonPath, noPush: false, filedCount: 2, deps: { execFileSync: execFileSpy } });

  expect(result.committed).toBe(true);
  expect(result.pushed).toBe(true);
  expect(execFileSpy).toHaveBeenCalledTimes(3);
  expect(execFileSpy.mock.calls[0][0]).toBe("git");
  expect(execFileSpy.mock.calls[0][1][0]).toBe("add");
  expect(execFileSpy.mock.calls[1][1][0]).toBe("commit");
  expect(execFileSpy.mock.calls[2][1]).toEqual(["push"]);
  for (const call of execFileSpy.mock.calls) {
    expect(call[2]).toMatchObject({ cwd: SERVER_REPO_ROOT, shell: false });
  }
});

test("writeBackQueue: --no-push calls execFileSync exactly 2 times (add, commit) and never a 3rd time with push", () => {
  const execFileSpy = vi.fn((..._args: any[]) => "");
  const queueJsonPath = join(SERVER_REPO_ROOT, "test", "fixtures", "fix-queue.json");

  const result = writeBackQueue({ queueJsonPath, noPush: true, filedCount: 1, deps: { execFileSync: execFileSpy } });

  expect(result.committed).toBe(true);
  expect(result.pushed).toBe(false);
  expect(execFileSpy).toHaveBeenCalledTimes(2);
  expect(execFileSpy.mock.calls.some((call) => call[1][0] === "push")).toBe(false);
});

test("writeBackQueue: filedCount === 0 calls execFileSync zero times", () => {
  const execFileSpy = vi.fn();

  const result = writeBackQueue({
    queueJsonPath: join(SERVER_REPO_ROOT, "test", "fixtures", "fix-queue.json"),
    noPush: false,
    filedCount: 0,
    deps: { execFileSync: execFileSpy },
  });

  expect(result.skipped).toBe("nothing-to-commit");
  expect(execFileSpy).not.toHaveBeenCalled();
});

test("writeBackQueue: a thrown execFileSync error (e.g. \"nothing to commit\") is caught and surfaced in the returned result rather than throwing", () => {
  const execFileSpy = vi.fn(() => {
    throw new Error("nothing to commit, working tree clean");
  });
  const queueJsonPath = join(SERVER_REPO_ROOT, "test", "fixtures", "fix-queue.json");

  const result = writeBackQueue({ queueJsonPath, noPush: false, filedCount: 1, deps: { execFileSync: execFileSpy } });

  expect(result.committed).toBe(false);
  expect(result.error).toContain("nothing to commit");
});

test("writeBackQueue: a queueJsonPath outside SERVER_REPO_ROOT is skipped before any execFileSync call", () => {
  const execFileSpy = vi.fn();

  const result = writeBackQueue({
    queueJsonPath: join(tmpdir(), "somewhere-else", "fix-queue.json"),
    noPush: false,
    filedCount: 1,
    deps: { execFileSync: execFileSpy },
  });

  expect(result.skipped).toBe("queue-path-outside-repo");
  expect(execFileSpy).not.toHaveBeenCalled();
});

// ── summarizeArchiveResults: abstention-rate + version-skew arithmetic ─

test("summarizeArchiveResults: computes the abstention rate as (inconclusive orcl01 OR no-policy/no-target orcl02) / totalCaptures", () => {
  const allResults = [
    {
      archivePath: "a1",
      results: [
        { filed: true, classification: "deterministic", verdict: { orcl01: { kind: "server-false-green-candidate" }, orcl02: { kind: "clean" } } },
        { filed: false, classification: "not-a-candidate", verdict: { orcl01: { kind: "inconclusive" }, orcl02: { kind: "clean" } } },
        { filed: false, classification: "not-a-candidate", verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "no-policy" } } },
        { filed: false, classification: "not-a-candidate", verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "no-target" } } },
      ],
    },
  ];

  const stats = summarizeArchiveResults(1, allResults);

  expect(stats.totalCaptures).toBe(4);
  expect(stats.filed).toBe(1);
  expect(stats.abstained).toBe(3);
  expect(stats.abstentionRate).toBeCloseTo(0.75);
});

test("summarizeArchiveResults: abstentionRate is 0 (never NaN) when totalCaptures is 0", () => {
  const stats = summarizeArchiveResults(2, [
    { archivePath: "a1", error: "unresolvable-policy-key", results: [] },
    { archivePath: "a2", error: "unsafe-entry-path", results: [] },
  ]);

  expect(stats.totalCaptures).toBe(0);
  expect(stats.abstentionRate).toBe(0);
  // Archive-level failures never contribute a per-capture result row,
  // so they must never be silently absorbed by the per-capture
  // `errors` count — they are counted here instead.
  expect(stats.errors).toBe(0);
  expect(stats.archiveErrors).toBe(2);
});

test("summarizeArchiveResults: tallies versionSkew across all captures regardless of filed status", () => {
  const allResults = [
    {
      archivePath: "a1",
      results: [
        { filed: true, versionSkew: true, classification: "deterministic", verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "clean" } } },
        { filed: false, versionSkew: true, classification: "not-a-candidate", verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "clean" } } },
        { filed: false, versionSkew: false, classification: "not-a-candidate", verdict: { orcl01: { kind: "pass" }, orcl02: { kind: "clean" } } },
      ],
    },
  ];

  const stats = summarizeArchiveResults(1, allResults);

  expect(stats.versionSkews).toBe(2);
});

// ── scriptMain: argv validation (side-effect-free early-return path) ──

test("scriptMain: an invalid --rerun-n exits with code 1 and never touches the filesystem (side-effect-free early return)", async () => {
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  const stderrWrites: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => {
    stderrWrites.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    await scriptMain(["--rerun-n", "not-a-number"]);
    expect(process.exitCode).toBe(1);
    expect(stderrWrites.join("")).toContain("--rerun-n");
  } finally {
    process.stderr.write = originalWrite;
    process.exitCode = originalExitCode;
  }
});
