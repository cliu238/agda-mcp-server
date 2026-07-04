// MIT License — see LICENSE
//
// The single composed oracle CLI (Phase 2 oracle triad, Plan 02-05):
// runs ORCL-01 (server-faithfulness differential), ORCL-02
// (soundness-hygiene scan), and ORCL-03 (conformance proxy) against a
// staged CaptureArtifact, composes their outcomes via
// scripts/oracle/verdict-schema.mjs's `composeVerdict`, writes a
// verdict sidecar NEXT TO the capture (D-01 — never a mutation of the
// artifact itself), and appends one line to a cumulative
// `oracle-metrics.jsonl` recording the ORCL-01 abstention/INCONCLUSIVE
// rate (D-04).
//
// When BOTH ORCL-01 and ORCL-03 are selected (the default, or
// `--only orcl-01,orcl-03`), they share ONE materialized environment
// and ONE cold Agda process — this module calls Plan 02-03's
// lower-level `runColdLoadAndDiff` directly (with `keepSessionAlive:
// true`) rather than the standalone `judgeOrcl01`, and reuses the
// still-open session for ORCL-03's `Cmd_infer_toplevel` via Plan
// 02-04's `runColdInferAndCompare`, instead of paying for a second
// full cold compile (a from-scratch recompile can itself approach a
// practical timeout on large corpora — see 02-RESEARCH.md).
//
// `--only orcl-03` ALONE (ORCL-01 excluded) is the one combination
// with no shared session to reuse — that case falls back to the full
// STANDALONE `judgeOrcl03`, which performs its own independent
// materialization + cold `Cmd_load` + `Cmd_infer_toplevel`, so ORCL-03
// still gets a REAL comparison rather than a vacuous/skip placeholder.
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface.
//
// Run with: npx tsx scripts/oracle/run-oracle.mjs <path> [--only orcl-01,orcl-02,orcl-03] [--policy <key>]
// (NOT plain `node` — see orcl-01-differential.mjs's header for why.)

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";
import { abstentionMetricLine, composeVerdict } from "./verdict-schema.mjs";
import {
  COMPLETENESS_CLASSIFICATIONS,
  findWarmLoadTuple,
  materializeCaptureEnvironment,
  runColdLoadAndDiff,
} from "./orcl-01-differential.mjs";
import { judgeOrcl02 } from "./orcl-02-soundness-scan.mjs";
import { judgeOrcl03, parseExpectedSignature, runColdInferAndCompare } from "./orcl-03-conformance.mjs";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";

const ALL_PREDICATES = ["orcl-01", "orcl-02", "orcl-03"];

// run-oracle.mjs-LOCAL "excluded by --only" placeholder convention —
// NOT a new addition to any individual predicate's own outcome enum
// (documented here once, per the plan's own instruction). ORCL-01/
// ORCL-02 reuse a generic `{ kind: "skip", reason: "excluded by
// --only" }` marker (ORCL-01 already has a real "skip" kind in its own
// enum for the analogous "nothing to diff" case; ORCL-02 has no
// "skip"-shaped kind of its own, but this marker is only ever read
// advisorily off the composed verdict, never fed back into either
// module). ORCL-03 reuses its OWN `vacuous-no-expected-signature` kind
// instead — its enum has no "skip"-equivalent value, and "nothing to
// compare" is already the correct advisory-safe fit for "this
// predicate did not run".
const EXCLUDED_SKIP_PLACEHOLDER = { kind: "skip", reason: "excluded by --only" };
const EXCLUDED_ORCL03_PLACEHOLDER = { kind: "vacuous-no-expected-signature" };

/**
 * ORCL-03 when ORCL-01 did not produce a live, still-open session to
 * reuse (skipped entirely, or its cold load never reached a terminus)
 * but ORCL-03 WAS requested: vacuous when no `expectedSignature` was
 * ever captured at all (D-07); otherwise the SAME advisory
 * "could-not-conform" shape 02-04's `judgeOrcl03` itself documents for
 * the analogous standalone scenario — never a thrown exception, never
 * a fabricated real comparison, and never a bare
 * `vacuous-no-expected-signature` when a signature WAS present but
 * simply unusable here.
 */
function orcl03WithoutSharedSession(artifact, note) {
  const expectedSignature = artifact?.oracleSubstrate?.expectedSignature;
  if (expectedSignature === null || expectedSignature === undefined) {
    return { kind: "vacuous-no-expected-signature" };
  }
  const { expectedType } = parseExpectedSignature(expectedSignature);
  return { kind: "conformance-flagged", provenSignature: null, expectedSignature: expectedType, note };
}

/**
 * ORCL-03 when ORCL-01's cold load DID reach a terminus and a live
 * session is available: a REAL `Cmd_infer_toplevel` comparison,
 * reusing the SAME session (never a second cold spawn). Still vacuous
 * when no `expectedSignature` was ever captured (checked first, per
 * D-07, before touching the session at all).
 */
