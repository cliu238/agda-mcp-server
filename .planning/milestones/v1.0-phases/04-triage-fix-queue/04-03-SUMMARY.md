---
phase: 04-triage-fix-queue
plan: 03
subsystem: infra
tags: [zod, vitest, json-fixture, cli-script, dedup, fingerprint, error-classifier]

# Dependency graph
requires:
  - phase: 04-triage-fix-queue
    provides: "Plan 04-01's fixQueueEntrySchema + upsertQueueEntry append-or-bump primitive (the validated write path this plan seeds through) and its fix-queue.test.ts scaffolding, which this plan extends rather than replaces"
provides:
  - "test/fixtures/fix-queue.json holds the real 13-entry seed cargo: the locked flagship #64/#61 defect (linked to capture-regression-matrix.json's issue-64-61-transitive-staleness row), the 4 CHG-REVERIFY.md-confirmed defects (3 alive + 1 minor), and 8 needsReverify:true turn-key UX-report specs, cross-linked via relatedFingerprint"
  - "scripts/queue/seed-initial-cargo.mjs: the idempotent, re-runnable seed script (SEED_ENTRIES array + scriptMain(queueJsonPath)) — proven to bump-not-duplicate on a second run"
  - "test/unit/fixtures/fix-queue.test.ts: 6 new seed-data consistency assertions (count, fingerprint uniqueness, relatedFingerprint referential integrity, flagship spot-check, needsReverify tally, classifyAgdaError() re-derivation)"
affects: [04-04, 04-05, 05-dogfooding-orchestration-fuel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-seeded-but-schema-validated fixture data: every field value is fixed/pre-computed by the plan and transcribed verbatim (never re-derived), then independently re-proven by a plain re-derivation test (classifyAgdaError() re-run against the same raw error text) — a regression net if the classifier is ever retuned."
    - "Idempotency proven against a throwaway scratch copy of the seed target, never by a second real run against the tracked file — keeps the committed fixture's recurrence values stable and matching what the test suite asserts."

key-files:
  created:
    - scripts/queue/seed-initial-cargo.mjs
  modified:
    - test/fixtures/fix-queue.json
    - test/unit/fixtures/fix-queue.test.ts

key-decisions:
  - "Ran the seed script for real exactly once against the committed test/fixtures/fix-queue.json; idempotency (second-run bumps recurrence rather than duplicating) was proven against a scratch copy under the session scratchpad directory, never by a second real run against the tracked file."
  - "Kept Entries 2 and 3's notes text exactly as the plan specified (verbatim transcription, per the plan's own explicit mandate), even though this incidentally makes a grep-based sanity check in the plan's acceptance criteria off by 2 — see Issues Encountered."

patterns-established:
  - "MANUAL-MERGE CANDIDATE note pattern: a hand-seeded entry whose fingerprint will NOT be reproduced by capture-time auto-enrichment (because the affected tool falls outside the enrichment scan's scope) is explicitly annotated in its own notes field, so a future maintainer knows to merge by hand rather than assume automatic dedup."

requirements-completed: [QUEUE-01]

# Metrics
duration: ~20min
completed: 2026-07-02
---

# Phase 04 Plan 03: Seed the Real 13-Entry Fix-Queue Cargo Summary

**Populated the previously-empty fix queue with the real flagship #64/#61 defect plus 4 CHG-REVERIFY.md-confirmed defects and 8 needsReverify UX-report specs, via an idempotent seed script and a consistency-proving test suite**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-02T22:41:20Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified) + 1 out-of-scope log doc

## Accomplishments
- Seeded exactly 13 real defect entries into `test/fixtures/fix-queue.json` (previously `[]`): the locked flagship #64/#61 transitive-staleness defect, the 4 CHG-REVERIFY.md-confirmed defects (3 alive + 1 minor), and 8 `needsReverify: true` turn-key UX-report specs — all validating against `fixQueueEntrySchema`, all at `recurrence: 1`.
- Cross-linked overlapping root causes via `relatedFingerprint` (Entries 1↔13, 2↔9, 5↔11) instead of double-entering them, so a future dashboard's backlog/close-rate metrics never double-count one underlying bug.
- Built `scripts/queue/seed-initial-cargo.mjs` (`SEED_ENTRIES` + `scriptMain(queueJsonPath)`), which upserts every entry through Plan 04-01's `upsertQueueEntry` — proven idempotent (second run bumps every entry's recurrence to 2 with no duplication) against a scratch copy of the file, never against the committed one.
- Extended `test/unit/fixtures/fix-queue.test.ts` with 6 new assertions: exact count (13), fingerprint uniqueness, `relatedFingerprint` referential integrity (no dangling cross-references), a flagship spot-check (locked/closedAt non-null/matrixEntryId/issue numbers), a `needsReverify:true` tally (exactly 8), and a `classifyAgdaError()` re-derivation proving the 3 grounded entries' (flagship/agda_auto/agda_give) precomputed `triageClass`/`triageConfidence` against their own raw error text.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed the real cargo via an idempotent seed script** - `436aa6b` (feat)
2. **Task 2: Prove the seed data is internally consistent** - `fa98b8d` (test)

