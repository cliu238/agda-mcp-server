---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
plan: 01
subsystem: infra
tags: [agda, mcp, session-lifecycle, cold-replay, oracle, subprocess, vitest, tsx]

# Dependency graph
requires:
  - phase: 01-capture-foundation
    provides: ReplayManifest/CaptureArtifact contract (lastDispatchedLoadArgv, mergedArgv, agdaDirContents, importClosureHash), and scripts/verify-cold-replay.mjs's single-shot cold-load pattern
provides:
  - "WR-08 fix: lastDispatchedLoadArgv can no longer go stale after a strict reload (loadNoMetas), a mid-command process death, or an idle/spontaneous process crash"
  - "scripts/oracle/cold-agda-session.mjs: spawnColdAgdaSession() — a reusable, disposable, multi-command cold agda --interaction-json process lifecycle"
  - "scripts/oracle/cold-agda-session.mjs: runEnvironmentProbes() — all 7 named environment gates (version, agdaDir-hash, closure-hash, build-fresh, spawn, terminus, timeout) as pure, independently-testable functions"
affects: [02-03-orcl-01-differential, 02-04-orcl-03-conformance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-command disposable subprocess lifecycle: one spawn() call backing multiple independent sendCommand() calls, each with its own idle timer armed at write-time"
    - "Environment-probe-as-pure-function: every oracle gate takes only plain, caller-supplied data (no live subprocess) so it is independently unit-testable with synthetic fixtures"
    - "scripts/*.mjs importing .ts-backed src/*.js modules directly (no tsx needed under vitest — Vite's resolver already handles the .js-specifier-to-.ts-file mapping this codebase's Node16 moduleResolution requires)"

key-files:
  created:
    - scripts/oracle/cold-agda-session.mjs
    - test/unit/tools/oracle-cold-agda-session.test.ts
  modified:
    - src/agda/session.ts
    - src/agda/session-process-lifecycle.ts
    - src/agda/session-load-helpers.ts
    - test/unit/agda/session-capture/manifest-builder.test.ts

key-decisions:
  - "sendCommand() rejects with the underlying spawn/process error rather than exposing a separate onError callback, giving Plan 02-03 a natural way to observe a spawn failure for the 'spawn' probe via a caught rejection"
  - "Idle timer for each sendCommand() call is armed immediately at write time (not only on the first stdout byte), improving on verify-cold-replay.mjs's original design so total silence from Agda still resolves after idleMs instead of hanging forever when no hardTimeoutMs is set"
  - "Extended pure-probe test coverage from the plan's 4 explicitly-illustrated pure tests to full coverage of all 7 named probes, directly fulfilling the plan's must_haves truth that each probe independently reports INCONCLUSIVE"

patterns-established:
  - "Disposable oracle subprocess lifecycle (spawnColdAgdaSession): { sendCommand(iotcm), kill() } — the shape Plans 02-03/02-04 will both import"
  - "Probe result shape { probe: string, ok: boolean, detail?: string } for every oracle gate — the shape the eventual verdict schema composes"

requirements-completed: [ORCL-01]

# Metrics
duration: ~25min
completed: 2026-07-02
---

# Phase 2 Plan 1: Capture-substrate hardening + shared cold-Agda-session lifecycle Summary

**Fixed WR-08 (stale `lastDispatchedLoadArgv` staleness after strict reload/process death) and built `scripts/oracle/cold-agda-session.mjs`'s reusable multi-command disposable cold-Agda-process lifecycle plus all 7 named environment probes, both proven against a real local Agda 2.8.0 binary.**

## Performance

- **Duration:** ~25 min (estimate — exact session start timestamp was not captured; based on commit timestamps 03:50:06 and 03:53:49 local time plus the preceding context-gathering phase)
- **Completed:** 2026-07-02T07:54:50Z
- **Tasks:** 2/2 completed
- **Files modified:** 6 (4 modified, 2 created) + 1 housekeeping doc (`deferred-items.md`)

## Accomplishments
- Closed the one Phase-1 capture-substrate defect that would have silently corrupted ORCL-01's ground truth: a replay manifest's `mergedArgv` now always reflects the CURRENT session's argv, never a stale prior load's flags, across all three staleness paths (strict `loadNoMetas` reload, mid-command process death, idle/spontaneous process crash).
- Built the shared, disposable cold-Agda-process lifecycle (`spawnColdAgdaSession`) that Plans 02-03 (ORCL-01) and 02-04 (ORCL-03) will both import — proven to run TWO sequential IOTCM commands (`Cmd_load` then `Cmd_infer_toplevel`) against the SAME real Agda process before being killed.
- Implemented all 7 named environment probes (`runEnvironmentProbes`) as pure, independently-testable functions, each correctly reporting `ok: false` with its own probe name and a human-readable detail on a failing synthetic input — never a false pass on an evidence-free or environment-mismatched cold run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Stop a stale mergedArgv from leaking into the replay manifest (WR-08)** - `7533410` (fix)
2. **Task 2: Shared disposable cold-Agda-session lifecycle + the 7 environment probes** - `ab2f533` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/agda/session.ts` - `loadNoMetas()` now resets `lastDispatchedLoadArgv` to `[]` as its first statement (Cmd_load_no_metas dispatches no options list)
- `src/agda/session-process-lifecycle.ts` - `resetFileBoundStateIfProcDied` and `handleSessionProcessClose` each reset `lastDispatchedLoadArgv` to `[]` on their respective death path; `resetProcBoundState` (shared with the live respawn path) deliberately does NOT gain the reset
- `src/agda/session-load-helpers.ts` - documentation-only comment on `invalidatePriorLoadState` explaining why it deliberately does not reset `lastDispatchedLoadArgv`
- `test/unit/agda/session-capture/manifest-builder.test.ts` - 3 new tests covering all three WR-08 reset paths (2 fast/ungated, 1 `RUN_AGDA_INTEGRATION`-gated real-Agda case)
- `scripts/oracle/cold-agda-session.mjs` - new: `spawnColdAgdaSession()` (multi-command disposable cold-Agda lifecycle) and `runEnvironmentProbes()` (7 named gates)
- `test/unit/tools/oracle-cold-agda-session.test.ts` - new: 1 `RUN_AGDA_INTEGRATION`-gated real-process test + 12 pure tests covering all 7 probes
- `.planning/phases/02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo/deferred-items.md` - new: logs pre-existing, out-of-scope `tsconfig.test.json` type errors discovered incidentally (not fixed, per the executor's scope boundary)

## Decisions Made
- **`.mjs` scripts can import `.ts`-backed `src/*.js` modules directly under vitest, no `tsx` required for the test path.** RESEARCH.md had only verified this via standalone `tsx`; this plan confirms empirically that Vite's own resolver (which vitest uses) already performs the same `.js`-specifier-to-`.ts`-file mapping every existing `.test.ts` file in this repo already relies on, regardless of the importing file's own extension. `cold-agda-session.mjs` imports `parseAgdaVersion`/`compareVersions` from `../../src/agda/agda-version.js` and both the pure tests and the real-Agda-gated test pass cleanly.
- **`sendCommand()` rejects with the spawn/process error** rather than adding a separate `onError` callback parameter — the caller (Plan 02-03) observes a spawn failure as a normal rejected promise and can feed the message into the "spawn" probe's `spawnError` input field.
- **Idle timer arms at write-time, not first-byte-time** — a strict improvement over `verify-cold-replay.mjs`'s original design (which only starts its idle clock on the first stdout chunk, so a totally silent response would hang forever absent a hard timeout). Matches the plan's own wording ("idle for idleMs since the LAST byte received after that write").
- **Extended pure-probe test coverage to all 7 probes**, not just the 4 the plan's `<behavior>` section explicitly illustrated — directly required by the plan's `must_haves.truths` #3 ("Each of the 7 named environment probes ... independently reports INCONCLUSIVE naming itself when its underlying condition fails, given synthetic/fixture inputs").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing coverage] Added pure tests for the build-fresh, spawn, and timeout probes**
- **Found during:** Task 2 (writing `test/unit/tools/oracle-cold-agda-session.test.ts`)
- **Issue:** The plan's `<behavior>` section explicitly illustrated only 4 of the 7 probes with concrete test descriptions (version, agdaDir-hash, closure-hash, terminus), but the plan's own frontmatter `must_haves.truths` requires "each of the 7 named environment probes ... independently reports INCONCLUSIVE naming itself when its underlying condition fails, given synthetic/fixture inputs" — a stronger, more authoritative contract than the illustrative behavior list.
- **Fix:** Added 3 more pure tests (build-fresh, spawn, timeout) plus a baseline "all-7-pass" sanity test, so every named probe has explicit synthetic-input coverage for both its passing and failing branch.
- **Files modified:** `test/unit/tools/oracle-cold-agda-session.test.ts`
- **Verification:** All 12 pure tests + the 1 gated test pass (`npx vitest run test/unit/tools/oracle-cold-agda-session.test.ts`).
- **Committed in:** `ab2f533` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing coverage against the plan's own must_haves truth)
**Impact on plan:** Strictly additive test coverage; no scope creep into Plan 02-03/02-04 territory (no materialization/spawn/hash-computation logic was added here — that remains Plan 02-03's job per the plan's own action item).

## Issues Encountered
- `npx tsc -p tsconfig.test.json --noEmit` (a separate, stricter TS config not wired into any `npm run` script) surfaced pre-existing type errors in 8 files this plan never touches (mock `ChildProcess` shapes, `LoadResult`/`TypeCheckResult` missing `profiling`, etc.). Confirmed out of scope per the executor's SCOPE BOUNDARY rule (none of the errored files are in either task's `<files>` list) and logged to `deferred-items.md` rather than fixed. `npx tsc -p tsconfig.json --noEmit` (the actual build config used by `npm run build`/`pretest`) is clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02-03 (ORCL-01 differential) and Plan 02-04 (ORCL-03 conformance) can both now `import { spawnColdAgdaSession, runEnvironmentProbes } from "../../scripts/oracle/cold-agda-session.mjs"` rather than re-deriving subprocess lifecycle or probe logic.
- ORCL-01's differential input is now trustworthy: any future `agda_capture_session` call's `ReplayManifest.mergedArgv` accurately reflects the session that actually ran, across every staleness path this plan closed.
- No blockers. `npm test` is green (171 test files / 1397 tests passed, 12 files / 161 tests skipped — all Agda-integration-gated, expected without `RUN_AGDA_INTEGRATION=1`); zero regressions introduced.

---
*Phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Completed: 2026-07-02*

## Self-Check: PASSED

- All 8 claimed files verified present on disk (6 plan files + SUMMARY.md + deferred-items.md).
- All 3 commit hashes (`7533410`, `ab2f533`, `9907e54`) verified present in `git log --oneline --all`.
