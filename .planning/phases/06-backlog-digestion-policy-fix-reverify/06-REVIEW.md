---
phase: 06-backlog-digestion-policy-fix-reverify
reviewed: 2026-07-04T03:43:34Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/agda/goal-operations.ts
  - src/agda/types.ts
  - src/protocol/responses/proof-actions.ts
  - src/tools/goal-tools.ts
  - src/tools/goal-write-tools.ts
  - src/tools/tool-errors.ts
  - src/tools/tool-helpers.ts
  - src/tools/analysis-tools.ts
  - src/agda/refactor-helpers.ts
  - scripts/dogfood/dogfood-wrapup.mjs
  - src/agda/advanced-queries.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 06: Code Review Report (re-review, iteration 2)

**Reviewed:** 2026-07-04T03:43:34Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This is a re-review verifying fix commits `3155de3`, `ed42cc4`, `e558069`,
`f57636d`, `2725dbc`, `33c34ec` (06-REVIEW-FIX.md, iteration 1) against the
6 in-scope findings from the prior pass (CR-01, CR-02, CR-03, WR-01, WR-02,
WR-03). Verification was done by tracing the actual pre/post diffs (`git
show <commit>`, `git diff 3155de3^ HEAD -- src/agda/goal-operations.ts`),
reading every new/changed decode-path and tool-callback line against the
original finding's described defect, reading every new regression test to
confirm it exercises the real code path (not a mock that begs the
question), running `npx tsc -p tsconfig.json --noEmit` (clean), and running
the full `test/unit` + `test/property` tiers (197 files / 1639 tests
passed, 1 file / 17 tests skipped, 0 failed).

**Result: all 6 are genuinely resolved.** CR-01/CR-02/CR-03 all now share
the identical `detectResponseError()` + a schema-presence guard
(`hasReplacementText()`/`hasMakeCaseResponse()`/`hasGiveActionResponse()`)
two-sided check `give()` originally pioneered, and every one of the 6
write-capable proof-action tools (`agda_case_split`, `agda_give`,
`agda_refine`, `agda_refine_exact`, `agda_intro`, `agda_auto`) now throws a
tool-specific `<op>-rejected` `ToolInvocationError` before any write-gating
logic runs. WR-01/WR-02/WR-03's production fixes are also all correct and
verified by direct code tracing, not just their own regression tests.

However, this re-review is **not clean**, for three reasons:

