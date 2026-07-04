---
phase: 06-backlog-digestion-policy-fix-reverify
plan: 01
subsystem: testing
tags: [oracle, policy-resolution, dogfooding, vitest, cheat-detection, ci]

# Dependency graph
requires:
  - phase: 02-oracle-triad
    provides: judgeOrcl02's options.policyKey override parameter and loadOraclePolicy's CR-01 allowlist gate
  - phase: 05-dogfooding-pipeline
    provides: run-oracle.mjs (composed triad CLI), dogfood-wrapup.mjs (wrap-up pipeline), fuel-corpora.json's policyKey column
provides:
  - PolicyResolutionError + resolvePolicyStrict case-exact, loud-fail ORCL-02 policy resolution in judgeOrcl02
  - --policy CLI flag on both run-oracle.mjs and dogfood-wrapup.mjs, threaded through to judgeOrcl02
  - resolveWrapupPolicyKey implementing D-01's strict precedence (explicit flag > corpus-derived fuel-corpora.json policyKey > .agda-lib fallback)
  - Loud no-policy surfacing in the wrapup run summary (noPolicy count + per-capture stderr WARNING)
  - Regression test proving the real CHG case-mismatch (Codex-Homotopy-Group vs codex-homotopy-group.json) fails loudly, ungated on CI
