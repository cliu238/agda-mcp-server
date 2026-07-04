---
phase: 09-residual-v1-0-debt-sweep
fixed_at: 2026-07-04T21:15:45Z
review_path: .planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-07-04T21:15:45Z
**Source review:** .planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — IN-01/IN-02/IN-03 explicitly out of scope per objective)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: WR-01's durability reorder widens the drain-to-reset window into a real concurrent-drop race

**Status:** fixed: requires human verification (logic/state-handling fix — see note below)
**Files modified:** `src/agda/session-capture/recorded-transport.ts`, `src/tools/register-capture-session.ts`, `test/unit/agda/session-capture/recorded-transport.test.ts`, `test/unit/tools/register-capture-session.test.ts`
**Commit:** `0d66569`
**Applied fix:** Added a new exported `commitDrainedActions(drainedCount: number)` to `recorded-transport.ts` that slices off only the first `drainedCount` entries (`buffer = buffer.slice(drainedCount)`) instead of blanket-clearing, and only resets `truncated`/`droppedCount` once the buffer is genuinely back to empty afterward — exactly the two variants the REVIEW.md Fix section offered ("remove-only-the-drained-prefix" was chosen over a generation-counter, since a plain slice is sufficient given `drainRecordedActions()`'s existing non-destructive-snapshot contract). `register-capture-session.ts`'s post-write call site (`register-capture-session.ts:205` at review time) now calls `commitDrainedActions(actions.length)` instead of `resetRecordedActions()`; `resetRecordedActions()` itself is unchanged and kept exported for test isolation only (its own doc comment updated to say so). Both `recorded-transport.ts` (131 lines) and `register-capture-session.ts` (250 lines) stay well under the 500-line ceiling.

Added regression coverage at two levels, exactly matching the REVIEW.md Fix's ask ("inject a `recordAction()` call between the drain and the write... assert the concurrently-recorded action survives"):
- `recorded-transport.test.ts`: three focused unit tests on `commitDrainedActions` directly — drained prefix removed while a concurrently-recorded action survives; full clear when nothing concurrent was recorded; `truncated`/`droppedCount` only reset once the buffer is genuinely empty afterward.
- `register-capture-session.test.ts`: one end-to-end test through the real `agda_capture_session` callback. Mocks only `writeFileAtomic` (`vi.mock` with `importOriginal`, matching this repo's existing `spawn-error-listener.test.ts` precedent) so it calls through to the real implementation by default; the one test overrides it with `mockImplementationOnce` to inject `recordAction()` for a second, "concurrently in-flight" tool call at the exact point WR-01's own trace describes (mid-write, after the drain, before the commit), then still completes a genuine atomic write. Asserts the concurrent action is absent from the artifact C1 just staged but present in the live buffer afterward (survives for the next capture) — and that the pre-drain action is the reverse.

**From-RED verification:** Before committing, I reverted the call site back to `resetRecordedActions()` (temporarily, in the worktree, keeping the new test file as-is) and reran the new concurrency test in isolation — it failed exactly as the finding predicts (`expected [ 'agda_capture_session' ] to include 'concurrent_tool_wr01_race'`, i.e. the concurrent action was silently wiped). Restored the fix byte-for-byte (`diff` confirmed identical to the pre-revert file) and reran — green. This is a genuine from-RED regression, not a vacuous pass.

**Why "requires human verification":** this is a concurrency/state-handling fix (per the verification_strategy's logic-bug limitation) — Tier 1 (re-read) and Tier 2 (`tsc --noEmit`) only confirm syntax/types, not that the injected-mock test's timing genuinely represents every real dispatch interleaving the MCP SDK can produce. The from-RED/GREEN round-trip above is strong evidence the specific race described in WR-01 is closed, but a human should confirm the `commitDrainedActions` contract (trusting the caller's own `actions.length` rather than re-deriving it) has no other caller-side pitfall before this phase proceeds to verification.

### WR-02: Stale `promoteCapture`-in-`dogfood-run.mjs` comment references survive the DEBT-02 deletion

**Status:** fixed
**Files modified:** `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/upload-run.mjs`
**Commit:** `5879fa0`
**Applied fix:** Comment-only, zero runtime impact (confirmed via `node -c` on both files plus the full existing test suites for both scripts). Rephrased both stale references — `dogfood-wrapup.mjs:614`'s "mirrors promoteCapture's best-effort, log-and-continue shape in scripts/dogfood/dogfood-run.mjs" and `upload-run.mjs:548`'s "mirrors `scripts/dogfood/dogfood-run.mjs`'s `promoteCapture` fail-open shape exactly" — to describe the fail-open shape inline without naming the DEBT-02-deleted file/call site, matching the exact treatment `install-dogfood-skill.mjs`'s own two former `promote-capture.mjs` references already got in commit `359069d` (describe the behavior, not the removed component). Confirmed via `grep -rn "promoteCapture\|promote-capture"` across `scripts/`, `src/`, `test/` that the only remaining hit is `test/integration/mcp/dogfood-proxy-passthrough.test.ts:12`, which already correctly describes `promote-capture.mjs` in the past tense ("was retired 2026-07 — DEBT-02") — not a stale reference, left untouched as out of scope for this finding.

### WR-03: `09-SECURITY.md` row T-05-02-05's Disposition value breaks the register's own declared vocabulary

**Status:** fixed
**Files modified:** `.planning/phases/09-residual-v1-0-debt-sweep/09-SECURITY.md`
**Commit:** `1a06911`
**Applied fix:** Row T-05-02-05's Disposition column held `closed (component removed 2026-07, DEBT-02)` (a Status-shaped value) instead of one of the register's declared `{mitigate, accept, transfer}` values, while its actual former disposition (`accept`) sat buried in the free-text Mitigation column. Swapped: Disposition is now `accept` (restored from the Mitigation text, matching every other row's shape), and the retirement detail moved into the Status column as `closed (component removed 2026-07, DEBT-02)`. Verified this Status-column shape has an exact precedent already in this same document (row T-07-20: `closed (local-mode scope only; remains open for Phase 8 — see Accepted Risks Log)`), so this isn't introducing a new pattern. Confirmed via a column-scan across all 40 rows that Disposition now holds only `{mitigate, accept, accept (...), n/a}` — no more Status-shaped outliers — and confirmed the row count is still exactly 40 with no duplicate IDs introduced.

## Verification

- `npx tsc -p tsconfig.json --noEmit`: clean (exit 0, no output).
- `npm run typecheck:test` (`tsc -p tsconfig.test.json --noEmit`): clean (exit 0).
- `npm run build` (`tsc -p tsconfig.json && node scripts/copy-json-assets.mjs`): clean (exit 0).
- `npx vitest run`: **1807 passed**, **0 failed**, 178 skipped (pre-existing environment-gated skips — real-Agda-binary integration tests and similar — unrelated to this fix set), across 216 test files (16 skipped files). This is 4 more tests than the pre-fix baseline implied by `09-REVIEW.md` (1 new end-to-end concurrency test in `register-capture-session.test.ts`, 3 new focused unit tests in `recorded-transport.test.ts` for WR-01).
- Diff scope confirmed via `git diff --stat` scoped to this fix pass's 3 commits: exactly 7 files touched (`src/agda/session-capture/recorded-transport.ts`, `src/tools/register-capture-session.ts`, `test/unit/agda/session-capture/recorded-transport.test.ts`, `test/unit/tools/register-capture-session.test.ts`, `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/upload-run.mjs`, `.planning/phases/09-residual-v1-0-debt-sweep/09-SECURITY.md`) — no changes to `STATE.md`/`ROADMAP.md`/`REVIEW.md`, and `git stash` was never used.
- Both modified `src/` files stay well under the 500-line ceiling (`recorded-transport.ts`: 131 lines; `register-capture-session.ts`: 250 lines).

## Process Note

This run used an isolated `git worktree` (`gsd-reviewfix/09-<pid>` branch) per the standard protocol: all three commits were made inside the worktree, then the caller's `main` branch was fast-forwarded to capture them, the worktree removed, the temp branch deleted, and the recovery sentinel cleared — all before this report was written directly into the caller's working tree (this file is intentionally left uncommitted for the orchestrator to commit separately).

---

_Fixed: 2026-07-04T21:15:45Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
