# Phase 3: Regression Lock Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 3-regression-lock-pipeline
**Areas discussed:** LOCK-03 fix placement, CHG seed specs scope

---

## Process note (meta)

An initial 4-area menu (emitted-test form / RED lifecycle / LOCK-03 endpoint / trimming + seeds) was withdrawn after the user invoked the decision-classification rule: on re-audit, 2.5 of the 4 areas were **forced** (test form → matrix-SSOT convention + LOCK-02 durability; replay seam → LOCK-02 envelope wording + CAP-04 recording boundary; RED lifecycle → vitest `test.fails` as the canonical from-RED mechanism; trimming predicate → warm-green ∧ cold-red correctness). Those were restated as conclusions-with-veto (none vetoed) and only two genuine taste/scope questions were asked, each with plain-language background per the user's explicit request (通俗、带背景). Mid-discussion, the parallel Phase-2 session landed `02-CONTEXT.md`, which settled the emitter's input contract (verdict sidecar + per-predicate outcomes incl. `no-policy`) and added the derived no-policy refusal rule.

---

## LOCK-03 fix placement (does the #64/#61 fix live in Phase 3?)

| Option | Description | Selected |
|--------|-------------|----------|
| Insert Phase 3.1 right after (recommended) | Phase 3 builds the pipeline and emits the RED lock only; a small inserted 3.1 fixes #64/#61 so the RED→GREEN flip is observed before Phase 4; the pipeline phase is not inflated by an unknown-size fix | ✓ |
| Fix inside Phase 3 | Strongest single-phase closure (capture→lock→fix→flip) but the fix (load/interface-cache staleness detection) has unknown size | |
| Fix via the Phase-4 queue | The first fix flows through the queue itself (maximal process self-hosting, real queue cargo) but the flip evidence arrives latest and Phase 3 closes with only indirect (cold-result) validation of the emitted assertion | |

**User's choice:** Insert Phase 3.1 right after.
**Notes:** Grounded in the milestone core value — the closed loop ("fix and lock") must be observed at least once within the milestone; the only true validation that the emitted assertion is satisfiable is the observed flip. Roadmap insert to be performed via `/gsd-phase` (outside this discussion).

---

## CHG seed specs (do the 8 turn-key regression specs ride along in Phase 3?)

| Option | Description | Selected |
|--------|-------------|----------|
| All deferred as Phase-4 queue seeds (recommended) | Phase 3 locks exactly the flagship; the 8 specs enter the Phase-4 queue as its first real cargo (also exercising ordering/classification), re-verified against `main` at intake | ✓ |
| Lock 1-2 in Phase 3 | Would demonstrate emitter breadth beyond the false-green family, at the cost of a full reproduce→capture→trim→emit pass per spec | |
| Re-verify first, then decide (cap 2) | Plan-phase re-verification against `main` determines how many (0-2) are cheap enough to ride along | |

**User's choice:** All deferred as Phase-4 queue seeds.
**Notes:** Requirement line holds at LOCK-03's #64/#61; specs were measured on v0.6.7 and need re-verification regardless.

---

## Claude's Discretion

- Emitter CLI shape, dry-run, re-emit/idempotency semantics.
- Matrix file name/location; runner placement.
- Fixture naming details; whether emitted fixtures also register in `fixture-matrix.json`.
- red→locked flip stays a manual one-line edit unless friction appears; optional pointer row in `release-bug-matrix.json` for locked entries.

## Deferred Ideas

- #64/#61 fix → inserted Phase 3.1 (roadmap operation pending).
- 8 CHG turn-key specs + 4 CHG candidate defects → Phase-4 queue first cargo (re-verify vs `main`).
- Automatic ddmin minimization → v2 (AUTO-01); trimming heuristics only on demonstrated need.
- Emitter breadth beyond false-green family → exercised by Phase-4 cargo, no v1 criterion.
