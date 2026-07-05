---
phase: 07-team-feedback-channel-local-wiring
plan: 06
subsystem: testing
tags: [dogfooding, mcp, fix-queue, oracle-triad, team-channel, e2e, process-signals, agda]

# Dependency graph
requires:
  - phase: 07
    provides: "07-01..07-05: issue-key.mjs, ingest-server.mjs, upload-run.mjs/chainUploadRun, sandboxed archive-extract.mjs, cron-ingest-wrapup.mjs"
  - phase: 06
    provides: "fix-queue.json frozen schema, dogfood-run.mjs/dogfood-wrapup.mjs recording+judging pipeline, oracle triad (ORCL-01/02/03)"
provides:
  - "E2E-01: the full Phase-7 loop (capture -> upload -> ingest -> cron judge -> fix-queue intake) proven live end-to-end with zero fixture shortcuts, on the real pinned codex-homotopy-group corpus"
  - "A real, blocking defect in the dogfooding loop's OWN recording proxy (fingerprint 0bc76d15c2fec8df), found, fixed, regression-locked, and live-re-verified within this same plan"
  - "Incremental (SIGKILL-safe) run-report.json checkpointing + SIGTERM/SIGINT/SIGHUP graceful shutdown in dogfood-run.mjs; dogfood-wrapup.mjs now accepts a non-finalized report with a loud, three-surface warning instead of refusing the run"
  - "A second, genuinely new oracle-triad-tooling-gap finding (fingerprint 2eb1768df88bfb07) surfaced by the FIRST real, multi-include-root corpus run the oracle triad has ever judged"
affects: [08-pinned-env-distribution-k8s]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Serialized async write-chain checkpointing (reportWriteChain in dogfood-run.mjs): every mutation to a shared on-disk artifact is scheduled onto one chained promise, so writes never interleave and a terminal write is always guaranteed to land last"
    - "Process-group signal testing (detached:true + process.kill(-pid, signal)): the only way to deliver a genuine zero-grace kill to a target spawned via a wrapper (node_modules/.bin/tsx) that itself forks a grandchild to run the real script -- a single-PID kill only reaches the wrapper and lets the grandchild react gracefully via a cascading pipe-close"
    - "Test-only env-var override for child-process substitution (AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY), mirroring the existing AGDA_MCP_DOGFOOD_RUNS_ROOT precedent, so a real-subprocess signal-handling test needs neither a real Agda binary nor a full build"

key-files:
  created:
    - test/fixtures/dogfood-fake-mcp-child.mjs
    - test/unit/tools/dogfood-run-report-checkpoint.test.ts
    - test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts
  modified:
    - scripts/dogfood/dogfood-run.mjs
    - scripts/dogfood/dogfood-wrapup.mjs
    - test/fixtures/fix-queue.json
    - test/unit/fixtures/fix-queue.test.ts

key-decisions:
  - "D-04 substitution (documented, not silent): the definitive loop-to-verdict re-verification session was driven by Claude, not Codex, because codex exec (codex-cli 0.142.5) cancels every MCP tool call after the first -- the human's own interactive Codex session (run-id 2026-07-04T14-47-00-924Z-442e77f2) already supplied the D-04 Codex-driven-pattern evidence; this Claude-driven rerun supplies the loop-to-verdict completion the defect itself was blocking."
  - "cron-ingest-wrapup.mjs was run with --no-push (not the plan's original D-02 real-push default) per this specific autonomous continuation's own instructions -- the queue write-back commit (c097f45) landed locally only."
  - "The oracle-triad-tooling-gap finding (2eb1768df88bfb07) was triaged with a full root-cause writeup but NOT fixed here -- scripts/oracle/ hardening for multi-include-root corpora and multi-line postulate parsing is out of 07-06's own scope and belongs to a future oracle-triad wave."
  - "The human's original D-04 interactive session (2026-07-04T14-47-00-924Z-442e77f2) remains permanently un-wrappable: it predates the fix with zero incremental checkpoints, so no run-report.json exists for it at all. Report reconstruction was explicitly out of scope and was not attempted."

requirements-completed: [E2E-01]

# Metrics
duration: ~75min
completed: 2026-07-04
---

