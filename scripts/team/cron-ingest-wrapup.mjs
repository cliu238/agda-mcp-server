// MIT License — see LICENSE
//
// TEAM-04 (Task 2): the unattended cron judge. Discovers archives
// staged by 07-03's ingest-server.mjs under
// `<storageDir>/<person>/<date>/<runId>.tar.gz`, extracts each one via
// Task 1's sandboxed scripts/team/archive-extract.mjs, and drives every
// staged capture through the SAME UNCHANGED oracle-triad + N-rerun
// flake-gate + queue-intake pipeline local dogfooding already uses
// (scripts/dogfood/dogfood-wrapup.mjs's own `wrapUpCapture`, imported
// directly — never re-invoked as a CLI, per ARCHITECTURE.md's
// import-not-reinvoke rule). policyKey is resolved from the archive's
// OWN recorded `taskManifestCorpora` (07-04's schema addition) via the
// SAME fuel-corpora.json lookup `resolveWrapupPolicyKey` already uses
// — NEVER re-derived from a `.agda-lib` inside the extracted scratch
// dir, which would silently repeat the W2/Pitfall-9 anti-pattern this
// milestone's backlog-digestion phase (Phase 6) exists to close.
//
// Idempotency (Pitfall 7's cheap early-dedup layer): every archive,
// once judged (successfully OR terminally failed), gets a sibling
// `<archive>.processed.json` marker written NEXT to it — 07-03's
// storage layout is keyed by person/date/runId and upload-run.mjs
// always reuses the SAME stable runId across retries of one run, so a
// retried upload of the same run lands at the SAME storage path and is
// skipped here BEFORE the expensive oracle triad ever runs again. This
// is cheaper and earlier than the existing fingerprint-based
// `upsertQueueEntry` dedup (scripts/queue/intake.mjs), which remains
// the correctness backstop it already was — this module never bypasses
// it, only avoids re-paying for judging an archive already resolved.
//
// Server-version skew (Pitfall 10): each capture's own recorded
// `manifest.serverVersion` is compared against this judge's own
// `getServerVersion()`. A mismatch NEVER invalidates or alters a
// verdict — it is recorded context, annotated onto the resulting queue
// entry's `notes` field (a metadata-only, non-recurrence-bumping
// `upsertQueueEntry` call, mirroring scripts/queue/mirror-github.mjs's
// own backlink-persistence precedent) and tallied in the run summary.
//
// Write-back (D-01/D-02): once at least one capture across the whole
// run was filed, the queue JSON is committed (and, absent --no-push,
// pushed) directly to the current branch — no PR-per-batch. Every real
// `git` invocation is `execFileSync`-argv-array + `shell:false`,
// modeled on scripts/queue/mirror-github.mjs's own gh-CLI shape (the
// closest prior art for "shell out to a VCS-adjacent CLI behind an
// explicit dry-run-style gate" — `git commit`/`git push` themselves
// have zero prior art anywhere else in this codebase).
//
// Run with: npx tsx scripts/team/cron-ingest-wrapup.mjs [--no-push]
//   [--rerun-n <N>] [--storage-dir <path>] [--queue-path <path>]
// (NOT plain `node` — this script's src/ + test/ imports use
// .js-suffixed specifiers pointing at sibling .ts files; Node's native
// TS type-stripping does not rewrite .js -> .ts. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file — see scripts/queue/intake.mjs's
// header for the same note.)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";

import { extractArchiveSafely } from "./archive-extract.mjs";
import { resolveTeamStorageDir } from "./ingest-server.mjs";
import { wrapUpCapture } from "../dogfood/dogfood-wrapup.mjs";
import { readQueueFile, upsertQueueEntry } from "../queue/intake.mjs";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
import { getServerVersion } from "../../src/server-version.js";
// Dual JSON-loader note (test/fixtures/fuel-corpora.ts's own header,
// repeated verbatim from dogfood-wrapup.mjs since this is the SAME
// import): this is the test-side typed constant resolved via tsx's
// .js -> .ts specifier mapping — NOT src/json-data.ts's runtime
// loadJsonData, which is a different loader entirely.
import { fuelCorpora } from "../../test/fixtures/fuel-corpora.js";

