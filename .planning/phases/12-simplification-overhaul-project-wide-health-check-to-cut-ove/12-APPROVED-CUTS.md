---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
document: 12-APPROVED-CUTS.md
plan: 07
requirements: [D-03]
signed_off: 2026-07-06
source_report: 12-HEALTH-REPORT.md
category_enum: [pipeline, docs-residue, tools, src-subtraction]
decision_enum: [approved, rejected, deferred]
counts:
  approved: 6
  rejected: 0
  deferred: 14
  unmapped: 0
  total: 20
---

# Phase 12 — Approved Cuts (D-03 Sign-Off Record)

**Summary:** 20 CUT-NN candidates from `12-HEALTH-REPORT.md` → **approved: 6 · rejected: 0 · deferred: 14 · unmapped: 0** (6 + 0 + 14 + 0 = 20).

This is the durable, normalized, fail-closed record of the D-03 sign-off checkpoint (Plan 12-07). Every back-half execution plan (12-08 pipeline, 12-09 tools, 12-10 src-subtraction, 12-11 docs-residue) MUST filter `12-HEALTH-REPORT.md`'s rows by its category and act **only** on rows marked `approved` here. Anything not `approved` is out of scope for this phase.

## Governing decision

The sign-off was reshaped by a user directive raised during the checkpoint: **尽量不要动 upstream 的文件** ("avoid touching upstream-inherited files as much as possible"). This fork (`cliu238/agda-mcp-server`) tracks upstream `InvariantHoldings/agda-mcp-server`; the current milestone is v1.2 "Upstream Reconcile". Each CUT-NN's files were classified by existence in `upstream/main`:

- **Fork-owned** (absent from `upstream/main`): `scripts/{dogfood,queue,oracle,team}/**`, `scripts/data/oracle-policy/**`, `.planning/**`, `.agents/skills/**`, `Dockerfile`.
- **Upstream-inherited** (present in `upstream/main`): all `src/**` core, `docs/literate-agda-assessment.md`, `docs/assistant-workflows.md`, `.gitignore`.

Result: the 6 cuts that touch only fork-owned files are **approved**; all 13 cuts that would modify an upstream-inherited file are **deferred** (they diverge the fork and would recur as sync conflicts), plus CUT-06 which stays deferred on its own live-citation grounds. Genuinely-valuable deferred cuts (dead code CUT-12/13/14, misleading doc CUT-07) are better contributed to upstream as a PR than fork-diverged.

## Verbatim human response

The user's literal decisions, quoted exactly as given (most recent / authoritative first):

> **Directive (free text):** 我想确认一下哪些是我的文件，是否涉及动upstream的文件？尽量不要动upstream的

> **Q "Fork 自有" (CUT-01/02/03/04/05/08; CUT-06 recommended defer):** 批准这 6 项

> **Q "Upstream 项" (CUT-07/09/10/11/12–20 — all touch upstream-inherited files):** 全部推迟

Earlier provisional answers, **superseded** by the upstream-ownership discussion above and recorded here only for a complete audit trail (T-12-14 repudiation mitigation):

> **(superseded) Q "低风险批量" (15-item batch):** 整批全部批准 — superseded because that batch bundled 9 upstream-inherited cuts (CUT-09, CUT-12–19) the user then chose to defer under the upstream directive.

> **(superseded) Q "CUT-07 文档":** 直接删除 — superseded once `docs/literate-agda-assessment.md` was confirmed to be an upstream-inherited file; re-recorded as `deferred`.

## Normalized decisions

One row per CUT-NN id in `12-HEALTH-REPORT.md`. `category` copied verbatim from each row's Category field (one of the four canonical tokens). `decision` is exactly one of `approved` / `rejected` / `deferred`.