affects: [07-team-feedback-channel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Case-exact directory-listing policy resolution: readdirSync + exact entry.name string compare, never a case-insensitive readFileSync/loadJsonData resolution, so macOS APFS and Linux ext4 behave identically"
    - "derived-vs-explicit key distinction: a .agda-lib-derived key with no on-disk file degrades to null (v1.0 no-policy semantics); an explicit/expected key that cannot resolve throws a typed PolicyResolutionError"
    - "First-match-wins precedence chain with a single stderr warning per skipped branch, never a hard error, for a fallback resolution path (resolveWrapupPolicyKey mirrors wrapUpCapture's own STRICT-order filing precedence)"

key-files:
  created: []
  modified:
    - scripts/oracle/orcl-02-soundness-scan.mjs
    - scripts/oracle/run-oracle.mjs
    - scripts/dogfood/dogfood-wrapup.mjs
    - test/unit/tools/oracle-orcl-02.test.ts
    - test/unit/tools/oracle-run-oracle.test.ts
    - test/unit/tools/dogfood-wrapup-filing.test.ts

key-decisions:
  - "D-02/D-03 implemented exactly as briefed: never case-normalize a policy key; case-insensitive filesystems must fail the same way as case-sensitive ones"
  - "A no-policy verdict keeps its v1.0 not-a-candidate/no-policy classification unchanged — Phase 6 only adds loud surfacing (summary count + stderr warning), never reclassifies it as an error or auto-files it"
  - "resolveWrapupPolicyKey's corpus-derived branch failure modes (unreadable manifest, mixed corpus values, unknown corpus key) are soft warnings that fall through to the .agda-lib default, never hard errors — Task 1's loud-fail resolvePolicyStrict is the sole hard-failure boundary"
  - "Added a policyKey field to the wrapup-report.json summary (beyond the plan's literal ask) for operator traceability of which key a run actually used — covered by 06-CONTEXT.md's explicit Claude's Discretion grant on run-summary format"

requirements-completed: [POLICY-01]

# Metrics
duration: ~15min
completed: 2026-07-03
---

# Phase 6 Plan 1: ORCL-02 Policy Passthrough Fix Summary

**Case-exact, loud-fail ORCL-02 policy resolution (`PolicyResolutionError` + `resolvePolicyStrict`) plus `--policy` CLI passthrough and corpus-derived resolution on `run-oracle.mjs`/`dogfood-wrapup.mjs`, closing the v1.0 audit's W2 defect.**

## Performance

- **Duration:** ~15 min (git commit span 20:54–21:09 local time)
- **Started:** 2026-07-03T20:54:00-04:00 (approx, from prior phase-start commit)
- **Completed:** 2026-07-03T21:08:44-04:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `judgeOrcl02` now resolves ORCL-02 policy keys via a new `resolvePolicyStrict` helper instead of a bare `loadOraclePolicy()` call: a case-mismatched key (the real CHG shape — `.agda-lib` name `Codex-Homotopy-Group` vs on-disk `codex-homotopy-group.json`) throws a `PolicyResolutionError` naming the requested key, the on-disk variant found, and the search path — identically on macOS APFS and Linux ext4 (pure `readdirSync` + exact string compare, no OS-dependent case folding anywhere in the resolution path).
- A genuinely-no-policy-anywhere repo (a derived `.agda-lib` key with no on-disk file and no case variant) keeps v1.0's `no-policy` outcome unchanged — the fix only closes the *mismatch* hole, never touches the legitimate *absence* case.
- Both `scripts/oracle/run-oracle.mjs` and `scripts/dogfood/dogfood-wrapup.mjs` now accept `--policy <key>` and thread it through to `judgeOrcl02`'s own `options.policyKey`.
- `dogfood-wrapup.mjs` additionally resolves a corpus-derived policy key from `scripts/data/fuel-corpora.json`'s `policyKey` column when the run's task manifest names a single, known, pinned corpus — closing the specific "test-validated but never consumed at runtime" gap the v1.0 audit named (W2). Precedence is strict and first-match-wins: explicit `--policy` flag > unanimous corpus-derived key > `judgeOrcl02`'s own `.agda-lib` fallback.
- The wrap-up run summary now counts `no-policy` outcomes and surfaces them loudly — a `noPolicy` field in `wrapup-report.json`, an inline count in the stdout summary line, and a per-capture stderr `WARNING` naming the staged path — instead of the previous silent skip. The capture's classification (`not-a-candidate`) is never changed; it is surfaced, not reclassified (D-03).
- 13 new regression tests (6 in `oracle-orcl-02.test.ts`, 2 in `oracle-run-oracle.test.ts`, 5 in `dogfood-wrapup-filing.test.ts`) prove the case-mismatch acceptance criterion, the explicit/derived key distinction, the `.agda-lib` fallback preservation, and the full `wrapUpCapture` → `runOracle` → `judgeOrcl02` policyKey wiring end to end. All new tests are ungated (no integration-test environment condition, no Agda subprocess), so they run and prove themselves on `ubuntu-latest` CI's case-sensitive ext4 — the phase's hard acceptance gate (success criterion 2).
- Full `test/unit` tier: 1315 tests passed, 22 skipped (pre-existing `RUN_AGDA_INTEGRATION`-gated tests requiring a local Agda binary + env var), 0 failures — no regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Case-exact, loud-fail policy resolution in judgeOrcl02 (D-02 + D-03) with the real-CHG regression test** - `0475aac` (feat)
2. **Task 2: --policy passthrough on run-oracle.mjs + dogfood-wrapup.mjs, corpus-derived resolution, loud no-policy summary** - `1c503b5` (feat)
3. **Fixup: keep the `runOracleFn(artifactPath, ...)` call on one line** - `2dc8ae5` (fix) — self-caught while re-verifying the plan's `key_links` grep-checkable wiring pattern; the initial multi-line formatting was behaviorally correct but broke the literal-substring contract.

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md updates deferred to the orchestrator).

## Files Created/Modified

- `scripts/oracle/orcl-02-soundness-scan.mjs` - Added `PolicyResolutionError` class + `resolvePolicyStrict()` (case-exact directory-listing resolution against `scripts/data/oracle-policy/`); `judgeOrcl02` now calls it instead of a bare `loadOraclePolicy()`, computing a `derived` flag from whether `options.policyKey` was supplied.
- `scripts/oracle/run-oracle.mjs` - `runOracle` accepts `options.policyKey`, passed through to `judgeOrcl02`'s options bag at the ORCL-02 call site; `scriptMain` parses `--policy` (mirrors the existing `--only` argv idiom) and both the header comment and inline usage string document it.
- `scripts/dogfood/dogfood-wrapup.mjs` - `wrapUpCapture` accepts `config.policyKey`, threaded to `runOracleFn`; new exported `resolveWrapupPolicyKey({ policyFlag, manifestPath })` implements the D-01 precedence chain; `parseWrapupArgv` parses `--policy`; `scriptMain` resolves the run-level policy key once from `report.manifestPath`, passes it into every `wrapUpCapture` call, and adds the `noPolicy` summary field + per-capture stderr warning.
- `test/unit/tools/oracle-orcl-02.test.ts` - New `describe("policy resolution is case-exact and loud (POLICY-01)")` block: 6 tests (A–F) covering the real CHG case mismatch (derived and explicit paths), exact-case success, unknown-key rejection, preserved no-policy semantics, and the CR-01 traversal-key upgrade.
- `test/unit/tools/oracle-run-oracle.test.ts` - 2 new pure (no-Agda-subprocess) tests: an explicit exact-case `policyKey` resolving normally through `--only orcl-02`, and a mismatched-case key propagating `PolicyResolutionError` out of `runOracle`.
- `test/unit/tools/dogfood-wrapup-filing.test.ts` - 7 new tests: 2 DI tests proving `config.policyKey` reaches `runOracleFn` as `{ policyKey }` (and `{}` when omitted), plus 5 direct unit tests of `resolveWrapupPolicyKey`'s precedence chain (flag wins, unanimous known corpus resolves, mixed corpus values, unreadable manifest, unknown corpus key, and no-manifest-no-flag all fall back to `undefined`).

