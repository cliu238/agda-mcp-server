---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Feed the Loop
status: Awaiting next milestone
stopped_at: Completed 08-06-PLAN.md — phase 8 execution complete (6/6); milestone v1.1 plans 24/24; v1.1 tag pushed; awaiting review chain + verifier + milestone lifecycle
last_updated: "2026-07-05T05:08:30.425Z"
last_activity: 2026-07-05 — Milestone v1.1 completed and archived
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 24
  completed_plans: 24
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Every real proof session reliably converts into a stronger server — the closed loop (use it → surface a defect → capture it → fix and lock it with a regression test → use it again) must work reproducibly by hand.
**Current focus:** Phase 09 — residual v1 0 debt sweep

## Current Position

Phase: Milestone v1.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-05 — Milestone v1.1 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 43
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 5 | - | - |
| 03 | 3 | - | - |
| 03.1 | 2 | - | - |
| 04 | 5 | - | - |
| 05 | 4 | - | - |
| 6 | 6 | - | - |
| 7 | 6 | - | - |
| 9 | 6 | - | - |
| 8 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 08 P05 | 19 min | 2 tasks | 1 files |
| Phase 08 P06 | 7 min | 2 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- v1.1 roadmap created 2026-07-03 and reworked the same day after the CACHE theme was deleted by consumer audit: Phases 6–9 (continuing numbering from v1.0's Phase 5 + 03.1), covering all 17 v1.1 requirements — Backlog Digestion (6) → Team Feedback Channel Local Wiring incl. the live-CHG full-loop E2E-01 acceptance (7) → Pinned-Env + Thin k8s Deploy (8, gated ~2026-07-07) → Residual Debt Sweep (9, independent, can fill the server-wait gap).
- Phase 03.1 inserted after Phase 3 (v1.0): Fix the #64/#61 transitive-staleness false-green and flip the flagship lock to green (sequenced by 03-CONTEXT D-09) (URGENT)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Deploy (08-04): dedicated `agda-mcp-ghcr` GHCR pull secret — litellm SHARES `ghcr-credentials` and the two credentials 403 on each other's packages (verified); never overwrite the shared secret. Rotation recipe in docs/DEPLOY-OPERATIONS.md.
- Deploy (08-04): every k8s workload on this image MUST override `command:` — the image CMD is the MCP stdio server and silently CrashLoops in a pod (ingest runs `npx tsx scripts/team/ingest-server.mjs`).
- Deploy (08-04): FUEL_CORPORA_READ_TOKEN is a classic repo-scope PAT — fine-grained PATs cannot see cross-owner private repos, making the plan/threat-model spec (T-08-15) platform-impossible; residual risk documented in 08-04-SUMMARY Threat Flags.
- Scope (v1.1): the entire CACHE theme (build script, image cache prebake, cluster build job, any distribution channel) was deleted from v1.1 by consumer audit — the oracle is forbidden from caches by design, the server needs source clones only, teammates already hold warm local `_build`s. v2 anchored on CACHE-04 (oracle prewarm); trigger = TEAM-04's INCONCLUSIVE/timeout rate becoming the bottleneck. The deploy image is consequently small (Node + Agda + corpus source clones) and needs no special build machine.
- Roadmap (v1.1): TEAM-05 (pinned-env git-install distribution) grouped into Phase 8 with deployment, not Phase 7 — it packages Phase 7's already-proven upload URL/key mechanism, so it belongs after that mechanism is real.
- Roadmap: Loop wraps the server — only two surgical `src/` additions (pure `session-capture` model + emit-only capture tool); all orchestration in `scripts/` + repo data dirs.
- Roadmap: Cold-compiler oracle (Phase 2) isolated *before* the regression emitter (Phase 3) so durable tests assert the correct result, never golden-master a false-green.
- Roadmap: Queue (Phase 4) precedes orchestration (Phase 5) so the firehose meets backpressure (Pitfall 6).
- [Phase 08]: 08-05: fix-queue.json absent on PVC is the honest empty-queue state (readQueueFile absent->[]); never seed an empty file to satisfy an exists-check
- [Phase 08]: 08-05: D-09 write-back-disabled proven live via three layers — /app ships no .git (dockerignore), queue-path-outside-repo short-circuit, --no-push — plus sha256 byte-identity of the baked-in fix-queue.json
- [Phase 08]: 08-06: v1.1 tagged on 6c0d716d and pushed (with the batched main push, first of the session, triggering D-06 auto-deploy as accepted) — the installer's latest-tag resolution now lands on v1.1, superseding stale v1.0 (D-11)
- [Phase 08]: 08-06: POLICY-01 proven on the deployed pod's own filesystem (6/6, exit 0) — policy files live in the image layer /app/scripts/data/oracle-policy, not the PVC; CephFS semantics play no part in the test

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 7 (Team Feedback Channel) flagged for discuss-phase during planning: the fix-queue write-back mechanism (direct push to `main` vs. PR-per-batch from the cron) is an open architecture decision the research explicitly left unresolved. Concrete payload-size-cap, local-retry-queue bound, and archive-retention numbers also need deciding (the pattern — "a bound must exist" — is settled; the numbers are not). E2E-01 precondition: CHG's vendored agda-unimath must be built locally once (overnight, corpus's own tooling) before the live acceptance run.
- Phase 8 (Pinned-Env + Thin k8s Deployment) flagged for `/gsd:plan-phase --research-phase` once the JHU IDIES-style server has actually arrived (~2026-07-07): the k8s namespace name, PVC provisioning mode, and the Ceph PVC's backing-store mode (RBD vs. CephFS — determines whether `fs.rename`-based atomic writes are safe) are unknowns until then. Also needs an explicit taste decision on TEAM-05's exact fixed-clone-path convention.
- Phases 6 and 9 are standard, well-documented patterns — skip research-phase (root causes/fix locations already identified, or a closed pre-itemized checklist).
- v1.0-era blockers (RecordedTransport cassette design, oracle triad correctness risk, CHG re-verification) are resolved by the shipped v1.0 milestone — see `milestones/v1.0-MILESTONE-AUDIT.md` and PROJECT.md's Key Decisions table for the historical record.
- 08-05 PVC-ownership blocker RESOLVED (bc2f873, verified live + full acceptance green 2026-07-05): a restricted-compliant `pvc-dirs` initContainer (runs as 2231, explicit resources — the quota rejects init containers without them; PSA restricted forbids root chown pods, tested) pre-creates `agda-mcp-data/{team-storage,cluster-fix-queue}` before subPath resolution; subPaths renamed `agda-mcp/*` → `agda-mcp-data/*` (mount paths unchanged). Rule: any NEW subPath must live under a pvc-dirs-pre-created 2231-owned parent. Old root-owned `agda-mcp/` PVC tree is orphaned junk pending IDIES-side removal (cosmetic).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260702-29k | Re-verify CHG v0.6.7 defect list against current main | 2026-07-02 | 6aa28e4 | [260702-29k-re-verify-chg-v0-6-7-defect-list-against](./quick/260702-29k-re-verify-chg-v0-6-7-defect-list-against/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-05T03:45:17.237Z
Stopped at: Completed 08-06-PLAN.md — phase 8 execution complete (6/6); milestone v1.1 plans 24/24; v1.1 tag pushed; awaiting review chain + verifier + milestone lifecycle
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
