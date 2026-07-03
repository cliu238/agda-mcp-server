---
phase: 05-dogfooding-orchestration-fuel
reviewed: 2026-07-03T02:11:14Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .agents/skills/agda-dogfooding/SKILL.md
  - scripts/data/fuel-corpora.json
  - scripts/data/oracle-policy/agda-stdlib.json
  - scripts/data/oracle-policy/autoformalizing-hopf.json
  - scripts/data/oracle-policy/codex-homotopy-group.json
  - scripts/dogfood/dogfood-run.mjs
  - scripts/dogfood/dogfood-wrapup.mjs
  - scripts/dogfood/flake-classify.mjs
  - scripts/dogfood/install-dogfood-skill.mjs
  - scripts/dogfood/task-manifest.mjs
  - scripts/dogfood/transcript-writer.mjs
  - test/fixtures/fuel-corpora.ts
  - test/fixtures/task-manifest-schema.ts
  - test/integration/mcp/dogfood-flake-classify-live.test.ts
  - test/integration/mcp/dogfood-proxy-passthrough.test.ts
  - test/unit/fixtures/fuel-corpora.test.ts
  - test/unit/tools/dogfood-flake-classify.test.ts
  - test/unit/tools/dogfood-install-skill.test.ts
  - test/unit/tools/dogfood-run-spawn-options.test.ts
  - test/unit/tools/dogfood-task-manifest.test.ts
  - test/unit/tools/dogfood-transcript-writer.test.ts
  - test/unit/tools/dogfood-wrapup-filing.test.ts
findings:
  critical: 2
  warning: 8
  info: 4
  total: 14
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-03T02:11:14Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the Phase 5 dogfooding-orchestration scaffold: the transparent recording proxy (`dogfood-run.mjs` + `transcript-writer.mjs`), the D-03 manifest hard gate (`task-manifest.mjs`), the N-rerun flake gate (`flake-classify.mjs`), the auto-chained wrap-up pipeline (`dogfood-wrapup.mjs`), the skill installer, the pinned fuel-corpora/oracle-policy data, and their unit/integration tests.

Cross-referenced contracts verified as correct: `buildQueueEntryFromVerdict` output conforms to `fixQueueEntrySchema` (nullable `triageClass`/`matrixEntryId`, positive-int `recurrence`); `verdict.fingerprint` exists at top level per `composeVerdict`; `upsertQueueEntry(entry, path)` signature and the `test/fixtures/fix-queue.json` default path match `scripts/queue/intake.mjs`'s own convention; the capture-session `data` shape (`stagedPath`/`fingerprint`/`kind`/`recurrence`) matches what `transcript-writer.mjs` reads; the SDK's `StdioClientTransport.close()` waits for process close before returning, so the integration tests' post-close file assertions are not inherently racy. Data facts verified: the agda-stdlib `pinnedRef` `039e1f4a…` is the peeled commit of tag `v2.1.1` (confirmed via `git ls-remote`), matching CI's `agda-stdlib-version: "2.1.1"`; the codex-homotopy-group/autoformalizing-hopf policies mirror `agda-unimath.json` verbatim as their `$comment`s claim; `.claude/` and `.agda-mcp/` gitignore claims and the `package.json` `"files"` claim in SKILL.md are accurate.

However, the flake gate — the component whose stated purpose is "genuine signals are never silently dropped" — has two confirmed paths (reproduced by direct execution during this review) that silently divert a confirmed deterministic ORCL-01 false-green candidate into the flaky side channel: an unvalidated rerun count (CR-01) and a wrong-action replay (CR-02). Both must be fixed before real dogfood runs depend on this pipeline. All 40 in-scope unit tests pass; the defects live in edge paths the tests do not cover.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Unvalidated `--rerun-n` / `AGDA_MCP_DOGFOOD_RERUN_N` makes `classifyFlakiness` report "flaky" with zero replays, silently unfiling every deterministic defect

