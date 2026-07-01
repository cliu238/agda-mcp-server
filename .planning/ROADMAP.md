# Roadmap: Agda MCP Server — Self-Improvement Loop (Loop ②)

## Overview

This milestone builds the **reproducible scaffold for Loop ②**: use it → surface a defect → capture it → fix and lock it with a regression test → use it again. The roadmap follows the research build order and its hard dependency chain. The **capture substrate** (session action log / recorder-replayer at the Agda `--interaction-json` stdio seam) lands first because minimal-repro extraction, the oracle, and test emission all read it. A **cold-compiler differential oracle** then supplies ground truth so durable regression tests assert the *correct* result rather than golden-mastering a false-green. The **lock-in pipeline** turns one captured defect (the #64/#61 false-green) into a from-RED regression end-to-end. A **durable in-repo fix queue** gives the loop backpressure before the **dogfooding orchestrator + pinned fuel** turn capture into a repeatable, on-demand process. The loop *wraps* the server: only two surgical `src/` additions (a pure `session-capture` model and an emit-only capture tool); everything else lives in `scripts/` and repo data dirs, honoring the 500-line ceiling and the single-`AgdaSession` invariant (#39).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Capture Foundation** - One-verb, emit-only capture of a live session into a self-replaying artifact (the foundational substrate)
- [ ] **Phase 2: Cold-Compiler Ground-Truth Oracle** - A fresh `agda` run supplies correct expected results and detects the false-green class (#64/#61)
- [ ] **Phase 3: Regression Lock Pipeline** - A captured defect becomes a minimal repro + a from-RED vitest regression, proven end-to-end on #64/#61
- [ ] **Phase 4: Triage / Fix Queue** - Captured defects persist and flow through a durable in-repo queue with status, prioritization, and optional GitHub mirror
- [ ] **Phase 5: Dogfooding Orchestration + Fuel** - Point an agent at pinned real corpora and harvest defects reproducibly over MCP stdio

## Phase Details

### Phase 1: Capture Foundation
**Goal**: An agent can snapshot a stuck/failed live session into a self-replaying capture artifact with one MCP verb — the foundational substrate the rest of the loop reads.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04
**Success Criteria** (what must be TRUE):
  1. An agent calls one MCP verb (`agda_capture_session`) mid-session and receives a `CaptureArtifact` envelope in `ToolResult.data`; the tool writes nothing to the repo (emit-only, following the `agda_bug_report_bundle` precedent). (CAP-03)
  2. Every capture is auto-stamped from the live session with Agda version, server version, Node/OS, `commandLineOptions`, and the merged `.agda-mcp.json` snapshot — never caller-supplied toolchain values. (CAP-01)
  3. A recorded session action log (ordered tool calls + args + normalized envelopes at the `--interaction-json` stdio seam) is attached to the artifact and can be replayed. (CAP-04)
  4. Re-capturing the same defect routes as an `update` with an incremented recurrence count via the `fingerprintBugReport()` → prior-report index, not a new `new-bug`. (CAP-02)
  5. A captured bundle self-replays from a cold start on a second machine, proving it is a full replay manifest (session lineage, env timers, inline fixture source) rather than a snapshot.
**Plans**: TBD

### Phase 2: Cold-Compiler Ground-Truth Oracle
**Goal**: The loop can distinguish real ground truth from a warm-session false-green by running a fresh `agda` invocation on the pinned toolchain and diffing it against the live session's classification.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: ORCL-01
**Success Criteria** (what must be TRUE):
  1. A cold, from-scratch `agda` invocation runs on the pinned toolchain and its result is diffed against the live session's classification captured in the artifact. (ORCL-01)
  2. The oracle detects/confirms the false-green class — server said `ok-complete`, cold compiler says ERROR (#64/#61) — and flags it. (ORCL-01)
  3. The oracle supplies the *correct* expected result that a durable regression test will later assert against (never golden-mastering the observed-buggy output).
  4. Warnings are escalated where CI does (`--warning=error`) so warning-class false-greens surface rather than passing silently.
**Plans**: TBD

### Phase 3: Regression Lock Pipeline
**Goal**: A captured defect becomes a minimal reproduction and a durable vitest regression that starts RED, asserts the oracle's correct behavior on the normalized envelope, and turns green only when fixed — proven end-to-end on the #64/#61 false-green.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: REPRO-01, LOCK-01, LOCK-02, LOCK-03
**Success Criteria** (what must be TRUE):
  1. A captured defect yields a minimal reproduction — the offending source snapshotted into a fixture plus the recorded trigger sequence — that the maintainer or an agent can deterministically re-trigger (assisted/manual trimming; automatic minimization out of scope). (REPRO-01)
  2. Fixture materialization writes the minimal `.agda` repro under the established `test/fixtures/agda/` convention with automated placement + naming, mirroring the #65/#66 fixtures. (LOCK-01)
  3. The regression-test emitter turns a captured bundle + fixture into a durable vitest test that starts RED, asserts the *correct* behavior against the cold-compiler oracle (never golden-masters false-green), and asserts on the normalized `ToolResult` envelope rather than wire order/timing (robust across Agda 2.6.4.3–2.9.0). (LOCK-02)
  4. The #64/#61 transitive-staleness / false-green defect is produced through the emitter as a from-RED test + fixture that goes green only when the defect is fixed — proving the scaffold works end-to-end and filling the highest-priority known coverage gap. (LOCK-03)
**Plans**: TBD

### Phase 4: Triage / Fix Queue
**Goal**: Captured defects persist and flow through a durable in-repo queue with status, prioritization, and classification — so intake neither evaporates at session end nor outpaces throughput into a write-only graveyard.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04
**Success Criteria** (what must be TRUE):
  1. An in-repo flat-file queue (JSONL/markdown) is the single source of truth for captured defects, each keyed by fingerprint with a status (new/triaged/fixing/locked); defects persist and flow across sessions rather than evaporating. (QUEUE-01)
  2. The queue carries a prioritization signal composed from already-captured data (false-green > crash > wrong-result > missing-feature; ties broken by recurrence count from the dedup index), giving the maintainer and agents one clear ordering. (QUEUE-02)
  3. An `agda_triage_error` classifier turns a raw Agda error into a machine class (mechanical-import, parser-regression, coverage-missing, dep-failure, toolchain) with a confidence score and suggested action, feeding both capture-time classification and fix-queue routing. (QUEUE-03)
  4. The in-repo queue can be mirrored one-way to GitHub Issues via `gh` (optional, non-authoritative — the flat file stays the SSOT). (QUEUE-04)
**Plans**: TBD

### Phase 5: Dogfooding Orchestration + Fuel
**Goal**: The *process* is reproducible — point an agent at pinned real corpora, drive the server over MCP stdio (single `AgdaSession`), record transcripts, and auto-persist captures on demand.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: PROC-01, PROC-02
**Success Criteria** (what must be TRUE):
  1. A written dogfooding runbook + driver-prompt snippet makes the process reproducible — telling an agent when and how to invoke the capture verb while proving against real corpora — so "point Codex at stdlib and harvest defects" can be re-run on demand. (PROC-01)
  2. A pinned fuel-pointer set lists the source corpora (agda-stdlib, chosen OSS Agda projects, the maintainer's own math project) at pinned commits, so dogfooding runs are reproducible across time. (PROC-02)
  3. The orchestrator (`scripts/dogfood-run.mjs`) launches the server over MCP stdio via the existing harness — never a second `AgdaSession` (#39) — records the tool-call transcript, and auto-persists captures.
  4. Captures are re-run N times and classified (deterministic → real defect; flaky → tagged `timing/nondeterministic`) before filing, so timing/idle phantoms (#65/#66) never enter the queue.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Capture Foundation | 0/TBD | Not started | - |
| 2. Cold-Compiler Ground-Truth Oracle | 0/TBD | Not started | - |
| 3. Regression Lock Pipeline | 0/TBD | Not started | - |
| 4. Triage / Fix Queue | 0/TBD | Not started | - |
| 5. Dogfooding Orchestration + Fuel | 0/TBD | Not started | - |
