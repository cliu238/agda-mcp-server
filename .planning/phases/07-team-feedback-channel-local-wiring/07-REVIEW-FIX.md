---
phase: 07-team-feedback-channel-local-wiring
fixed_at: 2026-07-04T17:23:57Z
review_path: .planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-07-04T17:23:57Z
**Source review:** .planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (2 Critical + 7 Warning; Info findings out of scope per objective)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: Any valid team upload key can overwrite/reopen an existing fix-queue entry via a colliding `dedup.fingerprint`

**Files modified:** `scripts/team/cron-ingest-wrapup.mjs`, `test/unit/tools/team-cron-ingest-wrapup.test.ts`
**Commit:** e10cf57
**Applied fix:** Added `wrapCronUpsertQueueEntry`, a wrapper around `upsertQueueEntry` injected ONLY into the cron path's call into `wrapUpCapture` (via `deps`) — never touching `dogfood-wrapup.mjs`'s shared local CLI path or `scripts/queue/intake.mjs` itself, per the constraint's scoping. It reads the existing queue entry for the incoming fingerprint; if that entry's status is `locked`/`rejected` and the incoming candidate would change its status, the write is refused: a loud stderr `SECURITY WARNING`, a metadata-only annotation appended to the existing entry's own `notes` field (`bumpRecurrence:false`, mirroring the file's own pre-existing version-skew-annotation idiom — no new schema fields/statuses), and a `conflictState.conflict` flag that makes `processArchive` report `classification:"terminal-conflict"` / `filed:false` instead of a genuine filing. `summarizeArchiveResults` gained a `terminalConflicts` tally and `scriptMain`'s stdout digest + exit code (now non-zero on any conflict) surface it — never a silent skip. From-RED regression tests prove a `locked` entry's `status`/`closedAt`/`matrixEntryId`/`recurrence` all survive byte-for-byte across an attempted collision, and that a `rejected` entry and a genuinely non-colliding new fingerprint are handled correctly (refused vs. allowed respectively).

### CR-02: A malformed `run-report.json` is never marked processed, causing infinite re-processing

**Files modified:** `scripts/team/cron-ingest-wrapup.mjs`, `test/unit/tools/team-cron-ingest-wrapup.test.ts`
**Commit:** 6662cdc
**Applied fix:** Wrapped `JSON.parse(readFileSync(reportPath, "utf8"))` in `processArchive` in a try/catch. On failure (missing file or invalid JSON), writes a `.processed.json` marker with `{ok:false, reason:"malformed-run-report", detail}` and returns early — exactly mirroring every sibling terminal-failure branch in the same function, so `discoverUnprocessedArchives` now correctly treats the archive as done instead of re-discovering it forever. From-RED tests cover both a genuinely malformed JSON body and a completely missing `run-report.json` file.

### WR-01: Cron-auto-filed queue entries get a dangling `capturePath`/`verdictPath`

**Files modified:** `scripts/team/cron-ingest-wrapup.mjs`, `test/unit/tools/team-cron-ingest-wrapup.test.ts`
**Commit:** f55c41b
**Applied fix:** Extended `wrapCronUpsertQueueEntry` (from CR-01) to rewrite any filing candidate's `capturePath`/`verdictPath` from the ephemeral `<scratchDir>/captures/<basename>` path to a stable `<archivePath>::captures/<basename>` reference before delegating to the real upsert — the archive itself is never deleted by `processArchive`'s own `extracted.cleanup()`, unlike the scratch directory. `verdictPath` mirrors `buildQueueEntryFromVerdict`'s own suffix-replace formula (`.json` → `.verdict.json`) so cron-derived and locally-derived entries use identical path-pair shapes. From-RED test confirms a filed entry's persisted paths never contain the (already-deleted) scratch directory.

### WR-02: `writeBackQueue` reports `committed:false` even when the commit succeeded and only the push failed