// ── discoverUnprocessedArchives ───────────────────────────────────────

/**
 * Walk `<storageDir>/<person>/<date>/*.tar.gz` three levels deep and
 * return every archive WITHOUT a sibling `<archive>.processed.json`
 * marker (Pitfall 7's cheap early-dedup layer — see header comment).
 * An absent `storageDir` degrades to `[]`, never throws — a cron tick
 * that fires before the FIRST upload ever lands must be a harmless
 * no-op. Non-directory entries at the person/date level (a stray
 * `.DS_Store`, say) are silently skipped rather than mis-walked.
 * Results are sorted by `archivePath` for deterministic ordering —
 * the plan places no ordering REQUIREMENT on this, but a stable order
 * makes cron logs and tests alike easier to reason about.
 */
export function discoverUnprocessedArchives(storageDir) {
  if (!existsSync(storageDir)) {
    return [];
  }

  const found = [];
  const personEntries = readdirSync(storageDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const personEntry of personEntries) {
    const personDir = join(storageDir, personEntry.name);
    const dateEntries = readdirSync(personDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const dateEntry of dateEntries) {
      const dateDir = join(personDir, dateEntry.name);
      const archiveEntries = readdirSync(dateDir, { withFileTypes: true }).filter(
        (entry) => entry.isFile() && entry.name.endsWith(".tar.gz"),
      );
      for (const archiveEntry of archiveEntries) {
        const archivePath = join(dateDir, archiveEntry.name);
        if (!existsSync(`${archivePath}.processed.json`)) {
          found.push({ archivePath, person: personEntry.name, date: dateEntry.name });
        }
      }
    }
  }

  return found.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
}

// ── resolveCronPolicyKey ──────────────────────────────────────────────

/**
 * POLICY-01/D-03's unattended-judge policy resolution: returns the
 * single fuel-corpora.json `policyKey` when `taskManifestCorpora` has
 * EXACTLY one entry that matches a known `fuelCorpora[].key` — mirrors
 * `resolveWrapupPolicyKey`'s own manifest-derived branch (b)
 * (scripts/dogfood/dogfood-wrapup.mjs), minus the `--policy` flag and
 * manifest-file branches that make no sense for an unattended,
 * upload-sourced judge with no human present to pass a flag. Returns
 * `undefined` for an empty array, a multi-value array, or an unknown
 * corpus key — NEVER guesses, NEVER throws, and NEVER falls back to a
 * `.agda-lib` name derivation (the W2/Pitfall-9 anti-pattern this
 * milestone exists to close).
 */
export function resolveCronPolicyKey(taskManifestCorpora) {
  const corpora = Array.isArray(taskManifestCorpora) ? [...new Set(taskManifestCorpora)] : [];
  if (corpora.length !== 1) {
    return undefined;
  }
  const entry = fuelCorpora.find((candidate) => candidate.key === corpora[0]);
  return entry?.policyKey;
}

// ── wrapCronUpsertQueueEntry ────────────────────────────────────────────

