---
phase: 06-backlog-digestion-policy-fix-reverify
reviewed: 2026-07-04T02:55:41Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - scripts/dogfood/dogfood-wrapup.mjs
  - scripts/oracle/orcl-02-soundness-scan.mjs
  - scripts/oracle/run-oracle.mjs
  - src/agda/expression-operations.ts
  - src/agda/goal-operations.ts
  - src/agda/refactor-helpers.ts
  - src/agda/types.ts
  - src/session/register-agda-load-no-metas.ts
  - src/tools/analysis-tools.ts
  - src/tools/file/search-definitions.ts
  - src/tools/goal-tools.ts
  - src/tools/tool-errors.ts
  - src/tools/tool-helpers.ts
  - test/fixtures/fix-queue.json
  - test/unit/agda/agent-ux.test.ts
  - test/unit/agda/expression-operations.test.ts
  - test/unit/agda/goal-operations-context-check.test.ts
  - test/unit/agda/goal-operations-give.test.ts
  - test/unit/fixtures/fix-queue.test.ts
  - test/unit/session/register-agda-load-no-metas.test.ts
  - test/unit/tools/analysis-tools.test.ts
  - test/unit/tools/dogfood-wrapup-filing.test.ts
  - test/unit/tools/file-tools.test.ts
  - test/unit/tools/goal-tools-give.test.ts
  - test/unit/tools/oracle-orcl-02.test.ts
  - test/unit/tools/oracle-run-oracle.test.ts
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-07-04T02:55:41Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the phase's 7 claimed defect fixes (agda_auto flag-injection, the
give/compute/infer/context-check Error-DisplayInfo rejection detectors,
agda_proof_status's completeness claim, agda_search_definitions's directory
param) plus the new `--policy` passthrough and case-exact resolution in the
oracle scripts. Each fix, evaluated narrowly against its own stated scope, is
implemented correctly and is backed by real regression tests (verified by
tracing `detectResponseError`/`throwOnDisplayError`/`resolvePolicyStrict`
call sites and cross-checking against `git show` for the 8 commits that
touched these files).

However, the batch left the *exact same root-cause defect it was fixing*
alive in sibling functions of the very files it touched. `give()`,
`compute()`/`computeTopLevel()`, `infer()`/`inferTopLevel()`, and
`goalTypeContextCheck()` were all patched to detect an Agda-reported
`DisplayInfo`/`Error` response instead of silently decoding a success shape
around it — but `refine()`, `refineExact()`, `intro()`, `caseSplit()`, and
`autoOne()` in the same `src/agda/goal-operations.ts` file were not, despite
sharing the identical response-decoding helpers
(`decodeGiveLikeResponse`/`decodeCaseSplitResponses`) and the identical
protocol behavior. For `caseSplit()`/`autoOne()` this is worse than a
misleading `ok:true` — because their tool callbacks gate the *file write*
on "did we get non-empty text back" rather than "did Agda actually accept
this", Agda's own rejection/error text can be written into the user's
`.agda` source file as if it were a legitimate case-split clause or a
found auto-search solution. `fix-queue.json`'s own entries for
`5abecc959e43fef3`/`004d161b839ce725` already recorded empirical proof that
`agda_auto`'s `data.solution` can carry Agda's raw rejection text while
`hasSolution:true` — the phase's fix (`assertValidAutoHint`) closes only the
flag-injection *entry point* into that behavior, not the decode-side
vulnerability itself.

Two secondary findings (a `text`/`data` self-contradiction risk in
`agda_proof_status` and a false-positive-prone type-pattern matcher) and two
minor Info items round out the report. `test/fixtures/fix-queue.json` itself
was checked for internal consistency (fingerprint uniqueness,
`relatedFingerprint` references, and factual accuracy of the "FIXED" notes
against the actual diffs) and found accurate — none of its claims overstate
what was actually fixed.

## Critical Issues

### CR-01: `refine()`, `refineExact()`, and `intro()` still wrap an Agda rejection in an `ok:true` response — the same bug just fixed for `give()`

