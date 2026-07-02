# Requirements: Agda MCP Server — Self-Improvement Loop (Loop ②)

**Defined:** 2026-07-01
**Core Value:** Every real proof session reliably converts into a stronger server — the closed loop (use it → surface a defect → capture it → fix and lock it with a regression test → use it again) must work reproducibly by hand.

## v1 Requirements

The reproducible scaffold. Each requirement maps to a roadmap phase. "Actors" are the maintainer and AI coding agents (Codex, Claude Code) driving the server.

### Capture (CAP)

- [x] **CAP-01**: A captured failure bundle is auto-stamped into a complete **replay manifest** from the live session — never caller-supplied: Agda version + pinned binary path, server version, Node/OS, the post-precedence **merged flags as an ordered argv vector with duplicates preserved** (not a set — repeated `-i`/`-l`/`--library-file` are order-significant), the realized `AGDA_DIR` contents (exact libraries + defaults files, so registration is *replayed* not re-derived), cwd/project root, whether the run used a fresh vs shared `_build`, and a **content-hash of the full transitive import closure** at the capture instant (so the oracle can pin to it and abort on drift)
- [x] **CAP-02**: A local fingerprint→prior-report dedup index routes a re-captured defect as `update` (with recurrence count) rather than a new `new-bug`, keying on the existing `fingerprintBugReport()` sha256
- [x] **CAP-03**: An agent can capture the current stuck/failed session into an on-disk bundle with one MCP verb (e.g. `agda_capture_failure`), emit-only (never writes into the repo tree itself — an out-of-band step persists it), following the `agda_bug_report_bundle` precedent
- [x] **CAP-04**: A session action log records the ordered tool calls + args + normalized envelopes for a session (via a recorder/replayer at the Agda `--interaction-json` stdio seam), giving a replayable trace that repro-extraction and test emission both read
- [x] **CAP-05**: Each capture also records the substrate the oracle triad reads — the agent's **source diff** (before/after, so the soundness scan has material), the **intended goal type** at task-start (`Cmd_goal_type`), and a **human/task-authored expected top-level signature** (the input the conformance proxy needs) — reusing existing `Cmd_goal_type`/`Cmd_infer_toplevel` plumbing

### Oracle Triad (ORCL)

A capture is **true green** only if all three predicates pass. Each catches a different false-green family with a different soundness / human-knowledge profile; a passing differential alone is **necessary but not sufficient** ("the server told the truth about what agda would say", *not* "the theorem is true").

- [x] **ORCL-01** (server-faithfulness differential — the *only* self-sufficient cold-rerun oracle): The captured load is re-run as a **fresh `agda --interaction-json` `Cmd_load`** (never batch `agda File.agda` — batch exits 42 on interaction holes and would false-red every legitimate ok-with-holes proof), reusing the manifest's exact binary+version, **replayed** library registration (not a live `createLibraryRegistration()`, which is non-deterministic), the ordered merged-flag argv, same cwd/root, an **isolated fresh `_build`**, and the content-hash-pinned import closure. It diffs the **normalized classification tuple** (`success`, goalCount, invisibleGoalCount, hasHoles, classification per `classifyLoadResult`) + error/warning category **set** — never raw text/wire order/paths. It emits a candidate **server false-green** (#64/#61/#65/#66) *only* when warm-green/cold-red **and every environment probe passes** (version-match, agdaDir-hash-match, closure-hash-match, `_build` fresh, spawn-ok, terminus-reached), supplying the cold result as the correct expected value for Phase 3; any failing probe → **INCONCLUSIVE** (naming the probe), never "server bug". Abstention/INCONCLUSIVE rate is a first-class metric
- [ ] **ORCL-02** (soundness-hygiene scan — the *cheap half*, ships in v1): A token/AST scan over the captured **source diff and the target term's *fully-transitive* dependency closure** (reusing `agda_postulate_closure`; the closure walk must recurse through **type signatures**, not only definition bodies — Lean's own `#print axioms` shipped exactly this transitive-closure hole, `leanprover/lean4#8840`) flags introduced `postulate`, `{-# TERMINATING #-}`/`NON_TERMINATING`, `NO_POSITIVITY_CHECK`/`NO_UNIVERSE_CHECK`, `primTrustMe`, **FFI escape hatches (`{-# COMPILE ... #-}` / builtin bindings)**, unsafe `OPTIONS` pragmas, a file-level `--with-K` overriding the library `--without-K`, and residual `?`/`{! !}` — compared against a per-project **sanctioned-axiom whitelist** (for agda-unimath: univalence, function-extensionality, replacement; distinguishing agent cheats from legitimate HIT postulates). Closure scope is required because a goal can be discharged via a pre-existing upstream postulate with no new token in the diff; FFI/`COMPILE` matters because — like Lean's `native_decide`/`@[implemented_by]` leaks — it can smuggle unsoundness that never registers as an introduced axiom. (`primTrustMe` is the cheat; `primEraseEquality` is `--safe`-compatible and sound — *not* whitelisted.) The hardened-flag-baseline *hard half* is deferred (AUTO-07)
- [ ] **ORCL-03** (conformance proxy — advisory, never a gate): The proven top-level signature (`Cmd_infer_toplevel`) is alpha-diffed against the captured expected signature (CAP-05) over **normalized internal types** (not printed strings — `DISPLAY` pragmas/pattern synonyms spoof syntactic diffs), flagging narrowing, added premises, renames, or target-signature edits for **human review**. It may also carry a lightweight **consistency probe** (à la Kimina-Prover's discard rule): attempt to derive `⊥` from the target's hypotheses / prove the *negation* — success means the statement is vacuous/inconsistent, a strong "proved-the-wrong-thing" signal — surfaced advisorily (mechanized version: AUTO-08). Vacuous without CAP-05's expected signature (hence PROC-01's hard gate)

