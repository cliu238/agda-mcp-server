---
phase: 07-team-feedback-channel-local-wiring
reviewed: 2026-07-04T18:15:00Z
depth: standard
iteration: 2
files_reviewed: 6
files_reviewed_list:
  - scripts/team/cron-ingest-wrapup.mjs
  - scripts/dogfood/upload-run.mjs
  - scripts/team/archive-extract.mjs
  - scripts/dogfood/agent-log-selection.mjs
  - scripts/dogfood/dogfood-run.mjs
  - scripts/dogfood/dogfood-wrapup.mjs
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-07-04T18:15:00Z
**Depth:** standard (re-review, iteration 2 — adjudicating fix commits e10cf57, 6662cdc, f55c41b, b8f8c84, e39ec41, 6f256b5, 9e0405f, abe78b4, 58f0f8b against the 9 findings from iteration 1)
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This is a re-review of the fix pass applied to iteration 1's findings. Every one of the 9 fix commits was traced against its actual `git show` diff (not the fixer's own report) and, wherever runtime behavior was in question, verified empirically: by running the affected test files (repeatedly, for the signal-timing-sensitive ones), by direct invocation of exported pure functions with hand-picked adversarial inputs, and — for the two most consequential questions — by writing independent reproduction scripts against the real `processArchive`/`computeProxyExitCode` functions rather than trusting either the original review's prose or the fix report's narrative.

**8 of the 9 findings hold up as genuinely and completely fixed:** CR-02, WR-01, WR-02, WR-04, WR-05, and WR-06 are straightforward, correctly-scoped fixes, each verified via diff + a green test run. WR-03's general concurrent read-modify-write race is also correctly closed for the common case (verified via its own concurrency tests). WR-07's disputed test-expectation change was adjudicated as **correct, not a regression** — the old `(null, null, false, true) => 0` expectation was *literally the false-negative the original review reported*, and the new `=> 1` is exactly the fix the review asked for; this was independently confirmed against the commit's own diff and re-derivation of the pre-fix formula.

**CR-01 — the highest-severity finding from iteration 1 — is only partially fixed and remains OPEN.** The fix (`wrapCronUpsertQueueEntry`) correctly refuses a colliding-fingerprint takeover of a `locked`/`rejected` fix-queue entry, exactly as its commit title promises, and this is verified by both the existing regression tests and this review's own reproduction. However, the guard checks only `status === "locked" || status === "rejected"` — entries in `triaged` or `fixing` status (the *active, in-progress* human-review states this project's own design relies on as its Phase-4 review checkpoint — see `dogfood-wrapup.mjs`'s own header: "Phase 4 already placed the human review point INSIDE the queue itself (new -> triaged)") remain **completely unprotected against the identical attack**. This review independently reproduced it end to end: a crafted archive colliding with a human-triaged entry's fingerprint silently reverts its status to `"new"`, wipes its `triageClass` to `null`, and overwrites its title/summary/capturePath/verdictPath with attacker/oracle-derived text — reported as a genuine `filed: true` (not even flagged as a conflict) — which is exactly the shape of write that `writeBackQueue` auto-commits and auto-pushes with zero human review. This is the same BLOCKER, just incompletely scoped by status value.

This iteration's fixes also introduce three new, narrower issues, most notably in WR-07 (which received special scrutiny per this review's instructions): the SIGKILL escalation targets only the immediate child process's PID, never the process (sub)tree, so in precisely the scenario the fix's own header comment names as motivating it ("a wedged process... itself blocked on its own unresponsive Agda grandchild"), **the orphaned Agda grandchild process is not actually killed** — only the immediate MCP-server wrapper dies, while the real problem process survives as a permanent orphan. This was independently confirmed with a live process-tree reproduction on this machine. A second, more contained WR-07 side effect: `computeProxyExitCode`'s rewritten signal-branch silently drops the `childFailed` flag the old formula OR'd into its failure condition — demonstrated directly against the exported function, though currently unreachable via this file's one real call site. WR-03's new advisory file lock also has its own narrower residual TOCTOU in its stale-lock-reclamation path.

