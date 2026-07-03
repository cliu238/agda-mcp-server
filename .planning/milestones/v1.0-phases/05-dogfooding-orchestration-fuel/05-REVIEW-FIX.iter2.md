---
phase: 05-dogfooding-orchestration-fuel
fixed_at: 2026-07-03T02:36:42Z
review_path: .planning/phases/05-dogfooding-orchestration-fuel/05-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-07-03T02:36:42Z
**Source review:** .planning/phases/05-dogfooding-orchestration-fuel/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (fix_scope `critical_warning`: CR-01, CR-02, WR-01 through WR-08; IN-01 through IN-04 excluded)
- Fixed: 10
- Skipped: 0

Every fix is locked with new or updated unit regression tests in the existing phase-5 test files. Verification beyond per-fix syntax checks: all 50 phase-5 dogfood unit tests pass (`dogfood-flake-classify`, `dogfood-wrapup-filing`, `dogfood-run-spawn-options`, `dogfood-transcript-writer`, `dogfood-task-manifest`, `dogfood-install-skill`, `fuel-corpora`), `npm run build` passes, and both live integration suites pass against a real Agda 2.8.0 (`dogfood-proxy-passthrough` 4/4 — exercises the restructured WR-03/WR-04 finalize path end to end; `dogfood-flake-classify-live` 1/1 — exercises the CR-02 scan against a real harness).

## Fixed Issues

### CR-01: Unvalidated `--rerun-n` / `AGDA_MCP_DOGFOOD_RERUN_N` makes `classifyFlakiness` report "flaky" with zero replays

**Files modified:** `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/flake-classify.mjs`, `test/unit/tools/dogfood-flake-classify.test.ts`
**Commit:** b9fb517
**Applied fix:** Defense in depth at both layers, as suggested. `parseWrapupArgv` now keeps the raw value and rejects any non-positive-integer rerun count with a thrown error; `scriptMain` catches it and reports a clean one-line stderr message + exit code 1 (mirroring `dogfood-run.mjs`'s own gate-failure convention). `classifyFlakiness` refuses (`throw`) any `n` that is not a positive integer, placed after the Pitfall-4 not-applicable gate and before the replay loop, so a verdict can never be computed from an empty observation list. New regression test asserts `NaN`/`0`/`-1`/`1.5` all reject without touching any injected dep.

### CR-02: `findLastLoadFamilyAction` replays a different action than the one `findWarmLoadTuple` gated on

**Files modified:** `scripts/dogfood/flake-classify.mjs`, `test/unit/tools/dogfood-flake-classify.test.ts`
**Commit:** 96e432a
**Applied fix:** Added `findWarmLoadTuple`'s response-shape gate (skip entries whose `normalizedResponse.data` lacks a string `file` and string `classification`) to the scan, exactly as the review's snippet prescribes, and updated the "deliberate duplicate" doc comment so its faithfulness claim is now true. New regression test reproduces the reviewer's scenario (valid `agda_load(First.agda)` followed by a failed `agda_typecheck` with an empty-data error envelope) and asserts all N replays call `agda_load` with `First.agda`'s args.

### WR-01: `classifyFlakiness` labels consistently-failing replays "flaky"/"timing-nondeterministic"

**Files modified:** `scripts/dogfood/flake-classify.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`, `test/unit/tools/dogfood-flake-classify.test.ts`, `test/unit/tools/dogfood-wrapup-filing.test.ts`
**Commit:** aa9624c
**Applied fix:** All-null observation lists now return the distinct `{ classification: "replay-inconclusive", observedClassifications }` outcome. `wrapUpCapture` routes it separately: still never filed, appended to the same side-channel but under a distinct `"replay-failed"` tag (via a new optional `tag` parameter on `appendFlakyLog`, defaulting to the ROADMAP-verbatim `"timing/nondeterministic"`), and the wrap-up summary gains a `replayInconclusive` count. Note: the review's *optional* suggestion (fall back to envelope-level `structuredContent.classification`) was deliberately NOT applied — success envelopes also carry an envelope-level classification, so that fallback could silently change what non-error replays compare on; the mandatory distinct-outcome fix fully addresses the mislabeling.

### WR-02: Proxy re-promotes the previous capture when a later `agda_capture_session` call fails

**Files modified:** `scripts/dogfood/transcript-writer.mjs`, `scripts/dogfood/dogfood-run.mjs`, `test/unit/tools/dogfood-transcript-writer.test.ts`
**Commit:** b52e76f
**Applied fix:** `recordToClientLine` now returns `stagedCapture` (the object it pushed, or `null` for a failed capture whose error envelope carries no `stagedPath`), and the proxy promotes `event.stagedCapture` instead of inferring via `stagedCaptures.at(-1)`. A failed capture now also gets a stderr signal at the proxy layer ("nothing staged to auto-persist"). The misleading `.at(-1)` recommendation in the `stagedCaptures` doc comment was corrected. Existing event-shape test updated; new regression test locks the failed-after-successful-capture scenario.

### WR-03: Finalize races the child stdout drain (`exit` vs `close`) and `process.exit` can drop queued output

**Files modified:** `scripts/dogfood/dogfood-run.mjs`
**Commit:** cc72dde
**Applied fix:** Finalize now triggers on child `close` (all stdio drained) instead of `exit`; the `fromAgent` close trigger is kept. In finalize, the child is killed first (agent-disconnect path — this is what ends its stdout), then the report snapshot waits for `fromServer`'s readline `close` (bounded by a 2s unref'd timeout so a wedged pipe cannot hang finalize), so a tail `agda_capture_session` response can no longer be recorded to the transcript yet omitted from `run-report.json`. The final `process.exit` is deferred behind an empty `process.stdout.write` callback (stream writes are FIFO) so queued agent-bound lines flush instead of being truncated; the exit-code VALUE semantics (`child.exitCode ?? 0`) were deliberately left untouched — changing them is IN-03, which is out of scope. Verified end to end by the live proxy passthrough integration suite (4/4, including both post-close report assertions).

