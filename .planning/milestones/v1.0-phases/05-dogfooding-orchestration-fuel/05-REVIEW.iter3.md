---
phase: 05-dogfooding-orchestration-fuel
reviewed: 2026-07-03T02:49:10Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .agents/skills/agda-dogfooding/SKILL.md
  - scripts/data/fuel-corpora.json
  - scripts/data/oracle-policy/agda-stdlib.json
  - scripts/data/oracle-policy/autoformalizing-hopf.json
  - scripts/data/oracle-policy/codex-homotopy-group.json
  - scripts/dogfood/dogfood-run.mjs
  - scripts/dogfood/dogfood-wrapup.mjs
  - scripts/dogfood/flake-classify.mjs
  - scripts/dogfood/install-dogfood-skill.mjs
  - scripts/dogfood/task-manifest.mjs
  - scripts/dogfood/transcript-writer.mjs
  - test/fixtures/fuel-corpora.ts
  - test/fixtures/task-manifest-schema.ts
  - test/integration/mcp/dogfood-flake-classify-live.test.ts
  - test/integration/mcp/dogfood-proxy-passthrough.test.ts
  - test/unit/fixtures/fuel-corpora.test.ts
  - test/unit/tools/dogfood-flake-classify.test.ts
  - test/unit/tools/dogfood-install-skill.test.ts
  - test/unit/tools/dogfood-run-spawn-options.test.ts
  - test/unit/tools/dogfood-task-manifest.test.ts
  - test/unit/tools/dogfood-transcript-writer.test.ts
  - test/unit/tools/dogfood-wrapup-filing.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 5: Code Review Report (auto-fix iteration 2 re-review)

**Reviewed:** 2026-07-03T02:49:10Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Re-reviewed the Phase 5 dogfooding scaffold after the 10 fix commits `b9fb517..f18ba4f`. Prior-iteration findings are referenced below with the "iter2" qualifier (report preserved at `05-REVIEW.iter2.md`).

**All 10 Critical+Warning fixes from iter2 are verified correct and complete:**

