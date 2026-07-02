// MIT License — see LICENSE
//
// CAP-05's oracle substrate builder: the material Phase 2's oracle
// triad will read to judge a capture (before/after source diff,
// intended goal type, expected top-level signature). This plan only
// builds the substrate — it is never judged here (D-01: capture is
// state-agnostic).
//
// Every field is optional-and-non-throwing (D-02): a session with no
// loaded file, no git repo, or a dead/stuck Agda process must still
// return a full (if mostly-null) OracleSubstrate rather than fail the
// capture call that surfaces it.

import { execFileSync } from "node:child_process";
import { relative } from "node:path";

import type { AgdaSession } from "../session.js";

/**
 * Resolve the before-source diff baseline per D-04's plan-phase
 * resolution: agent-supplied > git HEAD diff > unavailable, in that
 * priority order. Never throws — a missing git repo, an untracked
 * file, a missing HEAD commit, or a missing `git` binary all fall
 * through to `"unavailable"`.
 */
export function resolveBeforeSource(
  session: AgdaSession,
  explicit?: string,
): {
  beforeSource: string | null;
  beforeSourceOrigin: "agent-supplied" | "git-diff" | "unavailable";
} {
  if (explicit !== undefined) {
    // Agent-supplied wins outright — no git shell-out attempted.
    return { beforeSource: explicit, beforeSourceOrigin: "agent-supplied" };
  }

  if (!session.currentFile) {
    return { beforeSource: null, beforeSourceOrigin: "unavailable" };
  }

  try {
    const relativePath = relative(session.repoRoot, session.currentFile);
    const beforeSource = execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: session.repoRoot,
      encoding: "utf8",
      // Suppress git's stderr for the expected "not a repo" / "not
      // found" failure paths (matches src/index.ts's execFileSync
      // convention) — the try/catch below already turns any failure
      // into "unavailable" so a noisy stderr write serves no purpose.
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { beforeSource, beforeSourceOrigin: "git-diff" };
  } catch {
    // Not a git repo, file untracked, git not installed, no HEAD
    // commit yet — any of these fall through to "unavailable" rather
    // than propagating a shell/process error to the caller.
    return { beforeSource: null, beforeSourceOrigin: "unavailable" };
  }
}
