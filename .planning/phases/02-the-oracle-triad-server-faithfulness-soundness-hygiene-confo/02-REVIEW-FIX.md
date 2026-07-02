---
phase: 02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo
fixed_at: 2026-07-02T10:30:53Z
review_path: .planning/phases/02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-07-02T10:30:53Z
**Source review:** .planning/phases/02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (Critical + Warning; Info findings IN-01/IN-02 out of scope — `--all` not passed)
- Fixed: 4
- Skipped: 0

All four in-scope findings were fixed, each committed atomically. Every
fix ships with a regression test that fails on the pre-fix code and
passes on the fixed code. The full suite is green: the targeted files
pass (`oracle-orcl-02.test.ts` 29 passed, `oracle-cold-agda-session.test.ts`
13 passed / 1 Agda-gated skip), and the whole `vitest` run reports 0
real failures — the only 4 failures observed in a bare worktree were
pre-existing `test/integration/mcp/*` end-to-end tests that spawn
`dist/index.js`, which is absent until `npm run build` runs; after
building `dist/`, all 4 pass. Those MCP tests are unrelated to this
change (which touches only `scripts/oracle/*.mjs` and oracle unit tests).

## Fixed Issues

### CR-01: `loadOraclePolicy` path traversal → sanctioned-axiom whitelist bypass

**Files modified:** `scripts/oracle/orcl-02-soundness-scan.mjs`, `test/unit/tools/oracle-orcl-02.test.ts`
**Commit:** b2b82a9
**Applied fix:** `loadOraclePolicy(projectKey)` interpolated an artifact/CLI-controlled
key into a `../data/oracle-policy/${key}.json` path that `loadJsonData`
resolves with `new URL(..., baseUrl)` (which honors `../`), so a key
with path segments or dot-traversal (e.g. `../oracle-policy/agda-unimath`
or `../../../evil`) escaped the policy directory and could load an
attacker-planted whitelist. Added a guard requiring a single bare
filename segment — `/^[A-Za-z0-9._-]+$/u` **and** at least one non-dot
character (`/[A-Za-z0-9_-]/u`), so `/`, `\`, whitespace, `.`, `..`, and
any all-dot key are rejected while legitimate keys like `agda-unimath`
still resolve. A rejected key degrades to `null`, routing to the existing
honest `no-policy` outcome (D-03). Regression test asserts a traversal
key that lands back on the real `agda-unimath.json` now returns `null`.

### CR-02: `scanClosure` / `walkClosureFiles` read files outside `repoRoot`

**Files modified:** `scripts/oracle/orcl-02-soundness-scan.mjs`, `test/unit/tools/oracle-orcl-02.test.ts`
**Commit:** 5f32413
**Applied fix:** `walkClosureFiles` seeded its dependency set with the raw target
path (`isAbsolute(filePath) ? filePath : resolve(...)`) unconditionally,
and the final `existsSync` filter re-resolved escaping paths and kept
them — so a capture whose `data.file` was absolute or `..`-escaping
caused `scanClosure` to `readFileSync` an arbitrary file and leak
matching lines into the verdict. Imported `PathSandboxError` /
`resolveFileWithinRoot` from `src/repo-root.js` and contained the target
before seeding (empty closure on escape), re-checked every retained dep,
and added a top-level containment guard plus per-dep contained resolve in
`scanClosure` — mirroring the guards ORCL-01 (`runColdLoadAndDiff`) and
ORCL-03 (`judgeOrcl03`) already apply. Removed the now-unused `isAbsolute`
import and rewrote the false `T-02-02-02` docstring claim to describe the
real containment. Regression test asserts an absolute `/etc/hosts` target
and a `..`-climbing target both yield an empty closure and no findings.

### WR-01: pragma/hole scanner ignores `--` line comments and string literals

**Files modified:** `scripts/oracle/orcl-02-soundness-scan.mjs`, `test/unit/tools/oracle-orcl-02.test.ts`
**Commit:** c398f67
**Applied fix:** The scanner cleaned only `{- ... -}` block comments, so a bare `?`
in a `--` line comment or string literal, and a commented-out
`-- {-# TERMINATING #-}` / `-- {-# OPTIONS --with-K #-}`, produced false
`residual-hole` / `terminating` / `with-k-override` findings (a false
`cheat-flagged` verdict when the warm classification is `ok-complete`).
Replaced `stripPlainBlockComments` with `stripCommentsAndStrings`, a
single-pass state machine that additionally drops `--` line comments and
masks `"..."` string and `'x'` character-literal interiors, while still
preserving `{-# ... #-}` pragma bodies verbatim and every newline (so
1-based line numbers are unchanged). Routed both `scanPragmaVocabulary`
and `scanOptionsFlags` through it. Mirrors `import-graph.ts`'s
`stripLineComment` and `goal-positions.ts`'s string/char skipping. Four
regression tests pin: `?` in a comment/string → no findings; a
commented-out `TERMINATING` → no findings; a commented-out `OPTIONS
--with-K` → no flag; and (positive control) a real pragma with a trailing
`-- ?` comment is still detected while the comment's `?` is ignored.

### WR-02: `versionProbe` throws on an unparseable captured `agdaVersion`

**Files modified:** `scripts/oracle/cold-agda-session.mjs`, `test/unit/tools/oracle-cold-agda-session.test.ts`
**Commit:** cf1e820
**Applied fix:** `versionProbe` called `parseAgdaVersion(manifestAgdaVersion)` (read
straight from the untrusted capture manifest) and
`parseAgdaVersion(detectedAgdaVersion)` with no error handling;
`parseAgdaVersion` throws on a string with no digit run, and the
exception propagated through `runProbeGate` → `runColdLoadAndDiff` →
`runOracle`, aborting the whole CLI with no verdict written. Wrapped both
parses in a `try/catch` that returns an INCONCLUSIVE (`ok: false`)
version probe with a descriptive detail on failure, honoring the module's
"never a false PASS, abstain on environment mismatch" contract.
Regression test asserts an unparseable captured version (and an
unparseable cold version) each yield `ok: false` instead of throwing out
of `runEnvironmentProbes`.

---

_Fixed: 2026-07-02T10:30:53Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
