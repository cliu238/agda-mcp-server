// MIT License — see LICENSE
//
// ORCL-02: soundness-hygiene scan (Phase 2 oracle triad, cheap half).
//
// Static token/pragma scan over a captured artifact's target file and
// its full transitive dependency closure, diffed against a per-project
// sanctioned-axiom whitelist. Catches soundness cheats a fresh `agda`
// re-run (ORCL-01) structurally cannot see: introduced postulates,
// unsafe pragmas (TERMINATING / NO_POSITIVITY_CHECK / NO_UNIVERSE_CHECK),
// primTrustMe, FFI escape hatches ({-# COMPILE #-}/{-# FOREIGN #-}), a
// file-level --with-K override of a --without-K project, and residual
// (unsolved) holes.
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 (see
// .planning/phases/02-.../02-CONTEXT.md) — no new MCP verb, no new
// src/ tool surface. Server logic (source-parsers, import-graph,
// json-data, library-registration) is imported directly (tsx-resolved
// `.js` specifiers against the underlying `.ts` sources) rather than
// duplicated, per this project's SSOT convention.

import { z } from "zod";

import { loadJsonData } from "../../src/json-data.js";
import { extractPostulateSites, parseOptionsPragmas } from "../../src/agda/source-parsers.js";

// ── Policy loading ──────────────────────────────────────────────────

const oraclePolicySchema = z.object({
  $comment: z.string().optional(),
  sanctionedAxioms: z.array(z.string()),
  requiredFlags: z.array(z.string()),
  forbiddenFlags: z.array(z.string()),
});

/**
 * Load the interim (pre-PROC-02) sanctioned-axiom whitelist + required-
 * flag baseline for `projectKey` from `scripts/data/oracle-policy/`.
 * Never throws: a missing file, malformed JSON, or a shape that fails
 * the zod schema all degrade to `null` — the caller (judgeOrcl02) reads
 * `null` as "no policy resolved" and routes to the honest `no-policy`
 * outcome (D-03), never a silent pass or a blanket fail.
 */
export function loadOraclePolicy(projectKey) {
  try {
    return loadJsonData(`../data/oracle-policy/${projectKey}.json`, oraclePolicySchema, import.meta.url);
  } catch {
    return null;
  }
}

// ── Scan vocabulary ─────────────────────────────────────────────────

/**
 * Strip Agda's nesting `{- ... -}` block comments while preserving
 * `{-# ... #-}` pragma bodies verbatim. Mirrors the character-by-
 * character depth-counter technique in src/agda/import-graph.ts's
 * stripBlockComments (a third, oracle-local copy per D-05), but —
 * unlike that helper, which never needs pragma content because it
 * only hunts for `module`/`import` lines — this scanner's entire job
 * is to read pragma content, so a `{-#`-prefixed run is recognised as
 * a pragma and kept in the output rather than discarded. Newlines
 * inside a genuinely-discarded plain comment are preserved so
 * downstream line numbers still match the original source.
 */
function stripPlainBlockComments(source) {
  let depth = 0;
  let out = "";
  let runBuffer = "";
  let runIsPragma = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (depth === 0 && ch === "{" && next === "-") {
      depth = 1;
      runIsPragma = source[i + 2] === "#";
      runBuffer = "{-";
      i += 1;
      continue;
    }
    if (depth > 0 && ch === "{" && next === "-") {
      depth += 1;
      runBuffer += "{-";
      i += 1;
      continue;
    }
    if (depth > 0 && ch === "-" && next === "}") {
      depth -= 1;
      runBuffer += "-}";
      i += 1;
      if (depth === 0) {
        out += runIsPragma ? runBuffer : runBuffer.replace(/[^\n]/gu, "");
        runBuffer = "";
        runIsPragma = false;
      }
      continue;
    }
    if (depth === 0) {
      out += ch;
      continue;
    }
    runBuffer += ch;
  }
  // Unterminated block comment/pragma at EOF: flush whatever was
  // buffered so content never silently vanishes.
  if (runBuffer.length > 0) {
    out += runIsPragma ? runBuffer : runBuffer.replace(/[^\n]/gu, "");
  }
  return out;
}

