# Phase 2: The Oracle Triad - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 2-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
**Areas discussed:** Gray-area classification review (no per-area deep dives — see below)

---

## How this discussion ran

An initial 4-area multi-select was presented (verdict composition & output shape / ORCL-02 policy source & absent-default / ORCL-01 cold-run budget & abstention / ORCL-03 v1 scope). The user invoked the standing feedback rule (memory: `discuss-phase-classify-decisions` + `language-preference`): decisions forced by correctness/requirements/scope must not be posed as user choices, and any question that IS posed needs plain-language background.

Re-classification concluded **all four areas were forced, not taste**:

| Area | Resolution | Forcing constraint |
|------|------------|--------------------|
| Verdict placement | Sidecar file, never mutate capture | Fingerprint/dedup integrity (CAP-02) |
| Verdict vocabulary & composition | Per-predicate outcomes + explicit necessary-but-insufficient composition | ORCL-01/02/03 requirement wording + success criterion 5 |
| ORCL-02 with no policy file | Distinct `no-policy` outcome listing all findings | Same honesty philosophy as ORCL-01 INCONCLUSIVE; fail-open and fail-closed both dishonest |
| ORCL-01 timeout | Never reuse server timeout; offline default run-to-completion, optional budget → INCONCLUSIVE(timeout) | ORACLE-VALIDITY residual risk (chronic abstention on unimath) |
| ORCL-03 consistency probe | Hook-only in v1 | "may" in requirement + AUTO-08 is v2 + "no phase criterion may require v2+ work" |
| Missing expected signature | Advisory `vacuous-no-expected-signature` | Phase-1 D-02 lineage; hard gate is Phase-5 PROC-01 |

## Final gate

| Option | Description | Selected |
|--------|-------------|----------|
| 直接写 (推荐) | Write the 6 forced conclusions + constraints + researcher questions into CONTEXT.md, proceed to plan-phase | ✓ |
| 有想改/想聊的地方 | Discuss a specific item first | |

**User's choice:** 直接写 (write directly)
**Notes:** User's correction mid-discussion: don't ask questions whose answers are forced by experiment/correctness; when asking, provide accessible background explanations in plain language. Memory `discuss-phase-classify-decisions` updated with the question-wording rule.

## Claude's Discretion

- CLI shape (single entry with `--only` vs three scripts) — verdict schema is the contract, not the CLI.
- Verdict/metrics file naming + placement conventions in `.agda-mcp/captures/`.
- Abstention-rate metric surfacing (per-run summary vs cumulative file vs both).

## Deferred Ideas

- ORCL-02 hard half (hardened flag baseline) → AUTO-07 (v2)
- Mechanized negation/⊥ probe → AUTO-08 (v2)
- Expected-signature hard gate → Phase 5 (PROC-01)
- Verdict → queue routing → Phase 4
- Multi-run flaky classification → Phase 5