**File:** `scripts/dogfood/dogfood-wrapup.mjs:209-213` (trigger), `scripts/dogfood/flake-classify.mjs:126,141-145` (root cause)
**Issue:** `parseWrapupArgv` computes `rerunN` as `Number(argv[rerunNFlagIndex + 1])` or `Number(process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? 3)` with no validation. A typo'd env var (`AGDA_MCP_DOGFOOD_RERUN_N=abc`), a `--rerun-n` with a missing/non-numeric value, or an explicit `--rerun-n 0` produces `NaN`/`0`. `wrapUpCapture`'s `config.n ?? 3` does not catch `NaN` (it is not nullish), so it reaches `classifyFlakiness`, whose `for (let i = 0; i < n; i++)` loop never executes. The result — empirically confirmed during this review — is `{ classification: "flaky", observedClassifications: [] }` with zero harness calls, because `allAgree` requires `length > 0`. In `wrapUpCapture` branch (2), "flaky" routes the capture to the side channel and it is **never filed**: every confirmed deterministic ORCL-01 server-false-green candidate in the run is silently mislabeled `"timing/nondeterministic"` on the strength of an empty observation list. This directly defeats the module's own core guarantee ("never silently dropped … never filed as a confirmed defect" applies to genuinely flaky captures, not to un-replayed ones) and ROADMAP criterion 4's N-rerun gate.
**Fix:**
```js
// dogfood-wrapup.mjs — parseWrapupArgv
const rerunNRaw = rerunNFlagIndex !== -1
  ? argv[rerunNFlagIndex + 1]
  : (process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? "3");
const rerunN = Number(rerunNRaw);
if (!Number.isInteger(rerunN) || rerunN < 1) {
  throw new Error(`--rerun-n / AGDA_MCP_DOGFOOD_RERUN_N must be a positive integer, got "${rerunNRaw}"`);
}
```
```js
// flake-classify.mjs — classifyFlakiness, before the loop
if (!Number.isInteger(n) || n < 1) {
  throw new Error(`classifyFlakiness: n must be a positive integer, got ${n}`);
}
```
Defense-in-depth at both layers: the CLI rejects bad input loudly; the library refuses to compute a verdict from zero observations.

#### CR-02: `findLastLoadFamilyAction` replays a different action than the one `findWarmLoadTuple` gated on, misclassifying real candidates as flaky

**File:** `scripts/dogfood/flake-classify.mjs:57-66,120`
**Issue:** The module comment claims `findLastLoadFamilyAction` is "a small, DELIBERATE, additive duplicate of `findWarmLoadTuple`'s own internal scan-for-last-match loop", but it is not a faithful duplicate: `findWarmLoadTuple` (`scripts/oracle/orcl-01-differential.mjs:269-295`) additionally requires `action.normalizedResponse.data` to carry a string `file` and string `classification`, and *continues scanning past* entries that don't. `findLastLoadFamilyAction` matches on tool name alone. `src/tools/tool-registration.ts:198-213` records **every** tool call — including failures, whose `makeTextToolErrorResult` envelope has a `data` payload without `file`/`classification` — so a session whose last load-family action failed (invalid path, process death, etc.) produces exactly the divergent shape. Reproduced during this review: with `recordedActions = [valid agda_load(First.agda), failed agda_typecheck(Second.agda)]`, the applicability gate (and ORCL-01's candidate) keys off `First.agda`, while the flake gate replays `agda_typecheck(Second.agda)`. This is a realistic capture shape — SKILL.md section 3 tells agents to capture precisely when *stuck after repeated failing attempts*, so trailing failed load-family calls are the norm for stuck captures. The replayed wrong action then yields error envelopes (no `data.classification` → `null` observations) N times, and per CR-01's sibling logic that classifies as "flaky": the genuine, ORCL-01-confirmed deterministic candidate is diverted to the side channel and never filed.
**Fix:**
```js
function findLastLoadFamilyAction(artifact) {
  const actions = Array.isArray(artifact?.recordedActions) ? artifact.recordedActions : [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (typeof action?.tool !== "string" || !LOAD_FAMILY_TOOL_PATTERN.test(action.tool)) continue;
    const data = action?.normalizedResponse?.data;
    if (!data || typeof data.file !== "string" || typeof data.classification !== "string") continue; // mirror findWarmLoadTuple
    return action;
  }
  return null;
}
```
This makes the scan select the same action `findWarmLoadTuple` matched, restoring the "guaranteed non-null AND same action" invariant the call site's comment assumes.

