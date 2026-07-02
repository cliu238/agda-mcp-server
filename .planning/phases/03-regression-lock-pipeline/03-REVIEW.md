---
phase: 03-regression-lock-pipeline
reviewed: 2026-07-02T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - scripts/emit-regression.mjs
  - src/tools/register-capture-session.ts
  - test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.agda
  - test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.broken.agda
  - test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda
  - test/fixtures/capture-regression-matrix.json
  - test/fixtures/capture-regression-matrix.ts
  - test/helpers/capture-regression-runner.ts
  - test/integration/mcp/capture-regression.test.ts
  - test/unit/fixtures/capture-regression-matrix.test.ts
  - test/unit/tools/capture-regression-runner.test.ts
  - test/unit/tools/emit-regression.test.ts
  - test/unit/tools/register-capture-session.test.ts
  - vitest.config.ts
findings:
  critical: 2
  warning: 3
  info: 4
  total: 9
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the Phase 3 regression-lock pipeline: the capture-staging filename fix
(`register-capture-session.ts`), the zod-validated matrix contract, the shared
MCP-boundary replay helper, the regression emitter (`emit-regression.mjs`), the
generic `test.fails` replay runner, and the flagship #64/#61 fixture trio + first
matrix entry.

Two BLOCKERs were found and **empirically confirmed by running the code**, both in
`scripts/emit-regression.mjs`:

1. **Path-containment is scoped to the wrong root.** `materializeFixtureFiles`
   sandboxes artifact-derived write paths against the whole `repoRoot`, not
   against the `test/fixtures/agda/` tree it documents as its boundary. A capture
   artifact whose `inlinedFirstPartySources[].path` contains enough `../` segments
   overwrites **arbitrary tracked files in the repo** (e.g. `src/index.ts`,
   `.github/workflows/`, `package.json`) with attacker-controlled content. This is
   precisely the tracked path-traversal bug class this phase was warned about, and
   the higher-stakes variant (writes land in the tracked tree, not a tmpdir).

2. **The advertised `--force` flag is a non-functional trap** that crashes and
   leaves orphaned writes: `judgeRefusal` lets `pass`/`skip` ORCL-01 outcomes
   through under `--force`, but `composeEntry` then dereferences a non-existent
   `coldTuple`, throwing `TypeError`.

Three WARNINGs concern robustness: no rollback of fixture writes on the error path,
a `test.fails` runner that cannot distinguish "defect reproduced" from "harness
exploded", and a per-process staged-file counter that still collides across server
processes. Four INFO items cover CLI input validation, comparator duplication,
global `passWithNoTests`, and a fixture-content test-coverage gap.

The three `.agda` fixtures and the matrix JSON/loader are correct; no findings there.

## Critical Issues

### CR-01: `materializeFixtureFiles` write sandbox is the whole repo, not `test/fixtures/agda/` — arbitrary in-repo file overwrite

**File:** `scripts/emit-regression.mjs:117-130` (`writeFixtureFile`), triggered from `scripts/emit-regression.mjs:194-204`

**Issue:**
`writeFixtureFile` contains its write with:

```js
dest = resolveFileWithinRoot(repoRoot, join("test/fixtures/agda", fixtureDir, barePath));
```

`resolveFileWithinRoot(repoRoot, …)` only guarantees the result stays under
`repoRoot` (`SERVER_REPO_ROOT`) — it does **not** guarantee it stays under
`test/fixtures/agda/`. `barePath` is derived from
`primaryArtifact.manifest.inlinedFirstPartySources[].path`, which is
attacker/artifact-controlled and is **not** sanitized for `..` by
`stripFixtureDirPrefix` (that helper only strips a leading `fixtureDir` prefix).
A path with enough `../` segments therefore escapes `test/fixtures/agda/` while
remaining inside the repo, and both the content (`source.content`) and the
destination are artifact-controlled.

This was confirmed end-to-end by invoking the real export against a throwaway repo
root:

```
primaryArtifact source path: "../../../../../src/index.ts"
fixtureDir:                   "FixtureDeps/TransitiveStaleness"
=> writtenFiles: ["<repoRoot>/src/index.ts"]   # escaped test/fixtures/agda
=> <repoRoot>/src/index.ts now contains: "PWNED via capture artifact\n"
```

