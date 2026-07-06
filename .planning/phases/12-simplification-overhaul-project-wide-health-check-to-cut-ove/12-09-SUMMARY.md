---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 09
title: MCP Tool Surface Deletions (D-02)
status: complete
outcome: no-op
autonomous: true
completed: 2026-07-06
requirements: [D-02, C-01]
---

# Plan 12-09 Summary — MCP Tool Surface Deletions (No-Op)

## Outcome: no-op (zero approved `tools` cuts)

Plan 12-09 executes only CUT-NN rows in `12-APPROVED-CUTS.md` with `category: tools` **and** `decision: approved`. At the D-03 sign-off (Plan 12-07), **both** `tools` candidates were **deferred**, so this plan has nothing to execute.

| tools CUT-NN | decision | why deferred |
|--------------|----------|--------------|
| CUT-10 (delete `agda_bug_report_bundle` + `_update_bundle`) | deferred | Files are upstream-inherited (`src/tools/register-bug-bundles.ts`, `src/reporting/bug-report.ts`, `src/tools/reporting-tools.ts`, `src/session/tool-recommendation.ts`, `docs/assistant-workflows.md`). User directive **尽量不要动 upstream**; deleting upstream tools would recur as sync conflict. Candidate for an upstream PR. |
| CUT-11 (merge `agda_goal_analysis` → `agda_goal_catalog`) | deferred | Files are upstream-inherited (`src/tools/analysis-tools.ts`, `src/tools/register-goal-catalog.ts`, `src/session/goal-catalog.ts`); also the only new-code item. Deferred per the same directive. |

## What was (not) done, per the plan's own gates

- **Task 1 (execute approved tool deletions):** filter of `12-APPROVED-CUTS.md` for `category tools` + `approved` yields the empty set → no register call sites removed, no `test/fixtures/e2e/mcp-tool-coverage.json` entries removed, no `tool-family-examples.json` entries removed, no `tool-recommendation.ts` edits. The live 74-tool manifest is unchanged.
- **Task 2 (doc pass + release tag):** Task 2's doc grep runs "for every tool actually deleted by Task 1" (none), so `README.md` and `docs/assistant-workflows.md` are correctly untouched. **No new release tag was cut**, and this is the correct reading of D-02: the tag ships a *tool-surface deletion* ("a new git tag ... once all approved deletions are committed"). With zero approved tool deletions — and, more broadly, zero `src/` changes anywhere in this phase's approved set — the published server surface is functionally unchanged, so a release tag would misrepresent a no-change server as a new release. Tagging is therefore intentionally skipped, not overlooked.

## Verification

- `12-APPROVED-CUTS.md` normalized table contains 0 rows with `category tools` + `decision approved` (2 `tools` rows total, both `deferred`).
- Manifest, coverage matrix, and tool-family-examples are byte-unchanged this plan (no diff).
- `must_haves` truth #4 ("a new git tag is created and pushed once all approved deletions are committed") is vacuously satisfied: the antecedent (approved tool deletions committed) is empty.

## Self-Check: PASSED (no-op)

Nothing approved in this category; fail-closed sign-off honored; no upstream file touched; no spurious release tag.
