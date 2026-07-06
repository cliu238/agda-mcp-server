---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 10
title: src/ Low-Risk Subtraction (D-01)
status: complete
outcome: no-op
autonomous: true
completed: 2026-07-06
requirements: [D-01, C-03, C-04, C-01]
---

# Plan 12-10 Summary — src/ Low-Risk Subtraction (No-Op)

## Outcome: no-op (zero approved `src-subtraction` cuts)

Plan 12-10 executes only CUT-NN rows in `12-APPROVED-CUTS.md` with `category: src-subtraction` **and** `decision: approved`. At the D-03 sign-off (Plan 12-07), **all nine** `src-subtraction` candidates (CUT-12 – CUT-20) were **deferred**, so this plan has nothing to execute.

**Reason (uniform across all 9):** every candidate touches an upstream-inherited `src/` file. Per the user directive **尽量不要动 upstream**, all were deferred to keep the fork convergent with `upstream/main` (the v1.2 "Upstream Reconcile" goal). CUT-20 additionally sits on a guarded file (`src/agda/session-load-helpers.ts`) already audit-recommended for deferral. The genuinely-dead-code items (CUT-12/13/14) are better contributed to upstream as a PR than fork-diverged.

Deferred rows: CUT-12 (`import-graph.ts`), CUT-13 (`agdai-cache.ts`), CUT-14 (`library-registration.ts`), CUT-15 (`response-schemas.ts`), CUT-16 (`agda-version-detection.ts`), CUT-17 (`session-process-lifecycle.ts`), CUT-18 (`metadata.ts`), CUT-19 (`tool-presentation.ts`), CUT-20 (`session-load-helpers.ts`, guarded).

## What was (not) done, per the plan's own gates

- **Task 1 (execute approved src subtraction cuts):** filter of `12-APPROVED-CUTS.md` for `category src-subtraction` + `approved` yields the empty set → no `src/` files edited, no exports removed, no dead code deleted. No file in the C-03 upstream-overlap union trigger set was touched, so no convergence-framed commit was required (none produced).
- **Task 2 (independent architecture-invariant re-verification):** Task 2 re-verifies that "this plan's batch of cuts" introduced no invariant regression. The batch is empty, so the three invariants are unchanged from the pre-plan baseline and no fixup commit was needed. For completeness the invariants remain intact at this HEAD: exactly one `AgdaSession` construction site (`src/index.ts`), zero hand-built IOTCM strings outside `command-builder.ts` (guarded by `test/unit/protocol/no-bare-command-strings.test.ts`), and no file newly crossing the 500-line ceiling (this phase made zero `src/` edits).

## Verification

- `12-APPROVED-CUTS.md` normalized table contains 0 rows with `category src-subtraction` + `decision approved` (9 `src-subtraction` rows total, all `deferred`).
- No `src/` file changed this plan (no diff); the Regression-Lock Exclusion List is trivially respected (no `test/` file touched).
- `must_haves` truths #1–#4 are all satisfied vacuously: only approved items are executed (none), so no upstream-overlap commit, no tool-registration file, and no new invariant violation can arise.

## Self-Check: PASSED (no-op)

Nothing approved in this category; fail-closed sign-off honored; zero upstream `src/` files touched; architecture invariants intact.