The function's own docstring claims it writes to
`test/fixtures/agda/<fixtureDir>/<barePath>` and that "a `barePath` that escapes
the sandbox is silently skipped" — the implementation violates both claims. Note
the correct pattern already exists in the sibling oracle module
(`scripts/oracle/orcl-01-differential.mjs:99`), where the sandbox root **is** the
write base (`resolveFileWithinRoot(root, entry.path)` with `root` = the tmpdir).
Here the sandbox root (`repoRoot`) and the write base (`repoRoot/test/fixtures/agda`)
diverge — that gap is the bug.

Unit Test F (`test/unit/tools/emit-regression.test.ts:129-155`) gives false
confidence: its traversal path `../../../../../PWNED.agda` with `fixtureDir: "."`
over-shoots and lands **outside** the repo, where even the too-wide sandbox
rejects it. It never exercises an escape that stays *inside* the repo but *outside*
`test/fixtures/agda/`, which is exactly the reachable case.

**Fix:** Make the containment root equal the intended write base, and contain the
untrusted `fixtureDir` too:

```js
function writeFixtureFile(repoRoot, fixtureDir, barePath, content) {
  const fixturesRoot = join(repoRoot, "test/fixtures/agda");
  let dest;
  try {
    // Contain fixtureDir within test/fixtures/agda, then barePath within that.
    const fixtureBase = resolveFileWithinRoot(fixturesRoot, fixtureDir);
    dest = resolveFileWithinRoot(fixtureBase, barePath);
  } catch (err) {
    if (err instanceof PathSandboxError) return null;
    throw err;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, "utf8");
  return dest;
}
```

Add a regression test whose escaping path resolves inside the repo but outside
`test/fixtures/agda/` (e.g. `path: "../../../../../src/index.ts"` with
`fixtureDir: "FixtureDeps/TransitiveStaleness"`) and assert it is skipped and the
in-repo target is untouched.

### CR-02: `--force` lets `pass`/`skip` verdicts past `judgeRefusal`, then `composeEntry` crashes on the missing `coldTuple`

**File:** `scripts/emit-regression.mjs:62-64` (`judgeRefusal`), `scripts/emit-regression.mjs:229-249` (`composeEntry`)

**Issue:**
`judgeRefusal`'s fourth (overridable) gate is:

```js
if (verdict.orcl01.kind !== "server-false-green-candidate" && options.force !== true) {
  return `ORCL-01 outcome "${verdict.orcl01.kind}" has nothing meaningful to lock — pass --force to override`;
}
return null;
```

So with `--force`, an ORCL-01 outcome of `pass` or `skip` returns `null` (allowed).
But `composeEntry` unconditionally reads the cold tuple:

```js
expected: {
  classification: verdict.orcl01.coldTuple.classification,   // coldTuple is undefined for pass/skip
  ...
}
```

Only `server-false-green-candidate` carries `coldTuple`/`coldCategories`
(`scripts/oracle/orcl-01-differential.mjs:513-521`); `pass` is `{ kind: "pass" }`
and `skip` is `{ kind: "skip", reason }`. Since `--force` **only** changes behavior
for exactly the non-candidate outcomes, every outcome `--force` newly permits is one
`composeEntry` cannot build. Confirmed by running the exports:

```
judgeRefusal({orcl01:{kind:"pass"}}, {force:true})  => null
composeEntry(... verdict:{orcl01:{kind:"pass"}} ...) => TypeError: Cannot read properties of undefined (reading 'classification')
judgeRefusal({orcl01:{kind:"skip"}}, {force:true})  => null
composeEntry(... verdict:{orcl01:{kind:"skip"}} ...) => TypeError: Cannot read properties of undefined (reading 'classification')
```

Impact: the documented `--force` CLI flag can never succeed — it is dead/trap
functionality. Worse, in `scriptMain` the crash occurs at step (c), *after* step
(b) `materializeFixtureFiles` has already written fixture files into the tracked
`test/fixtures/agda/` tree, and the outer `catch` (line 436) does **not** roll them
back (see WR-01). A user invoking `--force` gets a `TypeError` and orphaned files.

**Fix:** Reconcile the two functions. Either forbid `--force` from unlocking
outcomes that lack a `coldTuple`, or have `composeEntry` guard the access. Minimal
guard in `composeEntry`:

```js
export function composeEntry({ ..., verdict }) {
  const cold = verdict.orcl01.coldTuple;
  if (cold === undefined) {
    throw new Error(
      `composeEntry: ORCL-01 outcome "${verdict.orcl01.kind}" has no coldTuple to lock; ` +
      `--force cannot fabricate an expected RED value.`,
    );
  }
  const candidate = { /* … uses `cold.*` and verdict.orcl01.coldCategories … */ };
  return captureRegressionEntrySchema.parse(candidate);
}
```

