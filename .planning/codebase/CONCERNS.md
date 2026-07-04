# Codebase Concerns

**Analysis Date:** 2026-07-04

## Tech Debt

**Shared mutable per-command state in `AgdaTransport`:**
- Issue: `src/session/agda-transport.ts` (497 lines — the largest file in `src/`, 3 lines under the hard 500-line ceiling) keeps `buffer`, `responseQueue`, `collecting`, `currentCommandKind`, `sawStatusDone`, `idleDoneTimer`, `controlEscalationTimer`, `lastResponseAt`, and `lastResponseKind` as instance fields shared across every in-flight command rather than scoped to one. Phase 3.1 (commit `3374b12`) extracted goal-terminus tracking into its own pure-function module, `src/session/load-terminus-tracker.ts` (`LoadTerminusState`, `createLoadTerminusState`, `recordLoadTerminusResponse`, `isLoadTerminusSatisfied`) — a genuine improvement — but the transport class itself still centralizes four independent timing concerns on shared mutable fields: regular-command idle completion, control-command flush/escalation (`controlEscalationTimer`, `DEFAULT_CONTROL_ESCALATION_MS = 5000`), per-command timeout, and control-echo filtering (`CONTROL_RESPONSE_KINDS`). Each concern is documented with an inline comment explaining exactly which race it closes (e.g. `handleStdout`'s carve-out for a late `DoneAborting`/`DoneExiting` arriving after the flush window but before escalation), which is good documentation but signals the design itself still requires per-race reasoning rather than structural prevention.
- Files: `src/session/agda-transport.ts`, `src/session/command-completion.ts`, `src/session/load-terminus-tracker.ts`
- Impact: this file has been the site of five distinct race-condition fixes across its history (`7ce54fc`, `d4fb86b`, `c77bd9a` — the 0.6.7 resource-leak family, nine-plus rounds of Copilot review on PR #56 — `e38f90a` — #65/#66 — and `3374b12`). No open GitHub issue currently tracks a further structural refactor of the class. New timing-sensitive bugs remain plausible as Agda's response ordering varies across versions (2.7–2.8 emit goals before `Status`; 2.9.0 emits them after — see `tooling/protocol/data/official-cross-version-notes.json`).
- Fix approach: continue the Phase 3.1 pattern — extract one more timing concern per pass (e.g. control-escalation) into its own pure-function module under `src/session/`, unit-testable without a real subprocess, following `load-terminus-tracker.ts` as the template. The file has no headroom left under the 500-line ceiling for organic growth, so the next feature touching this file should be preceded by an extraction, not followed by one.

**`.agdai` interface cache remains independent of the import graph:**
- Issue: `findAgdaiArtifacts` (`src/agda/agdai-cache.ts`) still performs a from-scratch filesystem scan on every call and does not consult `src/agda/import-graph.ts`'s dependency graph to determine transitive staleness. The two modules remain architecturally separate — `import-graph.ts` is consumed only by `src/tools/impact-tool.ts`, `src/tools/agent-ux/project-tools.ts`, `src/tools/agent-ux/import-tools.ts`, and `src/agda/session-capture/import-closure-hash.ts` (rename/impact/dedup-fingerprint tooling), never by the load or cache-bust path.
- Files: `src/agda/agdai-cache.ts`, `src/agda/import-graph.ts`, `src/agda/session-load-impl.ts`
- Impact: lower-stakes than it was previously assessed to be. The specific false-green this gap was blamed for (GitHub #64/#61: a transitively-imported dependency edited mid-session still reporting `ok-complete`) is closed via a different mechanism — `agda_load_no_metas`'s completion detection was made strict (any remaining interaction point, invisible goal, or source hole now forces `type-error`; see `src/session/load-terminus-tracker.ts`'s `isLoadTerminusSatisfied`) — not by wiring the cache to the import graph. `test/fixtures/capture-regression-matrix.json`'s `issue-64-61-transitive-staleness` and `guard-no-metas-clean-load-under-fault-injection` entries are both `locked`. This is retained as an architecture note in case an equivalent staleness report ever surfaces on the `agda_load` (metas) path specifically, which has no matrix-locked regression test for this scenario the way `agda_load_no_metas` does.
- Fix approach: no action needed unless a new staleness report surfaces on `agda_load`; if so, reuse `computeImpact`'s reverse-dependency walk (`src/agda/import-graph.ts`) as a pre-load freshness check rather than building a second graph walker.

**File-size pressure building across `src/`:**
- Issue: beyond `agda-transport.ts` (497 lines), six more files sit within 100 lines of the 500-line ceiling: `src/agda/session.ts` (477), `src/tools/agent-ux/project-tools.ts` (454), `src/tools/tool-registration.ts` (425), `src/tools/analysis-tools.ts` (422), `src/session/project-config.ts` (405), `src/agda/import-graph.ts` (364).
- Files: as listed above.
- Impact: none currently exceed the hard ceiling, and the barrel-plus-siblings split pattern the project already uses elsewhere (`src/agda/agent-ux.ts` → `error-classifier.ts`/`source-parsers.ts`/`refactor-helpers.ts`/`clause-fixity.ts`; `src/session/apply-proof-edit.ts` → `safe-source-io.ts`/`apply-goal-edit.ts`/`apply-batch-edits.ts`/`apply-text-edit.ts`) has not yet been applied to any of these six. The next feature addition to one of them risks an emergency split under time pressure rather than a planned one.
- Fix approach: no action required today. Treat a PR adding more than ~20 lines to any of these six files as a trigger to pre-emptively extract a sibling module using the existing barrel pattern, rather than waiting for the 500-line gate to force it.

**`assertSafeRunId` duplicated verbatim across both dogfood CLIs:**
- Issue: the identical run-id validation function body (same condition, same character-class checks) exists independently in `scripts/dogfood/dogfood-run.mjs:110-116` and `scripts/dogfood/dogfood-wrapup.mjs:434-440`. Both copies are correct today, but a future change to the validation rule (e.g. a length cap, or rejecting NUL bytes) applied to only one copy would silently leave the other CLI under-validated.
- Files: `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`
- Impact: low today (both copies verified byte-identical and correct against the real default run-id shape), but a latent source of divergence.
- Fix approach: extract to a shared module, e.g. `scripts/dogfood/run-id.mjs` exporting `assertSafeRunId`, imported by both CLIs. (Filed as Info-1 in `.planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md`; explicitly out of scope for that phase's fix pass.)

## Known Bugs

**Oracle tooling: `orcl-01-differential.mjs` never re-materializes the project's `.agda-lib` for multi-include-root corpora:**
- Symptoms: a cold-replay judgment reports `success:false / classification:'type-error' / coldCategories:["FileNotFound"]` against a project whose live/warm session loaded cleanly, purely because the materialized temp directory has no project file telling Agda about a second include root.
- Files: `scripts/oracle/orcl-01-differential.mjs` (`materializeCaptureEnvironment()`) — confirmed it writes every `artifact.manifest.inlinedFirstPartySources` entry into a fresh temp directory but never re-materializes `.agda-lib` itself, while `artifact.manifest.agdaDirContents.libraries` still records the original, non-materialized absolute path.
- Trigger: judge a capture from a real multi-directory-include-root Agda project (e.g. a project with `include: src, agda-unimath/src` in its `.agda-lib`). Never triggers against the single-file disposable fixtures used by the RT1–RT8 regression specs, since none declares a second include root.
- Workaround: none. Confirmed via `test/fixtures/fix-queue.json` fingerprint `2eb1768df88bfb07` (`triaged`, recurrence 2 — independently rediscovered once by the local judge and once by the team-channel cron re-ingest of the same uploaded archive), first observed 2026-07-04 during the E2E-01 live acceptance run against the real Codex-Homotopy-Group corpus. Deferred as scripts/-only, out of any current phase's committed file scope.

**Oracle tooling: `orcl-01-differential.mjs`'s cold-replay scans for source holes unconditionally, unlike the live server's gated scan:**
- Symptoms: on a failed load, the cold and warm `hasHoles` fields can disagree (cold reports `true`, live/warm reports `false`) even though `success`/`classification`/`goalCount`/`invisibleGoalCount` all agree.
- Files: `scripts/oracle/orcl-01-differential.mjs` (`runColdLoadAndDiff()` calls `countExplicitSourceHoles` unconditionally) vs. `src/agda/session-load-impl.ts` (the live `needsExplicitHoleScan` gate only scans when `parsed.success && goals.length === 0 && invisibleGoalCount === 0`).
- Trigger: any failed load on a file that also happens to contain a syntactically valid `{!!}`/`?` hole elsewhere.
- Workaround: none. Confirmed via fingerprint `1220f2840142aab8` (`triaged`). Not an independent live-server defect — the real client-facing gap this surfaces (no dedicated source-hole-syntax field, folded into a single `hasHoles` boolean) is tracked separately below (Missing Critical Features).

**Oracle tooling: `orcl-02-soundness-scan.mjs`'s postulate-block parser mis-splits multi-line type signatures:**
- Symptoms: a `postulate` block whose type signature wraps onto a continuation line (e.g. `is-trunc-type-trunc :\n    {l : Level} ...`) is reported as two-or-more separate "unsanctioned postulate" findings, several with a garbled non-identifier `detail` field (observed fragments include `"{l"`, `"(trunc"`, `"k"`, `"A)"` — not real postulate names).
- Files: `scripts/oracle/orcl-02-soundness-scan.mjs` (postulate-block detector: does not recognize an indented continuation line as part of the preceding declaration).
- Trigger: any real, multi-line postulate signature. Never triggered by the project's own existing fixtures, which use single-line postulates only.
- Workaround: manual review required for any capture flagged with a `detail` field that is not a plausible identifier. Confirmed via fingerprint `2eb1768df88bfb07` against `agda-unimath`'s `truncations.lagda.md`/`partitions.lagda.md` (13 findings total; all are either agda-unimath's own long-standing legitimate library postulates or outright parsing artifacts — zero were introduced by the judged session).

**Codex `exec` mode cancels every MCP tool call after the first (external, documented, not fixable in this repo):**
- Symptoms: `codex exec` (codex-cli 0.142.5) reports "user cancelled MCP tool call" for every tool call beyond the first in a session. Interactive Codex is unaffected.
- Files: none in this repo — this is Codex's own client-side behavior. Evidence recorded in `test/fixtures/fix-queue.json` fingerprint `0bc76d15c2fec8df`'s notes: three `codex exec`-driven runs on 2026-07-04 recorded 0–3 tool calls each and never completed a multi-step proof, versus one interactive Codex session that completed a clean 8-call load→case-split→give→typecheck→proof-status flow.
- Workaround: none available server-side. Dogfooding sessions intended to exercise a multi-step proof currently need interactive Codex rather than `codex exec` until this is fixed upstream.

**Codex hard-kills the MCP server process on both interactive quit and `codex exec` completion (external, documented; mitigated on the server side):**
- Symptoms: Codex terminates the process it directly manages (the `dogfood-run.mjs` proxy, and transitively `dist/index.js`) with no SIGTERM/SIGINT/SIGHUP — an uncatchable kill — on ordinary session end, not only on error.
- Files: none in this repo directly cause this; it is why `scripts/dogfood/dogfood-run.mjs` now writes an incremental `run-report.json` checkpoint (`buildReportSnapshot`/`scheduleReportWrite`) immediately after run-dir creation and after every recorded tool call, marked `finalized:false`, rather than only inside a graceful `finalize()`. `scripts/dogfood/dogfood-wrapup.mjs`'s `checkReportFinalized()` accepts a `finalized:false` report with a loud warning instead of refusing the run outright.
- Current mitigation: fixed and regression-locked via fingerprint `0bc76d15c2fec8df` (`locked`), with coverage in `test/unit/tools/dogfood-run-report-checkpoint.test.ts` (startup checkpoint, SIGKILL-to-process-group leaves `finalized:false`, SIGTERM-to-process-group finalizes with exit metadata) and `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts`. Live end-to-end re-verified 2026-07-04 (run-id `e2e-01-chg-2026-07-04T16-06-18-000Z`) through the real upload → ingest → cron-judge chain.
- Residual risk: any run recorded before this fix landed (the original interactive acceptance session, run-id `2026-07-04T14-47-00-924Z-442e77f2`) has no `run-report.json` at all — not even a `finalized:false` one — and remains permanently unprocessable by `dogfood-wrapup.mjs`. This is accepted as forward-looking-only; report reconstruction for a pre-fix run is out of scope. The underlying Codex behavior (hard-kill with no signal) is unchanged upstream — only this server's tolerance of it has improved.

## Security Considerations

**Symlink and file-size hardening (already addressed, worth preserving):**
- Risk: TOCTOU symlink-substitution race on proof-edit file reads/writes; unbounded file size causing OOM/scanner slowdown; path escape outside the sandboxed repo root.
- Files: `src/session/safe-source-io.ts` (`O_NOFOLLOW` read guard confirmed at line 80; `MAX_AGDA_SOURCE_BYTES = 512 * 1024` confirmed at line 39; atomic temp-file+rename writes with a `wx` flag), `src/agda/agdai-cache.ts` (`findAgdaProjectRoot`'s explicit repo-root sandbox boundary).
- Current mitigation: implemented and unchanged; verified directly against current source.
- Recommendations: reuse `src/session/safe-source-io.ts` for any new file-write tool rather than adding a parallel ad hoc read/write path.

**Fatal-protocol-stderr classification is pattern-based, not exhaustive:**
- Risk: `throwOnFatalProtocolStderr` (`src/agda/protocol-errors.ts`, 18 lines) matches only three regex patterns (`^cannot read:`, `^failed to parse`, `^invalid\b`) against stderr text to decide whether to throw. Any fatal Agda-side stderr message that doesn't match one of these three prefixes silently passes through as a non-fatal `StderrOutput` response instead of aborting the command.
- Files: `src/agda/protocol-errors.ts` — verified unchanged (still 3 patterns, 18 lines).
- Current mitigation: the file is small and the patterns are documented as intentional; stderr not matching these patterns still surfaces in the response queue for the caller to inspect.
- Recommendations: revisit alongside `tooling/protocol/data/official-cross-version-notes.json` whenever a new Agda version is pinned (`maxTestedAgdaVersion` in `package.json`).

**CI `verify` job has no explicit `permissions` scope:**
- Risk: `.github/workflows/ci.yml`'s `verify` job (lines 9–32) — which checks out, installs, typechecks, audits, and packs — has no `permissions:` key at all, so it inherits the repository/org default `GITHUB_TOKEN` scope, which can be broader than needed. The sibling `integration` job (line 37) explicitly scopes to `permissions: contents: read`.
- Files: `.github/workflows/ci.yml`
- Current mitigation: none for this job; the `integration` job's narrower scope is unaffected.
- Recommendations: add the same explicit least-privilege block to the `verify` job (`permissions:\n  contents: read`). Filed as Info-3 in `.planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md`; not yet applied.

## Performance Bottlenecks

**Metas re-query recovery on every clean-looking load:**
- Problem: `reconcileGoalsViaMetas` (`src/agda/session-load-helpers.ts:114`, invoked from `runLoad` in `src/agda/session-load-impl.ts:108` and `:132`) issues an additional `Cmd_metas` round trip whenever a load reports success, adding a second command send/receive cycle on the common path.
- Files: `src/agda/session-load-impl.ts`, `src/agda/session-load-helpers.ts`
- Cause: needed to reconcile goal IDs that IOTCM's `Cmd_load` response can under-report, and doubles as the recovery path when source holes exist but no goal IDs were captured.
- Improvement path: the source-hole scan (`countExplicitSourceHoles`) is already gated to run only when the protocol looks clean and reports zero goals; the same "skip when the protocol already told us" pattern could be extended to `reconcileGoalsViaMetas` if profiling shows the extra round trip matters on large modules. No profiling evidence currently indicates this is necessary.

**Metas `Cmd_load` idle window is 8x the default (2000ms vs 250ms):**
- Problem: `configuredGoalTerminusIdleMs()` (`src/session/command-completion.ts:73`) defaults to 2000ms, required to survive the compute gap a large module takes serializing its goal state — but this is the wait applied whenever a metas load's terminus hasn't yet been observed, not merely a ceiling, so large modules pay close to the full window even in the current implementation.
- Files: `src/session/command-completion.ts`, `src/session/agda-transport.ts`
- Cause: Agda's own compute time on large modules, not an MCP-server inefficiency.
- Improvement path: `AGDA_MCP_LOAD_TERMINUS_IDLE_MS` is already exposed for tuning in slower/faster environments; no further action needed unless a protocol-level "done" signal becomes available from Agda itself.

## Fragile Areas

**`AgdaTransport` idle/timeout/terminus/control-escalation state machine:**
- Files: `src/session/agda-transport.ts`, `src/session/command-completion.ts`, `src/session/load-terminus-tracker.ts`
- Why fragile: the class mixes four independent timing concerns on shared mutable fields — regular-command idle completion, control-command flush/escalation (a 5-second kill-escalation timer for a wedged proc that ignores `Cmd_abort`/`Cmd_exit`), per-command timeout, and load-terminus tracking (delegated but still consumed inline) — each with its own "invalidate at command start" discipline enforced by convention, not the type system. Extensive inline comments document exactly which race each guard closes (control-echo filtering in `recordCollectedResponse`, late-stdout dropping while `!collecting` in `handleStdout`, `StderrOutput` deliberately excluded from terminus detection).
- Safe modification: change only via the pure-function helpers in `src/session/command-completion.ts` and `src/session/load-terminus-tracker.ts` where possible (unit-testable without a real subprocess); avoid adding new fields directly to `AgdaTransport` without extending the existing "reset at command start" contract already established for `sawStatusDone`/`lastResponseAt`/`lastResponseKind`/`terminus`.
- Test coverage: `test/unit/session/agda-transport.test.ts`, `test/unit/session/command-completion.test.ts`, `test/unit/agda/session-load-impl.test.ts` cover the documented races. Six of `agda-transport.test.ts`'s fake-`ChildProcess` call sites (lines 351, 415, 459, 517, 571, 679) now type their `stdin.write`/`once`/`on` mocks as `(...args: any[]): any` to satisfy the `typecheck:test` CI gate — confirmed behavior-preserving today, but see Test Coverage Gaps below for the signal this weakens.

**Write-capable proof-tool reload-outcome reporting silently wraps a real failure in `ok:true`:**
- Files: `src/tools/tool-registration.ts` (`registerTextTool`, `registerGoalTextTool` — both unconditionally wrap a non-throwing callback result in `okEnvelope`), `src/session/reload-and-diagnose.ts` (reports a post-write reload failure only as prose inside `data.text`, never a structured field)
- Why fragile: every write-capable proof tool built on these two registration helpers — `agda_case_split`, `agda_give`, `agda_refine`, `agda_refine_exact`, `agda_intro`, `agda_auto`, `agda_apply_edit` — inherits the same shape: a post-write reload that itself fails (e.g. the edit introduced an ill-typed reference) still returns top-level `ok:true`, with the real error visible only by parsing prose in `data.text`. Confirmed live: `agda_apply_edit` returned `ok:true`/`data.applied:true` while `data.text` read "Reloaded with errors: 0 goal(s) remaining" plus the raw `NotInScope` error and a misleading "Goal diff: solved ?0, ?1, ?2" (fix-queue fingerprint `a0ae86c7deb9754e`, RT5).
- Safe modification: do not add a new write-capable proof tool on `registerTextTool`/`registerGoalTextTool` assuming reload failure is surfaced structurally — it isn't, for any of the seven current tools. A correct fix requires a schema-level addition (e.g. `reloadOk`/`postReloadDiagnostics`) applied consistently across all seven, which is why it remains deferred rather than patched tool-by-tool (see Missing Critical Features).
- Test coverage: none yet for the structural gap itself; `a0ae86c7deb9754e` and its auto-filed sibling `1b612dfeb1d31ea9` (same incident — `agda_apply_edit`'s internal reload is invisible to `scripts/oracle/orcl-01-differential.mjs`'s warm-tuple lookup, which matches only `/^agda_(load|typecheck)/`-named actions) remain `triaged`, not regression-locked.

## Scaling Limits

**Agda source file size cap:**
- Current capacity: 512 KiB per source file (`MAX_AGDA_SOURCE_BYTES` in `src/session/safe-source-io.ts:39`), described in-source as roughly 5x the largest real-world Agda file the project has observed.
- Limit: any file exceeding this is refused for editing via `agda_apply_edit` and related tools — by design, treated as "not something this tool should edit" (generated/vendored code) rather than a bug.
- Scaling path: the cap is a constant; raising it would need a corresponding review of `applyTextEdit`'s in-memory full-rebuild approach and `findGoalPositions`'s O(n) scan cost.

**Single interactive Agda process per session, single in-flight command:**
- Current capacity: `AgdaTransport.sendCommand`/`sendFireAndForgetCommand` both mutate the same shared `buffer`/`responseQueue`/`collecting` state — there is no concurrent command pipelining against one Agda process (enforced structurally by the single-`AgdaSession`-per-server invariant, issue #39).
- Limit: throughput is bounded by Agda's own per-command latency; a large module's 2000ms goal-terminus wait is the slowest common path today.
- Scaling path: Agda's own interaction protocol is inherently serial per process, so no in-repo refactor adds concurrency against a single Agda process; a further `AgdaTransport` state-extraction pass (see Tech Debt) would improve cancellation clarity but not throughput.

## Dependencies at Risk

**Minimal runtime dependency surface (low risk, noted for completeness):**
- Risk: `package.json` declares only `@modelcontextprotocol/sdk` (`^1.12.0`) and `zod` (`^4.0.0`) as runtime dependencies. Dev dependencies are `@fast-check/vitest`, `@types/node`, `tsx`, `typescript`, `vitest` — five packages total, all build/test-time only.
- Impact: small surface; a breaking `zod` major-version upgrade would ripple through `src/protocol/response-schemas.ts` and every `src/tools/*` file, but no other runtime dependency exists to introduce transitive-CVE churn.
- Migration plan: no action needed. `npm audit --audit-level=high` runs as a dedicated CI step (`.github/workflows/ci.yml`'s `verify` job) and currently exits clean.

## Missing Critical Features

**No structured reload-outcome field across write-capable proof tools (blocks trustworthy `ok:true`):**
- Problem: as detailed under Fragile Areas above, none of `agda_case_split`/`agda_give`/`agda_refine`/`agda_refine_exact`/`agda_intro`/`agda_auto`/`agda_apply_edit` has a structured field distinguishing "the write succeeded and the reload confirmed it" from "the write succeeded but the reload found a real error." A fix requires a schema-level addition (e.g. `reloadOk`/`postReloadDiagnostics`) threaded consistently across `src/tools/tool-registration.ts` and `src/session/reload-and-diagnose.ts`.
- Blocks: an agent trusting a write-tool's top-level `ok:true` can silently commit a proof step that a fresh reload has already flagged as broken — precisely the "false green" failure class this project's oracle triad exists to catch on the read path, unaddressed on the write path. Deferred explicitly in Phase 6 (exceeds a single wave's file-count budget: fixing only the probed tool would leave the other six tools' identical gap unaddressed). Fix-queue fingerprints `a0ae86c7deb9754e` and `1b612dfeb1d31ea9` remain `triaged`.

**`agda_load`'s response schema conflates five distinct load states:**
- Problem: `agda_load`'s response schema (`loadDataSchema`) exposes visible goals (`goalCount`/`goalIds`) and hidden metas (`invisibleGoalCount`) directly, and file completeness via `isComplete`/`classification` — but two states remain conflated: (1) source-hole syntax has no field of its own; `classifyLoadResult` (`src/agda/session-load-helpers.ts`) folds a text-scanned `sourceHoleCount` into a single derived `hasHoles` boolean, invisible to a client as a count or as distinct from a protocol-reported goal — and a hole co-occurring with an unrelated hard type error is never scanned for at all, since `runLoad`'s `needsExplicitHoleScan` gate only fires when `parsed.success` is true; (2) constraints have no field on `agda_load`'s own response schema whatsoever — they exist only on `agda_proof_status` (a related, narrower mislabeling — `agda_proof_status` could print "All goals solved." while `constraintsText` carried a real error — was fixed in Phase 6, wave 4, and is regression-locked in `test/unit/tools/analysis-tools.test.ts`).
- Blocks: a client cannot distinguish, from `agda_load` alone, "a genuine syntactic hole exists" from "no hole, but a constraint error is pending" from "truly complete." Deferred explicitly in Phase 6 as a response-schema rework exceeding a single wave's `<=2-src-file` fix appetite. Fix-queue fingerprint `ad2b6d31f58f1759` remains `triaged`.

**No timeout/process-state taxonomy on command timeout:**
- Problem: on a command timeout, `processErrorResult()` (`src/session/load-tool-shared.ts`) hardcodes the same crash/startup-shaped `nextAction` text ("The Agda subprocess crashed or could not be started...") for every `session.load()` throw, including the timeout `Error` thrown by `AgdaTransport.sendCommand` (`src/session/agda-transport.ts`) — which by that point has already terminated the Agda process via `terminateAgdaProcess(proc)`, a fact never communicated to the caller. `classification: "process-error"` cannot distinguish "timed out while Agda was still alive and actively responding" from "crashed on its own" from "never started" from "produced no protocol response at all" — confirmed live: a timeout after 15 real, in-flight protocol responses (the last only 96ms before the deadline) surfaced the identical misleading "crashed or could not be started" text.
- Blocks: an agent cannot tell a genuinely wedged/slow Agda process from one that never started, so it cannot choose a correct recovery action (retry vs. reinstall vs. increase timeout). Deferred explicitly in Phase 6 as a diagnostic-taxonomy design decision requiring a dedicated timeout/processState taxonomy fed from evidence (`responseCount`/`sawStatusDone`/`lastResponseKind`) `AgdaTransport` already collects but does not surface. Fix-queue fingerprint `b6821f42952c6ff8` remains `triaged`.

## Test Coverage Gaps

**Oracle-triad tooling has never been exercised against a real multi-file corpus in the regression suite:**
- What's not tested: `scripts/oracle/orcl-01-differential.mjs` and `scripts/oracle/orcl-02-soundness-scan.mjs` are exercised only against small, single-file, single-include-root disposable fixtures (`test/fixtures/agda/*.agda`, the RT1–RT8 specs, `test/fixtures/capture-regression-matrix.json`) — never a real, multi-directory, multi-include-root Agda project with multi-line postulate signatures.
- Files: `scripts/oracle/orcl-01-differential.mjs`, `scripts/oracle/orcl-02-soundness-scan.mjs`, `test/fixtures/capture-regression-matrix.json`
- Risk: this exact gap let three confirmed oracle-tooling defects (fingerprints `2eb1768df88bfb07` ×2, `1220f2840142aab8`; see Known Bugs) ship unnoticed until the first real-corpus run against Codex-Homotopy-Group on 2026-07-04. The oracle triad is this project's core false-green detection mechanism — a fidelity gap in the oracle itself undermines the stated Core Value ("every real proof session reliably converts into a stronger server").
- Priority: High.

**Any-typed transport test mocks weaken the new typecheck CI gate's signal:**
- What's not tested: six fake `ChildProcess` mocks in `test/unit/session/agda-transport.test.ts` (lines 351, 415, 459, 517, 571, 679) type their `stdin.write`/`once`/`on` methods as `(...args: any[]): any` rather than a precise signature, to satisfy the `typecheck:test` CI gate added this phase (`npm run typecheck:test`, `.github/workflows/ci.yml`).
- Files: `test/unit/session/agda-transport.test.ts`
- Risk: a future change to `AgdaTransport`'s callback signatures could silently stop matching these six mocks without `tsc` ever flagging it, since `any` opts them out of argument-shape checking entirely.
- Priority: Low (confirmed genuinely behavior-preserving today via `git show`; only a latent gap in future-change detection). Filed as Info-2 in `.planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md`.

**Cross-Agda-version response-ordering variance is exercised against one pinned version only:**
- What's not tested: Agda 2.7–2.8 emit goal-state events before `Status`, while 2.9.0 emits them after (per commit `e38f90a`'s own investigation notes); the test suite's real-Agda integration tests (`test/integration/agda/*.test.ts`, gated by `shouldRun`) run against a single pinned Agda version in CI. GitHub issue #41 (multi-version Agda matrix, referenced in `test/integration/mcp/mcp-server.test.ts:97`) is open and blocked on upstream `setup-agda@v2` tooling.
- Files: `test/integration/agda/*.test.ts`, `.github/workflows/ci.yml`
- Risk: a future default-pinned-Agda-version bump could reintroduce a #65/#66-class ordering bug undetected by CI.
- Priority: Medium (blocked on external tooling, not actionable from within this repo alone).

---

*Concerns audit: 2026-07-04*
