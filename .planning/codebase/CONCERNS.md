# Codebase Concerns

**Analysis Date:** 2026-07-01

## Tech Debt

**Shared mutable per-command state in `AgdaTransport` (root cause cluster):**
- Issue: `src/session/agda-transport.ts` keeps per-in-flight-command state — `buffer`, `responseQueue`, `collecting`, `idleDoneTimer`, `sawStatusDone`, `lastResponseAt`, `lastResponseKind`, `currentCommandKind`, `awaitGoalTerminus`, `sawInteractionPoints`, `sawAllGoalsWarnings`, `sawLoadError` — as fields on the class itself rather than scoped to a single command. Every "what if X arrives while Y is in flight" race (late stdout from a dying proc, late `DoneAborting`/`DoneExiting` control echoes, a stale `idleDoneTimer` firing on the wrong command, the fire-and-forget flush clearing `collecting` mid-flight) has required a one-off patch: epoch counters, kind filtering, queue clearing at command start, listener-swap ordering.
- Files: `src/session/agda-transport.ts` (535 lines), `src/session/command-completion.ts`
- Impact: Nine-plus rounds of Copilot review on PR #56 (0.6.7 resource-leak family) kept finding new instances of the same underlying pattern. New timing-sensitive bugs are likely to keep surfacing here as Agda's response ordering varies across versions (see GitHub issue #58: 2.7–2.8 emit goals before `Status`; 2.9.0 emits them after).
- Fix approach: tracked in GitHub issue #58 — encapsulate per-command state in an owned `CommandSlot` object (`AbortController`-based cancellation instead of an ad-hoc `EventEmitter` "error" event), so a previous command's late stdout/timer has nowhere to land instead of requiring kind-based filtering.

**Completion detection is a heuristic idle-timer, not a protocol-guaranteed signal:**
- Issue: Agda's `--interaction-json` protocol has no per-response command-completion tag. `src/session/agda-transport.ts` and `src/session/command-completion.ts` infer "the command is done" from response *kinds* and elapsed idle time (`configuredIdleCompletionMs` = 250ms default, `configuredPostStatusIdleCompletionMs` = 50ms, `configuredGoalTerminusIdleMs` = 2000ms for metas loads). This is the exact mechanism that caused the #65/#66 bugs (see "Recent Fixes" below): a compute gap during a large module's load was indistinguishable from "done" until a much longer idle window was added specifically for that path.
- Files: `src/session/agda-transport.ts`, `src/session/command-completion.ts`
- Impact: Any future Agda version whose response ordering or timing differs from the documented sequence (`tooling/protocol/data/official-cross-version-notes.json`) risks silently dropping trailing goal-state/error events again, or (the opposite failure) adding latency across the board.
- Fix approach: the `awaitGoalTerminus` terminus-tracking mechanism (explicit "have we seen `InteractionPoints` + `AllGoalsWarnings`, or a `DisplayInfo` `Error`") is the direction to extend for other command families that have a documented terminal event; env-var overrides (`AGDA_MCP_LOAD_TERMINUS_IDLE_MS`, `AGDA_MCP_IDLE_COMPLETION_MS`, `AGDA_MCP_COMMAND_TIMEOUT_MS`) exist as an escape hatch if a slow environment needs longer windows.

**`.agdai` interface cache is scanned from scratch on every call:**
- Issue: `findAgdaiArtifacts` in `src/agda/agdai-cache.ts` deliberately does not cache project-root or artifact lookups across calls — comment at the top of the file explains this is intentional (avoids bookkeeping desync when a user adds/removes an `.agda-lib` mid-session) — but it means every `agda_load`/cache-bust path walks the filesystem tree and lists version subdirectories.
- Files: `src/agda/agdai-cache.ts`
- Impact: Minor — the scan is O(directory depth) not O(repo size) — but on network filesystems or very deep monorepo layouts this is a per-load filesystem-syscall cost that scales with call frequency.
- Fix approach: no action needed unless profiling shows it matters; documented tradeoff is explicit in the source.

