// MIT License — see LICENSE
//
// D-04's auto-chained-in-code wrap-up pipeline: one command takes a
// finished dogfood run's staged captures through the Phase-2 oracle
// triad (scripts/oracle/run-oracle.mjs, imported UNCHANGED) -> the
// N-times flake gate (./flake-classify.mjs, this plan's Task 1) ->
// either files a genuine candidate defect into the Phase-4 fix queue
// as "new" (scripts/queue/intake.mjs's upsertQueueEntry, imported
// UNCHANGED) or routes it to a gitignored side-channel file the
// frozen fix-queue schema has no slot for. No per-step human
// confirmation — Phase 4 already placed the human review point
// INSIDE the queue itself (new -> triaged).
//
// The deliberate refinement over a bare composed-verdict boolean
// check: ONLY an EXPLICIT `orcl01.kind === "server-false-green-
// candidate"` or `orcl02.kind === "cheat-flagged"` signal is ever
// filed. An INCONCLUSIVE/skip/no-policy/no-target result is ALWAYS a
// no-op — filing an abstention as a "new" defect would directly
// contradict ORCL-01's own "abstain honestly, never say server bug on
// a failed probe" design (Phase 2).
//
// STRICT precedence (the fix for a blocker where a genuine ORCL-02
// cheat was silently dropped whenever it co-occurred with a flaky
// ORCL-01 signal): `orcl02.kind === "cheat-flagged"` is checked FIRST
// and UNCONDITIONALLY, before `orcl01`'s own kind is ever inspected —
// a static soundness-hygiene scan has no timing dimension of its own
// to be flaky about, so a co-occurring `orcl01` signal's N-rerun
// outcome can NEVER suppress a confirmed, independent ORCL-02
// finding.
//
// Ships as a scripts/ + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface. Must be imported via `npx tsx` (not
// plain `node`): it imports .ts siblings via .js-suffixed specifiers,
// and Node's native TS type-stripping does not rewrite .js -> .ts.
// tsx resolves this correctly, and so does vitest's own resolver when
// this module is imported from a .test.ts file.
//
// Run with: npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id> [--rerun-n <N>] [--queue-path <path>]

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";
import { runOracle } from "../oracle/run-oracle.mjs";
import { upsertQueueEntry } from "../queue/intake.mjs";
import { classifyFlakiness } from "./flake-classify.mjs";
import { resolveRunsRoot } from "./transcript-writer.mjs";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";

/**
 * Pure helper (exported for direct unit-testing): builds a
 * `fixQueueEntrySchema`-shaped object from a judged `artifact` +
 * `verdict`, ready to hand to `upsertQueueEntry`.
 *
 * `verdictPath` is a pure suffix-replace on the INPUT `artifactPath`
 * argument — the SAME formula `scripts/oracle/run-oracle.mjs` itself
 * uses to compute the verdict sidecar's own path, deliberately
 * duplicated here (a stable 2-line string convention, not a
 * re-derivation of oracle logic) rather than re-reading it off disk.
 *
 * Both a confirmed ORCL-01 server-false-green candidate and an
 * ORCL-02 cheat-flagged soundness finding map to `defectKind:
 * "false-green"` — this schema's 4-value vocabulary (false-green /
 * crash / wrong-result / missing-feature, test/fixtures/fix-queue.ts)
 * has no dedicated "cheat" bucket, and a soundness cheat (an
 * unsanctioned postulate/unsafe-flag/residual-hole masquerading as a
 * complete proof) is itself a form of false-green in that vocabulary.
 */
export function buildQueueEntryFromVerdict(artifact, artifactPath, verdict) {
  const verdictPath = artifactPath.endsWith(".json")
    ? `${artifactPath.slice(0, -".json".length)}.verdict.json`
    : `${artifactPath}.verdict.json`;

  let summary;
  if (verdict.orcl01.kind === "server-false-green-candidate") {
    summary = "ORCL-01 server-faithfulness differential flagged a candidate false-green.";
  } else if (verdict.orcl02.kind === "cheat-flagged") {
    const findingKinds = [...new Set(verdict.orcl02.findings.map((finding) => finding.kind))];
    summary =
      `ORCL-02 soundness-hygiene scan flagged ${verdict.orcl02.findings.length} `
      + `unsanctioned finding(s): ${findingKinds.join(", ")}.`;
  } else {
    // Unreachable in practice — wrapUpCapture only ever calls this
    // helper from its filing fall-through, which is only reached when
    // one of the two branches above already matched. Documented
    // defensively rather than assumed silently.
    summary = "Dogfood wrap-up flagged this capture for filing.";
  }

  return {
    fingerprint: artifact.dedup.fingerprint,
    status: "new",
    defectKind: "false-green",
    triageClass: artifact.triage?.category ?? null,
    triageConfidence: artifact.triage?.confidence ?? null,
    recurrence: artifact.dedup.recurrence,
    title: `Dogfood-surfaced: ${artifact.dedup.fingerprint}`,
    summary,
    affectedTool: artifact.recordedActions.at(-1)?.tool ?? "unknown",
    capturePath: artifactPath,
    verdictPath,
    matrixEntryId: null,
    createdAt: new Date().toISOString(),
    closedAt: null,
  };
}

