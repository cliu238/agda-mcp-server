---
phase: 01-capture-foundation
plan: 05
subsystem: capture
tags: [mcp-tool, session-capture, cold-replay, dedup, iotcm, vitest]

# Dependency graph
requires:
  - phase: 01-capture-foundation/01-01
    provides: "artifact-types.ts's full CaptureArtifact/CaptureReference contract + the walking-skeleton agda_capture_session tool with []/null placeholders"
  - phase: 01-capture-foundation/01-02
    provides: "buildReplayManifest(session) with all five CAP-01 fidelity fields real (mergedArgv, agdaDirContents, buildMode, importClosureHash, inlinedFirstPartySources)"
  - phase: 01-capture-foundation/01-03
    provides: "drainRecordedActions()/resetRecordedActions() — CAP-04's bounded ring-buffer recorder, hooked into every registerStructuredTool call"
  - phase: 01-capture-foundation/01-04
    provides: "buildOracleSubstrate(session, {expectedSignature?, beforeSource?}) — CAP-05's before/after diff + intended goal type builder"
provides:
  - "agda_capture_session now produces a full-fidelity CaptureArtifact (manifest + recorded actions + oracle substrate) in one call — the four separately-built capabilities from 01-01..01-04 are wired together"
  - "scripts/promote-capture.mjs — CAP-02's dedup-index write-side (out-of-band, single-writer)"
  - "scripts/verify-cold-replay.mjs — standalone cold self-replay proof for ROADMAP Phase 1 success criterion 6"
affects: ["02-oracle-triad"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drain-then-reset at the capture boundary: drainRecordedActions() followed immediately by resetRecordedActions() so two captures in the same session never double-report the same actions"
    - "Idle-on-stdout completion detection for a standalone (non-server) cold Agda round trip, re-derived independently rather than importing src/session/agda-transport.ts's completion logic — verified against a real Agda 2.8.0 binary that a naive 'first Status line closes the response' heuristic is unsound (a successful load emits exactly one non-terminal Status line mid-stream)"
    - "Honest-failure diagnostics: a FAIL verdict that stems from a known, documented scope limitation (D-07's library exclusion) is labeled as such in the reason string rather than presented as an undifferentiated replay-fidelity bug"

key-files:
  created:
    - scripts/promote-capture.mjs
    - scripts/verify-cold-replay.mjs
  modified:
    - src/tools/register-capture-session.ts
    - test/unit/tools/register-capture-session.test.ts

key-decisions:
  - "verify-cold-replay.mjs uses idle-on-stdout completion (500ms idle window, 30s hard timeout) instead of the plan's literally-specified 'stop at the first kind:Status line' heuristic — verified empirically against a real local Agda 2.8.0 binary that the literal heuristic is unsound: a successful load emits exactly one Status line MID-stream (before the real AllGoalsWarnings/InteractionPoints terminus), while a load that fails before type-checking starts emits Status twice with the second one closing the stream. Neither shape is identifiable from a single line's content alone."
  - "promote-capture.mjs resolves the dedup index path from the artifact's own manifest.repoRoot when that path exists locally, falling back to process.cwd() otherwise — matches the plan's explicit 'same machine/checkout' promotion scope"
  - "verify-cold-replay.mjs's FAIL reason string detects and calls out a [LibraryError] cold response specifically, distinguishing the documented D-07 library-replay limitation from a genuine replay-fidelity regression"

requirements-completed: [CAP-01, CAP-02, CAP-03, CAP-04, CAP-05]

# Metrics
duration: ~55min
completed: 2026-07-02
---

# Phase 1 Plan 5: Capture Capstone — Full-Fidelity Wiring + Cold Self-Replay Summary

**`agda_capture_session` now stages one CaptureArtifact carrying a full-fidelity replay manifest, a real drained action log, and a built oracle substrate in a single call — closing Phase 1 with `scripts/promote-capture.mjs` (CAP-02 write-side) and `scripts/verify-cold-replay.mjs` (ROADMAP success criterion 6, verified PASS/FAIL end-to-end against a real local Agda 2.8.0 binary).**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-02
- **Tasks:** 3/3 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `agda_capture_session`'s callback now calls `drainRecordedActions()` + `resetRecordedActions()` (drain-then-reset) and `buildOracleSubstrate(session, {expectedSignature, beforeSource})` on every capture, replacing Plan 01-01's `recordedActions: []` / `oracleSubstrate: null` placeholders with real data
- Three D-02/D-06-mandated warning diagnostics wired in: recording-disabled (no `AGDA_MCP_CAPTURE=1`), recording-truncated (ring-buffer drops), and no-expected-signature — surfaced via both `envelope.diagnostics` and `CaptureReference.keyDiagnostics`
- `sessionClassification` (D-10 guardrail) verified to survive the extension unchanged — still `session.getLastClassification() ?? null`, still present as a key on every returned reference
- `scripts/promote-capture.mjs`: reads a staged artifact's `dedup.{fingerprint,kind,recurrence}` and writes/updates `<repoRoot>/.agda-mcp/captures/index.json` via plain object-key overwrite (no duplication on re-promote); exits non-zero with a clear stderr message on a missing/unparseable artifact
- `scripts/verify-cold-replay.mjs`: standalone (zero `src/` imports), materializes an artifact's `inlinedFirstPartySources` onto a fresh temp dir, cold-spawns a disposable `agda --interaction-json` subprocess against the materialized file, and compares the cold response's success/failure family against the last load-family `recordedActions` entry's classification — verified against a real local Agda 2.8.0 binary across all four realistic outcomes: PASS (type-error classification, library-free fixture), FAIL-with-documented-hint (library-dependent fixture — the fixture project's `-l test-fixtures` flag cannot resolve cold without AGDA_DIR replay, exactly the D-07-documented limitation), SKIP (no load-family recorded action), and FAIL (nonexistent artifact path)
- Full `npm test` (`RUN_AGDA_INTEGRATION=1`, after `npm run build`) is green: 1537 passed / 5 skipped across 182 test files, zero regressions across all of Plans 01-01..01-05

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire recorded actions and oracle substrate into the capture callback** - `bf95295` (feat)
2. **Task 2: Out-of-band dedup-index promotion script** - `d4d9cae` (feat)
3. (style fixup for Task 1/2 files) - `f367aa7` (style)
4. **Task 3: Cold self-replay verification script (success criterion 6)** - `3308fa8` (feat)

