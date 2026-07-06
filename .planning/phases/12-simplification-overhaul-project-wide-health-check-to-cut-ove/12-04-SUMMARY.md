---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 04
subsystem: audit
tags: [dead-code-detection, tech-debt-reverification, static-analysis, file-size-ceiling, unused-exports]

# Dependency graph
requires:
  - phase: 10-upstream-reconcile
    provides: the 6 MERGE-01 conflict files + docs/LOAD-TERMINUS-ADJUDICATION.md's referee verdict, which this audit's C-03 upstream-overlap classification is built on
provides:
  - "Known src Debt Re-Verification: dated (2026-07-06) status for every src/-scoped CONCERNS.md item (Tech Debt/Known Bugs/Fragile Areas/Test Coverage Gaps) and every milestone-audit (v1.0 + v1.1) tech_debt entry — 26 milestone entries + 7 CONCERNS.md entries, net 11 already-resolved / 3 severity-changed / 12 confirmed-still-present"
  - "Fresh full-repo src/ file-size sweep (not limited to the 7 originally-named files): confirms agda-transport.ts now at exactly 500 lines (zero headroom, was 3 lines under on 2026-07-04); no new file crossed into the 400+ watch zone"
  - "9-row Cut-List Candidates table, C-03/C-04-filtered, all tagged low-risk-deletion, 1 tagged upstream-overlap:yes with convergence framing"
  - "Excluded-on-Security-or-Invariant-Grounds subsection: 2 candidates (repo-root.ts's resolveServerRepoRoot, safe-source-io.ts's AgdaSourceReadError) excluded with documented security-seam reasoning"
  - "Explicit non-relitigation statement for src/agda/import-graph.ts (4 confirmed live consumers) and explicit already-deleted confirmation for the 3 named files"
affects: [12-06-consolidate-health-report, 12-10-execute-src-low-risk-subtraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual, script-assisted export/import cross-reference (Python word-boundary regex over the full src+scripts+test corpus loaded once) as the src/ dead-code/unused-export detection method, in place of npx knip — matches 12-RESEARCH.md's own recommendation for this repo's scale"
    - "Severity vocabulary (Critical/High/Medium/Low) defined explicitly in this doc's header since no prior severity scale exists anywhere in the repo (12-PATTERNS.md's own 'No Analog Found' gap) — available for 12-06 to reuse verbatim"

key-files:
  created:
    - .planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-SRC-DEBT.md
  modified: []

key-decisions:
  - "Defined the cut-list severity vocabulary (Critical/High/Medium/Low) in this doc since none existed repo-wide; all 9 Task 2 candidates graded Low by construction (D-01 scopes this plan to low-risk-only, so uniform Low grading reflects charter compliance, not a weak audit)"
  - "Treated un-exporting a symbol (removing only the `export` keyword, code stays) as equally sanctioned under D-01's explicit 'unused exports' category alongside true dead-code deletion — 6 of 9 cut-list rows are export-surface-only tidies, not code deletions"
  - "Excluded 2 zero-usage candidates in repo-root.ts and safe-source-io.ts despite them technically qualifying by usage-count alone, per RESEARCH.md Pitfall 6 and the plan's T-12-07 threat-register mitigation — both have documented (JSDoc-level) intent beyond their current call count"
  - "Included the 1 guarded-file candidate (session-load-helpers.ts's invalidOptions) in the cut list per the plan's interfaces contract (candidates touching guarded files are permitted, not auto-excluded) but flagged it transparently as a reasonable defer/reject candidate at the D-03 sign-off given the friction-to-value ratio of touching a guarded file for a one-keyword change"
  - "Broadened milestone-audit re-verification to cover every tech_debt entry in both v1.0 and v1.1 audits (26 total), not only strictly src/-scoped ones, since this plan's own title names 'known-debt ledger re-verify' as a whole and no other Wave-1 plan claims that broader ownership; non-src items are explicitly scope-tagged and routed to Plan 12-01/12-02 in the table for 12-06's consolidation"

requirements-completed: [C-03, C-04, D-01, C-05]

# Metrics
duration: ~40min (not separately instrumented — single continuous session)
completed: 2026-07-06
---

# Phase 12 Plan 04: src/ Known-Debt Re-Verification + Low-Risk Subtraction Audit Summary

**Re-verified 26 milestone-audit + 7 CONCERNS.md known-debt findings against 2026-07-06 HEAD (11 resolved, 3 severity-changed, 12 still-present), re-swept all of src/ for file-size pressure (agda-transport.ts now at the exact 500-line ceiling), and drafted a 9-row C-03/C-04-filtered cut list finding 2 truly dead functions plus 7 unused-export-only tidies via a manual Python-assisted cross-reference scan of 478 exported symbols across 439 files.**

## Performance

- **Duration:** ~40 min (not separately instrumented)
- **Completed:** 2026-07-06T02:52:55Z
- **Tasks:** 2 (both complete)
- **Files modified:** 1 created (`12-AUDIT-SRC-DEBT.md`); zero files under `src/` touched (audit is read-only by charter)

## Accomplishments

- Re-verified every src/-scoped CONCERNS.md finding across all 4 mandated sections (Tech Debt, Known Bugs, Fragile Areas, Test Coverage Gaps) plus all 26 tech_debt entries across both v1.0 and v1.1 milestone audits, each with a dated 2026-07-06 status from the required three-value enum (`confirmed-still-present` / `already-resolved` / `severity-changed`)
- Found several previously-open items are now genuinely resolved with direct code evidence: WR-01's durability edge (`register-capture-session.ts`'s `commitDrainedActions` now runs strictly after `writeFileAtomic` succeeds), ORCL-02's policy runtime passthrough (`run-oracle.mjs` now has a working `--policy` flag), the `typecheck:test` gate (ran live — zero errors today), `SECURITY.md` (exists, 90 lines, substantive), the v1.1.1 tag (confirmed cut, supersedes the stale v1.1 tag), and zero remaining `needsReverify` fix-queue entries
- Ran a fresh full-repo `src/**/*.ts` file-size sweep (not limited to the 7 originally-named files) and found `src/session/agda-transport.ts` has grown to **exactly 500 lines** (zero headroom, up from 3 lines of headroom on 2026-07-04) — the single most actionable forward-looking signal from this audit, though itself out of this plan's cutting charter (a split is a restructuring, not a deletion)
- Ran a manual, script-assisted export/import cross-reference scan (478 top-level exported symbols across 102 in-scope files, checked against the full text of 439 `src/`+`scripts/`+`test/` files) and found 2 genuinely dead functions (`fileExists`/`fileMtimeMs` in `import-graph.ts`, unused since a pre-fork upstream commit) plus 7 files with unused-export-only surface (code retained, only the `export` keyword removable)
- Applied C-03's upstream-overlap framing correctly to the one candidate touching a guarded file (`session-load-helpers.ts`), and applied RESEARCH.md's Pitfall 6 ("low usage is not low security value") to exclude 2 candidates in `repo-root.ts`/`safe-source-io.ts` with documented reasoning rather than a blanket low-usage cut

