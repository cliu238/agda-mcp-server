---
phase: 06-backlog-digestion-policy-fix-reverify
plan: 06
subsystem: testing

# Dependency graph
requires:
  - phase: 06
    plan: "06-04"
    provides: "agda_auto flag-injection fix + agda_give ok-wrapping fix, both with from-RED regression tests — the lock references this plan's Task 1 cites verbatim"
  - phase: 06
    plan: "06-05"
    provides: "agda_proof_status completeness-branch fix + agda_search_definitions directory-param fix, both with from-RED regression tests — the lock references this plan's Task 1 cites verbatim"
  - phase: 06
    plan: "06-03"
    provides: "RT5-RT8 pre-fix measurements in RT-REVERIFY.md, plus the discovered scripts/oracle/orcl-01-differential.mjs fidelity gap (queue entry 1220f2840142aab8) this plan dispositions"
provides:
  - "Terminal fix-queue.json ledger: 9 locked, 5 triaged-with-recorded-DEFERRED-reason, 1 rejected (15 rows total) — REVERIFY-02 and REVERIFY-01 both mechanically complete"
  - "3 additional RT-confirmed defects fixed and locked from RED beyond the plan's mandatory named-4: RT2 (agda_infer/agda_compute silently decode a NotInScope rejection to ok:true), RT3 (agda_goal_type_context_check does the same), RT8 (agda_load_no_metas is silent on stale-reload transitions agda_load already reports)"
  - "RT-REVERIFY.md closing section: a 15-row final disposition table, acceptance-gate outputs, the emit-regression applicability statement, and a condensed D-11 mechanism note"
  - "Zero needsReverify:true and zero status:new rows remain in the fix queue; every triaged row's notes carry a literal, grep-able DEFERRED (Phase 6): reason"
