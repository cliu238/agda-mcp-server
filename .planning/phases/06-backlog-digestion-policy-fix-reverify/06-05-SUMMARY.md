---
phase: 06-backlog-digestion-policy-fix-reverify
plan: 05
subsystem: tools
tags: [agda, mcp, tool-adapter, path-sandboxing, false-green, tdd, regression-tests]

# Dependency graph
requires:
  - phase: 06
    plan: "06-03"
    provides: "Pre-fix RT-REVERIFY.md measurements (RT-REVERIFY.md), confirming fdc90bfde12fb938 and eb7439cb3ed9d6b9 as still-alive defects on current main before this plan's fixes landed"
provides:
  - "agda_proof_status no longer prints \"All goals solved.\" when constraints.text carries a real error alongside zero goals — fixes fingerprint fdc90bfde12fb938"
  - "agda_search_definitions accepts an optional, sandboxed `directory` parameter so src/-layout projects (agda-unimath's real layout) are searchable — fixes fingerprint eb7439cb3ed9d6b9"
  - "Both fixes carry from-RED regression tests (7 new tests total, RED demonstrated before each src edit)"
  - "The exact regression-test identifiers plan 06-06 needs to flip fdc90bfde12fb938 and eb7439cb3ed9d6b9 to locked (see below)"
