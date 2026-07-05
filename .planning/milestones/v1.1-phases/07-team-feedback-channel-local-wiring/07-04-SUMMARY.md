---
phase: 07-team-feedback-channel-local-wiring
plan: 04
subsystem: infra
tags: [dogfooding, upload-chain, run-report, policyKey, node:child_process, vitest, tdd]

# Dependency graph
requires:
  - phase: 07-team-feedback-channel-local-wiring (plan 02)
    provides: "scripts/dogfood/upload-run.mjs's fail-open CLI contract (TEAM-02) — `npx tsx upload-run.mjs <run-id>` always exits 0 — that this plan's chainUploadRun spawns; also scripts/dogfood/agent-log-selection.mjs (unused directly by this plan, already wired inside upload-run.mjs)"
  - phase: 06-backlog-digestion (POLICY-01)
    provides: "resolveWrapupPolicyKey's dedup-and-array-from-Set corpus-resolution idiom, reused verbatim for taskManifestCorpora"
provides:
  - "run-report.json's additive taskManifestCorpora: string[] field, populated by dogfood-run.mjs from the task manifest's distinct corpus values (defaults to [] for backward compatibility)"
  - "dogfood-wrapup.mjs's exported chainUploadRun(runId, options) — D-12's unconditional upload-chain tail step, wired into scriptMain strictly after the judging-error exit-code branch"
