---
phase: 12
slug: simplification-overhaul-project-wide-health-check-to-cut-ove
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-05
planned: 2026-07-06
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `12-RESEARCH.md` § Validation Architecture. No REQ-IDs are mapped to this phase (ROADMAP: "Requirements: TBD"), so the verification map is keyed by **cut category** — the equivalent structure that exists here. Plan/Wave/Threat-Ref columns below were assigned by `/gsd:plan-phase 12` (2026-07-06); the audit rows (Plans 12-01..12-06) are read-only and produce the cut list itself, the execution rows (Plans 12-08..12-12) are what this map originally described.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` 4.1.2 [existing project config] |
| **Config file** | `vitest.config.ts` (`test/{examples,unit,property,integration}/**/*.test.ts`; `AGDA_MCP_CI_QUARANTINE` env-gated exclusion applies to CI only) |
| **Quick run command** | `npx vitest run <specific-file-or-dir>` (fast, no live Agda, seconds) |
| **Full suite command** | `RUN_AGDA_INTEGRATION=1 npx vitest run` (real Agda subprocess; **this is C-01's actual referee** — CI green is NOT sufficient, 5 files are CI-quarantined incl. `capture-regression.test.ts`) |
| **Estimated runtime** | Quick: seconds. Full local gate: minutes (requires mise Node 24 on PATH: `export PATH="$HOME/.local/share/mise/installs/node/24/bin:$PATH"`) |

---

## Sampling Rate

- **After every task commit (single cut / small batch):** targeted `npx vitest run <affected test files>` + `npx tsc -p tsconfig.test.json --noEmit` (dangling-import detection)
- **After every plan wave / approved-category batch:** full local gate `RUN_AGDA_INTEGRATION=1 npx vitest run`
- **Before `/gsd:verify-work` (phase gate):** full local suite green one final time (Plan 12-12) + (if any deploy-relevant cut landed) a watched redeploy to green `/healthz`, before the health report's before/after metrics are finalized
- **Max feedback latency:** ~60 seconds (quick run + typecheck)

---

## Per-Task Verification Map

| Cut Category | Plan | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| `scripts/{dogfood,oracle,queue,team}/*.mjs` deletion | 12-08 (execute); audited by 12-01 | 4 (execute); 1 (audit) | T-12-15, T-12-16 | Script's own `test/unit/tools/<prefix>-*.test.ts` + `package.json` script entries deleted in the SAME commit (no orphaned tests referencing deleted imports); the two known-open oracle defects (2eb1768df88bfb07, 1220f2840142aab8) are never silently masked | unit | `npx vitest run test/unit/tools/` (collects clean; no fail-to-collect from dangling imports) | ✅ | ✅ planned |
| `docs/*.md` / `README.md` / `.agents/skills/*/SKILL.md` cuts | 12-11 (execute); audited by 12-02 | 5 (execute); 1 (audit) | T-12-21, T-12-22 | No references left to deleted tools/scripts; generated docs (`docs/FIX-QUEUE-DASHBOARD.md`) never hand-edited; Phase 11 artifacts untouched | manual (documented gap: `no-dead-tool-references.test.ts` only scans `src/`) | none — manual cross-check against `src/tools/manifest.ts` live tool list, repeated in 12-11 Task 2 after all deletions land | N/A | ✅ planned |
| `src/tools/*` MCP tool deletion (D-02) | 12-09 (execute); audited by 12-03 | 4 (execute); 1 (audit) | T-12-17, T-12-18 | Manifest ↔ e2e coverage matrix set-equality holds after EVERY individual deletion, not just at the end; examples file and tool-recommendation.ts stay consistent | unit (mechanical safety net exists) | `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts test/unit/tools/tool-family-examples.test.ts` | ✅ | ✅ planned |
| `src/` low-risk subtraction (dead code, duplicate impls, unused exports) | 12-10 (execute); audited by 12-04 | 4 (execute); 1 (audit) | T-12-19, T-12-20 | C-03: deletion converges toward upstream on overlap files; security controls (V4/V5/V6 inventory in RESEARCH § Security Domain) survive intact; C-04 architecture invariants (single AgdaSession, command-builder SSOT, 500-line ceiling, layering) independently re-verified, not assumed | integration + typecheck | `RUN_AGDA_INTEGRATION=1 npx vitest run && npx tsc -p tsconfig.test.json --noEmit && npx vitest run test/unit/protocol/no-bare-command-strings.test.ts` | ✅ | ✅ planned |
| Regression-lock test files | 12-05 (builds the exclusion list; precondition for all execution plans) | 1 | T-12-09 | **Never a cut target (C-01).** Exclusion list built from `fix-queue.json` (full manual read of every `locked` entry's notes, both "Regression lock:" and "Regression evidence:" phrasings) + `capture-regression-matrix.json`, existence-checked against the real test tree, BEFORE any test/ file is touched by Plans 12-08/12-09/12-10 | audit precondition | fix-queue extraction script (RESEARCH § Code Examples, extended per Pitfall 5) | ✅ | ✅ planned |
| Baseline → after metrics diff (health report) | 12-06 (baseline); 12-12 (after + diff) | 2 (baseline); 6 (after + diff) | T-12-23 | Before/after numbers (LOC, file count, 74-tool count, script count) captured with identical commands at both ends, spot-checked against real git diff stats, not merely asserted | CLI | baseline commands in RESEARCH § Code Examples, re-run verbatim at Plan 12-06 and again at Plan 12-12 | ✅ | ✅ planned |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — all rows updated to ✅ planned (plan set complete; execution not yet run).*

---

## Wave 0 Requirements

- [x] (Optional, planner's call) Extend `no-dead-tool-references.test.ts`'s pattern (or add a sibling test) to scan `docs/*.md`/`README.md`/`.agents/skills/*/SKILL.md` against the live manifest — **declined for this phase**: Plans 12-02 and 12-11 perform the one-time manual equivalent instead (RESEARCH.md's own framing: "optional, not required to execute the phase safely; manual review is a viable substitute for a one-time audit"). Not built as a durable test.
- [x] Baseline metrics snapshot captured into the health report BEFORE any cut lands (front-half plan responsibility) — assigned to Plan 12-06, Task 1.

*Neither gap blocks starting the phase — both are enhancements, not prerequisites. Both are now explicitly dispositioned above (one declined with reasoning, one assigned to a plan).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doc/skill cross-reference integrity after cuts | D-02 lockstep | No automated doc-reference check exists today (`no-dead-tool-references.test.ts` scans `src/` only) | Plan 12-09 Task 2 (per-deletion doc grep) + Plan 12-11 Task 2 (final full-surface re-scan) — read-through of README.md, docs/assistant-workflows.md, .agents/skills/*/SKILL.md against `src/tools/manifest.ts` after tool deletions |
| User sign-off on cut list | D-03 | 拍板 checkpoint is the phase's design — no cut lands before approval | Plan 12-07 Task 1: present severity-graded cut list; user approves items individually; Task 2 records the normalized, fail-closed-on-unmentioned decision |
| Watched redeploy for deploy-relevant cuts | D-01/push cadence | Deploy health is observed on the cluster, not locally | Plan 12-08 Task 2: push batch touching `scripts/oracle/`, `scripts/queue/intake.mjs`, or `scripts/team/` → watch `deploy-ingest.yml` (~30 min) → confirm green `/healthz`; re-confirmed one final time by Plan 12-12 Task 2 against whichever deploy is current at phase close |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — confirmed across all 24 tasks in Plans 12-01 through 12-12 (`gsd-sdk query verify.plan-structure` returned 0 errors for every plan); Plan 12-07 Task 1's automated check is a real precondition check (health report exists and is non-empty), since "did the human respond" has no automatable proxy by nature.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task across all 12 plans carries a real `<automated>` command.
- [x] Wave 0 covers all MISSING references — no task uses a bare `MISSING` marker; the one human-decision task (12-07 Task 1) uses a real precondition check instead.
- [x] No watch-mode flags — all automated commands are one-shot (`vitest run`, not `vitest watch`).
- [x] Feedback latency < 60s (quick lane) — per-task automated commands are targeted `vitest run <file>` or `tsc --noEmit`, both well under 60s; only the full `RUN_AGDA_INTEGRATION=1` gate (minutes) and the watched redeploy (~30 min) exceed it, and both are reserved for batch/phase-level gates per the Sampling Rate above, not per-task.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** plan set complete (2026-07-06) — execution (`/gsd:execute-phase 12`) not yet run.
