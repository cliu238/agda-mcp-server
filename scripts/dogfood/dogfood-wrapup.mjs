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
// Run with: npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id> [--rerun-n <N>] [--queue-path <path>] [--policy <key>]

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainModule } from "../test-with-sentinel.mjs";
import { runOracle } from "../oracle/run-oracle.mjs";
import { upsertQueueEntry } from "../queue/intake.mjs";
import { classifyFlakiness } from "./flake-classify.mjs";
import { resolveRunsRoot } from "./transcript-writer.mjs";
import { loadTaskManifest } from "./task-manifest.mjs";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
// Dual JSON-loader note (test/fixtures/fuel-corpora.ts's own header):
// this is the test-side typed constant, resolved via tsx's .js -> .ts
// specifier mapping — NOT src/json-data.ts's runtime loadJsonData,
// which is what orcl-02-soundness-scan.mjs's loadOraclePolicy uses for
// the ACTUAL policy file one step later. The two are not interchangeable.
import { fuelCorpora } from "../../test/fixtures/fuel-corpora.js";

const LOAD_FAMILY_TOOL_PATTERN = /^agda_(load|typecheck)/;

/**
 * The tool name of the LAST load-family recorded action, or `null`
 * when the capture has none. For a filed load-family defect this is
 * the action the oracle keyed on — a trailing unrelated call
 * (`agda_capture_session` itself, say) must not become the queue
 * entry's `affectedTool`.
 */
