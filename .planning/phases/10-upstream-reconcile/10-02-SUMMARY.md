---
phase: 10-upstream-reconcile
plan: 02
subsystem: agda-session-core
tags: [merge-adjudication, load-terminus, agda-transport, regression-lock, vitest]

# Dependency graph
requires:
  - phase: 10-01 (merge upstream v0.6.8 + resolve mechanical/structural conflicts)
    provides: the merged candidate (upstream's whole-file architecture for agda-transport.ts / command-completion.ts / session-load-impl.ts, with two forced CLAUDE.md corrections) this plan runs the referee against
provides:
  - The MERGE-03 empirical adjudication decision (GREEN — upstream's architecture adopted for all 3 sub-behaviors), recorded durably in docs/LOAD-TERMINUS-ADJUDICATION.md
  - test/unit/agda/session-load-impl.test.ts corrected to assert return-based load-incomplete-no-terminus semantics (both truncation tests) with the pre-merge goal-ID recovery test restored
  - Confirmation that no hybrid implementation exists: the codebase runs exactly one load-terminus implementation with fatal-stderr and inactivity-watchdog hardening bundled in, not grafted separately
affects: [10-03 (ADOPT-01/02 feature wiring), 10-04 (full acceptance), 11 (recurring auto-sync — this file is the "why are the semantics the way they are" answer for future escalations)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Empirical referee adjudication (D-04): decision made ONLY from a real from-RED regression run against real Agda, never from code-reading/taste — recorded durably per sub-behavior in docs/ alongside the exact command and pass/fail evidence"

key-files:
  created:
    - docs/LOAD-TERMINUS-ADJUDICATION.md
  modified:
    - test/unit/agda/session-load-impl.test.ts
  deleted: []

key-decisions:
  - "MERGE-03 verdict: GREEN on all 3 referee tests (both capture-regression-matrix agda_load_no_metas entries + upstream's own agda-stale-dependency.test.ts) against Plan 10-01's merge candidate. Per D-04, upstream's whole-file architecture (agda-transport.ts, command-completion.ts, session-load-impl.ts) is adopted as-is for all three sub-behaviors (completion-signal detection, fatal-stderr handling, inactivity timeout) — no RED-branch revert/graft work was needed."
  - "The RED branch's fallback text (restore ours from git show 1f91f33^1, re-widen LoadTerminusOptions, graft upstream's hardening onto the restored implementation) is documented in the plan and this summary as the path NOT taken, for future-escalation legibility."

requirements-completed: [MERGE-03]

# Metrics
duration: 5min
completed: 2026-07-05
---

# Phase 10 Plan 02: MERGE-03 load-terminus adjudication Summary

**Ran the actual empirical referee (both capture-regression-matrix `agda_load_no_metas` entries + upstream's own `agda-stale-dependency.test.ts`) against Plan 10-01's merge candidate against real Agda — GREEN on all 3, so per D-04 upstream's whole-file load-terminus architecture is adopted as the final decision, documented durably in `docs/LOAD-TERMINUS-ADJUDICATION.md`, with `test/unit/agda/session-load-impl.test.ts` corrected to the return-based semantics the referee's own architecture requires.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-05T19:07:26Z
- **Completed:** 2026-07-05T19:11Z
- **Tasks:** 2/2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **Task 1 (referee run):** Confirmed the merge commit (`1f91f33`) present and `src/agda/session-load-impl.ts` carrying upstream's candidate (`runLoadNoMetas` sends plain `Cmd_load` with an empty options list, not `Cmd_load_no_metas` — verified live via read). Ran the referee command exactly as specified (`RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts test/integration/agda/agda-stale-dependency.test.ts` with Node 24 mise on PATH, real `agda` 2.8.0 confirmed present) with `--reporter=verbose` to confirm every named test actually ran (not `test.skip`'d): `issue-64-61-transitive-staleness` PASS (2306ms), `guard-no-metas-clean-load-under-fault-injection` PASS (2281ms), `agda-stale-dependency.test.ts`'s single test PASS (6581ms). No unexpected `logger.warn`-guard failures observed (would have been a separate MERGE-02/Plan-10-04 concern per the plan's own carve-out) — none occurred.
- **Task 2 (adjudication + durable record):** Verdict GREEN on all 3 meant no source change was needed to `src/session/agda-transport.ts`, `src/session/command-completion.ts`, or `src/agda/session-load-impl.ts` — Plan 10-01's candidate stands as the winner for all three sub-behaviors (completion-signal detection, fatal-stderr handling, inactivity timeout — the latter two bundled in the same file swap, confirmed by `test/unit/session/agda-transport.test.ts`'s two upstream-authored tests already passing as-is).
  - Applied the plan's UNCONDITIONAL correction (forced by Plan 10-01's CLAUDE.md fix, independent of the referee verdict) to `test/unit/agda/session-load-impl.test.ts`: rewrote both truncation tests (`runLoad`, `runLoadNoMetas`) from `rejects.toThrow(...)` assertions to return-based assertions (`result.success === false`, `result.classification === "load-incomplete-no-terminus"`, `result.errors[0]` matching `/no terminal goal-state event/i`, `session.lastClassification === "load-incomplete-no-terminus"` — never left `null`), renaming both to `"... reports incomplete when the response stream has no terminal event"` to match the pre-merge reference shape (recovered via `git show 1f91f33^1:test/unit/agda/session-load-impl.test.ts`, NOT `HEAD^1` — see Deviations below).
  - Re-added the pre-merge `"runLoad recovers dropped visible goal IDs via a metas re-query when source has holes"` test, recovered verbatim from the same pre-merge commit, coexisting with upstream's own `"runLoadNoMetas accepts a clean strict load reporting an empty goal state"` test (kept unmodified — its assertions already matched the GREEN-branch semantics since upstream's strict path, unlike the pre-merge D-02 asymmetry, also awaits the terminus).
  - Wrote `docs/LOAD-TERMINUS-ADJUDICATION.md` following `docs/DEPLOY-OPERATIONS.md`'s durable-record shape: framing paragraph naming Phase 10/MERGE-03 as origin, the exact referee command + a per-test pass/fail table, then a decision table with one row per sub-behavior (decision, rationale, referee evidence), explicitly stating that fatal-stderr and inactivity-timeout are NOT separately adjudicated — they ship bundled in the same adopted file swap.
