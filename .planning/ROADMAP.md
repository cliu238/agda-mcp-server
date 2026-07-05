# Roadmap: Agda MCP Server — Self-Improvement Loop

## Milestones

- ✅ **v1.0 Self-Improvement Loop** — Phases 1–5 (+03.1) (shipped 2026-07-03)
- ✅ **v1.1 Feed the Loop** — Phases 6–9 (shipped 2026-07-05)
- 🚧 **v1.2 Upstream Reconcile** — Phases 10–11 (in progress)

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

### 🚧 v1.2 Upstream Reconcile (In Progress)

**Milestone Goal:** Merge upstream v0.6.8 for real (`git merge`, never rebase), adjudicate load-terminus semantics per sub-behavior with our from-RED regression locks as referee, adopt upstream's new term-search/Mimer feature, and run full post-merge acceptance — then, and only then, productionize the unattended every-3-days auto-sync so upstream divergence stops accumulating. Phase numbering continues from v1.1 (which ended at Phase 9); v1.2 starts at Phase 10. **Hard ordering constraint (settled, do not deviate):** Phase 10 (the one-time reconcile) must fully complete before Phase 11 (auto-sync) is armed — arming recurring sync before reconciling guarantees an escalation every 3 days.

- [x] **Phase 10: Upstream Reconcile** - The entire one-time reconcile: upstream v0.6.8 merged (real merge, never rebase), load-terminus semantics adjudicated with from-RED locks as referee, upstream #70 features adopted, and full acceptance (real-Agda suite + dogfood session + deploy watched green) (completed 2026-07-05)
- [ ] **Phase 11: Auto-Sync Productionization** - The `upstream-sync` skill runs unattended every 3 days via a local headless carrier with GSD-native bookkeeping, so upstream divergence stops re-accumulating

## Phase Details

### Phase 10: Upstream Reconcile

**Goal**: The two codebases are reconciled for real: upstream v0.6.8 is merged into `main` via a real merge commit (never rebase), the overlapping load-terminus semantics are adjudicated sub-behavior by sub-behavior with our from-RED regression locks as referee, upstream #70's term-search/Mimer feature is adopted and made discoverable, and the merged server passes full acceptance — proving the reconcile made the server stronger, not just different. (Internally ~3 plans per the seed doc's Phase A sketch: mechanical merge + test-strictness reconciliation → load-terminus adjudication → feature adoption + full acceptance; that decomposition is plan-phase's business.)
**Depends on**: Nothing (first phase of v1.2 — builds on the shipped v1.1 codebase)
**Requirements**: MERGE-01, MERGE-02, MERGE-03, ADOPT-01, ADOPT-02, ACCEPT-01, ACCEPT-02, ACCEPT-03
**Success Criteria** (what must be TRUE):

  1. `git log` shows upstream v0.6.8 (head `d4497a2`) merged into `main` via a real merge commit — never a rebase; all 6 flagged conflict files (`src/agda/refactor-helpers.ts`, `src/agda/session-load-impl.ts`, `src/session/agda-transport.ts`, `src/session/command-completion.ts`, `src/tools/goal-tools.ts`, `test/unit/agda/agent-ux.test.ts`) resolved with no leftover conflict markers; `npm run build` and `typecheck:test` both exit 0. (MERGE-01)
  2. The full combined regression suite (~1600 tests, ours + upstream's) passes under upstream's new fail-suite-on-unexpected-`logger.warn` harness, with every legitimate best-effort-catch `logger.warn` call site explicitly allow-listed rather than deleted or silenced. (MERGE-02)
  3. Load-terminus semantics are adjudicated per sub-behavior (completion-signal detection, fatal-stderr handling, inactivity timeout) as ours/theirs/hybrid — our from-RED locks (#64/#61 flagship, RT8) stay green AND upstream's own #68/#69 regression tests pass under the adjudicated implementation, with the decisions and rationale recorded durably. (MERGE-03)
  4. `agda_goal_candidates` (type-directed term search + Mimer auto fix) is adopted end-to-end: registered in the tool manifest (SSOT), surfaced by tool-recommendation, and documented in the README / tool catalog well enough that a driving agent (Codex/Claude Code) can discover and use it without reading source. (ADOPT-01, ADOPT-02)
  5. Acceptance holds: full verify green (real-Agda integration suite, `typecheck:test`, build), a real dogfood session runs to completion against the merged server (the loop verifying its own upstream merge), and the final push's auto-deploy (D-06) is watched to green with cluster `/healthz` returning `ok`. (ACCEPT-01, ACCEPT-02, ACCEPT-03)

**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Merge upstream v0.6.8 (real merge commit), resolve all 6 conflict files, build+typecheck green

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-02-PLAN.md — Run the load-terminus referee, adjudicate ours/theirs/hybrid, record the decision in docs/LOAD-TERMINUS-ADJUDICATION.md
- [x] 10-03-PLAN.md — Wire agda_goal_candidates through the manifest, tool-recommendation, and docs

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-04-PLAN.md — Reconcile the full suite under upstream's fail-on-unexpected-warn harness

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 10-05-PLAN.md — Full acceptance: combined verify, real dogfood session, single push watched to green deploy

### Phase 11: Auto-Sync Productionization

**Goal**: The `upstream-sync` skill runs unattended on a recurring 3-day cadence via a local headless carrier, with each run's outcome captured as a GSD-native bookkeeping artifact — so upstream divergence stops re-accumulating after the one-time reconcile.
**Depends on**: Phase 10 (hard ordering constraint, settled decision: arming recurring sync before the one-time reconcile completes guarantees an escalation every 3 days)
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):

  1. A launchd job (`StartCalendarInterval`, catches up missed runs on wake) invokes `claude -p` to run the `upstream-sync` skill every 3 days without manual triggering.
  2. A completed sync run produces a real `.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY pair and a corresponding STATE.md Quick-Tasks row (or a `docs/UPSTREAM-SYNC-LOG.md` entry when `gsd-sdk` is unavailable), committed alongside any merge it performs.
  3. At least one real end-to-end headless carrier run has executed the skill through its real-Agda verification gates (a no-op or behind-schedule outcome is an acceptable result) and produced the bookkeeping artifact described in criterion 2.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Capture Foundation | v1.0 | 5/5 | Complete | 2026-07-02 |
| 2. Oracle Triad | v1.0 | 5/5 | Complete | 2026-07-02 |
| 3. Regression Lock Pipeline | v1.0 | 3/3 | Complete | 2026-07-02 |
| 03.1 Flagship false-green fix | v1.0 | 2/2 | Complete | 2026-07-02 |
| 4. Triage / Fix Queue | v1.0 | 5/5 | Complete | 2026-07-02 |
| 5. Dogfooding Orchestration + Fuel | v1.0 | 4/4 | Complete | 2026-07-03 |
| 6. Backlog Digestion (Policy Fix + Reverify) | v1.1 | 6/6 | Complete | 2026-07-04 |
| 7. Team Feedback Channel — Local Wiring | v1.1 | 6/6 | Complete | 2026-07-04 |
| 8. Pinned-Env + Thin k8s Deployment | v1.1 | 6/6 | Complete | 2026-07-05 |
| 9. Residual v1.0 Debt Sweep | v1.1 | 6/6 | Complete | 2026-07-04 |
| 10. Upstream Reconcile | v1.2 | 5/5 | Complete    | 2026-07-05 |
| 11. Auto-Sync Productionization | v1.2 | 0/TBD | Not started | - |

### Phase 12: Simplification overhaul: project-wide health check to cut over-engineering, reduce maintenance burden and user-facing complexity

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 12 to break down)