function lastLoadFamilyToolName(recordedActions) {
  const actions = Array.isArray(recordedActions) ? recordedActions : [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const tool = actions[i]?.tool;
    if (typeof tool === "string" && LOAD_FAMILY_TOOL_PATTERN.test(tool)) {
      return tool;
    }
  }
  return null;
}

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

  // Mirrors wrapUpCapture's own STRICT filing precedence (ORCL-02
  // cheat-flagged first) and CONCATENATES both signals when both are
  // present: in the co-occurrence case the entry is filed BECAUSE OF
  // the confirmed ORCL-02 cheat (the flake gate is skipped entirely),
  // so the summary must lead with the cheat findings rather than
  // reporting only an ORCL-01 candidate that never survived the
  // N-rerun gate on that path.
  const summaryParts = [];
  if (verdict.orcl02.kind === "cheat-flagged") {
    const findingKinds = [...new Set(verdict.orcl02.findings.map((finding) => finding.kind))];
    summaryParts.push(
      `ORCL-02 soundness-hygiene scan flagged ${verdict.orcl02.findings.length} `
        + `unsanctioned finding(s): ${findingKinds.join(", ")}.`,
    );
  }
  if (verdict.orcl01.kind === "server-false-green-candidate") {
    summaryParts.push("ORCL-01 server-faithfulness differential flagged a candidate false-green.");
  }
  const summary =
    summaryParts.length > 0
      ? summaryParts.join(" ")
      : // Unreachable in practice — wrapUpCapture only ever calls this
        // helper from its filing fall-through, which is only reached when
        // one of the two signals above already matched. Documented
        // defensively rather than assumed silently.
        "Dogfood wrap-up flagged this capture for filing.";

  return {
    fingerprint: artifact.dedup.fingerprint,
    status: "new",
    defectKind: "false-green",
    triageClass: artifact.triage?.category ?? null,
    triageConfidence: artifact.triage?.confidence ?? null,
    recurrence: artifact.dedup.recurrence,
    title: `Dogfood-surfaced: ${artifact.dedup.fingerprint}`,
    summary,
    affectedTool:
      // lastLoadFamilyToolName() defensively coerces a missing/non-array
      // recordedActions to []; this fallback must apply the same guard
      // (WR-03) rather than calling .at(-1) directly on a value that
      // might not be an array — a malformed/adversarial staged capture
      // must degrade to "unknown" like the rest of this pure helper,
      // not throw an uncaught TypeError.
      lastLoadFamilyToolName(artifact.recordedActions)
      ?? (Array.isArray(artifact.recordedActions) ? artifact.recordedActions.at(-1)?.tool : undefined)
      ?? "unknown",
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
 * n, policyKey, deps }`; `deps` overrides `runOracle`/`classifyFlakiness`/
 * `upsertQueueEntry`/`appendFlakyLog` (the SAME `options.deps` DI
 * convention `./flake-classify.mjs` and `scripts/oracle/run-oracle.mjs`
 * both already use), used by this module's own tests to inject fakes
 * with zero real Agda/subprocess/filesystem cost. `config.policyKey`
 * (POLICY-01) is threaded straight through to `runOracleFn`'s own
 * `options.policyKey`, which `run-oracle.mjs`'s real `runOracle`
 * forwards on to `judgeOrcl02` — omitted (`undefined`) keeps
 * `judgeOrcl02`'s own `.agda-lib`-derived default.
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

  const orcl02Options = config.policyKey !== undefined ? { policyKey: config.policyKey } : {};
  const verdict = await runOracleFn(artifactPath, orcl02Options);

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

/**
 * POLICY-01/D-01: resolve the ORCL-02 policy key this wrapup run should
 * pass to every `wrapUpCapture` call, in STRICT first-match-wins
 * precedence (mirrors `wrapUpCapture`'s own STRICT-order filing
 * precedence, see its header comment):
 *   (a) an explicit `--policy` flag always wins.
 *   (b) otherwise, if the run's task manifest is readable, every entry
 *       shares exactly ONE distinct `corpus` value, AND that corpus is
 *       a known `fuel-corpora.json` entry, its `policyKey` column is
 *       used — the W2 fix (audit: "test-validated but never consumed
 *       at runtime").
 *   (c) otherwise `undefined` — `judgeOrcl02`'s own `.agda-lib`-derived
 *       fallback, the legitimate v1.0 default.
 * Branch (b)'s failure modes (an unreadable/invalid manifest, mixed
 * corpus values, or an unknown corpus key) are NEVER a hard error
 * here: Task 1's loud-fail `resolvePolicyStrict` plus the `.agda-lib`
 * fallback already guarantee no silent degradation downstream. Each
 * skipped branch (b) writes exactly ONE stderr warning line naming why
 * corpus-derived resolution was skipped, then falls through to (c).
 */
export function resolveWrapupPolicyKey({ policyFlag, manifestPath }) {
  if (policyFlag !== undefined) {
    return policyFlag;
  }

  if (!manifestPath) {
    return undefined;
  }

  let manifest;
  try {
    manifest = loadTaskManifest(manifestPath);
  } catch (err) {
    process.stderr.write(
      "dogfood-wrapup: WARNING — could not derive a corpus policy key from the task manifest at "
        + `${manifestPath} (${err instanceof Error ? err.message : String(err)}); falling back to `
        + "each capture's own .agda-lib-derived policy.\n",
    );
    return undefined;
  }

  const corpora = [...new Set(manifest.map((entry) => entry.corpus))];
  if (corpora.length !== 1) {
    process.stderr.write(
      `dogfood-wrapup: WARNING — task manifest at ${manifestPath} references `
        + `${corpora.length} distinct corpus value(s) (${corpora.join(", ") || "none"}); a single `
        + "run-level policy key requires exactly one, so falling back to each capture's own "
        + ".agda-lib-derived policy.\n",
    );
    return undefined;
  }

  const [corpus] = corpora;
  const fuelCorpusEntry = fuelCorpora.find((entry) => entry.key === corpus);
  if (!fuelCorpusEntry) {
    process.stderr.write(
      `dogfood-wrapup: WARNING — task manifest corpus "${corpus}" is not a known fuel-corpora.json `
        + "entry; falling back to each capture's own .agda-lib-derived policy.\n",
    );
    return undefined;
  }

  return fuelCorpusEntry.policyKey;
}

/**
 * D-12's unconditional upload-chain tail step: spawn upload-run.mjs's
 * own CLI (`npx tsx <sibling-path> <runId>`) and wait for it to close.
 * Resolved sibling-relative (`fileURLToPath` + `import.meta.url`, NOT a
 * `SERVER_REPO_ROOT`-based join) so this works regardless of cwd — both
 * files live in the same `scripts/dogfood/` directory.
 *
 * `spawn` (never `execFileSync`) because the upload itself can be slow
 * (a multi-GB archive over the network) — a synchronous call would
 * block this process for the whole upload. `stdio:
 * ["ignore","inherit","inherit"]` lets upload-run.mjs's own diagnostic
 * output surface directly on this process's console.
 *
 * NEVER throws (T-07-16 / D-12's fail-open contract): a spawn failure
 * (missing tsx, ENOENT) is caught and logged to stderr, returning
 * `{ attempted: false, reason: "spawn-failed" }`. A normal close —
 * REGARDLESS of the child's own exit code, since upload-run.mjs's own
 * CLI always exits 0 by its own design — returns `{ attempted: true }`.
 * This return value is informational only: the caller (scriptMain's
 * tail, below) MUST NEVER read it to set `process.exitCode` — doing so
 * would violate D-12's "joined with ';' never '&&'" contract, letting
 * an upload failure/no-op silently mask or override a real judging
 * error (or vice versa).
 */
export async function chainUploadRun(runId, options = {}) {
  const spawnFn = options.deps?.spawn ?? spawn;
  const uploadRunPath = fileURLToPath(new URL("./upload-run.mjs", import.meta.url));

  try {
    const child = spawnFn("npx", ["tsx", uploadRunPath, runId], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: false,
    });
    await new Promise((resolveClose, rejectClose) => {
      child.on("error", rejectClose);
      child.on("close", () => resolveClose(undefined));
    });
    return { attempted: true };
  } catch (err) {
    process.stderr.write(
      `dogfood-wrapup: upload chain spawn failed for run ${runId} (continuing — fail-open, `
        + `see AGDA_MCP_TEAM_UPLOAD_KEY/URL and .agda-mcp/team/upload-queue.jsonl): `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { attempted: false, reason: "spawn-failed" };
  }
}

/**
 * Fix-queue 0bc76d15c2fec8df's acceptance half: a `finalized:false`
 * report (dogfood-run.mjs's OWN incremental checkpoint, never rewritten
 * with `finalized:true` because the proxy died hard — a SIGKILL-class
 * event with zero opportunity to run its own graceful finalize()) is
 * NOT a reason to refuse the run. Every recorded action in it was
 * durably written to disk BEFORE the proxy died, so it remains fully
 * trustworthy evidence — only the run's own terminal exit metadata is
 * unavailable. This must never be silent: prints a LOUD stderr warning
 * (mirrors the existing no-policy warning's shape/tone immediately
 * below) and returns `false` so the caller can also surface it in the
 * persisted `wrapup-report.json` summary and the printed stdout line —
 * three independent surfaces, per the "never silent" instruction.
 *
 * A report with no `finalized` field at all (every report written by
 * dogfood-run.mjs before this fix landed) is treated as finalized —
 * those runs only ever existed on disk because finalize() itself
 * completed successfully; the field's ABSENCE is not evidence of a
 * hard death, it just predates this schema addition.
 *
 * Exported and pure-ish (its only side effect is the stderr write) so
 * it is directly unit-testable without invoking the full scriptMain
 * CLI (which also unconditionally chains a real upload-run.mjs
 * subprocess spawn).
 */
export function checkReportFinalized(report, runId) {
  if (report?.finalized === false) {
    process.stderr.write(
      `dogfood-wrapup: WARNING — run ${runId}'s run-report.json is NOT finalized (finalized:false); `
        + "the recording proxy likely died before it could shut down gracefully (e.g. a hard kill from "
        + "its parent agent). The recorded actions below were written incrementally and remain trustworthy "
        + "(they were persisted to disk before the proxy died) — but this run's own exit metadata is "
        + "unavailable.\n",
    );
    return false;
  }
  return true;
}