### Warnings

#### WR-01: `classifyFlakiness` labels consistently-failing replays "flaky"/"timing-nondeterministic"

**File:** `scripts/dogfood/flake-classify.mjs:134,141-145`
**Issue:** `observedClassifications` reads `result?.structuredContent?.data?.classification`. Error envelopes carry `classification` at the envelope level (`structuredContent.classification`), not in `data`, so every failed replay pushes `null`. When all N replays fail *identically* (broken replay environment, an absolute recorded `file` path that cannot resolve inside the materialized temp dir, corpus dependencies not inlinable), `allAgree`'s `c !== null` clause forces `"flaky"` — a perfectly deterministic failure gets persisted to the side channel tagged `"timing/nondeterministic"` with `observedClassifications: [null, null, null]` (reproduced during this review). ORCL-01 distinguishes "cannot judge" (`inconclusive`) from "diverges"; the flake gate should too.
**Fix:** Return a distinct outcome (e.g. `{ classification: "replay-inconclusive", observedClassifications }`) when every observation is `null`, and have `wrapUpCapture` route it separately (still not filed, but never mislabeled as timing nondeterminism — e.g. logged with a `replay-failed` tag). Optionally also read the envelope-level `structuredContent.classification` as a fallback so consistently-erroring replays compare as the deterministic errors they are.

#### WR-02: Proxy re-promotes the *previous* capture when a later `agda_capture_session` call fails

**File:** `scripts/dogfood/dogfood-run.mjs:155-171`, `scripts/dogfood/transcript-writer.mjs:144-157`
**Issue:** `recordToClientLine` sets `isCaptureSession: true` for any correlated `agda_capture_session` response, but only pushes onto `stagedCaptures` when `data.stagedPath` is a string. The failure path of the capture tool (`src/tools/register-capture-session.ts:220-231`) returns an error envelope with `data: {}` — so after one successful capture, a subsequent *failed* capture makes `dogfood-run.mjs`'s `recorder.stagedCaptures.at(-1)` resolve to the previous capture and re-run `promoteCapture` on it. Today this is benign only by accident: `promoteCapture` overwrites `index[fingerprint]` with the artifact's own stored values, so re-promotion is idempotent. The plumbing is still wrong — the moment promotion semantics gain any non-idempotent behavior (recurrence bump, timestamping, event append), this silently double-counts, and the failed capture itself gets no stderr signal at the proxy layer.
**Fix:** Have `recordToClientLine` return the capture it actually staged: `return { toolName, elapsedMs, isCaptureSession, stagedCapture: pushed ?? null }`, and in `dogfood-run.mjs` promote `event.stagedCapture` instead of inferring via `at(-1)`.

#### WR-03: Finalize races the child stdout drain (`exit` vs `close`) and `process.exit` can drop queued output

**File:** `scripts/dogfood/dogfood-run.mjs:196-210,184-186`
**Issue:** `finalize()` is triggered by `child.on("exit")`, which fires when the process terminates — *before* the child's stdout pipe is necessarily drained (`close` is the event that guarantees all stdio has ended). The report is snapshotted (`getReport` + synchronous `JSON.stringify` inside `writeRunReport`'s argument evaluation) at finalize start, so any server lines still buffered in the pipe — including a final `agda_capture_session` response — are recorded to the transcript but *omitted from `run-report.json`'s `stagedCaptures`*, and `dogfood-wrapup.mjs` (which reads only the report) never judges them. Additionally, `process.exit(...)` does not flush pending asynchronous `process.stdout` pipe writes, so tail lines being forwarded to the agent can be truncated.
**Fix:** Trigger finalize from `child.on("close", ...)` (keep the `fromAgent` close trigger), and snapshot the report only after `fromServer` has emitted `close`. Prefer setting `process.exitCode` and letting the process drain naturally where possible, falling back to `process.exit` only after `process.stdout` write callbacks complete.

