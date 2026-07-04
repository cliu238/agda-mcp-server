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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { PathSandboxError, resolveFileWithinRoot } from "../../src/repo-root.js";
import { loadJsonData } from "../../src/json-data.js";
import { extractPostulateSites, parseOptionsPragmas } from "../../src/agda/source-parsers.js";
import { buildImportGraph, computeImpact } from "../../src/agda/import-graph.js";
import { parseAgdaLibraryName } from "../../src/agda/library-registration.js";
import { parseAgdaVersion } from "../../src/agda/agda-version.js";
import { isMainModule } from "../test-with-sentinel.mjs";

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
 *
 * CR-01: `projectKey` is artifact/CLI-controlled — it comes from a
 * scanned repo's `.agda-lib` `name:` field (`resolveDefaultPolicyKey`)
 * or the `--policy` flag. `loadJsonData` resolves the path via
 * `new URL(relativePath, baseUrl)`, which honors `../` segments, so a
 * key like `../../../evil` (or `../oracle-policy/agda-unimath`) would
 * escape `scripts/data/oracle-policy/` and load an attacker-planted
 * policy that whitelists arbitrary axioms — turning a genuine cheat
 * into a `clean` verdict. Require a single bare filename segment:
 * allowlisted chars only, with at least one non-dot character so `.`,
 * `..`, and any all-dot key are rejected. Anything else degrades to
 * `null` (same honest `no-policy` route), never an out-of-directory
 * file read.
 */
export function loadOraclePolicy(projectKey) {
  if (
    typeof projectKey !== "string"
    || !/^[A-Za-z0-9._-]+$/u.test(projectKey)
    || !/[A-Za-z0-9_-]/u.test(projectKey)
  ) {
    return null;
  }
  try {
    return loadJsonData(`../data/oracle-policy/${projectKey}.json`, oraclePolicySchema, import.meta.url);
  } catch {
    return null;
  }
}

// ── Scan vocabulary ─────────────────────────────────────────────────

/**
 * Produce a scan-safe view of `source` for the postulate/pragma/hole
 * regex passes below. Removes `--` line comments and plain `{- ... -}`
 * block comments, masks `"..."` string and `'x'` character-literal
 * interiors, and — unlike a generic comment stripper — preserves
 * `{-# ... #-}` pragma bodies verbatim, since reading pragma content is
 * this scanner's entire job. Newlines are preserved in every branch so
 * the 1-based line numbers the callers report still line up with the
 * original source.
 *
 * WR-01: the previous version stripped only block comments, so a bare
 * `?` in a line comment or string literal (`-- is this right?`,
 * `msg = "really?"`) was mis-flagged as a residual hole, and a
 * commented-out `-- {-# TERMINATING #-}` / `-- {-# OPTIONS --with-K #-}`
 * produced a phantom pragma finding. This mirrors the comment/string
 * skipping src/agda/import-graph.ts (stripLineComment) and
 * src/session/goal-positions.ts (skipStringLiteral / skipCharLiteral)
 * already perform before their own scans.
 */