Preferably reject this in `judgeRefusal`/`scriptMain` *before* any write occurs, so
`--force` fails closed with a clear message and never materializes files.

## Warnings

### WR-01: `scriptMain`'s catch-all leaves orphaned fixture writes in the tracked tree

**File:** `scripts/emit-regression.mjs:396-439`

**Issue:** `writtenFiles` (returned by `materializeFixtureFiles`, line 396) is only
rolled back on the two clean-refusal exits — the D-05 self-check match (line 411)
and `--dry-run` (line 425). Any *throw* after materialization is caught by the
outer handler (lines 436-439), which writes an error and sets `exitCode = 1` but
performs **no** `rollbackWrittenFiles(writtenFiles)`. Reachable throw sites after
the writes include: `composeEntry` zod-validation failure (missing `--id`,
undefined `entryFile`, etc.), the CR-02 `--force` crash, a
`replayCaptureRegressionEntry` failure (missing fixture, Agda spawn error), and
`writeMatrixEntry`'s duplicate-`id` rejection (line 269). In every case the freshly
written files remain under `test/fixtures/agda/`, ready to be accidentally
`git add`-ed.

**Fix:** Track `writtenFiles` in a scope visible to the `catch`, and roll back on
any error before rethrowing/exiting:

```js
let writtenFiles = [];
try {
  ...
  ({ mutation, entryFile, writtenFiles } = materializeFixtureFiles({ ... }));
  ...
} catch (err) {
  rollbackWrittenFiles(writtenFiles);
  process.stderr.write(`emit-regression failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