async function orcl03WithSharedSession(artifact, session, materializedPath) {
  const expectedSignature = artifact?.oracleSubstrate?.expectedSignature;
  if (expectedSignature === null || expectedSignature === undefined) {
    return { kind: "vacuous-no-expected-signature" };
  }
  const { name, expectedType } = parseExpectedSignature(expectedSignature);
  return await runColdInferAndCompare(session, materializedPath, name, expectedType);
}

/**
 * Run ORCL-01 (± ORCL-03, sharing its materialization/session) for the
 * case where `orcl-01` IS included in `only` — the exactly-one-warm-
 * tuple-check-then-cold-load composition Plan 02-05's `<action>` text
 * describes as case (a). Returns `{ orcl01Outcome, orcl03Outcome }`.
 */
async function runSharedOrcl01AndOrcl03(artifact, runOrcl03, spawnOverride) {
  const warm = findWarmLoadTuple(artifact);
  if (warm === null) {
    return {
      orcl01Outcome: { kind: "skip", reason: "no load-family recorded action to diff against" },
      orcl03Outcome: runOrcl03
        ? orcl03WithoutSharedSession(
            artifact,
            "no load-family recorded action to cold-replay against; cannot infer a comparable signature",
          )
        : EXCLUDED_ORCL03_PLACEHOLDER,
    };
  }
  if (!COMPLETENESS_CLASSIFICATIONS.has(warm.tuple.classification)) {
    return {
      orcl01Outcome: {
        kind: "skip",
        reason: `warm classification "${warm.tuple.classification}" has no meaningful cold counterpart`,
      },
      orcl03Outcome: runOrcl03
        ? orcl03WithoutSharedSession(
            artifact,
            "cold load did not reach a terminus; cannot infer a comparable signature",
          )
        : EXCLUDED_ORCL03_PLACEHOLDER,
    };
  }

  const materialized = await materializeCaptureEnvironment(artifact);
  let sharedSession = null;
  try {
    const result = await runColdLoadAndDiff(artifact, materialized, warm, {
      keepSessionAlive: runOrcl03,
      spawnColdAgdaSession: spawnOverride,
    });
    if (!runOrcl03) {
      // keepSessionAlive was false — result is the bare outcome, exactly
      // as runColdLoadAndDiff behaved before Plan 02-05.
      return { orcl01Outcome: result, orcl03Outcome: EXCLUDED_ORCL03_PLACEHOLDER };
    }
    sharedSession = result.session;
    const orcl03Outcome =
      sharedSession !== null
        ? await orcl03WithSharedSession(artifact, sharedSession, result.materializedPath)
        : orcl03WithoutSharedSession(
            artifact,
            "cold load did not reach a terminus; cannot infer a comparable signature",
          );
    return { orcl01Outcome: result.outcome, orcl03Outcome };
  } finally {
    // Both cleanup calls always run regardless of outcome — the shared
    // session and the shared materialized dirs never leak.
    if (sharedSession) sharedSession.kill();
    materialized.cleanup();
  }
}

/**
 * Run all three oracle predicates against a staged CaptureArtifact,
 * compose the D-02 verdict, write the verdict sidecar (D-01), and
 * append one abstention-metric line (D-04).
 *
 * @param {string} artifactPath - Path to the staged CaptureArtifact JSON.
 * @param {object} [options]
 * @param {("orcl-01"|"orcl-02"|"orcl-03")[]} [options.only] - Restrict
 *   which predicates run. Defaults to all three. Passing `[]` runs
 *   none (every predicate gets its excluded-placeholder).
 * @param {string} [options.policyKey] - POLICY-01: an explicit ORCL-02
 *   policy key, passed straight through to `judgeOrcl02`'s own
 *   `options.policyKey` when ORCL-02 runs. Omitted (`undefined`) keeps
 *   `judgeOrcl02`'s own `.agda-lib`-derived default; a
 *   `PolicyResolutionError` thrown by `judgeOrcl02` for an
 *   unresolvable key propagates uncaught (D-03: loud, never silent).
 * @param {{ spawnColdAgdaSession?: Function }} [options.deps] -
 *   Dependency-injection seam, used by this module's own tests to
 *   count cold-session spawns (proving ORCL-01/ORCL-03 share exactly
 *   one). Never needed by real callers.
 * @returns {Promise<ReturnType<typeof composeVerdict>>}
 */