function stripCommentsAndStrings(source) {
  let out = "";
  let depth = 0; // {- ... -} / {-# ... #-} nesting depth
  let runBuffer = ""; // buffered block-comment/pragma run
  let runIsPragma = false;
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (depth > 0) {
      // Inside a block comment / pragma: only nesting `{-` / `-}` are
      // special; `--`, `"`, `'` are ordinary comment text here.
      if (ch === "{" && next === "-") {
        depth += 1;
        runBuffer += "{-";
        i += 2;
        continue;
      }
      if (ch === "-" && next === "}") {
        depth -= 1;
        runBuffer += "-}";
        i += 2;
        if (depth === 0) {
          out += runIsPragma ? runBuffer : runBuffer.replace(/[^\n]/gu, "");
          runBuffer = "";
          runIsPragma = false;
        }
        continue;
      }
      runBuffer += ch;
      i += 1;
      continue;
    }

    // depth === 0: ordinary source text.
    if (ch === "{" && next === "-") {
      depth = 1;
      runIsPragma = source[i + 2] === "#";
      runBuffer = "{-";
      i += 2;
      continue;
    }
    if (ch === "-" && next === "-") {
      // Line comment: drop through to end-of-line. The newline itself is
      // emitted on the next iteration so line numbers are preserved.
      i += 2;
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === '"') {
      // String literal: keep the delimiters, blank the interior (so a
      // `?` or pragma-like token inside a string never matches),
      // preserve newlines, and honor `\"` / `\\` escapes.
      out += '"';
      i += 1;
      while (i < n && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < n) {
          out += source[i + 1] === "\n" ? "\n" : " ";
          i += 2;
          continue;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < n) {
        out += '"';
        i += 1;
      }
      continue;
    }
    if (ch === "'") {
      // Character literal: `'x'` (3 chars) or `'\x'` (4 chars) — mask the
      // interior. A lone `'` (e.g. a primed identifier like `foo'`) is
      // NOT a char literal and is copied verbatim. Mirrors
      // goal-positions.ts's skipCharLiteral.
      if (source[i + 1] === "\\" && i + 3 < n && source[i + 3] === "'") {
        out += "'  '";
        i += 4;
        continue;
      }
      if (i + 2 < n && source[i + 1] !== "'" && source[i + 2] === "'") {
        out += "' '";
        i += 3;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  // Unterminated block comment / pragma at EOF: flush whatever was
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
  const cleaned = stripCommentsAndStrings(source);

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
 *
 * WR-01: the source is run through `stripCommentsAndStrings` first
 * (which keeps `{-# ... #-}` pragmas verbatim) so a commented-out
 * `-- {-# OPTIONS --with-K #-}` no longer surfaces a phantom flag.
 */
export function scanOptionsFlags(source) {
  return parseOptionsPragmas(stripCommentsAndStrings(source));
}

// ── Transitive closure walk ─────────────────────────────────────────

/**
 * Every file in `filePath`'s full transitive dependency closure
 * (direct + transitive dependencies) plus the file itself, as
 * project-root-relative paths that exist on disk. Mirrors
 * `agda_postulate_closure`'s exact composition
 * (src/tools/agent-ux/project-tools.ts) — buildImportGraph +
 * computeImpact do the real work (full BFS, already correct, not
 * rewritten here); this just assembles the dep set the same way.
 *
 * CR-02: `filePath` originates from a capture artifact's `data.file`
 * (untrusted — the oracle judges captures that may be adversarial or
 * malformed). The target is contained within `repoRoot` via
 * `resolveFileWithinRoot` before it ever seeds the dependency set, and
 * every retained dep is re-checked, so an absolute or `..`-escaping
 * target yields an empty closure (nothing safely scannable) rather than
 * seeding a path outside the root — mirroring how ORCL-01
 * (runColdLoadAndDiff) and ORCL-03 (judgeOrcl03) gate their own target.
 * This makes the T-02-02-02 guarantee real: never surfaces a path
 * outside `repoRoot`.
 */
export function walkClosureFiles(repoRoot, filePath, agdaVersion) {
  const graph = buildImportGraph(repoRoot, agdaVersion);

  let absPath;
  try {
    absPath = resolveFileWithinRoot(repoRoot, filePath);
  } catch (err) {
    if (err instanceof PathSandboxError) return [];
    throw err;
  }
  const relPath = relative(repoRoot, absPath);
  const impact = computeImpact(graph, repoRoot, absPath);

  const deps = new Set([relPath]);
  if (impact) {
    for (const dep of impact.directDependencies) deps.add(dep);
    for (const dep of impact.transitiveDependencies) deps.add(dep);
  }

  // Every retained dep must exist AND resolve within repoRoot. The seed
  // is contained above and graph-derived deps are root-relative by
  // construction, but re-checking each keeps a future graph change from
  // silently reintroducing an escape.
  return [...deps]
    .filter((dep) => {
      let depAbs;
      try {
        depAbs = resolveFileWithinRoot(repoRoot, dep);
      } catch (err) {
        if (err instanceof PathSandboxError) return false;
        throw err;
      }
      return existsSync(depAbs);
    })
    .sort();
}

/** Line number (1-based) of the first line containing `flag`, or 1 if not found. */
function findFlagLine(source, flag) {
  const lines = source.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(flag)) return i + 1;
  }
  return 1;
}

/**
 * Scan `filePath`'s full transitive closure for the pragma/FFI/hole
 * vocabulary plus a project-required-flag override. `policy` (or
 * `null`) gates the ONE concrete override shape this v1 scan detects:
 * a file declaring `--with-K` while the project policy requires
 * `--without-K` (RESEARCH.md's empirically-verified LibBase/
 * WithKOverride pair — Agda's own co-infective option checking does
 * NOT catch this direction). Detecting a silently-DROPPED required
 * flag, or a general negated-flag table, is AUTO-07 (v2) — out of
 * scope here per RESEARCH.md Open Question 3.
 *
 * Returns `{ file, line, kind, detail }[]` tagged with each finding's
 * source-relative `file` path.
 */
export function scanClosure(repoRoot, filePath, agdaVersion, policy) {
  // CR-02: contain the artifact-controlled target before walking or
  // reading anything, mirroring ORCL-01/ORCL-03. An escaping target
  // means nothing is safely scannable — return no findings rather than
  // reading a file outside repoRoot and leaking its lines into the
  // verdict. `walkClosureFiles` re-applies the same containment, so this
  // is defense-in-depth, not the sole guard.
  try {
    resolveFileWithinRoot(repoRoot, filePath);
  } catch (err) {
    if (err instanceof PathSandboxError) return [];
    throw err;
  }

  const files = walkClosureFiles(repoRoot, filePath, agdaVersion);
  const findings = [];

  for (const dep of files) {
    // Never resolve/read a dep outside repoRoot (walkClosureFiles
    // already filters these, but re-containing here keeps scanClosure
    // safe on its own terms).
    let abs;
    try {
      abs = resolveFileWithinRoot(repoRoot, dep);
    } catch (err) {
      if (err instanceof PathSandboxError) continue;
      throw err;
    }
    // Per-file try/catch so an unreadable dependency (permissions /
    // deleted between existsSync and read) doesn't abort the closure
    // scan, matching agda_postulate_closure's own resilience.
    let source;
    try {
      source = readFileSync(abs, "utf8");
    } catch {
      continue;
    }

    for (const finding of scanPragmaVocabulary(source)) {
      findings.push({ file: dep, ...finding });
    }

    if (policy && policy.requiredFlags.includes("--without-K")) {
      const flags = scanOptionsFlags(source);
      if (flags.includes("--with-K")) {
        findings.push({
          file: dep,
          line: findFlagLine(source, "--with-K"),
          kind: "with-k-override",
          detail: "--with-K overrides this project's required --without-K",
        });
      }
    }
  }

  return findings;
}

// ── Whitelist diff (D-08 gate) ──────────────────────────────────────

/**
 * Mark each finding `sanctioned: true | false` against `policy` (or
 * unconditionally `false` when `policy` is `null` — D-03: the caller
 * still routes to `no-policy`, never a silent pass, regardless of this
 * field). Only two finding kinds are EVER eligible for `sanctioned:
 * true`:
 *   - `postulate`: sanctioned iff its declaration name (case-
 *     sensitive, carried in `detail`) is in `policy.sanctionedAxioms`.
 *   - `residual-hole`: sanctioned iff `warmClassification` is exactly
 *     `"ok-with-holes"` — the legitimate in-progress scaffold-hole
 *     workflow (D-08). Any other classification, including
 *     `"ok-complete"` (claimed-complete) or `null`/absent, does NOT
 *     excuse a residual hole — a hole in a capture claiming
 *     completeness is a genuine cheat signal.
 * Every OTHER kind (terminating / no-positivity-check /
 * no-universe-check / prim-trust-me / ffi-compile / with-k-override)
 * is ALWAYS `sanctioned: false` — these are never legitimate whitelist
 * entries and are never excused by an in-progress classification.
 */
export function diffAgainstWhitelist(findings, policy, warmClassification) {
  return findings.map((finding) => {
    if (policy === null) {
      return { ...finding, sanctioned: false };
    }
    if (finding.kind === "postulate") {
      return { ...finding, sanctioned: policy.sanctionedAxioms.includes(finding.detail) };
    }
    if (finding.kind === "residual-hole") {
      return { ...finding, sanctioned: warmClassification === "ok-with-holes" };
    }
    return { ...finding, sanctioned: false };
  });
}

// ── Policy-key resolution ───────────────────────────────────────────

/**
 * Default policyKey: the `name:` field of the FIRST readable
 * `.agda-lib` file directly under `repoRoot`, or `null` if none is
 * found. This is a best-effort filesystem probe, not the replayed
 * library registration (T-02-02-02's mitigation is about file reads,
 * not about reproducing ORCL-01's non-deterministic live registration
 * — see 02-CONTEXT.md's canonical-refs note on library-registration.ts).
 */
function resolveDefaultPolicyKey(repoRoot) {
  if (!repoRoot || !existsSync(repoRoot)) return null;
  let entries;
  try {
    entries = readdirSync(repoRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".agda-lib")) continue;
    try {
      const contents = readFileSync(resolve(repoRoot, entry.name), "utf8");
      const name = parseAgdaLibraryName(contents);
      if (name) return name;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Thrown by `resolvePolicyStrict` whenever an EXPECTED ORCL-02 policy
 * key — an explicit `--policy` value, a corpus-derived key from
 * `fuel-corpora.json`, or a `.agda-lib`-derived key whose file exists
 * but fails to load — cannot be resolved to a real, case-exact,
 * loadable policy file (POLICY-01 / D-03: "loud, never silent").
 * Never thrown for the genuinely-no-policy-anywhere case (a derived
 * key with no on-disk file and no case variant), which still returns
 * `null` and keeps v1.0's `no-policy` outcome downstream.
 */
export class PolicyResolutionError extends Error {
  constructor(message, policyKey) {
    super(message);
    this.name = "PolicyResolutionError";
    this.policyKey = policyKey;
  }
}

/**
 * The directory `loadOraclePolicy`/`loadJsonData` resolve `${key}.json`
 * against — derived from `import.meta.url` via the SAME relative
 * `../data/oracle-policy/` segment, so `resolvePolicyStrict`'s
 * directory-listing check and the actual load can never point at two
 * different directories.
 */
const ORACLE_POLICY_DIR = fileURLToPath(new URL("../data/oracle-policy/", import.meta.url));

/**
 * D-02 (case-exact, never case-normalize) + D-03 (loud-fail on an
 * expected-but-unresolvable key) policy resolution, used by
 * `judgeOrcl02` in place of a bare `loadOraclePolicy(policyKey)` call.
 *
 * `derived` distinguishes a `.agda-lib`-name-derived key (v1.0's
 * default, which may legitimately mean "this repo has no policy at
 * all") from an EXPECTED key — an explicit `--policy` flag or a
 * corpus-derived key — that must hard-fail rather than silently
 * degrade to the `no-policy` route.
 *
 * Never case-normalizes: `readFileSync`/`loadJsonData` resolve a path
 * case-insensitively on macOS's default APFS but case-sensitively on
 * Linux ext4, so relying on them to detect a mismatch would make the
 * real CHG shape (`.agda-lib` name `Codex-Homotopy-Group` vs on-disk
 * `codex-homotopy-group.json`) silently RESOLVE on macOS while quietly
 * degrading to `no-policy` on Linux — exactly the defect this function
 * exists to close. Instead this lists the policy directory with
 * `readdirSync` and does an EXACT string compare against `entry.name`
 * (the same idiom `resolveDefaultPolicyKey` above already uses for
 * `.agda-lib` files), so every platform behaves identically. The
 * lowercase compare below is used ONLY to detect a mismatched variant
 * for the error message — the lowercased key is never passed to
 * `loadOraclePolicy`.
 *
 * @param {string} policyKey
 * @param {{ derived: boolean }} context
 * @returns {object | null} the loaded policy, or `null` for the
 *   genuinely-no-policy derived case.
 * @throws {PolicyResolutionError} whenever an EXPECTED key cannot be
 *   resolved to a real, case-exact, loadable policy file.
 */
function resolvePolicyStrict(policyKey, { derived }) {
  // CR-01 allowlist gate FIRST — identical shape check to
  // loadOraclePolicy's own, so a malformed/traversal-shaped key never
  // reaches the directory listing below. Derived: unchanged v1.0 route
  // (null -> no-policy). Explicit: this key was requested by name, so
  // an invalid shape is itself a loud failure, not a silent skip.
  const shapeOk =
    typeof policyKey === "string"
    && /^[A-Za-z0-9._-]+$/u.test(policyKey)
    && /[A-Za-z0-9_-]/u.test(policyKey);
  if (!shapeOk) {
    if (derived) return null;
    throw new PolicyResolutionError(
      `Cannot resolve ORCL-02 policy key "${policyKey}": not a valid bare filename segment `
        + "(expected [A-Za-z0-9._-]+ with at least one non-dot character) — refusing to search "
        + "scripts/data/oracle-policy/ for it.",
      policyKey,
    );
  }

  let entries;
  try {
    entries = readdirSync(ORACLE_POLICY_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const wantedFilename = `${policyKey}.json`;
  const exactMatch = entries.some((entry) => entry.isFile() && entry.name === wantedFilename);
  if (exactMatch) {
    const policy = loadOraclePolicy(policyKey);
    if (policy !== null) return policy;
    // The file exists (just listed above) but failed to load —
    // malformed JSON or a zod-schema mismatch. The key was expected
    // either way (its file is physically present), so this is never
    // the genuinely-no-policy case: hard-fail for BOTH derived and
    // explicit keys (D-03).
    throw new PolicyResolutionError(
      `ORCL-02 policy file "${wantedFilename}" exists in scripts/data/oracle-policy/ but failed to `
        + `load (malformed JSON or a schema mismatch) — refusing to silently treat "${policyKey}" `
        + "as having no policy.",
      policyKey,
    );
  }

  // Case-insensitive variant detection ONLY (never resolution/loading):
  // a differently-cased on-disk file means this is a MISMATCH, not an
  // ABSENCE — the D-02 case this function exists to catch.
  const caseVariant = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase() === wantedFilename.toLowerCase(),
  );
  if (caseVariant) {
    throw new PolicyResolutionError(
      `ORCL-02 policy key "${policyKey}" does not exactly match the on-disk policy file — found `
        + `"${caseVariant.name}" in scripts/data/oracle-policy/ (case mismatch). Policy keys are `
        + "resolved case-exactly on every platform; update the key or the on-disk file name so "
        + "they match exactly.",
      policyKey,
    );
  }

  // No match at all, exact or case-variant.
  if (derived) return null; // Genuinely no policy anywhere — keeps v1.0's no-policy outcome.
  throw new PolicyResolutionError(
    `Cannot resolve ORCL-02 policy key "${policyKey}": no "${wantedFilename}" found in `
      + "scripts/data/oracle-policy/.",
    policyKey,
  );
}

/** Parse a manifest-recorded Agda version string, defaulting to `undefined` (never throws). */
function safeParseAgdaVersion(raw) {
  if (typeof raw !== "string") return undefined;
  try {
    return parseAgdaVersion(raw);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the last load-family (`agda_load`/`agda_typecheck`-family)
 * recorded action, extracting BOTH the scan target file and the warm
 * completeness classification (D-08's cross-predicate signal) from the
 * SAME scan, mirroring the approach Plan 02-03 also uses.
 */
function findLastLoadFamilyAction(recordedActions) {
  for (let i = recordedActions.length - 1; i >= 0; i--) {
    const action = recordedActions[i];
    if (typeof action?.tool === "string" && /^agda_(load|typecheck)/.test(action.tool)) {
      return {
        targetFile: action.normalizedResponse?.data?.file ?? null,
        warmClassification: action.normalizedResponse?.data?.classification ?? null,
      };
    }
  }
  return { targetFile: null, warmClassification: null };
}

// ── judgeOrcl02: the standalone-runnable ORCL-02 predicate ─────────

/**
 * Judge a staged CaptureArtifact against ORCL-02. Reads the artifact,
 * resolves the last load-family recorded action's target file + warm
 * classification, walks the target's full transitive closure for the
 * pragma/FFI/hole vocabulary (+ the --with-K-override check), diffs
 * against a per-project sanctioned-axiom whitelist, and composes the
 * final outcome:
 *   - `no-target`: no load-family recorded action to determine a scan
 *     target. Nothing to scan is not evidence of a cheat — the CLI
 *     treats this the same as `clean` for exit-code purposes, but the
 *     JSON output preserves the distinction.
 *   - `no-policy`: no policy resolved AND at least one finding exists
 *     (D-03) — carries ALL findings for human review, never a silent
 *     pass and never a blanket fail.
 *   - `clean`: every finding (if any) is sanctioned, or there are no
 *     findings at all.
 *   - `cheat-flagged`: at least one unsanctioned finding exists AND a
 *     policy was found.
 */
export async function judgeOrcl02(artifactPath, options = {}) {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const repoRoot = artifact?.manifest?.repoRoot;
  const agdaVersion = safeParseAgdaVersion(artifact?.manifest?.agdaVersion);
  const recordedActions = Array.isArray(artifact?.recordedActions) ? artifact.recordedActions : [];

  const { targetFile, warmClassification } = findLastLoadFamilyAction(recordedActions);
  if (!targetFile) {
    return { kind: "no-target", reason: "no load-family recorded action to determine a scan target" };
  }

  const derived = options.policyKey === undefined;
  const policyKey = derived ? resolveDefaultPolicyKey(repoRoot) : options.policyKey;
  // PolicyResolutionError propagates uncaught — an expected-but-
  // unresolvable key (explicit, or derived-but-file-exists-and-fails-
  // to-load) is a loud hard failure (D-03), never silently swallowed
  // into a no-policy outcome here.
  const policy = policyKey === null ? null : resolvePolicyStrict(policyKey, { derived });

  const rawFindings = scanClosure(repoRoot, targetFile, agdaVersion, policy);
  const findings = diffAgainstWhitelist(rawFindings, policy, warmClassification);

  if (policy === null && findings.length > 0) {
    return { kind: "no-policy", findings };
  }
  if (findings.every((finding) => finding.sanctioned)) {
    return { kind: "clean", findings };
  }
  return { kind: "cheat-flagged", findings };
}

// ── CLI ──────────────────────────────────────────────────────────────

const EXIT_CODE_BY_KIND = {
  clean: 0,
  "no-target": 0,
  "cheat-flagged": 1,
  "no-policy": 2,
};

export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: node scripts/oracle/orcl-02-soundness-scan.mjs <path-to-artifact.json> [--policy <key>]\n",
    );
    process.exitCode = 1;
    return;
  }

  const policyFlagIndex = argv.indexOf("--policy");
  const policyKey = policyFlagIndex !== -1 ? argv[policyFlagIndex + 1] : undefined;

  try {
    const outcome = await judgeOrcl02(artifactPath, policyKey !== undefined ? { policyKey } : {});
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    process.exitCode = EXIT_CODE_BY_KIND[outcome.kind] ?? 0;
  } catch (err) {
    process.stderr.write(
      `orcl-02-soundness-scan failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