**Plan metadata:** (this SUMMARY's own commit, following this document)

## Files Created/Modified
- `scripts/queue/seed-initial-cargo.mjs` - exports `SEED_ENTRIES` (the 13 fixed, pre-computed defect objects) and `scriptMain(queueJsonPath)`, which upserts each through `intake.mjs`'s `upsertQueueEntry`
- `test/fixtures/fix-queue.json` - now holds the real 13-entry cargo (was `[]`)
- `test/unit/fixtures/fix-queue.test.ts` - +6 seed-data consistency assertions (10 total in the file)
- `.planning/phases/04-triage-fix-queue/deferred-items.md` - logs an out-of-scope, pre-existing `tsconfig.test.json` typecheck issue found during verification (see Issues Encountered)

## Decisions Made
- Ran the real seed script exactly once against the committed file (per the plan's explicit instruction); idempotency was proven by copying `test/fixtures/fix-queue.json` to the session scratchpad directory and calling `scriptMain(scratchPath)` a second time against that copy only — confirmed all 13 entries bumped to `recurrence: 2` with the array still length 13 (no duplicate rows), then discarded the scratch copy. The committed file was independently re-verified to still show `recurrence: 1` throughout after this check.
- Transcribed all 13 entries' field values exactly as the plan specified (including the two entries whose notes text incidentally contains the word "fingerprint" in prose), per the plan's own explicit "transcribe verbatim, do not re-derive or re-word" mandate — see Issues Encountered for the resulting minor acceptance-criteria mismatch this produces.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 auto-fixes were needed; the two items below are plan-level heuristic/documentation mismatches noted for transparency, not code defects requiring a fix.

## Issues Encountered

- **Plan's grep-based sanity check doesn't hold exactly (informational only, not a defect):** Task 1's acceptance criteria include `grep -c fingerprint test/fixtures/fix-queue.json` equals 13. The actual count is 15, because Entries 2 and 3's plan-mandated verbatim notes text each independently contain the lowercase word "fingerprint" in prose ("...will NOT match this hand-seeded fingerprint..."), in addition to the 13 field-name lines. This is an inherent tension between the plan's own verbatim-transcription mandate (explicitly stated twice in the `<action>` block) and its grep-heuristic assumption — not a defect in the seeded data. The plan's actual gating `<verify>` command (the Node 13-entry-count check) passes exactly, and it is what actually gates task completion; Task 2's test suite does not rely on the grep heuristic at all. Kept the verbatim notes text as explicitly mandated rather than rewording to force the incidental grep count to match.
- **Pre-existing, unrelated `tsconfig.test.json` type errors (out of scope):** `npx tsc -p tsconfig.test.json --noEmit` surfaces type errors in 8 files this plan never touches (`test/unit/session/agda-transport.test.ts`, `test/unit/session/tool-recommendation.test.ts`, `test/unit/tools/emit-regression.test.ts`, `test/unit/tools/oracle-orcl-01/02/03.test.ts`, `test/unit/tools/oracle-run-oracle.test.ts`, `test/unit/tools/output-schema-invariants.test.ts`). Confirmed pre-existing (present before this plan's commits) and out of scope per the executor's SCOPE BOUNDARY rule; also confirmed this compile step is not part of `npm test` (`vitest run`) or `npm run build` (`tsc -p tsconfig.json`), both of which pass cleanly. This plan's own new/modified files (`test/unit/fixtures/fix-queue.test.ts`) produce zero `tsc -p tsconfig.test.json` errors. Logged to `.planning/phases/04-triage-fix-queue/deferred-items.md`, not fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The fix queue's SSOT claim (QUEUE-01) is now backed by real data: 13 entries spanning `locked`/`triaged`/`new` statuses, with cross-links proven referentially intact and no dangling `relatedFingerprint` references.
- `test/fixtures/fix-queue.json` is no longer an empty placeholder — Plan 04-04 (priority sort / dashboard) and Plan 04-05 (GitHub mirror) now have real, schema-valid, non-empty data to sort, render, and mirror against instead of `[]`.
- The 8 `needsReverify: true` entries are queued for a future re-verification triage pass (D-05) — this is by design, not a blocker: re-verification is a triage action performed from inside the queue, not a precondition for entry.
- Full `npm run build` + `vitest run test/unit` (1226 tests, 17 skipped, 0 failures) confirmed green after both commits.

---
*Phase: 04-triage-fix-queue*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: `scripts/queue/seed-initial-cargo.mjs`
- FOUND: `test/fixtures/fix-queue.json`
- FOUND: `test/unit/fixtures/fix-queue.test.ts`
- FOUND: `.planning/phases/04-triage-fix-queue/deferred-items.md`
- FOUND: commit `436aa6b` (feat(04-03): seed the real 13-entry fix-queue cargo)
- FOUND: commit `fa98b8d` (test(04-03): prove the seeded fix-queue cargo is internally consistent)
