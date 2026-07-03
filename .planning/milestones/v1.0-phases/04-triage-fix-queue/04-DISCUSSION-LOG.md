# Phase 4: Triage / Fix Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 4-triage-fix-queue
**Areas discussed:** Human-readable view, First cargo intake timing, Rejection terminal state, GitHub mirror scope

---

## Process note

The initial 4-area multi-select ("queue file shape & home", "intake & index handoff", "lifecycle & backpressure", "classifier wiring & GH mirror") was withdrawn after the user reminded me of the standing rules: (1) classify each sub-decision as forced / empirical / genuine-taste FIRST and never ask forced or empirical questions; (2) every question must be plain-Chinese, background-first, self-contained. Re-running the classification collapsed the four areas to a forced-conclusions briefing (presented for veto, accepted as-is) plus exactly four genuine-taste questions, asked directly without an area menu. The forced set is recorded in CONTEXT.md as D-01/D-02/D-04/D-06/D-08…D-12 with their forcing constraints.

---

## Human-readable view (queue SSOT is machine JSON — how does the maintainer read it?)

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown dashboard (recommended) | Script regenerates a human-facing Markdown board (priority-sorted table + per-status counts + close-rate) from the JSON on every change; never hand-edited | ✓ |
| JSON only | One fewer artifact to maintain; read via editor / git diff / agent | |

**User's choice:** Markdown dashboard (derived view; JSON stays SSOT)
**Notes:** Cost of an extra maintained artifact accepted; hand-editing the view explicitly ruled out (drift).

---

## First cargo intake timing (CHG 8 specs + 4 candidates, measured on v0.6.7, no capture artifacts)

| Option | Description | Selected |
|--------|-------------|----------|
| Enqueue first, flag needs-reverify (recommended) | Queue has real material from day one; re-verification is a triage action inside the queue; failures transition to rejected | ✓ |
| Re-verify before entry | Cleaner queue, but the material stays in the untracked-evaporation state for as long as re-verification takes | |

**User's choice:** Enqueue first, flag needs-reverify
**Notes:** Re-verification requires corpus environment setup and cannot happen immediately — blocking entry on it recreates the evaporation QUEUE-01 exists to kill.

---

## Rejection terminal state (requirement names only new/triaged/fixing/locked)

| Option | Description | Selected |
|--------|-------------|----------|
| Add a `rejected` terminal state (recommended) | With a reason field (not-a-bug / wont-fix / cannot-reproduce); keeps backlog signal honest; exit path for failed re-verification | ✓ |
| Strict four states | Verbatim requirement; dead entries deleted from the file (recoverable via git history); add a state only when it hurts | |

**User's choice:** Add `rejected` terminal state with reason field

---

## GitHub mirror scope (optional, one-way, summary-only)

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror triaged+ only (recommended) | Only human-reviewed entries become public issues; keeps the public tracker clean | ✓ |
| Mirror everything | Full transparency, but raw unreviewed captures (possible false positives/dupes) go public | |
| Manual cherry-pick | Mirror script takes explicit fingerprints each run; most conservative, most manual | |

**User's choice:** Mirror entries at status `triaged` or later

---

## Forced-conclusions briefing (presented for veto — accepted without changes)

- Queue SSOT = machine-readable, git-tracked JSON in the repo (matrix-SSOT idiom; `.agda-mcp/` is gitignored so ineligible)
- Mutate-in-place status transitions; git history is the audit log (no event-log layer)
- Phase-1 minimal dedup index retires; capture-time CAP-02 dedup reads the in-repo queue (read-only, emit-only compatible)
- Two classification axes kept separate: Agda-error class (existing `agda_triage_error`, already implemented) vs server-defect kind (QUEUE-02 priority ordering); CHG 12 anomaly families inform the latter
- QUEUE-03 is wiring work, not building (embed TriageResult at capture time + carry class/kind on entries)
- WIP limit advisory-only on `fixing`, never blocks intake; close-rate metric from day one (Pitfall 6 prescription)
- Mirror payload is summary-only — never source/diffs (private-corpus leak risk into a public repo); idempotent via issue-number backlink
- Status flips manual-first, scripts only on friction (Phase-3 D-04 precedent)

## Claude's Discretion

- Queue file name + tracked location; JSONL vs single JSON + typed loader; entry schema field names
- Dashboard filename/layout/regeneration trigger
- WIP-limit default value
- `needs-reverify` representation (flag vs annotation — not a silent sixth status)
- Mirror label/title conventions; whether `rejected` entries are newly mirrored or only updated
- How the Phase-3 emitter's locked flip reflects into the queue entry

## Deferred Ideas

- Recurrence-weighted prioritization views → AUTO-03 (v2)
- Agent-facing capture hints via `nextAction` → AUTO-02 (v2)
- Unattended intake / cron orchestration → AUTO-06 (v2)
- Auto/semi-auto PR generation → AUTO-05 (v2)
- Reopen semantics for recurring locked fingerprints → design when the first real recurrence exists
- Extending the `agda_triage_error` enum → only when real intake shows unclassifiable errors
- Fixing the cargo itself → ongoing post-scaffold work, not a Phase-4 criterion
