# Phase 3: Regression Lock Pipeline - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **lock-in pipeline**: a captured defect (Phase-1 `CaptureArtifact` + Phase-2 oracle verdict sidecar) becomes

1. a **minimal reproduction** — offending source snapshotted into a fixture + the recorded trigger sequence, deterministically re-triggerable (REPRO-01, assisted/manual trimming),
2. an **automatically placed + named fixture** under the established `test/fixtures/agda/` convention (LOCK-01),
3. a **durable from-RED vitest regression** that asserts the *correct* behavior using ORCL-01's cold result as the expected value, on the normalized `ToolResult` envelope — refusing to lock captures that fail ORCL-02 or are ORCL-01 INCONCLUSIVE (LOCK-02),
4. proven **end-to-end on the #64/#61 transitive-staleness false-green** — a real live-session capture driven through capture → oracle → emit into a demonstrably-RED test (LOCK-03).

**Not in this phase:** the #64/#61 **fix** itself (→ inserted Phase 3.1, user decision D-09), the durable fix queue (Phase 4), locking the CHG seed specs (→ Phase-4 queue cargo, D-10), dogfooding orchestration (Phase 5), automatic ddmin minimization (v2 AUTO-01).

</domain>

<decisions>
## Implementation Decisions

> **Classification legend** (per the established Phase-1/2 convention):
> **[FORCED]** = fixed by correctness / a requirement / the phase boundary / an existing convention or charter — alternatives ruled out (reason given). Non-negotiable downstream.
> **[TASTE]** = a genuine values call the maintainer made.
> **[DEFERRED]** = deliberately unresolved (empirical or later-phase).
>
> This discussion surfaced exactly **two** taste decisions (D-09, D-10); everything else was forced by requirements, the Phase-2 verdict contract, codebase conventions, or verified Phase-1 findings.

### Emitted-test form (LOCK-02)

- **D-01 [FORCED — codebase matrix-SSOT convention + LOCK-02 durability]:** The emitter emits **data, not code**: a per-defect entry in a capture-regression **matrix** (JSON + typed loader, following the `release-bug-matrix.json` / `fixture-matrix.json` idiom; AGENTS.md prefers matrix SSOT over ad-hoc test additions) plus fixture files. **One generic replay runner** executes all entries. Ruled out: generating a standalone `.test.ts` per defect (code drift; fixing assertion logic would mean regenerating N files; violates the established idiom).
- **D-02 [FORCED — LOCK-02 "asserts on the normalized ToolResult envelope" + CAP-04 recording seam]:** Replay happens at the **MCP tool-call boundary** via the existing `test/helpers/mcp-harness.ts` (built server over stdio). The envelope only exists at the tools layer, and the Phase-1 action log was recorded at that same boundary — recorded there ⇒ replayed there. Ruled out: direct `AgdaSession` replay (the assertion target — the envelope — does not exist at that layer).
- **D-03 [FORCED — existing testing convention: default suite is Agda-free]:** Emitted regressions need a live Agda binary ⇒ they self-skip without `RUN_AGDA_INTEGRATION=1`, and use the `itSince(minVersion)` gate where the manifest's Agda version demands it. Assertions target the **normalized classification tuple + error/warning category sets** (mirroring ORCL-01's diff rules), never raw text/wire order/timing — that is what "robust across Agda 2.6.4.3–2.9.0" (LOCK-02) means in practice.

### RED-phase lifecycle (LOCK-02/LOCK-03)

- **D-04 [FORCED — from-RED requirement + suite-health correctness]:** Matrix entries carry `status: "red" | "locked"`. The runner emits **vitest `test.fails`** for `red` entries: the failing assertion is *expected*, so the suite stays green while the defect is live; when the defect is fixed, the `.fails` test "unexpectedly passes" and vitest **fails loudly**, forcing promotion to `locked`. Both directions are protected by a stock vitest mechanism — no custom infra. `locked` entries run as plain tests and join the release regression gate (`test:release:bugs`). The red→locked flip is a one-line matrix edit.
- **D-05 [FORCED — LOCK-02 "starts RED" must be demonstrated, not assumed]:** At emit time the emitter **runs the new entry once and verifies the assertion currently fails** against the live (warm) server behavior. An emitted lock that cannot demonstrate RED is an emitter error, not a lock.

