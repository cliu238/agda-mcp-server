---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
reviewed: 2026-07-02T10:07:34Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - scripts/data/oracle-policy/agda-unimath.json
  - scripts/oracle/cold-agda-session.mjs
  - scripts/oracle/orcl-01-differential.mjs
  - scripts/oracle/orcl-02-soundness-scan.mjs
  - scripts/oracle/orcl-03-conformance.mjs
  - scripts/oracle/run-oracle.mjs
  - scripts/oracle/verdict-schema.mjs
  - src/agda/session-load-helpers.ts
  - src/agda/session-process-lifecycle.ts
  - src/agda/session.ts
  - test/fixtures/agda/CompilePragmaExample.agda
  - test/fixtures/agda/LibBase.agda
  - test/fixtures/agda/PrimTrustMeExample.agda
  - test/fixtures/agda/TerminatingExample.agda
  - test/fixtures/agda/WithKOverride.agda
  - test/unit/agda/session-capture/manifest-builder.test.ts
  - test/unit/tools/oracle-cold-agda-session.test.ts
  - test/unit/tools/oracle-orcl-01.test.ts
  - test/unit/tools/oracle-orcl-02.test.ts
  - test/unit/tools/oracle-orcl-03.test.ts
  - test/unit/tools/oracle-run-oracle.test.ts
  - test/unit/tools/oracle-verdict-schema.test.ts
findings:
  critical: 2
  warning: 2
  info: 2
  total: 6
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-02T10:07:34Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

The reviewed change adds the Phase-2 oracle triad: three predicate scripts
(ORCL-01 cold-replay differential, ORCL-02 soundness scan, ORCL-03 conformance
proxy), a shared cold-Agda-session lifecycle, a composed verdict CLI, plus the
supporting `src/agda/session*` WR-08 argv-reset plumbing and test fixtures.

The `src/` changes (lastDispatchedLoadArgv staleness resets across `load()`,
`loadNoMetas()`, `resetFileBoundStateIfProcDied`, and
`handleSessionProcessClose`) are correct, well-documented, and internally
consistent — no findings there. ORCL-01 and ORCL-03 correctly contain
artifact-derived paths inside the materialized temp dir via
`resolveFileWithinRoot`, matching the project's CR-01 path-containment
convention.

**However, ORCL-02 (the soundness scan) is the security-critical outlier and
contains two BLOCKER-class path/trust defects, both reproduced end-to-end
against the real scripts via `tsx`:**

1. Its per-project policy key (which drives the sanctioned-axiom whitelist) is
   fed unsanitized into a `../data/oracle-policy/${key}.json` URL, so an
   artifact/project-controlled key with `../` segments loads an
   attacker-chosen policy file and whitelists arbitrary axioms — defeating the
   entire soundness scan.
2. Its scan target and dependency closure are read from disk with **no
   `repoRoot` containment at all** (contradicting `walkClosureFiles`'s own
   docstring), so a capture whose `data.file` is an absolute or `..`-escaping
   path causes arbitrary file reads and leaks matching line content into the
   verdict.

Two further WARNING-level correctness defects: the pragma/hole scanner is blind
to `--` line comments and string literals (producing false `cheat-flagged`
verdicts on ordinary `?`-in-a-comment source), and an unparseable captured
`agdaVersion` throws instead of abstaining, crashing the whole `run-oracle`
invocation with no verdict written.

All four functional findings were confirmed with executable probes, not just
by reading.

## Critical Issues

### CR-01: `loadOraclePolicy` path traversal → sanctioned-axiom whitelist bypass

**File:** `scripts/oracle/orcl-02-soundness-scan.mjs:49-55` (with `resolveDefaultPolicyKey`, `326-345`)
**Issue:**
`loadOraclePolicy(projectKey)` builds the policy path by direct interpolation:

```js
return loadJsonData(`../data/oracle-policy/${projectKey}.json`, oraclePolicySchema, import.meta.url);
```

`loadJsonData` resolves this with `new URL(relativePath, baseUrl)`, which
honors `../` segments — so a `projectKey` containing `../` escapes the
`scripts/data/oracle-policy/` directory and loads **any** JSON file on disk
that matches the (very loose) 3-field schema. `projectKey` is **not** a fixed
constant: it comes from `resolveDefaultPolicyKey(repoRoot)`, which reads the
`name:` field of a `.agda-lib` file in the scanned repo — i.e. attacker/
artifact-controlled data — or from the `--policy` CLI flag.

Because the loaded policy's `sanctionedAxioms` list decides whether a
`postulate` finding is a cheat (`diffAgainstWhitelist`), an attacker who
controls the repo/`.agda-lib` can point the key at their own planted policy
file and mark arbitrary axioms as sanctioned, turning a genuine cheat into a
`clean` (true-green) verdict. This is the exact CR-01 path-traversal class the
project has already fixed elsewhere, but the containment is absent here.

Reproduced end-to-end (a repo whose `project.agda-lib` `name:` is a traversal
key pointing at a planted `evil.json`):