/**
 * IN-01: a positional run-id value is joined unvalidated into a
 * filesystem path (`join(resolveRunsRoot(), runId)` below, and again
 * in dogfood-run.mjs) — reject anything that looks like an
 * accidentally-swallowed flag token (e.g. running this CLI with only
 * `--rerun-n 3` and no runId at all lets "--rerun-n" itself land in
 * the positional runId slot) or that could escape the runs root once
 * joined (a leading "..", or an embedded "/"/"\\" path separator).
 */
function assertSafeRunId(runId) {
  if (runId.startsWith("--") || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
    throw new Error(
      `invalid run-id "${runId}": must not start with "--" or contain a path separator`,
    );
  }
}

/** Extracts `--rerun-n <N>` / `--queue-path <path>` / `--policy <key>`
 *  from a flat `--flag value` argv array, positional arg 0 = runId.
 *  Throws on a non-positive-integer rerun count: a typo'd env var or a
 *  missing/non-numeric `--rerun-n` value must fail loudly HERE, never
 *  reach `classifyFlakiness` as `NaN`/`0` — a zero-iteration replay
 *  loop would classify every deterministic candidate as "flaky" on an
 *  EMPTY observation list and silently unfile it. `--policy`'s value
 *  is returned as-is (no validation beyond string presence) —
 *  `resolvePolicyStrict` (Task 1) owns key validation. A present
 *  runId's FORMAT (IN-01) is validated unconditionally; an absent
 *  (`undefined`) runId is left for `scriptMain`'s own usage-message
 *  branch to handle. */
