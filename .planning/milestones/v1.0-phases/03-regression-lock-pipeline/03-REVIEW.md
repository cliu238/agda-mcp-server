---
phase: 03-regression-lock-pipeline
reviewed: 2026-07-02T17:30:12Z
depth: standard
iteration: 2
files_reviewed: 9
files_reviewed_list:
  - scripts/emit-regression.mjs
  - src/tools/register-capture-session.ts
  - test/integration/mcp/capture-regression.test.ts
  - test/unit/tools/emit-regression.test.ts
  - test/unit/tools/register-capture-session.test.ts
  - test/helpers/capture-regression-runner.ts
  - test/fixtures/capture-regression-matrix.json
  - test/fixtures/capture-regression-matrix.ts
  - vitest.config.ts
findings:
  critical: 0
  warning: 0
  info: 5
  total: 5
status: clean
---

# Phase 3: Code Review Report (Iteration 2 — fix verification)

**Reviewed:** 2026-07-02T17:30:12Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** clean

## Summary

Re-review of the Phase 3 regression-lock pipeline after fixes for the 2 BLOCKER +
3 WARNING findings from iteration 1. Every fix was verified with executable probes
(via `tsx` importing the real `scripts/emit-regression.mjs` exports and the real
`src/repo-root.ts` sandbox), the committed unit suites, and line-by-line diff
inspection — not by reading alone.

**All 5 prior findings are genuinely resolved.** The two BLOCKERs (CR-01 path
traversal, CR-02 `--force` trap) were reproduced against the *fixed* code and no
longer trigger: an in-repo-but-outside-`test/fixtures/agda/` escape is now skipped
with the tracked target untouched, and `--force` on a `pass`/`skip` verdict now
fails closed with a legible reason before any write. The three WARNINGs (WR-01
rollback, WR-02 `test.fails` masking, WR-03 cross-process filename collision) are
each fixed as claimed and carry new regression coverage (Tests F2, D2, and the
UUID assertion respectively).

No new Critical or Warning defects were introduced by the fixes. One low-severity
INFO (IN-05) notes a narrow new interaction from the WR-01 fix broadening the
`catch` scope past the matrix-commit point. The four INFO items from iteration 1
(IN-01..IN-04) were intentionally left unfixed (`--all` not passed) and are carried
forward here unchanged so this artifact stays the complete record.

Because 0 Critical and 0 Warning findings remain, `status: clean` (Info-only is
clean for gating).

## Verification of Prior Findings

| ID | Prior severity | Verdict | How verified |
|----|----------------|---------|--------------|
| CR-01 | Critical | **Resolved** | Probe + Test F2 + inspection |
| CR-02 | Critical | **Resolved** | Probe + Tests D/D2 + inspection |
| WR-01 | Warning | **Resolved** | Diff inspection (probe blocked by Agda-gated `runOracle`) |
| WR-02 | Warning | **Resolved** | Grep (no `.fails`) + collection run + inspection |
| WR-03 | Warning | **Resolved** | Unit test (UUID regex) + inspection |

### CR-01 — path containment scoped to `test/fixtures/agda/` (RESOLVED)

`scripts/emit-regression.mjs:128-151` `writeFixtureFile` now contains against the
write base: `const fixturesRoot = join(repoRoot, "test/fixtures/agda")`, then
`resolveFileWithinRoot(fixturesRoot, fixtureDir)`, then
`resolveFileWithinRoot(fixtureBase, barePath)`. Sandbox root == write base, mirroring
`orcl-01-differential.mjs`.

Independent probe (throwaway repo root with a sentinel `src/index.ts`,
`fixtureDir:"FixtureDeps/TransitiveStaleness"`, escaping
`path:"../../../../../src/index.ts"`):
- `src/index.ts` sentinel **unchanged** after materialization.
- `writtenFiles` = `[<root>/test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda]` only.
- Also verified skipped: an **absolute** artifact path, and an escape via a
  **malicious `fixtureDir`** (`"../../src"`) — both leave the sentinel intact and
  write nothing. These extra vectors (not in Test F2) confirm the containment is
  general, not tailored to one shape.

The reachable in-repo overwrite from iteration 1 is closed. Test F2
(`test/unit/tools/emit-regression.test.ts:185-216`) encodes the exact regression.

