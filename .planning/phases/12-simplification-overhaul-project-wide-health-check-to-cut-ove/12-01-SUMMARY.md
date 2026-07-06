---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 01
subsystem: audit
tags: [scripts, dogfood, oracle, queue, team, technical-debt, cut-list, fix-queue, source-parsers]

# Dependency graph
requires: []
provides:
  - "12-AUDIT-PIPELINE.md: re-verified status (against current HEAD, not stale 2026-07-04 CONCERNS.md prose) for 5 pipeline-scoped known-debt findings"
  - "25/25 scripts/{dogfood,oracle,queue,team}/*.mjs inventory: test-coverage, deploy-relevance, Loop2-stage classification per file"
  - "2 severity-graded, fully-specified cut-list candidate rows (assertSafeRunId extraction; seed-initial-cargo.mjs deletion) in the exact per-row shape downstream plans consume"
  - "Correction to 12-PATTERNS.md's calibration note (dogfood-install-skill.mjs DOES have test coverage)"
  - "Severity scale definition (critical/high/medium/low, one sentence each) for reuse by the phase's consolidated health report"
affects: [12-02, 12-03, 12-04, 12-05, 12-06, 12-07, 12-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-verify-don't-recite: every known-debt item is re-confirmed by re-reading its exact cited file/line range against current HEAD, not by re-citing the original prose (12-RESEARCH.md Pattern 1)"
    - "severity-changed as a third re-verification outcome (alongside confirmed-still-present/already-resolved) for findings whose underlying defect is unchanged but whose scope/blast-radius or supporting evidence has materially shifted"

key-files:
  created:
    - .planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-PIPELINE.md
  modified: []

key-decisions:
  - "Classified the postulate-block multi-line parser bug as severity-changed, not confirmed-still-present as-scoped: the actual current implementation (extractPostulateSites) lives in shared src/agda/source-parsers.ts, not scripts/oracle/orcl-02-soundness-scan.mjs as CONCERNS.md's Files field states — it also backs the live agda_postulate_closure MCP tool via src/tools/agent-ux/project-tools.ts, so the same mis-parse is client-facing, not oracle-fidelity-only"
  - "Classified the assertSafeRunId duplication as severity-changed: CONCERNS.md asserted the two copies were byte-identical; re-reading current HEAD confirms the validation logic is identical but the error-message text has already drifted, i.e. the 'latent divergence' risk CONCERNS.md warned about has already begun to materialize"
  - "Excluded the 3 re-verified oracle-tooling defects from the Cut-List: they are correctness bugs in fidelity-critical tooling, not redundant/duplicated/orphaned code, so they don't fit the cut-list's own row shape — left properly tracked in the fix-queue instead, per this plan's own C-02 spirit of never silently masking an open defect"
  - "Recommended deleting scripts/queue/seed-initial-cargo.mjs outright (zero test coverage, zero importers besides itself, one-off already-executed historical seed, not deploy-relevant) rather than leaving it as inert dead weight"
  - "Did not run npx knip for the inventory — 12-RESEARCH.md's own Environment Availability table and this plan's threat_model (T-12-SC) already justify this exclusion (package identity [ASSUMED], would need a checkpoint:human-verify gate this autonomous plan doesn't carry); documented as an explicit, reasoned exclusion rather than a silent skip"

requirements-completed: [C-01, C-02, C-05, D-01]

duration: ~15min
completed: 2026-07-06
---

# Phase 12 Plan 01: Pipeline Audit Summary

**Re-verified 5 pipeline known-debt findings against current HEAD (2 reclassified severity-changed with new evidence), inventoried all 25 `scripts/{dogfood,oracle,queue,team}/*.mjs` files, and drafted 2 fully-specified cut-list candidates (assertSafeRunId extraction, seed-initial-cargo.mjs deletion) with zero proposal to remove any Loop ② stage.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-06T02:43:59Z
- **Tasks:** 2 (Task 1: known-debt re-verification; Task 2: script inventory + cut-list candidates)
- **Files modified:** 1 created (`12-AUDIT-PIPELINE.md`), 0 other files touched — this is a read-only audit plan by design

## Accomplishments

- Re-verified all 5 named pipeline-scoped known-debt findings (assertSafeRunId duplication, the `.agda-lib` re-materialization gap, the unconditional cold-replay hole-scan, the postulate multi-line mis-split, and the 2eb1768df88bfb07/1220f2840142aab8 fix-queue status re-check) against current source, not stale prose — none was found resolved, 2 were found to have materially shifted scope
- Discovered the postulate-parser bug's real current home is a shared `src/agda/source-parsers.ts` function also consumed by the live `agda_postulate_closure` MCP tool, not `scripts/oracle/` alone as originally scoped — a genuinely new, higher-stakes fact this plan's own read-first evidence trail supports directly
- Discovered a concrete test-breakage risk in the `assertSafeRunId` extraction recommendation itself (`12-PATTERNS.md` Pattern 3 doesn't mention it): adopting the recommended message text breaks 2 existing regex assertions in `dogfood-wrapup-argv-parsing.test.ts`, now flagged for Plan 12-08 to fix in the same commit
- Corrected `12-PATTERNS.md`'s calibration note — `dogfood-install-skill.mjs` does have dedicated test coverage
- Classified all 25 pipeline scripts by test-coverage/deploy-relevance/Loop②-stage; confirmed `scripts/queue/seed-initial-cargo.mjs` is the sole script with zero test coverage
- Defined a 4-tier severity scale (critical/high/medium/low) for reuse across the whole phase's consolidated report, since no repo-wide convention existed

## Task Commits

Both tasks share the plan's single declared output file (`12-AUDIT-PIPELINE.md` is the only path in this plan's `files_modified` frontmatter) and are tightly content-coupled — Task 2's cut-list candidates are explicitly conditioned on Task 1's re-verification status, and several sections cross-reference each other (the inventory table cites the calibration-note correction; the Cut-List's Candidate A cites Finding 1's evidence). Both tasks' work was authored and verified together as one coherent document and committed in a single commit:

1. **Task 1 + Task 2: Pipeline known-debt re-verification, script inventory, cut-list candidates** - `dab9842` (docs)

**Plan metadata:** commit pending (this summary + any orchestrator-owned files, per this worktree's isolation — STATE.md/ROADMAP.md are intentionally NOT touched by this agent)

_Both tasks' automated verification and acceptance criteria were independently checked and passed against the single resulting file before commit (see Deviations section for full grep-based verification detail)._

## Files Created/Modified

- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-PIPELINE.md` - Pipeline audit report: severity scale, 5 re-verified known-debt findings, 25-row script inventory, 2 cut-list candidates, reasoned exclusions, sources

## Decisions Made

- **Severity-changed vs. confirmed-still-present:** used `severity-changed` (not `confirmed-still-present`) for the `assertSafeRunId` and postulate-parser findings specifically because their *current, re-verified* shape differs materially from CONCERNS.md's original description (byte-identical claim proven false; scripts/oracle-only scope proven too narrow), even though the underlying defect in both cases remains unfixed. This distinction is preserved so downstream plans don't treat these as simple stale re-citations.
- **Bugs excluded from the cut-list:** the 3 re-verified oracle-tooling defects (Findings 2-4) are documented in the "Known Pipeline Debt Re-Verification" section but deliberately NOT drafted as Cut-List Candidates — a cut-list row's shape ("what is redundant/duplicated/orphaned") doesn't fit a correctness bug fix. This keeps the audit's two purposes (re-verify known debt vs. draft simplification candidates) cleanly separated per the plan's own two-task structure.
- **seed-initial-cargo.mjs: recommend deletion, not "evaluate inconclusively":** the plan explicitly asked for a genuine evaluation, not a pre-decided conclusion. Confirmed via grep that it has zero importers besides itself, zero test coverage, isn't wired in `package.json`, and its entire output already lives durably in `test/fixtures/fix-queue.json` — the deletion case is strong and is presented as such (severity: low, impact: none either direction).
- **`.planning/codebase/STRUCTURE.md` lockstep addition:** flagged in Candidate B's Fix approach that `STRUCTURE.md`'s two one-line mentions of `seed-initial-cargo.mjs` need updating in the same commit if the cut is approved — `12-PATTERNS.md`'s Shared Pattern A checklist doesn't itself call out `.planning/codebase/` prose, so this is a genuinely additive finding for Plan 12-08 to consume.

## Deviations from Plan

None - plan executed exactly as written. All automated verification commands and acceptance criteria from both tasks were checked directly against the final file before committing:

- `grep -c "Known Pipeline Debt Re-Verification" 12-AUDIT-PIPELINE.md` → 1 (Task 1 `<verify>`)
- `grep -c "confirmed-still-present\|already-resolved\|severity-changed"` → 6 (≥5 required)
- `grep -c "^| scripts/"` → 25 (Task 2 `<verify>`, exactly 25 required)
- `## Cut-List Candidates` section present, containing 2 fully-specified candidate rows (all 7 interface fields present in both — verified programmatically, zero missing fields)
- Severity-scale definition (4 tiers) appears exactly once, in the doc header
- Calibration-note correction is explicit (states plainly that `test/unit/tools/dogfood-install-skill.test.ts` exists, contrary to `12-PATTERNS.md`'s claim)

**Execution note (not a deviation):** Both plan tasks write to the same single file the plan's frontmatter declares (`files_modified` lists exactly one path), and their content is cross-referential by design. Rather than writing a partial Task-1-only file, committing, then editing in Task 2's sections, the full document was authored holistically (both tasks' evidence-gathering was done together as one coherent audit pass) and committed once. Both tasks' individual `<verify>` commands and `<acceptance_criteria>` were still checked independently against the result, and both pass in full.

## Issues Encountered

None. All source re-reads, fix-queue lookups, and cross-file greps needed for re-verification completed without any tooling or environment issues.

## User Setup Required

None - no external service configuration required. This is a read-only, git-tracked documentation artifact.

## Next Phase Readiness

- `12-AUDIT-PIPELINE.md` is ready for Plan 12-06 to transcribe its Cut-List Candidates rows verbatim into `12-HEALTH-REPORT.md`'s Pipeline section, per this plan's own `key_links`.
- Both cut-list candidates carry enough evidence (Files/Impact/Fix approach/Severity/Deploy-relevant/Loop②-stage risk, all fields populated) for a user to make an informed per-item sign-off decision at Plan 12-07's checkpoint without needing to re-derive anything.
- Flagged one concrete risk for Plan 12-08 to carry forward if the `assertSafeRunId` cut is approved: `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts` lines 23 and 27 must be updated in the same commit as the extraction, or the full local verification gate will fail.
- The 3 confirmed-still-open oracle-tooling defects (2 fix-queue fingerprints) remain correctly `triaged`, unresolved, and undisturbed by this audit — no action was taken on them here, consistent with this plan's scope (audit only, no fixes).
- No blockers for the next wave's plans.

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*
