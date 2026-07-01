<!-- refreshed: 2026-07-01 -->
# Architecture

**Analysis Date:** 2026-07-01

## System Overview

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
│   `src/tools/register-core-tools.ts` composes ~13 groups.     │
└───────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                       src/session/                            │
│   Load orchestration, project config (.agda-mcp.json),        │
│   proof-edit appliers, goal-position scanning, command-        │
│   completion (idle-timeout) logic, literate-Agda extraction.   │
└───────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                        src/agda/                              │
│   `AgdaSession` — long-lived `agda --interaction-json`         │
│   subprocess manager + IOTCM command queue. Domain-specific    │
│   operation modules (goal, expression, advanced queries,        │
│   display, backend) delegate here.                             │
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

This diagram describes **data flow**, not strict module-import direction. An Agda
response arrives from the subprocess, is normalized by `src/protocol/`, flows up
through `src/agda/` and `src/session/` for stateful interpretation, and exits via
`src/tools/` to the MCP transport. Layers do not reach back down through each
other's barrels; a tool that needs a wire-format helper imports the inner module
directly.

A handful of cross-cutting modules deliberately sit outside the strict data-flow
direction and may be imported by any layer: `src/tools/manifest.ts` (runtime tool
registry), `src/tools/tool-envelope.ts` / `src/tools/tool-helpers.ts` (output
envelope types and registration helpers), and `src/agda/types.ts` (semantic result
types like `LoadResult`, `TypeCheckResult`).

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Server entrypoint | CLI flags, session construction, tool registration composition, shutdown handling | `src/index.ts` |
| Tool registration barrel | Backward-compat re-exports, `AgdaSession`/type re-exports | `src/agda-process.ts` |
| Core-tool composition | Wires all ~13 tool-group `register()` functions | `src/tools/register-core-tools.ts` |
| Session class | Stateful facade: process lifecycle, command queue, load delegation | `src/agda/session.ts` |
| Process lifecycle | Spawn/respawn/destroy the Agda child process, listener detach | `src/agda/session-process-lifecycle.ts` |
| Command dispatch | Promise-queue serialization, control-command (abort/exit) interruption | `src/agda/session-command-dispatch.ts` |
| Process spawn | `child_process.spawn` wiring, transport attach | `src/agda/agda-process-spawn.ts` |
| IOTCM transport | Newline-delimited JSON collection, completion detection, timeouts | `src/session/agda-transport.ts` |
| Load orchestration | `runLoad` / `runLoadNoMetas` — the Cmd_load round trip | `src/agda/session-load-impl.ts` |
| Command builder | Typed IOTCM string assembly (SSOT — no hand-built strings elsewhere) | `src/protocol/command-builder.ts` |
| Response decoders | Domain-specific decoders per Agda response `kind` | `src/protocol/responses/*.ts` |
| Project config | `.agda-mcp.json` + env-flag loader/merger, mtime+size cache | `src/session/project-config.ts` |
| Proof-edit appliers | Goal/text/batch edit application with atomic writes | `src/session/apply-*.ts`, `src/session/safe-source-io.ts` |
| Tool envelope | `ToolResult` shape, `okEnvelope`/`errorEnvelope` builders | `src/tools/tool-envelope.ts` |
| Tool registration wrappers | `registerStructuredTool`/`registerTextTool`/`registerGoalTextTool`, timing, gating | `src/tools/tool-registration.ts` |
| Tool error translation | `ToolInvocationError`, `PathSandboxError` mapping, recovery hints | `src/tools/tool-errors.ts` |
| Manifest | Runtime SSOT for exposed tools/categories, consumed by tool-recommendation and session-status | `src/tools/manifest.ts` |
| Bug reporting | Structured bug-bundle construction, fingerprints | `src/reporting/bug-report.ts` |

## Pattern Overview

**Overall:** Layered pipe-and-filter architecture around one stateful, single
long-lived external process (Agda). MCP tool calls are thin adapters over a
domain-specific session/protocol stack; the `AgdaSession` singleton is the single
source of truth (SSOT) for interaction state.

