// MIT License — see LICENSE
//
// Success criterion 4's N-rerun anti-phantom gate: WARM-REPLAY-VIA-
// HARNESS (05-CONTEXT.md / RESEARCH.md Open Question 1, resolved).
// Re-runs the SAME recorded load-family tool+args against N
// independent fresh `createMcpHarness` sessions, each built from a
// freshly `materializeCaptureEnvironment`'d copy of the captured
// sources, and compares only the N observed classifications against
// each other — never a repeated cold ORCL-01 spawn
// (scripts/oracle/orcl-01-differential.mjs's own cold `Cmd_load`
// differential is a DIFFERENT check with a DIFFERENT purpose), and
// never a re-run of ORCL-02 (scripts/oracle/orcl-02-soundness-scan.mjs's
// static pragma/postulate scan has no timing dimension to be flaky
// about). Gated strictly to load-family captures (Pitfall 4): a
// capture with no load-family recorded action classifies trivially as
// "not-applicable" without ever touching an injected dependency.
//
// Ships as a scripts/ + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface. Must be imported via `npx tsx` (not
// plain `node`): it imports .ts siblings (src/repo-root.ts,
// test/helpers/mcp-harness.ts) via .js-suffixed specifiers, and Node's
// native TS type-stripping does not rewrite .js -> .ts. tsx resolves
// this correctly, and so does vitest's own resolver when this module
// is imported from a .test.ts file.

import { findWarmLoadTuple, materializeCaptureEnvironment } from "../oracle/orcl-01-differential.mjs";

import { createMcpHarness } from "../../test/helpers/mcp-harness.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";

const LOAD_FAMILY_TOOL_PATTERN = /^agda_(load|typecheck)/;

/**
 * Scan `artifact.recordedActions` (defaulting to `[]` when absent or
 * not an array) from the END for the last entry whose `tool` is a
 * string matching `/^agda_(load|typecheck)/` AND whose
 * `normalizedResponse.data` carries a string `file` and a string
 * `classification` — the SAME two gates `findWarmLoadTuple` applies —
 * returning that RAW `RecordedAction` object (carrying its own
 * `.tool`/`.args`) or `null`.
 *
 * This is a small, DELIBERATE, additive duplicate of
 * `findWarmLoadTuple`'s own internal scan-for-last-match loop
 * (scripts/oracle/orcl-01-differential.mjs) — INCLUDING its
 * response-shape gating, so both scans always select the SAME action
 * (a trailing FAILED load-family call, whose error envelope has no
 * `data.file`/`data.classification`, is skipped by both) — rather
 * than either:
 *   (a) modifying that module's existing export to also return the
 *       tool name — avoided, since `scripts/oracle/*` is Phase-2-owned
 *       and this project's Architectural Responsibility Map marks it
 *       consumed-not-modified by this phase; or
 *   (b) hardcoding a default tool name like `"agda_load"` for the
 *       replay call — avoided, since the ACTUAL tool called matters:
 *       `agda_load_no_metas`'s strict-terminus behavior differs
 *       materially from `agda_load`'s lenient one (Phase 3.1's own
 *       fix), so replaying the wrong tool would silently exercise the
 *       wrong code path.
 *
 * Module-private — not exported. Only ever called after
 * `findWarmLoadTuple(artifact)` has already confirmed non-null, so a
 * matching action is guaranteed to exist.
 */
function findLastLoadFamilyAction(artifact) {
  const actions = Array.isArray(artifact?.recordedActions) ? artifact.recordedActions : [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (typeof action?.tool !== "string" || !LOAD_FAMILY_TOOL_PATTERN.test(action.tool)) {
      continue;
    }
    // Mirror findWarmLoadTuple's response-shape gate: entries without a
    // string data.file/data.classification (e.g. a failed call's error
    // envelope) are scanned PAST there too. Without this clause the two
    // scans could select DIFFERENT actions, and the flake gate would
    // replay an action the ORCL-01 candidate never keyed on.
    const data = action?.normalizedResponse?.data;
    if (!data || typeof data.file !== "string" || typeof data.classification !== "string") {
      continue;
    }
    return action;
  }
  return null;
}