### CR-02 — `--force` fails closed; `composeEntry` guards `coldTuple` (RESOLVED)

`judgeRefusal` (`scripts/emit-regression.mjs:62-75`) now nests the `--force` branch:
a non-`server-false-green-candidate` outcome with `coldTuple === undefined` returns
a refusal even under `--force`. `composeEntry` (`:256-261`) throws a legible `Error`
(not a `TypeError`) and reads through a local `cold` const.

Independent probe:
- `judgeRefusal({orcl01:{kind:"pass"}}, {force:true})` → non-null, message contains
  `coldTuple`. Same for `{kind:"skip"}`.
- `composeEntry(... verdict:{orcl01:{kind:"pass"}} ...)` → throws `Error` (verified
  `!(e instanceof TypeError)`) matching `/no coldTuple to lock/`.
- Sanity: a real `server-false-green-candidate` still returns `null` (lockable) and
  `composeEntry` still builds the entry — the fix did not over-restrict the happy path.

Note (not a defect): because only `server-false-green-candidate` ever carries a
`coldTuple`, and that outcome never needed `--force`, `--force` is now effectively
inert — it can only ever fail closed. This is the reviewer-recommended fail-closed
behavior and the refusal message is self-explanatory, so it is acceptable; a future
cleanup could drop the now-unreachable flag from CLI help.

### WR-01 — rollback on any post-materialization throw (RESOLVED)

`scriptMain` hoists `let writtenFiles = []` to `:399` (catch scope), assigns it from
`materialized.writtenFiles` at `:438`, and the outer `catch` at `:480` calls
`rollbackWrittenFiles(writtenFiles)`. Diff `b2f79ce` is surgical and matches the
iteration-1 recommendation exactly.

Executable reproduction was not practical here: the only path that materializes
files first runs `runOracle` (`scripts/oracle/run-oracle.mjs`), which spawns a cold
Agda process; without Agda the run refuses at `judgeRefusal` *before* materialization
(so `writtenFiles` stays `[]`). Verified instead by inspection — the three documented
reachable throw sites (`composeEntry` zod/coldTuple failure, `replayCaptureRegressionEntry`
failure, `writeMatrixEntry` duplicate-id) all now route through the rollback. See
IN-05 for the one new edge this broadened `catch` introduces.

### WR-02 — plain `test`, no `test.fails` masking (RESOLVED)

`test/integration/mcp/capture-regression.test.ts:45-55` now uses a single plain `it`
with `const expectMatch = entry.status !== "red"` and asserts
`matchesExpected(observed, entry.expected)).toBe(expectMatch)`. A repo-wide grep for
`it.fails`/`test.fails` finds only the explanatory comment at line 14 — no live
`.fails` remains. A harness throw inside the body now propagates as a real failure
(never absorbed as an "expected failure"), and a genuine fix flips the `red`
assertion to force promotion. Collection verified: with Agda unavailable the file
registers a `test.skip` task (not zero tasks), so the suite collects cleanly.

### WR-03 — cross-process-unique staged filename (RESOLVED)

`src/tools/register-capture-session.ts:179-182` appends `-${randomUUID()}` after the
retained `${stagedFileSequence++}` counter. The counter still provides intra-process
ordering; the UUID removes the cross-restart clobber. The unit test
(`register-capture-session.test.ts:242-244`) asserts both staged paths match a
canonical UUID regex, are distinct, and that both artifacts survive on disk with
divergent `capturedAt`. Suite passes (18/18 across the two touched unit files).

## Regression / Non-Breakage Checks

All four explicitly-requested non-breakage checks pass:

- **fixtureDir double-prepend NOT reintroduced.** Test G2 passes (asserts the
  double-prepended `.../FixtureDeps/TransitiveStaleness/FixtureDeps/TransitiveStaleness/Main.agda`
  does **not** exist; the single correct path does). Independent probe wrote the
  single-level path only.
- **D-05 self-check intact.** `scriptMain` step (d) (`:444-455`) still replays via
  `replayCaptureRegressionEntry` + the shared `matchesExpected`, and rolls back +
  refuses when the entry would already be GREEN. Unchanged by the fixes.
- **Normalized-envelope assertion semantics unchanged.** WR-03 touched only the
  staged filename; `register-capture-session.test.ts` envelope assertions (`ok`,
  data-key set, `sessionClassification`, diagnostics) still pass.