const TERMINATING_RE = /\{-#\s*(NON_)?TERMINATING\s*#-\}/u;
const NO_POSITIVITY_RE = /\{-#\s*NO_POSITIVITY_CHECK\s*#-\}/u;
const NO_UNIVERSE_RE = /\{-#\s*NO_UNIVERSE_CHECK\s*#-\}/u;
const FFI_RE = /\{-#\s*(COMPILE|FOREIGN)\b/u;
// primTrustMe is the soundness cheat; primEraseEquality is
// --safe-compatible and sound-by-construction — must NEVER be flagged
// (ORACLE-VALIDITY.md correction #2 / this phase's RESEARCH.md Pitfall
// 6). The word-boundary anchors make sure `primEraseEquality` never
// matches this pattern.
const PRIM_TRUST_ME_RE = /\bprimTrustMe\b/u;
// Reuses the same style as src/tools/agent-ux/project-tools.ts's
// existing bare-hole regex: a `?` not immediately followed by `-` or
// `}` (so it doesn't fire on `?-}`/`?}`-shaped constructs).
const BARE_HOLE_RE = /\?(?!-|\})/u;
const EXTENDED_HOLE_RE = /\{!/u;

/**
 * Scan `source` for the widened pragma/FFI/hole cheat vocabulary:
 * postulate, TERMINATING/NON_TERMINATING, NO_POSITIVITY_CHECK,
 * NO_UNIVERSE_CHECK, primTrustMe, {-# COMPILE #-}/{-# FOREIGN #-} FFI
 * pragmas, and residual holes (bare `?` or `{! ... !}`). Returns
 * `Array<{ kind, line, detail }>` with 1-based line numbers. Pure
 * text scan — no Agda subprocess, no AST.
 */
export function scanPragmaVocabulary(source) {
  const findings = [];
  const cleaned = stripPlainBlockComments(source);

  for (const site of extractPostulateSites(cleaned)) {
    const names = site.declarations.length > 0 ? site.declarations : ["(anonymous)"];
    for (const name of names) {
      findings.push({ kind: "postulate", line: site.line, detail: name });
    }
  }

  const lines = cleaned.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    if (TERMINATING_RE.test(line)) {
      findings.push({ kind: "terminating", line: lineNo, detail: line.trim() });
    }
    if (NO_POSITIVITY_RE.test(line)) {
      findings.push({ kind: "no-positivity-check", line: lineNo, detail: line.trim() });
    }
    if (NO_UNIVERSE_RE.test(line)) {
      findings.push({ kind: "no-universe-check", line: lineNo, detail: line.trim() });
    }
    if (FFI_RE.test(line)) {
      findings.push({ kind: "ffi-compile", line: lineNo, detail: line.trim() });
    }
    if (PRIM_TRUST_ME_RE.test(line)) {
      findings.push({ kind: "prim-trust-me", line: lineNo, detail: line.trim() });
    }
    if (EXTENDED_HOLE_RE.test(line)) {
      findings.push({ kind: "residual-hole", line: lineNo, detail: "{! ... !}" });
    } else if (BARE_HOLE_RE.test(line)) {
      findings.push({ kind: "residual-hole", line: lineNo, detail: "?" });
    }
  }

  return findings;
}

/**
 * Raw list of every flag token in the file's OWN `{-# OPTIONS ... #-}`
 * pragmas. Never derives an absence (a silently-dropped required flag
 * is out of scope for v1 — AUTO-07 / RESEARCH.md Open Question 3);
 * only ever surfaces flags actually present in the file.
 */
export function scanOptionsFlags(source) {
  return parseOptionsPragmas(source);
}