## Narrative Findings (AI reviewer)

### Fix verification ledger (iteration 1 findings, re-adjudicated)

| ID | Status | Commit(s) | Verification method |
|---|---|---|---|
| CR-01 | **STILL OPEN** (partial fix) | e10cf57, f55c41b | Diff trace + existing tests (locked/rejected path) + **independent reproduction proving triaged/fixing bypass** |
| CR-02 | RESOLVED | 6662cdc | Diff trace + existing tests (malformed JSON + missing file) |
| WR-01 | RESOLVED | f55c41b | Diff trace + independent reproduction confirming stable `<archivePath>::captures/<basename>` path |
| WR-02 | RESOLVED | b8f8c84 | Diff trace + existing test (push-fails-after-commit-succeeds) |
| WR-03 | RESOLVED (general case); new narrower residual opened as WR-08 | e39ec41 | Diff trace + concurrency tests + independent trace of the stale-reclaim path |
| WR-04 | RESOLVED | 6f256b5 | Diff trace + existing test (real tar with a genuine hard-link entry via `linkSync`) |
| WR-05 | RESOLVED | 9e0405f | Diff trace + existing test (entry-count ceiling checked first) |
| WR-06 | RESOLVED | abe78b4 | Diff trace + existing tests (trailing-slash/relative-path matching) |
| WR-07 | RESOLVED (literal ask); two new narrower residuals opened as WR-09/WR-10 | 58f0f8b | Diff trace + 3x repeated real-subprocess test runs + independent verification the disputed test-expectation change is correct, not a regression + live process-tree reproduction of the residual gap |

Full detail for each item follows below, organized by current severity.

---

## Critical Issues

### CR-01: STILL OPEN — the colliding-fingerprint takeover is fixed for `locked`/`rejected` but fully reproducible against `triaged`/`fixing` entries

**File:** `scripts/team/cron-ingest-wrapup.mjs:182-225` (`wrapCronUpsertQueueEntry`), specifically the terminal-status check at line 194

**What the fix (e10cf57, extended by f55c41b) got right:** `wrapCronUpsertQueueEntry` now intercepts the ONE call site `wrapUpCapture` uses to file/update a queue entry from the cron path, looks up the existing entry by fingerprint, and refuses the write (loud stderr `SECURITY WARNING`, a metadata-only annotation instead, `conflictState.conflict = true`, surfaced as `classification: "terminal-conflict"` in the run summary and a non-zero exit code) whenever the existing entry's status is `"locked"` or `"rejected"` and the incoming candidate would change it. This is verified correct: `test/unit/tools/team-cron-ingest-wrapup.test.ts`'s three CR-01 regression tests pass, and this review's own reproduction against a `locked` entry confirms `status`/`closedAt`/`matrixEntryId`/`recurrence` all survive byte-for-byte.

