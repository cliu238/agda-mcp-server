---
phase: 06-backlog-digestion-policy-fix-reverify
plan: 03
subsystem: testing
tags: [agda, mcp, dogfooding, fix-queue, oracle-triad, regression-triage, backlog-digestion, oracle-tooling-fidelity]

# Dependency graph
requires:
  - phase: 06
    plan: "06-02"
    provides: "RT1-RT4 re-verified (RT1 cannot-reproduce, RT2/RT3/RT4 confirmed); proven RT re-verification driver pattern (tmp/rt-driver.mjs); RT-REVERIFY.md report skeleton with the RT5-RT8 continuation marker"
  - phase: 06
    plan: "06-01"
    provides: "POLICY-01 --policy passthrough on run-oracle.mjs/dogfood-wrapup.mjs (not directly exercised here, since rt-local-fixture corpus falls back to .agda-lib-derived no-policy, same as 06-02)"
provides:
  - "Definitive, pipeline-measured verdicts for RT5-RT8 (the remaining 4 of the 8 needsReverify CHG defect specs): all 4 CONFIRMED (RT6 specifically as missing-feature)"
  - "test/fixtures/fix-queue.json transitions: RT5, RT6, RT7, RT8 -> triaged, needsReverify:false; RT5's defectKind corrected wrong-result -> false-green to match this queue's own established false-green vocabulary"
  - "Zero fix-queue entries remain needsReverify:true -- REVERIFY-01's mechanical success-criterion gate is green"
  - "Completed, committed evidence report .planning/research/RT-REVERIFY.md with all 8 RT verdict sections, an 8-row summary table, and a closing REVERIFY-01 acceptance paragraph"
  - "A newly-discovered, precisely-diagnosed fidelity gap in scripts/oracle/orcl-01-differential.mjs (does not replicate runLoad's needsExplicitHoleScan gate before computing sourceHoleCount), found as a byproduct of the RT6 investigation and flagged for plan 06-06, not fixed here (out of this plan's committed file scope)"
  - "Two oracle-triad auto-filed queue entries (1b612dfeb1d31ea9, 1220f2840142aab8) investigated per D-08 and cross-referenced into their originating RT5/RT6 entries rather than left as disconnected new rows"