### Reproduction (REPRO)

- [ ] **REPRO-01**: A captured defect yields a minimal reproduction — the offending source snapshotted into a fixture plus the recorded trigger sequence — so the maintainer or an agent can deterministically re-trigger it (assisted/manual trimming; automatic minimization is out of scope for v1)

### Regression Lock (LOCK)

- [ ] **LOCK-01**: Fixture materialization writes the minimal `.agda` repro under the established `test/fixtures/agda/` convention with automated placement + naming (as the #65/#66 fixtures already demonstrate)
- [ ] **LOCK-02**: A regression-test emitter turns a captured bundle + fixture into a durable `vitest` test that starts RED, asserts the *correct* behavior using **ORCL-01's cold result as the expected value**, and asserts on the normalized `ToolResult` envelope rather than wire order/timing (robust across Agda 2.6.4.3–2.9.0). The emitter refuses to lock a capture that **fails ORCL-02** (never golden-masters a postulate/flag cheat as "correct") or is **ORCL-01 INCONCLUSIVE**
- [ ] **LOCK-03**: The first real regression — the transitive-staleness / false-green defect (#64/#61) — is produced through the emitter as a from-RED test + fixture, both proving the scaffold works end-to-end and filling the highest-priority known coverage gap

### Triage / Fix Queue (QUEUE)

- [ ] **QUEUE-01**: An in-repo flat-file fix queue (JSONL/markdown) is the single source of truth for captured defects, each with status (new/triaged/fixing/locked) and keyed by fingerprint; captured defects persist and flow rather than evaporating at session end
- [ ] **QUEUE-02**: The queue carries a basic prioritization signal composed from already-captured data (false-green > crash > wrong-result > missing-feature; ties broken by recurrence count from the dedup index) giving the maintainer + agents one clear ordering
- [ ] **QUEUE-03**: An `agda_triage_error` classifier turns a raw Agda error into a machine class (e.g. `mechanical-import`, `parser-regression`, `coverage-missing`, `dep-failure`, `toolchain`) with a confidence score and suggested action, feeding both capture-time classification and fix-queue routing
- [ ] **QUEUE-04**: The in-repo queue can be mirrored one-way to GitHub Issues via `gh` (optional, non-authoritative — the flat file stays the SSOT)

### Dogfooding Process (PROC)

- [ ] **PROC-01**: A written dogfooding runbook + driver-prompt snippet makes the *process* reproducible — telling an agent when and how to invoke the capture verb while proving against real corpora, so "point Codex at stdlib and harvest defects" can be re-run on demand. **Declaring the target's expected top-level signature up front is a hard gate** (without it ORCL-03's conformance proxy is vacuous)
- [ ] **PROC-02**: A pinned fuel pointer set lists the source corpora (agda-stdlib, chosen OSS Agda projects, the maintainer's own math projects — the **agda-unimath Hopf/π₃(S²)** work in `emilyriehl/autoformalizing-hopf` and `emilyriehl/Codex-Homotopy-Group` (both private/access-gated; the latter directly dogfoods this server and ships a bash oracle-triad prototype in `loop.sh`)) with pinned commits, so dogfooding runs are reproducible across time. It is the home for the per-project **machine-readable policy** ORCL-02 reads: the sanctioned-axiom whitelist and the required/forbidden flag baseline (per corpus/regime) — concrete first entries from the Codex-Homotopy-Group corpus: sanctioned axioms = univalence / function-extensionality / replacement; required flags = `--without-K --exact-split --no-import-sorts --auto-inline --no-require-unique-meta-solutions --no-postfix-projections` (auto-applied from the agda-unimath `.agda-lib`). See `.planning/research/FUEL-CORPORA.md` for the full cross-phase artifact→phase inventory of both corpora

## v2 Requirements

Deferred until the scaffold is proven. Tracked, not in the current roadmap.

### Automation & Intelligence

- **AUTO-01**: Automatic repro minimization (ddmin-style trimming) — trigger: manual trimming becomes the bottleneck
- **AUTO-02**: Agent-facing capture contract — server proactively hints via `nextAction` ("this result smells like a defect — capture it") so agents stop missing defects they hit
- **AUTO-03**: Recurrence-weighted prioritization view (queue sorted/annotated by hit count)
- **AUTO-04**: Knowledge accumulation over accumulated traces (corpus/patterns / "what fixes worked")
- **AUTO-05**: Automatic / semi-automatic PR generation (needs a trustworthy oracle + human-gate track record)
- **AUTO-06**: Unattended loop orchestration (run → capture → triage cron over pinned fuel)
- **AUTO-07**: ORCL-02 *hard half* — a hardened flag-baseline re-check (force `--safe` only where the regime permits; `--warning=error` against a benign-warning whitelist; per-module `--without-K` required-flag diff; a forbidden-flag **and forbidden-combination** set auto-derived from the pinned binary's own `--safe` rejection set; force `--confluence-check` for sanctioned `--rewriting`), and upgrading `agda_check_postulates` from flag-ALL to whitelist-diff
- **AUTO-08**: Mechanized consistency/negation probe — automatically attempt to prove the target's negation or derive `⊥` from its hypotheses to flag vacuous/inconsistent "proved-the-wrong-thing" statements (Kimina-Prover's discard rule made automatic); ORCL-03 carries the advisory hook, this closes the loop

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

Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAP-01 | Phase 1 | Complete |
| CAP-02 | Phase 1 | Complete |
| CAP-03 | Phase 1 | Complete |
| CAP-04 | Phase 1 | Complete |
| CAP-05 | Phase 1 | Complete |
| ORCL-01 | Phase 2 | Complete |
| ORCL-02 | Phase 2 | Pending |
| ORCL-03 | Phase 2 | Pending |
| REPRO-01 | Phase 3 | Pending |
| LOCK-01 | Phase 3 | Pending |
| LOCK-02 | Phase 3 | Pending |
| LOCK-03 | Phase 3 | Pending |
| QUEUE-01 | Phase 4 | Pending |
| QUEUE-02 | Phase 4 | Pending |
| QUEUE-03 | Phase 4 | Pending |
| QUEUE-04 | Phase 4 | Pending |
| PROC-01 | Phase 5 | Pending |
| PROC-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18 ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after oracle-validity research (ORCL split into a three-predicate triad; CAP-01 expanded to a full replay manifest; CAP-05 added for oracle substrate; PROC-01/02 gated on expected-signature + machine-readable policy) — then cross-checked against the Lean/Mathlib ecosystem (see `research/LEAN-COMPARISON.md`): ORCL-02 recurse-through-types + FFI scan (Lean #8840, native_decide leaks); ORCL-03/AUTO-08 negation-consistency probe (Kimina)*
