---
phase: 06-backlog-digestion-policy-fix-reverify
fixed_at: 2026-07-04T03:30:17Z
review_path: .planning/phases/06-backlog-digestion-policy-fix-reverify/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-07-04T03:30:17Z
**Source review:** .planning/phases/06-backlog-digestion-policy-fix-reverify/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03 — IN-01/IN-02 explicitly out of scope this pass)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: `refine()`, `refineExact()`, and `intro()` still wrap an Agda rejection in an `ok:true` response

**Files modified:** `src/agda/goal-operations.ts`, `src/agda/types.ts`, `src/tools/goal-tools.ts`, `src/tools/goal-write-tools.ts` (new), `src/tools/tool-errors.ts`, `src/tools/tool-helpers.ts`, `test/unit/agda/goal-operations-refine.test.ts` (new), `test/unit/tools/goal-tools-write-rejected.test.ts` (new)
**Commit:** 3155de3
**Applied fix:** `refine()`, `refineExact()`, and `intro()` now populate `GiveResult.rejected`/`rejectionText` using the same `detectResponseError()` scan + `hasReplacementText()` two-sided guard `give()` already uses. Generalized `giveRejectedError` into a new `writeActionRejectedError(tool, goalId, attempted, rejectionText, extraData?)` in `tool-errors.ts` (classification derived per-tool, e.g. `refine-rejected`), plus a `throwIfWriteRejected(tool, goalId, attempted, result)` one-line branch-and-throw helper so each tool callback needs a single call. `giveRejectedError` itself was left untouched (its wording is IN-01, explicitly out of scope). Split `goal-tools.ts` into a thin read-only barrel plus a new `goal-write-tools.ts` sibling (the six write-capable proof-action tools) to stay under the project's 500-line-per-file ceiling once these checks were added — same barrel/sibling pattern as `src/agda/agent-ux.ts` / `src/tools/agent-ux-tools.ts`. Deviated from the REVIEW.md Fix snippet's literal per-tool `if (result.rejected) { throw ...; }` block only insofar as it was compressed into the shared one-line helper for file-size reasons; the resulting behavior is identical.

### CR-02: `caseSplit()` can write Agda's raw error text into the source file as a fabricated case-split clause

