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

  const policyKey = options.policyKey !== undefined ? options.policyKey : resolveDefaultPolicyKey(repoRoot);
  const policy = policyKey === null ? null : loadOraclePolicy(policyKey);

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