## Decisions Made

- Followed D-01 through D-04 from `06-CONTEXT.md` exactly as briefed (forced/no-veto decisions) — see `key-decisions` above for the implementation specifics within Claude's Discretion (exact CLI parsing details, error-message wording, corpus-resolution field choice, and run-summary format).
- Chose the task manifest's own `corpus` field (already present, `test/fixtures/task-manifest-schema.ts`) over adding a new `--corpus` CLI flag or a new manifest field — this was explicitly left to planner/executor discretion in `06-CONTEXT.md`, and the manifest's `corpus` field already cross-references `fuel-corpora.json`'s `key` by convention, so no schema change was needed.
- Added a `policyKey` field to `wrapup-report.json`'s summary object (not explicitly requested by the plan text, but within the documented "how the run-summary surfaces loud no-policy/error states" discretion) so operators can see which key a completed run actually used without re-deriving it.

## Deviations from Plan

None requiring a rule citation — plan executed as written. One self-caught correction is documented above as a fixup commit (`2dc8ae5`): the initial `runOracleFn` call site was reformatted across multiple lines during implementation, which was behaviorally correct but broke the plan's `key_links` literal-substring verification pattern (`runOracleFn\(artifactPath,`). Caught during self-verification before finalizing; fixed by extracting the options bag into a named local variable, keeping the call on one line. No test failures were involved — the fix restored a documentation/verification contract, not a behavior fix.

## Issues Encountered

None. The `agda` toolchain was not required for any test in this plan's scope (per the plan's own design — Task 1/2 tests are pure filesystem/string-comparison and DI-based, with real Agda-subprocess tests appropriately `RUN_AGDA_INTEGRATION`-gated and skipped in this environment as expected).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- POLICY-01 is fully closed: both oracle CLIs accept `--policy`, corpus-derived resolution consumes `fuel-corpora.json`'s `policyKey` column at runtime, and the real CHG mismatch is regression-tested and proven ungated on CI's case-sensitive filesystem — this was Phase 7's TEAM-04 prerequisite (bundles from another machine must resolve policy keys without `.agda-lib` guessing).
- No blockers for the remaining Phase 6 plans (REVERIFY-01/REVERIFY-02 backlog digestion work), which depend on this plan's policy-passthrough fix being in place before live dogfood sessions are re-run through the wrap-up pipeline.
- `test/unit` full tier is green (1315 passed / 22 skipped / 0 failed) — safe foundation for subsequent plans in this phase.

---
*Phase: 06-backlog-digestion-policy-fix-reverify*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: scripts/oracle/orcl-02-soundness-scan.mjs
- FOUND: scripts/oracle/run-oracle.mjs
- FOUND: scripts/dogfood/dogfood-wrapup.mjs
- FOUND: test/unit/tools/oracle-orcl-02.test.ts
- FOUND: test/unit/tools/oracle-run-oracle.test.ts
- FOUND: test/unit/tools/dogfood-wrapup-filing.test.ts
- FOUND commit: 0475aac (Task 1)
- FOUND commit: 1c503b5 (Task 2)
- FOUND commit: 2dc8ae5 (fixup)
