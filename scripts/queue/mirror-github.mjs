// MIT License — see LICENSE
//
// QUEUE-04's GitHub Issues mirror (D-11/D-12/D-13): a ONE-WAY, optional,
// non-authoritative publisher of fix-queue entries to this repo's
// public GitHub issue tracker. The flat file
// (test/fixtures/fix-queue.json) is ALWAYS the source of truth — this
// script never reads issue state back to influence local status
// (T-04-04-03).
//
// Dry-run by default (T-04-04-04): mirrorEntry only ever shells out to
// `gh` when the caller passes options.execute === true (or the CLI is
// invoked with the literal --execute flag). Every real `gh` invocation
// uses execFileSync with an argv array and shell: false — never a
// shell-string subprocess call — mirroring src/index.ts's own
// documented CWE-78-prevention convention (see that file's SECURITY
// comment above its own execFileSync call).
//
// Idempotent one-way upsert (D-12, RESEARCH.md Pitfall 2): a
// pre-existing entry.githubIssue OR a pre-existing entry.issue[]
// number (e.g. the flagship's already-open [64, 61]) both count as
// "already linked" and route to `gh issue edit`, never `gh issue
// create` — this repo's issue tracker must never accumulate a
// duplicate issue for the same defect. On a real --execute run,
// scriptMain persists the created-or-newly-linked githubIssue back
// onto the entry via scripts/queue/intake.mjs's upsertQueueEntry, so a
// SECOND run against the same entry finds the backlink already stored
// and also routes to edit.
//
// D-11's payload whitelist: buildMirrorPayload reads ONLY six fields
// (title/summary/fingerprint/defectKind/triageClass/status) — capture
// bundle content (capturePath/verdictPath/notes) may reference a
// private-corpus source and must never leak into this public tracker.
//
// Run with: npx tsx scripts/queue/mirror-github.mjs [--execute]
// (NOT plain `node` — this script's test/ + src/ imports use
// .js-suffixed specifiers pointing at sibling .ts files; see
// scripts/queue/intake.mjs's header for the full explanation. `node
// --check` for a pure syntax check works fine either way.)

import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";

import { fixQueue } from "../../test/fixtures/fix-queue.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
import { upsertQueueEntry } from "./intake.mjs";

/**
 * Best-effort, never-throwing probe for "is `gh` installed AND
 * authenticated". Absence of the binary, a non-zero exit, or a missing
 * login all degrade to `false` — the mirror must never treat a broken
 * local `gh` setup as a hard error (T-04-04-SC): the flat file remains
 * authoritative regardless of gh's availability.
 */
