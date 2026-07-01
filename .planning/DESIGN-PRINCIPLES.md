# Design Principles — Context Engineering + Code Execution

**Adopted:** 2026-07-01. Derived from the verified MCP design philosophy (see `research/MCP-DESIGN-TRENDS.md`) and this server's code-verified state. These are the design lens plan-phase and execute-phase should apply to every tool and surface.

**The one idea:** an agent's context is a finite *attention budget* (accuracy rots as it fills). The server's job is to be **token-efficient and progressively-disclosable for an agent driving long proof sessions** — return high-signal references, let the agent drill in or run code, keep strategy and big intermediates out of the model's context.

---

## A. Context-engineering principles (token as a scarce resource)

**P1 — High-signal by default, drill-in on demand.**
Every tool returns the smallest actionable payload by default (a one-line `summary` + IDs/handles + counts); full detail is opt-in via a `response_format: concise|detailed` param or a follow-up call keyed by an ID.
*In this repo:* `ToolResult.summary` (≤200 char) already does this — extend the discipline to `data`. Goal ops return goal-ID + one-line type by default; `agda_goal_catalog`/`agda_session_snapshot`/type-dump tools default `concise`. (Aligns with the "response_format" now-item.)

**P2 — Return references, not payloads.**
Prefer stable handles — goal IDs, module names, capture fingerprints, fixture paths — over inlining large content; let the agent fetch by reference (just-in-time).
*In this repo:* already goal-ID-centric (#65/#66). The capture verb (CAP-03) is emit-only and returns a *reference*, not the full bundle in the tool result; regression fixtures are referenced by path (LOCK-01); queue entries key by fingerprint (QUEUE-01).

**P3 — Every result is a decision aid.**
Pair the payload with a machine-actionable `nextAction` so the agent can self-correct or continue without re-deriving. Error diagnostics MUST set one; a truncated result MUST embed a "how to get the rest" nextAction.
*In this repo:* `diagnostics/nextAction` already exists — make it a hard rule. Reinforced by spec convention SEP-1303 (input-validation errors = tool-execution errors, for model self-correction).

**P4 — Cap and steer, never dump.**
Bounded outputs with truncation that tells the agent how to narrow (by module / goal / range) — never silent truncation, never an unbounded dump.
*In this repo:* high-volume tools (goal catalog, session snapshot, typecheck output); if bloat is *measured* (P7), add progressive disclosure of the tool surface via the existing `agda_tools_catalog` + `agda_tool_recommend`, and audit tool descriptions for signal.

## B. Code-execution principles (the loop lives in code, not in round-trips)

**P5 — Compose in code, filter before the model.**
Offer surfaces where an agent or a script runs a multi-step operation and gets back a *filtered* result, instead of round-tripping every intermediate through the model. Big intermediates stay in the sandbox/script.
*In this repo:* `scripts/dogfood-run.mjs` (Loop 2) already IS the code-execution pattern — keep the oracle/orchestration in scripts, not per-step model calls. Loop 1 extension: a "try N candidate moves on this goal → return only the ones that typecheck + their new goals" surface (filter in code).

**P6 — Server emits data; strategy lives in a Skill.**
The server never reasons about *what to prove next* — it returns ranked candidates as DATA (`data` + `diagnostics.nextAction`); proof strategy and the dogfooding runbook are packaged as an **Agent Skill**, iterated independently of the server.
*In this repo:* matches the existing layering constraint (domain logic stays in its layer; tools stay thin) and the Loop-1 plan. PROC-01's runbook should ship as a Skill, not server-side `if/else`.

**P7 — Hybrid: keep atomic tools; measure before consolidating.**
Don't delete fine-grained tools (they give error-isolation and step-verification); add composed/coded surfaces *on top*, and consolidate common chains only when the Loop-2 eval shows the chain is hot. Token/turn budgets are measured, not assumed — the Loop-2 harness instruments tool-call count/tokens, and captured inefficiencies feed tool + description refinement (eval-driven design).
*In this repo:* keep raw goal/expr/query tools; a candidate consolidation is one "inspect goal" tool (today an agent chains goal_type→context→scope) — gated on eval evidence. Loop 2 IS that eval harness.

## Guardrails (where token economy must NOT win)

- **Never compress away a correctness signal.** The concise/default payload MUST still faithfully carry `ok`, `classification`, and any false-green / error status. The oracle work (ORACLE-VALIDITY.md) depends on the envelope's normalized classification — high-signal-by-default means *drop verbose context*, never *drop the verdict*.
- **References must be resolvable and pinned.** A returned handle (goal ID, closure hash, fixture path) must stay valid for the agent's next call; capture references pin the import-closure hash (CAP-01) so "fetch by reference" can't race live edits.
- **Respect the invariants.** These principles never justify a second `AgdaSession` (#39), hand-built IOTCM strings, breaking the 500-line ceiling, or moving domain logic into `src/tools/`.
- **Deterministic, not LLM-graded.** Code-execution/eval surfaces stay deterministic (per the ORCL design); no LLM-in-the-loop grading of the server's own correctness.

## How this maps to the roadmap

| Principle | Where it lands |
|---|---|
| P1, P4 (high-signal, cap-and-steer) | `response_format` + steering truncation on high-volume tools (operational now-item); design constraint on every Phase-1 capture output |
| P2, P3 (references, nextAction) | CAP-03 emit-only reference; LOCK-01 fixture paths; QUEUE fingerprint keys; a hard `nextAction` rule |
| P5 (compose in code) | `scripts/dogfood-run.mjs` (Phase 5); future Loop-1 multi-candidate surface (LOOP1-01) |
| P6 (data not reasoning; Skill) | PROC-01 runbook-as-Skill; Loop-1 ranked candidates as data |
| P7 (hybrid + eval-driven) | Loop-2 eval harness instruments tool efficiency; consolidation gated on it |

---
*Companion to `research/MCP-DESIGN-TRENDS.md`. Apply these when planning any tool or surface.*
