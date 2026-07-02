// MIT License — see LICENSE
//
// QUEUE-03's capture-time wiring: derive a TriageResult (and the
// fingerprint identity fields) from the last load-family action in a
// capture's recorded action log. This is the ONLY place the scan/
// classification logic lives — register-capture-session.ts stays a
// thin adapter that just calls deriveTriageFromActions() (CLAUDE.md
// names "fat tool handlers with embedded domain logic" as an
// anti-pattern), matching how buildReplayManifest/buildOracleSubstrate
// already keep the tool handler thin.
//
// Reuses classifyAgdaError() verbatim via the src/agda/agent-ux.ts
// barrel — this module does not reimplement any classification logic
// (D-09/D-10 — QUEUE-03's phase-4 work is wiring, not building).

import { classifyAgdaError, type TriageResult } from "../agent-ux.js";
import type { RecordedAction } from "./artifact-types.js";

/** The load-family verbs whose recorded error, if any, feeds triage. */
const LOAD_FAMILY_TOOLS = new Set([
  "agda_load",
  "agda_load_no_metas",
  "agda_typecheck",
]);

/**
 * Pull the first raw error string out of a load-family action's
 * normalized response, defensively. Any unexpected shape (missing
 * `data`, non-object `data`, non-array `errors`, empty array, or a
 * non-string/empty first element) yields `undefined` rather than
 * throwing — the caller's try/catch is the outer safety net, but this
 * helper stays defensive on its own so its behavior is easy to unit
 * test in isolation.
 */
function extractLoadErrorText(action: RecordedAction): string | undefined {
  const data = action.normalizedResponse?.data;
  if (data === null || typeof data !== "object") return undefined;
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  const first = errors[0];
  return typeof first === "string" && first.length > 0 ? first : undefined;
}

/**
 * Scan a capture's recorded actions for the most recent load-family
 * action (`agda_load` / `agda_load_no_metas` / `agda_typecheck`) and,
 * when it carried a real Agda error, classify it via
 * `classifyAgdaError()` — the SAME classifier `agda_triage_error`
 * uses — and surface richer fingerprint identity fields so a future
 * live re-capture of an already hand-seeded defect (Plan 04-03) has a
 * real chance of bumping recurrence instead of appearing as a
 * brand-new entry (RESEARCH.md Pitfall 3).
 *
 * Falls back to `{ triage: null, fingerprintAffectedTool:
 * fallback.affectedTool, fingerprintObserved: fallback.observed }`
 * (byte-identical to today's hardcoded fingerprint shape) when no
 * load-family action was ever recorded, the one found carries no
 * error text, or the action log has any unexpected shape — this scan
 * must never fail a capture.
 */
export function deriveTriageFromActions(
  actions: RecordedAction[],
  fallback: { affectedTool: string; observed: string },
): {
  triage: TriageResult | null;
  fingerprintAffectedTool: string;
  fingerprintObserved: string;
} {
  const fallbackResult = {
    triage: null,
    fingerprintAffectedTool: fallback.affectedTool,
    fingerprintObserved: fallback.observed,
  };

  try {
    let lastLoadAction: RecordedAction | undefined;
    for (let i = actions.length - 1; i >= 0; i--) {
      if (LOAD_FAMILY_TOOLS.has(actions[i].tool)) {
        lastLoadAction = actions[i];
        break;
      }
    }
    if (!lastLoadAction) return fallbackResult;

    const errorText = extractLoadErrorText(lastLoadAction);
    if (errorText === undefined) return fallbackResult;

    return {
      triage: classifyAgdaError(errorText),
      fingerprintAffectedTool: lastLoadAction.tool,
      fingerprintObserved: errorText,
    };
  } catch {
    return fallbackResult;
  }
}
