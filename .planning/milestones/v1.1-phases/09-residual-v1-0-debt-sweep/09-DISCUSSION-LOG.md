# Phase 9: Residual v1.0 Debt Sweep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 9-Residual v1.0 Debt Sweep
**Areas discussed:** Execution timing (Phase-7 dependency), DEBT-06 typecheck gate

Per the user's standing GSD discussion rules, gray areas were classified first: forced conclusions (DEBT-01 delete default, DEBT-06 fully-clean scope, mechanical fix locations, root-SECURITY.md distinction, unmapped-P2 coverage) were briefed with citations rather than asked; only the 2 genuine-taste questions below went to the user. The "which areas to discuss?" meta-menu was skipped (≤4 genuine questions).

---

## Execution timing (Phase-7 dependency)

Background presented: 2 of the 7 items depend on Phase 7's output — DEBT-05's security review must "extend to v1.1's new network surfaces" (upload client + ingest endpoint, which only exist after Phase 7), and DEBT-07's codebase-map refresh would immediately re-drift if run before Phases 6–8 land.

| Option | Description | Selected |
|--------|-------------|----------|
| After Phase 7 (recommended) | Fills the k8s-server wait gap (~07-07); security review covers Phase 5 scripts + new network surfaces in one pass; map refresh won't immediately re-drift; whole phase in one go | ✓ |
| Split into two batches | Code fixes runnable now; security review + map refresh as a closing batch after Phase 7 | |
| Execute now, degrade dependent items | Security review covers Phase 5 scripts only, network-surface half moved into Phase 7/8 acceptance; map refresh accepts re-drift | |

**User's choice:** After Phase 7 (recommended)
**Notes:** None.

---

## DEBT-06 typecheck gate

Background presented: the test-typecheck errors grew from the audit snapshot's two families to a measured 68 errors / 16 files precisely because no gate exists. Gate = `tsc -p tsconfig.test.json --noEmit` in CI (and/or npm script).

| Option | Description | Selected |
|--------|-------------|----------|
| Add to CI (recommended) | Any future test-code type regression fails CI directly — fix once, lock permanently, matching the project's fix-and-lock core value; cost ≈ tens of seconds per CI run | ✓ |
| One-time fix only | Satisfies the audit acceptance as-is; no gate, drift risk remains | |
| Claude decides | Planner picks per project convention (likely CI) | |

**User's choice:** Add to CI (recommended)
**Notes:** None.

---

## Claude's Discretion

- Fix-vs-record choice for the three P2 residuals not mapped to any DEBT requirement (WR-08, WR-12, W5).
- Plan structure and ordering within the phase (natural order: mechanical fixes → typecheck + CI gate → security review → map refresh last).
- Exact CI wiring for the typecheck gate.

## Deferred Ideas

None — discussion stayed within phase scope.