# Phase 7 Plan 06: E2E-01 Live Acceptance (Continuation) Summary

**Found, fixed, and live-re-verified a real SIGKILL-data-loss defect in the dogfooding loop's own recording proxy (dogfood-run.mjs), then drove the fixed proxy through a complete capture -> upload -> ingest -> cron-judge -> fix-queue loop against the real pinned codex-homotopy-group corpus, surfacing a second, genuinely new oracle-triad-tooling finding along the way.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-07-04
- **Tasks:** Continuation of Task 2 (human-driven, already recorded) + Task 3 (automated post-session verification), plus the defect capture/fix/lock cycle this continuation's own mandate required
- **Files modified:** 7 (3 created, 4 modified) across 6 commits

## Accomplishments

- **Root-caused, fixed, and live-verified a real Loop-② defect**: `dogfood-run.mjs`'s `finalize()` only ever wrote `run-report.json` on `child-close`/`child-error`/`agent-stdin-close`, and registered no signal handlers. Codex hard-kills the proxy process it directly manages on both interactive quit and `codex exec` completion, triggering none of those three events — empirically, all 8 of the day's run directories had `transcript.jsonl` but zero had `run-report.json`, including the one fully successful 8-tool-call interactive proving session. This blocked every Codex-driven dogfooding run from ever entering the fix-queue loop.
- **Shipped a from-RED, SIGKILL-safe fix**: incremental report checkpointing (a serialized write chain writes `run-report.json`, marked `finalized:false`, right after the run directory is created and after every recorded tool-call action) plus SIGTERM/SIGINT/SIGHUP handlers for the catchable graceful path. `dogfood-wrapup.mjs` now accepts a `finalized:false` report with a loud, three-surface warning (stderr, the persisted `wrapup-report.json` summary, the printed stdout digest) instead of treating a hard-killed run as unjudgeable.
- **Discovered and worked around a genuine `tsx` architecture subtlety while writing the regression tests**: `node_modules/.bin/tsx` spawns a *separate grandchild process* to actually run the target script (verified via `ps`: three real OS processes for one `dogfood-run.mjs` invocation). A single-PID kill only kills the wrapper, letting the grandchild react gracefully via a cascading pipe-close — not the zero-grace scenario Codex's own observed behavior matches. The regression suite spawns every proxy `detached:true` and signals the whole process group to genuinely exercise that scenario.
- **Drove a complete, real live session through the FIXED proxy** against the pinned `codex-homotopy-group` corpus (reconstructing `eq-ap-is-in-kernel-tr-type-Ω` via case-split-on-`p` + `give "inv H"`, byte-identical to the interactive D-04 evidence), and **empirically confirmed the incremental checkpoint existed on disk BEFORE the client ever closed** — the fix proving itself live, not just under a synthetic test fixture.
- **Ran the complete downstream chain for real**: wrapup → judged and filed 1 capture → uploaded the archive → the archive landed on disk under the ingest storage root → the unattended cron judge independently re-discovered and re-judged the SAME capture from the archive, correctly bumping its recurrence (1→2, no duplicate row) and committing the queue write-back locally.
- **Surfaced a second, genuinely new finding**: the oracle triad's first-ever judgment of a real, multi-include-root corpus capture flagged two concrete, well-evidenced tooling gaps in `scripts/oracle/` itself (ORCL-01's cold-replay never re-materializes `.agda-lib`; ORCL-02's postulate scanner mis-parses multi-line type signatures) — triaged with a full root-cause writeup, correctly deferred to a future oracle-triad hardening wave.

## Task Commits

Each logical step was committed atomically:

1. **File the run-report-never-written defect (status: new)** - `f652f80` (fix)
2. **Add failing regression tests, confirm RED** - `9a07f62` (test)
3. **Implement the fix, confirm GREEN; bump triaged -> fixing** - `2f707f0` (fix)
4. **[Automated] cron judge's own queue write-back** - `c097f45` (queue, produced by `cron-ingest-wrapup.mjs` itself, not hand-authored)
5. **Triage the E2E-01 auto-filed oracle-triad-tooling-gap finding** - `afbb063` (docs)
6. **Lock the primary defect after live re-verification succeeded** - `8862f64` (fix)