**File:** `src/agda/goal-operations.ts:185-236`
**Issue:**
This phase fixed `give()` (commit `e11211c`) so that an Agda-rejected
expression (delivered as a `DisplayInfo` response with `info.kind ===
"Error"`, never via stderr) is detected via the new `detectResponseError()`
helper and surfaced as `rejected: true` / `rejectionText`, which
`agda_give`'s callback turns into `ok:false`/`give-rejected`
(`src/tools/goal-tools.ts:172-173`). The type carrying this outcome
documents the narrowed scope explicitly:

```ts
// src/agda/types.ts:195-202
/**
 * True when Agda rejected the expression — an Error DisplayInfo
 * response with no confirmed replacement — rather than accepting
 * it. Populated by give() only; refine()/refineExact()/intro() do
 * not populate this field yet (give-only fix, fingerprint
 * bfcba437f5426fd6).
 */
rejected?: boolean;
```

`refine()` (line 185), `refineExact()` (line 203), and `intro()` (line 221)
call only `throwOnFatalProtocolStderr(responses)` — confirmed
(`src/agda/protocol-errors.ts`) to inspect *stderr* text against three fatal
regexes and nothing else; it never looks at `DisplayInfo`/`Error` responses.
When Agda rejects a `refine`/`intro` expression the same way it rejects a
`give` expression, `resolveGiveReplacementText` returns `null` (no
`GiveAction` was ever emitted), so no file write happens — but
`decodeGiveLikeResponse` still falls back to the raw `DisplayInfo` text as
`result.result`, and `goal-tools.ts`'s `agda_refine`/`agda_refine_exact`/
`agda_intro` callbacks (lines 221-252, 254-305, 307-356) never throw, so
`registerGoalTextTool`'s wrapper (`src/tools/tool-registration.ts`)
unconditionally returns `okEnvelope(...)`. The MCP client sees
`ok:true`/`classification:"ok"` with Agda's raw rejection text
(`UnequalTerms`, `NotInScope`, ...) embedded in `data.result` — the exact
"ok wraps a real Agda rejection" false-green shape fingerprint
`bfcba437f5426fd6` was created to close, just reachable through three
different tool names. No test file in this repo exercises rejection
detection for `refine`/`refineExact`/`intro` (confirmed via
`grep -rn "detectResponseError\|rejected" src/agda/goal-operations.ts` and
a search of `test/unit` for case-split/refine-rejection coverage — none
exists).

**Fix:**
```ts
// src/agda/goal-operations.ts — apply to refine(), refineExact(), intro()
export async function refine(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<GiveResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_refine_or_intro", "True", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const replacementText = resolveGiveReplacementText(responses, expr);
  const errorText = detectResponseError(responses);
  const rejected = errorText !== null && !hasReplacementText(replacementText);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText,
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}
```
(`detectResponseError` is already defined earlier in this same file for
`give()`'s use, so no new import or export is required — `refine()`/
`refineExact()`/`intro()` can call it directly.) Then in
`src/tools/goal-tools.ts`, throw the same way `agda_give` does (generalize
`giveRejectedError` to a tool-agnostic
`writeActionRejectedError(tool, goalId, expr, rejectionText)` rather than
copy-pasting a `give`-flavored classification string onto three unrelated
tools):
```ts
const result = await session.goal.refine(goalId, exprStr);
if (result.rejected) {
  throw writeActionRejectedError("agda_refine", goalId, exprStr, result.rejectionText ?? null);
}
```
Repeat for `refineExact()`/`agda_refine_exact` and `intro()`/`agda_intro`.

---

### CR-02: `caseSplit()` can write Agda's raw error text into the source file as a fabricated case-split clause

**File:** `src/agda/goal-operations.ts:137-148` (decode), `src/tools/goal-tools.ts:116-144` (write gate)
**Issue:**
`caseSplit()` never calls `detectResponseError`/an equivalent guard:
```ts
export async function caseSplit(
  ctx: AgdaCommandContext,
  goalId: number,
  variable: string,
): Promise<CaseSplitResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(goalCommand("Cmd_make_case", goalId, quoted(variable))),
  );
  throwOnFatalProtocolStderr(responses);
  return { clauses: decodeCaseSplitResponses(responses) };
}
```
`decodeCaseSplitResponses` (`src/protocol/responses/proof-actions.ts:167-186`)
falls back to `decodeDisplayInfoEvents(responses).map(...).filter(Boolean)`
whenever no `MakeCase` response is present — i.e., exactly the shape a
rejected `Cmd_make_case` (an invalid/non-splittable variable name) takes per
the protocol convention this same phase independently verified for four
other commands. That fallback text lands directly in `result.clauses`, and
the calling tool gates its *file write* purely on `result.clauses.length >
0`, not on any rejection signal:
```ts
// src/tools/goal-tools.ts:122-129
if (result.clauses.length > 0) {
  output += `### New clauses\n...`;
  if (shouldWrite && session.currentFile) {
    output += await applyEditAndReload(session, goalIdsBefore, {
      kind: "replace-line", goalId, clauses: result.clauses,
    });
    written = true;
  }
