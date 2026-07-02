---
phase: 04-triage-fix-queue
plan: 05
subsystem: infra
tags: [priority-comparator, markdown-dashboard, writeFileAtomic, vitest, pure-function, tdd]

# Dependency graph
requires:
  - phase: 04-01
    provides: fixQueueEntrySchema/fixQueue typed loader (defectKind/recurrence fields this plan's comparator reads)
  - phase: 04-03
    provides: the real 13-entry seed cargo the dashboard is regenerated against (flagship #64/#61 + 8 CHG turn-key specs + 4 CHG candidates)
provides:
  - "scripts/queue/priority.mjs: DEFECT_KIND_WEIGHT / comparePriority / sortByPriority — the ONE place QUEUE-02's forced priority ordering (false-green > crash > wrong-result > missing-feature, recurrence-descending tie-break) lives"
  - "scripts/queue/dashboard.mjs: renderDashboard / regenerateDashboard — a pure markdown builder + writeFileAtomic-backed regeneration, importing sortByPriority rather than re-deriving an ordering"
  - "docs/FIX-QUEUE-DASHBOARD.md: the real, regenerated D-03 dashboard reflecting the seeded 13-entry queue (per-status counts sum to 13, close-rate 1/13, 0 entries in fixing)"
affects: [05-dogfooding-orchestration-fuel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One frozen weight table (DEFECT_KIND_WEIGHT) is the single source of truth for a categorical priority ordering — every consumer (comparePriority directly, dashboard.mjs indirectly via sortByPriority) reads the same table rather than each re-deriving its own ordering"
    - "renderDashboard is a pure function (no Date.now()/live timestamp in its return value) so its markdown output is deterministically testable and safely diffable in git history"
    - "Dashboard tests cross-check table row order directly against sortByPriority's own output rather than a hardcoded expectation list, so the two can never independently drift"
    - "Hand-rolled markdown table via plain string-join (no new dependency) — confirmed no markdown-table package exists anywhere in this repo, matching 04-PATTERNS.md's own 'No Analog Found' note for this exact concern"

key-files:
  created:
    - scripts/queue/priority.mjs
    - test/unit/tools/queue-priority.test.ts
    - scripts/queue/dashboard.mjs
    - test/unit/tools/queue-dashboard.test.ts
    - docs/FIX-QUEUE-DASHBOARD.md
  modified: []

key-decisions:
  - "Added escapeTableCell (Rule 2) to escape a literal `|` in entry.title before it lands in a markdown table cell — free-text title content could otherwise corrupt the table's column structure; no existing seed entry triggers this today, but it is cheap, defensive hardening for future queue entries"
  - "WIP_LIMIT = 3 (Claude's discretion per 04-CONTEXT.md) — a simple, easily-adjusted module constant, documented inline as advisory-only per D-06/Pitfall 7 (never a hard block)"
  - "renderTable requires an ALREADY-sorted array (sortByPriority(entries)'s own output) rather than sorting internally a second time — keeps the 'one sort call, one ordering' invariant explicit in the code shape, not just by convention"

patterns-established:
  - "Priority is never stored on a queue entry — always computed on the fly from defectKind + recurrence, matching test/fixtures/fix-queue.ts's own header comment (no independent-drift risk)"
  - "A view-generation script (dashboard.mjs) composes a pure render function with a thin writeFileAtomic-backed persistence wrapper (regenerateDashboard), letting tests exercise the pure function directly without ever touching the filesystem for most assertions"

requirements-completed: [QUEUE-02]

# Metrics
duration: ~8min
completed: 2026-07-02
---

# Phase 04 Plan 05: Priority Scoring + Regenerated Dashboard Summary

**Pure QUEUE-02 priority comparator (false-green > crash > wrong-result > missing-feature, recurrence-descending tie-break) plus a regenerated, priority-sorted Markdown dashboard (per-status counts, D-06 close-rate metric, advisory WIP-limit line) verified against the real 13-entry seeded fix-queue cargo.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-02T18:47:00-04:00 (approx., first context read)
- **Completed:** 2026-07-02T18:54:21-04:00
- **Tasks:** 2 completed
- **Files modified:** 5 (all created)

## Accomplishments

- `comparePriority`/`sortByPriority` (`scripts/queue/priority.mjs`) implement QUEUE-02's exact forced ordering as one pure, deterministic, non-mutating function — proven by 6 tests including a direct band-ordering check, a within-band recurrence tie-break, non-mutation of the caller's array, and determinism across repeated calls.
- `DEFECT_KIND_WEIGHT` is a single frozen table (`false-green: 0, crash: 1, wrong-result: 2, missing-feature: 3`) that both `comparePriority` and `scripts/queue/dashboard.mjs` (indirectly, via `sortByPriority`) read — the ordering can never independently drift between the two modules.
- `renderDashboard`/`regenerateDashboard` (`scripts/queue/dashboard.mjs`) build a fully deterministic, hand-rolled markdown view: priority-sorted table (Fingerprint/Status/DefectKind/TriageClass/Title/Recurrence), per-status counts, the D-06 close-rate metric, and an advisory (never hard-blocking) WIP-limit line on the `fixing` status — proven by 5 tests, including one that cross-checks the table's row order directly against `sortByPriority`'s own output rather than a hardcoded list.
- `docs/FIX-QUEUE-DASHBOARD.md` was regenerated for real (`npx tsx scripts/queue/dashboard.mjs`) against the actual 13-entry seed cargo from Plan 04-03: per-status counts sum to 13 (locked: 1, triaged: 4, new: 8), the close-rate line reads `1/13`, and the WIP line reads `0 entries in fixing (advisory WIP limit: 3)` — confirming the false-green band (8 entries) sorts entirely ahead of wrong-result (2) and missing-feature (3), with no crash-band entries present in the current cargo.
- Full `test/unit/` suite (137 files, 1240 tests) re-run after both tasks landed — all green, no regressions introduced.

## Task Commits

Each task was committed atomically. Task 1 is `tdd="true"` and follows the RED → GREEN gate sequence:

1. **Task 1 (RED): failing test for priority.mjs comparator** - `15fc846` (test)
2. **Task 1 (GREEN): implement priority.mjs comparator** - `2ee1bc1` (feat)
3. **Task 2: dashboard.mjs — regenerated view + real regeneration** - `1ceede6` (feat)

_Note: Per this plan's `<parallel_execution>` instructions, STATE.md/ROADMAP.md are intentionally NOT updated by this executor — the orchestrator handles that separately for parallel-wave plans._

## Files Created/Modified

- `scripts/queue/priority.mjs` - `DEFECT_KIND_WEIGHT` (frozen ordering-weight table), `comparePriority(a, b)` (band-then-recurrence comparator), `sortByPriority(entries)` (non-mutating `[...entries].sort()` wrapper)
- `test/unit/tools/queue-priority.test.ts` - 6 tests: band ordering, within-band recurrence tie-break, non-mutation, determinism, plus direct `comparePriority`/`DEFECT_KIND_WEIGHT` coverage
- `scripts/queue/dashboard.mjs` - `renderDashboard(entries)` (pure markdown builder), `regenerateDashboard(entries, path)` (writeFileAtomic-backed write), CLI entry point regenerating `docs/FIX-QUEUE-DASHBOARD.md` from the real `fixQueue`
- `test/unit/tools/queue-dashboard.test.ts` - 5 tests: empty-queue never-throws, table-order cross-check against `sortByPriority`, close-rate hand-computed count, WIP info/warning wording switch, atomic-write-to-tmpdir
- `docs/FIX-QUEUE-DASHBOARD.md` - the real, regenerated dashboard reflecting all 13 seeded queue entries

## Decisions Made

- Added `escapeTableCell` to escape a literal `|` in `entry.title` before it lands in a markdown table cell (Rule 2 — a free-text field flowing unescaped into a table structure is a latent correctness gap; no current seed entry triggers it, but future queue entries could).
- Fixed the advisory WIP-limit default at `3` (Claude's discretion per 04-CONTEXT.md), documented inline as a simple, easily-adjusted constant — never a hard block, per D-06/Pitfall 7.
- Kept `renderTable` accepting an already-sorted array rather than sorting internally, so "sort once, via `sortByPriority`" stays an explicit invariant in the code shape rather than an implicit convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Escaped `|` in free-text title before markdown table interpolation**
- **Found during:** Task 2 (dashboard.mjs implementation)
- **Issue:** The plan's `<action>` text describes the table columns but does not mention escaping free-text `title` content; an entry with a literal `|` character in its title would silently corrupt the rendered table's column structure.
- **Fix:** Added a small `escapeTableCell` helper (`replaceAll("|", "\\|")`) applied to the `title` column only (the sole free-text column among the six).
- **Files modified:** `scripts/queue/dashboard.mjs`
- **Verification:** `npx vitest run test/unit/tools/queue-dashboard.test.ts` — all 5 assertions green; the real 13-entry regeneration's table renders correctly (no seed title currently contains `|`, so this is defensive-only for now).
- **Committed in:** `1ceede6` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added direct comparePriority/DEFECT_KIND_WEIGHT test coverage**
- **Found during:** Task 1 (priority.mjs test authoring)
- **Issue:** The plan's 4-item behavior list exercises `sortByPriority` exclusively; `comparePriority` and `DEFECT_KIND_WEIGHT` are separately-exported, plan-mandated symbols (`must_haves.artifacts`) with no direct test of their own.
- **Fix:** Added 2 supplementary tests asserting `comparePriority`'s negative/positive/zero return contract directly, and `DEFECT_KIND_WEIGHT`'s frozen state plus its band ordering — mirroring the identical precedent already established in this repo (`test/unit/tools/oracle-verdict-schema.test.ts`'s own "Added per Rule 2" supplementary test for `abstentionMetricLine`).
- **Files modified:** `test/unit/tools/queue-priority.test.ts`
- **Verification:** `npx vitest run test/unit/tools/queue-priority.test.ts` — all 6 assertions green.
- **Committed in:** `15fc846` (Task 1 RED commit; both symbols already fail-to-import at this point, same as the 4 plan-specified tests)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical robustness/coverage)
**Impact on plan:** Both additions are defensive/coverage hardening only — no change to QUEUE-02's ordering semantics or the D-03 dashboard's documented shape. No scope creep.

## Issues Encountered

None. `node_modules` was absent at session start (fresh worktree) and ambient `node` was v22 (below the `>=24` engine requirement); ran `npm install` once and used `mise exec node@24 --` for every `npx`/`vitest`/`tsx` invocation thereafter, per this plan's own execution instructions.

## User Setup Required

None - no external service configuration required. This plan touches only in-repo scripts, tests, and a regenerated markdown file.

## Next Phase Readiness

- QUEUE-02 is complete: every fix-queue entry now has one deterministic, computed-on-the-fly priority ordering, never independently stored or re-derived elsewhere.
- `docs/FIX-QUEUE-DASHBOARD.md` gives the maintainer (or an agent) a one-glance answer to "what should I work on next?" without hand-reading 13 raw JSON objects — this was this plan's own stated purpose as the LAST wave of Phase 4.
- `scripts/queue/dashboard.mjs` should be re-run (`npx tsx scripts/queue/dashboard.mjs`) any time `test/fixtures/fix-queue.json` changes (new intake, status transitions, recurrence bumps) to keep the committed view in sync — this is a manual-first regeneration trigger, matching D-08's own manual-first status-transition philosophy; no automated hook currently calls it.
- No blockers for Phase 5 (dogfooding orchestration): `sortByPriority`/`comparePriority` are stable, importable, side-effect-free exports ready for any future orchestration code to consume directly.

---
*Phase: 04-triage-fix-queue*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: scripts/queue/priority.mjs
- FOUND: test/unit/tools/queue-priority.test.ts
- FOUND: scripts/queue/dashboard.mjs
- FOUND: test/unit/tools/queue-dashboard.test.ts
- FOUND: docs/FIX-QUEUE-DASHBOARD.md
- FOUND: commit 15fc846 (Task 1 RED)
- FOUND: commit 2ee1bc1 (Task 1 GREEN)
- FOUND: commit 1ceede6 (Task 2)
