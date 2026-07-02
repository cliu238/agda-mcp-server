// MIT License — see LICENSE
//
// Shared replay mechanics for the capture-regression matrix (LOCK-01/
// LOCK-02, Phase 3 Plan 02). ONE function drives a `CaptureRegressionEntry`
// through the MCP tool-call boundary (D-02): copy the entry's fixture
// into an isolated tmpdir, call the entry's tool, optionally splice a
// mutation's content over a target file and reload — both
// `scripts/emit-regression.mjs`'s own D-05 self-check and Wave-3's
// vitest runner (`test/integration/mcp/capture-regression.test.ts`)
// call this SAME function, so neither duplicates MCP-harness-driving
// or mutation logic (must_haves' anti-drift requirement).

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { resolveFileWithinRoot } from "../../src/repo-root.js";
// @ts-expect-error script module lacks types
import { categorySet } from "../../scripts/oracle/orcl-01-differential.mjs";

import { createMcpHarness } from "./mcp-harness.js";
import { TEST_SERVER_REPO_ROOT } from "./repo-root.js";

import type { CaptureRegressionEntry } from "../fixtures/capture-regression-matrix.js";

/** The normalized observed-result shape both the emitter's D-05
 *  self-check and the Wave-3 runner assert against — the SAME tuple
 *  ORCL-01's cold side already normalizes to (never re-derived). */
export interface ReplayObserved {
  classification: string;
  success: boolean;
  goalCount: number;
  invisibleGoalCount: number;
  hasHoles: boolean;
  errorCategories: string[];
}

/** A directory-entry filter matching `mcp-end-to-end-parity.test.ts`'s
 *  own `isolateFixtures()` precedent — excludes a fixture's own
 *  gitignored interface-cache directory and any stray half-written
 *  atomic-write temp file, so a copy never drags stale build state
 *  into the isolated replay tmpdir. */
function skipBuildArtifacts(src: string): boolean {
  const name = basename(src);
  return name !== "_build" && !name.startsWith(".agda-mcp-tmp-");
}

/**
 * Replay a single `CaptureRegressionEntry` at the MCP tool-call
 * boundary: copy `entry.fixtureDir` (resolved against `fixturesRoot`,
 * sandboxed) into a fresh isolated tmpdir, drive `entry.tool` once,
 * then — when `entry.mutation` is present — splice the mutation
 * source's content over the mutation target (both resolved against the
 * TMPDIR copy, never the original `fixturesRoot`, and both re-
 * sandboxed) and drive `entry.tool` a SECOND time on the same
 * `entryFile`. The second call is authoritative whenever a mutation
 * exists — it is the "post-trigger" observation both the false-green
 * family and a plain regression need.
 *
 * The harness and tmpdir are always torn down in `finally`, so a
 * thrown mid-replay error (a malformed entry, a missing fixture path)
 * never leaks the spawned server process or the tmpdir.
 */
export async function replayCaptureRegressionEntry(
  entry: CaptureRegressionEntry,
  fixturesRoot: string,
): Promise<{ observed: ReplayObserved }> {
  const tmpDir = mkdtempSync(join(tmpdir(), "agda-mcp-capture-regression-"));
  let harness: Awaited<ReturnType<typeof createMcpHarness>> | null = null;

  try {
    const sourceDir = resolveFileWithinRoot(fixturesRoot, entry.fixtureDir);
    const destDir = join(tmpDir, entry.fixtureDir);
    cpSync(sourceDir, destDir, { recursive: true, filter: skipBuildArtifacts });

    harness = await createMcpHarness({
      serverRepoRoot: TEST_SERVER_REPO_ROOT,
      projectRoot: tmpDir,
      extraEnv: entry.serverEnv,
    });

    let result = await harness.callTool(entry.tool, {
      file: join(entry.fixtureDir, entry.entryFile),
    });

    if (entry.mutation) {
      // Both resolved against the ISOLATED TMPDIR copy — never the
      // original (checked-in) fixturesRoot, so a replay never mutates
      // the tracked fixture tree itself.
      const copyRoot = join(tmpDir, entry.fixtureDir);
      const targetPath = resolveFileWithinRoot(copyRoot, entry.mutation.targetFile);
      const sourcePath = resolveFileWithinRoot(copyRoot, entry.mutation.sourceFile);
      writeFileSync(targetPath, readFileSync(sourcePath, "utf8"), "utf8");

      // The post-mutation reload is authoritative — this is the
      // "trigger sequence" REPRO-01 requires.
      result = await harness.callTool(entry.tool, {
        file: join(entry.fixtureDir, entry.entryFile),
      });
    }

    const data = result.structuredContent.data as {
      classification: string;
      success: boolean;
      goalCount: number;
      invisibleGoalCount: number;
      hasHoles: boolean;
      errors?: unknown;
      warnings?: unknown;
    };
    const errors: string[] = Array.isArray(data.errors) ? (data.errors as string[]) : [];
    const warnings: string[] = Array.isArray(data.warnings) ? (data.warnings as string[]) : [];

    return {
      observed: {
        classification: data.classification,
        success: data.success,
        goalCount: data.goalCount,
        invisibleGoalCount: data.invisibleGoalCount,
        hasHoles: data.hasHoles,
        errorCategories: categorySet([...errors, ...warnings]),
      },
    };
  } finally {
    if (harness) {
      await harness.close();
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