| CUT-NN | category | decision | notes |
|--------|----------|----------|-------|
| CUT-01 | pipeline | approved | Fork-owned (`scripts/dogfood/*` + dogfood tests). Extract `assertSafeRunId`; update the two `dogfood-wrapup-argv-parsing.test.ts` assertions in the same commit. |
| CUT-02 | pipeline | approved | Fork-owned (`scripts/queue/seed-initial-cargo.mjs`). Delete one-off seed script; update `.planning/codebase/STRUCTURE.md` mentions. |
| CUT-03 | docs-residue | approved | Fork-owned (`.planning/research/{FEATURES,STACK,PITFALLS,SUMMARY}.md`). Delete all four. |
| CUT-04 | docs-residue | approved | Fork-owned (`.planning/research/ARCHITECTURE.md` + `Dockerfile`). Inline the rationale into `Dockerfile:89` BEFORE deleting the research doc. |
| CUT-05 | docs-residue | approved | Fork-owned (`.planning/research/FUEL-CORPORA.md` + `scripts/data/oracle-policy/agda-unimath.json`). Repoint the JSON `$comment` to `SKILL.md §6` BEFORE deleting. |
| CUT-06 | docs-residue | deferred | Fork-owned but deferred: `CHG-REVERIFY.md`/`RT-REVERIFY.md` are still cited by `test/fixtures/fix-queue.json` notes, including the still-open RT6/RT7 entries. Source audit recommends no cut this phase. |
| CUT-07 | docs-residue | deferred | Upstream-inherited (`docs/literate-agda-assessment.md`). Deferred per 尽量不要动 upstream. Content is genuinely stale/misleading — candidate for an upstream PR (delete or reconcile there). |
| CUT-08 | docs-residue | approved | Fork-owned (`.agents/skills/upstream-sync/SKILL.md`). Remove the stale `load-terminus-tracker.ts` guarded-file line. |
| CUT-09 | docs-residue | deferred | Upstream-inherited (`.gitignore`). Additive-only and low-risk, but excluded per 尽量不要动 upstream. |
| CUT-10 | tools | deferred | Upstream-inherited (`src/tools/register-bug-bundles.ts`, `src/reporting/bug-report.ts`, `src/tools/reporting-tools.ts`, `src/session/tool-recommendation.ts`, `docs/assistant-workflows.md`). Deletes upstream tools → recurring sync conflict. Candidate for upstream PR. |
| CUT-11 | tools | deferred | Upstream-inherited (`src/tools/analysis-tools.ts`, `src/tools/register-goal-catalog.ts`, `src/session/goal-catalog.ts`). Changes upstream tool surface; also the only new-code item. Deferred. |
| CUT-12 | src-subtraction | deferred | Upstream-inherited (`src/agda/import-graph.ts`). Genuinely dead code — best sent to upstream as a PR. Deferred per directive. |
| CUT-13 | src-subtraction | deferred | Upstream-inherited (`src/agda/agdai-cache.ts`). Deferred. |
| CUT-14 | src-subtraction | deferred | Upstream-inherited (`src/agda/library-registration.ts`). Deferred. |
| CUT-15 | src-subtraction | deferred | Upstream-inherited (`src/protocol/response-schemas.ts`). Cosmetic un-export; deferred. |
| CUT-16 | src-subtraction | deferred | Upstream-inherited (`src/agda/agda-version-detection.ts`). Cosmetic un-export; deferred. |
| CUT-17 | src-subtraction | deferred | Upstream-inherited (`src/agda/session-process-lifecycle.ts`). Cosmetic un-export; deferred. |
| CUT-18 | src-subtraction | deferred | Upstream-inherited (`src/protocol/metadata.ts`). Cosmetic un-export; deferred. |
| CUT-19 | src-subtraction | deferred | Upstream-inherited (`src/session/tool-presentation.ts`). Cosmetic un-export; deferred. |
| CUT-20 | src-subtraction | deferred | Upstream-inherited (`src/agda/session-load-helpers.ts`) — GUARDED file; already audit-recommended defer, reinforced by the directive. |

## Unmapped approvals

None. Every CUT-NN id from `12-HEALTH-REPORT.md` (CUT-01 – CUT-20) is accounted for exactly once above, and the user's responses mapped cleanly onto the fork-owned vs upstream-inherited partition — no response referenced an unknown id, a typo'd id, or an un-resolvable category-level statement. (Section retained per schema even though empty; any future item landing here is non-actionable until a human clarifies it.)
