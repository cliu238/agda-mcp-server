---
phase: 09-residual-v1-0-debt-sweep
verified: 2026-07-04T21:40:56Z
status: passed
score: 30/30 must-haves verified (backing 5/5 ROADMAP success criteria)
overrides_applied: 0
human_verification:
  - test: "Confirm the commitDrainedActions concurrency contract (src/agda/session-capture/recorded-transport.ts) has no other caller-side pitfall under real MCP client concurrent-dispatch behavior, beyond the single production call site and the mocked-injection regression test already in place."
    expected: "A domain expert confirms that trusting the caller's own `actions.length` (rather than re-deriving it) is safe for every real interleaving the MCP SDK's stdio transport can produce, not just the one simulated in test/unit/tools/register-capture-session.test.ts's 'preserves an action recorded concurrently' test."
    why_human: "09-REVIEW-FIX.md's own WR-01 fix entry is explicitly logged as 'Status: fixed: requires human verification' and states verbatim: 'a human should confirm the commitDrainedActions contract ... has no other caller-side pitfall before this phase proceeds to verification.' This is real-time/concurrent-dispatch behavior across an external (MCP client) boundary — exactly the class of thing static analysis and a single from-RED/GREEN unit test can support but not fully discharge. The verifier independently confirmed (see evidence below) that register-capture-session.ts is the ONLY production caller of drainRecordedActions/commitDrainedActions, and that `actions.length` is captured synchronously in the same statement as the drain (no intervening await), which substantially de-risks the concern — but the fixer's own explicit request for a human sign-off on a data-loss-prevention path central to the project's stated core value is honored rather than silently overridden."
---

# Phase 9: Residual v1.0 Debt Sweep Verification Report

**Phase Goal:** Every P2 tech-debt item recorded in `milestones/v1.0-MILESTONE-AUDIT.md` is resolved — deleted, fixed, or explicitly decided-and-recorded — so v1.0's accumulated non-blocking findings don't silently carry forward into the next milestone.
**Verified:** 2026-07-04T21:40:56Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Method