### Emitter refusal gates (LOCK-02 + Phase-2 verdict contract)

- **D-06 [FORCED — LOCK-02 text + Phase-2 D-02/D-03 verdict schema]:** The emitter refuses to lock when: **ORCL-01 = INCONCLUSIVE** (no trustworthy expected value — the refusal names the failing probe), **ORCL-02 = cheat-flagged** (never golden-master a postulate/flag cheat), or **ORCL-02 = no-policy with non-empty findings** (without a whitelist the scan cannot distinguish cheat from sanctioned axiom — same honesty rule as Phase-2 D-03; `no-policy` with zero findings is lockable, there is nothing to misjudge). **ORCL-03 never blocks** (advisory by requirement). Refusals exit non-zero naming the predicate + a next-step hint. Which non-refused verdict states are *meaningful* to lock (false-green-candidate vs plain pass) is plan-phase detail.

### Reproduction & trimming (REPRO-01)

- **D-07 [FORCED predicate; DEFERRED heuristics]:** Trimming is **manual editing + a scripted re-trigger check**. The "still reproduces" predicate for the false-green family is the **differential itself — warm-green ∧ cold-red under the replayed manifest** — not "the test fails" (a trim that breaks the warm side too has *lost* the repro; correctness forces the two-sided check). The trimming material is the capture's inlined first-party closure (Phase-1 D-07). No heuristics/ddmin in v1 (AUTO-01); revisit when real captured material shows trimming is the bottleneck (empirical).

### Fixture materialization (LOCK-01)

- **D-08 [FORCED — existing convention + Phase-1 CR-01 lesson]:** Fixtures land under `test/fixtures/agda/` following the PascalCase, behavior-named, one-concern-per-file convention; multi-file repros follow the `FixtureDeps/`-style subdirectory pattern. Materialization **must path-sandbox** the artifact's `inlinedFirstPartySources[].path` values (reject `..`/absolute escapes): Phase-1 verification (CR-01) empirically proved the traversal hole in `verify-cold-replay.mjs`'s materializer, and Phase 3 writes into the **tracked repo tree**, where the same hole is strictly worse. Do not copy that materializer without fixing it.

### LOCK-03 flagship end-to-end proof

- **D-09 (part 1) [FORCED — Phase-5 absence + end-to-end honesty]:** The #64/#61 capture comes from a **real live session** driven by a hand-scripted staleness scenario (load module A that imports B → warm green; edit B to introduce a type error; warm reload of A stays green while cold agda rejects). Ruled out: hand-built synthetic bundles (would hollow out the capture→oracle→emit end-to-end proof).
- **D-09 (part 2) [TASTE — user decision]:** **Phase 3 ends at the demonstrably-RED emitted regression.** The #64/#61 **fix is NOT in Phase 3** — a small **Phase 3.1 ("fix #64/#61, flip the flagship lock to green")** is inserted immediately after, so the RED→GREEN flip is observed **before Phase 4** begins. Rationale: the pipeline phase stays surgical (the fix touches load/interface-cache staleness detection, unknown size), while the loop's first full closure — and the only true validation that the emitted assertion is satisfiable — is not deferred past Phase 4. *Action item: insert Phase 3.1 into ROADMAP.md via `/gsd-phase` (roadmap operation, outside this discussion).*
- **D-10 [TASTE — user decision]:** The **8 CHG turn-key regression specs** (and the 4 CHG candidate defects) are **not locked in Phase 3**. All become the **Phase-4 queue's first real cargo** (re-verified against current `main` at intake, since they were measured on v0.6.7). Phase 3 locks exactly one defect: the flagship. Rationale: keeps the phase on its requirement line (LOCK-03 names only #64/#61) and gives Phase 4 real material to exercise queue ordering/classification.