_Task 1's and Task 2's files needed a follow-up `prettier --write` pass (line-wrapping only, no logic change) before Task 3's `prettier --check` was run across all four plan files — folded into a dedicated `style` commit rather than amending the already-created task commits, per this workflow's "always create new commits" rule._

## Files Created/Modified
- `src/tools/register-capture-session.ts` - Extended `inputSchema` with `expectedSignature`/`beforeSource`; callback now drains+resets the CAP-04 recorder, builds the CAP-05 oracle substrate, and assembles up to 3 warning diagnostics before staging the artifact
- `test/unit/tools/register-capture-session.test.ts` - Rewrote the single pre-existing test into two: (1) `AGDA_MCP_CAPTURE` unset + no `expectedSignature` → both warning diagnostics present, `recordedActions: []` staged, `sessionClassification` still a key; (2) `AGDA_MCP_CAPTURE=1` + prior tool calls via the same `registerStructuredTool` boundary → non-empty staged `recordedActions` containing those tool names, no recording-disabled/no-expected-signature warnings
- `scripts/promote-capture.mjs` - `promoteCapture(artifactPath)` (exported for testability) + `scriptMain()` CLI entry; plain `node:fs`/`node:path`, no framework, mirrors `copy-json-assets.mjs`'s script style
- `scripts/verify-cold-replay.mjs` - `verifyColdReplay(artifactPath)` (exported) + `scriptMain()` CLI entry; hand-derives the IOTCM/`Cmd_load` envelope format (documented exception to the src/-only command-builder rule) rather than importing from `src/`

