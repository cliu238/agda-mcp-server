# Phase 1: Capture Foundation - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver **one emit-only MCP verb** that snapshots a live session — stuck, failed, **or a suspicious "green"** — into a self-replaying `CaptureArtifact`. The verb:
- auto-stamps a complete, server-derived **replay manifest** (CAP-01),
- attaches a **replayable action log** recorded at the `agda --interaction-json` stdio seam (CAP-04),
- routes duplicates via the existing `fingerprintBugReport()` sha256 (CAP-02),
- records the **oracle substrate** the Phase-2 triad will read (CAP-05).

Only **two surgical `src/` additions**: a pure `session-capture` model + the emit-only tool. Everything else (persistence, orchestration) lives in `scripts/` + data dirs, honoring the 500-line ceiling and the single-`AgdaSession` invariant (#39).

**Not in this phase:** the oracle itself (Phase 2), minimal-repro trimming (Phase 3), the durable fix queue (Phase 4), the dogfooding runbook + expected-signature hard gate (Phase 5).

</domain>

<decisions>
## Implementation Decisions

> **Classification legend** (each decision is tagged with what actually determines it):
> **[FORCED]** = fixed by correctness / a requirement / the phase boundary / the design charter — NOT a preference; alternatives are ruled out (reason given). Non-negotiable downstream.
> **[TASTE]** = a genuine values call the maintainer made; all listed alternatives were in-scope and constraint-compatible.
> **[DEFERRED]** = deliberately not decided in Phase 1 (empirical or belongs to a later phase).

### Capture verb contract (CAP-02, CAP-03, CAP-05)

- **D-01 [FORCED — no oracle until Phase 2 + core value]:** The verb is **state-agnostic**. It snapshots the current session (stuck / failed / suspicious-green) **without judging truth**. Capturing a green-looking state is mandatory — the whole loop exists to catch false-greens (#64/#61), and Phase 1 has no oracle (that is Phase 2) to judge with. Naming must not imply failure-only (prefer `agda_capture_session` over `agda_capture_failure`).
- **D-02 [FORCED — CAP-03 scope + PROC-01 hard gate is Phase 5]:** The task-authored expected top-level signature (CAP-05) is **OPTIONAL at capture time**, not required. Requiring it would block crash/failure captures (which inherently have no expected signature) — violating CAP-03 — and would pull PROC-01's hard gate forward from Phase 5. When absent, still emit the artifact but attach a warning + `nextAction` noting ORCL-03 conformance will be vacuous without it (P3).
- **D-03 [FORCED — CAP-02 is a Phase-1 acceptance criterion]:** Capture **does** compute dedup routing in Phase 1 (not deferred to the Phase-4 queue). It reads a **minimal prior-report index** at a conventional, gitignored, out-of-repo location (e.g. `.agda-mcp/captures/`), reuses `fingerprintBugReport()` sha256, and returns `kind = new-bug | update` + recurrence count in the artifact. Absent/empty index (first capture) ⇒ `new-bug`, recurrence 1. Capture only **reads** the index (honors emit-only); the out-of-band persist step **writes** it. This minimal `fingerprint → {recurrence, …}` map is later superseded by the Phase-4 flat-file queue (QUEUE-01).
- **D-04 [FORCED — CAP-01 vs CAP-05 input split]:** The replay manifest (CAP-01) is **server-stamped, never caller-supplied**; the oracle substrate (CAP-05: source diff, intended goal type, expected signature) is **agent/task-supplied** (intended goal grabbable live via `Cmd_goal_type` when available). *Research question for plan-phase:* how the "before" source of the diff is reconstructed (git vs recorded edits vs agent-supplied).

### Recorder lifecycle (CAP-04)

- **D-05 [FORCED — must record before capture]:** The action log **cannot be capture-triggered**. A surprise defect (the common case) means recording must already be running before the agent knows there is a problem; a start-recording-only verb would yield an empty log exactly when it matters most. So the recorder runs **by default during the window of interest**, draining into the artifact at capture time.
- **D-06 [TASTE — low-stakes, reversible]:** Gate the always-on recorder behind an **env switch** (`AGDA_MCP_CAPTURE=1` / a dogfood mode), **default OFF**, so day-to-day server use pays nothing on the single-`AgdaSession` stdio hot path. An in-memory **bounded ring buffer** holds the last N tool-call + normalized-envelope pairs. *(Always-on/ungated is also defensible — a ring buffer is near-zero cost — but gating aligns with "the loop wraps the server; orchestration in scripts" and keeps capture machinery off the default path.)*
- **RESEARCH:** Ring-buffer sizing and exactly where `RecordedTransport` wraps the transport are for plan-phase (the RecordedTransport cassette design is flagged novel in STATE.md; the buffer must not drop the early actions of a long dogfood session).

### Self-replay artifact composition (CAP-01, success criterion 6)

- **D-07 [FORCED — cold-replay correctness + roadmap phrasing]:** The artifact is a **full replay manifest** = server-stamped manifest (Agda version + pinned binary path, server/Node/OS, merged flags as an **ordered argv with duplicates preserved**, realized `AGDA_DIR` contents, cwd/root, fresh-vs-shared `_build`) + a **content-hash of the full transitive import closure** + **inline first-party (project-local, non-library) source that appears in that closure**. Third-party libraries are pinned/replayed via the manifest, **not inlined**. Ruled out: inlining only "the one offending file" (breaks cold replay when it depends on other first-party files); inlining library source too (redundant with the manifest, violates P2). The first-party set to inline is **computed from the closure, not chosen**.
- **D-08 [DEFERRED — Phase 3 / empirical]:** Trimming to a **minimal single-file repro is not a Phase-1 decision**. It is empirical (needs real captured defects as material) and is explicitly Phase 3 (REPRO-01, assisted/manual minimization); automatic ddmin minimization is v2 (AUTO-01). **No spike now** — there is no captured material to trim until Phase 5 dogfooding produces it.

### Emit-only output shape (CAP-03, DESIGN-PRINCIPLES P2)

- **D-09 [FORCED — DESIGN-PRINCIPLES P2 + guardrails]:** Capture returns a **lightweight reference** in `ToolResult.data`, not the full bundle. The heavy artifact is **staged to an out-of-repo scratch location** (OS temp or gitignored `.agda-mcp/captures/`); the tool result carries `{ staged-path, fingerprint, kind, recurrence, one-line summary, key diagnostics, nextAction }`. Inlining the whole bundle is ruled out by P2 (and would burn the agent's context budget over long proof sessions).
- **D-10 [scope clarification — semantics of "emit-only"]:** "emit-only" ≡ **"does not write into the repo tree; MAY stage to an out-of-repo scratch dir; an out-of-band step promotes it into the repo."** This diverges from the `agda_bug_report_bundle` precedent (which writes literally nothing) precisely because that bundle is small enough to inline while the capture artifact is not — P2 explicitly carves out the capture verb as reference-returning. **Guardrail:** the concise reference MUST still faithfully carry `ok` / `classification` / false-green signal — never compress away the verdict.

### Claude's Discretion

- **Env-switch OFF but capture called anyway** → still emit the artifact, but the action-log portion is empty/partial with a `nextAction` telling the agent to re-run with recording enabled for a full log (P3; do **not** hard-fail).
- **Verb naming** (`agda_capture_session` vs similar) — open, subject to `src/tools/manifest.ts` conventions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope (the contract this phase implements)
- `.planning/REQUIREMENTS.md` §Capture (CAP) — CAP-01…CAP-05, the locked requirements. Read the exact wording (ordered-argv-with-duplicates, realized `AGDA_DIR` contents, transitive-closure content-hash).
- `.planning/ROADMAP.md` §"Phase 1: Capture Foundation" — the 6 success criteria (criterion 6 = cold self-replay on a second machine).

### Design charter (forces several decisions above — MANDATORY lens)
- `.planning/DESIGN-PRINCIPLES.md` — **P2** (return references, not payloads → forces D-09), **P3** (every result carries `nextAction` → D-02, Claude's-discretion empty-log), and the **guardrail** "never compress away `ok`/`classification`/false-green" (→ D-10). Line 17 explicitly names the capture verb as reference-returning.

### Oracle substrate rationale (why CAP-05 exists; consumed in Phase 2, only recorded here)
- `.planning/research/ORACLE-VALIDITY.md` — cold re-run is sound only for the server-faithfulness false-green family; necessary-but-insufficient; why the substrate (source diff, expected signature) must be captured.
- `.planning/research/LEAN-COMPARISON.md` — transitive closure must recurse through type signatures; FFI/`COMPILE` scan (informs what CAP-05's substrate must preserve for Phase-2 ORCL-02).
- `.planning/research/PITFALLS.md` — firehose/backpressure and TOCTOU concerns relevant to the capture instant.

### Codebase seams (reusable assets — full paths)
- `src/reporting/bug-report.ts` — `fingerprintBugReport()` (reuse verbatim for CAP-02) and `buildBugReportBundle()` / `BugReportBundle` shape (structural precedent).
- `src/tools/reporting-tools.ts` + `src/tools/register-bug-bundles.ts` — the `agda_bug_report_bundle` **emit-only tool precedent** CAP-03 says to follow (thin adapter shape).
- `src/session/agda-transport.ts` — the IOTCM newline-delimited-JSON stdio seam where `RecordedTransport` wraps (CAP-04). *(Note: 535 lines — already over the 500 ceiling; do not grow it; wrap/compose instead.)*
- `src/agda/session-command-dispatch.ts` — command-queue dispatch; the tool-call boundary the action log records.
- `src/tools/tool-envelope.ts` — `ToolEnvelope` / `okEnvelope` / `errorEnvelope`; the normalized envelope the log records and the reference the capture verb returns.
- `src/agda/session.ts` + `src/index.ts` — the single `AgdaSession` (#39); capture must route through the singleton, never a second session.
- `src/protocol/command-builder.ts` — IOTCM SSOT; `Cmd_goal_type` / `Cmd_infer_toplevel` plumbing reused for CAP-05.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/INTEGRATIONS.md` — layering (`protocol → agda → session → tools`) and the Agda-binary integration seam.

### Field evidence (Codex-Homotopy-Group — private corpus that dogfoods this server)
- `emilyriehl/Codex-Homotopy-Group` → `agda-mcp-ux-report/` (README.md + `extract-mcp-evidence.mjs` + `mcp-evidence.json`) — a real forensic report on THIS server: 711 `agda_*` calls, 290 anomalies in 12 named families, a target envelope schema, and **8 turn-key regression specs**. The extractor's per-call field list is a concrete template for what the CAP-04 action log should emit. (private/access-gated; ⚠️ measured on v0.6.7)
- `emilyriehl/Codex-Homotopy-Group` → `loop.sh` (`gate_verify`) + PR #1 `SCRIPTS-USAGE.md` — the bash oracle prototype the MCP is meant to replace; its 4 checks / 4 self-reported gaps map onto ORCL-01/02/03. Full mapping in `.planning/research/ORACLE-VALIDITY.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fingerprintBugReport()` (`src/reporting/bug-report.ts`): sha256 over normalized identity fields — reuse verbatim for CAP-02 dedup; do NOT invent a new fingerprint.
- `agda_bug_report_bundle` (`src/tools/register-bug-bundles.ts`): emit-only tool template for CAP-03 — but return a **reference** (P2/D-09), not the full bundle.
- `ToolEnvelope` (`src/tools/tool-envelope.ts`): the normalized `{ ok, classification, summary, data, diagnostics, provenance }` shape that both the action log entries and the capture reference reuse.
- `Cmd_goal_type` / `Cmd_infer_toplevel` (via `src/protocol/command-builder.ts`): existing plumbing for CAP-05's intended goal type and (later) the proven signature.

### Established Patterns
- **Barrel + focused siblings under 500 lines:** the pure `session-capture` model should follow this (e.g. a barrel re-exporting manifest-builder / action-log / artifact-assembler siblings) rather than one fat file.
- **Free-function-over-shared-state:** capture helpers take the `AgdaSession` instance as first arg (mirrors `session-load-impl.ts` etc.).
- **Thin tool adapters:** the capture tool validates via Zod and wraps a `ToolEnvelope`; domain logic stays out of `src/tools/*`.

### Integration Points
- `RecordedTransport` wraps the existing transport at the `src/session/agda-transport.ts` stdio seam; drains its ring buffer into the artifact at capture.
- Capture routes through the single `AgdaSession` (`src/index.ts`) — the manifest reads live session state (merged flags, `AGDA_DIR`, cwd, `_build` mode) from the singleton, never caller input.

</code_context>

<specifics>
## Specific Ideas

- The **two surgical `src/` additions** are a hard constraint: (1) a pure `session-capture` model, (2) the emit-only capture tool. Persistence of the artifact, index writes, and orchestration live in `scripts/` + data dirs.
- Staging + index location convention: an out-of-repo, gitignored area (OS temp or `.agda-mcp/captures/`). The capture tool reads the index and stages the artifact there; a separate script promotes it into the repo.
- Manifest fidelity is exact and order-sensitive: merged flags as an **ordered argv preserving duplicates** (repeated `-i`/`-l`/`--library-file` are order-significant), realized `AGDA_DIR` contents, and a **content-hash of the full transitive import closure** (so Phase-2's oracle can pin to it and abort on drift).
- **CAP-04 field list (from a real extractor):** CHG's `extract-mcp-evidence.mjs` reconstructs per-call `{ ok, classification, goalCount, invisibleGoalCount, hasHoles, isComplete, elapsedMs, wallTimeMs, serverVersion, agdaVersion, args, excerpt }` — a concrete template for what the recorder should capture natively (a native log makes such forensic extractors unnecessary).
- **Model the scaffold-hole workflow:** agents deliberately place temporary `{!!}` + a file-level `--allow-unsolved-metas` to verify scaffold shape, then remove them. What capture records (and what Phase-2 ORCL later judges) MUST distinguish intentional-scaffold-incomplete from claimed-complete — never treat a deliberate scaffold hole as a defect.

</specifics>

<deferred>
## Deferred Ideas

- **Minimal single-file repro trimming** → Phase 3 (REPRO-01, assisted/manual); automatic ddmin minimization → v2 (AUTO-01). (D-08)
- **Expected-signature HARD gate** → Phase 5 (PROC-01). Phase 1 keeps it optional-but-nagged. (D-02)
- **Durable flat-file fix queue** (QUEUE-01) → Phase 4; it supersedes the Phase-1 minimal dedup index. (D-03)
- **Oracle consumption of the CAP-05 substrate** (ORCL-02/03) → Phase 2. Phase 1 only *records* the substrate, never judges.
- **Where the source-diff "before" comes from** (git vs recorded edits vs agent-supplied) → resolve in plan-phase research, not by preference. (D-04)
- **8 turn-key regression specs + target envelope schema** (CHG `agda-mcp-ux-report/`) → Phase 3 LOCK seeds (each is a captured anomaly already reduced to a lockable from-RED test). Pointer only; formalize at Phase-3 plan time.
- **Phase-5 integration constraints** (CHG `MCP-SETUP.md`): pinned launch `codex mcp add agda --env AGDA_MCP_ROOT=… -- npx -y agda-mcp-server@<ver>`; `agda_effective_options` must surface the merged argv incl. injected `-l <library>`; the two-location deploy-into-sandbox model → Phase 5 context.
- **Candidate defects from CHG (v0.6.7 — re-verify vs current main before locking):** `agda_auto` feeding `-d 5 --list-candidates` to Agda as an expression; `ok:true` wrapping Agda errors; state-change tools reporting "solved" after a failed reload; `agda_search_definitions` hardcoding an `agda/` layout (dead on agda-unimath's `src/`). → Phase-3 LOCK-03 candidates once the capture tool exists.

</deferred>

---

*Phase: 1-capture-foundation*
*Context gathered: 2026-07-01*
