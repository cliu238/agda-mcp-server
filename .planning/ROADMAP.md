# Roadmap: Agda MCP Server — Self-Improvement Loop (Loop ②)

## Overview

This milestone builds the **reproducible scaffold for Loop ②**: use it → surface a defect → capture it → fix and lock it with a regression test → use it again. The roadmap follows the research build order and its hard dependency chain. The **capture substrate** (session action log / recorder-replayer at the Agda `--interaction-json` stdio seam, plus a full replay manifest) lands first because minimal-repro extraction, the oracle, and test emission all read it. An **oracle triad** then supplies ground truth: a cold `agda --interaction-json` **server-faithfulness differential** (the only self-sufficient cold-rerun oracle, sound for the #64/#61/#65/#66 class), plus a **cheap soundness-hygiene scan** and an **advisory conformance proxy** for the false-greens a fresh compile accepts on identical source+flags — agent postulates/unsafe flags, and narrowed/wrong statements (the failure modes the real agda-unimath/Hopf dogfooding makes first-class). A passing differential is **necessary-but-insufficient**, so durable regression tests assert the *correct* result rather than golden-mastering a false-green. The **lock-in pipeline** turns one captured defect (the #64/#61 false-green) into a from-RED regression end-to-end. A **durable in-repo fix queue** gives the loop backpressure before the **dogfooding orchestrator + pinned fuel** turn capture into a repeatable, on-demand process. The loop *wraps* the server: only two surgical `src/` additions (a pure `session-capture` model and an emit-only capture tool); everything else lives in `scripts/` and repo data dirs, honoring the 500-line ceiling and the single-`AgdaSession` invariant (#39).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Capture Foundation** - One-verb, emit-only capture of a live session into a self-replaying artifact (the foundational substrate) (completed 2026-07-02)
- [x] **Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance)** - A fresh `agda --interaction-json` differential detects the server false-green class (#64/#61/#65/#66); a cheap soundness scan + advisory conformance proxy cover the cheats the differential cannot see (completed 2026-07-02)
- [x] **Phase 3: Regression Lock Pipeline** - A captured defect becomes a minimal repro + a from-RED vitest regression, proven end-to-end on #64/#61 (completed 2026-07-02)
- [x] **Phase 03.1: Fix the #64/#61 transitive-staleness false-green and flip the flagship lock to green** (INSERTED) - `runLoadNoMetas` gains a strict terminus guard; the flagship regression flips RED → locked under real Agda, closing the loop's first fix→stay-locked cycle (completed 2026-07-02)
- [x] **Phase 4: Triage / Fix Queue** - Captured defects persist and flow through a durable in-repo queue with status, prioritization, and optional GitHub mirror (completed 2026-07-02)
- [x] **Phase 5: Dogfooding Orchestration + Fuel** - Point an agent at pinned real corpora and harvest defects reproducibly over MCP stdio (completed 2026-07-03)

## Phase Details

### Phase 1: Capture Foundation

**Goal**: An agent can snapshot a stuck/failed live session into a self-replaying capture artifact with one MCP verb — the foundational substrate the rest of the loop reads.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, CAP-05
**Success Criteria** (what must be TRUE):

  1. An agent calls one MCP verb (`agda_capture_session`) mid-session and receives a `CaptureArtifact` envelope in `ToolResult.data`; the tool writes nothing to the repo (emit-only, following the `agda_bug_report_bundle` precedent). (CAP-03)
  2. Every capture is auto-stamped into a full replay manifest from the live session — Agda version + pinned binary path, server/Node/OS, the merged flags as an ordered argv (duplicates preserved), realized `AGDA_DIR` contents, cwd/root, fresh-vs-shared `_build`, and a content-hash of the full transitive import closure — never caller-supplied. (CAP-01)
  3. A recorded session action log (ordered tool calls + args + normalized envelopes at the `--interaction-json` stdio seam) is attached to the artifact and can be replayed. (CAP-04)
  4. Re-capturing the same defect routes as an `update` with an incremented recurrence count via the `fingerprintBugReport()` → prior-report index, not a new `new-bug`. (CAP-02)
  5. The oracle substrate is captured: the agent's source diff, the intended goal type at task-start, and a task-authored expected top-level signature (reusing `Cmd_goal_type`/`Cmd_infer_toplevel`). (CAP-05)
  6. A captured bundle self-replays from a cold start on a second machine, proving it is a full replay manifest (manifest + closure hash + inline fixture source) rather than a snapshot.

**Plans**: 5 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Capture-tool walking skeleton: full type contract, minimal manifest, CAP-02 dedup routing, emit-only agda_capture_session tool

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — CAP-01 full replay-manifest fidelity: ordered/duplicate-preserving argv, realized AGDA_DIR, build-freshness, import-closure hash + D-07 first-party source inlining
- [x] 01-03-PLAN.md — CAP-04 bounded ring-buffer recorder hooked at the MCP tool-call boundary, gated by AGDA_MCP_CAPTURE=1
- [x] 01-04-PLAN.md — CAP-05 oracle substrate: before/after source diff resolution (agent-supplied > git > unavailable), live intended goal type

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-05-PLAN.md — Capstone integration: wires recorded actions + oracle substrate into the tool, dedup-index promotion script, cold-self-replay verification script (success criterion 6)

### Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance)

**Goal**: A capture can be judged "true green" only when three composable predicates agree — because a fresh `agda` re-run on identical source+flags is a sound oracle for exactly one false-green family (the server's own), and structurally blind to the two the real agda-unimath/Hopf dogfooding makes first-class (agent soundness cheats; proved-the-wrong-statement).
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: ORCL-01, ORCL-02, ORCL-03
**Success Criteria** (what must be TRUE):

  1. ORCL-01 re-runs the capture as a fresh `agda --interaction-json` `Cmd_load` (never batch `agda File.agda`), replaying the manifest's binary+version, library registration, ordered flag argv, cwd/root, an isolated fresh `_build`, and the pinned import closure; it diffs the normalized classification tuple + error/warning category set, never raw text/timing. (ORCL-01)
  2. ORCL-01 emits a candidate server false-green (#64/#61/#65/#66) only when warm-green/cold-red AND every environment probe passes; any failing probe (version / agdaDir-hash / closure-hash / `_build` / spawn / terminus) → INCONCLUSIVE naming the probe, never "server bug". The abstention/INCONCLUSIVE rate is surfaced as a first-class metric. (ORCL-01)
  3. ORCL-02 (cheap half) scans the captured diff + the target term's *fully-transitive* closure (`agda_postulate_closure`, recursing through type signatures — the transitive hole Lean's `#print axioms` shipped, #8840) for introduced `postulate` / TERMINATING / `NO_*_CHECK` / `primTrustMe` / **FFI `COMPILE`/builtin** / unsafe OPTIONS / a `--with-K` override / residual `?` holes, diffed against a per-project sanctioned-axiom whitelist (unimath: univalence, funext, replacement), distinguishing cheats from legitimate HIT postulates. (ORCL-02)
  4. ORCL-03 (advisory) alpha-diffs the proven `Cmd_infer_toplevel` signature against CAP-05's expected signature over normalized internal types (not printed strings), flagging narrowing / added-premises / renames / target-edits for human review — never a hard gate; it may also carry a lightweight consistency probe (attempt the negation / derive `⊥`) to flag vacuous statements. (ORCL-03)
  5. It is explicit that ORCL-01 passing is necessary-but-insufficient: only all three predicates together justify "true green", and ORCL-01's cold result is the correct expected value handed to Phase 3.

**Plans**: 5 plans

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — ORCL-01 foundation: WR-08 replay-fidelity fix + shared disposable cold-Agda-session lifecycle + 7 environment probes
- [x] 02-02-PLAN.md — ORCL-02 soundness-hygiene scan: policy file, widened pragma/FFI scan vocabulary, transitive closure walk, whitelist-diff

**Wave 2** *(blocked on 02-01)*

- [x] 02-03-PLAN.md — ORCL-01 completion: materialization + library-registration replay + cold Cmd_load + normalized tuple/category-set diff

**Wave 3** *(blocked on 02-03)*

- [x] 02-04-PLAN.md — ORCL-03 conformance proxy: alpha-diff comparison + cold Cmd_load/Cmd_infer_toplevel on a shared session

**Wave 4** *(blocked on 02-02, 02-03, 02-04)*

- [x] 02-05-PLAN.md — Verdict composition: D-02 schema, single CLI entry point, verdict sidecar, abstention-rate metric

### Phase 3: Regression Lock Pipeline

**Goal**: A captured defect becomes a minimal reproduction and a durable vitest regression that starts RED, asserts the oracle's correct behavior on the normalized envelope, and turns green only when fixed — proven end-to-end on the #64/#61 false-green.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: REPRO-01, LOCK-01, LOCK-02, LOCK-03
**Success Criteria** (what must be TRUE):

  1. A captured defect yields a minimal reproduction — the offending source snapshotted into a fixture plus the recorded trigger sequence — that the maintainer or an agent can deterministically re-trigger (assisted/manual trimming; automatic minimization out of scope). (REPRO-01)
  2. Fixture materialization writes the minimal `.agda` repro under the established `test/fixtures/agda/` convention with automated placement + naming, mirroring the #65/#66 fixtures. (LOCK-01)
  3. The regression-test emitter turns a captured bundle + fixture into a durable vitest test that starts RED, asserts the *correct* behavior using ORCL-01's cold result as the expected value, and asserts on the normalized `ToolResult` envelope rather than wire order/timing (robust across Agda 2.6.4.3–2.9.0); it refuses to lock a capture that fails ORCL-02 or is ORCL-01 INCONCLUSIVE (never golden-masters a cheat). (LOCK-02)
  4. The #64/#61 transitive-staleness / false-green defect is produced through the emitter as a from-RED test + fixture that goes green only when the defect is fixed — proving the scaffold works end-to-end and filling the highest-priority known coverage gap. (LOCK-03)

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Foundation: close the Phase-1 capture-staging collision (BLOCKER) + define the capture-regression matrix contract (D-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Shared replay mechanics helper + the regression-test emitter (refusal gate, baseline-diff materialization, RED self-check, CLI)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Generic capture-regression replay runner + the #64/#61 flagship end-to-end proof (real capture -> emit -> RED)

### Phase 03.1: Fix the #64/#61 transitive-staleness false-green and flip the flagship lock to green (INSERTED)

**Goal**: The first loop-surfaced defect is closed end-to-end — `agda_load_no_metas` stops reporting a false `ok-complete` on a transitive-staleness truncation, and Phase 3's flagship regression flips from RED to locked — proving the capture → lock → **fix** → stay-locked loop throughput, not just its intake.
**Depends on**: Phase 3
**Requirements**: FIX-01
**Success Criteria** (what must be TRUE):

  1. `runLoadNoMetas` (`src/agda/session-load-impl.ts`) gains a fail-closed terminus/completion guard: when the strict-load response stream ends before a terminal load event (the #65/#66 truncation mechanism), it reports a failure (a `load-incomplete-no-terminus`-equivalent), never a false `ok-complete`/`success:true` — closing the deliberate asymmetry `e38f90a` left between `runLoad` (guarded) and `runLoadNoMetas` (unguarded). (FIX-01)
  2. The guard is a VARIANT appropriate to `Cmd_load_no_metas`, which legitimately emits no `InteractionPoints`/`AllGoalsWarnings` — the fix distinguishes "stream truncated before a terminal event" from "load legitimately completed with no goals", so it never false-REDs a genuinely-complete strict load (no naive `awaitGoalTerminus:true` copy that would break the fast path). (FIX-01)
  3. The `issue-64-61-transitive-staleness` capture-regression matrix entry flips `status: "red"` → `status: "locked"`: the warm `agda_load_no_metas` reload under the pathological idle env now reports the cold-correct outcome, `matchesExpected(observed, expected)` becomes true, and `test/integration/mcp/capture-regression.test.ts` asserts it green (the lock closes). (FIX-01)
  4. No regression: full suite stays green — the metas path (`agda_load`/`agda_typecheck`) is unchanged and still fails closed; small/fast strict loads still succeed; the change is minimal and confined to the load/completion-detection surface (`src/agda/session-load-impl.ts`, `src/session/command-completion.ts`, `src/session/agda-transport.ts` as needed), honoring the 500-line ceiling and command-builder SSOT. (FIX-01)

**Plans**: 2 plans

Plans:
**Wave 1**

- [x] 03.1-01-PLAN.md — The fix: generalize the transport's terminus tracking (extract to load-terminus-tracker.ts to honor the 500-line ceiling), thread loadTerminusMode through session.ts/session-command-dispatch.ts, flip runLoadNoMetas to strict mode

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03.1-02-PLAN.md — The proof: flip the flagship lock to green, add the D-05 goal-less-load guard entry, and run the full no-regression sweep against real Agda

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

**Plans**: 5 plans

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — QUEUE-01 engine: zod schema + typed loader, intake upsert (append-new/bump-in-place), CAP-02 dedup repoint to the queue file
- [x] 04-02-PLAN.md — QUEUE-03 wiring: embed classifyAgdaError()'s output on every capture + fix the fingerprint-fidelity gap

**Wave 2** *(blocked on 04-01 completion)*

- [x] 04-03-PLAN.md — QUEUE-01 seed data: the real 13-entry cargo (flagship + CHG-REVERIFY confirmed + CHG needs-reverify specs)
- [x] 04-04-PLAN.md — QUEUE-04 GitHub mirror: dry-run-default, idempotent one-way upsert via execFileSync

**Wave 3** *(blocked on 04-01, 04-03 completion)*

- [x] 04-05-PLAN.md — QUEUE-02 priority scoring + D-03 regenerated dashboard (close-rate + WIP-limit advisory)

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

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — PROC-02 fuel-pointer set (4 pinned corpora + policy files) + PROC-01 task-manifest hard-gate contract

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — The recording proxy: transparent stdio tee, unconditional AGDA_MCP_CAPTURE=1, auto-persist, run report (never a second AgdaSession, #39)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-03-PLAN.md — Wrap-up pipeline: oracle triad -> N-times warm-replay flake gate -> fix-queue filing / gitignored side-channel
- [x] 05-04-PLAN.md — Dogfooding runbook packaged as a cross-tool Agent Skill (.agents/skills/) + idempotent install script

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Capture Foundation | 5/5 | Complete   | 2026-07-02 |
| 2. Cold-Compiler Ground-Truth Oracle | 5/5 | Complete   | 2026-07-02 |
| 3. Regression Lock Pipeline | 3/3 | Complete   | 2026-07-02 |
| 4. Triage / Fix Queue | 5/5 | Complete   | 2026-07-02 |
| 5. Dogfooding Orchestration + Fuel | 4/4 | Complete   | 2026-07-03 |
