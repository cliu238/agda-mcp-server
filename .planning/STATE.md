---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Upstream Reconcile
status: ready_to_plan
stopped_at: Phase 10 complete (5/5) — ready to discuss Phase 11
last_updated: 2026-07-05T21:40:40.119Z
last_activity: 2026-07-05 -- Phase 10 execution started
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 5
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Every real proof session reliably converts into a stronger server — and upstream divergence must stop accumulating so that loop keeps compounding on a reconciled base.
**Current focus:** Phase 11 — auto sync productionization

## Current Position

Phase: 11
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-05

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**

- Total plans completed: 48
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
| 10 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 08 P05 | 19 min | 2 tasks | 1 files |
| Phase 08 P06 | 7 min | 2 tasks | 1 files |
| Phase 10 P1 | 20min | 3 tasks | 13 files |
| Phase 10 P02 | 5min | 2 tasks | 2 files |
| Phase 10 P03 | 8min | 2 tasks | 5 files |
| Phase 10 P04 | 10min | 2 tasks | 0 files |

## Accumulated Context

### Roadmap Evolution

- Phase 12 added (2026-07-05): Simplification overhaul — project-wide health check to cut over-engineering, reduce maintenance burden and user-facing complexity
- v1.2 roadmap created 2026-07-05 and revised the same day to 2 phases per user feedback (4-phase draft was too much ceremony; final shape matches UPSTREAM-SYNC.md's Phase A/B sketch): Phases 10–11 (continuing numbering from v1.1's Phase 9), covering all 11 v1.2 requirements — Upstream Reconcile (10, MERGE-01/02/03 + ADOPT-01/02 + ACCEPT-01/02/03, internally ~3 plans) → Auto-Sync Productionization (11, SYNC-01/02/03). Hard ordering constraint honored: Phase 10 (one-time reconcile) must complete before Phase 11 (recurring sync) is armed.
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
- [Phase 10]: 10-01: adopted upstream's whole-file candidate for the 3 architectural files (agda-transport.ts, command-completion.ts, session-load-impl.ts) per D-04, with 2 forced corrections (return-based loadIncompleteNoTerminus, ported goal-ID recovery block) applied regardless of Plan 10-02's eventual referee verdict
- [Phase 10]: 10-01: extended the plan's single documented test-fix to 5 additional broken tests/mocks the plan's dry-run missed (3 sibling T-06-12 unit tests, 2 tool-level fakeSession mocks, plus session.ts/session-command-dispatch.ts's stale LoadTerminusOptions import, warn-guard.ts's vitest-version type mismatch, and 2 dead agda-transport.test.ts tests) to make npm run build / typecheck:test literally exit 0
- [Phase 10]: 10-02: MERGE-03 verdict GREEN on all 3 referee tests — upstream's whole-file load-terminus architecture (agda-transport.ts, command-completion.ts, session-load-impl.ts) adopted as-is for all 3 sub-behaviors (completion-signal detection, fatal-stderr handling, inactivity timeout); no RED-branch revert/graft needed, decision recorded durably in docs/LOAD-TERMINUS-ADJUDICATION.md
- [Phase 10]: 10-03: agda_goal_candidates was already manifest-registered by upstream's own merge (b717ad4, via reporting-tools.ts) before this plan started; plan Task 1's literal action (adding a 2nd register-core-tools.ts call) tripped manifest.ts's duplicate-registration guard, confirming no new wiring was needed there. Only tool-recommendation.ts + docs (README/assistant-workflows/tool-family-examples.json) needed real changes.
- [Phase 10]: 10-04: full guarded suite (RUN_AGDA_INTEGRATION=1, real Agda) is GREEN with zero failures on the first live run — no expectWarning/ackWarnings registrations needed; all 9 logger.warn call sites in src/ cross-referenced, 6 test-registered + 3 confirmed genuinely dormant (untested, non-guard-triggering)

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
| 260705-79k | Upstream auto-sync: bounded-autonomy skill shipped (ed20063); cloud probe/routine BLOCKED by claude.ai org GitHub-sync gate — deferred with re-arm path; interim carrier = local headless | 2026-07-05 | ed20063 | [260705-79k-upstream-auto-sync-via-scheduled-cloud-r](./quick/260705-79k-upstream-auto-sync-via-scheduled-cloud-r/) |
| 260705-gn0 | Rewrite README.md for end users: why this fork exists, how to use, how to develop (615 → 104 lines, upstream-marketing content deleted, canonical docs linked) | 2026-07-05 | 5b09997 | [260705-gn0-rewrite-readme-md-for-end-users-why-this](./quick/260705-gn0-rewrite-readme-md-for-end-users-why-this/) |
| 260705-h78 | Fix README CI regression (extensions-catalog link), add Codex `codex mcp add` config, split user (Agda 2.6.4.3–2.9.0, no corpora) vs team (pinned-env) install paths, simplify TEAM-ONBOARDING (199 → 92 lines, TL;DR fast path, live-endpoint fact) | 2026-07-05 | 5a6eedd | [260705-h78-fix-readme-ci-regression-add-codex-clien](./quick/260705-h78-fix-readme-ci-regression-add-codex-clien/) |
| 260705-hu3 | Team-facing HTML explainer docs/team-intro.html (433 lines, self-contained, light/dark): Loop ② stage-by-stage with oracle-triad box, team feedback channel pipeline + privacy callout, plain-user vs team-member comparison table | 2026-07-05 | 18016f5 | [260705-hu3-team-facing-html-explainer-self-improvem](./quick/260705-hu3-team-facing-html-explainer-self-improvem/) |
| 260705-je7 | Installer `--public-only` mode (2/2 gate, no GitHub creds; deps.publicOnly seam in clone-fuel-corpora + 2 new unit tests) + corrected "teammates need the 2 private corpora" claims in README/TEAM-ONBOARDING/team-intro.html; own-project sessions documented as first-class fuel (D-07 inlining) | 2026-07-05 | 4bebfe7 | [260705-je7-installer-public-only-mode-correct-contr](./quick/260705-je7-installer-public-only-mode-correct-contr/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-05T19:31:24.520Z
Stopped at: Phase 10 Plan 04 complete (MERGE-02: full guarded suite green with zero failures, no fixes needed, b24779e)
Resume file: None

## Operator Next Steps

- Run /gsd:plan-phase 10 (Upstream Reconcile — expected ~3 plans: mechanical merge + test-strictness reconciliation, load-terminus adjudication, feature adoption + full acceptance)
- Remember the hard ordering constraint: do not plan/execute Phase 11 (auto-sync) until Phase 10 (the one-time reconcile) is fully complete
- Optional unblock (unrelated to sequencing): ask the claude.ai org admin (JHU DSAI Engineering) to enable GitHub sync; then re-run the 260705-79k Task 2 probe verbatim
