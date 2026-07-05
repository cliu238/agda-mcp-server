---
phase: 10-upstream-reconcile
plan: 03
subsystem: mcp-tools
tags: [mcp-tools, tool-recommendation, tool-manifest, docs, discoverability, mimer, term-search]

# Dependency graph
requires:
  - phase: 10-01 (merge upstream v0.6.8)
    provides: registerGoalCandidates + register-goal-candidates.ts carried in verbatim, already wired into reporting-tools.ts's register() by upstream's own commit b717ad4 (discovered, not assumed, during this plan)
provides:
  - agda_goal_candidates recommended by tool-recommendation.ts's has-holes branch (priority 4.5, right after agda_context)
  - agda_goal_candidates documented in tool-family-examples.json's "proof" family, README.md's "What it can do", and docs/assistant-workflows.md's goal-level-work section
  - Confirmation (not assumption) that agda_goal_candidates is already manifest-registered end-to-end via upstream's own merge — mcp-e2e-coverage.test.ts was already GREEN before this plan touched any code
affects: [10-04 (full acceptance — no known gaps left for ADOPT-01/02)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Before adding a second register() call for a tool believed to be unwired, grep for its registration function across all of src/tools/ — manifest.ts's own duplicate-registration guard (registerManifestEntry) is the fast, authoritative signal that a tool is already wired somewhere else."

key-files:
  created:
    - .planning/phases/10-upstream-reconcile/deferred-items.md
  modified:
    - src/session/tool-recommendation.ts
    - src/tools/data/tool-family-examples.json
    - README.md
    - docs/assistant-workflows.md

key-decisions:
  - "Did NOT add a second registerGoalCandidates(server, session, projectRoot) call to register-core-tools.ts as Task 1's action text instructed — upstream's own merge commit (b717ad4, carried in by Plan 10-01's 1f91f33) already wired it into reporting-tools.ts's register() function, which register-core-tools.ts already calls via registerReporting. Attempting the literal plan action tripped manifest.ts's own duplicate-registration guard (`Duplicate tool registration for agda_goal_candidates`); reverting confirmed mcp-e2e-coverage.test.ts was already GREEN pre-plan."
  - "Used limitPerGoal (the tool's actual, only input field) instead of the plan-suggested goalId arg in the tool-family-examples.json entry — register-goal-candidates.ts's callback signature takes no goalId; the tool processes every open goal in one call, so a goalId example would misdocument the interface."
  - "Placed the new tool-recommendation.ts entry at priority 4.5 (decimal, between agda_context=4 and agda_auto=5) rather than renumbering neighbors, per the plan's own diff-noise-minimization guidance."

requirements-completed: [ADOPT-01, ADOPT-02]

# Metrics
duration: 8min
completed: 2026-07-05
---

# Phase 10 Plan 03: Wire agda_goal_candidates into discoverability layers Summary

**Discovered agda_goal_candidates was already manifest-registered by upstream's own merged commit (via reporting-tools.ts, not a gap Plan 10-03 needed to close); wired the remaining two real gaps — tool-recommendation.ts and human-facing docs (README.md, docs/assistant-workflows.md, tool-family-examples.json) — with a corrected limitPerGoal-only example matching the tool's real schema.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-05T15:15Z (immediately after 10-02's completion commit)
- **Completed:** 2026-07-05T15:20Z
- **Tasks:** 2/2
- **Files modified:** 4 (+1 new deferred-items.md)

## Accomplishments

- Confirmed `agda_goal_candidates` is already manifest-visible and discoverable through `agda_tools_catalog`/`listToolManifest()` — upstream's own #70 commit (`b717ad4`) wired `registerGoalCandidates` into `reporting-tools.ts`'s `register()` function (alongside `agda_goal_catalog`), and this file's `register()` is already one of the 13 calls `registerCoreTools` makes via `registerReporting`. `test/unit/tools/mcp-e2e-coverage.test.ts`'s strict `matrixNames === manifestNames` assertion was already GREEN before this plan changed any code — proven by deliberately reverting an attempted duplicate registration and re-running the test in that reverted state.
- Added `agda_goal_candidates` as a new `addIfAvailable(...)` recommendation in `tool-recommendation.ts`'s has-holes branch, priority 4.5 (between `agda_context`=4 and `agda_auto`=5), with a rationale distinguishing it from `agda_auto`'s full proof search and `agda_case_split`'s structural splitting.
- Added a representative `agda_goal_candidates` invocation to `tool-family-examples.json`'s `"proof"` array (surfaced through `agda_tools_catalog`'s worked-example list), using `{ "limitPerGoal": 20 }` — the tool's actual (and only) input field — rather than the plan's suggested `goalId`, since the tool has no `goalId` parameter and covers every open goal in one call.
- Named `agda_goal_candidates` alongside the other proof actions in README.md's "What it can do" section, without restructuring the sentence or removing the `agda_tools_catalog` deferral.
- Added a short pointer in `docs/assistant-workflows.md`'s "Goal-level work: all goals in one call" section directing an agent to call `agda_goal_candidates` right after `agda_goal_catalog` for concrete fillable terms per goal.

## Task Commits

1. **Task 1: Wire the manifest + recommendation layers** — `e44dd0d` (feat) — only the `tool-recommendation.ts` change; the manifest-wiring half of the task was already satisfied by upstream's own merge (see Deviations).
2. **Task 2: Documentation + discoverability polish** — `e349f38` (docs) — `tool-family-examples.json`, `README.md`, `docs/assistant-workflows.md`, plus `deferred-items.md` logging an unrelated out-of-scope test observation.

**Plan metadata:** committed separately after this summary (see final_commit step).

## Files Created/Modified

- `src/session/tool-recommendation.ts` — new `addIfAvailable` entry for `agda_goal_candidates` in the has-holes branch, priority 4.5.
- `src/tools/data/tool-family-examples.json` — new `"proof"` family entry for `agda_goal_candidates` with a `limitPerGoal`-only example.
- `README.md` — "What it can do" proof-actions clause extended to name `agda_goal_candidates`.
- `docs/assistant-workflows.md` — "Goal-level work" section extended with a pointer from `agda_goal_catalog` to `agda_goal_candidates`.
- `.planning/phases/10-upstream-reconcile/deferred-items.md` — created; logs 6 unrelated `team-install-pinned-env.test.ts` failures observed during a broader sanity sweep (out of this plan's file scope).
- `src/tools/register-core-tools.ts` — touched then reverted (see Deviations); final state is unchanged from before this plan.

## Decisions Made

- Left `register-core-tools.ts` untouched: the tool is already wired transitively via `registerReporting` → `reporting-tools.ts` → `registerGoalCandidates`, and manifest.ts's own SSOT duplicate-registration guard is the correct enforcement mechanism here, not something to route around with a second call site.
- Used the tool's real `limitPerGoal` schema field in the worked example rather than the plan's suggested `goalId`, since `agda_goal_candidates` takes no `goalId` and processes every open goal in a single call.
- Kept the tool-recommendation.ts priority slot decimal (4.5) rather than renumbering neighbors 5-8, matching the plan's own diff-noise-minimization guidance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's Task 1 premise was factually wrong: agda_goal_candidates was already registered through register-core-tools.ts, not unwired**
- **Found during:** Task 1, first verification run (`npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts ...`)
- **Issue:** Following the plan's literal action text (add `import { registerGoalCandidates } from "./register-goal-candidates.js"` + a new `registerGoalCandidates(server, session, projectRoot)` call to `register-core-tools.ts`) produced a runtime error: `Duplicate tool registration for agda_goal_candidates: the manifest already contains an entry.` Tracing the collision showed `src/tools/reporting-tools.ts` already imports and calls `registerGoalCandidates` (added by upstream's own commit `b717ad4`, carried in verbatim by Plan 10-01's merge `1f91f33`) — and `reporting-tools.ts`'s `register()` is already one of `register-core-tools.ts`'s 13 existing calls, via `registerReporting`. Reverting the attempted addition and re-running `mcp-e2e-coverage.test.ts` alone confirmed it was already GREEN — the plan's "test/unit/tools/mcp-e2e-coverage.test.ts is RED right now" premise did not hold; ADOPT-01's manifest-registration requirement was already satisfied before this plan began.
- **Fix:** Reverted `register-core-tools.ts` to its pre-plan state (no import, no call added there). No functional gap remained to close for manifest wiring — the tool is discoverable through the existing `reporting-tools.ts` registration path.
- **Files modified:** src/tools/register-core-tools.ts (net: unchanged from before this plan)
- **Verification:** `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts test/unit/session/tool-recommendation.test.ts test/unit/tools/goal-candidates.test.ts test/unit/tools/tool-family-examples.test.ts` — 22/22 passed.
- **Committed in:** N/A (net-zero change; documented in e44dd0d's commit message instead)

**2. [Rule 1 - Bug] Plan's suggested tool-family-examples.json args (`goalId`) do not match the tool's actual schema**
- **Found during:** Task 2, reading `register-goal-candidates.ts`'s callback signature while authoring the example
- **Issue:** The plan's action text said to use "a representative invocation with a `goalId` arg." `register-goal-candidates.ts`'s `inputSchema` only defines `limitPerGoal` (optional, `z.number().int().min(1).max(100)`) — there is no `goalId` field; the tool intentionally covers every open goal in one call, unlike `agda_case_split`/`agda_give`/`agda_auto` which target a single goal.
- **Fix:** Used `{ "limitPerGoal": 20 }` as the example args instead, with a `note` clarifying the tool takes no `goalId` and covers every open goal at once.
- **Files modified:** src/tools/data/tool-family-examples.json
- **Verification:** `npx vitest run test/unit/tools/tool-family-examples.test.ts` — 6/6 passed (zod schema validates `args: z.record(z.string(), z.unknown())`, so either shape would have passed the schema check, but only the corrected version is truthful documentation).
- **Committed in:** e349f38 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — plan premise/detail corrections, not code bugs in the traditional sense)
**Impact on plan:** Both corrections were necessary for the plan's own literal acceptance criteria to make sense against reality. Deviation 1 means one of the plan's four `key_links`/`artifacts` frontmatter claims (registerGoalCandidates wired via register-core-tools.ts specifically) is not literally true in the final tree — the underlying requirement (manifest-registered, tool-recommendation-wired, docs-discoverable) is fully met via the equivalent existing path. No scope creep; no architectural change.

## Issues Encountered

- Ran the broader `test/unit test/property` suite as a sanity check beyond this plan's own required verification set and found 6 pre-existing, unrelated failures in `test/unit/tools/team-install-pinned-env.test.ts` (network/corpora-fetch dependent assertions, plus one spawned-process Node-version mismatch). Logged to `.planning/phases/10-upstream-reconcile/deferred-items.md` per the SCOPE BOUNDARY rule rather than investigated/fixed — none of the 6 files this plan touches are involved.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- ADOPT-01 and ADOPT-02 are both satisfied: `agda_goal_candidates` is manifest-registered (confirmed, not newly wired), recommended when goals are open, and documented in `tool-family-examples.json`, `README.md`, and `docs/assistant-workflows.md`.
- Plan 10-04 (full acceptance: real-Agda full suite, `typecheck:test`, build, one dogfood session) has no known ADOPT-family gaps left to close.
- Note for whoever reviews Plan 10-03's own frontmatter against the final tree: the `key_links` entry claiming `register-core-tools.ts` → `register-goal-candidates.ts` via a direct import+call is not literally present in the diff — the equivalent link exists transitively through `reporting-tools.ts` (already present pre-plan, from upstream's own merge). This is intentional and documented above, not an oversight.
- Nothing pushed to origin (D-10) — exactly one push happens at the end of the whole phase (Plan 10-05).

---
*Phase: 10-upstream-reconcile*
*Completed: 2026-07-05*
