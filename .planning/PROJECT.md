# Agda MCP Server — Self-Improvement Loop

## What This Is

`agda-mcp-server` is a TypeScript MCP server that drives a long-lived `agda --interaction-json` subprocess, exposing interactive theorem-proving capabilities (load/typecheck, goals, case-split/give/refine/auto, compute/infer, search, backend compile, proof-edits) to AI coding agents like Codex and Claude Code.

v1.0 established Loop ② — the reproducible improvement loop (use → capture → judge → file → fix → lock → re-use). This milestone (**v1.1 Feed the Loop**) is about feeding that loop for real: digest the backlog of captured-but-unverified defects, open a team feedback channel so colleagues' proof sessions flow into the queue, and sweep the residual v1.0 tech debt.

## Core Value

Turn the act of improving this server into a reproducible, compounding loop: **every real proof session reliably converts into a stronger server.** If everything else is deferred, this closed loop — use it → surface a defect → capture it → fix and lock it with a regression test → use it again — must work.

## Current Milestone: v1.1 Feed the Loop

**Goal:** Feed the shipped Loop ② pipeline its first real cargo and wire up its permanent fuel inlets — backlog re-verified through the pipeline, teammates' sessions uploaded and auto-judged — while sweeping v1.0's residual debt.

**Target features:**
- Digest existing cargo: re-verify the 8 `needsReverify` CHG defect specs through the shipped wrap-up pipeline (confirmed → fix flow; not reproducible → close); fix the ORCL-02 policy-passthrough silent mismatch (W2/POLICY-01)
- Team feedback channel: per-person revocable Bearer keys + written consent text; fail-open upload script (captures + runs + full agent logs); ~100-line HTTPS ingest endpoint archiving by person/date; unattended cron judging into the fix queue; pinned-environment distribution via git install (no npm)
- End-to-end validation (E2E-01): one fresh **live** dogfooding session on the pinned CHG corpus runs the complete loop with zero fixture shortcuts — dogfood-run → capture → upload → ingest → judge → queue (→ fix→lock if a defect is confirmed); acceptance is loop-to-verdict
- Residual debt sweep: the P2 list from `milestones/v1.0-MILESTONE-AUDIT.md`
- (The former third theme — prebuilt interface-cache distribution — was **deleted from v1.1 on 2026-07-03** by consumer audit: zero v1.1 users. The CACHE family lives in REQUIREMENTS.md's v2 section, anchored on the oracle-prewarm item with a recorded trigger.)

**Delivery constraint (autonomous-run readiness):** The ingest endpoint + cron judge deploy to a JHU IDIES-style k8s server (deployment pattern + 22 lessons: `~/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md`) arriving ~2026-07-07. Until then all work must run and verify on the local Mac (local endpoint mode); real k8s deployment is a thin late step. No new credentials are needed before the server arrives: gh is authed as cliu238 (WRITE on both private fuel corpora), Agda 2.8.0 via nix, npm is NOT needed (git install), teammate keys are issued by hand after the mechanism ships.

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

### Active

<!-- This milestone (v1.1 Feed the Loop): first real cargo + permanent fuel inlets. REQ-IDs assigned in REQUIREMENTS.md. -->

- Backlog digestion: 8 `needsReverify` specs re-verified through the shipped pipeline; ORCL-02 policy passthrough fixed (v1.1)
- Team feedback channel: consent + revocable keys, fail-open upload, HTTPS ingest + unattended judging, pinned-env distribution via git install (v1.1)
- End-to-end validation: one live CHG dogfood session through the complete loop, zero fixture shortcuts (v1.1)
- Residual v1.0 debt sweep per `milestones/v1.0-MILESTONE-AUDIT.md` (v1.1)

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
| Ingest + judging on a JHU IDIES-style k8s server (arrives ~2026-07-07); everything local-Mac-first, k8s deploy as a thin late step | litellm-k8s-deploy pattern + 22 lessons directly reusable; an autonomous run must never block on not-yet-available infra (the server's second planned role — cache build machine — was deleted with the CACHE theme) | Pending (v1.1) |
| TEAM-03 ingest = HTTPS endpoint (not git inbox) | The same server hosts cache builds anyway; endpoint archives by person/date to PVC; matches the proven litellm ingress pattern | Pending (v1.1) |
| TEAM-04 distribution = git install; npm publishing stays out of scope | No npm account exists and interactive signup/2FA can't be automated mid-run; `npm install github:cliu238/agda-mcp-server#<tag>` achieves the same version pinning with zero new credentials | Pending (v1.1) |
| Entire CACHE theme deleted from v1.1 (after first being reshaped to script+image the same day) | Owner-driven consumer audit, applied to the end: the oracle is forbidden from caches by design, the server/image needs only source clones, teammates already hold warm local `_build`s (Agda's own incremental cache), onboarding = one documented overnight build — every successively smaller form (Releases channel → image prebake → local script) failed the same "who consumes it" test; v2 anchored on CACHE-04 (oracle prewarm), triggered by TEAM-04's INCONCLUSIVE/timeout rate becoming the bottleneck | Decided (v1.1) |
| Server plan kept after an explicit no-server alternative was analyzed | GitHub-inbox + Mac-only judging was laid out (fewer moving parts, no day-4 gate); owner explicitly chose to use the JHU k8s server, accepting two runtime environments and the ~07-07 dependency — do not relitigate | Decided (v1.1) |

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
*Last updated: 2026-07-04 — Phase 6 (Backlog Digestion) complete: POLICY-01 loud-fail policy resolution shipped (case-sensitivity proven on case-sensitive APFS + ubuntu CI), all 8 RT specs definitively verdicted, fix-queue ledger closed at 9 locked / 5 DEFERRED-with-reason / 1 rejected, plus a 2-pass review-fix chain extending the Error-DisplayInfo rejection guard across all write-capable proof tools. Next: Phase 7 (Team Feedback Channel — local wiring).*