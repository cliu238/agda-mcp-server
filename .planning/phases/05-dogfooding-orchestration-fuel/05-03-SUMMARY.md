---
phase: 05-dogfooding-orchestration-fuel
plan: 03
subsystem: dogfooding-wrapup-pipeline
tags: [flake-classification, oracle-triad-composition, fix-queue-filing, proc-01, d-04]
dependency-graph:
  requires: ["05-02"]
  provides: ["scripts/dogfood/flake-classify.mjs", "scripts/dogfood/dogfood-wrapup.mjs"]
  affects: ["05-04"]
tech-stack:
  added: []
  patterns:
    - "options.deps DI seam (mirrors run-oracle.mjs's own convention) for zero-real-Agda-cost unit testing of a warm-replay/oracle-composition pipeline"
    - "STRICT top-to-bottom priority branching with a single shared filing fall-through call site, rather than independent per-branch upsert calls, so the precedence invariant can't silently drift out of sync between branches"
    - "gitignored append-only JSONL side-channel (flaky-captures.jsonl) for a classification the tracked schema has no enum slot for, instead of inventing a new schema value"
key-files:
  created:
    - scripts/dogfood/flake-classify.mjs
    - test/unit/tools/dogfood-flake-classify.test.ts
    - scripts/dogfood/dogfood-wrapup.mjs
    - test/unit/tools/dogfood-wrapup-filing.test.ts
    - test/integration/mcp/dogfood-flake-classify-live.test.ts
  modified: []
decisions:
  - "buildQueueEntryFromVerdict is NOT injectable via config.deps (only runOracle/classifyFlakiness/upsertQueueEntry/appendFlakyLog are) — it is a small pure function, always the real implementation, so tests assert on its REAL output flowing into the mocked upsertQueueEntry call rather than mocking it away."
  - "wrapUpCapture uses a single shared 'shouldFile' flag + one upsertFn call site (reached from either the ORCL-02-cheat branch or ORCL-01-deterministic branch) instead of two independent upsert call sites, so the precedence invariant (Task 2 Test 6) can never accidentally diverge between branches during a future edit."
requirements-completed: [PROC-01]
metrics:
  duration: "~35 minutes"
  completed: 2026-07-03
---

# Phase 05 Plan 03: Post-Run Wrap-Up Pipeline (Flake Gate + Oracle-Triad Filing) Summary

**`classifyFlakiness()`'s N-times warm-replay anti-phantom gate composed with the unchanged Phase-2 oracle triad in `dogfood-wrapup.mjs`, filing only genuine deterministic/cheat-flagged defects into the Phase-4 fix queue while routing pure timing flakes to a gitignored side-channel — proven against the real, already-fixed #64/#61 flagship fixture.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-02T21:32:48Z (approx., inherited from wave start)
- **Completed:** 2026-07-03T01:49:08Z
- **Tasks:** 3 (all `type="auto" tdd="true"`/`type="auto"`)
- **Files modified:** 5 created, 0 modified (pre-existing files)

## Accomplishments