affects: [07-05 (unattended judge — can now resolve a bundle's policyKey from taskManifestCorpora without a human typing --policy), E2E-01 (live CHG full-loop acceptance run depends on this wiring to actually invoke the upload step)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-12 unconditional tail step: joined with ';' semantics (always runs), never '&&' — implemented as an unconditional call placed textually after the prior exit-code branch, wrapped in its own log-only try/catch, and never reading the callee's return value to set process.exitCode"
    - "Sibling-relative CLI script resolution via fileURLToPath(new URL('./sibling.mjs', import.meta.url)) instead of a SERVER_REPO_ROOT-based join, for spawning one scripts/dogfood/*.mjs CLI from another regardless of cwd"

key-files:
  created:
    - test/unit/tools/dogfood-wrapup-upload-chain.test.ts
  modified:
    - scripts/dogfood/transcript-writer.mjs
    - scripts/dogfood/dogfood-run.mjs
    - scripts/dogfood/dogfood-wrapup.mjs
    - test/unit/tools/dogfood-transcript-writer.test.ts

key-decisions:
  - "Fixed the plan's literal sibling-path snippet (\"./upload-run.js\") to the real file name (\"./upload-run.mjs\") — verified live that the .js variant hard-fails module resolution, which would have made the whole upload chain silently never fire in production (Rule 1 auto-fix, see Deviations)"
  - "chainUploadRun relies on native Promise settle-once semantics (no manual 'settled' boolean) to handle the case where a failed spawn triggers both an async 'error' event and a 'close' event — the second settle attempt is a no-op by language guarantee, matching this codebase's simplest-correct-idiom preference"

patterns-established:
  - "Pattern 4 (ARCHITECTURE.md): additive schemaVersion-stable fields on run-report.json, threaded through one extra getReport() parameter with a safe default"

requirements-completed: [TEAM-02, TEAM-04]

# Metrics
duration: ~10min
completed: 2026-07-04
---

# Phase 7 Plan 4: Dogfood Pipeline Upload-Chain Wiring Summary

**run-report.json now records taskManifestCorpora (fed by dogfood-run.mjs's already-loaded task manifest), and dogfood-wrapup.mjs unconditionally chains upload-run.mjs via a fail-open spawn, proven never to touch its own judging-error exit code.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-04T06:41:00Z
- **Completed:** 2026-07-04T06:51:06Z
- **Tasks:** 2 completed
- **Files modified:** 5 (4 modified, 1 created)

## Accomplishments

- `getReport()` in `scripts/dogfood/transcript-writer.mjs` gains an additive `taskManifestCorpora` field (defaults to `[]`), and `scripts/dogfood/dogfood-run.mjs` now captures `loadTaskManifest`'s return value and threads the distinct `corpus` values into it — reusing `resolveWrapupPolicyKey`'s exact dedup idiom rather than reinventing it. Full backward compatibility proven: all three pre-existing `getReport()` call sites in the test suite pass unmodified.
- `scripts/dogfood/dogfood-wrapup.mjs` exports `chainUploadRun(runId, options)`, D-12's unconditional upload-chain tail step: it spawns `npx tsx <sibling upload-run.mjs> <runId>` (never `execFileSync` — the upload can be slow), resolves `{attempted:true}` on any close regardless of the child's own exit code, and never throws (a spawn failure resolves `{attempted:false, reason:"spawn-failed"}` after logging to stderr).
- `scriptMain`'s tail calls `chainUploadRun` unconditionally, strictly after the existing `summary.errors > 0` exit-code branch, wrapped in its own log-only `try`/`catch` — proven by a dedicated pair of tests that `process.exitCode` is neither cleared (when already `1`) nor set (when unset) by the chain step, in both the success and spawn-failure paths.
- Verified the real (non-mocked) end-to-end wiring: invoked `chainUploadRun` directly via `tsx` with no upload key configured, and confirmed it spawned the real `upload-run.mjs` CLI, which hit its own TEAM-01 no-key gate and exited cleanly — `chainUploadRun` correctly reported `{attempted:true}`.

## Task Commits

Each task was committed atomically:

1. **Task 1: taskManifestCorpora — additive run-report.json field** - `8131a7a` (feat)
2. **Task 2: chainUploadRun — D-12 unconditional upload-chain tail step** - `db15b51` (test, RED) → `8da3cfd` (feat, GREEN)

**Plan metadata:** (this commit, docs: complete plan)

_Task 2 is `tdd="true"`: RED (`db15b51`, 10/10 failing — `chainUploadRun is not a function`) then GREEN (`8da3cfd`, 10/10 passing). No REFACTOR commit was needed — the implementation matched the test contract on the first GREEN pass._

## Files Created/Modified

- `scripts/dogfood/transcript-writer.mjs` - `getReport()` destructures and returns an additive `taskManifestCorpora = []` field
- `scripts/dogfood/dogfood-run.mjs` - captures `loadTaskManifest`'s return value; `finalize()` derives distinct corpus values and passes them to `getReport()`
- `scripts/dogfood/dogfood-wrapup.mjs` - imports `spawn`/`fileURLToPath`; exports `chainUploadRun`; `scriptMain`'s tail calls it unconditionally after the exit-code branch
- `test/unit/tools/dogfood-transcript-writer.test.ts` - two new tests for `taskManifestCorpora`'s default and passthrough behavior
- `test/unit/tools/dogfood-wrapup-upload-chain.test.ts` (new) - 10 DI-driven tests covering `chainUploadRun`'s spawn contract, never-throws behavior, the `process.exitCode` invariants, and two source-text checks (call ordering, `spawn` vs `execFileSync`)

## Decisions Made

- Reused `resolveWrapupPolicyKey`'s `[...new Set(manifest.map((entry) => entry.corpus))]` idiom verbatim for `taskManifestCorpora`, rather than introducing a second dedup helper — matches this plan's own instruction and the codebase's "one idiom per shape" convention.
- `chainUploadRun` is implemented as a single `async function` with one `try`/`await`/`catch` wrapping both the synchronous spawn call and the child's asynchronous `error`/`close` events, rather than a hand-rolled `new Promise` with a manual `settled` guard — native Promise settle-once semantics already make a second `resolve`/`reject` (e.g. if a failed spawn somehow emits both `error` and `close`) a harmless no-op, so the extra guard would have been redundant defensive code.
- `stdio: ["ignore", "inherit", "inherit"]` on the spawned `upload-run.mjs` child (per plan) — its own diagnostic output surfaces directly on `dogfood-wrapup.mjs`'s console rather than being captured/suppressed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected chainUploadRun's sibling-path resolution from "./upload-run.js" to "./upload-run.mjs"**
- **Found during:** Task 2 (chainUploadRun implementation)
- **Issue:** The plan's `<action>` text specified resolving the sibling path via `fileURLToPath(new URL("./upload-run.js", import.meta.url))`, but the real file created in wave 1 is `scripts/dogfood/upload-run.mjs` (confirmed by reading it directly — no `upload-run.js` exists anywhere in the repo). A `new URL(...)` sibling resolution is plain string/URL construction, not Node module-resolution extension-mapping (unlike the `.js`-suffixed *import specifier* convention this codebase uses elsewhere for importing `.ts` siblings) — so following the plan literally would have produced a path to a file that does not exist on disk.
- **Verification of the bug:** Ran `npx tsx <repo>/scripts/dogfood/upload-run.js --retry-only` directly — confirmed `ERR_MODULE_NOT_FOUND`. Ran the same command with the correct `.mjs` extension — confirmed it succeeds (`upload-run: retry-only flush complete...`).
- **Impact if left as specified:** `chainUploadRun`'s own fail-open contract (`{attempted:false, reason:"spawn-failed"}` on any spawn error, logged to stderr only) would have silently swallowed this as an ordinary "spawn failed" case on every real invocation — the upload chain would never actually run in production, directly contradicting this plan's own must-have truth ("Running dogfood-wrapup.mjs with AGDA_MCP_TEAM_UPLOAD_KEY/URL set automatically invokes upload-run.mjs..."). The bug would not have surfaced from unit tests alone, since every test injects a mocked `deps.spawn`.
- **Fix:** Used `"./upload-run.mjs"` instead of `"./upload-run.js"` in the `new URL(...)` call.
- **Files modified:** `scripts/dogfood/dogfood-wrapup.mjs`
- **Verification:** All 10 tests in `dogfood-wrapup-upload-chain.test.ts` pass; additionally ran a real (non-mocked) end-to-end smoke invocation via `tsx` that confirmed `chainUploadRun` successfully spawns the real `upload-run.mjs` CLI end to end.
- **Committed in:** `8da3cfd` (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Narrowed an overly broad test assertion in dogfood-wrapup-upload-chain.test.ts**
- **Found during:** Task 2, first GREEN test run
- **Issue:** My own first draft of the "spawn not execFileSync" source-text test used `expect(source).not.toMatch(/execFileSync/)` against the WHOLE file — this incorrectly failed because `chainUploadRun`'s own JSDoc comment explains "`spawn` (never `execFileSync`) because..." (an idiomatic "we use X not Y, here's why" comment style already established throughout this codebase's docblocks).
- **Fix:** Narrowed the assertion to the actual `import { ... } from "node:child_process"` specifier list only, so legitimate prose mentioning `execFileSync` as contrast is unaffected.
- **Files modified:** `test/unit/tools/dogfood-wrapup-upload-chain.test.ts`
- **Verification:** All 10 tests pass after the narrowing.
- **Committed in:** `8da3cfd` (part of the Task 2 GREEN commit — caught and fixed before the commit, not a separate follow-up)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs caught and fixed before committing, not scope creep)
**Impact on plan:** Both fixes were necessary for the plan's own must-have truths to actually hold in production; zero scope creep — no files outside the plan's declared `files_modified` list were touched.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. (`AGDA_MCP_TEAM_UPLOAD_KEY`/`AGDA_MCP_TEAM_UPLOAD_URL` remain the operator's own future setup step for actually enabling network uploads — TEAM-01/TEAM-02's existing no-key gate is untouched by this plan.)

## Next Phase Readiness

- `run-report.json`'s `taskManifestCorpora` field is ready for 07-05 (unattended judge) to consume for `policyKey` resolution on uploaded bundles, without needing a human to type `--policy`.
- `dogfood-wrapup.mjs` now unconditionally attempts the upload chain, closing one of the two remaining plumbing gaps E2E-01 (live CHG full-loop acceptance) depends on — the ingest endpoint (07-03, in-flight in parallel) is the other.
- No blockers. This plan's scope (`scripts/dogfood/transcript-writer.mjs`, `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`, and their two test files) stayed fully isolated from the sibling 07-03 executor's files (`scripts/team/ingest-server.mjs` and its test) — zero overlap, confirmed via `git status` before every commit.

---
*Phase: 07-team-feedback-channel-local-wiring*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`scripts/dogfood/transcript-writer.mjs`, `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`, `test/unit/tools/dogfood-transcript-writer.test.ts`, `test/unit/tools/dogfood-wrapup-upload-chain.test.ts`, this SUMMARY.md). All three task commit hashes (`8131a7a`, `db15b51`, `8da3cfd`) confirmed present in `git log`.
