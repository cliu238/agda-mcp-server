// MIT License — see LICENSE
//
// D-02 verdict schema: the shared contract Phase 3 (regression-emitter
// refusal logic) and Phase 4 (fix-queue prioritization) both consume.
// Composes the three independently-shippable oracle predicates
// (ORCL-01 differential, ORCL-02 soundness-hygiene scan, ORCL-03
// conformance proxy — Plans 02-03/02-02/02-04) into ONE persisted
// verdict: `trueGreen` is asserted ONLY when ORCL-01 = pass AND
// ORCL-02 = clean; ORCL-03 is recorded verbatim alongside but is
// ALWAYS advisory (D-02/D-06) — it can never flip `trueGreen`.
// `consistencyProbe` reserves the hook for the mechanized negation/⊥
// probe (AUTO-08, v2) — v1 always emits `{ attempted: false }` (D-06).
//
// Built directly from 02-CONTEXT.md's D-02 decision text — no existing
// codebase analog composes 3 independent sub-verdicts into one gate.
// No runtime zod schema here: this is an internal composition function
// over already-judged predicate outputs, not an external
// input-validation boundary.
//
// Outcome-kind unions (documentation only):
//   Orcl01Outcome.kind ∈ "pass" | "server-false-green-candidate" |
//     "inconclusive" | "skip"
//   Orcl02Outcome.kind ∈ "clean" | "cheat-flagged" | "no-policy"
//     (scripts/oracle/orcl-02-soundness-scan.mjs's own module also
//     returns a 4th "no-target" kind — advisory, never
//     sanctioned/unsanctioned; composeVerdict never special-cases it,
//     since `trueGreen` only ever checks for the literal "clean"
//     string and "no-target" is honestly reported as NOT clean.)
//   Orcl03Outcome.kind ∈ "consistent" | "conformance-flagged" |
//     "vacuous-no-expected-signature"
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface.

/**
 * Compose the three predicate outcomes into ONE persisted verdict. The
 * returned `trueGreen` boolean expression is the ONLY place
 * composition logic lives (this project's design-charter guardrail:
 * never compress away the ok/classification/false-green signal) —
 * every per-predicate outcome is persisted verbatim alongside it,
 * never collapsed away.
 *
 * @param {{
 *   orcl01: { kind: string, [key: string]: unknown },
 *   orcl02: { kind: string, [key: string]: unknown },
 *   orcl03: { kind: string, [key: string]: unknown },
 *   capturePath: string,
 *   fingerprint: string,
 *   recurrence: number,
 * }} input
 */
export function composeVerdict({ orcl01, orcl02, orcl03, capturePath, fingerprint, recurrence }) {
  return {
    schemaVersion: 1,
    capturePath,
    fingerprint,
    recurrence,
    computedAt: new Date().toISOString(),
    orcl01,
    orcl02,
    orcl03,
    // D-06: the consistency/negation probe is hook-only in v1 —
    // nothing is mechanized. Mechanization is AUTO-08 (v2).
    consistencyProbe: { attempted: false },
    // D-02: "true-green" is asserted ONLY when ORCL-01 = pass AND
    // ORCL-02 = clean. ORCL-03 is recorded above verbatim but NEVER
    // read here — it is advisory in every state (D-02/D-06) and can
    // never gate this boolean.
    trueGreen: orcl01.kind === "pass" && orcl02.kind === "clean",
  };
}

/**
 * The exact plain-object shape `scripts/oracle/run-oracle.mjs`
 * JSON-stringifies and appends as one line to the cumulative
 * `oracle-metrics.jsonl` file (D-04): lets the abstention/INCONCLUSIVE
 * rate be computed later by counting lines where `orcl01Kind ===
 * "inconclusive"`, without re-parsing the (much larger) verdict
 * sidecars themselves.
 *
 * @param {ReturnType<typeof composeVerdict>} verdict
 */
export function abstentionMetricLine(verdict) {
  return {
    timestamp: verdict.computedAt,
    fingerprint: verdict.fingerprint,
    orcl01Kind: verdict.orcl01.kind,
    probe: verdict.orcl01.kind === "inconclusive" ? verdict.orcl01.probe : null,
  };
}
