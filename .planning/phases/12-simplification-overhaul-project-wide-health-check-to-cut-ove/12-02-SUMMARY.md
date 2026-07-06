---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 02
subsystem: docs
tags: [documentation-audit, planning-residue, tool-manifest-crosscheck, gsd-planning]

# Dependency graph
requires:
  - phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove (context/research/patterns)
    provides: 12-CONTEXT.md's D-01/D-03/C-05 decisions, 12-RESEARCH.md's known-debt re-verify methodology, 12-PATTERNS.md's cut-list row shape
provides:
  - 12-AUDIT-DOCS.md — doc surface classification (12 files: docs/, README.md, both SKILL.md) with stale agda_* tool-reference scan and generated-vs-authored tagging
  - Planning-residue scan of all 12 .planning/research/ files, classified by live-citation evidence rather than assumption
  - Explicit Phase 11 artifact-protection confirmation, citing 12-CONTEXT.md's carve-out
  - VALIDATION.md-missing debt resolved as out-of-cut-list-scope (addition, not subtraction)
  - Fresh re-verification of the .planning/graphs/graphify-out gitignore-hygiene gap
  - 7 severity-graded Cut-List Candidates rows in the Plan-12-06-consumable shape
affects: [12-06 (consolidated health report — transcribes these rows into its Docs and Planning Residue section)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc-surface stale-reference scan: cross-check every backtick/fenced/HTML-code agda_ identifier in docs against test/fixtures/e2e/mcp-tool-coverage.json's 74-tool SSOT (mirrors test/unit/tools/no-dead-tool-references.test.ts's src/-only regex, extended by hand to docs/ and .agents/skills/)"
    - "Live-citation-before-cut check: before flagging any planning-research file as safely-cuttable, grep the whole repo for its path outside sibling research docs and closed phase archives — several pre-assumed-safe files (ARCHITECTURE.md, FUEL-CORPORA.md, CHG-REVERIFY.md, RT-REVERIFY.md, MCP-DESIGN-TRENDS.md) turned out to have live citations that changed their cut risk"

key-files:
  created:
    - .planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-DOCS.md
  modified: []

key-decisions:
  - "Used a broader (non-strict-backtick) agda_ identifier scan in addition to the src/-test's exact backtick regex, since docs format tool invocations differently (fenced code blocks, HTML <code> tags) — caught docs/team-intro.html's agda_capture_session reference the strict pattern alone would have missed"
  - "Corrected 3 of 12-CONTEXT.md's own pre-named 'safely supersede-able' examples after live-citation re-verification: CHG-REVERIFY.md and RT-REVERIFY.md are cited by fix-queue.json's notes fields (including still-open RT6/RT7 entries this milestone must still render a D-04 verdict on) — recommended deferring their cut rather than cutting now; FUEL-CORPORA.md is cited by a live oracle-policy JSON's $comment field — recommended repoint-then-delete rather than a bare delete"
  - "Flagged MCP-DESIGN-TRENDS.md as protected (live-cited by .planning/DESIGN-PRINCIPLES.md, an actively-applied planning-lens doc) even though nothing in 12-CONTEXT.md explicitly named it — a new finding from this plan's own re-verification, not inherited from planning-time assumptions"
  - "Elevated docs/literate-agda-assessment.md to a high-severity cut/reconcile candidate: its entire 'What Does Not Work' table is now factually false (the literate-format gaps it describes were fully closed by a later, more ambitious src/session/literate/ subsystem plus 7 fixture files) — the only finding in this audit where a doc's content, not merely its existence, actively misleads"
  - "Defined the critical/high/medium/low severity scale independently in this doc's own header, since concurrently-executing Plan 12-01 (same wave, no depends_on relationship) defines its own copy in a file this plan cannot read at execution time; tier names match per the plan's explicit instruction, exact wording is left for Plan 12-06 to reconcile"

requirements-completed: [C-05, D-01]

# Metrics
duration: 20min
completed: 2026-07-06
---

# Phase 12 Plan 02: Documentation & Planning-Residue Audit Summary

**Audited 12 doc-surface files for stale `agda_*` tool references against the live 74-tool manifest (one soft finding) and all 12 `.planning/research/` files for cut-safety using live-citation evidence rather than assumption — correcting 3 of the phase's own pre-named "safe to cut" examples and surfacing one previously-unnoticed high-severity stale doc (`literate-agda-assessment.md`).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-06T02:28Z (approx., per STATE.md session start)
- **Completed:** 2026-07-06T02:47:20Z
- **Tasks:** 2
- **Files modified:** 1 (`12-AUDIT-DOCS.md`, created)

## Accomplishments

