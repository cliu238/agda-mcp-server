---
phase: 4
slug: triage-fix-queue
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-02
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run test/unit --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60s pure; QUEUE-04 gh-mirror tests run dry-run/mocked (no live GitHub calls) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit --reporter=dot`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | QUEUE-01 | T-04-01-01 | Terminal-status refinement (rejectedReason/closedAt required) enforced by zod, not convention | unit | `npx vitest run test/unit/fixtures/fix-queue.test.ts` | created this task | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | QUEUE-01 | T-04-01-01 | Every write validated via fixQueueEntrySchema before writeFileAtomic persists it | unit (tdd) | `npx vitest run test/unit/tools/queue-intake.test.ts` | created this task | ⬜ pending |
| 04-01-T3 | 04-01 | 1 | QUEUE-01 | T-04-01-02 | readDedupIndex never throws on absent/malformed queue file; repointed off .agda-mcp/ | unit | `npx vitest run test/unit/agda/session-capture/dedup-index.test.ts` | extends existing | ⬜ pending |
| 04-02-T1 | 04-02 | 1 | QUEUE-03 | T-04-02-01 | Load-family error scan wrapped in try/catch, degrades to triage:null on any unexpected shape | typecheck | `npx tsc -p tsconfig.json --noEmit` | modifies existing | ⬜ pending |
| 04-02-T2 | 04-02 | 1 | QUEUE-03 | T-04-02-01 | Null-triage and real-triage paths both proven; no regression to 3 pre-existing tests | unit | `npx vitest run test/unit/tools/register-capture-session.test.ts` | extends existing | ⬜ pending |
| 04-03-T1 | 04-03 | 2 | QUEUE-01 | T-04-03-01 | Every seed entry validated via upsertQueueEntry's schema check before write; idempotency proven via scratch copy, never the committed file | integration (script run) | `node -e "const q=JSON.parse(require('fs').readFileSync('test/fixtures/fix-queue.json','utf8')); if(q.length!==13){console.error('expected 13, got '+q.length); process.exit(1);} console.log('ok: 13 entries present');"` | created this task | ⬜ pending |
| 04-03-T2 | 04-03 | 2 | QUEUE-01 | T-04-03-01 | Referential integrity (relatedFingerprint resolves); classifier-accuracy re-check against live classifyAgdaError | unit | `npx vitest run test/unit/fixtures/fix-queue.test.ts` | extends existing | ⬜ pending |
| 04-04-T1 | 04-04 | 2 | QUEUE-04 | T-04-04-01, T-04-04-04 | Dry-run-default (no execFileSync call without options.execute:true); argv-array + shell:false for every gh call | syntax check | `node --check scripts/queue/mirror-github.mjs` | created this task | ⬜ pending |
| 04-04-T2 | 04-04 | 2 | QUEUE-04 | T-04-04-01, T-04-04-02, T-04-04-04 | Mocked test proves zero live gh calls by default (mandatory quality-gate assertion); D-11 payload whitelist; D-12 update-not-duplicate | unit (mocked, no live gh) | `npx vitest run test/unit/tools/queue-mirror-github.test.ts` | created this task | ⬜ pending |
| 04-05-T1 | 04-05 | 3 | QUEUE-02 | — | Pure, deterministic, non-mutating comparator — no security-relevant surface | unit (tdd) | `npx vitest run test/unit/tools/queue-priority.test.ts` | created this task | ⬜ pending |
| 04-05-T2 | 04-05 | 3 | QUEUE-02 | T-04-05-01 | writeFileAtomic for the dashboard write; deterministic renderDashboard output | unit | `npx vitest run test/unit/tools/queue-dashboard.test.ts` | created this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave-0 gaps RESEARCH.md identified (missing test scaffolding/files that would otherwise block verification) are closed as the first task of their owning plan, not deferred to a separate Wave-0 plan — each `<verify><automated>` command below references a file created in that SAME task, so no task ever asserts against a not-yet-existing file:

- [x] `test/fixtures/fix-queue.json` + typed loader `test/fixtures/fix-queue.ts` — created in 04-01 Task 1.
- [x] `test/unit/fixtures/fix-queue.test.ts` (schema/loader test — PATTERNS.md places this beside the loader itself, under `test/unit/fixtures/`, not a new `test/unit/queue/`) — created in 04-01 Task 1, extended in 04-03 Task 2.
- [x] `test/unit/tools/queue-intake.test.ts` — created in 04-01 Task 2 (PATTERNS.md correction: flat `test/unit/tools/queue-*.test.ts`, not `test/unit/queue/intake.test.ts`).
- [x] `test/unit/tools/queue-priority.test.ts` — created in 04-05 Task 1.
- [x] `test/unit/tools/queue-dashboard.test.ts` — created in 04-05 Task 2.
- [x] `test/unit/tools/queue-mirror-github.test.ts` — created in 04-04 Task 2 (mocked/dry-run only, no live `gh`).
- [x] No new test framework/config needed — `vitest.config.ts`'s existing `include` glob (`test/unit/**/*.test.ts`) already covers every new file above with zero config changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actually publishing/reconciling GitHub issues #64/#61 via `scripts/queue/mirror-github.mjs --execute` | QUEUE-04 | Explicitly out of this phase's autonomous scope (RESEARCH.md Open Question 2's resolution) — a real `gh issue create/edit` call is a public, live side effect on a repo the maintainer owns; Phase 4 ships the dry-run-default mechanism only. No automated/CI run may ever pass `--execute`. | Maintainer runs `npx tsx scripts/queue/mirror-github.mjs --execute` by hand, post-merge, as a human-supervised smoke test — never inside this phase's own verification loop. |
| Re-verifying the 8 `needsReverify: true` CHG UX-report specs against current `main` | QUEUE-01 (D-05) | Requires driving the real MCP server against live Agda fixtures per spec (RT1-RT8), which is dogfooding-corpus work reserved for Phase 5's orchestrator, not Phase-4 plumbing. | Triage action performed from inside the queue post-Phase-4, per D-05: flip `needsReverify` to `false` and adjust `status`/`defectKind` once a spec is confirmed reproduced or rejected (`cannot-reproduce`/`fixed-already`). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] QUEUE-04 gh-mirror tests are dry-run/mocked (no live GitHub calls in CI/autonomous runs)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planning complete — filled during `/gsd:plan-phase` for Phase 4 (2026-07-02).
