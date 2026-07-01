# Project Research Summary

**Project:** agda-mcp-server — Loop ② (reproducible self-improvement / dogfooding scaffold)
**Domain:** Reproducible agent-dogfooding + regression harness around a stateful external Agda subprocess, layered onto an existing Node 24 / TypeScript / vitest / `@modelcontextprotocol/sdk` MCP server
**Researched:** 2026-07-01
**Confidence:** HIGH

## Executive Summary

Loop ② is a bug-fix flywheel — **use it → surface a defect → capture it → fix and lock it with a regression test → use it again** — with two twists that shape every decision: the "users" are AI agents (Codex, Claude Code), so ergonomics means machine-actionable structured output and near-one-click capture, not dashboards; and the product under test is a *verification* tool, so the highest-value defect class is the **false green** (`ok-complete` on code a fresh compiler rejects — issues #64/#61). The unanimous cross-dimension verdict is **build almost nothing new**: vitest 4's built-in snapshot engine, `bug-report.ts`'s fingerprint bundles, the `mcp-harness.ts` stdio client, the fixture-matrix SSOT pattern, and GitHub Issues + `gh` already cover capture, regression, and triage. The one load-bearing piece with no off-the-shelf equivalent is a **session recorder/replayer at the Agda `--interaction-json` stdio seam** (a `RecordedTransport` cassette), because that transport is a bespoke IOTCM/JSON subprocess dialect, not HTTP — HTTP VCR libraries (`nock`, `polly`, `msw`) are the wrong seam entirely.

Architecturally, **the loop wraps the server; it does not live inside it.** The server is the product under test and is driven over the existing MCP stdio boundary exactly as an external agent would. Almost all machinery belongs in `scripts/` and repo data directories (`triage/`, `test/fixtures/regressions/`, `test/regression/`); the only justified `src/` additions are two surgical pieces — a pure `session-capture.ts` model (superset of `BugReportBundle`) and a thin **emit-only** `agda_capture_session` tool that snapshots live session state and writes nothing, following the `agda_bug_report_bundle` precedent exactly. This preserves the layered architecture, the 500-line ceiling, and the single-`AgdaSession` invariant (#39). `fingerprintBugReport()` is the cross-stage join key threading capture → triage → fixture → test, giving free dedup and cross-referencing at every stage.

The dominant risks are all reproducibility and correctness traps. Captures must be **full replay manifests** (Agda version, config, env timers, warm/cold session lineage, inline fixtures), not snapshots. Regression tests must **start RED and assert the correct behavior** against a cold `agda` oracle — never golden-master the current output, which for false-green bugs would ossify the defect and fail the day it is fixed. Assertions must target the normalized `ToolResult` envelope, not wire order or timing, because Agda response ordering drifts across the 2.6.4.3–2.9.0 support window (#58) while CI pins only 2.9.0 (#41). Timing/idle-completion nondeterminism (#65/#66) must be filtered by an N-rerun classify gate before filing. And phase ordering must be enforced — capture → manual triage → manual regression authoring → automation deferred to v2+ — so the loop's judgment calls (real vs. flake, essence vs. incidental, duplicate vs. distinct) are calibrated by hand before any automation encodes them at scale.

## Key Findings

### Recommended Stack

The stack is "reuse what exists; add one small module." Every layer of dogfood → capture → regression → fix queue is already covered by installed tooling; the only thing to *build* (not install) is the in-repo transcript recorder/replayer at the Agda stdio seam. Adding heavy deps (loggers, VCR libs, snapshot libs, MCP-eval frameworks) fights the project's "Node builtins + one CLI binary, hard 500-line ceiling, no DB/HTTP" posture for near-zero gain. See STACK.md.

**Core technologies (already present — reuse, do not replace):**
- **vitest 4.1.x** — test runner + built-in snapshot engine (`toMatchFileSnapshot`, custom serializers) — native mechanism for "captured session → locked regression"; serializers normalize volatile Agda output (paths, versions, meta numbers, timing). Zero new deps.
- **`@modelcontextprotocol/sdk` (^1.12.0)** via `test/helpers/mcp-harness.ts` — this *is* the dogfooding eval harness; drives built `dist/index.js` exactly as Codex/Claude Code do. Extend it, don't adopt a third-party framework.
- **`@fast-check/vitest` (^0.3.0)** — property-based TDD (AGENTS.md mandate); a defect that generalizes becomes an invariant/property, not just a single-example snapshot.
- **Node builtins (`child_process`, `fs`, `readline`, `crypto`) + `zod` v4** — subprocess capture, JSONL transcripts, stable hashing (already backs `bug-report.ts` fingerprints), schema-validate capture/bundle records.
- **GitHub Issues + `gh` CLI + in-repo JSONL SSOT** — the triage/fix queue; `bug-report.ts` already models `existingIssue?` and `new-bug`/`update`/`regression` kinds.

**The one thing to build:** a `RecordedTransport` — record every outbound IOTCM string + inbound `--interaction-json` message into an append-only JSONL cassette at the `command-builder.ts` SSOT seam (capture-flag gated), then replay it to yield a **deterministic regression test in the default `npm test` suite** (no live Agda, no `RUN_AGDA_INTEGRATION=1` gate). Store the normalized envelope via `toMatchFileSnapshot`; store the raw cassette as checked-in JSONL.

### Expected Features

The loop mechanically requires a handful of table-stakes pieces (miss any one and "capture → fix → lock" breaks). See FEATURES.md.

**Must have (table stakes for v1 — the scaffold):**
- **Env/version auto-stamping** on the existing bundle — reproducibility floor (auto-populate from live session, not caller-supplied).
- **Fingerprint dedup index** (fingerprint → existing report/issue; `new-bug` vs `update`) — keeps the queue from drowning.
- **One-verb capture tool** (`agda_capture_session`) — near-one-click snapshot of live session → bundle; friction kills the loop.
- **Session action log / trace** — the FOUNDATIONAL substrate; minimal-repro extraction and regression generation both trim/read it.
- **Cold-compiler differential oracle** — from-scratch `agda` run to detect/confirm false-green (#64/#61) and supply the *correct* expected result.
- **Minimal reproduction capture + fixture materialization** — snapshot offending source into `test/fixtures/regressions/`, record trigger sequence.
- **Regression-test emitter** — turn a bundle into a `vitest` test under the existing taxonomy that starts RED.
- **Triage/fix queue as flat file** (JSONL/markdown) with status + basic prioritization (false-green > crash > wrong-result > gap; tiebreak recurrence).
- **Dogfooding runbook + driver prompt + pinned fuel list** — makes the *process* reproducible; cheapest highest-leverage artifact.

**Should have (differentiators, v1.x — add once the manual loop demonstrably closes):**
- **Cold-compiler differential oracle as a first-class check** — turns false-green from "hope you notice" into "the loop notices" (the single most valuable differentiator for a verification tool).
- **`agda_triage_error` structured classifier** — machine bug-class + confidence + suggested action; feeds prioritization (also serves 0.7.0 agent-UX).
- **Agent-facing capture contract** (`nextAction` "this smells like a defect") — turns passive agents into active reporters.
- **Recurrence-weighted prioritization** — cheap once dedup exists; fix what actually bites.
- **First transitive-staleness regression fixture (#64/#61)** — highest-priority known coverage gap; natural first customer of the emitter.

**Defer (v2+ — anti-features for this milestone, per PROJECT.md):**
- Knowledge accumulation / learned corpus — needs data the scaffold produces first.
- Automatic / semi-automatic PR generation — auto-fixes risk cementing wrong behavior; needs trustworthy oracle + human gate.
- Curated proof benchmark suite — fuel is deliberately organic; curated sets risk "testing for the sake of testing."
- Unattended loop orchestration — automation over an unproven manual loop bakes in what's broken.
- Automatic repro minimization (ddmin) — slow/finicky over Agda typechecking; v1 ships assisted/manual trimming.
- Multi-version Agda matrix CI (#41) — blocked on upstream `setup-agda@v2`; v1 only stamps versions so defects are attributable.

### Architecture Approach

**The loop wraps the server; it does not live inside it.** Loop ② is process tooling surrounding the product. The only `src/` additions are a pure `session-capture.ts` model (wraps `BugReportBundle` + a session-snapshot shape, no I/O) and a thin emit-only `agda_capture_session` tool that returns a `CaptureArtifact` in `ToolResult.data` and writes nothing. Everything else — orchestration, materialization, queue, fixtures, tests — lives in `scripts/` and repo data dirs. `triage/` is committed (curated SSOT); `captures/` is gitignored (raw scratch). `fingerprintBugReport()` is the cross-stage join key. See ARCHITECTURE.md.

**Major components:**
1. **`src/reporting/session-capture.ts` (NEW, pure)** — `CaptureArtifact` model: superset of `BugReportBundle` + session-snapshot ref + transcript ref + repro source + versions.
2. **`src/tools/register-capture.ts` (NEW, thin)** — `agda_capture_session`: emits the artifact envelope, writes nothing; wired into `reporting-tools.ts` + `manifest.ts` + `mcp-tool-coverage.json`.
3. **`scripts/dogfood-run.mjs` (NEW)** — orchestrator: launches server over MCP stdio via the *existing* `mcp-harness.ts` / `mcp-local-client.mjs` (never a second `AgdaSession` — #39), drives an agent against pinned fuel, records the transcript, auto-persists captures.
4. **`scripts/capture-materialize.mjs` (NEW)** — artifact → `triage/<fingerprint>/` queue entry + `test/fixtures/regressions/<name>.agda` + `regression-matrix.json` row + scaffolded vitest test.
5. **`test/regression/` matrix-driven runner (NEW)** — mirrors the existing `fixture-matrix.json` SSOT pattern; iterates rows, replays each fixture through the harness, asserts fixed behavior. Adding a regression is a data edit + fixture file.
6. **`scripts/triage-sync.mjs` (NEW, optional)** — one-way mirror of the in-repo queue → GitHub issues via `gh` (`existingIssue` field is the pointer). In-repo files are SSOT; GitHub is a projection.

**Critical path to a working v1 loop:** capture model → capture tool → materializer → regression fixture/matrix format → orchestrator.

### Critical Pitfalls

Nine documented, grounded in this repo's CONCERNS.md and issues #58/#61/#64/#65/#66. Top five:

1. **Non-reproducible captures** — a bundle that can't be replayed is an anecdote. Make the capture a full **replay manifest**: pin `agda --version`, resolved project root, merged `.agda-mcp.json`, all `AGDA_MCP_*` env timers, the ordered prior-command lineage, warm-vs-cold flag, and inline fixture source (never a mutable path ref). Reject bundles that don't self-replay at capture time. Reproducibility is the *definition of done* for the capture phase.
2. **Regression tests that ossify buggy behavior (golden-master trap)** — snapshotting current output locks in false-green (#61/#64). A defect regression must **start RED** and assert the *desired* behavior; for false-green, assert "code a fresh `agda` rejects must NOT report `ok-complete`." Ban bare `toMatchSnapshot()` on defect regressions.
3. **`ok-complete` as a false oracle** — a warm session can report success for code cold `agda` rejects (transitive `.agdai` staleness, unescalated warnings). Verify cache/dependency-sensitive fixes against a **cold `agda` invocation**, default `--warning=error` where CI does, and add the transitive-staleness fixture (highest-priority coverage gap).
4. **Version drift / version-locked tests** — Agda response *ordering* differs across 2.6.4.3–2.9.0 (#58); CI pins only 2.9.0 (#41). Assert on the **normalized `ToolResult` envelope** (classification, goal IDs, severity), annotate every fixture with its Agda version, and leave a documented seam for the #41 matrix.
5. **Timing/idle nondeterminism + triage graveyard** — idle-timer heuristics (#65/#66) can file phantoms or mask real bugs; **re-run captures N times and classify** (deterministic → real; flaky → tag `timing/nondeterministic`, route to #58). And dedup on capture with a WIP limit + close-rate metric so intake (agent-fast) doesn't outpace throughput (human-slow) into a write-only queue.

Cross-cutting: **enforce phase ordering** (capture → manual triage → manual regression authoring → automation only v2+) and **hold the scope line** (no knowledge accumulation / auto-PR in any v1 phase criterion).

## Implications for Roadmap

Research points to a clean dependency-ordered structure. The capture substrate is foundational; the lock-in pipeline depends on it; orchestration ties it together; the queue adds backpressure. Phase ordering also *is* a pitfall-prevention mechanism (over-automation, scope creep).

### Phase 1: Capture Foundation (in-band, pure-first)
**Rationale:** The session action log / capture model is the foundational substrate — minimal-repro extraction, regression generation, and replay all read it. Everything is blocked on it. Pure-first means it's unit-testable with no live Agda.
**Delivers:** `src/reporting/session-capture.ts` (pure `CaptureArtifact` model), `schemas/capture-artifact.schema.json`, and the emit-only `agda_capture_session` tool wired into the manifest + coverage, plus env/version auto-stamping and the fingerprint dedup index.
**Addresses:** structured bundle (extend `bug-report.ts`), env/version stamping, fingerprint dedup, one-verb capture, session action log.
**Avoids:** Pitfall 1 (make the bundle a full replay manifest; reject non-self-replaying captures) and the emit-only anti-pattern (tool writes nothing).

### Phase 2: Lock-in Pipeline (out-of-band, defect → RED test)
**Rationale:** Once captures exist, the "lock it" half needs a materializer and a matrix-driven regression format. Establish the `regression-matrix.json` contract with one hand-made example (mirroring `fixture-matrix.json`) before automating.
**Delivers:** `test/fixtures/regressions/` + `regression-matrix.json` + `test/regression/` runner; `scripts/capture-materialize.mjs`; `triage/` fix-queue conventions (index + per-fingerprint report).
**Uses:** vitest snapshot engine + `RecordedTransport` cassette (deterministic default-suite tests), the cold-compiler differential oracle for expected values.
**Implements:** the materializer, matrix-driven regression runner, and in-repo fix queue components.
**Avoids:** Pitfalls 2, 4, 5, 9 — every regression starts RED, asserts the minimal invariant on the envelope (not wire bytes), normalizes volatile fields, and verifies false-green/cache-sensitive cases against a cold `agda` oracle. First customer: the transitive-staleness fixture (#64/#61).

### Phase 3: Orchestration + Fuel (tie the loop together)
**Rationale:** With a callable capture tool and a materialization pipeline, the orchestrator closes the loop end-to-end and makes the *process* reproducible. Reuses existing stdio drivers — never a second `AgdaSession`.
**Delivers:** `scripts/dogfood-run.mjs` (launch via harness, drive agent against pinned fuel, record transcript, auto-persist), the dogfooding runbook + driver prompt, and the pinned fuel-pointer set (stdlib / OSS / own math project at pinned commits).
**Addresses:** reproducible dogfooding workflow, runbook, fuel list; the N-rerun flake-classify gate.
**Avoids:** Pitfall 3 (flake classification at the capture boundary), the "harness builds its own AgdaSession" anti-pattern (#39), and the curated-benchmark anti-pattern (fixtures grow only from real captures).

### Phase 4 (thin / optional): Triage Reach + v1.x Differentiators
**Rationale:** Backpressure and prioritization matter once volume appears; keep lightweight and gate on the manual loop being "boringly repeatable."
**Delivers:** dedup-driven prioritization (recurrence weighting), WIP limit + close-rate metric, optional `scripts/triage-sync.mjs` GitHub mirror; then v1.x differentiators (`agda_triage_error` classifier, agent-facing `nextAction` capture contract) as triggered by real bottlenecks.
**Avoids:** Pitfall 6 (write-only graveyard) and Pitfall 7 (over-automation before the manual rubric is documented).

### Phase Ordering Rationale
- **Dependency-driven:** capture model unblocks everything; oracle must precede the regression emitter (a durable test asserts the *correct* result, which for false-green only cold `agda` supplies); dedup index gates useful prioritization. Critical path: capture model → capture tool → materializer → matrix format → orchestrator.
- **Architecture-driven grouping:** in-band `src/` additions (Phase 1) are isolated from out-of-band `scripts/` machinery (Phases 2–4), preserving the "loop wraps the server" boundary, the 500-line ceiling, and the #39 invariant.
- **Pitfall-driven sequencing:** manual capture → manual triage → manual regression authoring → automation is itself the antidote to over-automation (Pitfall 7) and scope creep (Pitfall 8). Each phase's success criteria must be checkable *without* v2+ features.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 — `/gsd:plan-phase --research-phase`:** the `RecordedTransport` / cassette design at the `command-builder.ts` seam is genuinely novel (no off-the-shelf equivalent); needs care on the record/replay contract, capture-flag gating, and what to normalize.
- **Phase 2:** the cold-compiler differential oracle (from-scratch `agda` shell-out, `-Werror` defaulting, transitive-staleness import-graph walk) is domain-specific and correctness-critical; and the "starts RED + assert-envelope-invariant" rubric needs to be pinned down before the first test.

Phases with standard patterns (can skip research-phase):
- **Phase 2 regression matrix + fixtures:** directly mirrors the existing `fixture-matrix.json` SSOT — proven pattern, data-edit workflow.
- **Phase 3 orchestrator:** reuses existing `mcp-harness.ts` / `mcp-local-client.mjs` stdio drivers; well-trodden.
- **Phase 4 queue + GitHub sync:** flat-file JSONL + `gh` CLI; established, low-risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | "Reuse existing stack, add one small module" grounded in authoritative codebase sources + npm version checks; MEDIUM only on the external MCP-eval landscape, which is out of v1 scope. |
| Features | MEDIUM-HIGH | Grounded in existing seeds (`bug-report.ts`, `docs/release-0.7.0-triage.md`) + established capture/regression/triage practice; few direct competitors (Agda-MCP dogfooding is niche). |
| Architecture | HIGH | Codebase-integration decisions grounded in existing source (`bug-report.ts`, reporting tools, `fixture-matrix.json`, MCP harness); MEDIUM only on loop-design opinions (reasoned from constraints, not externally benchmarked). |
| Pitfalls | HIGH | Domain-specific pitfalls grounded in this repo's CONCERNS.md + issues #58/#61/#64/#65/#66 + commit `e38f90a`; MEDIUM on general dogfooding-graveyard failure modes (established process wisdom). |

**Overall confidence:** HIGH

### Gaps to Address
- **`RecordedTransport` fidelity across the `--interaction-json` protocol:** the record/replay contract and normalization rules are novel; validate the cassette faithfully drives the real product path during Phase 1 planning. Design so a future #41 multi-version matrix runs the *same* fixtures without rewrites.
- **Cross-version ordering (#58) with CI pinned to 2.9.0 (#41):** green CI does not prove 2.6.4.3–2.9.0 coverage. Version-annotate every fixture, assert on the envelope, and leave the #41 matrix seam documented — but the actual matrix is blocked on upstream `setup-agda@v2` (external).
- **Manual-loop rubric for later automation:** v1 deliberately leaves capture/triage/test judgment calls to humans; record those decisions so v2 automation has a spec. No automation phase should precede a documented, stable manual rubric.
- **Security seam for capture/replay I/O:** any new file read/write must reuse `src/session/safe-source-io.ts` (`O_NOFOLLOW`, 512 KiB cap, atomic rename) and the `findAgdaProjectRoot` sandbox — never a parallel ad-hoc path, especially when replaying fixtures from untrusted proof projects.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — milestone scope, Out-of-Scope decisions, constraints, invariants (#39, command-builder SSOT, 500-line ceiling, Agda 2.6.4.3–2.9.0).
- `.planning/codebase/CONCERNS.md` + `.planning/codebase/{ARCHITECTURE,STRUCTURE,STACK,TESTING}.md` — `AgdaTransport` shared-state cluster (#58), idle-timer completion heuristic, false-green #64/#61, load-classification fragility #65/#66, layering, single-`AgdaSession`.
- `src/reporting/bug-report.ts` — existing `BugReportBundle` + `fingerprintBugReport` (capture + dedup seed).
- `src/tools/register-bug-bundles.ts`, `src/tools/reporting-tools.ts` — emit-only bundle-tool precedent.
- `test/fixtures/agda/fixture-matrix.json`, `test/fixtures/e2e/mcp-tool-coverage.json`, `test/helpers/mcp-harness.ts`, `scripts/mcp-local-client.mjs` — matrix-driven SSOT + stdio drivers reused by the loop.
- `docs/release-0.7.0-triage.md` — `agda_triage_error` / `agda_bulk_status` scoping.
- `tooling/protocol/data/official-cross-version-notes.json` — cross-version response-ordering SSOT.
- Repo issues/commit: #39, #41, #58, #61, #64, #65, #66; commit `e38f90a`.
- npm registry version checks (2026-07-01): `vitest` 4.1.9, `@modelcontextprotocol/sdk` 1.29.0, `@fast-check/vitest` 0.4.1, `zod` 4.4.3, `@modelcontextprotocol/inspector` 0.22.0.

### Secondary (MEDIUM confidence)
- MCP evaluation / dogfooding landscape (WebSearch): Anthropic "Demystifying evals for AI agents"; modelcontextprotocol.io tools spec; MCP 2026 release candidate — mostly out of v1 scope (LLM-in-the-loop grading is Loop ①/v2+).
- General defect-capture / test practice: fingerprint dedup, ddmin minimization, differential oracles, golden-master ossification, bug-tracker bankruptcy, WIP-limited pull systems (established engineering practice, not tool-specific).

---
*Research completed: 2026-07-01*
*Ready for roadmap: yes*
