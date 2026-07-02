# Agda MCP Server — Self-Improvement Loop

## What This Is

`agda-mcp-server` is a TypeScript MCP server that drives a long-lived `agda --interaction-json` subprocess, exposing interactive theorem-proving capabilities (load/typecheck, goals, case-split/give/refine/auto, compute/infer, search, backend compile, proof-edits) to AI coding agents like Codex and Claude Code.

This milestone is about **making the server more complete by establishing Loop ② — a reproducible, self-reinforcing improvement loop.** AI agents dogfood the server on real Agda proofs; the bugs and feature gaps that surface get systematically captured into structured reports and regression tests, then flow into a fix queue and get locked in. The process of hardening the server becomes a repeatable, accumulating loop rather than scattered one-off patches.

## Core Value

Turn the act of improving this server into a reproducible, compounding loop: **every real proof session reliably converts into a stronger server.** If everything else is deferred, this closed loop — use it → surface a defect → capture it → fix and lock it with a regression test → use it again — must work.

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

### Active

<!-- This milestone (v1): the reproducible scaffold for Loop ②. Hypotheses until shipped. -->

- [ ] A reproducible dogfooding workflow to run real Agda proofs through the MCP (fuel: agda-stdlib / open-source projects, my own math project, agent-generated ad-hoc proofs)
- [ ] Streamlined, near-one-click capture of a stuck/failed proof session into a structured bug/gap report (building on `bug-report.ts`)
- [ ] Convert a captured failure into a regression test case that reproduces the defect
- [ ] A triage/fix queue that captured issues flow into
- [ ] Continuous feature completion + bug fixing driven by what the loop surfaces
- [ ] Engineering-quality hardening (regression coverage that locks fixes in place)

### Out of Scope

<!-- Deferred to v2+ or deliberately excluded this version. -->

- Knowledge accumulation system (learned corpus of sessions/patterns) — v2+; v1 stops at the reproducible scaffold
- Automatic loop / automatic (or semi-automatic) PR generation — v2+; requires the scaffold to exist first
- Loop ① productization (turn-based, server-side proof guidance) — north-star direction, needs further exploration; deferred
- Large-scale adoption of advanced MCP protocol features (resources / prompts / sampling / elicitation) — mostly serves the deferred Loop ①
- A curated proof benchmark suite — fuel is deliberately organic (real usage), not a "test for the sake of testing" set

## Context

- Mature brownfield codebase, fully mapped in `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS).
- Two-loop vision surfaced during questioning:
  - **Loop ① (product, deferred):** server gives turn-based guidance ("you have 3 goals, goal 0 is X, suggested next: case-split on n / refine with …") and the agent follows it.
  - **Loop ② (process, this milestone):** dogfood → surface bug/gap → capture as report + regression test → fix queue → harden → repeat.
- The two loops feed each other: running Loop ① is itself fuel for Loop ②. This milestone builds Loop ②'s foundation first.
- **Motivating experiment (the concrete origin of Loop ②):** this server was built for / stressed by autoformalizing the **Hopf fibration / π₃(S²)** in **agda-unimath** with **Codex driving the MCP** (the Lean FRO challenge; goal = library-quality contributions, not flag-planting). The Phase-2 oracle triad (ORCL-02/03) is grounded in *observed* agent behavior there — Codex narrowed scope, took shortcuts, and flag-planted — not just theory. agda-unimath (the Hopf work) is the PROC-02 fuel corpus; the canonical difficulty was **join associativity** (codex interrupted twice → human rocq-hott pivot). Paper outline: private repo `emilyriehl/autoformalizing-hopf` (access-gated). A sibling private corpus, `emilyriehl/Codex-Homotopy-Group` (π₃(S²)=ℤ), **directly dogfoods this server** and measured the false-green ORCL-01 targets — see `.planning/research/ORACLE-VALIDITY.md`.
- Bug-finding is treated as ongoing first-class work by the maintainer, not an afterthought.
- Existing seeds to build on: `src/reporting/bug-report.ts` (capture entry point), `src/session/tool-recommendation.ts` + session-status (future Loop ① seed).

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
| Prioritize Loop ② (self-improvement) over Loop ① (guidance) this milestone | Loop ① needs more exploration; a hardening loop compounds value and is the prerequisite substrate | — Pending |
| Scope v1 to the "reproducible scaffold" | Get the capture→fix→lock loop working before layering knowledge accumulation / automation on top | — Pending |
| Organic fuel sources (stdlib/open projects + own math project + agent-generated), no curated benchmark set | Real usage surfaces real defects; curated benchmarks risk "testing for the sake of testing" | — Pending |
| Build on existing `bug-report.ts` as the capture entry point | Structured bundle + fingerprints already exist; extend rather than rebuild | — Pending |

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
*Last updated: 2026-07-02 — Phase 2 (Oracle Triad) complete: ORCL-01/02/03 shipped as `scripts/oracle/*.mjs` (server-faithfulness differential + soundness-hygiene scan + conformance proxy); a capture is "true green" only when ORCL-01 passes AND ORCL-02 is clean, ORCL-03 advisory. Phase 3 (Regression Lock Pipeline) is next.*