export function isGhAvailable(options = {}) {
  const execFile = options.deps?.execFileSync ?? execFileSync;
  try {
    execFile("gh", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      shell: false,
    });
    execFile("gh", ["auth", "status"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      shell: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * D-11's fixed field whitelist: EXACTLY these six keys, nothing else.
 * capturePath/verdictPath/notes (and any future entry field) are
 * deliberately never read here — this repo's issue tracker is public
 * and a captured bug bundle may reference a private-corpus source
 * (CHG / autoformalizing-hopf are access-gated).
 */
export function buildMirrorPayload(entry) {
  return {
    title: entry.title,
    summary: entry.summary,
    fingerprint: entry.fingerprint,
    defectKind: entry.defectKind,
    triageClass: entry.triageClass,
    status: entry.status,
  };
}

/**
 * Render a D-11-whitelisted payload into a short markdown issue body
 * via plain string concatenation — never JSON.stringify the whole
 * payload (let alone the whole entry). Reading only `payload`'s own
 * fields means a future unwhitelisted field added to FixQueueEntry can
 * never leak into a rendered issue body just because this function
 * forgot to exclude it.
 */
function renderIssueBody(payload) {
  return [
    `# ${payload.title}`,
    "",
    payload.summary,
    "",
    `**Fingerprint:** \`${payload.fingerprint}\``,
    `**Defect Kind:** ${payload.defectKind}`,
    `**Triage Class:** ${payload.triageClass ?? "(none)"}`,
    `**Status:** ${payload.status}`,
  ].join("\n");
}

/**
 * D-13: only entries at `triaged` or later are ever mirrored — raw
 * `new` intake is never auto-published. `rejected` entries ARE
 * eligible (this plan's resolution of D-13's own stated discretion
 * point): an already-mirrored entry that later transitions to
 * `rejected` must still be reconcilable/closable on GitHub, never left
 * stale (RESEARCH.md Pitfall 2).
 */
export function isEntryMirrorEligible(entry) {
  return entry.status !== "new";
}

/**
 * The core one-way upsert (D-12). Dry-run by default — `options.execute`
 * must be the literal boolean `true` for this function to ever call
 * execFileSync; every other input (including a caller that forgets to
 * set it) takes the safe dry-run path below, which returns before any
 * subprocess call is made. `linkedIssue` is computed ONCE, immediately
 * after the eligibility check, and reused by both the dry-run and
 * execute branches: a pre-existing `entry.issue[]` number (e.g. the
 * flagship's already-open [64, 61]) counts as already-linked exactly
 * like a mirror-assigned `entry.githubIssue`, so it is NEVER
 * re-created via `gh issue create`, only updated via `gh issue edit`
 * (RESEARCH.md Pitfall 2).
 */
export function mirrorEntry(entry, options = {}) {
  const execFile = options.deps?.execFileSync ?? execFileSync;

  if (!isEntryMirrorEligible(entry)) {
    return { skipped: true, reason: "not-eligible-status" };
  }

  const payload = buildMirrorPayload(entry);
  const body = renderIssueBody(payload);
  const linkedIssue = entry.githubIssue ?? entry.issue?.[0];

  if (options.execute !== true) {
    // The critical autonomous-safety branch: no execFileSync call has
    // happened, or will happen, anywhere above this line — this is
    // what makes the default (no options, or options without
    // execute: true) behavior safe to run unattended.
    return {
      skipped: true,
      reason: "dry-run",
      wouldCreateOrUpdate: linkedIssue ? "update" : "create",
      payload,
      body,
    };
  }

  if (!isGhAvailable(options)) {
    return { skipped: true, reason: "gh-unavailable" };
  }

  if (linkedIssue) {
    // Idempotent UPDATE (D-12) — never a second `create` for an entry
    // that already has EITHER a mirror-assigned backlink OR a
    // pre-existing known issue number.
    execFile("gh", ["issue", "edit", String(linkedIssue), "--body", body], {
      encoding: "utf8",
      timeout: 15000,
      shell: false,
    });
    return { updated: true, githubIssue: linkedIssue };
  }

  const stdout = execFile("gh", ["issue", "create", "--title", entry.title, "--body", body], {
    encoding: "utf8",
    timeout: 15000,
    shell: false,
  });
  const trimmed = String(stdout).trim();
  const match = /\/issues\/(\d+)\s*$/.exec(trimmed);
  if (!match) {
    // `gh issue create` has no --json flag; if we cannot parse the
    // printed URL we must never guess an issue number — throw loudly
    // instead of silently misassigning the backlink.
    throw new Error(
      `mirrorEntry: could not parse an issue number from "gh issue create" output: ${JSON.stringify(trimmed)}`,
    );
  }
  return { created: true, githubIssue: Number(match[1]) };
}

// ── CLI ──────────────────────────────────────────────────────────────

function summarizeResult(entry, result) {
  if (result.skipped) {
    return `${entry.fingerprint}: skipped (${result.reason})`;
  }
  if (result.created) {
    return `${entry.fingerprint}: created issue #${result.githubIssue}`;
  }
  return `${entry.fingerprint}: updated issue #${result.githubIssue}`;
}

/**
 * CLI entry point. Mirrors every entry in the real fixQueue, defaulting
 * to the dry-run path unless the literal `--execute` flag is present in
 * `argv`. On a real --execute run, persists mirrorEntry's
 * created-or-newly-linked githubIssue back onto the entry via
 * upsertQueueEntry (D-12) — the dry-run path never calls
 * upsertQueueEntry and never writes the queue file, full stop.
 */
export async function scriptMain(argv = process.argv.slice(2)) {
  const execute = argv.includes("--execute");
  const queueJsonPath = join(SERVER_REPO_ROOT, "test", "fixtures", "fix-queue.json");

  if (!execute) {
    process.stdout.write("DRY RUN (no GitHub calls made) - pass --execute to publish\n");
  }

  for (const entry of fixQueue) {
    const result = mirrorEntry(entry, { execute });

    if (
      execute &&
      !result.skipped &&
      (result.created === true || (result.updated === true && result.githubIssue !== entry.githubIssue))
    ) {
      await upsertQueueEntry({ ...entry, githubIssue: result.githubIssue }, queueJsonPath);
    }

    process.stdout.write(`${summarizeResult(entry, result)}\n`);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
