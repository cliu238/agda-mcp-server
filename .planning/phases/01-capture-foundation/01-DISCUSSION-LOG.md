# Phase 1: Capture Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 1-capture-foundation
**Areas discussed:** Recorder lifecycle, Emit-only output shape, Self-replay composition, Capture verb contract

---

## Recorder lifecycle (录制时机)

| Option | Description | Selected |
|--------|-------------|----------|
| Env-switch + ring buffer | RecordedTransport wraps the stdio transport, in-memory ring of last N tool-call/envelope pairs; default OFF, on via `AGDA_MCP_CAPTURE=1` / dogfood mode. Zero cost for day-to-day users. | ✓ |
| Always-on ring buffer (ungated) | Same ring, no gate; complete log always, but the wrapper sits on the single-AgdaSession stdio path for every session. | |
| Explicit start/stop verb | Agent calls `agda_record_start` before working; precise but risks an empty log for surprise defects (the common case). | |

**User's choice:** Env-switch + ring buffer.
**Notes:** The forced part is that recording must run *before* capture (a capture-triggered log is empty for surprise defects, so the explicit-start option is ruled out on correctness). Env-gate vs always-on is a low-stakes, reversible toggle; gating chosen to keep capture machinery off the default hot path. Ring sizing / wrap point flagged as plan-phase research.

---

## Capture verb contract (工具契约)

Framed up front (not voted): the verb is state-agnostic and does not judge green truth — Phase 1 has no oracle (Phase 2), and catching false-greens is the core value, so capturing a suspicious "green" is mandatory.

**Sub-decision A — expected signature (CAP-05) required vs optional at capture time**

| Option | Description | Selected |
|--------|-------------|----------|
| Optional but strongly nagged | Accept it optionally; if missing, still emit + `nextAction` warning that ORCL-03 will be vacuous. Hard gate stays in PROC-01/Phase 5. | ✓ |
| Required | Reject captures without it; blocks crash/failure captures and pulls Phase-5's PROC-01 gate forward (scope violation). | |

**User's choice:** Optional but strongly nagged.

**Sub-decision B — where the fingerprint dedup index lives**

| Option | Description | Selected |
|--------|-------------|----------|
| Read a minimal existing index | Read a gitignored out-of-repo `fingerprint → count` map; compute new/update + recurrence; script writes it. Satisfies CAP-02 without building Phase-4's queue. | ✓ |
| Only emit fingerprint; defer dedup to Phase 4 | Simpler, but fails CAP-02's Phase-1 acceptance criterion (routes-as-update + recurrence). | |

**User's choice:** Minimal existing index.
**Notes:** Both sub-decisions were, on reflection, forced (see CONTEXT.md classification): "required" violates CAP-03 + pulls Phase-5 scope forward; "defer to Phase 4" regresses CAP-02. The user needed two rounds of plainer, example-driven explanation to make the dedup concept (fingerprint / index / emit-only tension) concrete.

---

## Self-replay composition (回放内容)

Framed as locked by roadmap phrasing (criterion 6 = "manifest + closure hash + inline fixture source"): libraries pinned via manifest, closure always content-hashed.

| Option | Description | Selected |
|--------|-------------|----------|
| Lock safe principle now, defer trimming to Phase 3 | Auto-inline the first-party files used in the closure; libraries via manifest; closure hash. Minimal-repro trimming → deferred to Phase 3 (REPRO-01). No spike now. | ✓ |
| Spike first | Manually capture agda-unimath / own project once or twice to size the closure before deciding inlining policy. | |

**User's choice:** Lock safe principle, defer trimming.
**Notes:** User raised the key meta-point here — this should not be a taste call. On reflection the correct-and-minimal answer is forced by correctness (must inline first-party closure members; "only the offending file" risks broken cold replay). The one open part (trim to a single-file repro) is empirical and belongs to Phase 3 — no spike now because there is no captured material to trim yet.

---

## Emit-only output shape (输出形态)

| Option | Description | Selected |
|--------|-------------|----------|
| Reference / claim-check | Stage the heavy artifact to an out-of-repo scratch dir; return `{ path, fingerprint, kind, recurrence, summary, nextAction }`. Matches DESIGN-PRINCIPLES P2. | ✓ |
| Inline whole artifact | Return the entire bundle in `ToolResult.data` (matches the tiny bug-bundle precedent); violates P2 and burns context for large artifacts. | |
| Hybrid: summary + attachment | Lightweight summary + heavy artifact in an "attachment" field the script consumes; heavy field still rides the return channel. | |

**User's choice:** Reference / claim-check.
**Notes:** Forced by the maintainer's own DESIGN-PRINCIPLES P2 (capture returns a reference, not the full bundle). "emit-only" redefined as "does not write the repo tree; may stage to an out-of-repo scratch dir." Guardrail preserved: the reference still carries `ok`/`classification`/false-green.

---

## Claude's Discretion

- Env-switch OFF but capture called anyway → emit the artifact with an empty/partial action log + `nextAction` to re-run with recording on (do not hard-fail).
- Verb naming (`agda_capture_session` vs alternatives), subject to `src/tools/manifest.ts` conventions.

## Deferred Ideas

- Minimal single-file repro trimming → Phase 3 (REPRO-01); auto ddmin → v2 (AUTO-01).
- Expected-signature hard gate → Phase 5 (PROC-01).
- Durable flat-file fix queue (QUEUE-01) → Phase 4; supersedes the Phase-1 minimal dedup index.
- Oracle consumption of the CAP-05 substrate (ORCL-02/03) → Phase 2.
- Source-diff "before" reconstruction method → plan-phase research.

## Process note (meta)

Mid-discussion the maintainer flagged that several options I framed as "taste" were actually forced by correctness / requirements / scope boundary / the design charter, each with a trap option that would have violated a constraint. Audit confirmed 4 of 6 sub-decisions were forced (all landed correctly). Recorded as a durable lesson in agent memory (`discuss-phase-classify-decisions`) so future discuss-phase runs classify decisions before asking.