/**
 * Append one line to the gitignored flaky-capture side-channel
 * (`.agda-mcp/runs/<run-id>/flaky-captures.jsonl`) — the tracked
 * fix-queue schema has no "flaky" `defectKind` slot, so a pure ORCL-01
 * flaky classification (no co-occurring ORCL-02 cheat) is tagged and
 * persisted here rather than silently discarded. Append-only,
 * single-writer, out-of-band — `appendFileSync` (not `writeFileAtomic`)
 * matches `scripts/oracle/run-oracle.mjs`'s own `oracle-metrics.jsonl`
 * precedent for this exact category of file. The literal
 * `"timing/nondeterministic"` default tag matches ROADMAP criterion 4's
 * / D-04's own wording verbatim, so the success criterion is
 * mechanically greppable straight from this persisted side-channel
 * file. A `"replay-inconclusive"` outcome (every replay failed to
 * produce a classification — a broken replay environment, not observed
 * nondeterminism) is appended with the distinct `"replay-failed"` tag
 * instead, so triage never reads a replay failure as flakiness.
 */
export async function appendFlakyLog(flakyLogPath, artifactPath, verdict, flake, tag = "timing/nondeterministic") {
  appendFileSync(
    flakyLogPath,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      artifactPath,
      fingerprint: verdict.fingerprint,
      orcl01Kind: verdict.orcl01.kind,
      tag,
      observedClassifications: flake.observedClassifications,
    })}\n`,
    "utf8",
  );
}

/**
 * Judge one staged capture end to end: oracle triad -> flake gate ->
 * file-or-sidechannel. `config` carries `{ queueJsonPath, flakyLogPath,
 * n, deps }`; `deps` overrides `runOracle`/`classifyFlakiness`/
 * `upsertQueueEntry`/`appendFlakyLog` (the SAME `options.deps` DI
 * convention `./flake-classify.mjs` and `scripts/oracle/run-oracle.mjs`
 * both already use), used by this module's own tests to inject fakes
 * with zero real Agda/subprocess/filesystem cost.
 *
 * @param {string} artifactPath - Path to the staged CaptureArtifact JSON.
 * @param {object} artifact - The ALREADY-PARSED CaptureArtifact object
 *   at `artifactPath` (the caller reads it once; this function never
 *   re-reads the file itself).
 * @param {object} [config]
 * @returns {Promise<
 *   | { filed: false, classification: "not-a-candidate", verdict: object }
 *   | { filed: false, classification: "flaky", tag: "timing/nondeterministic", verdict: object, flake: object }
 *   | { filed: false, classification: "replay-inconclusive", tag: "replay-failed", verdict: object, flake: object }
 *   | { filed: true, classification: "deterministic", verdict: object }
 * >}
 */
export async function wrapUpCapture(artifactPath, artifact, config = {}) {
  const runOracleFn = config.deps?.runOracle ?? runOracle;
  const classifyFn = config.deps?.classifyFlakiness ?? classifyFlakiness;
  const upsertFn = config.deps?.upsertQueueEntry ?? upsertQueueEntry;
  const appendFlakyFn = config.deps?.appendFlakyLog ?? appendFlakyLog;

  const verdict = await runOracleFn(artifactPath);

  // STRICT priority order, checked top to bottom, first match wins —
  // see the header comment for why this precedence is itself the
  // blocker fix. `shouldFile` is set by whichever branch matches;
  // there is exactly ONE call site below for the actual filing
  // (upsertFn), reached only from branch (1) or branch (2)'s
  // deterministic path, never from branch (3).
  let shouldFile;
  if (verdict.orcl02.kind === "cheat-flagged") {
    // (1) Checked FIRST and UNCONDITIONALLY, regardless of
    // verdict.orcl01.kind — a static scan has no timing dimension to
    // be flaky about, so the flake gate is skipped entirely.
    shouldFile = true;
  } else if (verdict.orcl01.kind === "server-false-green-candidate") {
    // (2) A server-faithfulness candidate must survive N independent
    // fresh warm replays before it is trusted as a real defect.
    const flake = await classifyFn(artifact, config.n ?? 3);
    if (flake.classification === "flaky") {
      await appendFlakyFn(config.flakyLogPath, artifactPath, verdict, flake);
      return { filed: false, classification: "flaky", tag: "timing/nondeterministic", verdict, flake };
    }
    if (flake.classification === "replay-inconclusive") {
      // Every replay failed to produce a classification at all — the
      // replay ENVIRONMENT could not reproduce the session ("cannot
      // judge"), which is neither observed timing nondeterminism nor a
      // confirmed deterministic defect. Persisted to the same side
      // channel, but under the distinct "replay-failed" tag so triage
      // never reads a replay failure as flakiness.
      await appendFlakyFn(config.flakyLogPath, artifactPath, verdict, flake, "replay-failed");
      return { filed: false, classification: "replay-inconclusive", tag: "replay-failed", verdict, flake };
    }
    shouldFile = true;
  } else {
    // (3) Neither an explicit positive signal is present — true-green,
    // or any abstention/advisory kind alike (inconclusive/skip/
    // no-policy/no-target). Never auto-filed as a defect.
    shouldFile = false;
  }

  if (!shouldFile) {
    return { filed: false, classification: "not-a-candidate", verdict };
  }

  await upsertFn(buildQueueEntryFromVerdict(artifact, artifactPath, verdict), config.queueJsonPath);
  return { filed: true, classification: "deterministic", verdict };
}

// ── CLI ──────────────────────────────────────────────────────────────

/** Extracts `--rerun-n <N>` / `--queue-path <path>` from a flat
 *  `--flag value` argv array, positional arg 0 = runId. Throws on a
 *  non-positive-integer rerun count: a typo'd env var or a missing/
 *  non-numeric `--rerun-n` value must fail loudly HERE, never reach
 *  `classifyFlakiness` as `NaN`/`0` — a zero-iteration replay loop
 *  would classify every deterministic candidate as "flaky" on an
 *  EMPTY observation list and silently unfile it. */
function parseWrapupArgv(argv) {
  const runId = argv[0];

  const rerunNFlagIndex = argv.indexOf("--rerun-n");
  const rerunNRaw =
    rerunNFlagIndex !== -1
      ? argv[rerunNFlagIndex + 1]
      : (process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? "3");
  const rerunN = Number(rerunNRaw);
  if (!Number.isInteger(rerunN) || rerunN < 1) {
    throw new Error(
      `--rerun-n / AGDA_MCP_DOGFOOD_RERUN_N must be a positive integer, got "${rerunNRaw}"`,
    );
  }

  const queuePathFlagIndex = argv.indexOf("--queue-path");
  const queueJsonPath =
    queuePathFlagIndex !== -1
      ? argv[queuePathFlagIndex + 1]
      : join(SERVER_REPO_ROOT, "test/fixtures/fix-queue.json");

  return { runId, rerunN, queueJsonPath };
}

export async function scriptMain(argv = process.argv.slice(2)) {
  let parsedArgs;
  try {
    parsedArgs = parseWrapupArgv(argv);
  } catch (err) {
    process.stderr.write(`dogfood-wrapup: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }
  const { runId, rerunN, queueJsonPath } = parsedArgs;

  if (!runId) {
    process.stderr.write(
      "Usage: npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id> "
        + "[--rerun-n <N>] [--queue-path <path>]\n",
    );
    process.exitCode = 1;
    return;
  }

  const runDir = join(resolveRunsRoot(), runId);
  const reportPath = join(runDir, "run-report.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(
      `dogfood-wrapup: no run report found at ${reportPath} — `
        + "has this run id been recorded by dogfood-run.mjs?\n",
    );
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const flakyLogPath = join(runDir, "flaky-captures.jsonl");
  const stagedCaptures = Array.isArray(report.stagedCaptures) ? report.stagedCaptures : [];

  const results = [];
  for (const staged of stagedCaptures) {
    // Per-capture error isolation: one deleted/corrupt staged file, an
    // absent stagedPath field, or one wrapUpCapture rejection (oracle
    // cold-spawn failure, a stale dist/ build failing harness creation)
    // must never zero out the whole run — every remaining capture still
    // gets judged and wrapup-report.json still gets written.
    try {
      const artifact = JSON.parse(readFileSync(staged.stagedPath, "utf8"));
      const outcome = await wrapUpCapture(staged.stagedPath, artifact, {
        queueJsonPath,
        flakyLogPath,
        n: rerunN,
      });
      results.push({ stagedPath: staged.stagedPath, ...outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`dogfood-wrapup: failed to judge ${staged.stagedPath}: ${message}\n`);
      results.push({
        stagedPath: staged.stagedPath,
        filed: false,
        classification: "error",
        error: message,
      });
    }
  }

  const summary = {
    runId,
    queueJsonPath,
    n: rerunN,
    totalCaptures: results.length,
    filed: results.filter((r) => r.filed).length,
    flaky: results.filter((r) => r.classification === "flaky").length,
    replayInconclusive: results.filter((r) => r.classification === "replay-inconclusive").length,
    notACandidate: results.filter((r) => r.classification === "not-a-candidate").length,
    errors: results.filter((r) => r.classification === "error").length,
    results,
  };

  await writeFileAtomic(join(runDir, "wrapup-report.json"), JSON.stringify(summary, null, 2));

  process.stdout.write(
    `[dogfood-wrapup] run ${runId}: ${summary.totalCaptures} capture(s) judged — `
      + `${summary.filed} filed, ${summary.flaky} flaky, `
      + `${summary.replayInconclusive} replay-inconclusive, `
      + `${summary.notACandidate} not-a-candidate, ${summary.errors} error(s).\n`,
  );

  if (summary.errors > 0) {
    // The report is complete, but at least one capture went unjudged —
    // surface that as a non-zero exit so a caller/CI can notice.
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
