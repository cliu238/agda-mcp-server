---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 11
subsystem: docs
tags: [docs-residue, cut-list, upstream-sync, oracle-policy, dockerfile, cleanup]

# Dependency graph
requires:
  - phase: 12 (plans 08/09/10)
    provides: completed Wave-4 execution (pipeline cuts, tools no-op, src-subtraction no-op) so this plan has full knowledge of what actually got cut before its own final doc pass
provides:
  - Four D-03-approved docs-and-planning-residue cuts executed (CUT-03, CUT-04, CUT-05, CUT-08)
  - Final full-doc-surface cross-reference against the post-deletion 74-tool MCP manifest, confirmed clean
affects: [phase-12-close-out, future upstream-sync-skill usage, future oracle-policy edits]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - Dockerfile
    - scripts/data/oracle-policy/agda-unimath.json
    - .agents/skills/upstream-sync/SKILL.md
  deleted:
    - .planning/research/FEATURES.md
    - .planning/research/STACK.md
    - .planning/research/PITFALLS.md
    - .planning/research/SUMMARY.md
    - .planning/research/ARCHITECTURE.md
    - .planning/research/FUEL-CORPORA.md

key-decisions:
  - "Executed exactly the four D-03-approved docs-residue rows (CUT-03/04/05/08); left CUT-06/07/09 untouched per the sign-off's upstream-avoidance directive"
  - "CUT-04/CUT-05 order enforced: repoint the citing file first (Dockerfile comment / oracle-policy JSON $comment), then delete the cited research doc, never the reverse"
  - "Historical citations to the deleted research docs inside .planning/milestones/**, .planning/quick/**, and this phase's own frozen audit trail (.planning/phases/12-*) are archival snapshots, not live documentation — left unedited, consistent with the source audit's own citation-scope reasoning"

requirements-completed: [D-01, D-02]

# Metrics
duration: ~10min
completed: 2026-07-06
---

# Phase 12 Plan 11: Docs and Planning-Residue Cuts + Final Tool-Reference Cross-Check Summary

**Executed the four D-03-approved docs-residue cuts (deleted 6 stale research docs after repointing their 2 live citations) and ran the final post-deletion doc-surface cross-reference, which came back vacuously clean since this phase deleted zero MCP tools.**

## Performance

- **Duration:** ~10 min (start/end wall-clock not explicitly captured this run; estimated from work performed — reads, 3 edits, 1 commit, 2 verification passes)
- **Completed:** 2026-07-06
- **Tasks:** 2 (both complete)
- **Files modified:** 9 (3 modified, 6 deleted)

## Accomplishments

