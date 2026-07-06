---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 03
subsystem: mcp-tool-surface
tags: [mcp-tools, tool-audit, usage-evidence, json-rpc, d-02]

# Dependency graph
requires: []
provides:
  - "12-AUDIT-TOOLS.md: a 74-row real-usage-evidence table for every registered MCP tool, JSON-RPC-envelope-aware (not a naive grep), re-verified live at execution time"
  - "12-AUDIT-TOOLS.md: 2 D-02 Cut-List Candidate rows (agda_bug_report_bundle+_update_bundle delete; agda_goal_analysis merge into agda_goal_catalog), each with a fully pre-mapped 6-step lockstep checklist"
  - "12-AUDIT-TOOLS.md: Excluded-as-Loop2-Stage-Entry and Excluded-on-Security-Grounds subsections making the C-02/security filters auditable"
affects: [12-06-consolidated-health-report, 12-09-execute-approved-cuts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-verify known/candidate findings against live source before drafting a cut-list row (traced actual implementations, not just descriptions, for every candidate and every ruled-out cluster)"
    - "Security Domain cross-check as an investigate-and-document step, not a reflexive keyword match — traced the actual shared function (fingerprintBugReport) to confirm the named control survives a candidate cut before deciding not to exclude it"

key-files:
  created:
    - .planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-TOOLS.md
  modified: []

key-decisions:
  - "Real-usage aggregation re-read from the main checkout's absolute .agda-mcp/runs/ path (gitignored, absent from this worktree) rather than skipped or fabricated — reproduced RESEARCH.md's exact 72-invocation/17-tool numbers"
  - "Only 2 Cut-List Candidates drafted after deep source-level investigation of ~15 same-category tool clusters; the rest were deliberately ruled out with recorded reasoning (mostly: deliberate Agda IOTCM protocol-parity coverage, or a documented composite-vs-granular pattern) rather than padding the list on name-similarity alone"
  - "agda_bug_report_bundle/_update_bundle: included as a Cut-List Candidate (not Excluded-on-Security-Grounds) after tracing that the V6-named createHash fingerprinting function survives the cut via a separate, independent code path (dedup-index.ts, consumed by the surviving agda_capture_session)"
  - "agda_goal_analysis: proposed as a merge (optional goalId filter added to agda_goal_catalog) rather than a pure delete, since deleting it outright without the addition would regress an efficient single-goal query path"

requirements-completed: [D-02, C-02, C-05]

# Metrics
duration: ~25min
completed: 2026-07-06
---

# Phase 12 Plan 03: MCP Tool Surface Audit Summary

**Built a 74-tool JSON-RPC-envelope-aware real-usage-evidence table and drafted 2 fully-lockstepped D-02 cut-list candidates (bug-report-bundle tools superseded by agda_capture_session; agda_goal_analysis mergeable into agda_goal_catalog), after tracing — not assuming — that neither candidate removes a Loop② stage entry point or an active security control.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-06T02:28-ish (worktree setup)
- **Completed:** 2026-07-06T02:50:32Z
- **Tasks:** 2 completed
- **Files modified:** 1 created (`12-AUDIT-TOOLS.md`)

## Accomplishments

- Re-ran RESEARCH.md's JSON-RPC-envelope-aware Python aggregation script verbatim against all 21 local `.agda-mcp/runs/*/transcript.jsonl` files (read via absolute path from the main checkout, since `.agda-mcp/` is gitignored and not present in this isolated worktree) — reproduced the exact same 72-total-invocation / 17-distinct-tool result RESEARCH.md recorded, confirming the local sample hasn't changed since research time.
- Built the full 74-row Real Usage Evidence table by booting the live tool manifest the same way `mcp-e2e-coverage.test.ts` does (`AgdaSession` + `registerCoreTools()` + `listToolManifest()`, no live Agda process spawned) and cross-referencing `test/fixtures/e2e/mcp-tool-coverage.json` for `requiresLiveAgda`/`requiresBackend` — confirmed bidirectional set-equality between manifest and coverage-matrix names (74 = 74, zero mismatches either direction).
- Applied the C-02 Loop②-stage-entry check before any redundancy/security filter: confirmed `agda_capture_session` (11 real local invocations) as the sole capture-stage MCP entry point via `.agents/skills/agda-dogfooding/SKILL.md`'s own explicit instruction, and confirmed no other Loop② stage (judge/file/fix/lock) has any MCP-tool entry point at all — those stages live entirely in `scripts/`.
- Performed the mandatory Security Domain cross-check on every zero-usage candidate considered, going beyond a keyword match: traced the actual `fingerprintBugReport()` call graph to confirm RESEARCH.md's V6-named control survives a bug-report-bundle-tools cut via an independent consumer (`agda/session-capture/dedup-index.ts`, used by the surviving `agda_capture_session`) before deciding not to exclude that candidate.
- Investigated and ruled out ~15 same-category or similar-sounding tool clusters (goal/refine/context protocol-parity family, implicit/irrelevant-args toggle pairs, highlighting trio, backend trio, search_about vs. search_definitions, impact/bulk_status/project_progress, the two migration-map tools, session_snapshot vs. proof_status, proof_status vs. its own composed granular tools) by reading actual source, not just descriptions — documented each with its specific disqualifying reason in a "Considered, Not Flagged" table so the audit's negative findings are as auditable as its positive ones.
- Drafted 2 Cut-List Candidates, each carrying every field this plan's `<interfaces>` shape requires (Issue/Files/Impact/Fix approach/Severity plus Real-usage-count/Loop②-stage-entry/Lockstep-checklist), with all six lockstep steps fully spelled out against verified real call sites (e.g. confirmed `tool-recommendation.ts` has a real `agda_bug_report_bundle` recommendation entry to replace, confirmed it has zero `agda_capture_session` entries today so a replacement — not just a removal — is needed to avoid regressing agent guidance).

## Task Commits

Both tasks write to the same single output file (`12-AUDIT-TOOLS.md`) per this plan's `<files>` declaration, and Task 2 builds directly on Task 1's table within that one document — committed together once the complete, internally-consistent document was finished, rather than as an artificially split intermediate commit:

1. **Task 1 + Task 2: Build 74-tool usage table, then redundancy analysis + cut-list** - `ffa1f5a` (docs)

**Plan metadata:** captured in this SUMMARY's own commit (see orchestrator's final commit step).

