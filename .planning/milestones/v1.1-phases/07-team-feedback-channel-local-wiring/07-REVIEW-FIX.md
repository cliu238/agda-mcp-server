---
phase: 07-team-feedback-channel-local-wiring
fixed_at: 2026-07-04T18:11:03Z
review_path: .planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-07-04T18:11:03Z
**Source review:** .planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 4 (1 Critical residual + 3 Warning; IN-01..IN-04 out of scope per objective)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01 RESIDUAL: unattended cron write-back guard only protected locked/rejected, leaving triaged/fixing entries exploitable

**Files modified:** `scripts/team/cron-ingest-wrapup.mjs`, `test/unit/tools/team-cron-ingest-wrapup.test.ts`
**Commit:** 0c61f45
**Applied fix:** `wrapCronUpsertQueueEntry`'s guard checked only `existing?.status === "locked" || "rejected"`. Inverted the check to `isProtected = existing !== undefined && existing.status !== "new"` — the fix-queue's own status enum has exactly one value ("new") meaning "never touched by a human," so every other value (triaged/fixing/locked/rejected) is now equally protected. Gated the write-refusal on `isProtected && isFilingCall` rather than also requiring the incoming status to literally differ from the existing one: the one real caller (`wrapUpCapture`'s filing call) always files with `status:"new"` and can never legitimately need to touch a protected entry at all, so ANY filing collision against one is refused — not only the subset whose incoming status happens to differ, which would otherwise leave a field-only overwrite (title/summary/capturePath/verdictPath, same status) unprotected. The refusal path (loud stderr SECURITY WARNING, metadata-only conflict annotation, `conflictState.conflict`, `classification:"terminal-conflict"`) is unchanged — only the protected-status condition was broadened. From-RED tests reproduce the exact re-review reproduction end to end: a colliding fingerprint against a "triaged" entry (with a human-assigned `triageClass`, `title`, `capturePath`, `verdictPath`) is refused, and every field — including `capturePath`/`verdictPath`, not just `status` — survives byte-for-byte; a companion test covers "fixing" for parity. All 3 pre-existing locked/rejected/non-colliding CR-01 tests from iteration 1 pass unmodified.

### WR-08: advisory retry-queue lock's stale-lock reclamation was a non-atomic check-then-act

**Files modified:** `scripts/dogfood/upload-run.mjs`, `test/unit/tools/dogfood-upload-run.test.ts`
**Commit:** 701add0
**Applied fix:** `acquireRetryQueueLock`'s stale-lock reclaim used to be a plain `unlinkSync` that fell through to the *next* loop iteration's own `openSync(..., "wx")` — two syscalls with no atomicity between them, so two reclaimers racing the same stale lock could each unlink it and each "win" a fresh open, with the second reclaimer's unlink then silently deleting the first reclaimer's brand-new, legitimately-held lock. The reclaim now writes a per-attempt owner token (`${process.pid}-${randomUUID()}`) immediately after recreating the lock file and reads it straight back in the same synchronous step before trusting the attempt as the winner; a losing wx-recreate or a token mismatch on read-back falls through to the existing bounded, fail-open retry loop instead of returning a `release()` for a lock the attempt never actually held. Fail-open behavior on sustained contention is unchanged. A true two-OS-process race is not reproducible deterministically inside one Node process (every syscall here is synchronous with no scheduling point between them, and this project's ESM test environment rejects spying on the shared `node:fs` module namespace — confirmed empirically before ruling it out), so the added test instead proves the new code path executed: a reclaimed lock now carries a real, unique, PID-tagged owner token rather than the empty file the old unlink-then-recreate left behind. The pre-existing "stale lock reclaimed" and "non-stale lock fails open" tests pass unmodified.

### WR-09: SIGKILL escalation targeted only the immediate child PID, orphaning the Agda grandchild

**Files modified:** `scripts/dogfood/dogfood-run.mjs`, `test/fixtures/dogfood-fake-mcp-child.mjs`, `test/unit/tools/dogfood-run-report-checkpoint.test.ts`
**Commit:** 8dc65ae
**Applied fix:** `buildDogfoodChildOptions` now spawns the child `detached: true`, making it the leader of its own new POSIX process group (stdio stays 3 real pipes — `detached` only changes process-group/session membership). The real Agda subprocess `dist/index.js` spawns in turn (`src/agda/agda-process-spawn.ts`, plain `spawn()`, no `detached` of its own) therefore joins that same group, since a process with no `detached` option of its own inherits its immediate parent's group. Added a `killChildGroup(childProc, signal)` helper — `process.kill(-childProc.pid, signal)`, guarded for a missing/never-assigned pid and swallowing ESRCH — and replaced both of `finalize()`'s kill calls (the initial agent-disconnect SIGTERM and the WR-07 SIGKILL escalation) with it, so both now target the whole group rather than only `child.pid`. Verified against `src/agda/agda-process-spawn.ts`'s real spawn call (plain `spawn(agdaBin, [...], {stdio: [...]})`, no `detached`) to confirm the grandchild does inherit the new group. Noted in-line that `detached: true` removes the child from a *terminal's* own foreground process group (so a Ctrl-C on an interactive invocation no longer reaches it "for free"), but `finalize()`'s own explicit kill-group call already runs unconditionally on every shutdown path (SIGINT/SIGTERM/SIGHUP handlers all call `finalize()`), so graceful forwarding is unaffected — confirmed empirically (see below). Extended `test/fixtures/dogfood-fake-mcp-child.mjs` with an opt-in real `sleep 30` grandchild (`AGDA_MCP_DOGFOOD_TEST_CHILD_GRANDCHILD_PIDFILE`, plain `spawn()`, no `detached` — mirroring `agda-process-spawn.ts`'s real shape) and added a new process-tree regression test that spawns the proxy with a wedged (SIGTERM-ignoring) inner child plus this real grandchild, sends the whole *outer* group a SIGTERM, and confirms both `finalize()`'s SIGKILL escalation fires **and** the grandchild is actually dead afterward (not merely the immediate child). Verified this test is genuinely from-RED by two separate partial reverts: (1) reverting only `finalize()`'s two kill calls back to plain `child.kill()`/`child.kill("SIGKILL")` while leaving `detached: true` in place — the new test fails (`waitFor` times out; grandchild still alive) exactly as expected; (2) confirmed a *naive* full revert (including `detached: true`) would have made the test pass vacuously, because without `detached` the inner child shares the *outer* test harness's own process group and the outer test's own group-wide signal would reach the grandchild directly regardless of `finalize()`'s own logic — this is why the partial-revert methodology, not a full revert, is the correct validation. All 4 pre-existing report-checkpoint tests (initial checkpoint, primary SIGKILL defense, graceful SIGTERM, WR-07 SIGKILL escalation) and all 11 pre-existing spawn-options tests pass unmodified, run 3x each with no leaked processes observed via `ps` afterward.

### WR-10: `computeProxyExitCode`'s signal branch silently dropped `childFailed`

**Files modified:** `scripts/dogfood/dogfood-run.mjs`, `test/unit/tools/dogfood-run-spawn-options.test.ts`
**Commit:** 648bf53
**Applied fix:** The signal branch (`if (childSignalCode != null) { return proxyKilledChild ? 0 : 1; }`) never consulted `childFailed`, unlike the pre-WR-07 formula which ORed it into the failure condition unconditionally. Changed to `return proxyKilledChild && !childFailed ? 0 : 1;` and removed the now-inapplicable `void childFailed;` no-op line (the parameter is genuinely consulted now, not just kept for API-stability documentation). Updated the header comment to explain the WR-10 gap and why it is currently unreachable via this file's one real call site (a pre-spawn `'error'` leaves `signalCode` permanently null) but worth closing defensively as an independently exported, independently unit-tested decision table. Added the direct-invocation test case the review's own repro used (`childExitCode:null, childSignalCode:"SIGTERM", childFailed:true, proxyKilledChild:true` => `1`), verified to fail against the pre-fix WR-07 formula (observed `0`) and pass against the fix.

## Verification

- `npx tsc -p tsconfig.json --noEmit`: clean (no output, exit 0).
- `npm run build`: clean (exit 0).
- `npx vitest run`: **1791 passed**, **0 failed**, 179 skipped (pre-existing environment-gated skips — real-Agda-binary integration tests, `win32`-only skips — unrelated to this fix set), across 214 test files (16 skipped files). This is iteration 1's own 1786-passed baseline plus the 5 new tests added across the 4 findings here (2 for CR-01, 1 for WR-08, 1 for WR-09, 1 for WR-10).
- Diff scope confirmed via `git diff --stat` scoped to only this fix pass's 4 commits (against the re-review commit `7242516`): exactly the 8 expected source/test file pairs the 4 findings named were touched (`scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/upload-run.mjs`, `scripts/team/cron-ingest-wrapup.mjs`, `test/fixtures/dogfood-fake-mcp-child.mjs`, and the 4 corresponding test files) — no changes to `STATE.md`/`ROADMAP.md`/`REVIEW.md`, and `git stash` was never used.
- Each of the 3 findings with a genuinely reproducible from-RED test (CR-01, WR-09, WR-10) was independently confirmed to FAIL against the pre-fix (or a precisely partial-revert, for WR-09) code before being confirmed to pass against the fix — not just written and trusted. WR-08's narrower reclaim-ordering race is not deterministically reproducible inside a single Node process (see above); its test instead proves the new mechanism's own code path executed.

## Process Note

This run committed directly onto `main` in the caller's existing working tree rather than in an isolated `git worktree`, mirroring iteration 1's own documented precedent for the identical reason: the invocation carried an explicit `<objective>`/`<constraints>`/`<output>` shape with no `<config>` block (no `phase_dir`/`padded_phase` were provided to derive a worktree path from programmatically, though both were inferable from the cited `REVIEW.md` path and were used to name commits/this report), an explicit "NEVER git stash" constraint (which only matters if operating on a tree someone might concurrently interact with — a worktree would make it moot), ran synchronously in the foreground, and the working tree was clean and on `main` with no evidence of a concurrent session at the start (confirmed via `git worktree list` and a scan for stray `/tmp/sv-*-reviewfix-*` directories or a `.review-fix-recovery-pending.json` sentinel, both absent). All 4 commits are self-contained, individually buildable/testable, and were verified atomically as they were made (Tier 1 re-read + Tier 2 syntax/type check + targeted test run for every fix, plus a from-RED failure/pass round-trip for 3 of the 4); no partial or uncommitted state remains.

---

_Fixed: 2026-07-04T18:11:03Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
