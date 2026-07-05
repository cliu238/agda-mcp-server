# Phase 10: Upstream Reconcile - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 10-upstream-reconcile
**Areas discussed:** Dogfood acceptance session shape (the only genuine-taste area after classification)

---

## Classification pass (per standing user rules)

Before asking anything, every gray area was classified. Areas resolved as **forced** (briefed with veto opportunity, none vetoed — see CONTEXT.md D-01..D-08, D-10, D-11):

1. Merge mechanics & guarded-file authority — forced by settled decisions + skill design (attended escalation).
2. Merge target pinned at `d4497a2` — forced by MERGE-01 text; post-`d4497a2` tail belongs to Phase 11's first sync.
3. Adjudication mechanism (from-RED locks as referee; green→adopt theirs + delete our tracker, red→keep ours + graft hardening) — forced by seed doc + milestone charter; per-sub-behavior outcomes are empirical (tests decide at execution).
4. Test-authority rule (locks never weakened; upstream tests adaptable-with-rationale, never deleted) — forced by MERGE-03's referee construct.
5. Adjudication record location = `docs/` — forced by repo convention (DEPLOY-OPERATIONS.md precedent).
6. `logger.warn` allow-list, never delete/silence — forced by MERGE-02 success-criterion text.
7. Keep upstream tool name `agda_goal_candidates` — forced by divergence-minimization charter.
8. Single end-of-phase push = one D-06 cycle watched green; fix-forward on red (attended work) — forced by seed doc.
9. RT6/RT7 out of scope — forced by REQUIREMENTS.md.

Live re-measurement performed during discussion: `git fetch upstream` → still 509 ahead / 5 behind, head still `d4497a2`.

---

## Dogfood acceptance session shape (ACCEPT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| CHG + must use new tool (Recommended) | Codex headless on local CHG corpus; session must genuinely invoke `agda_goal_candidates` at least once — merge and newly adopted feature proven in one real use | ✓ |
| CHG + regular session | E2E-01 path verbatim, no requirement to touch the new tool; meets ACCEPT-02's letter, new tool backed only by tests/docs | |
| Different corpus (agda-unimath / stdlib) | Wider proof surface but heavier setup/runtime (agda-unimath needs a local library build) | |

**User's choice:** CHG + must use new tool (recommended option)
**Notes:** None — accepted as presented.

---

## Claude's Discretion

- Local `main` vs temporary branch during the multi-plan reconcile (nothing pushed until the end).
- Exact filename/format of the `docs/` adjudication record.
- `logger.warn` registration mechanism shape.
- Plan decomposition (~3 plans is the seed sketch, not a mandate).

## Deferred Ideas

- RT6 / RT7 redesigns — post-merge re-evaluation only.
- Upstream commits after `d4497a2` — Phase 11's first routine sync.