/**
 * CR-01 + WR-01: wraps the real upsertQueueEntry for the ONE call site
 * this exposes to wrapUpCapture's own internal filing path (threaded in
 * via config.deps when processArchive calls wrapUpFn, below — this
 * wrapper is NEVER applied to dogfood-wrapup.mjs's own shared local CLI
 * invocation, nor to scripts/queue/intake.mjs itself, so the local
 * human-driven wrapup path keeps its current semantics unchanged).
 * Applies two cron-path-only corrections before ever delegating to the
 * real upsert:
 *
 *  (1) WR-01: rewrites a filing candidate's capturePath/verdictPath away
 *      from the EPHEMERAL per-run scratchDir path (already unlinked by
 *      extracted.cleanup() by the time anyone reads the queue — the
 *      project's own fix-queue.json fingerprint 2eb1768df88bfb07 records
 *      a maintainer having to hand-patch exactly this once) to the
 *      STABLE `<archivePath>::captures/<basename>` reference: the
 *      archive's own permanent on-disk location (this function's caller
 *      never deletes it) plus the in-archive-relative path.
 *
 *  (2) CR-01: refuses to let an automated, unattended write-back touch
 *      ANY existing entry a human has already looked at — the fix-queue
 *      status enum (test/fixtures/fix-queue.ts) has exactly ONE value
 *      ("new") that means "never yet touched by a human"; every other
 *      value (triaged/fixing/locked/rejected) means a human review has
 *      already happened (this project's own Phase-4 checkpoint —
 *      dogfood-wrapup.mjs's header: "new -> triaged" IS the human
 *      review point), so ALL four are equally protected, not just the
 *      two terminal ones. Iteration 2's re-review reproduced the
 *      narrower locked/rejected-only guard being bypassed end to end
 *      against a "triaged" entry: a colliding, attacker-influenced
 *      dedup.fingerprint silently reverted its status back to "new",
 *      wiped its triageClass, and overwrote its title/summary/
 *      capturePath/verdictPath — publicly-visible fingerprints (this
 *      queue's own tracked JSON) make any post-"new" entry equally
 *      targetable by anyone holding a valid upload key. A collision
 *      against a protected entry is NEVER a silent skip and NEVER a
 *      silent overwrite: it is refused with a loud stderr warning, the
 *      existing entry is left completely untouched except for one new
 *      evidence note appended to its own `notes` field (a metadata-only
 *      upsertQueueEntry call, bumpRecurrence:false — the SAME
 *      annotation idiom this module already uses for its version-skew
 *      note below), and `conflictState.conflict` is flipped so
 *      processArchive's own per-capture result records
 *      classification:"terminal-conflict" instead of a genuine filing —
 *      surfaced in the run summary via summarizeArchiveResults, never
 *      silently reported as `filed`. The frozen fix-queue schema gains
 *      no new status value, only a free-text annotation the schema
 *      already allows.
 */
function wrapCronUpsertQueueEntry(realUpsertFn, { queueJsonPath, stableCapturePath, stableVerdictPath, conflictState }) {
  return async (entryData, targetQueueJsonPath, options) => {
    const effectiveQueueJsonPath = targetQueueJsonPath ?? queueJsonPath;
    // Only a FULL filing candidate carries capturePath/verdictPath (the
    // metadata-only version-skew annotation below never does) — rewrite
    // those two fields to the stable reference before anything else.
    const isFilingCall = entryData.capturePath !== undefined || entryData.verdictPath !== undefined;
    const rewritten = isFilingCall
      ? { ...entryData, capturePath: stableCapturePath, verdictPath: stableVerdictPath }
      : entryData;

    const existing = readQueueFile(effectiveQueueJsonPath).find((entry) => entry.fingerprint === rewritten.fingerprint);
    // CR-01 (iteration 2 residual): this used to check ONLY
    // existing?.status === "locked" || "rejected", which left
    // "triaged"/"fixing" entries — currently under ACTIVE human
    // review — completely unprotected against the identical attack
    // (reproduced end to end by the re-review: a colliding fingerprint
    // silently reverted a "triaged" entry to "new", wiped triageClass,
    // and overwrote title/summary/capturePath/verdictPath, reported as
    // a genuine filed:true rather than even being flagged as a
    // conflict). The fix-queue's own status enum
    // (test/fixtures/fix-queue.ts) has exactly ONE value ("new") that
    // means "never yet touched by a human" — every other value means a
    // human has already looked at this entry, so the correct guard is
    // "protect everything except new", not an enumerated allow-list of
    // terminal statuses.
    //
    // Gated on isFilingCall alone — NOT on whether the incoming status
    // happens to literally differ from the existing one: the ONE real
    // caller of this wrapped function (wrapUpCapture's own filing call,
    // ALWAYS capturePath-bearing and ALWAYS status:"new" per
    // buildQueueEntryFromVerdict) can never legitimately need to write
    // over a protected entry at all, so ANY filing collision against
    // one is refused — never only the subset whose incoming status
    // happens to differ, which would otherwise leave a field-only
    // overwrite (title/summary/capturePath/verdictPath, same status)
    // unprotected.
    const isProtected = existing !== undefined && existing.status !== "new";
    const attemptsRegression = isProtected && isFilingCall;

    if (attemptsRegression) {
      process.stderr.write(
        `cron-ingest-wrapup: SECURITY WARNING — refusing to write fix-queue entry ${rewritten.fingerprint} `
          + `(currently "${existing.status}") via an unattended cron write-back; a colliding `
          + "dedup.fingerprint from an untrusted archive must never silently regress an entry a human has "
          + "already triaged, started fixing, locked, or rejected. The existing entry is left unchanged; "
          + "this conflict is recorded on it and counted in the run summary instead.\n",
      );
      await realUpsertFn(
        {
          fingerprint: rewritten.fingerprint,
          notes: `${existing.notes ? `${existing.notes} ` : ""}CONFLICT ${new Date().toISOString()}: an `
            + `unattended cron write-back (candidate capturePath ${rewritten.capturePath ?? "n/a"}) attempted to `
            + `write over this "${existing.status}" entry (candidate status "${rewritten.status}") via a `
            + "colliding dedup.fingerprint; the attempt was refused and this entry's own fields were left "
            + "untouched.",
        },
        effectiveQueueJsonPath,
        { bumpRecurrence: false },
      );
      if (conflictState) {
        conflictState.conflict = true;
      }
      return { ...existing };
    }

    return realUpsertFn(rewritten, effectiveQueueJsonPath, options);
  };
}

