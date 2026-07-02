# Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance) - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **three composable oracle predicates** that judge a Phase-1 `CaptureArtifact` "true green":

- **ORCL-01 (server-faithfulness differential):** re-run the capture as a fresh `agda --interaction-json` `Cmd_load` under the replay manifest (exact binary, replayed registration, ordered argv, isolated fresh `_build`, closure-hash-pinned sources); diff the normalized classification tuple + error/warning category set. Emits a candidate server false-green ONLY when warm-green/cold-red AND every environment probe passes; any probe failure → INCONCLUSIVE naming the probe.
- **ORCL-02 (soundness-hygiene scan, cheap half):** token/AST scan over the captured source diff + the target's fully-transitive dependency closure (recursing through type signatures) for introduced `postulate` / TERMINATING / `NO_*_CHECK` / `primTrustMe` / FFI `COMPILE`/builtin / unsafe OPTIONS / `--with-K` override / residual holes — diffed against a per-project sanctioned-axiom whitelist.
- **ORCL-03 (conformance proxy, advisory only):** alpha-diff the proven `Cmd_infer_toplevel` signature against CAP-05's expected signature over normalized (never printed-string) types; flags narrowing / added premises / renames / target edits for human review. Never a gate.

Composition semantics are explicit: **ORCL-01 passing is necessary but insufficient**; only all three together justify "true green", and ORCL-01's cold result is the expected value handed to Phase 3's regression emitter.

**Not in this phase:** the regression emitter and fixtures (Phase 3), the durable fix queue (Phase 4), the runbook + expected-signature hard gate + formal policy home (Phase 5), the hardened flag-baseline *hard half* (AUTO-07), the mechanized negation probe (AUTO-08).

</domain>

<decisions>
## Implementation Decisions

> **Classification legend** (per the established Phase-1 convention):
> **[FORCED]** = fixed by correctness / a requirement / the phase boundary / the design charter — alternatives are ruled out (reason given). Non-negotiable downstream.
> **[TASTE]** = a genuine values call by the maintainer.
> **[DEFERRED]** = deliberately unresolved (empirical or later-phase).
>
> **This discussion surfaced ZERO taste decisions.** The oracle-validity research + requirements had already forced every consequential choice; the user confirmed writing them down as-is. Everything below is FORCED or delegated.

### Verdict output & composition

