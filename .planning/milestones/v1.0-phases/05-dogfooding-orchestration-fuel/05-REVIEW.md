---
phase: 05-dogfooding-orchestration-fuel
reviewed: 2026-07-03T03:15:00Z
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
  warning: 0
  info: 4
  total: 4
status: clean
---

# Phase 5: Code Review Report (auto-fix iteration 3 — final re-review)

**Reviewed:** 2026-07-03T03:15:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** clean (zero Critical, zero Warning; 4 open Info items recorded below)

## Summary

Final re-review after the iteration-3 fix commits `6b47100`, `975bef2`, `39d1fee`. `git diff f18ba4f..HEAD` confirms exactly four files changed since the iteration-2 review (`scripts/dogfood/flake-classify.mjs`, `scripts/dogfood/dogfood-run.mjs`, and their two unit-test files) — the other 18 in-scope files are bit-identical to the state iteration 2 already verified. All 58 in-scope unit tests pass; `tsc -p tsconfig.json --noEmit` is clean (the `tsconfig.test.json` errors are in `test/helpers/`/`test/property/` files outside this phase's file set and untouched by any phase-5 commit — pre-existing, out of scope).

**All three iteration-2 Warnings are verified fixed, with no new defects introduced:**

- **WR-01 (iter3) — fixed.** The flake-gate warm replay now passes `extraEnv: { AGDA_DIR: materialized.agdaDirTmp }` to `createHarness` (`flake-classify.mjs:204`). Cross-references verified: `materializeCaptureEnvironment` creates `agdaDirTmp` unconditionally via `mkdtempSync` and returns it (`orcl-01-differential.mjs:87,125`) — always a string, never `undefined`, including the `agdaDirContents === null` case (an empty temp dir, which is the faithful replay of "nothing captured" and still hermetically shadows the ambient config); `buildHarnessServerParameters` spreads `extraEnv` AFTER `process.env` (`test/helpers/mcp-harness.ts:36-40`), so the materialized `AGDA_DIR` overrides the operator's ambient one — identical semantics to ORCL-01's own cold-replay `env: { ...process.env, AGDA_DIR: materialized.agdaDirTmp }` (`orcl-01-differential.mjs:402`). The JSDoc deps typedef was updated to match (`agdaDirTmp` in the materializer's return shape, `extraEnv` in the harness options). New unit test 6 asserts per-iteration pairing (harness *i* gets materialization *i*'s `tmpDir`/`agdaDirTmp`). The residual `-l` spawn-flag delta is handled via the fix suggestion's documented-delta fallback: the module header (`flake-classify.mjs:18-44`) states the replay fidelity contract and gives a sound reason the flags cannot be bridged (the real server derives `-l` solely from `.agda-lib` discovery, which materialized roots deliberately lack, and `AGDA_MCP_DEFAULT_FLAGS` would route them through `Cmd_load`'s per-call option list — the misattribution channel Plan 02-03 empirically ruled out).
- **WR-02 (iter3) — fixed.** `process.stdout.on("error", () => {})` and `process.stderr.on("error", () => {})` are registered immediately after spawn, before any forwarding write (`dogfood-run.mjs:175-176`), closing the async-EPIPE crash window; the per-line forward is additionally guarded by `process.stdout.writable` (`dogfood-run.mjs:212-214`) with `recorder.recordToClientLine` deliberately ordered BEFORE the guard so no capture event is lost when forwarding is skipped. The stderr listener also protects the `child.stderr.pipe(process.stderr)` destination from an unhandled destination-error. Finalize's exit sequencing survives a broken stdout: a `write()` on an errored/destroyed stream invokes its callback (with an error the callback ignores) so `process.exit(exitCode)` still runs, and the surrounding try/catch (`dogfood-run.mjs:314-318`) covers the synchronous-throw case. A source-text regression test (behavior 5) pins both listeners — grep-shaped, but consistent with this repo's source-text invariant-test convention (`no-bare-command-strings.test.ts`). Listener accumulation is not reachable: `runDogfoodProxy` runs once per proxy process, and the unit tests import only the pure functions.
- **WR-03 (iter3) — fixed.** The exit-code regression is resolved by the pure, exported `computeProxyExitCode` (`dogfood-run.mjs:125-130`): numeric child exit codes pass through; a code-less death returns 1 unless the one legitimate case — the proxy's own `kill()` teardown — applies. `childFailed` is set in the `child.on("error")` handler before finalize is invoked (`dogfood-run.mjs:331-337`); `proxyKilledChild` captures `child.kill()`'s return value (`dogfood-run.mjs:279`), which is `false` for a never-spawned child, so a spawn failure can never masquerade as proxy-initiated teardown. Empirically re-verified the spawn-failure sequence on Node 24/darwin: `'error'` fires first, `kill()` on the failed child returns `false` (and emits no recursive `'error'`), then `'close'` fires — and finalize is idempotent, so the ordering is safe either way. One platform nuance found during verification (not a defect): on this Node/platform a spawn-failed child actually carries `exitCode = -2` (the negative errno) rather than `null`, so the passthrough branch returns -2 → `process.exit(-2)` → OS exit status 254 — non-zero via a different branch than the comment describes; the `childFailed` flag remains the guarantee for platforms/failure modes where `exitCode` stays `null`. Both branches yield non-zero, and the 7 new unit tests pin the full decision table including the exact regression case (`childExitCode: null, childFailed: true` → 1), the kill-guard-dominance case, the spontaneous-signal case (iter2 IN-03's facet, folded in as promised), the legitimate-teardown 0, and the still-alive-at-report 0. Composition with the live harness verified: the installed SDK 1.27.1's `StdioClientTransport.close()` is graceful (stdin `end()` → 2s grace → SIGTERM → 2s → SIGKILL), so the integration test's close path drives `fromAgent close → finalize → kill() → proxyKilledChild=true → exit 0`, keeping the `run-report.json` assertions in `dogfood-proxy-passthrough.test.ts` valid.

**New-defect hunt across the three fixes:** traced env-var propagation (`filterStringEnv` keeps the always-string `AGDA_DIR`; the harness applies `AGDA_MCP_ROOT` after `extraEnv` so it cannot be shadowed), listener lifecycle, the post-EPIPE exit write, `computeProxyExitCode` precedence when `childFailed` co-occurs with a numeric exit code (passthrough correctly wins), and the error-then-close race on the spawn-failure path (finalize's internal drain `await` yields the event loop, so the nextTick `'error'` handler runs before the `finally` computes the exit code — and the kill-guard-dominance test covers the overlap anyway). Nothing new found. No source files outside the four fix-touched files changed; iteration 2's verification of the remaining 18 files stands.

**Remaining issues:** only the four carried-forward Info items (IN-01/IN-02/IN-04/IN-05 — intentionally out of fix scope per the orchestrator; re-verified still present at their unchanged locations). Zero Critical, zero Warning → status **clean**.

## Narrative Findings (AI reviewer)

### Info

#### IN-01: Argv parsing accepts flag tokens as values and an unsanitized run id (carried forward; partially mitigated since iter1)

**File:** `scripts/dogfood/dogfood-wrapup.mjs:260-282`, `scripts/dogfood/dogfood-wrapup.mjs:304`, `scripts/dogfood/dogfood-run.mjs:80-106`, `scripts/dogfood/dogfood-run.mjs:149`
**Issue:** Still valid: `parseWrapupArgv` takes `argv[0]` as `runId` unconditionally (`dogfood-wrapup.mjs --rerun-n 5` yields `runId === "--rerun-n"`); both parsers accept a following flag token as a value (`--manifest --corpus-root /x`; a trailing `--queue-path` with no value yields `undefined`); and `--run-id ../../x` is joined into the runs root unvalidated (`join(resolveRunsRoot(), runId)` at `dogfood-run.mjs:149` / `dogfood-wrapup.mjs:304`), writing run artifacts outside `.agda-mcp/runs/`. Partially mitigated: the `--rerun-n` facet now fails loudly (CR-01 fix, iter2). Local dev CLI, operator-only impact.
**Fix:** Reject a `runId`/flag value starting with `--`; optionally reject path separators in `--run-id`.

#### IN-02: Skill installer can create a dangling symlink and has no CLI error handling (carried forward, unchanged)

**File:** `scripts/dogfood/install-dogfood-skill.mjs:72-83,106-118`
**Issue:** `installDogfoodSkill` never checks that the canonical `.agents/skills/agda-dogfooding` directory exists before `symlinkSync` (line 82), so a partial checkout gets a broken `.claude/skills/` link reported as `"created"`; `scriptMain` (lines 106-118) lets `mkdirSync`/`symlinkSync` failures escape as raw stacks.
**Fix:** `if (lstatOrNull(canonical) === null) throw new Error(...)` before linking; wrap `scriptMain`'s body in try/catch with a one-line stderr message and `process.exitCode = 1`.

#### IN-04: `git check-ignore` test cannot distinguish "not ignored" from "git failed" (carried forward, unchanged)

**File:** `test/unit/tools/dogfood-install-skill.test.ts:60-71`
**Issue:** The "SKILL.md is not gitignored" test asserts only that `execFileSync` throws — but `git check-ignore` exits 1 for "not ignored" and 128 for errors (not a repo, bad path); both throw, so a broken invocation passes the test spuriously.
**Fix:** Catch the error and assert `(err as { status?: number }).status === 1`.

#### IN-05: Wrapup catch handler dereferences `staged.stagedPath` — a null/primitive `stagedCaptures` element still aborts the whole run the WR-05 (iter2) fix isolates

**File:** `scripts/dogfood/dogfood-wrapup.mjs:334-342`
**Issue:** The per-capture isolation catches the try-block failure, but the catch handler itself evaluates `staged.stagedPath` twice (the stderr template at line 336 and the results entry at line 338). If a hand-edited/corrupt `run-report.json` contains a `null` (or primitive) element in `stagedCaptures`, the try block throws `TypeError` reading `stagedPath` — and the catch block throws the same `TypeError` again, escaping the loop: `scriptMain` rejects, no `wrapup-report.json` is written, remaining captures go unjudged. Recorder-written reports never contain such elements, so this is corruption-only — hence Info.
**Fix:** Hoist a safe path once at the top of the loop body: `const stagedPath = typeof staged?.stagedPath === "string" ? staged.stagedPath : String(staged?.stagedPath);` and use it in both the try and catch blocks.

---

_Reviewed: 2026-07-03T03:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
