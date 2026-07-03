---
phase: 04-triage-fix-queue
plan: 01
subsystem: infra
tags: [zod, vitest, json-schema, cli-script, dedup, matrix-as-ssot]

# Dependency graph
requires:
  - phase: 01-capture-foundation
    provides: readDedupIndex()'s existing guarded-read contract (D-03) — this plan repoints its indexPath, preserving signature/never-throw guard
  - phase: 03-regression-lock-pipeline
    provides: the capture-regression-matrix.{json,ts} matrix-as-SSOT + typed-loader idiom this plan copies verbatim for the fix queue
provides:
  - "test/fixtures/fix-queue.{ts,json}: the zod-validated FixQueueEntry contract + typed-loader SSOT for the fix queue (QUEUE-01)"
  - "scripts/queue/intake.mjs: readQueueFile / upsertQueueEntry — the low-level append-new-or-bump-in-place primitive every future intake path funnels through (D-06 graveyard guard)"
  - "src/agda/session-capture/dedup-index.ts repointed to read the in-repo queue file instead of the old gitignored, machine-local index (D-04)"
affects: [04-02, 04-03, 04-04, 04-05, 05-dogfooding-orchestration-fuel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Matrix-as-SSOT + typed loader (zod schema + loadValidatedJsonData) applied to a mutable, status-lifecycle-bearing entity (not just static replay data) for the first time"
    - "Append-new-or-bump-in-place upsert primitive keyed on a stable fingerprint, validated before every write via the schema, atomic write via writeFileAtomic"

key-files:
  created:
    - test/fixtures/fix-queue.ts
    - test/fixtures/fix-queue.json
    - test/unit/fixtures/fix-queue.test.ts
    - scripts/queue/intake.mjs
    - test/unit/tools/queue-intake.test.ts
  modified:
    - src/agda/session-capture/dedup-index.ts
    - test/unit/agda/session-capture/dedup-index.test.ts

key-decisions:
  - "No new decisions — this plan implemented 04-CONTEXT.md's D-01/D-02/D-04/D-05/D-06/D-07/D-09 exactly as specified, with zero deviations."

patterns-established:
  - "Fix queue entries carry no stored `priority` field by design — priority is always computed on the fly from defectKind + recurrence by a later plan's comparePriority, so it can never drift out of sync with the data it derives from."
  - "readDedupIndex's guarded-read contract (existsSync + try/catch, never throws, duck-typed per-item validation) survives a full data-source repoint unchanged — the pattern generalizes from object-keyed to array-of-entries shapes without touching the function's public signature."

requirements-completed: [QUEUE-01]

# Metrics
duration: ~15min
completed: 2026-07-02
---

# Phase 04 Plan 01: Fix Queue Foundational Engine Summary

**Zod-validated FixQueueEntry contract + append-or-bump-in-place intake primitive, with CAP-02 capture-time dedup repointed to read the new in-repo queue instead of the old gitignored index**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-02T22:29:12Z
- **Tasks:** 3 (3rd task also carries a TDD sub-cycle for Task 2)
- **Files created:** 5
- **Files modified:** 2

## Accomplishments
- Defined the queue's single source of truth: `fixQueueEntrySchema` (zod) with a `.superRefine` enforcing both terminal-status invariants (rejected requires `rejectedReason`; locked/rejected require non-null `closedAt`) — a malformed manual edit now fails loudly at the next script/test run instead of silently corrupting the close-rate metric.
- Built `scripts/queue/intake.mjs`'s `upsertQueueEntry`: append-new-or-bump-in-place on a matching fingerprint, validated via the schema before any write — this is the D-06 graveyard guard every future intake path (hand-seeding in Plan 04-03, any later live-capture promotion) funnels through.
- Repointed capture-time CAP-02 dedup (`readDedupIndex`) to read the durable, git-tracked queue file instead of the old gitignored, machine-local index — recurrence history now survives clones and machine switches, with the function's public signature and never-throw guard preserved exactly and `routeDedup` byte-for-byte untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the FixQueueEntry contract + typed loader** - `661fdc6` (feat)
2. **Task 2: scripts/queue/intake.mjs — upsert (append-new / bump-in-place)** - TDD cycle:
   - RED: `036f676` (test) — failing test confirmed (import error, module did not exist yet)
   - GREEN: `71b61ea` (feat) — all 4 behavior tests pass
   - (No REFACTOR commit — implementation was clean on the first pass, no cleanup needed)
3. **Task 3: D-04 — repoint readDedupIndex to the queue file** - `26106ca` (feat)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified
- `test/fixtures/fix-queue.ts` - `fixQueueEntrySchema` (zod, with the terminal-status `.superRefine`), `FixQueueEntry` type, `fixQueue` typed-loader constant
- `test/fixtures/fix-queue.json` - the queue SSOT file, starts as `[]`
- `test/unit/fixtures/fix-queue.test.ts` - loads-empty, accepts-valid, and both refinement-rejection tests
- `scripts/queue/intake.mjs` - `readQueueFile` (never-throw guarded read), `upsertQueueEntry` (validated append-or-bump), `scriptMain` CLI
- `test/unit/tools/queue-intake.test.ts` - the 4 required upsert/read behaviors, tmpdir-isolated per test
- `src/agda/session-capture/dedup-index.ts` - `readDedupIndex`'s `indexPath` and parse loop repointed to the queue array shape; `routeDedup` unchanged
- `test/unit/agda/session-capture/dedup-index.test.ts` - first two tests repointed to the new fixture shape/location; one new test added proving `kind` derivation from `recurrence`; the two `routeDedup`-only tests left untouched

## Decisions Made
None - followed plan as specified. All architectural decisions (D-01 through D-09) were already fixed in `04-CONTEXT.md`; this plan implemented them without introducing new ones.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' acceptance criteria (behavior, test command, source-assertion greps) were met on the first implementation pass; no auto-fixes, no blocking issues, no architectural questions arose.

One care point worth recording (not a deviation, a correctness safeguard applied while executing Task 3): the plan's own acceptance criteria required `grep -c '.agda-mcp' src/agda/session-capture/dedup-index.ts` to equal 0 — the old path had to be fully removed, including from comments, not just from the executable `indexPath` line. The updated header/docstring comments were written to describe the retired index without using the literal `.agda-mcp` substring anywhere in the file, satisfying this check exactly as specified.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The queue's typed contract (`fixQueueEntrySchema`/`FixQueueEntry`/`fixQueue`) is ready for Plan 04-03 to populate with the real seed cargo (flagship #64/#61 capture + 8 CHG turn-key specs + 4 CHG candidate defects, per D-05).
- `upsertQueueEntry` is ready for Plan 04-03's hand-seeding and for any later live-capture promotion wiring to funnel through.
- `readDedupIndex`'s repoint means capture-time CAP-02 dedup already reads the new durable queue location — no further Phase-1 changes needed for this seam.
- Full `test/unit` suite (1211 tests) passes with no regressions; `tsc -p tsconfig.json --noEmit` is clean.
- No blockers for 04-02 (priority/dashboard) or 04-04/04-05 (classification wiring, GitHub mirror) — both build on this plan's contract and intake primitive without needing further changes here.

---
*Phase: 04-triage-fix-queue*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 8 claimed files verified present on disk; all 4 claimed commit hashes (`661fdc6`, `036f676`, `71b61ea`, `26106ca`) verified present in `git log --oneline --all`.