- **D-01 [FORCED — capture-evidence integrity]:** The oracle verdict is a **sidecar artifact** written next to the capture (in the same `.agda-mcp/captures/` staging area), NEVER a mutation of the `CaptureArtifact` itself. The capture is dedup-keyed by content fingerprint (`fingerprintBugReport()` sha256); writing into it would change its identity and pollute the evidence. Ruled out: embedding the verdict in the artifact.
- **D-02 [FORCED — ORCL-01/02/03 requirement wording + success criterion 5]:** The verdict records a **per-predicate outcome plus an explicit composition**: ORCL-01 ∈ {pass, server-false-green-candidate, INCONCLUSIVE(probe-name)}; ORCL-02 ∈ {clean, cheat-flagged(findings), no-policy(findings)}; ORCL-03 ∈ {consistent, conformance-flagged(diff), vacuous-no-expected-signature} — ORCL-03 is advisory in every state and can never block. "true-green" is asserted only when ORCL-01 = pass AND ORCL-02 = clean (ORCL-03 noted alongside). The INCONCLUSIVE probe name is mandatory (version / agdaDir-hash / closure-hash / `_build` / spawn / terminus / timeout).
- **D-03 [FORCED — same honesty philosophy as ORCL-01's INCONCLUSIVE]:** When the target project has **no sanctioned-axiom whitelist / flag-baseline policy**, ORCL-02 emits the distinct **`no-policy`** outcome carrying ALL findings (every axiom/pragma/flag discovered) for human review. Ruled out: fail-closed (flag everything as cheats — floods signal, misclassifies legitimate HIT postulates) and fail-open (pass with warning — silently admits cheats). Without a whitelist the scan *cannot* distinguish cheat from sanctioned axiom, so pretending to judge either way is dishonest.
- **D-04 [FORCED — ORACLE-VALIDITY residual-risk #4 + STATE.md blocker]:** The cold run **never reuses the server's `AGDA_MCP_COMMAND_TIMEOUT_MS`** (an interactive-wait budget). The oracle is offline batch: default = run to completion; an optional explicit budget flag may cap it; exceeding the budget → INCONCLUSIVE(timeout) with a "retry with a larger budget" hint. The **abstention/INCONCLUSIVE rate is a first-class recorded metric** (success criterion 2).
- **D-05 [FORCED — roadmap "loop wraps the server" + Phase-1 D-precedent]:** The triad ships as **`scripts/` + repo data dirs — no new MCP verb, no new `src/` tool surface**. Reusing server logic (command-builder IOTCM assembly, `classifyLoadResult` normalization) as an imported library is allowed and preferred over duplication (SSOT); the exact import mechanism (dist/ vs tsx) is plan-phase territory.

### ORCL-03 scope

- **D-06 [FORCED — v2 scope line ("no phase criterion may require v2+ work") + requirement says "may"]:** The consistency/negation probe (attempt `⊥` / prove the negation) is **hook-only in v1**: the verdict schema reserves a `consistencyProbe` field, nothing is mechanized. Mechanization is AUTO-08.
- **D-07 [FORCED — Phase-1 D-02 lineage]:** A capture without an expected top-level signature gets ORCL-03 = `vacuous-no-expected-signature` (advisory, not a failure), echoing the capture-time nag; the hard gate arrives with PROC-01 in Phase 5.

### Cross-predicate semantics

- **D-08 [FORCED — CHG field evidence, carried from Phase 1]:** The triad must **never false-red the legitimate scaffold-hole workflow** (intentional `{!!}` + `--allow-unsolved-metas` during in-progress work). ORCL-01 compares like-for-like classification tuples (warm ok-with-holes vs cold ok-with-holes agree = pass); ORCL-02's residual-hole finding is a cheat signal only against a claimed-complete capture. *How* "claimed-complete" is signaled is a plan-phase research question (see Deferred).

### Claude's Discretion

- CLI shape: single entry point running all three predicates with per-predicate opt-out (e.g. `--only orcl-01`) vs three scripts — pick whatever composes best; the verdict schema (D-02) is the contract, not the CLI.
- Verdict/metrics file naming and placement conventions inside `.agda-mcp/captures/`.
- Whether the abstention-rate metric is a per-run summary line, a cumulative file, or both.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope (the contract this phase implements)
- `.planning/REQUIREMENTS.md` §Oracle Triad (ORCL) — ORCL-01/02/03 exact wording (probe list, scan list, whitelist semantics, advisory-only). Also AUTO-07/AUTO-08 to know precisely what is *deferred*.
- `.planning/ROADMAP.md` §"Phase 2: The Oracle Triad" — the 5 success criteria (criterion 5 = explicit necessary-but-insufficient composition).

### Load-bearing research (drove every FORCED decision — MANDATORY read)
- `.planning/research/ORACLE-VALIDITY.md` — the coverage matrix (which false-green family each predicate catches), the 8 verified corrections (interaction `Cmd_load` not batch; replay registration; closure-hash pin; fresh `_build`; INCONCLUSIVE gating; version-range handling; `--safe` unusable on unimath; `primTrustMe` vs `primEraseEquality`), and the residual risks to carry into planning.
- `.planning/research/LEAN-COMPARISON.md` — why the closure walk recurses through type signatures (Lean #8840), why FFI/`COMPILE` is scanned (native_decide leaks), the Kimina negation-probe provenance.
- `.planning/research/PITFALLS.md` — TOCTOU / firehose concerns around the capture↔oracle seam.
- `.planning/research/FUEL-CORPORA.md` — the per-corpus policy facts ORCL-02 will read (unimath sanctioned axioms: univalence / funext / replacement; required-flag baseline) and where they formally live in Phase 5 (PROC-02).

### Design charter
- `.planning/DESIGN-PRINCIPLES.md` — P2/P3 + the guardrail "never compress away `ok`/`classification`/false-green signal": the verdict must carry the full per-predicate outcomes, not a boolean.

### Phase-1 substrate (what the oracle consumes — full paths)
- `src/agda/session-capture/artifact-types.ts` — the `CaptureArtifact` / `ReplayManifest` / `OracleSubstrate` contract: every field ORCL-01 replays (mergedArgv, agdaDirContents, importClosureHash, inlinedFirstPartySources, buildMode) and ORCL-02/03 read (beforeSource/afterSource, intendedGoalType, expectedSignature).
- `scripts/verify-cold-replay.mjs` — Phase 1's cold self-replay script: already spawns a fresh agda from a capture; the natural seed/skeleton for ORCL-01 (plan-phase decides extend-vs-fork).
- `.planning/phases/01-capture-foundation/01-CONTEXT.md` — Phase-1 decisions (D-01…D-10) this phase inherits (emit-only semantics, staging area, optional expected signature).

### Server logic to reuse, never duplicate (SSOT)
- `src/protocol/command-builder.ts` — IOTCM assembly for the cold `Cmd_load` and `Cmd_infer_toplevel`.
- `src/agda/session-load-helpers.ts` — `classifyLoadResult()`: the normalized classification tuple ORCL-01 diffs (`success`, goalCount, invisibleGoalCount, hasHoles, classification).
- `src/agda/library-registration.ts` — the non-deterministic live registration ORCL-01 must NOT call; the manifest's `agdaDirContents` is replayed instead.
- `src/tools/agent-ux/project-tools.ts` + `src/tools/file/check-postulates.ts` — the existing `agda_postulate_closure` / postulate-check logic ORCL-02 builds on (currently flag-ALL; ORCL-02 adds whitelist-diff + type-signature recursion).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verify-cold-replay.mjs` (Phase 1): materializes inlined sources, spawns the manifest's pinned agda binary cold — most of ORCL-01's mechanics minus the tuple diff and probes.
- `classifyLoadResult()` (`src/agda/session-load-helpers.ts`): both sides of the differential normalize through the same function — the warm side already did at capture time.
- `agda_postulate_closure` plumbing (`src/tools/agent-ux/project-tools.ts`): closure-walking seed for ORCL-02; must be extended to recurse through type signatures and to scan pragmas/FFI, then diffed against the policy whitelist.
- `Cmd_infer_toplevel` via `src/protocol/command-builder.ts`: produces the proven signature for ORCL-03.

### Established Patterns
- Scripts as ESM `.mjs` under `scripts/` (see `promote-capture.mjs`, `verify-cold-replay.mjs`) — the triad follows this, not `src/`.
- Staging/data convention: gitignored `.agda-mcp/captures/` holds capture + (now) verdict sidecars + metrics.
- 500-line ceiling applies to `src/` only, but keep scripts modular anyway.

### Integration Points
- Input: a staged `CaptureArtifact` JSON path (as returned by `agda_capture_session`'s `CaptureReference.stagedPath`).
- Output: the verdict sidecar consumed by Phase 3's emitter (LOCK-02 refuses ORCL-02-failing / ORCL-01-INCONCLUSIVE captures) and Phase 4's queue prioritization (false-green > crash > …).
- The oracle runs its OWN fresh agda child process from the manifest — it never touches the live server's singleton `AgdaSession` (#39 is about the server process; the oracle is a separate cold process by design).

</code_context>

<specifics>
## Specific Ideas

- The verdict schema is the real deliverable contract: Phase 3 (emitter refusal logic) and Phase 4 (queue prioritization) both consume it. Design it once, in this phase, with the per-predicate outcomes of D-02.
- Environment probes gate BEFORE diffing: version-match (against the *captured* binary/version, not maxTested — ORACLE-VALIDITY correction #8), agdaDir-hash, closure-hash, `_build` freshness, spawn-ok, terminus-reached, and (D-04) budget.
- `loop.sh`'s `gate_verify` in the CHG corpus is the hand-rolled prototype this phase replaces; its 4 self-reported gaps (renamed statement, imported postulate, file-level flag override, trivially-true restatement) are the acceptance sanity-check for the triad's coverage.

</specifics>

<deferred>
## Deferred Ideas

- **Plan-phase research questions (empirical, not taste — resolve with evidence, not preference):**
  - The closest achievable proxy for "normalized internal types" over IOTCM for ORCL-03 (Cmd_infer_toplevel normalization modes vs elaborate; printed-string spoofing via DISPLAY pragmas is the failure mode to defeat).
  - Token-scan vs AST-scan implementation for ORCL-02, and how the closure walk recurses through type signatures.
  - How "claimed-complete vs scaffold-in-progress" is signaled (explicit capture-time declaration vs inference from session state) — CHG evidence says inference is unreliable. May touch the capture tool contract (allowed: modifying the existing Phase-1 addition, not adding a new one).
  - Policy-file schema + exact location for the interim (pre-PROC-02) whitelist/flag-baseline, with a clean Phase-5 handoff.
  - Extend-vs-fork `verify-cold-replay.mjs` for ORCL-01.
- **ORCL-02 hard half** (hardened flag-baseline re-check, `--safe`-derived forbidden set, `--confluence-check`) → AUTO-07 (v2).
- **Mechanized negation/⊥ probe** → AUTO-08 (v2); v1 reserves the `consistencyProbe` verdict field only (D-06).
- **Expected-signature HARD gate** → Phase 5 (PROC-01); this phase keeps D-07's advisory vacuous marker.
- **Verdict → queue routing/prioritization** → Phase 4 (QUEUE-02 consumes the verdict; this phase only writes it).
- **Multi-run flaky classification** (re-run N times, deterministic vs timing) → Phase 5 (success criterion 4 there).

</deferred>

---

*Phase: 2-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Context gathered: 2026-07-02*
