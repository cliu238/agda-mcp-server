# Lean ↔ Agda — essential differences & what Lean's tooling teaches this project

**Researched:** 2026-07-01 (two web-grounded surveys: Lean agent-tooling landscape + Lean soundness/axiom-audit practice)
**Purpose:** Ground Loop ② design (and future Loop ①) in the more mature Lean ecosystem, which has run the "agents dogfood an ITP" loop longer and at larger scale.

> **Provenance caveat.** Core architectural facts and the stable tools/practices below (lean-lsp-mcp, Pantograph, Lean REPL, LeanDojo, `#print axioms`, `native_decide` incident, DeepSeek-Prover / AlphaProof kernel-as-oracle) are reliable primary-source material. Several **2026 items** the research surfaced (e.g. Leanstral, Numina-Lean-Agent, "Keep the Proof State Live", SorryDB, arXiv IDs `2601.*`/`2603.*`/`2605.*`) sit at or beyond the assistant's 2026-01 knowledge cutoff and are recorded as **leads to verify**, not established fact.

## 1. Essential Lean 4 vs Agda differences

Both are dependent type theories; the design philosophies are near-opposite. **Agda = a foundations-flexible lab; Lean = one opinionated foundation + a huge library + strong automation.** The difference that matters most for an MCP is the *shape of the interactive proof loop*.

| Dimension | Agda | Lean 4 |
|---|---|---|
| **Foundation** | MLTT, predicative universes, no definitional proof irrelevance by default; `--without-K`, **Cubical Agda** native HoTT | Fixed kernel: impredicative `Prop` **with definitional proof irrelevance**, **quotient types primitive**, classical axioms (`propext`/`Classical.choice`/`Quot.sound`) |
| **Proof style** | **Interactive term refinement**: open hole → case-split → refine → give → re-typecheck. Weak tactics (Agsy/`auto`) | **Tactic + metaprogramming**-first: `simp`/`omega`/`aesop`/`decide`/hammer; proofs are tactic scripts |
| **Interaction protocol** | `agda --interaction-json` (GHCi-style **IOTCM**, stateful, command-queue) — *this project's target* | **LSP** (mature, incremental) + **Lean REPL** (JSON, environment-snapshot, pickle-able) |
| **Soundness escape hatches** | `postulate`, `--type-in-type`, `{-# TERMINATING #-}`, `primTrustMe`, holes `?`, `{-# COMPILE #-}`/FFI | `sorry`→`sorryAx`, `native_decide` leaks, `@[implemented_by]`, `@[csimp]`, `unsafe`, axioms |
| **Soundness auditing** | `--safe` + manual audit; no kernel-level transitive axiom report | **`#print axioms` (kernel-level, transitive)** + `lean4checker`/Lean4Lean external re-verifier |
| **HoTT** | **Native-friendly** (`--without-K` + postulated or cubical univalence) | **Not supported** (`Prop`+UIP conflicts with univalence) |
| **Ecosystem / AI investment** | Smaller, research/HoTT-focused (stdlib, cubical, agda-unimath) | Large & well-funded (Mathlib, Lean FRO, AlphaProof, DeepSeek-Prover, Kimina, LeanDojo) |

**Three consequences for this project:**
1. **Loop shape differs.** Lean's agent loop is "emit a tactic block → get goal state / errors"; Agda's is "refine a hole / case-split / give → re-typecheck". Do **not** copy Lean's tactic-centric tool surface wholesale.
2. **HoTT is why Agda was chosen** (`ref/README.md`: Hopf/π₃(S²) "easier in Agda than Lean"). agda-unimath uses `--without-K --exact-split` and **postulates** univalence/funext/replacement — the exact reason `--safe` is unusable as an oracle here (see `ORACLE-VALIDITY.md`).
3. **Agda's escape hatches are more diffuse and less auditable** (postulate + many flags + pragmas + `primTrustMe` + FFI) with **no single kernel primitive** to audit them — precisely why ORCL-02 hand-builds a closure scan.

## 2. Lean agent-tooling landscape — three camps

| Camp | Representative tools | State model | Maps to |
|---|---|---|---|
| **LSP-thin (MCP)** | **lean-lsp-mcp** (the production MCP lingua franca) | Project session; LSP state persisted | This project's thin adapter layer + Loop ① |
| **REPL** | leanprover-community/repl, LeanDojo, LeanInteract, Kimina Lean Server | **Environment-id snapshots + pickling** (`pickleTo`/`unpickleEnvFrom`), branch/restore | **CAP-04 / RecordedTransport north-star** |
| **Kernel-direct** | Pantograph / PyPantograph | Metavariable-coupled goal tree; `goal.start`/`goal.tactic`; `load_sorry`/`TacticDraft` | Loop ①'s refinement loop |

