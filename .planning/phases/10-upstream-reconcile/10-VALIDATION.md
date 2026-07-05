---
phase: 10
slug: upstream-reconcile
status: reviewed
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-05
updated: 2026-07-05
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 (+ @fast-check/vitest for property tests) |
| **Config file** | `vitest.config.ts` (gains `setupFiles: ["test/helpers/warn-guard.ts"]` via the merge — auto-merges cleanly alongside our ciQuarantine/exclude/passWithNoTests block) |
| **Quick run command** | `npx vitest run test/unit` |
| **Full suite command** | `npm test` (pretest runs `npm run build`); real-Agda gate: `RUN_AGDA_INTEGRATION=1 npx vitest run` |
| **Estimated runtime** | ~60s unit-only; several minutes full (real-Agda integration) |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` verify (targeted per-file vitest runs where specified)
- **After every plan wave:** Run `npm run build` and `npm run typecheck:test`; from Wave 3 onward also the full guarded suite
- **Before `/gsd:verify-work`:** Full suite must be green, including `RUN_AGDA_INTEGRATION=1 npx vitest run` (real Agda)
- **Max feedback latency:** ~300 seconds (full suite with real-Agda integration). Three tasks (10-04 T1/T2, 10-05 T1) deliberately run the full unfiltered suite as their verify — justified inline in each task (the full-suite result IS the artifact those tasks exist to produce).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-T1 | 10-01 | 1 | MERGE-01 | T-10-02 | Mechanical/structural conflict resolution preserves the T-06-12/RT4 flag-hint guard | unit | `npx vitest run test/unit/agda/agent-ux.test.ts test/unit/tools/goal-tools-give.test.ts test/unit/tools/goal-tools-write-rejected.test.ts` | ✅ | ⬜ pending |
| 10-01-T2 | 10-01 | 1 | MERGE-01 | T-10-02 | Architectural files carry one coherent candidate; no stale load-terminus-tracker imports | source assertion | `grep -rn "loadTerminusMode\|LoadTerminusOptions\|LoadTerminusState" src/session/agda-transport.ts src/session/command-completion.ts src/agda/session-load-impl.ts` (expect 0 non-comment hits) | ✅ | ⬜ pending |
| 10-01-T3 | 10-01 | 1 | MERGE-01 | T-10-03, T-10-04 | Real merge commit (2 parents); lockfile unchanged beyond version bump | smoke | `npm run build && npm run typecheck:test` | ✅ | ⬜ pending |
| 10-02-T1 | 10-02 | 2 | MERGE-03 | T-10-05 | Referee verdict comes from real fault-injected runs, never taste | integration (real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts test/integration/agda/agda-stale-dependency.test.ts` | ✅ | ⬜ pending |
| 10-02-T2 | 10-02 | 2 | MERGE-03 | T-10-06, T-10-07, T-10-08 | Adjudicated implementation green under both repos' locks; fatal-stderr unblocks terminus; durable record written | integration + unit (real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts test/integration/agda/agda-stale-dependency.test.ts test/unit/session/agda-transport.test.ts test/unit/agda/session-load-impl.test.ts test/unit/session/register-agda-load-no-metas.test.ts` | ✅ (doc is new output) | ⬜ pending |
| 10-03-T1 | 10-03 | 2 | ADOPT-01 | T-10-09 | Tool registered only via manifest SSOT; coverage-matrix lockstep proves registration | unit | `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts test/unit/session/tool-recommendation.test.ts test/unit/tools/goal-candidates.test.ts` | ✅ | ⬜ pending |
| 10-03-T2 | 10-03 | 2 | ADOPT-02 | T-10-09 | Examples JSON stays schema-valid; docs name the tool verbatim (D-08) | unit + source assertion | `npx vitest run test/unit/tools/tool-family-examples.test.ts` | ✅ | ⬜ pending |
| 10-04-T1 | 10-04 | 3 | MERGE-02 | T-10-11 | Authoritative warn-guard failure list from a live run (never a static grep estimate) | full suite (real Agda; latency exceedance justified in-task) | `RUN_AGDA_INTEGRATION=1 npx vitest run` | ✅ | ⬜ pending |
| 10-04-T2 | 10-04 | 3 | MERGE-02 | T-10-11, T-10-12 | Every exercised warn acknowledged via expectWarning/ackWarnings; nothing deleted or weakened | full suite (real Agda; latency exceedance justified in-task) | `RUN_AGDA_INTEGRATION=1 npx vitest run` | ✅ | ⬜ pending |
| 10-05-T1 | 10-05 | 4 | ACCEPT-01 | T-10-13 | Final combined verify green before any irreversible step | smoke + full suite (latency exceedance justified in-task) | `npm run build && npx tsc -p tsconfig.test.json --noEmit && RUN_AGDA_INTEGRATION=1 npx vitest run` | ✅ | ⬜ pending |
| 10-05-T2 | 10-05 | 4 | ACCEPT-02 | T-10-15 | Real dogfood session finalized; agda_goal_candidates provably invoked (D-09) | manual + script assertion (manual-only justified: live Codex session against a real corpus) | `node -e "...finalized check..." .agda-mcp/runs/<run-id>/run-report.json` + transcript grep for `agda_goal_candidates` | ✅ (run report is new output) | ⬜ pending |
| 10-05-T3 | 10-05 | 4 | ACCEPT-03 | T-10-13, T-10-14 | Single push; deploy watched to green; healthz ok | CI + external check (manual-adjacent justified: external cluster state) | `gh run watch <id> --exit-status` then `curl -fsS https://dev.sites.idies.jhu.edu/agda-mcp/healthz` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — the combined suite (~1600 tests, ours + upstream's post-merge) plus upstream's fail-on-unexpected-`logger.warn` harness is itself the referee for this phase. No new test framework or scaffolding needed before execution.

The two Wave-0 gaps RESEARCH.md flagged are both absorbed into plans rather than pre-work:
- Manifest-inclusion assertion for `agda_goal_candidates`: already exists — `test/unit/tools/mcp-e2e-coverage.test.ts` asserts strict matrix↔manifest lockstep and the coverage-matrix entry auto-merges in; it goes green when 10-03-T1 wires the tool (no new test needed).
- `docs/LOAD-TERMINUS-ADJUDICATION.md`: a documentation deliverable, owned by 10-02-T2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real dogfood session against merged server, invoking `agda_goal_candidates` at least once | ACCEPT-02 | Requires driving a live Codex headless session end-to-end against the pinned CHG corpus | 10-05-T2: launch via `scripts/dogfood/dogfood-run.mjs` per the `agda-dogfooding` skill; wrap up via `dogfood-wrapup.mjs`; confirm `finalized: true` + tool-call log contains `agda_goal_candidates` |
| Auto-deploy watched to green | ACCEPT-03 | External cluster state (JHU k8s) | 10-05-T3: after the single push, `gh run watch <id> --exit-status`, then `curl -fsS https://dev.sites.idies.jhu.edu/agda-mcp/healthz` → 200/ok |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (12/12 tasks carry an `<automated>` command; 10-05-T2/T3 pair theirs with justified manual steps)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none needed — existing infra covers; see Wave 0 Requirements)
- [x] No watch-mode flags (all commands use `vitest run`)
- [x] Feedback latency < 300s for targeted per-task verifies; the three full-suite runs (10-04-T1/T2, 10-05-T1) deliberately exceed the per-task target with inline justification in each task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-populated 2026-07-05 (revision 1) — pending checker confirmation