**Files modified:** `src/agda/goal-operations.ts`, `src/agda/types.ts`, `src/protocol/responses/proof-actions.ts`, `src/tools/goal-write-tools.ts`, `test/unit/agda/goal-operations-case-split.test.ts` (new), `test/unit/tools/goal-tools-write-rejected.test.ts`
**Commit:** ed42cc4
**Applied fix:** Added `hasMakeCaseResponse()` to `proof-actions.ts` (mirrors the existing `hasReplacementText()` idiom: true iff a genuine schema-conformant `MakeCase` response is present, as opposed to `decodeCaseSplitResponses()`'s raw-`DisplayInfo` fallback). `caseSplit()` now populates `CaseSplitResult.rejected`/`rejectionText`, requiring BOTH an Error display AND no genuine `MakeCase` response — the same two-sided guard as CR-01/give(), applied here because REVIEW.md's own analysis of this exact codebase's `give()` design explicitly warns that a single-sided check risks misclassifying a successful action that also emits an unrelated display as rejected. `agda_case_split`'s callback calls `throwIfWriteRejected` immediately after obtaining the result, before the `clauses.length > 0` write-gating block. Deviated from the REVIEW.md Fix snippet (which throws a bare `Error` directly inside `caseSplit()`) to keep the "tool adapters branch on the result and throw the appropriate `ToolInvocationError`" layering explicit in the task constraints — this also yields a specific `case-split-rejected` classification instead of a generic `tool-error`.

### CR-03: `autoOne()` can write Agda's own error/rejection text into a goal's hole as a fabricated "solution"

**Files modified:** `src/agda/goal-operations.ts`, `src/agda/types.ts`, `src/protocol/responses/proof-actions.ts`, `src/tools/goal-write-tools.ts`, `test/unit/agda/goal-operations-auto-one.test.ts` (new), `test/unit/tools/goal-tools-write-rejected.test.ts`
**Commit:** e558069
**Applied fix:** Added `hasGiveActionResponse()` to `proof-actions.ts` (true iff a genuine `GiveAction` response is present). `autoOne()` now populates `AutoResult.rejected`/`rejectionText` requiring BOTH an Error display AND no genuine `GiveAction` response. `agda_auto`'s callback calls `throwIfWriteRejected("agda_auto", ...)` immediately after obtaining the result, before any write-gating logic. As REVIEW.md itself notes, this closes only the `Error`-kind half of the gap (matching the empirically-recorded `NotInScope`-as-`hasSolution:true` shape in `test/fixtures/fix-queue.json` fingerprints `5abecc959e43fef3`/`004d161b839ce725`); the `Auto`-kind "no solution found" sub-case remains open pending a live-Agda probe, and this is documented in `autoOne()`'s doc comment and in the `AutoResult.rejected` field doc, matching REVIEW.md's own stated scope.

### WR-01: `agda_proof_status`'s completeness branch and `data.hasConstraints` use two different emptiness checks

**Files modified:** `src/tools/analysis-tools.ts`, `test/unit/tools/analysis-tools.test.ts`
**Commit:** f57636d
**Applied fix:** Introduced a single trimmed `hasConstraints` value computed once and reused for every branch in the function — the `**Constraints:** yes` summary line and the `### Constraints` section header (neither of which REVIEW.md's Fix snippet touched) as well as the "All goals solved" / "NOT confirmed complete" tagline branch and the returned `data.hasConstraints`. Widened beyond the REVIEW.md Fix snippet's two-line-scoped patch because the untouched raw-truthiness checks at the two other call sites could still reproduce the identical `text`/`data` self-contradiction class the finding was about (e.g. printing `**Constraints:** yes` while `data.hasConstraints` is `false`) — closing only the one branch the snippet showed would have left the same fingerprint reachable through a second path in the same function.

### WR-02: `matchesTypePattern()` lets literal tokens skip ahead, producing false-positive matches

**Files modified:** `src/agda/refactor-helpers.ts`, `test/unit/agda/agent-ux.test.ts`
**Commit:** 2725dbc
**Applied fix:** Replaced the skip-ahead walk with strict positional comparison exactly as REVIEW.md's Fix snippet specifies: each pattern token must match the actual token at the same index (only `_` "consumes and moves on"), and a pattern longer than the actual token stream can never match. Verified the two pre-existing unit tests and the `matchesTypePattern(text, text)` reflexivity property test still pass (they already aligned from position 0, as REVIEW.md predicted), added a from-RED regression test for the exact false-positive example REVIEW.md gave, and ran the full `test/unit` + `test/property` tiers per REVIEW.md's explicit recommendation for this shared-helper behavior change (1632/1632 passed, 22 skipped, before the WR-03 commit was added on top).

### WR-03: `buildQueueEntryFromVerdict()`'s `affectedTool` fallback is unguarded against non-array `recordedActions`

**Files modified:** `scripts/dogfood/dogfood-wrapup.mjs`, `test/unit/tools/dogfood-wrapup-filing.test.ts`
**Commit:** 33c34ec
**Applied fix:** Applied REVIEW.md's Fix snippet verbatim: the fallback now guards with `Array.isArray(artifact.recordedActions)` before calling `.at(-1)` on it, matching `lastLoadFamilyToolName()`'s own defensive coercion on the line above. Added two from-RED regression tests (missing `recordedActions`, and a non-array `recordedActions` value) confirming the fallback degrades to `"unknown"` instead of throwing.

## Skipped Issues

None — all 6 in-scope findings were fixed.

## Verification

- `npx tsc -p tsconfig.json --noEmit`: clean (no diagnostics).
- `npm run build`: clean (`tsc` + `scripts/copy-json-assets.mjs`, exit 0).
- `npx vitest run` (full suite: `test/examples`, `test/unit`, `test/property`, `test/integration`, live Agda 2.8.0 available on PATH): **201 test files passed, 16 skipped (217 total); 1650 tests passed, 179 skipped (1829 total); 0 failed.**

## Notes for the reviewer

- `agda_case_split` and `agda_auto` now use a `<op>-rejected` classification (`case-split-rejected`, `auto-rejected`) constructed by the new `writeActionRejectedError()`/`throwIfWriteRejected()` helpers in `tool-errors.ts`, rather than the literal bare-`Error`-throw shown in REVIEW.md's CR-02/CR-03 Fix snippets. This was a deliberate adaptation (see CR-02/CR-03 entries above) to keep the tool/agda layering boundary from the task's constraints intact and to give callers a specific, actionable classification instead of a generic `tool-error`.
- `src/tools/goal-tools.ts` was split into a barrel (read-only goal/context/checked-term queries) plus a new `src/tools/goal-write-tools.ts` sibling (the six write-capable proof-action tools: case_split, give, refine, refine_exact, intro, auto) to stay under the project's 500-line-per-file ceiling. `register-core-tools.ts` required no changes — `goal-tools.ts`'s exported `register()` signature is unchanged and now internally delegates to `registerGoalWriteTools(...)`.
- `src/agda/advanced-queries.ts`'s `autoAll()` (backing the separate `agda_auto_all` tool in `query-tools.ts`) shares the identical `Cmd_autoAll`/`decodeGiveLikeResponse` vulnerability shape as CR-03's `autoOne()`, but is not named in REVIEW.md's findings and was left untouched to keep this pass strictly scoped to CR-01/CR-02/CR-03/WR-01/WR-02/WR-03. Worth a follow-up finding.
- IN-01 (`giveRejectedError`'s overclaiming message wording) and IN-02 (duplicated magic number `50` in `search-definitions.ts`) were left untouched per the explicit out-of-scope instruction for this pass.

---

_Fixed: 2026-07-04T03:30:17Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
