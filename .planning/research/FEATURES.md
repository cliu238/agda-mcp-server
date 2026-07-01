# Feature Research

**Domain:** Self-improvement / dogfooding loop ("Loop ②") for an MCP server driving Agda interactive proving
**Researched:** 2026-07-01
**Confidence:** MEDIUM-HIGH (grounded in existing codebase seeds + established capture/regression/triage practice; domain-specific to Agda MCP so few direct competitors)

## Framing

The loop is: **use it → surface a defect → capture it → fix and lock it with a regression test → use it again.** This is the classic bug-fix flywheel, but with two twists that shape every feature decision:

1. **The "users" are AI agents (Codex, Claude Code), not humans.** Ergonomics means *machine-actionable* structured output, near-one-click capture verbs, and low-friction handoff — not dashboards.
2. **The product under test is a verification tool.** The single most valuable defect class is the *false green* (`ok-complete` on code a fresh compiler rejects — issues #64/#61). Capture and regression features must be able to express "the server said OK but ground truth says ERROR." Fidelity of the oracle matters more than volume.

v1 scope is explicitly the **reproducible scaffold** — the mechanical loop must close by hand before any automation or knowledge accumulation is layered on. Existing seed: `src/reporting/bug-report.ts` (fingerprint + stable bundle) already covers a large slice of the capture surface.

## Feature Landscape

### Table Stakes (Loop Won't Close Without These)

Features the loop mechanically requires. Missing any one breaks "capture → fix → lock."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **(a) Structured failure bundle** (fingerprint, observed/expected, reproduction steps, diagnostics, tool payload) | Already the entry point (`bug-report.ts`); a report you can't act on is noise | LOW | Exists. Extend, don't rebuild. |
| **(a) Environment + version stamping** (Agda version, server version, Node, OS, `commandLineOptions`, `.agda-mcp.json` snapshot) | Agda response ordering varies 2.7/2.8 vs 2.9 (#58/#41); a repro without the toolchain pin is not reproducible | LOW | `BugReportBundleInput` already has `agdaVersion`/`serverVersion`/`environment` — wire in auto-population from live session instead of caller-supplied. |
| **(a) Deterministic fingerprint + dedup** | Same defect surfaces across many sessions/files; without dedup the queue drowns | LOW | `fingerprintBugReport` (sha256, 16 char) exists. Need: a local dedup index (fingerprint → existing report/issue) so re-captures become `update` not `new-bug` (kind already modeled). |
| **(a) Minimal reproduction capture** (the exact tool call sequence + minimal `.agda` fixture that triggers it) | An agent/maintainer must re-trigger the defect deterministically to fix and to prove the fix | MEDIUM | This is the crux. Needs a session action log (ordered tool calls + args) and a way to snapshot/trim the offending source into a fixture. |
| **(a) Ground-truth oracle stamp** (what a fresh `agda` invocation on the pinned toolchain reports vs what the server reported) | The false-green class (#64/#61) is *only* expressible as "server said X, cold compiler said Y" | MEDIUM | The differentiating capture field for a verification tool. Requires a from-scratch `agda` shell-out helper as the oracle. |
| **(b) Session → regression test scaffold** | The "lock it" half of the loop; a fix without a test is not locked | MEDIUM | Emit a `vitest` test (unit or `test/integration/agda/`) from a captured bundle + fixture. Matches existing test taxonomy (unit/property/integration/examples). |
| **(b) Fixture materialization** (write the minimal `.agda` under `test/fixtures/agda/`) | Regression tests need a durable on-disk repro (as `LargeDeepHole.agda` etc. already do for #65/#66) | LOW-MEDIUM | Convention already established by the #65/#66 fixtures. Automate placement + naming. |
| **(c) Triage/fix queue** (durable list of captured issues with status: new/triaged/fixing/locked) | Captured defects must persist and flow, not evaporate at session end | LOW-MEDIUM | v1 can be a structured file (JSONL/markdown) or GitHub issues — not a service. Fingerprint is the primary key. |
| **(c) Basic prioritization signal** (severity + false-green flag + recurrence count + affected-tool) | A solo maintainer + agents need one ordering, not a full scoring engine | LOW | Compose from data already captured: false-green > crash > wrong-result > missing-feature; break ties by recurrence count from the dedup index. |
| **(d) One-verb capture from a stuck session** ("capture this failure now") | The whole loop dies if capture is high-friction; agents must invoke it in-flow | LOW-MEDIUM | An MCP tool (e.g. `agda_capture_failure`) that snapshots current session state → bundle. Builds directly on `bug-report.ts`. |
| **(d) A written dogfooding runbook / driver prompt** | Reproducibility of the *process*, not just individual bugs; a solo maintainer must be able to re-run "point Codex at stdlib and harvest defects" | LOW | Markdown runbook + a system-prompt snippet telling the agent when/how to call the capture verb. Cheapest highest-leverage v1 artifact. |
| **(d) Fuel pointer set** (list of source corpora: agda-stdlib, chosen OSS projects, own math project) | The loop needs input; "organic fuel" still needs a concrete, pinned starting list | LOW | Config listing repos + pinned commits so runs are reproducible across time. |

### Differentiators (Where This Loop Earns Its Keep)

Features that make the loop compound faster than ad-hoc bug fixing — align with the Core Value ("every real proof session reliably converts into a stronger server").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Cold-compiler differential oracle as a first-class check** | Automatically flags false-green (#64/#61) by diffing live-session classification against a from-scratch `agda` run — turns the highest-impact bug class from "hope you notice" into "the loop notices" | MEDIUM | The single most valuable differentiator for a *verification* tool. Doubles as an assertion generator for regression tests. |
| **Session action log / replayable trace** | Every tool call + args + envelope recorded so any session is replayable → minimal repro is a *trim* of a real trace, not hand-authored | MEDIUM | Enables both minimal-repro extraction and regression-test generation from the same substrate. Foundational — many features depend on it. |
| **Automatic repro minimization (delta-style trimming)** | Shrinks the captured `.agda` + call sequence to the smallest still-failing case (ddmin-style) | HIGH | Big actionability win but expensive; v1 can ship manual/assisted trimming and defer automatic shrinking. Flag as v1.x. |
| **`agda_triage_error` structured classifier** | Turns a raw Agda error into a machine class (`mechanical-import`, `parser-regression`, `coverage-missing`, `dep-failure`, `toolchain`, …) with confidence + suggested action — feeds triage prioritization directly | MEDIUM | Already scoped in `docs/release-0.7.0-triage.md` §2.2. Doubles as a capture-classification and a fix-queue routing signal. |
| **Regression-test emitter that asserts the *fixed* behavior** | Generated test encodes both the repro and the oracle's expected result, so it fails today and passes post-fix — a true executable lock | MEDIUM | Depends on the oracle + action log. This is what makes "lock it" real rather than aspirational. |
| **Recurrence-weighted prioritization** | Dedup index counts how often a fingerprint reappears across dogfooding runs; hot defects float up automatically | LOW-MEDIUM | Cheap once dedup exists; a genuinely useful solo-maintainer signal (fix what actually bites). |
| **Agent-facing capture contract in tool output** (`nextAction` hint: "this looks like a defect — call `agda_capture_failure`") | Server proactively tells the driving agent when a result smells like a bug, closing the "agent didn't realize it hit a bug" gap | LOW | Extends existing `nextAction` recovery-hint mechanism. Turns passive agents into active reporters. |

### Anti-Features (Deliberately NOT in v1)

Explicitly out of scope per PROJECT.md, plus common scope-creep traps. Document to prevent drift.

| Feature | Why Requested | Why Problematic (for v1) | Alternative |
|---------|---------------|--------------------------|-------------|
| **Knowledge accumulation system** (learned corpus of sessions/patterns, embeddings, "what fixes worked") | Feels like the natural next step; "the loop should learn" | Requires the scaffold to exist and produce data first; premature = building analytics over an empty/unstable dataset | Ship the scaffold; the action log + fix queue *is* the raw corpus for a v2 knowledge layer. |
| **Automatic / semi-automatic PR generation** (agent fixes bug → opens PR) | "Close the whole loop automatically" | For a verification tool, auto-fixes risk cementing wrong behavior; needs a trustworthy oracle + human gate first; large blast radius | Keep the human (maintainer) in the fix step for v1. Auto-PR is explicitly v2+. |
| **Curated proof benchmark suite** | "We should have a standard test set" | PROJECT.md rejects this: fuel is organic real usage; a curated set risks "testing for the sake of testing" and misses real-world defect shapes | Use pinned real corpora (stdlib, OSS, own math project) as fuel; regression fixtures accumulate organically from actual captures. |
| **Fully automatic loop orchestration** (unattended run-capture-triage-fix cron) | "Make it run itself" | Automation over an unproven manual loop bakes in whatever's broken; hides failures | Manual/assisted v1; the runbook + capture verb make each step cheap enough to run by hand. |
| **General-purpose bug-tracker / dashboard / web UI** | "We need visibility" | Solo maintainer + agents don't need a service; adds a database/HTTP surface the stack explicitly forbids (no DB, no HTTP server) | Flat-file queue (JSONL/markdown) or GitHub Issues via `gh`. Fingerprint is the index. |
| **Automatic repro minimization in v1** | "Minimal repros are gold" | ddmin over Agda typechecking is slow and finicky; high complexity for a first cut | Assisted/manual trimming in v1; captured full trace is already reproducible. Automate in v1.x once the loop is proven. |
| **Multi-version Agda matrix CI in this milestone** | Cross-version ordering bugs (#58/#41) are real | Blocked on upstream `setup-agda@v2` bundles (#41) — not actionable from this repo alone | Stamp the Agda version in every capture so version-specific defects are *attributable*; pursue matrix CI when upstream unblocks. |
| **Loop ① productization** (turn-based server-side proof guidance) | It's the north-star product | Needs more exploration; different concern from process hardening; would balloon scope | Deferred by decision. Note: running Loop ① later becomes *fuel* for Loop ②. |

## Feature Dependencies

```
(d) Dogfooding runbook + fuel pointers
        └──drives──> Real proof sessions
                          └──produces──> (differentiator) Session action log / trace  [FOUNDATIONAL]
                                              ├──requires──> (a) Structured failure bundle  [EXISTS: bug-report.ts]
                                              │                    └──requires──> (a) Env/version stamping
                                              │                    └──requires──> (a) Fingerprint + dedup index
                                              ├──enables──> (a) Minimal reproduction capture
                                              │                    └──enables──> (b) Fixture materialization
                                              │                                       └──enables──> (b) Regression-test emitter
                                              └──enables──> (differentiator) Cold-compiler differential oracle
                                                                   ├──sharpens──> (a) Ground-truth oracle stamp
                                                                   └──feeds──> (b) Regression-test emitter (expected result)

(d) One-verb capture (agda_capture_failure)  ──packages──> (a) bundle + trace snapshot
        └──enhanced by──> Agent-facing capture contract (nextAction "this is a defect")

(a) Fingerprint + dedup  ──feeds──> (c) Triage/fix queue
                                          └──ordered by──> (c) Prioritization signal
                                                               ├──uses──> false-green flag (from oracle)
                                                               ├──uses──> recurrence count (from dedup)
                                                               └──uses──> agda_triage_error class (differentiator)
```

### Dependency Notes

- **Session action log is the foundational substrate:** minimal-repro extraction, regression-test generation, and replay all trim/read the same recorded trace. Build this early — most differentiators are blocked on it.
- **Regression-test emitter requires the oracle:** a durable test must assert the *correct* expected result, which for false-green defects only the cold-compiler oracle can supply. Oracle before emitter.
- **Dedup index gates useful prioritization:** recurrence-weighting and `new-bug` vs `update` routing both need the fingerprint → prior-report index. `bug-report.ts` gives the fingerprint; the index is the missing piece.
- **Capture verb depends on the bundle + trace but not on the queue:** you can capture before the queue exists (write bundles to disk); wiring capture → queue is a thin follow-on.
- **`agda_triage_error` is shared infrastructure:** it's both a capture-time classifier and a fix-queue routing signal; it also serves the separate 0.7.0 agent-UX goals, so it may be prioritized independently.

## MVP Definition

### Launch With (v1 — the reproducible scaffold)

Minimum to close the loop **by hand**, reproducibly.

- [ ] **Env/version auto-stamping** on the existing bundle — reproducibility floor. (LOW)
- [ ] **Fingerprint dedup index** (fingerprint → existing report/issue; `new-bug` vs `update`). (LOW)
- [ ] **One-verb capture tool** (`agda_capture_failure`) snapshotting live session → bundle on disk. (LOW-MEDIUM)
- [ ] **Session action log** (ordered tool calls + args + envelopes) — substrate for repro + tests. (MEDIUM)
- [ ] **Cold-compiler differential oracle** — from-scratch `agda` run to detect/confirm false-green; supplies expected result. (MEDIUM)
- [ ] **Minimal reproduction capture** (assisted: snapshot offending source into a fixture, record trigger sequence). (MEDIUM)
- [ ] **Regression-test emitter + fixture materialization** — turn a bundle into a `vitest` test under the existing taxonomy. (MEDIUM)
- [ ] **Triage/fix queue as flat file** with status + basic prioritization (false-green > crash > wrong-result > gap; tiebreak recurrence). (LOW-MEDIUM)
- [ ] **Dogfooding runbook + driver prompt + pinned fuel list** — makes the *process* reproducible. (LOW)

### Add After Validation (v1.x)

Add once the manual loop is demonstrably closing.

- [ ] **Automatic repro minimization** (ddmin-style trimming) — trigger: manual trimming becomes the bottleneck. (HIGH)
- [ ] **`agda_triage_error` structured classifier** — trigger: queue volume makes manual classification the bottleneck (also serves 0.7.0 agent-UX). (MEDIUM)
- [ ] **Agent-facing capture contract** (`nextAction` "this smells like a defect") — trigger: agents miss defects they hit. (LOW)
- [ ] **Recurrence-weighted prioritization dashboard-lite** (queue sorted/annotated by hit count). (LOW-MEDIUM)
- [ ] **First transitive-staleness regression fixture** (#64/#61) — highest-priority known coverage gap; a natural first customer of the emitter. (MEDIUM)

### Future Consideration (v2+)

Deferred until the scaffold is proven (per PROJECT.md Out of Scope).

- [ ] **Knowledge accumulation** (corpus/patterns over accumulated traces) — needs data the scaffold produces. (HIGH)
- [ ] **Automatic / semi-automatic PR generation** — needs trustworthy oracle + human-gate track record. (HIGH)
- [ ] **Unattended loop orchestration** — needs a proven manual loop first. (MEDIUM-HIGH)
- [ ] **Multi-version Agda matrix CI** (#41) — blocked on upstream `setup-agda@v2`. (external)
- [ ] **Loop ① productization** (turn-based guidance) — separate north-star. (HIGH)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Env/version auto-stamping | HIGH | LOW | P1 |
| Fingerprint dedup index | HIGH | LOW | P1 |
| One-verb capture tool | HIGH | LOW-MEDIUM | P1 |
| Session action log / trace | HIGH | MEDIUM | P1 |
| Cold-compiler differential oracle | HIGH | MEDIUM | P1 |
| Minimal reproduction capture (assisted) | HIGH | MEDIUM | P1 |
| Regression-test emitter + fixture materialization | HIGH | MEDIUM | P1 |
| Triage/fix queue (flat file) + basic prioritization | HIGH | LOW-MEDIUM | P1 |
| Dogfooding runbook + driver prompt + fuel list | HIGH | LOW | P1 |
| `agda_triage_error` classifier | MEDIUM | MEDIUM | P2 |
| Agent-facing capture contract (nextAction) | MEDIUM | LOW | P2 |
| Recurrence-weighted prioritization | MEDIUM | LOW-MEDIUM | P2 |
| Transitive-staleness regression fixture (#64/#61) | HIGH | MEDIUM | P2 |
| Automatic repro minimization | MEDIUM | HIGH | P3 |
| Knowledge accumulation | HIGH | HIGH | P3 (v2+) |
| Auto-PR generation | MEDIUM | HIGH | P3 (v2+) |

**Priority key:** P1 = must have for v1 loop to close · P2 = add when possible · P3 = future.

## Competitor / Prior-Art Feature Analysis

No direct competitor exists (Agda-MCP dogfooding is niche). The relevant prior art is general defect-capture and test-generation practice.

| Feature | Fuzzing/crash-report practice (e.g. libFuzzer/ClusterFuzz) | Bug-tracker practice (Sentry/GitHub Issues) | Our Approach |
|---------|-----------------------------------------------------------|---------------------------------------------|--------------|
| Dedup | Crash signature/stack hash | Fingerprint/grouping rules | sha256 fingerprint over normalized bundle identity (exists) |
| Minimal repro | Automatic testcase minimization (ddmin) | Manual "steps to reproduce" | Assisted trim from action log in v1; automatic ddmin deferred |
| Env stamping | Runner records toolchain/seed | Release/SDK/OS tags | Auto-stamp Agda + server + Node/OS + `commandLineOptions` |
| Oracle | Sanitizer / assertion crash | Human judgment | Cold-compiler differential (false-green detector) — domain-specific |
| Regression lock | Corpus entry re-run in CI | Linked failing test (manual) | Emit `vitest` fixture+test from bundle |
| Prioritization | Frequency + severity + reproducibility | Labels/severity/votes | false-green > severity, tiebreak recurrence count |
| Auto-fix | (not typical) | Bot suggestions | Deliberately deferred (v2+) — verification tool risk |

## Sources

- `.planning/PROJECT.md` — milestone scope, Out-of-Scope decisions, constraints (HIGH)
- `.planning/codebase/CONCERNS.md` — real defect surface: false-green #64/#61, timing #58/#65/#66, coverage gaps (HIGH)
- `src/reporting/bug-report.ts` — existing capture bundle + fingerprint seed (HIGH)
- `docs/release-0.7.0-triage.md` — `agda_triage_error`, `agda_bulk_status` scoping (HIGH)
- General defect-capture / test-minimization practice (fingerprint dedup, ddmin, differential oracles) — established engineering practice (MEDIUM)

---
*Feature research for: self-improvement/dogfooding loop (Loop ②), agda-mcp-server*
*Researched: 2026-07-01*
