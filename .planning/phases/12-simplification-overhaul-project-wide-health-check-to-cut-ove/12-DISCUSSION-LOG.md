# Phase 12: Simplification Overhaul - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 12-simplification-overhaul
**Areas discussed:** Scope emphasis, Tool-surface deletion policy, Deliverable shape / checkpoint, RT6/RT7 re-evaluation inclusion

Per the standing discussion rules, gray areas were classified first; five forced conclusions (regression locks untouchable; Loop ② stages uncuttable; upstream conflict-surface convergence preference; architecture invariants stay; concrete targets come from audit not user guesses) were briefed with veto opportunity — none vetoed. Only the four genuine-taste questions below went to the user (asked in plain Chinese).

---

## Scope emphasis (范围侧重)

| Option | Description | Selected |
|--------|-------------|----------|
| 两边一视同仁 | Audit and cut project-wide, priority purely by audit severity | |
| 重点砍服务器本体 | Prioritize user-facing complexity in src/ (tools, response shapes, docs); scripts/ audited but mostly untouched | |
| 重点砍流水线和文档 | Prioritize scripts/ pipeline, docs, planning residue (no external users, no upstream constraint); server gets low-risk subtraction only | ✓ |

**User's choice:** 重点砍流水线和文档
**Notes:** Audit still covers the whole project; only the cutting emphasis is weighted.

---

## Tool-surface deletion policy (工具删减)

| Option | Description | Selected |
|--------|-------------|----------|
| 允许直接删 | Redundant tools deleted/merged in one pass; new tag + updated onboarding docs; old usage breaks on upgrade | ✓ |
| 先弃用后删 | Deprecation markers pointing at replacements, kept ≥1 release cycle before removal | |
| 工具表面不动 | Only internal implementation/docs/pipeline cuts; exposed tool list unchanged | |

**User's choice:** 允许直接删
**Notes:** Team is small and installs via pinned git tags — one-time break is acceptable.

---

## Deliverable shape / checkpoint (产出形态)

| Option | Description | Selected |
|--------|-------------|----------|
| 审计后拍板再砍 | Front half: health report + graded cut list (each item: what/saves/breaks); user approves per item; back half executes approved list | ✓ |
| 边查边砍 | Audit and fix continuously; only breaking/large items escalated to user | |
| 只出报告不动手 | Report + recommendations only; cuts happen in later quick tasks/phases | |

**User's choice:** 审计后拍板再砍
**Notes:** Explicit user sign-off checkpoint between audit findings and execution.

---

## RT6/RT7 re-evaluation inclusion (搁置项评估)

| Option | Description | Selected |
|--------|-------------|----------|
| 纳入评估不实施 | Report includes definitive do/don't/how verdicts for RT6 (load-state conflation) and RT7 (timeout taxonomy); implementation is a separate future phase | ✓ |
| 评估且纳入实施 | If verdict is "do it", RT6 schema rework implemented in this phase | |
| 不纳入,纯做减法 | Both items stay parked; re-evaluation trigger remains unaddressed | |

**User's choice:** 纳入评估不实施
**Notes:** Their re-evaluation trigger ("after upstream merge lands") fired at Phase 10 completion; implementation is an addition, not a subtraction, so it stays out of this phase.

---

## Claude's Discretion

- Audit methodology, cut-list granularity, report format, plan decomposition.
- Push cadence (default: Phase 10 D-10 pattern — batch commits, minimal watched pushes).
- Whether v1.0/v1.1 milestone-audit debt-ledger items fold into the cut list.

## Deferred Ideas

- RT6 implementation (structured five-state `agda_load` response) — own future phase if verdict is "do it".
- RT7 implementation (timeout/process-state taxonomy) — same handling.
- Phase 11 auto-sync artifacts — kept intact for revival, out of cutting scope.
