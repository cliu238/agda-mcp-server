---
phase: 05-dogfooding-orchestration-fuel
plan: 02
subsystem: dogfooding-proxy
tags: [mcp-proxy, transcript-recording, capture-auto-persist, proc-01]
dependency-graph:
  requires: ["05-01"]
  provides: ["scripts/dogfood/dogfood-run.mjs", "scripts/dogfood/transcript-writer.mjs"]
  affects: ["05-03", "05-04"]
tech-stack:
  added: []
  patterns:
    - "node:readline line-tee between agent stdin/stdout and a spawned child (mirrors cold-agda-session.mjs's NDJSON buffering idiom)"
    - "buildHarnessServerParameters reused unchanged for the child dist/index.js spawn (never a second spawn-options builder)"
    - "appendFileSync for the append-only transcript, writeFileAtomic for the single-shot run report (matches run-oracle.mjs precedent)"
key-files:
  created:
    - test/integration/mcp/dogfood-proxy-passthrough.test.ts
    - scripts/dogfood/transcript-writer.mjs
    - test/unit/tools/dogfood-transcript-writer.test.ts
    - scripts/dogfood/dogfood-run.mjs
    - test/unit/tools/dogfood-run-spawn-options.test.ts
  modified: []
decisions:
  - "Each of the 4 integration-test behaviors opens and closes its OWN proxy connection (rather than sharing one connection's response across test cases) — keeps tests independent of execution order while still proving each behavior end to end."
  - "finalize() (run-report write + child kill + process.exit) wrapped in try/catch even though the plan's action text didn't explicitly require it — an unhandled rejection in an async event handler risks a hard crash under Node's default unhandled-rejection mode (Rule 2: missing error handling)."
metrics:
  duration: "~45 minutes"
  completed: 2026-07-03
---

# Phase 05 Plan 02: Transparent Recording Proxy Summary

Built `scripts/dogfood/dogfood-run.mjs`, a line-buffered stdio tee that transparently wraps one spawned `dist/index.js` server process, unconditionally sets `AGDA_MCP_CAPTURE=1`, and auto-persists every observed `agda_capture_session` result via the existing `promoteCapture()` — turning "an agent might remember to file a bug" into "every dogfood session leaves a durable record."

## What Was Built

**Task 1 (RED):** `test/integration/mcp/dogfood-proxy-passthrough.test.ts` — a 4-behavior end-to-end test connecting a real MCP `Client`/`StdioClientTransport` through the (not-yet-existing) proxy script. Confirmed RED: the connection failed with `ERR_MODULE_NOT_FOUND` naming the missing `dogfood-run.mjs`, surfaced by the SDK as "Connection closed" — the expected failure mode, not an unrelated test-authoring bug.

**Task 2:** `scripts/dogfood/transcript-writer.mjs` — `createRunRecorder({ transcriptPath })` correlates JSON-RPC `tools/call` request/response pairs by `id` (a `pendingRequests` Map), tallies per-tool call counts/durations, and detects + stages every `agda_capture_session` result (matching on `result.structuredContent.data.stagedPath`). `resolveRunsRoot()` honors `AGDA_MCP_DOGFOOD_RUNS_ROOT`, defaulting to `<repo>/.agda-mcp/runs` (D-05, gitignored). `renderRunReportMarkdown`/`writeRunReport` produce the JSON + Markdown run report. 6/6 unit tests pass in `test/unit/tools/dogfood-transcript-writer.test.ts`.

**Task 3 (GREEN):** `scripts/dogfood/dogfood-run.mjs` — `buildDogfoodChildOptions` reuses `buildHarnessServerParameters` (from `test/helpers/mcp-harness.ts`) for the child spawn, forcing `AGDA_MCP_CAPTURE: "1"` after any caller-supplied `extraEnv` spread (so it can never be shadowed) and a fixed `["pipe","pipe","pipe"]` stdio. `runDogfoodProxy` calls `loadTaskManifest` (Plan 05-01's D-03 hard gate) before creating any directory or spawning anything, then line-tees `process.stdin` <-> `child.stdin` and `child.stdout` <-> `process.stdout` via `node:readline`, forwarding raw line bytes unchanged in both directions. On an `agda_capture_session` result, it fires-and-forgets `promoteCapture(stagedPath)` in a try/catch that only logs failures to stderr — auto-persist never blocks line forwarding or crashes the proxy. Finalization (run-report write, child kill, process exit) is guarded by a boolean flag and triggered by whichever fires first: the child exiting, or the agent disconnecting (`process.stdin` ending, surfaced via the `readline` interface's own `"close"` event). Turned Task 1's integration test fully GREEN (4/4 behaviors); spawn-options unit tests pass (4/4), including the anchored #39 source-text regex assertion.