1. **The fixer's own documented follow-up predicts a live vulnerability
   the fixer flagged but did not fix.** `autoAll()` in
   `src/agda/advanced-queries.ts` shares the exact CR-03 shape
   (`decodeGiveLikeResponse()`'s unguarded raw-`DisplayInfo` fallback) and
   remains completely unpatched — confirmed by direct code reading, not
   just trusting the fixer's note. While investigating it, a **second,
   previously-unflagged sibling with the identical defect** was found:
   `elaborate()` in the same file. Filed together as **CR-04**.
2. **The brand-new CR-02/CR-03 guard helpers have their own residual gap.**
   `hasGiveActionResponse()`/`hasMakeCaseResponse()` (both introduced by
   this exact fix pass) check response-*kind* presence only; the zod
   schemas backing them explicitly permit an empty/absent payload, so the
   two-sided guard can theoretically still be defeated. Filed as **WR-04**.
3. **One of WR-03's two claimed regression tests is not actually
   from-RED.** Proven empirically (see WR-05) that the "non-array
   `recordedActions`" test uses a string value, which — because
   `String.prototype.at()` exists — does not reproduce the crash the test
   claims to guard against. The shipped production fix is still correct;
   only the test's evidentiary claim is overstated.

IN-01 and IN-02 remain open, unchanged, per this pass's explicit
out-of-scope instruction.

## Resolved Findings (this iteration)

### CR-01 — RESOLVED (commit `3155de3`)

`refine()` (`src/agda/goal-operations.ts:212-232`), `refineExact()`
(`:235-255`), and `intro()` (`:258-278`) each now call the same
`detectResponseError()` (`:53-63`) already used by `give()`, and compute
`rejected = errorText !== null && !hasReplacementText(replacementText)`
exactly as the original Fix snippet specified. `src/agda/types.ts:201-215`
(`GiveResult`) documents `rejected`/`rejectionText` as shared across all
four functions. `src/tools/goal-write-tools.ts` (the new sibling
`goal-tools.ts` was split into per CR-01's file-size trigger) calls
`throwIfWriteRejected("agda_refine"/"agda_refine_exact"/"agda_intro", ...)`
(lines 162, 216, 269) immediately after obtaining each result, before any
write-gating logic. `writeActionRejectedError()`/`throwIfWriteRejected()`
(`src/tools/tool-errors.ts:115-155`) generalize the give-only
`giveRejectedError` into a tool-agnostic helper, deriving classification
`<op>-rejected` from the tool name — confirmed against
`test/unit/tools/goal-tools-write-rejected.test.ts`'s assertions
(`refine-rejected`, `refine-exact-rejected`, `intro-rejected`).
`test/unit/agda/goal-operations-refine.test.ts` exercises the real
`refine()`/`refineExact()`/`intro()` functions (not mocks) against a
literal Error-`DisplayInfo` response fixture and confirms
`rejected: true`/`rejectionText` contains `"UnequalTerms"`. Diffed against
`3155de3^` to confirm the pre-fix functions had no such check.

### CR-02 — RESOLVED (commit `ed42cc4`)

`caseSplit()` (`src/agda/goal-operations.ts:150-167`) now computes
`rejected = errorText !== null && !hasMakeCaseResponse(responses)`, using
a new `hasMakeCaseResponse()` (`src/protocol/responses/proof-actions.ts:
213-215`) that mirrors `hasReplacementText()`'s two-sided-guard idiom.
`src/tools/goal-write-tools.ts:55` calls
`throwIfWriteRejected("agda_case_split", goalId, variable, result)`
*before* the `result.clauses.length > 0` write-gating block (verified by
reading the callback in full, lines 51-80) — this closes the data-loss
path (a rejected split's raw error text landing in the source file as a
fabricated clause) that made CR-02 more severe than CR-01/CR-03.
`test/unit/agda/goal-operations-case-split.test.ts` and the case-split
cases in `goal-tools-write-rejected.test.ts` (including a test explicitly
designed to crash against `applyEditAndReload` if the rejection check were
skipped — see its own comment) both pass.

### CR-03 — RESOLVED for the documented scope (commit `e558069`)

`autoOne()` (`src/agda/goal-operations.ts:297-315`) now computes
`rejected = errorText !== null && !hasGiveActionResponse(responses)`,
using a new `hasGiveActionResponse()` (`proof-actions.ts:129-131`).
`src/tools/goal-write-tools.ts:330` calls
`throwIfWriteRejected("agda_auto", goalId, payload, result)` before the
`hasReplacementText(result.solution)` write-gating check (lines 320-357).
`test/unit/agda/goal-operations-auto-one.test.ts` reproduces the
empirically-recorded `fix-queue.json` `NotInScope`-as-solution shape and
confirms `rejected: true`. As the fix report itself documents (and the
original finding anticipated), this closes only the `Error`-kind half of
the gap for `autoOne()`/`agda_auto` specifically — the `Auto`-kind "no
solution found" sub-case for that one function remains an intentionally
deferred, documented open question pending a live-Agda probe.
**Superseded/broadened by CR-04 below**: the *sibling* functions sharing
the identical `decodeGiveLikeResponse()` fallback (`autoAll()`,
`elaborate()`) were never touched by this commit at all, not even
partially.

### WR-01 — RESOLVED (commit `f57636d`)

`src/tools/analysis-tools.ts:66` now computes a single
`hasConstraints = constraints.text.trim().length > 0` and reuses it for
every branch in `agda_proof_status`: the `**Constraints:** yes` line
(`:71`), the `### Constraints` section (`:84`), the completeness tagline
(`:88-92`), and the returned `data.hasConstraints` (`:99`) — confirmed no
other raw-truthiness check on `constraints.text` remains in the function.
`test/unit/tools/analysis-tools.test.ts:149-174` passes a whitespace-only
`constraints: async () => ({ text: "   \n" })` fixture and asserts `"All
goals solved."` plus `data.hasConstraints === false`, which would fail
under the pre-fix raw-truthiness check (`!"   \n"` is `false`, so the
pre-fix code would have taken the "NOT confirmed complete" branch while
reporting `hasConstraints` inconsistently) — genuinely from-RED.

### WR-02 — RESOLVED (commit `2725dbc`)

`matchesTypePattern()` (`src/agda/refactor-helpers.ts:52-62`) replaced the
skip-ahead walk with strict positional comparison: pattern token `i` must
match actual token `i` exactly (only `_` is a wildcard), and a pattern
longer than the actual token stream can never match. Confirmed the sole
caller (`src/tools/file/search-definitions.ts:173`) doesn't rely on
mid-string alignment (it's a prefix match against a definition's type
signature, matching the function's own documented "prefix match, not full
match" contract). `test/unit/agda/agent-ux.test.ts:80` asserts
`matchesTypePattern("Nat -> Bool + Bool -> Nat", "Nat + Nat") === false`
(previously `true` per the original finding) and the pre-existing
reflexivity property test (`test/property/agda/agent-ux.property.test.ts:
55`) still passes under the new implementation.

### WR-03 — Production fix RESOLVED (commit `33c34ec`); see new WR-05 for a test-coverage caveat

`scripts/dogfood/dogfood-wrapup.mjs:139-148`'s `affectedTool` fallback now
reads:
```js
lastLoadFamilyToolName(artifact.recordedActions)
?? (Array.isArray(artifact.recordedActions) ? artifact.recordedActions.at(-1)?.tool : undefined)
?? "unknown",
```
which guards the `.at(-1)` call with the same `Array.isArray` check
`lastLoadFamilyToolName()` uses internally. This **is** a correct and
complete fix — verified empirically (not just read) by extracting the
pre-fix formula and running it against `recordedActions = undefined`,
which throws `Cannot read properties of undefined (reading 'at')`
pre-fix and returns `"unknown"` post-fix. See **WR-05** below for a
caveat about this commit's own regression-test coverage.

## Critical Issues

### CR-04: `autoAll()` and `elaborate()` still return Agda's raw rejection text as a fabricated result — the same `decodeGiveLikeResponse()` gap CR-01/CR-03 fixed everywhere else in `goal-operations.ts`

**File:** `src/agda/advanced-queries.ts:196-205` (`autoAll`), `:120-132` (`elaborate`)
**Issue:**
The fix report for CR-03 explicitly flagged this as an unfixed follow-up
("`src/agda/advanced-queries.ts`'s `autoAll()` ... shares the identical
`Cmd_autoAll`/`decodeGiveLikeResponse` vulnerability shape as CR-03's
`autoOne()` ... left untouched ... Worth a follow-up finding"). Tracing the
current code confirms this is real and still live:
```ts
/** Auto-solve all goals. */
export async function autoAll(ctx: AgdaCommandContext): Promise<AutoResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(rewriteTopLevelCommand("Cmd_autoAll", "Normalised")),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  return { solution: decodeGiveLikeResponse(responses) };
}
```
`autoAll()` returns an `AutoResult` — the exact same type CR-03 added
`rejected`/`rejectionText` to — but never populates them, and never calls
`detectResponseError`/`hasGiveActionResponse`. `agda_auto_all`'s callback
(`src/tools/query-tools.ts:184-196`) has no `writeToFile` option and never
writes to a file (`inputSchema: {}`, no call to `applyEditAndReload`
anywhere in the function), so this cannot corrupt a file the way CR-02/
CR-03 could — but it unconditionally reports `ok:true` /
`hasSolution: Boolean(result.solution)` regardless of whether
`result.solution` is a genuine auto-search result or Agda's own
`NotInScope`/internal-error text, which is the identical "ok wraps a real
Agda rejection" false-green shape CR-01 was rated Critical for (also with
no write consequence). No test exists for this at all —
`test/unit/tools/query-tools.test.ts:47` stubs `autoAll` to always return
`{ solution: "" }`, never exercising the non-empty/rejection case.

While verifying this, an independent second instance of the identical
pattern was found in the same file:
```ts
/** Elaborate an expression in a goal context. */
export async function elaborate(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<ElaborateResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_elaborate_give", "Normalised", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  return { elaboration: decodeGiveLikeResponse(responses) };
}
```
`agda_elaborate` (`src/tools/expression-tools.ts:151-176`) is also
read-only (no write path) and displays `result.elaboration` verbatim as
"the fully explicit form" of the expression — an ill-typed `expr` would
have its Error-`DisplayInfo` rejection text displayed as if it were a
successful elaboration, again with `ok:true`.

Both are "mislead, not corrupt" — the same severity driver that made
CR-01 Critical rather than the data-loss driver that made CR-02/CR-03
"strictly more severe." Given this project's explicit purpose is
detecting and eliminating false-green tool responses for an AI agent
driving proof work (a false `hasSolution:true` for "solve ALL goals," in
particular, is exactly the kind of totalizing false-positive that could
cause an agent to conclude a file is fully proved when it embeds Agda's
own error text), this is rated Critical for consistency with CR-01's own
precedent in this document.

**Fix:**
Promote `give()`'s private `detectResponseError()` to a shared, exported
helper next to its siblings in `proof-actions.ts` (both call sites already
import from there):
```ts
// src/protocol/responses/proof-actions.ts
export function detectDisplayInfoError(responses: AgdaResponse[]): string | null {
  for (const resp of responses) {
    const display = parseResponseWithSchema(displayInfoResponseSchema, resp);
    if (!display) continue;
    if (display.info.kind === "Error") {
      return decodeDisplayInfoEvents([resp]).at(-1)?.text ?? "";
    }
  }
  return null;
}
```
```ts
// src/agda/advanced-queries.ts
export async function autoAll(ctx: AgdaCommandContext): Promise<AutoResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(rewriteTopLevelCommand("Cmd_autoAll", "Normalised")),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasGiveActionResponse(responses);
  return {
    solution: decodeGiveLikeResponse(responses),
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

export async function elaborate(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<ElaborateResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_elaborate_give", "Normalised", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  const errorText = detectDisplayInfoError(responses);
  if (errorText !== null) {
    throw new Error(errorText);
  }
  return { elaboration: decodeGiveLikeResponse(responses) };
}
```
Then have `agda_auto_all`'s callback branch on `result.rejected` (throwing
an `ok:false`/`auto-all-rejected` `ToolInvocationError`, mirroring
`throwIfWriteRejected`'s pattern but without a `goalId` since this is a
whole-file operation) instead of unconditionally returning `ok:true`.
`agda_elaborate` needs no tool-layer change beyond letting `elaborate()`'s
thrown `Error` propagate — `registerGoalTextTool`'s wrapper already
converts an uncaught throw into an error envelope, the same pattern
`goalTypeContextCheck()` already uses for the same reason.

## Warnings

### WR-04: `hasGiveActionResponse()`/`hasMakeCaseResponse()` (new in this phase) only check response-*kind* presence, not payload non-emptiness

**File:** `src/protocol/responses/proof-actions.ts:129-131`, `:213-215`
**Issue:**
```ts
export function hasGiveActionResponse(responses: AgdaResponse[]): boolean {
  return responses.some((resp) => parseResponseWithSchema(giveActionResponseSchema, resp) !== null);
}
...
export function hasMakeCaseResponse(responses: AgdaResponse[]): boolean {
  return responses.some((resp) => parseResponseWithSchema(makeCaseResponseSchema, resp) !== null);
}
```
Both helpers were introduced by this exact fix pass (CR-02/CR-03) to form
a two-sided guard alongside `detectResponseError()`. Both only check that
a response of the right *kind* is present in the batch — not that its
payload is non-empty. The backing schemas explicitly allow an empty
payload:
```ts
// src/protocol/response-schemas.ts:147-156
export const giveActionResponseSchema = agdaResponseSchema.extend({
  kind: z.literal("GiveAction"),
  giveResult: z.string().optional(),
  result: z.string().optional(),
});
export const makeCaseResponseSchema = agdaResponseSchema.extend({
  kind: z.literal("MakeCase"),
  clauses: z.array(z.string()).optional(),
});
```
`decodeGiveLikeResponse()`/`decodeCaseSplitResponses()` both fall back to
the DisplayInfo text whenever the primary payload is empty (`if (val)
result = renderGiveResult(val);` / `if (clauses.length > 0) return
clauses;`). So: if a single `Cmd_autoOne`/`Cmd_make_case` response batch
ever contained *both* a schema-conformant but empty-payload
`GiveAction`/`MakeCase` response *and* a separate Error `DisplayInfo`
response, `hasGiveActionResponse()`/`hasMakeCaseResponse()` would report
`true` (a genuine action is "present"), so `rejected` would compute to
`false` — while the decoder, seeing an empty primary payload, falls
through to the *Error's* text as `result.solution`/`result.clauses`. That
reproduces the exact CR-02/CR-03 false-green-or-corruption shape through a
gap in the very guard added to close it. This is unverified against real
Agda output (unlike CR-02/CR-03's original fix-queue.json-backed evidence)
— it is a structural gap proven from the schema/decoder definitions, not
an observed failure — so it is filed as a Warning, mirroring how CR-03's
own "Auto-kind no-solution" sub-case was documented as a deferred,
unconfirmed risk rather than a proven Critical.
**Fix:** Make both helpers content-aware, matching `hasReplacementText()`'s
own non-empty-string semantics:
```ts
export function hasGiveActionResponse(responses: AgdaResponse[]): boolean {
  return responses.some((resp) => {
    const give = parseResponseWithSchema(giveActionResponseSchema, resp);
    return give !== null && Boolean(give.giveResult ?? give.result);
  });
}

export function hasMakeCaseResponse(responses: AgdaResponse[]): boolean {
  return responses.some((resp) => {
    const makeCase = parseResponseWithSchema(makeCaseResponseSchema, resp);
    return makeCase !== null && (makeCase.clauses ?? []).some(Boolean);
  });
}
```
Recommend a live-Agda probe (this phase's own established verification
method for CR-01/CR-02) to confirm whether Agda ever actually emits this
combination before treating it as purely theoretical.

### WR-05: WR-03's "non-array `recordedActions`" regression test does not actually reproduce the crash it claims to guard against

**File:** `test/unit/tools/dogfood-wrapup-filing.test.ts:454-464`
**Issue:** The fix report for WR-03 claims "Added two from-RED regression
tests (missing and non-array `recordedActions` cases)". The "missing"
case is genuinely from-RED (verified empirically below). The "non-array"
case is not:
```ts
test("buildQueueEntryFromVerdict: affectedTool falls back to \"unknown\" instead of throwing when recordedActions is not an array", () => {
  const artifact = { ...baseArtifact(), recordedActions: "not-an-array" };
  ...
  expect(entry.affectedTool).toBe("unknown");
});
```
`"not-an-array"` is a **string**, and `String.prototype.at()` has existed
since ES2022 — so the pre-fix formula
(`artifact.recordedActions.at(-1)?.tool`) does **not** throw for a string
value; it evaluates to `"not-an-array".at(-1)` (`"y"`), then `"y".tool`
(`undefined`), then falls through to `?? "unknown"` — the same final
result as the fixed code. Verified directly by extracting the literal
pre-fix formula and running it in isolation:
```
$ node -e '... preFixAffectedTool("not-an-array") ...'
result: unknown          // no throw — passes on BOTH old and new code
$ node -e '... preFixAffectedTool({}) ...'
THREW: recordedActions.at is not a function   // this WOULD have caught the bug
```
So this specific test would have passed unchanged even if commit
`33c34ec`'s fix were fully reverted — it provides no actual regression
protection for the "non-array" class of input the commit message and test
name both claim to cover (only `undefined`/`null`/plain-object/number
shapes actually exercise the crash). The shipped production code is
still correct and complete (`Array.isArray(...)` correctly rejects a
string too) — this finding is about the test's evidentiary value, not the
runtime behavior.
**Fix:** Replace or supplement the string-based case with a value that
genuinely lacks `.at()`, e.g.:
```ts
test("buildQueueEntryFromVerdict: affectedTool falls back to \"unknown\" instead of throwing when recordedActions is a plain object", () => {
  const artifact = { ...baseArtifact(), recordedActions: { not: "an-array" } };
  const entry = buildQueueEntryFromVerdict(
    artifact,
    "capture.json",
    fakeVerdict({ orcl01: { kind: "server-false-green-candidate" } }),
  );
  expect(entry.affectedTool).toBe("unknown");
});
```

## Info

### IN-01: `giveRejectedError()`'s generic message overclaims the rejection reason (still open — out of scope this pass)

**File:** `src/tools/tool-errors.ts:85`
**Issue:** Unchanged since the original review — confirmed still present
verbatim:
```ts
const message = `Agda rejected \`${expr}\` for goal ?${goalId} — the expression does not satisfy the goal type.`;
```
This fallback (used only when `rejectionText` is `null`) is worded as if
every rejection is a type mismatch, but the same path also fires for
`NotInScope` and parse errors.
**Fix:** Use reason-neutral wording, e.g. `` `Agda declined to accept
\`${expr}\` for goal ?${goalId}.` ``.

### IN-02: Magic number `50` duplicated in `agda_search_definitions`'s visible-match cap (still open — out of scope this pass)

**File:** `src/tools/file/search-definitions.ts:185,192`
**Issue:** Unchanged since the original review — confirmed still present:
`matches.slice(0, 50)` and `matches.length > 50` both hardcode the same
cap independently, unlike `MAX_RAW_MATCHES` a few lines above.
**Fix:**
```ts
const MAX_VISIBLE_MATCHES = 50;
...
const capped = matches.slice(0, MAX_VISIBLE_MATCHES);
...
output = `## Search (${mode}): "${actualQuery}" (${matches.length} matches${matches.length > MAX_VISIBLE_MATCHES ? `, showing first ${MAX_VISIBLE_MATCHES}` : ""})\n\n`;
```

### IN-03: `writeActionRejectedError()`'s `extraData` parameter is unused

**File:** `src/tools/tool-errors.ts:115-138`
**Issue:**
```ts
export function writeActionRejectedError(
  tool: string,
  goalId: number,
  attempted: string,
  rejectionText: string | null,
  extraData: Record<string, unknown> = {},
): ToolInvocationError<Record<string, unknown>> {
  ...
  data: { goalId, written: false, ...extraData },
```
No call site in `src/` or `test/` ever passes a 5th argument — confirmed
via `grep -rn "writeActionRejectedError("`, which only shows the single
zero-extra-args call inside `throwIfWriteRejected()`. This is speculative
generality the docstring anticipates ("`extraData` merges tool-specific
fields (e.g. `clauses: []` for case-split)") but no caller actually needs
yet.
**Fix:** Either remove the unused parameter until a real caller needs it,
or use it from `throwIfWriteRejected()` for at least one tool (e.g. thread
`clauses: []` through for `agda_case_split`) so the generality it was
added for is actually exercised.

---

_Reviewed: 2026-07-04T03:43:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