#### WR-04: Unhandled stream/process error events and transcript-write failures crash the proxy mid-session

**File:** `scripts/dogfood/dogfood-run.mjs:131-147`, `scripts/dogfood/transcript-writer.mjs:64-66,91,113`
**Issue:** Three uncaught-exception paths can kill a live proving session: (a) no `child.on("error")` handler — a spawn failure surfaces as an unhandled `'error'` event; (b) `child.stdin.write` in the `fromAgent` line handler has no stdin `'error'` listener — an agent line arriving after the child dies (the window between child exit and `process.exit` during finalize's `await`) raises an uncaught `EPIPE`/write-after-end; (c) `appendTranscriptLine`'s `appendFileSync` throws (`ENOSPC`, runs dir removed mid-run) and propagates out of the readline `'line'` handler as an uncaught exception. The module's own comments promise malformed wire data "never crashes the proxy," but recording I/O failure does — taking down the agent's entire session with it, which contradicts the transparent-tee design goal.
**Fix:** Add `child.on("error", ...)` routing into `finalize()`; add a no-op-with-stderr `'error'` listener on `child.stdin` (or guard writes with `child.stdin.writable`); wrap `appendTranscriptLine` in try/catch that warns once on stderr and keeps forwarding.

#### WR-05: `dogfood-wrapup` has no per-capture error isolation — one bad capture aborts the entire wrap-up

**File:** `scripts/dogfood/dogfood-wrapup.mjs:252-260`
**Issue:** In `scriptMain`'s loop, `readFileSync(staged.stagedPath)`/`JSON.parse` throws on a deleted/corrupt staged file (or an absent `stagedPath` field), and any `wrapUpCapture` rejection — oracle cold-spawn failure, or `classifyFlakiness`'s `createMcpHarness` failing because `dist/index.js` was not rebuilt (exactly the setup mistake SKILL.md warns about) — propagates out of `scriptMain` as an unhandled rejection: no `wrapup-report.json` is written, all remaining captures go unjudged, and the operator gets a raw stack instead of a per-capture verdict. For a pipeline whose value is "every capture reliably judged," a single bad artifact should not zero out the run.
**Fix:** Wrap each iteration in try/catch, push `{ stagedPath: staged.stagedPath, filed: false, classification: "error", error: message }` into `results`, continue, and reflect an `errors` count in the summary/exit code.

#### WR-06: Queue-entry summary precedence contradicts the filing precedence — co-occurring ORCL-02 cheat findings are dropped from the filed summary

**File:** `scripts/dogfood/dogfood-wrapup.mjs:77-90,101`
**Issue:** `wrapUpCapture` deliberately checks `orcl02.kind === "cheat-flagged"` FIRST (the documented blocker fix), but `buildQueueEntryFromVerdict` checks `orcl01.kind === "server-false-green-candidate"` first when composing the summary. In the co-occurrence case the entry is filed *because of* the confirmed ORCL-02 cheat (flake gate skipped), yet its summary reports an ORCL-01 candidate that never survived the N-rerun gate on this path, and the cheat findings (`finding.kind` list) are omitted entirely — misleading exactly the human triage point (`new -> triaged`) this phase relies on. Relatedly, `affectedTool` uses `recordedActions.at(-1)?.tool`, which can be an unrelated trailing call rather than the flagged load-family action.
**Fix:** Mirror the filing precedence in the summary (check `orcl02.kind === "cheat-flagged"` first), or concatenate both signals when both are present; derive `affectedTool` from the last *load-family* action when one exists.

#### WR-07: `classifyFlakiness` leaks materialized temp dirs when harness creation fails, and `close()` failure skips cleanup

**File:** `scripts/dogfood/flake-classify.mjs:127-138`
**Issue:** `materialize(artifact)` runs *before* the `try`; if `createHarness(...)` rejects (server spawn failure — e.g. missing build), the `finally` is never entered and `materialized.cleanup()` never runs: the per-iteration temp copy of the captured sources leaks, and the error propagates up to abort the whole wrap-up (compounding WR-05). Inside the `finally`, `await harness.close()` preceding `materialized.cleanup()` means a close rejection also skips cleanup.
**Fix:**
```js
const materialized = await materialize(artifact);
try {
  const harness = await createHarness({ serverRepoRoot: SERVER_REPO_ROOT, projectRoot: materialized.tmpDir });
  try {
    const result = await harness.callTool(action.tool, action.args);
    observedClassifications.push(result?.structuredContent?.data?.classification ?? null);
  } finally {
    await harness.close().catch(() => {});
  }
} finally {
  materialized.cleanup();
}
```

#### WR-08: `recordToClientLine` misattributes server-initiated requests that share a pending request id

**File:** `scripts/dogfood/transcript-writer.mjs:122-134`
**Issue:** Any to-client line whose `id` matches a pending `tools/call` is consumed as that call's response — but JSON-RPC ids are per-direction namespaces, and a server-initiated *request* (has both `method` and `id`; e.g. future sampling/roots/elicitation or SDK pings) can numerically collide with a pending agent request id. The pending entry is then deleted, the tally records a bogus elapsed time, and when the real response arrives it is treated as unmatched — meaning a real `agda_capture_session` response's staged capture would be silently missed by both auto-persist and the run report. Latent today (grep confirms `src/` sends no server-to-client requests), but the proxy is written as a generic wire observer and the fix is one line.
**Fix:** Before the pending lookup: `if (parsed.method !== undefined) return undefined;` (a line with a `method` field is a request/notification, never a response).

### Info

#### IN-01: Argv parsing accepts flag tokens as values and an unsanitized run id

**File:** `scripts/dogfood/dogfood-wrapup.mjs:206-221`, `scripts/dogfood/dogfood-run.mjs:80-106`
**Issue:** `parseWrapupArgv` takes `argv[0]` as `runId` unconditionally (running `dogfood-wrapup.mjs --rerun-n 5` yields `runId === "--rerun-n"`); both parsers accept a following flag as a value (`--manifest --corpus-root /x`); and `runId` is joined into the runs root unvalidated, so `--run-id ../../x` writes run artifacts outside `.agda-mcp/runs/` (local dev CLI, so operator-only impact).
**Fix:** Reject a `runId`/flag value starting with `--`; optionally reject path separators in `--run-id`.

#### IN-02: Skill installer can create a dangling symlink and has no CLI error handling

**File:** `scripts/dogfood/install-dogfood-skill.mjs:72-83,106-118`
**Issue:** `installDogfoodSkill` never checks that the canonical `.agents/skills/agda-dogfooding` directory exists before `symlinkSync`, so a partial checkout gets a broken `.claude/skills/` link reported as `"created"`; `scriptMain` lets `mkdirSync`/`symlinkSync` failures escape as raw stacks.
**Fix:** `if (lstatOrNull(canonical) === null) throw new Error(...)` before linking; wrap `scriptMain` body in try/catch with a one-line stderr message and `process.exitCode = 1`.

#### IN-03: Proxy exits 0 when the child server dies from a signal

**File:** `scripts/dogfood/dogfood-run.mjs:201`
**Issue:** `process.exit(child.exitCode ?? 0)` — a signal-killed child (SIGSEGV/OOM SIGKILL) leaves `exitCode === null`, so the proxy reports a clean exit and masks the abnormal server death from the launching harness. (Correct for the agent-disconnect path where the proxy itself kills the child; wrong for a spontaneous crash.)
**Fix:** `process.exit(child.exitCode ?? (child.signalCode && !finalizedByAgentClose ? 1 : 0))` — distinguish proxy-initiated kill from spontaneous signal death.

#### IN-04: `git check-ignore` test cannot distinguish "not ignored" from "git failed"

**File:** `test/unit/tools/dogfood-install-skill.test.ts:60-71`
**Issue:** The "SKILL.md is not gitignored" test asserts only that `execFileSync` throws — but `git check-ignore` exits 1 for "not ignored" and 128 for errors (not a repo, bad path); both throw, so a broken invocation passes the test spuriously.
**Fix:** Catch the error and assert `(err as { status?: number }).status === 1`.

---

_Reviewed: 2026-07-03T02:11:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