**Key Characteristics:**
- One `AgdaSession` instance per server process, constructed once in `src/index.ts` and threaded through every `register()` call — never re-instantiated per tool call (see the invariant comment at `src/index.ts:103-111`, issue #39 regression).
- Commands are serialized through a promise chain (`commandQueue`) so concurrent MCP tool calls never interleave on the single Agda stdin/stdout.
- Strict 500-line-per-file ceiling in `src/` (documented in root `ARCHITECTURE.md` and `AGENTS.md`); oversized modules are split into barrels + focused sibling modules with free functions taking the owning object as first argument (e.g. `session-process-lifecycle.ts`, `session-load-impl.ts`, `session-command-dispatch.ts` all operate on an `AgdaSession` reference passed in).
- Static data tables (rename maps, protocol parity matrices, version-gating facts) live in JSON under `src/<area>/data/*.json`, loaded via `loadJsonData()` (`src/json-data.ts`) rather than hardcoded in TypeScript.

## Layers

**`src/protocol/` — IOTCM wire format:**
- Purpose: Pure command construction and response decoding for Agda's `--interaction-json` protocol.
- Location: `src/protocol/`
- Contains: `command-builder.ts` (IOTCM string assembly — `command()`, `goalCommand()`, `quoted()`, `stringList()`, `boolLiteral()`), `command-line-options.ts` (per-call flag validation, blocklist), `command-line-suggestions.ts` (Levenshtein "did you mean"), `profile-options.ts` (profile-flag validator), `responses/*.ts` (per-`kind` decoders: `load-display.ts`, `goal-display.ts`, `search-about.ts`, `backend.ts`, etc.).
- Depends on: nothing internal (leaf layer aside from `agda/response-parsing.ts`'s `escapeAgdaString`).
- Used by: `src/agda/` (command construction), `src/session/` (indirectly via `src/agda/`).

**`src/agda/` — subprocess + protocol-aware operations:**
- Purpose: Own the long-running `agda --interaction-json` child process and the IOTCM command queue; expose domain operations (goal type/context, case split, give, refine, auto, compute, infer, constraints, solve, scope, elaborate, search, backend/compile).
- Location: `src/agda/`
- Contains: `session.ts` (the `AgdaSession` class — lifecycle facade only), `session-process-lifecycle.ts`, `session-command-dispatch.ts`, `session-load-impl.ts`, `agda-process-spawn.ts`, `agda-version-detection.ts`, `binary-discovery.ts`, `goal-operations.ts`, `expression-operations.ts`, `advanced-queries.ts`, `display-operations.ts`, `backend-operations.ts`, `agent-ux.ts` barrel (→ `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`), `types.ts` (shared result types), `response-parsing.ts`, `normalize-response.ts`, `parse-load-responses.ts`, `library-registration.ts`, `agdai-cache.ts`.
- Depends on: `src/protocol/` (command building, response decoding), `src/session/` (transport, goal-state, session-namespaces, command-completion, project-config).
- Used by: `src/session/` (load orchestration wraps `AgdaSession`), `src/tools/` (tool handlers call `session.*` methods directly).

**`src/session/` — load orchestration + project config:**
- Purpose: Wrap the Agda layer with project-aware semantics — config merging, proof-edit application, goal-position scanning, literate-Agda extraction, MCP registration support for session-oriented tools.
- Location: `src/session/`
- Contains: `project-config.ts` (`.agda-mcp.json` + `AGDA_MCP_DEFAULT_FLAGS` loader/merger/cache), `project-config-diagnostics.ts`, `apply-proof-edit.ts` barrel (→ `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`), `goal-positions.ts`, `goal-state.ts`, `goal-catalog.ts`, `reload-and-diagnose.ts`, `load-tool-shared.ts`, `load-tool-registration.ts`, `process-tool-registration.ts`, `register-agda-load.ts`, `register-agda-load-no-metas.ts`, `register-agda-typecheck.ts`, `register-agda-apply-edit.ts`, `agda-transport.ts` (IOTCM transport/response collection), `command-completion.ts` (idle-timeout completion detection), `session-namespaces.ts` (builds `session.goal`/`.expr`/`.query`/`.display`/`.backend` sub-namespaces), `session-state.ts` (phase derivation), `session-snapshot.ts`, `stdout-line.ts`, `tool-presentation.ts`, `tool-recommendation.ts`, `literate/` subdirectory (literate-Agda format detection/extraction: markdown, LaTeX, org, reST, tree).
- Depends on: `src/agda/` (imports `AgdaSession` type and result types), `src/protocol/` (IOTCM envelope building for control commands).
- Used by: `src/tools/` (session-oriented tool registration delegates here).

**`src/tools/` — MCP adapter layer:**
- Purpose: Thin adapters that validate input via Zod, call into `session/` or `agda/`, and wrap results in a `ToolResult` envelope.
- Location: `src/tools/`
- Contains: per-domain registration files (`session.ts`, `goal-tools.ts`, `expression-tools.ts`, `query-tools.ts`, `file-tools.ts`, `scope-tools.ts`, `display.ts`, `backend.ts`, `analysis-tools.ts`, `reporting-tools.ts`, `cache-tools.ts`, `impact-tool.ts`, `agent-ux-tools.ts`), infrastructure (`tool-envelope.ts`, `tool-registration.ts`, `tool-errors.ts`, `tool-gates.ts`, `tool-helpers.ts`, `tool-schemas.ts`, `tool-provenance.ts`, `manifest.ts`), subdirectories `file/` (read-module, list-modules, search-definitions, check-postulates) and `agent-ux/` (edit-tools, import-tools, migration-tools, options-tools, project-tools).
- Depends on: `src/session/`, `src/agda/`, `src/protocol/` (only through re-exports/types, not hand-built commands).
- Used by: `src/index.ts` via `registerCoreTools()`.

## Data Flow

### Primary Request Path (e.g. `agda_case_split`)

1. MCP client sends a JSON-RPC tool call over stdio; `McpServer`/`StdioServerTransport` route it to the registered Zod-validated handler (`src/index.ts:184-190` registers via `registerCoreTools`).
2. Tool handler in `src/tools/goal-tools.ts` validates args, calls `session.goal.caseSplit(...)` (namespace built by `createSessionNamespaces` in `src/session/session-namespaces.ts:167` inside the `AgdaSession` constructor, `src/agda/session.ts:165-173`).
3. The namespace delegate (in `src/agda/goal-operations.ts`) builds an IOTCM string via `src/protocol/command-builder.ts` (`goalCommand(...)`) and calls `session.sendCommand(...)`.
4. `sendCommand` delegates to `dispatchSessionCommand` (`src/agda/session-command-dispatch.ts:40`), which enqueues onto `session.commandQueue`, runs a version-detection preflight, calls `ensureProcess()` (`src/agda/session-process-lifecycle.ts`) to guarantee a live child process, and writes the command via `session.transport.sendCommand(...)` (`src/session/agda-transport.ts`).
5. The transport collects newline-delimited JSON responses from the Agda child's stdout until a `status`/idle-completion signal fires (`src/session/command-completion.ts`), then resolves with `AgdaResponse[]`.
6. Responses are normalized (`src/agda/normalize-response.ts`) and decoded per-`kind` by `src/protocol/responses/*.ts`.
7. The goal-operation function shapes a domain result (`CaseSplitResult`, `src/agda/types.ts`) and returns it up through the tool handler.
8. `src/tools/tool-registration.ts` wrappers (`wrapStructuredGoalHandler`, etc.) measure elapsed time, apply staleness/goal-ID gating (`src/tools/tool-gates.ts`), and shape the final `ToolResult` envelope (`src/tools/tool-envelope.ts`).
9. The envelope is serialized back to the MCP client as the tool call's structured response.

### Load Flow (`agda_load` / `agda_typecheck`)

1. Tool handler (`src/session/register-agda-load.ts` or `register-agda-typecheck.ts`) calls `session.load(filePath, options)` (`src/agda/session.ts:274-291`).
2. `load()` merges three flag layers — `.agda-mcp.json` (`src/session/project-config.ts`), `AGDA_MCP_DEFAULT_FLAGS` env var, and per-call `commandLineOptions` — via `mergeCommandLineOptions` (per-call wins on collision).
3. `runLoad` (`src/agda/session-load-impl.ts`) builds and sends the `Cmd_load` IOTCM command, then updates `currentFile`, `goalIds`, `lastLoadedMtime`, `lastClassification`, `lastLoadedAt`, `lastInvisibleGoalCount` on the `AgdaSession` instance.
4. `LoadResult.projectConfigWarnings` carries forward any merged-config warnings (`file`/`env`/`system` sourced) so the tool response can surface them.
5. Every load-family tool (`agda_load`, `agda_load_no_metas`, `agda_typecheck`, the post-edit reload inside `agda_apply_edit`, `agda_bulk_status`) routes through this single `session.load()` path — this is a deliberate invariant (issue #39) preventing session-state desync from a second parallel `AgdaSession`.

**State Management:**
- All interaction state (`currentFile`, `goalIds`, load metadata, process handle, command queue, cancellation counters) lives as instance fields on the single `AgdaSession` object constructed in `src/index.ts:127`.
- `commandSerial` / `cancelledThrough` implement queue-cancellation for `Cmd_abort`/`Cmd_exit` control commands so a wedged Agda process doesn't starve interruption behind a backlog (`src/agda/session-command-dispatch.ts:128-161`).
- Session phase (`starting`/`ready`/`busy`/`exiting`/etc.) is derived on demand from `proc`/`currentFile`/`collecting`/`exiting` via `deriveSessionPhase` (`src/session/session-state.ts`), not stored redundantly.

## Key Abstractions

**`AgdaSession` (SSOT):**
- Purpose: Single stateful facade over the Agda subprocess and all interaction state.
- Examples: `src/agda/session.ts`
- Pattern: Class-as-facade — public methods delegate to free-function helpers in sibling files (`session-process-lifecycle.ts`, `session-command-dispatch.ts`, `session-load-impl.ts`) that take the `AgdaSession` instance as first argument and mutate its module-internal (non-private) fields. Session-domain namespaces (`session.goal`, `.expr`, `.query`, `.display`, `.backend`) are built once in the constructor via `createSessionNamespaces`.

**`ToolResult` / `ToolEnvelope`:**
- Purpose: Uniform structured response contract for every MCP tool.
- Examples: `src/tools/tool-envelope.ts`
- Pattern: `{ ok, summary, classification, data, diagnostics, provenance, elapsedMs }`. `summary` is a single-line (≤200 char) digest; multi-line content goes in `data.text`. Diagnostics are severity-tagged with optional `nextAction` recovery hints — error diagnostics SHOULD always set one.

**Barrel + focused-sibling split (500-line ceiling):**
- Purpose: Keep files under the enforced 500-line cap without losing cohesion.
- Examples: `src/agda/agent-ux.ts` (barrel, 71 lines) → `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`; `src/session/apply-proof-edit.ts` (barrel, 37 lines) → `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`; `src/tools/agent-ux-tools.ts` (barrel, 38 lines) → `agent-ux/*.ts`.
- Pattern: Barrel file re-exports only; all logic lives in focused sibling modules. New tools/logic in an existing group extend the sibling module, not the barrel.

**Static data tables:**
- Purpose: SSOT for pure lookup data (rename maps, version-gating facts, protocol parity matrices) instead of scattering literals across TypeScript.
- Examples: `src/agda/data/agda-source-extensions.json`, `src/agda/data/agda-feature-flags.json`, `src/protocol/data/protocol-command-registry.json`, `src/tools/agent-ux/data/stdlib-migrations.json`.
- Pattern: Loaded and validated via `loadJsonData()` (`src/json-data.ts`); the build's `scripts/copy-json-assets.mjs` copies `*.json` under `src/` into `dist/` so runtime resolution works post-build.

## Entry Points

**`src/index.ts` (process entrypoint):**
- Location: `src/index.ts`
- Triggers: Invoked as `node dist/index.js` (binary `agda-mcp-server`) or via `npm run dev` (`tsx src/index.ts`).
- Responsibilities: CLI flag handling (`--help`/`--version`), `PROJECT_ROOT` validation, single `AgdaSession` construction, best-effort Agda-version provenance stamping (via `execFileSync`, never `execSync`, to avoid shell-injection via env-derived paths — see inline security comment), `registerCoreTools()` composition, optional external-extension loading (`AGDA_MCP_EXTENSION_MODULES`), `StdioServerTransport` connection, and idempotent SIGINT/SIGTERM shutdown that awaits `session.destroy()` before `process.exit()`.

**`registerCoreTools()` (tool composition):**
- Location: `src/tools/register-core-tools.ts`
- Triggers: Called once from `main()`'s synchronous setup path in `src/index.ts:190`.
- Responsibilities: Wires ~13 `register()` functions (session, goal, expression, query, file, scope, display, backend, analysis, reporting, cache, impact, agent-ux tools) onto the shared `McpServer` + `AgdaSession` + `PROJECT_ROOT`.

**Extension loading (`AGDA_MCP_EXTENSION_MODULES`):**
- Location: `src/index.ts:192-243`
- Triggers: Non-empty `AGDA_MCP_EXTENSION_MODULES` env var (colon-separated module specifiers/paths), resolved after core tools are registered but before the transport connects.
- Responsibilities: Dynamically `import()`s each module, collects exported `register*` functions (sorted by name), and calls each with `(server, session, projectRoot)` — same signature as internal `register()` functions. Documented in `docs/extensions.md`.

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop. Concurrency across MCP tool calls is handled entirely by the `commandQueue` promise chain in `AgdaSession`, not OS threads.
- **Global state:** The single `AgdaSession` instance (`src/index.ts:127`) is the primary shared mutable state for the server process. `src/tools/manifest.ts` also holds a module-level runtime tool registry populated by every `register*` call at startup. `src/tools/tool-helpers.ts`'s `registerGlobalProvenance` sets module-level provenance (server/Agda version) consulted by every tool response.
- **Circular imports:** None documented; the layering is enforced by convention (data-flow direction) rather than a lint rule — see the 500-line/layer-boundary discussion in root `ARCHITECTURE.md`.
- **File size:** Every source file in `src/` must stay at or under 500 lines (hard convention, not tooling-enforced). Files that exceed this are split into a barrel + focused sub-modules using the free-function-over-shared-state pattern.
- **One AgdaSession per server process:** A second, parallel `AgdaSession` would share the on-disk `_build/` interface-file cache but not in-memory session state (`currentFile`, `goalIds`), causing tool calls to diverge on what's "loaded" — this exact regression is tracked as issue #39 and is guarded against by routing every load-family tool through the singleton constructed in `src/index.ts`.

## Anti-Patterns

### Hand-built IOTCM command strings outside `command-builder.ts`

**What happens:** A module constructs an `IOTCM "..." NonInteractive Direct (...)` string manually instead of using `command()`/`goalCommand()`/`topLevelCommand()`.
**Why it's wrong:** Escaping (`quoted()`/`escapeAgdaString`) and argument-shape rules are centralized in `src/protocol/command-builder.ts`; hand-built strings risk quoting bugs and bypass the single source of truth for wire-format assembly.
**Do this instead:** Always construct commands via `src/protocol/command-builder.ts` helpers, as done throughout `src/agda/*-operations.ts`.

### Fat tool handlers with embedded domain logic

**What happens:** A `src/tools/*.ts` registration file does constraint-decoding, response-shape derivation, or Agda-specific parsing inline in the tool callback instead of delegating to `src/session/` or `src/agda/`.
**Why it's wrong:** Violates the documented layering constraint ("domain logic stays in the layer it belongs to") and makes `src/tools/` files grow past the 500-line ceiling with logic that can't be reused outside the MCP boundary.
**Do this instead:** Keep `src/tools/*.ts` limited to Zod validation, a call into `session`/`agda`, and envelope shaping — see any of the existing thin registration files (e.g. `src/tools/goal-tools.ts`, `src/tools/expression-tools.ts`) as the reference shape.

### Second parallel `AgdaSession` instance

**What happens:** Test or extension code (or a future tool) constructs its own `new AgdaSession(...)` instead of using the singleton passed into `register()`.
**Why it's wrong:** A second session shares the on-disk `_build/` cache with the first but has independent `currentFile`/`goalIds` state, so tools built against different session instances observe divergent "loaded" state — the exact regression fixed by issue #39. (The retired `agda/batch.ts` helper that did this now lives only in `test/helpers/typecheck-disposable.ts`, explicitly out of the production import graph.)
**Do this instead:** Every load-family tool and extension `register()` function must take and reuse the single `session: AgdaSession` argument threaded from `src/index.ts`.

## Error Handling

**Strategy:** Errors are translated at the tool boundary into structured `ToolResult` envelopes with `ok: false`, a `classification`, and diagnostics carrying `nextAction` recovery hints — never thrown raw to the MCP client.

**Patterns:**
- `src/tools/tool-errors.ts`'s `ToolInvocationError` + `toToolInvocationError()` centralizes mapping of `PathSandboxError` and unexpected exceptions into envelopes.
- `src/tools/tool-registration.ts` wrapper functions (`wrapStructuredHandler`, `wrapStructuredGoalHandler`, etc.) catch handler exceptions and call `makeTextToolErrorResult`/`makeToolResult` uniformly, so individual tool handlers don't need their own try/catch for the common case.
- Session-command dispatch (`src/agda/session-command-dispatch.ts`) uses `try/finally` around the preflight + transport send so `resetFileBoundStateIfProcDied` always runs, preventing stale `currentFile`/`goalIds` from surviving a process death.
- Load failures set `LoadResult.projectConfigWarnings`/`classification` rather than throwing, so a bad `.agda-mcp.json` flag becomes a warning rather than a hard failure.

## Cross-Cutting Concerns

**Logging:** `src/agda/logger.ts` plus `console.warn`/`process.stderr.write` in `src/index.ts` for startup diagnostics (missing `PROJECT_ROOT`, out-of-range Agda version). `AGDA_MCP_DEBUG=1` enables debug logging.
**Validation:** Zod schemas at the `src/tools/` boundary (`tool-schemas.ts`, per-tool input schemas); flag/option validation in `src/protocol/command-line-options.ts` and `profile-options.ts`.
**Authentication:** Not applicable — server communicates over local stdio JSON-RPC with a trusted MCP host process; no network auth surface.

---

*Architecture analysis: 2026-07-01*