```
1.  policy traversal loaded: {"sanctionedAxioms":["cheatAxiom"],...}
1b. judgeOrcl02 with traversal .agda-lib name: clean (sanctioned: postulate=true)
```

`cheatAxiom` — an unlisted postulate — is reported `sanctioned: true`, verdict
`clean`.

**Fix:** Validate the key against a strict allowlist pattern before use, and/or
contain the resolved path within the policy directory. For example:

```js
export function loadOraclePolicy(projectKey) {
  // Reject anything that isn't a bare, single-segment key.
  if (typeof projectKey !== "string" || !/^[A-Za-z0-9._-]+$/u.test(projectKey)) {
    return null;
  }
  try {
    return loadJsonData(`../data/oracle-policy/${projectKey}.json`, oraclePolicySchema, import.meta.url);
  } catch {
    return null;
  }
}
```

(`.` and `..` are still rejected because the pattern forbids a key that is only
dots via an explicit `projectKey === "." || projectKey === ".."` guard, or by
tightening the regex to require at least one non-dot character.)

### CR-02: `scanClosure` / `walkClosureFiles` read files outside `repoRoot` from artifact-controlled `data.file`

**File:** `scripts/oracle/orcl-02-soundness-scan.mjs:206-219` (`walkClosureFiles`), `244-278` (`scanClosure`), consumed by `judgeOrcl02:397-421`
**Issue:**
`walkClosureFiles` seeds its dependency set with the target path unconditionally
and never enforces that it stays within `repoRoot`:

```js
const absPath = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
const relPath = relative(repoRoot, absPath);          // e.g. "../../../etc/hosts"
const deps = new Set([relPath]);                       // added regardless of graph membership
...
return [...deps].filter((dep) => existsSync(resolve(repoRoot, dep))).sort();
```

`computeImpact` returns `null` for an out-of-graph file, but `relPath` is
already in `deps`, and the `existsSync` filter re-resolves it back to the
escaping absolute path and keeps it if it exists. `scanClosure` then does
`readFileSync(resolve(repoRoot, dep), "utf8")` on it. The `filePath` argument
is `targetFile = action.normalizedResponse?.data?.file`, read straight from the
(untrusted) capture artifact — the oracle's entire job is to judge captures
that may be adversarial or malformed.

This is an arbitrary file read, and matching lines are disclosed: each finding
carries `detail: line.trim()` (the actual file content) tagged with the escaping
path, which is persisted into the verdict sidecar. The `walkClosureFiles`
docstring explicitly (and falsely) claims "T-02-02-02: never accepts an
externally-supplied absolute path beyond what the graph itself resolves."

Reproduced end-to-end:

```
3.  closure files for absolute /etc/hosts target: ["../../../../../../etc/hosts"]
3b. scanClosure findings count on escaped file: 0 []   // file WAS read; 0 only because /etc/hosts has no Agda tokens
```

Note ORCL-01 (`runColdLoadAndDiff:358-372`) and ORCL-03 (`judgeOrcl03:332-346`)
both correctly gate their target through `resolveFileWithinRoot` and emit an
inconclusive/advisory outcome on escape — ORCL-02 is the only predicate missing
this guard.

**Fix:** Contain the target within `repoRoot` before walking/reading, mirroring
the other two predicates:

```js
export function scanClosure(repoRoot, filePath, agdaVersion, policy) {
  let containedTarget;
  try {
    containedTarget = resolveFileWithinRoot(repoRoot, filePath); // throws PathSandboxError on escape
  } catch (err) {
    if (err instanceof PathSandboxError) return []; // nothing safely scannable
    throw err;
  }
  const files = walkClosureFiles(repoRoot, containedTarget, agdaVersion);
  // ... and additionally skip any `dep` whose resolved path escapes repoRoot
  //     inside the loop, since the closure walk can still surface `..` entries.
}
```

Also drop the false containment claim from `walkClosureFiles`'s docstring once
the guard is real.

## Warnings

### WR-01: pragma/hole scanner ignores `--` line comments and string literals → false `cheat-flagged` verdicts

**File:** `scripts/oracle/orcl-02-soundness-scan.mjs:71-181` (`stripPlainBlockComments` + `scanPragmaVocabulary`), `189-191` (`scanOptionsFlags`)
**Issue:**
`stripPlainBlockComments` only removes `{- ... -}` block comments; it never
strips `--` line comments, and the per-line regex scan runs against text that
still contains comments and string literals. Consequently:

- A bare `?` in an ordinary comment or string (e.g. `-- is this right?`,
  `msg = "really?"`) is flagged `residual-hole`.
- A commented-out unsafe pragma (`-- {-# TERMINATING #-}`) is flagged
  `terminating`.
- `scanOptionsFlags` runs `parseOptionsPragmas` on raw source, so a
  commented-out `-- {-# OPTIONS --with-K #-}` triggers a false `with-k-override`.

