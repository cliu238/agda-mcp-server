// MIT License — see LICENSE
//
// Unit tests for buildReplayManifest (CAP-01, partial). Constructs an
// AgdaSession with zero prior interaction (no load()/sendCommand())
// to pin the state-agnostic contract (D-01) — the manifest builder
// must not require a live process.

import { test, expect } from "vitest";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

import { AgdaSession } from "../../../../src/agda-process.js";
import { buildReplayManifest } from "../../../../src/agda/session-capture/manifest-builder.js";
import { hashImportClosure } from "../../../../src/agda/session-capture/import-closure-hash.js";
import { getServerVersion } from "../../../../src/server-version.js";
import {
  resetFileBoundStateIfProcDied,
  handleSessionProcessClose,
} from "../../../../src/agda/session-process-lifecycle.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../../helpers/agda-version.js";

test("buildReplayManifest stamps server-derived fields; mergedArgv is [] pre-load", async () => {
  // Hermetic session root: the shared fixtures root accumulates a
  // gitignored `_build/` whenever real-Agda tests run, which would
  // flip detectBuildFreshness to "shared" and break the pre-load
  // "fresh" contract this test pins.
  const tempRoot = mkdtempSync(join(tmpdir(), "manifest-builder-preload-"));
  const session = new AgdaSession(tempRoot);

  try {
    const manifest = buildReplayManifest(session);

    expect(manifest.serverVersion).toBe(getServerVersion());
    expect(manifest.os).toMatch(/^\w+-\w+$/u);
    expect(manifest.repoRoot).toBe(tempRoot);
    expect(manifest.agdaVersion).toBeNull();

    // Before any load(), lastDispatchedLoadArgv is [] and no
    // libraryRegistration exists yet (only set on first
    // ensureProcess()) — so mergedArgv is [].
    expect(session.lastDispatchedLoadArgv).toEqual([]);
    expect(manifest.mergedArgv).toEqual([]);

    // No libraryRegistration exists pre-ensureProcess(), so
    // agdaDirContents is null. tempRoot has no `_build` dir, so
    // buildMode is "fresh" (nothing to share).
    expect(manifest.agdaDirContents).toBeNull();
    expect(manifest.buildMode).toBe("fresh");
    // No currentFile means no closure to walk (D-01: never throw when
    // nothing is loaded) — importClosureHash/inlinedFirstPartySources
    // fall back to their explicit empty values.
    expect(manifest.importClosureHash).toBeNull();
    expect(manifest.inlinedFirstPartySources).toEqual([]);
  } finally {
    await session.destroy();
  }
});

// ── Task 1: pre-dedup ordered argv (duplicates preserved) ───────────
//
// Requires an actual session.load() against a real Agda fixture, so
// gated the same way test/integration/agda/*.test.ts fixtures are:
// skip when RUN_AGDA_INTEGRATION !== "1" or no local `agda` binary.

const agdaAvailable = detectAgdaVersion() !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

it("session.load() preserves duplicate commandLineOptions in lastDispatchedLoadArgv, undeduped", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    await session.load("CompleteFixture.agda", { commandLineOptions: ["--flag", "--flag"] });

    // The pre-dedup capture field keeps both duplicate entries...
    expect(session.lastDispatchedLoadArgv).toEqual(["--flag", "--flag"]);
  } finally {
    await session.destroy();
  }
});

it("buildReplayManifest's mergedArgv is spawn-time -l flags then lastDispatchedLoadArgv, in order", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    await session.load("CompleteFixture.agda", { commandLineOptions: ["--flag", "--flag"] });

    const manifest = buildReplayManifest(session);
    expect(manifest.mergedArgv).toEqual([
      ...(session.libraryRegistration?.agdaArgs ?? []),
      ...session.lastDispatchedLoadArgv,
    ]);
    // Duplicates survive into the manifest field too — never
    // collapsed, per D-04 (server-stamped from the live session).
    expect(manifest.mergedArgv.filter((flag) => flag === "--flag")).toHaveLength(2);
  } finally {
    await session.destroy();
  }
});

// ── Plan 02-01 Task 1: lastDispatchedLoadArgv staleness reset (WR-08) ──
//
// A stale mergedArgv must never leak into a replay manifest after a
// strict reload, a mid-command process death, or an idle/spontaneous
// process crash — see src/agda/session-process-lifecycle.ts and
// src/agda/session.ts for the three reset call sites this pins.

