---
phase: 09-residual-v1-0-debt-sweep
plan: 05
subsystem: tooling
tags: [dogfood-cli, argv-validation, symlink-safety, path-traversal, vitest]

# Dependency graph
requires: []
provides:
  - "IN-01: dogfood-run.mjs's parseDogfoodArgv and dogfood-wrapup.mjs's parseWrapupArgv now export themselves and reject a flag-shaped or path-traversing run-id value before it is ever joined into a filesystem path"
  - "IN-02: install-dogfood-skill.mjs never reports success for a dangling symlink (existence check on the canonical Skill directory before both symlinkSync call sites) and its scriptMain never crashes with a raw stack trace"
  - "IN-04: dogfood-install-skill.test.ts's gitignore test now asserts the precise `git check-ignore` exit status (1), distinguishing \"not ignored\" from a genuine git failure (128)"
  - "IN-05: dogfood-wrapup.mjs's per-capture judging loop hoists a safe stagedPath so a corrupt/null stagedCaptures entry can no longer throw a second time inside its own catch handler and abort the whole wrap-up run"
  - "Phase-wide zero remaining scripts/promote-capture.mjs references (09-01's cross-plan deletion handoff closed)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hoisted, optional-chain-computed loop variable so a per-iteration try/catch handler stays resilient to a null/malformed loop element instead of re-dereferencing the raw element inside the catch block too (IN-05's stagedPath pattern)"
    - "Existence-check-before-mutation guard for idempotent symlink installers — check the link TARGET exists before every symlinkSync call site, not just once at the top (IN-02)"
    - "vi.mock with importOriginal for partial node:child_process spawn interception, used only when a script's real CLI entrypoint has no DI seam of its own — mirrors test/unit/agda/spawn-error-listener.test.ts's sole prior precedent in this codebase"

key-files:
  created:
    - test/unit/tools/dogfood-wrapup-argv-parsing.test.ts
    - test/unit/tools/dogfood-wrapup-corrupt-capture-entry.test.ts
  modified:
    - scripts/dogfood/dogfood-run.mjs
    - scripts/dogfood/dogfood-wrapup.mjs
    - scripts/dogfood/install-dogfood-skill.mjs
    - test/unit/tools/dogfood-run-spawn-options.test.ts
    - test/unit/tools/dogfood-install-skill.test.ts

key-decisions:
  - "IN-02's existence check is duplicated at BOTH symlinkSync call sites (\"created\" and \"relinked\" branches) rather than hoisted once above the branch logic, per the plan's literal scope — a single hoisted check would also change the already-correct \"already-linked\"/\"skipped-existing-non-symlink\" branches' behavior, which is out of this finding's stated scope"
  - "dogfood-wrapup-corrupt-capture-entry.test.ts drives the REAL scriptMain end to end (the buggy loop lives there, not in any DI-testable helper) against a deliberately VACUOUS second capture artifact (empty recordedActions, no oracleSubstrate) so the real runOracle/judgeOrcl02 pipeline abstains fast on every predicate with zero Agda subprocess cost, instead of mocking the oracle modules outright"
  - "node:child_process's spawn is partially mocked (importOriginal, only spawn overridden) in that same test so scriptMain's own unconditional D-12 upload-chain tail step never spawns a real npx tsx subprocess — narrower and more precedented than adding a new deps parameter to scriptMain purely for testability"

requirements-completed: [DEBT-04]

# Metrics
duration: ~19min
completed: 2026-07-04
---

# Phase 9 Plan 05: DEBT-04 Dogfood CLI Hardening (IN-01/IN-02/IN-04/IN-05) Summary

**Hardened both dogfood CLI argv parsers against flag-shaped/path-traversing run-ids, closed install-dogfood-skill.mjs's dangling-symlink false-success gap, tightened its gitignore test's exit-status assertion, and hoisted a safe stagedPath so a corrupt wrap-up entry can no longer abort the whole judging run.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-07-04T15:59:26-04:00 (worktree base reset)
- **Completed:** 2026-07-04T16:18:00-04:00 (approx.)
- **Tasks:** 2
- **Files modified:** 7 (5 modified, 2 created)