- **CR-01 (iter2) — fixed.** `parseWrapupArgv` (`dogfood-wrapup.mjs:263-273`) now throws on any non-positive-integer rerun count (flag or env), caught in `scriptMain` with a stderr message and exit 1; `classifyFlakiness` (`flake-classify.mjs:152-154`) independently rejects `NaN`/`0`/negative/fractional `n` before the replay loop. Both defense layers from the suggested fix are present; unit test covers `NaN, 0, -1, 1.5` and asserts zero dep calls. A zero-replay "flaky" verdict is no longer reachable.
- **CR-02 (iter2) — fixed.** `findLastLoadFamilyAction` (`flake-classify.mjs:64-83`) now applies the identical response-shape gate as `findWarmLoadTuple` (`orcl-01-differential.mjs:269-295`): same regex literal, same end-to-start scan, same `!data || typeof data.file !== "string" || typeof data.classification !== "string"` continue clause. Verified by line-by-line comparison — the two scans now always select the same action, restoring the "guaranteed non-null, same action" invariant. The iter2 repro (valid `agda_load(First.agda)` followed by a failed trailing `agda_typecheck(Second.agda)`) is now a unit test asserting the replay targets `agda_load`/`First.agda`.
- **WR-01 (iter2) — fixed.** All-null observation lists now return a distinct `{ classification: "replay-inconclusive" }` (`flake-classify.mjs:191-193`), which `wrapUpCapture` routes to the side channel under the distinct `"replay-failed"` tag (`dogfood-wrapup.mjs:225-234`), never `"timing/nondeterministic"`. `appendFlakyLog` gained the `tag` parameter with the criterion-4 wording as default. Counted separately in the wrapup summary (`replayInconclusive`). Tests cover both layers including the 5th-argument tag assertion.
- **WR-02 (iter2) — fixed.** `recordToClientLine` returns the capture *this* response staged (`transcript-writer.mjs:174-193`, `stagedCapture` is `null` for a failed capture), and `dogfood-run.mjs:170-194` promotes `event.stagedCapture` instead of `stagedCaptures.at(-1)`; a failed capture now also gets an explicit stderr signal at the proxy layer. Unit test 1b reproduces the exact re-promotion hazard.
- **WR-03 (iter2) — fixed.** Finalize now triggers on `child.on("close")` (not `exit`), and the report snapshot waits for `fromServer`'s own `close` (all buffered lines dispatched) bounded by a 2s race so a wedged pipe cannot hang finalize (`dogfood-run.mjs:196-263`). `process.exit` is deferred behind an empty `process.stdout.write` callback so queued forwarded lines flush first. Residual exit-code issue split out as new WR-03 below.
- **WR-04 (iter2) — fixed** for all three flagged paths: `child.on("error")` routes into finalize (`dogfood-run.mjs:264-272`), agent-line writes are guarded by `child.stdin.writable` plus a stdin `error` listener (`dogfood-run.mjs:144-162`), and `appendTranscriptLine` is wrapped in try/catch with a warn-once stderr message (`transcript-writer.mjs:70-83`). A fourth unguarded stream path remains (new WR-02 below), and the error-to-finalize routing introduced an exit-code regression (new WR-03 below).
- **WR-05 (iter2) — fixed.** Each wrapup loop iteration is isolated in try/catch (`dogfood-wrapup.mjs:320-344`); a failed capture is pushed as `{ filed: false, classification: "error", error }`, the run continues, `wrapup-report.json` is always written, and `errors > 0` sets exit code 1. Minor residual edge in the catch handler noted as IN-05.
- **WR-06 (iter2) — fixed.** `buildQueueEntryFromVerdict` now checks `orcl02.kind === "cheat-flagged"` first and concatenates both signals when both are present (`dogfood-wrapup.mjs:103-121`); `affectedTool` derives from `lastLoadFamilyToolName` with the trailing-call fallback (`dogfood-wrapup.mjs:132-135`). Tests assert ORCL-02 leads the co-occurrence summary and that a trailing `agda_capture_session` never becomes `affectedTool`.
- **WR-07 (iter2) — fixed.** The replay loop uses the exact nested-finally shape from the suggested fix (`flake-classify.mjs:160-181`): `materialize` outside its own try, `createHarness` inside, `harness.close().catch(() => {})` in the inner finally, `materialized.cleanup()` in the outer finally. Verified `cleanup()` is synchronous (`rmSync` x2 in `orcl-01-differential.mjs:126-129`), so the un-awaited call is correct. Tests cover both the createHarness-rejection and close-rejection paths.
- **WR-08 (iter2) — fixed.** `recordToClientLine` returns early for any line carrying a `method` field (`transcript-writer.mjs:150-152`), so a server-initiated request can no longer consume a pending id. Collision test 3b asserts the real response still correlates and stages the capture.

All 50 in-scope unit tests pass. Cross-references re-verified this iteration: `judgeOrcl01` skips when `findWarmLoadTuple` is null (`orcl-01-differential.mjs:541-544`), so `wrapUpCapture` branch (2) can never receive `"not-applicable"` from the real flake gate (the `shouldFile = true` fall-through for it is unreachable outside DI); `promoteCapture(artifactPath)` is synchronous, so per-line auto-persist completes before readline `close` and can never be truncated by `process.exit`; `.agda-mcp/` and `.claude/` gitignore claims hold (`.gitignore:30,48`).