- Full referee + directly-affected suite green: `test/integration/mcp/capture-regression.test.ts`, `test/integration/agda/agda-stale-dependency.test.ts`, `test/unit/session/agda-transport.test.ts` (19/19, including both upstream-authored watchdog/fatal-stderr tests), `test/unit/agda/session-load-impl.test.ts` (16/16), `test/unit/session/register-agda-load-no-metas.test.ts` (RT8, 2/2, unaffected) — 40/40 tests across all 5 files.
- `npx tsc -p tsconfig.test.json --noEmit` and `npx tsc -p tsconfig.json --noEmit` both exit 0 — no typing casualty (the RED-branch `LoadTerminusOptions` re-widening was never needed since the GREEN branch was taken).
- Full unit + property suite re-run for safety: 1852 passed / 17 skipped / 1 test file skipped (up from 10-01's 1849 passed / 2 failed / 17 skipped — the 2 known-red tests are now green plus 1 net-new restored test, consistent with the corrections above).

## Task Commits

1. **Task 1: Run the referee against Plan 10-01's candidate** — evidence-gathering only, no source edits (per the plan's own `<files>` annotation: "no source edits, evidence-gathering only"); no commit for this task in isolation. Verdict recorded and fed directly into Task 2.
2. **Task 2: Finalize the adjudication and write the durable record** — `c94990f` (`docs(10-02): adjudicate load-terminus semantics as GREEN, adopt upstream`).

**Plan metadata:** committed separately after this summary (see final_commit step).

## Files Created/Modified

- `docs/LOAD-TERMINUS-ADJUDICATION.md` (new) — durable adjudication record: referee command, per-test pass/fail evidence table, and a decision table covering all 3 sub-behaviors (completion-signal detection, fatal-stderr handling, inactivity timeout), each row citing decision/rationale/referee evidence per D-06.
- `test/unit/agda/session-load-impl.test.ts` — both truncation tests rewritten to assert the returned `load-incomplete-no-terminus` classification instead of throwing; the pre-merge goal-ID recovery test restored; all `expectWarning(...)` registrations upstream added preserved untouched.

## Decisions Made

