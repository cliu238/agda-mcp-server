---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
plan: 04
subsystem: infra
tags: [agda, mcp, oracle, conformance, alpha-diff, cold-replay, vitest, tsx]

# Dependency graph
requires:
  - phase: 02-03
    provides: "scripts/oracle/orcl-01-differential.mjs's materializeCaptureEnvironment() (faithful source + AGDA_DIR replay into a fresh temp dir) and the empirically-discovered -l library-flag/argv-split + Cmd_show_version priming pattern"
  - phase: 02-01
    provides: "scripts/oracle/cold-agda-session.mjs's spawnColdAgdaSession() multi-command lifecycle (a still-open cold process that can take a second sequential command)"
provides:
  - "ORCL-03 complete: scripts/oracle/orcl-03-conformance.mjs — parseExpectedSignature(), normalizeSignatureText(), compareSignatures(), runColdInferAndCompare(), judgeOrcl03() + scriptMain CLI"
  - "Empirical finding (general, not fixture-specific): Agda 2.8.0's Cmd_infer_toplevel always prints the arrow type using Unicode \"→\", never ASCII \"->\", regardless of which spelling the original source used — a whitespace-only comparison is insufficient and must also normalize this specific lexer-level token alias"
affects: [02-05-verdict-composition, 03-regression-emitter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Depth-aware colon-split parser: parseExpectedSignature walks a ({[/)}] depth counter to find the FIRST TOP-LEVEL ':' rather than a naive indexOf(':'), so a signature like \"(f : A -> B) : C\" splits correctly"
    - "Advisory-only outcome funnel: every branch of judgeOrcl03 (missing expectedSignature, missing loaded file, path-sandbox violation, spawn failure, load failure, no-terminus) returns one of exactly 3 D-02 outcome kinds — never throws for an ordinary Agda-replay failure, only for a genuine artifact-read error"
    - "Shared-session contract: runColdInferAndCompare accepts an ALREADY-loaded session and issues exactly one Cmd_infer_toplevel, never its own Cmd_load — proven via a stub-session test asserting a single sendCommand call and the absence of the \"Cmd_load\" substring in the function body"
    - "Local duplication over private-helper import: findLoadedRelativePath / splitMergedArgv / coldResponsesReachedTerminus are small, deliberately duplicated re-derivations of orcl-01-differential.mjs's/cold-agda-session.mjs's own non-exported helpers, keeping this plan's files_modified scope to exactly its own two files"

key-files:
  created:
    - scripts/oracle/orcl-03-conformance.mjs
    - test/unit/tools/oracle-orcl-03.test.ts
  modified: []

key-decisions:
  - "normalizeSignatureText() normalizes ASCII \"->\" to Unicode \"→\" in addition to whitespace collapsing — confirmed empirically necessary (not a style preference) against a real local Agda 2.8.0 binary: Cmd_infer_toplevel Normalised prints \"→\" regardless of source spelling, so a pure whitespace-only comparison would spuriously conformance-flag any expectedSignature typed with the (very plausible, easier-to-type) ASCII spelling"
  - "judgeOrcl03 checks oracleSubstrate.expectedSignature for null/undefined and returns vacuous-no-expected-signature IMMEDIATELY, before calling materializeCaptureEnvironment or touching any cold spawn — a structural, implementation-independent guarantee (D-07) rather than a spy-based one"
  - "The -l NAME library-flag/argv split and Cmd_show_version priming round trip (both empirically discovered as load-bearing fixes during Plan 02-03) were designed into judgeOrcl03 from the start, per this wave's own context note, rather than rediscovered as a deviation — verified end-to-end against this repo's own test/fixtures/agda/ (a real registered .agda-lib project)"
  - "A cold load that never reaches a terminus, a cold spawn failure, or a capture with no recorded load-family action all map to conformance-flagged (provenSignature: null, with an explanatory note) rather than vacuous-no-expected-signature or a thrown exception — keeping every reachable outcome within the D-02 3-value enum while staying honest that no real comparison happened"

patterns-established:
  - "compareSignatures(provenType, expectedType) returns the ORIGINAL (un-normalized) strings in its conformance-flagged payload even though the equality check itself is normalized — a human reviewer sees exactly what was captured/proven"
  - "Exit-code funnel: consistent / vacuous-no-expected-signature / conformance-flagged all map to exit 0 in scriptMain; exit 1 is reserved exclusively for a genuine script-level error (thrown exception), so an automated caller can never mistake ORCL-03's own exit code for a pass/fail gate"

requirements-completed: [ORCL-03]

# Metrics
duration: ~25min
completed: 2026-07-02
---

# Phase 2 Plan 4: ORCL-03 Conformance Proxy Summary

**Advisory alpha-diff of a cold, same-session `Cmd_infer_toplevel` signature against CAP-05's captured `expectedSignature`, with an empirically-discovered ASCII/Unicode arrow-notation normalization baked into the comparison so Agda's own canonical printer output doesn't spuriously conformance-flag every hand-typed expected signature.**

## Performance

- **Duration:** ~25 min (base commit `6b14f51` at 04:51 local; task commits at 05:12 and 05:14 local — most of the time went to direct empirical verification of Agda's `Cmd_infer_toplevel` output format via a real local Agda 2.8.0 binary, which surfaced the arrow-notation finding before it could silently break Task 2's own real-Agda tests)
- **Completed:** 2026-07-02T09:14:49Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (1 new script, 1 new test file)

## Accomplishments
- Built `scripts/oracle/orcl-03-conformance.mjs`: `parseExpectedSignature()` (depth-aware first-top-level-colon split), `normalizeSignatureText()`/`compareSignatures()` (whitespace + arrow-notation normalized alpha-diff), `runColdInferAndCompare()` (exactly one `Cmd_infer_toplevel` against an already-loaded session), `judgeOrcl03()` (the standalone-runnable predicate: cold-loads the captured file via Plan 02-03's `materializeCaptureEnvironment`, then infers on that SAME session), and a `scriptMain` CLI entry point.
- Proved ORCL-03 end-to-end against a real local Agda 2.8.0 binary and this repo's own `test/fixtures/agda/CompleteFixture.agda` (a project with a registered `.agda-lib`, the same fixture ORCL-01 used): a matching `expectedSignature` reports `consistent`; a mismatched one reports `conformance-flagged` carrying both the real proven signature (`"Nat → Nat → Nat"`) and the expected one; a `null` `expectedSignature` reports `vacuous-no-expected-signature` without any cold spawn.
- Discovered, via direct empirical testing against a real Agda binary (both with an ASCII-arrow-written source and a Unicode-arrow-written source, under both `Normalised` and `AsIs` rewrite modes), that `Cmd_infer_toplevel` **always** prints the function-arrow type using Unicode `"→"`, never ASCII `"->"` — confirmed this is Agda's own printer convention, independent of how the source (or a captured `expectedSignature`) was originally spelled. Built the corresponding normalization into `normalizeSignatureText()` before writing Task 2's real-Agda tests, so they would exercise the CORRECT comparison from the start rather than fail on a foreseeable, easily-verified format mismatch.
- Verified the complete standalone CLI (`npx tsx scripts/oracle/orcl-03-conformance.mjs <artifact-path>`) end-to-end for all 3 outcome kinds using a hand-built real captured artifact, confirming exit code 0 in every case (including `conformance-flagged`) and exit code 1 only for a genuine script error (missing artifact file).

## Task Commits

Each task was committed atomically:

1. **Task 1: Signature comparison function + expectedSignature parsing** - `b9a0999` (feat)
2. **Task 2: Cold Cmd_load + Cmd_infer_toplevel on the same session + judgeOrcl03() + CLI** - `3d3dbd3` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `scripts/oracle/orcl-03-conformance.mjs` - new: the complete ORCL-03 conformance proxy (see Accomplishments)
- `test/unit/tools/oracle-orcl-03.test.ts` - new: 12 tests (7 pure from Task 1 — the plan's own 6 plus 1 locking in the arrow-notation fix; 5 from Task 2 — the plan's own 4 [3 `RUN_AGDA_INTEGRATION`-gated, 1 pure] plus 1 pure defensive test for a capture with no recorded load-family action)

## Decisions Made
- **`normalizeSignatureText()` normalizes ASCII `"->"` to Unicode `"→"` in addition to collapsing whitespace.** This was NOT in the plan's literal action text (which specified "whitespace-normalized string equality" only, per RESEARCH.md's Open Question 1 recommendation to start simplest). Direct empirical testing against a real local Agda 2.8.0 binary — both directions (ASCII-written source, Unicode-written source) and both rewrite modes (`Normalised`, `AsIs`) — showed `Cmd_infer_toplevel` **always** emits `"→"`. Without this fix, the plan's OWN Task 2 Test 1 (`expectedSignature = "add : Nat -> Nat -> Nat"` expected to return `{kind: "consistent"}`) would have failed, since the real proven signature is `"Nat → Nat → Nat"` and a pure whitespace-only comparison would never match an ASCII-spelled expected signature against Agda's Unicode-spelled output. This is a single, fixed, lexer-level token alias (Agda's own concrete syntax treats `"->"` and `"→"` as two spellings of the identical arrow token — already established elsewhere in this codebase, e.g. `src/agda/clause-fixity.ts`'s `/->|→/gu`), not a step towards the deferred alpha-equivalence/token-canonicalization pass (RESEARCH.md Assumption A2, still out of scope).
- **`judgeOrcl03` checks for a null/undefined `expectedSignature` and returns `vacuous-no-expected-signature` immediately, before calling `materializeCaptureEnvironment`.** Matches the plan's own explicit preference ("prefer the latter, since it is a stronger, implementation-independent guarantee") over a spy-based test — the guarantee is structural (the code path to any cold spawn is simply unreachable), not merely observed.
- **The `-l NAME` library-flag/argv split and a `Cmd_show_version` priming round trip were built into `judgeOrcl03` from the start**, informed directly by this wave's own context note (Plan 02-03's empirical finding, carried forward rather than rediscovered). Verified this was in fact necessary by running the real-Agda tests against `test/fixtures/agda/` (a project with a registered `test-fixtures.agda-lib`) — exactly the scenario that broke ORCL-01 before that fix landed.
- **A cold load with no terminus, a cold spawn failure, or a capture with no recorded load-family action all map to `conformance-flagged` (with `provenSignature: null` and an explanatory `note`), never a thrown exception or a fabricated `vacuous-no-expected-signature`.** D-02's ORCL-03 outcome enum has no "skip"/"error" value (unlike ORCL-01) — every reachable branch stays within `{consistent, conformance-flagged, vacuous-no-expected-signature}`, honest that no real comparison happened without overstating the outcome.
- **`findLoadedRelativePath`, `splitMergedArgv`, and `coldResponsesReachedTerminus` are small, local re-derivations of orcl-01-differential.mjs's/cold-agda-session.mjs's own non-exported helpers**, rather than modifying those two modules to export them. This matches the plan's own explicit instruction for the load-path scan ("reuse/duplicate this small scan locally rather than importing a private helper") and keeps this plan's `files_modified` scope to exactly its own two files, per the plan's frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Whitespace-only comparison would have failed against Agda's real printer output**
- **Found during:** Task 1 implementation, before writing Task 2's real-Agda tests (proactively verified against a real local Agda 2.8.0 binary rather than discovered as a test failure)
- **Issue:** The plan's literal action text specified `compareSignatures` as pure whitespace-normalized string equality. Direct empirical testing (two throwaway probe scripts spawning real `agda --interaction-json` against both an ASCII-arrow-written fixture and a Unicode-arrow-written fixture, under both `Normalised` and `AsIs` rewrite modes) confirmed `Cmd_infer_toplevel` always prints the function-arrow type as Unicode `"→"`, never ASCII `"->"`, regardless of source spelling. A pure whitespace-only comparison would therefore have made the plan's OWN Task 2 Test 1 (`"add : Nat -> Nat -> Nat"` expected to match the real `add : Nat → Nat → Nat`) fail, and would make ORCL-03 spuriously conformance-flag essentially any ASCII-typed `expectedSignature` against any real Agda output — noisy-by-construction rather than a useful advisory signal.
- **Fix:** `normalizeSignatureText()` additionally replaces ASCII `"->"` with Unicode `"→"` before collapsing whitespace — a single, fixed, lexer-level token-alias normalization (not the deferred alpha-equivalence/token-canonicalization pass, which remains out of scope). Precedent for treating `"->"`/`"→"` as the same token already exists in this codebase (`src/agda/clause-fixity.ts`).
- **Files modified:** `scripts/oracle/orcl-03-conformance.mjs`, `test/unit/tools/oracle-orcl-03.test.ts` (added a dedicated pure test locking this in)
- **Verification:** All 3 `RUN_AGDA_INTEGRATION`-gated tests pass against real Agda 2.8.0, including the exact ASCII-expectedSignature-vs-Unicode-real-signature case the plan's own Test 1 specifies; re-ran twice to confirm no flakiness.
- **Committed in:** `b9a0999` (Task 1 commit — the fix lives in the functions Task 1 delivers, verified against real Agda before Task 2 was written)

