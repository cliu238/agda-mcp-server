# Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance) - Research

**Researched:** 2026-07-02
**Domain:** Differential testing of a stateful interactive-theorem-prover subprocess (Agda `--interaction-json`); static soundness/pragma auditing; syntactic conformance checking. No web/HTTP/DB domain — this is CLI-subprocess + filesystem + static-analysis territory.
**Confidence:** HIGH for codebase mechanics and Agda flag/pragma semantics (all empirically verified against a real, locally-installed Agda 2.8.0 binary — the exact version this project's own test summaries were verified against). MEDIUM for the ORCL-03 alpha-diff implementation technique (no off-the-shelf solution exists; proposed approach is original synthesis). LOW/flagged explicitly wherever a claim rests on web search alone.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> **Classification legend** (per the established Phase-1 convention):
> **[FORCED]** = fixed by correctness / a requirement / the phase boundary / the design charter — alternatives are ruled out (reason given). Non-negotiable downstream.
> **[TASTE]** = a genuine values call by the maintainer.
> **[DEFERRED]** = deliberately unresolved (empirical or later-phase).
>
> **This discussion surfaced ZERO taste decisions.** The oracle-validity research + requirements had already forced every consequential choice; the user confirmed writing them down as-is. Everything below is FORCED or delegated.

**Verdict output & composition**

- **D-01 [FORCED — capture-evidence integrity]:** The oracle verdict is a **sidecar artifact** written next to the capture (in the same `.agda-mcp/captures/` staging area), NEVER a mutation of the `CaptureArtifact` itself. The capture is dedup-keyed by content fingerprint (`fingerprintBugReport()` sha256); writing into it would change its identity and pollute the evidence. Ruled out: embedding the verdict in the artifact.
- **D-02 [FORCED — ORCL-01/02/03 requirement wording + success criterion 5]:** The verdict records a **per-predicate outcome plus an explicit composition**: ORCL-01 ∈ {pass, server-false-green-candidate, INCONCLUSIVE(probe-name)}; ORCL-02 ∈ {clean, cheat-flagged(findings), no-policy(findings)}; ORCL-03 ∈ {consistent, conformance-flagged(diff), vacuous-no-expected-signature} — ORCL-03 is advisory in every state and can never block. "true-green" is asserted only when ORCL-01 = pass AND ORCL-02 = clean (ORCL-03 noted alongside). The INCONCLUSIVE probe name is mandatory (version / agdaDir-hash / closure-hash / `_build` / spawn / terminus / timeout).
- **D-03 [FORCED — same honesty philosophy as ORCL-01's INCONCLUSIVE]:** When the target project has **no sanctioned-axiom whitelist / flag-baseline policy**, ORCL-02 emits the distinct **`no-policy`** outcome carrying ALL findings (every axiom/pragma/flag discovered) for human review. Ruled out: fail-closed (flag everything as cheats — floods signal, misclassifies legitimate HIT postulates) and fail-open (pass with warning — silently admits cheats). Without a whitelist the scan *cannot* distinguish cheat from sanctioned axiom, so pretending to judge either way is dishonest.
- **D-04 [FORCED — ORACLE-VALIDITY residual-risk #4 + STATE.md blocker]:** The cold run **never reuses the server's `AGDA_MCP_COMMAND_TIMEOUT_MS`** (an interactive-wait budget). The oracle is offline batch: default = run to completion; an optional explicit budget flag may cap it; exceeding the budget → INCONCLUSIVE(timeout) with a "retry with a larger budget" hint. The **abstention/INCONCLUSIVE rate is a first-class recorded metric** (success criterion 2).
- **D-05 [FORCED — roadmap "loop wraps the server" + Phase-1 D-precedent]:** The triad ships as **`scripts/` + repo data dirs — no new MCP verb, no new `src/` tool surface**. Reusing server logic (command-builder IOTCM assembly, `classifyLoadResult` normalization) as an imported library is allowed and preferred over duplication (SSOT); the exact import mechanism (dist/ vs tsx) is plan-phase territory.

**ORCL-03 scope**

- **D-06 [FORCED — v2 scope line ("no phase criterion may require v2+ work") + requirement says "may"]:** The consistency/negation probe (attempt `⊥` / prove the negation) is **hook-only in v1**: the verdict schema reserves a `consistencyProbe` field, nothing is mechanized. Mechanization is AUTO-08.
- **D-07 [FORCED — Phase-1 D-02 lineage]:** A capture without an expected top-level signature gets ORCL-03 = `vacuous-no-expected-signature` (advisory, not a failure), echoing the capture-time nag; the hard gate arrives with PROC-01 in Phase 5.

**Cross-predicate semantics**

- **D-08 [FORCED — CHG field evidence, carried from Phase 1]:** The triad must **never false-red the legitimate scaffold-hole workflow** (intentional `{!!}` + `--allow-unsolved-metas` during in-progress work). ORCL-01 compares like-for-like classification tuples (warm ok-with-holes vs cold ok-with-holes agree = pass); ORCL-02's residual-hole finding is a cheat signal only against a claimed-complete capture. *How* "claimed-complete" is signaled is a plan-phase research question (see Deferred).

### Claude's Discretion

- CLI shape: single entry point running all three predicates with per-predicate opt-out (e.g. `--only orcl-01`) vs three scripts — pick whatever composes best; the verdict schema (D-02) is the contract, not the CLI.
- Verdict/metrics file naming and placement conventions inside `.agda-mcp/captures/`.
- Whether the abstention-rate metric is a per-run summary line, a cumulative file, or both.

### Deferred Ideas (OUT OF SCOPE)

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

*(This research directly addresses every "Plan-phase research question" listed above — see Open Questions, Architecture Patterns, and Common Pitfalls throughout this document for the corresponding findings.)*
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| ORCL-01 | Server-faithfulness differential: re-run the captured load as a fresh `agda --interaction-json` `Cmd_load` (never batch), replaying manifest binary+version, library registration, ordered flag argv, cwd/root, isolated fresh `_build`, and closure-hash-pinned import closure; diff the normalized classification tuple + error/warning category set; emit a candidate server false-green only on warm-green/cold-red AND all 7 env probes passing; any failing probe → INCONCLUSIVE naming the probe; abstention rate is a first-class metric | `classifyLoadResult()`/`parseLoadResponses()` reuse via `tsx` (Standard Stack, Code Examples); `verify-cold-replay.mjs`'s existing mechanics + its two unfixed bugs CR-01/CR-02 (Common Pitfalls 2–4); `library-registration.ts`'s non-determinism confirming "replay not re-derive" (Anti-Patterns); `_build` isolation-by-construction via fresh temp dir (Open Question 2); the classification-string-space finding that bounds *when* a diff is meaningful (Pitfall 4) |
| ORCL-02 | Soundness-hygiene scan (cheap half): token/AST scan over the source diff + target's fully-transitive dependency closure for `postulate`/TERMINATING/NO_*_CHECK/`primTrustMe`/FFI COMPILE-builtin/unsafe OPTIONS/`--with-K` override/residual holes, diffed against a per-project sanctioned-axiom whitelist, distinguishing cheats from legitimate HIT postulates | `buildImportGraph`/`computeImpact` verified as a genuine full-BFS closure already, no rewrite needed (Don't Hand-Roll); exact verified Agda pragma/flag syntax for the full scan vocabulary (Standard Stack, Code Examples — `--safe` forbidden list, `{-# COMPILE #-}` syntax); the empirically-verified, previously-unconfirmed `--with-K`-override gap in Agda's own infective-option checking (Pitfall 5 — directly informs why this scan cannot be skipped); the `primEraseEquality` correction (Pitfall 6) confirming that primitive does NOT need to be added to the scan; interim policy-file location/schema recommendation (Architecture Patterns) |
| ORCL-03 | Conformance proxy (advisory only): alpha-diff the proven `Cmd_infer_toplevel` signature against CAP-05's expected signature over normalized internal types (not printed strings), flagging narrowing/added-premises/renames/target-edits for human review; never a hard gate; may carry a lightweight consistency-probe hook | The negative finding that IOTCM has no structured-AST representation and `DISPLAY`-pragma spoofing is currently undefeatable (Pitfall 8) — validates why D-02/D-06 keep this permanently advisory; the `ctx.requireFile()` dependency meaning ORCL-03 cannot spawn an independent cold session (Pitfall 7, Architecture diagram); the proposed (flagged-as-original-synthesis) token-canonicalization alpha-diff technique (Open Question 1, Assumption A2) |

</phase_requirements>

## Summary

This phase has almost no external-library research surface — it is 95% *this repository's own code*, Agda's documented (and in two cases, empirically-tested-here) flag/pragma semantics, and one open design question about the ORCL-03 alpha-diff. The three predicates are best understood as **three cheap, composable checks bolted onto machinery Phase 1 already built**: ORCL-01 is a hardened rewrite of `scripts/verify-cold-replay.mjs` (already exists, already proves cold-replay is mechanically possible, but currently only checks "any DisplayInfo Error present" — nowhere near a `classifyLoadResult`-normalized tuple diff); ORCL-02 is an extension of the *already-correct* transitive-closure walker behind `agda_postulate_closure` (`buildImportGraph`/`computeImpact` in `src/agda/import-graph.ts` is a genuine full-BFS transitive closure — no Lean-#8840-style under-counting bug exists here) to scan for a wider pragma/FFI vocabulary and diff against a whitelist; ORCL-03 is a thin new wrapper around the already-working `Cmd_infer_toplevel` plumbing (`inferTopLevel()` in `src/agda/expression-operations.ts`), whose biggest finding is negative: **there is no structured-AST representation available over IOTCM at all** — every existing `infer`/`compute` call in this codebase returns a plain pretty-printed string, and Agda's `DISPLAY`-pragma/pattern-synonym printing mechanism has no documented flag to disable it. This is not a gap in this project's implementation; it is a hard ceiling imposed by the protocol, and it is *exactly why* the phase's own composition rule (D-02/D-06) keeps ORCL-03 permanently advisory.

The single most load-bearing new finding from this research session is the import mechanism for D-05's "exact import mechanism (dist/ vs tsx) is plan-phase territory" question. I tested both empirically against this exact repo on Node v24.16.0 (the pinned `.nvmrc` version): **plain `node` cannot resolve this codebase's `.js`-suffixed intra-`src/` import specifiers when running a `.ts` file directly** (Node's native type-stripping requires literal `.ts` extensions and does not rewrite `.js`→`.ts`, contradicting what `scripts/mcp-local-client.mjs`'s existing code appears to assume — that script is itself currently broken when invoked with plain `node`). **`tsx` (already a devDependency) resolves this correctly** — I successfully imported `src/agda/session-load-helpers.ts` and called the real `classifyLoadResult()` through it with zero build step. This means ORCL-01/02/03 can be **true SSOT reuse** of `command-builder.ts`, `classifyLoadResult()`, and `buildImportGraph()`/`computeImpact()` — via `tsx`, not a hand-rolled second copy (which is what `verify-cold-replay.mjs` currently is, by its own header's admission, and what `--safe`-adjacent flag lists would otherwise have to be re-invented as). Also directly relevant: **`scripts/verify-cold-replay.mjs` — the seed script ORCL-01 extends or forks — currently has two known, unfixed correctness bugs** (a path-traversal write and a false-PASS-on-empty-response bug), captured in Phase-1 gap-closure plans `01-06`/`01-07` that exist on disk but have **not yet been executed** (no `01-06-SUMMARY.md`/`01-07-SUMMARY.md`, no completion commits as of this research). This is a concrete, checkable planning dependency, not a hypothetical.

**Primary recommendation:** Build ORCL-01/02/03 as `scripts/*.mjs` that import real `src/` modules via `tsx` (not `node`, not a `dist/` pre-build step); verify Phase-1 gap-closure plans `01-06`/`01-07` have landed before treating `verify-cold-replay.mjs` as a safe fork base; scope ORCL-03 to a textual alpha-diff over `Normalised`-mode `Cmd_infer_toplevel` output (the only thing IOTCM offers) and keep it advisory forever, exactly as already decided.

## Architectural Responsibility Map

This project has no browser/SSR/API/CDN tiers — it is a CLI/stdio integration. The table below adapts the standard tier vocabulary to this domain, per D-05's constraint that the oracle triad must never grow into a new `src/` tool surface.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ORCL-01 server-faithfulness differential | **Oracle scripts tier** (`scripts/*.mjs`, offline/batch) | **Cold Agda subprocess tier** (a disposable `agda --interaction-json` child, spawned and killed per run) | Must run entirely outside the live MCP server process — it never touches the singleton `AgdaSession` (issue #39 is scoped to the *live server*; the oracle is architecturally a separate, one-shot batch consumer of the same binary) |
| ORCL-02 soundness-hygiene scan | **Oracle scripts tier** (pure static analysis) | — (no subprocess needed; it is a text/AST scan over already-captured source strings) | Reuses `buildImportGraph`/`computeImpact`/`extractPostulateSites` — all pure, synchronous, file-system-only |
| ORCL-03 conformance proxy | **Oracle scripts tier** | **Cold Agda subprocess tier** (reuses the *same* cold session ORCL-01 already spawned — see Common Pitfall 7 below on why it cannot spawn independently) | `Cmd_infer_toplevel` requires a file already loaded in the calling session's scope (`ctx.requireFile()` in `expression-operations.ts`) — it is not a standalone command |
| Verdict sidecar artifact | **Filesystem staging tier** (`.agda-mcp/captures/`, gitignored) | — | Same staging convention Phase 1 already established (D-01: sidecar, never a mutation of the `CaptureArtifact`) |
| Interim sanctioned-axiom / flag-baseline policy | **Filesystem data tier** (new, repo-owned JSON under `scripts/data/`) | — | Must NOT live in `.agda-mcp.json` (that schema is `additionalProperties: false`, owned by the *live server's* per-call config loader, and is about the target project's own config, not this server's oracle policy) — see Architecture Patterns below |
| Live MCP server / singleton `AgdaSession` | **Explicitly untouched** | — | D-05 forbids a new tool surface; the oracle must never share process state with the live session it may be judging |

## Standard Stack

### Core (already in this repo — zero new dependencies)

| Library | Version | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------------------------|
| `tsx` | ^4.0.0 (existing devDependency) [VERIFIED: `package.json`] | Runs the oracle `.mjs`/`.mts` scripts with the ability to `import` real `src/*.ts` modules (`command-builder.ts`, `session-load-helpers.ts`'s `classifyLoadResult`, `import-graph.ts`) without a build step and without duplicating logic | **[VERIFIED]** — empirically tested in this session: `npx tsx <script>.mjs` importing `/…/src/agda/session-load-helpers.ts` directly and calling `classifyLoadResult({success, goalCount, invisibleGoalCount, sourceHoleCount})` returned correct results (`ok-complete` / `ok-with-holes` / `type-error`) with zero prior `npm run build`. Plain `node` (v24.16.0, the project's pinned version) **fails** on the same import chain with `ERR_MODULE_NOT_FOUND`, because this codebase's TS files use `.js`-suffixed specifiers for sibling `.ts` files (the correct Node16-module-resolution convention for *post-compilation* code) and Node's native type-stripping does not rewrite `.js`→`.ts` — it requires the literal extension on disk. |
| `zod` | ^4.0.0 (existing dependency) | Validate the untrusted `CaptureArtifact` JSON at the oracle's read boundary before acting on any of its fields (`inlinedFirstPartySources[].path`, `mergedArgv`, etc.) | Already the project's sole validation library; reuse for input-boundary safety (see Security Domain) |
| `node:child_process` (`spawn`) | builtin | Spawn the disposable cold `agda --interaction-json` subprocess | Already used this way by `verify-cold-replay.mjs`; argv-array form (never a shell string) avoids injection |
| `node:crypto`, `node:fs`, `node:path` | builtin | Closure hashing, safe file I/O, path containment | Already used by `import-closure-hash.ts` / `safe-source-io.ts` — reuse, don't duplicate |
| `vitest` | ^4.1.2 (existing devDependency) | Test the pure comparison/scan functions | Existing project-wide test runner; scripts already have precedent tests under `test/unit/tools/` (`register-capture-session.test.ts`; `verify-cold-replay.test.ts` is planned in the not-yet-executed `01-07`) |

### Supporting (reused `src/` modules — import via `tsx`, never re-derive)

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/protocol/command-builder.ts` (`command`, `quoted`, `stringList`, `iotcmEnvelope`, `modeTopLevelCommand`) | IOTCM string assembly (SSOT) | ORCL-01's cold `Cmd_load`, ORCL-03's cold `Cmd_infer_toplevel` — replaces `verify-cold-replay.mjs`'s current hand-rolled re-derivation of `escapeAgdaString`/`quoted`/`iotcmEnvelope` |
| `src/agda/session-load-helpers.ts` (`classifyLoadResult`) | Normalizes `{success, goalCount, invisibleGoalCount, sourceHoleCount}` → `{hasHoles, isComplete, classification}` | ORCL-01's tuple diff — **both** the warm side (already computed at capture time, per Phase 1) and the cold side must run through this exact function for the comparison to be meaningful |
| `src/agda/parse-load-responses.ts` (`parseLoadResponses`) | Decodes a raw `AgdaResponse[]` stream into `{success, goals, invisibleGoalCount, errors, warnings, sawLoadTerminus, …}` | ORCL-01 needs this (or an equivalent) to get real `goalCount`/`invisibleGoalCount`/`success` values from the **cold** response stream — `verify-cold-replay.mjs`'s current `coldResponsesLookLikeSuccess()` (a crude "any DisplayInfo Error" scan) is explicitly documented in its own header as *not* this |
| `src/agda/import-graph.ts` (`buildImportGraph`, `computeImpact`) | Full transitive-closure module-import graph walk (genuine BFS, not depth-limited) | ORCL-02's closure scope — **already correct**, do not rewrite; see Architecture Patterns |
| `src/agda/source-parsers.ts` (`extractPostulateSites`, `extractOptionsPragmaFlags`) | Postulate-block extraction; `{-# OPTIONS … #-}` flag extraction | ORCL-02 reuses `extractPostulateSites` verbatim; `extractOptionsPragmaFlags` is a starting point for the NEW per-file `--with-K`-override / unsafe-flag scan (see below — this function does not currently scan for TERMINATING/NO_*_CHECK/primTrustMe/COMPILE, which are new) |
| `src/session/safe-source-io.ts` | `O_NOFOLLOW`, 512 KiB cap, atomic rename | Any NEW file write the oracle performs (verdict sidecar, metrics) — per `PITFALLS.md`'s explicit "Security Mistakes" row: *"New capture/replay code adds its own file read/write path → reuse `safe-source-io.ts`, never a parallel ad-hoc path"* |
| `src/repo-root.ts` (`resolveExistingPathWithinRoot`, or the hardened `resolveWithinRoot` pattern from the not-yet-executed `01-07` gap plan) | Path-containment checks | Materializing `inlinedFirstPartySources[].path` onto a temp replay dir — **the exact vector `01-07`'s CR-01 fix targets**; do not hand-roll a third copy of this containment check |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tsx` direct import (recommended) | Pre-`npm run build` then `import from "../dist/…"` | `dist/` avoids adding `tsx` as a *runtime* (not just dev) dependency of the oracle flow, and matches the existing `pretest: npm run build` convention already relied on by e2e tests. But it reintroduces exactly the kind of **silent staleness** this whole milestone exists to eliminate (`dist/` can lag behind edited `src/` if a maintainer forgets to rebuild) — an ironic risk for an anti-false-green tool. `tsx`'s ~50-150ms esbuild-transform overhead per file is negligible for an offline batch oracle. |
| Hand-rolled IOTCM re-derivation (what `verify-cold-replay.mjs` does today, by explicit documented design) | Import `command-builder.ts` via `tsx` | Hand-rolling avoids a scripts→src coupling, but risks two escaping implementations silently drifting (a fix to `escapeAgdaString` would not propagate). Now that `tsx` is verified to work, D-05's "reuse preferred over duplication" can actually be honored for ORCL-01, unlike the manual verification tool that predates this finding. |
| A text-diff npm package (e.g. `diff`, `fast-diff`, `deep-diff`) for ORCL-01's tuple/category-set diff or ORCL-03's alpha-diff | Direct value/`Set` comparison (Node builtins) | ORCL-01's diff target is a 5-field tuple plus a small `Set<string>` of error/warning categories — a real diff library is solving a bigger problem than exists here. ORCL-03's target needs alpha-equivalence-aware comparison (see Open Questions), which a generic text-diff library does not provide anyway. Adding a dependency buys nothing here and would be the project's first new dependency across the entire milestone (zero were added across all 5 executed Phase-1 plans). |

**Installation:**
```bash
# No new dependencies. tsx, zod, vitest, and every reused src/ module already exist in package.json.
```

**Version verification:** [VERIFIED] via direct read of `/Users/eric/projects6/agda-mcp-server/package.json`: `tsx: ^4.0.0`, `zod: ^4.0.0`, `vitest: ^4.1.2`, `typescript: ^5.9.3`, `@types/node: ^24.5.2`. `engines.node: >=24`; local pinned Node 24 binary (via `mise`) is `v24.16.0`. Local Agda binary is `2.8.0` (`agda --version`, on PATH via nix-profile) — matches the version Phase 1's summaries verified against and sits inside `package.json`'s declared `minAgdaVersion 2.6.4.3`–`maxTestedAgdaVersion 2.9.0` range.

## Package Legitimacy Audit

**Not applicable — this phase adds zero new external packages.** Every tool/library used by ORCL-01/02/03 is either a Node.js builtin or an already-installed dependency of this repository (`tsx`, `zod`, `vitest` — all present in `package.json` before this research began). No `npm install` step, and therefore no `slopcheck`/registry-verification gate, is needed for this phase. If a plan for this phase proposes adding *any* new package (e.g. a diff library — see "Alternatives Considered" above for why this research recommends against it), the planner MUST re-run the Package Legitimacy Gate protocol at that time.

## Architecture Patterns

### System Architecture Diagram

```
                        CaptureArtifact (staged JSON, Phase 1 output)
                     .agda-mcp/captures/<fingerprint>-<recurrence>.json
                                        │
                                        ▼
                        [Oracle entry point — scripts/oracle-*.mjs]
                     (single CLI with --only orcl-01|02|03, OR three
                      scripts sharing a helper module — Claude's
                      Discretion per 02-CONTEXT.md; see Pitfall 7 for
                      why ORCL-01 and ORCL-03 want to share ONE cold
                      Agda process, which constrains this choice)
                                        │
                zod-validate the artifact shape at this boundary
                (untrusted input — see Security Domain)
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
     ORCL-01                        ORCL-02                       ORCL-03
  (differential)                (soundness scan)              (conformance, advisory)
          │                             │                             │
   ┌──────▼───────┐              ┌──────▼───────┐              ┌──────▼────────┐
   │ 7 env probes │              │ closure walk  │              │ needs ORCL-01's│
   │ version-match│              │ (reuse        │              │ cold session   │
   │ agdaDir-hash │              │ buildImportGraph/            │ already loaded │
   │ closure-hash │              │  computeImpact│              │ (Cmd_infer_    │
   │ _build fresh │              │  — genuine    │              │  toplevel needs│
   │ spawn-ok     │              │  full BFS,    │              │  requireFile() │
   │ terminus-hit │              │  already      │              │  scope)        │
   │ budget/      │              │  correct)     │              └───────┬────────┘
   │  timeout     │              │       │       │                      │
   └──────┬───────┘              │  token scan:  │              alpha-diff proven
          │                      │  postulate /  │              signature vs CAP-05
    any probe FAILS ──────►      │  TERMINATING/ │              expectedSignature
    INCONCLUSIVE(probe-name)     │  NO_*_CHECK/  │              (string compare —
    (never "server bug")        │  primTrustMe/ │              see Open Questions
          │                      │  COMPILE/     │              for the alpha-
          ▼ (all probes pass)    │  unsafe       │              equivalence gap)
   cold Cmd_load                 │  OPTIONS/     │                      │
   (fresh isolated temp dir      │  --with-K     │                      ▼
    → _build created fresh       │  override /   │            consistent / narrowed /
    by construction; replayed    │  residual     │            added-premises / renamed /
    mergedArgv + agdaDirContents;│  holes        │            vacuous-no-expected-sig
    pinned closure-hash checked  │       │       │            (ALWAYS advisory — never
    before running)              │  diff vs      │             gates, per D-02/D-06)
          │                      │  per-project  │                      │
          ▼                      │  whitelist    │                      │
   parseLoadResponses() +        │  (scripts/    │                      │
   classifyLoadResult()          │  data/, new — │                      │
   (SAME functions the warm      │  see below)   │                      │
   side used at capture time)    │       │       │                      │
          │                      ▼       ▼       │                      │
          ▼                clean / cheat-flagged │                      │
   normalized classification    / no-policy      │                      │
   tuple + error/warning        (D-03: no        │                      │
   category SET diff vs         whitelist →      │                      │
   captured warm tuple          emit ALL findings)│                      │
          │                             │                                │
          └─────────────────────────────┴────────────────────────────────┘
                                        │
                                        ▼
                    compose verdict (D-02 schema — per-predicate outcomes,
                    never a collapsed boolean):
                    "true-green" asserted ONLY IF ORCL-01=pass AND ORCL-02=clean
                    (ORCL-03 always noted alongside, never gates)
                                        │
                                        ▼
                verdict sidecar: .agda-mcp/captures/<fingerprint>-<n>.verdict.json
                (D-01: sidecar, never mutates the CaptureArtifact)
                                        │
                                        ▼
              consumed downstream: Phase 3 (LOCK-02 refuses ORCL-02-failing /
              ORCL-01-INCONCLUSIVE captures; ORCL-01's cold result becomes the
              regression test's expected value) and Phase 4 (QUEUE-02 prioritization)
```

### Recommended Project Structure

```
scripts/
├── oracle/
│   ├── orcl-01-differential.mjs     # server-faithfulness (extends/forks verify-cold-replay.mjs)
│   ├── orcl-02-soundness-scan.mjs   # postulate/pragma/FFI closure scan + whitelist diff
│   ├── orcl-03-conformance.mjs      # alpha-diff proxy (advisory)
│   ├── cold-agda-session.mjs        # SHARED: spawn/load/infer/kill lifecycle for a disposable
│   │                                 #   agda --interaction-json process (ORCL-01 and ORCL-03
│   │                                 #   both need this — see Pitfall 7)
│   └── verdict-schema.mjs           # the D-02 per-predicate verdict shape + composition rule
│                                     #   (a single place both LOCK-02 (Phase 3) and QUEUE-02
│                                     #   (Phase 4) can import/reference)
└── data/
    └── oracle-policy/
        └── <project-key>.json       # interim sanctioned-axiom whitelist + required/forbidden
                                      #   flag baseline (see "Interim Policy File" pattern below)
```

*(Exact file names/CLI shape are explicitly Claude's Discretion per `02-CONTEXT.md` — this is one reasonable decomposition, not a mandate. The one structural constraint worth preserving from this research: ORCL-01 and ORCL-03 sharing a single cold-session lifecycle module, per Pitfall 7.)*

### Pattern: Reuse via `tsx`, never re-derive

**What:** Oracle scripts `import` real `src/*.ts` modules directly, using the exact `.js`-suffixed specifiers already present in those files, and are *invoked* with `tsx` rather than `node`.
**When to use:** Any time oracle logic needs something `src/` already computes correctly (`classifyLoadResult`, `command-builder.ts`'s IOTCM assembly, `buildImportGraph`/`computeImpact`).
**Example (verified working in this session):**
```javascript
// Source: verified empirically against this repo, 2026-07-02, tsx v4, Node v24.16.0
// Run with: npx tsx this-script.mjs   (NOT: node this-script.mjs — see Common Pitfalls)
const { classifyLoadResult } = await import(
  "/Users/eric/projects6/agda-mcp-server/src/agda/session-load-helpers.ts"
);
classifyLoadResult({ success: true, goalCount: 0, invisibleGoalCount: 0, sourceHoleCount: 0 });
// => { hasHoles: false, isComplete: true, classification: 'ok-complete' }
classifyLoadResult({ success: true, goalCount: 2, invisibleGoalCount: 0, sourceHoleCount: 0 });
// => { hasHoles: true, isComplete: false, classification: 'ok-with-holes' }
classifyLoadResult({ success: false, goalCount: 0, invisibleGoalCount: 0, sourceHoleCount: 0 });
// => { hasHoles: false, isComplete: false, classification: 'type-error' }
```

### Pattern: Interim oracle-policy file (pre-Phase-5/PROC-02)

**What:** A repo-owned (agda-mcp-server's own repo, not the target project's repo) JSON file per fuel corpus, holding the sanctioned-axiom whitelist and required/forbidden flag baseline, validated via the existing `loadJsonData()` (`src/json-data.ts`) SSOT convention already used for `src/protocol/data/protocol-command-registry.json` etc.
**When to use:** ORCL-02 needs *some* durable home for "unimath: univalence/funext/replacement are sanctioned; `--without-K --exact-split --no-import-sorts --auto-inline --no-require-unique-meta-solutions --no-postfix-projections` are required" (concrete values already known from `.planning/research/FUEL-CORPORA.md`/`REQUIREMENTS.md`'s PROC-02 text) *before* Phase 5 formalizes it.
**Why not `.agda-mcp.json`:** That schema (`schemas/agda-mcp.schema.json`) is `"additionalProperties": false`, is read by the *live server* on every `agda_load` call (mtime-cached), and belongs to the *target project's own* configuration surface — mixing static oracle-only policy data into a hot-path, server-owned, schema-locked file is the wrong layer, and would need a breaking schema change for a concern D-05 explicitly keeps out of `src/`/the live server.
**Recommendation:** `scripts/data/oracle-policy/<project-key>.json` (keyed by an identifying string — e.g. the `.agda-lib` name, `"agda-unimath"` — since the oracle is agnostic to *which* target repo it's pointed at), loaded the same way `loadJsonData()` loads other static data, but living under `scripts/` (not `src/*/data/`) per D-05. This gives Phase 5's PROC-02 a clean, already-JSON, already-zod-shaped file to promote/relocate rather than a green-field design task. **[ASSUMED — this is original synthesis for this research session, not verified against any external convention; flag for plan-phase confirmation.]**

### Anti-Patterns to Avoid

- **A second, independent IOTCM-escaping implementation:** `verify-cold-replay.mjs` currently hand-rolls `escapeAgdaString`/`quoted`/`iotcmEnvelope` because, at the time it was written, no `tsx`-based import path had been verified. Now that it has (this research), a *third* copy for ORCL-01 would be a straightforward SSOT violation — reuse `command-builder.ts` via `tsx`.
- **Treating "any DisplayInfo Error present" as the classification tuple:** this is `verify-cold-replay.mjs`'s current, explicitly-scoped-down approach (its own header says "full-fidelity comparison is Phase 2's ORCL-01 job, not this manual script's"). ORCL-01 must not inherit this simplification — it needs `parseLoadResponses()`'s real `goalCount`/`invisibleGoalCount`/`success` extraction, not a boolean Error-presence scan.
- **Calling `createLibraryRegistration()` again for the cold run:** it is non-deterministic (`mkdtempSync` + reads the *current* `~/.agda`/`AGDA_DIR` at call time — see `library-registration.ts`). ORCL-01 must replay the *captured* `manifest.agdaDirContents` (the exact `libraries`/`defaults` file contents at capture time), never re-derive.
- **Reusing `AGDA_MCP_COMMAND_TIMEOUT_MS` for the oracle's budget:** [VERIFIED] this env var defaults to `120_000` ms (`src/session/command-completion.ts:44`) and is designed for the live server's *interactive* per-command wait. D-04 is explicit that the oracle is offline batch and must have its own, separate (optionally larger, optionally unbounded) budget concept.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IOTCM command string assembly | A third hand-written `escapeAgdaString`/`quoted`/`command` implementation | `src/protocol/command-builder.ts` via `tsx` import | SSOT; a quoting bug fixed once must not need fixing in three places (server, `verify-cold-replay.mjs`, ORCL-01) |
| Cold-response → classification | A new "does this look like success" heuristic (e.g. `verify-cold-replay.mjs`'s current Error-presence scan) | `parseLoadResponses()` + `classifyLoadResult()` | These are the exact functions the WARM side's captured classification already went through — only using the same functions on both sides makes "diff the normalized classification tuple" meaningful rather than comparing apples to a different fruit |
| Transitive file-dependency closure walk | A new import-graph BFS for ORCL-02 | `buildImportGraph()`/`computeImpact()` (`src/agda/import-graph.ts`) | Already a genuine, already-tested, O(n+e) full transitive closure (verified by direct source read: `collectReachable` is an unbounded BFS, not depth-limited) — there is no Lean-#8840-style under-counting bug to fix here; the closure computation was already sound before this phase |
| Postulate-block detection | A new regex/AST scanner | `extractPostulateSites()` (`src/agda/source-parsers.ts`) | Already handles both inline and indented-block postulate forms, and block-comment stripping; reuse verbatim as ORCL-02's postulate half |
| Safe file writes for the verdict sidecar | A new `writeFileSync` path | `src/session/safe-source-io.ts` (`O_NOFOLLOW`, size cap, atomic rename) | Explicit `PITFALLS.md` guidance: any *new* capture/replay-adjacent file I/O path is a documented TOCTOU/symlink-race risk unless it reuses the existing hardened helper |
| Path containment for materialized replay sources | A new `join()`-based path check | `resolveExistingPathWithinRoot`/`resolveFileWithinRoot` (`src/repo-root.ts`), or the hardened `resolveWithinRoot` pattern from the (not-yet-executed) `01-07` gap plan | `01-07`'s own objective text names this exact vector ("a real arbitrary-file-write path traversal") in `verify-cold-replay.mjs`'s current `materializeSources()` — don't reintroduce it in a new script |
| A generic text-diff algorithm | An npm diff library | Direct value/`Set` comparison | The actual diff targets (a 5-field tuple, a small category set, later an alpha-equivalence string compare) are all small, structured, and don't benefit from a generalized line-diff algorithm |

**Key insight:** every piece of "don't hand-roll" guidance in this phase points at the *same* repository's own `src/` — this is not a "go find a library" phase, it is a "go reuse what Phase 1 (and the pre-existing tool surface) already got right" phase. The only genuinely new logic is: the 7-probe INCONCLUSIVE gate, the widened pragma/FFI token vocabulary, the whitelist-diff, and the alpha-diff proxy.

## Common Pitfalls

### Pitfall 1: Plain `node` cannot import this codebase's `src/*.ts` files
**What goes wrong:** Running an oracle script with `node scripts/oracle-01.mjs` (instead of `tsx`) throws `ERR_MODULE_NOT_FOUND` the instant it tries to import a `src/` module, because that module's own sibling imports use `.js`-suffixed specifiers pointing at `.ts` files on disk.
**Why it happens:** Node 24's native TypeScript type-stripping requires the *literal* extension used in the specifier to exist on disk; it does not implement the TypeScript-convention rewrite of `.js`→`.ts`. [VERIFIED — tested directly: `node src/agda/session-load-helpers.ts`-style import chains fail with `Cannot find module '.../session-constants.js'` on Node v24.16.0.]
**How to avoid:** Invoke oracle scripts via `tsx` (`npx tsx scripts/oracle/...mjs` or add an npm script wrapping it), which correctly resolves the `.js`→`.ts` convention (verified working).
**Warning signs:** `ERR_MODULE_NOT_FOUND` referencing a `.js` file that doesn't exist, where a `.ts` file of the same base name does.

### Pitfall 2: Treating Phase 1's `verify-cold-replay.mjs` as a safe, already-hardened fork base
**What goes wrong:** Forking/extending the script as-is inherits two known, currently-unfixed bugs.
**Why it happens:** Phase 1's own verification pass (`01-VERIFICATION.md`) found: (a) **CR-01** — `materializeSources()` does not containment-check `inlinedFirstPartySources[].path` before `writeFileSync`, a real arbitrary-file-write-outside-the-temp-dir path-traversal vector if an artifact's path field contains `..` segments; (b) **CR-02** — a cold response that produces no substantive output before the idle window elapses (`coldResponsesLookLikeSuccess([])` on an empty/near-empty `responses` array) is currently treated as a **false PASS**, not a distinct INCONCLUSIVE — precisely the "vacuous truth" failure mode this milestone exists to eliminate. Gap-closure plans `01-06`/`01-07` already exist on disk with these fixes speced out, **but as of this research session neither has an execution summary or completion commit** (`git log` shows only `docs(01): add gap-closure plans...` / `docs(01): revise 01-06 gap plan...`, no `01-06-SUMMARY.md`/`01-07-SUMMARY.md`).
**How to avoid:** Before planning treats `verify-cold-replay.mjs` as ORCL-01's foundation, **check whether `01-06`/`01-07` have executed** (look for their `-SUMMARY.md` files / completion commits). If not landed yet, the Phase 2 plan should either (a) sequence Phase-1 gap-closure execution first, or (b) build ORCL-01's differential fresh with these two fixes designed in from the start (the `01-07` plan's own text is a ready-made spec for the containment check and the INCONCLUSIVE-on-empty-response behavior — reusable as design material regardless of whether that literal plan executes first).
**Warning signs:** A new ORCL-01 implementation that copies `materializeSources()`/`coldResponsesLookLikeSuccess()` verbatim without checking these two known issues first.

### Pitfall 3: Comparing against the wrong "cold success" signal
**What goes wrong:** Using a crude "no `DisplayInfo`/`Error`" check (what `verify-cold-replay.mjs` does today) instead of the real classification tuple silently under-diffs — e.g., a load that comes back `ok-with-holes` cold but was captured as `ok-complete` warm (a real, interesting divergence) would show as "both non-error" and be missed entirely, since the crude check only distinguishes error/non-error, not the 3-way `ok-complete`/`ok-with-holes`/`type-error` split, let alone goal counts.
**Why it happens:** The simpler check was an intentional, documented scope-reduction for a *manual verification tool*, not a design decision meant to carry forward.
**How to avoid:** Feed the cold response stream through the real `parseLoadResponses()` → `classifyLoadResult()` pipeline (both via `tsx` import), exactly as the warm side already does at capture time.
**Warning signs:** ORCL-01 code that pattern-matches on `response.info.kind === "Error"` as its *only* signal, rather than computing `goalCount`/`invisibleGoalCount`/`success` and normalizing through `classifyLoadResult`.

### Pitfall 4: Diffing a classification that never had a real Agda round-trip
**What goes wrong:** `LoadResult.classification` is a general `string`, and several values are pure early-return sentinels for input-validation/infrastructure failures that never dispatch `Cmd_load` at all: `"invalid-command-line-options"`, `"invalid-profile-options"`, `"process-died-during-reconciliation"`, `"load-incomplete-no-terminus"`, `"not-found"`. [VERIFIED — direct read of `session-load-helpers.ts`/`completeness.ts`: the genuine 3-value `CompletenessClassification` union (`"ok-complete" | "ok-with-holes" | "type-error"`) is a strict subset of every string that can appear in a captured `sessionClassification`.] Attempting a cold-vs-warm diff against one of the non-completeness values is meaningless — there is nothing for the cold side to "agree" or "disagree" with.
**Why it happens:** The type contract deliberately widens `classification` to `string` to carry these infra-level sentinels, but the ORCL-01 requirement's "normalized classification tuple" language is written against the 3-value completeness family specifically.
**How to avoid:** ORCL-01 should only engage its differential (probe → cold-load → tuple-diff) when the captured warm classification is one of the 3 completeness values. For anything else, emit a `SKIP`-equivalent outcome (mirroring `verify-cold-replay.mjs`'s existing `SKIP` verdict for "no load-family recorded action") rather than forcing a diff that has no meaningful cold counterpart.
**Warning signs:** A verdict schema with no way to represent "there was nothing to diff here" distinct from both `pass` and `INCONCLUSIVE(probe)`.

### Pitfall 5: The `--with-K` file-level override is a REAL, Agda-unenforced cheat — verified directly
**What goes wrong:** A file can declare `{-# OPTIONS --with-K #-}` and `open import` a module that was compiled `--without-K`, then use full K-axiom reasoning (e.g. UIP) locally — **with zero warning or error from Agda.**
**Why it happens:** [VERIFIED empirically against local Agda 2.8.0] I tested both directions of Agda's "co-infective options" mechanism directly:
  - A `--without-K` file importing a module that hard-requires `--with-K` (Agda's own `Agda.Builtin.Equality.Erase`, which defines `primEraseEquality`) is **rejected** with a hard `error: [CoInfectiveImport]` (exit code 42) — this direction *is* protected.
  - A `--with-K` file importing a `--without-K` module and then proving `uip : {A : Set} {x y : A} (p q : x ≡ y) -> p ≡ q` (a genuine K-axiom-only theorem) via `uip refl refl = refl` **compiles cleanly, exit code 0, zero diagnostics.**
  This asymmetry means ORCL-02's "file-level `--with-K` override" scan target is not a theoretical worry — it is a real, currently-silent gap in Agda's own safety net, and no amount of relying on Agda's built-in checks will catch it.
**How to avoid:** ORCL-02 must scan each file's own `{-# OPTIONS #-}` pragma (`extractOptionsPragmaFlags` is the existing extraction primitive to extend) for a `--with-K` that contradicts the project's `--without-K` policy — this cannot be delegated to Agda's own infective-option checker.
**Warning signs:** An ORCL-02 design that assumes "Agda would have caught it" for any flag-consistency issue — verified false for this specific, HoTT-critical direction.

### Pitfall 6: `primEraseEquality` under `--without-K` — a claim I initially got wrong via web search, corrected empirically
**What goes wrong (meta-pitfall about doing this research, worth recording):** An initial web search suggested `primEraseEquality` "throws a warning... or an error when `--safe` is also enabled" under `--without-K` — implying it might be a silent, warning-only soundness leak analogous to the `--with-K` override above, which would have meant recommending ORCL-02 add it to the scan list (a scope change beyond the phase's locked requirement wording).
**What's actually true:** [VERIFIED empirically against local Agda 2.8.0, refuting the web-search summary] `open import Agda.Builtin.Equality.Erase` from a `--without-K` file is a **hard `[CoInfectiveImport]` error, exit code 42, with no `--safe` needed to trigger it.** `primEraseEquality` is therefore *unreachable* in a `--without-K` codebase like agda-unimath at all — Agda's own co-infective checking forecloses it completely. This actually **confirms** (for a more precise reason than originally stated) `.planning/research/ORACLE-VALIDITY.md`'s existing correction #2 ("`primEraseEquality` is safe-compatible and sound... do NOT whitelist the latter") — no change to ORCL-02's scope is warranted here.
**Why it happens:** Generic web search results conflate different Agda versions/contexts and can misreport warning-vs-error severity; a direct empirical test against the exact pinned version is more reliable than a search summary.
**How to avoid:** For any Agda flag/pragma-interaction claim that materially changes ORCL-02's scan list, prefer a 5-line empirical test against the actual pinned Agda binary over a web search summary — this project has a real Agda 2.8.0 available locally, and the interaction/flag semantics are exactly the kind of thing that's cheap to verify directly and easy to get wrong secondhand.
**Warning signs:** Any plan or implementation note that cites "Agda docs say X" for a flag-interaction claim without a corroborating direct test, where a direct test was feasible.

### Pitfall 7: `Cmd_infer_toplevel` cannot run standalone
**What goes wrong:** Spinning up a fresh cold Agda process purely to run `Cmd_infer_toplevel` for ORCL-03, independent of ORCL-01's own cold process, either fails or requires a redundant second `Cmd_load`.
**Why it happens:** [VERIFIED via direct code read] `inferTopLevel()` (`src/agda/expression-operations.ts:65-77`) calls `ctx.requireFile()` before dispatching — every existing top-level infer/compute command in this codebase requires a file already loaded in the calling session's scope, because `Cmd_infer_toplevel` type-checks an expression string *in the context of* the currently-loaded module's names.
**How to avoid:** Design ORCL-01 and ORCL-03 to share one cold Agda subprocess lifecycle: cold `Cmd_load` first (ORCL-01's job), then — if the target's `expectedSignature` is present (CAP-05) — issue `Cmd_infer_toplevel <target-name>` against the *same still-open* process before killing it (ORCL-03's job), rather than each predicate spawning its own process. This is a concrete architectural constraint on whatever CLI-shape decision is made (single entry point vs three scripts, per Claude's Discretion) — a "three independent scripts" design would need an explicit shared helper module for this process lifecycle, not three separate spawns.
**Warning signs:** An ORCL-03 implementation that spawns its own `agda --interaction-json` and immediately sends `Cmd_infer_toplevel` with no preceding `Cmd_load`.

### Pitfall 8: `DISPLAY`-pragma / pattern-synonym printed-string spoofing has no known defeat
**What goes wrong:** Two semantically different types can print identically (or two semantically identical types can print differently) because Agda auto-generates a `DISPLAY` form for every pattern synonym, rewriting how a term is *pretty-printed* — after normalization, not instead of it.
**Why it happens:** [CITED: agda.readthedocs.io/en/latest/language/pattern-synonyms.html] "For each pattern synonym, Agda declares a DISPLAY pragma refolding the right-hand side to the left-hand side" and "display forms are not type checked." I searched specifically for a flag to disable this (`--no-display-forms` or equivalent) and **found none** in official docs after two targeted fetches — this is a negative claim (see Assumptions Log; flagged, not asserted as impossible).
**How to avoid:** Cannot be fully defeated at the IOTCM-string layer. This is precisely why the phase's own design (D-02/D-06) keeps ORCL-03 permanently advisory, never a hard gate — this research *validates* that decision rather than finding a way around it. The best available mitigation is process, not mechanism: ORCL-02's closure scan already flags newly-introduced `DISPLAY` pragmas or pattern synonyms as a signal worth surfacing alongside a `conformance-flagged` ORCL-03 outcome (their co-occurrence is a stronger tell than either alone).
**Warning signs:** Any plan claiming ORCL-03 will "reliably compare normalized internal types" as if this were a solved problem — the requirement's own wording ("not printed strings") is aspirational; what's actually achievable is a `Normalised`-rewrite-mode printed string, alpha-diffed, with this residual gap documented and accepted.

## Code Examples

### Constructing a cold `Cmd_load` via reused SSOT (replaces `verify-cold-replay.mjs`'s hand-rolled version)
```javascript
// Source: this repo's src/protocol/command-builder.ts, verified importable via tsx
import { command, quoted, stringList, modeTopLevelCommand } from
  "/Users/eric/projects6/agda-mcp-server/src/protocol/command-builder.js";
// Note: command-builder.ts itself imports escapeAgdaString via a `.js` specifier
// pointing at response-parsing.ts — this resolves correctly under tsx (verified),
// unlike plain `node` (verified NOT to resolve — see Pitfall 1).

const iotcm = `IOTCM ${quoted(absPath)} NonInteractive Direct (` +
  command("Cmd_load", quoted(absPath), stringList(mergedArgv)) + `)`;
// Cmd_infer_toplevel, for ORCL-03, reusing the SAME "Normalised" mode convention
// every other rewrite-mode command in this codebase already uses exclusively:
const inferCmd = modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", quoted(targetExprOrName));
```

### The `--with-K` override cheat, as a concrete ORCL-02 test fixture seed
```agda
-- Source: verified against local Agda 2.8.0 in this research session (exit 0, zero diagnostics)
-- LibBase.agda (simulates the "library", --without-K, agda-unimath-style):
{-# OPTIONS --without-K #-}
module LibBase where
open import Agda.Builtin.Equality
libLemma : {A : Set} {x y : A} -> x ≡ y -> y ≡ x
libLemma refl = refl

-- WithKOverride.agda (the cheat: silently re-enables full K-axiom reasoning):
{-# OPTIONS --with-K #-}
module WithKOverride where
open import LibBase
open import Agda.Builtin.Equality
uip : {A : Set} {x y : A} (p q : x ≡ y) -> p ≡ q
uip refl refl = refl
-- `agda WithKOverride.agda` exits 0 with NO warning or error.
-- ORCL-02 must catch this via a per-file OPTIONS-pragma scan; Agda will not.
```

### `--safe` correctly rejecting a postulate (confirms why ORCL-02 needs a whitelist-diff, not forced `--safe`)
```text
$ agda --safe SafePostulate.agda
SafePostulate.agda:3.11-19: error: [SafeFlagPostulate]
Cannot postulate ax with safe flag
-- Verified against local Agda 2.8.0. Confirms ORACLE-VALIDITY.md's correction #1:
-- --safe cannot run on agda-unimath at all, since it legitimately postulates
-- univalence/funext/replacement — hence ORCL-02 must be a whitelist-diff over
-- the transitive closure, never "just run --safe and see if it rejects".
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Trust warm-session `ok-complete` as ground truth for "did my fix work" | Three-predicate oracle triad (differential + soundness scan + conformance proxy), each catching a structurally distinct false-green family | This phase (design already locked in `02-CONTEXT.md`/`REQUIREMENTS.md`, based on `ORACLE-VALIDITY.md`'s research) | A single cold re-run is proven (both by this project's own research and by the Lean ecosystem's independent convergence — `.planning/research/LEAN-COMPARISON.md`) to be self-sufficient for only ONE of three false-green families |
| `loop.sh`'s `gate_verify` bash prototype (raw-agda typecheck + unsolved-meta grep; single-file no-postulate grep; pinned `.sig` substring match) — the Codex-Homotopy-Group corpus's hand-rolled stand-in, built *because* MCP `ok` was untrusted | This phase's TS-reusing, transitive-closure-scoped, whitelist-diffed, alpha-diffed triad | N/A — this phase supersedes it | The bash prototype's own PR self-reports exactly 4 gaps (renamed-statement-without-`.sig`, imported-postulate via single-file-only grep, file-level `--allow-unsolved-metas` override, trivially-true restatement) — each maps to a specific predicate in this triad, giving a concrete acceptance sanity-check |
| `verify-cold-replay.mjs`'s crude "any DisplayInfo Error" success check | `parseLoadResponses()` + `classifyLoadResult()` normalized tuple | This research session's finding — not yet implemented | Distinguishes `ok-complete`/`ok-with-holes`/`type-error` and goal counts, not just error/non-error |
| Assuming a hand-rolled second IOTCM-string implementation was necessary because `src/` couldn't be imported from `scripts/` without a build step | `tsx` verified to correctly resolve this codebase's `.js`→`.ts` import convention with zero build step | This research session — empirically tested for the first time in this project's history (per absence of any prior mention of this exact test in Phase 1's summaries) | Removes the stated justification for `verify-cold-replay.mjs`'s "does NOT import from src/" design constraint for any *new* oracle script |

**Deprecated/outdated:**
- Treating a fresh `agda` re-run, alone, as sufficient verification for a defect fix — this is the exact assumption Pitfall 9 in `.planning/research/PITFALLS.md` documents as "the single most dangerous class of bug for a verification tool," and this phase exists to retire it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recommended interim policy-file location (`scripts/data/oracle-policy/<project-key>.json`, keyed by `.agda-lib` name, validated via `loadJsonData()`) | Architecture Patterns — "Interim oracle-policy file" | Low-medium: this is a structural convenience recommendation, not a correctness requirement. If the planner picks a different location/schema, nothing in ORCL-01/02/03's core logic depends on this specific choice — only Phase 5's PROC-02 handoff cleanliness is affected. |
| A2 | The alpha-diff for ORCL-03 should be implemented as a bound-variable-canonicalization pass over tokenized `Cmd_infer_toplevel` output (rename each distinct bound identifier to a positional canonical name, then compare token streams) | Open Questions (below) | Medium: this is original synthesis, not verified against any existing implementation or library. If the actual captured signatures have more syntactic variance than a simple token-canonicalization pass handles (e.g. differing use of `∀`/explicit binder lists, unicode variants, implicit-argument elision), the proxy could both under- and over-flag. Needs validation against a handful of real captured signatures during planning/implementation, not just designed in the abstract. |
| A3 | No Agda flag/option exists to disable `DISPLAY`-pragma pretty-printing for pattern synonyms (a negative claim) | Common Pitfalls, Pitfall 8 | Medium: I searched official docs twice with targeted prompts and found no disabling mechanism, but did not exhaustively grep Agda's own source code or the full command-line-options reference for an obscure/undocumented flag. If one exists, ORCL-03's residual risk is smaller than stated. |
| A4 | `verify-cold-replay.mjs`'s CR-01/CR-02 bugs are still unfixed as of this research (01-06/01-07 gap-closure plans exist but show no completion evidence) | Common Pitfalls, Pitfall 2 | Low: this is a point-in-time, easily re-checked fact (look for `01-06-SUMMARY.md`/`01-07-SUMMARY.md` or their completion commits) — by the time Phase 2 is actually planned/executed, this may have changed. Re-verify at plan time, not just trust this document. |

## Open Questions

1. **What is the actual best achievable technique for ORCL-03's "alpha-diff over normalized internal types"?**
   - What we know: `Cmd_infer_toplevel` (the only IOTCM command that produces a proven top-level signature) returns a plain pretty-printed string in every existing use in this codebase, always under `"Normalised"` rewrite mode. There is no structured-AST wire format available. `DISPLAY`-pragma/pattern-synonym printing can make two different underlying terms print identically, or vice versa (Pitfall 8) — genuinely undefeatable at this layer as far as this research could determine.
   - What's unclear: exactly how much syntactic noise (bound-variable naming, binder-list style, implicit-argument elision) a naive string-diff would need to normalize away before it's a *useful* advisory signal rather than a noisy one that gets ignored.
   - Recommendation: implement the simplest viable version first — direct string equality after whitespace normalization — and treat "does this need alpha-equivalence-aware canonicalization" as an empirical question to answer against real captured `expectedSignature`/proven-signature pairs (e.g. from the Codex-Homotopy-Group corpus's `FORMALIZATION-PLAN.md` family of documents, which already contain real intended signatures) during implementation, rather than over-engineering a token-canonicalization pass (A2) before seeing real data. Since ORCL-03 is advisory-only (never gates), a noisier-than-ideal first version is an acceptable v1 cost.

2. **Does the `inlinedFirstPartySources` manifest field capture the target project's `.agda-lib` file itself?**
   - What we know: Agda automatically uses the modern, version-namespaced `_build/<agda-version>/…` interface-cache directory (verified: `test/fixtures/agda/_build/2.8.0/` exists in this repo) *only* when the project has an `.agda-lib` file; a bare directory with no `.agda-lib` falls back to legacy adjacent-`.agdai` placement (verified directly: a `.agda-lib`-less test project produced `Simple.agdai` next to `Simple.agda`, no `_build/` at all).
   - What's unclear: whether Phase 1's `inlineFirstPartySources()`/`buildImportGraph()` walk treats `.agda-lib` as part of the "transitive import closure" (it isn't imported via `import`/`open import` — it's project metadata Agda reads from the CWD), meaning cold replay might silently use legacy per-file caching instead of the `_build/` mode the original warm session used.
   - Recommendation: verify this explicitly during ORCL-01 implementation (check whether a materialized replay directory that HAD an `.agda-lib` in the original project ends up with one in the temp replay dir too). This doesn't block the "isolated fresh `_build`" property either way (both modes are freshly-isolated in a fresh temp dir) — it's a fidelity nuance, not a soundness gap, but worth a concrete test.

3. **Should ORCL-02's OPTIONS-pragma scan also catch `--exact-split`/`--no-import-sorts`-style *removal* (a required flag silently dropped at file level), not just *addition* of a forbidden flag?**
   - What we know: PROC-02's known agda-unimath policy is a *required*-flags list (`--without-K --exact-split --no-import-sorts --auto-inline --no-require-unique-meta-solutions --no-postfix-projections`), not just a forbidden-flags list. The `--with-K` case (Pitfall 5) is "added a dangerous flag"; a required flag being *silently absent* at file level is a different failure shape (there's no positive token to grep for — it's an absence).
   - What's unclear: whether a file-level OPTIONS pragma can actually *remove* a project-wide required flag in Agda's semantics, or whether required flags (once set via `.agda-lib`/command-line) are non-retractable per-file (in which case this concern doesn't apply and only *additions* like `--with-K` matter).
   - Recommendation: a cheap follow-up empirical test (analogous to Pitfall 5's test) during implementation: does a file with `{-# OPTIONS --without-K #-}` inside a project whose `.agda-lib`/command-line already sets `--exact-split` succeed if that file's local pragma *doesn't* repeat `--exact-split`? If required flags are monotonic/non-retractable, this open question resolves itself in ORCL-02's favor with no extra scan logic needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|----------|----------|
| `agda` binary | ORCL-01 (cold `Cmd_load`), ORCL-03 (cold `Cmd_infer_toplevel`) | ✓ [VERIFIED] | 2.8.0 (via nix-profile, `/Users/eric/.nix-profile/bin/agda`) | Within `package.json`'s declared `minAgdaVersion 2.6.4.3`–`maxTestedAgdaVersion 2.9.0` range |
| Node.js ≥ 24 | Running oracle scripts at all | ✓ [VERIFIED] | v24.16.0 available via `mise` (`~/.local/share/mise/installs/node/24/bin/node`); system default is v22.22.0 | Every Phase-1 plan's "Issues Encountered" notes had to explicitly invoke `mise exec node@24 -- …` for the same reason — this is an established, recurring environment quirk in this project's execution history, not new to this phase |
| `tsx` | Oracle scripts importing `src/*.ts` modules directly (recommended mechanism) | ✓ [VERIFIED] | ^4.0.0, present in `node_modules/.bin/tsx` | `dist/`-based import after `npm run build` (see Alternatives Considered) |
| `git` | CAP-05's `beforeSource` resolution (already built in Phase 1; not new to this phase, but the oracle reads this field) | Not directly re-verified this session (Phase 1 already established `execFileSync("git", ...)` with try/catch → `"unavailable"` fallback) | — | Already degrades gracefully per Phase 1's `resolveBeforeSource()` |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none identified — every dependency this phase needs is already present and verified in this environment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 [VERIFIED: `package.json`] |
| Config file | `vitest.config.ts` — includes `test/examples/**`, `test/unit/**`, `test/property/**`, `test/integration/**`; 30s test timeout |
| Quick run command | `npx vitest run test/unit/tools/<new-oracle-test-file>.test.ts` |
| Full suite command | `npm test` (== `vitest run`; `pretest` runs `npm run build` first — required for any e2e test spawning `dist/index.js`, not directly relevant to pure oracle-script unit tests but part of the existing gate) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| ORCL-01 | Pure verdict computation: given synthetic warm-tuple + synthetic cold-response arrays, produces `pass`/`server-false-green-candidate`/`INCONCLUSIVE(probe)` correctly | unit | `npx vitest run test/unit/tools/oracle-orcl-01.test.ts` | ❌ Wave 0 |
| ORCL-01 | End-to-end: a real captured artifact (from a real `agda_load` via the existing `RUN_AGDA_INTEGRATION=1` convention) cold-replays and produces the correct verdict against local Agda 2.8.0 | integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-orcl-01.test.ts` (or a dedicated `test/integration/` file, following the existing `RUN_AGDA_INTEGRATION`-gate convention seen throughout Phase 1's summaries) | ❌ Wave 0 |
| ORCL-01 | Every env probe (version/agdaDir-hash/closure-hash/`_build`/spawn/terminus/timeout) independently gates to INCONCLUSIVE, naming itself, when it fails | unit | `npx vitest run test/unit/tools/oracle-orcl-01.test.ts` | ❌ Wave 0 |
| ORCL-02 | Token/pragma scan detects each of: `postulate`, `{-# TERMINATING #-}`, `{-# NO_POSITIVITY_CHECK #-}`/`{-# NO_UNIVERSE_CHECK #-}`, `primTrustMe`, `{-# COMPILE ... #-}`, a file-level `--with-K` override, residual `?`/`{! !}` — against synthetic source fixtures (concrete working examples for several of these were verified in this research session and can seed fixtures directly, e.g. the `LibBase.agda`/`WithKOverride.agda` pair above) | unit | `npx vitest run test/unit/tools/oracle-orcl-02.test.ts` | ❌ Wave 0 |
| ORCL-02 | Whitelist-diff correctly distinguishes `clean` / `cheat-flagged` / `no-policy` (D-03) | unit | `npx vitest run test/unit/tools/oracle-orcl-02.test.ts` | ❌ Wave 0 |
| ORCL-02 | Closure scope reuses `buildImportGraph`/`computeImpact` and catches a postulate discharged via a pre-existing upstream dependency (no new token in the diff) | integration (real fixture files across 2+ modules) | `npx vitest run test/unit/tools/oracle-orcl-02.test.ts` | ❌ Wave 0 |
| ORCL-03 | Alpha-diff proxy correctly classifies `consistent`/`conformance-flagged`/`vacuous-no-expected-signature`, and never returns a hard-gate/blocking outcome | unit | `npx vitest run test/unit/tools/oracle-orcl-03.test.ts` | ❌ Wave 0 |
| ORCL-01/02/03 composition | Verdict composition: `true-green` asserted iff ORCL-01=pass AND ORCL-02=clean; ORCL-03 never affects the boolean | unit | `npx vitest run test/unit/tools/oracle-verdict-schema.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant single `oracle-orcl-0N.test.ts` file (quick run command above)
- **Per wave merge:** `npm test` (full suite — this project's convention throughout Phase 1 was a full-suite run at the end of each plan)
- **Phase gate:** full suite green, plus the `RUN_AGDA_INTEGRATION=1` variant run at least once against a real local Agda binary before `/gsd:verify-work` (established Phase-1 precedent — every plan's summary explicitly re-ran with `RUN_AGDA_INTEGRATION=1` before declaring done)

### Wave 0 Gaps
- [ ] `test/unit/tools/oracle-orcl-01.test.ts` — covers ORCL-01 (pure verdict logic + probe gating; integration variant covers the real cold-replay path)
- [ ] `test/unit/tools/oracle-orcl-02.test.ts` — covers ORCL-02 (pragma/token scan + whitelist-diff)
- [ ] `test/unit/tools/oracle-orcl-03.test.ts` — covers ORCL-03 (alpha-diff proxy, advisory-only behavior)
- [ ] `test/unit/tools/oracle-verdict-schema.test.ts` — covers the D-02 composition rule shared by all three
- [ ] New fixture files under `test/fixtures/agda/` for ORCL-02's pragma vocabulary (a `{-# TERMINATING #-}` example, a `primTrustMe` example, a `{-# COMPILE #-}` example, and the verified `LibBase.agda`/`WithKOverride.agda` pair for the `--with-K`-override case) — none of these pragma shapes appear to have existing fixtures today (only hole/postulate fixtures were found under `test/fixtures/agda/`)
- [ ] Framework install: none — vitest is already fully configured; no new install needed

## Security Domain

This project has no network/HTTP/DB surface (per `CLAUDE.md`'s constraints and the "Out of Scope" table in `REQUIREMENTS.md`), so most classic ASVS web-application categories are structurally inapplicable. The real security surface for this phase is **untrusted-input handling of a captured JSON artifact that then drives filesystem writes and subprocess argv** — exactly the class of bug Phase 1's own verification already found once (CR-01).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No | Single-user local CLI/stdio tool; no auth surface |
| V3 Session Management | No | N/A — no web session concept |
| V4 Access Control | No | N/A — no multi-user access model |
| V5 Input Validation | **Yes** | `zod`-validate the `CaptureArtifact` JSON shape at the oracle's read boundary before trusting any field (`inlinedFirstPartySources[].path`, `mergedArgv`, `manifest.agdaBinaryPath`) — reuse the existing `src/agda/session-capture/artifact-types.ts` interfaces as the schema source of truth rather than inventing a parallel shape |
| V6 Cryptography | No (indirectly relevant only) | Fingerprinting (`fingerprintBugReport`'s sha256) is already Phase-1-owned and reused, not reinvented here |
| File-handling / path containment (not a numbered ASVS category here, but the concrete risk) | **Yes** | Reuse `resolveExistingPathWithinRoot`/the hardened `01-07`-style `resolveWithinRoot` pattern for every path derived from `inlinedFirstPartySources[].path` before any `writeFileSync`/`mkdirSync` — this is precisely the CR-01 vector |

### Known Threat Patterns for this domain

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Path traversal via a captured artifact's `inlinedFirstPartySources[].path` containing `..` segments, writing outside the fresh temp replay dir | Tampering | Containment check every materialized path against the temp root before writing (the exact, already-identified CR-01 fix) |
| A corrupted/adversarial `mergedArgv` smuggling extra Agda flags into the cold `Cmd_load` | Tampering | `spawn()` with an argv array (never a shell string — already the existing pattern); flags still flow through Agda's own command-line-option validation, and `command-builder.ts`'s `quoted()`/`stringList()` escaping (reused, not re-derived) prevents the IOTCM string itself from being broken out of |
| A captured artifact whose cold replay never terminates (hung/wedged process), or whose empty response is mistaken for success | Denial of Service / Tampering (false confidence) | D-04's explicit oracle-only budget (never `AGDA_MCP_COMMAND_TIMEOUT_MS`) + the CR-02 fix (INCONCLUSIVE, not PASS, on evidence-free completion) |
| Symlink or permission race during temp-dir materialization | Tampering | Reuse `safe-source-io.ts`'s `O_NOFOLLOW` + atomic-rename pattern for the oracle's OWN new writes (verdict sidecar, metrics file) |

## Sources

### Primary (HIGH confidence)
- Direct source reads of this repository (all paths under `/Users/eric/projects6/agda-mcp-server/`): `src/agda/session-load-helpers.ts`, `src/agda/session-load-impl.ts`, `src/agda/parse-load-responses.ts`, `src/agda/completeness.ts`, `src/agda/import-graph.ts`, `src/agda/source-parsers.ts`, `src/agda/library-registration.ts`, `src/agda/expression-operations.ts`, `src/agda/session-capture/artifact-types.ts`, `src/agda/session-capture/manifest-builder.ts`, `src/protocol/command-builder.ts`, `src/protocol/responses/expression-display.ts`, `src/tools/agent-ux/project-tools.ts`, `src/tools/file/check-postulates.ts`, `scripts/verify-cold-replay.mjs`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.planning/phases/01-capture-foundation/01-01…05-SUMMARY.md`, `01-06-PLAN.md`, `01-07-PLAN.md`, `01-CONTEXT.md`, `.planning/codebase/CONCERNS.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json`, `.planning/DESIGN-PRINCIPLES.md`
- Direct empirical tool execution against a locally-installed Agda 2.8.0 binary (this research session): `--without-K` + `primEraseEquality` import → `[CoInfectiveImport]` hard error; `--with-K` file importing a `--without-K` module + genuine UIP proof → clean compile, exit 0; `--safe` + `postulate` → `[SafeFlagPostulate]` hard error; `_build/<version>/` directory structure confirmed present only with an `.agda-lib` file
- Direct empirical tool execution against Node.js v24.16.0 (this research session): `tsx` correctly imports `src/agda/session-load-helpers.ts` and calls `classifyLoadResult()`; plain `node` fails the same import chain with `ERR_MODULE_NOT_FOUND`
- [nodejs.org/docs/latest-v24.x/api/typescript.html](https://nodejs.org/docs/latest-v24.x/api/typescript.html) — Node 24 type-stripping is default-on for `.ts` files but requires literal extensions in specifiers; erasable-syntax-only
- [agda.readthedocs.io/en/latest/language/safe-agda.html](https://agda.readthedocs.io/en/latest/language/safe-agda.html) — exact `--safe`-forbidden pragma/flag list
- [agda.readthedocs.io/en/latest/language/foreign-function-interface.html](https://agda.readthedocs.io/en/latest/language/foreign-function-interface.html) — exact `{-# COMPILE ... #-}`/`{-# FOREIGN ... #-}` pragma syntax
- [agda.readthedocs.io/en/latest/language/pattern-synonyms.html](https://agda.readthedocs.io/en/latest/language/pattern-synonyms.html) — `DISPLAY` pragma auto-generation for pattern synonyms; "display forms are not type checked"
- `.planning/research/ORACLE-VALIDITY.md`, `.planning/research/LEAN-COMPARISON.md`, `.planning/research/FUEL-CORPORA.md`, `.planning/research/PITFALLS.md` — pre-existing, load-bearing HIGH-confidence prior research for this milestone, explicitly designated MANDATORY reading by `02-CONTEXT.md`

### Secondary (MEDIUM confidence)
- WebSearch results on `primEraseEquality`/`--without-K` interaction — **superseded by direct empirical verification in this session** (Pitfall 6); recorded here only to document the correction, not as a standing source
- WebSearch corroboration (3 independent queries converging) that `primEraseEquality` under `--without-K` is Agda-rejected — consistent with, but less authoritative than, the direct empirical test that pinned down the *exact* mechanism (`[CoInfectiveImport]`, hard error, `--safe`-independent)

### Tertiary (LOW confidence)
- None retained — every claim that could not be verified via direct source read, direct tool execution, or official documentation is called out explicitly in the Assumptions Log or Open Questions rather than stated as fact.

## Project Constraints (from CLAUDE.md)

Directives from `./CLAUDE.md` directly bearing on this phase's plan:

- **Architecture invariant (issue #39):** exactly one `AgdaSession` per server process; the oracle's cold Agda subprocess is architecturally a *separate*, disposable, one-shot process and must never touch or share state with the live server's singleton — already the design's intent (D-05's "it never touches the live server's singleton `AgdaSession`"), confirmed compatible.
- **IOTCM SSOT invariant:** "All IOTCM command strings built via `src/protocol/command-builder.ts` — no hand-built wire strings." This phase's primary recommendation (reuse `command-builder.ts` via `tsx`) is what makes ORCL-01/03 *compliant* with this rule for the first time in the capture/oracle code path — `verify-cold-replay.mjs`'s current hand-rolled re-derivation is a pre-existing, explicitly-documented exception scoped to that one manual tool; a new oracle script should not extend that exception.
- **File size ceiling:** 500-line hard ceiling applies to `src/` only. Since D-05 keeps all oracle logic in `scripts/`, this ceiling does not directly bind — but Phase 1's own established convention ("keep scripts modular anyway") should still be followed for the oracle scripts.
- **Agda compatibility contract:** `minAgdaVersion 2.6.4.3`, `maxTestedAgdaVersion 2.9.0`. ORCL-01's version-match probe compares the cold binary against the *captured* version specifically (per `ORACLE-VALIDITY.md`'s correction #8), not against this range — a binary within range but different from the captured one should still trigger the version-match probe, not be waved through just because it's "in range."
- **Testing conventions:** `vitest` + `@fast-check/vitest` for property-based tests. No property-based test candidates were identified as clearly necessary for this phase's pure functions (the classification tuple / whitelist-diff / alpha-diff comparisons are better served by concrete example-based fixtures derived from real Agda pragma/flag semantics than by generated inputs), but the planner should consider whether e.g. the alpha-diff's token-canonicalization pass (Open Question 1 / A2) benefits from property-based round-trip tests once implemented.
- **No new dependency posture:** "Node builtins only for runtime infra... no database, ORM, or HTTP server dependency." Confirmed compatible — this phase adds zero new dependencies (Package Legitimacy Audit above).

## Metadata

**Confidence breakdown:**
- Standard stack / reuse mechanism (tsx vs dist vs native node): **HIGH** — empirically tested against the actual pinned Node version and actual repo files, not inferred from documentation alone
- ORCL-01 architecture (probes, classification-tuple diff, INCONCLUSIVE semantics): **HIGH** — grounded in direct reads of the exact functions to be reused, plus the existing (if simplified) `verify-cold-replay.mjs` proving the core mechanic already works end-to-end against real Agda
- ORCL-02 architecture (closure walk, pragma scan, whitelist-diff): **HIGH** for the closure-walk soundness (verified: genuine full BFS, no known under-counting bug) and for the Agda flag/pragma semantics (empirically verified against Agda 2.8.0 for the two most safety-critical cases); **MEDIUM** for the exact new-pragma-vocabulary scanning implementation (no code exists yet — this is new logic, not reused logic)
- ORCL-03 architecture (alpha-diff proxy): **MEDIUM-LOW** — the negative finding (no structured AST over IOTCM, no DISPLAY-defeat mechanism) is well-verified; the proposed *positive* implementation technique (token canonicalization) is original synthesis, explicitly flagged as needing empirical validation against real data during planning/implementation
- Pitfalls: **HIGH** — several are direct empirical reproductions (the `--with-K` override, the `primEraseEquality` correction, the `tsx`/`node` import difference), not secondhand claims

**Research date:** 2026-07-02
**Valid until:** 30 days for the codebase-mechanics findings (stable unless Phase 1 gap-closure plans `01-06`/`01-07` execute and change `verify-cold-replay.mjs`'s shape — re-check that specifically at plan time); Agda flag/pragma semantics findings are pinned to Agda 2.8.0 and should be re-verified if the project's tested/pinned Agda version changes materially before this phase executes.