## Known Bugs

**False `ok-complete` from stale transitively-imported dependency interfaces (GitHub #64):**
- Symptoms: `agda_load`/`agda_typecheck` report `classification: "ok-complete"` for a file whose *dependency* was edited on disk mid-session (e.g. a record turned into a type synonym, or a re-export dropped from `public` to non-`public` `using`) — while a fresh `agda` invocation on the same pinned toolchain reports a hard error (`NotInScope`, missing export). `forceRecompile: true` does not help because it only busts the *named* file's `.agdai`, not its transitive dependencies'.
- Files: `src/agda/agdai-cache.ts` (per-file cache-bust, not transitive), `src/agda/session-load-impl.ts` (`runLoad`/`runLoadNoMetas`), `src/agda/import-graph.ts` (dependency graph exists but is not consulted for cache invalidation)
- Trigger: edit a dependency module's source after its interface has been loaded into the long-running interactive Agda session, then reload only the top-level file.
- Workaround: none in the codebase yet; the issue recommends treating `ok-complete` as advisory after any dependency edit and confirming with a from-scratch `agda` invocation. This is flagged as the single most dangerous class of bug for a verification tool ("false green") — an agent trusting `ok-complete` can commit code a fresh compiler rejects.

**Related false-pass class — unescalated metas/warnings and possible stale-cache overlap (GitHub #61):**
- Symptoms: `agda_typecheck`/`agda_load` return `ok-complete` for files the pinned Agda 2.9.0 compiler rejects with `ConstructorDoesNotFitInData` and `UnequalTypes` (hard errors — should be unaffected by warning-escalation flags) plus `UnsolvedMetaVariables`/`PatternShadowsConstructor` (only fatal under `--warning=error`, but still surprising as a default `ok-complete`).
- Files: `src/agda/session-load-impl.ts`, `src/agda/parse-load-responses.ts`, `src/agda/session-load-helpers.ts` (`classifyLoadResult`)
- Trigger: any of the four repro shapes in the issue; the hard-error cases (1, 2) look like the same stale-interface root cause as #64. The warning cases (3, 4) reflect the documented "warnings are not escalated to failures unless `--warning=error` is passed in `commandLineOptions`" behavior, which may need to become the default given CI commonly runs `-Werror`.
- Workaround: pass `commandLineOptions: ["--warning=error"]` explicitly to match `-Werror` CI settings; no mitigation exists yet for the stale-interface hard-error cases.

## Fragile Areas

**`AgdaTransport` idle/timeout/terminus state machine:**
- Files: `src/session/agda-transport.ts`, `src/session/command-completion.ts`
- Why fragile: the class mixes at least four independent timing concerns on shared mutable fields — regular-command idle completion, control-command flush/escalation, per-command timeout, and goal-terminus tracking for metas loads — with extensive inline comments documenting exactly which race each guard closes (control-echo filtering, late-stdout dropping while `!collecting`, `StderrOutput` deliberately excluded from terminus detection because it can appear on a truncated stream without any documented terminal event). Any modification risks reopening one of the previously-fixed races (see GitHub issue #58 for the full enumeration).
- Safe modification: change only via the `CommandCompletionSnapshot`/pure-function helpers in `src/session/command-completion.ts` where possible (these are unit-testable without a real subprocess); avoid adding new fields directly to `AgdaTransport` without extending the "invalidate at command start" contract already established for `sawInteractionPoints`/`sawAllGoalsWarnings`/`sawLoadError`.
- Test coverage: `test/unit/session/agda-transport.test.ts`, `test/unit/session/command-completion.test.ts`, `test/unit/agda/session-load-impl.test.ts`, `test/unit/agda/command-serialization.test.ts` cover the documented races, but the underlying design keeps producing new ones per issue #58 — coverage of *known* races is good, coverage of *unknown future* Agda-version response-ordering variance is inherently incomplete.

**Load classification pipeline (`runLoad`/`runLoadNoMetas`):**
- Files: `src/agda/session-load-impl.ts`, `src/agda/session-load-helpers.ts`, `src/agda/parse-load-responses.ts`
- Why fragile: classification depends on correctly distinguishing three goal categories (visible/InteractionPoints, invisible/AllGoalsWarnings.invisibleGoals, and a source-text regex fallback scan for `{!!}`/`?` holes) plus a metas re-query recovery path (`reconcileGoalsViaMetas`) triggered when the load stream dropped interaction points. The June 2026 fix (#65/#66, commit `e38f90a`) shows this pipeline has already had a load silently misreport a real type error as clean success, and a source hole surface with no goal ID (making it untargetable by goal-directed tools). Prior load-success state must be explicitly invalidated at the top of every load (`invalidatePriorLoadState`) to prevent a throwing/incomplete attempt from leaving stale "clean" state visible to `agda_proof_status`-style queries — a manual discipline rather than something the type system enforces.
- Safe modification: any change to response-kind handling in `parse-load-responses.ts` must be cross-checked against `tooling/protocol/data/official-cross-version-notes.json` (the documented cross-version response-ordering source of truth) and against the `awaitGoalTerminus` contract in the transport — do not assume a fixed response order.
- Test coverage: `test/unit/agda/session-load-impl.test.ts`, `test/unit/agda/parse-load-responses.test.ts`, plus fixture files `test/fixtures/agda/LargeDeepHole.agda`, `NamedHole.agda`, `NestedWhereHole.agda` added specifically to reproduce the #65/#66 compute-gap scenario. Known gap: transitive-dependency staleness (issues #64/#61) has no fixture or regression test yet.

**`.agdai` cache staleness is not consulted by the load/typecheck path:**
- Files: `src/agda/agdai-cache.ts` (cache discovery/bust exists), `src/agda/session-load-impl.ts` (does not query dependency freshness), `src/agda/import-graph.ts` (dependency graph exists but isn't wired into cache invalidation)
- Why fragile: `AgdaiArtifact.fresh` (mtime comparison) is computed and exposed via cache-inspection tools (`src/tools/cache-tools.ts`) but is not automatically consulted before reporting `ok-complete` — the actual bug reports (#64, #61) are exactly this gap. `forceRecompile` busts only the named file's own `.agdai`, not transitive dependencies', so the interactive session can keep serving in-memory interfaces for dependencies whose source changed after they were first loaded.
- Safe modification: any fix should walk the import graph (`src/agda/import-graph.ts` already computes it) to determine the transitive dependency set and compare each dependency's source mtime against its cached interface mtime before trusting a `ok-complete` classification, per the fix suggested in issue #64.
- Test coverage: none yet for the transitive-staleness scenario; the existing agdai-cache tests (`test/unit/agda/agdai-cache.test.ts` if present) cover single-file discovery/bust, not cross-module staleness detection.

## Performance Bottlenecks

**Metas re-query recovery on every "clean-looking" load:**
- Problem: `reconcileGoalsViaMetas` (invoked from `runLoad` in `src/agda/session-load-impl.ts`) issues an additional `Cmd_metas` round-trip whenever a load reports success, adding a second command send/receive cycle on the common path.
- Files: `src/agda/session-load-impl.ts`, `src/agda/session-load-helpers.ts`
- Cause: needed to reconcile goal IDs that IOTCM's `Cmd_load` response can under-report; also used as the #66 recovery path (re-query when source holes exist but no goal IDs were captured).
- Improvement path: the source-hole scan (`countExplicitSourceHoles`) is already gated to only run when the protocol looks clean and reports zero goals, avoiding I/O on large modules whose holes were already reported — this "avoid redundant work when protocol already told us" pattern could be extended to skip `reconcileGoalsViaMetas` when the load response already carried a complete/consistent goal-ID set, if profiling shows the extra round-trip matters on large modules.

**Metas `Cmd_load` idle window is 8x the default (2000ms vs 250ms):**
- Problem: `configuredGoalTerminusIdleMs()` defaults to 2000ms — required to survive the compute gap a large module takes serializing its goal state — but this is now the required wait whenever a metas load's terminus hasn't yet been observed (not merely a ceiling), so genuinely large modules pay close to the full window even in the fixed implementation.
- Files: `src/session/command-completion.ts` (`configuredGoalTerminusIdleMs`), `src/session/agda-transport.ts`
- Cause: Agda's own compute time on large modules, not an MCP server inefficiency — but the fix commit notes the kind-based first attempt at this timer added ~2000ms per step across the whole integration matrix (69s total) before being scoped down to only metas loads awaiting their terminus (bringing strict-phase steps back to ~273ms avg).
- Improvement path: env var `AGDA_MCP_LOAD_TERMINUS_IDLE_MS` is already exposed for tuning in slower/faster environments; no further action needed unless a protocol-level "done" signal becomes available from Agda itself.

## Security Considerations

**Symlink and file-size hardening (already addressed, worth preserving):**
- Risk: TOCTOU symlink-substitution race on proof-edit file reads/writes; unbounded file size causing OOM/scanner slowdown; path escape outside the sandboxed repo root.
- Files: `src/session/safe-source-io.ts` (`O_NOFOLLOW` read guard, `MAX_AGDA_SOURCE_BYTES` = 512 KiB cap, atomic temp-file+rename writes with `wx` flag), `src/agda/agdai-cache.ts` (`findAgdaProjectRoot`'s explicit repo-root sandbox boundary — refuses to walk above `repoRoot` even if Agda's own project-root resolution would)
- Current mitigation: extensive, already implemented per the commit history (`security: symlink+size hardening`, `security: harden agda_apply_edit and related file-write primitives`).
- Recommendations: preserve these invariants when adding new file-write tools (e.g. any future `agda_apply_rename` per the 0.7.0 triage doc) — reuse `src/session/safe-source-io.ts` rather than adding a parallel ad-hoc read/write path.

**Fatal-protocol-stderr classification is pattern-based, not exhaustive:**
- Risk: `throwOnFatalProtocolStderr` in `src/agda/protocol-errors.ts` matches only three regex patterns (`^cannot read:`, `^failed to parse`, `^invalid\b`) against stderr text to decide whether to throw. Any fatal Agda-side stderr message that doesn't match one of these three prefixes silently passes through as a non-fatal `StderrOutput` response instead of aborting the command.
- Files: `src/agda/protocol-errors.ts` (18 lines total — very small surface, easy to audit but also easy to have gaps)
- Current mitigation: the file is small and the patterns are documented as intentional; stderr not matching these patterns still surfaces in the response queue for the caller to inspect.
- Recommendations: if new Agda versions emit differently-worded fatal stderr, this list needs updating — worth revisiting alongside the cross-version notes file (`tooling/protocol/data/official-cross-version-notes.json`) whenever a new Agda version is pinned.

## Scaling Limits

**Agda source file size cap:**
- Current capacity: 512 KiB per source file (`MAX_AGDA_SOURCE_BYTES` in `src/session/safe-source-io.ts`), described as ~5x the largest real-world Agda file the project has observed.
- Limit: any file exceeding this is refused for editing via `agda_apply_edit` and related tools — by design, treated as "not something this tool should edit" (generated/vendored code) rather than a bug.
- Scaling path: the cap is a constant; if legitimate large generated Agda files need editing, the constant would need to move, with a corresponding review of `applyTextEdit`'s in-memory full-rebuild approach and `findGoalPositions`'s O(n) scan cost.

**Single interactive Agda process per session, single in-flight command:**
- Current capacity: the transport processes one command at a time (`sendCommand`/`sendFireAndForgetCommand` both mutate the same shared buffer/queue state); there is no concurrent command pipelining.
- Limit: throughput is bounded by Agda's own per-command latency; large modules with a 2000ms goal-terminus wait are the slowest path today.
- Scaling path: issue #58's proposed `CommandSlot` refactor could, in principle, enable a bounded command queue with clearer cancellation, but does not by itself add concurrency against a single Agda process (Agda's own interaction protocol is inherently serial per process).

## Dependencies at Risk

**Minimal runtime dependency surface (low risk, noted for completeness):**
- Risk: `package.json` declares only `@modelcontextprotocol/sdk` and `zod` as runtime dependencies — small surface, but recent commit history shows repeated Dependabot bumps for transitive dev/build dependencies (`vite`, `esbuild`, `hono`, `qs`, `postcss`, `ip-address`) requiring npm-audit-driven patch releases (e.g. commit `e38f90a`'s trailing "[chore] fix npm audit vulnerabilities").
- Impact: none of these are runtime-critical (all are build-tool transitive deps), but the frequency of Dependabot PRs indicates the dev-dependency tree has some depth worth periodically auditing (`npm audit`) rather than reacting one bump at a time.
- Migration plan: no action needed beyond continuing to merge Dependabot PRs promptly; consider `npm audit fix` as part of routine release prep (already done ad hoc per the commit history).

## Missing Critical Features

**No transitive dependency staleness detection (blocks trustworthy `ok-complete`):**
- Problem: as detailed in GitHub issues #64/#61, there is no mechanism to detect that a transitively-imported module's source changed after its interface was cached by the long-running interactive session. This is the single highest-impact gap: it produces false-green verification results.
- Blocks: safe agent-driven refactoring workflows where an agent edits a dependency and then repeatedly reloads a downstream file, trusting `ok-complete` as ground truth.

**No `agda_bulk_status` / cascade deduplication (per `docs/release-0.7.0-triage.md`):**
- Problem: no directory-wide parallel/sequential status sweep with shared-failure clustering exists yet.
- Blocks: efficient triage of large codebases with many files sharing a single root-cause failure (documented as "the 30-file survey costs 40 minutes" problem in the 0.7.0 triage doc).

**No pre-load error classifier (`agda_triage_error`, per `docs/release-0.7.0-triage.md`):**
- Problem: no machine-readable classification of a raw Agda compiler error into categories like `mechanical-import`, `mechanical-rename`, `parser-regression`, `coverage-missing`, `proof-obligation`, `dep-failure`, `toolchain`.
- Blocks: agents must pattern-match raw error text themselves rather than receiving a structured, confidence-scored classification with a suggested action.

## Test Coverage Gaps

**Transitive-dependency staleness (GitHub #64/#61):**
- What's not tested: no fixture or regression test reproduces "dependency edited mid-session, downstream file still reports ok-complete."
- Files: would need a new fixture pair (dependency + consumer module) plus a test in `test/unit/agda/session-load-impl.test.ts` or a new integration test under `test/integration/agda/`.
- Risk: this is an active, reported false-green bug with no regression coverage — highest-priority gap in the suite.
- Priority: High.

**Cross-Agda-version response-ordering variance:**
- What's not tested: the fix in commit `e38f90a` notes that Agda 2.7–2.8 emit goal-state events before `Status` while 2.9.0 emits them after; the test suite is pinned to Agda 2.9.0 only (per `test/integration/agda/agda-availability.test.ts` and the shouldRun-gated integration tests) so ordering regressions on other pinned versions are not exercised in CI. GitHub issue #41 (multi-version Agda matrix) is open and blocked on upstream `setup-agda@v2` tooling.
- Files: `test/integration/agda/*.test.ts` (gated by `shouldRun`), `.github/workflows/ci.yml`
- Risk: a future default-pinned-Agda-version bump could reintroduce a #65/#66-class bug if the new version's response ordering differs from what `command-completion.ts`/`agda-transport.ts` assume.
- Priority: Medium (blocked on external tooling per issue #41, not actionable from within this repo alone).

---

*Concerns audit: 2026-07-01*
