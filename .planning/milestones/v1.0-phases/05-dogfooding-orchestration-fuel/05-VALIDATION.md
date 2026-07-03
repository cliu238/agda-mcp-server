---
phase: 5
slug: dogfooding-orchestration-fuel
status: planned
nyquist_compliant: true
wave_0_complete: true
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
| **Estimated runtime** | ~60s pure unit; the orchestrator/N-times gate is tested via small fixtures + a mocked/injected harness (NOT a multi-week live-corpus run); real-Agda cases are `RUN_AGDA_INTEGRATION=1`-gated |

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
| 05-01-T1 | 05-01 | 1 | PROC-02 | T-05-01-01 | fuel-corpora.json + 3 policy siblings validate via zod; every policyKey resolves via unchanged loadOraclePolicy() | unit | `npx vitest run test/unit/fixtures/fuel-corpora.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-01-T2 | 05-01 | 1 | PROC-01 | T-05-01-02, T-05-01-03 | loadTaskManifest() mechanically refuses an undefined path / invalid JSON / empty array; accepts a valid non-empty manifest | unit | `npx vitest run test/unit/tools/dogfood-task-manifest.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-02-T1 | 05-02 | 2 | PROC-01 | T-05-02-03 | End-to-end proxy passthrough + auto-persist (written first as a failing RED test) | integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/dogfood-proxy-passthrough.test.ts` | ❌ Wave 0 | ⬜ pending (expected RED until 05-02-T3) |
| 05-02-T2 | 05-02 | 2 | PROC-01 | T-05-02-03 | Transcript append + JSON-RPC line detection + run-report JSON/MD rendering; never imports AgdaSession | unit | `npx vitest run test/unit/tools/dogfood-transcript-writer.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-02-T3 | 05-02 | 2 | PROC-01 | T-05-02-01, T-05-02-02, T-05-02-04, T-05-02-05 | buildDogfoodChildOptions sets AGDA_MCP_CAPTURE=1 unconditionally + argv-array spawn; #39 source-text invariant; 05-02-T1 now GREEN | unit + integration | `npx vitest run test/unit/tools/dogfood-run-spawn-options.test.ts` (+ re-run 05-02-T1's command) | ❌ Wave 0 | ⬜ pending |
| 05-03-T1 | 05-03 | 3 | PROC-01 | — | classifyFlakiness gated on findWarmLoadTuple; N independent fresh sessions; faithful tool+args replay; never re-runs ORCL-02 | unit | `npx vitest run test/unit/tools/dogfood-flake-classify.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-03-T2 | 05-03 | 3 | PROC-01 | T-05-03-01, T-05-03-03, T-05-03-04 | wrapUpCapture files only an explicit candidate-defect signal (never a bare !trueGreen/INCONCLUSIVE); flaky routes to gitignored side-channel, never the tracked queue | unit | `npx vitest run test/unit/tools/dogfood-wrapup-filing.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-03-T3 | 05-03 | 3 | PROC-01 | T-05-03-02 | Real-Agda: the already-fixed flagship #64/#61 fixture N-reruns as deterministic (type-error x3) | integration (real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/dogfood-flake-classify-live.test.ts` | ❌ Wave 0 — underlying fixture already exists (Phase 3.1's `issue-64-61-transitive-staleness` matrix entry) | ⬜ pending |
| 05-04-T1 | 05-04 | 3 | PROC-01 | T-05-04-02 | SKILL.md is NOT gitignored (git check-ignore -v exits non-zero); content covers hard gate/capture verb/scaffold-hole/local-checkout caveat | unit / script-check | `npx vitest run test/unit/tools/dogfood-install-skill.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-04-T2 | 05-04 | 3 | PROC-01 | T-05-04-01 | installDogfoodSkill() idempotent create/no-op/never-overwrite-existing-non-symlink | unit | `npx vitest run test/unit/tools/dogfood-install-skill.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] No pre-existing infrastructure gap blocks Wave 1: `vitest`/`tsx`/`zod` are already installed (package.json), and every test file listed above is authored WITHIN the task that needs it (greenfield phase — there is no cross-plan test-framework setup this phase depends on). The `❌ Wave 0` marks in the table above mean "file does not exist before this phase," not "blocked on missing infrastructure."
- [x] `test/integration/mcp/dogfood-proxy-passthrough.test.ts` (05-02-T1) is DELIBERATELY written and committed in a failing (RED) state — this is the one task in this phase's set whose "Wave 0" status is an intentional TDD checkpoint, not an oversight; 05-02-T3 turns it GREEN.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The actual multi-week live-corpus dogfooding run against a real pinned fuel corpus (e.g. the first official run against `codex-homotopy-group` per D-02) | PROC-01, PROC-02 | Requires a private, access-gated `gh`-cloned repo, real multi-hour Agda compute budgets, and an interactive maintainer-driven Codex/Claude Code session — not reproducible in CI or a fast local suite, and explicitly out of scope for `/gsd:verify-work` per this phase's own CONTEXT.md scope fence (on-demand, not a daemon) | Maintainer runs: `gh repo clone emilyriehl/Codex-Homotopy-Group` at the pinned `pinnedRef` from `scripts/data/fuel-corpora.json`; author a real task manifest with a genuine `expectedSignature`; launch `scripts/dogfood/dogfood-run.mjs --manifest <path> --corpus-root <path>` per the `.agents/skills/agda-dogfooding/SKILL.md` runbook; drive a real proving session with Codex or Claude Code; run `scripts/dogfood/dogfood-wrapup.mjs <run-id>` afterward; inspect `wrapup-report.json` and, if any entry was filed, `test/fixtures/fix-queue.json`'s new `status: "new"` entry |
| Confirming Codex CLI's and Claude Code's OWN current Skill-discovery directories still match this plan's assumptions (`.agents/skills/` for Codex, `.claude/skills/` for Claude Code) | PROC-01 (D-07) | RESEARCH.md flags this as a fast-moving, externally-sourced finding (re-verify within ~7-14 days of research date if execution is delayed) — not something this repo's own test suite can assert against a third party's shifting documentation | Re-fetch `developers.openai.com/codex/skills` and `code.claude.com/docs/en/skills` if this phase's execution starts more than ~2 weeks after 2026-07-02; adjust `install-dogfood-skill.mjs`'s target directory if either tool's convention has changed |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task across all 4 plans carries its own `<verify><automated>`)
- [x] Wave 0 covers all MISSING references (every `❌ Wave 0` file is created by the very task it is listed under; 05-02-T1's intentional RED state is documented above)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`, throughout)
- [x] Orchestrator/N-times gate tested via fixtures+mock (no live-corpus dependency in CI) — `test/unit/tools/dogfood-flake-classify.test.ts` and `test/unit/tools/dogfood-wrapup-filing.test.ts` are fully dependency-injected; only `test/integration/mcp/dogfood-flake-classify-live.test.ts` touches real Agda, and it replays this repo's own tiny, already-existing `test/fixtures/agda/FixtureDeps/TransitiveStaleness/` fixture — never a real external corpus
- [x] Feedback latency < 120s (every unit test file is fast/no-Agda; the two `RUN_AGDA_INTEGRATION=1` integration tests are excluded from the default `npm test`/per-task sampling loop and run at the wave/phase gate instead)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (planning-time sign-off; execution-time re-validation happens per Phase-5's own `/gsd:execute-phase` sampling loop)