## Accomplishments
- **IN-01:** `parseDogfoodArgv` (dogfood-run.mjs) and `parseWrapupArgv` (dogfood-wrapup.mjs) are now exported and both throw a descriptive `Error` when the resolved run-id starts with `"--"`, contains `/` or `\`, or equals `"."`/`".."` — closing the gap where a missing `--run-id` value silently swallowed the next flag token, or a crafted run-id could traverse outside `.agda-mcp/runs/`. `dogfood-run.mjs`'s `scriptMain` now wraps the parse call in a try/catch mirroring `dogfood-wrapup.mjs`'s pre-existing shape.
- **IN-02:** `installDogfoodSkill` now checks the canonical `.agents/skills/agda-dogfooding` directory exists immediately before each of its two `symlinkSync` call sites ("created" and "relinked" branches), throwing instead of silently creating/relinking to a dangling target on a partial checkout. `scriptMain`'s body is wrapped in try/catch so any thrown error becomes a one-line stderr message + `process.exitCode = 1`.
- **IN-04:** `dogfood-install-skill.test.ts`'s "SKILL.md is not gitignored" test now catches the `execFileSync` error and asserts `.status === 1` (git's "not ignored" exit code) instead of a bare `.toThrow()`, which previously also passed on a genuine git failure (exit 128) for the wrong reason.
- **IN-05:** `dogfood-wrapup.mjs`'s per-capture judging loop now computes `const stagedPath = typeof staged?.stagedPath === "string" ? staged.stagedPath : String(staged?.stagedPath);` once, immediately inside the loop, and uses that local everywhere (both the try and catch blocks) instead of re-reading `staged.stagedPath` a second time inside the catch handler — the pre-fix code threw a second, unhandled TypeError on a `null` `staged` element, escaping the loop entirely with no `wrapup-report.json` written and every remaining capture left unjudged.
- Cross-plan handoff from 09-01 closed: the two stale `scripts/promote-capture.mjs` comment references in `install-dogfood-skill.mjs` (describing the file 09-01 deleted, in present tense) are rephrased to describe the behavior inline. `grep -rn "promote-capture\.mjs" scripts/` now returns zero matches phase-wide.
- 12 new regression tests added across 4 test files (6 for IN-01, 2 for IN-02, 1 tightened for IN-04, 1 new end-to-end test for IN-05, plus one no-run-id-at-all guard test). Full `npm test` (build + vitest run) is green: 216 test files passed / 16 skipped, 1803 tests passed / 178 skipped, zero failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: IN-01 — reject flag-shaped and path-traversing run-id values in both CLI parsers** - `cd4a4a2` (fix)
2. **Task 2: IN-02 + IN-04 + IN-05 — skill-installer hardening, its test's exit-status precision, wrapup catch-handler safety** - `359069d` (fix)

**Plan metadata:** (this commit) `docs(09-05): complete DEBT-04 dogfood CLI hardening plan`

## Files Created/Modified

- `scripts/dogfood/dogfood-run.mjs` - Added `assertSafeRunId` + exported `parseDogfoodArgv` (IN-01); wrapped `scriptMain`'s parse call in try/catch
- `scripts/dogfood/dogfood-wrapup.mjs` - Added `assertSafeRunId` + exported `parseWrapupArgv` (IN-01, undefined-guarded so an absent run-id still reaches `scriptMain`'s own usage message); hoisted `stagedPath` in the per-capture loop (IN-05)
- `scripts/dogfood/install-dogfood-skill.mjs` - Added canonical-existence checks before both `symlinkSync` call sites (IN-02); wrapped `scriptMain` body in try/catch; rephrased two stale `promote-capture.mjs` comment references
- `test/unit/tools/dogfood-run-spawn-options.test.ts` - Added 3 `parseDogfoodArgv` tests (flag-shaped rejected, path-traversal rejected, normal value accepted)
- `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts` (new) - 4 `parseWrapupArgv` tests: flag-shaped rejected, path-traversal rejected, normal value accepted, empty argv left for scriptMain's own usage message
- `test/unit/tools/dogfood-install-skill.test.ts` - Gitignore test now asserts `.status === 1` (IN-04); 2 new tests prove `installDogfoodSkill` throws before creating/relinking a dangling symlink (IN-02)
- `test/unit/tools/dogfood-wrapup-corrupt-capture-entry.test.ts` (new) - End-to-end `scriptMain` regression proving a `null` stagedCaptures entry is recorded as `classification: "error"` while a valid entry alongside it is still judged and `wrapup-report.json` is still written (IN-05)

## Decisions Made

- **IN-02's fix is two duplicated existence checks, not one hoisted check.** The plan's action text scopes the fix to "before both symlinkSync call sites" (the "created" and "relinked" branches). A single check hoisted above all branch logic would also apply to the already-correct "already-linked"/"skipped-existing-non-symlink" branches, which never call `symlinkSync`/`unlinkSync` and are out of this finding's stated scope — duplicating the check keeps the fix precisely targeted and avoids an unplanned behavior change in branches the finding never named.
- **The IN-05 regression test exercises the real `scriptMain` with a vacuous artifact rather than mocking the oracle pipeline.** `runOracle`/`judgeOrcl02` both abstain in a single synchronous check (`findWarmLoadTuple`/`findLastLoadFamilyAction` return null/no-target) when `recordedActions` is empty, so a capture artifact with no recorded actions and no `oracleSubstrate` drives the exact real production code path — including the real per-capture loop the bug lived in — at effectively zero cost, with no Agda binary or subprocess involved.
- **`node:child_process`'s `spawn` is partially mocked (via `importOriginal`) only in the new IN-05 test**, so `scriptMain`'s unconditional D-12 upload-chain tail step never spawns a real `npx tsx` process. This mirrors this codebase's one existing `vi.mock` precedent (`test/unit/agda/spawn-error-listener.test.ts`) rather than introducing a new `deps` parameter to `scriptMain` purely for testability, which would have been a larger, unplanned production-code change.

## Deviations from Plan

None - plan executed exactly as written, including the "ADDITIONALLY" cross-plan handoff (promote-capture.mjs comment rephrase) called out in Task 2's action text.

## Issues Encountered

None. The plan's own line-count caveats ("your plan's line numbers may have shifted") were verified against the current file state before editing — `dogfood-run.mjs`'s post-09-01/Phase-7 shape (detached spawn, `killChildGroup`, checkpointing) and `dogfood-wrapup.mjs`'s six live `staged.stagedPath` dereferences both matched the plan's corrected counts exactly, so no line-shift surprises during implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four of DEBT-04's Phase-5 Info findings (IN-01, IN-02, IN-04, IN-05) are closed with regression coverage; no further tracking needed for this requirement.
- `grep -rn "promote-capture\.mjs" scripts/` is phase-wide clean, closing 09-01's cross-plan handoff.
- No blockers for the phase's remaining plans (typecheck cleanup, security review, `/gsd:map-codebase` refresh per D-01's sequencing).

---
*Phase: 09-residual-v1-0-debt-sweep*
*Completed: 2026-07-04*

## Self-Check: PASSED

- All 7 plan files (`scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/install-dogfood-skill.mjs`, `test/unit/tools/dogfood-run-spawn-options.test.ts`, `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts`, `test/unit/tools/dogfood-install-skill.test.ts`, `test/unit/tools/dogfood-wrapup-corrupt-capture-entry.test.ts`) plus this SUMMARY.md verified present on disk.
- Both task commits (`cd4a4a2`, `359069d`) verified present in `git log --oneline --all`.
- `grep -n "^export function parseDogfoodArgv" scripts/dogfood/dogfood-run.mjs` and `grep -n "^export function parseWrapupArgv" scripts/dogfood/dogfood-wrapup.mjs` both match.
- `staged.stagedPath` (raw dotted form) appears exactly once in `dogfood-wrapup.mjs`'s per-capture loop body (the hoisted assignment) and exactly once in the whole file — verified programmatically.
- `grep -n "promote-capture" scripts/dogfood/install-dogfood-skill.mjs` and `grep -rn "promote-capture\.mjs" scripts/` both return zero matches.
- Full `npm test` (build + vitest run): 216 test files passed / 16 skipped, 1803 tests passed / 178 skipped, 0 failures.