- `scripts/dogfood/flake-classify.mjs`'s `classifyFlakiness(artifact, n, options)`: gates strictly on `findWarmLoadTuple(artifact) !== null` (Pitfall 4), replays the artifact's own faithful last load-family `tool`/`args` pair against `n` independent fresh `materializeCaptureEnvironment` + `createMcpHarness` sessions, and classifies `"deterministic"` vs `"flaky"` by comparing the N observed classifications only against each other — never a repeated cold ORCL-01 spawn, never a re-run of ORCL-02's static scan.
- `scripts/dogfood/dogfood-wrapup.mjs`'s `wrapUpCapture(artifactPath, artifact, config)`: composes the unchanged Phase-2 `runOracle` with the new flake gate under a STRICT, single-fall-through priority order — an ORCL-02 `cheat-flagged` signal is checked first and unconditionally (skipping the flake gate entirely, since a static scan has no timing dimension), an ORCL-01 `server-false-green-candidate` must survive the N-rerun as `"deterministic"` before filing, and any abstention (`inconclusive`/`skip`/`no-policy`/`no-target`) is always a no-op. `buildQueueEntryFromVerdict` maps both signal sources to `defectKind: "false-green"` (the schema's 4-value vocabulary has no dedicated cheat bucket) and copies only summary-level scalar fields — never `recordedActions`/`inlinedFirstPartySources` — into the filed entry. `appendFlakyLog` persists a pure ORCL-01 flaky classification (no co-occurring ORCL-02 cheat) to a gitignored `flaky-captures.jsonl`, tagged `"timing/nondeterministic"` verbatim, so it stays visible signal instead of being silently discarded. `scriptMain` wires a run's `run-report.json`'s `stagedCaptures` through `wrapUpCapture` and writes one `wrapup-report.json` tallying filed/flaky/not-a-candidate counts.
- `test/integration/mcp/dogfood-flake-classify-live.test.ts`: real-Agda proof (no DI overrides) that the flagship #64/#61 transitive-staleness fixture, hand-constructed as a `CaptureArtifact` carrying the historical false-green shape (Dep.agda inlined under its broken content), N-reruns as `"deterministic"` `"type-error"` across 3 fresh warm sessions post-Phase-3.1-fix.

## Task Commits

Each task was committed atomically:

1. **Task 1: flake-classify.mjs — N-times warm-replay stability check** - `ee28862` (feat)
2. **Task 2: dogfood-wrapup.mjs — auto-chained oracle -> flake-gate -> file-or-sidechannel** - `9b25ca7` (feat)
3. **Task 3: Real-Agda proof — the flagship #64/#61 fixture N-reruns as deterministic** - `276f671` (test)
4. **Fix: TS strict-mode type errors surfaced by post-task `tsc --noEmit`** - `8e81304` (fix)

**Plan metadata:** (this commit) - `docs: complete plan`

## Files Created/Modified

- `scripts/dogfood/flake-classify.mjs` - `classifyFlakiness()`: the N-times warm-replay stability check, gated on `findWarmLoadTuple`, using an `options.deps` DI seam for `materializeCaptureEnvironment`/`createMcpHarness`
- `test/unit/tools/dogfood-flake-classify.test.ts` - 7 tests covering the Pitfall-4 gate, deterministic/flaky classification, exactly-N-fresh-sessions, and tool+args replay fidelity
- `scripts/dogfood/dogfood-wrapup.mjs` - `wrapUpCapture()`/`buildQueueEntryFromVerdict()`/`appendFlakyLog()`/`scriptMain()`: the auto-chained oracle -> flake-gate -> file-or-sidechannel pipeline
- `test/unit/tools/dogfood-wrapup-filing.test.ts` - 8 tests covering all 6 plan-mandated filing-decision behaviors (including the ORCL-02-cheat-takes-precedence-over-a-co-occurring-flaky-ORCL-01 blocker fix) plus 2 direct `buildQueueEntryFromVerdict` unit tests
- `test/integration/mcp/dogfood-flake-classify-live.test.ts` - real-Agda, `RUN_AGDA_INTEGRATION`-gated proof that the flagship fixture N-reruns deterministic

## Decisions Made

