# Requirements: Agda MCP Server — Self-Improvement Loop (Loop ②)

**Defined:** 2026-07-01
**Core Value:** Every real proof session reliably converts into a stronger server — the closed loop (use it → surface a defect → capture it → fix and lock it with a regression test → use it again) must work reproducibly by hand.

## v1 Requirements

The reproducible scaffold. Each requirement maps to a roadmap phase. "Actors" are the maintainer and AI coding agents (Codex, Claude Code) driving the server.

### Capture (CAP)

- [ ] **CAP-01**: A captured failure bundle is auto-stamped with the live session's toolchain (Agda version, server version, Node/OS, `commandLineOptions`, `.agda-mcp.json` snapshot) instead of caller-supplied values, so any capture is a complete replay manifest
- [ ] **CAP-02**: A local fingerprint→prior-report dedup index routes a re-captured defect as `update` (with recurrence count) rather than a new `new-bug`, keying on the existing `fingerprintBugReport()` sha256
- [ ] **CAP-03**: An agent can capture the current stuck/failed session into an on-disk bundle with one MCP verb (e.g. `agda_capture_failure`), emit-only (never writes into the repo tree itself — an out-of-band step persists it), following the `agda_bug_report_bundle` precedent
- [ ] **CAP-04**: A session action log records the ordered tool calls + args + normalized envelopes for a session (via a recorder/replayer at the Agda `--interaction-json` stdio seam), giving a replayable trace that repro-extraction and test emission both read

### Ground-Truth Oracle (ORCL)

- [ ] **ORCL-01**: A cold-compiler differential oracle runs a fresh `agda` invocation on the pinned toolchain and diffs its result against the live session's classification, detecting/confirming the false-green class (server said `ok-complete`, cold compiler says ERROR — #64/#61) and supplying the correct expected result

### Reproduction (REPRO)

- [ ] **REPRO-01**: A captured defect yields a minimal reproduction — the offending source snapshotted into a fixture plus the recorded trigger sequence — so the maintainer or an agent can deterministically re-trigger it (assisted/manual trimming; automatic minimization is out of scope for v1)

### Regression Lock (LOCK)

- [ ] **LOCK-01**: Fixture materialization writes the minimal `.agda` repro under the established `test/fixtures/agda/` convention with automated placement + naming (as the #65/#66 fixtures already demonstrate)
- [ ] **LOCK-02**: A regression-test emitter turns a captured bundle + fixture into a durable `vitest` test that starts RED, asserts the *correct* behavior against the cold-compiler oracle (never golden-masters false-green behavior), and asserts on the normalized `ToolResult` envelope rather than wire order/timing (robust across Agda 2.6.4.3–2.9.0)
- [ ] **LOCK-03**: The first real regression — the transitive-staleness / false-green defect (#64/#61) — is produced through the emitter as a from-RED test + fixture, both proving the scaffold works end-to-end and filling the highest-priority known coverage gap

### Triage / Fix Queue (QUEUE)

- [ ] **QUEUE-01**: An in-repo flat-file fix queue (JSONL/markdown) is the single source of truth for captured defects, each with status (new/triaged/fixing/locked) and keyed by fingerprint; captured defects persist and flow rather than evaporating at session end
- [ ] **QUEUE-02**: The queue carries a basic prioritization signal composed from already-captured data (false-green > crash > wrong-result > missing-feature; ties broken by recurrence count from the dedup index) giving the maintainer + agents one clear ordering
- [ ] **QUEUE-03**: An `agda_triage_error` classifier turns a raw Agda error into a machine class (e.g. `mechanical-import`, `parser-regression`, `coverage-missing`, `dep-failure`, `toolchain`) with a confidence score and suggested action, feeding both capture-time classification and fix-queue routing
- [ ] **QUEUE-04**: The in-repo queue can be mirrored one-way to GitHub Issues via `gh` (optional, non-authoritative — the flat file stays the SSOT)

### Dogfooding Process (PROC)

- [ ] **PROC-01**: A written dogfooding runbook + driver-prompt snippet makes the *process* reproducible — telling an agent when and how to invoke the capture verb while proving against real corpora, so "point Codex at stdlib and harvest defects" can be re-run on demand
- [ ] **PROC-02**: A pinned fuel pointer set lists the source corpora (agda-stdlib, chosen OSS Agda projects, the maintainer's own math project) with pinned commits, so dogfooding runs are reproducible across time

## v2 Requirements

Deferred until the scaffold is proven. Tracked, not in the current roadmap.

### Automation & Intelligence

- **AUTO-01**: Automatic repro minimization (ddmin-style trimming) — trigger: manual trimming becomes the bottleneck
- **AUTO-02**: Agent-facing capture contract — server proactively hints via `nextAction` ("this result smells like a defect — capture it") so agents stop missing defects they hit
- **AUTO-03**: Recurrence-weighted prioritization view (queue sorted/annotated by hit count)
- **AUTO-04**: Knowledge accumulation over accumulated traces (corpus/patterns / "what fixes worked")
- **AUTO-05**: Automatic / semi-automatic PR generation (needs a trustworthy oracle + human-gate track record)
- **AUTO-06**: Unattended loop orchestration (run → capture → triage cron over pinned fuel)

### Product (separate north star)

- **LOOP1-01**: Loop ① productization — turn-based, server-side proof guidance (running Loop ① later becomes fuel for Loop ②)

### External / Blocked

- **CI-01**: Multi-version Agda matrix CI (#41) — blocked on upstream `setup-agda@v2` bundles; until then, per-capture Agda-version stamping keeps version-specific defects attributable

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Curated proof benchmark suite | Fuel is organic real usage; a curated set risks "testing for the sake of testing" and misses real defect shapes |
| General-purpose bug-tracker / dashboard / web UI | Solo maintainer + agents need no service; would add a DB/HTTP surface the stack forbids (Node builtins only, no DB) |
| New logger / database / HTTP dependency | Violates the existing "Node builtins, no DB, no HTTP server" posture |
| HTTP VCR libraries (nock / Polly / msw) | Wrong seam — the transport is bespoke IOTCM/JSON over stdio, not HTTP |
| LLM-graded MCP eval frameworks (`mcp-evals`) | Nondeterministic; Loop ① / v2 territory, not reproducible-scaffold work |
| Stack-version bumps (SDK 1.12→1.29, vitest 4.1.2→4.1.9) coupled into these phases | Orthogonal to Loop ②; keep decoupled to avoid conflating concerns |

## Traceability

Populated during roadmap creation. Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | TBD | Pending |
| CAP-02 | TBD | Pending |
| CAP-03 | TBD | Pending |
| CAP-04 | TBD | Pending |
| ORCL-01 | TBD | Pending |
| REPRO-01 | TBD | Pending |
| LOCK-01 | TBD | Pending |
| LOCK-02 | TBD | Pending |
| LOCK-03 | TBD | Pending |
| QUEUE-01 | TBD | Pending |
| QUEUE-02 | TBD | Pending |
| QUEUE-03 | TBD | Pending |
| QUEUE-04 | TBD | Pending |
| PROC-01 | TBD | Pending |
| PROC-02 | TBD | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 15 ⚠️ (roadmap will resolve)

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after initial definition*