- **500-line `src/` ceiling not violated.** `register-capture-session.ts` is 221
  lines. The only `src/` file over 500 is the pre-existing, CLAUDE.md-documented
  outlier `src/session/agda-transport.ts` (535), which these fixes do not touch.

## Info

### IN-05 (new): WR-01 `catch` now spans the matrix commit — a post-commit throw would roll back live fixtures

**File:** `scripts/emit-regression.mjs:470-483`

**Issue:** The WR-01 fix broadened the outer `catch` to `rollbackWrittenFiles`, but
`writeMatrixEntry` (step f, `:472`) and the trailing success
`process.stdout.write("Locked …")` (`:473`) are both still inside the `try`. If that
final `stdout.write` throws synchronously (e.g. `ENOSPC`/`EPIPE` on a synchronous
stdout sink) *after* the matrix entry has been atomically persisted, the `catch`
deletes the freshly-written fixture files — leaving the committed matrix entry
pointing at now-missing fixtures. The window is narrow (stdout errors are usually
delivered asynchronously and would not be caught here), so this is low-severity, but
it is a genuine new interaction the broadened `catch` created.

**Fix:** Gate rollback on a not-yet-committed flag, or move the commit out of the
rollback-guarded region:
```js
    await writeMatrixEntry(entry, matrixJsonPath);
    committed = true;               // declared with writtenFiles
    process.stdout.write(`Locked ${entry.id} into ${matrixJsonPath}\n`);
  } catch (err) {
    if (!committed) rollbackWrittenFiles(writtenFiles);
    ...
  }
```

### IN-01 (carried over, intentionally deferred): global `passWithNoTests: true` can mask a mis-globbed run

**File:** `vitest.config.ts:26`

**Issue:** Still suite-global. Justified for the legitimately-empty matrix, but a
future all-gated file or a mis-typed CI filter would pass silently. Unchanged this
iteration. **Fix:** scope the zero-test tolerance to the data-driven runner (register
one sentinel task asserting the matrix parsed) and drop the global flag.

### IN-02 (carried over, intentionally deferred): emitter CLI does not validate required flags up front

**File:** `scripts/emit-regression.mjs:400-415`

**Issue:** `--id`/`--fixture-dir`/`--tool` are still read via `flagValue` (undefined
when absent) and flow unchecked into materialization/compose. A missing `--fixture-dir`
still throws a raw `resolve(...undefined)` `TypeError` from inside
`materializeFixtureFiles`; a missing `--id`/derived `entryFile` throws a raw zod error
from `composeEntry`. (Now at least rolled back by the WR-01 fix, but still an obscure
message.) **Fix:** validate presence immediately after parsing and emit the friendly
usage string.

### IN-03 (carried over, intentionally deferred): match logic duplicated across the ORCL-01 boundary

**File:** `scripts/emit-regression.mjs:321-329` vs `scripts/oracle/orcl-01-differential.mjs:505-508`

**Issue:** `matchesExpected` is still a hand-copy of `runColdLoadAndDiff`'s
`tupleMatches`/`categoriesMatch` logic; `orcl-01-differential.mjs` exports no shared
field-list/comparator, so the "mirrors exactly" docstring is convention, not
structure. **Fix:** export the field list + a small comparator from
`orcl-01-differential.mjs` and have `matchesExpected` reuse it.

### IN-04 (carried over, intentionally deferred): G2/G3 assert filenames but not baseline-vs-primary content routing

**File:** `test/unit/tools/emit-regression.test.ts` (G2 `:246-307`, G3 `:310-358`)

**Issue:** G2/G3 read back `Main.agda`'s content and the `mutation` filenames, but
never assert that `Dep.agda` holds the **baseline** ("before") content and
`Dep.broken.agda` holds the **primary** ("after") payload. A future swap of the two
`writeFixtureFile` calls (`:215` vs `:219`) would invert the fixture semantics while
leaving both tests green. **Fix:** add
`readFileSync(.../Dep.agda) === "original-broken"` and
`readFileSync(.../Dep.broken.agda) === "healthy"` assertions to lock the routing.

## Structural Findings (fallow)

No structural pre-pass was provided for this review.

---

_Reviewed: 2026-07-02T17:30:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard (iteration 2)_