- `buildQueueEntryFromVerdict` is deliberately NOT part of the `config.deps` DI surface — it's a small pure function with no I/O, so `wrapUpCapture`'s tests exercise its REAL output flowing into the mocked `upsertQueueEntry` call (asserting on `entry.status`/`entry.defectKind`/`entry.fingerprint`), rather than mocking it away and losing that coverage.
- `wrapUpCapture`'s branch logic uses one shared `shouldFile` flag and a single `upsertFn` call site at the bottom of the function (reached from either the ORCL-02-cheat branch or the ORCL-01-deterministic branch), instead of two independent `upsertFn` call sites duplicated per branch — this makes the precedence invariant (Task 2 Test 6, the blocker fix) structurally impossible to accidentally diverge between branches during a future edit.
- The wrap-up summary's per-capture tally uses `notACandidate` (camelCase) as the property key while the `classification` enum value itself stays hyphenated `"not-a-candidate"` — the plan specified the tallied categories by name but not an exact object-key spelling, and camelCase keeps the summary object internally consistent with the rest of its own field names (`totalCaptures`, `queueJsonPath`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS strict-mode type errors in Task 1/2 test fakes**
- **Found during:** Post-Task-2 verification (`npx tsc -p tsconfig.test.json --noEmit`, the same check Plan 05-02's own SUMMARY performed)
- **Issue:** `dogfood-flake-classify.test.ts`'s `fakeHarnessReturning()` declared `callTool` as a zero-arg `vi.fn(async () => ...)`, so TypeScript inferred its mock-call-args tuple as `[]` — indexing `call[0]`/`call[1]` in Test 5's assertion loop failed with `TS2493` (tuple of length 0 has no element at index 0/1). `dogfood-wrapup-filing.test.ts`'s `upsertFn` was typed `vi.fn(async (entry: unknown) => entry)`, so destructuring `const [entry] = upsertFn.mock.calls[0]` left `entry: unknown`, and `entry.status`/`entry.defectKind`/`entry.fingerprint` failed with `TS18046`.
- **Fix:** Gave `callTool` an explicit `(name: string, args: Record<string, unknown>)` signature (matching the real `harness.callTool` contract it fakes); added a minimal `FakeQueueEntry` interface and typed all 3 `upsertFn` mock declarations against it.
- **Files modified:** `test/unit/tools/dogfood-flake-classify.test.ts`, `test/unit/tools/dogfood-wrapup-filing.test.ts`
- **Verification:** `npx tsc -p tsconfig.test.json --noEmit` produces zero errors attributable to any of this plan's 5 files; both unit test files still pass 15/15 after the fix; full `test/unit/tools/` regression (375 passed, 12 skipped, 0 failed) and the real-Agda live test re-confirmed green.
- **Committed in:** `8e81304` (separate fix commit, per git policy against amending already-pushed task commits)

---

**Total deviations:** 1 auto-fixed (1 bug/type-correctness)
**Impact on plan:** Test-only type-annotation fix; no behavior change to any shipped module (`flake-classify.mjs`/`dogfood-wrapup.mjs` were never touched). No scope creep.

## Issues Encountered

- Mid-execution, several early Bash/Read calls used `cd /Users/eric/projects6/agda-mcp-server && ...` or hardcoded absolute paths pointing at the main repo checkout instead of this worktree (`.claude/worktrees/agent-a21a126a8d3b8c04b`) — the cwd-drift/absolute-path hazard `agents/gsd-executor.md` steps 0a/0b warn about. Caught before any Write/Edit occurred (the Write tool itself rejected a main-repo-path write with an explicit isolation error). Verified via `git status --short` in the main repo that only read-only commands (`ls`, `git log`, `git status`, `git diff`) had run there — no writes occurred outside the worktree, and since the main repo's tracked files were otherwise clean at the same commit the worktree was based on, all content absorbed via the mistaken reads was accurate (the one exception, `.planning/STATE.md`, had an unrelated uncommitted diff belonging entirely to the main repo's own orchestrator bookkeeping, not read for any load-bearing detail in this plan). All subsequent operations (every Write, every Edit, every commit-relevant Bash call) used the correct worktree-rooted absolute path or the default (worktree) cwd with no `cd`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `scripts/dogfood/dogfood-wrapup.mjs` is a complete, standalone CLI (`npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id>`) ready for Plan 05-04's Skill documentation to reference as the fixed post-run command shape.
- The fix-queue schema (`test/fixtures/fix-queue.ts`) and priority table (`scripts/queue/priority.mjs`) remain untouched, as required — this plan only ever calls the existing `upsertQueueEntry` with schema-conformant entries.
- No blockers for Plan 05-04 (the Skill/runbook plan, which documents this plan's CLI shape as already fixed by this plan's own text rather than waiting on execution).

---
*Phase: 05-dogfooding-orchestration-fuel*
*Completed: 2026-07-03*