**What remains broken:** line 194 reads:
```js
const isTerminal = existing?.status === "locked" || existing?.status === "rejected";
```
The fix-queue schema's actual status enum (`test/fixtures/fix-queue.ts:50`) is `["new", "triaged", "fixing", "locked", "rejected"]`. An entry a human has already moved to `"triaged"` or `"fixing"` — i.e. an entry *currently under active human review*, with human-assigned `triageClass`/`triageConfidence`/notes, which is precisely the review checkpoint this project's own design document (`dogfood-wrapup.mjs`'s header) says exists to gate automated filing — is **not** `isTerminal`, so `attemptsRegression` is `false` regardless of what the incoming candidate's status is, and the write proceeds exactly as it did before the CR-01 fix existed: a full field-by-field overwrite via `upsertQueueEntry`'s `{...existing, ...entryData}` merge (`scripts/queue/intake.mjs:71-80`).

This was independently reproduced against the real `processArchive` (no mocking of the vulnerable code path itself — only `extractArchiveSafely`/`runOracle` were faked, exactly as the existing test suite does):

- Seed queue: one entry, `fingerprint: "triaged-fp-repro"`, `status: "triaged"`, `triageClass: "genuine-server-bug"`, `title: "A human already triaged this real defect"`, `capturePath: "/human/verified/capture.json"`.
- Uploaded archive contains one capture whose `artifact.dedup.fingerprint` is the identical string `"triaged-fp-repro"`, with an ORCL-02 cheat-flagged verdict (trivially achievable by any team member — just include one unsanctioned postulate).
- Result: `processArchive` reports `filed: true`, `classification: "deterministic"` — **not** `"terminal-conflict"`. The persisted queue entry after the run:
  ```json
  {
    "fingerprint": "triaged-fp-repro",
    "status": "new",
    "triageClass": null,
    "triageConfidence": null,
    "recurrence": 2,
    "title": "Dogfood-surfaced: triaged-fp-repro",
    "summary": "ORCL-02 soundness-hygiene scan flagged 1 unsanctioned finding(s): postulate.",
    "capturePath": ".../run-1.tar.gz::captures/attack.json",
    "verdictPath": ".../run-1.tar.gz::captures/attack.verdict.json",
    ...
  }
  ```
  Status silently regressed `"triaged" -> "new"`, `triageClass` wiped, title/summary/capturePath/verdictPath all replaced with attacker/oracle-derived content. `stats.filed` counts this capture, so `writeBackQueue` would `git commit` and (absent `--no-push`) `git push` this directly to the branch with zero human review — the exact end-to-end harm CR-01 was filed to close, just reached via a status value the fix didn't enumerate.

This is not a hypothetical: any fingerprint that has ever reached `"triaged"` or `"fixing"` is equally publicly visible in the tracked `test/fixtures/fix-queue.json` as a `"locked"` one, and the attack requires nothing beyond a valid upload key (the same precondition as the original finding).

**Fix:** Broaden the protected-status condition from an enumerated pair to "anything a human has already moved past `new`" — the fix-queue's own status enum only has one value (`"new"`) that represents "never touched by a human," so the simplest correct guard is to invert the check:
```js
// Any status OTHER than "new" means a human has already looked at this
// entry — an automated, unattended write-back must never regress it
// via a colliding, attacker-influenced fingerprint, regardless of
// which of the four post-"new" statuses it currently holds.
const isProtected = existing !== undefined && existing.status !== "new";
const attemptsRegression = isProtected && rewritten.status !== undefined && rewritten.status !== existing.status;
```
This is a one-line change, preserves every currently-passing test (locked/rejected protection unchanged; brand-new fingerprints and legitimate same-status recurrence bumps on `"new"` entries are unaffected), and closes the reproduced gap. Consider also protecting non-status fields (`title`/`triageClass`/`capturePath`) on a `"triaged"`/`"fixing"` collision even when status isn't explicitly changing, since `buildQueueEntryFromVerdict` always sets a full field set — the annotate-and-refuse path already used for terminal statuses is the natural template to extend.

---

## Warnings

### WR-08 (new): The advisory file lock's own stale-lock reclamation is a non-atomic check-then-act, so two racing reclaimers can both believe they hold the lock

**File:** `scripts/dogfood/upload-run.mjs:296-330` (`acquireRetryQueueLock`)

**Issue:** WR-03's fix (commit e39ec41) correctly closes the *common-case* race (two healthy, non-crashed writers appending/flushing around the same time) via `openSync(lockPath, "wx")`, which is atomic. However, the *stale-lock reclamation* branch is not:
```js
try {
  const age = Date.now() - statSync(lockPath).mtimeMs;
  if (age > staleMs) {
    unlinkSync(lockPath);
    continue; // Retry immediately after reclaiming an abandoned lock.
  }
} catch { continue; }
```
`statSync` (read age) and `unlinkSync` (remove) are two separate syscalls with no atomicity between them. If a lock's original owner crashed (leaving it stale, age > 30s) and two *other* processes are both polling and both observe the same stale lock at nearly the same instant: both pass the `age > staleMs` check, both call `unlinkSync` — the first succeeds and immediately loops back to `openSync(lockPath, "wx")`, successfully creating and returning a *fresh* lock (call it L2). If the second process's `unlinkSync` call executes *after* L2 was created (it targets the same path, not a file handle, so it does not care that the file's identity changed), it silently deletes the first process's legitimate, just-acquired L2. The second process then loops and creates its own L3, believing it has exclusive access — but so does the first process, which is still holding what it thinks is a valid lock (L2, now already unlinked from under it). Both callers now proceed under the illusion of exclusivity, reproducing the exact double-writer clobber WR-03 was written to prevent, scoped narrowly to "a previous holder crashed AND two reclaimers raced within milliseconds of each other."

This is materially narrower than the original WR-03 finding (requires a crashed prior holder, not just ordinary concurrency), which is why it is filed as a Warning rather than re-opening WR-03 as a Critical.

**Fix:** Make the reclaim self-verifying by writing and re-reading a per-attempt owner token immediately after winning the race to recreate the file, retrying the whole loop (not just returning) if the token doesn't survive the read-back:
```js
if (age > staleMs) {
  unlinkSync(lockPath);
  try {
    const token = `${process.pid}-${randomUUID()}`;
    closeSync(openSync(lockPath, "wx"));
    writeFileSync(lockPath, token);
    if (readFileSync(lockPath, "utf8") === token) {
      return () => { try { unlinkSync(lockPath); } catch {} };
    }
  } catch { /* fall through to retry */ }
  continue;
}
```
This narrows the remaining window to the read-back itself rather than eliminating it in a fully adversarial-scheduler sense, but is a substantial practical improvement consistent with the module's own "advisory, best-effort, D-14 no-new-dependencies" design constraints.

### WR-09 (new): WR-07's SIGKILL escalation kills only the immediate child PID, never the process tree — the orphaned Agda grandchild the fix's own header comment names as the concern is not actually prevented

**File:** `scripts/dogfood/dogfood-run.mjs:371-420` (`finalize`, specifically `child.kill()` at line 379 and `child.kill("SIGKILL")` at line 399); `scripts/dogfood/dogfood-run.mjs:61-84` (`buildDogfoodChildOptions`, no `detached` option); interacts with `src/agda/agda-process-spawn.ts:101-105` (the real Agda subprocess is spawned the same way, by the proxy's *child*, not by the proxy itself)

**Issue:** `finalize()`'s comment claims "Never leak an orphaned Agda process," and WR-07 added SIGKILL escalation specifically to make that guarantee hold even for "a wedged process (or one itself blocked on its own unresponsive Agda grandchild)" (the fix's own commit message). But `child.kill()`/`child.kill("SIGKILL")` both target only the single tracked PID (the proxy's direct child, i.e. `dist/index.js`) — a positive-PID signal never propagates to that process's own children. `dist/index.js`'s own cleanup of its Agda subprocess happens entirely inside its *own* catchable `SIGINT`/`SIGTERM` handler (`src/index.ts:278-279`, which awaits `session.destroy()`). SIGKILL is, by definition, not catchable — so a `dist/index.js` process that is SIGKILLed while wedged never runs that cleanup, and its own Agda child is orphaned (re-parented to PID 1), continuing to run indefinitely with no supervisor.

This was independently confirmed with a live reproduction on this machine: a "mid-parent" process spawned a `sleep 30` "grandchild" exactly the way `agda-process-spawn.ts` spawns Agda (plain `spawn()`, no `detached`), was then sent `SIGKILL` targeting only its own PID (exactly what `finalize()`'s escalation does), and the grandchild was confirmed still running immediately afterward, reparented to PPID 1:
```
GRANDCHILD_PID=39746
--- sending SIGKILL to mid-parent only ---
(mid-parent confirmed dead)
--- is the grandchild ('sleep 30') still alive and now orphaned? ---
  501 39746     1   0  1:38PM ??         0:00.00 sleep 30
```
So in exactly the scenario WR-07 exists to handle, the fix improves *reporting accuracy* (the run-report no longer falsely claims a clean exit — `childConfirmedDead`/exit code 1 correctly reflect the ambiguity) but does not achieve the "never leak an orphaned Agda process" invariant its own header comment states. Note the new WR-07 regression test (`dogfood-run-report-checkpoint.test.ts`'s "SIGKILL escalation" test) cannot catch this gap because its fake inner child (`dogfood-fake-mcp-child.mjs`) has no grandchild of its own — the test only proves the immediate child eventually dies, not that its descendants are cleaned up.

**Fix:** Spawn the child in its own process group and target the whole group on escalation — the exact pattern this codebase's own test helper (`killGroup` in `dogfood-run-report-checkpoint.test.ts`) already uses for the same reason:
```js
// buildDogfoodChildOptions:
return { command: built.command, args: ..., cwd: built.cwd, env: built.env,
         stdio: ["pipe", "pipe", "pipe"], detached: true };

// finalize():
try { process.kill(-child.pid, "SIGTERM"); } catch { /* group already gone */ }
...
try { process.kill(-child.pid, "SIGKILL"); } catch { /* group already gone */ }
```
(Negative PID targets the whole process group under POSIX semantics, reaching the Agda grandchild even when `dist/index.js` itself cannot run its own cleanup.)

### WR-10 (new): `computeProxyExitCode`'s rewritten signal-branch silently drops the `childFailed` flag, narrowing the exported decision table's own contract

**File:** `scripts/dogfood/dogfood-run.mjs:149-161` (`computeProxyExitCode`)

**Issue:** The pre-WR-07 formula was `childFailed || (childSignalCode != null && !proxyKilledChild) ? 1 : 0`, which ORs `childFailed` into the failure condition regardless of `proxyKilledChild`. The post-fix code is:
```js
if (childSignalCode != null) {
  return proxyKilledChild ? 0 : 1;
}
```
`childFailed` is no longer consulted at all once `childSignalCode` is non-null — it is explicitly `void`-ed earlier in the function and kept only "for API stability/self-documentation" per the function's own comment. Confirmed by direct invocation:
```
computeProxyExitCode({ childExitCode: null, childSignalCode: "SIGTERM", childFailed: true, proxyKilledChild: true })
  OLD => 1   NEW => 0
```
So a hypothetical case where some process `'error'` was observed (`childFailed: true`) on a child that *also* later received a legitimate, proxy-initiated signal death would now report a clean `0` instead of the old code's `1`. This is currently **unreachable** via the single real call site in this file: `dist/index.js` is spawned with a plain 3-pipe stdio (no IPC channel), so Node's `'error'` event on this specific child realistically only fires for a pre-spawn failure (`ENOENT`/`EACCES`), which leaves `child.signalCode` permanently `null` (there was never a process to signal), routing into the separate "both null" branch instead — not the signal branch this gap lives in. It is filed as a Warning (not Critical) for that reason, but `computeProxyExitCode` is an exported, independently-unit-tested "decision table" per its own header comment, and this is a genuine, demonstrable narrowing of that table's documented contract versus the pre-fix version, worth closing defensively before any future change (e.g. adding an IPC channel, or some other 'error' trigger) makes it reachable.

**Fix:**
```js
if (childSignalCode != null) {
  return proxyKilledChild && !childFailed ? 0 : 1;
}
```

## Info

### IN-01: `ingest-server.mjs`'s temp-file write does not actually mirror `writeFileAtomic`'s O_CREAT|O_EXCL discipline, despite the header comment's claim

**Status:** Unchanged, still open (out of scope for this fix iteration per the fix objective).

**File:** `scripts/team/ingest-server.mjs:246-253`

**Issue:** Unchanged from iteration 1 — see original writeup. Not part of this phase's file scope for iteration 2 and not touched by any of the 9 fix commits.

**Fix:** Unchanged — pass `{ flags: "wx" }` to `createWriteStream(tempPath)`, or correct the comment.

### IN-02: Brief TOCTOU window between key-registry file creation and `chmod(0o600)`

**Status:** Unchanged, still open (out of scope for this fix iteration per the fix objective).

**File:** `scripts/team/issue-key.mjs:94-98` (`writeKeyRegistry`)

**Issue:** Unchanged from iteration 1 — see original writeup. Not part of this phase's file scope for iteration 2 and not touched by any of the 9 fix commits.

**Fix:** Unchanged — have `writeFileAtomic` accept a `mode` option applied before rename.

### IN-03: `slugifyCorpusRoot`'s lossy path->slug mapping can theoretically collide across two differently-named projects

**Status:** Unchanged, still open. `slugifyCorpusRoot` itself (as opposed to `selectCodexSessionLogs`, which WR-06 fixed) was not touched by any of the 9 fix commits — confirmed by diff inspection of `abe78b4`, which only modifies `selectCodexSessionLogs`.

**File:** `scripts/dogfood/agent-log-selection.mjs:37-39`

**Issue:** Unchanged from iteration 1 — see original writeup.

**Fix:** Unchanged — no action required this phase; worth a header note for a future hardening pass.

### IN-04 (new): `dogfood-wrapup.mjs`'s local human-driven CLI path shares the identical unprotected `upsertQueueEntry` call CR-01 fixed only for the cron path

**File:** `scripts/dogfood/dogfood-wrapup.mjs:216-269` (`wrapUpCapture`), `:267` (`upsertFn` call, always the raw, un-wrapped `upsertQueueEntry` when invoked from `scriptMain`)

**Issue:** This review's task explicitly asked to verify that the cron path is the *only* unattended write-back entry point — confirmed true (every other caller of `upsertQueueEntry` across the codebase — `scripts/queue/intake.mjs`'s own CLI, `scripts/queue/seed-initial-cargo.mjs`, `scripts/queue/mirror-github.mjs` — either operates on already-trusted, non-archive-sourced data or is manually invoked, and none run unattended on a schedule). However, `dogfood-wrapup.mjs`'s own CLI (`scriptMain`) calls `wrapUpCapture` without any `deps.upsertQueueEntry` override, so it always uses the raw, unprotected `upsertQueueEntry` — the exact same code path the pre-CR-01 cron judge used. This CLI only ever reads from `resolveRunsRoot()/<runId>/run-report.json` (not an arbitrary path), so it cannot process a team-uploaded archive *through its normal interface*. But nothing prevents an operator from manually copying an externally-sourced `run-report.json` (e.g. extracted by hand from a downloaded team archive while investigating something) into their own local runs directory and then running `dogfood-wrapup.mjs <that-run-id>` — which would reach the identical fingerprint-collision vulnerability with zero protection. The risk is meaningfully lower than the cron path's (this CLI never auto-commits/pushes — a human would see the resulting `git diff` on `test/fixtures/fix-queue.json` before deciding to commit), which is why this is Info rather than a Warning/Critical, but it is worth closing defensively given how cheap the same guard would be to share.

**Fix:** No action required to close CR-01 itself, but consider applying the same `wrapCronUpsertQueueEntry`-style guard (once broadened per CR-01's fix above) to the shared `wrapUpCapture` entry point itself, rather than only at the cron call site, so both callers get the same protection "for free" and future callers can't reintroduce the gap by forgetting to wrap `deps.upsertQueueEntry`.

---

_Reviewed: 2026-07-04T18:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2 (re-review of fix commits e10cf57, 6662cdc, f55c41b, b8f8c84, e39ec41, 6f256b5, 9e0405f, abe78b4, 58f0f8b against .planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW.md iteration 1 and .planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW-FIX.md)_