affects: [06-04, 06-05, 06-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reused 06-02's RT re-verification driver pattern verbatim (tmp/rt-driver.mjs extended with rt5-rt8 branches, gitignored) -- same dogfood-run.mjs -> capture -> dogfood-wrapup.mjs pipeline, same per-RT disposable corpus dirs under tmp/rt-reverify/"
    - "In-session A/B tool comparison: driving the IDENTICAL out-of-band corruption maneuver against two different tools (agda_load_no_metas then agda_load) in one session to produce a definitive side-by-side diff, rather than relying on a separate historical measurement for the comparison baseline (used for RT8)"
    - "D-08 auto-file triage protocol: when dogfood-wrapup.mjs independently auto-files a candidate during an RT re-verification session, investigate whether it is (a) genuine on-topic corroboration of the same incident (RT5's case) or (b) an artifact of the oracle tooling's own implementation drift from the live server's logic (RT6's case) -- cross-reference via relatedFingerprint either way, never leave a disconnected new row, and correct the record explicitly in notes when (b) applies"

key-files:
  created: []
  modified:
    - test/fixtures/fix-queue.json
    - .planning/research/RT-REVERIFY.md
    - test/unit/fixtures/fix-queue.test.ts

key-decisions:
  - "RT5's defectKind corrected from the seeded wrong-result to false-green: the confirmed shape (ok:true/applied:true wrapping a real reload failure) is byte-for-byte the same pattern this queue already classifies as false-green elsewhere (bfcba437f5426fd6, 5abecc959e43fef3/004d161b839ce725) -- a taxonomy consistency fix, not a new judgment call."
  - "RT5 was probed via agda_apply_edit rather than agda_give/agda_case_split/agda_refine (which the UX report's own evidence names): a give's accept path requires the expression to already type-check against the goal, so a WRITTEN give cannot independently fail to reload under normal conditions. agda_apply_edit's raw text substitution has no such precondition and reaches the identical shared code path (reloadAndDiagnose + registerTextTool's unconditional okEnvelope wrap), confirmed by source inspection to affect every write-capable proof tool identically."
  - "RT6 verdict (missing-feature, not a schema rewrite recommendation itself) names the two still-conflated distinctions precisely: source hole syntax has no field of its own (folds into a boolean hasHoles that can go fully invisible when a hole co-occurs with an unrelated hard error, reproduced live), and constraints has no field on agda_load's schema at all (cross-referenced to the already-tracked fdc90bfde12fb938 agda_proof_status entry, not double-counted)."
  - "The RT6 auto-filed queue entry (1220f2840142aab8) is NOT a second independent agda_load defect -- root-cause analysis traced it to scripts/oracle/orcl-01-differential.mjs computing sourceHoleCount unconditionally, while the live server's runLoad only does so behind a needsExplicitHoleScan gate (parsed.success must be true). This is a fidelity gap in the ORACLE's own cold-replay reimplementation, documented precisely in that entry's notes and flagged for plan 06-06 as a scripts/-only one-line fix, out of this plan's committed file scope."
  - "RT7's timeout-injection env var (AGDA_MCP_COMMAND_TIMEOUT_MS=300) was set on exactly one driver invocation, verified unset before the separate dogfood-wrapup.mjs command, per T-06-09's mitigation against leaking the fault-injection lever into the oracle's own cold-spawn probes."
  - "RT8's driver performs the out-of-band Dep.agda corruption maneuver twice in one session (once against agda_load_no_metas, once against agda_load) specifically to make the previous+new+reason comparison apples-to-apples on the byte-identical fixture in the byte-identical session, rather than relying on CHG-REVERIFY.md's separate historical measurement as the agda_load baseline."
  - "Split the two task commits along the true intermediate data state (RT5+RT6 first, RT7+RT8 second), including the two intermediate edits to the companion test's length/needsReverify count assertions, mirroring 06-02's own precedent -- even though the underlying live investigation for all 4 RTs was run in one continuous session for pipeline-reuse efficiency, the commit history reconstructs the correct per-task checkpoint via a sanctioned git checkout -- <file> + re-edit sequence (never a blanket reset)."

requirements-completed: [REVERIFY-01]

# Metrics
duration: ~50min
completed: 2026-07-04
---

# Phase 6 Plan 03: RT5-RT8 Backlog Re-Verification Summary

**Re-verified RT5-RT8 live through the shipped dogfood-run/capture/wrapup pipeline against current main: all 4 CONFIRMED (RT5 mutation-tool false-success, RT6 agda_load five-state conflation as missing-feature, RT7 misleading timeout diagnostics, RT8 agda_load_no_metas's total silence on stale-reload transitions) — completing REVERIFY-01 with zero needsReverify entries remaining, plus a precisely-diagnosed oracle-tooling fidelity gap discovered as a byproduct and flagged for the next wave.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-04
- **Tasks:** 2/2 completed
- **Files modified:** 3 (all pre-existing) across 2 commits

## Accomplishments

- Ran 4 live MCP sessions (rt5, rt6, rt7, rt8) through `dogfood-run.mjs` -> `agda_capture_session` -> `dogfood-wrapup.mjs` against small disposable fixtures (plus the committed `FixtureDeps/TransitiveStaleness/` tree for RT8), reusing plan 06-02's rig verbatim and extending its driver script with 4 new spec branches.
- Reached a definitive, schema-valid CONFIRMED verdict for all 4 assigned RT specs, closing out REVERIFY-01: `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` now returns **0** across all 8 originally-seeded RT specs.
- Corrected RT5's `defectKind` (wrong-result -> false-green) to match this queue's own established taxonomy for an `ok:true` response wrapping a real failure.
- For RT6, live-reproduced the UX report's Finding #4 historical symptom (`goalCount:0, invisibleGoalCount:0, hasHoles:false` while a genuinely-present hole is silently unscanned due to an unrelated hard error) and pinpointed the exact source-level gate responsible (`needsExplicitHoleScan` in `src/agda/session-load-impl.ts`).
- For RT8, ran an in-session A/B comparison (the identical out-of-band dependency corruption applied to `agda_load_no_metas` then to `agda_load`) that conclusively shows `agda_load_no_metas` reports none of the previous+new+reason signal `agda_load` correctly reports for the identical maneuver.
- Investigated 2 oracle-triad auto-filed queue entries per D-08: one (RT5's) is a genuine, on-topic corroboration of the same incident; the other (RT6's) turned out to be a previously-unknown fidelity gap inside `scripts/oracle/orcl-01-differential.mjs` itself (it does not replicate the live server's own hole-scan gating), documented precisely and flagged for plan 06-06 rather than misattributed as a second independent server defect.
- Completed `.planning/research/RT-REVERIFY.md`: full 8-row summary table, RT5-RT8 verdict sections, extended Methodology Notes, and a closing "REVERIFY-01 acceptance" paragraph.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-verify RT5 (mutation-tool reload failure) + RT6 (five-state conflation)** - `ca17412` (fix)
2. **Task 2: Re-verify RT7 (timeout identification) + RT8 (stale-reload combined classification) and close out REVERIFY-01** - `240b849` (fix)

_Note: both tasks touch the same three plan-scoped files (`test/fixtures/fix-queue.json`, `.planning/research/RT-REVERIFY.md`, and the companion test `test/unit/fixtures/fix-queue.test.ts`). The 4 live driver sessions (rt5-rt8) were run together in one continuous investigation for pipeline-reuse efficiency, but the commit history was reconstructed to reflect the true per-task intermediate state (RT5+RT6 transitioned and committed first, RT7+RT8 second) via a sanctioned `git checkout -- <file>` + re-apply sequence on the files this task actively modified — mirroring 06-02's own commit-splitting precedent, including two intermediate edits to the companion test's count assertions (13/4 -> 15/2 -> 15/0)._

## Files Created/Modified

- `.planning/research/RT-REVERIFY.md` - Extended (not replaced) 06-02's report: header updated to note plan 06-03's base commit, summary table completed to 8 rows, RT5/RT6/RT7/RT8 verdict sections appended with Verdict/v0.6.7-claim/Repro/Observed/Implication structure matching RT1-4, a "Plan 06-03 additions" Methodology Notes subsection, and a closing "REVERIFY-01 acceptance" paragraph stating the grep-gate result.
- `test/fixtures/fix-queue.json` - RT5 (`a0ae86c7deb9754e`) -> `status: "triaged"`, `needsReverify: false`, `defectKind` corrected `wrong-result -> false-green`, `relatedFingerprint: ["1b612dfeb1d31ea9"]`. RT6 (`ad2b6d31f58f1759`) -> `status: "triaged"`, `needsReverify: false`, `relatedFingerprint` extended with `1220f2840142aab8`. RT7 (`b6821f42952c6ff8`) -> `status: "triaged"`, `needsReverify: false`. RT8 (`3306edf4c2d01c53`) -> `status: "triaged"`, `needsReverify: false`. Linked entry `fdc90bfde12fb938` notes gained the RT6 cross-reference line (status unchanged, per Task 1's acceptance criteria). Two new oracle-auto-filed entries (`1b612dfeb1d31ea9`, `1220f2840142aab8`) enriched with `relatedFingerprint` back-links and detailed root-cause notes (D-08). All flipped entries' `notes` append the re-verification date, run-id, and full evidence per D-07.
- `test/unit/fixtures/fix-queue.test.ts` - Updated the hardcoded entry-count assertion (13 -> 15, tracking the 2 oracle-auto-filed entries) and the `needsReverify: true` count assertion (4 -> 0, tracking this plan's RT5-RT8 transitions), renaming both test descriptions to name what changed and why.

## Decisions Made

See `key-decisions` in frontmatter for the full list. The most consequential: (1) RT5's `defectKind` correction (taxonomy consistency, not a new finding), and (2) distinguishing RT5's auto-filed oracle entry (genuine corroboration) from RT6's auto-filed oracle entry (an oracle-tooling implementation bug, not a second server defect) — getting this distinction right matters because misattributing (2) as "RT6 confirmed twice, independently" would have inflated confidence in a finding that is actually about `scripts/oracle/orcl-01-differential.mjs`'s own code, not `agda_load`'s response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale hardcoded seed-data assertions in fix-queue.json's validating companion test**
- **Found during:** Task 1 (after applying RT5/RT6 queue transitions, which also triggered 2 oracle auto-filings)
- **Issue:** `test/unit/fixtures/fix-queue.test.ts` asserted exactly 13 total entries and exactly 4 `needsReverify: true` entries — both snapshots of the pre-plan state. This plan's purpose (transition RT5-RT8 out of `needsReverify: true`) plus the oracle's own auto-filing during the RT5/RT6 live sessions makes both assertions stale by design.
- **Fix:** Updated both assertions in lockstep with the actual data transitions (13->15 total entries once the two oracle auto-filings landed in Task 1; `needsReverify: true` count 4->2 after Task 1's RT5+RT6 edits, 2->0 after Task 2's RT7+RT8 edits), renaming both test descriptions to name what they now assert.
- **Files modified:** `test/unit/fixtures/fix-queue.test.ts`
- **Verification:** `npx vitest run test/unit/fixtures/fix-queue.test.ts` (10/10 passing) re-run after every edit to `fix-queue.json`, at both the Task 1 intermediate state and the Task 2 final state.
- **Committed in:** `ca17412` (Task 1, 13/4 -> 15/2) and `240b849` (Task 2, 15/2 -> 15/0)

**2. [Rule 1 - Bug] RT5's seeded `defectKind` did not match this queue's own established taxonomy**
- **Found during:** Task 1, while writing RT5's evidence notes
- **Issue:** RT5 was seeded with `defectKind: "wrong-result"`, but the confirmed live shape (an `ok:true` response wrapping a real reload failure, with the failure only visible in free-form prose) is structurally identical to `bfcba437f5426fd6` and `5abecc959e43fef3`/`004d161b839ce725`, both already classified `false-green` in this exact file — and `false-green` outranks `wrong-result` in QUEUE-02's forced priority ordering, so the mismatch would have affected future fix-order sequencing.
- **Fix:** Corrected `defectKind` to `false-green`, documented the correction and its rationale explicitly in the entry's own `notes` field.
- **Files modified:** `test/fixtures/fix-queue.json`
- **Verification:** `npx vitest run test/unit/fixtures/fix-queue.test.ts` passes (the schema accepts any of the 4 enum values; this is a semantic correction, not a schema-validation fix).
- **Committed in:** `ca17412` (Task 1)

---

**Total deviations:** 2 auto-fixed (both Rule 1)
**Impact on plan:** Both fixes were necessary to keep the plan's own stated verification gates (`npx vitest run test/unit/fixtures/fix-queue.test.ts` passes, `grep -c '"needsReverify": true' ... == 0`) truthful and to keep the queue's own priority-ordering metadata internally consistent. No scope creep — both changes are confined to the two files this plan already owns.

## Known Stubs

None. No UI or data-rendering components were touched by this plan; the changes are confined to the fix-queue SSOT and a research/evidence markdown report.

## Threat Flags

None. This plan's threat register (T-06-09 through T-06-11, T-06-SC) covers driver-env leakage, fix-queue tampering, verdict-provenance repudiation, and supply-chain — all of which were followed exactly as written (RT7's timeout env var scoped to one invocation; every queue edit re-validated against the schema test; run-ids/commit SHA/Agda version recorded in RT-REVERIFY.md; zero new dependencies installed). No new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries were introduced by this plan's own file changes.

## Issues Encountered

- **The oracle triad auto-filed 2 of the 4 RT5-RT8 sessions** (unlike 06-02's clean 0-for-5), requiring careful root-cause analysis per D-08 before deciding disposition rather than assuming either "independent new bug" or "safe to ignore." RT5's auto-file traced cleanly to the intentional test setup (a non-load-family-named mutation tool leaving the oracle's warm-tuple reference stale) and is documented as genuine corroboration. RT6's auto-file required deeper investigation — comparing `scripts/oracle/orcl-01-differential.mjs`'s cold-replay logic line-by-line against the live server's `runLoad()` — before concluding it is an oracle-tooling fidelity gap (`countExplicitSourceHoles` called unconditionally in the oracle vs. gated behind `needsExplicitHoleScan` in the live server), not a second independent `agda_load` defect. Both are resolved, cross-referenced, and precisely documented; the RT6 oracle-tooling finding is explicitly flagged for plan 06-06's attention as a distinct, out-of-scope item (a `scripts/`-only one-line fix, outside this plan's committed file scope of `test/fixtures/fix-queue.json` and the RT-REVERIFY.md report).
- No other blockers. All 4 driver sessions ran cleanly against the real `agda` 2.8.0 binary on the first attempt (including RT7's timeout-injection env var, which reliably reproduced at the plan's suggested starting value of 300ms — the documented 50ms fallback was never needed).

## User Setup Required

None - no external service configuration required. All work ran and verified on the local machine using the already-installed `agda` 2.8.0 binary and the existing built `dist/index.js` (no `src/` changes in this plan, so no rebuild was needed).

## Next Phase Readiness

- REVERIFY-01 is fully complete: all 8 RT1-RT8 specs have definitive, schema-valid, evidence-backed verdicts. `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` == 0, confirmed by `npx vitest run test/unit/fixtures/fix-queue.test.ts` (10/10 green) and the full `test/unit` suite (1320 passed, 17 skipped, no regressions from this plan's changes).
- The D-12 gate for waves 3+ (fix -> lock) is now open: all 8 pre-fix measurements are on record. D-09's confirmed set for REVERIFY-02 stands at the 4 named entries (`5abecc959e43fef3`, `bfcba437f5426fd6`, `eb7439cb3ed9d6b9`, `fdc90bfde12fb938`) plus RT2-RT8's 6 confirmed specs (RT1 excluded as cannot-reproduce) plus the 2 oracle-auto-filed findings — this is the input set for whichever plan handles REVERIFY-02's fix-order planning.
- Two items are explicitly flagged for plan 06-06's disposition, per this plan's own instructions not to decide fix-vs-re-triage here: (1) RT6's response-schema rework (the UX report's "Suggested Schema Direction" — a deferred-ideas D-10 re-triage candidate), and (2) the newly-discovered `scripts/oracle/orcl-01-differential.mjs` fidelity gap (a small, scoped fix, but out of this plan's committed file scope).
- No blockers. `tmp/rt-reverify/rt{5,6,7,8}/`, the extended `tmp/rt-driver.mjs`, and `.agda-mcp/runs/rt{5,6,7,8}-20260703/` (including `wrapup-report.json` for each) remain on disk (gitignored) as durable local evidence, per the sequential-execution instruction not to delete or relocate capture artifacts.
- REQUIREMENTS.md/STATE.md/ROADMAP.md tracking updates for this plan are intentionally NOT performed here — per this session's explicit instruction, the orchestrator centrally owns tracking writes for this phase.

## Self-Check: PASSED

- FOUND: `.planning/research/RT-REVERIFY.md`
- FOUND: `test/fixtures/fix-queue.json`
- FOUND: `test/unit/fixtures/fix-queue.test.ts`
- FOUND: `.agda-mcp/runs/rt5-20260703/wrapup-report.json`
- FOUND: `.agda-mcp/runs/rt6-20260703/wrapup-report.json`
- FOUND: `.agda-mcp/runs/rt7-20260703/wrapup-report.json`
- FOUND: `.agda-mcp/runs/rt8-20260703/wrapup-report.json`
- FOUND commit: `ca17412`
- FOUND commit: `240b849`
- VERIFIED: `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` == 0
- VERIFIED: `npx vitest run test/unit/fixtures/fix-queue.test.ts` == 10/10 passing
- VERIFIED: `npx vitest run test/unit` == 1320 passed, 17 skipped, 0 failed

---
*Phase: 06-backlog-digestion-policy-fix-reverify*
*Completed: 2026-07-04*
