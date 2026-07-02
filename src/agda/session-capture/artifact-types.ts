// MIT License — see LICENSE
//
// Full CaptureArtifact type contract for Phase 1 (Capture Foundation)
// and beyond. Interface-first: every field every later Phase-1 plan
// (01-02..01-05) fills in already exists here so those plans only
// implement logic against a fixed shape — they must not re-touch this
// file. Fields not yet implemented in this plan are documented with
// which later plan populates them; this plan emits explicit
// placeholder values (empty arrays / null / "unknown") for those
// fields rather than omitting them, so every consumer can rely on the
// full shape always being present.

import type { TriageResult } from "../error-classifier.js";

/**
 * Server-stamped replay manifest: everything needed to reproduce the
 * environment a captured session ran in. Never caller-supplied (D-04)
 * — every field is derived from the live `AgdaSession` / process
 * environment at capture time.
 */
export interface ReplayManifest {
  /** Detected Agda version, or null if never detected (no command sent yet). */
  agdaVersion: string | null;
  /** Resolved path to the Agda binary the session would spawn. */
  agdaBinaryPath: string;
  /** This server's package.json version. */
  serverVersion: string;
  /** `process.version`. */
  node: string;
  /** `${process.platform}-${process.arch}`. */
  os: string;
  /** `process.cwd()` at capture time. */
  cwd: string;
  /** The session's `repoRoot`. */
  repoRoot: string;
  /**
   * Merged Agda command-line argv, ORDERED with duplicates preserved
   * (repeated `-i`/`-l`/`--library-file` are order-significant).
   * Filled by 01-02; this plan always emits `[]`.
   */
  mergedArgv: string[];
  /**
   * Realized `AGDA_DIR` contents (the `libraries` and `defaults`
   * config files actually written for this session). Filled by
   * 01-02; this plan always emits `null`.
   */
  agdaDirContents: { libraries: string[]; defaults: string[] } | null;
  /**
   * Whether the session's `_build` interface-file cache is a fresh
   * (isolated) build or shared with other sessions. Filled by 01-02;
   * this plan always emits `"unknown"`.
   */
  buildMode: "fresh" | "shared" | "unknown";
  /**
   * Content-hash of the full transitive import closure, so a
   * downstream oracle can pin to it and abort on drift. Filled by
   * 01-02; this plan always emits `null`.
   */
  importClosureHash: string | null;
  /**
   * First-party (project-local, non-library) source files appearing
   * in the transitive import closure, inlined so a second machine can
   * replay without the original checkout (D-07). Third-party library
   * source is pinned/replayed via the manifest, never inlined here.
   * Filled by 01-02; this plan always emits `[]`.
   */
  inlinedFirstPartySources: Array<{ path: string; content: string }>;
}

/**
 * A single recorded tool-call + normalized-envelope pair from the
 * CAP-04 action log. Populated by 01-03/01-05; this plan always
 * emits an empty `recordedActions` array on the artifact.
 */
export interface RecordedAction {
  tool: string;
  args: Record<string, unknown>;
  timestamp: number;
  normalizedResponse: Record<string, unknown> | undefined;
}

/**
 * The oracle substrate (CAP-05): agent/task-supplied material the
 * Phase-2 oracle triad will read to judge a capture. Recorded, never
 * judged, in Phase 1. Populated by 01-04/01-05; this plan always
 * emits `null` for the whole object on the artifact.
 */
export interface OracleSubstrate {
  beforeSource: string | null;
  beforeSourceOrigin: "agent-supplied" | "git-diff" | "unavailable";
  afterSource: string | null;
  intendedGoalType: string | null;
  expectedSignature: string | null;
}

/**
 * CAP-02 dedup routing result: whether this capture is a first-time
 * report or a recurrence of a previously captured fingerprint, and
 * how many times it has now been seen.
 */
export interface DedupRouting {
  kind: "new-bug" | "update";
  fingerprint: string;
  recurrence: number;
}

/**
 * The full, heavy capture payload. Never returned directly from the
 * `agda_capture_session` tool (D-09/P2) — staged to disk under a
 * gitignored `.agda-mcp/captures/` directory; the tool returns a
 * lightweight `CaptureReference` instead.
 */
export interface CaptureArtifact {
  /** ISO timestamp of capture. */
  capturedAt: string;
  manifest: ReplayManifest;
  recordedActions: RecordedAction[];
  oracleSubstrate: OracleSubstrate | null;
  dedup: DedupRouting;
  /**
   * QUEUE-03/D-10: `classifyAgdaError()`'s output for the last
   * load-family action's recorded error, or `null` when no
   * load-family action ever recorded one. Populated by
   * `src/tools/register-capture-session.ts` via
   * `src/agda/session-capture/triage-derivation.ts` — always
   * explicit `null` (never omitted), per this file's own "full shape
   * always present" convention.
   */
  triage: TriageResult | null;
  /** Optional free-text note supplied by the capturing agent. */
  note?: string;
}

/**
 * The lightweight reference returned in `ToolResult.data` by
 * `agda_capture_session` (D-09/P2) — never the full `CaptureArtifact`.
 */
export interface CaptureReference {
  /** Absolute path to the staged CaptureArtifact JSON on disk. */
  stagedPath: string;
  fingerprint: string;
  kind: "new-bug" | "update";
  recurrence: number;
  summary: string;
  keyDiagnostics: string[];
  nextAction: string;
  /**
   * D-10 guardrail: the underlying Agda session's load/typecheck
   * verdict (e.g. "ok-complete" | "type-error" | "suspicious-green"),
   * or null when no load ever occurred. Distinct from `kind`, which is
   * dedup routing, not the session verdict — this field MUST always be
   * present (never omitted), even when its value is null.
   */
  sessionClassification: string | null;
}