- CUT-03: deleted `.planning/research/{FEATURES,STACK,PITFALLS,SUMMARY}.md` — four shipped-and-superseded v1.1-scoped research docs with zero live citations anywhere outside already-archived milestone/quick-task snapshots.
- CUT-04: inlined the devDependencies-at-runtime rationale directly into `Dockerfile:88-89`'s comment (removing the `.planning/research/ARCHITECTURE.md §2` cross-reference — the rationale itself was already substantively present in the Dockerfile's own prose, so this was a citation-removal, not new prose), then deleted `.planning/research/ARCHITECTURE.md`.
- CUT-05: repointed `scripts/data/oracle-policy/agda-unimath.json`'s `$comment` field from `.planning/research/FUEL-CORPORA.md` to `.agents/skills/agda-dogfooding/SKILL.md §6`, then deleted `.planning/research/FUEL-CORPORA.md`.
- CUT-08: removed the single stale `src/session/load-terminus-tracker.ts` line from `.agents/skills/upstream-sync/SKILL.md` Section 3's guarded-files list (that file was deleted in Phase 10's merge per `docs/LOAD-TERMINUS-ADJUDICATION.md`); the other 8 guarded paths are untouched and verified still present.
- Final cross-reference (Task 2): computed the deleted-tool set as `12-BASELINE-TOOLS.txt` (74 tools) minus the current `test/fixtures/e2e/mcp-tool-coverage.json` tool set (74 tools) — both sets are identical (0 missing, 0 extra), confirming this phase deleted zero MCP tools (CUT-10/CUT-11 were both deferred at D-03 sign-off, matching Plan 12-09's no-op outcome). The doc-surface scan is therefore vacuously clean; no doc edits were needed or made in Task 2.

## Task Commits

1. **Task 1: Execute approved docs and gitignore-hygiene cuts** (scoped down to the 4 D-03-approved rows: CUT-03/04/05/08 — CUT-09 gitignore-hygiene was NOT approved, see Deviations) - `8100bff` (docs)
2. **Task 2: Final cross-reference of the doc surface against the post-deletion manifest** — verification-only, zero fixes found/needed, no commit produced (see Verification below for the exact command and result)

**Plan metadata:** committed alongside this SUMMARY.md (see below)

## Files Created/Modified

- `Dockerfile` - Removed the dangling `.planning/research/ARCHITECTURE.md §2` cross-reference from the devDependencies comment at line 88-89; the rationale text itself is unchanged and was already fully inline.
- `scripts/data/oracle-policy/agda-unimath.json` - `$comment` field's provenance pointer repointed from the now-deleted `.planning/research/FUEL-CORPORA.md` to `.agents/skills/agda-dogfooding/SKILL.md §6`; `sanctionedAxioms`/`requiredFlags` values themselves unchanged.
- `.agents/skills/upstream-sync/SKILL.md` - Removed the stale `src/session/load-terminus-tracker.ts` entry from Section 3's guarded-files list (9 → 8 entries); all other content unchanged.
- `.planning/research/FEATURES.md` - deleted (CUT-03).
- `.planning/research/STACK.md` - deleted (CUT-03).
- `.planning/research/PITFALLS.md` - deleted (CUT-03).
- `.planning/research/SUMMARY.md` - deleted (CUT-03).
- `.planning/research/ARCHITECTURE.md` - deleted (CUT-04, after Dockerfile repoint).
- `.planning/research/FUEL-CORPORA.md` - deleted (CUT-05, after oracle-policy JSON repoint).

## Decisions Made

- Followed the orchestrator's explicit `<scope_override>`, which narrows this plan's own frontmatter file list (`docs/**`, `README.md`, `.gitignore` among them) down to exactly the four D-03-approved rows. `docs/**` and `.gitignore` in the frontmatter correspond to the deferred CUT-07/CUT-09 and were correctly left untouched.
- For CUT-04 and CUT-05, executed the citing-file repoint strictly before the research-doc deletion (both within the same commit), per each row's Fix approach and per `12-APPROVED-CUTS.md`'s notes column.
- Verified via grep (both before and after the deletions) that no file outside `.planning/milestones/**` (archived milestone phases), `.planning/quick/**` (a completed, dated quick-task record), and this phase's own frozen audit trail (`.planning/phases/12-*`) cites any of the 6 deleted files. These are historical/archival snapshots by this project's own convention (STATE.md tracks quick-tasks as "Completed"; milestones are closed), not living documentation — consistent with the source audit's (`12-AUDIT-DOCS.md`) own reasoning for CUT-03's "zero live citations" conclusion. No unexpected additional live citation was found, so no STOP was triggered.
- Confirmed none of the 4 edited/deleted-with-repoint files (Dockerfile, the oracle-policy JSON, the SKILL.md, plus the 6 deleted research docs) carry a `Regenerated-by`/never-hand-edit marker in their first 5 lines, so every edit here was a direct, appropriate hand-edit (no generator script redirection needed).

## Deviations from Plan

None — plan executed exactly as scoped by the orchestrator's `<scope_override>`. Two clarifications worth recording (not rule-triggered deviations, since no code/behavior changed as a result):

1. The plan's own Task 1 title/action text ("Execute approved docs and **gitignore-hygiene** cuts") also names CUT-09 (the `.gitignore` hygiene finding for `.planning/graphs/`/`graphify-out/`). Per `12-APPROVED-CUTS.md`'s D-03 sign-off, CUT-09 is `deferred` (upstream-inherited `.gitignore`, excluded per the "尽量不要动 upstream" directive) — so per the plan's own read-first instruction ("act only on rows marked approved"), it was correctly left unexecuted. `.gitignore` shows zero diff.
2. CUT-04's Fix approach calls for inlining "the 2-sentence rationale" into the Dockerfile comment. On inspection, the Dockerfile's existing comment already substantively contained that rationale in its own words (devDependencies needed at runtime by `scripts/*.mjs`) — the research doc's cross-reference was additional provenance, not additional content. The fix was therefore a clean citation-removal rather than new prose insertion; this fully satisfies the Fix approach's intent (no dangling path reference survives the doc's deletion) without duplicating text that was already present.

## Issues Encountered

None.

## Verification

- **Task 1 automated check:** `git diff --quiet HEAD -- .planning/phases/11-auto-sync-productionization && git diff --quiet HEAD -- docs/FIX-QUEUE-DASHBOARD.md && echo "phase11-and-generated-dashboard-untouched"` → printed `phase11-and-generated-dashboard-untouched` (exit 0). Phase 11's artifacts and the generated dashboard are confirmed zero-diff.
- **Task 1 manual scope check:** `git status --short` scoped to `docs/`, `README.md`, `.agents/skills/`, `.gitignore`, `.planning/research/` showed exactly 9 changes (3 modified: `Dockerfile`, `scripts/data/oracle-policy/agda-unimath.json`, `.agents/skills/upstream-sync/SKILL.md`; 6 deleted: the CUT-03/04/05 research docs) — matching the four approved rows exactly, with zero drift into deferred territory (`README.md`, `.gitignore`, `docs/literate-agda-assessment.md`, `CHG-REVERIFY.md`, `RT-REVERIFY.md` all confirmed untouched).
- **Task 2 automated check (final tool-reference cross-reference):** ran the plan's exact verify script comparing `12-BASELINE-TOOLS.txt` (74 tool names) against the current `test/fixtures/e2e/mcp-tool-coverage.json`'s tool set (74 tool names) — output: `no tools deleted this phase; doc-ref check vacuously clean` (exit 0). Manually re-confirmed the set-equality is genuine (not a vacuous empty-set artifact): base size 74, current size 74, 0 entries in base-but-not-current, 0 entries in current-but-not-base. This matches the expected outcome stated in the orchestrator's `<final_crossref_task>` — CUT-10 and CUT-11 (the phase's only `tools`-category candidates) were both deferred at D-03 sign-off (per Plan 12-09's no-op SUMMARY), so the live manifest is byte-identical to baseline and there is no deletion ripple to check.
- **Post-commit deletion check:** `git diff --diff-filter=D --name-only HEAD~1 HEAD` against commit `8100bff` lists exactly the 6 intended research-doc deletions and nothing else.
- **Self-check:** commit `8100bff` found in `git log --oneline --all`; all 6 deleted files confirmed absent from the working tree; all 3 edited files confirmed to carry their expected post-edit content (guarded-file line removed, Dockerfile cross-ref removed, oracle-policy JSON repointed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four D-03-approved docs-residue cuts are committed; the phase's docs-residue category is fully closed.
- The final doc-surface cross-reference confirms no stale MCP tool references exist anywhere in `docs/`, `README.md`, or either `SKILL.md` — this closes out the phase's `RESEARCH.md`-documented validation gap (no automated doc-reference check previously existed) for this execution wave.
- No push, no tag created this plan (per orchestrator instruction) — commits are local to this worktree, pending the orchestrator's merge.
- Remaining deferred items (CUT-06/07/09/10–20) are recorded, unexecuted, and available as upstream-PR or future-fork-scoped candidates per `12-APPROVED-CUTS.md`; none are blockers for closing Phase 12.

## Self-Check: PASSED

- FOUND: commit `8100bff` in `git log --oneline --all`
- CONFIRMED ABSENT: `.planning/research/FEATURES.md`
- CONFIRMED ABSENT: `.planning/research/STACK.md`
- CONFIRMED ABSENT: `.planning/research/PITFALLS.md`
- CONFIRMED ABSENT: `.planning/research/SUMMARY.md`
- CONFIRMED ABSENT: `.planning/research/ARCHITECTURE.md`
- CONFIRMED ABSENT: `.planning/research/FUEL-CORPORA.md`
- CONFIRMED: `Dockerfile` no longer references `research/ARCHITECTURE.md`
- CONFIRMED: `scripts/data/oracle-policy/agda-unimath.json` repointed to `.agents/skills/agda-dogfooding/SKILL.md §6`
- CONFIRMED: `.agents/skills/upstream-sync/SKILL.md` no longer lists `load-terminus-tracker.ts`
- FOUND: this file (`12-11-SUMMARY.md`)

No missing items.

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*