### Upstream coordination (read before planning)

- **Phase-1 BLOCKER interaction:** the verified Phase-1 gap — repeat captures in one session **silently overwrite** the staged artifact (filename = `fingerprint-recurrence`, both session-static) — directly threatens the Phase-3 e2e drill, which will capture repeatedly while rehearsing the #64/#61 scenario. Close it before or as the first task of Phase 3 (small fix: collision-proof staged filename; see `01-VERIFICATION.md` gaps).
- **Verdict schema is Phase 2's deliverable:** the emitter's refusal logic consumes the per-predicate verdict sidecar (Phase-2 D-01/D-02). Phase-3 planning must read the Phase-2 plans/schema before designing refusal parsing — do not invent a parallel format.

### Claude's Discretion

- Emitter CLI shape (single script + flags), dry-run mode, and re-emit/idempotency behavior when the same fingerprint is emitted twice (update-in-place vs refuse).
- Matrix file name/location (e.g. `test/fixtures/capture-regression-matrix.json`) and runner placement (likely `test/integration/mcp/`).
- Fixture naming details (issue-numbered when known, fingerprint-derived otherwise), and whether emitted fixtures also register in `fixture-matrix.json`.
- red→locked flip: manual one-line edit is fine; a helper script only if friction appears.
- Whether a `locked` entry also gets a pointer row in `release-bug-matrix.json`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope (the contract this phase implements)
- `.planning/REQUIREMENTS.md` §Reproduction (REPRO) + §Regression Lock (LOCK) — REPRO-01, LOCK-01/02/03 exact wording (cold-result-as-expected-value, refusal conditions, version robustness).
- `.planning/ROADMAP.md` §"Phase 3: Regression Lock Pipeline" — the 4 success criteria.

### Adjacent-phase contracts (the pipeline's input/output seams)
- `.planning/phases/02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo/02-CONTEXT.md` — the verdict **sidecar** contract (D-01), per-predicate outcomes incl. `no-policy` (D-02/D-03), scripts-not-src (D-05), scaffold-hole rule (D-08). The emitter consumes this; never invent a parallel format.
- `.planning/phases/01-capture-foundation/01-CONTEXT.md` — capture decisions inherited here: D-07 (inlined first-party closure = the trimming material), D-08 (trimming deferred to this phase), staging/`.agda-mcp/captures/` conventions, D-09/D-10 emit-only semantics.
- `.planning/phases/01-capture-foundation/01-VERIFICATION.md` — the **BLOCKER** (staged-artifact silent overwrite) Phase 3 must sequence around, and **CR-01** (path-traversal in source materialization) that D-08 forbids copying.