affects: ["07", "future-milestone-queue-review"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Empirically verify a prior plan's root-cause note against a live Agda session BEFORE trusting it as the fix design: RT2's queue-recorded diagnosis (\"never calls throwOnFatalProtocolStderr\") was disproven by a temporary debug-instrumented live session against Agda 2.8.0 — the actual rejection arrives as an Error-kind DisplayInfo response, not stderr, so throwOnFatalProtocolStderr alone would have been a no-op fix that falsely claimed the entry locked"
    - "The info.kind === \"Error\" DisplayInfo-scan idiom (parse-load-responses.ts / backend.ts / give()'s detectResponseError, fingerprint bfcba437f5426fd6) reused a 4th time (a new local throwOnDisplayError() covering compute/computeTopLevel/infer/inferTopLevel) and a 5th time (goalTypeContextCheck() calling the existing detectResponseError() directly, same file)"
    - "RED-first verification via temporary full-file Write-tool revert + vitest run + restore, instead of git stash — avoids any stash-sharing risk even though this session runs on the main tree, not a worktree"
    - "D-10 appetite triage applied per remaining RT-confirmed entry: fix (RT2/RT3/RT8 — single-file, mechanical, consistent with an existing sibling function's pattern in the same file) vs. defer (RT5 — shared root cause spans 7 write-capable proof tools, needs a schema-level decision; RT6/RT7 — the plan's own pre-approved response-schema-rework / timeout-taxonomy deferral classes; the two oracle-auto-filed rows follow their host RT's disposition)"

key-files:
  created:
    - test/unit/agda/expression-operations.test.ts
    - test/unit/agda/goal-operations-context-check.test.ts
    - test/unit/session/register-agda-load-no-metas.test.ts
  modified:
    - test/fixtures/fix-queue.json
    - .planning/research/RT-REVERIFY.md
    - src/agda/expression-operations.ts
    - src/agda/goal-operations.ts
    - src/session/register-agda-load-no-metas.ts

key-decisions:
  - "Verified RT2's fix mechanism empirically against a live Agda 2.8.0 session before implementing, rather than trusting 06-03's queue-recorded root-cause note verbatim — the note's proposed mechanism (throwOnFatalProtocolStderr) does not fire for this response shape at all; the real mechanism (an Error-kind DisplayInfo, exactly like give()'s already-fixed bfcba437f5426fd6) was confirmed by temporarily instrumenting expression-operations.ts, rebuilding, and driving a real out-of-scope query through a disposable AgdaSession before writing any test or fix."
  - "Fixed all four expression-operations.ts functions (compute/computeTopLevel/infer/inferTopLevel), not just the two top-level variants RT2's evidence literally tested — empirical verification confirmed the goal-scoped compute()/infer() share the byte-identical defect in the same file; leaving a known-identical gap unfixed next to the just-fixed sibling would be inconsistent with this codebase's established sibling-function-parity convention."
  - "RT5 deferred rather than fixed, despite being false-green (the highest-priority band): its root cause is confirmed by source inspection to span all 7 write-capable proof tools (case_split/give/refine/refine_exact/intro/auto/apply_edit) via shared registerTextTool/registerGoalTextTool + reloadAndDiagnose infrastructure. A fix scoped to only the probed tool (agda_apply_edit) would leave the other 6 tools' identical gap unaddressed and diverge give()'s already-shipped rejection shape from a differently-shaped apply_edit fix — this is the same class of 'response-schema rework' D-10 pre-approves deferring, not a mechanical <=2-file fix."
  - "1220f2840142aab8 (the oracle-tooling fidelity gap in scripts/oracle/orcl-01-differential.mjs, discovered as a byproduct of RT6 in 06-03) is deferred rather than fixed even though the likely fix is a one-line gate change: it is a scripts/-only change, not a src/ server correctness fix, and is out of this plan's committed file scope (test/fixtures/fix-queue.json + .planning/research/RT-REVERIFY.md per the plan's own frontmatter). It is deferred alongside RT6's own schema-rework deferral so both can be revisited together — the oracle's cold-replay gate should track whatever RT6's eventual schema rework decides, not be fixed independently first."
  - "The two oracle-auto-filed rows (1b612dfeb1d31ea9, 1220f2840142aab8) both moved from status new to triaged (never left in new) with their own DEFERRED notes, following their host RT's disposition rather than being independently re-evaluated — per D-08's established convention that these are corroborating evidence for an existing incident, not separate defects."

requirements-completed: [REVERIFY-02, REVERIFY-01]

# Metrics
duration: ~65min
completed: 2026-07-04
---

# Phase 6 Plan 06: Fix-Queue Ledger Closeout Summary

**Locked 8 confirmed defects (the mandatory named-4 plus RT2/RT3/RT4/RT8) via from-RED vitest regression tests, explicitly deferred 5 rows with recorded large-redesign reasons, and closed both REVERIFY-01 and REVERIFY-02 on a green 1627-test suite — zero queue rows left silently stalled.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-07-04T02:37:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 8 (3 created, 5 modified) across 5 commits

## Accomplishments

- **Task 1 — named-4 + RT4 lock-in:** Flipped `5abecc959e43fef3` (agda_auto flag leak), `bfcba437f5426fd6` (agda_give ok-wrapping), `eb7439cb3ed9d6b9` (agda_search_definitions hardcoded layout), `fdc90bfde12fb938` (agda_proof_status mislabel), and RT4 `004d161b839ce725` (same root cause as `5abecc959e43fef3`, cross-referenced per D-08) to `status: locked` with `closedAt` set and a `"Regression lock:"`-prefixed note citing the exact wave-3 vitest test names that lock each one in. All named regression tests re-verified passing in the same sweep.
- **Task 2 — remaining RT dispositions + acceptance sweep:** Evaluated every remaining RT-confirmed row (RT2, RT3, RT5, RT6, RT7, RT8) plus the 2 oracle-auto-filed rows against D-10's appetite rule:
  - **Fixed and locked (3 additional entries, beyond the plan's mandatory minimum):** RT2 (`e5f6de1fa365b887`), RT3 (`eaea6321183bdf7b`), RT8 (`3306edf4c2d01c53`) — each had an evident, single-file, sibling-pattern-consistent root cause with an obvious from-RED unit test.
  - **Deferred with recorded reasons (5 entries):** RT5 (`a0ae86c7deb9754e`), RT6 (`ad2b6d31f58f1759`), RT7 (`b6821f42952c6ff8`), and the two oracle-auto-filed rows `1b612dfeb1d31ea9`/`1220f2840142aab8` — each requires a response-schema-level or diagnostic-taxonomy rework (or, for `1220f2840142aab8`, a `scripts/`-only oracle-tooling fix out of this plan's file scope), exceeding D-10's per-entry `<=2-src-file` appetite.
- Verified RT2's fix mechanism empirically against a live Agda 2.8.0 session **before** writing any test or fix: temporarily instrumented `src/agda/expression-operations.ts` with debug logging, rebuilt, and drove a real out-of-scope top-level/goal-scoped `compute`/`infer` call through a disposable `AgdaSession`. This disproved 06-03's queue-recorded root-cause note (`throwOnFatalProtocolStderr`, which only scans stderr text) and confirmed the real mechanism is an Error-kind `DisplayInfo` response — the same shape `give()` was already fixed for in plan 06-04.
- Ran the phase's full acceptance sweep: `grep` gates (`needsReverify:true` = 0, `status:new` = 0, every `triaged` row's notes carry the literal `"DEFERRED (Phase 6):"` prefix — verified row-by-row via a disposable script), `npx vitest run test/unit/fixtures/fix-queue.test.ts` (10/10), the **full** `npx vitest run` (197 files / 1627 tests passed, 179 skipped, zero failures), `npm run build` (exit 0), and `npx tsc -p tsconfig.json --noEmit` (exit 0, no diagnostics).
- Appended RT-REVERIFY.md's closing section: a 15-row final disposition table covering every queue row Phase 6 touched (13 originally-seeded + 2 oracle-auto-filed), the acceptance-gate outputs, the emit-regression applicability statement (no load-family false-green candidate existed this phase, so the conditional emit-regression path never fired), and a condensed D-11 mechanism note.

## Task Commits

Each task was committed atomically (Task 2 split into 4 logical commits — 3 independent fixes plus the ledger/report closeout — mirroring the wave-3 plans' convention of one commit per distinct concern):

1. **Task 1: Lock the named-4 confirmed defects plus RT4** - `67ff700` (fix)
2. **Task 2a: Fix RT2 — reject Agda's Error DisplayInfo in compute/infer** - `f7c0daa` (fix)
3. **Task 2b: Fix RT3 — reject Agda's Error DisplayInfo in goalTypeContextCheck** - `3abddab` (fix)
4. **Task 2c: Fix RT8 — agda_load_no_metas reports previousClassification/reloaded** - `6991916` (fix)
5. **Task 2d: Disposition every remaining RT confirm and close REVERIFY-02** - `3186812` (docs)

**Plan metadata:** pending (this SUMMARY.md's own commit, created next).

## Files Created/Modified

- `test/fixtures/fix-queue.json` - Named-4 + RT4 flipped to `locked` (Task 1); RT2/RT3/RT8 flipped to `locked`; RT5/RT6/RT7 and the 2 oracle-auto-filed rows flipped from `new`/kept `triaged` with `"DEFERRED (Phase 6):"` notes (Task 2). 9 locked, 5 triaged, 1 rejected — 15 total, unchanged row count.
- `.planning/research/RT-REVERIFY.md` - Extended (not replaced) with a "Phase 6 closeout" section: 15-row final disposition table, acceptance-gate outputs, emit-regression applicability statement, condensed D-11 mechanism note, REVERIFY-02 acceptance paragraph.
- `src/agda/expression-operations.ts` - New private `throwOnDisplayError()` helper; `compute()`, `computeTopLevel()`, `infer()`, `inferTopLevel()` now call it before decoding, so an Agda-rejected expression throws instead of silently decoding to `""`.
- `test/unit/agda/expression-operations.test.ts` (new) - 7 tests: 4 throw-on-Error-DisplayInfo cases (one per function) + 3 preserved-success cases.
- `src/agda/goal-operations.ts` - `goalTypeContextCheck()` now calls the existing `detectResponseError()` helper (already used by `give()`) and throws before decoding.
- `test/unit/agda/goal-operations-context-check.test.ts` (new) - 3 tests: NotInScope throw, UnequalTerms throw, well-typed-expr preserved success.
- `src/session/register-agda-load-no-metas.ts` - Mirrors `register-agda-load.ts`'s session-history read: computes `previousClassification`/`previousLoadedAtMs`/`isReload`/`wasStale` before calling `session.loadNoMetas()`, reports them in `data`, and fires the same `session-regression` diagnostic on an `ok-complete`/`ok-with-holes` -> failure transition. Report-side only — `loadDataSchema` already carried these optional fields.
- `test/unit/session/register-agda-load-no-metas.test.ts` (new) - 2 tests: regression-diagnostic + previousClassification on a stale reload, `reloaded:false`/`previousClassification:null` preserved on a first load.

## Decisions Made

See `key-decisions` in the frontmatter for the full list. The two most consequential: (1) empirically verifying RT2's fix mechanism against a live Agda session before trusting the queue's own prior root-cause note — the note's proposed mechanism would not have actually closed the defect; (2) deferring RT5 despite it being a false-green (the highest QUEUE-02 priority band) because its root cause is confirmed to span all 7 write-capable proof tools and a partial fix would create an inconsistent per-tool patchwork rather than the coherent schema decision this class of defect needs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan-authorized extension, Task 2's own "FIX NOW" branch] Fixed 3 additional RT-confirmed defects beyond the plan's mandatory named-4**
- **Found during:** Task 2, per-entry D-10 appetite evaluation
- **Issue:** RT2 (`e5f6de1fa365b887`), RT3 (`eaea6321183bdf7b`), and RT8 (`3306edf4c2d01c53`) each had an evident, single-file, from-RED-testable fix consistent with an already-established sibling pattern in the same file (RT2/RT3 mirror `give()`'s Error-DisplayInfo detection from plan 06-04; RT8 mirrors `agda_load`'s own session-history report). Per Task 2's explicit instruction, these were fixed and locked rather than deferred, since deferring an easily-fixable defect would contradict D-10's "其余按力修" (fix the rest according to capacity) directive.
- **Fix:** See Files Created/Modified above for each of the 3 fixes; each was demonstrated RED (failing against pre-fix code) before the corresponding source change landed, then GREEN after.
- **Files modified:** `src/agda/expression-operations.ts`, `test/unit/agda/expression-operations.test.ts`, `src/agda/goal-operations.ts`, `test/unit/agda/goal-operations-context-check.test.ts`, `src/session/register-agda-load-no-metas.ts`, `test/unit/session/register-agda-load-no-metas.test.ts`
- **Verification:** Each fix's own test file plus the full `npx vitest run` (197 files, 1627 tests passing) and `npx tsc -p tsconfig.json --noEmit` (clean) after all three landed.
- **Committed in:** `f7c0daa` (RT2), `3abddab` (RT3), `6991916` (RT8)

**2. [Rule 1 - correcting a prior plan's diagnosis] RT2's queue-recorded root cause was empirically disproven before use**
- **Found during:** Task 2, before implementing RT2's fix
- **Issue:** The fix-queue's own notes (written during plan 06-03) attributed RT2 to `computeTopLevel()`/`inferTopLevel()` "never calling `throwOnFatalProtocolStderr()`." `throwOnFatalProtocolStderr` only scans STDERR-kind responses for a narrow set of fatal patterns (`cannot read:`, `failed to parse`, `invalid`) — it does not scan `DisplayInfo` responses at all. Blindly adding that call would have been a no-op fix, and locking the entry afterward would have been a false claim.
- **Fix:** Verified empirically first (temporary debug instrumentation + live Agda 2.8.0 session) that the actual rejection arrives as an Error-kind `DisplayInfo`, then implemented the correct fix (`throwOnDisplayError()`, the same idiom `give()` already uses) instead of the queue-recorded (incorrect) one.
- **Files modified:** `src/agda/expression-operations.ts` (the debug instrumentation itself was reverted before committing; only the real fix is in the committed diff)
- **Verification:** Live-Agda empirical confirmation (both pre-fix raw-response capture and post-fix throw/control verification) plus the vitest RED/GREEN cycle.
- **Committed in:** `f7c0daa`

---

**Total deviations:** 2 (both plan-authorized/Rule-1-class; no unauthorized scope creep — all extra work is explicitly within Task 2's own "FIX NOW" branch and documented as a `files_modified` deviation per the plan's own `<output>` instruction).
**Impact on plan:** Both were necessary to make REVERIFY-02's "fixed in QUEUE-02 priority order" instruction meaningfully true (RT2/RT3/RT4/RT5/RT8's false-green band otherwise would have 3 of 5 members silently left un-fixed with no attempted appetite evaluation) and to keep every `"locked"` claim in the ledger honest (a lock note may never reference a fix that doesn't actually close the defect).

## Known Stubs

None. This plan touches only the fix-queue ledger, a research report, and server-side error-detection logic in already-shipped MCP tools — no UI or data-rendering components were created or modified.

## Threat Flags

None. All file changes stay within the plan's own declared threat register (T-06-18 ledger tampering, T-06-19 unlockable-claim repudiation, T-06-20 golden-mastering, T-06-SC supply-chain) — every lock note references a test that was independently re-run and confirmed passing in the same sweep; the emit-regression path was never invoked (and its `judgeRefusal` was never bypassed) since no load-family false-green candidate existed this phase. The 3 additional `src/` fixes (RT2/RT3/RT8) close existing error-classification gaps in already-shipped tool call paths — no new network endpoints, auth paths, file-access patterns, or schema changes at a trust boundary were introduced.

## Issues Encountered

- Ambient shell Node defaulted to v22.22.0 (via mise), below this project's `engines: {"node": ">=24"}` floor; used the Node 24.16.0 toolchain already installed via mise (`/Users/eric/.local/share/mise/installs/node/24.16.0/bin`), prepended to `PATH` for every `npm`/`npx` invocation, matching the same workaround plans 06-04/06-05 recorded. No tracked file was changed for this.
- `throwOnFatalProtocolStderr`'s scope (stderr-only) does not match the fix-queue's own RT2 root-cause note (see Deviations #2 above) — resolved by empirical verification against the real `agda` 2.8.0 binary (available via nix at `/Users/eric/.nix-profile/bin/agda`) before implementing, rather than either trusting the note or asking for clarification on a question the running binary could answer directly.

## User Setup Required

None - no external service configuration required. All work ran and verified on the local machine using the already-installed `agda` 2.8.0 binary (nix) and Node 24.16.0 (mise).

## Next Phase Readiness

- REVERIFY-01 and REVERIFY-02 are both fully complete: all 4 of the phase's success criteria are mechanically demonstrated on a green tree (see RT-REVERIFY.md's "Phase 6 closeout" section for the full acceptance-gate output).
- The fix queue (`test/fixtures/fix-queue.json`) sits in a fully terminal, schema-valid state: 9 locked, 5 triaged (each with a recorded `DEFERRED (Phase 6):` reason and a specific "what would unblock it" note), 1 rejected. This is the input set for whichever future milestone's queue review picks up the 5 deferred items (RT5's shared-infrastructure schema decision, RT6's response-schema rework, RT7's timeout taxonomy, and the two auto-filed rows that follow their host RT).
- The `scripts/oracle/orcl-01-differential.mjs` fidelity gap (entry `1220f2840142aab8`) remains an open, precisely-diagnosed one-line fix for a future `scripts/`-scoped plan — deliberately not touched here since it falls outside this plan's committed `src/`+ledger file scope and is best done alongside any RT6 schema rework.
- No blockers. REQUIREMENTS.md/STATE.md/ROADMAP.md tracking updates for this plan are intentionally NOT performed here — per this session's explicit instruction, the orchestrator centrally owns tracking writes for this phase.

## Self-Check: PASSED

- FOUND: `test/unit/agda/expression-operations.test.ts`
- FOUND: `test/unit/agda/goal-operations-context-check.test.ts`
- FOUND: `test/unit/session/register-agda-load-no-metas.test.ts`
- FOUND: `test/fixtures/fix-queue.json`
- FOUND: `.planning/research/RT-REVERIFY.md`
- FOUND: `src/agda/expression-operations.ts`
- FOUND: `src/agda/goal-operations.ts`
- FOUND: `src/session/register-agda-load-no-metas.ts`
- FOUND commit: `67ff700` (Task 1: named-4 + RT4 lock-in)
- FOUND commit: `f7c0daa` (Task 2a: RT2 fix)
- FOUND commit: `3abddab` (Task 2b: RT3 fix)
- FOUND commit: `6991916` (Task 2c: RT8 fix)
- FOUND commit: `3186812` (Task 2d: ledger dispositions + RT-REVERIFY.md closeout)
- VERIFIED: `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` == 0
- VERIFIED: `grep -c '"status": "new"' test/fixtures/fix-queue.json` == 0
- VERIFIED: `grep -c '"status": "locked"' test/fixtures/fix-queue.json` == 9
- VERIFIED: `npx vitest run test/unit/fixtures/fix-queue.test.ts` == 10/10 passing
- VERIFIED: `npx vitest run` (full suite) == 197 files passed, 16 skipped; 1627 tests passed, 179 skipped, 0 failed
- VERIFIED: `npm run build` == exit 0
- VERIFIED: `npx tsc -p tsconfig.json --noEmit` == exit 0 (clean)

---
*Phase: 06-backlog-digestion-policy-fix-reverify*
*Completed: 2026-07-04*
