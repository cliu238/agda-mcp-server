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

import type { AgdaSession } from "../session.js";
import { findAgdaBinary } from "../binary-discovery.js";
import { getServerVersion } from "../../server-version.js";
import { formatVersion } from "../agda-version.js";

import type { ReplayManifest } from "./artifact-types.js";

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
    // Placeholder — filled by 01-02 (task 2).
    agdaDirContents: null,
    buildMode: "unknown",
    importClosureHash: null,
    inlinedFirstPartySources: [],
  };
}