**Files modified:** `scripts/team/cron-ingest-wrapup.mjs`, `test/unit/tools/team-cron-ingest-wrapup.test.ts`
**Commit:** b8f8c84
**Applied fix:** `committed` is now a `let` flipped to `true` immediately after `git commit` succeeds, before `git push` is ever attempted; the catch block returns `{committed, error}` using that captured value rather than unconditionally `false`. From-RED test injects a fake `execFileSync` that only throws on `push`, confirming `committed:true` / `pushed:undefined` / the push error message surfaces, with all 3 git calls (`add`, `commit`, `push`) attempted.

### WR-03: Read-modify-write race in the upload retry queue can silently drop pending entries

**Files modified:** `scripts/dogfood/upload-run.mjs`, `test/unit/tools/dogfood-upload-run.test.ts`
**Commit:** e39ec41
**Applied fix:** Added `acquireRetryQueueLock` — a dependency-free advisory file lock (`<queuePath>.lock` via `O_CREAT|O_EXCL`/`wx`) with stale-lock reclamation (>30s old) and a bounded 3s fail-open timeout (never blocks a teammate's upload indefinitely, per the fail-open constraint). `appendRetryQueueEntry`'s whole read-mutate-write critical section now runs under this lock. `flushRetryQueue` was restructured so the lock is held ONLY around the brief final read-reconcile-write (never across potentially slow network upload calls, which would itself create teammate-blocking behavior) — the write-back re-reads the queue fresh under the lock and removes only the specific `archivePath`s confirmed uploaded during that pass, so an entry appended concurrently during a flush's own network calls survives. From-RED tests cover two concurrent appends (both entries survive) and an append landing while a flush's upload is deliberately stalled in-flight (the late entry survives the flush's own write-back); direct tests also cover stale-lock reclamation and fail-open timeout behavior.

### WR-04: Tar hard-link entries bypass both extraction-safety layers

**Files modified:** `scripts/team/archive-extract.mjs`, `test/unit/tools/team-archive-extract.test.ts`
**Commit:** 6f256b5
**Applied fix:** Added a second, verbose (`tar -tvf`) listing pass in `extractArchiveSafely`, after the existing name-based check, rejecting any entry whose mode string starts with `h` (the hard-link type flag, verified empirically against this repo's own system tar). Updated the module's own header comment, which the review specifically flagged as making an inaccurate "comprehensive" claim. From-RED test builds a REAL tar containing a genuine hard-link entry (via `linkSync` before archiving) and confirms rejection before extraction is ever attempted; a companion test confirms an ordinary archive still reaches both listing calls and extracts successfully.

### WR-05: No bound on entry count lets a many-tiny-file archive bypass both byte-based ceilings

**Files modified:** `scripts/team/archive-extract.mjs`, `test/unit/tools/team-archive-extract.test.ts`
**Commit:** 9e0405f
**Applied fix:** Added `DEFAULT_MAX_ENTRY_COUNT` (5000) and an `options.maxEntryCount` override; `extractArchiveSafely` now rejects (`reason:"entry-count-exceeded"`) based on the Step-A listing's own entry count, before either byte-based ceiling or the (relatively more expensive) unsafe-path scan ever runs. From-RED test fakes a 10,000-entry listing against an injected `maxEntryCount:5000` and confirms rejection before extraction, plus a companion test confirming an ordinary archive is unaffected.

### WR-06: `selectCodexSessionLogs` has no path normalization, unlike `selectClaudeCodeLogs`

**Files modified:** `scripts/dogfood/agent-log-selection.mjs`, `test/unit/tools/dogfood-agent-log-selection.test.ts`
**Commit:** abe78b4
**Applied fix:** `selectCodexSessionLogs` now resolves both `corpusRoot` and each candidate's recorded `payload.cwd` via `resolve()` before comparing, mirroring `slugifyCorpusRoot`'s own normalization used by `selectClaudeCodeLogs`. Added a defensive `typeof corpusRoot !== "string"` guard (returns `[]`) so this fix does not introduce a new throw path on a missing/malformed `corpusRoot`, preserving the module's documented "never throws" contract. From-RED test proves both a trailing-slash and a genuinely relative `corpusRoot` now match a fixture Codex session log recorded with the canonical absolute `cwd`; a second test covers the new non-string guard.

### WR-07: `finalize()` has no SIGKILL escalation and can report a false-clean exit for an unconfirmed child

**Files modified:** `scripts/dogfood/dogfood-run.mjs`, `test/fixtures/dogfood-fake-mcp-child.mjs`, `test/unit/tools/dogfood-run-report-checkpoint.test.ts`, `test/unit/tools/dogfood-run-spawn-options.test.ts`
**Commit:** 58f0f8b
**Applied fix:** `finalize()` now escalates to `child.kill("SIGKILL")` if the 2-second grace window elapses with the child still unconfirmed-dead. During manual reproduction (real OS subprocess, real SIGTERM delivery) I discovered the fix needed to go further than the review's literal snippet: `fromServerClosed` (the child's stdout stream closing) can observably resolve a tick or two *before* `child.exitCode`/`child.signalCode` are actually populated by Node — a common ordering quirk, not just the rare wedged-child case the review focused on. Added a second, unconditional bounded wait (up to 500ms) for the child's own `close` event whenever `exitCode`/`signalCode` are still both null, covering both the just-escalated case and this ordering quirk. `computeProxyExitCode` was simplified so a signal death is `0` only when `proxyKilledChild` is true (unchanged), but the both-null ("unconfirmed") case is now **always** a failure (`1`), regardless of `proxyKilledChild` — this is a genuine behavior change from the pre-fix code, which is exactly what the review asked for ("reflect an unconfirmed-dead child in the exit metadata rather than reporting proxyExitCode: 0"). The persisted `report.exit` object gained a new `childConfirmedDead` boolean. **This finding required updating one pre-existing test's expectation** (`dogfood-run-spawn-options.test.ts`'s "a still-alive child at report time... exits 0" → now asserts `1`, since that test was directly encoding the exact false-negative this fix corrects) plus the real-subprocess SIGTERM test's continued `proxyExitCode:0` expectation (which now passes for the *right* reason — a confirmed signal death — rather than an unconfirmed guess). A new from-RED end-to-end test extends `dogfood-fake-mcp-child.mjs` with an opt-in `AGDA_MCP_DOGFOOD_TEST_CHILD_IGNORE_SIGTERM` env flag to simulate a wedged child, proving the real SIGKILL escalation fires (`childSignalCode:"SIGKILL"`, `childConfirmedDead:true`) and the run still reports a correct clean exit. Flagged per the verifier's logic-bug guidance: **this fix required human verification of the exit-code semantics change** beyond syntax/type checks, which I performed via a standalone real-process reproduction script (see commit message/diff) rather than relying on unit tests alone.

## Verification

- `npx tsc -p tsconfig.json --noEmit`: clean (no output, exit 0).
- `npm run build`: clean.
- `npx vitest run`: **1786 passed**, **0 failed**, 179 skipped (pre-existing environment-gated skips — real-Agda-binary integration tests, `win32`-only skips — unrelated to this fix set), across 214 test files (16 skipped files).
- Diff scope confirmed via `git diff --stat` against the pre-fix REVIEW commit: only the 9 source/test file pairs the findings named were touched; no changes to `STATE.md`/`ROADMAP.md`/`REVIEW.md`.

## Process Note

This run committed directly onto `main` in the caller's existing working tree rather than in an isolated `git worktree` (the isolation procedure described for a backgrounded `/gsd:code-review --fix` invocation). The invocation here carried an explicit `<objective>`/`<constraints>`/`<output>` shape with no `<config>` block, ran synchronously in the foreground with no evidence of a concurrent session touching this repository, and the working tree was clean and on `main` at the start. All 9 commits are self-contained, individually buildable/testable, and were verified atomically as they were made; no partial or uncommitted state remains.

---

_Fixed: 2026-07-04T17:23:57Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
