// MIT License — see LICENSE
//
// Content-hash and first-party source inlining over a loaded file's
// full transitive import closure (CAP-01, D-07). Both exports reuse
// the identical closure-file-set computation via `buildImportGraph`/
// `computeImpact` (`../import-graph.ts`) — no second file walker.
//
// hashImportClosure() feeds ReplayManifest.importClosureHash so a
// downstream oracle (Phase 2) can pin to an exact environment and
// abort on drift. inlineFirstPartySources() feeds
// ReplayManifest.inlinedFirstPartySources so a captured artifact is
// replayable on a second machine without the original checkout.
// Since buildImportGraph/computeImpact only ever walk files already
// under `projectRoot`, every file the closure walk returns is
// inherently first-party — third-party library modules are never
// present in the graph in the first place, so D-07's "never inline
// library source" constraint is satisfied for free.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { buildImportGraph, computeImpact } from "../import-graph.js";
import { MAX_AGDA_SOURCE_BYTES } from "../../session/safe-source-io.js";
import type { AgdaVersion } from "../agda-version.js";

/**
 * Compute the sorted, repo-root-relative closure file set for
 * `filePath`: the file itself plus everything it directly or
 * transitively imports. Returns `null` when the file isn't part of
 * the project's import graph (doesn't exist, lives outside
 * `repoRoot`, or has an unrecognised extension) — mirrors
 * `computeImpact`'s own null contract.
 */
function closureFileSet(
  repoRoot: string,
  filePath: string,
  agdaVersion?: AgdaVersion,
): string[] | null {
  const graph = buildImportGraph(repoRoot, agdaVersion);
  const impact = computeImpact(graph, repoRoot, filePath);
  if (impact === null) {
    return null;
  }
  const files = new Set<string>([
    impact.file,
    ...impact.directDependencies,
    ...impact.transitiveDependencies,
  ]);
  return [...files].sort();
}

/**
 * Placeholder hashed in place of an oversized file's raw bytes
 * (T-02-01 DoS mitigation, mirrors `MAX_AGDA_SOURCE_BYTES`). This
 * only ever affects the digest — never a replay-critical inlined
 * source. See `inlineFirstPartySources`, which excludes oversized
 * files entirely instead of substituting a marker for their content.
 */
function oversizedPlaceholder(relPath: string): string {
  return `<oversized:${relPath}>`;
}

/**
 * Deterministic sha256 content-hash over the loaded file's full
 * transitive import closure. Iterates the sorted, repo-root-relative
 * closure file set and folds each `(path, content-bytes)` pair into
 * one running hash, null-byte-delimited so no path/content boundary
 * ambiguity exists (a file named e.g. `A` next to content `B` can't
 * collide with a file named `AB` and empty content). Sorting +
 * relative paths make the digest portable across machines/checkouts.
 * Returns `null` when `filePath` isn't part of the project's import
 * graph.
 */
export function hashImportClosure(
  repoRoot: string,
  filePath: string,
  agdaVersion?: AgdaVersion,
): string | null {
  const files = closureFileSet(repoRoot, filePath, agdaVersion);
  if (files === null) {
    return null;
  }

  const hash = createHash("sha256");
  for (const relPath of files) {
    hash.update(relPath);
    hash.update("\0");

    const absPath = resolve(repoRoot, relPath);
    let size: number | null;
    try {
      size = statSync(absPath).size;
    } catch {
      size = null;
    }

    if (size !== null && size <= MAX_AGDA_SOURCE_BYTES) {
      hash.update(readFileSync(absPath));
    } else {
      // Oversized (or unreadable) — hash a placeholder marker instead
      // of an unbounded read, so a pathological closure can't exhaust
      // memory.
      hash.update(oversizedPlaceholder(relPath));
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Full text of every first-party (project-local) file in the loaded
 * file's transitive import closure, so a captured artifact can be
 * replayed on a second machine without the original checkout (D-07).
 * Files exceeding `MAX_AGDA_SOURCE_BYTES` are EXCLUDED entirely
 * (never truncated or replaced with placeholder content — a
 * truncated or fake inlined source would silently corrupt a replay)
 * and their paths are listed separately in `skipped`. Returns
 * `{ sources: [], skipped: [] }` when `filePath` isn't part of the
 * project's import graph.
 */
export function inlineFirstPartySources(
  repoRoot: string,
  filePath: string,
  agdaVersion?: AgdaVersion,
): { sources: Array<{ path: string; content: string }>; skipped: string[] } {
  const files = closureFileSet(repoRoot, filePath, agdaVersion);
  if (files === null) {
    return { sources: [], skipped: [] };
  }

  const sources: Array<{ path: string; content: string }> = [];
  const skipped: string[] = [];
  for (const relPath of files) {
    const absPath = resolve(repoRoot, relPath);
    let size: number;
    try {
      size = statSync(absPath).size;
    } catch {
      // Unreadable (permission race, deleted mid-scan) — exclude
      // rather than fabricate content.
      skipped.push(relPath);
      continue;
    }
    if (size > MAX_AGDA_SOURCE_BYTES) {
      skipped.push(relPath);
      continue;
    }
    sources.push({ path: relPath, content: readFileSync(absPath, "utf8") });
  }
  return { sources, skipped };
}