### Codebase seams (reusable assets — full paths)
- `src/agda/session-capture/artifact-types.ts` — `CaptureArtifact` / `ReplayManifest` / `RecordedAction` / `OracleSubstrate`: everything the emitter and trimmer read.
- `scripts/verify-cold-replay.mjs` — source-materialization + cold-spawn mechanics precedent (fix CR-01 before reuse).
- `scripts/promote-capture.mjs` — the out-of-band promotion/index write-side pattern.
- `test/helpers/mcp-harness.ts` — the replay vehicle (built server over MCP stdio) per D-02.
- `test/fixtures/release-bug-matrix.json` + `.ts` — the per-issue regression-matrix idiom D-01 follows.
- `test/fixtures/agda/fixture-matrix.json` + `.ts` — fixture SSOT convention; `test/fixtures/agda/FixtureDeps/` — multi-file fixture precedent.
- `src/agda/session-load-helpers.ts` — `classifyLoadResult()`: the normalized tuple both the oracle and the emitted assertions normalize through.
- `.planning/codebase/TESTING.md` — gating (`RUN_AGDA_INTEGRATION=1`, `itSince`), naming, flat-test structure, release-gate composition.
- Commit `e38f90a` (fix for #65/#66) — the existing precedent LOCK-01's "as the #65/#66 fixtures already demonstrate" refers to.

### Design charter & research
- `.planning/DESIGN-PRINCIPLES.md` — guardrail: never compress away `ok`/`classification`/false-green signal (the emitted assertion IS that signal).
- `.planning/research/ORACLE-VALIDITY.md` — why the cold result is the expected value; INCONCLUSIVE semantics the refusal gate names.
- `.planning/research/FUEL-CORPORA.md` — the 8 CHG spec inventory (deferred to Phase-4 intake per D-10) and the v0.6.7 re-verification caveat.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-harness.ts`: spawns the built server and drives it as a real MCP client — the replay runner wraps this per recorded action.
- `release-bug-matrix.json`/`.ts` + `fixture-matrix.json`/`.ts`: the exact data-driven idiom the capture-regression matrix follows (typed loader, one runner).
- `verify-cold-replay.mjs`: already materializes inlined sources and cold-spawns the manifest's pinned agda — the trimmer's re-trigger check builds on the same mechanics (post CR-01 fix).
- `classifyLoadResult()`: assertion normalization — the emitted expected value and the observed replay result both reduce to this tuple + category sets.
- `itSince(minVersion)` / `RUN_AGDA_INTEGRATION` gating helpers: version/binary gating for emitted tests.

### Established Patterns
- Matrix-as-SSOT before ad-hoc test lists (AGENTS.md preference) — forces D-01.
- Scripts as plain ESM `.mjs` under `scripts/`, allowed to import server logic as a library (Phase-2 D-05 precedent) — the emitter/trimmer follow this; no new `src/` surface.
- Flat `test()` calls with `// ── banner ──` grouping; `<name>: scenario` test naming; try/finally session lifecycle.

### Integration Points
- **Input:** staged capture JSON + verdict sidecar in `.agda-mcp/captures/` (Phase-1 staging + Phase-2 sidecar conventions).
- **Output:** fixture files under `test/fixtures/agda/`, matrix entries, one replay runner under `test/integration/`; `locked` entries join `test:release:bugs`.
- **Phase 3.1** consumes the RED flagship lock (fix flips it); **Phase 4** consumes the verdicts for queue prioritization and ingests the CHG seeds (D-10).

</code_context>

<specifics>
## Specific Ideas

- **#64/#61 rehearsal scenario:** two-module staleness dance — load A (imports B) warm-green; introduce a type error in B; warm reload of A still green (scope-check-only / stale interface) while a cold `Cmd_load` rejects. CHG measured exactly this shape (injected `UnequalTerms` → all four verdict tools reported zero errors on v0.6.7).
- **Trimming loop:** each manual trim re-runs the ORCL-01 differential on the trimmed candidate — keep iff still warm-green ∧ cold-red. "Test fails" alone is the wrong predicate (D-07).
- **Emit-time RED demonstration (D-05):** the emitter's final step runs the fresh entry once and prints the observed-vs-expected envelope diff as the RED evidence.

</specifics>

<deferred>
## Deferred Ideas

- **#64/#61 fix → Phase 3.1** (insert via `/gsd-phase`; goal: fix the transitive-staleness false-green, observe the flagship lock flip RED→GREEN, promote `red`→`locked`). (D-09)
- **8 CHG turn-key specs + 4 CHG candidate defects → Phase 4 queue intake** as first real cargo; re-verify each against current `main` (measured on v0.6.7) before locking. (D-10)
- **Automatic ddmin minimization → v2 (AUTO-01);** trimming heuristics only when real material shows the bottleneck. (D-07)
- **Emitter breadth beyond the false-green family** (crash / wrong-result locks) — exercised naturally when Phase-4 cargo flows; no v1 criterion requires it.
- **Verdict → queue routing/prioritization → Phase 4** (QUEUE-02 consumes the verdict; Phase 3 only reads refusal-relevant fields).
- **Scripted red→locked promotion helper** — only if the manual one-line flip proves error-prone.

</deferred>

---

*Phase: 3-regression-lock-pipeline*
*Context gathered: 2026-07-02*
