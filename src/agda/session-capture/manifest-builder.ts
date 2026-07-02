// MIT License — see LICENSE
//
// Minimal server-stamped ReplayManifest builder (CAP-01, partial).
// Reads live state off the singleton AgdaSession (never a second
// session — #39) via the free-function-over-shared-state pattern used
// throughout session-load-impl.ts: the session is always the first
// argument, never re-constructed here.
//
// mergedArgv / agdaDirContents / buildMode / importClosureHash /
// inlinedFirstPartySources are explicit placeholders in this plan —
// 01-02 fills them in for real. Do not attempt argv/AGDA_DIR/closure/
// source-inlining logic here.

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
    // Placeholders — filled by 01-02.
    mergedArgv: [],
    agdaDirContents: null,
    buildMode: "unknown",
    importClosureHash: null,
    inlinedFirstPartySources: [],
  };
}