affects: [06-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Completeness-branch fix follows the existing 'combined previous+new state' precedent in this codebase (session/tool-presentation.ts's previousClassification field) — a same-call-cycle labeling bug fixed by consulting BOTH signals (goals AND constraints) rather than just one"
    - "Optional sandboxed directory override copied verbatim in shape from the shipped agda_project_progress analog (src/tools/agent-ux/project-tools.ts): `const baseDir = directory ?? \"agda\"` then resolveFileWithinRoot + resolveExistingPathWithinRoot, never a bare join/resolve"
    - "missingPathToolError's returned diagnostics array is mutated in place to append a parameter-specific recovery hint before throwing, rather than hand-building a parallel ToolInvocationError — keeps the shared not-found shape while adding tool-specific guidance"

key-files:
  created: []
  modified:
    - src/tools/analysis-tools.ts
    - src/tools/file/search-definitions.ts
    - test/unit/tools/analysis-tools.test.ts
    - test/unit/tools/file-tools.test.ts

key-decisions:
  - "agda_proof_status's fix is a presentation-text-only change: the completeness condition became `metas.goals.length === 0 && !constraints.text`, with a new else-if branch printing an honest \"NOT confirmed complete\" line. No structured data-payload field was touched (goalCount/hasConstraints/constraintsText were already technically correct per CHG-REVERIFY.md) — matches the plan's explicit instruction to keep the fix localized to the summary text."
  - "The 'No matches for ... in agda/' fallback message was also updated to reflect the actual base directory searched (`${baseDir}/` instead of a hardcoded `agda/`) — a same-file, same-lines correctness fix (Rule 1): leaving it hardcoded would have made the message actively wrong once `directory` could differ from the default, e.g. reporting \"in agda/\" after a `directory: \"src\"` search found nothing."
  - "The not-found guidance test asserts the specific substring `directory: \"src\"` rather than the bare word \"directory\" — the pre-existing missingPathToolError wording already contained the generic word \"directory\", so a loose assertion would have passed before the fix and produced false RED evidence. Tightening it to the literal parameter-naming addition made the test meaningfully RED pre-fix and GREEN only once the new guidance text landed."

requirements-completed: [REVERIFY-02]

# Metrics
duration: ~20min
completed: 2026-07-04
---

# Phase 6 Plan 05: agda_proof_status + agda_search_definitions Fixes Summary

**Fixed two of the four D-09/D-10 named confirmed defects — agda_proof_status's contradictory "All goals solved." tagline and agda_search_definitions' hardcoded agda/ layout — both from RED, both path-sandboxed where applicable.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-04
- **Tasks:** 2/2 completed
- **Files modified:** 4 across 2 commits

## Accomplishments

- **Task 1 (fingerprint `fdc90bfde12fb938`):** `agda_proof_status`'s completeness branch now requires BOTH zero goals AND empty `constraints.text` before printing "All goals solved."; a new branch prints an explicit "No visible goals, but constraints remain — the file is NOT confirmed complete. See the Constraints section above." line when constraints hold a real error. Demonstrated RED first: the new "goals empty + constraints non-empty" test failed against pre-fix code with the output literally containing both the rendered error AND "All goals solved." immediately after it — reproducing the exact contradiction `.planning/research/CHG-REVERIFY.md` and `RT-REVERIFY.md` describe.
- **Task 2 (fingerprint `eb7439cb3ed9d6b9`):** `agda_search_definitions` gained an optional `directory` input (default `"agda"`, unchanged), threaded through the exact same `resolveFileWithinRoot` + `resolveExistingPathWithinRoot` sandbox pair `agda_project_progress` already uses — never a bare `join`/`resolve`. A `../../` escape attempt in `directory` now dies as `PathSandboxError` → `invalid-path`, matching threat T-06-15's disposition. The not-found `nextAction` now explicitly names the `directory` parameter as a recovery hint for src/-layout projects. Demonstrated RED first: 3 of 4 new tests failed against pre-fix code (the src/-layout search returned not-found; the escape attempt fell through to a plain not-found instead of being rejected as invalid-path, because the parameter was previously unread entirely; the not-found guidance lacked the specific parameter-naming text).
- Zero hardcoded `agda/` literals remain in `search-definitions.ts` (`grep -n 'join("agda"' src/tools/file/search-definitions.ts` → 0 matches); the pre-existing symlink-escape regression test for this tool is untouched and still green.
- Full `test/unit` suite: 145 files / 1327 tests passed, 17 skipped (no regressions). `npx tsc -p tsconfig.json --noEmit` and `npm run build` both green. Both touched `src/` files stay well under the 500-line ceiling (`analysis-tools.ts` 414 lines, `search-definitions.ts` 221 lines).

## Task Commits

Each task was committed atomically:

1. **Task 1: agda_proof_status completeness condition consults constraints** - `6caa279` (fix)
2. **Task 2: agda_search_definitions optional sandboxed directory parameter** - `67d40a6` (fix)

_Both tasks followed TDD: RED test run confirmed failing against pre-fix code, then the source fix, then a GREEN re-run, all within the same commit's working set (test file + source file land together per task, consistent with this plan's `tdd="true"` task declarations)._

## Regression-Test Identifiers (for plan 06-06's queue notes)

**Fingerprint `fdc90bfde12fb938` (agda_proof_status):**
- `test/unit/tools/analysis-tools.test.ts :: agda_proof_status reports NOT confirmed complete when goals are empty but constraints remain` — the RED-confirming test (failed pre-fix: output contained "All goals solved." right after the rendered constraints error)
- `test/unit/tools/analysis-tools.test.ts :: agda_proof_status reports All goals solved when there are no goals and no constraints` — clean-case preservation
- `test/unit/tools/analysis-tools.test.ts :: agda_proof_status lists open goals and omits the completeness taglines while goals remain` — open-goals preservation

**Fingerprint `eb7439cb3ed9d6b9` (agda_search_definitions):**
- `test/unit/tools/file-tools.test.ts :: agda_search_definitions searches a caller-supplied directory for src/-layout projects` — the RED-confirming test (failed pre-fix with a not-found error; this is the literal agda-unimath src/-layout shape)
- `test/unit/tools/file-tools.test.ts :: agda_search_definitions still defaults to agda/ when directory is omitted` — default-preserved
- `test/unit/tools/file-tools.test.ts :: agda_search_definitions rejects a directory parameter that escapes the project root` — RED-confirming sandbox test (failed pre-fix: classification was `not-found`, not `invalid-path`, because the parameter was previously never read)
- `test/unit/tools/file-tools.test.ts :: agda_search_definitions not-found guidance names the directory parameter` — RED-confirming guidance-wording test

## Files Created/Modified

- `src/tools/analysis-tools.ts` - `agda_proof_status`'s completeness branch now consults `constraints.text`, not just `metas.goals.length`
- `src/tools/file/search-definitions.ts` - new optional sandboxed `directory` input; hardcoded `agda/` root replaced with `directory ?? "agda"`; not-found guidance names the new parameter; "No matches" message reflects the actual base directory
- `test/unit/tools/analysis-tools.test.ts` - 3 new tests covering `agda_proof_status` (previously zero coverage)
- `test/unit/tools/file-tools.test.ts` - 4 new tests covering the `directory` parameter (src/-layout success, default preserved, sandbox escape, not-found guidance)

## Decisions Made

See `key-decisions` in the frontmatter above: (1) the `agda_proof_status` fix stays presentation-text-only per the plan's explicit instruction; (2) the "No matches" fallback message was corrected in the same pass since leaving it hardcoded would make it actively misleading once `directory` could differ from the default; (3) the not-found guidance test asserts the specific new substring rather than a pre-existing generic word, so it's a meaningful RED/GREEN pair rather than a test that happens to pass either way.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] "No matches" fallback message hardcoded `agda/` regardless of the search directory used**
- **Found during:** Task 2 (agda_search_definitions directory parameter)
- **Issue:** The zero-matches message (`No matches for "X" in agda/`) was hardcoded to say `agda/` whenever no `tier` was given, even though the actual search root is now `${baseDir}/` and `baseDir` can be `"src"` or any caller-supplied directory. Left as-is, a `directory: "src"` search with no matches would report "in agda/" — a directly wrong, misleading directory name in the same output the fix was meant to make honest.
- **Fix:** Introduced `const displayRoot = tier ?? \`${baseDir}/\`` and used it in both the name-mode and type-pattern-mode fallback strings.
- **Files modified:** `src/tools/file/search-definitions.ts`
- **Verification:** Existing symlink-escape test (which asserts on the `tier`-set branch, unaffected) still passes; no new test added specifically for the message text since it wasn't part of the plan's acceptance criteria, but the change is covered incidentally by the tier-based existing test continuing to pass unmodified.
- **Committed in:** `67d40a6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix, same file/lines already in scope for Task 2)
**Impact on plan:** Necessary for output correctness once `directory` could diverge from the default; zero scope creep — no other file's hardcoded `agda/` reference (list-modules.ts, agent-ux/shared.ts, project-tools.ts) was touched, per D-09/D-10's explicit out-of-scope note.

## Issues Encountered

- `node_modules` did not exist in this fresh worktree checkout; ran `npm ci` first. The ambient shell's default Node (v22.22.0 via mise) is below this project's `engines: {"node": ">=24"}` floor, so all `npm`/`npx` invocations in this session were run with `mise`'s Node 24.16.0 (`/Users/eric/.local/share/mise/installs/node/24/bin`) prepended to `PATH`. No code or config change was needed — this was purely a local environment-selection issue for running the commands themselves.
- The `not-found guidance` test's first draft asserted only the substring `"directory"`, which was already present in the pre-existing generic `missingPathToolError` wording and so passed even before the fix (a false-positive-looking GREEN, not real RED evidence). Tightened the assertion to the literal `directory: "src"` addition before implementing the fix, then re-confirmed it failed pre-fix and passed post-fix — see key-decisions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both of this plan's fixes are fully landed, tested (from RED), and committed. Combined with the sibling plan 06-04 (agda_auto CLI-flag leak `5abecc959e43fef3`, agda_give ok:true-wrapping-error `bfcba437f5426fd6`, run in parallel on disjoint files), all 4 of D-09's named confirmed entries now have landed fixes + from-RED regression tests.
- Plan 06-06 can proceed to flip `fdc90bfde12fb938` and `eb7439cb3ed9d6b9` to `locked` in `test/fixtures/fix-queue.json` via the Phase 3 emit-regression pipeline (matrix entry + `matrixEntryId` backlink), using the regression-test identifiers listed above as its evidence citations. This plan deliberately did NOT touch `test/fixtures/fix-queue.json` or `test/fixtures/capture-regression-matrix.json` — that lock-in step belongs to plan 06-06 per this plan's own success criteria ("the inputs plan 06-06 needs to flip every named entry to locked").
- No blockers. `STATE.md` / `ROADMAP.md` were intentionally left untouched per this execution's instructions — the orchestrator owns those writes after all wave-3 worktree agents (this plan and 06-04) complete.

---
*Phase: 06-backlog-digestion-policy-fix-reverify*
*Completed: 2026-07-04*
