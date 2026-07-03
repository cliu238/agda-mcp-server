---
phase: 05-dogfooding-orchestration-fuel
plan: 04
subsystem: infra
tags: [agent-skills, dogfooding, runbook, symlink, gitignore, proc-01]

# Dependency graph
requires:
  - phase: 05-dogfooding-orchestration-fuel
    provides: "05-02's scripts/dogfood/dogfood-run.mjs (--manifest/--corpus-root/--run-id flag names) — the exact CLI shape this Skill's launch commands document"
provides:
  - ".agents/skills/agda-dogfooding/SKILL.md — PROC-01's runbook + driver-prompt, tracked (not gitignored), a cross-tool Agent Skill discoverable natively by Codex CLI"
  - "scripts/dogfood/install-dogfood-skill.mjs — installDogfoodSkill(), the idempotent .claude/skills/ symlink installer for Claude Code's own project-skill discovery"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canonical-doc-tracked-at-.agents/-plus-gitignored-symlink-at-.claude/ — the dual-discovery-path resolution for a single-source-of-truth cross-tool Agent Skill (Codex reads .agents/skills/ natively; Claude Code reads only .claude/skills/, which .gitignore wholesale-excludes)"
    - "lstatSync-type-check-before-mutate guard for idempotent symlink installers (mirrors promote-capture.mjs's check-first-degrade-gracefully shape, adapted from an index-read to a symlink existence/type check)"
    - "CLI-warns-library-stays-silent split: installDogfoodSkill() is a pure result-returning function with no console output of its own; only scriptMain() (the CLI entry point) prints the skipped-existing-non-symlink warning to stderr"

key-files:
  created:
    - .agents/skills/agda-dogfooding/SKILL.md
    - scripts/dogfood/install-dogfood-skill.mjs
    - test/unit/tools/dogfood-install-skill.test.ts
  modified: []

key-decisions:
  - "SKILL.md launch commands use `npx tsx` rather than the plan text's literal `node` for dogfood-run.mjs — dogfood-run.mjs's own header comment mandates tsx (it imports TypeScript siblings like src/repo-root.ts through .js-suffixed specifiers that plain node's type-stripping does not resolve); the plan's own <read_first> instructed verifying the exact CLI shape against the real implementation before writing the Skill's invocation lines, so this corrects rather than contradicts the plan's intent."

patterns-established:
  - "Agent Skill dual-discovery packaging: canonical content tracked once at .agents/skills/<name>/, a gitignored install-time symlink at .claude/skills/<name> serves the second tool's discovery path without a second copy to keep in sync."

requirements-completed: [PROC-01]

# Metrics
duration: ~12min
completed: 2026-07-03
---

# Phase 05 Plan 04: Dogfooding Skill + Installer Summary

**`.agents/skills/agda-dogfooding/SKILL.md` — the PROC-01 runbook + driver-prompt shipped as a tracked, cross-tool Agent Skill, with `install-dogfood-skill.mjs`'s idempotent `.claude/skills/` symlink closing the Codex/Claude Code discovery-path gap.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-03T01:36:00Z
- **Completed:** 2026-07-03T01:42:31Z
- **Tasks:** 2 completed
- **Files modified:** 3 (all created; 0 modified)