When the warm classification is `ok-complete`, an unsanctioned `residual-hole`
makes the verdict `cheat-flagged` → `trueGreen: false`. Agda source very
commonly contains `?` in prose comments, so this will misfire on realistic
corpora (including agda-unimath). This is fail-safe (it over-flags, never
producing a false green), but it materially degrades the predicate's
trustworthiness, and there is no negative test pinning the intended behavior.
The scanner's own comment claims it "mirrors" `import-graph.ts`'s
`stripBlockComments`, but that helper additionally applies `stripLineComment`
before scanning — the step omitted here.

Reproduced:

```
2. findings on comment/prose-only source: ["residual-hole@2","terminating@3","residual-hole@4"]
```

(source was four lines of comments + one string literal, zero real cheats.)

**Fix:** Strip `--` line comments (outside string literals) and mask string
literals before the token/hole scan, reusing the same `stripLineComment` +
string-skipping approach already present in `src/agda/import-graph.ts` and
`src/session/goal-positions.ts`. Add regression tests asserting that `?` in a
comment/string, and a commented-out `{-# TERMINATING #-}` / `{-# OPTIONS
--with-K #-}`, produce **no** findings.

### WR-02: `versionProbe` throws on an unparseable captured `agdaVersion`, crashing the whole run instead of abstaining

**File:** `scripts/oracle/cold-agda-session.mjs:254-279` (`versionProbe` / `runEnvironmentProbes`), reached via `scripts/oracle/orcl-01-differential.mjs:206-217` (`runProbeGate`)
**Issue:**
`versionProbe` calls `parseAgdaVersion(detectedAgdaVersion)` and
`parseAgdaVersion(manifestAgdaVersion)` with no error handling.
`parseAgdaVersion` (`src/agda/agda-version.ts:25-34`) throws when the string
contains no digit run. `manifestAgdaVersion` is `artifact.manifest.agdaVersion`,
read directly from the untrusted capture; a non-null, unparseable value makes
`runEnvironmentProbes` throw. The throw propagates through `runProbeGate` →
`runColdLoadAndDiff` → `runSharedOrcl01AndOrcl03` (whose `try/finally` only
cleans up, never catches) → `runOracle`, aborting the entire CLI. No verdict
sidecar and no metrics line are written.

This violates the module's own stated contract ("an evidence-free or
environment-mismatched cold run must report INCONCLUSIVE ... never a false
PASS") — an unparseable captured version should be `inconclusive(version)`, not
an exception that takes down the run.

Reproduced end-to-end:

```
runOracle THREW: Cannot parse Agda version from: not-a-version
sidecar written? false
```

**Fix:** Parse defensively inside the probe and abstain on failure:

```js
function safeParse(raw) {
  try { return parseAgdaVersion(raw); } catch { return null; }
}
const dv = safeParse(detectedAgdaVersion);
const mv = safeParse(manifestAgdaVersion);
if (dv === null || mv === null) {
  return { probe: "version", ok: false, detail: `unparseable Agda version (captured="${manifestAgdaVersion}", cold="${detectedAgdaVersion}")` };
}
const matches = compareVersions(dv, mv) === 0;
```

## Info

### IN-01: `run-oracle.mjs` `--only` with no following value crashes outside the CLI try/catch

**File:** `scripts/oracle/run-oracle.mjs:272-279`
**Issue:** `argv[onlyFlagIndex + 1].split(",")` is evaluated **before** the
`try` block. Invoking `run-oracle.mjs <path> --only` (flag last, no value)
dereferences `undefined.split`, producing an unhandled rejection / raw stack
trace rather than the tidy `run-oracle failed: ...` stderr message the CLI uses
everywhere else. (`orcl-02`'s `--policy` handling degrades gracefully by
contrast, treating a missing value as "omitted".)
**Fix:** Guard the lookup: `const onlyRaw = onlyFlagIndex !== -1 ? argv[onlyFlagIndex + 1] : undefined;`
then branch on `onlyRaw === undefined`, or move the parse inside the `try`.

### IN-02: `splitMergedArgv`, load-family regex, and terminus check are triplicated across oracle modules

**File:** `scripts/oracle/orcl-01-differential.mjs:314-326` & `242`, `scripts/oracle/orcl-03-conformance.mjs:202-214` & `160` & `225-236`, `scripts/oracle/cold-agda-session.mjs:368-384`
**Issue:** `splitMergedArgv`, the `/^agda_(load|typecheck)/` load-family
pattern, and the InteractionPoints/AllGoalsWarnings/Error "terminus" check each
exist in two or three near-identical copies. The inline comments acknowledge
this is a deliberate, plan-scoped duplication, but it is still a maintenance
hazard: the `-l`-splitting logic in particular is subtle (it restores a
spawn-time-vs-command-time distinction), and a future fix must be applied in
both `orcl-01` and `orcl-03` or the two predicates will silently diverge on the
same capture.
**Fix:** Once the phase's file-scope constraints relax, hoist these into
`cold-agda-session.mjs` (already the shared-infra module) and import them, so
the split/terminus logic has a single source of truth.

---

_Reviewed: 2026-07-02T10:07:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
