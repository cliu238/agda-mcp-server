---
phase: 09-residual-v1-0-debt-sweep
reviewed: 2026-07-04T20:59:47Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - scripts/dogfood/dogfood-run.mjs
  - scripts/dogfood/dogfood-wrapup.mjs
  - scripts/dogfood/install-dogfood-skill.mjs
  - src/tools/register-capture-session.ts
  - test/unit/tools/register-capture-session.test.ts
  - test/unit/session/agda-transport.test.ts
  - test/helpers/capture-regression-runner.ts
  - .github/workflows/ci.yml
  - package.json
  - .planning/phases/09-residual-v1-0-debt-sweep/09-SECURITY.md
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 09: Code Review Report

**Reviewed:** 2026-07-04T20:59:47Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This is a debt-sweep phase (DEBT-01/02 dead-script deletion, WR-01 durability
reorder, IN-01/02/04/05 argv+skill-installer hardening, a new
`typecheck:test` CI gate, and a type-only `agda-transport.test.ts` diff). I
traced each named fix against its own claim rather than trusting the commit
messages:

- **DEBT-01/DEBT-02** (`verify-cold-replay.mjs` / `promote-capture.mjs`
  deletion): confirmed clean at the *code* level — no remaining import or
  call site anywhere in `src/`, `scripts/`, or `test/`. Two **stale
  comment** references survive (Warning 2 below) — not a functional
  regression, but a direct miss against this same commit's own stated goal.
- **WR-01** (defer `resetRecordedActions()` until after a durable write):
  the no-reset-on-error half is correctly implemented and covered by tests.
  The reorder also widens a pre-existing near-zero race window into a real
  one under concurrent tool calls (Warning 1 below) — a genuine new edge
  the fix's own "no double-drain" framing didn't consider.
- **IN-01** (`assertSafeRunId` in both CLIs): verified the real default
  run-id shape (`2026-07-04T14-47-00-924Z-442e77f2`) passes validation in
  both `dogfood-run.mjs` and `dogfood-wrapup.mjs`; all 6 new regression
  tests match the implementation exactly. Code is duplicated verbatim
  across the two files (Info 1).
- **IN-02** (`install-dogfood-skill.mjs` canonical-existence checks): both
  the "created" and "relinked" branches correctly check-before-mutate;
  verified against all 5 tests including the two new dangling-symlink
  regressions. No issues found.
- **IN-04** (precise `git check-ignore` exit-status assertion): correctly
  narrowed from a bare `.toThrow()` to `status === 1`.
