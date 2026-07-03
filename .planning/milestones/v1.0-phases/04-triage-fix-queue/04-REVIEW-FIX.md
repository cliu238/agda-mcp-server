---
phase: 04-triage-fix-queue
review_path: .planning/phases/04-triage-fix-queue/04-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 3
fixed: 3
skipped: 0
iteration: 1
status: all_fixed
applied: 2026-07-02
---

# Phase 4: Code Review Fix Report

**Scope:** Critical + Warning (2 Info left out of scope, `--all` not passed). Applied directly by the orchestrator (earlier gsd-code-fixer stalls; these are small, precise edits). One atomic commit `fix(04): address code-review findings in queue tooling`.

| Finding | Severity | Fix |
|---------|----------|-----|
| CR-01 | BLOCKER | `upsertQueueEntry` gains a `bumpRecurrence` option (default true — preserves dedup behavior). The mirror's D-12 backlink persist passes `{ bumpRecurrence: false }`, so the metadata-only write no longer bumps `recurrence` — the first `--execute` no longer shifts QUEUE-02 priority or compounds through the dedup index (`kind` no longer flips to "update"). Regression test added to `queue-intake.test.ts` proving both the bump and no-bump paths. |
| WR-01 | WARNING | `comparePriority` weights an unknown `defectKind` as `Number.MAX_SAFE_INTEGER` (sorts last) instead of `undefined - n = NaN`, restoring `Array.sort`'s total-order contract. |
| WR-02 | WARNING | `dashboard.mjs` `escapeTableCell` now collapses `[\r\n]+` to a space in addition to escaping `|`, so a schema-allowed newline in `title` can't break the markdown table row. |

## Info (out of scope)

Two Info items from 04-REVIEW.md left for a future `--all` pass.

## Verification

- `node --check` on all 4 edited scripts — clean.
- `npx vitest run test/unit/tools/queue-{intake,priority,dashboard,mirror-github}.test.ts` — 24 passed (incl. new CR-01 test).
- `npx tsc -p tsconfig.json --noEmit` — clean. Full `npm test` — 1525 passed / 0 failed.

## Status: all_fixed
