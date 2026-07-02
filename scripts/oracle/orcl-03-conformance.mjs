// MIT License — see LICENSE
//
// ORCL-03: conformance proxy (Phase 2 oracle triad, advisory only).
//
// Alpha-diffs the proven `Cmd_infer_toplevel` signature against the
// capture's task-authored `oracleSubstrate.expectedSignature` (CAP-05),
// flagging narrowing / added-premises / renames / target edits for
// human review. NEVER a hard gate — every outcome this predicate can
// emit is advisory; the D-02 verdict schema's "true-green" composition
// only ever reads ORCL-01 (differential) + ORCL-02 (soundness scan) —
// see 02-CONTEXT.md's D-02/D-06/D-07.
//
// This first task lands the pure signature-comparison primitives
// (`parseExpectedSignature` / `normalizeSignatureText` /
// `compareSignatures`) with zero external dependencies. The cold
// `Cmd_load` + `Cmd_infer_toplevel` machinery (`runColdInferAndCompare`,
// `judgeOrcl03`, the CLI entry point) lands in this plan's second task.
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 (see
// .planning/phases/02-.../02-CONTEXT.md) — no new MCP verb, no new
// src/ tool surface.

// ── parseExpectedSignature / normalizeSignatureText / compareSignatures ──

/**
 * Split a task-authored `expectedSignature` string (CAP-05) into its
 * target name and expected type, on the FIRST top-level `:` — a colon
 * NOT nested inside `(`/`{`/`[`. The artifact contract itself does not
 * specify a parsing convention for this field (02-04-PLAN.md's own
 * "Design decision this plan adopts" note); walking a depth counter
 * rather than a naive `indexOf(":")` is what correctly handles a
 * signature like `"(f : A -> B) : C"`, where the FIRST colon anywhere
 * in the string is nested inside parens and must NOT be the split
 * point. When no top-level colon is found at all, the entire trimmed
 * string is returned as BOTH the name and the (degenerate) expected
 * type, so a bare name (e.g. a capture that only ever names a target
 * without stating its type) still resolves a `Cmd_infer_toplevel`
 * target.
 */
export function parseExpectedSignature(expectedSignature) {
  const trimmedWhole = expectedSignature.trim();
  let depth = 0;
  let splitIndex = -1;
  for (let i = 0; i < expectedSignature.length; i++) {
    const ch = expectedSignature[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
    } else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
    } else if (ch === ":" && depth === 0) {
      splitIndex = i;
      break;
    }
  }
  if (splitIndex === -1) {
    return { name: trimmedWhole, expectedType: trimmedWhole };
  }
  return {
    name: expectedSignature.slice(0, splitIndex).trim(),
    expectedType: expectedSignature.slice(splitIndex + 1).trim(),
  };
}

/**
 * Collapse whitespace runs to a single space (trimmed) — the
 * "simplest viable" comparison RESEARCH.md's Open Question 1
 * recommends starting with, rather than a full token-canonicalization
 * pass (deferred; see the comment on `compareSignatures` below).
 *
 * ALSO normalizes Agda's ASCII "->" arrow spelling to the Unicode "→"
 * spelling Agda's own printer always emits. This is NOT a step towards
 * the deferred alpha-equivalence/token-canonicalization pass
 * (RESEARCH.md Assumption A2) — it is a single, fixed, lexer-level
 * token alias, confirmed empirically against a real local Agda 2.8.0
 * binary during this plan's implementation: `Cmd_infer_toplevel
 * Normalised` on a target declared with EITHER "->" or "→" in its
 * source always prints "→" back (verified both directions, and under
 * both `Normalised` and `AsIs` rewrite modes). Without this
 * normalization, an expectedSignature typed with the ASCII spelling
 * (very plausible — it is the easier spelling to type into a quick
 * capture-time field) would spuriously conformance-flag against
 * literally every proven signature Agda's printer ever emits, making
 * ORCL-03 noisy-by-construction rather than a useful advisory signal.
 * `src/agda/clause-fixity.ts` already treats "->"/"→" as the same
 * token elsewhere in this codebase (`/->|→/gu`), so this is a
 * consistent, already-established equivalence, not a new invention.
 */
export function normalizeSignatureText(text) {
  return text.replace(/->/gu, "→").replace(/\s+/gu, " ").trim();
}

/**
 * Whitespace/arrow-notation-normalized equality between a proven type
 * (from a real cold `Cmd_infer_toplevel`) and an expected type (from
 * CAP-05's `expectedSignature`). Returns the ORIGINAL (un-normalized)
 * strings in the `conformance-flagged` payload, so a human reviewer
 * sees exactly what was captured/proven, not a normalized rewrite.
 *
 * RESEARCH.md Pitfall 8: there is no known Agda flag to disable
 * `DISPLAY`-pragma / pattern-synonym pretty-printing, so two
 * semantically different types can print identically, or vice versa —
 * a documented, accepted residual gap. This is exactly why D-02/D-06
 * keep ORCL-03 permanently advisory. Do NOT attempt to "fix" this with
 * a cleverer string algorithm here — RESEARCH.md's Open Question 1
 * explicitly recommends starting with the simplest viable comparison
 * and treating deeper canonicalization as a future empirical follow-up
 * once real captured-signature data is available, not something to
 * over-engineer from zero data.
 */
export function compareSignatures(provenType, expectedType) {
  if (normalizeSignatureText(provenType) === normalizeSignatureText(expectedType)) {
    return { kind: "consistent" };
  }
  return {
    kind: "conformance-flagged",
    provenSignature: provenType,
    expectedSignature: expectedType,
  };
}
