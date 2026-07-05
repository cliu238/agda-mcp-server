# Agda MCP Server — Self-Improvement Loop

## What This Is

`agda-mcp-server` is a TypeScript MCP server that drives a long-lived `agda --interaction-json` subprocess, exposing interactive theorem-proving capabilities (load/typecheck, goals, case-split/give/refine/auto, compute/infer, search, backend compile, proof-edits) to AI coding agents like Codex and Claude Code.

v1.0 established Loop ② — the reproducible improvement loop (use → capture → judge → file → fix → lock → re-use). v1.1 (**Feed the Loop**, shipped 2026-07-05) fed it for real: the CHG defect backlog was digested to zero stalled entries, a team feedback channel now flows colleagues' proof sessions into the fix queue (proven live end-to-end locally AND through the deployed JHU cluster endpoint), teammates onboard via a pinned-environment git install, and v1.0's residual debt is swept.

## Core Value

Turn the act of improving this server into a reproducible, compounding loop: **every real proof session reliably converts into a stronger server.** If everything else is deferred, this closed loop — use it → surface a defect → capture it → fix and lock it with a regression test → use it again — must work.

## Current State (post-v1.1, 2026-07-05)

**Shipped:** v1.1 Feed the Loop — 4 phases (6–9), 24 plans, 17/17 requirements; tags `v1.0`, `v1.1` pushed.

