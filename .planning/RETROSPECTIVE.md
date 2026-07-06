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

## Milestone: v1.1 — Feed the Loop

**Shipped:** 2026-07-05
**Phases:** 4 (6–9) | **Plans:** 24 | **Timeline:** ~2 days (2026-07-03 → 2026-07-05), single autonomous `/gsd-autonomous` run spanning multiple context windows

### What Was Built
- Backlog digested to zero stalled entries: all 8 `needsReverify` CHG defects re-verified live to definitive verdicts; 8 confirmed defects locked with from-RED regressions; POLICY-01 case-exact loud-fail policy resolution closed v1.0's W2 headline debt.
- Team feedback channel, local-first then cluster: hash-only revocable Bearer keys, fail-open upload with bounded retry queue, streamed-cap ingest endpoint, two-layer-sandboxed unattended cron judge — one code path for both environments.
- E2E-01 at its strongest form: a live Codex session on the pinned CHG corpus surfaced a real defect (`0bc76d15c2fec8df`) that flowed capture → upload → ingest → judge → queue → fix → lock, zero fixture shortcuts.
- Thin k8s deployment on the JHU IDIES cluster: digest-pinned 2-stage image (cabal-built Agda 2.8.0), auto-deploy-on-main CI/CD with a D-10 uncredentialed-build proof job, live public healthz, daily cron judge on the Ceph PVC, POLICY-01 re-proven 6/6 in-pod.
- Pinned-environment onboarding (git install, latest-tag pin, no npm) with a genuinely-executed fresh-teammate walkthrough test; v1.0's whole P2 debt list swept.

### What Worked
- **Local-first, cluster-as-thin-step paid off exactly as designed** — the cluster leg reused Phase 7's scripts verbatim (config-only differences), so 4 of the 6 deploy plans were pure packaging; the integration audit found zero cluster-only code forks.
- **The 4-attempt first deploy was the loop's own philosophy applied to ops**: each failed attempt surfaced a distinct real defect (false-green remote-clone deploy, shared-pull-secret 403, SSH idle-timeout, D-10 asserts grepping swallowed output, stdio-CMD CrashLoop, PVC subPath ACL ownership, quota-on-init, PSA-forbids-root) — all captured into the deploy skill + runbook as durable lessons, not tribal memory.
- **Direct kubectl apply for fix validation before pushing** shortened the debug cycle from ~30-min CI rebuilds to ~2-min cluster round-trips; push only after live-validated.
- **The review chain's capped 3-iteration loop earned its budget again**: 1 Critical + 11 Warnings found → all fixed → re-review verified all 12 AND caught a genuine regression the fixes introduced (WR-12 SSH-origin clobber) → final pass fixed it with cohort regression tests.
- **Checkpoint-handoff discipline across context windows** (.continue-here.md with exact run IDs, postmortems, pending user actions) made the multi-window autonomous run resumable with near-zero re-derivation.

### What Was Inefficient
- **The installer's false-green (CR-01) shipped in the v1.1 tag** — the review chain ran after the tag was cut, so the fix lives only in later commits and the latest-tag-pinning installer serves the pre-fix tree until v1.1.1 is tagged. Lesson: run the review chain BEFORE cutting a distribution-pinned tag, or treat the tag as the review gate's output.
- **Plan-spec impossibilities discovered only at execution**: the fine-grained-PAT spec (T-08-15) is platform-impossible for cross-owner private repos, and litellm's `gh auth token` pull-secret recipe can't read our package — both cost a blocked round-trip with the user. Verify credential-model assumptions during planning research, not first deploy.
- **The D-10 job's original asserts grepped for output that could never appear** (git's "Cloning into" swallowed by `stdio:"pipe"`) — an assertion written against imagined rather than observed output; it masked nothing but stayed red across two runs.
- Deploy defects clustered in the "never exercised until now" seams (fresh-teammate path, exists-branch re-runs, first PVC write) — exactly where the phase's own live acceptance couldn't reach; the review chain was the right backstop there.

### Patterns Established
- **Dedicated per-app cluster credentials** (`agda-mcp-ghcr`): never share/overwrite another app's secret — verified mutual 403s make the blast radius concrete.
- **Every k8s workload on a stdio-server image must override `command:`** — image CMD is a footgun when the default entrypoint is an MCP stdio server.
- **`pvc-dirs` initContainer pattern** for ACL-enabled CephFS under restricted PSA: pre-create uid-owned trees before subPath resolution; any new subPath goes under a pre-created parent.
- **Assert a script's own observable contract, not its subprocesses' output** (D-10 job greps the clone script's summary lines, not git's).
- **Ops lessons land in the skill file the moment they're learned** — the deploy skill's "First-deploy lessons" section was written mid-incident, so the next session (or agent) can't re-lose them.

### Key Lessons
1. A distribution tag is a release gate: everything the installer will serve must be inside the tag, so the review/fix chain belongs before the tag, not after.
2. Live acceptance proves the happy path; adversarial review finds the paths acceptance can't reach (fresh machines, re-runs, interrupted states). Both are load-bearing; neither substitutes for the other.
3. Cluster admission surfaces (PSA, ResourceQuota-on-init, ACL masks vs fsGroup) fail at pod-create time with evidence only in `describe rs/job` events — a stalled `rollout status` is the symptom, never the diagnosis.
4. Fixes can regress cohorts the original bug never touched (WR-12: hardening for token hygiene broke SSH-auth teammates) — re-review after fixing is not optional ceremony.