### WR-04: Unhandled stream/process error events and transcript-write failures crash the proxy mid-session

**Files modified:** `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/transcript-writer.mjs`
**Commit:** 6c3ec32
**Applied fix:** All three prescribed paths: (a) `child.on("error", ...)` reports to stderr and routes into `finalize()`; (b) agent-to-server forwarding is guarded by `child.stdin.writable` plus a stderr-reporting `'error'` listener on `child.stdin` for the unguardable EPIPE race window; (c) `appendTranscriptLine` wraps its `appendFileSync` in try/catch that warns once on stderr (further warnings suppressed) and keeps forwarding, making recording best-effort relative to forwarding per the transparent-tee design goal.

### WR-05: `dogfood-wrapup` has no per-capture error isolation

**Files modified:** `scripts/dogfood/dogfood-wrapup.mjs`
**Commit:** 9eb4e4e
**Applied fix:** Each loop iteration (staged-file read + parse + `wrapUpCapture`) is try/catch-isolated; a failure pushes `{ stagedPath, filed: false, classification: "error", error: message }` into `results` with a stderr line, and the loop continues. The summary gains an `errors` count (also included in the stdout digest), and `errors > 0` sets `process.exitCode = 1` while `wrapup-report.json` is still written — so one bad artifact never zeroes out the run.

### WR-06: Queue-entry summary precedence contradicts the filing precedence

**Files modified:** `scripts/dogfood/dogfood-wrapup.mjs`, `test/unit/tools/dogfood-wrapup-filing.test.ts`
**Commit:** d8e4a29
**Applied fix:** Both review options combined: `buildQueueEntryFromVerdict` now checks `orcl02.kind === "cheat-flagged"` FIRST (mirroring `wrapUpCapture`'s filing precedence) and concatenates a co-occurring ORCL-01 candidate signal after it, so the cheat findings that actually caused the filing lead the summary and neither signal is dropped. `affectedTool` now derives from the last load-family recorded action (new `lastLoadFamilyToolName` helper), falling back to the last action only when the capture has no load-family action at all (e.g. a pure ORCL-02 filing). Two new regression tests lock the co-occurrence summary ordering and the affectedTool derivation.

### WR-07: `classifyFlakiness` leaks materialized temp dirs when harness creation fails

**Files modified:** `scripts/dogfood/flake-classify.mjs`, `test/unit/tools/dogfood-flake-classify.test.ts`
**Commit:** 0cae7e1
**Applied fix:** Restructured to the review's exact nested try/finally shape: `materialized.cleanup()` sits in an outer `finally` that runs even when `createHarness` rejects, and `harness.close().catch(() => {})` in the inner `finally` can no longer skip cleanup or mask the real `callTool` error. Two new regression tests: harness-creation failure still cleans up (and the error still propagates, to be caught by WR-05's per-capture isolation); a close() rejection neither skips cleanup nor fails the replay.

### WR-08: `recordToClientLine` misattributes server-initiated requests that share a pending request id

**Files modified:** `scripts/dogfood/transcript-writer.mjs`, `test/unit/tools/dogfood-transcript-writer.test.ts`
**Commit:** f18ba4f
**Applied fix:** The review's one-line fix: after JSON parse and the id check, a line with a `method` field (a request/notification, never a response — JSON-RPC ids are per-direction namespaces) returns `undefined` before the pending lookup. New regression test: a server-initiated request colliding with a pending `tools/call` id is ignored, and the real response afterwards still correlates and stages its capture.

---

_Fixed: 2026-07-03T02:36:42Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
