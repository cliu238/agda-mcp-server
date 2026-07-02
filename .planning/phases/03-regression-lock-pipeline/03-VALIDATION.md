---
phase: 3
slug: regression-lock-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run test/unit --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds (pure); real-Agda cases gated by RUN_AGDA_INTEGRATION |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit --reporter=dot`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | LOCK-02 | T-03-01-02 | Collision-proof staged capture filenames (closes 01-VERIFICATION.md CR-03) | unit | `npx vitest run test/unit/tools/register-capture-session.test.ts` | existing file, modified | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | REPRO-01, LOCK-02 | T-03-01-01 | Zod-validated capture-regression matrix loader rejects malformed entries | unit | `npx vitest run test/unit/fixtures/capture-regression-matrix.test.ts` | new | ⬜ pending |
| 03-02-T1 | 03-02 | 2 | LOCK-01, LOCK-02 | T-03-02-01 | Shared replay helper sandboxes fixtureDir/mutation copies into an isolated tmpdir | integration (RUN_AGDA_INTEGRATION) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/capture-regression-runner.test.ts` | new | ⬜ pending |
| 03-02-T2 | 03-02 | 2 | LOCK-01, LOCK-02 | T-03-02-01 | Refusal gate (D-06) + path-sandboxed baseline-diff materializer into test/fixtures/agda/ | unit | `npx vitest run test/unit/tools/emit-regression.test.ts` | new | ⬜ pending |
| 03-02-T3 | 03-02 | 2 | LOCK-02 | T-03-02-02 | Matrix-entry compose/write + D-05 RED self-check (rolls back on already-green) + CLI | unit | `npx vitest run test/unit/tools/emit-regression.test.ts` | new (same file as 03-02-T2) | ⬜ pending |
| 03-03-T1 | 03-03 | 3 | REPRO-01, LOCK-01, LOCK-03 | T-03-03-01 | Generic runner: plain test asserting `matchesExpected===false` for red status (defect live), `===true` for locked status — harness throws fail loudly, never masked (D-04; WR-02 fix) | integration (RUN_AGDA_INTEGRATION) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` | new | ⬜ pending |
| 03-03-T2 | 03-03 | 3 | REPRO-01, LOCK-01, LOCK-03 | T-03-03-02 | Flagship real capture -> real emit -> real RED proof, end-to-end (D-09 part1) | integration (RUN_AGDA_INTEGRATION, real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` (expect exactly 1 passed) | new (fixtures + matrix entry) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The following artifacts do not exist yet at planning time (per 03-RESEARCH.md's own "Wave 0 Gaps" list); each is closed by a specific task above, not left outstanding:

- [ ] `test/fixtures/capture-regression-matrix.json` + `.ts` (matrix SSOT) — closed by 03-01-T2
- [ ] Phase-1 staged-capture filename collision fix — closed by 03-01-T1
- [ ] `test/helpers/capture-regression-runner.ts` (shared replay mechanics) — closed by 03-02-T1
- [ ] `scripts/emit-regression.mjs` (the emitter) — closed by 03-02-T2/T3
- [ ] `test/integration/mcp/capture-regression.test.ts` (the one generic replay runner) — closed by 03-03-T1
- [ ] `test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda` (flagship fixture pair) — closed by 03-03-T2

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (Resolved structurally by the WR-02 fix — no longer manual.) The flagship runs as a plain `test` asserting `matchesExpected(observed, expected) === false` (defect live), so a harness fault fails loudly rather than being absorbed as an "expected fail". A genuine Phase-03.1 fix makes observed match, flips the assertion to failing, and forces promotion to `status: "locked"`. | LOCK-03 | Was a `test.fails`-masking concern; the WR-02 code-review fix removed `test.fails` in favor of a structural assertion, so the manual verbose-reporter + temporary-flip experiment is obsolete. | Covered by `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` (automated). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