export function parseWrapupArgv(argv) {
  const runId = argv[0];
  if (runId !== undefined) {
    assertSafeRunId(runId);
  }

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

  const policyFlagIndex = argv.indexOf("--policy");
  const policyFlag = policyFlagIndex !== -1 ? argv[policyFlagIndex + 1] : undefined;

  return { runId, rerunN, queueJsonPath, policyFlag };
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
  const { runId, rerunN, queueJsonPath, policyFlag } = parsedArgs;

  if (!runId) {
    process.stderr.write(
      "Usage: npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id> "
        + "[--rerun-n <N>] [--queue-path <path>] [--policy <key>]\n",
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
  const reportFinalized = checkReportFinalized(report, runId);
  const flakyLogPath = join(runDir, "flaky-captures.jsonl");
  const stagedCaptures = Array.isArray(report.stagedCaptures) ? report.stagedCaptures : [];
  const policyKey = resolveWrapupPolicyKey({ policyFlag, manifestPath: report.manifestPath });

  const results = [];
  for (const staged of stagedCaptures) {
    // IN-05: hoisted BEFORE the try block and computed defensively
    // (via an optional chain) so a null/malformed `staged` element (a
    // hand-edited or corrupted run-report.json) can never throw a
    // SECOND time inside the catch block below — the pre-fix code
    // re-read this same field directly off `staged` again inside the
    // catch block's own error message/results.push, which escaped the
    // whole loop on a null `staged` (no wrapup-report.json written,
    // every remaining capture left unjudged). A non-string stagedPath
    // still safely becomes a stringified placeholder here rather than
    // ever throwing.
    const stagedPath = typeof staged?.stagedPath === "string" ? staged.stagedPath : String(staged?.stagedPath);
    // Per-capture error isolation: one deleted/corrupt staged file, an
    // absent stagedPath field, or one wrapUpCapture rejection (oracle
    // cold-spawn failure, a stale dist/ build failing harness creation)
    // must never zero out the whole run — every remaining capture still
    // gets judged and wrapup-report.json still gets written.
    try {
      const artifact = JSON.parse(readFileSync(stagedPath, "utf8"));
      const outcome = await wrapUpCapture(stagedPath, artifact, {
        queueJsonPath,
        flakyLogPath,
        n: rerunN,
        policyKey,
      });
      // D-03 (second half): a no-policy verdict keeps its
      // not-a-candidate classification (never auto-filed, never
      // reclassified as an error) — but it is surfaced loudly here,
      // never a quiet skip, per-capture AND in the run summary below.
      if (outcome.verdict?.orcl02?.kind === "no-policy") {
        process.stderr.write(
          `dogfood-wrapup: WARNING — no ORCL-02 policy resolved for ${stagedPath}; `
            + "cheat auto-filing was inactive for this capture.\n",
        );
      }
      results.push({ stagedPath, ...outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`dogfood-wrapup: failed to judge ${stagedPath}: ${message}\n`);
      results.push({
        stagedPath,
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
    policyKey: policyKey ?? null,
    // Fix-queue 0bc76d15c2fec8df: surfaced in the persisted summary
    // (never only as a transient stderr line) so a later, unattended
    // reader of wrapup-report.json can still tell this run's own exit
    // metadata was never recorded, without re-reading run-report.json
    // itself.
    reportFinalized,
    totalCaptures: results.length,
    filed: results.filter((r) => r.filed).length,
    flaky: results.filter((r) => r.classification === "flaky").length,
    replayInconclusive: results.filter((r) => r.classification === "replay-inconclusive").length,
    notACandidate: results.filter((r) => r.classification === "not-a-candidate").length,
    noPolicy: results.filter((r) => r.verdict?.orcl02?.kind === "no-policy").length,
    errors: results.filter((r) => r.classification === "error").length,
    results,
  };

  await writeFileAtomic(join(runDir, "wrapup-report.json"), JSON.stringify(summary, null, 2));

  process.stdout.write(
    `[dogfood-wrapup] run ${runId}: ${summary.totalCaptures} capture(s) judged — `
      + `${summary.filed} filed, ${summary.flaky} flaky, `
      + `${summary.replayInconclusive} replay-inconclusive, `
      + `${summary.notACandidate} not-a-candidate, ${summary.noPolicy} no-policy, `
      + `${summary.errors} error(s).`
      + `${reportFinalized ? "" : " [WARNING: run-report.json was not finalized -- proxy likely died hard]"}\n`,
  );

  if (summary.errors > 0) {
    // The report is complete, but at least one capture went unjudged —
    // surface that as a non-zero exit so a caller/CI can notice.
    process.exitCode = 1;
  }

  // D-12: the upload chain runs UNCONDITIONALLY, joined with the same
  // "always runs regardless of prior errors" semantics as a shell `;`
  // — never `&&`. This step must stay strictly AFTER the exit-code
  // branch above (never before or inside it) and must NEVER reassign
  // process.exitCode itself: chainUploadRun's own contract already
  // never throws, but this call site does not trust that alone
  // (belt-and-suspenders — mirrors promoteCapture's best-effort,
  // log-and-continue shape in scripts/dogfood/dogfood-run.mjs).
  try {
    await chainUploadRun(runId);
  } catch (err) {
    process.stderr.write(
      `dogfood-wrapup: upload chain step failed unexpectedly (continuing — fail-open): `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