## Decisions Made
- **Idle-on-stdout completion instead of the plan's literal "first Status line" heuristic** — verified empirically (see key-decisions in frontmatter) that the literal instruction is unsound against real Agda protocol behavior. Auto-fixed under deviation Rule 1 (the literally-specified approach produced incorrect PASS/FAIL results — both a successful and a library-error load were mis-classified as "cold verdict: success" under the first-Status-line heuristic, since the first Status line in a successful load arrives well before the real completion, and a library-error load's Error DisplayInfo happened to arrive after the only Status line the naive heuristic would have already stopped on in some runs). Idle-based completion (500ms idle window after the last stdout chunk, 30s hard timeout) is the standard "wait for silence" pattern and correctly captures the DisplayInfo Error kind in all four tested scenarios.
- `promote-capture.mjs` uses plain (non-atomic) `writeFileSync` per the plan's explicit rationale: single-writer, out-of-band, operator-run script, not a concurrent MCP hot path — `writeFileAtomic` stays a `src/` concern.
- `verify-cold-replay.mjs`'s FAIL reason string specifically detects a `[LibraryError]` in the cold response and appends a note distinguishing the documented D-07 scope limitation (third-party libraries are never replayed cold) from a genuine replay-fidelity bug — a Claude's-Discretion UX polish within Task 3's own acceptance criteria (still prints a clear FAIL message, still exits 1), not a scope change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] verify-cold-replay.mjs's completion heuristic replaced (first-Status-line → idle-on-stdout)**
- **Found during:** Task 3, manual end-to-end verification against a real local Agda 2.8.0 binary
- **Issue:** The plan's literal instruction ("collect stdout until a `\"kind\":\"Status\"` line closes the response") does not match real Agda `--interaction-json` behavior. A successful `Cmd_load` emits exactly one, non-terminal `Status` line mid-stream — well before the actual `AllGoalsWarnings`/`InteractionPoints` completion — so stopping there would silently drop the goal-state/error tail of the response and misclassify every load as PASS.
- **Fix:** Replaced the literal line-content check with idle-on-stdout completion (bump a 500ms idle timer on every stdout chunk; a 30s hard timeout guards a genuinely hung process). Verified against 4 real scenarios: a library-free type-error fixture (PASS, cold FAIL matches recorded `type-error`), a library-dependent fixture (documented-limitation FAIL with a `[LibraryError]` hint), a no-load artifact (SKIP), and a nonexistent path (FAIL).
- **Files modified:** `scripts/verify-cold-replay.mjs`
- **Verification:** Manual runs against 4 real staged artifacts, all producing the expected verdict; `grep -c "from \"\\.\\./src\|from \"\\./src\"` confirms zero `src/` imports; nonexistent-path run exits non-zero without a stack trace.
- **Committed in:** `3308fa8` (Task 3 commit — the idle-based design was the initial implementation committed, not a follow-up fix; documented here because it deviates from the plan's literal text)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in a plan-specified heuristic, corrected before commit)
**Impact on plan:** The fix was necessary for `verify-cold-replay.mjs` to produce a truthful PASS/FAIL verdict at all — the literal plan instruction would have made the script report false PASSes universally. No scope creep; the script's inputs/outputs/CLI contract are unchanged from the plan's spec.

## Issues Encountered
- Manual end-to-end testing required registering `agda_load` alongside `agda_capture_session` in a throwaway harness script (not committed) to produce a real staged artifact with a load-family `recordedActions` entry for `verify-cold-replay.mjs` to replay against — the automated test suite's captures never call a real `agda_load`, so this was necessary to close out ROADMAP Phase 1 success criterion 6 as the plan's `<verification>` section requires. The harness script and its staged `.agda-mcp/captures/` output were deleted before the final commit (gitignored, never tracked).
- `prettier --check` flagged Task 1's and Task 2's already-committed files as non-conforming (line-wrapping only) once Task 3's files were checked alongside them — resolved with a dedicated `style` commit (`f367aa7`) rather than amending, per this workflow's commit protocol.

## User Setup Required

None - no external service configuration required. No new dependencies were installed; both scripts use only Node built-ins (`node:fs`, `node:path`, `node:child_process`, `node:os`).

## Next Phase Readiness
- All 5 of CAP-01 through CAP-05 are now fully implemented and observable through one `agda_capture_session` call — Phase 1's requirement set is complete
- All 6 ROADMAP Phase 1 success criteria are satisfied, including the cold-replay proof (criterion 6), verified manually against a real Agda 2.8.0 binary via `scripts/verify-cold-replay.mjs`
- `scripts/promote-capture.mjs` closes CAP-02's write-side; the minimal `fingerprint → {recurrence, kind}` index it maintains is explicitly noted (per D-03) as later superseded by Phase 4's durable flat-file queue (QUEUE-01) — no action needed now
- Phase 2 (oracle triad) can now read a real, populated `OracleSubstrate` (before/after source diff, intended goal type, expected signature) and a real `recordedActions` log from any staged capture, closing the "recorded, never judged" gap Plan 01-04 left open
- Known, documented limitation carried forward (not a blocker): `verify-cold-replay.mjs` cannot replay library-dependent captures cold (D-07 explicitly excludes third-party library replay) — Phase 2's oracle triad will need its own strategy for library-dependent sessions, separate from this manual verification tool's scope
- No blockers for Phase 2

## Self-Check: PASSED

Both created files (`scripts/promote-capture.mjs`, `scripts/verify-cold-replay.mjs`) verified present on disk; all 4 commit hashes (`bf95295`, `d4d9cae`, `f367aa7`, `3308fa8`) verified present in `git log`.

---
*Phase: 01-capture-foundation*
*Completed: 2026-07-02*