**2. [Rule 3 - Blocking] Doc comment referencing "Cmd_load" would fail the literal grep-based acceptance check**
- **Found during:** Task 2 acceptance-criteria self-check (`grep` for the substring `"Cmd_load"` inside `runColdInferAndCompare`'s function body must return 0)
- **Issue:** An explanatory doc comment inside `runColdInferAndCompare` referenced "orcl-01-differential.mjs's own cold Cmd_load handling" by name — the mechanical grep check doesn't distinguish comments from code, so the literal substring's presence would fail the acceptance criterion even though the function never constructs a `Cmd_load` command. This is the identical situation Plan 02-03's own SUMMARY documents (its `createLibraryRegistration` wording fix) for the same reason.
- **Fix:** Reworded the comment to say "cold-load handling" instead of literally naming the "Cmd_load" command, preserving the explanation while satisfying the mechanical check.
- **Files modified:** `scripts/oracle/orcl-03-conformance.mjs`
- **Verification:** `awk '/^export async function runColdInferAndCompare/,/^}/' scripts/oracle/orcl-03-conformance.mjs | grep -c "Cmd_load"` returns `0`; all 12 tests still pass after the wording change.
- **Committed in:** `3d3dbd3` (Task 2 commit — the fix landed before Task 2's own commit, caught during Task 2's own acceptance-criteria check)

**3. [Rule 2 - Missing critical functionality] `judgeOrcl03` would crash on a capture with an `expectedSignature` but no recorded load-family action**
- **Found during:** Task 2 implementation, while reasoning through `judgeOrcl03`'s early-return structure
- **Issue:** A `CaptureArtifact` with `oracleSubstrate.expectedSignature` set but an empty (or load-family-less) `recordedActions` array is a plausible real-world shape (e.g. an agent declares an expected signature before ever successfully loading the file). Without a guard, `resolveFileWithinRoot(root, null)` would throw a raw `TypeError` from Node's `path.resolve`, crashing `judgeOrcl03` for a foreseeable input shape rather than returning one of D-02's 3 advisory outcome kinds.
- **Fix:** `judgeOrcl03` checks `findLoadedRelativePath(artifact) === null` immediately after parsing the expected signature (before any materialization or cold spawn) and returns `{ kind: "conformance-flagged", provenSignature: null, expectedSignature, note: "..." }` — an honest, non-crashing outcome that stays within the D-02 enum.
- **Files modified:** `scripts/oracle/orcl-03-conformance.mjs`, `test/unit/tools/oracle-orcl-03.test.ts` (added a dedicated pure test)
- **Verification:** New test "an expectedSignature with no recorded load-family action returns an advisory conformance-flagged note, never a thrown exception" passes.
- **Committed in:** `3d3dbd3` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug affecting real correctness for any ASCII-typed expectedSignature against any real Agda output, 1 Rule 3 mechanical-check wording fix, 1 Rule 2 defensive-robustness fix for a plausible-but-unhandled input shape)
**Impact on plan:** The Rule 1 fix is load-bearing for ORCL-03's actual purpose — without it, the predicate would spuriously conformance-flag essentially any hand-typed expected signature using the (more common, easier-to-type) ASCII arrow spelling, including the plan's own literal Task 2 test case. The Rule 2 and Rule 3 fixes are small, scoped, and directly protect code paths this plan itself introduced — no scope creep beyond what was needed for the plan's own success criteria ("every ORCL-03 outcome is structurally incapable of gating a true-green determination") to hold against realistic capture shapes, not only synthetic happy-path fixtures.

