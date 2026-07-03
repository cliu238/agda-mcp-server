# Phase 6: Backlog Digestion (Policy Fix + Reverify) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 6-backlog-digestion-policy-fix-reverify
**Areas discussed:** REVERIFY-02 fix appetite (single genuine-taste question; all other gray areas were classified as forced-by-constraint and briefed as conclusions with veto opportunity, per the user's GSD discussion rules)

---

## Pre-question classification (briefed, not asked)

Per the user's standing discuss-phase rules, every gray area was classified before asking. Forced conclusions briefed (user offered veto via "Other"; none exercised):

1. **POLICY-01 plumbing shape** — `--policy` on `run-oracle.mjs` + `dogfood-wrapup.mjs`, wrapup consumes `fuel-corpora.json` `policyKey` at runtime; precedence flag > corpus > `.agda-lib`. Forced by: audit W2 fix direction, `judgeOrcl02` already accepting `options.policyKey`, TEAM-04 dependency.
2. **Mismatch = loud error, no case-normalization; exact-case verification on macOS too.** Forced by: Phase 6 success criterion 2's literal text.
3. **Key-expected-but-unloadable = hard error; genuinely-no-policy keeps D-03 `no-policy` but wrapup must surface it loudly.** Forced by: POLICY-01 text + v1.0 locked D-03 design.
4. **Case-sensitivity acceptance = existing ubuntu-latest CI vitest test.** Forced by: requirement's "(Linux container/CI)" + existing CI.
5. **RT1–RT8 re-verified with small fixtures, not the CHG corpus.** Forced by: UX report's own spec text; overnight build is Phase 7's precondition.
6. **Re-verification runs through the shipped pipeline (dogfood-run → capture → wrapup).** Forced by: REVERIFY-01's literal wording.
7. **Queue outcomes per frozen schema:** confirmed = needsReverify→false + evidence + new→triaged; unreproducible = rejected/cannot-reproduce + closedAt. Forced by: Phase 4 D-05 frozen schema.
8. **Manual-merge of fresh capture evidence onto seeded entries (fingerprints won't match).** Forced by: the agda_auto entry's own recorded MANUAL-MERGE note + queue hygiene.
9. **REVERIFY-02 confirmed set = 4 entries (3 named + agda_proof_status, re-verified alive 2026-07-02) + RT confirms; QUEUE-02 order; Phase 3 lock pipeline.** Forced by: REVERIFY-02's own "confirmed live defects in the queue" definition.

**Empirical-defer:** how many RT specs still reproduce on current main — exactly what REVERIFY-01 measures; per-entry fix/re-triage calls wait for the measurements.

---

## REVERIFY-02 fix appetite (asked)

| Option | Description | Selected |
|--------|-------------|----------|
| 点名必修,其余按力修 (推荐) | 4 confirmed entries must be fixed + locked; RT-confirmed fixed in QUEUE-02 priority order, but large-redesign entries (e.g., response-schema rework) may be explicitly re-triaged with recorded reasons | ✓ |
| 全部修完 | Every confirmed entry fixed and locked, no re-triage; backlog fully zeroed but phase duration may balloon | |
| 只修 4 条已确认 | RT confirms all re-triaged with reasons; shortest phase but weakens "the loop's first sustained real workload" | |

**User's choice:** 点名必修,其余按力修(推荐)
**Notes:** Question presented in plain Chinese with consequence-first option descriptions per the user's standing rules. Directly determines plan count/duration; captured as D-10 in CONTEXT.md.

## Claude's Discretion

- CLI flag parsing details and exact error-message wording (must name the unresolved key + search path)
- Wrapup's corpus→policyKey source (task-manifest `corpus` field vs `--corpus` argument)
- Per-RT fixture design and mini-session batching (each spec still gets its own verdict + evidence)
- Run-summary formatting/exit codes for the loud no-policy/error states

## Deferred Ideas

- Large-redesign fixes (response-schema rework direction from the UX report) → re-triaged with recorded reasons during REVERIFY-02, future milestone
- Task-manifest `policyKey` field → only if corpus-derived resolution proves insufficient
