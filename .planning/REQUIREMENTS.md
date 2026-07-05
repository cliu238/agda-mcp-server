# Requirements: Agda MCP Server — v1.2 Upstream Reconcile

**Defined:** 2026-07-05
**Core Value:** Every real proof session reliably converts into a stronger server — and upstream divergence must stop accumulating so that loop keeps compounding on a reconciled base.

## v1.2 Requirements

Requirements for this milestone. Each maps to roadmap phases.

Settled decisions constraining all of these (from `.planning/research/UPSTREAM-SYNC.md`, do not relitigate):
manage own repo only (upstream-PR path parked); merge, never rebase; reconcile BEFORE arming any
recurring sync; 3-day sync cadence; each auto-merge push costs one accepted ~30 min D-06 deploy cycle.

### Merge & Adjudication

- [ ] **MERGE-01**: Upstream v0.6.8 (5 commits, head `d4497a2`) merged into `main` via `git merge` (never rebase), all 6 conflict files resolved, build + `typecheck:test` green
- [ ] **MERGE-02**: Upstream's fail-suite-on-unexpected-`logger.warn` test strictness reconciled with our full suite — ~1600 tests green, with expected-warn registrations wherever our best-effort-catch convention legitimately warns
- [ ] **MERGE-03**: Load-terminus semantics adjudicated per sub-behavior (ours / theirs / hybrid vs upstream #68/#69), with our from-RED regression locks (#64/#61 flagship, RT8) as referee and BOTH repos' regression suites green; adjudication decisions recorded

### Feature Adoption

- [ ] **ADOPT-01**: Upstream #70's `agda_goal_candidates` (type-directed term search) + Mimer auto fix work through our tool manifest (SSOT) and tool-recommendation
- [ ] **ADOPT-02**: The adopted tools are documented (README / tool catalog) and discoverable by driving agents

### Acceptance

- [ ] **ACCEPT-01**: Post-merge full verify green: real-Agda full suite, `typecheck:test`, build
- [ ] **ACCEPT-02**: One real dogfood session runs against the merged server as acceptance — the loop verifying its own upstream merge
- [ ] **ACCEPT-03**: The final push's auto-deploy (D-06) watched to green — cluster healthz `ok`

### Auto-Sync Productionization

- [ ] **SYNC-01**: launchd runs the `upstream-sync` skill headlessly every 3 days (`StartCalendarInterval`, missed runs caught up on wake), invoking `claude -p` with the real-Agda full verification gates
- [ ] **SYNC-02**: Sync bookkeeping is GSD-native: each sync produces a real `.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY plus a STATE.md Quick-Tasks row, committed with the merge; falls back to `docs/UPSTREAM-SYNC-LOG.md` when gsd-sdk is absent
- [ ] **SYNC-03**: One real end-to-end headless carrier run proven: the scheduled invocation executes the skill through its gates (no-op or behind state both acceptable) and produces the bookkeeping artifact

## Future Requirements

Deferred. Tracked but not in the current roadmap.

### Sync Signal

- **SYNC-04**: Scheduled GitHub Action performs a read-only `git fetch` + `merge-tree` dry run and opens a digest issue when new upstream divergence appears (deferred 2026-07-05: the 3-day local sync is the primary signal; upstream cadence is currently slow; add via `/gsd-quick` if the blind spot ever hurts)

### Cloud Carrier

- **SYNC-05**: Cloud-routine carrier for the sync skill — parked behind the recorded re-arm path (org admin enables GitHub sync → re-run the 260705-79k Task 2 probe verbatim → arm every-3-days routine with degraded no-Agda gates)

## Out of Scope

Explicitly excluded from v1.2. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| RT6 five-state load conflation redesign | Upstream #68/#69 reshape the same seam; re-evaluate its form only after the merge lands |
| RT7 timeout-diagnostics redesign | Same seam as upstream #69's timeout handling; re-evaluate post-merge |
| npm publishing (PUB-01), external-user issue template (FEED-01) | Independent small items; run ad hoc via `/gsd-quick` |
| CACHE-04 oracle prewarm | Unchanged trigger: TEAM-04 INCONCLUSIVE/timeout rate becoming the bottleneck |
| Loop ① exploration (turn-based proof guidance) | North-star direction, needs its own milestone |
| Upstream-PR contribution path | Parked by standing decision — repo is not a GitHub fork of upstream; cross-repo PRs impossible without new access arrangements |
| Sync cadence tighter than 3 days | Requires a `concurrency:` group on `deploy-ingest.yml` first (known Info-level gap) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MERGE-01 | — | Pending |
| MERGE-02 | — | Pending |
| MERGE-03 | — | Pending |
| ADOPT-01 | — | Pending |
| ADOPT-02 | — | Pending |
| ACCEPT-01 | — | Pending |
| ACCEPT-02 | — | Pending |
| ACCEPT-03 | — | Pending |
| SYNC-01 | — | Pending |
| SYNC-02 | — | Pending |
| SYNC-03 | — | Pending |

**Coverage:**
- v1.2 requirements: 11 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 11 ⚠️ (expected before roadmap)

---
*Requirements defined: 2026-07-05*
*Last updated: 2026-07-05 after initial definition*
