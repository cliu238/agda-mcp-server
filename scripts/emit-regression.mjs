// MIT License — see LICENSE
//
// The regression-test emitter (LOCK-01/LOCK-02, Phase 3 Plan 02): turns
// a captured defect + a FRESH oracle verdict into ONE capture-
// regression matrix entry (D-01 — data, never a generated per-defect
// .test.ts) plus the fixture files that entry points at, materialized
// under the tracked test/fixtures/agda/ tree. Refuses to lock a
// capture whose ORCL-01 is inconclusive, whose ORCL-02 is cheat-
// flagged or no-policy-with-non-empty-findings (D-06), or whose
// observed replay already matches the proposed expected value (D-05 —
// nothing to demonstrate RED with).
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 (see
// .planning/phases/03-.../03-CONTEXT.md) — no new MCP verb, no new
// src/ tool surface.
//
// Run with: npx tsx scripts/emit-regression.mjs <path-to-artifact.json> [flags]
// (NOT plain `node` — this script's src/ + test/ imports use
// .js-suffixed specifiers pointing at sibling .ts files; Node's native
// TS type-stripping does not rewrite .js -> .ts, so plain node fails
// with ERR_MODULE_NOT_FOUND on the first such import. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file — see orcl-01-differential.mjs's
// header for the same note.)

import { dirname, extname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { findWarmLoadTuple } from "./oracle/orcl-01-differential.mjs";

import { PathSandboxError, resolveFileWithinRoot } from "../src/repo-root.js";

// ── judgeRefusal ─────────────────────────────────────────────────────

/**
 * Decide whether a fresh D-02 verdict may ever become a permanent
 * capture-regression lock (D-06). Returns a human-readable refusal
 * reason string, or `null` when nothing blocks locking. Checked in a
 * fixed order — the first three conditions ALWAYS refuse regardless of
 * `options.force`; only the fourth ("nothing meaningful to lock") is
 * overridable, since it is a "there is nothing to prove RED for" call
 * rather than a soundness/trustworthiness concern.
 *
 * `verdict.orcl03` is NEVER read here — ORCL-03 is advisory in every
 * state (D-02/D-06) and can never gate this decision.
 */
export function judgeRefusal(verdict, options = {}) {
  if (verdict.orcl01.kind === "inconclusive") {
    return `ORCL-01 inconclusive (probe: ${verdict.orcl01.probe}) — no trustworthy expected value`;
  }
  if (verdict.orcl02.kind === "cheat-flagged") {
    return "ORCL-02 flagged a cheat — never golden-master a postulate/flag cheat as correct";
  }
  if (verdict.orcl02.kind === "no-policy" && verdict.orcl02.findings.length > 0) {
    return "ORCL-02 has no whitelist policy AND non-empty findings — cannot distinguish cheat from sanctioned axiom";
  }
  if (verdict.orcl01.kind !== "server-false-green-candidate" && options.force !== true) {
    return `ORCL-01 outcome "${verdict.orcl01.kind}" has nothing meaningful to lock — pass --force to override`;
  }
  return null;
}

// ── stripFixtureDirPrefix (internal, defensive-only) ────────────────

/**
 * `primaryArtifact.manifest.inlinedFirstPartySources[].path` values are
 * recorded relative to the CAPTURING SESSION's own `repoRoot`
 * (`src/agda/session-capture/manifest-builder.ts`). When that
 * `repoRoot` CONTAINS `fixtureDir` as a subdirectory (the real
 * flagship shape — the harness's `projectRoot` is an outer mkdtemp
 * root, and the loaded file lives at `<root>/<fixtureDir>/Main.agda`),
 * every captured path is ALREADY `fixtureDir`-prefixed. This strips
 * that prefix so a bare filename (matching the matrix schema's
 * `entryFile`/`mutation.*` contract) is used everywhere else — never
 * assumes the prefix is present, since some captures may already
 * record bare paths (the defensive fallback, Test G3).
 */
function stripFixtureDirPrefix(path, fixtureDir) {
  if (path === fixtureDir || path.startsWith(`${fixtureDir}/`)) {
    return path.slice(fixtureDir.length + 1);
  }
  return path;
}

// ── materializeFixtureFiles ──────────────────────────────────────────

/** `Dep.agda` -> `Dep.broken.agda`; a directory-prefixed bare path
 *  (`sub/Dep.agda`) keeps its directory (`sub/Dep.broken.agda`); a
 *  bare path with no extension gets a trailing `.broken`. */
function insertBrokenSuffix(barePath) {
  const slashIdx = barePath.lastIndexOf("/");
  const dir = slashIdx === -1 ? "" : barePath.slice(0, slashIdx + 1);
  const filename = slashIdx === -1 ? barePath : barePath.slice(slashIdx + 1);
  const ext = extname(filename);
  if (ext === "") {
    return `${dir}${filename}.broken`;
  }
  const stem = filename.slice(0, filename.length - ext.length);
  return `${dir}${stem}.broken${ext}`;
}

/**
 * Write `content` to `test/fixtures/agda/<fixtureDir>/<barePath>`
 * under `repoRoot`, sandboxed via `resolveFileWithinRoot` (D-08's NEW
 * containment site: the TRACKED repo tree, not a tmpdir). A `barePath`
 * that escapes the sandbox is silently skipped (never written anywhere
 * — mirrors `materializeCaptureEnvironment`'s existing skip-on-
 * traversal behavior) and this returns `null`; otherwise returns the
 * absolute path actually written, so callers can track/roll back every
 * write this function performs.
 */
function writeFixtureFile(repoRoot, fixtureDir, barePath, content) {
  let dest;
  try {
    dest = resolveFileWithinRoot(repoRoot, join("test/fixtures/agda", fixtureDir, barePath));
  } catch (err) {
    if (err instanceof PathSandboxError) {
      return null;
    }
    throw err;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, "utf8");
  return dest;
}

/**
 * Materialize a captured defect's inlined first-party sources into the
 * tracked `test/fixtures/agda/<fixtureDir>/` tree, deriving a bare
 * `mutation` (when a `baselineArtifact` reveals exactly one differing
 * file) and a bare `entryFile` (from the primary artifact's last
 * load-family recorded action). Every write is sandboxed; an escaping
 * path is skipped, never written (D-08). Returns
 * `{ mutation?, entryFile?, writtenFiles }` — `writtenFiles` is the
 * absolute-path write list (used for D-05 self-check rollback).
 *
 * Ambiguity guard: if MORE than one raw path differs between the
 * baseline and primary artifacts, this throws rather than silently
 * picking one — this emitter version supports exactly one mutated
 * file, matching the flagship's verified shape.
 */
export function materializeFixtureFiles({ primaryArtifact, baselineArtifact, fixtureDir, repoRoot }) {
  const primarySources = Array.isArray(primaryArtifact?.manifest?.inlinedFirstPartySources)
    ? primaryArtifact.manifest.inlinedFirstPartySources
    : [];
  const baselineSources = Array.isArray(baselineArtifact?.manifest?.inlinedFirstPartySources)
    ? baselineArtifact.manifest.inlinedFirstPartySources
    : [];

  const baselineContentByPath = new Map();
  for (const source of baselineSources) {
    if (typeof source?.path === "string" && typeof source?.content === "string") {
      baselineContentByPath.set(source.path, source.content);
    }
  }

  // First pass: find every RAW path present in both primary and
  // baseline whose content differs — compared un-stripped, since both
  // artifacts share the same capturing session's repoRoot.
  const differingRawPaths = [];
  if (baselineArtifact) {
    for (const source of primarySources) {
      if (typeof source?.path !== "string" || typeof source?.content !== "string") continue;
      const baselineContent = baselineContentByPath.get(source.path);
      if (baselineContent !== undefined && baselineContent !== source.content) {
        differingRawPaths.push(source.path);
      }
    }
  }
  if (differingRawPaths.length > 1) {
    const bareNames = differingRawPaths.map((rawPath) => stripFixtureDirPrefix(rawPath, fixtureDir));
    throw new Error(
      `materializeFixtureFiles: ambiguous mutation — more than one path differs between baseline and primary: ${bareNames.join(", ")}`,
    );
  }
  const mutatedRawPath = differingRawPaths[0];

  const writtenFiles = [];
  let mutation;

  for (const source of primarySources) {
    if (typeof source?.path !== "string" || typeof source?.content !== "string") continue;
    const barePath = stripFixtureDirPrefix(source.path, fixtureDir);

    if (mutatedRawPath !== undefined && source.path === mutatedRawPath) {
      const brokenBarePath = insertBrokenSuffix(barePath);
      // The BASELINE's (healthy) content lands at the target's own bare
      // path — this is what stays checked in as the "before" state.
      const targetDest = writeFixtureFile(repoRoot, fixtureDir, barePath, baselineContentByPath.get(source.path));
      if (targetDest !== null) writtenFiles.push(targetDest);
      // The PRIMARY's (differing) content is the mutation PAYLOAD —
      // never loaded directly, only spliced over the target mid-replay.
      const brokenDest = writeFixtureFile(repoRoot, fixtureDir, brokenBarePath, source.content);
      if (brokenDest !== null) writtenFiles.push(brokenDest);
      mutation = { targetFile: barePath, sourceFile: brokenBarePath };
      continue;
    }

    const dest = writeFixtureFile(repoRoot, fixtureDir, barePath, source.content);
    if (dest !== null) writtenFiles.push(dest);
  }

  const warm = findWarmLoadTuple(primaryArtifact);
  const entryFile = warm !== null ? stripFixtureDirPrefix(warm.file, fixtureDir) : undefined;

  return { mutation, entryFile, writtenFiles };
}
