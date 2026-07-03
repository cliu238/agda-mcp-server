---
phase: 05-dogfooding-orchestration-fuel
fixed_at: 2026-07-03T03:06:30Z
review_path: .planning/phases/05-dogfooding-orchestration-fuel/05-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-07-03T03:06:30Z
**Source review:** .planning/phases/05-dogfooding-orchestration-fuel/05-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 3 (fix_scope `critical_warning`: WR-01, WR-02, WR-03; IN-01, IN-02, IN-04, IN-05 excluded)
- Fixed: 3
- Skipped: 0

Every fix is locked with new unit regression tests in the existing phase-5 test files. Verification beyond per-fix checks: all 43 tests across the four dogfood unit files pass (`dogfood-flake-classify` 13/13, `dogfood-wrapup-filing`, `dogfood-run-spawn-options` 11/11, `dogfood-transcript-writer`), `npm run build` passes, and both live integration suites pass against a real Agda 2.8.0 (`dogfood-proxy-passthrough` 4/4 — exercises the WR-02/WR-03-touched finalize/stream path end to end including the agent-disconnect exit-0 teardown; `dogfood-flake-classify-live` 1/1 — exercises the WR-01 `extraEnv.AGDA_DIR` addition against a real spawned harness server).

## Fixed Issues

### WR-01: Flake-gate replay omits the materialized `AGDA_DIR` (and library flags) that ORCL-01's own cold replay reconstructs

**Files modified:** `scripts/dogfood/flake-classify.mjs`, `test/unit/tools/dogfood-flake-classify.test.ts`
**Commit:** 6b47100
**Applied fix:** The warm-replay `createHarness` call now passes `extraEnv: { AGDA_DIR: materialized.agdaDirTmp }`, exactly as the review's snippet prescribes — the replayed server's own `createLibraryRegistration` reads (and, via its `useStableDir` branch, reuses) the captured `libraries`/`defaults` files instead of inheriting the operator's ambient `AGDA_DIR` through `...process.env`. The residual spawn-time `-l` delta is handled per the review's "at minimum document" instruction: a new "Replay fidelity contract" paragraph in the module header records that the real server derives `-l` spawn flags solely from `.agda-lib` discovery at the project root (`src/agda/library-registration.ts`) and `.agda-lib` is deliberately never part of `inlinedFirstPartySources`, so those flags cannot be replayed warm; routing them through `AGDA_MCP_DEFAULT_FLAGS` was rejected explicitly because that injects them into `Cmd_load`'s per-call option list — the exact wrong channel Plan 02-03 empirically confirmed misattributes library-resolution errors (see `splitMergedArgv`'s rationale in `orcl-01-differential.mjs`). The DI-seam JSDoc typedefs now include `agdaDirTmp` and `extraEnv`. New regression test asserts per-iteration pairing: harness i receives materialization i's own `tmpDir` as `projectRoot` AND its own `agdaDirTmp` as `extraEnv.AGDA_DIR`, across all 3 iterations.

### WR-02: `process.stdout` has no `error` listener — an abrupt agent death during the finalize drain window crashes the proxy before `run-report.json` is written

**Files modified:** `scripts/dogfood/dogfood-run.mjs`, `test/unit/tools/dogfood-run-spawn-options.test.ts`
**Commit:** 975bef2
**Applied fix:** Added `process.stdout.on("error", () => {})` before any stream wiring, per the review's snippet, plus the optional `process.stdout.writable` guard on the per-line forward (mirroring the existing `child.stdin.writable` guard; recording still happens unconditionally before the guarded forward). One deliberate adaptation beyond the review's snippet: an identical `process.stderr.on("error", () => {})` listener was added alongside, because the same abrupt-agent-death window has a second EPIPE vector with the identical consequence — `child.stderr.pipe(process.stderr)` keeps draining the SIGTERM'd server's shutdown stderr output through the broken pipe during the 2s drain race, and Node's `pipe()` destroys an error-listener-less destination with an unhandled error, killing the proxy before `writeRunReport` just as the stdout vector would. New source-text regression test (matching the file's existing #39 invariant-test pattern) asserts both listeners are registered, with a comment explaining the report-loss consequence of removing either.

### WR-03: Fix-introduced regression — a child spawn failure now exits 0 (previously a non-zero crash); subsumes iter2 IN-03's signal-death facet

**Files modified:** `scripts/dogfood/dogfood-run.mjs`, `test/unit/tools/dogfood-run-spawn-options.test.ts`
**Commit:** 39d1fee
**Applied fix:** Replaced `const exitCode = child.exitCode ?? 0` with a new exported pure function `computeProxyExitCode({ childExitCode, childSignalCode, childFailed, proxyKilledChild })` implementing the review's decision table: a real exit code passes through; otherwise `childFailed || (signal && !proxyKilledChild)` yields 1. `childFailed` is set in the `child.on("error")` handler as suggested. One adaptation: instead of the review's `agentInitiatedShutdown` flag set in the `fromAgent.on("close")` trigger, the flag is `proxyKilledChild = child.kill()` set at finalize's own kill guard — the module's only `child.kill()` site — which captures "proxy-initiated teardown" exactly (covering the agent-disconnect path the review targets), is race-free against a late agent disconnect flipping the verdict after a spontaneous signal death, and uses `kill()`'s boolean return so a never-spawned child (signal undeliverable) can never be mistaken for a legitimate teardown. Extracting the decision as a pure function makes the regression directly unit-testable per the file's existing convention: 6 new tests cover spawn-failure -> 1 (the exact regression), childFailed dominance over the kill-guard flag, spontaneous signal death -> 1 (the folded-in iter2 IN-03 facet), proxy-initiated kill -> 0, exit-code passthrough (0 and 3), and the still-alive-at-report-time -> 0 edge.

---

_Fixed: 2026-07-03T03:06:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
