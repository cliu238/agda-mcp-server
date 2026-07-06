# Roadmap: Agda MCP Server — Self-Improvement Loop

## Milestones

- ✅ **v1.0 Self-Improvement Loop** — Phases 1–5 (+03.1) (shipped 2026-07-03)
- ✅ **v1.1 Feed the Loop** — Phases 6–9 (shipped 2026-07-05)
- ✅ **v1.2 Upstream Reconcile** — Phases 10, 12 (shipped 2026-07-06; Phase 11 deferred to Future)
- 📋 **Next milestone** — TBD (`/gsd:new-milestone`)

## Phases

<details>
<summary>✅ v1.0 Self-Improvement Loop (Phases 1–5 + 03.1) — SHIPPED 2026-07-03</summary>

- [x] Phase 1: Capture Foundation (5/5 plans; gap plans 01-06/01-07 superseded by Phases 3–4) — completed 2026-07-02
- [x] Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance) (5/5 plans) — completed 2026-07-02
- [x] Phase 3: Regression Lock Pipeline (3/3 plans) — completed 2026-07-02
- [x] Phase 03.1: Fix the #64/#61 transitive-staleness false-green, flip flagship lock to green (2/2 plans, INSERTED) — completed 2026-07-02
- [x] Phase 4: Triage / Fix Queue (5/5 plans) — completed 2026-07-02
- [x] Phase 5: Dogfooding Orchestration + Fuel (4/4 plans) — completed 2026-07-03

Full phase details: `milestones/v1.0-ROADMAP.md` · Audit: `milestones/v1.0-MILESTONE-AUDIT.md` (status: tech_debt, 19/19 requirements)

</details>

<details>
<summary>✅ v1.1 Feed the Loop (Phases 6–9) — SHIPPED 2026-07-05</summary>

- [x] Phase 6: Backlog Digestion (Policy Fix + Reverify) (6/6 plans) — completed 2026-07-04
- [x] Phase 7: Team Feedback Channel — Local Wiring (6/6 plans; E2E-01 live full-loop acceptance) — completed 2026-07-04
- [x] Phase 8: Pinned-Environment Distribution + Thin k8s Deployment (6/6 plans; live on JHU IDIES k8s-dev, healthz ok) — completed 2026-07-05
- [x] Phase 9: Residual v1.0 Debt Sweep (6/6 plans) — completed 2026-07-04

Full phase details: `milestones/v1.1-ROADMAP.md` · Audit: `milestones/v1.1-MILESTONE-AUDIT.md` (status: tech_debt, 17/17 requirements, 5/5 integration seams)

</details>

<details>
<summary>✅ v1.2 Upstream Reconcile (Phases 10, 12) — SHIPPED 2026-07-06</summary>

- [x] Phase 10: Upstream Reconcile (5/5 plans; upstream v0.6.8 merged via real merge, load-terminus adjudicated with from-RED locks as referee, `agda_goal_candidates`/#70 adopted, full acceptance + deploy watched green) — completed 2026-07-05
- [x] Phase 12: Simplification Overhaul (12/12 plans; audited 20-candidate cut list → D-03 sign-off → 6 fork-only cuts executed, 14 upstream-touching cuts deferred per fork policy; zero `src/` change, full real-Agda suite green) — completed 2026-07-06

Full phase details: `milestones/v1.2-ROADMAP.md` · Audit: `milestones/v1.2-MILESTONE-AUDIT.md` (status: tech_debt, 8/8 shipped requirements; SYNC-01/02/03 moved to Future)

</details>

## Future (deferred, artifacts kept for zero-rework revival)

- [~] **Phase 11: Auto-Sync Productionization** *(DEFERRED to Future 2026-07-05; formally moved out of v1.2 scope at milestone close 2026-07-06)* — the `upstream-sync` skill runs unattended every 3 days via a local headless carrier with GSD-native bookkeeping, so upstream divergence stops re-accumulating. **Requirements:** SYNC-01, SYNC-02, SYNC-03. **Deferred because** upstream velocity collapsed to ~0 new commits since Phase 10's reconcile point; manual `upstream-sync` suffices. All artifacts (`11-01..05-PLAN`, RESEARCH, VALIDATION, PATTERNS) kept intact. **Un-defer trigger:** upstream sustains a high commit rate again, or manual checking becomes a burden — then reconsider the carrier (or the lighter SYNC-04 merge-tree digest first).

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Capture Foundation | v1.0 | 5/5 | Complete | 2026-07-02 |
| 2. Oracle Triad | v1.0 | 5/5 | Complete | 2026-07-02 |
| 3. Regression Lock Pipeline | v1.0 | 3/3 | Complete | 2026-07-02 |
| 03.1 Flagship false-green fix | v1.0 | 2/2 | Complete | 2026-07-02 |
| 4. Triage / Fix Queue | v1.0 | 5/5 | Complete | 2026-07-02 |
| 5. Dogfooding Orchestration + Fuel | v1.0 | 4/4 | Complete | 2026-07-03 |
| 6. Backlog Digestion | v1.1 | 6/6 | Complete | 2026-07-04 |
| 7. Team Feedback Channel — Local Wiring | v1.1 | 6/6 | Complete | 2026-07-04 |
| 8. Pinned-Env + Thin k8s Deployment | v1.1 | 6/6 | Complete | 2026-07-05 |
| 9. Residual v1.0 Debt Sweep | v1.1 | 6/6 | Complete | 2026-07-04 |
| 10. Upstream Reconcile | v1.2 | 5/5 | Complete | 2026-07-05 |
| 12. Simplification Overhaul | v1.2 | 12/12 | Complete | 2026-07-06 |
| 11. Auto-Sync Productionization | Future | 0/5 | Deferred | - |

---
*v1.2 shipped 2026-07-06 (Phases 10 + 12; Phase 11 deferred to Future). Next: `/gsd:new-milestone`.*