```
`applyProofEdit`'s `"replace-line"` branch (`src/session/apply-goal-edit.ts:101-133`)
performs no validation on `clauses` content — it splices whatever strings it
is given, indented, directly into the source file, replacing the goal's
original clause line. Since `writeToFile` defaults to `true`
(`shouldWrite = writeToFile !== false`), a rejected case-split silently
**overwrites a real function clause with Agda's own error message text**,
while the tool still reports `ok:true`. This is strictly more severe than
CR-01/CR-03 because it is a data-loss/corruption path, not just a
misleading response.

**Fix:**
```ts
export async function caseSplit(
  ctx: AgdaCommandContext,
  goalId: number,
  variable: string,
): Promise<CaseSplitResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(goalCommand("Cmd_make_case", goalId, quoted(variable))),
  );
  throwOnFatalProtocolStderr(responses);
  const errorText = detectResponseError(responses);
  if (errorText !== null) {
    throw new Error(errorText);
  }
  return { clauses: decodeCaseSplitResponses(responses) };
}
```
(Same same-file `detectResponseError` reuse as CR-01/CR-03 — no new import
needed.)

---

### CR-03: `autoOne()` can write Agda's own error/rejection text into a goal's hole as a fabricated "solution"

**File:** `src/agda/goal-operations.ts:239-251` (decode), `src/tools/goal-tools.ts:390-407` (write gate)
**Issue:**
`autoOne()` has the identical gap as CR-02, but for `Cmd_autoOne`:
```ts
export async function autoOne(
  ctx: AgdaCommandContext,
  goalId: number,
  payload = "",
): Promise<AutoResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(rewriteGoalCommand("Cmd_autoOne", "Normalised", goalId, quoted(payload))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  return { solution: decodeGiveLikeResponse(responses) };
}
```
`decodeGiveLikeResponse` falls back to the last `DisplayInfo` event's
decoded text whenever no `GiveAction` response is present
(`src/protocol/responses/proof-actions.ts:97-117`) — and, per
`src/protocol/response-schemas.ts:236-257` /
`src/protocol/responses/display-info.ts:77-80`, both `Error`-kind *and*
`Auto`-kind `DisplayInfo` responses decode to non-empty text through this
same path. `goal-tools.ts`'s `agda_auto` callback treats any non-empty
`result.solution` as `hasSolution: true` and, when `writeToFile` is left at
its default (`true`), writes it straight into the goal's hole via
`applyEditAndReload({ kind: "replace-hole", expr: result.solution })`
(`src/tools/goal-tools.ts:399-403`) — no rejection check gates this path
either.

This is not hypothetical: `test/fixtures/fix-queue.json`'s own entries for
`5abecc959e43fef3` and `004d161b839ce725` record an **empirically measured**
instance of exactly this shape — "`data.searchPayload` came back as
`'-d 5 --list-candidates -h -t 999999 -x --unsafe'` ... and `hasSolution:true`
while `data.solution` is actually Agda's own `NotInScope` rejection text."
This phase's fix (`assertValidAutoHint` in `src/agda/refactor-helpers.ts`)
closes the one *entry point* those two fingerprints used (a flag-shaped
hint token), but does nothing to `decodeGiveLikeResponse`/`autoOne()`
themselves — any other way `Cmd_autoOne` surfaces a rejection or internal
failure via `DisplayInfo` (e.g. a syntactically valid but semantically
nonexistent hint/module name, which `assertValidAutoHint`'s shape check
happily allows through) reproduces the identical false-green-plus-write
pattern.

**Fix:**
```ts
export async function autoOne(
  ctx: AgdaCommandContext,
  goalId: number,
  payload = "",
): Promise<AutoResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(rewriteGoalCommand("Cmd_autoOne", "Normalised", goalId, quoted(payload))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const errorText = detectResponseError(responses);
  if (errorText !== null) {
    throw new Error(errorText);
  }
  return { solution: decodeGiveLikeResponse(responses) };
}
```
Note this specific fix only closes the `Error`-kind half of the gap; an
`Auto`-kind "no solution found" message would still flow through
`decodeGiveLikeResponse`'s fallback as a truthy `result.solution`. Whether
that specific sub-case is also exploitable depends on what real Agda
sends for a *legitimate* "no solution" outcome versus a genuine internal
failure — recommend a live-Agda probe (this phase's own established
verification method for CR-01/CR-02) before considering `agda_auto`'s write
path fully closed.

## Warnings

### WR-01: `agda_proof_status`'s "All goals solved" branch and `data.hasConstraints` use two different emptiness checks on the same value

**File:** `src/tools/analysis-tools.ts:80-91`
**Issue:**
This exact function was patched by this phase (commit `6caa279`,
fingerprint `fdc90bfde12fb938`) specifically to stop `data.text` from
contradicting the tool's own structured fields. The new branch, however,
tests raw truthiness of `constraints.text`:
```ts
if (metas.goals.length === 0 && !constraints.text) {
  output += "All goals solved.\n";
} else if (metas.goals.length === 0 && constraints.text) {
  output += "No visible goals, but constraints remain — the file is NOT confirmed complete. See the Constraints section above.\n";
}
```
while the structured field computed a few lines below uses a trimmed check:
```ts
data: {
  ...
  hasConstraints: constraints.text.trim().length > 0,
```
If `session.query.constraints()` ever returns a whitespace-only string
(plausible for a `Cmd_constraints` response whose decoded body is just a
trailing newline/blank line — not verified live, but not ruled out by
`src/agda/advanced-queries.ts:57-66`'s implementation either), `data.text`
would print "constraints remain — the file is NOT confirmed complete" while
`data.hasConstraints` reports `false` — reproducing, via a second code
path in the very function that was just fixed, the same class of
`text`/`data` self-contradiction fingerprint `fdc90bfde12fb938` targeted.
**Fix:**
```ts
const hasConstraints = constraints.text.trim().length > 0;
...
if (metas.goals.length === 0 && !hasConstraints) {
  output += "All goals solved.\n";
} else if (metas.goals.length === 0 && hasConstraints) {
  output += "No visible goals, but constraints remain — the file is NOT confirmed complete. See the Constraints section above.\n";
}
...
data: {
  ...
  hasConstraints,
  ...
}
```

### WR-02: `matchesTypePattern()` lets literal (non-`_`) tokens match arbitrarily far ahead, producing false-positive type-shape matches

**File:** `src/agda/refactor-helpers.ts:42-65`
**Issue:**
```ts
while (p < patternTokens.length && a < actualTokens.length) {
  const want = patternTokens[p];
  if (want === "_") {
    p += 1;
    a += 1;
    continue;
  }
  if (tokenMatches(want, actualTokens[a])) {
    p += 1;
    a += 1;
    continue;
  }
  a += 1;
}
return p === patternTokens.length;
```
When a literal pattern token doesn't match the current actual token, the
loop advances `a` alone and retries the *same* pattern token later — an
unbounded skip-ahead search. Combined with the early-return-once-pattern-
exhausted semantics, this lets two unrelated literal tokens in the pattern
bind to non-adjacent, unrelated fragments of the actual type, stitching a
false match. Verified directly:
```js
matchesTypePattern("Nat -> Bool + Bool -> Nat", "Nat + Nat") // => true
```
even though the text contains no `Nat + Nat` — it spuriously matches the
leading `Nat`, skips over `-> Bool +`, and lands on the unrelated trailing
`Nat`, treating the middle `Bool + Bool` as if it weren't there. This
degrades `agda_search_definitions --typePattern` and `agda_term_search`
result quality with misleading candidate matches (the actual matched line
is still shown in the tool's output, so this isn't a silent
false-green — but it is a real correctness bug in a tool literally
designed to help an agent find valid candidate terms).
**Fix:** require literal tokens to match at the *current* aligned
position only (no skip-ahead); only `_` should ever "consume and move on":
```ts
export function matchesTypePattern(typeText: string, pattern: string): boolean {
  const actualTokens = splitWords(typeText);
  const patternTokens = splitWords(pattern);
  if (patternTokens.length === 0 || actualTokens.length === 0) return false;
  if (patternTokens.length > actualTokens.length) return false;

  for (let i = 0; i < patternTokens.length; i++) {
    if (!tokenMatches(patternTokens[i], actualTokens[i])) return false;
  }
  return true;
}
```
This preserves both existing unit tests (`m ≤ m + n` / `_ ≤ _ + _` and
`A -> B -> C` / `_ -> _`, both of which already align from position 0) —
run the full `test/unit` + `test/property` tiers after applying, since this
is a behavior change to a shared helper.

### WR-03: `buildQueueEntryFromVerdict()`'s `affectedTool` fallback is unguarded against a non-array `recordedActions`

**File:** `scripts/dogfood/dogfood-wrapup.mjs:139-142`
**Issue:**
```js
affectedTool:
  lastLoadFamilyToolName(artifact.recordedActions)
  ?? artifact.recordedActions.at(-1)?.tool
  ?? "unknown",
```
`lastLoadFamilyToolName()` defensively coerces its input
(`Array.isArray(recordedActions) ? recordedActions : []`), but the fallback
expression on the next line calls `.at(-1)` directly on
`artifact.recordedActions` with no such guard. A malformed/adversarial
staged capture (missing or non-array `recordedActions`) throws an uncaught
`TypeError` from this line instead of degrading to `"unknown"` the way the
rest of this pure helper is designed to. In practice this is caught by
`scriptMain`'s per-capture `try`/`catch` (`dogfood-wrapup.mjs:409-437`), so
it degrades to a generic `"error"` result rather than crashing the whole
run — but the inconsistency between the two null-safety strategies in the
same three-line expression is a real robustness gap in code whose entire
purpose is per-capture error isolation.
**Fix:**
```js
affectedTool:
  lastLoadFamilyToolName(artifact.recordedActions)
  ?? (Array.isArray(artifact.recordedActions) ? artifact.recordedActions.at(-1)?.tool : undefined)
  ?? "unknown",
```

## Info

### IN-01: `giveRejectedError()`'s generic message overclaims the rejection reason

**File:** `src/tools/tool-errors.ts:85`
**Issue:**
```ts
const message = `Agda rejected \`${expr}\` for goal ?${goalId} — the expression does not satisfy the goal type.`;
```
This fallback message (used whenever `rejectionText` is `null`) is worded
as if every rejection is a type mismatch, but the same code path also
fires for `NotInScope` (an unknown identifier) and parse errors, neither of
which is "the expression does not satisfy the goal type." The real
diagnostic text (`rejectionText`) is shown separately when available, so
this only affects the rarer null-rejectionText fallback, but the wording
is still misleading to whichever agent/human reads it.
**Fix:** Use reason-neutral wording, e.g. `` `Agda declined to accept
\`${expr}\` for goal ?${goalId}.` ``.

### IN-02: Magic number `50` duplicated in `agda_search_definitions`'s visible-match cap

**File:** `src/tools/file/search-definitions.ts:185,192`
**Issue:** The visible-results cap is hardcoded twice (`matches.slice(0,
50)` and `matches.length > 50`), unlike the memory-safety cap
`MAX_RAW_MATCHES` a few lines above, which is a named constant with an
explanatory comment. Two literals for one concept risk drifting out of
sync if either is edited in isolation.
**Fix:**
```ts
const MAX_VISIBLE_MATCHES = 50;
...
const capped = matches.slice(0, MAX_VISIBLE_MATCHES);
...
output = `## Search (${mode}): "${actualQuery}" (${matches.length} matches${matches.length > MAX_VISIBLE_MATCHES ? `, showing first ${MAX_VISIBLE_MATCHES}` : ""})\n\n`;
```

---

_Reviewed: 2026-07-04T02:55:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
