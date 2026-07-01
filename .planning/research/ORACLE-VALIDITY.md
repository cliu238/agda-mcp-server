# Oracle Validity — Is cold-`agda` re-run a valid oracle for false-green?

**Researched:** 2026-07-01 (multi-agent workflow: 4 investigators → synthesis → 3 adversarial verifiers → finalize)
**Confidence:** HIGH. agda-unimath specifics verified against a local clone + source; Agda flag semantics verified against docs.
**Bearing:** Load-bearing for Phase 2 (ORCL) and Phase 3 (LOCK). Drove the ORCL split (ORCL-01/02/03) and CAP-01/05 expansion.

## Headline

Cold-`agda`-re-run is a **valid, self-sufficient oracle for exactly ONE of three false-green families** — the *server-faithfulness* class (#64/#61 stale interface, #65/#66 truncated stream, un-escalated error). There a fresh compile re-derives the on-disk FAILURE the warm session masked; it needs no human knowledge, only correct engineering.

It is **structurally invalid (a guaranteed miss)** for the two families the real Hopf/agda-unimath dogfooding makes first-class:
- **Soundness cheats** — `postulate`-as-proof, unsafe flags/pragmas, jointly-inconsistent safe-flag *pairs*, `primTrustMe`, dropped/per-module `--without-K`, or discharging via a pre-existing upstream axiom. Cold `agda` runs the same trusted kernel with the same escape hatches → agrees "green".
- **Spec conformance** — a narrowed / weakened / renamed / mis-stated theorem. Sound under every flag regime including `--safe`.

**A passing differential is therefore NECESSARY-BUT-NOT-SUFFICIENT:** it proves the server told the truth about what agda would say, *not* that the theorem is true. Everything beyond the #64/#61 class needs human-encoded knowledge (per-project axiom whitelist, required/forbidden flag baseline, expected type signature).

## Coverage matrix (representative)

| False-green class | Family | Cold re-run | What else is needed |
|---|---|---|---|
| Stale single-file / transitive `.agdai` (#64/#61) | server | **caught** (fresh isolated `_build`) | — |
| Truncated-stream / idle-timer desync drops terminal Error or goals (#65/#66) | server | **caught** | — |
| Error not escalated to `success=false` (silent abort) | server | **caught** | — |
| Stale `lastClassification` leak on proc-death | server | **caught** | — |
| Residual `?`/`{! !}` misclassified as ok-complete | server/classification | **caught** | (co-caught by hole scan) |
| Un-escalated WARNING-class leak (#61 cases 3/4) | policy | **missed** (same default flags) | `--warning=error` + benign-warning whitelist + stated CI policy |
| `postulate` standing in for a proof ("flag planting") | soundness | **missed** | axiom whitelist-diff over transitive closure (NOT `--safe` — unusable on unimath) |
| `--allow-unsolved-metas` / incomplete matches / NON_COVERING | soundness | **missed** | `--safe` where permitted; else forbidden-flag policy + hole scan |
| `{-# TERMINATING #-}` / `--no-termination-check` (silent, no warning) | soundness | **missed** | AST/flag scan (`--warning=error` does NOT catch it) |
| `--type-in-type` / `--no-positivity-check` / `--injective-type-constructors` (anti-univalence!) | soundness | **missed** | forbidden-flag baseline (HoTT-critical) |
| Two individually-safe flags jointly inconsistent (`--sized-types`×`--guardedness`) | soundness | **missed** | forbidden-COMBINATION list (per-flag whitelist is blind to it) |
| `primTrustMe` (equality by fiat) | soundness | **missed** | token/closure scan (`--safe` rejects it, but `--safe` can't run on unimath) |
| Dropped `--without-K` (bare `--with-K`) in a HoTT proof | soundness | **missed** | per-module required-flag diff (`--safe` does NOT catch this) |
| Discharge via pre-existing upstream postulate (no new token in diff) | soundness/provenance | **missed** | transitive-closure scan + provenance audit |
| Narrowed / weakened / renamed / mis-transcribed statement | conformance | **missed** | human-authored expected signature, alpha-diff over normalized internal types |
| `DISPLAY` pragma / pattern-synonym makes a weaker type PRINT as intended | conformance/spoof | **missed** | compare NORMALIZED internal types, never printed strings |

## Corrections that bite (all verified)

1. **`--safe` is unusable as a hardened oracle on agda-unimath** — the library *legitimately* postulates univalence / function-extensionality / replacement, and `--safe` rejects `postulate`. → ORCL-02 uses an **axiom whitelist-diff over the transitive closure**, not forced `--safe`.
2. **`primTrustMe` is the equality cheat; `primEraseEquality` is `--safe`-compatible and sound-by-construction** — do NOT whitelist the latter.
3. **Cold run must be interaction `Cmd_load`, not batch `agda File.agda`** — batch exits 42 on interaction holes and would false-red every legitimate ok-with-holes proof.
4. **Replay captured library registration; never re-derive it** — `library-registration.ts` is non-deterministic (`mkdtempSync` + reads `~/.agda`).
5. **Content-hash-pin the full transitive import closure at capture** — defeats live-edit TOCTOU during dogfooding; drift → INCONCLUSIVE.
6. **Fresh isolated `_build`; exact pinned binary; ordered flag argv with duplicates** (repeated `-i`/`-l` are order-significant).
7. **Every env-probe failure → INCONCLUSIVE (never "server bug"); surface abstention rate as a first-class metric** — a from-scratch unimath/Hopf recompile will often exceed `AGDA_MCP_COMMAND_TIMEOUT_MS` and abstain exactly where signal is most wanted.
8. **Version handling:** `package.json` declares a tested RANGE (min 2.6.4.3, maxTested 2.9.0). Do NOT treat every binary ≠ 2.9.0 as INCONCLUSIVE — only a binary that *differs from the captured one* (or falls outside range).

## Where human knowledge / examples are mandatory

- **Per-project sanctioned-axiom whitelist** (unimath: univalence, funext, replacement), distinguishing agent cheats from legitimate HIT postulates.
- **Per-project + per-module required/forbidden flag baseline + forbidden-combination list** (required `--without-K`; forbidden `--type-in-type`/`--injective-type-constructors`/`--no-*`/`--allow-*`/…). Best auto-derived from the pinned binary's own `--safe` rejection set.
- **CI warning policy** + benign-warning whitelist (decides whether a warning-class leak even counts as false-green).
- **Confluence expectation** for any sanctioned `--rewriting`.
- **Expected/intended type signature per target** (from the formalization plan / reference proof), captured up front, compared via normalized internal types. Mandatory for the entire conformance family — no compiler oracle has any representation of the human's intended theorem.
- **Human review** for library-quality-vs-flag-planting and legitimate specialization vs illegitimate narrowing (only cheap syntactic proxies are mechanizable, and they only raise advisory flags).

## Residual risks (carry into Phase 2 planning)

- Framing cold-rerun as THE oracle gives false confidence: a cheat-postulate is byte-identical to a legitimate HIT postulate at the differential layer. If ORCL-02's cheap scan is not in v1, Phase 3 would golden-master a cheat as "correct".
- The differential's own false positives (phantom server bugs) from registration drift, TOCTOU, order-sensitive flags, batch-mode holes, blanket `--safe`, version skew — must all gate to INCONCLUSIVE.
- Classifier double-bind: conservative INCONCLUSIVE can DROP a real #64 that co-occurs with an env diff; liberal floods the queue. Env-probe-gate mitigates, doesn't fully resolve.
- Chronic INCONCLUSIVE on the real Hopf target (timeout); trustworthy only inside a byte-identical pinned container.
- Per-flag policy is blind to jointly-inconsistent safe pairs; forbidden-flag lists drift and are version-coupled (auto-derive from the binary's `--safe` set).
- Conformance proxy is only as good as the human-authored reference signature, must use normalized internal types (DISPLAY spoofs strings), and must stay strictly advisory.
- Adversarial staleness: mtime-preserving/clock-skewed edits, or interface staleness in a *registered library's own build dir* outside the project `_build`. Only a fully wiped isolated `_build` + closure-hash pinning reliably catches #64. No fixture yet proves this or the FP guards.

---
*See `.planning/REQUIREMENTS.md` (ORCL-01/02/03, CAP-01/05, PROC-01/02, AUTO-07) and `.planning/ROADMAP.md` Phase 2 for how this was folded in.*
