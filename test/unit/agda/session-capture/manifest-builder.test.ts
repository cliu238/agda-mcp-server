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

test("buildReplayManifest stamps server-derived fields and emits 01-02 placeholders", async () => {
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);

  try {
    const manifest = buildReplayManifest(session);

    expect(manifest.serverVersion).toBe(getServerVersion());
    expect(manifest.os).toMatch(/^\w+-\w+$/u);
    expect(manifest.repoRoot).toBe(TEST_FIXTURE_PROJECT_ROOT);
    expect(manifest.agdaVersion).toBeNull();

    // Explicit 01-02 placeholders — this plan never attempts
    // argv/AGDA_DIR/closure/source-inlining logic.
    expect(manifest.mergedArgv).toEqual([]);
    expect(manifest.agdaDirContents).toBeNull();
    expect(manifest.buildMode).toBe("unknown");
    expect(manifest.importClosureHash).toBeNull();
    expect(manifest.inlinedFirstPartySources).toEqual([]);
  } finally {
    await session.destroy();
  }
});