Notable command-surface features: `lean_multi_attempt` (try N tactics at one node, per-candidate feedback), `lean_run_code` (isolated compile), integrated premise/definition search (LeanSearch, Loogle, Lean Hammer, LeanExplore), Pantograph MCTS + resume-from-`sorry`.

## 3. What's worth borrowing (mapped to this project's requirements)

- **`#print axioms` ⇒ ORCL-02.** Kernel-level, transitive axiom/`sorry` audit; Mathlib's real "green" = compiles **and** only the 3 standard axioms, no `sorryAx`. This is ORCL-02's whitelist-diff, already proven at scale. **Lesson (Lean #8840):** recurse through **type signatures**, not just bodies. **Lesson (native_decide/#7463/@[implemented_by]):** scan **FFI/pragmas** too — unsoundness can hide from an axiom report.
- **REPL pickling / "keep proof state live" ⇒ CAP-04.** Lean treats proof-state snapshot/restore as first-class and persists it (`.olean` pickles). Same idea as the cassette recorder/replayer. But Agda's `--interaction-json` is **stateful** — the single-`AgdaSession` + tee-at-stdio-seam is the right accommodation, not a deficiency to "fix" by imitating the REPL's clean snapshots.
- **LeanDojo (state, tactic, next-state) triples ⇒ CAP-04 action log** — validated substrate for repro + regression + (later) training.
- **`lean_multi_attempt` + Pantograph `load_sorry`/`TacticDraft` ⇒ Loop ① (LOOP1-01).** A cheap, high-leverage Loop ① primitive: "try these N refinements on this goal, report which typecheck and their new goals." Agda's hole-centric refinement already fits the draft-sketch-proof shape.
- **Anti-cheat pipelines ⇒ ORCL-01/02/03 validated.** DeepSeek-Prover (binary kernel reward), AlphaProof (explicit **statement validation** against narrowing + final independent verification), Kimina (error-grounded repair + **negation-consistency discard**). Kimina's negation check → ORCL-03 advisory probe / AUTO-08.
- **Independent external re-verifier (`lean4checker`/Lean4Lean).** A stronger form of ORCL-01 (re-verify with an independent checker). **Agda has no equivalent** — a known long-term gap, not v1.
- **Benchmark-contamination lessons (miniF2F → miniCTX).** The Lean world's move toward held-out *real* repos validates this project's choice of **organic fuel over curated benchmarks** (PROJECT.md) — with the caveat that organic fuel must be commit-pinned (PROC-02).

## 4. What does NOT transfer
- Lean's **tactic-centric loop** and **LSP maturity** don't map to Agda's term-refinement + bespoke stateful protocol.
- Lean has **no univalence**, so its axiom-whitelist is simpler; agda-unimath's postulate policy is intrinsically harder — Lean experience won't hand you the whitelist.
- REPL **clean snapshots** aren't available in Agda's mutable session; don't chase statelessness.

## Sources (primary; 2026 items flagged as leads)
- `#print axioms` / validating proofs — lean-lang.org reference; leanprover-community "did you prove it".
- Axioms & computation (`propext`/`Classical.choice`/`Quot.sound`) — lean-lang.org/theorem_proving_in_lean4.
- `collectAxioms` transitive bug — `github.com/leanprover/lean4/issues/8840`.
- `native_decide` soundness leak — leanprover-community zulip archive (Mario Carneiro); fix in Lean 4.29 release notes; `@[csimp]` #7463.
- Tools — lean-lsp-mcp (github.com/oOo0oOo/lean-lsp-mcp), Pantograph (github.com/leanprover/Pantograph, arXiv 2410.16429), leanprover-community/repl, LeanDojo (arXiv 2306.15626), LeanInteract, Kimina (arXiv 2504.21230), LeanExplore (arXiv 2506.11085).
- Provers — DeepSeek-Prover-V1.5 (arXiv 2408.08152), AlphaProof (DeepMind blog + arXiv 2507.15855, *verify*), Kimina (arXiv 2504.11354).
- Agda safe mode — agda.readthedocs.io Safe-Agda. Lean4Lean/lean4checker — github.com/digama0/lean4lean (arXiv 2403.14064).
- **Flagged post-cutoff / verify:** Leanstral (Mistral), Numina-Lean-Agent (arXiv 2601.14027), "Keep the Proof State Live" (arXiv 2605.25556), SorryDB (arXiv 2603.02668).

---
*Companion to `.planning/research/ORACLE-VALIDITY.md`. Informs Phase 2 (ORCL triad) now and Loop ① (LOOP1-01) later.*