export async function runOracle(artifactPath, options = {}) {
  const only = Array.isArray(options.only) ? options.only : ALL_PREDICATES;
  const spawnOverride = options.deps?.spawnColdAgdaSession;

  // Read/parse once — used only for fingerprint/recurrence (the
  // metrics line) and for oracleSubstrate/manifest reads inside the
  // predicate helpers above; NEVER used to derive the sidecar path.
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  const runOrcl01 = only.includes("orcl-01");
  const runOrcl02 = only.includes("orcl-02");
  const runOrcl03 = only.includes("orcl-03");

  let orcl01Outcome;
  let orcl03Outcome;

  if (runOrcl01) {
    // Case (a): ORCL-01 included (± ORCL-03) — share one materialization
    // and (when ORCL-03 is also included and the cold load reaches a
    // terminus) one cold Agda process between the two predicates.
    ({ orcl01Outcome, orcl03Outcome } = await runSharedOrcl01AndOrcl03(artifact, runOrcl03, spawnOverride));
  } else if (runOrcl03) {
    // Case (b): `--only orcl-03` alone (Warning 4's fix) — no shared
    // session exists since ORCL-01 never runs in this combination; the
    // FULL STANDALONE judgeOrcl03 performs its own independent
    // materialization + cold Cmd_load + Cmd_infer_toplevel + cleanup,
    // giving orcl03Outcome a REAL comparison rather than a
    // vacuous/skip placeholder.
    orcl01Outcome = EXCLUDED_SKIP_PLACEHOLDER;
    orcl03Outcome = await judgeOrcl03(artifactPath);
  } else {
    // Case (c): neither included — no materialization, probe gate, or
    // cold spawn of any kind runs for either.
    orcl01Outcome = EXCLUDED_SKIP_PLACEHOLDER;
    orcl03Outcome = EXCLUDED_ORCL03_PLACEHOLDER;
  }

  // ORCL-02 is fully independent (no subprocess, no shared state with
  // ORCL-01/ORCL-03) — run it as-is whenever included. POLICY-01:
  // options.policyKey (when present) is threaded straight through to
  // judgeOrcl02's own options bag, the SAME accept-a-bag-pass-through
  // shape options.deps.spawnColdAgdaSession already uses above.
  const orcl02Outcome = runOrcl02
    ? await judgeOrcl02(artifactPath, options.policyKey !== undefined ? { policyKey: options.policyKey } : {})
    : EXCLUDED_SKIP_PLACEHOLDER;

  const verdict = composeVerdict({
    orcl01: orcl01Outcome,
    orcl02: orcl02Outcome,
    orcl03: orcl03Outcome,
    capturePath: artifactPath,
    fingerprint: artifact?.dedup?.fingerprint ?? "unknown",
    recurrence: artifact?.dedup?.recurrence ?? 0,
  });

  // D-01: the verdict sidecar is written as a NEW file next to the
  // capture — a pure string suffix-replace on the INPUT path argument,
  // NEVER reconstructed from dedup.fingerprint/recurrence (robust
  // regardless of whatever staged-filename convention the capture tool
  // itself uses, present or future) — and NEVER a mutation of the
  // artifact's own JSON content.
  const sidecarPath = artifactPath.endsWith(".json")
    ? `${artifactPath.slice(0, -".json".length)}.verdict.json`
    : `${artifactPath}.verdict.json`;
  await writeFileAtomic(sidecarPath, JSON.stringify(verdict, null, 2));

  // D-04: one appended line per run, regardless of `only` — lets the
  // abstention/INCONCLUSIVE rate be computed later by counting lines.
  // mkdirSync-free: the captures directory already exists since the
  // artifact itself lives there. Single-writer, out-of-band script —
  // appendFileSync (not writeFileAtomic) matches this project's own
  // promote-capture.mjs precedent for this exact category of file.
  const metricsPath = join(dirname(artifactPath), "oracle-metrics.jsonl");
  appendFileSync(metricsPath, `${JSON.stringify(abstentionMetricLine(verdict))}\n`, "utf8");

  process.stdout.write(
    `orcl01=${orcl01Outcome.kind} orcl02=${orcl02Outcome.kind} orcl03=${orcl03Outcome.kind} trueGreen=${verdict.trueGreen}\n`,
  );

  return verdict;
}

// ── CLI ──────────────────────────────────────────────────────────────

export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: npx tsx scripts/oracle/run-oracle.mjs <path-to-artifact.json> "
        + "[--only orcl-01,orcl-02,orcl-03] [--policy <key>]\n",
    );
    process.exitCode = 1;
    return;
  }

  const onlyFlagIndex = argv.indexOf("--only");
  const only =
    onlyFlagIndex !== -1
      ? argv[onlyFlagIndex + 1]
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined;

  const policyFlagIndex = argv.indexOf("--policy");
  const policyKey = policyFlagIndex !== -1 ? argv[policyFlagIndex + 1] : undefined;

  try {
    // A non-true-green result is the CLI's own "needs attention"
    // signal (exit 1) — the sidecar's per-predicate detail is where
    // the actual reason lives, never collapsed away into the exit code.
    // A PolicyResolutionError (an expected --policy key that could not
    // be resolved) propagates uncaught into the catch block below,
    // same as any other run-oracle failure (D-03: loud, never silent).
    const verdict = await runOracle(artifactPath, {
      ...(only !== undefined ? { only } : {}),
      ...(policyKey !== undefined ? { policyKey } : {}),
    });
    process.exitCode = verdict.trueGreen ? 0 : 1;
  } catch (err) {
    process.stderr.write(`run-oracle failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
