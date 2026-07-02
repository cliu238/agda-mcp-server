---
phase: 01-capture-foundation
plan: 02
subsystem: capture
tags: [session-capture, sha256, import-graph, replay-manifest, vitest]

# Dependency graph
requires:
  - phase: 01-capture-foundation/01-01
    provides: "artifact-types.ts's ReplayManifest contract + buildReplayManifest(session) skeleton with explicit Plan-01-01 placeholders (mergedArgv/agdaDirContents/buildMode/importClosureHash/inlinedFirstPartySources)"
provides:
  - "session.lastDispatchedLoadArgv — pre-dedup, ordered load-flag snapshot populated on every session.load()"
  - "buildReplayManifest(session) — all five CAP-01 fidelity fields now real (no more placeholders)"
  - "src/agda/session-capture/import-closure-hash.ts — hashImportClosure() / inlineFirstPartySources(), reusing buildImportGraph()/computeImpact() for a shared closure-file-set walk"
affects: ["01-03", "01-04", "01-05", "02-oracle-triad"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared closure-file-set walker (closureFileSet()) factored once, consumed by both hashImportClosure() and inlineFirstPartySources() — no second file-graph traversal"
    - "Different failure modes for hash vs replay-critical content: hashImportClosure hashes a placeholder marker for oversized files (only the digest is affected); inlineFirstPartySources excludes oversized files outright and lists them in `skipped` (never fabricates replay content)"
    - "Pre-dedup capture field lives parallel to (never replaces) the existing deduped mergeCommandLineOptions() call — session.lastDispatchedLoadArgv is a read-only side-channel for the capture manifest, not a behavior change to Cmd_load itself"

key-files:
  created:
    - src/agda/session-capture/import-closure-hash.ts
    - test/unit/agda/session-capture/import-closure-hash.test.ts
  modified:
    - src/agda/session.ts
    - src/agda/session-capture/manifest-builder.ts
    - test/unit/agda/session-capture/manifest-builder.test.ts

key-decisions:
  - "lastDispatchedLoadArgv is captured pre-dedup inside session.load(), immediately after loadProjectConfig() and before mergeCommandLineOptions() — the field never influences what actually reaches Cmd_load, it only feeds the capture manifest (CAP-01/D-04: server-stamped from the live session, never re-derived)"
  - "detectBuildFreshness() uses a 5-minute staleness heuristic on the conventional `_build` dir's newest file mtime (Open-Question-3 recommendation) since no reliable 'session start' timestamp exists to compare against; falls back to 'unknown' on any filesystem error rather than throwing"
  - "hashImportClosure and inlineFirstPartySources both reuse one shared closureFileSet() helper over buildImportGraph()/computeImpact() — since that walker only ever traverses files already under projectRoot, every returned file is inherently first-party, satisfying D-07's 'never inline library source' constraint for free"

requirements-completed: [CAP-01]

# Metrics
duration: ~30min
completed: 2026-07-01
---

# Phase 1 Plan 2: Replay Manifest Fidelity Summary

**All five CAP-01 replay-manifest fields (mergedArgv, agdaDirContents, buildMode, importClosureHash, inlinedFirstPartySources) are now real — a captured session can be replayed on a second machine without the original checkout.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-01
- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `session.lastDispatchedLoadArgv` captures the true, pre-dedup, ordered Cmd_load flag list (project flags → env flags → per-call flags, duplicates preserved) on every `load()` — verified against a real Agda process that duplicate flags survive undeduped, while the actual Cmd_load argv is still correctly deduplicated by the unchanged `mergeCommandLineOptions()` path
- `buildReplayManifest().mergedArgv` now reads spawn-time `-l` library flags (`session.libraryRegistration.agdaArgs`) followed by `lastDispatchedLoadArgv`, in order — zero calls to `mergeCommandLineOptions` anywhere in `session-capture/` (Pitfall 2 guard verified by grep)
- `agdaDirContents`/`buildMode` read the live session's already-realized `AGDA_DIR` and classify `_build` cache freshness via an mtime heuristic — zero calls to `createLibraryRegistration` anywhere in `session-capture/` (never mints a second, divergent temp dir)
- New `import-closure-hash.ts` module: `hashImportClosure()` (deterministic, content-sensitive, portable, size-capped sha256 over the loaded file's full transitive import closure) and `inlineFirstPartySources()` (full text of every first-party closure file, with oversized files excluded — never truncated or faked — and listed separately in `skipped`), both built on one shared `closureFileSet()` walk over the existing `buildImportGraph()`/`computeImpact()`
- Full `npm test` run (after `npm run build`, required for the MCP e2e harness tests that spawn `dist/index.js`) shows 1367 passed / 158 skipped across 168 test files with zero regressions; the new `test/unit/agda/session-capture/{manifest-builder,import-closure-hash}.test.ts` suites pass both without a local Agda binary (RUN_AGDA_INTEGRATION unset — real-load assertions skip cleanly) and with `RUN_AGDA_INTEGRATION=1` against a real Agda 2.8.0 install (17/17 passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture the pre-dedup ordered argv (duplicates preserved)** - `0124faf` (feat)
2. **Task 2: Read the realized AGDA_DIR contents and detect build freshness** - `bcd51cf` (feat)
3. **Task 3: Content-hash and inline the transitive import closure (D-07)** - RED `752eb1d` (test) → GREEN `54d758a` (feat)

## Files Created/Modified
- `src/agda/session.ts` - Added `lastDispatchedLoadArgv: string[]` field (same non-private, sibling-helper-mutated convention as `lastLoadedMtime`/`lastClassification`); `load()` now snapshots the undeduped argv before calling `mergeCommandLineOptions`
- `src/agda/session-capture/manifest-builder.ts` - `buildReplayManifest()`'s `mergedArgv`/`agdaDirContents`/`buildMode`/`importClosureHash`/`inlinedFirstPartySources` are all real now; added private `readRealizedAgdaDir()`, `newestMtimeMs()`, `detectBuildFreshness()` helpers (173 lines total, well under the 500-line ceiling)
- `src/agda/session-capture/import-closure-hash.ts` - New module: `closureFileSet()` (shared private walker), `hashImportClosure()`, `inlineFirstPartySources()` (152 lines)
- `test/unit/agda/session-capture/manifest-builder.test.ts` - Extended with RUN_AGDA_INTEGRATION-gated coverage of Task 1 (duplicate-flag preservation via a real load), unconditional coverage of Task 2 (temp-dir AGDA_DIR reads, `_build` freshness fresh/shared), and RUN_AGDA_INTEGRATION-gated coverage of Task 3's manifest wiring
- `test/unit/agda/session-capture/import-closure-hash.test.ts` - New suite covering all 6 planned behaviors: determinism, content-sensitivity, closure-of-one (zero imports), cross-directory portability, full-closure completeness, and oversized-file exclusion

## Decisions Made
- `lastDispatchedLoadArgv` is a read-only side-channel for the capture manifest — it does not touch what `session.load()` actually sends to `Cmd_load`; the existing (deduping) `mergeCommandLineOptions()` call is untouched
- `detectBuildFreshness()`'s 5-minute staleness window is a heuristic, not a guarantee — documented in-code as the Open-Question-3 recommendation, with an explicit "unknown" fallback on any filesystem error so a permission race never masquerades as "fresh" or "shared"
- Chose to hash an oversized-file *placeholder marker* in `hashImportClosure` (only the digest is affected — still deterministic and meaningful for drift detection) but *exclude* oversized files entirely from `inlineFirstPartySources` (a fabricated or truncated inlined source would silently corrupt a cold-replay, which is strictly worse than an honest gap)

## Deviations from Plan

None - plan executed exactly as written. All five manifest fields, the `lastDispatchedLoadArgv` field, and the new `import-closure-hash.ts` module match the plan's `<action>` specifications; the TDD gate sequence (RED `752eb1d` → GREEN `54d758a`) was followed for Task 3 as directed by `tdd="true"`.

## Issues Encountered
- The worktree's fresh `npm ci` (Node 24 via `mise exec node@24 --`) left no `dist/` build output, which caused 4 unrelated MCP end-to-end tests (`test/integration/mcp/mcp-server.test.ts`, `test/integration/mcp/mcp-remaining-tools-e2e.test.ts`) to fail with "Connection closed" — those tests spawn `dist/index.js` directly. Running `npm run build` once resolved this; re-running the full suite afterward showed 1367/1525 passing with zero regressions. No repo files were changed to work around this — `dist/` is gitignored build output, not committed.

## User Setup Required

None - no external service configuration required. No new dependencies were installed; `import-closure-hash.ts` uses only `node:crypto`, `node:fs`, `node:path`, and the pre-existing `buildImportGraph`/`computeImpact` (`src/agda/import-graph.ts`) and `MAX_AGDA_SOURCE_BYTES` (`src/session/safe-source-io.ts`).

## Next Phase Readiness
- CAP-01's replay-manifest fidelity requirement is now fully satisfied: every `ReplayManifest` field `buildReplayManifest()` emits is server-stamped from the live singleton `AgdaSession`, never caller-supplied, never re-derived from a second `createLibraryRegistration()`/`mergeCommandLineOptions()` call
- A captured artifact now carries everything a Phase-2 oracle needs to pin to an exact, reproducible environment: the true argv (with order-significant duplicates intact), the realized `AGDA_DIR` contents, a build-freshness classification, a content hash over the full transitive import closure, and the full first-party source text needed to replay on a second machine without the original checkout
- `agda_capture_session`'s `recordedActions: []` and `oracleSubstrate: null` fields remain untouched — those are 01-03/01-04/01-05's scope, not this plan's
- No blockers for 01-03

## Self-Check: PASSED

All 2 created files verified present on disk; all 4 task commit hashes (`0124faf`, `bcd51cf`, `752eb1d`, `54d758a`) verified present in `git log`.

---
*Phase: 01-capture-foundation*
*Completed: 2026-07-01*
