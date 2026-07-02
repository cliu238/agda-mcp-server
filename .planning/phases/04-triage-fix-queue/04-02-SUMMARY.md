---
phase: 04-triage-fix-queue
plan: 02
subsystem: reporting
tags: [triage, error-classification, capture, mcp-tool, typescript, fingerprinting]

# Dependency graph
requires:
  - phase: 04-triage-fix-queue (prior work)
    provides: The already-shipped QUEUE-03 classifier (`classifyAgdaError()` in `src/agda/error-classifier.ts`) and the Phase-1 capture pipeline (`CaptureArtifact`, `register-capture-session.ts`, `RecordedAction` log) this plan wires together.
provides:
  - "CaptureArtifact.triage: TriageResult | null — additive, always-explicit-null field populated at capture time"
  - "src/agda/session-capture/triage-derivation.ts — deriveTriageFromActions(actions, fallback), the scan-last-load-family-action-then-classify-or-fallback helper"
  - "A fixed fingerprint-fidelity gap: fingerprintBugReport()'s affectedTool/observed are now derived from the same scan when a real load-family error exists, unchanged otherwise"
affects: [04-03 (fix-queue entries can now carry a real triageClass/triageConfidence for any future live capture; the fingerprint fix lets a live re-capture of a hand-seeded defect bump recurrence instead of appearing as a new entry)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive nullable interface field with explicit-null convention (never `field?:`) — matches CaptureArtifact's existing `oracleSubstrate: OracleSubstrate | null` precedent"
    - "Domain logic extracted into a focused src/agda/session-capture/*.ts helper so the MCP tool handler (register-capture-session.ts) stays a thin adapter — mirrors buildReplayManifest/buildOracleSubstrate"

key-files:
  created:
    - src/agda/session-capture/triage-derivation.ts
    - test/unit/agda/session-capture/triage-derivation.test.ts
  modified:
    - src/agda/session-capture/artifact-types.ts
    - src/tools/register-capture-session.ts
    - test/unit/tools/register-capture-session.test.ts

key-decisions:
  - "Reused classifyAgdaError() verbatim via the src/agda/agent-ux.ts barrel — never imported error-classifier.ts directly, and no classification logic was reimplemented (D-09/D-10)"
  - "Extracted the scan/classification logic into a new triage-derivation.ts helper so register-capture-session.ts stays a thin adapter (CLAUDE.md names 'fat tool handlers with embedded domain logic' as an anti-pattern)"
  - "The scan looks only at the SINGLE most recent load-family action (agda_load / agda_load_no_metas / agda_typecheck) — if that one action carries no error text, the derivation falls back immediately rather than searching further back for an older erroring action, keeping the semantics simple and matching the plan's exact spec"
  - "fingerprintBugReport()'s affectedTool/observed are now derived from the same scan when a real error exists, and are byte-identical to today's hardcoded values in the no-error case, so no existing fingerprint-routing test could regress"

patterns-established:
  - "deriveTriageFromActions(actions, fallback) — scan-last-load-family-action-then-classify-or-fallback pattern for any future session-capture helper needing a defensive, try/catch-wrapped best-effort derivation from the recorded action log"

requirements-completed: [QUEUE-03]

# Metrics
duration: 9min
completed: 2026-07-02
---

# Phase 04 Plan 02: Capture-Time Triage Classification Summary

**Every `agda_capture_session` call now embeds a real `classifyAgdaError()` verdict (or explicit `null`) on the staged artifact, derived by a new thin `deriveTriageFromActions` helper — and the capture tool's fingerprint call is richer exactly when a load-family error was observed, closing RESEARCH.md's Pitfall 3 fingerprint-fidelity gap.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-02T22:20:47Z
- **Completed:** 2026-07-02T22:29:01Z
- **Tasks:** 2/2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `CaptureArtifact.triage: TriageResult | null` now exists and is populated at capture time — `null` when no load-family action ever recorded an Agda error, or the real `classifyAgdaError()` output when one did.
- All scan/classification logic lives in the new `src/agda/session-capture/triage-derivation.ts` (`deriveTriageFromActions`), keeping `register-capture-session.ts` a thin adapter with no inline domain logic — verified by both a tool-integration test and 3 focused helper-unit tests.
- Fixed the fingerprint-fidelity gap: `fingerprintBugReport()`'s `affectedTool`/`observed` are now derived from the same last-load-family-action scan (richer, e.g. `affectedTool: "agda_load"` + the real error text) when an error was observed, while remaining byte-identical to today's hardcoded shape in the no-error fallback case — no existing fingerprint-routing test regressed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Embed capture-time triage classification (D-10) + fix the fingerprint-fidelity gap via a dedicated session-capture helper** - `c8a280e` (feat)
2. **Task 2: Test capture-time triage embedding, the fingerprint improvement, and the extracted helper** - `0b50314` (test)

**Plan metadata:** (this SUMMARY commit, following)

_Note: Task 1 included both the interface change and the new helper + tool wiring in one commit, matching the plan's single-task scope (all three files were required to change together or `tsc --strict` would fail on a missing-property error at the `CaptureArtifact` construction site)._

## Files Created/Modified
- `src/agda/session-capture/artifact-types.ts` - Added `import type { TriageResult }` and the `triage: TriageResult | null` field on `CaptureArtifact` (additive, always explicit-null)
- `src/agda/session-capture/triage-derivation.ts` - New helper: `deriveTriageFromActions(actions, fallback)` scans for the last load-family action, classifies its error via `classifyAgdaError()` (through the `agent-ux.ts` barrel) when present, and falls back defensively (try/catch) otherwise
- `src/tools/register-capture-session.ts` - Imports and calls `deriveTriageFromActions`; threads its `fingerprintAffectedTool`/`fingerprintObserved` into the `fingerprintBugReport()` call; adds `triage` to the `CaptureArtifact` object literal
- `test/unit/agda/session-capture/triage-derivation.test.ts` - New: 3 focused unit tests directly against `deriveTriageFromActions` (empty actions, real-error classification + fingerprint fields, malformed `data.errors` fallback)
- `test/unit/tools/register-capture-session.test.ts` - Extended the zero-interaction test with a `staged.triage` null assertion; added a new test proving a real `classifyAgdaError()` output is embedded when a fake `agda_load` action recorded an error

## Decisions Made
- Reused `classifyAgdaError()` verbatim via the `src/agda/agent-ux.ts` barrel per the plan's explicit constraint — no reimplementation.
- The load-family scan checks only the single most recent matching action; if it has no error text, the derivation falls back immediately (does not keep searching backward for an older erroring action) — this matches the plan's exact spec and keeps the no-error case's fingerprint output byte-identical to today's.
- Kept `src/tools/register-capture-session.ts`'s new inline logic to exactly one call (`deriveTriageFromActions(...)`), per CLAUDE.md's "fat tool handlers with embedded domain logic" anti-pattern.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` and `<acceptance_criteria>` were implemented and verified as specified.

## Issues Encountered
- Ambient Node was v22 (project requires >=24) and `node_modules` was not yet installed in this worktree checkout. Resolved by running `mise exec node@24 -- npm install` once, then using `mise exec node@24 -- npx ...` for all subsequent `tsc`/`vitest` invocations — this is environment setup, not a plan deviation.
- `npx tsc -p tsconfig.test.json --noEmit` (not part of this plan's specified verification, which only requires `tsc -p tsconfig.json --noEmit`) surfaces a number of pre-existing type errors in unrelated test files (e.g. `test/property/reporting/bug-report.property.test.ts`, `test/unit/tools/oracle-orcl-01.test.ts`, `test/unit/session/tool-recommendation.test.ts`). None of these reference any file this plan touched; confirmed out of scope per the deviation rules' scope boundary and left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 04-03 (fix-queue entries) can now populate a real `triageClass`/`triageConfidence` per entry using this same `deriveTriageFromActions`/`classifyAgdaError()` path for any future live capture.
- The fingerprint fix means a future live re-capture of a defect Plan 04-03 hand-seeds now has a real chance of bumping recurrence (matching `affectedTool`/`observed`) instead of silently appearing as a disconnected new entry.
- No blockers identified.

---
*Phase: 04-triage-fix-queue*
*Completed: 2026-07-02*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`c8a280e`, `0b50314`) verified present in git log.
