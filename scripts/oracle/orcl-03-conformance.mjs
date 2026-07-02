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
// `Cmd_infer_toplevel` requires a file already loaded in the calling
// session's scope (RESEARCH.md Pitfall 7, verified via direct code read
// of expression-operations.ts's `ctx.requireFile()` call) — so this
// predicate's `judgeOrcl03` performs its OWN cold `Cmd_load` (reusing
// Plan 02-03's `materializeCaptureEnvironment`) before issuing
// `Cmd_infer_toplevel` on the SAME session. `runColdInferAndCompare`,
// the lower-level half, accepts an ALREADY-LOADED session so Plan
// 02-05's composed CLI can share ONE cold process between ORCL-01 and
// ORCL-03 instead of paying for a second full cold compile on large
// corpora (a from-scratch recompile can itself approach a practical
// timeout — see 02-RESEARCH.md / STATE.md blockers).
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 (see
// .planning/phases/02-.../02-CONTEXT.md) — no new MCP verb, no new
// src/ tool surface. Server logic (command-builder IOTCM assembly, the
// expression-display response decoder) is imported directly rather
// than duplicated, per this project's SSOT convention.
//
// Run with: npx tsx scripts/oracle/orcl-03-conformance.mjs <path>
// (NOT plain `node` — this script's src/ imports use .js-suffixed
// specifiers pointing at sibling .ts files; see orcl-01-differential.mjs's
// header for the full explanation of why plain node fails here.)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";
import { materializeCaptureEnvironment } from "./orcl-01-differential.mjs";
import { spawnColdAgdaSession } from "./cold-agda-session.mjs";

import { PathSandboxError, resolveFileWithinRoot } from "../../src/repo-root.js";
import {
  command,
  iotcmEnvelope,
  modeTopLevelCommand,
  quoted,
  stringList,
  topLevelCommand,
} from "../../src/protocol/command-builder.js";
import { decodeExpressionDisplayResponses } from "../../src/protocol/responses/expression-display.js";
import { normalizeAgdaResponse } from "../../src/agda/normalize-response.js";

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

// ── Local, oracle-scoped small helpers ───────────────────────────────
//
// Deliberately duplicated (rather than importing differently-shaped or
// non-exported helpers from orcl-01-differential.mjs / cold-agda-
// session.mjs) per this plan's own action text and files_modified
// scope — neither of those two modules is touched by this plan.

const LOAD_FAMILY_TOOL_PATTERN = /^agda_(load|typecheck)/;

/**
 * Scan `artifact.recordedActions` for the LAST entry whose `tool`
 * matches the load-family pattern (the SAME regex
 * orcl-01-differential.mjs's `findWarmLoadTuple` uses) and return its
 * `normalizedResponse.data.file` (the repo-root-relative path that was
 * loaded), or `null` if none found. Deliberately duplicated here rather
 * than importing `findWarmLoadTuple` — that function's return shape (a
 * full classification tuple + category set) is ORCL-01-specific;
 * ORCL-03 only ever needs the loaded file path.
 */
function findLoadedRelativePath(artifact) {
  const actions = Array.isArray(artifact?.recordedActions) ? artifact.recordedActions : [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (typeof action?.tool !== "string" || !LOAD_FAMILY_TOOL_PATTERN.test(action.tool)) {
      continue;
    }
    const file = action?.normalizedResponse?.data?.file;
    if (typeof file === "string") {
      return file;
    }
  }
  return null;
}

/**
 * Separates "-l NAME" library-registration pairs out of a flat,
 * order-preserving `mergedArgv` array — the SAME split
 * orcl-01-differential.mjs's own (non-exported) `splitMergedArgv`
 * performs, duplicated here rather than modifying that module's
 * exports (this plan's `files_modified` is scoped to this script + its
 * test file only). See that module's own doc comment for the full
 * empirical rationale (Plan 02-03): "-l" is a SPAWN-time-only concern
 * in the live server (`agda-process-spawn.ts`); replaying it through
 * `Cmd_load`'s own per-call option list instead attributes a spurious
 * library-resolution error to the wrong logical command. Without this
 * split, ORCL-03's OWN cold Cmd_load would hit the exact same failure
 * ORCL-01 empirically hit against this repo's own registered
 * `test/fixtures/agda/test-fixtures.agda-lib` fixture project.
 */
function splitMergedArgv(mergedArgv) {
  const libraryFlags = [];
  const remainingFlags = [];
  for (let i = 0; i < mergedArgv.length; i++) {
    if (mergedArgv[i] === "-l" && i + 1 < mergedArgv.length) {
      libraryFlags.push("-l", mergedArgv[i + 1]);
      i++;
      continue;
    }
    remainingFlags.push(mergedArgv[i]);
  }
  return { libraryFlags, remainingFlags };
}

/**
 * Re-derives cold-agda-session.mjs's own (non-exported) "terminus"
 * probe check locally — pure protocol-shape logic, cheap enough to
 * duplicate rather than reach into that module's bundled 7-probe
 * `runEnvironmentProbes()` for a single boolean (mirrors that module's
 * OWN doc-comment rationale for why its terminus probe re-derives
 * parse-load-responses.ts's `sawLoadTerminus` locally instead of
 * importing it).
 */
function coldResponsesReachedTerminus(responses) {
  return (
    responses.some((r) => r && r.kind === "InteractionPoints") ||
    responses.some(
      (r) =>
        r
        && r.kind === "DisplayInfo"
        && r.info
        && (r.info.kind === "AllGoalsWarnings" || r.info.kind === "Error"),
    )
  );
}

// ── runColdInferAndCompare ───────────────────────────────────────────

/**
 * Given an ALREADY-SPAWNED-AND-LOADED cold session (past its own
 * `Cmd_load` — this function never issues one itself, so Plan 02-05's
 * composed CLI can share ONE cold session between ORCL-01 and ORCL-03),
 * issues EXACTLY ONE `Cmd_infer_toplevel` for `targetName` and
 * alpha-diffs the proven signature against `expectedType`.
 *
 * `materializedPath` is the file path used to build the OUTER IOTCM
 * envelope — matching the live server's own `ctx.iotcm()` convention
 * (`src/agda/session.ts`: `iotcm(agdaCmd) { return
 * iotcmEnvelope(this.currentFile ?? "", agdaCmd); }`), which always
 * envelopes with the currently-loaded file's path regardless of which
 * command is being sent.
 *
 * @param {{ sendCommand: (iotcm: string) => Promise<{ responses: unknown[] }> }} session
 * @param {string} materializedPath
 * @param {string} targetName
 * @param {string} expectedType
 */
export async function runColdInferAndCompare(session, materializedPath, targetName, expectedType) {
  const iotcm = iotcmEnvelope(
    materializedPath,
    modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", quoted(targetName)),
  );
  const result = await session.sendCommand(iotcm);
  const rawResponses = Array.isArray(result?.responses) ? result.responses : [];
  // Mirrors the live server (src/session/agda-transport.ts) and
  // orcl-01-differential.mjs's own cold-load handling: every raw parsed
  // response is normalized immediately, before any decoding logic sees
  // it.
  const normalizedResponses = rawResponses.map((resp) => normalizeAgdaResponse(resp));
  const decoded = decodeExpressionDisplayResponses(normalizedResponses);
  return compareSignatures(decoded.inferredType, expectedType);
}

// ── judgeOrcl03: the standalone-runnable ORCL-03 predicate ──────────

/**
 * Judge a staged CaptureArtifact against ORCL-03. Reads the artifact
 * and:
 *   - `vacuous-no-expected-signature`: no `oracleSubstrate.
 *     expectedSignature` was ever captured (D-07) — checked BEFORE
 *     touching `materializeCaptureEnvironment` or any cold spawn, so a
 *     capture with nothing to conform against never wastes a cold
 *     compile.
 *   - `conformance-flagged` (with `provenSignature: null` and an
 *     explanatory `note`): an expectedSignature WAS supplied, but
 *     there was no loaded file to cold-replay against, the cold spawn
 *     itself failed, or the cold load never reached a terminus — an
 *     honest "could not conform" that still stays within the D-02
 *     3-value outcome enum, never a thrown exception.
 *   - `consistent` / `conformance-flagged` (with both signatures):
 *     from `runColdInferAndCompare`, once a real cold Cmd_load
 *     succeeds — `runColdInferAndCompare` then issues
 *     `Cmd_infer_toplevel` against that SAME still-open session.
 *
 * `materialized.cleanup()` and `session.kill()` always run (`finally`),
 * so temp dirs / the cold process never leak regardless of outcome.
 * Every outcome kind this function can return is advisory (D-02/D-06)
 * — it never throws for an ordinary Agda-replay failure, only for a
 * genuine script-level error (e.g. the artifact file itself is missing
 * or malformed), which propagates to the caller (`scriptMain`'s own
 * try/catch when run as a CLI).
 */
export async function judgeOrcl03(artifactPath, options = {}) {
  void options; // reserved for a future explicit budget/opt-out flag; unused today.
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const expectedSignature = artifact?.oracleSubstrate?.expectedSignature;
  if (expectedSignature === null || expectedSignature === undefined) {
    return { kind: "vacuous-no-expected-signature" };
  }

  const { name, expectedType } = parseExpectedSignature(expectedSignature);

  const loadedRelativePath = findLoadedRelativePath(artifact);
  if (loadedRelativePath === null) {
    // D-02's ORCL-03 enum has no "skip" outcome (unlike ORCL-01) — stay
    // within its 3-outcome contract by reporting this as an honest
    // inability to conform, never a thrown exception or a fabricated
    // "consistent".
    return {
      kind: "conformance-flagged",
      provenSignature: null,
      expectedSignature: expectedType,
      note: "no load-family recorded action to cold-replay against; cannot infer a comparable signature",
    };
  }

  const materialized = await materializeCaptureEnvironment(artifact);
  let session = null;
  try {
    const root = resolve(materialized.tmpDir);
    let materializedPath;
    try {
      materializedPath = resolveFileWithinRoot(root, loadedRelativePath);
    } catch (err) {
      if (err instanceof PathSandboxError) {
        return {
          kind: "conformance-flagged",
          provenSignature: null,
          expectedSignature: expectedType,
          note: `loaded path "${loadedRelativePath}" escapes the materialized replay directory — nothing to load cold`,
        };
      }
      throw err;
    }

    const mergedArgv = Array.isArray(artifact?.manifest?.mergedArgv) ? artifact.manifest.mergedArgv : [];
    const { libraryFlags, remainingFlags } = splitMergedArgv(mergedArgv);
    const loadInnerCommand = command("Cmd_load", quoted(materializedPath), stringList(remainingFlags));
    const loadIotcm = iotcmEnvelope(materializedPath, loadInnerCommand);

    session = spawnColdAgdaSession({
      agdaBin: artifact.manifest.agdaBinaryPath,
      cwd: materialized.tmpDir,
      env: { ...process.env, AGDA_DIR: materialized.agdaDirTmp },
      idleMs: 2000,
      extraSpawnArgs: libraryFlags,
    });

    // Prime the fresh process exactly as orcl-01-differential.mjs's
    // runColdLoadAndDiff does — see that module's own doc comment for
    // the full empirical rationale (Plan 02-03): with "-l" flags
    // present at spawn time, Agda's own process-startup output
    // otherwise lands in whichever sendCommand() call happens to be in
    // flight, corrupting the real Cmd_load's response.
    try {
      await session.sendCommand(iotcmEnvelope(materializedPath, topLevelCommand("Cmd_show_version")));
    } catch (err) {
      return {
        kind: "conformance-flagged",
        provenSignature: null,
        expectedSignature: expectedType,
        note: `cold spawn failed before Cmd_load could run: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let loadResult;
    try {
      loadResult = await session.sendCommand(loadIotcm);
    } catch (err) {
      return {
        kind: "conformance-flagged",
        provenSignature: null,
        expectedSignature: expectedType,
        note: `cold Cmd_load failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const normalizedLoadResponses = loadResult.responses.map((resp) => normalizeAgdaResponse(resp));
    if (!coldResponsesReachedTerminus(normalizedLoadResponses)) {
      // NOT `vacuous-no-expected-signature` — an expectedSignature
      // genuinely WAS supplied here; the cold load itself just never
      // reached a terminus, so there is nothing loaded to infer
      // against. Stays advisory (conformance-flagged), never a hard
      // failure, per D-02's spirit.
      return {
        kind: "conformance-flagged",
        provenSignature: null,
        expectedSignature: expectedType,
        note: "cold load did not reach a terminus; cannot infer a comparable signature",
      };
    }

    return await runColdInferAndCompare(session, materializedPath, name, expectedType);
  } finally {
    if (session) session.kill();
    materialized.cleanup();
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

// ORCL-03 is advisory in every outcome kind (D-02/D-06/must_haves truth
// 3) — `consistent`, `vacuous-no-expected-signature`, AND
// `conformance-flagged` all map to exit 0. Exit 1 is reserved
// EXCLUSIVELY for a genuine script-level error (a thrown exception —
// e.g. the artifact file itself is missing/malformed), never for a
// judged outcome, so an automated caller can never mistake ORCL-03's
// own exit code for a pass/fail gate.
const EXIT_CODE_BY_KIND = {
  consistent: 0,
  "vacuous-no-expected-signature": 0,
  "conformance-flagged": 0,
};

export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: npx tsx scripts/oracle/orcl-03-conformance.mjs <path-to-artifact.json>\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const outcome = await judgeOrcl03(artifactPath);
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    process.exitCode = EXIT_CODE_BY_KIND[outcome.kind] ?? 0;
  } catch (err) {
    process.stderr.write(
      `orcl-03-conformance failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