- **Loop ② proven at its strongest form:** a live Codex session on the pinned CHG corpus surfaced defect `0bc76d15c2fec8df`, which was captured → judged → filed → fixed → locked with a from-RED regression test (E2E-01, zero fixture shortcuts).
- **Team channel live:** `issue-key.mjs` (hash-only registry, revocable Bearer keys) → fail-open `upload-run.mjs` → `ingest-server.mjs` (512 MiB streamed cap) → sandboxed `cron-ingest-wrapup.mjs` judging into the fix queue. Runs identically local and on-cluster (config-only differences).
- **Cluster deployment live:** `https://dev.sites.idies.jhu.edu/agda-mcp/healthz` → `ok`; auto-deploy-on-main CI/CD (GHCR image: digest-pinned 2-stage build, cabal-built Agda 2.8.0, 4 baked corpus clones); daily cron judge on the Ceph PVC; POLICY-01 re-proven 6/6 inside the deployed pod. Operations runbook: `docs/DEPLOY-OPERATIONS.md`; cluster lessons: `.claude/skills/agda-mcp-k8s-deploy/SKILL.md`.
- **Onboarding:** `docs/TEAM-ONBOARDING.md` — zero-to-uploading via git install pinning the latest `v*` tag; no npm account anywhere.
- **Fix queue:** 18 entries — 10 locked, 6 triaged (incl. 2 explicitly deferred-with-reason large-redesign items), 1 rejected, 1 new-ish; zero `needsReverify`. CI: verify job green incl. `typecheck:test` gate; integration lane carries the pre-existing 5-file Linux quarantine (`fb57abbe7df6dfe8`).
- **Known debt:** enumerated in `milestones/v1.1-MILESTONE-AUDIT.md` frontmatter (14 Info-grade review findings open by policy, cluster cron filing leg not yet exercised with a capture-bearing archive, image runtime's comment-enforced dependency on `test/`+devDeps, Nyquist VALIDATION.md missing ×4).

## Current Milestone: v1.2 Upstream Reconcile

**Goal:** Merge upstream v0.6.8 for real (load-terminus semantics adjudicated per sub-behavior with our from-RED regression locks as referee), adopt upstream's new features, then productionize the unattended every-3-days auto-sync — so upstream divergence stops accumulating.

**Target features:**
- **One-time upstream reconcile:** `git merge upstream/main` (merge, never rebase) resolving the 6 conflict files (re-measured 2026-07-05: 502 ahead / 5 behind, upstream head `d4497a2`, conflict set unchanged from `.planning/research/UPSTREAM-SYNC.md`); reconcile upstream's new fail-suite-on-unexpected-`logger.warn` test strictness with our ~1600-test suite; load-terminus semantic adjudication ours/theirs/hybrid per sub-behavior (from-RED locks green → adopt upstream, red → keep ours + graft their fatal-stderr/inactivity-timeout hardening); adopt upstream #70 (`agda_goal_candidates` type-directed term search, Mimer auto fix) wired into manifest/tool-recommendation/docs; full verify (real-Agda full suite, `typecheck:test`, build) + one dogfood session as acceptance; final push = one accepted D-06 deploy cycle, watched green.
- **Auto-sync productionization:** launchd every-3-days local headless carrier (catches up missed runs on wake) executing the shipped `.agents/skills/upstream-sync` skill (real-Agda full gates — strictly stronger than cloud); sync bookkeeping upgraded to GSD-native artifacts (each sync produces a real `.planning/quick/` PLAN+SUMMARY + STATE.md row, committed with the merge; `docs/UPSTREAM-SYNC-LOG.md` fallback when gsd-sdk absent); optional scheduled GitHub Action merge-tree dry-run digest as a zero-risk signal between syncs; cloud-routine carrier stays parked behind the recorded org GitHub-sync re-arm path.

**Standing candidates deliberately NOT in v1.2** (scope decision 2026-07-05): RT6 (five-state load conflation) and RT7 (timeout diagnostics) are re-evaluated only after the merge lands — upstream #68/#69 reshape the same seam; CACHE-04 oracle prewarm (unchanged trigger), Loop ① exploration, npm publishing (PUB-01), external-user issue template (FEED-01), and the v1.1 audit tech-debt ledger stay standing. Independent small items run ad hoc via `/gsd-quick`.

## Requirements

### Validated

<!-- Inferred from existing mature codebase (.planning/codebase/). These already work. -->

- ✓ Long-lived Agda subprocess management with serialized command queue (`AgdaSession` SSOT) — existing
- ✓ Load / typecheck / reload orchestration (single `session.load()` path, issue #39 invariant) — existing
- ✓ Goal operations: goal type/context, case-split, give, refine, auto, solve — existing
- ✓ Expression operations: compute, infer, elaborate — existing
- ✓ Advanced queries: constraints, scope, search-about — existing
- ✓ Backend / compile operations — existing
- ✓ Proof-edit appliers (goal/text/batch edits, atomic writes, path sandboxing) — existing
- ✓ Project config (`.agda-mcp.json`) + env-flag merging with caching — existing
- ✓ Uniform structured `ToolResult` envelopes with severity-tagged diagnostics + `nextAction` recovery hints — existing
- ✓ Structured bug-report bundles with fingerprints (`src/reporting/bug-report.ts`) — existing seed for Loop ②
- ✓ Tool recommendation + session-status (`src/session/tool-recommendation.ts`) — existing seed for Loop ①
- ✓ Literate-Agda extraction, extension loading, Zod-validated tool boundary — existing
- ✓ Reproducible dogfooding workflow over MCP stdio — validated in Phase 5 (`dogfood-run.mjs` recording proxy, `agda-dogfooding` Agent Skill runbook, pinned 4-corpus fuel manifest, wrap-up pipeline with N-rerun anti-phantom flake gate)
- ✓ Near-one-click capture of a stuck/failed session into a structured report — validated in Phase 1 (capture verb + self-replaying capture artifact + replay manifest)
- ✓ Captured failure → regression test that reproduces the defect — validated in Phase 3 (lock-in pipeline; #64/#61 false-green locked from RED end-to-end)
- ✓ Triage/fix queue with durable backpressure — validated in Phase 4 (zod-validated flat-file queue, QUEUE-02 priority, dashboard, capture-time triage)
- ✓ Loop-driven bug fixing demonstrated — validated in Phase 03.1 (flagship transitive-staleness false-green fixed from the queue) and made repeatable by Phases 4–5
- ✓ Engineering-quality hardening — validated in Phases 2–3 (oracle triad ground truth; durable regression tests assert correct results, never golden-master a false-green)

- ✓ Backlog digestion: all 8 `needsReverify` specs re-verified to definitive verdicts (4 fixed+locked from RED, 2 deferred-with-reason, RT1 unreproducible); ORCL-02 policy passthrough case-exact + loud-fail — v1.1
- ✓ Team feedback channel: revocable hash-only Bearer keys + consent, fail-open upload with bounded retry queue, streamed-cap ingest endpoint, sandboxed unattended cron judging into the fix queue — v1.1
- ✓ End-to-end validation (E2E-01): live CHG session through the complete loop, zero fixture shortcuts, real defect captured→fixed→locked — v1.1
- ✓ Pinned-environment distribution (git install, latest-tag pin, no npm) + thin k8s deployment (live cluster ingest + cron judge, POLICY-01 re-proven in-pod) — v1.1
- ✓ Residual v1.0 debt sweep: all P2 items resolved (deleted / fixed / explicitly recorded) — v1.1

### Active

<!-- v1.2 Upstream Reconcile. Detailed REQ-IDs in REQUIREMENTS.md. -->

- [ ] Upstream v0.6.8 merged (merge, never rebase) with all 6 conflict files resolved and both repos' regression suites green
- [ ] Load-terminus semantics adjudicated per sub-behavior, from-RED locks as referee
- [ ] Upstream #70 features (`agda_goal_candidates`, term search, Mimer auto fix) adopted and wired into manifest/tool-recommendation/docs
- [ ] Post-merge acceptance: full verify + one real dogfood session; final push's auto-deploy watched green
- [ ] Recurring auto-sync live: launchd headless carrier executes the `upstream-sync` skill every 3 days
- [ ] GSD-native sync bookkeeping: each sync commits a `.planning/quick/` artifact + STATE.md row

### Out of Scope

<!-- Deferred to v2+ or deliberately excluded this version. -->

- Knowledge accumulation system (learned corpus of sessions/patterns) — v2+; v1 stops at the reproducible scaffold
- Automatic loop / automatic (or semi-automatic) PR generation — v2+; requires the scaffold to exist first
- Loop ① productization (turn-based, server-side proof guidance) — north-star direction, needs further exploration; deferred
- Large-scale adoption of advanced MCP protocol features (resources / prompts / sampling / elicitation) — mostly serves the deferred Loop ①
- A curated proof benchmark suite — fuel is deliberately organic (real usage), not a "test for the sake of testing" set
- npm publishing (PUB-01), external-user GitHub issue template (FEED-01), v1.0 tag push — standalone items deliberately kept outside v1.1; run ad hoc via `/gsd-quick` when wanted
- Remote-hosting the MCP server / shared dev host as the primary answer — rejected for the cache goal (agent-local file divergence, #39 single-session invariant, would recreate the staleness false-green class); prebuilt cache distribution chosen instead
- The entire prebuilt-cache theme (CACHE: build script, image prebake, cluster build job, any distribution channel) — deleted from v1.1 by consumer audit 2026-07-03 (zero users: oracle forbidden from caches by design, server needs source clones only, Agda's own `_build` covers local use); v2 anchored on the oracle-prewarm item (CACHE-04) with a recorded trigger; the public channel additionally stays trust-critical (`.agdai` unconditionally trusted by Agda)

## Context

- Mature brownfield codebase, fully mapped in `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS).
- Two-loop vision surfaced during questioning:
  - **Loop ① (product, deferred):** server gives turn-based guidance ("you have 3 goals, goal 0 is X, suggested next: case-split on n / refine with …") and the agent follows it.
  - **Loop ② (process, this milestone):** dogfood → surface bug/gap → capture as report + regression test → fix queue → harden → repeat.
- The two loops feed each other: running Loop ① is itself fuel for Loop ②. This milestone builds Loop ②'s foundation first.
- **Motivating experiment (the concrete origin of Loop ②):** this server was built for / stressed by autoformalizing the **Hopf fibration / π₃(S²)** in **agda-unimath** with **Codex driving the MCP** (the Lean FRO challenge; goal = library-quality contributions, not flag-planting). The Phase-2 oracle triad (ORCL-02/03) is grounded in *observed* agent behavior there — Codex narrowed scope, took shortcuts, and flag-planted — not just theory. agda-unimath (the Hopf work) is the PROC-02 fuel corpus; the canonical difficulty was **join associativity** (codex interrupted twice → human rocq-hott pivot). Paper outline: private repo `emilyriehl/autoformalizing-hopf` (access-gated). A sibling private corpus, `emilyriehl/Codex-Homotopy-Group` (π₃(S²)=ℤ), **directly dogfoods this server** and measured the false-green ORCL-01 targets — see `.planning/research/ORACLE-VALIDITY.md`.
- Bug-finding is treated as ongoing first-class work by the maintainer, not an afterthought.
- Existing seeds to build on: `src/reporting/bug-report.ts` (capture entry point), `src/session/tool-recommendation.ts` + session-status (future Loop ① seed).
- **Shipped v1.0 (2026-07-03):** Loop ② scaffold end-to-end — 6 phases, 26 plans, ~34k lines added since milestone start; only two surgical `src/` additions (session-capture model + emit-only capture tool), everything else in `scripts/` + repo data dirs; full suite 1583 tests green incl. real-Agda integration. Tech debt tracked in `milestones/v1.0-MILESTONE-AUDIT.md` (9 items, headline: ORCL-02 runtime policy passthrough W2). 8 CHG needs-reverify defects sit in the fix queue as next-milestone fuel.
- **v1.1 infrastructure timeline:** ingest/judging server = a JHU IDIES-style k8s environment arriving ~2026-07-07; local-Mac-first until then (nginx-ingress path apps, Ceph PVC storage, GHCR + GitHub Actions CI/CD over SSH jump — see litellm-k8s-deploy skill). Autonomous-run readiness verified 2026-07-03: gh authed as cliu238 with WRITE on both `emilyriehl` private corpora; local CHG clone at `~/projects6/Codex-Homotopy-Group`; agda-stdlib / agda-unimath / hopf cloneable on demand per `scripts/data/fuel-corpora.json`; Agda 2.8.0 via nix; 215GB disk free; npm deliberately not required anywhere.
- **Shipped v1.1 (2026-07-05):** the loop fed for real — 4 phases (6–9), 24 plans, ~25k lines changed across 202 commits in ~30h wall clock; the deployed cluster runs Phase 7's local scripts verbatim (config-only differences); the v1.1 milestone ran as a single autonomous `/gsd-autonomous` session spanning multiple context windows. Tech debt tracked in `milestones/v1.1-MILESTONE-AUDIT.md`.

## Constraints

- **Tech stack**: TypeScript (ES2022, strict), Node.js >= 24, native ESM, `@modelcontextprotocol/sdk`, `zod` v4 — no database/HTTP server; the only external integration is the `agda` CLI binary.
- **Architecture**: Layered `protocol → agda → session → tools`; thin MCP tool adapters; domain logic stays out of `src/tools/*`.
- **Invariant**: Exactly one `AgdaSession` per server process (issue #39) — every load-family path routes through the singleton.
- **Invariant**: All IOTCM command strings built via `src/protocol/command-builder.ts` (SSOT) — no hand-built wire strings.
- **File size**: Hard 500-line-per-file ceiling in `src/`; oversized modules split into barrel + focused siblings.
- **Agda compatibility**: `minAgdaVersion 2.6.4.3`, `maxTestedAgdaVersion 2.9.0`.
- **Dogfooding agents**: Codex and Claude Code are the primary agents driving the loop; their integration ergonomics matter.
- **Testing**: `vitest` (unit / property / integration / examples); property-based tests via `@fast-check/vitest`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize Loop ② (self-improvement) over Loop ① (guidance) this milestone | Loop ① needs more exploration; a hardening loop compounds value and is the prerequisite substrate | ✓ Good — v1.0 shipped the full loop; first fix→lock cycle (03.1) proved it compounds |
| Scope v1 to the "reproducible scaffold" | Get the capture→fix→lock loop working before layering knowledge accumulation / automation on top | ✓ Good — scaffold complete; automation/knowledge layers remain cleanly deferred |
| Organic fuel sources (stdlib/open projects + own math project + agent-generated), no curated benchmark set | Real usage surfaces real defects; curated benchmarks risk "testing for the sake of testing" | ✓ Good — 4 pinned real corpora incl. the two Hopf/π₃(S²) repos that ground ORCL-02/03 |
| Build on existing `bug-report.ts` as the capture entry point | Structured bundle + fingerprints already exist; extend rather than rebuild | ✓ Good — fingerprint/dedup reused verbatim; capture tool stayed emit-only |

| Oracle = triad (differential + soundness scan + conformance proxy), never a single cold re-run | A fresh compile is sound for exactly one false-green family; agent cheats and wrong-statements need their own predicates | ✓ Good — v1.0; ORCL-01 abstains honestly, ORCL-02 cheat findings file unconditionally |
| N-times warm-replay anti-phantom gate before queue filing | Timing/idle phantoms (#65/#66 family) must never enter the queue as deterministic defects | ✓ Good — v1.0 (05-03); flaky routes to gitignored side-channel, frozen queue schema untouched |
| Runbook as cross-tool Agent Skill in tracked `.agents/skills/` | `.claude/`/`.codex/` are gitignored (Pitfall 1); Codex and Claude Code must both discover it | ✓ Good — v1.0 (05-04) with idempotent symlink installer |
| Ingest + judging on a JHU IDIES-style k8s server (arrives ~2026-07-07); everything local-Mac-first, k8s deploy as a thin late step | litellm-k8s-deploy pattern + 22 lessons directly reusable; an autonomous run must never block on not-yet-available infra (the server's second planned role — cache build machine — was deleted with the CACHE theme) | ✓ Good — v1.1; local-first meant the cluster step was genuinely thin (same scripts, config-only); 4-attempt first deploy surfaced 4 real defects, all captured in the skill/runbook |
| TEAM-03 ingest = HTTPS endpoint (not git inbox) | The same server hosts cache builds anyway; endpoint archives by person/date to PVC; matches the proven litellm ingress pattern | ✓ Good — v1.1; live at dev.sites.idies.jhu.edu/agda-mcp; real upload landed on the Ceph PVC through the public ingress |
| TEAM-04 distribution = git install; npm publishing stays out of scope | No npm account exists and interactive signup/2FA can't be automated mid-run; `npm install github:cliu238/agda-mcp-server#<tag>` achieves the same version pinning with zero new credentials | ✓ Good — v1.1; installer pins latest v* tag; fresh-teammate walkthrough test proves zero-to-uploading with no npm account |
| Deploy (v1.1): dedicated `agda-mcp-ghcr` pull secret; never reuse litellm's shared `ghcr-credentials` | The two credentials 403 on each other's packages (verified live both directions); overwriting the shared secret would break litellm | ✓ Good — v1.1 (08-04); rotation recipe in docs/DEPLOY-OPERATIONS.md |
| Deploy (v1.1): every k8s workload on this image must override `command:` | The image CMD is the MCP stdio server — it exits the instant pod stdin closes, producing a log-less CrashLoopBackOff | ✓ Good — v1.1 (08-04); ingest runs ingest-server.mjs, judge runs cron-ingest-wrapup.mjs explicitly |
| Deploy (v1.1): `pvc-dirs` initContainer pre-creates the uid-2231 PVC tree | kubelet root-creates missing subPath dirs and the CephFS ACL mask defeats fsGroup; PodSecurity restricted forbids root chown pods; quota requires explicit resources on init containers (all three verified live) | ✓ Good — v1.1 (08-05); any NEW subPath must live under a pvc-dirs-pre-created parent |
| Entire CACHE theme deleted from v1.1 (after first being reshaped to script+image the same day) | Owner-driven consumer audit, applied to the end: the oracle is forbidden from caches by design, the server/image needs only source clones, teammates already hold warm local `_build`s (Agda's own incremental cache), onboarding = one documented overnight build — every successively smaller form (Releases channel → image prebake → local script) failed the same "who consumes it" test; v2 anchored on CACHE-04 (oracle prewarm), triggered by TEAM-04's INCONCLUSIVE/timeout rate becoming the bottleneck | Decided (v1.1) |
| Server plan kept after an explicit no-server alternative was analyzed | GitHub-inbox + Mac-only judging was laid out (fewer moving parts, no day-4 gate); owner explicitly chose to use the JHU k8s server, accepting two runtime environments and the ~07-07 dependency — do not relitigate | Decided (v1.1) |
| DEBT-01: Delete scripts/verify-cold-replay.mjs (v1.0 audit W3) | Zero real importers (re-verified 2026-07 by repo-wide grep); functionally superseded by ORCL-01's materializeCaptureEnvironment, which already guards path traversal that verify-cold-replay.mjs's own CR-01 finding left unguarded | Decided (v1.1) — closes unexecuted plan 01-07 (CR-01/CR-02) as superseded-by-deletion |
| DEBT-02: Delete scripts/promote-capture.mjs and its dogfood-run.mjs call site (v1.0 audit W1) | Phase 4 repointed readDedupIndex() to test/fixtures/fix-queue.json, so nothing has read .agda-mcp/captures/index.json since; the write was calling out to a file with zero readers | Decided (v1.1) |
| D-09/DEBT-07: Defer `.planning/codebase/` refresh via `/gsd:map-codebase` to phase close (24 drifted structural elements, v1.0 audit) | `/gsd:map-codebase` is an orchestrator-level workflow (spawns dedicated STACK/ARCHITECTURE/CONVENTIONS/etc. mapping subagents) outside a single execute-phase task's scope; running it before the rest of Phase 9's code lands would capture an immediately-stale snapshot | Deferred (v1.1) — per D-09, run by the orchestrator/user via `/gsd:map-codebase` after all Phase 9 plans (09-01..09-06) merge, capturing Phases 6-9 in one non-immediately-stale pass |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-05 after starting milestone v1.2 Upstream Reconcile (scope: upstream merge + adjudication + auto-sync only; divergence re-measured same day).*