// MIT License — see LICENSE
//
// Unit tests for buildReplayManifest (CAP-01, partial). Constructs an
// AgdaSession with zero prior interaction (no load()/sendCommand())
// to pin the state-agnostic contract (D-01) — the manifest builder
// must not require a live process.

import { test, expect } from "vitest";

import { AgdaSession } from "../../../../src/agda-process.js";
import { buildReplayManifest } from "../../../../src/agda/session-capture/manifest-builder.js";
import { getServerVersion } from "../../../../src/server-version.js";
import { TEST_FIXTURE_PROJECT_ROOT } from "../../../helpers/repo-root.js";
import { detectAgdaVersion } from "../../../helpers/agda-version.js";

test("buildReplayManifest stamps server-derived fields; mergedArgv is [] pre-load", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    const manifest = buildReplayManifest(session);

    expect(manifest.serverVersion).toBe(getServerVersion());
    expect(manifest.os).toMatch(/^\w+-\w+$/u);
    expect(manifest.repoRoot).toBe(TEST_FIXTURE_PROJECT_ROOT);
    expect(manifest.agdaVersion).toBeNull();

    // Before any load(), lastDispatchedLoadArgv is [] and no
    // libraryRegistration exists yet (only set on first
    // ensureProcess()) — so mergedArgv is [].
    expect(session.lastDispatchedLoadArgv).toEqual([]);
    expect(manifest.mergedArgv).toEqual([]);

    // 01-02 tasks 2/3 fill these in for real when a file is loaded;
    // with nothing loaded they stay at their explicit placeholders.
    expect(manifest.agdaDirContents).toBeNull();
    expect(manifest.buildMode).toBe("unknown");
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
