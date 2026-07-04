<!-- refreshed: 2026-07-04 -->
# Architecture

**Analysis Date:** 2026-07-04

This codebase is really two systems layered on top of each other:

- **Loop ① — the MCP server** (`src/`): a stateful, layered request/response
  system that drives one long-lived `agda --interaction-json` subprocess.
  This is what gets published to npm and is what an MCP client (Claude
  Desktop, Codex, Claude Code, VS Code) actually talks to.
- **Loop ② — the self-improvement pipeline** (`scripts/`): a set of
  standalone Node scripts that *use* the server (as an opaque child MCP
  process, over stdio — never as an imported `AgdaSession`) to dogfood real
  proofs, capture defects, judge them against an oracle, and — as of v1.1 —
  ingest and judge teammates' sessions unattended and write confirmed
  findings back into a tracked fix queue. Loop ② is never part of the
  published npm package (`package.json#files` never lists `scripts/`).

Both systems live in one repository and one git history, but they are
architecturally decoupled: Loop ② never imports `src/agda/session.ts` or
constructs a second `AgdaSession` (that would violate the one-session-per-
process invariant, issue #39). It reuses `src/` logic only as either (a) a
whole opaque child process (`dist/index.js`, spoken to over MCP stdio) or
(b) pure, side-effect-free helper imports (`src/repo-root.ts`,
`src/session/safe-source-io.ts`, `src/server-version.ts`).

## System Overview

### Loop ① — the MCP server (per-request path)

```text
┌─────────────────────────────────────────────────────────────┐
│                     MCP Transport (stdio)                    │
│           `@modelcontextprotocol/sdk` — JSON-RPC              │
└───────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                        src/tools/                            │
│   Thin MCP registration adapters. Validate input (Zod),       │
│   call into session/agda layers, shape ToolResult envelope.   │
│   `register-core-tools.ts` composes 13 tool-group registers;  │
│   several of those (reporting/goal/file/agent-ux) are          │
│   themselves 2nd-tier barrels over focused sibling files.      │
└───────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                       src/session/                            │
│   Load orchestration, project config (.agda-mcp.json),        │
│   proof-edit appliers, goal-position scanning, load-terminus   │
│   tracking, command-completion (idle-timeout), literate-Agda   │
│   extraction.                                                  │
└───────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                        src/agda/                              │
│   `AgdaSession` — long-lived `agda --interaction-json`         │
│   subprocess manager + IOTCM command queue. Domain-specific    │
│   operation modules (goal, expression, advanced queries,        │
│   display, backend) delegate here. `session-capture/` records  │
│   the replay manifest + action log behind `agda_capture_session`.│
└───────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                       src/protocol/                           │
│   Pure functions: IOTCM string assembly, response decoders,    │
│   flag/option validators. No side effects, no subprocess.       │
└─────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Agda subprocess (CLI)   │
                    │  `agda --interaction-json`│
                    └─────────────────────────┘
```

This diagram describes **data flow**, not strict module-import direction. An
Agda response arrives from the subprocess, is normalized by `src/protocol/`,
flows up through `src/agda/` and `src/session/` for stateful interpretation,
and exits via `src/tools/` to the MCP transport. Layers do not reach back
down through each other's barrels; a tool that needs a wire-format helper
imports the inner module directly.

A handful of cross-cutting modules deliberately sit outside the strict
data-flow direction and may be imported by any layer: `src/tools/manifest.ts`
(runtime tool registry), `src/tools/tool-envelope.ts` / `src/tools/tool-
helpers.ts` (output envelope types and registration helpers), and
`src/agda/types.ts` (semantic result types like `LoadResult`,
`TypeCheckResult`).

### Loop ② — dogfood → capture → judge → team channel → fix queue

```text
┌──────────────┐   stdio    ┌───────────────────────────┐   stdio    ┌──────────────────┐
│  AI agent    │◀──tee────▶│ scripts/dogfood/           │◀──tee────▶│  dist/index.js   │
│ (Codex /     │           │ dogfood-run.mjs (proxy)    │           │  (the ONE real    │
│ Claude Code) │           │ transcript.jsonl + run-    │           │  MCP server,      │
└──────────────┘           │ report.json (checkpointed) │           │  AGDA_MCP_CAPTURE │
                            └─────────────┬──────────────┘           │  =1 forced)       │
                                          │ run finished              └─────────┬─────────┘
                                          ▼                             agda_capture_session
                          scripts/dogfood/dogfood-wrapup.mjs                    │
                          per staged capture: run-oracle.mjs                    ▼
                          (ORCL-01 + ORCL-02 + ORCL-03) then          .agda-mcp/captures/*.json
                          flake-classify.mjs's N-rerun gate           (src/agda/session-capture/)
                              │                        │
                              ▼                        ▼
        scripts/queue/intake.mjs          scripts/dogfood/upload-run.mjs
        (LOCAL fix-queue.json)            (D-12 chained, fail-open tar.gz+POST,
                                            or queued to upload-queue.jsonl)
                                                        │
                                                        ▼
                                  scripts/team/ingest-server.mjs
                                  (node:http, Bearer-auth via issue-key.mjs
                                   registry, streamed size cap, loopback default)
                                                        │
                                     <storageDir>/<person>/<date>/<runId>.tar.gz
                                                        │
                                                        ▼
                              scripts/team/cron-ingest-wrapup.mjs (unattended)
                              archive-extract.mjs (sandboxed) -> SAME wrapUpCapture
                              (imported, never re-invoked) -> collision-guarded
                              upsertQueueEntry
                                                        │
                                                        ▼
                     test/fixtures/fix-queue.json  --git commit + push-->  main
```

Everything below the `dogfood-run.mjs` proxy box treats the MCP server as an
external black box speaking MCP-over-stdio; nothing in this pipeline ever
imports `AgdaSession`. The one piece of `src/` logic Loop ② calls *into* the
server for is the `agda_capture_session` tool call itself, made by the agent
like any other tool call — the proxy just observes it on the wire.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Server entrypoint | CLI flags, session construction, tool registration composition, shutdown handling | `src/index.ts` |
| Tool registration barrel | Backward-compat re-exports, `AgdaSession`/type re-exports | `src/agda-process.ts` |
| Core-tool composition | Wires 13 tool-group `register()` functions | `src/tools/register-core-tools.ts` |
| Session class | Stateful facade: process lifecycle, command queue, load delegation | `src/agda/session.ts` |
| Process lifecycle | Spawn/respawn/destroy the Agda child process, listener detach | `src/agda/session-process-lifecycle.ts` |
| Command dispatch | Promise-queue serialization, control-command (abort/exit) interruption | `src/agda/session-command-dispatch.ts` |
| Process spawn | `child_process.spawn` wiring, transport attach | `src/agda/agda-process-spawn.ts` |
| IOTCM transport | Newline-delimited JSON collection, completion detection, timeouts | `src/session/agda-transport.ts` |
| Load-terminus tracking | Distinguish `metas` vs `strict` load success signals (extracted from transport) | `src/session/load-terminus-tracker.ts` |
| Load orchestration | `runLoad` / `runLoadNoMetas` — the Cmd_load round trip | `src/agda/session-load-impl.ts` |
| Load result helpers | Result builders, option validation, classification, Cmd_metas reconciliation | `src/agda/session-load-helpers.ts` |
| Command builder | Typed IOTCM string assembly (SSOT — no hand-built strings elsewhere) | `src/protocol/command-builder.ts` |
| Response decoders | Domain-specific decoders per Agda response `kind` | `src/protocol/responses/*.ts` |
| Rejection detection | Shared `detectDisplayInfoError` + success-marker predicates for the write-action two-sided guard | `src/protocol/responses/proof-actions.ts` |
| Project config | `.agda-mcp.json` + env-flag loader/merger, mtime+size cache | `src/session/project-config.ts` |
| Proof-edit appliers | Goal/text/batch edit application with atomic writes | `src/session/apply-*.ts`, `src/session/safe-source-io.ts` |
| Session capture | Replay-manifest builder, action-log recorder, dedup routing, oracle substrate, triage derivation | `src/agda/session-capture/*.ts` |
| Capture tool | `agda_capture_session` — stages a `CaptureArtifact`, returns a `CaptureReference` | `src/tools/register-capture-session.ts` |
| Goal read tools | Read-only goal/context/checked-term queries; delegates writes to its sibling | `src/tools/goal-tools.ts` |
| Goal write tools | Write-capable proof actions (case split, give, refine, refine_exact, intro, auto) + rejection handling | `src/tools/goal-write-tools.ts` |
| Tool envelope | `ToolResult` shape, `okEnvelope`/`errorEnvelope` builders | `src/tools/tool-envelope.ts` |
| Tool registration wrappers | `registerStructuredTool`/`registerTextTool`/`registerGoalTextTool`, timing, gating | `src/tools/tool-registration.ts` |
| Tool error translation | `ToolInvocationError`, `PathSandboxError`, write-rejection mapping, recovery hints | `src/tools/tool-errors.ts` |
| Manifest | Runtime SSOT for exposed tools/categories, consumed by tool-recommendation and session-status | `src/tools/manifest.ts` |
| Bug reporting | Structured bug-bundle construction, fingerprints | `src/reporting/bug-report.ts` |
| Dogfood recording proxy | Transparent stdio tee that spawns the real server, gates on a task manifest, checkpoints a run report | `scripts/dogfood/dogfood-run.mjs` |
| Run recorder | NDJSON transcript + per-tool tallies + staged-capture list -> `run-report.json`/`.md` | `scripts/dogfood/transcript-writer.mjs` |
| Oracle triad composer | Runs ORCL-01/02/03 against one capture, composes a verdict, appends abstention metrics | `scripts/oracle/run-oracle.mjs` |
| ORCL-01 (differential) | Cold, faithful replay of a captured load; diffs classification/errors against the warm capture | `scripts/oracle/orcl-01-differential.mjs` |
| ORCL-02 (soundness scan) | Static scan for postulates/unsafe pragmas/`primTrustMe`/residual holes against a policy whitelist | `scripts/oracle/orcl-02-soundness-scan.mjs` |
| ORCL-03 (conformance) | Advisory diff of the proven signature against the task's expected signature | `scripts/oracle/orcl-03-conformance.mjs` |
| Wrap-up / flake gate | Per-capture judge: oracle triad -> N-rerun flake classification -> file-or-sidechannel; D-12 upload chaining | `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/flake-classify.mjs` |
| Fix-queue SSOT I/O | `readQueueFile`/`upsertQueueEntry` — the only writer of the tracked queue | `scripts/queue/intake.mjs` |
| Fix-queue priority/dashboard | QUEUE-02 ordering; derived, regenerated Markdown view | `scripts/queue/priority.mjs`, `scripts/queue/dashboard.mjs` |
| Key registry (TEAM-01) | Mint/rotate/revoke/verify per-person Bearer keys, hash-only registry, consent statement | `scripts/team/issue-key.mjs` |
| Upload client (TEAM-02) | Packs a finished run into tar.gz, fail-open POST, bounded local retry queue | `scripts/dogfood/upload-run.mjs` |
| Ingest endpoint (TEAM-03) | `node:http` server: Bearer auth, streamed size cap, stores archives untouched | `scripts/team/ingest-server.mjs` |
| Sandboxed extraction | Two-layer tar-safety (pre-list + post-extraction realpath) + bounded decompression | `scripts/team/archive-extract.mjs` |
| Cron judge (TEAM-04) | Discovers uploaded archives, extracts, judges via the same pipeline, writes back to `main` | `scripts/team/cron-ingest-wrapup.mjs` |

## Pattern Overview

**Overall:** Layered pipe-and-filter architecture around one stateful, single
long-lived external process (Agda), wrapped by an outer, decoupled
orchestration layer (`scripts/`) that treats the server as a black box.

**Key Characteristics:**
- One `AgdaSession` instance per server process, constructed once in `src/index.ts` and threaded through every `register()` call — never re-instantiated per tool call (see the invariant comment at `src/index.ts:103-111`, issue #39 regression).
- Commands are serialized through a promise chain (`commandQueue`) so concurrent MCP tool calls never interleave on the single Agda stdin/stdout.
- Strict 500-line-per-file ceiling in `src/` only (documented in root `ARCHITECTURE.md` and `AGENTS.md`); oversized modules are split into barrels + focused sibling modules with free functions taking the owning object as first argument (e.g. `session-process-lifecycle.ts`, `session-load-impl.ts`, `session-command-dispatch.ts`, `goal-tools.ts` -> `goal-write-tools.ts`). `scripts/*.mjs` files are exempt and regularly exceed it (several are 600-700+ lines).
- Static data tables (rename maps, protocol parity matrices, version-gating facts, fuel-corpus pins, oracle policy whitelists) live in JSON under `src/<area>/data/*.json` or `scripts/data/*.json`, loaded via `loadJsonData()` (`src/json-data.ts`) or a typed test-fixture constant, rather than hardcoded in TypeScript/JS.
- **Import, never re-invoke:** Loop ② scripts that reuse another script's logic (e.g. `cron-ingest-wrapup.mjs` reusing `dogfood-wrapup.mjs`'s `wrapUpCapture`, or `dogfood-wrapup.mjs` reusing `run-oracle.mjs`'s `runOracle`) do so via a direct ESM function import, never by `spawn`/`execFileSync`-reinvoking the sibling script's own CLI.
- **Fail-open side effects:** every operation that is a nice-to-have relative to the caller's real job (uploading a run, chaining a subprocess, appending a best-effort log line) wraps itself in try/catch, logs to stderr, and never lets its own failure propagate into the caller's exit code or control flow. This is the dominant convention across all of `scripts/dogfood/` and `scripts/team/`.
- **Loud, never silent, for policy resolution:** an explicitly-required-but-unresolvable ORCL-02 policy key throws (`PolicyResolutionError`), it is never silently downgraded to a `.agda-lib`-name-derived guess — this is the W2/POLICY-01 fix Phase 6 exists around (see Anti-Patterns below).

## Layers

**`src/protocol/` — IOTCM wire format:**
- Purpose: Pure command construction and response decoding for Agda's `--interaction-json` protocol.
- Location: `src/protocol/`
- Contains: `command-builder.ts` (IOTCM string assembly — `command()`, `goalCommand()`, `quoted()`, `stringList()`, `boolLiteral()`), `command-line-options.ts` (per-call flag validation, blocklist), `command-line-suggestions.ts` (Levenshtein "did you mean"), `profile-options.ts` (profile-flag validator), `responses/*.ts` (per-`kind` decoders: `load-display.ts`, `goal-display.ts`, `search-about.ts`, `backend.ts`, `proof-actions.ts` (shared rejection-detection + give/case-split/auto decoders), `display-info.ts`, etc.).
- Depends on: nothing internal (leaf layer aside from `agda/response-parsing.ts`'s `escapeAgdaString`).
- Used by: `src/agda/` (command construction), `src/session/` (indirectly via `src/agda/`).

**`src/agda/` — subprocess + protocol-aware operations:**
- Purpose: Own the long-running `agda --interaction-json` child process and the IOTCM command queue; expose domain operations (goal type/context, case split, give, refine, auto, compute, infer, constraints, solve, scope, elaborate, search, backend/compile); record replayable session state for `agda_capture_session`.
- Location: `src/agda/`
- Contains: `session.ts` (the `AgdaSession` class — lifecycle facade only), `session-process-lifecycle.ts`, `session-command-dispatch.ts`, `session-load-impl.ts`, `session-load-helpers.ts`, `agda-process-spawn.ts`, `agda-version-detection.ts`, `binary-discovery.ts`, `goal-operations.ts`, `expression-operations.ts`, `advanced-queries.ts`, `display-operations.ts`, `backend-operations.ts`, `agent-ux.ts` barrel (→ `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`), `types.ts` (shared result types), `response-parsing.ts`, `normalize-response.ts`, `parse-load-responses.ts`, `library-registration.ts`, `agdai-cache.ts`, `session-capture/` subdirectory (see Key Abstractions).
- Depends on: `src/protocol/` (command building, response decoding), `src/session/` (transport, goal-state, session-namespaces, command-completion, project-config, load-terminus-tracker).
- Used by: `src/session/` (load orchestration wraps `AgdaSession`), `src/tools/` (tool handlers call `session.*` methods directly).

**`src/agda/session-capture/` — replay-manifest + action-log recorder (sub-layer of `src/agda/`):**
- Purpose: Everything `agda_capture_session` needs to stage a self-replaying `CaptureArtifact` without judging it (judgment is Loop ②'s job, not the server's).
- Location: `src/agda/session-capture/`
- Contains: `session-capture.ts` (barrel), `artifact-types.ts` (the full `CaptureArtifact`/`ReplayManifest`/`CaptureReference` contract), `recorded-transport.ts` (the `AGDA_MCP_CAPTURE=1`-gated, module-level, drop-newest-once-full ring buffer of `{tool, args, timestamp, normalizedResponse}` triples), `manifest-builder.ts` (`buildReplayManifest` — Agda version/binary/argv/`AGDA_DIR` contents/import-closure-hash, all read off the live singleton `AgdaSession`, never re-derived), `import-closure-hash.ts`, `dedup-index.ts` (`fingerprintBugReport`/`routeDedup` against the tracked fix queue), `triage-derivation.ts` (`classifyAgdaError()` reuse for capture-time triage), `oracle-substrate.ts` (before/after source, intended goal type, expected signature — the material Loop ②'s oracle later judges).
- Depends on: `src/agda/session.ts` (reads live state, never mutates it beyond the recorder buffer), `src/agda/agent-ux.ts` (classifier reuse), `src/session/safe-source-io.ts`, `src/protocol/responses/goal-display.ts`.
- Used by: `src/tools/register-capture-session.ts` only.

**`src/session/` — load orchestration + project config:**
- Purpose: Wrap the Agda layer with project-aware semantics — config merging, proof-edit application, goal-position scanning, literate-Agda extraction, MCP registration support for session-oriented tools.
- Location: `src/session/`
- Contains: `project-config.ts` (`.agda-mcp.json` + `AGDA_MCP_DEFAULT_FLAGS` loader/merger/cache), `project-config-diagnostics.ts`, `apply-proof-edit.ts` barrel (→ `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`), `goal-positions.ts`, `goal-state.ts`, `goal-catalog.ts`, `reload-and-diagnose.ts`, `load-tool-shared.ts`, `load-tool-registration.ts`, `process-tool-registration.ts`, `register-agda-load.ts`, `register-agda-load-no-metas.ts`, `register-agda-typecheck.ts`, `register-agda-apply-edit.ts`, `agda-transport.ts` (IOTCM transport/response collection), `load-terminus-tracker.ts` (metas-vs-strict success-signal state machine, extracted from `agda-transport.ts` to stay under the size ceiling), `command-completion.ts` (idle-timeout completion detection), `session-namespaces.ts` (builds `session.goal`/`.expr`/`.query`/`.display`/`.backend` sub-namespaces), `session-state.ts` (phase derivation), `session-snapshot.ts`, `stdout-line.ts`, `tool-presentation.ts`, `tool-recommendation.ts`, `literate/` subdirectory (literate-Agda format detection/extraction: markdown, LaTeX, org, reST, tree).
- Depends on: `src/agda/` (imports `AgdaSession` type and result types), `src/protocol/` (IOTCM envelope building for control commands).
- Used by: `src/tools/` (session-oriented tool registration delegates here).

**`src/tools/` — MCP adapter layer (two-tier composition):**
- Purpose: Thin adapters that validate input via Zod, call into `session/` or `agda/`, and wrap results in a `ToolResult` envelope.
- Location: `src/tools/`
- Contains: `register-core-tools.ts` (top-level composition root, wires 13 groups); several of those 13 are themselves second-tier barrels wiring focused sibling `register-*.ts` files — `reporting-tools.ts` -> (`register-tools-catalog.ts`, `register-protocol-parity.ts`, `register-bug-bundles.ts`, `register-capture-session.ts`, `register-session-snapshot.ts`, `register-goal-catalog.ts`, `register-tool-recommend.ts`), `agent-ux-tools.ts` -> `agent-ux/*.ts`, `file-tools.ts` -> `file/*.ts`, `goal-tools.ts` -> `goal-write-tools.ts`. Flat per-domain files for the rest: `session.ts`, `expression-tools.ts`, `query-tools.ts`, `scope-tools.ts`, `display.ts`, `backend.ts`, `analysis-tools.ts`, `cache-tools.ts`, `impact-tool.ts`. Infrastructure: `tool-envelope.ts`, `tool-registration.ts`, `tool-errors.ts`, `tool-gates.ts`, `tool-helpers.ts`, `tool-schemas.ts`, `tool-provenance.ts`, `manifest.ts`.
- Depends on: `src/session/`, `src/agda/`, `src/protocol/` (only through re-exports/types, not hand-built commands).
- Used by: `src/index.ts` via `registerCoreTools()`.

**`scripts/` — Loop ② orchestration (outside `src/`, outside the published package):**
- Purpose: Dogfood real proofs through the server, capture defects reproducibly, judge them against an automated oracle, and (v1.1) ingest and judge teammates' sessions unattended.
- Location: `scripts/dogfood/`, `scripts/oracle/`, `scripts/queue/`, `scripts/team/`, `scripts/data/`.
- Contains: see Component Responsibilities table above and the Data Flow section below for the exact pipeline.
- Depends on: `src/repo-root.ts`, `src/session/safe-source-io.ts`, `src/server-version.ts` (pure helper imports, via `.js`-suffixed specifiers resolved by `tsx`/vitest against the underlying `.ts`); the compiled `dist/index.js` as an opaque spawned child process (never a source-level `AgdaSession` import); `test/fixtures/*.ts` typed constants (`fix-queue.ts`, `fuel-corpora.ts`, `task-manifest-schema.ts`) as the schema/data SSOT it reads and writes.
- Used by: nothing in `src/` — this is a one-way dependency; `src/` never imports from `scripts/`.
- Constraint: every script must be launched via `npx tsx` (or vitest's resolver), never plain `node` — `.js`-suffixed import specifiers pointing at sibling `.ts` files only resolve correctly through `tsx`'s loader.

## Data Flow

### Primary Request Path (e.g. `agda_case_split`)

1. MCP client sends a JSON-RPC tool call over stdio; `McpServer`/`StdioServerTransport` route it to the registered Zod-validated handler (`src/index.ts:184-190` registers via `registerCoreTools`).
2. Tool handler in `src/tools/goal-write-tools.ts` validates args, calls `session.goal.caseSplit(...)` (namespace built by `createSessionNamespaces` in `src/session/session-namespaces.ts` inside the `AgdaSession` constructor, `src/agda/session.ts`).
3. The namespace delegate (`src/agda/goal-operations.ts`) builds an IOTCM string via `src/protocol/command-builder.ts` (`goalCommand(...)`) and calls `session.sendCommand(...)`.
4. `sendCommand` delegates to `dispatchSessionCommand` (`src/agda/session-command-dispatch.ts`), which enqueues onto `session.commandQueue`, runs a version-detection preflight, calls `ensureProcess()` (`src/agda/session-process-lifecycle.ts`) to guarantee a live child process, and writes the command via `session.transport.sendCommand(...)` (`src/session/agda-transport.ts`).
5. The transport collects newline-delimited JSON responses from the Agda child's stdout until a `status`/idle-completion signal fires (`src/session/command-completion.ts` + `src/session/load-terminus-tracker.ts` for load-family commands), then resolves with `AgdaResponse[]`.
6. Responses are normalized (`src/agda/normalize-response.ts`) and decoded per-`kind` by `src/protocol/responses/*.ts`. `caseSplit()` also scans for an Error `DisplayInfo` via `detectDisplayInfoError()` (`src/protocol/responses/proof-actions.ts`) to detect a rejected split — see "Error-DisplayInfo rejection detection" under Key Abstractions.
7. The goal-operation function shapes a domain result (`CaseSplitResult { clauses, rejected, rejectionText }`, `src/agda/types.ts`) and returns it up through the tool handler.
8. The tool handler calls `throwIfWriteRejected("agda_case_split", goalId, variable, result)` (`src/tools/tool-errors.ts`) BEFORE doing anything with `result.clauses` — a rejected split throws a `ToolInvocationError` classified `case-split-rejected` instead of writing Agda's own error text into the source file as a fabricated clause.
9. `src/tools/tool-registration.ts` wrappers (`wrapStructuredGoalHandler`, etc.) measure elapsed time, apply staleness/goal-ID gating (`src/tools/tool-gates.ts`), and shape the final `ToolResult` envelope (`src/tools/tool-envelope.ts`).
10. The envelope is serialized back to the MCP client as the tool call's structured response.

### Load Flow (`agda_load` / `agda_typecheck`)

1. Tool handler (`src/session/register-agda-load.ts` or `register-agda-typecheck.ts`) calls `session.load(filePath, options)` (`src/agda/session.ts`).
2. `load()` merges three flag layers — `.agda-mcp.json` (`src/session/project-config.ts`), `AGDA_MCP_DEFAULT_FLAGS` env var, and per-call `commandLineOptions` — via `mergeCommandLineOptions` (per-call wins on collision), and separately snapshots the pre-dedup, ordered argv into `session.lastDispatchedLoadArgv` (consumed only by `session-capture/manifest-builder.ts`, never by the real `Cmd_load` dispatch).
3. `runLoad` (`src/agda/session-load-impl.ts`, using result builders from `session-load-helpers.ts`) builds and sends the `Cmd_load` IOTCM command, then updates `currentFile`, `goalIds`, `lastLoadedMtime`, `lastClassification`, `lastLoadedAt`, `lastInvisibleGoalCount` on the `AgdaSession` instance.
4. `LoadResult.projectConfigWarnings` carries forward any merged-config warnings (`file`/`env`/`system` sourced) so the tool response can surface them.
5. Every load-family tool (`agda_load`, `agda_load_no_metas`, `agda_typecheck`, the post-edit reload inside `agda_apply_edit`, `agda_bulk_status`) routes through this single `session.load()` path — this is a deliberate invariant (issue #39) preventing session-state desync from a second parallel `AgdaSession`.

### Capture Flow (`agda_capture_session`)

1. The agent calls `agda_capture_session` at any point — mid-proof, on a suspicious green, or after a crash (`src/tools/register-capture-session.ts`, registered via `reporting-tools.ts`). State-agnostic: it never judges, only records.
2. `buildReplayManifest(session)` (`src/agda/session-capture/manifest-builder.ts`) reads Agda version/binary path/argv/`AGDA_DIR` contents/build freshness/import-closure-hash directly off the live singleton — never re-derived, never a second session.
3. `drainRecordedActions()` reads (without yet clearing) the module-level ring buffer that every tool call appended to when `AGDA_MCP_CAPTURE=1` was set (`src/agda/session-capture/recorded-transport.ts`).
4. `deriveTriageFromActions()` (`triage-derivation.ts`) scans the drained actions for the last load-family error and classifies it via `classifyAgdaError()`; `buildOracleSubstrate()` (`oracle-substrate.ts`) resolves before/after source (agent-supplied > git HEAD diff > unavailable) and the intended goal type.
5. `routeDedup()` against the in-repo, git-tracked `test/fixtures/fix-queue.json` (`dedup-index.ts`) decides `new-bug` vs `update` + recurrence.
6. The full `CaptureArtifact` is written atomically under gitignored `.agda-mcp/captures/<fingerprint>-<recurrence>-<seq>-<uuid>.json`; only after that write succeeds is `commitDrainedActions()` called (never before — a write failure must never silently discard the drained action log).
7. The tool returns a lightweight `CaptureReference` (`stagedPath`, `fingerprint`, `kind`, `sessionClassification`, ...) — the full artifact is never returned inline.

### Team Feedback Channel Flow (v1.1 Loop ②)

This is the flow TEAM-01..04 and E2E-01 built: a teammate's captured session
reaches a definitive, judged, queued verdict with zero human babysitting
after upload.

1. **Dogfood-run proxy** (`scripts/dogfood/dogfood-run.mjs`): a transparent line-buffered stdio tee between the agent and a spawned `dist/index.js` child (`detached: true`, its own process group — see WR-09 below). Gated by `loadTaskManifest()` (`scripts/dogfood/task-manifest.mjs`) — a missing/empty task manifest throws before any run directory exists or any child is spawned. Every child spawn forces `AGDA_MCP_CAPTURE=1` unconditionally, so the in-server recorder is never silently a no-op.
2. **Incremental checkpointing**: `createRunRecorder()` (`scripts/dogfood/transcript-writer.mjs`) appends every wire line to `transcript.jsonl` and tallies per-tool calls + staged captures. A `run-report.json` snapshot with **`finalized: false`** is written to disk *before the child is even spawned*, and again after every observed tool-call response — a `reportWriteChain` promise serializes these so concurrent writes can never interleave or race the terminal write. The terminal write sets **`finalized: true`** plus exit metadata (`childExitCode`/`childSignalCode`/`proxyExitCode`/`childConfirmedDead`). If the proxy's own OS process is hard-killed (SIGKILL — unblockable, uncatchable) by its parent agent, `finalize()` never runs, so the run-report on disk permanently stays `finalized: false` — this is treated as **recoverable, not corrupt**: every action recorded up to that point was durably written to disk before the kill, so `dogfood-wrapup.mjs`'s `checkReportFinalized()` prints a loud warning and judges the run anyway rather than refusing it.
3. **Wrap-up / oracle judge** (`scripts/dogfood/dogfood-wrapup.mjs`): for every staged capture, `wrapUpCapture()` calls `runOracle()` (`scripts/oracle/run-oracle.mjs`), which runs ORCL-01 (cold-replay differential), ORCL-02 (static soundness scan), and ORCL-03 (advisory conformance). STRICT precedence: an ORCL-02 `cheat-flagged` finding files immediately, unconditionally, before ORCL-01's own kind is even inspected (a static scan has no timing dimension to be flaky about). An ORCL-01 `server-false-green-candidate` must first survive `classifyFlakiness()`'s N independent warm replays (default 3) — a `flaky` or `replay-inconclusive` verdict is logged to a gitignored side-channel (`flaky-captures.jsonl`) and never filed. Everything else (true-green, any abstention kind) is a no-op.
4. **Fix-queue intake** (local path): a filed candidate is upserted into `test/fixtures/fix-queue.json` via `scripts/queue/intake.mjs`'s `upsertQueueEntry` — the only writer of that file.
5. **Upload chaining (D-12, TEAM-02)**: unconditionally, regardless of judging errors (joined like a shell `;`, never `&&`), `dogfood-wrapup.mjs` spawns `scripts/dogfood/upload-run.mjs <runId>`. With no `AGDA_MCP_TEAM_UPLOAD_KEY`/`AGDA_MCP_TEAM_UPLOAD_URL` configured this returns immediately — zero network behavior, by construction (TEAM-01's mechanical gate). Otherwise it stages `runs/<runId>/`, every staged capture, and matching Claude Code/Codex agent-session logs (`agent-log-selection.mjs`, matched by corpus root + a ±10-minute time window) into a scratch dir, tars it with `spawn("tar", ...)` piped through `node:zlib`'s gzip (never `execFileSync` — archives can be multi-GB), and POSTs it with a streamed body and a Bearer header. A failed upload (unreachable URL, non-2xx, thrown error) never throws or sets a non-zero exit — the archive is copied into a bounded local retry queue (`.agda-mcp/team/upload-queue.jsonl`, default 20 archives / 2 GiB, drop-oldest with a loud warning) guarded by an advisory lock file, retried on the next invocation.
6. **Ingest endpoint** (`scripts/team/ingest-server.mjs`, TEAM-03): a ~330-line `node:http` server, loopback-bound by default. Authenticates the Bearer token against `scripts/team/issue-key.mjs`'s registry (`crypto.timingSafeEqual`, never `===`); `person` always comes from that authenticated lookup, never a client header. Enforces a compressed-size cap twice — a fast `Content-Length` precheck, then a streamed `Transform` byte-counter guard that catches an absent/lying header — before the body is ever fully buffered. Stores the archive **untouched** (never extracted here) at `<storageDir>/<person>/<date>/<runId>.tar.gz` via a same-directory temp-file-then-`rename()`.
7. **Sandboxed extraction** (`scripts/team/archive-extract.mjs`): two independent layers, neither trusting the tar binary's own guard alone. Pre-extraction: `tar -tf` lists every entry and rejects the whole archive on any absolute path or `..` segment; a second `tar -tvf` listing rejects any hard-link-type entry (invisible to both the name-only listing and a post-extraction symlink check). Extraction itself is bounded — the scratch directory's on-disk size is polled every 500ms and a breach SIGKILLs `tar` mid-extraction rather than waiting out a decompression bomb. Post-extraction, every entry's canonical (symlink-resolved) path is re-verified within the scratch root via `resolveExistingPathWithinRoot` (`src/repo-root.ts`), and the cumulative size is re-checked.
8. **Cron judge** (`scripts/team/cron-ingest-wrapup.mjs`, TEAM-04, unattended): discovers every archive under `<storageDir>` lacking a sibling `<archive>.processed.json` marker (cheap idempotency — a marker is written for both success and terminal failure, so a permanently-broken archive is never retried forever). Resolves the ORCL-02 policy key from the archive's own recorded `run-report.json.taskManifestCorpora` field against `scripts/data/fuel-corpora.json` — **never** re-derived from a `.agda-lib` inside the extracted scratch dir (the exact W2/POLICY-01 anti-pattern this milestone exists to close; a corpus-bearing bundle with an unresolvable policy key is a loud, terminal error, not a silent fallback). Calls `wrapUpCapture()` **imported directly** (never re-invoked as a CLI) with a wrapped `upsertQueueEntry` that (a) rewrites `capturePath`/`verdictPath` to a stable `<archivePath>::captures/<basename>` reference (the scratch dir is deleted by the time anyone reads the queue), and (b) refuses — with a loud stderr warning and a metadata-only annotation instead of a silent overwrite — any filing attempt that collides by fingerprint with an existing entry whose `status` is anything other than `"new"` (i.e. a human has already triaged/fixed/locked/rejected it).
9. **Write-back** (D-01/D-02): once at least one capture across the run was filed, `writeBackQueue()` runs `git add`/`git commit`/`git push` (each a separate `execFileSync` call, argv array, `shell: false`) against `test/fixtures/fix-queue.json` on the current branch — no PR-per-batch. `--no-push` is a dev-only escape hatch. A per-run summary (total archives/captures, filed, abstention rate, version-skew count, terminal-conflict count) is persisted to `.agda-mcp/team/cron-runs/<timestamp>.json` — no human is otherwise watching an unattended cron run.

**State Management:**
- All interaction state (`currentFile`, `goalIds`, load metadata, process handle, command queue, cancellation counters, `lastDispatchedLoadArgv`) lives as instance fields on the single `AgdaSession` object constructed in `src/index.ts:127`.
- `commandSerial` / `cancelledThrough` implement queue-cancellation for `Cmd_abort`/`Cmd_exit` control commands so a wedged Agda process doesn't starve interruption behind a backlog (`src/agda/session-command-dispatch.ts`).
- Session phase (`starting`/`ready`/`busy`/`exiting`/etc.) is derived on demand from `proc`/`currentFile`/`collecting`/`exiting` via `deriveSessionPhase` (`src/session/session-state.ts`), not stored redundantly.
- Loop ②'s own state is entirely file-based, never in-process-shared: `.agda-mcp/runs/<id>/run-report.json` (dogfood-run), `.agda-mcp/captures/*.json` (capture), `.agda-mcp/team/upload-queue.jsonl` (retry queue), `<storageDir>/<person>/<date>/*.tar.gz` (+`.processed.json` markers) (ingest/cron), `test/fixtures/fix-queue.json` (the one cross-cutting SSOT every stage eventually writes into).

## Key Abstractions

**`AgdaSession` (SSOT):**
- Purpose: Single stateful facade over the Agda subprocess and all interaction state.
- Examples: `src/agda/session.ts`
- Pattern: Class-as-facade — public methods delegate to free-function helpers in sibling files (`session-process-lifecycle.ts`, `session-command-dispatch.ts`, `session-load-impl.ts`) that take the `AgdaSession` instance as first argument and mutate its module-internal (non-private) fields. Session-domain namespaces (`session.goal`, `.expr`, `.query`, `.display`, `.backend`) are built once in the constructor via `createSessionNamespaces`.

**`ToolResult` / `ToolEnvelope`:**
- Purpose: Uniform structured response contract for every MCP tool.
- Examples: `src/tools/tool-envelope.ts`
- Pattern: `{ ok, summary, classification, data, diagnostics, provenance, elapsedMs }`. `summary` is a single-line (≤200 char) digest; multi-line content goes in `data.text`. Diagnostics are severity-tagged with optional `nextAction` recovery hints — error diagnostics SHOULD always set one.

**Error-DisplayInfo rejection detection (two-sided guard):**
- Purpose: Agda reports a rejected write action (an ill-typed `give`/`refine`/an invalid `case-split`/no `auto` solution) as a normal `DisplayInfo` response with `info.kind === "Error"`, not a thrown protocol/stderr error. Naively decoding "the last DisplayInfo text" as a success value writes Agda's own rejection message into the source file as a fabricated clause/solution — three real, dogfooding-found bugs (CR-01/CR-02/CR-03/CR-04, fingerprints `bfcba437f5426fd6`, `5abecc959e43fef3`, `004d161b839ce725`).
- Examples: `src/protocol/responses/proof-actions.ts` (`detectDisplayInfoError()` — the shared scanner; `hasReplacementText()`, `hasGiveActionResponse()`, `hasMakeCaseResponse()` — the success-marker predicates), `src/agda/goal-operations.ts` (`give`/`refine`/`refineExact`/`intro`/`caseSplit`/`autoOne`), `src/agda/advanced-queries.ts` (`autoAll`/`elaborate`), `src/tools/tool-errors.ts` (`giveRejectedError()`, the generalized `writeActionRejectedError()`, `throwIfWriteRejected()`), `src/tools/goal-write-tools.ts` (call sites).
- Pattern: `rejected` is true **only** when BOTH conditions hold — an Error `DisplayInfo` is present, AND the response set contains no genuine success marker (non-empty replacement text / a non-empty `GiveAction` payload / a non-empty `MakeCase` clause list). Either signal alone is insufficient: an Error display can co-occur with an unrelated warning on a real success, and a schema-conformant-but-empty success response can co-occur with a real rejection. The domain function (`agda/*-operations.ts`) returns `{ ..., rejected, rejectionText }`; the tool layer calls `throwIfWriteRejected(toolName, goalId, attempted, result)` **before** touching the "success" fields, which throws a `ToolInvocationError` classified `<tool-without-agda_-prefix>-rejected` (e.g. `case-split-rejected`) with `written: false`. Read-only operations with nothing to write (`goalTypeContextCheck` in `goal-operations.ts`, `compute`/`infer` in `src/agda/expression-operations.ts`) use a simpler local `throw` on the same `info.kind === "Error"` scan instead, since there is no "was anything written" state to reconcile.

**Barrel + focused-sibling split (500-line ceiling, `src/` only):**
- Purpose: Keep files under the enforced 500-line cap without losing cohesion.
- Examples: `src/agda/agent-ux.ts` (barrel) → `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`; `src/session/apply-proof-edit.ts` (barrel) → `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`; `src/tools/agent-ux-tools.ts` (barrel) → `agent-ux/*.ts`; `src/tools/goal-tools.ts` (read-only queries) → `src/tools/goal-write-tools.ts` (write-capable proof actions, split out once the CR-01/CR-02/CR-03 rejection-detection call sites pushed the combined file over the ceiling); `src/agda/session-capture/session-capture.ts` (barrel) → `artifact-types.ts`, `recorded-transport.ts`, `manifest-builder.ts`, `dedup-index.ts`, `triage-derivation.ts`, `oracle-substrate.ts`, `import-closure-hash.ts`.
- Pattern: Barrel file re-exports only; all logic lives in focused sibling modules. New tools/logic in an existing group extend the sibling module, not the barrel. `src/session/agda-transport.ts` similarly shed `load-terminus-tracker.ts` as an extracted sibling rather than a re-exporting barrel (no barrel needed — `agda-transport.ts` imports the tracker directly).

**Static data tables:**
- Purpose: SSOT for pure lookup data (rename maps, version-gating facts, protocol parity matrices, fuel-corpus pins, oracle policy whitelists) instead of scattering literals across TypeScript/JS.
- Examples: `src/agda/data/agda-source-extensions.json`, `src/agda/data/agda-feature-flags.json`, `src/protocol/data/protocol-command-registry.json`, `src/tools/agent-ux/data/stdlib-migrations.json`, `scripts/data/fuel-corpora.json` (pinned corpus commits + `policyKey` column), `scripts/data/oracle-policy/*.json` (per-corpus sanctioned-axiom/flag whitelists), `scripts/team/data/team-keys.json` (gitignored — the one exception, a secret, not a data table).
- Pattern: `src/`-side tables load via `loadJsonData()` (`src/json-data.ts`); the build's `scripts/copy-json-assets.mjs` copies `*.json` under `src/` into `dist/` so runtime resolution works post-build. `scripts/`-side tables load either via a typed `test/fixtures/*.ts` constant (`fuelCorpora`, resolved through tsx's `.js`->`.ts` specifier mapping — the dual-loader note repeated verbatim in `dogfood-wrapup.mjs`/`cron-ingest-wrapup.mjs`) or via `src/json-data.ts`'s runtime loader when the consumer is itself `src/`-adjacent (`orcl-02-soundness-scan.mjs`'s `loadOraclePolicy`) — the two loaders are not interchangeable for the same file.

**Oracle verdict + fix-queue entry:**
- Purpose: The two persisted contracts that separate "what the oracle observed" from "what the team should act on."
- Examples: `scripts/oracle/verdict-schema.mjs` (`composeVerdict` — `trueGreen` asserted only when ORCL-01=`pass` AND ORCL-02=`clean`; ORCL-03 is always advisory and can never flip it), `test/fixtures/fix-queue.ts` (`fixQueueEntrySchema` — `status: "new"|"triaged"|"fixing"|"locked"|"rejected"`, `defectKind` forced-priority axis, `triageClass`/`triageConfidence` a *separate* Agda-error axis, never merged with `defectKind`).
- Pattern: A verdict is written as a sidecar file next to the capture (`<capture>.verdict.json`), never a mutation of the capture itself. A fix-queue entry's `status` doubles as a human-review checkpoint: exactly one value (`"new"`) means "no human has looked at this yet" — every write path that could originate from an untrusted or automated source (the cron judge) must treat every other status as protected against overwrite.

## Entry Points

**`src/index.ts` (MCP server process entrypoint):**
- Location: `src/index.ts`
- Triggers: Invoked as `node dist/index.js` (binary `agda-mcp-server`) or via `npm run dev` (`tsx src/index.ts`).
- Responsibilities: CLI flag handling (`--help`/`--version`), `PROJECT_ROOT` validation, single `AgdaSession` construction, best-effort Agda-version provenance stamping (via `execFileSync`, never `execSync`), `registerCoreTools()` composition, optional external-extension loading (`AGDA_MCP_EXTENSION_MODULES`), `StdioServerTransport` connection, and idempotent SIGINT/SIGTERM shutdown that awaits `session.destroy()` before `process.exit()`.

**`registerCoreTools()` (tool composition):**
- Location: `src/tools/register-core-tools.ts`
- Triggers: Called once from `main()`'s synchronous setup path in `src/index.ts:190`.
- Responsibilities: Wires 13 `register()` functions (session, goal, expression, query, file, scope, display, backend, analysis, reporting, cache, impact, agent-ux tools) onto the shared `McpServer` + `AgdaSession` + `PROJECT_ROOT`. Several of these (`reporting`, `agent-ux`, `file`, `goal`) are themselves second-tier composition roots — see the `src/tools/` layer description above.

**Extension loading (`AGDA_MCP_EXTENSION_MODULES`):**
- Location: `src/index.ts:192-243`
- Triggers: Non-empty `AGDA_MCP_EXTENSION_MODULES` env var (colon-separated module specifiers/paths), resolved after core tools are registered but before the transport connects.
- Responsibilities: Dynamically `import()`s each module, collects exported `register*` functions (sorted by name), and calls each with `(server, session, projectRoot)` — same signature as internal `register()` functions. Documented in `docs/extensions.md`.

**`scripts/dogfood/dogfood-run.mjs` (dogfooding session entrypoint):**
- Location: `scripts/dogfood/dogfood-run.mjs`
- Triggers: `npx tsx scripts/dogfood/dogfood-run.mjs --manifest <path> --corpus-root <path> [--run-id <id>]`, launched as the MCP server command by Codex/Claude Code (see `.agents/skills/agda-dogfooding/SKILL.md`).
- Responsibilities: See "Team Feedback Channel Flow" step 1-2 above. Never part of the published npm package.

**`scripts/team/ingest-server.mjs` (long-running HTTP entrypoint):**
- Location: `scripts/team/ingest-server.mjs`
- Triggers: `npx tsx scripts/team/ingest-server.mjs` (no flags — every setting is env-resolved); listens on `127.0.0.1:8787` by default until SIGINT/SIGTERM.
- Responsibilities: See "Team Feedback Channel Flow" step 6 above.

**`scripts/team/cron-ingest-wrapup.mjs` (cron-invoked batch entrypoint):**
- Location: `scripts/team/cron-ingest-wrapup.mjs`
- Triggers: `npx tsx scripts/team/cron-ingest-wrapup.mjs [--no-push] [--rerun-n <N>] [--storage-dir <path>] [--queue-path <path>]` — manually invoked in v1.1 (Phase 8's k8s CronJob is the future unattended scheduler).
- Responsibilities: See "Team Feedback Channel Flow" steps 7-9 above.

**`scripts/team/issue-key.mjs` (maintainer CLI entrypoint):**
- Location: `scripts/team/issue-key.mjs`
- Triggers: `npx tsx scripts/team/issue-key.mjs issue|revoke|list <person>`, run by the maintainer once per new teammate.
- Responsibilities: Mint/rotate/revoke a per-person Bearer key; print the one-time consent statement + raw key to stdout; never persist a plaintext key.

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. Concurrency across MCP tool calls is handled entirely by the `commandQueue` promise chain in `AgdaSession`, not OS threads.
- **Global state:** The single `AgdaSession` instance (`src/index.ts:127`) is the primary shared mutable state for the server process. `src/tools/manifest.ts` also holds a module-level runtime tool registry populated by every `register*` call at startup. `src/tools/tool-helpers.ts`'s `registerGlobalProvenance` sets module-level provenance (server/Agda version) consulted by every tool response. `src/agda/session-capture/recorded-transport.ts` holds a module-level ring buffer — safe only because there is exactly one `AgdaSession`/server process (issue #39), so there is never a need to key it by session instance.
- **Circular imports:** None documented; the layering is enforced by convention (data-flow direction) rather than a lint rule — see the 500-line/layer-boundary discussion in root `ARCHITECTURE.md`.
- **File size:** Every source file in `src/` must stay at or under 500 lines (hard convention, not tooling-enforced). Files that exceed this are split into a barrel + focused sub-modules using the free-function-over-shared-state pattern. `scripts/*.mjs` files are explicitly exempt and several exceed 500 lines (`cron-ingest-wrapup.mjs` ~705, `upload-run.mjs` ~683, `dogfood-run.mjs` ~636, `orcl-02-soundness-scan.mjs` ~736).
- **One `AgdaSession` per server process:** A second, parallel `AgdaSession` would share the on-disk `_build/` interface-file cache but not in-memory session state (`currentFile`, `goalIds`), causing tool calls to diverge on what's "loaded" — this exact regression is tracked as issue #39 and is guarded against by routing every load-family tool through the singleton constructed in `src/index.ts`. Loop ②'s `dogfood-run.mjs` proxy respects this by never importing `AgdaSession` at all — it spawns `dist/index.js` as an opaque child process and only ever sees its own singleton internally.
- **`scripts/` never modifies `src/` behavior at runtime:** Loop ② is additive tooling around the shipped server, not a second implementation of it. It reuses `src/` logic only via pure, side-effect-free helper imports (`repo-root.ts`, `safe-source-io.ts`, `server-version.ts`) or by treating a built `dist/index.js` as an external MCP process — never by monkeypatching, subclassing, or duplicating `AgdaSession`/protocol logic.
- **Network surface boundary:** The core MCP server (`src/`) has zero network surface — it communicates only over local stdio JSON-RPC with a trusted host process. The v1.1 team channel (`scripts/team/ingest-server.mjs`'s `node:http` listener, `scripts/dogfood/upload-run.mjs`'s outbound `fetch`) is a **separate, deliberately excluded** network surface: it ships only in `scripts/`, never in the published npm package, and defaults to loopback-only binding.
- **Loop ② launch requires a local checkout:** `scripts/dogfood/dogfood-run.mjs` and its siblings must be launched via `npx tsx` (or vitest's resolver) from a local git checkout with `npm run build` already run — they are never resolvable via `npx agda-mcp-server@<version>` (the bare-server launch line), since `package.json#files` never lists `scripts/`.

## Anti-Patterns

### Hand-built IOTCM command strings outside `command-builder.ts`

**What happens:** A module constructs an `IOTCM "..." NonInteractive Direct (...)` string manually instead of using `command()`/`goalCommand()`/`topLevelCommand()`.
**Why it's wrong:** Escaping (`quoted()`/`escapeAgdaString`) and argument-shape rules are centralized in `src/protocol/command-builder.ts`; hand-built strings risk quoting bugs and bypass the single source of truth for wire-format assembly.
**Do this instead:** Always construct commands via `src/protocol/command-builder.ts` helpers, as done throughout `src/agda/*-operations.ts`.

### Fat tool handlers with embedded domain logic

**What happens:** A `src/tools/*.ts` registration file does constraint-decoding, response-shape derivation, or Agda-specific parsing inline in the tool callback instead of delegating to `src/session/` or `src/agda/`.
**Why it's wrong:** Violates the documented layering constraint ("domain logic stays in the layer it belongs to") and makes `src/tools/` files grow past the 500-line ceiling with logic that can't be reused outside the MCP boundary.
**Do this instead:** Keep `src/tools/*.ts` limited to Zod validation, a call into `session`/`agda`, and envelope shaping — see `src/tools/goal-write-tools.ts`'s thin `throwIfWriteRejected` call sites (the scan/classification logic itself lives in `src/protocol/responses/proof-actions.ts`) as the reference shape.

### Second parallel `AgdaSession` instance

**What happens:** Test or extension code (or a future tool, or a future Loop ② script) constructs its own `new AgdaSession(...)` instead of using the singleton passed into `register()`, or importing the server as a spawned process.
**Why it's wrong:** A second session shares the on-disk `_build/` cache with the first but has independent `currentFile`/`goalIds` state, so tools built against different session instances observe divergent "loaded" state — the exact regression fixed by issue #39.
**Do this instead:** Every load-family tool and extension `register()` function must take and reuse the single `session: AgdaSession` argument threaded from `src/index.ts`. Loop ② code that needs the server's behavior spawns `dist/index.js` as a child MCP process instead (`scripts/dogfood/dogfood-run.mjs`).

### Silent `.agda-lib`-name-derived policy fallback (the W2 anti-pattern)

**What happens:** ORCL-02's soundness scan needs a per-corpus sanctioned-axiom policy file; the naive approach derives its filename from the target's `.agda-lib` `name:` field and silently falls through to "no policy found -> cheat-filing disabled" on any mismatch.
**Why it's wrong:** A real corpus (`Codex-Homotopy-Group`'s `.agda-lib` `name:` vs. its policy file `codex-homotopy-group.json`) case-mismatches on a case-sensitive filesystem (Linux CI/k8s), silently disabling cheat detection with zero error — the exact v1.0-audit headline bug (W2) that motivated POLICY-01 and every downstream policy-key threading in Loop ②.
**Do this instead:** Resolve the policy key explicitly and pass it through every layer — `--policy` flag (`run-oracle.mjs`/`dogfood-wrapup.mjs`), a task manifest's `policyKey`/`taskManifestCorpora` field, or `scripts/data/fuel-corpora.json`'s lookup table (`cron-ingest-wrapup.mjs`'s `resolveCronPolicyKey`). An explicitly-required-but-unresolvable key must throw (`PolicyResolutionError`), never silently degrade. See `resolveWrapupPolicyKey()` (`dogfood-wrapup.mjs`) and `resolveCronPolicyKey()` (`cron-ingest-wrapup.mjs`) as the reference shape.

### Trusting a single defensive layer against untrusted archives

**What happens:** Extracting an uploaded tar.gz with only the tar binary's own path-traversal guard, or only a post-extraction symlink check, or only a compressed-size cap.
**Why it's wrong:** node-tar's own CVE history shows library guards alone are insufficient; a compressed-size cap does not bound decompressed size (a decompression bomb); a post-extraction-only check does not bound in-flight disk usage during extraction; a name-only pre-extraction listing cannot see a hard-link entry's link target.
**Do this instead:** Layer independent defenses the way `scripts/team/archive-extract.mjs` does: pre-extraction name+hard-link listing rejection, a bounded/polled extraction that SIGKILLs on a mid-extraction size breach, and a post-extraction realpath-containment + cumulative-size re-check — see that file's header comment for the full rationale.

## Error Handling

**Strategy:** Errors are translated at the tool boundary into structured `ToolResult` envelopes with `ok: false`, a `classification`, and diagnostics carrying `nextAction` recovery hints — never thrown raw to the MCP client. Loop ② scripts instead follow a **fail-open** discipline: a best-effort side operation (an upload, a chained subprocess, a log append) must never propagate its own failure into the caller's control flow or exit code, while a **correctness-critical** operation (policy resolution, a protected fix-queue overwrite) does the opposite and fails loudly/synchronously.

**Patterns:**
- `src/tools/tool-errors.ts`'s `ToolInvocationError` + `toToolInvocationError()` centralizes mapping of `PathSandboxError` and unexpected exceptions into envelopes, plus the write-rejection helpers (`giveRejectedError`, `writeActionRejectedError`, `throwIfWriteRejected`) described under Key Abstractions.
- `src/tools/tool-registration.ts` wrapper functions (`wrapStructuredHandler`, `wrapStructuredGoalHandler`, etc.) catch handler exceptions and call `makeTextToolErrorResult`/`makeToolResult` uniformly, so individual tool handlers don't need their own try/catch for the common case.
- Session-command dispatch (`src/agda/session-command-dispatch.ts`) uses `try/finally` around the preflight + transport send so `resetFileBoundStateIfProcDied` always runs, preventing stale `currentFile`/`goalIds` from surviving a process death.
- Load failures set `LoadResult.projectConfigWarnings`/`classification` rather than throwing, so a bad `.agda-mcp.json` flag becomes a warning rather than a hard failure.
- **Fail-open (Loop ②):** `scripts/dogfood/upload-run.mjs`'s entire upload attempt, `scripts/dogfood/dogfood-wrapup.mjs`'s D-12 upload-chain step, and every append-only side-channel write (`appendFlakyLog`, transcript lines) wrap themselves in try/catch, log to stderr, and return a status object rather than throwing or touching `process.exitCode`.
- **Loud-never-silent (Loop ②):** policy-key resolution (`PolicyResolutionError`), a fix-queue write-back collision against a human-reviewed entry (`cron-ingest-wrapup.mjs`'s `wrapCronUpsertQueueEntry`), and a sandboxed-extraction rejection all surface as an explicit error/warning + a recorded artifact, never a quiet skip.

## Cross-Cutting Concerns

**Logging:** `src/agda/logger.ts` plus `console.warn`/`process.stderr.write` in `src/index.ts` for startup diagnostics (missing `PROJECT_ROOT`, out-of-range Agda version). `AGDA_MCP_DEBUG=1` enables debug logging. Loop ② scripts write human-readable progress/warning lines to `process.stderr`/`process.stdout` directly (no shared logger) plus structured JSON summaries to disk (`run-report.json`, `wrapup-report.json`, `.agda-mcp/team/cron-runs/*.json`).
**Validation:** Zod schemas at the `src/tools/` boundary (`tool-schemas.ts`, per-tool input schemas); flag/option validation in `src/protocol/command-line-options.ts` and `profile-options.ts`. Loop ② validates its own JSON artifacts against zod schemas defined in `test/fixtures/*.ts` (`fixQueueEntrySchema`, `taskManifestSchema`, `fuelCorporaSchema`) via `loadValidatedJsonData`.
**Authentication:** The core MCP server (`src/`) has no network auth surface — it communicates over local stdio JSON-RPC with a trusted MCP host process. The v1.1 team channel introduces the repo's first real authentication surface: a per-person Bearer key (`scripts/team/issue-key.mjs`), hash-only on disk (`sha256`, never plaintext), compared via `crypto.timingSafeEqual` (never `===`) to avoid a timing side-channel, revocable and re-checked on every request (no in-process cache).

---

*Architecture analysis: 2026-07-04*