**Remaining issues:** three Warnings — one fidelity gap in the flake-replay environment (the concrete root cause behind iter2 WR-01's "broken replay environment" hypothetical), one remaining unguarded stream error path, and one exit-code regression introduced by the WR-04 fix — plus three carried-forward Info items and one new minor Info.

## Narrative Findings (AI reviewer)

### Warnings

#### WR-01: Flake-gate replay omits the materialized `AGDA_DIR` (and library flags) that ORCL-01's own cold replay reconstructs — library-dependent candidates are judged in a different environment than the one that confirmed them

**File:** `scripts/dogfood/flake-classify.mjs:160-166` (contrast: `scripts/oracle/orcl-01-differential.mjs:399-405`)
**Issue:** `materializeCaptureEnvironment` builds *two* temp dirs — `tmpDir` (inlined sources) and `agdaDirTmp` (the replayed `AGDA_DIR` `libraries`/`defaults` files) — precisely so a replay is faithful to the captured library registration. ORCL-01's cold differential uses both: `env: { ...process.env, AGDA_DIR: materialized.agdaDirTmp }` plus `extraSpawnArgs: libraryFlags` (the `-l` flags split from `mergedArgv`). The flake gate's warm replay uses only `projectRoot: materialized.tmpDir` and never passes `AGDA_DIR` — even though `createMcpHarness` already accepts `extraEnv` (`test/helpers/mcp-harness.ts:16,24,38`). Two consequences: (a) the replayed server inherits the *operator's ambient* `AGDA_DIR` via `...process.env` (unpinned real libraries) instead of the captured, hermetic one; (b) for a capture from a library-registered session (agda-unimath / codex-homotopy-group / autoformalizing-hopf — the flagship corpora, whose dependency libraries are *not* in `inlinedFirstPartySources`), the replayed load cannot resolve library imports the way the judged session did. Depending on how the failure surfaces, N replays yield either all-null observations → `"replay-inconclusive"`/`"replay-failed"` (visible but the ORCL-01-confirmed candidate is never auto-filed — the wrapup's whole point) or a consistent wrong-environment classification → `"deterministic"` confirmation based on evidence from an environment ORCL-01 never judged. Either way, the N-rerun gate's verdict for the corpus class that matters most is computed against the wrong world.
**Fix:**
```js
const harness = await createHarness({
  serverRepoRoot: SERVER_REPO_ROOT,
  projectRoot: materialized.tmpDir,
  extraEnv: { AGDA_DIR: materialized.agdaDirTmp },
});
```
This restores hermetic isolation and named-library resolution parity with ORCL-01's cold path. Note the residual gap: ORCL-01 also replays spawn-time `-l` flags (`splitMergedArgv`); the harness server would need those too (e.g. via `AGDA_MCP_DEFAULT_FLAGS` derived from `artifact.manifest.mergedArgv`) for full parity — at minimum document the delta in the module header where the replay's fidelity contract is described.

#### WR-02: `process.stdout` has no `error` listener — an abrupt agent death during the finalize drain window crashes the proxy before `run-report.json` is written

**File:** `scripts/dogfood/dogfood-run.mjs:168` (per-line forward), `253-257` (final flush write)
**Issue:** The WR-04 (iter2) fix guarded `child.stdin` and transcript I/O, but the *other* half of the tee is still unguarded: every server line is forwarded with `process.stdout.write(...)`, and `process.stdout` has no `error` listener anywhere in the module. If the agent process dies abruptly (operator kills a wedged Codex/Claude session — a realistic dogfooding teardown), the read end of the proxy's stdout pipe closes; `fromAgent`'s `close` fires finalize, which then waits up to 2s for `fromServerClosed` — and any server line still draining through the `fromServer` `line` handler during that window is written to the broken pipe, raising an async `EPIPE` `'error'` event on `process.stdout` with no listener: an uncaught exception that kills the proxy *before* `writeRunReport` runs. No `run-report.json` means `dogfood-wrapup <run-id>` refuses to run ("no run report found") and every staged capture from the session goes unjudged by the auto-chain — the exact loss the WR-03/WR-04 fixes were meant to prevent. The final `process.stdout.write("", cb)` at line 254 has a try/catch, but that only covers synchronous throws, not the async `'error'` event.
**Fix:** Add once, before wiring the streams:
```js
process.stdout.on("error", () => {
  // Agent's read end is gone — forwarding is moot, but finalize
  // (run-report write) must still complete.
});
```
Optionally skip forwarding when `!process.stdout.writable`, mirroring the `child.stdin.writable` guard.

#### WR-03: Fix-introduced regression — a child spawn failure now exits 0 (previously a non-zero crash); subsumes iter2 IN-03's signal-death facet

