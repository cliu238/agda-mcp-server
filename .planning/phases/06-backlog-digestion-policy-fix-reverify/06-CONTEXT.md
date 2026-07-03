# Phase 6: Backlog Digestion (Policy Fix + Reverify) - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the ORCL-02 policy-key runtime passthrough (POLICY-01) so cheat-detection policy resolution works on any filesystem and never silently disables auto-filing; re-verify all 8 `needsReverify` RT specs in `test/fixtures/fix-queue.json` to a definitive state (REVERIFY-01); drive confirmed live defects through fix → regression lock → `locked` (REVERIFY-02). No team-channel work (Phase 7), no deployment (Phase 8), no debt-sweep items (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### POLICY-01 — passthrough shape (forced by requirement text + existing code; user briefed, no veto)
- **D-01 Plumbing:** Add `--policy <key>` to BOTH `scripts/oracle/run-oracle.mjs` and `scripts/dogfood/dogfood-wrapup.mjs`. Additionally, when the run's corpus is known, the wrapup resolves the policy key from `scripts/data/fuel-corpora.json`'s existing `policyKey` column (audit W2: "test-validated but never consumed at runtime"). Precedence: explicit `--policy` flag > corpus-derived `policyKey` > `.agda-lib` `name:` fallback. `judgeOrcl02` already accepts `options.policyKey` — this is pure CLI/options plumbing.
- **D-02 Mismatch = loud error, never case-normalization:** The real CHG shape (`.agda-lib` name `Codex-Homotopy-Group` vs policy file `codex-homotopy-group.json`) MUST produce an explicit unresolved/mismatched-policy error (success criterion 2's literal text). Do NOT lowercase/normalize keys — that masks the class. Resolution must also verify exact-case via directory listing so macOS (case-insensitive APFS, which masks the bug) behaves identically to Linux.
- **D-03 Loud-fail semantics:** A policy key that was expected (explicit flag, corpus `policyKey`, or `.agda-lib`-derived) but fails to load → hard error (non-zero exit + explicit error verdict), never a `no-policy` skip. A repo with genuinely NO policy anywhere keeps v1.0's locked D-03 `no-policy` outcome (findings carried for human review) — but the wrapup may no longer treat it as a quiet skip: it must be loudly surfaced in the run summary. (All 4 pinned corpora have `policyKey`s, so real paths always have a key.)
- **D-04 Case-sensitivity acceptance test venue:** regression test in the normal vitest suite, proven on existing `ubuntu-latest` CI (case-sensitive FS). No local Docker requirement. On macOS the same test asserts the loud behavior via D-02's exact-case directory-listing check.

### REVERIFY-01 — re-verification method (forced by spec source + requirement text)
- **D-05 Small fixtures, not the CHG corpus:** RT1–RT8 are reproduced with small Agda fixture files — the UX report itself states "These tests do not require HoTT-specific knowledge. They can be small Agda files or temporary modules using ordinary scope/type errors." The overnight vendored-agda-unimath build stays OUT of Phase 6 (it is E2E-01/Phase 7's documented precondition).
- **D-06 Through the shipped pipeline:** Each RT spec is driven live through `dogfood-run.mjs` (recording proxy) → capture → `dogfood-wrapup.mjs` (oracle triad + N-rerun flake gate) — NOT ad-hoc scripts like quick task 260702-29k used. REVERIFY-01's wording ("through the shipped pipeline (replay + wrap-up oracle)") requires it, and it doubles as real exercise of the pipeline.
- **D-07 Queue outcomes per frozen schema (D-05 of Phase 4 — no new status values):** confirmed = `needsReverify` → false + fresh capture/verdict evidence recorded + status `new → triaged`; unreproducible = `rejected` with `rejectedReason: "cannot-reproduce"` + `closedAt` set + evidence summarized in `notes`. Evidence pattern follows the flagship precedent: committed report/notes + fingerprint links (capture files themselves live in gitignored `.agda-mcp/`).
- **D-08 Manual-merge landmine:** Fresh recaptures will NOT fingerprint-match the hand-seeded entries (recorded in the agda_auto entry's own notes; capture-time enrichment only scans load-family actions). Re-verification evidence must be manually attached to the seeded entries; no duplicate disconnected `new` entries may be left behind. RT4 ↔ agda_auto entry are already `relatedFingerprint`-linked — resolve them together.

### REVERIFY-02 — scope and fix appetite
- **D-09 Confirmed set = 4 entries + RT confirms (forced by requirement wording):** the 3 named (agda_auto CLI-flag leak `5abecc959e43fef3`, agda_give ok:true-wrapping-error `bfcba437f5426fd6`, agda_search_definitions hardcoded layout `eb7439cb3ed9d6b9`) PLUS agda_proof_status `fdc90bfde12fb938` — re-verified alive 2026-07-02, hence a "confirmed live defect in the queue" under REVERIFY-02's own definition — plus whatever REVERIFY-01 confirms.
- **D-10 Fix appetite (USER DECISION):** "点名必修,其余按力修" — the 4 confirmed entries MUST be fixed and locked. RT-confirmed entries are fixed in QUEUE-02 priority order, BUT entries whose fix requires a large redesign (e.g., a whole response-schema rework) MAY be explicitly re-triaged with a recorded reason and deferred to a later milestone. Every confirmed entry still ends `locked` or re-triaged-with-reason — none silently stalled.
- **D-11 Fix order and lock mechanism (forced):** QUEUE-02 priority order; locking goes through the Phase 3 emit-regression pipeline (matrix entry + `matrixEntryId` backlink, per the flagship precedent).

### Sequencing (forced by REVERIFY-01's wording)
- **D-12:** Re-verify all 8 RT specs against current main FIRST (pre-fix measurements), then enter the fix→lock loop. RT4 re-verification and the agda_auto fix must not race each other (D-08).

### Claude's Discretion
- Exact CLI flag parsing/help-text details; exact error message wording (must name the unresolved key and the search path).
- Whether the wrapup's corpus→policyKey resolution reads the task manifest's `corpus` field or takes a `--corpus` argument — planner picks what fits the existing wrapup call shape.
- Per-RT fixture design and how many mini-sessions batch together, provided each spec gets its own definitive per-entry verdict + evidence.
- How the run-summary surfaces the loud no-policy/error states (format, exit codes), within D-03's constraints.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and phase definition
- `.planning/REQUIREMENTS.md` — POLICY-01 / REVERIFY-01 / REVERIFY-02 full text (the binding acceptance language)
- `.planning/ROADMAP.md` — Phase 6 goal + 4 success criteria; research explicitly skipped ("judgeOrcl02 already accepts an override; pure CLI/options plumbing")
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md` — W2 finding (the exact defect this phase fixes) + fix direction

### POLICY-01 code surfaces
- `scripts/oracle/orcl-02-soundness-scan.mjs` — `judgeOrcl02` (accepts `options.policyKey`), `resolveDefaultPolicyKey` (`.agda-lib` `name:` derivation — the buggy default), `loadOraclePolicy` (key → `scripts/data/oracle-policy/<key>.json`, returns null on any failure), D-03 `no-policy` outcome semantics + `EXIT_CODE_BY_KIND`; its own CLI already has `--policy`
- `scripts/oracle/run-oracle.mjs` — triad runner; currently only `--only`, needs `--policy`
- `scripts/dogfood/dogfood-wrapup.mjs` — treats INCONCLUSIVE/skip/no-policy as never-auto-filed (the silent-abstention site to make loud)
- `scripts/data/fuel-corpora.json` — the `policyKey` column to consume at runtime (codex-homotopy-group, agda-stdlib, agda-unimath, autoformalizing-hopf)
- `scripts/data/oracle-policy/codex-homotopy-group.json` — the real mismatched policy file (vs `.agda-lib` name `Codex-Homotopy-Group`)
- `test/fixtures/task-manifest-schema.ts` — task manifest has `corpus` (cross-refs fuel-corpora) but NO `policyKey` field today
- `.github/workflows/ci.yml` — `ubuntu-latest` CI where the case-sensitive test must prove itself

### REVERIFY backlog and evidence
- `test/fixtures/fix-queue.json` — the 13-entry queue SSOT: 8 `needsReverify: true` RT entries (`new`), 4 confirmed-alive (`triaged`), 1 flagship (`locked`)
- `test/fixtures/fix-queue.ts` — FROZEN schema: statuses `new|triaged|fixing|locked|rejected`, `rejectedReason` enum, D-05 "never a sixth status — a boolean annotation instead", terminal-status refinements (`closedAt` required when locked/rejected)
- `.planning/research/CHG-REVERIFY.md` — 2026-07-02 re-verification evidence + methodology for the 4 CHG defects (verdicts changed/alive/alive/alive)
- `.planning/quick/260702-29k-re-verify-chg-v0-6-7-defect-list-against/260702-29k-SUMMARY.md` — how the previous re-verification was run and why verdict calibration matters ("changed" ≠ "fixed")
- `~/projects6/Codex-Homotopy-Group/agda-mcp-ux-report/README.md` §"Recommended Regression Tests" — the source RT1–RT8 spec text (local clone of the private corpus; small-fixture statement lives here)

### Pipeline machinery reused by REVERIFY-01/-02
- `scripts/dogfood/dogfood-run.mjs` — recording-proxy entry for live sessions
- `scripts/dogfood/flake-classify.mjs` — N-rerun anti-phantom gate
- `scripts/emit-regression.mjs` — the Phase 3 lock pipeline (matrix entry + backlink)
- `.agents/skills/` dogfooding runbook (`agda-dogfooding` skill) — the operating procedure for live sessions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `judgeOrcl02(artifactPath, {policyKey})` — override parameter already exists and is tested; POLICY-01 is wiring, not logic.
- `orcl-02-soundness-scan.mjs`'s own CLI `--policy` flag — the flag-parsing pattern to replicate in `run-oracle.mjs`/`dogfood-wrapup.mjs`.
- Full Loop ② pipeline (dogfood-run → capture → wrapup → flake gate → queue intake → emit-regression lock) shipped and live-proven in v1.0 — REVERIFY work is cargo through it, not new machinery.
- `fuel-corpora.json` `policyKey` column — already schema-validated by tests.

### Established Patterns
- Loud-vs-honest verdicts: D-03 (`no-policy` carries findings, "never a silent pass and never a blanket fail") — Phase 6 tightens the wrapup consumer, it does not overturn D-03.
- Frozen queue schema (Phase 4 D-05): annotations via booleans (`needsReverify`), never new status values; terminal statuses require `closedAt`.
- Evidence convention: committed reports/notes + fingerprint/matrix backlinks; raw captures stay gitignored (`.agda-mcp/`).
- Scripts stay in `scripts/` (loop wraps the server; only surgical `src/` changes) — but REVERIFY-02 fixes themselves are real `src/` server fixes (e.g., `buildAutoSearchPayload()` in `src/agda/refactor-helpers.ts` per the agda_auto entry's notes) and follow all `src/` constraints (500-line ceiling, layering, command-builder SSOT).

### Integration Points
- `dogfood-wrapup.mjs` → `run-oracle.mjs` → `judgeOrcl02` is the policy-key flow to thread.
- Fix-queue updates go through the shipped queue scripts (`scripts/queue/`), preserving zod validation.
- Phase 7 (TEAM-04) consumes POLICY-01's fix directly — bundles from other machines must resolve policy keys without `.agda-lib` guessing; keep the passthrough machine-friendly (explicit key in, no interactive resolution).

</code_context>

<specifics>
## Specific Ideas

- The case-sensitivity regression test must encode the REAL CHG shape — `.agda-lib` `name: Codex-Homotopy-Group` against `codex-homotopy-group.json` — not a synthetic example (REQUIREMENTS.md POLICY-01 names it explicitly).
- The quick-task precedent (260702-29k) deliberately calibrated "changed" vs "fixed" for the flagship; REVERIFY-01 verdicts should keep that honesty (a non-reproducing RT spec is `cannot-reproduce` with the measurement conditions recorded, not a claim the defect never existed).

</specifics>

<deferred>
## Deferred Ideas

- RT-confirmed entries whose fix demands a large redesign (e.g., response-schema rework per the UX report's "Suggested Schema Direction" section) — explicitly re-triaged with recorded reasons during REVERIFY-02 (per D-10), lands in a later milestone's queue review.
- Task-manifest `policyKey` field addition — only if the planner finds corpus-derived resolution insufficient; otherwise the manifest keeps its `corpus` cross-reference and fuel-corpora remains the policy-key SSOT.

</deferred>

---

*Phase: 6-Backlog Digestion (Policy Fix + Reverify)*
*Context gathered: 2026-07-03*