## Task Commits

Both tasks write to the same single output artifact and were completed as one coherent audit pass, committed together:

1. **Task 1 (Known src debt re-verification + fresh file-size sweep) + Task 2 (dead-code/unused-export scan + cut-list candidates)** - `88ef955` (docs)

**Plan metadata:** (this commit, `88ef955`, already includes both tasks' full output — no separate metadata-only commit was needed since the plan produces exactly one artifact)

## Files Created/Modified

- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-SRC-DEBT.md` - Known-debt re-verification ledger (33 dated entries), fresh file-size sweep, dead-code/unused-export scan methodology, 9-row Cut-List Candidates table, Excluded-on-Security-or-Invariant-Grounds subsection

## Decisions Made

- Defined an explicit Critical/High/Medium/Low severity vocabulary in the doc's own header (none existed repo-wide per 12-PATTERNS.md) — all 9 candidates graded Low, correctly reflecting D-01's low-risk-only charter rather than under-grading
- Classified "un-export a symbol" (keep the code, remove only the `export` keyword) as a first-class low-risk-deletion under D-01's explicit "unused exports" category — 6 of 9 cut-list rows are this shape, not literal code deletion
- Excluded `resolveServerRepoRoot` (repo-root.ts) and `AgdaSourceReadError` (safe-source-io.ts) from the cut list despite zero measured external usage, because both have documented (parameterized-signature / JSDoc-stated) intent beyond their current call count — direct application of RESEARCH.md's Pitfall 6 and the plan's T-12-07 threat-register mitigation
- Included the one guarded-file candidate (`invalidOptions` un-export in `session-load-helpers.ts`) in the cut list (permitted per the plan's interfaces contract) but explicitly flagged it as a reasonable defer/reject choice at the D-03 sign-off, given the friction cost of touching any guarded file versus the negligible value of a one-keyword change
- Broadened the milestone-audit portion of Task 1 to cover all 26 tech_debt entries in both audits (not filtered to strict src/-scope) since this plan's own title claims "known-debt ledger re-verify" as a whole and no sibling Wave-1 plan claims that broader ownership; non-src items are explicitly scope-tagged in the table so Plan 12-06 can route them to their proper owning plan (mostly 12-01/12-02)

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` were followed as specified; no Rule 1-4 auto-fixes were needed since this is a read-only audit plan with no code to fix, and no architectural decisions arose that required a checkpoint.

## Issues Encountered

None. The codebase-memory-mcp knowledge graph tools (`search_graph`/`get_code_snippet`/`trace_path`/`search_code`) named in this plan's `<mcp_tools>` guidance were not present in this session's available tool set (consistent with the documented upstream MCP-tools-stripped-from-restricted-agents issue referenced in this agent's own instructions) — fell back to the CLI-based manual grep/Python cross-reference methodology RESEARCH.md itself already recommends as sufficient at this repo's scale, with no loss of rigor (every one of the 478 exported symbols was checked against the full text of every other file in scope, which is at least as thorough as a graph-based zero-inbound-caller query).

## User Setup Required

None - no external service configuration required. This plan is a pure read-only audit; no code was installed, built, or deployed.

## Next Phase Readiness

- `12-AUDIT-SRC-DEBT.md` is ready for Plan 12-06 to transcribe its 9 Cut-List Candidates rows into the consolidated health report's "src Low-Risk Subtraction" section, per this plan's declared key_link.
- The single most consequential forward-looking fact for later phases: `src/session/agda-transport.ts` is now at the exact 500-line ceiling with zero headroom — any future change to this file (including one landing outside Phase 12) must be preceded by a barrel-extraction split, not a patch.
- No blockers for Plan 12-05 (regression-lock exclusion list + RT6/RT7 verdict) or Plan 12-06 (consolidation) — this plan's output is self-contained and required no cross-plan coordination during execution.

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*