// ── processArchive ────────────────────────────────────────────────────

/**
 * Judge one discovered archive end to end: sandboxed extraction (Task
 * 1) -> policy resolution -> per-staged-capture `wrapUpCapture` (the
 * UNCHANGED Phase-5 pipeline) -> a `.processed.json` sidecar marking
 * the archive done (success OR terminal failure alike, so a
 * permanently-broken archive is never retried forever). `config`
 * carries `{queueJsonPath, flakyLogPath, rerunN, deps}`; `deps`
 * overrides `extractArchiveSafely`/`wrapUpCapture`/`upsertQueueEntry`
 * (the SAME `options.deps` DI convention this codebase uses
 * throughout), used by this module's own tests to inject fakes with
 * zero real Agda/tar/subprocess cost.
 *
 * @returns {Promise<{archivePath: string, runId?: string, error?: string, results: object[]}>}
 */
export async function processArchive({ archivePath }, config = {}) {
  const extractFn = config.deps?.extractArchiveSafely ?? extractArchiveSafely;
  const wrapUpFn = config.deps?.wrapUpCapture ?? wrapUpCapture;
  const upsertFn = config.deps?.upsertQueueEntry ?? upsertQueueEntry;

  const extracted = await extractFn(archivePath);
  if (!extracted.ok) {
    await writeFileAtomic(
      `${archivePath}.processed.json`,
      JSON.stringify({ processedAt: new Date().toISOString(), ok: false, reason: extracted.reason }, null, 2),
    );
    return { archivePath, error: extracted.reason, results: [] };
  }

  try {
    const runsDir = join(extracted.scratchDir, "runs");
    const runIds = existsSync(runsDir) ? readdirSync(runsDir) : [];
    if (runIds.length !== 1) {
      await writeFileAtomic(
        `${archivePath}.processed.json`,
        JSON.stringify(
          { processedAt: new Date().toISOString(), ok: false, reason: "unexpected-run-count", runCount: runIds.length },
          null,
          2,
        ),
      );
      return { archivePath, error: "unexpected-run-count", results: [] };
    }

    const [runId] = runIds;
    const reportPath = join(runsDir, runId, "run-report.json");
    // CR-02: this read/parse used to be unguarded — a missing or
    // malformed run-report.json (a truncated/corrupt upload, or the
    // single entry under runs/ not actually containing one) threw
    // straight out of processArchive with NO .processed.json marker
    // ever written (every other branch in this function writes one
    // either before or after this line; none of them run once this
    // specific throw fires). discoverUnprocessedArchives treats "no
    // marker" as "not yet processed", so the exact same archive was
    // re-discovered and fully re-extracted (sandboxed tar -x,
    // mid-extraction polling, post-extraction realpath walk) on EVERY
    // subsequent cron tick, forever — directly contradicting this
    // function's own documented "never retried forever" contract.
    // Treating a parse failure as a terminal, marked failure (like
    // every sibling branch above/below it) closes that gap.
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch (err) {
      await writeFileAtomic(
        `${archivePath}.processed.json`,
        JSON.stringify(
          {
            processedAt: new Date().toISOString(),
            ok: false,
            reason: "malformed-run-report",
            detail: err instanceof Error ? err.message : String(err),
          },
          null,
          2,
        ),
      );
      return { archivePath, error: "malformed-run-report", results: [] };
    }

    const corpora = Array.isArray(report.taskManifestCorpora) ? [...new Set(report.taskManifestCorpora)] : [];
    const policyKey = resolveCronPolicyKey(report.taskManifestCorpora);

    // SECURITY: a corpus-bearing bundle (the run's own manifest DID
    // declare at least one corpus) whose policy key cannot be resolved
    // must never silently fall through to judgeOrcl02's own
    // .agda-lib-derived default — an extracted scratch dir has no
    // meaningful .agda-lib of its own, and silently degrading here
    // would repeat the exact W2/Pitfall-9 anti-pattern this plan
    // exists to close (T-07-22). Loud error, never silent — the same
    // "loud, never silent" discipline D-03 already established for an
    // explicitly-requested-but-unresolvable key, applied here at this
    // NEW call site for the "declared-but-unmappable" case that
    // discipline didn't originally have to cover. A bundle with NO
    // declared corpus at all is a different, legitimate case: it flows
    // through below with policyKey undefined and is honestly reported
    // by the oracle itself as an abstention ("no-policy"/"no-target"),
    // counted in the run summary's abstention rate, never as an error.
    if (corpora.length > 0 && policyKey === undefined) {
      await writeFileAtomic(
        `${archivePath}.processed.json`,
        JSON.stringify(
          { processedAt: new Date().toISOString(), ok: false, reason: "unresolvable-policy-key", corpora },
          null,
          2,
        ),
      );
      return { archivePath, error: "unresolvable-policy-key", results: [] };
    }

    const judgeVersion = getServerVersion();
    const results = [];
    for (const staged of Array.isArray(report.stagedCaptures) ? report.stagedCaptures : []) {
      // NEVER the original (uploader-machine-only) absolute
      // stagedPath — captures live at a fixed, top-level `captures/`
      // dir under the extracted root regardless of where they were
      // staged on the uploader's own machine.
      const artifactPath = join(extracted.scratchDir, "captures", basename(staged.stagedPath));
      try {
        const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

        // Pitfall 10 / checker finding 3: record — never gate on — a
        // server-version mismatch between capture time and judge time.
        // Skew NEVER invalidates a verdict; it is recorded context,
        // annotated onto the queue entry only once a verdict actually
        // files one (below).
        const capturedVersion = artifact?.manifest?.serverVersion;
        const versionSkew = typeof capturedVersion === "string" && capturedVersion !== judgeVersion;

        // WR-01: the STABLE reference persisted into the queue entry if
        // this capture is filed — the archive's own permanent on-disk
        // location (never deleted by this function's own
        // extracted.cleanup()) plus the in-archive-relative
        // captures/<basename> path, NEVER the ephemeral artifactPath
        // above (which points inside a scratchDir this same function
        // deletes before it even returns to its own caller).
        // verdictPath mirrors buildQueueEntryFromVerdict's OWN
        // suffix-replace formula (dogfood-wrapup.mjs) so a cron-derived
        // entry's path pair uses the exact same naming shape as a
        // local-wrapup-derived one, rather than a double ".json.verdict.json".
        const stableCapturePath = `${archivePath}::captures/${basename(staged.stagedPath)}`;
        const stableVerdictPath = stableCapturePath.endsWith(".json")
          ? `${stableCapturePath.slice(0, -".json".length)}.verdict.json`
          : `${stableCapturePath}.verdict.json`;
        // CR-01: flipped by wrapCronUpsertQueueEntry when this specific
        // capture's filing attempt collided with an existing
        // locked/rejected entry and was refused rather than applied.
        const conflictState = { conflict: false };

        const outcome = await wrapUpFn(artifactPath, artifact, {
          queueJsonPath: config.queueJsonPath,
          flakyLogPath: config.flakyLogPath,
          n: config.rerunN ?? 3,
          policyKey,
          deps: {
            ...config.deps,
            upsertQueueEntry: wrapCronUpsertQueueEntry(config.deps?.upsertQueueEntry ?? upsertQueueEntry, {
              queueJsonPath: config.queueJsonPath,
              stableCapturePath,
              stableVerdictPath,
              conflictState,
            }),
          },
        });

        if (versionSkew && outcome.filed && !conflictState.conflict) {
          // Metadata-only annotation — mirrors mirror-github.mjs's own
          // backlink-persistence precedent (bumpRecurrence:false):
          // never bumps recurrence, never re-derives any other field,
          // just appends the skew note onto the entry wrapUpCapture's
          // OWN internal upsertQueueEntry call already filed under
          // this fingerprint. Skipped entirely on a terminal conflict —
          // annotating a version-skew note onto an entry whose filing
          // was just REFUSED would be confusing noise on top of the
          // conflict note above, not a genuine re-judged skew.
          await upsertFn(
            {
              fingerprint: artifact.dedup.fingerprint,
              notes: `version-skew: captured=${capturedVersion} judged=${judgeVersion}`,
            },
            config.queueJsonPath,
            { bumpRecurrence: false },
          );
        }

        results.push({
          artifactPath,
          versionSkew,
          ...outcome,
          // CR-01: a refused terminal-entry collision is never reported
          // as a genuine filing, regardless of what wrapUpCapture's own
          // outcome.filed said (it has no visibility into the refusal).
          ...(conflictState.conflict ? { filed: false, classification: "terminal-conflict" } : {}),
        });
      } catch (err) {
        results.push({
          artifactPath,
          versionSkew: false,
          filed: false,
          classification: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await writeFileAtomic(
      `${archivePath}.processed.json`,
      JSON.stringify({ processedAt: new Date().toISOString(), ok: true, runId, results }, null, 2),
    );
    return { archivePath, runId, results };
  } finally {
    extracted.cleanup();
  }
}

// ── writeBackQueue ─────────────────────────────────────────────────────

/**
 * D-01/D-02's automated write-back: once `filedCount > 0`, commit the
 * queue JSON and (absent `noPush`) push directly to the current
 * branch — no PR-per-batch. `filedCount <= 0` (nothing changed this
 * run) short-circuits BEFORE any subprocess call — the same
 * "return-before-any-subprocess-call" shape
 * scripts/queue/mirror-github.mjs's own dry-run gate uses. Every real
 * `git` call is `execFileSync`-argv-array + `shell:false`, gated
 * behind `options.deps?.execFileSync` for zero-real-git-cost testing.
 * A thrown error from any of the three git calls is caught and
 * surfaced in the returned result object rather than propagating —
 * scriptMain must never crash because "nothing to commit" or a
 * detached-HEAD push failure occurred.
 */
export function writeBackQueue({ queueJsonPath, noPush, filedCount, deps } = {}) {
  if (!filedCount || filedCount <= 0) {
    return { committed: false, skipped: "nothing-to-commit" };
  }

  const execFile = deps?.execFileSync ?? execFileSync;
  const relQueuePath = relative(SERVER_REPO_ROOT, queueJsonPath);
  if (relQueuePath.startsWith("..")) {
    // General, no-special-casing guard: a caller (typically a test)
    // pointing queueJsonPath outside SERVER_REPO_ROOT must never
    // reach `git add` with a path git itself would reject anyway.
    return { committed: false, skipped: "queue-path-outside-repo" };
  }

  // WR-02: `committed` is tracked independently of `pushed` — a `git
  // push` failure (network down, diverged remote, auth issue) used to
  // be caught by the SAME block wrapping `add`+`commit`, so this
  // function reported `{committed:false, ...}` even though `git commit`
  // had already succeeded and a real commit now sat in the local repo.
  // That understated the persisted run summary/stdout digest AND made
  // the NEXT cron run attempt `git commit` again on a queue file that
  // may no longer have any uncommitted changes. `committed` is now
  // flipped to `true` the moment the commit call itself succeeds,
  // BEFORE the push is ever attempted.
  let committed = false;
  try {
    execFile("git", ["add", relQueuePath], { cwd: SERVER_REPO_ROOT, shell: false });
    execFile(
      "git",
      ["commit", "-m", `queue(team-cron): intake ${filedCount} confirmed finding(s) from unattended cron judge`],
      { cwd: SERVER_REPO_ROOT, shell: false },
    );
    committed = true;
    if (!noPush) {
      execFile("git", ["push"], { cwd: SERVER_REPO_ROOT, shell: false });
      return { committed: true, pushed: true };
    }
    return { committed: true, pushed: false };
  } catch (err) {
    return { committed, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── summarizeArchiveResults ────────────────────────────────────────────

/**
 * Pure aggregation (no I/O): flattens every archive's own `results[]`
 * into one array and computes the run-level counts TEAM-04 requires —
 * mirroring dogfood-wrapup.mjs's own summary-with-counts shape
 * (totalCaptures/filed/flaky/replayInconclusive/notACandidate/errors),
 * PLUS the abstention rate and version-skew count this plan
 * additionally requires, PLUS `archiveErrors` (a count `errors` alone
 * would silently miss, since an archive-level failure — extraction
 * rejected, a malformed run report, an unresolvable corpus-bearing
 * policy key — never contributes a per-capture result row at all, so
 * it would otherwise vanish from every per-capture tally above).
 *
 * Exported as its own pure function — rather than inlined into
 * scriptMain — specifically so this arithmetic (the abstention-rate
 * computation is a first-class, explicitly-required TEAM-04 behavior)
 * is independently unit-testable without invoking scriptMain's own CLI
 * glue, which has a real, non-test-configurable side effect
 * (persisting the run summary under this repo's own
 * `.agda-mcp/team/cron-runs/`) that a unit test must never trigger.
 */
export function summarizeArchiveResults(totalArchives, allResults) {
  const flattened = allResults.flatMap((archiveResult) =>
    Array.isArray(archiveResult.results) ? archiveResult.results : [],
  );
  const totalCaptures = flattened.length;
  const abstained = flattened.filter(
    (r) =>
      r.verdict?.orcl01?.kind === "inconclusive"
      || r.verdict?.orcl02?.kind === "no-policy"
      || r.verdict?.orcl02?.kind === "no-target",
  ).length;

  return {
    totalArchives,
    totalCaptures,
    filed: flattened.filter((r) => r.filed).length,
    flaky: flattened.filter((r) => r.classification === "flaky").length,
    replayInconclusive: flattened.filter((r) => r.classification === "replay-inconclusive").length,
    notACandidate: flattened.filter((r) => r.classification === "not-a-candidate").length,
    errors: flattened.filter((r) => r.classification === "error").length,
    archiveErrors: allResults.filter((r) => r.error).length,
    abstained,
    abstentionRate: totalCaptures > 0 ? abstained / totalCaptures : 0,
    versionSkews: flattened.filter((r) => r.versionSkew).length,
    // CR-01: a fingerprint collision against a terminal (locked/rejected)
    // entry that this run's write-back guard refused — never silently
    // folded into `filed` or `notACandidate`, always its own tallied,
    // loud count.
    terminalConflicts: flattened.filter((r) => r.classification === "terminal-conflict").length,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * Extracts `--no-push` / `--rerun-n <N>` / `--storage-dir <path>` /
 * `--queue-path <path>` from a flat `--flag value` argv array —
 * mirrors dogfood-wrapup.mjs's own (private) parseWrapupArgv shape:
 * flat indexOf lookups, flag wins over env, positive-integer-or-throw
 * for --rerun-n (never let a typo'd flag reach classifyFlakiness as
 * NaN/0 downstream inside wrapUpCapture, which would classify every
 * deterministic candidate as flaky on an EMPTY observation list).
 */
function parseCronArgv(argv) {
  const noPush = argv.includes("--no-push");

  const rerunNFlagIndex = argv.indexOf("--rerun-n");
  const rerunNRaw =
    rerunNFlagIndex !== -1 ? argv[rerunNFlagIndex + 1] : (process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? "3");
  const rerunN = Number(rerunNRaw);
  if (!Number.isInteger(rerunN) || rerunN < 1) {
    throw new Error(`--rerun-n / AGDA_MCP_DOGFOOD_RERUN_N must be a positive integer, got "${rerunNRaw}"`);
  }

  const storageDirFlagIndex = argv.indexOf("--storage-dir");
  const storageDir = storageDirFlagIndex !== -1 ? argv[storageDirFlagIndex + 1] : resolveTeamStorageDir();

  const queuePathFlagIndex = argv.indexOf("--queue-path");
  const queueJsonPath =
    queuePathFlagIndex !== -1 ? argv[queuePathFlagIndex + 1] : join(SERVER_REPO_ROOT, "test/fixtures/fix-queue.json");

  return { noPush, rerunN, storageDir, queueJsonPath };
}

/**
 * CLI entry point: discover every unprocessed archive, judge each in
 * turn (per-archive error isolation — one wedged/corrupt archive must
 * never zero out the rest of the run), aggregate a run summary
 * (mirroring dogfood-wrapup.mjs's own summary-with-counts shape,
 * renamed for archives, PLUS the abstention rate and version-skew
 * count TEAM-04 additionally requires), write back the queue (D-01),
 * persist the summary to `.agda-mcp/team/cron-runs/<timestamp>.json`,
 * and print a one-line digest to stdout — no human is otherwise
 * watching an unattended cron run (Pitfall 8).
 *
 * `options.deps` (optional, second argument) is forwarded verbatim to
 * every `processArchive` call and to `writeBackQueue` — the same
 * single-bag `deps` shape both of those functions already read
 * specific keys from (`extractArchiveSafely`/`wrapUpCapture`/
 * `upsertQueueEntry`/`execFileSync`). This lets this module's own
 * tests exercise the FULL discover -> judge -> write-back pipeline
 * with zero real Agda/tar/git/subprocess cost, without this CLI entry
 * point's default (real) behavior changing in any way when `options`
 * is omitted.
 */
export async function scriptMain(argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseCronArgv(argv);
  } catch (err) {
    process.stderr.write(`cron-ingest-wrapup: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }
  const { noPush, rerunN, storageDir, queueJsonPath } = parsed;

  const discoveredArchives = discoverUnprocessedArchives(storageDir);
  const allResults = [];
  for (const info of discoveredArchives) {
    try {
      const outcome = await processArchive(info, {
        queueJsonPath,
        flakyLogPath: join(SERVER_REPO_ROOT, ".agda-mcp", "team", "cron-flaky.jsonl"),
        rerunN,
        deps: options.deps,
      });
      allResults.push(outcome);
    } catch (err) {
      allResults.push({
        archivePath: info.archivePath,
        error: err instanceof Error ? err.message : String(err),
        results: [],
      });
    }
  }

  const stats = summarizeArchiveResults(discoveredArchives.length, allResults);
  const writeBack = writeBackQueue({ queueJsonPath, noPush, filedCount: stats.filed, deps: options.deps });

  const summary = { ...stats, writeBack, archiveResults: allResults };

  const summaryDir = join(SERVER_REPO_ROOT, ".agda-mcp", "team", "cron-runs");
  mkdirSync(summaryDir, { recursive: true });
  const summaryPath = join(summaryDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFileAtomic(summaryPath, JSON.stringify(summary, null, 2));

  process.stdout.write(
    `[cron-ingest-wrapup] processed ${summary.totalArchives} archive(s), ${summary.totalCaptures} capture(s) — `
      + `${summary.filed} filed, ${summary.abstained} abstained (${(summary.abstentionRate * 100).toFixed(1)}%), `
      + `${summary.terminalConflicts} terminal-conflict(s), ${summary.errors} error(s).\n`,
  );

  if (summary.errors > 0 || summary.archiveErrors > 0 || summary.terminalConflicts > 0) {
    // The summary is complete, but at least one capture or archive went
    // unjudged, OR a fingerprint collision against a terminal entry was
    // refused (CR-01) — surface that as a non-zero exit so a cron
    // wrapper/CI can notice (mirrors dogfood-wrapup.mjs's own
    // convention, extended to cover this module's own archive-level and
    // security-relevant failure modes it alone can produce).
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
