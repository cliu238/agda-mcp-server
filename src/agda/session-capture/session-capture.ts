// MIT License — see LICENSE
//
// Barrel re-export for the pure session-capture model. No logic lives
// in this file — it exists so tool code has a single import surface
// for the capture model per the barrel + focused siblings pattern
// (see src/agda/agent-ux.ts for the precedent).

export {
  buildReplayManifest,
} from "./manifest-builder.js";

export {
  fingerprintBugReport,
  readDedupIndex,
  routeDedup,
  type DedupIndexEntry,
} from "./dedup-index.js";

export type {
  CaptureArtifact,
  CaptureReference,
  DedupRouting,
  OracleSubstrate,
  RecordedAction,
  ReplayManifest,
} from "./artifact-types.js";