```

### WR-02: `test.fails` runner cannot distinguish "defect reproduced" from "harness broken" — a broken harness stays green

**File:** `test/integration/mcp/capture-regression.test.ts:40-44`

**Issue:**

```js
const runEntry = entry.status === "red" ? it.fails : it;
runEntry(`${entry.id}: …`, async () => {
  const { observed } = await replayCaptureRegressionEntry(entry, FIXTURES_ROOT);
  expect(matchesExpected(observed, entry.expected)).toBe(true);
});
```

Under `it.fails`, the task passes whenever the body throws *or* the assertion
fails. The intended failure is `expect(...).toBe(true)` being `false` (observed ≠
expected, i.e. defect still live). But **any** exception inside the body counts
identically as an "expected failure": if `replayCaptureRegressionEntry` throws (a
missing fixture, an Agda spawn failure), or the tool returns a hard `tool-error`
envelope whose `structuredContent.data` lacks the tuple fields (making
`observed.classification === undefined`, so `matchesExpected` is `false`), the suite
still goes green. The runner therefore cannot tell "the #64/#61 defect reproduced"
from "the replay harness exploded," and — critically for the lock's whole purpose —
if the harness is broken on the day the defect is fixed, the test will **not** flip
to red to force promotion. This directly undercuts the phase's charter that the lock
"fails loudly the moment the wrapped assertion starts unexpectedly passing."

**Fix:** Run red entries as a *normal* test asserting the defect is still red, so
infrastructure failures fail loudly and a genuine fix flips the assertion:

```js
const runEntry = it; // plain test for both red and locked
runEntry(`${entry.id}: …`, async () => {
  const { observed } = await replayCaptureRegressionEntry(entry, FIXTURES_ROOT);
  const matched = matchesExpected(observed, entry.expected);
  if (entry.status === "red") {
    // Defect still live: observed must NOT match the cold/correct expected value.
    // A harness throw propagates as a real failure (never masked as "expected fail").
    expect(matched).toBe(false);
  } else {
    expect(matched).toBe(true);
  }
});
```

A fixed defect then makes `matched === true`, failing the `toBe(false)` assertion
and forcing promotion to `locked` — the same trigger, but without conflating harness
faults with the live-defect signal.

### WR-03: staged-filename counter is per-process — captures collide and clobber across server restarts/processes

**File:** `src/tools/register-capture-session.ts:51,173-177`

**Issue:** `stagedFileSequence` is a module-level counter that starts at `0` in every
server process:

```js
const stagedPath = join(captureDir, `${dedup.fingerprint}-${dedup.recurrence}-${stagedFileSequence++}.json`);
await writeFileAtomic(stagedPath, JSON.stringify(artifact, null, 2));
```

This closes the in-session CR-03 collision, but because `recurrence` only advances
via the out-of-band `promote-capture.mjs` (per the comment at lines 44-50) and the
counter resets to `0` on each process start, two **separate** server processes that
each hit the same fingerprint first will both compute
`<fingerprint>-<recurrence>-0.json`. `.agda-mcp/captures/` persists across runs, and
`writeFileAtomic`'s `rename()` silently overwrites the earlier artifact — the second
run clobbers the first. Sequential dogfooding runs against the same defect are the
realistic trigger, so the "collision-proof" claim holds only within a single
process. Losing a captured defect artifact undercuts the milestone's "every real
proof session reliably converts into a stronger server" premise.

**Fix:** Add a cross-process-unique component to the filename (the same
`randomUUID()` primitive already imported by `safe-source-io.ts`), e.g.:

```js
import { randomUUID } from "node:crypto";
...
const stagedPath = join(
  captureDir,
  `${dedup.fingerprint}-${dedup.recurrence}-${stagedFileSequence++}-${randomUUID()}.json`,
);
```

The monotonic counter can stay for intra-process ordering; the UUID removes the
cross-process clobber.

## Info

### IN-01: global `passWithNoTests: true` can mask an accidentally-empty or mis-globbed run

**File:** `vitest.config.ts:26`

**Issue:** The flag is justified for the legitimately-empty-matrix case, but it is
suite-global: a future test file that gates *all* its tasks behind a condition (as
the matrix runner does when empty), or a mis-typed `vitest run <filter>` in CI,
would now pass silently instead of erroring. The comment's "No other file currently
reaches zero collected tasks" is a point-in-time assertion with no guard.

**Fix:** Prefer scoping the zero-test tolerance to the data-driven runner by having
it always register one sentinel task (e.g. a `test("matrix loaded", () => { … })`
that just asserts the matrix parsed), then drop the global `passWithNoTests`. That
keeps the empty-matrix run green while preserving "empty run = error" everywhere
else.

### IN-02: emitter CLI does not validate required flags up front; missing flags throw obscure errors after writes begin

**File:** `scripts/emit-regression.mjs:365-404`

**Issue:** `--id`, `--fixture-dir`, and `--tool` are read with `flagValue` (which
returns `undefined` when absent) and flow unchecked into `materializeFixtureFiles` /
`composeEntry`. Missing `--fixture-dir` throws a raw `TypeError: Path must be a
string. Received undefined` from `join()` deep inside `materializeFixtureFiles`;
missing `--id`/derived-`entryFile` throws a raw zod error from `composeEntry` — in
the latter cases after fixture files may already be written (see WR-01).

**Fix:** Validate presence of the required flags immediately after parsing (before
`runOracle`/materialization) and emit the same friendly usage string already used
for the missing positional arg.

### IN-03: match logic is implemented twice; the "single comparator" guarantee stops at ORCL-01's boundary

**File:** `scripts/emit-regression.mjs:277-297` vs `scripts/oracle/orcl-01-differential.mjs:505-508`

**Issue:** `matchesExpected` is correctly the single comparator shared by the
emitter self-check and the Wave-3 runner. However its logic is a hand-copy of
`runColdLoadAndDiff`'s `tupleMatches`/`categoriesMatch` (same fields, same
same-length/same-index array rule). The docstring says it "Mirrors … exactly," but
nothing enforces the mirror; if ORCL-01's tuple fields or category-compare rule
change, the two silently drift.

**Fix:** Export the field list / a small `tupleMatches` + `categoriesMatch` helper
from `orcl-01-differential.mjs` and have `matchesExpected` reuse it, so the mirror
is structural rather than by-convention.

### IN-04: G2/G3 tests assert filenames but not the baseline-vs-primary content routing

**File:** `test/unit/tools/emit-regression.test.ts:184-297`

**Issue:** `materializeFixtureFiles` routes the *baseline* (healthy/"before") content
to `targetFile` (`Dep.agda`) and the *primary* (captured/"after") content to
`sourceFile` (`Dep.broken.agda`) — the direction the false-green replay depends on
(splice `sourceFile` over `targetFile`, reload, expect RED). Tests G2/G3 assert the
`mutation` filenames and `entryFile` but never read back the *content* written to
`Dep.agda` vs `Dep.broken.agda`, so a future swap of the two `writeFixtureFile`
calls (line 194 vs 198) would leave both tests green while inverting the fixture
semantics.

**Fix:** In G2/G3 additionally assert
`readFileSync(.../Dep.agda) === <baseline content>` and
`readFileSync(.../Dep.broken.agda) === <primary content>` to lock the routing
direction.

## Structural Findings (fallow)

No structural pre-pass was provided for this review.

---

_Reviewed: 2026-07-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