/**
 * N-times warm-replay stability check (success criterion 4).
 *
 * Gated on `findWarmLoadTuple(artifact) !== null` (Pitfall 4): a
 * capture with no load-family recorded action has nothing timing-
 * dependent to be flaky about, so this returns
 * `{ classification: "not-applicable" }` immediately, without ever
 * invoking `deps.materializeCaptureEnvironment`/`deps.createMcpHarness`
 * — proven by an asserted zero call-count in this module's own tests.
 *
 * Otherwise replays the faithful `action.tool`/`action.args` pair (the
 * ACTUAL last load-family call the agent made, never a hardcoded
 * default) against `n` independent fresh warm sessions: each iteration
 * materializes its OWN fresh temp-dir copy of the captured sources and
 * spawns its OWN fresh `createMcpHarness` server instance — never one
 * long-lived session reused across iterations, and never a repeated
 * cold ORCL-01 spawn. Both the materialized temp dirs and the spawned
 * harness are torn down at the end of every iteration (nested
 * `finally` blocks: the temp dir is cleaned even when `createHarness`
 * itself rejects or `close()` fails), so neither leaks regardless of
 * the observed classification.
 *
 * @param {object} artifact - A staged CaptureArtifact-shaped object.
 * @param {number} [n=3] - Number of independent replay iterations.
 *   Claude's discretion (05-CONTEXT.md "Claude's Discretion" — default
 *   N for flake-classification re-runs): 3 matches Pitfall 3's own
 *   suggested "3-5" range. Callers (dogfood-wrapup.mjs) may override
 *   via their own `--rerun-n`/`AGDA_MCP_DOGFOOD_RERUN_N` argument —
 *   this module itself reads no env var directly. Must be a positive
 *   integer: anything else (NaN, 0, a negative or fractional value)
 *   throws rather than classifying on an empty observation list.
 * @param {object} [options]
 * @param {{
 *   materializeCaptureEnvironment?: (artifact: object) => Promise<{ tmpDir: string, cleanup(): void }>,
 *   createMcpHarness?: (opts: { serverRepoRoot: string, projectRoot: string }) => Promise<{
 *     callTool(name: string, args: Record<string, unknown>): Promise<unknown>,
 *     close(): Promise<void>,
 *   }>,
 * }} [options.deps] - Dependency-injection seam, mirroring
 *   `scripts/oracle/run-oracle.mjs`'s own `options.deps` convention.
 *   Used by this module's own tests to inject a fake harness/
 *   materializer with zero real Agda/subprocess cost. Never needed by
 *   real callers.
 * @returns {Promise<
 *   { classification: "not-applicable" }
 *   | { classification: "deterministic" | "flaky" | "replay-inconclusive", observedClassifications: (string | null)[] }
 * >} `"replay-inconclusive"` means EVERY replay failed to produce a
 *   domain classification (all-null observations — e.g. a broken
 *   replay environment): "cannot judge", mirroring ORCL-01's own
 *   inconclusive-vs-diverges distinction, never conflated with
 *   `"flaky"`.
 */
export async function classifyFlakiness(artifact, n = 3, options = {}) {
  const warm = findWarmLoadTuple(artifact);
  if (warm === null) {
    return { classification: "not-applicable" };
  }

  // Guaranteed non-null: findWarmLoadTuple's own non-null return
  // implies at least one action matching the SAME tool-pattern exists.
  const action = findLastLoadFamilyAction(artifact);

  // Defense-in-depth against an unvalidated caller-supplied count: a
  // NaN/0/negative `n` would skip the replay loop entirely and
  // classify on an EMPTY observation list — `allAgree` would be false
  // with ZERO harness calls, silently diverting every deterministic
  // candidate into the flaky side channel. Refuse loudly instead.
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`classifyFlakiness: n must be a positive integer, got ${n}`);
  }

  const materialize = options.deps?.materializeCaptureEnvironment ?? materializeCaptureEnvironment;
  const createHarness = options.deps?.createMcpHarness ?? createMcpHarness;

  const observedClassifications = [];
  for (let i = 0; i < n; i++) {
    const materialized = await materialize(artifact);
    try {
      const harness = await createHarness({
        serverRepoRoot: SERVER_REPO_ROOT,
        projectRoot: materialized.tmpDir,
      });
      try {
        const result = await harness.callTool(action.tool, action.args);
        observedClassifications.push(result?.structuredContent?.data?.classification ?? null);
      } finally {
        // Swallow a close() rejection: it must never mask the real
        // callTool error nor skip the temp-dir cleanup below.
        await harness.close().catch(() => {});
      }
    } finally {
      // Runs even when createHarness itself rejects (server spawn
      // failure, e.g. a missing build) — the per-iteration temp copy
      // of the captured sources must never leak.
      materialized.cleanup();
    }
  }

  // Every replay failed to produce a domain classification (error
  // envelopes carry `classification` at the ENVELOPE level, not in
  // `data`, so failed replays observe `null`): the replay environment
  // could not reproduce the session at all. That is "cannot judge" —
  // NOT evidence of timing nondeterminism — so it gets its own
  // outcome, mirroring ORCL-01's inconclusive-vs-diverges distinction,
  // instead of mislabeling a possibly perfectly deterministic replay
  // failure as "flaky".
  if (observedClassifications.every((c) => c === null)) {
    return { classification: "replay-inconclusive", observedClassifications };
  }

  const allAgree =
    observedClassifications.length > 0
    && observedClassifications.every((c) => c !== null && c === observedClassifications[0]);

  return { classification: allAgree ? "deterministic" : "flaky", observedClassifications };
}