### Cost Observations
- Model mix: fable orchestrator + per-agent-config executors/reviewers/verifier (profile `quality`).
- The Phase-8 endgame (review → fix → re-review → WR-12 fix → verify → integration audit) used 6 subagents ≈ 900k subagent tokens; it converted 1 Critical + 12 Warnings into fixes with tests and caught 1 fix-introduced regression — again roughly the cost of one deploy-cycle's debugging, for strictly higher-confidence output.
- Notable: background `gh run watch` + cache-aware sleep intervals kept the ~30-min deploy cycles from blocking foreground orchestration.

---

## Milestone: v1.2 — Upstream Reconcile

**Shipped:** 2026-07-06
**Phases:** 2 shipped (10 Upstream Reconcile, 12 Simplification Overhaul) + 1 deferred (11 Auto-Sync) | **Plans:** 17

### What Was Built
- **Phase 10:** a real `git merge upstream/main` (v0.6.8, 5 commits, head `d4497a2`) with all 6 conflict files resolved; load-terminus semantics adjudicated sub-behavior-by-sub-behavior using our from-RED regression locks as the empirical referee (upstream's whole-file architecture adopted after passing all 3 referee tests); upstream #70 (`agda_goal_candidates`/Mimer) adopted; full acceptance (real-Agda suite + real Codex dogfood session + watched-green cluster deploy).
- **Phase 12:** a project-wide health-check loop — 5 parallel audits → consolidated 20-candidate severity-graded cut list → D-03 human sign-off → execution. 6 fork-only cuts landed (dedup a drifting guard, delete a dead script + 6 superseded research docs, repoint 2 citations, drop 1 stale line); 14 upstream-touching cuts deferred; zero `src/` change; full suite green.

### What Worked
- The **audit → sign-off → execute** shape kept a destructive "simplification" phase safe: nothing was cut until each item was individually approved, fail-closed on anything unmentioned. Two categories (tools, src) landed zero approvals and became clean documented no-ops.
- Using our own **from-RED regression locks as the empirical referee** for the upstream merge turned an ambiguous ours/theirs load-terminus decision into a test-driven one.
- **Deferring Phase 11 on measured evidence** (upstream velocity collapsed to ~0 new commits) rather than building automation nobody needed yet.

### What Was Inefficient
- The Phase 12 audits computed "upstream-overlap" too narrowly (guarded-file union only), flagging just 1 of 14 upstream-touching cuts; the user caught the rest at sign-off. The broader fork policy (already in PROJECT.md) should have been the classifier from the start.
- v1.2's scope kept counting Phase 11's SYNC requirements even after the phase was deferred; the scope-vs-requirements bookkeeping only got reconciled at milestone close (the audit surfaced it).

### Patterns Established
- **Fork-vs-upstream pre-classification:** before proposing any edit/deletion, test `git cat-file -e upstream/main:<path>`; default upstream-origin changes to deferred / candidate upstream PR (now a saved memory + a PROJECT.md constraint).
- **No-op-by-design plans:** a back-half plan whose category got zero approvals writes a documented no-op SUMMARY rather than being skipped — keeps the fail-closed sign-off auditable end-to-end.

### Key Lessons
- A "simplification" phase in a fork is mostly a **scoping** problem, not a **cutting** problem: the hard part is deciding what you're allowed to touch. Classify by ownership first, then propose cuts.
- **Run the milestone audit before archiving** even when every phase is individually verified — it caught the SYNC scope/requirements drift that per-phase verification structurally couldn't see.

### Cost Observations
- Model mix: Opus orchestrator + Sonnet executors/verifier (config `quality` profile).
- Phase 12 ran 6 waves with worktree-isolated parallel executors; the Wave-1 fan-out (5 concurrent audits) was the biggest parallel burst.

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Verification | Notable process change |
|-----------|--------|-------|----------|--------------|------------------------|
| v1.0 | 6 | 26 | ~2 days | 6/6 passed; audit tech_debt (19/19 reqs) | First milestone; established capture→judge→file→fix→lock loop and MVP+wave-parallel execution |
| v1.1 | 4 | 24 | ~2 days | 4/4 passed; audit tech_debt (17/17 reqs, 5/5 seams) | Single autonomous run across context windows with checkpoint handoffs; live-cluster debugging via direct kubectl before push; integration-checker added at milestone audit |

### Recurring Themes

- False-green elimination is the project's center of gravity — it shaped the oracle design, the regression-test philosophy, the flake gate, and now the deploy pipeline itself (attempt 1's false-green deploy job, the D-10 assert rewrite, CR-01's installer false-green). Watch that new features keep passing through that lens.
- Artifact hygiene (summaries' frontmatter, verification statuses, superseded plans) drifts under autonomous execution; the milestone audit is the backstop — consider tightening per-phase closeout instead.
- Both milestones' review chains found real defects the execution-time acceptance could not reach, and both needed the re-review pass to catch a fix-introduced regression. The 3-iteration capped loop is earning permanent-fixture status.
- Sequencing debt: v1.0 left gap plans dangling until audit; v1.1 cut its distribution tag before the review chain. Same shape — a closeout artifact produced before the last quality gate ran. Next milestone: order the gates explicitly in the phase plan.