_Note: commit `c097f45` was generated by `scripts/team/cron-ingest-wrapup.mjs`'s own automated write-back (D-01), not authored directly by this session — included here for a complete, honest commit-by-commit account of everything that landed on `main` during this continuation._

## Files Created/Modified

- `scripts/dogfood/dogfood-run.mjs` — `buildReportSnapshot()`/`scheduleReportWrite()` (a serialized write chain checkpointing the current recorder state to `run-report.json`, marked `finalized:false`, at startup and after every recorded action); `finalize()` now rewrites the same file with `finalized:true` plus exit metadata; new SIGTERM/SIGINT/SIGHUP handlers; new `AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY` test-only child-substitution override.
- `scripts/dogfood/dogfood-wrapup.mjs` — new `checkReportFinalized()`: accepts a `finalized:false` report with a loud warning on three independent surfaces (stderr, persisted summary's `reportFinalized` field, stdout digest line) instead of silent/refused handling.
- `test/fixtures/dogfood-fake-mcp-child.mjs` — minimal stand-in for `dist/index.js` (echoes a trivial JSON-RPC response for any `tools/call`), used only by the new signal-handling regression suite.
- `test/unit/tools/dogfood-run-report-checkpoint.test.ts` — 3 tests: initial startup checkpoint; SIGKILL delivered to the whole process group leaves `finalized:false` with the last recorded action intact; SIGTERM delivered to the whole process group finalizes the report with exit metadata. Confirmed RED against pre-fix code before the fix landed.
- `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts` — 3 tests: loud warning + `false` on `finalized:false`; silent + `true` on `finalized:true`; silent + `true` on a pre-fix report with no `finalized` field at all (backward compatible).
- `test/fixtures/fix-queue.json` — new entry `0bc76d15c2fec8df` (the primary defect, `new` → `triaged` → `fixing` → `locked`); new entry `2eb1768df88bfb07` (the oracle-triad-tooling finding, auto-filed → `triaged` with full root-cause notes, recurrence 1→2 after cron re-judging).
- `test/unit/fixtures/fix-queue.test.ts` — hardcoded entry-count assertion updated in lockstep with the data file (16 → 17 across two edits), the necessary companion to the SSOT changes above.
- `tmp/e2e-01-chg/e2e-driver.mjs` (gitignored, not committed — durable local evidence, mirrors Phase 6's `tmp/rt-driver.mjs` precedent) — the `StdioClientTransport`-based driver that ran the live re-verification session.

## Decisions Made

- **D-04 substitution, documented not silent**: `codex exec` (codex-cli 0.142.5) cancels every MCP tool call after the first, so a Codex-driven rerun of the fixed proxy was not possible within this continuation. The human's own interactive session (`2026-07-04T14-47-00-924Z-442e77f2`) already supplies the D-04 "Codex drives the live acceptance session" evidence (a complete, successful 8-tool-call proof, byte-identical file round-trip); this session's own Claude-driven rerun through the *fixed* proxy supplies the loop-to-verdict completion that the run-report defect itself was blocking. Both pieces of evidence together satisfy D-04/D-05's intent.
- **`--no-push` for the cron judge**, per this specific autonomous continuation's own explicit instructions — a deliberate deviation from the *original* 07-06-PLAN's D-02 real-push default for the E2E-01 acceptance run. The queue write-back commit (`c097f45`) is real, correctly deduped, and landed on `main` locally; it has not been pushed to `origin`. (Note: this local repository already carries multiple prior, unpushed Phase-7 commits from before this session began — un-pushed local work is this repo's existing normal state, not something newly introduced here.)
- **The plan's own designated evidence doc is this SUMMARY**, not `.planning/research/RT-REVERIFY.md`. RT-REVERIFY.md is Phase 6's dedicated RT1–RT8 evidence file; 07-06-PLAN.md's own `<output>` names only this SUMMARY. Both newly-discovered defects (0bc76d15c2fec8df, 2eb1768df88bfb07) are fully documented here and in `test/fixtures/fix-queue.json`'s own notes fields instead.
- **The oracle-triad-tooling finding (2eb1768df88bfb07) was triaged, not fixed.** Both root causes (ORCL-01's `.agda-lib` re-materialization gap; ORCL-02's multi-line postulate parsing bug) are concrete and well-evidenced, but fixing `scripts/oracle/` is Phase-2 territory, well outside 07-06's own file scope, and deserves its own dedicated investigation/plan.
- **The human's 2026-07-04T14-47-00-924Z-442e77f2 run was NOT wrapped up and no report was fabricated for it.** It predates the fix entirely (zero incremental checkpoints were ever written for it), so `dogfood-wrapup.mjs` still correctly refuses it (`no run report found`) even after this fix — the fix is forward-looking only. Its `transcript.jsonl` remains on disk as the durable, real evidence of the original successful proving session; it simply cannot be machine-judged by the oracle triad without a `run-report.json` enumerating its captures (it made none in any case — see below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 — Bug + missing critical functionality] `dogfood-run.mjs` never persists evidence when hard-killed**
- **Found during:** Investigating why the human's Task-2 interactive session (and every `codex exec` probe) left `dogfood-wrapup.mjs` unable to judge anything
- **Issue:** `finalize()` was the ONLY write path for `run-report.json`, gated behind events (`child-close`/`child-error`/`agent-stdin-close`) that Codex's own hard-kill behavior never triggers
- **Fix:** Incremental, SIGKILL-safe checkpointing (serialized write chain, `finalized:false` snapshots at startup and after every recorded action) + SIGTERM/SIGINT/SIGHUP handlers for the graceful path; `dogfood-wrapup.mjs` updated to accept a non-finalized report loudly rather than refuse it
- **Files modified:** `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`
- **Verification:** From-RED regression suite (6 new tests across 2 files, all green after the fix; confirmed RED before it); live re-verification session confirmed the checkpoint exists on disk before client close
- **Committed in:** `f652f80` (filed), `9a07f62` (RED), `2f707f0` (GREEN), `8862f64` (locked after live verification)

**2. [Rule 1 — Bug] Stale hardcoded entry-count assertion in `fix-queue.json`'s validating companion test**
- **Found during:** Every fix-queue.json edit in this session (filing, triaging, fixing, locking, and the E2E-01 auto-filing)
- **Issue:** `test/unit/fixtures/fix-queue.test.ts` asserts an exact entry count as a snapshot of prior data; each new entry this session added goes stale by design the moment it lands
- **Fix:** Updated the expected count in lockstep with each data change (15 → 16 → 17), renaming the assertion's own description to name the new entries
- **Files modified:** `test/unit/fixtures/fix-queue.test.ts`
- **Verification:** `npx vitest run test/unit/fixtures/fix-queue.test.ts` (10/10 passing) re-run after every edit
- **Committed in:** `f652f80`, `afbb063` (both partial fixes tracking the data state at that point)

---

**Total deviations:** 2 auto-fixed (1 Rule 1/2 bug+missing-functionality — the core mandate of this continuation, not incidental; 1 Rule 1 bug — a mechanical companion-test update)
**Impact on plan:** The first "deviation" is in fact this continuation's entire objective — the plan's own E2E-01 acceptance could not have completed without it. No scope creep: every file touched is either the recording proxy itself, its judging counterpart, or the queue/test files those two directly govern.

## Issues Encountered

- **`node_modules/.bin/tsx` spawns a separate grandchild process.** While writing the SIGKILL regression test, a single-PID `child.kill("SIGKILL")` unexpectedly left `finalized:true` on disk — traced (via `ps`, wall-clock-correlated debug tracing across both processes, and a minimal 2-process repro) to `tsx`'s own wrapper-then-grandchild architecture: killing only the wrapper breaks its piped connection to the grandchild, which then reacts *gracefully* to the resulting EOF via the pre-existing `fromAgent.on("close", finalize)` path — a real resilience property, but not the zero-grace scenario this defect is about. Resolved by spawning every test proxy `detached:true` and signaling the whole process group (`process.kill(-pid, signal)`), which reaches the wrapper and the grandchild (and its own spawned fake child) simultaneously with no cascade to react to.
- **The oracle triad filed a real finding during Step C's live re-verification, not a placeholder.** Investigated fully rather than accepted at face value or suppressed: traced ORCL-01's `server-false-green-candidate`/`FileNotFound` signal to `materializeCaptureEnvironment()` never re-materializing `.agda-lib` for a multi-include-root project, and ORCL-02's `cheat-flagged` signal to a concrete multi-line-postulate-parsing bug (confirmed against `agda-unimath/src/foundation/truncations.lagda.md`'s actual source text — one flagged "finding" is literally the text fragment `"{l"`). Both are pre-existing oracle-tooling gaps, never before exercised because every prior wrapup run (Phase 6's RT1–RT8 included) used small, single-file, no-`.agda-lib` fixtures. Triaged with the full analysis in `test/fixtures/fix-queue.json`; not fixed (out of scope).

## User Setup Required

None — all services (ingest server on 127.0.0.1:8787, the Bearer key for `eric`) were already provisioned by Task 1's prior executor and reused as-is; both were torn down / left in their pre-session state at the end of this run (ingest server killed, CHG checkout restored to its committed state).

## Next Phase Readiness

- **E2E-01 is satisfied**: the full loop (capture → upload → ingest → cron judge → fix-queue intake, with correct dedup) ran live, end to end, with zero fixture shortcuts, against the real pinned `codex-homotopy-group` corpus.
- **Loop ② demonstrated on a fresh, real defect, start to finish, within a single continuation**: found (via empirical inspection of the day's own run directories) → captured into the fix-queue → from-RED tests → fix → GREEN → live re-verification through the fixed proxy → locked. This is the "closed loop" the project's own Core Value statement names.
- **Two open, deferred items for a future milestone's queue review** (both already `triaged` with full root-cause writeups, neither blocking Phase 8): (a) `scripts/oracle/orcl-01-differential.mjs`'s materialization needs to handle multi-include-root `.agda-lib` projects; (b) `scripts/oracle/orcl-02-soundness-scan.mjs`'s postulate-block scanner needs to handle multi-line type signatures.
- **The queue write-back commit (`c097f45`) has not been pushed to `origin`** (this run's own `--no-push`, plus this repository's own pre-existing backlog of unpushed local commits) — a maintainer push is needed before Phase 8 (or any other consumer) can see this queue state on the remote.
- Per this continuation's own explicit instructions: **STATE.md, ROADMAP.md, and REQUIREMENTS.md were intentionally NOT updated** — tracking-file writes for this plan are left for the orchestrator to apply centrally.
- No blockers for Phase 8. All local artifacts (`.agda-mcp/runs/*`, `.agda-mcp/captures/*` on both the server and CHG checkouts, `.agda-mcp/team/storage/*`, `.agda-mcp/team/cron-runs/*`, `tmp/e2e-01-chg/*`, `tmp/rt-driver.mjs` from Phase 6) remain on disk, gitignored, as durable local evidence.

## Self-Check: PASSED

- FOUND: `scripts/dogfood/dogfood-run.mjs`
- FOUND: `scripts/dogfood/dogfood-wrapup.mjs`
- FOUND: `test/fixtures/dogfood-fake-mcp-child.mjs`
- FOUND: `test/unit/tools/dogfood-run-report-checkpoint.test.ts`
- FOUND: `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts`
- FOUND: `.agda-mcp/team/storage/eric/2026-07-04/e2e-01-chg-2026-07-04T16-06-18-000Z.tar.gz`
- FOUND: `.agda-mcp/runs/e2e-01-chg-2026-07-04T16-06-18-000Z/run-report.json` (finalized:true)
- FOUND commit: `f652f80`
- FOUND commit: `9a07f62`
- FOUND commit: `2f707f0`
- FOUND commit: `c097f45`
- FOUND commit: `afbb063`
- FOUND commit: `8862f64`
- VERIFIED: `npx vitest run` — 214 test files passed, 16 skipped; 1768 tests passed, 179 skipped; 0 failures
- VERIFIED: `git -C ~/projects6/Codex-Homotopy-Group status --short` shows only the untracked, gitignored `.agda-mcp/` directory — the target `.lagda.md` file is restored byte-identical to its committed state
- VERIFIED: ingest server no longer listening (`curl .../healthz` → connection refused); no leftover `dogfood-run`/`dogfood-fake-mcp-child`/`ingest-server`/agda processes

---
*Phase: 07-team-feedback-channel-local-wiring*
*Completed: 2026-07-04*
