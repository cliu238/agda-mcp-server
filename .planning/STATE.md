---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 5 context gathered
last_updated: "2026-07-03T01:32:48.219Z"
last_activity: 2026-07-03 -- Phase 05 execution started
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 26
  completed_plans: 22
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Every real proof session reliably converts into a stronger server — the closed loop (use it → surface a defect → capture it → fix and lock it with a regression test → use it again) must work reproducibly by hand.
**Current focus:** Phase 05 — dogfooding-orchestration-fuel

## Current Position

Phase: 05 (dogfooding-orchestration-fuel) — EXECUTING
Plan: 1 of 4
Status: Executing Phase 05
Last activity: 2026-07-03 -- Phase 05 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 15
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 5 | - | - |
| 03 | 3 | - | - |
| 03.1 | 2 | - | - |
| 04 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Roadmap Evolution

- Phase 03.1 inserted after Phase 3: Fix the #64/#61 transitive-staleness false-green and flip the flagship lock to green (sequenced by 03-CONTEXT D-09) (URGENT)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Loop wraps the server — only two surgical `src/` additions (pure `session-capture` model + emit-only capture tool); all orchestration in `scripts/` + repo data dirs.
- Roadmap: Cold-compiler oracle (Phase 2) isolated *before* the regression emitter (Phase 3) so durable tests assert the correct result, never golden-master a false-green.
- Roadmap: Queue (Phase 4) precedes orchestration (Phase 5) so the firehose meets backpressure (Pitfall 6).
- Context (motivating experiment): Loop ② is grounded in the real **agda-unimath Hopf/π₃(S²)** autoformalization with Codex→MCP (private repo `emilyriehl/autoformalizing-hopf`; the local mirror `ref/README.md` has since been removed). Observed Codex behavior — scope-narrowing, shortcuts, flag-planting — is the empirical seed for ORCL-02/03; the **join associativity** case study (codex interrupted twice → human rocq-hott pivot) is the canonical example and a Phase-3 regression / Phase-5 fuel candidate. agda-unimath (the Hopf work) = the PROC-02 fuel corpus.
- Context (2nd corpus / MEASURED false-green): `emilyriehl/Codex-Homotopy-Group` (private, π₃(S²)=ℤ) **directly dogfoods this server**. Team MEASURED v0.6.7 (2026-05-30) to scope-check only — injected `UnequalTerms` → all four verdict tools (load/typecheck/load_no_metas/proof_status) reported zero errors while raw agda rejected — and retired MCP from acceptance. `loop.sh`'s `gate_verify` is a working oracle-triad prototype; `agda-mcp-ux-report/` (711 calls, 290 anomalies/12 families, 8 regression specs, a target envelope schema) is ready-made Phase-1/3/4 intake. PROC-02 fuel corpus #2. ⚠️ v0.6.7 — re-verify vs current main. Full mapping in `.planning/research/ORACLE-VALIDITY.md`; cross-phase artifact→phase inventory (CHAT-LOG.md, agda-mcp-ux-report/, MCP-SETUP.md, formalization plans, .codex skills, …) in `.planning/research/FUEL-CORPORA.md`.
- Research (oracle-validity, HIGH confidence, verified vs local agda-unimath clone): cold `agda` re-run is a sound oracle for ONLY the server-faithfulness false-green family (#64/#61/#65/#66); it is structurally blind to soundness cheats (postulate/unsafe-flags/`primTrustMe`) and to spec-conformance (proved the wrong statement). So Phase 2 is a THREE-predicate triad (ORCL-01 differential + ORCL-02 soundness scan + ORCL-03 advisory conformance); ORCL-01 passing is necessary-but-insufficient. Corrections baked in: interaction `Cmd_load` not batch; replay (not re-derive) library registration; content-hash-pin the import closure; fresh isolated `_build`; env-probe → INCONCLUSIVE (never "server bug"); `--safe` is unusable on unimath (it legitimately postulates univalence/funext/replacement) so ORCL-02 uses an axiom whitelist-diff, not forced `--safe`; `primEraseEquality` is sound (not a cheat).

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 & Phase 2 flagged for `/gsd:plan-phase --research-phase`: the `RecordedTransport` cassette design (novel, no off-the-shelf equivalent) and the oracle triad (correctness-critical) both need deeper design during planning.
- Oracle false-POSITIVE risk is real: the differential can cry "server bug" for env/registration/version/TOCTOU reasons. Every env probe must gate to INCONCLUSIVE; watch the abstention rate — a from-scratch unimath/Hopf recompile will often exceed `AGDA_MCP_COMMAND_TIMEOUT_MS` and abstain exactly where signal is most wanted.
- ORCL-02/03 depend on capture substrate (CAP-05: source diff, intended goal type, expected signature). PROC-01 must make declaring the expected top-level signature a HARD gate or ORCL-03 is vacuous. The axiom-whitelist + flag-baseline policy lives in the PROC-02 fuel-pointer set.
- Field evidence from Codex-Homotopy-Group (CHG) refines the plan (does NOT contradict it): (a) OPEN RISK — across CHG's multi-week campaign ZERO MCP defects were captured into structured reports (only check.sh transcripts + rg scans), so Loop ② is not self-feeding yet; PROC-01's runbook must actively wire in the capture verb. (b) The MCP's earned role in the wild is interactive query + literate `.lagda.md` extraction, not the acceptance gate — the measurable win is retracting the team's "do not trust MCP ok-complete" Skill warning. (c) Capture/ORCL must model the legitimate scaffold-hole workflow (intentional `{!!}` + `--allow-unsolved-metas`), else ORCL false-reds in-progress work. (d) Soundness scan must be pragma-aware; ORCL-01 must replay the exact sandbox (two check.sh variants / .agda-lib / flags). ⚠️ CHG measurements are v0.6.7 — candidate defects (esp. `agda_auto` feeding CLI flags to Agda; `ok:true` wrapping errors) need re-verification vs current main before becoming LOCK-03 regressions.
- Design charter `.planning/DESIGN-PRINCIPLES.md` (context engineering + code execution) is now the lens for every tool/surface: high-signal-by-default + drill-in, return references not payloads, `nextAction` always, cap-and-steer, compose-in-code (scripts), server emits data / strategy in a Skill, hybrid + eval-driven. Guardrail: never compress away the `ok`/`classification`/false-green signal the oracle depends on. Apply in plan-phase for Phase 1 (capture outputs) and Phase 5 (orchestration).
- Cross-checked against the Lean/Mathlib ecosystem (see `.planning/research/LEAN-COMPARISON.md`): `#print axioms` is the mature analog of ORCL-02's closure audit and independently confirms "compile ≠ true green". Its transitive-closure bug (Lean #8840) → ORCL-02 must recurse through **type signatures**, not just bodies. `native_decide`/`@[implemented_by]` leaks → ORCL-02 must scan **FFI (`COMPILE`)/pragmas**, not just postulates. Kimina's negation-discard → an ORCL-03 **consistency probe** (mechanize = AUTO-08). Lean REPL pickling / "keep proof state live" ≈ CAP-04 north-star; `lean_multi_attempt` ≈ a Loop① primitive for LOOP1-01.
- No phase criterion may require v2+ work (knowledge accumulation, auto-PR, unattended orchestration, ORCL-02 hardened *hard half* = AUTO-07) — hold the scope line at every plan.
- ✅ CHG v0.6.7 re-verification DONE (2026-07-02, `.planning/research/CHG-REVERIFY.md`): flagship #64/#61 false-green = **changed/provisionally-fixed** (no repro across 3 shapes incl. transitive signature-only; but `agdai-cache.ts` root-cause path untouched by the likely fix `e38f90a` — LOCK-03 fixture must probe the large-module timing + forceRecompile edges). `agda_auto` flag leak = **alive**; `agda_give` ok:true-wrapping-error = **alive** (highest agent risk); `agda_search_definitions` hardcoded `agda/` layout = **alive**. New minor candidate: `agda_proof_status` says "All goals solved." while `constraintsText` carries the error. → 3 live defects are Phase-4 queue ammo; LOCK-03 target needs the timing-edge fixture, not the naive repro.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260702-29k | Re-verify CHG v0.6.7 defect list against current main | 2026-07-02 | 6aa28e4 | [260702-29k-re-verify-chg-v0-6-7-defect-list-against](./quick/260702-29k-re-verify-chg-v0-6-7-defect-list-against/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-02T06:02:53.705Z
Stopped at: Phase 5 context gathered
Resume file: .planning/phases/05-dogfooding-orchestration-fuel/05-CONTEXT.md