test("resetFileBoundStateIfProcDied resets lastDispatchedLoadArgv to [] for a dead proc (mid-command death path)", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    session.lastDispatchedLoadArgv = ["--stale-flag"];
    const deadProc = {
      exitCode: 1,
      signalCode: null,
      killed: false,
    } as unknown as ChildProcess;

    resetFileBoundStateIfProcDied(session, deadProc);

    expect(session.lastDispatchedLoadArgv).toEqual([]);
  } finally {
    await session.destroy();
  }
});

test("handleSessionProcessClose resets lastDispatchedLoadArgv to [] (idle/spontaneous death path)", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    session.lastDispatchedLoadArgv = ["--stale-flag"];
    const closingProc = {} as unknown as ChildProcess;
    session.proc = closingProc; // identity guard passes: this IS the current proc

    handleSessionProcessClose(session, closingProc);

    expect(session.lastDispatchedLoadArgv).toEqual([]);
    // Confirms this is genuinely the idle-death reset path, not a noop.
    expect(session.currentFile).toBeNull();
  } finally {
    await session.destroy();
  }
});

it("session.loadNoMetas() resets lastDispatchedLoadArgv to [] after a prior load() set it (strict-reload path)", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    await session.load("CompleteFixture.agda", { commandLineOptions: ["--flag", "--flag"] });
    expect(session.lastDispatchedLoadArgv).toEqual(["--flag", "--flag"]);

    // Cmd_load_no_metas dispatches no options list at all, so [] is
    // the accurate value here, not a placeholder.
    await session.loadNoMetas("CompleteFixture.agda");
    expect(session.lastDispatchedLoadArgv).toEqual([]);
  } finally {
    await session.destroy();
  }
});

// ── Task 2: realized AGDA_DIR contents + build freshness ────────────

test("buildReplayManifest.agdaDirContents reads the live session's realized AGDA_DIR, never re-derives it", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "agda-mcp-manifest-repo-"));
  const agdaDir = mkdtempSync(join(tmpdir(), "agda-mcp-manifest-agdadir-"));
  writeFileSync(join(agdaDir, "libraries"), "/some/path/foo.agda-lib\n", "utf8");
  writeFileSync(join(agdaDir, "defaults"), "foo\n", "utf8");

  const session = new AgdaSession(repoRoot);
  // Manually realize libraryRegistration (never call
  // createLibraryRegistration() again from the test either — the
  // whole point is reading the live session's already-realized dir).
  session.libraryRegistration = { agdaArgs: [], agdaDir, cleanup() {} };

  try {
    const manifest = buildReplayManifest(session);
    expect(manifest.agdaDirContents).toEqual({
      libraries: ["/some/path/foo.agda-lib"],
      defaults: ["foo"],
    });
  } finally {
    await session.destroy();
  }
});

test("buildReplayManifest.buildMode is 'fresh' when repoRoot has no _build dir", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "agda-mcp-manifest-repo-"));
  const session = new AgdaSession(repoRoot);

  try {
    expect(buildReplayManifest(session).buildMode).toBe("fresh");
  } finally {
    await session.destroy();
  }
});

test("buildReplayManifest.buildMode is 'shared' when _build's newest file is older than 5 minutes", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "agda-mcp-manifest-repo-"));
  const buildDir = join(repoRoot, "_build");
  mkdirSync(buildDir);
  const staleFile = join(buildDir, "Stale.agdai");
  writeFileSync(staleFile, "stale-interface-file", "utf8");
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  utimesSync(staleFile, tenMinutesAgo, tenMinutesAgo);

  const session = new AgdaSession(repoRoot);

  try {
    expect(buildReplayManifest(session).buildMode).toBe("shared");
  } finally {
    await session.destroy();
  }
});

// ── Task 3: import-closure-hash wiring ───────────────────────────────

it("buildReplayManifest.importClosureHash/inlinedFirstPartySources are populated once a file is loaded", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    await session.load("CompleteFixture.agda");

    const manifest = buildReplayManifest(session);
    expect(manifest.importClosureHash).toBe(
      hashImportClosure(TEST_FIXTURE_PROJECT_ROOT, "CompleteFixture.agda", session.getAgdaVersion() ?? undefined),
    );
    expect(manifest.inlinedFirstPartySources).toContainEqual(
      expect.objectContaining({ path: "CompleteFixture.agda" }),
    );
  } finally {
    await session.destroy();
  }
});
