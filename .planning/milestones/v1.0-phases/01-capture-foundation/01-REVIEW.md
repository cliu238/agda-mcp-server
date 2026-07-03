---
phase: 01-capture-foundation
reviewed: 2026-07-02T04:04:49Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - scripts/promote-capture.mjs
  - scripts/verify-cold-replay.mjs
  - src/agda/session-capture/artifact-types.ts
  - src/agda/session-capture/dedup-index.ts
  - src/agda/session-capture/import-closure-hash.ts
  - src/agda/session-capture/manifest-builder.ts
  - src/agda/session-capture/oracle-substrate.ts
  - src/agda/session-capture/recorded-transport.ts
  - src/agda/session-capture/session-capture.ts
  - src/agda/session.ts
  - src/tools/register-capture-session.ts
  - src/tools/reporting-tools.ts
  - src/tools/tool-registration.ts
  - test/fixtures/e2e/mcp-tool-coverage.json
  - test/unit/agda/session-capture/dedup-index.test.ts
  - test/unit/agda/session-capture/import-closure-hash.test.ts
  - test/unit/agda/session-capture/manifest-builder.test.ts
  - test/unit/agda/session-capture/oracle-substrate.test.ts
  - test/unit/agda/session-capture/recorded-transport.test.ts
  - test/unit/tools/register-capture-session.test.ts
