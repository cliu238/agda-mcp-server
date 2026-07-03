# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Self-Improvement Loop

**Shipped:** 2026-07-03
**Phases:** 6 (5 planned + 1 inserted) | **Plans:** 26 | **Timeline:** ~2 days (2026-07-01 → 2026-07-03)

### What Was Built
- One-verb session capture (`agda_capture_session`) producing self-replaying artifacts: full replay manifest, bounded action log, oracle substrate — emit-only, gitignored staging, sha256 dedup.
- The oracle triad: ORCL-01 cold `agda --interaction-json` differential (abstains honestly via INCONCLUSIVE probes), ORCL-02 transitive soundness-hygiene scan with per-corpus axiom/flag policy, ORCL-03 advisory signature-conformance proxy — composed by one CLI into a verdict sidecar.
- Regression lock pipeline: capture → refusal-gated emitter → from-RED `test.fails` regression → matrix entry; proven on the flagship #64/#61 transitive-staleness false-green, which Phase 03.1 then fixed (strict load-terminus guard) and flipped to `locked`.
- Durable fix queue (zod SSOT, priority comparator, dashboard, capture-time triage, dry-run GitHub mirror) seeded with 13 real defects.
- Dogfooding orchestration: pinned 4-corpus fuel manifest + task-manifest hard gate, transparent recording proxy over MCP stdio (#39-safe), wrap-up pipeline with N-times warm-replay anti-phantom flake gate, and the runbook shipped as a tracked cross-tool Agent Skill.

### What Worked
- **Oracle-triad grounding in real agent behavior** (Codex narrowing/flag-planting in the Hopf/π₃(S²) corpora) kept every predicate scoped to an observed failure mode — no speculative machinery.
- **Wave-parallel worktree execution** — the final wave ran 05-03 and 05-04 concurrently with zero file overlap and clean merges; post-merge full-suite gate caught nothing because plan-level `files_modified` frontmatter was honest.
- **Auto-fix chain with adversarial re-review converged in 2 passes** (13 Critical/Warning findings → clean), including catching a regression the first fix pass itself introduced (exit-0 on spawn failure).
- **Real-Agda integration proof at every layer** — each phase verified against a live Agda 2.8.0 binary, not mocks; the flagship fixture N-reruns deterministic post-fix, closing the loop with empirical evidence.
- Inserted decimal phase (03.1) cleanly absorbed the urgent flagship fix without derailing the numbered roadmap.

### What Was Inefficient
- **Phase 1's gap-closure plans (01-06/01-07) were authored but never executed**; their blocking content ended up landing via Phases 3–4 instead. The stale `gaps_found` VERIFICATION.md then had to be re-verified at milestone audit. Lesson: when a later phase absorbs a gap plan's scope, close out the artifact trail immediately (re-verify + supersede note) rather than leaving plans dangling.
- The 05-02 SUMMARY's one-liner field was malformed ("Task 1 (RED):"), which propagated into MILESTONES.md and had to be hand-fixed — summary frontmatter quality matters downstream.
- Code review ran only at phase end: the 2 Critical findings in 05-03 (rerun-count validation, replay-action mismatch) could have been caught by reviewing per-wave.
- `verify-cold-replay.mjs` (Phase 1 stopgap) was superseded by ORCL-01 but never retired — orphaned unguarded code left in-tree.

### Patterns Established
- **Never golden-master a false-green:** regression tests assert the *correct* result; a passing differential is necessary-but-insufficient (true green = 3 predicates agree).
- **Abstain honestly:** every environment probe gates to INCONCLUSIVE/skip rather than crying "server bug"; only deterministic, N-rerun-confirmed candidates auto-file.
- **Strict filing precedence:** ORCL-02 cheat findings file unconditionally (static scan has no timing dimension); flaky signal is preserved visibly in a side-channel, never discarded and never queue-polluting.
- **Loop-wraps-the-server:** improvement tooling lives in `scripts/` + data dirs; `src/` additions stay surgical (session-capture model + one tool), honoring the 500-line ceiling and #39 single-session invariant.
- Matrix-as-SSOT via zod + `loadValidatedJsonData` for every new data contract (fuel corpora, task manifest, fix queue, regression matrix).

### Key Lessons
1. A cold re-run is a sound oracle for exactly one false-green family — the two the field data makes first-class (agent soundness cheats, proved-the-wrong-statement) need their own predicates. Design oracles from observed failures, not symmetry.
2. Anti-phantom gating (N warm replays, same recorded action, same materialized environment) is what keeps a defect queue trustworthy; environment parity between the gate and the oracle that flagged the candidate is load-bearing (the W2/AGDA_DIR class of bug).
3. Multi-agent fix chains need re-review: the first fix pass fixed 10/10 findings and still introduced a new defect. Budget for at least one adversarial re-review iteration.
4. Milestone audits catch artifact drift (stale VERIFICATION status, orphaned plans, dead-ended writes like `captures/index.json`) that per-phase gates structurally cannot see — keep them.

### Cost Observations
- Model mix: fable orchestrator + sonnet executors/verifier/reviewers (per `model_profile: quality`).
- The final phase's execute→review→fix→verify chain used 7 subagents (~1.5M subagent tokens); the 2-pass fix loop was ~40% of that and paid for itself (2 empirically-reproduced Critical bugs in the anti-phantom gate itself).
- Notable: wave-parallel worktrees + honest `files_modified` frontmatter made merge cost effectively zero across all waves.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Verification | Notable process change |
|-----------|--------|-------|----------|--------------|------------------------|
| v1.0 | 6 | 26 | ~2 days | 6/6 passed; audit tech_debt (19/19 reqs) | First milestone; established capture→judge→file→fix→lock loop and MVP+wave-parallel execution |

### Recurring Themes

- False-green elimination is the project's center of gravity — it shaped the oracle design, the regression-test philosophy, and the flake gate. Watch that new features keep passing through that lens.
- Artifact hygiene (summaries' frontmatter, verification statuses, superseded plans) drifts under autonomous execution; the milestone audit is the backstop — consider tightening per-phase closeout instead.