This report is based on direct codebase inspection, not SUMMARY.md narrative. Concretely: read every current source file this phase claims to have changed; ran `npx tsc -p tsconfig.test.json --noEmit` myself (exit 0); ran the full `npx vitest run` suite myself (216 files / 1807 tests passed, 0 failed, 178 skipped — matches SUMMARY claims independently); ran the one `RUN_AGDA_INTEGRATION=1`-gated integration test with a real local Agda 2.8.0 binary (3/3 passed); ran `npm run build` and `npm run verify` (both exit 0); independently re-derived the 09-SECURITY.md source-to-output threat-ID diff from the ten source PLAN.md files myself (39 unique source IDs, zero missing, one intentional addition — matches the plan's claim exactly); verified all 17 cited commit hashes exist in `git log`; and diffed commit `00a052c` by hand to confirm the agda-transport.test.ts fix is genuinely type-only.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---------|--------|----------|
| 1 | `scripts/verify-cold-replay.mjs` resolved (deleted, superseded by ORCL-01, zero importers), decision + evidence recorded. (DEBT-01) | VERIFIED | File does not exist (`ls` → "No such file or directory"); zero references anywhere in `scripts/`, `src/`, `test/` (grep -rn returns nothing); `.planning/PROJECT.md` line 114 records the DEBT-01 decision row with zero-importer rationale. |
| 2 | Dead-ended `.agda-mcp/captures/index.json` write in `promote-capture.mjs` retired, stale header comment fixed. (DEBT-02) | VERIFIED | File does not exist; `dogfood-run.mjs` contains zero `promoteCapture`/`isCaptureSession` references (grep -c → 0); `.planning/PROJECT.md` line 115 records the DEBT-02 decision; the one integration test that exercised the retired behavior (`dogfood-proxy-passthrough.test.ts`) was updated and passes 3/3 under `RUN_AGDA_INTEGRATION=1` against a real Agda binary (independently re-run by the verifier). |
| 3 | `resetRecordedActions()` in `register-capture-session.ts` reordered to run only after a successful `writeFileAtomic`, closing WR-01. (DEBT-03) | VERIFIED | Current source confirms `writeFileAtomic` (line 197) executes before the buffer-clearing call (line 212); the review chain further hardened this beyond the original plan (see Note below) — `commitDrainedActions(actions.length)` now removes exactly the drained prefix instead of blanket-clearing, closing a real concurrent-drop race the original reorder introduced. Three durability/happy-path/concurrency tests all pass and are non-vacuous (read in full; genuine positive assertions, not absence-only checks). |
| 4 | Four Phase-5 Info findings fixed: IN-01 (argv/run-id sanitization), IN-02 (dangling-symlink handling), IN-04 (git check-ignore exit-status ambiguity), IN-05 (wrapup catch-handler re-dereference). (DEBT-04) | VERIFIED | `assertSafeRunId` exported and enforced in both `dogfood-run.mjs:110` and `dogfood-wrapup.mjs:434` (rejects `--`-prefixed, `/`/`\`-containing, `.`/`..` run-ids); `install-dogfood-skill.mjs:85,104` checks canonical-target existence before both `symlinkSync` call sites and `scriptMain` is wrapped in try/catch; `dogfood-install-skill.test.ts:85` asserts `caught?.status).toBe(1)` (not a bare `.toThrow()`); `dogfood-wrapup.mjs:533` hoists a single safe `stagedPath` used everywhere in the per-capture loop (raw `staged.stagedPath` appears exactly once, at the hoisting assignment). |
| 5 | Retroactive SECURITY.md covers Phase 5 + extended to network surfaces; `tsc -p tsconfig.test.json` clean; `.planning/codebase/` refreshed via `/gsd:map-codebase`. (DEBT-05, DEBT-06, DEBT-07) | VERIFIED | `09-SECURITY.md` exists (40-row register); verifier independently re-derived the source-to-output threat-ID diff from all 10 source PLAN.md files — zero source IDs missing, only the intentional `T-07-08b` addition present. `npx tsc -p tsconfig.test.json --noEmit` exits 0 (verifier-run, not SUMMARY-cited). `.planning/codebase/` contains 7 freshly-rewritten docs (commit `f7d638d`, verified in git log) with current v1.1-era content (STRUCTURE.md names `scripts/team/`, CONCERNS.md references the team-channel cron judge and E2E-01 — no stale pre-v1.1 content, no dangling references to the two deleted scripts). |

**Score:** 5/5 ROADMAP success criteria verified.

### Detailed Plan-Level Must-Haves (30 items across 6 plans)

All PLAN.md frontmatter `must_haves` (truths + artifacts + key_links) were checked individually against current source, not trusted from SUMMARY.md.

| Plan | Must-Have | Status | Evidence |
|------|-----------|--------|----------|
| 09-01 | Truth: both scripts deleted, decisions recorded with zero-importer evidence | VERIFIED | Confirmed above (SC1/SC2) |
| 09-01 | Truth: dogfood-run.mjs no longer calls dead-ended promotion path; stagedCaptures unaffected | VERIFIED | `recordToClientLine` present in both `dogfood-run.mjs:378` and `transcript-writer.mjs:129`; live `RUN_AGDA_INTEGRATION=1` re-run of `dogfood-proxy-passthrough.test.ts` (3/3 pass) directly proves stagedCaptures/run-report population is unaffected |
| 09-01 | Truth: no comment in scripts/ describes either deleted file as if it still exists | VERIFIED | `grep -rn "verify-cold-replay\|promote-capture" scripts/` returns zero matches (verifier-run) |
| 09-01 | Artifact: `.planning/PROJECT.md` contains "DEBT-01" | VERIFIED | Confirmed via grep, lines 114-115 |
| 09-01 | Key link: dogfood-run.mjs → transcript-writer.mjs via `recordToClientLine` | VERIFIED | Pattern present in both files |
| 09-02 | Truth: a writeFileAtomic failure leaves the buffer un-reset, proven by test | VERIFIED | `register-capture-session.test.ts:362` durability test forces `mkdirSync` to throw pre-write and asserts (positive `toContain`, not just absence) the drained action survives |
| 09-02 | Truth: register-capture-session.test.ts no longer touches shared fixture tree (WR-12) | VERIFIED | Verifier ran this file in isolation after deleting the stale fixture directory — directory does NOT reappear (`ABSENT`). Zero `TEST_FIXTURE_PROJECT_ROOT` references in the file (grep confirms 0; only `makeTempDir` used, 8 call sites) |
| 09-02 | Truth: WR-08 confirmed already resolved, recorded not silently skipped | VERIFIED | All 3 sites (`session.ts:322`, `session-process-lifecycle.ts:105,179`) independently grepped by verifier, each carries `lastDispatchedLoadArgv = []` with inline "(WR-08)" citation |
| 09-02 | Artifact: register-capture-session.ts contains "writeFileAtomic" | VERIFIED | 4 occurrences confirmed |
| 09-02 | Key link: `resetRecordedActions()` called only after `writeFileAtomic` resolves | VERIFIED (reinterpreted) | See Note A below — the review chain replaced the literal `resetRecordedActions()` call at this site with `commitDrainedActions(actions.length)`, a strictly stronger mechanism satisfying the same "clear only after a durable write" intent while also closing a concurrent-drop race. Literal regex from the plan's frontmatter no longer matches (verified); the semantic intent is verified true and hardened. |
| 09-03 | Truth: phase-scoped 09-SECURITY.md exists, consolidates Phase 5 + Phase 7 | VERIFIED | File exists, 40-row register, distinct from root vulnerability-disclosure SECURITY.md |
| 09-03 | Truth: plaintext Bearer key in retry queue explicitly documented as a widening | VERIFIED | Row T-07-08b + Accepted Risks Log entry AR-02 both present, correctly worded |
| 09-03 | Truth: every T-05-*/T-07-* threat ID present, zero dropped | VERIFIED | Verifier independently re-ran the source-to-output diff (not trusting SUMMARY's claim): 14 T-05 + 25 T-07 = 39 unique source IDs, all present in 09-SECURITY.md; only extra ID is the intentional T-07-08b |
| 09-03 | Artifact: 09-SECURITY.md contains "T-07-08" | VERIFIED | Present, plus the T-07-08b addition |
| 09-04 | Truth: all 20 owned files compile clean under tsc | VERIFIED | Full-repo `npx tsc -p tsconfig.test.json --noEmit` exits 0 (verifier-run) |
| 09-04 | Truth: `@ts-expect-error` placement reuses existing repo precedent | VERIFIED | Spot-checked against `test-all-continuing.test.ts`'s pattern; tsc confirms zero suppressed-but-unused directives |
| 09-04 | Truth: W5's fix-queue mock validated against real schema | VERIFIED | `dogfood-wrapup-filing.test.ts` imports real `fixQueueEntrySchema` and asserts `.parse(...).not.toThrow()` at two call sites (lines 167, 268) |
| 09-04 | Artifact: output-schema-invariants.test.ts contains "profiling" | VERIFIED | 5 occurrences confirmed |
| 09-05 | Truth: both CLIs reject flag-shaped/path-traversing run-ids (IN-01) | VERIFIED | `assertSafeRunId` logic read directly; rejects `--`-prefix, `/`, `\`, `.`, `..` |
| 09-05 | Truth: install-dogfood-skill.mjs never fakes success on dangling symlink, never crashes raw (IN-02) | VERIFIED | Existence check before both `symlinkSync` sites; `scriptMain` wrapped in try/catch |
| 09-05 | Truth: git-check-ignore test distinguishes exit codes (IN-04) | VERIFIED | `status === 1` assertion confirmed, not bare `.toThrow()` |
| 09-05 | Truth: corrupt stagedCaptures entry no longer aborts the run (IN-05) | VERIFIED | Hoisted `stagedPath` confirmed; raw `staged.stagedPath` appears exactly once in the file |
| 09-05 | Artifact: dogfood-wrapup-corrupt-capture-entry.test.ts, min 15 lines | VERIFIED | 171 lines |
| 09-05 | Key link: hoisted safe stagedPath in both try/catch of the per-capture loop | VERIFIED | `const stagedPath =` present once; used in both branches |
| 09-06 | Truth: tsc exits 0 repo-wide + permanent CI gate | VERIFIED | Verifier-run `tsc` exit 0; `.github/workflows/ci.yml` "Typecheck tests" step confirmed positioned before "Audit dependencies" |
| 09-06 | Truth: DEBT-07 map-codebase refresh explicitly deferred, not silently dropped | VERIFIED (and completed) | D-09 deferral recorded in PROJECT.md; verifier additionally confirmed the deferred work was ALSO actually executed afterward by the orchestrator (commit `f7d638d`, 7 docs refreshed with current v1.1-era content) |
| 09-06 | Truth: agda-transport.test.ts fixes are type-only, pass count identical | VERIFIED | Verifier manually diffed commit `00a052c` — every changed line is a type annotation, cast, or comment; re-ran the file (19/19 pass, matches SUMMARY's claimed before/after count) |
| 09-06 | Artifact: .github/workflows/ci.yml contains "typecheck:test" | VERIFIED | Confirmed |
| 09-06 | Artifact: package.json contains "typecheck:test" | VERIFIED | Confirmed |
| 09-06 | Key link: ci.yml's Typecheck tests step runs `npm run typecheck:test` | VERIFIED | Confirmed |

**Score:** 30/30 plan-level must-haves verified.

**Note A (Inversion check on 09-02's key_link):** The plan's frontmatter literally specified the pattern `writeFileAtomic\(stagedPath[\s\S]*resetRecordedActions\(\)`. This regex no longer matches the current file (verified: `false`) because the post-plan review chain (`09-REVIEW.md` finding WR-01 → `09-REVIEW-FIX.md` commit `0d66569`) replaced the plain `resetRecordedActions()` call at that site with `commitDrainedActions(actions.length)`. This is a documented, in-scope, same-phase evolution — not a silent deviation — recorded in three places (09-REVIEW.md, 09-REVIEW-FIX.md, and in-code comments citing "WR-01 concurrent-drop fix"). The underlying intent (defer buffer-clearing until after a durable write) is preserved and the mechanism is objectively stronger (it no longer discards actions recorded by a second, concurrently in-flight tool call during the write's async window). Treated as VERIFIED via reinterpretation per the standard "approach A → approach B, intent preserved" rule, not as a literal pattern match.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/verify-cold-replay.mjs` | Does not exist | VERIFIED | Confirmed absent |
| `scripts/promote-capture.mjs` | Does not exist | VERIFIED | Confirmed absent |
| `.planning/PROJECT.md` | Contains DEBT-01/DEBT-02/D-09 decision rows | VERIFIED | All three rows present with evidence |
| `src/tools/register-capture-session.ts` | Write-before-commit ordering | VERIFIED | 250 lines, under 500-line ceiling |
| `src/agda/session-capture/recorded-transport.ts` | commitDrainedActions (prefix-only clear) | VERIFIED | 131 lines, under ceiling, well-documented |
| `.planning/phases/09-residual-v1-0-debt-sweep/09-SECURITY.md` | 40-row consolidated register | VERIFIED | Independently diffed against source, zero gaps |
| `test/unit/tools/output-schema-invariants.test.ts` | profiling-complete fixtures | VERIFIED | 5 occurrences |
| `test/unit/tools/dogfood-wrapup-corrupt-capture-entry.test.ts` | IN-05 regression, ≥15 lines | VERIFIED | 171 lines |
| `.github/workflows/ci.yml` | Permanent typecheck:test CI gate | VERIFIED | Positioned before Audit step |
| `package.json` | typecheck:test script | VERIFIED | Present, mirrors `build`'s shape |
| `.planning/codebase/*.md` (7 files) | Refreshed v1.1-era snapshot | VERIFIED | Current content, no stale references, commit `f7d638d` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `dogfood-run.mjs` | `transcript-writer.mjs` | `recordToClientLine` populates stagedCaptures unconditionally | VERIFIED | Confirmed in both files; live-tested with RUN_AGDA_INTEGRATION=1 |
| `register-capture-session.ts` | `recorded-transport.ts` | buffer-commit only after successful write | VERIFIED (reinterpreted — see Note A) | `commitDrainedActions` supersedes the plan's literal `resetRecordedActions()` reference with a stronger mechanism |
| `dogfood-wrapup.mjs` | `dogfood-wrapup.mjs` | hoisted safe `stagedPath` in both try/catch branches | VERIFIED | `const stagedPath =` appears once, used throughout |
| `.github/workflows/ci.yml` | `package.json` | verify job's Typecheck tests step runs `npm run typecheck:test` | VERIFIED | Both files contain `typecheck:test`; correct step ordering |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full repo type-checks clean under test config (DEBT-06) | `npx tsc -p tsconfig.test.json --noEmit` | exit 0, zero errors | PASS |
| Full test suite green | `npx vitest run` | 216 files / 1807 tests passed, 0 failed, 178 skipped | PASS |
| DEBT-02's retired auto-persist behavior regression-verified live | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/dogfood-proxy-passthrough.test.ts` (real Agda 2.8.0 binary) | 3/3 passed | PASS |
| Production build unaffected | `npm run build` | exit 0 | PASS |
| Full verify gate (test + pack dry-run) | `npm run verify` | exit 0, tarball built | PASS |
| WR-12 isolation genuinely holds for its target file | Removed stale fixture dir, ran `register-capture-session.test.ts` alone | directory stays ABSENT afterward | PASS |
| 09-SECURITY.md completeness | Independent `comm -23`/`comm -13` diff of 10 source PLAN.md files vs. register | 0 missing, 1 intentional addition (T-07-08b) | PASS |
| agda-transport.test.ts diff is genuinely type-only | Manual `git show 00a052c` line-by-line review | Every changed line is a type annotation/cast/comment | PASS |

### Probe Execution

SKIPPED (no runnable probes) — no `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in this phase's PLAN/SUMMARY files. This project does not use the probe convention; behavioral verification above (tsc, vitest, build, verify, live integration test) substitutes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DEBT-01 | 09-01 | `verify-cold-replay.mjs` resolved (deleted), decision recorded | SATISFIED | File deleted, zero importers, PROJECT.md row present |
| DEBT-02 | 09-01 | `promote-capture.mjs` dead write retired, comment fixed | SATISFIED | File deleted, call site removed, live integration test confirms no regression |
| DEBT-03 | 09-02 | WR-01 durability reorder | SATISFIED | Reordered and further hardened (concurrent-drop fix); see human-verification item for final sign-off request |
| DEBT-04 | 09-05 | IN-01/IN-02/IN-04/IN-05 fixed | SATISFIED | All four independently confirmed in current source + tests |
| DEBT-05 | 09-03 | Retroactive SECURITY.md, Phase 5 + network surfaces | SATISFIED | 40-row register, independently diff-verified complete |
| DEBT-06 | 09-04, 09-06 | tsc seam errors fixed, permanent CI gate | SATISFIED | tsc exits 0 repo-wide (verifier-run); CI gate wired and positioned correctly |
| DEBT-07 | 09-06 | `.planning/codebase/` refreshed | SATISFIED | Deferral recorded AND the refresh itself completed (commit f7d638d) with current content |

No orphaned requirements: `.planning/REQUIREMENTS.md`'s DEBT section maps exactly DEBT-01 through DEBT-07 to Phase 9, and all seven appear in at least one plan's `requirements:` frontmatter field (09-01: DEBT-01/02; 09-02: DEBT-03; 09-03: DEBT-05; 09-04: DEBT-06; 09-05: DEBT-04; 09-06: DEBT-06/07).

**Milestone audit cross-check (self-derived, not copied from SUMMARY):** every P2 item enumerated in `v1.0-MILESTONE-AUDIT.md`'s `tech_debt` list was independently mapped and accounted for: WR-01/WR-08/WR-12/CR-01/CR-02/verify-cold-replay-orphan (phase 01) → DEBT-01/DEBT-03; W1 (phase 04) → DEBT-02; W2 (phase 05) → already resolved by Phase 6/POLICY-01 (out of Phase 9 scope, correctly not re-litigated); the 4 Info findings (phase 05) → DEBT-04; W4/W5 (repo-wide) → DEBT-06; no-SECURITY.md (repo-wide) → DEBT-05; codebase drift (repo-wide) → DEBT-07; 8 needs-reverify entries (repo-wide) → already resolved by Phase 6/REVERIFY-01 (out of Phase 9 scope). Zero audit items are unaccounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 38-44, 95-101 | DEBT-01..07 checkboxes still `[ ]` and Traceability table still shows "Pending" despite ROADMAP.md already marking Phase 9 `[x]` complete | INFO | Documentation/tracking staleness only — does not affect the underlying code deliverables, which are independently verified above. Consistent with `.planning/STATE.md` also still showing "Plan: 1 of 6" / 0% progress — this bookkeeping is evidently updated by the orchestrator after a verification pass completes, which is the step this report feeds into. Flagging so the post-verification update sweep includes these two files. |
| `.planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md` | 22 vs. 30 | Frontmatter says `status: clean` / `warning: 0` (reflecting post-fix state) but body prose still reads `**Status:** issues_found` | INFO | Internal inconsistency within the review artifact itself, left over from the fix-annotation pass not touching the body's status line. Zero functional impact — the underlying WR-01/02/03 fixes are independently verified as real and committed. |
| `.github/workflows/ci.yml` | verify job | No explicit `permissions:` block (contrast with `integration` job) | INFO | Pre-existing gap, explicitly flagged as `09-REVIEW.md`'s IN-03 and deliberately left out of this phase's fix scope (`09-REVIEW-FIX.md`: "IN-01/IN-02/IN-03 explicitly out of scope per objective"). Policy-consistent, not a regression introduced by this phase. |
| `scripts/dogfood/dogfood-run.mjs` + `dogfood-wrapup.mjs` | `assertSafeRunId` | Identical validation function duplicated verbatim across two files | INFO | Flagged as `09-REVIEW.md`'s IN-01 (not a DEBT-04 IN-01 — different numbering scheme, review-local). Both copies are currently correct; a future validation-rule change applied to only one file would under-validate the other. Left open per this phase's own explicit `<verify>` scope; not a blocker. |
| `test/unit/session/agda-transport.test.ts` | 6 mock sites | Type-only fix widens mock signatures to `(...args: any[]): any` | INFO | Flagged as `09-REVIEW.md`'s IN-02 (review-local numbering). Confirmed genuinely behavior-preserving; opts these 6 call sites out of the new typecheck gate's argument-shape checking specifically. Left open per review-fix's explicit scope decision (Info-level, not urgent). |

No debt markers (`TBD`/`FIXME`/`XXX`) found in any phase-modified file — debt-marker gate does not trigger.

## Human Verification Required

### 1. WR-01 concurrency contract final sign-off

**Test:** Review `commitDrainedActions(drainedCount)` in `src/agda/session-capture/recorded-transport.ts` and its one call site in `src/tools/register-capture-session.ts:212`. Confirm that trusting the caller's own `actions.length` (rather than re-deriving a count) cannot be violated by any real MCP client dispatch pattern, not just the one simulated interleaving in `test/unit/tools/register-capture-session.test.ts`'s "preserves an action recorded concurrently" test (line 476).

**Expected:** Either explicit confirmation that the single-caller, synchronous-capture-of-`actions.length` design is sound for all realistic concurrent dispatch patterns the MCP SDK's stdio transport can produce, or a follow-up item if a gap is found.

**Why human:** This is the review-fix step's own explicit request (`09-REVIEW-FIX.md`: "Status: fixed: requires human verification ... a human should confirm the commitDrainedActions contract ... has no other caller-side pitfall before this phase proceeds to verification"), addressed specifically to this verification step. It concerns real-time, concurrent-dispatch behavior across an external (MCP client) boundary — the class of thing a from-RED/GREEN unit test can support but not fully discharge, since the test simulates one specific interleaving rather than proving all possible ones. The verifier's own investigation (see Note A and the DEBT-03 row above) found `register-capture-session.ts` is the ONLY production caller of `drainRecordedActions`/`commitDrainedActions`, and `actions.length` is read synchronously in the same statement as the drain with no intervening `await` — this substantially de-risks the concern but does not eliminate the need for the domain sign-off the fixer explicitly asked for on a path central to this project's stated core value ("every real proof session reliably converts into a stronger server").

## Gaps Summary

No must-have failed. All 5 ROADMAP success criteria and all 30 plan-level must-haves (truths, artifacts, key links) across the phase's 6 plans are VERIFIED against the actual current codebase — not merely asserted by SUMMARY.md. Independent verifier-run checks (full `npx tsc -p tsconfig.test.json --noEmit`, full `npx vitest run`, a live `RUN_AGDA_INTEGRATION=1` integration test against a real Agda binary, `npm run build`, `npm run verify`, and an independent re-derivation of the 09-SECURITY.md threat-ID completeness diff) all corroborate the phase's own claims. The post-plan review chain (`09-REVIEW.md` → `09-REVIEW-FIX.md`) caught and genuinely fixed a real concurrency bug (WR-01's concurrent-drop race) that the original plan would have missed, and DEBT-07's codebase-map refresh was not only deferred-and-recorded but actually completed by the time of this verification.

The phase is blocked from an unconditional `passed` status only by one explicitly self-flagged item: the review-fix chain's own request for a human to sign off on the WR-01 concurrency contract before the phase proceeds past verification. This is not a code gap — it is an appropriately conservative escalation on a data-loss-prevention path, and the verifier's independent investigation (single caller, synchronous count capture, genuine from-RED test) gives the human reviewer a fast path to close it out.

Three INFO-level items are noted for completeness (REQUIREMENTS.md/STATE.md tracking staleness, a cosmetic frontmatter/body inconsistency in 09-REVIEW.md, and three deliberately-deferred review Info findings) — none block phase goal achievement and none require a closure plan.

---

*Verified: 2026-07-04T21:40:56Z*
*Verifier: Claude (gsd-verifier)*


---

## Human Verification Sign-Off (2026-07-04)

The single human_needed item (WR-01 `commitDrainedActions` concurrency contract) was resolved by USER DECISION: "加护栏后签字" (add the guard, then sign off). The residual double-drain interleaving (two concurrently in-flight `agda_capture_session` calls over-slicing the buffer) is now structurally impossible: a module-level in-flight guard serializes captures — a second concurrent call receives an explicit `capture-busy` error envelope instead of draining. Commit `75dd826`, from-RED verified (guard neutralized → new regression test fails with C2 succeeding; guard restored → 8/8 green). Full gates re-run clean: src tsc, typecheck:test, build, full vitest suite. The "trust the caller's count" contract now holds unconditionally.