findings:
  critical: 3
  warning: 12
  info: 6
  total: 21
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-02T04:04:49Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Reviewed the full Phase-1 capture-foundation surface: two out-of-band scripts (`promote-capture.mjs`, `verify-cold-replay.mjs`), the `src/agda/session-capture/` module family, the `agda_capture_session` tool registration, the `recordAction` hook in `tool-registration.ts`, the `lastDispatchedLoadArgv` addition to `session.ts`, and the six new test files. `tsc --noEmit` is clean and all 31 new unit tests pass (4 skipped, gated on `RUN_AGDA_INTEGRATION`). Architectural conventions are largely respected: all files under the 500-line ceiling, IOTCM strings routed through `command-builder.ts` in `src/` (the scripts' hand-built strings are an explicitly documented, `src/`-scoped exception), single-session invariant preserved, envelopes built via `okEnvelope`/`errorEnvelope`.

However, tracing the data flows surfaced three ship-blocking defects: an arbitrary-file-write path traversal in `verify-cold-replay.mjs` (artifact JSON crosses a machine/trust boundary by design), a false-PASS failure mode in the same script (empty/partial cold responses count as success — the exact "false green" defect class this milestone exists to eliminate), and silent staged-artifact overwrite in `agda_capture_session` that destroys the previous capture's already-drained action log under an explicitly supported multi-capture-per-session flow. A cluster of warnings degrade replay-manifest fidelity (stale `mergedArgv` after `loadNoMetas`, non-epoch action timestamps, coarse fingerprints) and script robustness.

## Critical Issues

### CR-01: Arbitrary file write via path traversal in `materializeSources`

**File:** `scripts/verify-cold-replay.mjs:110-118`
**Issue:** `entry.path` comes straight from the artifact JSON and is joined into the temp dir without containment validation. A path containing `..` segments (e.g. `"path": "../../../../Users/eric/.zshrc"`) escapes `tmpDir`, and `writeFileSync(destPath, entry.content)` then writes attacker-controlled content to any location the invoking user can write. This is not a theoretical trust boundary: the script's own header states it is "meant to run on a second machine" against artifacts staged elsewhere — artifacts cross machines/users by design, so a shared or tampered capture is untrusted input. (`join(tmpDir, "/abs/path")` is safely re-rooted by `join`, but `..` traversal is not.) The read-side sibling at line 296 (`join(tmpDir, loadedRelativePath)`) has the same unvalidated-join shape, though its blast radius is only an existence check.
**Fix:**
```javascript
import { resolve, sep } from "node:path";

function materializeSources(tmpDir, inlinedFirstPartySources) {
  const root = resolve(tmpDir);
  for (const entry of inlinedFirstPartySources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string")
      continue;
    const destPath = resolve(root, entry.path);
    if (destPath !== root && !destPath.startsWith(root + sep)) continue; // reject escapes
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, entry.content, "utf8");
  }
}
```
Apply the same containment check to `materializedPath` at line 296.

### CR-02: `verify-cold-replay` produces false PASS verdicts from empty or truncated cold output

**File:** `scripts/verify-cold-replay.mjs:222-228` (also 135, 214-216)
**Issue:** `coldResponsesLookLikeSuccess` returns `true` when `responses` is empty or contains no `DisplayInfo`/`Error` entry — success is inferred from *absence of evidence*. Two concrete paths reach this state:
1. The cold `agda` exits immediately (e.g. rejects a `mergedArgv` flag, stderr-only output, empty stdout) → `close` fires (line 214) → `responses = []` → `coldSuccess = true`.
2. The 500 ms idle window (`COLD_IDLE_MS`, line 135) elapses during a typecheck pause longer than 500 ms — Agda routinely emits nothing mid-typecheck — so collection stops with a partial stream that has not yet contained the error `DisplayInfo`, again yielding `coldSuccess = true`.

When the recorded classification is success-family, either path returns **PASS with zero supporting evidence**. For the script whose sole purpose is proving cold-replay fidelity (Phase-1 success criterion 6), a false-green verdict is incorrect behavior of the worst kind for this milestone.
**Fix:** Treat an empty/inconclusive response set as its own verdict, and require positive evidence for success:
```javascript
function coldResponsesLookLikeSuccess(responses) {
  let sawSubstantiveResponse = false;
  for (const response of responses) {
    if (response?.kind === "DisplayInfo" && response?.info?.kind === "Error") return false;
    if (["DisplayInfo", "InteractionPoints", "Status"].includes(response?.kind))
      sawSubstantiveResponse = true;
  }
  return sawSubstantiveResponse ? true : null; // null => inconclusive
}
```
Map `null` (plus nonzero exit code with empty stdout) to a `FAIL`/`INCONCLUSIVE` verdict, and raise `COLD_IDLE_MS` well above realistic typecheck pauses (or track the `AllGoalsWarnings`/`InteractionPoints` terminus like `agda-transport.ts` does).

### CR-03: Repeat captures silently overwrite the prior staged artifact, destroying its drained action log

**File:** `src/tools/register-capture-session.ts:164-168` (with 140-148, 103-104)
**Issue:** The staged filename is `${fingerprint}-${recurrence}.json`. `recurrence` only advances when the out-of-band `promote-capture.mjs` is run, and the fingerprint is nearly constant for a session: `fingerprintBugReport` hashes only `kind` (always `"new-bug"`), `affectedTool` (constant), `classification`, `observed` (= `note ?? "session capture"`), `expected` (`""`), and `reproduction` (`[]`) — `serverVersion` is accepted but not part of the hashed identity (`src/reporting/bug-report.ts:76-90`). So two captures in one session with the same classification and no note produce the **same path**, and `writeFileAtomic`'s rename clobbers the first artifact. Because each capture drains **and resets** the ring buffer (lines 103-104), the first capture's recorded actions exist nowhere else — they are permanently lost. Multi-capture-per-session is an explicitly supported flow (the drain-then-reset comment: "two captures in the same session never double-report the same actions"), and the milestone's core value is "every real proof session **reliably** converts" into an artifact. This is silent data loss under normal use. (Confirmed empirically: both tests in `register-capture-session.test.ts` write the same `1beca72b9bd65510-1.json`, the second overwriting the first.)
**Fix:** Make the staged filename collision-proof, e.g.:
```typescript
const stagedPath = join(
  captureDir,
  `${dedup.fingerprint}-${dedup.recurrence}-${Date.now()}.json`,
);
```
or check `existsSync(stagedPath)` and append an incrementing suffix. (Also see WR-02 for the underlying fingerprint coarseness.)

## Warnings

### WR-01: Ring buffer is reset before the artifact is durably staged

**File:** `src/tools/register-capture-session.ts:103-104`
**Issue:** `resetRecordedActions()` runs before `buildOracleSubstrate` (which shells out to git and can send a live Agda command) and before `mkdirSync`/`writeFileAtomic`. If any of those throw (disk full, permission error, unexpected substrate failure), the catch block returns an error envelope — but the drained actions were already erased and are unrecoverable. The whole point of the recorder (D-05) is that the log survives until safely captured.
**Fix:** Move `resetRecordedActions()` to after the successful `writeFileAtomic` call; on failure the buffer stays intact for a retry.

### WR-02: Fingerprint granularity collapses unrelated defects into one dedup identity

**File:** `src/tools/register-capture-session.ts:140-148`
**Issue:** The fingerprint input carries no session-specific signal: `classification` (a handful of values like `"type-error"`/`"unknown"`), optional free-text `note`, and constants. Every no-note capture with classification `"type-error"` — across different files, different projects, different bugs — maps to a single global fingerprint. CAP-02 routing then labels a brand-new, unrelated defect as an `"update"` recurrence of an old one, and (per CR-03) makes their staged paths collide. Dedup routing that cannot distinguish two different bugs does not fulfill D-03's "first-time report vs recurrence" contract.
**Fix:** Fold discriminating session state into the fingerprint input, e.g. `agdaCommandFamily: manifest.importClosureHash ?? session.currentFile ?? ""`, or pass a digest of the last error diagnostics via the `diagnostics` field that `fingerprintBugReport` already hashes.

### WR-03: Load-family regex also matches `agda_load_highlighting_info`

**File:** `scripts/verify-cold-replay.mjs:65-69`
**Issue:** `/^agda_(load|typecheck)/` matches any tool name *starting with* `agda_load`, including `agda_load_highlighting_info` (registered with a `file` arg and an envelope whose default classification is `"ok"` — `src/tools/display.ts:36-46`). If the last such recorded action is a highlighting call, `findLoadClassification` returns its classification (always success) and its file — the script then replays the wrong file against the wrong recorded verdict. The doc comment intends only `agda_load` / `agda_typecheck` / `agda_load_no_metas`.
**Fix:**
```javascript
const loadFamily = new Set(["agda_load", "agda_load_no_metas", "agda_typecheck"]);
...
if (typeof action?.tool !== "string" || !loadFamily.has(action.tool)) continue;
```

### WR-04: `classificationIsSuccess` misclassifies several real failure classifications as success

**File:** `scripts/verify-cold-replay.mjs:87-89`
**Issue:** `!/error|fail/i.test(classification)` treats `"not-found"`, `"invalid-command-line-options"`, `"invalid-profile-options"` (`src/session/load-tool-shared.ts:52,148,192`), and `"load-incomplete-no-terminus"` (`src/agda/session-load-helpers.ts:80`) as success-family — none contain "error"/"fail". Example: a load recorded as rejected for bad flags counts as recorded-success; the cold replay then errors and the script reports a spurious replay-fidelity FAIL (compounding CR-02's inverse problem). The substring heuristic is documented as intentional, but it inverts the verdict for known classification strings in this codebase.
**Fix:** Use an explicit success allowlist: `["ok", "ok-complete", "ok-with-holes"].includes(classification)` (extend as classifications are added), treating everything else as failure-family.

### WR-05: Self-execution guard silently no-ops (exit 0) when the checkout path contains spaces or non-ASCII

**File:** `scripts/promote-capture.mjs:121-124`; `scripts/verify-cold-replay.mjs:368-371`
**Issue:** `new URL(import.meta.url).pathname` percent-encodes spaces/unicode (`/Users/e/My%20Projects/...`) while `process.argv[1]` does not, so the equality check fails and `scriptMain()` never runs: the script prints nothing and exits 0. For `verify-cold-replay.mjs` — explicitly meant to run on arbitrary second machines — a silent exit-0 reads as a passing verification to any wrapper checking the exit code. Symlinked paths can mismatch the same way.
**Fix:**
```javascript
import { fileURLToPath } from "node:url";
const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] === modulePath) { ... }
```

### WR-06: No `error` handler on `proc.stdin` — spawn failure can crash the script instead of returning FAIL

**File:** `scripts/verify-cold-replay.mjs:218`
**Issue:** `proc.stdin.write(...)` is issued immediately after `spawn`. If the binary cannot spawn (no `agda` on PATH after the pinned-path fallback), Node destroys the stdio pipes and the buffered write errors asynchronously on the stdin stream. With no `error` listener on `proc.stdin`, that is an unhandled `'error'` event — an uncaught exception that crashes the process, bypassing both the `proc.on("error")` → `rejectPromise` path and `scriptMain`'s try/catch (the crash is async, outside the awaited promise chain in some orderings).
**Fix:** `proc.stdin.on("error", () => {})` before writing, or defer the write to the `spawn` event.

### WR-07: Unreadable-but-stat-able closure files throw out of the manifest builder, failing the whole capture

**File:** `src/agda/session-capture/import-closure-hash.ts:99, 149`
**Issue:** Both `hashImportClosure` and `inlineFirstPartySources` guard `statSync` in try/catch but call `readFileSync` unguarded. `stat` succeeds on a file with mode `000` (or one deleted/permission-flipped between stat and read), so `readFileSync` throws `EACCES`/`ENOENT`, which propagates through `buildReplayManifest` and fails the entire `agda_capture_session` call. This contradicts the code's own comment at line 101 ("Oversized (**or unreadable**) — hash a placeholder") — the stat check cannot detect unreadability — and the capture-must-never-fail posture (D-01/D-02).
**Fix:** Wrap each `readFileSync` in try/catch: in `hashImportClosure`, fall back to `hash.update(oversizedPlaceholder(relPath))`; in `inlineFirstPartySources`, `skipped.push(relPath); continue;`.

### WR-08: `mergedArgv` in the replay manifest is stale after `loadNoMetas()` and after process death

**File:** `src/agda/session.ts:296-299, 314-316`; `src/agda/session-capture/manifest-builder.ts:154-157`
**Issue:** `lastDispatchedLoadArgv` is written only in `load()`. `loadNoMetas()` never touches it, and no reset path clears it (`invalidatePriorLoadState` in `session-load-helpers.ts:89-96` resets every other load-history field; `resetFileBoundStateIfProcDied` and destroy also skip it). Consequences for the "server-stamped, replay-faithful" manifest (CAP-01/D-04): after `agda_typecheck` (strict `Cmd_load_no_metas`, dispatched with *no* flag list — `session-load-impl.ts:198-200`), the manifest reports the flags of an earlier, unrelated `load()`; after process death resets `currentFile` (so closure fields go null), `mergedArgv` still shows argv from the dead session. `verify-cold-replay.mjs` then replays with the wrong flags.
**Fix:** Set `this.lastDispatchedLoadArgv = []` in `loadNoMetas()` (or record its actual empty flag list), and clear the field in `invalidatePriorLoadState` alongside the other load-history fields.

### WR-09: Recorded action `timestamp` is `performance.now()`, not epoch time

**File:** `src/tools/tool-registration.ts:173, 207`
**Issue:** `recordAction({ ..., timestamp: startMs, ... })` stores `performance.now()` — milliseconds since *process start*, meaningless outside the process. It cannot be correlated with the artifact's ISO `capturedAt`, across server restarts, or across machines during replay/triage. The recorder's own docs and tests assume wall-clock (`recorded-transport.ts:45` "no Date.now() call [when disabled]"; `recorded-transport.test.ts:57` uses `Date.now()`).
**Fix:** `timestamp: Date.now()` at the record site (relative ordering is preserved either way; only the epoch anchor is gained).

### WR-10: Capture is not observation-only — it can block behind a wedged queue and respawn a dead Agda process

**File:** `src/agda/session-capture/oracle-substrate.ts:100-114`
**Issue:** `buildOracleSubstrate` sends a live `Cmd_goal_type` through `session.sendCommand`, which (a) enqueues on `commandQueue` *behind* any in-flight stuck command — so capturing a wedged session (the flagship D-01 scenario: "stuck, failed, or a suspicious green") blocks for up to the stuck command's remaining timeout before the capture returns; and (b) routes through `ensureProcess`, which **respawns** a dead-but-not-yet-reset Agda process as a side effect. A tool documented as "does not judge... only records" (state-agnostic, D-01) mutates process state and is held hostage by the defect it is trying to record. The try/catch prevents failure but not the blocking or the respawn.
**Fix:** Gate the live goal query on session health — e.g. skip unless `session.getPhase() === "ready"` (or `isProcLive(session.proc)` and not `collecting`) — and/or pass a short dedicated `timeoutMs` to `sendCommand` so capture latency is bounded.

### WR-11: `promote-capture` write location is controlled by the artifact being promoted

**File:** `scripts/promote-capture.mjs:76-82`
**Issue:** The index path derives from `artifact.manifest.repoRoot` whenever that directory exists locally. A foreign or tampered artifact with `"repoRoot": "/Users/eric"` silently writes `/Users/eric/.agda-mcp/captures/index.json` — outside the operator's checkout, with no confirmation. The header documents same-machine intent, but nothing *enforces* it, and the failure is silent (the success message prints whatever path was used, but the operator has already been redirected). Bounded blast radius (fixed relative subpath, JSON content), yet it is still an untrusted-input-controlled write location.
**Fix:** Default to `process.cwd()` and only honor `manifest.repoRoot` when it equals (or contains) `process.cwd()`; support an explicit `--repo-root <dir>` flag for anything else.

### WR-12: Tests write into the persistent shared fixture root and depend on its on-disk state

**File:** `test/unit/tools/register-capture-session.test.ts:66, 72, 99-100`
**Issue:** Both tests use `TEST_FIXTURE_PROJECT_ROOT` (the checked-in `test/fixtures/agda/`) as `repoRoot`, staging real artifacts into `test/fixtures/agda/.agda-mcp/captures/` with no cleanup (confirmed: `1beca72b9bd65510-1.json` persists after a run). Worse, the first test's assertions `data.kind === "new-bug"` / `data.recurrence === 1` are only true while no `index.json` exists under the fixture root — any manual `promote-capture.mjs` run against a fixture-rooted artifact (whose `manifest.repoRoot` *is* the fixture root) permanently breaks the suite with a confusing `"update"`/`recurrence 2` failure. Test correctness is coupled to mutable state outside the test's control.
**Fix:** Use `mkdtempSync(join(tmpdir(), ...))` as the capture `repoRoot` (the session can keep the fixture root), or `rmSync(join(TEST_FIXTURE_PROJECT_ROOT, ".agda-mcp"), { recursive: true, force: true })` in `beforeEach`/`afterEach`.

## Info

### IN-01: `readDedupIndex` accepts a JSON array where the promote script rejects it

**File:** `src/agda/session-capture/dedup-index.ts:38-44`
**Issue:** The guard checks `!raw || typeof raw !== "object"` but not `Array.isArray(raw)` (unlike `promote-capture.mjs:35`). An array-rooted `index.json` containing `{recurrence, kind}`-shaped elements yields bogus numeric-string "fingerprints" (`"0"`, `"1"`) instead of downgrading to empty.
**Fix:** Add `|| Array.isArray(raw)` to the early-return condition for parity with the write side.

### IN-02: `_repoRoot` underscore-prefix naming on a parameter that is now used

**File:** `src/tools/reporting-tools.ts:30, 36-39`
**Issue:** The leading underscore conventionally marks an unused parameter, but it is passed to four registrations including the new `registerCaptureSession`.
**Fix:** Rename to `repoRoot`.

### IN-03: Capture error path returns diagnostics without a `nextAction` recovery hint

**File:** `src/tools/register-capture-session.ts:192-203`
**Issue:** The catch returns `errorEnvelope` with no explicit diagnostics, so the default `errorDiagnostic(summary)` carries no `nextAction` — the project convention says error diagnostics SHOULD always set one (self-healing hint pattern). The catch also duplicates `registerStructuredTool`'s built-in error-to-envelope translation.
**Fix:** Add `diagnostics: [errorDiagnostic(message, "capture-failed", "Check disk space/permissions for <repoRoot>/.agda-mcp/captures and retry agda_capture_session.")]`, or drop the catch and throw a `ToolInvocationError`.

### IN-04: Cold-replay temp directories are never cleaned up

**File:** `scripts/verify-cold-replay.mjs:284, 298-303`
**Issue:** `mkdtempSync` dirs (containing every inlined source) accumulate one per invocation, including on the early SKIP return right after materialization.
**Fix:** Wrap the post-`mkdtempSync` body in try/finally with `rmSync(tmpDir, { recursive: true, force: true })`, or at least log the leaked path.

### IN-05: `resolveAgdaBinary` tests absoluteness with `startsWith("/")`

**File:** `scripts/verify-cold-replay.mjs:96-105`
**Issue:** Windows-style pinned paths never match, silently falling back to `"agda"` on PATH; `isAbsolute` is already imported in this file.
**Fix:** `if (typeof pinnedPath === "string" && isAbsolute(pinnedPath) && existsSync(pinnedPath))`.

### IN-06: Tool description claims "writes nothing into the repo tree" but staging is in-tree

**File:** `src/tools/register-capture-session.ts:64, 162`
**Issue:** `captureDir` is `join(repoRoot, ".agda-mcp", "captures")` — inside the repo tree, merely gitignored. The description's "staged out-of-repo" phrasing misleads a calling agent about where artifacts land (and about what "emit-only" guarantees).
**Fix:** Reword to "staged under a gitignored `.agda-mcp/captures/` directory inside the project root (never committed)".

---

_Reviewed: 2026-07-02T04:04:49Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
