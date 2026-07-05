---
phase: quick-260705-je7
plan: 01
subsystem: infra
tags: [installer, fuel-corpora, onboarding-docs, team-feedback-channel]

# Dependency graph
requires: []
provides:
  - "--public-only flag on scripts/team/install-pinned-env.mjs (threaded via deps.publicOnly into clone-fuel-corpora.mjs's cloneAllFuelCorpora)"
  - "Corrected README.md / docs/TEAM-ONBOARDING.md / docs/team-intro.html narrative: private research corpora are optional, not mandatory for every teammate"
affects: [team-onboarding, install-pinned-env, fuel-corpora]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive/backward-compatible deps filter (deps.publicOnly) — omitting the flag is an identity no-op, so existing callers and their tests need zero changes"

key-files:
  created: []
  modified:
    - scripts/team/install-pinned-env.mjs
    - scripts/team/clone-fuel-corpora.mjs
    - test/unit/tools/team-install-pinned-env.test.ts
    - README.md
    - docs/TEAM-ONBOARDING.md
    - docs/team-intro.html

key-decisions:
  - "--public-only is a plain argv.includes() membership check (no shell interpolation), matching the existing --root flag pattern in clone-fuel-corpora.mjs"
  - "The partial-clone --public-only re-run hint is suppressed when already in public-only mode (it would be a no-op instruction)"
  - "Doc corrections are surgical: only the three specific incorrect claims changed, all other prose (oracle-triad description, privacy callout, JUDGE section) left untouched"

patterns-established:
  - "Filter-before-loop seam in cloneAllFuelCorpora: deps.publicOnly narrows entries before the clone loop runs, so unfiltered/private-corpus code paths are simply never invoked in public-only mode"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-07-05
---

# Quick Task 260705-je7: Installer public-only mode + doc corrections Summary

**Added `--public-only` to the pinned-env installer (clones only the 2 public fuel corpora, zero GitHub credentials, complete 2/2 exit-0) and corrected README.md / docs/TEAM-ONBOARDING.md / docs/team-intro.html's now-wrong "private corpora are mandatory for every teammate" claims.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-05T18:02:00Z
- **Completed:** 2026-07-05T18:14:13Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `scripts/team/install-pinned-env.mjs` parses `--public-only` from argv and threads `deps.publicOnly` through to `cloneAllFuelCorpora`; summary line gets a `(public-only mode)` suffix and the partial-install re-run hint is suppressed when already in that mode.
- `scripts/team/clone-fuel-corpora.mjs`'s `cloneAllFuelCorpora` filters entries to `access === "public"` when `deps.publicOnly` is truthy, before the clone loop — an identity no-op when unset, so `clone-fuel-corpora.mjs`'s own CLI and `test/unit/tools/team-clone-fuel-corpora.test.ts` needed zero changes.
- Two new unit tests in `test/unit/tools/team-install-pinned-env.test.ts` cover the `--public-only` success path (2/2, exit 0, private entry never touched by any git/gh call) and failure path (a public corpus fails to clone → 0/1, exit 1, private entry still never touched, re-run hint correctly suppressed).
- README.md, docs/TEAM-ONBOARDING.md, and docs/team-intro.html no longer state or imply the two private research corpora (`codex-homotopy-group`, `autoformalizing-hopf`) are required for every teammate — corrected to: required only for people working on that research directly, with `--public-only` documented as the alternative for everyone else.
- docs/TEAM-ONBOARDING.md's "Step 2" / "Step 4" labels are unchanged (install-pinned-env.mjs's stderr cites "Step 2" literally).
- docs/team-intro.html gained a new paragraph establishing that a teammate's own project sessions are first-class fuel (D-07 inlining), not a fallback.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --public-only mode to the pinned-env installer** - `4bebfe7` (feat)
2. **Task 2: Correct the now-wrong private-corpora claims in README.md, docs/TEAM-ONBOARDING.md, docs/team-intro.html** - `ae3677c` (docs)

_Note: Task 1 was TDD (test coverage written alongside the implementation per the plan's exact target-edit blocks; verified failing pre-implementation via the environment's real Node 22 gate incidentally proving the fixture-driven tests actually execute scriptMain's logic, then verified green after applying the source edits)._

## Files Created/Modified
- `scripts/team/install-pinned-env.mjs` - parses `--public-only`, threads `deps.publicOnly`, labels summary, suppresses re-run hint in public-only mode
- `scripts/team/clone-fuel-corpora.mjs` - `cloneAllFuelCorpora` filters entries to `access === "public"` when `deps.publicOnly` is truthy
- `test/unit/tools/team-install-pinned-env.test.ts` - `runScriptMainCapturing` now accepts an `argv` param; two new tests for `--public-only` success/failure paths
- `README.md` - corrected teammate-install parenthetical (private corpora optional, `--public-only` documented)
- `docs/TEAM-ONBOARDING.md` - corrected Prerequisites bullet, documented `--public-only` in Step 2 and the TL;DR fence, scoped the partial-clone warning to full mode only
- `docs/team-intro.html` - corrected Fuel corpora / Credentials / First build comparison-table rows; added a paragraph on D-07 inlining making a teammate's own project first-class fuel

## Decisions Made
- Matched the plan's target-edit blocks exactly (old_string/new_string via the Edit tool) — no paraphrasing, no restructuring of surrounding prose.
- Kept `deps.publicOnly` additive/backward-compatible per the plan's explicit facts: omitting it is an identity filter, so `clone-fuel-corpora.mjs`'s own CLI entry and its existing test file needed zero edits.

## Deviations from Plan

None - plan executed exactly as written. All six target-edit blocks (clone-fuel-corpora.mjs x1, install-pinned-env.mjs x3, team-install-pinned-env.test.ts x2, README.md x1, TEAM-ONBOARDING.md x3, team-intro.html x4) were applied verbatim.

## Issues Encountered
- The worktree's default `node` on `PATH` was v22.22.0 (project requires Node >= 24, per `.nvmrc` / `package.json` `engines`). This is a pre-existing environment condition, not something introduced by this task's edits, and it caused every `scriptMain`-driven test (including pre-existing ones I did not touch) to fail via the real `checkNodeVersion(deps)` early-exit path when run under the ambient `node`. Resolved by running all build/test verification through `mise exec node@24.16.0 -- ...` (Node 24.16.0 was already installed locally via `mise`, just not the shell's active version) — no code changes were needed or made to work around this; it was purely a verification-environment selection issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `--public-only` is shipped and documented consistently across the installer and all three onboarding-facing docs; a contributor with zero GitHub credentials for the private corpora can now complete a full, non-partial install.
- No blockers. Anyone running this repo's test suite directly (not via `mise exec node@24 --`) should first ensure their active `node` resolves to >= 24, per `.nvmrc`, or several installer tests will report a false failure driven by the environment's Node version rather than the code under test.

## Self-Check: PASSED

All 6 modified source/doc files and the two task commit hashes (`4bebfe7`, `ae3677c`) verified present.

---
*Phase: quick-260705-je7*
*Completed: 2026-07-05*