- **IN-05** (hoisted `stagedPath` in `dogfood-wrapup.mjs`'s catch handler):
  verified the hoist genuinely prevents the second-throw-in-catch bug via
  the new corrupt-entry regression test, and confirmed by re-reading the
  loop that no other reference to `staged.stagedPath` (which would
  reintroduce the crash) remains.
- **New `typecheck:test` CI gate**: confirmed wired into the `verify` job
  (positioned before the slower audit/build/pack steps, as claimed) and
  ran it locally (`npm run typecheck:test`) — exits 0, so the gate is
  currently green and would fail the job on a real type error.
- **`agda-transport.test.ts` diff**: confirmed genuinely type-only against
  `git show` (only type annotations and one late cast changed; zero
  string/body-statement diffs) — but the fix satisfies the new gate by
  widening 6 mock signatures to `any` (Info 2).
- **`09-SECURITY.md` register**: 40 rows, zero duplicate IDs, Category/
  Status columns internally coherent. One Disposition-column value breaks
  the register's own declared vocabulary (Warning 3).

No critical/blocking defects found. Three warnings and three info-level
items below.

## Warnings

### WR-01: WR-01 [RESOLVED — commit 0d66569]'s durability reorder widens the drain-to-reset window into a real concurrent-drop race

**File:** `src/tools/register-capture-session.ts:121` and `:205` (root cause: `src/agda/session-capture/recorded-transport.ts:74-95`)
**Issue:**

Before this phase's WR-01 fix, `resetRecordedActions()` ran immediately
after `drainRecordedActions()` — two adjacent, synchronous statements with
no `await` between them, so the window in which another action could land
in the buffer before the reset was effectively zero. The fix (commit
`3ad99e6`) deliberately moves the reset to *after* `writeFileAtomic`
resolves, so the window now spans the entire async capture pipeline
(`buildOracleSubstrate`, `mkdirSync`, `writeFileAtomic` — multiple `await`
points, easily tens of milliseconds):

```js
const { actions, truncated, droppedCount } = drainRecordedActions(); // line 121: non-destructive snapshot
...
await writeFileAtomic(stagedPath, JSON.stringify(artifact, null, 2));
resetRecordedActions();                                              // line 205: unconditional buffer = []
```

`resetRecordedActions()` (`recorded-transport.ts:91-95`) is a **blanket**
clear (`buffer = []`), not "remove exactly what was drained." The MCP SDK
this server uses does not serialize tool-call dispatch across different
tool names: `StdioServerTransport.processReadBuffer()`
(`node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js`) calls
`onmessage` synchronously in a loop for every buffered request without
awaiting the handler, and `Protocol._onrequest`
(`shared/protocol.js:280`) dispatches to the tool handler without blocking
the next incoming message. Two tool calls can therefore be genuinely
in-flight at once (e.g. an agent batching `agda_capture_session` alongside
another tool call in the same turn, or two pipelined requests).

Concrete sequence that loses data:
1. `agda_capture_session` call C1 starts, drains `[A1]` (buffer still
   contains `[A1]` — drain is non-destructive), then begins its `await`
   chain (oracle substrate build + atomic write).
2. Before C1 reaches its `resetRecordedActions()` call, a concurrently
   dispatched tool call resolves and `registerStructuredTool`'s wrapper
   (`src/tools/tool-registration.ts:204-212`) calls `recordAction(A2)`.
   Buffer is now `[A1, A2]`.
3. C1's write succeeds and calls `resetRecordedActions()` — buffer becomes
   `[]` unconditionally. `A2` was never drained by C1 and is now
   permanently gone from every future capture, with no diagnostic or log
   line indicating anything was lost.

This is exactly the "no double-drain" contract the WR-01 fix's own
commentary discusses, but from the opposite direction: instead of
double-reporting, a concurrently-recorded action can be silently
under-reported. For a project whose stated core value is "every real proof
session reliably converts into a stronger server," a capture artifact
silently missing the one action that triggered the bug undermines the
exact reproduction guarantee `agda_capture_session` exists to provide.

**Fix:** Make the reset commit exactly what was drained instead of
blanket-clearing the live buffer, e.g.:

```ts
// recorded-transport.ts
export function commitDrainedActions(drainedCount: number): void {
  buffer = buffer.slice(drainedCount);
  // truncated/droppedCount describe the whole session; only reset them
  // once the buffer is genuinely back to empty, or track per-generation
  // if that distinction later matters.
}
```

```ts
// register-capture-session.ts
const { actions, truncated, droppedCount } = drainRecordedActions();
...
await writeFileAtomic(stagedPath, JSON.stringify(artifact, null, 2));
commitDrainedActions(actions.length); // never touches actions recorded after the drain
```

Add a regression test that injects a `recordAction()` call between the
drain and the write (e.g. via a fake slow `writeFileAtomic`) and asserts
the concurrently-recorded action survives into a subsequent capture.

### WR-02 [RESOLVED — commit 5879fa0]: Stale `promoteCapture`-in-`dogfood-run.mjs` comment references survive the DEBT-02 deletion

**File:** `scripts/dogfood/dogfood-wrapup.mjs:614` (same defect class, out-of-scope file: `scripts/dogfood/upload-run.mjs:548`)
**Issue:**

Commit `a88e369` (DEBT-02, this same phase) deleted
`scripts/promote-capture.mjs` and its one call site in
`dogfood-run.mjs`. Two comments elsewhere still describe that removed
call site as if it still exists, unreconciled by the cleanup:

```js
// dogfood-wrapup.mjs:608-615
// D-12: the upload chain runs UNCONDITIONALLY, ...
// ... this call site does not trust that alone
// (belt-and-suspenders — mirrors promoteCapture's best-effort,
// log-and-continue shape in scripts/dogfood/dogfood-run.mjs).
try {
  await chainUploadRun(runId);
```

```js
// upload-run.mjs:547-549 (predates this phase, not in the reviewed file
// list, but the identical stale-reference defect)
 * (mirrors `scripts/dogfood/dogfood-run.mjs`'s
 * `promoteCapture` fail-open shape exactly): a failed upload is queued
```

`dogfood-run.mjs` no longer contains any `promoteCapture`-shaped
try/catch — this is exactly the "check nothing else still references the
removed promoteCapture import/behavior" verification this phase's own
scope calls for, and it was missed for these two comments (they predate
this phase but were not swept). This is comment-only (zero runtime
impact) but will actively mislead the next person who goes looking for
the referenced pattern in `dogfood-run.mjs` and finds nothing there.

**Fix:** Rephrase both comments to describe the fail-open shape inline
(the same treatment `install-dogfood-skill.mjs`'s two former
`promote-capture.mjs` references already got in this same phase, per
commit `359069d`), e.g.:

```js
// (belt-and-suspenders — the same "never let a best-effort side
// operation block or fail the caller" fail-open shape used throughout
// this codebase's best-effort operations).
```

### WR-03 [RESOLVED — commit 1a06911]: `09-SECURITY.md` row T-05-02-05's Disposition value breaks the register's own declared vocabulary

**File:** `.planning/phases/09-residual-v1-0-debt-sweep/09-SECURITY.md:45`
**Issue:**

The document's own legend states: *"Disposition: mitigate (implementation
required) · accept (documented risk) · transfer (third-party)"*, and the
Sign-Off section explicitly checks off *"[x] All threats have a
disposition (mitigate / accept / transfer)."* Row T-05-02-05 violates
this:

