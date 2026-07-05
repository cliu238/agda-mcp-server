---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
plan: 01
subsystem: infra
tags: [team-onboarding, agda, git-clone, bash, node-esm, plain-node]

# Dependency graph
requires:
  - phase: 07-team-feedback-channel
    provides: scripts/team/issue-key.mjs and scripts/team/ingest-server.mjs conventions (env-override resolvers, never-throw registry reads, execFileSync argv-array DI seams) mirrored by this plan's two new scripts
provides:
  - "scripts/team/clone-fuel-corpora.mjs: plain-node-loadable fuel-corpus clone/checkout primitive (D-04/D-05), reused verbatim by 08-02's Dockerfile"
  - "scripts/team/install-pinned-env.{mjs,sh}: Agda verify-and-instruct gate (D-03), tooling/scripts/run-pinned-agda.sh generator, npm ci orchestrator"
affects: [08-02-dockerfile-k8s-manifests, 08-03-team-onboarding-doc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plain-node-loadable scripts (no tsx, no .ts-backed imports) for pre-npm-ci bootstrap code"
    - "deps.execFileSync ?? execFileSync DI seam for testable subprocess calls (argv array, shell:false)"
    - "deps.cloneUrl(entry) override seam to substitute a local bare-repo fixture for a real GitHub URL in tests"

key-files:
  created:
    - scripts/team/clone-fuel-corpora.mjs
    - scripts/team/install-pinned-env.mjs
    - scripts/team/install-pinned-env.sh
    - test/unit/tools/team-clone-fuel-corpora.test.ts
    - test/unit/tools/team-install-pinned-env.test.ts
  modified: []

key-decisions:
  - "Credential scrub runs unconditionally and immediately after every token-based private clone (git remote set-url origin <clean-url>), closing the plan-checker BLOCKER that a token would otherwise persist in .git/config and ship in 08-02's Dockerfile image layers (T-08-02)"
  - "checkout+submodule-update is a single common tail after either the fetch (already-cloned) or clone (fresh) branch, not duplicated per-branch, avoiding redundant git invocations while still satisfying idempotent re-run"
  - "deps.cloneUrl(entry) is a full-override seam (not additive to token embedding) so tests can point at a local bare-repo fixture regardless of the entry's access level, keeping every test hermetic (zero network)"

requirements-completed: [TEAM-05]

# Metrics
duration: 25min
completed: 2026-07-04
---

# Phase 8 Plan 1: Pinned-Environment Install Engine Summary

**Plain-node fuel-corpus clone primitive + Agda verify-and-instruct installer, with immediate token-scrub after every credentialed private clone (T-08-02).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-04 (session start)
- **Completed:** 2026-07-04T23:02:00Z
- **Tasks:** 2 completed
- **Files modified:** 5 (all new)

## Accomplishments
- `scripts/team/clone-fuel-corpora.mjs`: `resolveFuelRoot` (D-05 mandatory env override `AGDA_MCP_FUEL_ROOT`, D-04 visible `~/agda-mcp-fuel` default), `readFuelCorpora` (never-throws SSOT reader mirroring `readKeyRegistry`), `cloneFuelCorpus` (idempotent clone-or-fetch, public/private branching, submodule sync, never throws), `cloneAllFuelCorpora` (continues past one bad corpus, loud stderr per skip), `scriptMain` CLI
- Closed the plan-checker BLOCKER: every credentialed private clone immediately runs `git remote set-url origin <clean-url>` before any other operation touches the clone, so no token ever persists in `.git/config` — unit-tested via the `deps.cloneUrl`/`deps.ghToken`/`deps.execFileSync` DI seam against a real local bare-repo fixture (no network)
- `scripts/team/install-pinned-env.mjs`: D-03 verify-and-instruct Agda gate (`PINNED_AGDA_VERSION = "2.8.0"`, exact-match via `versionSatisfies`, never force-install), `generateRunPinnedAgdaScript`/`writeRunPinnedAgdaScript` producing the exact `tooling/scripts/run-pinned-agda.sh` path `src/agda/binary-discovery.ts`'s `findAgdaBinary()` already resolves first, `runNpmCi`, and `scriptMain` orchestrating all of it plus `cloneAllFuelCorpora`
- `scripts/team/install-pinned-env.sh`: POSIX bootstrap gating on Node >= 24 and `git` presence before `npm ci`/`tsx` exist anywhere, then execs the adjacent `.mjs` resolved via its own script directory (not a hardcoded repo path)
- Both `.mjs` files verified plain-`node`-loadable (`node -e "import(...)"` prints `function` for their key exports) with zero `tsx`/devDependency requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: scripts/team/clone-fuel-corpora.mjs — shared fuel-corpus clone/checkout primitive** - `395ad4f` (feat)
2. **Task 2: install-pinned-env.mjs + install-pinned-env.sh — Agda verify, wrapper generation, npm ci orchestration (D-01, D-03)** - `2d75268` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `scripts/team/clone-fuel-corpora.mjs` - Fuel-corpus clone/checkout primitive; exports `resolveFuelRoot`, `readFuelCorpora`, `cloneFuelCorpus`, `cloneAllFuelCorpora`, `scriptMain`
- `scripts/team/install-pinned-env.mjs` - Agda locate+verify, wrapper generation, npm ci orchestrator; exports `PINNED_AGDA_VERSION`, `checkNodeVersion`, `locateAgdaBinary`, `getAgdaVersion`, `versionSatisfies`, `generateRunPinnedAgdaScript`, `writeRunPinnedAgdaScript`, `runNpmCi`, `scriptMain`
- `scripts/team/install-pinned-env.sh` - POSIX bash entry point (chmod 0755); Node>=24 + git presence/version gate before handing off to the `.mjs`
- `test/unit/tools/team-clone-fuel-corpora.test.ts` - 11 tests: never-throws readers, env override/default, fresh clone lands at pinned SHA, idempotent re-run takes fetch branch, submodule sync, no-credential skip, credential scrub, batch continues past one failure
- `test/unit/tools/team-install-pinned-env.test.ts` - 12 tests: exact-match version check, wrapper content/permissions, `execFileSync`-faked locate/version, `npm ci` invocation shape, `scriptMain`'s missing-Agda early exit, two real bash subprocess tests for the `.sh` hand-off contract (stub adjacent `.mjs`; PATH-shimmed fake old-Node version gate)

## Decisions Made
- Credential scrub (`git remote set-url origin <clean-url>`) runs unconditionally immediately after every token-based private clone, regardless of what URL was actually used to clone — closes the T-08-02/plan-checker BLOCKER before 08-02's Dockerfile ever ships these clones as image layers.
- `checkout <pinnedRef>` + `submodule update --init --recursive` is one common tail executed after either the "already cloned -> fetch" branch or any "fresh clone" branch, rather than being duplicated inside each branch — fewer git invocations, same idempotent-re-run guarantee the plan asked for.
- `deps.cloneUrl(entry)` fully overrides URL construction (not just appended token embedding) so every unit test clones a real local bare-repo fixture instead of touching the network, regardless of the entry's declared `access` level.
- `scriptMain` in `install-pinned-env.mjs` accepts an optional `deps.repoRoot` override (beyond what the plan's prose literally specified) purely so its missing-Agda early-exit path could be unit-tested without ever touching the real repository tree — a minimal, backward-compatible DI addition, not a behavior change for the real CLI entry point (which still defaults to this file's own `../..`).

## Deviations from Plan

None - plan executed exactly as written. (One process note, not a code deviation: an ad hoc live-environment verification probe of the `<success_criteria>`'s "no Agda on PATH" scenario was attempted against the real worktree with an unrestricted PATH; since this machine has a real Agda 2.8.0 install via nix, the probe proceeded past the version gate and began a real fuel-corpus clone before being killed by a tool timeout, leaving a stray untracked `tooling/scripts/run-pinned-agda.sh` in the worktree. This was a side effect of my own manual verification attempt, not of the shipped code — it was deleted before committing, the working tree was confirmed clean via `git status --short`, and no such artifact is part of any commit in this plan. The scenario itself remains fully covered by the hermetic DI-based unit test `scriptMain's missing-Agda early-exit path never calls npm ci or clones any fuel corpus`.)

## Issues Encountered
None - all acceptance criteria and the plan-level `<verification>` command passed on first execution of the final implementation.

## User Setup Required

None - no external service configuration required. (Real end-to-end use of `install-pinned-env.sh` by an actual teammate will need `GH_TOKEN`/`GITHUB_TOKEN` or an authenticated `gh` session to clone the 2 private fuel corpora — this is documented as 08-03's onboarding-doc scope, not this plan's.)

## Next Phase Readiness
- `scripts/team/clone-fuel-corpora.mjs` is ready to be imported verbatim by 08-02's Dockerfile build (same exports, same plain-node-loadable contract).
- `scripts/team/install-pinned-env.{mjs,sh}` are ready for 08-03 to document in `docs/TEAM-ONBOARDING.md` (the "next steps" message already points there).
- No blockers for 08-02 or 08-03.

## Self-Check: PASSED

- `test -f scripts/team/clone-fuel-corpora.mjs` -> FOUND
- `test -f scripts/team/install-pinned-env.mjs` -> FOUND
- `test -f scripts/team/install-pinned-env.sh` -> FOUND
- `test -f test/unit/tools/team-clone-fuel-corpora.test.ts` -> FOUND
- `test -f test/unit/tools/team-install-pinned-env.test.ts` -> FOUND
- `git log --oneline --all | grep -q 395ad4f` -> FOUND
- `git log --oneline --all | grep -q 2d75268` -> FOUND
- `npx vitest run test/unit/tools/team-clone-fuel-corpora.test.ts test/unit/tools/team-install-pinned-env.test.ts` -> 23/23 passed
- `npx vitest run test/unit/` (full tier regression check) -> 170 files / 1547 tests passed, 2 files / 22 tests skipped (pre-existing), 0 failed
- `git status --short` -> clean (no stray artifacts from manual verification)

---
*Phase: 08-pinned-environment-distribution-thin-k8s-deployment*
*Completed: 2026-07-04*