- **MERGE-03 verdict: GREEN.** All 3 referee tests passed against Plan 10-01's merge candidate on the first run, with real Agda (2.8.0) and Node 24 confirmed on PATH. Per D-04, this means upstream's whole-file architecture is the adjudicated winner for every sub-behavior it touches (completion-signal detection, fatal-stderr handling, inactivity timeout) — no RED-branch revert-and-graft work (restoring `git show 1f91f33^1:PATH` originals, re-widening `LoadTerminusOptions` in `session.ts`/`session-command-dispatch.ts`, grafting the hardening onto the restored implementation) was needed. That whole branch is documented in `docs/LOAD-TERMINUS-ADJUDICATION.md` and in this summary as the deliberately-unused fallback path, for future-escalation legibility.
- Inactivity-timeout is explicitly stated in the adjudication doc as bundled with, not separately adjudicated from, completion-signal detection — both ship in the same `agda-transport.ts`/`command-completion.ts` file swap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's `git show HEAD^1:PATH` recovery instruction was stale by the time this plan executed**
- **Found during:** Task 2, recovering the pre-merge reference test shapes
- **Issue:** The plan's interfaces block says "HEAD is Plan 10-01's merge commit, ^1 is its first parent." By the time Plan 10-02 executed, Plan 10-01 had made 2 further commits after the merge (a SUMMARY commit and a plan-metadata commit), so `HEAD` was no longer the merge commit — `HEAD^1` resolved to a docs-only commit, not our pre-merge main tip. `git show HEAD^1:test/unit/agda/session-load-impl.test.ts` returned content byte-identical to the current (post-merge) working tree, which would have silently produced no-op recovery.
- **Fix:** Located the actual merge commit via `git log --merges -1 --format="%H %P"` (`1f91f33`, parents `7ab6ffb` (ours) and `d4497a2` (upstream)), then used `git show 1f91f33^1:PATH` for all pre-merge recovery reads instead of `HEAD^1`. Verified the recovered content was genuinely different (the pre-merge test named `"runLoad reports incomplete when the response stream has no terminal event"` and the recovery test, both absent from the post-merge working tree).
- **Files affected:** test/unit/agda/session-load-impl.test.ts (recovery source only; no file outside the plan's declared scope was touched).
- **Verification:** Diffed the recovered pre-merge test bodies against the plan's literal description (return-based assertions, goal-ID recovery via a second `metas()` call) — matched exactly.
- **Committed in:** c94990f

**2. [Rule 1 - Bug] Prettier formatting drift introduced by manual edits**
- **Found during:** Post-edit formatting check (not part of the plan's explicit verification, but required by CONVENTIONS.md's `.prettierrc` enforcement)
- **Issue:** `npx prettier --check` flagged both edited/created files after the manual test rewrites and new doc file (long single-line `writeFileSync` calls, an unwrapped array literal, and unaligned markdown tables) — the pre-edit file was prettier-clean.
- **Fix:** Ran `npx prettier --write` on both files, then re-ran the full referee + typecheck suite to confirm the reformatting didn't change behavior.
- **Files modified:** test/unit/agda/session-load-impl.test.ts, docs/LOAD-TERMINUS-ADJUDICATION.md
- **Verification:** `npx prettier --check` clean; full 40-test referee suite still green; `tsc --noEmit` still exits 0 on both configs.
- **Committed in:** c94990f

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** Neither deviation touched files outside the plan's declared scope or weakened any from-RED lock (D-05); both were necessary to make the plan's own literal recovery instructions and formatting convention actually hold under empirical re-verification, consistent with the executor's "verify claims, don't trust the plan's under-predicted specifics" pattern already established in Plan 10-01.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 10-03 (ADOPT-01/02 feature wiring — `agda_goal_candidates` term search, Mimer auto fix) can proceed immediately: the load-terminus seam is now in a single coherent, adjudicated state with zero open questions about "which implementation wins," so Plan 10-03's work is isolated to genuinely new upstream features rather than architecture already settled here.
- `docs/LOAD-TERMINUS-ADJUDICATION.md` is the durable answer for Phase 11's future 3-day auto-sync escalations asking "why are the load-terminus semantics the way they are" — no archaeology needed.
- Nothing pushed to origin (D-10) — exactly one push happens at the end of the whole phase (Plan 10-05).

---
*Phase: 10-upstream-reconcile*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: docs/LOAD-TERMINUS-ADJUDICATION.md
- FOUND: test/unit/agda/session-load-impl.test.ts
- FOUND: .planning/phases/10-upstream-reconcile/10-02-SUMMARY.md
- FOUND commit: c94990f (docs(10-02): adjudicate load-terminus semantics as GREEN, adopt upstream)