## Verification Performed

- `npx vitest run test/unit/tools/dogfood-transcript-writer.test.ts test/unit/tools/dogfood-run-spawn-options.test.ts` — 10/10 pass.
- `npm run build && RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/dogfood-proxy-passthrough.test.ts` — 4/4 pass (real Agda 2.8.0, real spawned server, real spawned proxy).
- Combined dogfood test set (`dogfood-transcript-writer`, `dogfood-run-spawn-options`, `dogfood-task-manifest` from 05-01, `dogfood-proxy-passthrough`) — 19/19 pass together, confirming no regression against Plan 05-01's artifacts.
- Source assertions: `AGDA_MCP_CAPTURE`, `loadTaskManifest`, `"pipe", "pipe", "pipe"` all present in `dogfood-run.mjs`; `appendFileSync`/`writeFileAtomic` present in `transcript-writer.mjs`; `grep -c "^import.*AgdaSession"` is 0 in both new scripts (#39 invariant holds).
- `npx tsc -p tsconfig.test.json --noEmit` produced zero NEW errors attributable to any of this plan's 5 files (pre-existing unrelated failures in other files are a documented, out-of-scope repo condition per prior phase SUMMARYs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - missing error handling] Wrapped `finalize()`'s body in try/catch**
- **Found during:** Task 3
- **Issue:** The plan's action text describes `finalize()` calling `writeRunReport` then killing the child and exiting, but does not explicitly call for exception handling around that sequence. `finalize()` runs from an async event-handler context (`child.on("exit", ...)` / the stdin readline's `"close"` event) where an unhandled rejection risks crashing the process under Node's default `--unhandled-rejections=throw` behavior, potentially leaking the orphaned child if the crash happens before `child.kill()`.
- **Fix:** Wrapped the report-write + stderr-summary sequence in try/catch (logging failures to stderr), with the child-kill + `process.exit` moved into a `finally` block so they always run regardless of whether the report write succeeded.
- **Files modified:** `scripts/dogfood/dogfood-run.mjs`
- **Commit:** 47d31dc

No other deviations — the plan's task actions, acceptance criteria, and threat-model mitigations were otherwise followed exactly as written.

## Environment Setup Notes (not deviations)

This worktree had no `node_modules/` or `dist/` on start (fresh checkout). Ambient `node` was v22.22.0 (repo requires >=24 per `.nvmrc`/`engines`); all commands were run via `mise exec -- <cmd>` to resolve Node 24.16.0. Ran `npm install` once, then `npm run build` before the integration test (standalone `vitest run` does not trigger the `pretest` build hook that `npm test` gets for free). A local Agda 2.8.0 binary was available at `/Users/eric/.nix-profile/bin/agda`, within the project's `minAgdaVersion 2.6.4.3` / `maxTestedAgdaVersion 2.9.0` compatibility window, so `RUN_AGDA_INTEGRATION=1` tests ran for real rather than skipping.

## Threat Flags

None. All three threat-register mitigations assigned to this plan's files (T-05-02-01 argv-array spawn, T-05-02-02 the #39 anchored-regex test, T-05-02-04 always-kill-child-on-finalize) are implemented and verified above; T-05-02-03 (gitignored `.agda-mcp/runs/`) and T-05-02-05 (unchanged `promoteCapture` reuse) required no new code.

## Known Stubs

None. Every exported function (`buildDogfoodChildOptions`, `runDogfoodProxy`, `scriptMain`, `createRunRecorder`, `renderRunReportMarkdown`, `writeRunReport`, `resolveRunsRoot`) is fully wired to real behavior, verified end-to-end against a real spawned server and a real Agda binary — no placeholder/mock data path remains in the shipped code.

## Self-Check: PASSED

- FOUND: test/integration/mcp/dogfood-proxy-passthrough.test.ts
- FOUND: scripts/dogfood/transcript-writer.mjs
- FOUND: test/unit/tools/dogfood-transcript-writer.test.ts
- FOUND: scripts/dogfood/dogfood-run.mjs
- FOUND: test/unit/tools/dogfood-run-spawn-options.test.ts
- FOUND commit 9cdabf3 (Task 1 RED test)
- FOUND commit a307b70 (Task 2 transcript-writer.mjs)
- FOUND commit 47d31dc (Task 3 dogfood-run.mjs GREEN)
