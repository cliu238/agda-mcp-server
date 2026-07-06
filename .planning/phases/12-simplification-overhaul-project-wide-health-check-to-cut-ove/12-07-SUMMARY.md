---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 07
title: D-03 Cut-List Sign-Off
status: complete
autonomous: false
completed: 2026-07-06
requirements: [D-03]
---

# Plan 12-07 Summary — D-03 Cut-List Sign-Off

## What was done

Presented the full 20-item cut list from `12-HEALTH-REPORT.md` to the user for item-by-item sign-off (Task 1, `checkpoint:human-verify`), then recorded the normalized, fail-closed decisions into `12-APPROVED-CUTS.md` (Task 2).

During the checkpoint the user raised a governing directive — **尽量不要动 upstream 的文件** — so every CUT-NN's files were classified against `upstream/main` (`InvariantHoldings/agda-mcp-server`) before the decision was taken. Fork-owned cuts were approved; upstream-inherited cuts were deferred to protect fork↔upstream convergence (the v1.2 "Upstream Reconcile" milestone goal).

## Outcome

| Decision | Count | CUT-NN |
|----------|-------|--------|
| approved | 6 | CUT-01, CUT-02, CUT-03, CUT-04, CUT-05, CUT-08 (all fork-owned) |
| deferred | 14 | CUT-06 (open-citation), CUT-07, CUT-09, CUT-10, CUT-11, CUT-12–CUT-20 (upstream-inherited) |
| rejected | 0 | — |
| unmapped | 0 | — |

**Approved work by category (what the back half executes):**
- `pipeline` (Plan 12-08): CUT-01, CUT-02
- `docs-residue` (Plan 12-11): CUT-03, CUT-04, CUT-05, CUT-08
- `tools` (Plan 12-09): **none approved → no-op**
- `src-subtraction` (Plan 12-10): **none approved → no-op**

## Key files

- Created: `12-APPROVED-CUTS.md` — durable, CUT-NN-indexed, fail-closed approval record (Summary / Verbatim human response / Normalized decisions / Unmapped approvals). Consumed by Plans 12-08 through 12-12.

## Verification

- `12-APPROVED-CUTS.md` exists with all four required sections.
- Normalized decisions table row count = 20, exactly matching `12-HEALTH-REPORT.md`'s CUT-NN count; each id appears once, none missing/duplicated.
- Every `decision` ∈ {approved, rejected, deferred}; every `category` ∈ {pipeline, docs-residue, tools, src-subtraction}.
- Summary counts sum to total: 6 + 0 + 14 + 0 = 20.
- Fail-closed default honored: nothing approved by silence — the only approvals are the six the user explicitly signed off; CUT-06's own live-citation deferral and all upstream-inherited cuts are recorded `deferred`.

## Self-Check: PASSED

Checkpoint answered by the user before the recording task ran; the durable record is complete, fail-closed, and ready for every back-half execution plan to filter on.