- Classified all 12 doc-surface files (9 under `docs/`, `README.md`, both `.agents/skills/*/SKILL.md`) as generated-or-authored (only `docs/FIX-QUEUE-DASHBOARD.md` is generated) with an explicit stale-reference count per file, cross-checked against the 74-tool manifest SSOT.
- Enumerated all 12 `.planning/research/` files and re-verified live-citation evidence for each, rather than trusting 12-CONTEXT.md's own pre-named examples at face value — found 5 files with genuine live citations (`ARCHITECTURE.md` ↔ `Dockerfile:89`, `FUEL-CORPORA.md` ↔ `scripts/data/oracle-policy/agda-unimath.json`, `CHG-REVERIFY.md`/`RT-REVERIFY.md` ↔ `test/fixtures/fix-queue.json`, `MCP-DESIGN-TRENDS.md` ↔ `.planning/DESIGN-PRINCIPLES.md`) and 2 files independently confirmed load-bearing (`ORACLE-VALIDITY.md`, `UPSTREAM-SYNC.md`).
- Discovered `docs/literate-agda-assessment.md`'s entire "What Does Not Work" table is stale against current `HEAD` — verified via `src/agda/data/agda-source-extensions.json` (version-gates all 7 literate suffixes), the `src/session/literate/` extraction subsystem, and 7 dedicated test fixtures, none of which the doc anticipated.
- Resolved all required Task 2 narrative sections: Phase 11 artifact protection (explicit, citing `12-CONTEXT.md`), the VALIDATION.md-missing debt (resolved out-of-scope as an addition, not a subtraction), a fresh (worktree-caveat-explained) re-verification of the `.planning/graphs`/`graphify-out` gitignore gap, and the `agda-mcp-k8s-deploy` skill promotion note (informational only).
- Drafted 7 severity-graded Cut-List Candidates rows in the exact `Issue/Files/Impact/Fix approach/Severity/Generated-or-authored` shape Plan 12-06 consumes verbatim.

## Task Commits

Each task was committed atomically:

1. **Task 1: Doc surface cross-reference and generated-authored classification** - `21326ec` (docs)
2. **Task 2: Planning-residue scan and cut-list candidates** - `182b01d` (docs)

**Plan metadata:** committed in this same response (final commit below)

## Files Created/Modified

- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-DOCS.md` - Doc Surface Classification (12 files), Additional Accuracy Findings, Planning-Residue Scan (12 research files), Phase 11 protection statement, VALIDATION.md-missing resolution, gitignore-hygiene re-verification, k8s-deploy informational note, severity scale, and 7 Cut-List Candidates rows.

## Decisions Made

See `key-decisions` in frontmatter above. In short: extended the tool-name scan beyond a strict backtick regex to catch doc-specific code formatting; re-verified rather than inherited the planning-time "safe to cut" assumptions for 3 files named in `12-CONTEXT.md`/`12-RESEARCH.md`, correcting the risk assessment for each based on newly-found live citations; independently discovered and protected one additional load-bearing file (`MCP-DESIGN-TRENDS.md`) and one additional high-severity stale doc (`literate-agda-assessment.md`) beyond what either prior planning artifact called out by name.

## Deviations from Plan

None — plan executed exactly as written. The corrections described above (re-verifying rather than accepting `12-CONTEXT.md`'s example files at face value, and surfacing two additional findings) are exactly what Task 1's and Task 2's own `<action>` text asked for ("re-confirm this still holds rather than trusting this stale note"; "evaluate genuinely, do not pre-conclude either way" is 12-01's phrasing but the same spirit governs this plan) — not scope additions requiring a deviation rule.

## Issues Encountered

None. Plan 12-01 (concurrent, same wave, `depends_on: []` on both sides) was not yet complete at execution time, so its own severity-tier wording could not be read; this plan defined an equivalent scale independently using the same 4 tier names, which the plan's own `<interfaces>` block anticipated ("Plan 12-06 reconciles" is this plan's own framing of that expected outcome, not a workaround).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `12-AUDIT-DOCS.md` is ready for Plan 12-06 to transcribe verbatim into its consolidated health report's "Docs and Planning Residue" section.
- Three cut-list rows recommend a specific pre-condition before cutting (update `Dockerfile:89`'s comment; repoint `agda-unimath.json`'s `$comment`; wait for the RT6/RT7 D-04 verdict before touching `RT-REVERIFY.md`) — these are sequencing notes for whichever execution plan implements the approved cuts, not blockers on this plan or on Plan 12-06's consolidation.
- No blockers. This plan touched no file outside its own new report, so it carries zero risk of interfering with sibling wave-1 plans' concurrent work.

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-DOCS.md`
- FOUND: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-02-SUMMARY.md`
- FOUND: commit `21326ec` (Task 1)
- FOUND: commit `182b01d` (Task 2)
