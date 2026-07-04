---
phase: 06-backlog-digestion-policy-fix-reverify
verified: 2026-07-04T05:07:30Z
status: passed
score: 15/15 must-haves verified
overrides_applied: 0
---

# Phase 6: Backlog Digestion (Policy Fix + Reverify) Verification Report

**Phase Goal:** The ORCL-02 cheat-detection policy resolves correctly at runtime on any filesystem (never silently derived from `.agda-lib` `name:` alone), and every pre-v1.1 fix-queue backlog entry reaches a definitive, non-stale state.
**Verified:** 2026-07-04T05:07:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Method note (adversarial verification, not SUMMARY-trust)

This report is based on: reading every line of the actually-changed source files (not the SUMMARYs describing them), running the named regression tests myself (`npx vitest run`), running the full suite (`npx vitest run` — 205 files / 1666 tests passed, 16/179 skipped, 0 failed), running `tsc --noEmit` and `npm run build` (both exit 0), confirming every cited git commit hash actually exists with a matching message, opening the raw `.agda-mcp/runs/*/wrapup-report.json` and `tmp/rt-reverify/*/.agda-mcp/captures/*.json` pipeline artifacts on disk and diffing their raw JSON against the prose quoted in `RT-REVERIFY.md` (spot-checked RT2 byte-for-byte), and — because success criterion 2 explicitly demands proof "on a case-sensitive filesystem... not just the maintainer's case-insensitive Mac" — creating a genuinely case-sensitive APFS disk image (`hdiutil create -fs "Case-sensitive APFS"`), copying the repo onto it, and re-running the exact POLICY-01 test file there. All 6 case-mismatch tests (A–F) passed on that case-sensitive volume, closing what would otherwise have been a "structurally should work but never empirically proven" gap.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `run-oracle.mjs`/`dogfood-wrapup.mjs` accept explicit `--policy <key>`, overriding `.agda-lib`-only derivation (Success Criterion 1 / POLICY-01) | VERIFIED | `grep -n '"--policy"' scripts/oracle/run-oracle.mjs scripts/dogfood/dogfood-wrapup.mjs` shows both scriptMains parsing the flag; `run-oracle.mjs:232` calls `judgeOrcl02(artifactPath, options.policyKey !== undefined ? {policyKey} : {})`; `dogfood-wrapup.mjs:220` computes `orcl02Options` and passes to `runOracleFn(artifactPath, orcl02Options)`. Tests pass: `oracle-run-oracle.test.ts`, `dogfood-wrapup-filing.test.ts`. |
| 2 | A case-mismatched policy (real CHG shape: `.agda-lib` name `Codex-Homotopy-Group` vs on-disk `codex-homotopy-group.json`) fails loudly with an explicit error, proven on a case-sensitive filesystem (Success Criterion 2 / POLICY-01) | VERIFIED | `resolvePolicyStrict()` (`scripts/oracle/orcl-02-soundness-scan.mjs:549-617`) uses `readdirSync` + exact `entry.name === wantedFilename` string compare (never OS path resolution) to detect the mismatch and throw `PolicyResolutionError`. Test file `test/unit/tools/oracle-orcl-02.test.ts`'s `describe("policy resolution is case-exact and loud (POLICY-01)")` (Tests A–F) is ungated (zero `RUN_AGDA_INTEGRATION` matches in the file) and spawns no Agda subprocess (zero `spawn`/`execFile` in the soundness-scan script). **Empirically re-ran all 6 tests on a genuinely case-sensitive APFS volume** (`hdiutil create -fs "Case-sensitive APFS"`, confirmed `foo.txt` does NOT resolve to `Foo.txt` there) — all 6 passed (`Test A`–`Test F`, 35/35 in that file). CI's `verify` job runs `npm test` (`vitest run`, includes `test/unit/**`) on `ubuntu-latest` without Agda (`.github/workflows/ci.yml`), so this test is in-scope for that job once pushed. |
| 3 | Genuinely-no-policy repos keep the v1.0 no-policy outcome, loudly surfaced in the wrapup run summary, never a quiet skip (D-03) | VERIFIED | `orcl-02-soundness-scan.mjs` Test E asserts `outcome.kind === "no-policy"` (never a throw) for a derived unresolvable key. `dogfood-wrapup.mjs:456` computes `noPolicy: results.filter(r => r.verdict?.orcl02?.kind === "no-policy").length` and includes it in the stdout summary line (`:467`) plus a per-capture stderr `WARNING`. |
| 4 | The wrapup resolves a corpus-derived `policyKey` from `scripts/data/fuel-corpora.json` at runtime when the manifest names a pinned corpus (D-01) | VERIFIED | `resolveWrapupPolicyKey({policyFlag, manifestPath})` (`dogfood-wrapup.mjs:291-333`) implements flag > unanimous-corpus-derived > `.agda-lib`-fallback precedence, importing `fuelCorpora` from `test/fixtures/fuel-corpora.js`. Unit tests in `dogfood-wrapup-filing.test.ts` cover flag-wins, unanimous-corpus-resolves, mixed-corpus, and unreadable-manifest branches — all pass. |
| 5 | All 8 `needsReverify` fix-queue entries reach `confirmed` (fresh evidence) or closed `unreproducible`; zero remain `needsReverify` (Success Criterion 3 / REVERIFY-01) | VERIFIED | `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` → **0** (ran myself). `RT-REVERIFY.md` has all 8 per-RT sections (RT1 cannot-reproduce; RT2–RT8 CONFIRMED) with Verdict lines and quoted raw envelopes. |
| 6 | RT1–RT8 verdicts were measured through the shipped pipeline (`dogfood-run.mjs` proxy → `agda_capture_session` → `dogfood-wrapup.mjs`), not ad-hoc harness scripts (D-06) | VERIFIED | `.agda-mcp/runs/{rt1..rt8}-20260703{,b}/wrapup-report.json` all exist on disk (9 directories, checked directly). Opened `rt2-20260703/wrapup-report.json` and the raw capture JSON under `tmp/rt-reverify/rt2/.agda-mcp/captures/` — the `agda_infer`/`agda_compute` `normalizedResponse` payloads match `RT-REVERIFY.md`'s quoted evidence byte-for-byte (`inferredType: "(unable to infer)"`, `normalForm: "(no result)"`, both `ok:true`). |
| 7 | No duplicate disconnected `new` entries are left by wrapup auto-filing; all cross-referenced (D-08) | VERIFIED | The 2 oracle-auto-filed rows (`1b612dfeb1d31ea9`, `1220f2840142aab8`) both carry `relatedFingerprint` back-links to their originating RT entries and are never left with an unexplained `status: new` — both are `triaged` with DEFERRED reasons. `grep -c '"status": "new"'` → 0. |
| 8 | RT4's pre-fix measurement precedes any `agda_auto` fix landing (D-08/D-12 no-race) | VERIFIED | Commit timestamps: RT4 measurement `f547c1f` at `2026-07-03 21:13:12`; `agda_auto` fix commits `26f8356`/`235b0b2` at `21:59:44`/`22:00:24` (46+ min later). `depends_on` chain in PLAN frontmatter enforces this at the plan level too (`06-04` → `06-03` → `06-02`). |
| 9 | Every confirmed live defect reaches `locked`, or is explicitly re-triaged with a recorded reason — none silently stalled (Success Criterion 4 / REVERIFY-02) | VERIFIED | `grep -c '"status": "locked"'` → 9, `"status": "triaged"` → 5 (every one carries a literal `"DEFERRED (Phase 6):"` note, checked row-by-row), `"status": "rejected"` → 1 (RT1, `cannot-reproduce` + `closedAt` set). 9+5+1 = 15 = total row count (`grep -c '"fingerprint":'`). Zero `status: new`. |
| 10 | `agda_auto` with a flag-shaped hint returns `ok:false`; the hint never reaches the Agsy payload (fingerprints `5abecc959e43fef3`/`004d161b839ce725`) | VERIFIED | `assertValidAutoHint()` (`src/agda/refactor-helpers.ts:113-121`) throws before any hint token is pushed to the flags array in `buildAutoSearchPayload`. `throwIfWriteRejected("agda_auto", ...)` in `goal-write-tools.ts:330` also guards the write path. Regression tests (`agent-ux.test.ts`, `goal-tools-give.test.ts`) pass. |
| 11 | `agda_give` of an ill-typed expression returns `ok:false`/`give-rejected`, never `ok:true` wrapping Agda's rejection text (fingerprint `bfcba437f5426fd6`) | VERIFIED | `give()` (`src/agda/goal-operations.ts:154-174`) computes `rejected`/`rejectionText` via `detectDisplayInfoError`; `goal-write-tools.ts:108-109` throws `giveRejectedError(...)` **before** the `applyEditAndReload` write branch (verified no write can happen on a rejected give). Tests pass (`goal-operations-give.test.ts`, `goal-tools-give.test.ts`). |
| 12 | `agda_proof_status` never appends "All goals solved." over live constraints (fingerprint `fdc90bfde12fb938`) | VERIFIED | `grep -n "NOT confirmed complete" src/tools/analysis-tools.ts` → exactly 1 match, gated on `metas.goals.length === 0 && !constraints.text`. Test passes (`analysis-tools.test.ts`). |
| 13 | `agda_search_definitions` accepts an optional, sandboxed `directory` parameter (fingerprint `eb7439cb3ed9d6b9`) | VERIFIED | `grep -n 'join("agda"' src/tools/file/search-definitions.ts` → 0 matches (hardcoding removed); routes through `resolveFileWithinRoot`/`resolveExistingPathWithinRoot`. Sandbox-escape test passes (`file-tools.test.ts`). |
| 14 | Every `locked` entry's cited regression-lock test(s) actually exist and pass — a lock note never references a red/missing test (D-11 integrity) | VERIFIED | Ran every named test file myself: `oracle-orcl-02.test.ts`, `oracle-run-oracle.test.ts`, `dogfood-wrapup-filing.test.ts`, `agent-ux.test.ts`, `goal-operations-give.test.ts`, `goal-tools-give.test.ts`, `analysis-tools.test.ts`, `file-tools.test.ts`, `expression-operations.test.ts`, `goal-operations-context-check.test.ts`, `register-agda-load-no-metas.test.ts` — all pass (0 failures). |
| 15 | Post-plan code-review hardening chain (CR-01–CR-04, WR-01–WR-05) landed correctly, extending the same rejection-detection pattern to `refine`/`refineExact`/`intro`/`caseSplit`/`autoOne`/`autoAll`/`elaborate` with no regressions | VERIFIED | Read every one of the 9 fix commits (`3155de3`…`4c959d9`, `e22a0bf`); confirmed current source state matches each resolution claim (`detectDisplayInfoError` reused 5+ places; `hasGiveActionResponse`/`hasMakeCaseResponse` now check payload non-emptiness with dedicated decoder tests; the WR-05 test now uses a plain object that genuinely lacks `.at()`). Full suite green (1666/1666), `tsc --noEmit` clean, `npm run build` clean, `no-dead-tool-references.test.ts` and `no-bare-command-strings.test.ts` both pass after the `goal-tools.ts` → `goal-write-tools.ts` split. |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/oracle/orcl-02-soundness-scan.mjs` | `PolicyResolutionError` + case-exact resolution | VERIFIED | Exports `PolicyResolutionError`, `judgeOrcl02`, `loadOraclePolicy`; `resolvePolicyStrict` wired at line 686 |
| `scripts/oracle/run-oracle.mjs` | `--policy` flag + passthrough | VERIFIED | Flag parsed line 293-294, threaded to `judgeOrcl02` line 232 |
| `scripts/dogfood/dogfood-wrapup.mjs` | `--policy` flag, corpus resolution, loud no-policy | VERIFIED | `resolveWrapupPolicyKey` exported and called in `scriptMain`; `noPolicy` summary field present |
| `test/unit/tools/oracle-orcl-02.test.ts` | Case-sensitive acceptance test, ungated | VERIFIED | 6 tests (A-F), zero `RUN_AGDA_INTEGRATION` gates, empirically re-run on real case-sensitive filesystem |
| `.planning/research/RT-REVERIFY.md` | Evidence report, RT1-8 + closing disposition table | VERIFIED | 406 lines (exceeds both plans' `min_lines` of 60/120); all 8 RT sections + Phase 6 closeout section present |
| `test/fixtures/fix-queue.json` | Terminal ledger, RT transitions, named-4 locked | VERIFIED | 15 rows: 9 locked / 5 triaged-DEFERRED / 1 rejected; contains "RT-REVERIFY.md" citation 9 times |
| `src/agda/refactor-helpers.ts` | `buildAutoSearchPayload` boundary validation | VERIFIED | `assertValidAutoHint()` present, 150 lines (well under 500) |
| `src/agda/goal-operations.ts` | `give()`/sibling rejection detection | VERIFIED | `detectDisplayInfoError` used in give/refine/refineExact/intro/caseSplit/autoOne/goalTypeContextCheck; 325 lines |
| `src/agda/types.ts` | `GiveResult.rejected`/`rejectionText` (optional) | VERIFIED | Fields present, optional, non-breaking for other callers |
| `src/tools/tool-errors.ts` | `giveRejectedError()`, generalized `writeActionRejectedError()`/`throwIfWriteRejected()` | VERIFIED | All three exported, 212 lines |
| `test/unit/tools/goal-tools-give.test.ts` | Envelope-level rejection proof | VERIFIED | Passes; asserts `isError`/classification |
| `src/tools/analysis-tools.ts` | Corrected completeness condition | VERIFIED | `NOT confirmed complete` string present exactly once; 422 lines |
| `src/tools/file/search-definitions.ts` | Optional sandboxed `directory` input | VERIFIED | No hardcoded `agda/` literal remains; 221 lines |
| `test/unit/tools/analysis-tools.test.ts` / `file-tools.test.ts` | New coverage for both fixes | VERIFIED | Both pass with the specific new test names cited in SUMMARYs |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `dogfood-wrapup.mjs` | `run-oracle.mjs` | `runOracleFn(artifactPath, orcl02Options)` | WIRED | Line 220-221, literal pattern present |
| `run-oracle.mjs` | `orcl-02-soundness-scan.mjs` | `judgeOrcl02(artifactPath, {policyKey})` | WIRED | Line 232 |
| `dogfood-wrapup.mjs` | `test/fixtures/fuel-corpora.ts` | `.js`-suffixed import | WIRED | Line 57 |
| `src/tools/goal-write-tools.ts` | `src/agda/goal-operations.ts` | `result.rejected` branch | WIRED | Lines 55/109/162/216/269/330, all placed **before** the corresponding `applyEditAndReload` write branch (verified no data-loss window) |
| `src/tools/goal-write-tools.ts` | `src/tools/tool-errors.ts` | `throw giveRejectedError(...)` / `throwIfWriteRejected(...)` | WIRED | Confirmed at every write-capable proof tool call site |
| `src/tools/goal-tools.ts` | `src/tools/goal-write-tools.ts` | `registerGoalWriteTools(server, session, repoRoot)` | WIRED | Line 172; `no-dead-tool-references.test.ts` passes post-split |

### Data-Flow Trace (Level 4)

Not applicable in the UI-rendering sense (this phase has no dashboard/component). The equivalent check — "does the fix's guard actually run before any side effect, and does the pipeline evidence reflect a real, non-fabricated run" — was performed as part of Observable Truths #6, #10, #11 above (raw capture JSON diffed against report prose; write-guard placement read line-by-line).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Case-mismatch policy fails loudly | `npx vitest run test/unit/tools/oracle-orcl-02.test.ts` (on a genuinely case-sensitive APFS volume) | 35/35 passed, including all 6 "POLICY-01" tests | PASS |
| Fix-queue schema invariants hold | `npx vitest run test/unit/fixtures/fix-queue.test.ts` | 10/10 passed | PASS |
| All named regression-lock tests | `npx vitest run` (11 named files) | 0 failures | PASS |
| Full project health | `npx vitest run` (full suite) | 205 files / 1666 tests passed, 16/179 skipped, 0 failed | PASS |
| Type safety | `npx tsc -p tsconfig.json --noEmit` | exit 0 | PASS |
| Build | `npm run build` | exit 0 | PASS |
| No dead tool references / no bare IOTCM strings (project invariants) | `npx vitest run test/unit/tools/no-dead-tool-references.test.ts test/unit/protocol/no-bare-command-strings.test.ts` | 6/6 passed | PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention; its own "probes" are the vitest regression suites and the live dogfood-pipeline runs, both covered under Behavioral Spot-Checks and Observable Truth #6.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLICY-01 | 06-01 | Runtime `--policy` passthrough, case-exact loud-fail resolution | SATISFIED | Truths #1-4; REQUIREMENTS.md already checked `[x]` / "Complete" |
| REVERIFY-01 | 06-02, 06-03 | All 8 `needsReverify` entries reach definitive state | SATISFIED | Truths #5-8; **REQUIREMENTS.md still shows `[ ]` / "Pending" in the traceability table** — a documentation-sync gap, not a functional gap (see Anti-Patterns) |
| REVERIFY-02 | 06-04, 06-05, 06-06 | Confirmed defects fixed → locked or re-triaged | SATISFIED | Truths #9-14; **REQUIREMENTS.md still shows `[ ]` / "Pending"** — same documentation-sync gap |

No orphaned requirements: `grep -E "Phase 6" .planning/REQUIREMENTS.md` maps exactly POLICY-01/REVERIFY-01/REVERIFY-02 to Phase 6, and all three appear in PLAN frontmatter `requirements:` fields across the 6 plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 13-14, 86-87 | REVERIFY-01/REVERIFY-02 checkboxes still `[ ]` and traceability table still says "Pending" despite ROADMAP.md marking Phase 6 `[x]` complete and all code evidence confirming satisfaction | Info | Documentation-tracking gap only — orchestrator should sync these checkboxes to `[x]`/"Complete" as part of closing this phase. Does not affect actual functional achievement. |
| `.planning/STATE.md` | Current Position / Progress fields | Shows "Phase 6 — EXECUTING, Plan 1 of 6, 0%" even though git history shows work through Phase 7 context-gathering already committed | Info | Same class of bookkeeping staleness; several SUMMARYs explicitly note "STATE.md updates intentionally NOT performed here — orchestrator centrally owns tracking writes." Not a code defect. |
| `scripts/oracle/orcl-02-soundness-scan.mjs` | 500-507, 586-591 | `resolvePolicyStrict`'s "on-disk policy file exists but fails to load (malformed JSON/schema mismatch)" branch has **zero test coverage** (found via Confirmation Bias Counter pass; confirmed via `grep -rn "exists in scripts/data/oracle-policy/ but failed to" test/` → 0 matches) | Info | Defense-in-depth branch beyond the plan's own Tests A-F scope; not required by any must-have; low likelihood (requires a shipped policy JSON to become malformed) and D-03-consistent behavior (throws, doesn't silently degrade) even if untested. Recommend a follow-up unit test, not blocking. |
| `scripts/oracle/run-oracle.mjs` | 65-66 | `EXCLUDED_SKIP_PLACEHOLDER`/`EXCLUDED_ORCL03_PLACEHOLDER` constant names contain "PLACEHOLDER" | Info | Chesterton's Fence check via `git blame`: pre-existing from Phase 2 (`5514348`, 2026-07-02), not introduced by this phase, and not a stub — legitimate named sentinel values for an excluded-predicate skip state. |

No Blocker or Warning-level anti-patterns found. No `TBD`/`FIXME`/`XXX` debt markers in any file this phase touched.

### Human Verification Required

None. Every truth in this phase is either a pure static/behavioral property (checkable by reading source + running tests) or a filesystem/pipeline property that could be empirically reproduced locally (the case-sensitive-filesystem requirement, which this verification pass closed directly via a disk image rather than deferring to a human/CI run).

### Gaps Summary

No gaps block the phase goal. Two Info-level documentation-tracking items exist (REQUIREMENTS.md checkbox/traceability staleness, STATE.md staleness) that the orchestrator should sync when closing this phase, and one Info-level test-coverage gap (an untested defensive branch in `resolvePolicyStrict` for a malformed on-disk policy file) that is worth a fast follow-up but does not affect any must-have or success criterion. All 4 ROADMAP success criteria and all must-haves declared across the phase's 6 plans are verified against the actual codebase — not just against SUMMARY.md claims. The post-plan code-review hardening chain (9 additional commits, `06-REVIEW.md`/`06-REVIEW-FIX.md`) was independently re-verified here and found to be genuinely resolved, with the full 1666-test suite green, `tsc`/`build` clean, and every regression-lock test named in `fix-queue.json`'s notes actually existing and passing.

---

_Verified: 2026-07-04T05:07:30Z_
_Verifier: Claude (gsd-verifier)_
