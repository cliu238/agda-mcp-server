---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
reviewed: 2026-07-02T10:42:21Z
depth: standard
iteration: 2
files_reviewed: 8
files_reviewed_list:
  - scripts/oracle/orcl-02-soundness-scan.mjs
  - scripts/oracle/cold-agda-session.mjs
  - scripts/oracle/orcl-01-differential.mjs
  - scripts/oracle/orcl-03-conformance.mjs
  - scripts/oracle/run-oracle.mjs
  - scripts/oracle/verdict-schema.mjs
  - test/unit/tools/oracle-orcl-02.test.ts
  - test/unit/tools/oracle-cold-agda-session.test.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 2: Code Review Report (Iteration 2 — Fix Verification)

**Reviewed:** 2026-07-02T10:42:21Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** clean

## Summary

This is iteration 2 of the fix+re-review loop. The prior review found 2 BLOCKER
(CR-01, CR-02) + 2 WARNING (WR-01, WR-02) + 2 INFO (IN-01, IN-02). A fixer landed
four commits (`b2b82a9` CR-01, `5f32413` CR-02, `c398f67` WR-01, `cf1e820` WR-02),
touching exactly `scripts/oracle/orcl-02-soundness-scan.mjs`,
`scripts/oracle/cold-agda-session.mjs`, and their two test files.

**All four targeted findings are genuinely resolved — each confirmed with an
executable `tsx` probe against the real scripts, not just by reading:**

- **CR-01 (RESOLVED):** `loadOraclePolicy` now rejects any non-bare policy key
  (allowlist regex + non-dot requirement). Every traversal key returns `null`,
  and the end-to-end planted-policy attack (a repo whose `.agda-lib` `name:` is
  a traversal string) now routes to the honest `no-policy` verdict with the
  cheat surfaced — no longer a false `clean`.
- **CR-02 (RESOLVED):** `walkClosureFiles` and `scanClosure` now contain the
  artifact-controlled target via `resolveFileWithinRoot` (with per-dep
  re-containment). Absolute / `..`-escaping targets yield an empty closure and
  never read outside `repoRoot`; the legitimate in-graph closure is preserved.
- **WR-01 (RESOLVED):** the scan now strips `--` line comments and masks
  string/char-literal interiors before the postulate/pragma/hole passes, while
  preserving `{-# … #-}` pragma bodies verbatim. `?` in comments/strings,
  commented-out `TERMINATING`/`OPTIONS --with-K`, all produce no findings; a real
  pragma with a trailing `-- …?` comment still fires.
- **WR-02 (RESOLVED):** `versionProbe` now parses defensively and abstains
  (`ok: false`) on an unparseable version instead of throwing. Reproduced the
  prior review's exact crash scenario end-to-end (unparseable `manifest.agdaVersion`
  + a real Agda 2.8.0 present) — `runOracle` now completes with
  `orcl01=inconclusive probe=version` and writes the verdict sidecar, where it
  previously threw and wrote nothing.

No new Critical or Warning defects were introduced. One **new INFO-level** latent
edge case was found in the WR-01 rewrite (a char-literal/primed-identifier
mis-parse that is fail-safe and cannot fire on the target corpora), plus the two
carried-over out-of-scope INFO findings. The four unchanged predicate/CLI modules
(`orcl-01`, `orcl-03`, `run-oracle`, `verdict-schema`) were re-read for
regressions from the shared-module changes and are unaffected. The two in-scope
test files pass (42 passed, 1 skipped) and their CR-01/CR-02/WR-01/WR-02
regression assertions pin the fixed behavior.

Because no Critical/Warning findings remain, **status is `clean`** (the three INFO
items are noted below for tracking; per gating rules Info-only is clean).

## Verification of Prior Findings

| ID | Prior severity | Status | Evidence |
|----|----------------|--------|----------|
| CR-01 | BLOCKER | Resolved | `loadOraclePolicy("../oracle-policy/agda-unimath")` → `null`; traversal `.agda-lib` name → `no-policy` (cheat surfaced), not `clean` |
| CR-02 | BLOCKER | Resolved | `walkClosureFiles`/`scanClosure` on `/etc/hosts` and `../../../../../../etc/hosts` → `[]`; in-graph closure still `[Downstream, Upstream]` |
| WR-01 | WARNING | Resolved | `?` in `-- comment`/`"string"` and commented-out pragmas → no findings; real `{-# TERMINATING #-}   -- why?` → `terminating` only |
| WR-02 | WARNING | Resolved | `runEnvironmentProbes` with unparseable versions → `ok:false` (no throw); full `runOracle` reproduction now `inconclusive` + sidecar written |

## Info

