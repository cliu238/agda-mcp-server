---
phase: 10-upstream-reconcile
plan: 01
subsystem: agda-session-core
tags: [git-merge, agda-transport, load-terminus, mimer, agsy, proof-search, vitest]

# Dependency graph
requires:
  - phase: 03.1 (transitive-staleness false-green fix)
    provides: the load-terminus-tracker.ts implementation this plan deletes as D-04's default candidate
provides:
  - A single real merge commit (1f91f33) on local main bringing in upstream d4497a2 (5 commits), all 6 documented conflict files resolved
  - buildAutoSearchPayload dual-engine dispatch (mimer/agsy) with T-06-12/RT4 guard preserved in the agsy branch
  - agda_auto wired to usesMimerProofSearch(session.getAgdaVersion()) with a droppedOnMimer UX note
  - Upstream's whole-file candidate architecture (agda-transport.ts, command-completion.ts, session-load-impl.ts) as Plan 10-02's referee subject, with two CLAUDE.md/regression-preserving corrections already applied
  - npm run build and npm run typecheck:test both exit 0 on the merged tree
affects: [10-02 (MERGE-03 architectural adjudication), 10-03 (ADOPT-01/02 feature wiring), 10-04 (full acceptance)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Version-gated proof-search syntax dispatch (usesMimerProofSearch) as the pattern for any future Agda-version-conditional wire-format branch"
    - "finalizeEarlyReturn + classification-tagged LoadResult return (never throw) for expected domain-level load failures, per CLAUDE.md Error Handling convention"

key-files:
  created: []
  modified:
    - src/agda/refactor-helpers.ts
    - test/unit/agda/agent-ux.test.ts
    - src/tools/goal-tools.ts
    - src/tools/goal-write-tools.ts
    - src/session/agda-transport.ts
    - src/session/command-completion.ts
    - src/agda/session-load-impl.ts
    - src/agda/session-load-helpers.ts
    - src/agda/session.ts
    - src/agda/session-command-dispatch.ts
    - test/unit/tools/goal-tools-give.test.ts
    - test/unit/tools/goal-tools-write-rejected.test.ts
    - test/unit/session/agda-transport.test.ts
  deleted:
    - src/session/load-terminus-tracker.ts
    - test/unit/session/load-terminus-tracker.test.ts

key-decisions:
  - "Adopted upstream's whole-file candidate for the 3 architectural files (agda-transport.ts, command-completion.ts, session-load-impl.ts) verbatim per D-04, then applied two forced corrections on top: return-based loadIncompleteNoTerminus instead of throw (CLAUDE.md convention), and re-ported the sourceHoleCount>0 goal-ID recovery block upstream's runLoad lacks."
  - "Extended the plan's single documented test fix (agent-ux.test.ts) to 2 sibling T-06-12 unit tests that the plan's own dry-run missed, plus 2 tool-level fakeSession mocks needing a getAgdaVersion stub, all pinned to explicit engine args to preserve the exact from-RED regression intent (D-05) rather than silently losing coverage to the new mimer default."
  - "Deleted 2 test/unit/session/agda-transport.test.ts tests for the now-fully-removed loadTerminusMode transport option (a TYPE-LEVEL incompatibility, not a runtime-only issue) rather than leaving typecheck:test red; this file is already in Plan 10-02's files_modified list, so it will be revisited regardless of the eventual MERGE-03 verdict."

requirements-completed: [MERGE-01]

# Metrics
duration: 20min
completed: 2026-07-05
---

# Phase 10 Plan 01: Merge upstream v0.6.8 + resolve mechanical/structural conflicts Summary

**Real `git merge --no-ff upstream/main` (5 commits through d4497a2) landed on local main with all 6 conflict files resolved — mechanical files (refactor-helpers.ts, agent-ux.test.ts, goal-tools.ts/goal-write-tools.ts) definitively fixed with version-gated mimer/agsy proof-search dispatch; the 3 architectural files (agda-transport.ts, command-completion.ts, session-load-impl.ts) carry upstream's whole-file candidate as Plan 10-02's referee subject, with build and typecheck:test both green.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-05T18:41Z (STATE.md marked execution start)
- **Completed:** 2026-07-05T19:00Z (merge commit 1f91f33)
- **Tasks:** 3/3
- **Files modified:** 44 (per `git show --stat` on the merge commit; see key-files above for the subset this plan's own edits touched beyond straight auto-merge)

## Accomplishments
- A single real merge commit (`1f91f33`, two parents, `git merge --no-ff`) brought in upstream's 5 commits (390a502 #68, 974cc38 #69, b717ad4 #70, 9409131 version bump, d4497a2 warn-harness) — divergence re-verified live before merging (`git fetch upstream && git log --oneline main..upstream/main` showed exactly these 5 commits ending at `d4497a2`, matching D-02's pin).
- All 6 documented conflict files resolved with zero leftover conflict markers anywhere in the tree (verified via a repo-wide grep, not just the 6 named files).
- `buildAutoSearchPayload` now supports both `"mimer"` (Agda >= 2.6.3, default) and `"agsy"` (legacy) proof-search syntaxes; the T-06-12/RT4 flag-injection guard (`assertValidAutoHint`) is unchanged and still enforced in the agsy branch. `agda_auto` in `goal-write-tools.ts` now selects the engine via `usesMimerProofSearch(session.getAgdaVersion())` and surfaces a `droppedOnMimer` UX note when `depth`/`listCandidates`/`excludeHints` are silently ignored under Mimer.
- `src/tools/goal-tools.ts` confirmed byte-identical to its pre-merge HEAD state (upstream's parallel monolithic write-tool block discarded entirely, since we already extracted that functionality into `goal-write-tools.ts` in an earlier phase — a false architectural disagreement per RESEARCH.md Pattern 2, not a real one).
- The 3 genuine architectural conflicts (`agda-transport.ts`, `command-completion.ts`, `session-load-impl.ts`) were resolved by taking upstream's whole-file candidate (`git checkout --theirs`), then two mandatory corrections were layered on top regardless of Plan 10-02's eventual verdict:
  1. Restored the CLAUDE.md-mandated return-based shape (`loadIncompleteNoTerminus` + `finalizeEarlyReturn`) in both `runLoad` and `runLoadNoMetas`, replacing upstream's bare `throw new Error(...)` on `!parsed.sawLoadTerminus` — `loadIncompleteNoTerminus` itself had been silently dropped by the clean auto-merge of `session-load-helpers.ts` and was re-added verbatim from the pre-merge HEAD.
  2. Re-ported the `sourceHoleCount > 0` dropped-goal-ID metas-requery recovery block into the adopted `runLoad` — upstream's version lacks this recovery entirely.
- `src/session/load-terminus-tracker.ts` and its unit test deleted (D-04's default-candidate branch); `src/agda/session.ts` and `src/agda/session-command-dispatch.ts` (not conflict files, but broken by the deletion) switched from importing the now-gone `LoadTerminusOptions` type to the narrower inline `{ awaitGoalTerminus?: boolean }` type upstream's transport actually expects.
- `npm run build` and `npm run typecheck:test` both exit 0 on the merged tree — MERGE-01's literal acceptance gate. `npm ci` confirmed the lockfile only picked up the 0.6.7→0.6.8 version bump (2 lines changed), no unexpected dependency diff (T-10-04 mitigation).
- Full unit/property suite: 1849 passed / 2 failed / 17 skipped. Both failures are confined to `test/unit/agda/session-load-impl.test.ts`, which is explicitly out of this plan's editing scope (Plan 10-02 owns it) and asserts the old throw-based `sawLoadTerminus` behavior that the CLAUDE.md correction above intentionally superseded.

## Task Commits

Per the plan's explicit design (a `git merge` in progress cannot be split into multiple commits — see the plan's Task 1/3 action text), all three tasks' work landed in ONE merge commit rather than one commit per task:

1. **Task 1: Merge + resolve mechanical/structural conflicts** — verified via `npx vitest run test/unit/agda/agent-ux.test.ts test/unit/tools/goal-tools-give.test.ts test/unit/tools/goal-tools-write-rejected.test.ts` (47/47 passed), staged but not committed (merge in progress).
2. **Task 2: Resolve architectural conflicts to upstream's candidate + apply forced corrections** — verified via the plan's grep-based automated check (0 remaining `loadTerminusMode`/`LoadTerminusOptions`/`LoadTerminusState` references) plus `npx tsc --noEmit` on both tsconfigs, staged but not committed.
3. **Task 3: Complete the merge commit + verify build/typecheck green** — `git commit` finalized the merge as `1f91f33` (message: `merge: upstream/main (5 commits, through d4497a2)`).

**Pre-merge housekeeping commit:** `7ab6ffb` (docs: record phase 10 execution start) — a pre-existing unstaged STATE.md drift from the orchestrator's own bookkeeping, committed separately before starting the merge so it wouldn't pollute the merge commit's diff.

**Plan metadata:** committed separately after this summary (see final_commit step).

## Files Created/Modified

- `src/agda/refactor-helpers.ts` — merged JSDoc comment for `buildAutoSearchPayload` describing both engines; function body (already auto-merged correctly) untouched.
- `test/unit/agda/agent-ux.test.ts` — kept all 4 T-06-12/RT4 tests + upstream's new mimer-mode test; pinned 4 tests (not just the 1 the plan's dry-run flagged) to explicit `"agsy"` args so the Agsy-specific flag-injection guard stays exercised under the new mimer default.
- `src/tools/goal-tools.ts` — discarded upstream's inserted write-tool block + import hunk; file is byte-identical to pre-merge HEAD.
- `src/tools/goal-write-tools.ts` — added `usesMimerProofSearch` import + engine dispatch + `droppedOnMimer` note in `agda_auto`.
- `src/session/agda-transport.ts`, `src/session/command-completion.ts`, `src/agda/session-load-impl.ts` — upstream's whole-file candidate, plus the two forced corrections described above.
- `src/agda/session-load-helpers.ts` — re-added `loadIncompleteNoTerminus` (silently dropped by auto-merge).
- `src/agda/session.ts`, `src/agda/session-command-dispatch.ts` — switched from the deleted `LoadTerminusOptions` import to upstream's inline `{ awaitGoalTerminus?: boolean }` type.
- `test/unit/tools/goal-tools-give.test.ts`, `test/unit/tools/goal-tools-write-rejected.test.ts` — added `getAgdaVersion` mocks to fakeSession (agda_auto now calls this at runtime); give.test.ts pins a pre-2.6.3 version to preserve its Agsy-specific flag-injection regression coverage.
- `test/helpers/warn-guard.ts` — fixed `MockInstance` typing incompatible with this repo's pinned vitest (^4.1.2) overload resolution, and `mockImplementation(() => true)` to match `logger.warn`'s real (boolean) return type.
- `test/unit/session/agda-transport.test.ts` — removed 2 tests exercising the now fully-deleted `loadTerminusMode` transport option (a type-level incompatibility); this file is already in Plan 10-02's `files_modified` list and will be revisited there regardless.
- `src/session/load-terminus-tracker.ts`, `test/unit/session/load-terminus-tracker.test.ts` — deleted.

## Decisions Made

- Adopted upstream's whole-file candidate for all 3 architectural files per D-04, deferring the actual green/red referee verdict to Plan 10-02 as designed — this plan's job was only to reach a coherent, buildable starting point.
- Applied both MANDATORY corrections (return-based `loadIncompleteNoTerminus`, ported goal-ID recovery block) regardless of the eventual adjudication outcome, per the plan's own unconditional instruction.
- Where the plan's own "verified live" interfaces block under-predicted breakage (3 additional buildAutoSearchPayload tests, 2 tool-level fakeSession mocks, session.ts/session-command-dispatch.ts's stale `LoadTerminusOptions` import, warn-guard.ts's vitest-version type mismatch, 2 dead agda-transport.test.ts tests), fixed all of it under Rule 1/3 (bug fix / blocking issue) rather than treating the plan's interfaces block as ground truth over empirical `npx vitest run` / `npx tsc --noEmit` results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 2 additional T-06-12 unit tests broke under the new mimer default, not just the 1 the plan flagged**
- **Found during:** Task 1 verification (`npx vitest run test/unit/agda/agent-ux.test.ts`)
- **Issue:** The plan's interfaces block predicted only the "allows a hyphenated identifier" test would break post-merge. Empirically, "rejects a flag-shaped hints token", "rejects a flag-shaped excludeHints token", and "rejects a hint token containing whitespace" also broke — none of them pass an explicit `engine` argument, so they silently started exercising the new mimer default (which has no `assertValidAutoHint` validation) instead of the Agsy path they were written to test.
- **Fix:** Added explicit `"agsy"` as the second argument to all 3 additional calls, mirroring the plan's own fix rationale for the 4th test.
- **Files modified:** test/unit/agda/agent-ux.test.ts
- **Verification:** `npx vitest run test/unit/agda/agent-ux.test.ts` — 36/36 passed (was 3 failed).
- **Committed in:** 1f91f33 (merge commit)

**2. [Rule 3 - Blocking] Tool-level fakeSession mocks lacked `getAgdaVersion`, crashing agda_auto**
- **Found during:** Task 1 verification (`npx vitest run test/unit/tools/goal-tools-give.test.ts test/unit/tools/goal-tools-write-rejected.test.ts`)
- **Issue:** `goal-write-tools.ts`'s `agda_auto` callback now calls `session.getAgdaVersion()` to pick the engine; both test files' local `fakeSession()` helpers didn't define this method, throwing `session.getAgdaVersion is not a function`.
- **Fix:** Added `getAgdaVersion: () => ({ parts: [2, 6, 0], prerelease: false })` (pre-Mimer) to goal-tools-give.test.ts's fakeSession — preserving its T-06-12 flag-injection regression's original intent, since Mimer doesn't validate hints the same way. Added `getAgdaVersion: () => null` (resolves to modern/mimer) to goal-tools-write-rejected.test.ts's fakeSession, since those tests only pass bare identifier hints where engine choice doesn't matter.
- **Files modified:** test/unit/tools/goal-tools-give.test.ts, test/unit/tools/goal-tools-write-rejected.test.ts
- **Verification:** Both files' full suites pass (3/3 and 8/8 respectively).
- **Committed in:** 1f91f33 (merge commit)

**3. [Rule 3 - Blocking] `session.ts`/`session-command-dispatch.ts` referenced the deleted `LoadTerminusOptions` type**
- **Found during:** Task 2, post-deletion grep sweep for `load-terminus-tracker`
- **Issue:** The plan's acceptance criteria assumed these two non-conflict files would "already be free of it via their own clean auto-merge to the narrower inline options type" — empirically they still imported `LoadTerminusOptions` from the just-deleted module, which would break both build and typecheck.
- **Fix:** Removed the stale import in both files and switched the parameter type to upstream's own narrower inline `{ awaitGoalTerminus?: boolean }`, confirmed to exactly match `AgdaTransport.sendCommand`'s adopted signature.
- **Files modified:** src/agda/session.ts, src/agda/session-command-dispatch.ts
- **Verification:** `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:test` both exit 0.
- **Committed in:** 1f91f33 (merge commit)

**4. [Rule 3 - Blocking] `test/helpers/warn-guard.ts` (upstream's own new file) failed typecheck against this repo's pinned vitest**
- **Found during:** Task 3, `npm run typecheck:test`
- **Issue:** `ReturnType<typeof vi.spyOn<typeof logger, "warn">>` resolved `"warn"` against the wrong (accessor) `vi.spyOn` overload under vitest ^4.1.2's typings, and `mockImplementation(() => {})` (returning `void`) didn't match `logger.warn`'s real (`boolean`, from `process.stderr.write`) return type.
- **Fix:** Retyped `WarnSpy` as `MockInstance<typeof logger.warn>` (vitest's own exported type for exactly this case) and changed the mock implementation to `() => true`.
- **Files modified:** test/helpers/warn-guard.ts
- **Verification:** `npm run typecheck:test` exits 0.
- **Committed in:** 1f91f33 (merge commit)

**5. [Rule 3 - Blocking] 2 `agda-transport.test.ts` tests exercised the now-fully-deleted `loadTerminusMode` transport option**
- **Found during:** Task 3, `npm run typecheck:test`
- **Issue:** `{ loadTerminusMode: "strict" }` no longer type-checks against `AgdaTransport.sendCommand`'s adopted `{ awaitGoalTerminus?: boolean }` signature — this is a type-level incompatibility (not a runtime-only concern), since upstream's #68 fix eliminates the whole idle-window-widening heuristic these tests covered (runLoadNoMetas now uses `Cmd_load` + `awaitGoalTerminus: true` instead of `Cmd_load_no_metas` + a guessed idle window).
- **Fix:** Removed both tests with an explanatory comment (restorable from git history if Plan 10-02's adjudication reverts this file). This file is already in Plan 10-02's own `files_modified` list, so it will be revisited there regardless of the eventual verdict.
- **Files modified:** test/unit/session/agda-transport.test.ts
- **Verification:** `npm run typecheck:test` exits 0; remaining 15 tests in the file still pass.
- **Committed in:** 1f91f33 (merge commit)

---

**Total deviations:** 5 auto-fixed (2 Rule 1, 3 Rule 3)
**Impact on plan:** All fixes were necessary for the plan's own literal acceptance gate (`npm run build` and `npm run typecheck:test` both exit 0) and for genuinely preserving — not weakening — the T-06-12/RT4 regression coverage per D-05. No scope creep into Plan 10-02's actual MERGE-03 adjudication work (session-load-impl.test.ts's throw-vs-return test assertions were deliberately left untouched, as the plan directs).

## Issues Encountered

- A pre-existing, unstaged `.planning/STATE.md` drift (the orchestrator's own "Phase 10 execution started" bookkeeping) was sitting in the working tree before this plan began. Committed it separately (`7ab6ffb`) before starting the merge so it wouldn't pollute the merge commit's diff.
- A concurrent, unrelated process added a "Phase 12" section to `.planning/ROADMAP.md` and a `.gitkeep` under a new `.planning/phases/12-.../` directory while this plan was executing. Both were explicitly unstaged from `git add -A` before the merge commit and left untouched in the working tree — out of this plan's scope, and not part of the Phase 10 upstream reconcile.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 10-02 (MERGE-03 architectural adjudication) can proceed immediately: the 3 architectural files carry upstream's candidate, both forced corrections are in place, and the referee test suites (capture-regression-matrix, upstream's agda-stale-dependency.test.ts) are ready to run against this candidate.
- Known, accepted red spot for Plan 10-02 to resolve: `test/unit/agda/session-load-impl.test.ts` (2 failing tests asserting the old throw-based `sawLoadTerminus` behavior; explicitly out of this plan's scope per the plan text).
- `test/unit/session/agda-transport.test.ts` will need further attention in Plan 10-02 regardless (already in its files_modified list) — the 2 deleted `loadTerminusMode` tests are restorable from this commit's parent if the eventual verdict reverts this file to the pre-merge implementation.
- Nothing pushed to origin (D-10) — exactly one push happens at the end of the whole phase (Plan 10-05).

---
*Phase: 10-upstream-reconcile*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: src/agda/refactor-helpers.ts
- FOUND: src/tools/goal-write-tools.ts
- FOUND: src/session/agda-transport.ts
- FOUND: src/agda/session-load-impl.ts
- CONFIRMED DELETED: src/session/load-terminus-tracker.ts
- CONFIRMED DELETED: test/unit/session/load-terminus-tracker.test.ts
- FOUND: .planning/phases/10-upstream-reconcile/10-01-SUMMARY.md
- FOUND commit: 1f91f33 (merge)
- FOUND commit: 7ab6ffb (pre-merge STATE.md housekeeping)
- FOUND commit: 770d11c (this summary)
