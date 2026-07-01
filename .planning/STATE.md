# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Every real proof session reliably converts into a stronger server — the closed loop (use it → surface a defect → capture it → fix and lock it with a regression test → use it again) must work reproducibly by hand.
**Current focus:** Phase 1 — Capture Foundation

## Current Position

Phase: 1 of 5 (Capture Foundation)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-07-01 — Roadmap created (5 phases); oracle-validity research adopted → ORCL split into a 3-predicate triad, CAP-01 expanded + CAP-05 added; now 18/18 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Loop wraps the server — only two surgical `src/` additions (pure `session-capture` model + emit-only capture tool); all orchestration in `scripts/` + repo data dirs.
- Roadmap: Cold-compiler oracle (Phase 2) isolated *before* the regression emitter (Phase 3) so durable tests assert the correct result, never golden-master a false-green.
- Roadmap: Queue (Phase 4) precedes orchestration (Phase 5) so the firehose meets backpressure (Pitfall 6).
- Research (oracle-validity, HIGH confidence, verified vs local agda-unimath clone): cold `agda` re-run is a sound oracle for ONLY the server-faithfulness false-green family (#64/#61/#65/#66); it is structurally blind to soundness cheats (postulate/unsafe-flags/`primTrustMe`) and to spec-conformance (proved the wrong statement). So Phase 2 is a THREE-predicate triad (ORCL-01 differential + ORCL-02 soundness scan + ORCL-03 advisory conformance); ORCL-01 passing is necessary-but-insufficient. Corrections baked in: interaction `Cmd_load` not batch; replay (not re-derive) library registration; content-hash-pin the import closure; fresh isolated `_build`; env-probe → INCONCLUSIVE (never "server bug"); `--safe` is unusable on unimath (it legitimately postulates univalence/funext/replacement) so ORCL-02 uses an axiom whitelist-diff, not forced `--safe`; `primEraseEquality` is sound (not a cheat).

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 & Phase 2 flagged for `/gsd:plan-phase --research-phase`: the `RecordedTransport` cassette design (novel, no off-the-shelf equivalent) and the oracle triad (correctness-critical) both need deeper design during planning.
- Oracle false-POSITIVE risk is real: the differential can cry "server bug" for env/registration/version/TOCTOU reasons. Every env probe must gate to INCONCLUSIVE; watch the abstention rate — a from-scratch unimath/Hopf recompile will often exceed `AGDA_MCP_COMMAND_TIMEOUT_MS` and abstain exactly where signal is most wanted.
- ORCL-02/03 depend on capture substrate (CAP-05: source diff, intended goal type, expected signature). PROC-01 must make declaring the expected top-level signature a HARD gate or ORCL-03 is vacuous. The axiom-whitelist + flag-baseline policy lives in the PROC-02 fuel-pointer set.
- No phase criterion may require v2+ work (knowledge accumulation, auto-PR, unattended orchestration, ORCL-02 hardened *hard half* = AUTO-07) — hold the scope line at every plan.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-01
Stopped at: ROADMAP.md + STATE.md written; REQUIREMENTS.md traceability populated.
Resume file: None
