---
phase: 5
slug: dogfooding-orchestration-fuel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run test/unit --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60s pure; the orchestrator/N-times gate tested via small fixtures + mocked harness (NOT a multi-week live corpus run); real-Agda cases RUN_AGDA_INTEGRATION-gated |

---

## Sampling Rate

- **After every task commit:** `npx vitest run test/unit --reporter=dot`
- **After every plan wave:** `npm test`
- **Before `/gsd:verify-work`:** Full suite green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled during planning) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] (filled during planning — see 05-RESEARCH.md Validation Architecture)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (the actual multi-week live-corpus dogfooding run — PROC-01 proven on real corpora is a maintainer activity, not a CI gate) | | | |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Orchestrator/N-times gate tested via fixtures+mock (no live-corpus dependency in CI)
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