```
| T-05-02-05 | Tampering | `promoteCapture`'s dedup-index write, triggered per detected capture | closed (component removed 2026-07, DEBT-02) | Originally `accept` — reused the existing, already-reviewed `scripts/promote-capture.mjs` unchanged ... | closed |
```

The **Disposition** column (4th) holds `closed (component removed
2026-07, DEBT-02)` — a Status-shaped value, not one of the three declared
dispositions — while the row's actual former disposition (`accept`) is
buried inside the free-text Mitigation column instead. This is the only
row (of 40) where this happens; every other row's Disposition column
holds `mitigate`, `accept`, `accept (...)`, or the explicitly-justified
`n/a` (T-07-SC). A mechanical audit or future consolidation pass that
scans the Disposition column for exactly `{mitigate, accept, transfer}`
would misread this row, and the Sign-Off checkbox's claim is not
literally true for this one row.

**Fix:** Move the retirement note out of the Disposition column into the
Status column (which already independently says `closed` at the end of
the row) and restore `accept` (its pre-consolidation value, per the
Mitigation text) as the Disposition:

```
| T-05-02-05 | Tampering | ... | accept | Originally `accept` ... superseded by this consolidation: ... the component this threat concerned no longer exists in the codebase. | closed (component removed 2026-07, DEBT-02) |
```

## Info

### IN-01: `assertSafeRunId` is duplicated verbatim across both dogfood CLIs

**File:** `scripts/dogfood/dogfood-run.mjs:110-116`, `scripts/dogfood/dogfood-wrapup.mjs:434-440`
**Issue:** The IN-01 fix (commit `cd4a4a2`) adds the identical
`assertSafeRunId` function body (same condition, same character-class
checks) independently to both files rather than extracting it to a shared
module. Both copies happen to be correct today, but a future edit to the
validation rule (e.g. adding a length cap, or rejecting NUL bytes) applied
to only one copy would silently leave the other CLI under-validated.
**Fix:** Extract to a small shared helper, e.g.
`scripts/dogfood/run-id.mjs` exporting `assertSafeRunId`, imported by both
`dogfood-run.mjs` and `dogfood-wrapup.mjs`.

### IN-02: The type-only `agda-transport.test.ts` fix satisfies the new typecheck gate by widening mocks to `any`

**File:** `test/unit/session/agda-transport.test.ts:351,415,459,517,571,679`
**Issue:** Commit `00a052c` closes the remaining `tsc -p
tsconfig.test.json` errors by changing each fake `ChildProcess`'s
`stdin.write`/`once`/`on` signatures to `(...args: any[]): any`. This is
confirmed genuinely behavior-preserving (verified via `git show`: only
type annotations changed), but it satisfies this same phase's new
`typecheck:test` CI gate by opting these 6 call sites out of the argument-
shape checking that gate is meant to provide — a future change to
`AgdaTransport`'s callback signatures could silently stop matching these
mocks without `tsc` ever flagging it here.
**Fix:** Not urgent, but consider replacing `any` with a precisely-typed
alias (e.g. `type FakeChildProcess = Omit<Partial<ChildProcess>, "stdin" |
"once"> & { stdin: { write: (...args: Parameters<Writable["write"]>) =>
ReturnType<Writable["write"]> }; once: ... }`) shared across the 6 sites,
so the new gate keeps real signal for this file.

### IN-03: `verify` job in `ci.yml` has no explicit `permissions` block

**File:** `.github/workflows/ci.yml:9-32` (compare `:34-38`)
**Issue:** The `integration` job explicitly scopes its `GITHUB_TOKEN` to
`permissions: contents: read`, but the `verify` job — which just gained a
new step in this phase (`Typecheck tests`) and only ever needs to check
out, install, typecheck, audit, and pack — has no `permissions:` key at
all, so it inherits the repository/org default token scope (which can be
broader than `contents: read`).
**Fix:** Add the same explicit least-privilege block to the `verify` job:

```yaml
verify:
  runs-on: ubuntu-latest
  permissions:
    contents: read
```

---

_Reviewed: 2026-07-04T20:59:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