## Issues Encountered
None beyond the three deviations documented above (all fully resolved).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02-05 (verdict composition) can call `judgeOrcl03(artifactPath)` directly for a standalone invocation, or compose `runColdInferAndCompare(session, materializedPath, name, expectedType)` against a session ORCL-01's own cold `Cmd_load` already loaded — sharing ONE cold process between ORCL-01 and ORCL-03 rather than paying for a second full cold compile, exactly the shared-session contract this plan's `must_haves` requires.
- `judgeOrcl03` returns exactly the D-02 schema's ORCL-03 outcome shape (`consistent` / `conformance-flagged` / `vacuous-no-expected-signature`) and is verified to never gate — Plan 02-05's verdict composition can read it purely advisorily, per D-02/D-06.
- No blockers. `npm test` is green (174 test files / 1436 tests passed, 12 files / 167 tests skipped — all Agda-integration-gated, expected without `RUN_AGDA_INTEGRATION=1`); zero regressions introduced. `RUN_AGDA_INTEGRATION=1` re-run across `test/unit/tools/`, `test/unit/agda/`, and this plan's own test file all green (73 files / 633 tests).

---
*Phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Completed: 2026-07-02*

## Self-Check: PASSED

- All 3 claimed files verified present on disk (`scripts/oracle/orcl-03-conformance.mjs`, `test/unit/tools/oracle-orcl-03.test.ts`, this SUMMARY.md).
- Both commit hashes (`b9a0999`, `3d3dbd3`) verified present in `git log --oneline --all`.