### IN-01: `stripCommentsAndStrings` mis-parses a primed identifier followed by a char literal → false `residual-hole` (new, introduced by the WR-01 fix)

**File:** `scripts/oracle/orcl-02-soundness-scan.mjs:172-190` (the `if (ch === "'")` char-literal branch)
**Classification:** Info (fail-safe over-flag; cannot produce a false green; does not fire on the target HoTT corpora)

**Issue:**
The char-literal branch enters masking whenever `source[i + 2] === "'"`, without
checking that the current `'` is actually a char-literal *opener*. In Agda a `'`
is also an identifier-continuation character (primed identifiers like `x'`, `ih'`
are ubiquitous). When a primed identifier is immediately followed by a
single-char-separated char literal — pattern `X' 'Y'` — the scanner treats the
identifier's trailing `'` plus the next char plus the char-literal's *opening*
quote as one "char literal", masks that 3-char span, then emits the real char
literal's content verbatim. If that content is `?`, a spurious `residual-hole`
finding is produced.

Reproduced end-to-end against the real script:

```
primed-id-then-char-question ( f = foo' '?' ): ["residual-hole@2:?"]   // FALSE POSITIVE
standalone-char-question     ( x = '?'      ): []                       // correct (masked)
primed-id-then-char-a        ( f = foo' 'a' ): []                       // harmless
primed-in-app-then-hole      ( f = x' ?     ): ["residual-hole@2:?"]    // correct (real hole)
escaped-char-question        ( x = '\?'     ): []                       // correct
```

When the warm classification is `ok-complete`, this unsanctioned `residual-hole`
flips ORCL-02 to `cheat-flagged` → `trueGreen: false` on otherwise-valid,
genuinely-complete source. This is the same false-red class WR-01 targeted, but
now vanishingly narrow: it requires a primed identifier immediately preceding a
char literal whose character is `?` (e.g. `foo' '?'`). Such char literals do not
occur in the agda-unimath / homotopy fuel corpora, so this will not fire in
practice — hence Info, not Warning. It remains fail-safe (it over-flags; it can
never mask a real cheat into a false green), but it is a real, reproducible logic
bug in newly-added code with no regression test.

**Fix:** Only treat `'` as a char-literal opener when it is not part of an
identifier — i.e. when the previously-emitted character is not an
identifier-continuation char (alphanumeric, `_`, or `'`). This matches Agda's own
lexer disambiguation and `src/session/goal-positions.ts`'s `skipCharLiteral`
intent:

```js
if (ch === "'" && !/[A-Za-z0-9_']/u.test(source[i - 1] ?? "")) {
  // ... existing char-literal masking ...
}
// else fall through and emit the ' verbatim (primed identifier)
```

Add regression tests asserting `foo' '?'`, `x' 'a'`, and a primed identifier
before a real char literal produce no `residual-hole` finding, while a standalone
`?` hole still does.

### IN-02: `run-oracle.mjs` `--only` with no following value crashes outside the CLI try/catch (carried over, out of fix scope)

**File:** `scripts/oracle/run-oracle.mjs:272-279`
**Classification:** Info (unchanged from iteration 1; the fixer intentionally did not address this — `--all` not passed)

**Issue:** `argv[onlyFlagIndex + 1].split(",")` is evaluated before the `try`
block, so `run-oracle.mjs <path> --only` (flag last, no value) dereferences
`undefined.split` and produces a raw stack trace instead of the tidy
`run-oracle failed: …` stderr message used elsewhere. Still present verbatim.
**Fix:** Guard the lookup — `const onlyRaw = onlyFlagIndex !== -1 ? argv[onlyFlagIndex + 1] : undefined;` — then branch on `onlyRaw === undefined`, or move the parse inside `try`.

### IN-03: `splitMergedArgv`, load-family regex, and terminus check triplicated across oracle modules (carried over, out of fix scope)

**File:** `scripts/oracle/orcl-01-differential.mjs:314-326` & `242`; `scripts/oracle/orcl-03-conformance.mjs:202-214`, `160`, `225-236`; `scripts/oracle/cold-agda-session.mjs:387-403`
**Classification:** Info (unchanged from iteration 1; deliberate plan-scoped duplication, still a maintenance hazard)

**Issue:** `splitMergedArgv`, the `/^agda_(load|typecheck)/` load-family pattern,
and the InteractionPoints/AllGoalsWarnings/Error terminus check each exist in two
or three near-identical copies. A future fix to the subtle `-l`-splitting logic
must be applied in both `orcl-01` and `orcl-03` or the predicates silently
diverge on the same capture. **Fix:** hoist these into `cold-agda-session.mjs`
(already the shared-infra module) once the phase's file-scope constraints relax.

---

_Reviewed: 2026-07-02T10:42:21Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard (iteration 2, fix verification)_
