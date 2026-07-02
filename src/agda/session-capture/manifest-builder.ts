// MIT License — see LICENSE
//
// Server-stamped ReplayManifest builder (CAP-01). Reads live state off
// the singleton AgdaSession (never a second session — #39) via the
// free-function-over-shared-state pattern used throughout
// session-load-impl.ts: the session is always the first argument,
// never re-constructed here.
//
// mergedArgv is real (Plan 01-02 task 1: pre-dedup ordered argv from
// session.lastDispatchedLoadArgv + spawn-time -l flags). agdaDirContents
// / buildMode are real (Plan 01-02 task 2). importClosureHash /
// inlinedFirstPartySources are real (Plan 01-02 task 3, via
// import-closure-hash.ts). Never call mergeCommandLineOptions or
// createLibraryRegistration from this module (Pitfall 2 guard).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { AgdaSession } from "../session.js";
import { findAgdaBinary } from "../binary-discovery.js";
import { getServerVersion } from "../../server-version.js";
import { formatVersion } from "../agda-version.js";

import type { ReplayManifest } from "./artifact-types.js";

/**
 * The name of the conventional interface-cache directory this repo's
 * own fixtures convention uses (`test/fixtures/agda/_build/`). Not an
 * Agda-mandated name — Agda's actual interface cache lives wherever
 * `AGDA_DIR`/project settings point it — but it's the local heuristic
 * `detectBuildFreshness` checks per the plan's Open-Question-3 call.
 */
const BUILD_CACHE_DIR_NAME = "_build";

/** How old a `_build` dir's newest file must be to count as a
 *  pre-existing (shared) cache rather than one this session just
 *  produced. */
const SHARED_BUILD_STALENESS_MS = 5 * 60 * 1000;

/**
 * Read the two config files (`libraries`, `defaults`) that
 * `createLibraryRegistration` writes into a realized `AGDA_DIR`.
 * Reads the SAME files `readNonCommentLines()`
 * (`library-registration.ts`) reads, replicated locally (never
 * imported) per the "never re-derive AGDA_DIR, only read the live
 * session's realized one" constraint — calling
 * `createLibraryRegistration()` from here would mint a second,
 * divergent temp dir instead of describing the one actually in use.
 */
function readRealizedAgdaDir(
  agdaDir: string | null,
): { libraries: string[]; defaults: string[] } | null {
  if (agdaDir === null) {
    return null;
  }

  const readLines = (filePath: string): string[] => {
    if (!existsSync(filePath)) {
      return [];
    }
    return readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0);
  };

  return {
    libraries: readLines(join(agdaDir, "libraries")),
    defaults: readLines(join(agdaDir, "defaults")),
  };
}

/**
 * Recursively find the newest mtime (epoch ms) among every file under
 * `dir`. Returns `null` if the directory has no files. Symlink-blind
 * (uses `withFileTypes` + `isDirectory()`/`isFile()`, no `statSync`
 * on entries) — good enough for a freshness heuristic, not a security
 * boundary.
 */
function newestMtimeMs(dir: string): number | null {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  let newest: number | null = null;
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const childNewest = newestMtimeMs(entryPath);
      if (childNewest !== null && (newest === null || childNewest > newest)) {
        newest = childNewest;
      }
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const mtimeMs = statSync(entryPath).mtimeMs;
      if (newest === null || mtimeMs > newest) {
        newest = mtimeMs;
      }
    } catch {
      // Ignore unreadable individual entries (permission race, etc.)
      // — one bad file shouldn't abort the whole freshness scan.
    }
  }
  return newest;
}

/**
 * Classify whether `repoRoot`'s conventional `_build` interface-cache
 * directory (if any) looks freshly produced by this session or
 * pre-existing from an earlier one. Open-Question-3 heuristic: no
 * `_build` at all -> "fresh" (nothing to share); a `_build` whose
 * newest file is older than `SHARED_BUILD_STALENESS_MS` -> "shared";
 * otherwise -> "fresh". Any filesystem error (permission, race)
 * downgrades to "unknown" rather than throwing.
 */
function detectBuildFreshness(repoRoot: string): "fresh" | "shared" | "unknown" {
  try {
    const buildDir = join(repoRoot, BUILD_CACHE_DIR_NAME);
    if (!existsSync(buildDir)) {
      return "fresh";
    }
    const newest = newestMtimeMs(buildDir);
    if (newest === null) {
      return "fresh";
    }
    const ageMs = Date.now() - newest;
    return ageMs > SHARED_BUILD_STALENESS_MS ? "shared" : "fresh";
  } catch {
    return "unknown";
  }
}

export function buildReplayManifest(session: AgdaSession): ReplayManifest {
  const detectedVersion = session.getAgdaVersion();

  return {
    agdaVersion: detectedVersion ? formatVersion(detectedVersion) : null,
    agdaBinaryPath: findAgdaBinary(session.repoRoot),
    serverVersion: getServerVersion(),
    node: process.version,
    os: `${process.platform}-${process.arch}`,
    cwd: process.cwd(),
    repoRoot: session.repoRoot,
    // Spawn-time `-l` flags (library-registration.ts) first, then the
    // Cmd_load-time flags captured pre-dedup on session.load() (CAP-01
    // / D-04) — never routed through mergeCommandLineOptions, which
    // would silently drop order-significant duplicate flags.
    mergedArgv: [
      ...(session.libraryRegistration?.agdaArgs ?? []),
      ...session.lastDispatchedLoadArgv,
    ],
    // Read directly off the live session's realized AGDA_DIR — never
    // re-derived via createLibraryRegistration() (which would mint a
    // second, divergent temp dir).
    agdaDirContents: readRealizedAgdaDir(session.libraryRegistration?.agdaDir ?? null),
    buildMode: detectBuildFreshness(session.repoRoot),
    importClosureHash: null,
    inlinedFirstPartySources: [],
  };
}
