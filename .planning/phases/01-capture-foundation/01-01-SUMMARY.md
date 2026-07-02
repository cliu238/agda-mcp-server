---
phase: 01-capture-foundation
plan: 01
subsystem: capture
tags: [mcp-tool, zod, session-capture, dedup, sha256-fingerprint, vitest]

# Dependency graph
requires: []
provides:
  - "src/agda/session-capture/artifact-types.ts — full Phase-1 type contract (ReplayManifest, RecordedAction, OracleSubstrate, DedupRouting, CaptureArtifact, CaptureReference)"
  - "src/agda/session-capture/manifest-builder.ts — buildReplayManifest(session) minimal server-stamped manifest"
  - "src/agda/session-capture/dedup-index.ts — readDedupIndex()/routeDedup() CAP-02 fingerprint routing"
  - "src/tools/register-capture-session.ts — the agda_capture_session MCP tool, wired into reporting-tools.ts"
affects: ["01-02", "01-03", "01-04", "01-05", "02-oracle-triad"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Barrel + focused siblings under 500 lines (session-capture.ts barrel re-exports manifest-builder/dedup-index/artifact-types)"
    - "Free-function-over-shared-state: buildReplayManifest(session) takes the live AgdaSession as first arg, never constructs a second session"
    - "Emit-only tool that stages a heavy artifact out-of-repo and returns a lightweight reference in ToolResult.data (D-09/P2)"

key-files:
  created:
    - src/agda/session-capture/artifact-types.ts
    - src/agda/session-capture/manifest-builder.ts
    - src/agda/session-capture/dedup-index.ts
    - src/agda/session-capture/session-capture.ts
    - src/tools/register-capture-session.ts
    - test/unit/tools/register-capture-session.test.ts
    - test/unit/agda/session-capture/manifest-builder.test.ts
    - test/unit/agda/session-capture/dedup-index.test.ts
  modified:
    - src/tools/reporting-tools.ts
    - test/fixtures/e2e/mcp-tool-coverage.json
    - .gitignore

key-decisions:
  - "sessionClassification is captured via session.getLastClassification() ?? null and threaded verbatim into both the CaptureReference field AND the summary string, per D-10's guardrail against compressing away the verdict"
  - "Dedup fingerprint reuses fingerprintBugReport() verbatim from bug-report.ts, keyed on kind/affectedTool/classification/observed/expected — no new hash invented (CAP-02)"
  - "readDedupIndex wraps JSON.parse in try/catch and downgrades any malformed index.json to an empty Map rather than throwing (T-01-02)"

patterns-established:
  - "Session-capture model files take AgdaSession as their first argument (never re-instantiate) — the pattern later 01-02..01-05 plans must follow when extending manifest-builder.ts / dedup-index.ts"

requirements-completed: [CAP-01, CAP-02, CAP-03]

# Metrics
duration: ~25min
completed: 2026-07-01
---

# Phase 1 Plan 1: Capture Walking Skeleton Summary

**`agda_capture_session` MCP tool: state-agnostic emit-only capture verb that stages a full `CaptureArtifact` under gitignored `.agda-mcp/captures/` and returns a lightweight `CaptureReference` (fingerprint/kind/recurrence/sessionClassification) via sha256 dedup routing reused verbatim from `bug-report.ts`.**

## Performance

- **Duration:** ~25 min (environment setup — installing Node 24 via mise and `npm ci` since the sandbox defaulted to Node 22 — accounted for a meaningful share of this)
- **Completed:** 2026-07-01
- **Tasks:** 3/3 completed
- **Files modified:** 11 (8 created, 3 modified)

## Accomplishments
- Full Phase-1 `CaptureArtifact` type contract defined in `artifact-types.ts` (6 exported interfaces, no logic) — every later Phase-1 plan (01-02..01-05) now has a fixed shape to fill in without re-touching this file
- `agda_capture_session` registered as a real MCP tool: state-agnostic (works with zero prior `AgdaSession` interaction), never writes into the tracked repo tree, and returns a reference — not the full artifact — per D-09/P2
- CAP-02 dedup routing fully implemented and read-only in this plan: first capture of a fingerprint routes `new-bug`/recurrence 1, a repeat routes `update`/recurrence N+1
- D-10 guardrail honored end-to-end: `sessionClassification` (the underlying session's load/typecheck verdict, or `null` pre-load) is threaded into the returned `CaptureReference` field and into the human-readable `summary` string, never omitted or compressed away
- All 4 cross-cutting tool-manifest tests (`mcp-e2e-coverage`, `no-dead-tool-references`, `output-schema-invariants`, plus the new capture test) pass, and a full `npm test` run shows 1358 passed / 155 skipped (skips are `requiresLiveAgda` integration tests — no local Agda binary in this sandbox) with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the full CaptureArtifact contract and write the failing capture-tool test** - `9807f89` (test)
2. **Task 2: Build the minimal manifest builder and read-only dedup index** - `eba2f18` (feat)
3. **Task 3: Wire the emit-only tool, stage artifacts, make the capture-tool test GREEN** - `9cc2202` (feat)

_Task 1 established RED (module-not-found on the not-yet-existing tool); Task 3 turned it GREEN — Task 2's manifest/dedup unit tests were authored and passing within the same commit as their implementation._

## Files Created/Modified
- `src/agda/session-capture/artifact-types.ts` - 6 exported interfaces: ReplayManifest, RecordedAction, OracleSubstrate, DedupRouting, CaptureArtifact, CaptureReference
- `src/agda/session-capture/manifest-builder.ts` - `buildReplayManifest(session)`: server-stamped fields (agdaVersion, agdaBinaryPath, serverVersion, node, os, cwd, repoRoot) + explicit 01-02 placeholders (mergedArgv=[], agdaDirContents=null, buildMode="unknown", importClosureHash=null, inlinedFirstPartySources=[])
- `src/agda/session-capture/dedup-index.ts` - `readDedupIndex(repoRoot)` (guarded existsSync+readFileSync+try/catch, never throws) and `routeDedup(index, fingerprint)`; re-exports `fingerprintBugReport` verbatim
- `src/agda/session-capture/session-capture.ts` - barrel re-exporting the above plus every `artifact-types.ts` type; no new logic
- `src/tools/register-capture-session.ts` - `registerCaptureSession(server, session, repoRoot)`: assembles the `CaptureArtifact`, stages it via `writeFileAtomic` under `<repoRoot>/.agda-mcp/captures/<fingerprint>-<recurrence>.json`, returns an `okEnvelope` with the `CaptureReference` in `data` (classification `"captured"`), and an `errorEnvelope` (`"tool-error"`) on any thrown error
- `src/tools/reporting-tools.ts` - wired `registerCaptureSession(server, session, _repoRoot)` into `register()`
- `test/fixtures/e2e/mcp-tool-coverage.json` - added the `agda_capture_session` coverage-matrix entry
- `.gitignore` - added `.agda-mcp/` under a new "Captured session artifacts (emit-only, out-of-repo)" comment
- `test/unit/tools/register-capture-session.test.ts`, `test/unit/agda/session-capture/manifest-builder.test.ts`, `test/unit/agda/session-capture/dedup-index.test.ts` - new unit test suites

## Decisions Made
- `sessionClassification` is captured via `session.getLastClassification() ?? null` and threaded into both `data.sessionClassification` and the `summary` string (`"<kind> capture <fingerprint> (session: <classification ?? 'no-load'>)"`) — satisfies D-10's explicit requirement that the verdict never be omitted, only null-valued
- Dedup fingerprint computed via `fingerprintBugReport({ kind: "new-bug", affectedTool: "agda_capture_session", classification: sessionClassification ?? "unknown", observed: note ?? "session capture", expected: "", reproduction: [], serverVersion })`, per the plan's exact spec — no invented hash
- `readDedupIndex` treats any malformed `index.json` (non-object JSON, non-array entries, wrong-typed `recurrence`/`kind`) as an empty Map rather than throwing, satisfying threat T-01-02 (never leak a stack trace to the tool caller)

## Deviations from Plan

None - plan executed exactly as written. Both `writeFileAtomic` (from `safe-source-io.ts`) and `fingerprintBugReport` (from `bug-report.ts`) were reused verbatim as specified in `<interfaces>`.

## Issues Encountered
- The sandbox's default Node (v22.22.0, via mise) does not satisfy `package.json`'s `engines: >= 24` / `.npmrc`'s `engine-strict=true`, so `npm ci` failed with `EBADENGINE` on the first attempt. Resolved by resolving Node 24.16.0 via `mise exec node@24.16.0 -- npm ci` / `... -- npx vitest run ...` for every subsequent command — no repo files were changed to work around this (a stray `.mise.toml` written by an initial `mise use` was deleted before staging any commit, keeping the worktree clean).

## User Setup Required

None - no external service configuration required. No new dependencies were installed; the tool uses only existing project dependencies (`zod`, Node built-ins) and the pre-existing `fingerprintBugReport`/`writeFileAtomic` helpers.

## Next Phase Readiness
- `artifact-types.ts`'s full interface contract is now the fixed substrate for 01-02 (merged argv, AGDA_DIR contents, build mode, import-closure hash, first-party source inlining), 01-03/01-05 (RecordedAction / action log), and 01-04/01-05 (OracleSubstrate) — those plans fill fields in without re-touching this file
- `agda_capture_session` is reachable from any session state today, but every field beyond the manifest's server-derived core is still an explicit placeholder (`mergedArgv: []`, `agdaDirContents: null`, `buildMode: "unknown"`, `importClosureHash: null`, `inlinedFirstPartySources: []`, `recordedActions: []`, `oracleSubstrate: null`) — cold self-replay (roadmap success criterion 6) is not yet achievable until 01-02 fills in the manifest fidelity fields
- No blockers for 01-02

## Self-Check: PASSED

All 8 created files verified present on disk; all 4 task/metadata commit hashes (`9807f89`, `eba2f18`, `9cc2202`, `ae866d6`) verified present in `git log`.

---
*Phase: 01-capture-foundation*
*Completed: 2026-07-01*
