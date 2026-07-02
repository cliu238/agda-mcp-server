# Fuel Corpora & Field Evidence (Loop ②)

**Scope note:** These are the real dogfooding corpora and field-evidence artifacts for the **whole milestone — not Phase-1-only**. Every phase's researcher/planner should consult the relevant rows. Both repos are **private / access-gated** (viewable via `gh` by the maintainer's team). The `agda-mcp-ux-report/` measurements are against **agda-mcp-server v0.6.7** — re-verify against current `main` before treating any specific defect as live. This inventory is the concrete backing for **PROC-02** (pinned fuel-pointer set + machine-readable policy).

## Corpus A — `emilyriehl/autoformalizing-hopf` (private)

The Hopf / π₃(S²) autoformalization paper (Lean FRO challenge; Codex→MCP). The **motivating experiment** for Loop ②.
- **Serves:** PROC-02 fuel; ORCL-02/03 motivation (observed narrowing / shortcuts / flag-planting; the join-associativity case study).
- **Detail:** memory `[[agda-mcp-hopf-experiment]]`; `research/ORACLE-VALIDITY.md` §"Empirical grounding". *(The former local mirror `ref/README.md` was removed.)*

## Corpus B — `emilyriehl/Codex-Homotopy-Group` (private, default `main`)

π₃(S²)=ℤ over agda-unimath; the corpus that **directly dogfoods this server**. PR #1 (`cliu238`) ports the bash driver + sandbox gate — the interim tooling the MCP is meant to replace.
- **Detail:** memory `[[agda-mcp-codex-homotopy-group-corpus]]`; `research/ORACLE-VALIDITY.md` §"Measured against agda-mcp-server itself".

### Artifact → what it is → phase(s) served

| Artifact (in the CHG repo) | What it is | Serves |
|---|---|---|
| `agda-mcp-ux-report/README.md` | Forensic UX report on this server: 711 `agda_*` calls, 290 anomalies in 12 named families, a target envelope schema, and **8 turn-key regression specs** | Phase 1 (CAP-04 field list; capture-trigger ruleset = the 12 families); Phase 2 (false-green families); Phase 3 (the 8 LOCK specs); Phase 4 (12-category classifier → QUEUE-03 `agda_triage_error`) |
| `agda-mcp-ux-report/extract-mcp-evidence.mjs` + `mcp-evidence.json` / `.csv` | Reproducible extractor over Codex sessions + per-call records (ok/classification/goalCount/invisibleGoalCount/hasHoles/isComplete/elapsedMs/wallTimeMs/serverVersion/agdaVersion/args/excerpt) | Phase 1 (CAP-04 native-log field template — a native log makes this extractor unnecessary); Phase 5 (P7 usage baseline: `agda_load` 46% of 711, introspection ≫ mutation) |
| `CHAT-LOG.md` (~310KB) | Narrative record of the ~90-session Codex↔MCP campaign (the verb-level data lives in `mcp-evidence.json`, not the prose) | PROC-01 (real usage → runbook); Phase 1 / Phase 5 (how agents actually drive the server) |
| `STATUS-REPORT.md` (~183KB), `LES-STATUS.md` (~53KB) | Verification-log status of the formalization | Evidence for the scaffold-hole workflow, `--without-K` catching unsound shortcuts, and real-Agda compute-budget pain (timeout/CAP work); one positive-MCP signal (a dependent-transport coherence blowup exposed) |
| `loop.sh` (`gate_verify`), `check.sh`, `codex-run.sh`, PR #1 `check-sandbox.sh` + `SCRIPTS-USAGE.md` | The bash driver + verification gate the MCP replaces; `gate_verify` = a working oracle-triad prototype with 4 self-reported gaps | Phase 2 (ORCL-01/02/03 prior art + the gap→predicate mapping); PROC-01 (the workflow being replaced) |
| `MCP-SETUP.md` | How the team wires up the server: `codex mcp add agda --env AGDA_MCP_ROOT=… -- npx -y agda-mcp-server@<ver>` | Phase 5 (integration / launch ergonomics); CAP-01 (merged argv incl. injected `-l`, library registration to replay) |
| `FORMALIZATION-PLAN.md`, `plan-pi3-s2.md`, `technical-plan.md`, `project-plan.md` | Formalization plans incl. per-target **intended/expected top-level signatures**; `technical-plan.md` §2 "anti-cheating gates" = the same 3-predicate triad; the two plans **disagree** on a concrete-homotopy-group index (2-vs-3 off-by-one) | CAP-05 + ORCL-03 (expected-signature substrate in the wild; the disagreement = concrete evidence for *why* a pinned/human-signed signature is needed); PROC-01 (declare-signature hard gate) |
| `.codex/skills/agda-unimath-skills/SKILL.md`, `.codex/skills/agda-unimath-reference/SKILL.md` | Proof-strategy + conventions as an Agent Skill (inspect-before-edit, reuse-library, typecheck-early, avoid postulates/pragmas, and an explicit "do not trust MCP ok-complete" rule) | DESIGN P6 (strategy lives in a Skill); PROC-01 (runbook-as-Agent-Skill template, modeled on leanprover/skills) |
| agda-unimath required flags + sanctioned axioms | Required: `--without-K --exact-split --no-import-sorts --auto-inline --no-require-unique-meta-solutions --no-postfix-projections`; sanctioned axioms: univalence / function-extensionality / replacement | PROC-02 machine-readable policy; ORCL-01 conformance argv; ORCL-02 axiom whitelist |

**Local working clone (this session, ephemeral):** `…/scratchpad/CHG`. Re-clone with `gh repo clone emilyriehl/Codex-Homotopy-Group`.
