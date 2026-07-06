---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 08
subsystem: tooling
tags: [dogfood, run-id-validation, script-deletion, health-report-cutlist, pipeline]

# Dependency graph
requires:
  - phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove (Plan 07)
    provides: 12-APPROVED-CUTS.md — the D-03 sign-off record naming CUT-01 and CUT-02 as the only two approved pipeline cuts
provides:
  - scripts/dogfood/run-id.mjs — shared assertSafeRunId guard, consumed by both dogfood-run.mjs and dogfood-wrapup.mjs
  - test/unit/tools/dogfood-run-id.test.ts — dedicated unit coverage for the extracted guard
  - scripts/queue/seed-initial-cargo.mjs removed — its one-off seeding job's output is already durable in test/fixtures/fix-queue.json
affects: [any future plan touching scripts/dogfood/*, scripts/queue/*, or the pipeline category of 12-HEALTH-REPORT.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-module extraction for cross-CLI duplicated pure validators (12-PATTERNS.md Pattern 3/4): same-directory .mjs sibling, no scripts/lib or scripts/shared convention"
    - "Script-deletion lockstep checklist (12-PATTERNS.md Shared Pattern A): git rm, grep for importers, check/delete test, check package.json scripts block, update stale doc mentions"

key-files:
  created:
    - scripts/dogfood/run-id.mjs
    - test/unit/tools/dogfood-run-id.test.ts
  modified:
    - scripts/dogfood/dogfood-run.mjs
    - scripts/dogfood/dogfood-wrapup.mjs
    - test/unit/tools/dogfood-wrapup-argv-parsing.test.ts
    - .planning/codebase/STRUCTURE.md

key-decisions:
  - "Scope was restricted to exactly CUT-01 and CUT-02 per the orchestrator's scope_override — this matches 12-APPROVED-CUTS.md's own approved set for category=pipeline exactly (both approved rows, zero others), so no narrowing beyond what was already textually approved."
  - "CUT-01 and CUT-02 were combined into a single commit, matching the original 12-08-PLAN.md Task 1 instruction ('commit all of this task's changes together as one commit') for the non-deploy-relevant batch."
  - "Task 2 (deploy-relevant pipeline cuts, watched redeploy) executed as a documented no-op: 12-APPROVED-CUTS.md has zero approved pipeline rows outside CUT-01/CUT-02, so no scripts/oracle, scripts/queue/intake.mjs, or scripts/team file was touched and no redeploy was needed or attempted."
  - "Kept the more-informative --run-id-flag-shaped error message text for the shared assertSafeRunId (per 12-HEALTH-REPORT.md CUT-01's Fix approach and 12-PATTERNS.md Pattern 3's own recommendation), which changes dogfood-wrapup.mjs's user-visible error text for its positional caller — a deliberate, documented behavior change, not a pure refactor."

requirements-completed: [D-01, C-01, C-02]

# Metrics
duration: ~20min
completed: 2026-07-06
---

# Phase 12 Plan 08: Pipeline Cuts (CUT-01, CUT-02) Summary

**Extracted the duplicated-and-drifted `assertSafeRunId` guard into `scripts/dogfood/run-id.mjs` and deleted the fully-superseded `scripts/queue/seed-initial-cargo.mjs`, the only two pipeline-category cuts the D-03 sign-off approved.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-06 (commit `af8f706` timestamp: 2026-07-05T23:45:27-04:00)
- **Tasks:** 1 executed (combined CUT-01 + CUT-02 commit) + 1 no-op (Task 2, zero approved deploy-relevant items)
- **Files modified:** 7 (2 created, 1 deleted, 4 modified)

## Accomplishments

- `scripts/dogfood/run-id.mjs` now owns the single `assertSafeRunId` implementation; `dogfood-run.mjs` and `dogfood-wrapup.mjs` both import it instead of carrying their own (already measurably drifted) copies.
- New dedicated unit test file `test/unit/tools/dogfood-run-id.test.ts` covers the shared guard directly (flag-shaped, path-separator, `.`/`..`, and happy-path cases).
- `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts`'s two now-broken assertions were updated in the same commit to match the adopted `--run-id`-flag-shaped message text.
- `scripts/queue/seed-initial-cargo.mjs` (355 lines, zero importers, zero test coverage, its entire job already durable in `test/fixtures/fix-queue.json`) removed outright; its two one-line mentions in `.planning/codebase/STRUCTURE.md` updated in the same commit.
- Full local verification gate green after the batch: `npm run build`, `npx tsc -p tsconfig.test.json --noEmit`, and `RUN_AGDA_INTEGRATION=1 npx vitest run` (234 test files / 2045 tests, 0 failures, 5 pre-existing skips) all exit 0.

## Task Commits

1. **Task 1: Execute approved non-deploy-relevant pipeline cuts (CUT-01 + CUT-02)** — `af8f706` (refactor)
2. **Task 2: Execute approved deploy-relevant pipeline cuts with a watched redeploy** — no commit; documented no-op (see below)

_No separate "plan metadata" commit was created — per the orchestrator context, STATE.md/ROADMAP.md updates are owned by the orchestrator after the worktree merges, not by this executor._

### Task 2 disposition (no-op, by design)

`12-APPROVED-CUTS.md`'s Normalized decisions table has exactly two rows with `category: pipeline`, both `decision: approved` (CUT-01, CUT-02), and both are non-deploy-relevant per `12-HEALTH-REPORT.md`'s own `Deploy-relevant: no` field on each row. There is no approved pipeline row whose files fall under `scripts/oracle/**`, `scripts/queue/intake.mjs`, or `scripts/team/**`. Task 2's entire file set was therefore left untouched — no code change, no commit, no push, no redeploy watch, per the orchestrator's explicit scope_override instruction. This satisfies Task 2's own acceptance criteria vacuously (there is nothing to execute, and nothing was silently skipped — this disposition is the explicit record).

## Files Created/Modified

- `scripts/dogfood/run-id.mjs` — new shared module exporting `assertSafeRunId`, MIT header + IN-01 why-comment, `--run-id`-flag-shaped message text
- `scripts/dogfood/dogfood-run.mjs` — removed local `assertSafeRunId`; added `import { assertSafeRunId } from "./run-id.mjs";`
- `scripts/dogfood/dogfood-wrapup.mjs` — removed local `assertSafeRunId`; added `import { assertSafeRunId } from "./run-id.mjs";`
- `test/unit/tools/dogfood-run-id.test.ts` — new unit test file for the shared guard (7 test cases)
- `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts` — lines 23, 27: `/invalid run-id/` → `/invalid --run-id value/`
- `scripts/queue/seed-initial-cargo.mjs` — deleted (355 lines; one-off seeding script, job already complete and durable elsewhere)
- `.planning/codebase/STRUCTURE.md` — removed the two `seed-initial-cargo.mjs` mentions (directory-tree line + `scripts/queue/` prose description), re-terminating the directory tree's `└──` marker on `mirror-github.mjs`

## Decisions Made

- **Scope confirmation, not narrowing:** the orchestrator's scope_override named CUT-01/CUT-02 explicitly; cross-checked against `12-APPROVED-CUTS.md`'s Normalized decisions table and confirmed these are in fact the *only* two `category: pipeline` rows with `decision: approved` — the override and the sign-off record agree exactly, so nothing that was actually approved was left out.
- **Single combined commit for Task 1:** `12-08-PLAN.md`'s own Task 1 action text says "Commit all of this task's changes together as one commit" — followed literally, landing CUT-01's five touched/created files and CUT-02's two touched/deleted files in one commit (`af8f706`).
- **`npm ci` run before the gate:** this fresh worktree's `node_modules` was empty (only vite cache dirs present) — `npm run build`/`typecheck:test`/`vitest` would all fail without it. `12-08-PLAN.md`'s own Task 1 action already specifies `npm ci` as the gate's first step, so this is not a deviation, just executing the gate as written.
- **No push, no tag, no deploy watch:** per the orchestrator's `<no_push_no_tag>` directive, the commit stays local on the `worktree-agent-aea128571176c9046` branch; the orchestrator owns any subsequent push after merging this worktree's work back.

## Deviations from Plan

None — plan executed exactly as approved. The two informational notes below are not rule-triggered deviations; they're details worth recording for the next reader:

- The `npm ci` step (needed because this worktree started with an empty `node_modules`) is literally the first command `12-08-PLAN.md`'s Task 1 action prescribes for the verification gate — not an addition.
- Task 2 produced zero file changes because zero approved deploy-relevant pipeline cuts exist — this is a property of `12-APPROVED-CUTS.md`, not a shortcut taken during execution.

## Issues Encountered

- Fresh worktree had an empty `node_modules` (only `.vite`/`.vite-temp` cache directories present, `node_modules/.bin/tsx` missing) — caused an initial `spawn ENOENT` failure in `dogfood-run-report-checkpoint.test.ts` (a subprocess-spawning test, itself on the Regression-Lock Exclusion List and untouched by this plan). Resolved by running `npm ci` per the plan's own gate sequence; re-ran the affected test files afterward and confirmed all green before proceeding to the full gate.

## Must-Haves Verification

- ✅ Only CUT-01 and CUT-02 (both `category: pipeline`, both `decision: approved`) were executed; every other pipeline-adjacent file (`scripts/oracle/**`, `scripts/team/**`, `scripts/queue/intake.mjs`, `scripts/queue/{dashboard,mirror-github,priority}.mjs`) was left untouched.
- ✅ Zero files from `12-HEALTH-REPORT.md`'s Regression-Lock Exclusion List appear in this commit's diff (`dogfood-wrapup-argv-parsing.test.ts` is explicitly NOT on that list; confirmed via direct re-read of the exclusion list plus `git diff --name-only HEAD~1 HEAD`).
- ✅ Neither known-open oracle defect (fingerprint `2eb1768df88bfb07` or `1220f2840142aab8`) was touched, silently resolved, or had its code path altered — this plan's scope never reached `scripts/oracle/**`.
- ✅ Full local verification gate (`npm run build`, `npx tsc -p tsconfig.test.json --noEmit`, `RUN_AGDA_INTEGRATION=1 npx vitest run`) is green after the one commit this plan made.
- ✅ Artifact `scripts/dogfood/run-id.mjs` exists (CUT-01 was approved).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CUT-01 and CUT-02 are fully closed out; `12-APPROVED-CUTS.md`'s pipeline category (2/2 approved rows) is now 100% executed.
- No outstanding work remains for the pipeline category — the 14 deferred rows (docs-residue, tools, src-subtraction categories, plus the upstream-inherited pipeline-adjacent items) are explicitly out of this plan's scope and belong to Plans 12-09/12-10/12-11 or a future upstream PR, not this plan.
- Nothing here blocks any later phase-12 plan: no shared file this plan touched (`scripts/dogfood/*`, `scripts/queue/seed-initial-cargo.mjs`, `.planning/codebase/STRUCTURE.md`) is claimed by another in-flight Wave-4 plan's `files_modified` list.

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: `scripts/dogfood/run-id.mjs`
- FOUND: `test/unit/tools/dogfood-run-id.test.ts`
- FOUND: `scripts/dogfood/dogfood-run.mjs`
- FOUND: `scripts/dogfood/dogfood-wrapup.mjs`
- FOUND: `.planning/codebase/STRUCTURE.md`
- CONFIRMED DELETED: `scripts/queue/seed-initial-cargo.mjs`
- FOUND commit: `af8f706`