**File:** `scripts/dogfood/dogfood-run.mjs:247` (`const exitCode = child.exitCode ?? 0;`), `264-272` (error → finalize routing)
**Issue:** Before commit `6c3ec32`, a spawn failure (missing `tsx`/`dist/index.js` interpreter path, EACCES) raised an unhandled `'error'` event on the child — an uncaught exception exiting non-zero. The WR-04 (iter2) fix correctly routes `child.on("error")` into `finalize()`, but finalize computes `child.exitCode ?? 0`, and a never-spawned child has `exitCode === null` — so the proxy now reports a *clean exit 0* when the server never started at all. The same expression also yields 0 for a spontaneously signal-killed child (`exitCode === null`, `signalCode` set) — iter2 IN-03, intentionally deferred then, now folded here since the same line needs the fix. The stderr message is emitted and the agent's `client.connect()` fails visibly, so nothing is silent — but any harness or CI wrapper gating on the proxy's exit status reads total startup failure as success, and this is a behavioral regression relative to the pre-fix crash.
**Fix:** Track abnormal termination explicitly:
```js
let childFailed = false;
child.on("error", (err) => { childFailed = true; /* existing stderr write */ void finalize(); });
// in finalize:
const exitCode = child.exitCode ?? (childFailed || (child.signalCode && !agentInitiatedShutdown) ? 1 : 0);
```
where `agentInitiatedShutdown` is set in the `fromAgent.on("close")` trigger (the proxy-initiated `child.kill()` path legitimately exits 0).

### Info

#### IN-01: Argv parsing accepts flag tokens as values and an unsanitized run id (carried forward from iter2; partially mitigated)

**File:** `scripts/dogfood/dogfood-wrapup.mjs:260-282`, `scripts/dogfood/dogfood-run.mjs:80-106`
**Issue:** Still valid: `parseWrapupArgv` takes `argv[0]` as `runId` unconditionally (`dogfood-wrapup.mjs --rerun-n 5` yields `runId === "--rerun-n"`); both parsers accept a following flag token as a value (`--manifest --corpus-root /x`, `--queue-path` with a missing value yields `undefined`); and `--run-id ../../x` is joined into the runs root unvalidated, writing run artifacts outside `.agda-mcp/runs/`. Partially mitigated since iter2: the `--rerun-n` facet now fails loudly (CR-01 fix) instead of silently propagating `NaN`. Local dev CLI, operator-only impact.
**Fix:** Reject a `runId`/flag value starting with `--`; optionally reject path separators in `--run-id`.

#### IN-02: Skill installer can create a dangling symlink and has no CLI error handling (carried forward from iter2, unchanged)

**File:** `scripts/dogfood/install-dogfood-skill.mjs:72-83,106-118`
**Issue:** `installDogfoodSkill` never checks that the canonical `.agents/skills/agda-dogfooding` directory exists before `symlinkSync`, so a partial checkout gets a broken `.claude/skills/` link reported as `"created"`; `scriptMain` lets `mkdirSync`/`symlinkSync` failures escape as raw stacks.
**Fix:** `if (lstatOrNull(canonical) === null) throw new Error(...)` before linking; wrap `scriptMain` body in try/catch with a one-line stderr message and `process.exitCode = 1`.

#### IN-04: `git check-ignore` test cannot distinguish "not ignored" from "git failed" (carried forward from iter2, unchanged)

**File:** `test/unit/tools/dogfood-install-skill.test.ts:60-71`
**Issue:** The "SKILL.md is not gitignored" test asserts only that `execFileSync` throws — but `git check-ignore` exits 1 for "not ignored" and 128 for errors (not a repo, bad path); both throw, so a broken invocation passes the test spuriously.
**Fix:** Catch the error and assert `(err as { status?: number }).status === 1`.

#### IN-05: Wrapup catch handler dereferences `staged.stagedPath` — a null/primitive `stagedCaptures` element still aborts the whole run the WR-05 fix isolates

**File:** `scripts/dogfood/dogfood-wrapup.mjs:334-342`
**Issue:** The per-capture isolation added for WR-05 (iter2) catches the try-block failure, but the catch handler itself evaluates `staged.stagedPath` twice (the stderr template at line 336 and the results entry at line 339). If a hand-edited/corrupt `run-report.json` contains a `null` (or primitive) element in `stagedCaptures`, the try block throws `TypeError` reading `stagedPath` — and the catch block throws the *same* `TypeError` again, escaping the loop: `scriptMain` rejects, no `wrapup-report.json` is written, remaining captures go unjudged. Recorder-written reports never contain such elements, so this is corruption-only — hence Info.
**Fix:** Hoist a safe path once at the top of the loop body: `const stagedPath = typeof staged?.stagedPath === "string" ? staged.stagedPath : String(staged?.stagedPath);` and use it in both the try and catch blocks.

---

_Reviewed: 2026-07-03T02:49:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
