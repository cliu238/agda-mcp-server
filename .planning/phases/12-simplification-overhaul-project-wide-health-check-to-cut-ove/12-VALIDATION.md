---
phase: 12
slug: simplification-overhaul-project-wide-health-check-to-cut-ove
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `12-RESEARCH.md` § Validation Architecture. No REQ-IDs are mapped to this phase (ROADMAP: "Requirements: TBD"), so the verification map is keyed by **cut category** — the equivalent structure that exists here. Task IDs are filled in by the planner.

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
- **Before `/gsd:verify-work` (phase gate):** full local suite green one final time + (if any deploy-relevant cut landed) a watched redeploy to green `/healthz`, before the health report's before/after metrics are finalized
- **Max feedback latency:** ~60 seconds (quick run + typecheck)

---

## Per-Task Verification Map

> Task IDs assigned by the planner. Rows below are the cut-category-level contract every execution task must map onto.

| Cut Category | Plan | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| `scripts/{dogfood,oracle,queue,team}/*.mjs` deletion | TBD | TBD | — | Script's own `test/unit/tools/<prefix>-*.test.ts` + `package.json` script entries deleted in the SAME commit (no orphaned tests referencing deleted imports) | unit | `npx vitest run test/unit/tools/` (collects clean; no fail-to-collect from dangling imports) | ✅ | ⬜ pending |
| `docs/*.md` / `README.md` / `.agents/skills/*/SKILL.md` cuts | TBD | TBD | — | No references left to deleted tools/scripts; generated docs (`docs/FIX-QUEUE-DASHBOARD.md`) never hand-edited | manual (documented gap: `no-dead-tool-references.test.ts` only scans `src/`) | none — manual cross-check against `src/tools/manifest.ts` live tool list | N/A | ⬜ pending |
| `src/tools/*` MCP tool deletion (D-02) | TBD | TBD | T-12-02 | Manifest ↔ e2e coverage matrix set-equality holds; examples file stays consistent | unit (mechanical safety net exists) | `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts test/unit/tools/tool-family-examples.test.ts` | ✅ | ⬜ pending |
| `src/` low-risk subtraction (dead code, duplicate impls, unused exports) | TBD | TBD | T-12-01 | C-03: deletion converges toward upstream on overlap files; security controls (V4/V5/V6 inventory in RESEARCH § Security Domain) survive intact | integration + typecheck | `RUN_AGDA_INTEGRATION=1 npx vitest run && npx tsc -p tsconfig.test.json --noEmit` | ✅ | ⬜ pending |
| Regression-lock test files | — | — | T-12-03 | **Never a cut target (C-01).** Exclusion list built from `fix-queue.json` ("Regression lock:"/"Regression evidence:" entries) + `capture-regression-matrix.json` BEFORE touching any `test/` file | audit precondition | fix-queue extraction script (RESEARCH § Code Examples) | ✅ | ⬜ pending |
| Baseline → after metrics diff (health report) | TBD | TBD | — | Before/after numbers (LOC, file count, 74-tool count, script count) captured with identical commands | CLI | baseline commands in RESEARCH § Code Examples, re-run at execution time | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] (Optional, planner's call) Extend `no-dead-tool-references.test.ts`'s pattern (or add a sibling test) to scan `docs/*.md`/`README.md`/`.agents/skills/*/SKILL.md` against the live manifest — closes the only unautomated lockstep check durably. Manual review is a viable substitute for a one-time audit.
- [ ] Baseline metrics snapshot captured into the health report BEFORE any cut lands (front-half plan responsibility) — the back half needs something concrete to diff against.

*Neither gap blocks starting the phase — both are enhancements, not prerequisites.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doc/skill cross-reference integrity after cuts | D-02 lockstep | No automated doc-reference check exists today (`no-dead-tool-references.test.ts` scans `src/` only) | Read-through of README.md, docs/assistant-workflows.md, .agents/skills/*/SKILL.md against `src/tools/manifest.ts` after tool deletions |
| User sign-off on cut list | D-03 | 拍板 checkpoint is the phase's design — no cut lands before approval | Present severity-graded cut list; user approves items individually |
| Watched redeploy for deploy-relevant cuts | D-01/push cadence | Deploy health is observed on the cluster, not locally | Push batch → watch `deploy-ingest.yml` (~30 min) → confirm green `/healthz` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (quick lane)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
