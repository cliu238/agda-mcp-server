---
phase: 10
slug: upstream-reconcile
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 (+ @fast-check/vitest for property tests) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run test/unit` |
| **Full suite command** | `npm test` (pretest runs `npm run build`); real-Agda gate: `npm run test:integration` |
| **Estimated runtime** | ~60s unit-only; several minutes full (real-Agda integration) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit`
- **After every plan wave:** Run `npm test` and `npm run typecheck:test`
- **Before `/gsd:verify-work`:** Full suite must be green, including `npm run test:integration` (real Agda)
- **Max feedback latency:** ~300 seconds (full suite with real-Agda integration)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner — merge/adjudication/adoption tasks map to MERGE-01..03, ADOPT-01..02, ACCEPT-01..03) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — the combined suite (~1600 tests, ours + upstream's post-merge) plus upstream's fail-on-unexpected-`logger.warn` harness is itself the referee for this phase. No new test framework or scaffolding needed before execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real dogfood session against merged server | ACCEPT-02 | Requires driving a live agent session end-to-end | Run a proof session per the `agda-dogfooding` skill against the merged server; confirm completion |
| Auto-deploy watched to green | ACCEPT-03 | External cluster state (JHU k8s) | After final push, watch GitHub Actions deploy to green; `curl` cluster `/healthz` → `ok` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