## Accomplishments
- Shipped the dogfooding runbook AI agents actually discover and follow: `.agents/skills/agda-dogfooding/SKILL.md`, tracked (not swallowed by this repo's `.claude/`/`.codex/` gitignore rules), documenting the D-03 mechanical hard gate, the `agda_capture_session` capture verb (with concrete when-to-capture triggers), the legitimate scaffold-hole workflow, the CHG trust-retraction framing, the 4 pinned fuel corpora, and the exact wrap-up command.
- Verified the Skill's launch commands against the REAL, already-implemented `dogfood-run.mjs` CLI (`--manifest`/`--corpus-root`/`--run-id`, tsx-required launcher) rather than guessing — closing the loop the plan's own `<read_first>` demanded.
- Built `install-dogfood-skill.mjs`'s `installDogfoodSkill()`: idempotently symlinks `.claude/skills/agda-dogfooding` to the canonical `.agents/` content for Claude Code's own discovery, type-checking the target with `lstatSync` before ever mutating it so a genuinely pre-existing real directory is never clobbered (T-05-04-01, proven by an automated test).

## Task Commits

Each task was committed atomically:

1. **Task 1: SKILL.md — the runbook + driver-prompt** - `fdf06d0` (docs)
2. **Task 2: install-dogfood-skill.mjs — idempotent symlink** - `042f1b0` (test, RED) → `232e8af` (feat, GREEN)

**Plan metadata:** (this commit) `docs(05-04): complete dogfooding skill + installer plan`

_Note: Task 2 was TDD (`tdd="true"`) — RED confirmed via `Cannot find module install-dogfood-skill.mjs` before the GREEN implementation landed. No REFACTOR commit was needed; the GREEN implementation required no follow-up cleanup._

## Files Created/Modified
- `.agents/skills/agda-dogfooding/SKILL.md` - PROC-01's dogfooding runbook + driver-prompt, tracked (not gitignored), 7 numbered sections covering the hard gate, launch commands (Codex + Claude Code), the capture verb, the scaffold-hole workflow, the trust-retraction framing, the 4 pinned fuel corpora, and wrap-up
- `scripts/dogfood/install-dogfood-skill.mjs` - `installDogfoodSkill({ serverRepoRoot })` (idempotent `.claude/skills/agda-dogfooding` symlink installer, `lstatSync`-gated) + `scriptMain()` (CLI entry point, prints the `skipped-existing-non-symlink` stderr warning)
- `test/unit/tools/dogfood-install-skill.test.ts` - 5 tests: SKILL.md not-gitignored + content-completeness (Task 1), fresh-create / idempotent-no-op / never-overwrite-a-real-directory (Task 2)

## Decisions Made
- **SKILL.md launch commands use `npx tsx`, not `node`, for `dogfood-run.mjs`.** The plan's action text suggested `-- node /path/to/agda-mcp-server/scripts/dogfood/dogfood-run.mjs ...` as a "style line," but `dogfood-run.mjs`'s own header comment documents that it MUST be launched via `npx tsx` (or a resolved `node_modules/.bin/tsx`), never plain `node` — it imports TypeScript siblings (`src/repo-root.ts`, `test/helpers/mcp-harness.ts`) through `.js`-suffixed specifiers that only `tsx`'s resolver rewrites correctly; plain `node` would fail with `ERR_MODULE_NOT_FOUND`. The plan's own `<read_first>` explicitly instructed confirming the exact CLI shape against the real implementation before writing the Skill's invocation lines "so the documented commands match the real, implemented CLI rather than a guess" — this is that verification, applied. Kept the "local checkout + `npm run build`" caveat exactly as the plan specified (the proxy still spawns the compiled `dist/index.js` as its child).
- **The `skipped-existing-non-symlink` stderr warning lives in `scriptMain()`, not `installDogfoodSkill()`.** The plan's action text says the warning should print "when this function is invoked from the CLI (not from a test)" but does not specify a mechanism for that distinction. Rather than adding a CLI-detection flag to the library function, `installDogfoodSkill()` stays a pure, side-effect-minimal function returning `{ action, ... }`; `scriptMain()` (the sole CLI entry point) inspects the returned `action` and prints the warning only there. Tests calling `installDogfoodSkill()` directly never see it, satisfying the plan's intent without adding library-level CLI-awareness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal `process.cwd()` text from install-dogfood-skill.mjs's own comments**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** The plan's acceptance criteria requires `grep -c "process.cwd()" scripts/dogfood/install-dogfood-skill.mjs` to equal 0, confirming the default root is `SERVER_REPO_ROOT`, never a cwd-dependent fallback. The first draft's JSDoc comment explaining *why* `SERVER_REPO_ROOT` was chosen over a cwd fallback used the literal string `process.cwd()` twice in prose (contrasting with `promote-capture.mjs`'s own fallback) — functionally correct (no actual `process.cwd()` call exists anywhere in the file) but failing the mechanical grep assertion, which does not distinguish code from comments.
- **Fix:** Reworded the comment to describe "a caller-cwd-dependent fallback" / "current-working-directory fallback" in prose instead of the literal `process.cwd()` call syntax, preserving the same explanation without the literal string.
- **Files modified:** `scripts/dogfood/install-dogfood-skill.mjs`
- **Verification:** `grep -c "process.cwd()" scripts/dogfood/install-dogfood-skill.mjs` returns `0`; `grep -c "isSymbolicLink"` returns `1`; all 5 tests still pass.
- **Committed in:** `232e8af` (Task 2 GREEN commit — caught before commit, not a follow-up fix)

---

**Total deviations:** 1 auto-fixed (1 bug — mechanical source-assertion compliance)
**Impact on plan:** Cosmetic comment wording only; no behavior change. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (The Skill's own documented setup step — running `install-dogfood-skill.mjs` once per clone to create the local `.claude/skills/` symlink — is itself the deliverable, not a manual step this plan left outstanding.)

## Next Phase Readiness
- PROC-01 is now fully closed: the mechanical hard gate (05-01), the recording proxy (05-02), and the discoverable runbook that tells an agent when to invoke `agda_capture_session` (this plan) all exist and are tested.
- `.agents/skills/agda-dogfooding/SKILL.md`'s wrap-up section (section 7) already references `npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id>` — 05-03's own deliverable, which this plan does not depend on and did not wait for (05-03 runs in the same wave, independently). No blocker: 05-03's CLI shape (`<run-id> [--rerun-n N] [--queue-path P]`) was fixed by 05-03's own plan text before this plan wrote its wrap-up section, matching what the Skill documents.
- No blockers for Phase 5 completion. Once 05-03 lands (parallel wave), a maintainer or agent can run a complete dogfood session end to end using only this Skill as the guide.

---
*Phase: 05-dogfooding-orchestration-fuel*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: .agents/skills/agda-dogfooding/SKILL.md
- FOUND: scripts/dogfood/install-dogfood-skill.mjs
- FOUND: test/unit/tools/dogfood-install-skill.test.ts
- FOUND: .planning/phases/05-dogfooding-orchestration-fuel/05-04-SUMMARY.md
- FOUND commit fdf06d0 (Task 1: SKILL.md + coverage tests)
- FOUND commit 042f1b0 (Task 2 RED: failing installer test)
- FOUND commit 232e8af (Task 2 GREEN: install-dogfood-skill.mjs)