## Files Created/Modified

- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-TOOLS.md` - 74-row Real Usage Evidence table + reliability disclaimer (Task 1); Excluded-as-Loop2-Stage-Entry, Security Domain Cross-Check, Excluded-on-Security-Grounds, Considered-Not-Flagged, and Cut-List Candidates sections (Task 2)

## Decisions Made

- Reused the main checkout's absolute `.agda-mcp/runs/` path for the transcript scan (worktree-isolated, gitignored path) rather than skipping the evidence or fabricating counts — flagged explicitly in the doc's Method section per the worktree input note.
- Treated the Security Domain cross-check as a trace-and-verify step rather than a reflexive exclude-on-keyword-match: since `agda_bug_report_bundle`/`_update_bundle` facially matched RESEARCH.md's V6 Cryptography row (both cite `src/reporting/bug-report.ts`), I traced the actual `fingerprintBugReport()` consumer graph before deciding whether to exclude — found it survives via `dedup-index.ts` independent of these two tools, so the candidate was included (not excluded) with that reasoning documented on its row, per this plan's instruction to record exclusions/inclusions rather than silently pre-deciding.
- Proposed `agda_goal_analysis` as a **merge** (add an optional `goalId` filter to `agda_goal_catalog`, then delete `agda_goal_analysis`) rather than a pure delete, and flagged this explicitly as carrying more implementation risk than a pure subtraction, so Plan 12-09 doesn't treat it as the same risk tier as the bug-report-bundle deletion.
- Kept only 2 Cut-List Candidates rather than flagging every zero-usage tool: RESEARCH.md's own Assumption A5 and this plan's required disclaimer both state usage-count alone must never be a sole deletion criterion, so each candidate needed an independent, source-verified overlap/mis-selection signal beyond "zero local invocations" — most same-category tool clusters investigated turned out to be deliberate Agda-protocol-parity coverage or a documented composite/granular split, not accidental duplication.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' required sections, fields, and cross-checks are present; no `src/`, `docs/`, or `test/` file was modified (this was a read-only audit plan).

## Issues Encountered

**Worktree isolation vs. transcript evidence:** `.agda-mcp/runs/` (the transcript source Task 1 requires) is gitignored and therefore absent from this isolated worktree checkout. Resolved per the worktree input note: read the transcripts from the main checkout's absolute path (`/Users/eric/projects6/agda-mcp-server/.agda-mcp/runs/`, same filesystem, read-only access), documented this explicitly in the audit doc's Method section rather than silently substituting a worktree-relative path that would have silently scanned zero files. Verified the result reproduces RESEARCH.md's own recorded numbers exactly (72 invocations, 17 tools), confirming the evidence is real and current, not stale or fabricated.

**No node_modules in the worktree:** needed to boot the live tool manifest via `tsx` for Task 1's category cross-reference and Task 2's description/protocol-command lookups. Resolved by running a temporary scratch script from within the worktree's own directory tree (so relative imports resolved against the worktree's checked-out `src/`) while Node's standard module-resolution walk naturally found the main checkout's `node_modules` several directories up — the script never touched a package registry or installed anything. The temporary script was deleted immediately after each run and `git status --short` was confirmed clean before proceeding.

## User Setup Required

None - no external service configuration required. This plan is a read-only audit producing one Markdown artifact.

## Next Phase Readiness

`12-AUDIT-TOOLS.md` is ready for Plan 12-06 to transcribe its Cut-List Candidates rows into the consolidated health report's "MCP Tool Surface" section, and for Plan 12-09 to execute either candidate directly off its pre-mapped lockstep checklist without re-deriving file lists or call-site locations. No blockers. One caveat carried forward: Candidate 2 (`agda_goal_analysis` merge) requires new code (the `goalId` filter addition) before the deletion half can land — Plan 12-09 (or whichever execution plan handles this row) should sequence the addition first, exactly as this doc's lockstep step 1 states.

## Self-Check: PASSED

- FOUND: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-TOOLS.md`
- FOUND: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-03-SUMMARY.md`
- FOUND commit `ffa1f5a` (Task 1+2: 12-AUDIT-TOOLS.md)
- FOUND commit `5c9563a` (this SUMMARY.md)
- No unintended file deletions in either commit; no untracked files remain.

---
*Phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove*
*Completed: 2026-07-06*
