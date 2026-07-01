<!-- GSD:project-start source:PROJECT.md -->
## Project

**Agda MCP Server — Self-Improvement Loop**

`agda-mcp-server` is a TypeScript MCP server that drives a long-lived `agda --interaction-json` subprocess, exposing interactive theorem-proving capabilities (load/typecheck, goals, case-split/give/refine/auto, compute/infer, search, backend compile, proof-edits) to AI coding agents like Codex and Claude Code.

This milestone is about **making the server more complete by establishing Loop ② — a reproducible, self-reinforcing improvement loop.** AI agents dogfood the server on real Agda proofs; the bugs and feature gaps that surface get systematically captured into structured reports and regression tests, then flow into a fix queue and get locked in. The process of hardening the server becomes a repeatable, accumulating loop rather than scattered one-off patches.

**Core Value:** Turn the act of improving this server into a reproducible, compounding loop: **every real proof session reliably converts into a stronger server.** If everything else is deferred, this closed loop — use it → surface a defect → capture it → fix and lock it with a regression test → use it again — must work.

### Constraints

- **Tech stack**: TypeScript (ES2022, strict), Node.js >= 24, native ESM, `@modelcontextprotocol/sdk`, `zod` v4 — no database/HTTP server; the only external integration is the `agda` CLI binary.
- **Architecture**: Layered `protocol → agda → session → tools`; thin MCP tool adapters; domain logic stays out of `src/tools/*`.
- **Invariant**: Exactly one `AgdaSession` per server process (issue #39) — every load-family path routes through the singleton.
- **Invariant**: All IOTCM command strings built via `src/protocol/command-builder.ts` (SSOT) — no hand-built wire strings.
- **File size**: Hard 500-line-per-file ceiling in `src/`; oversized modules split into barrel + focused siblings.
- **Agda compatibility**: `minAgdaVersion 2.6.4.3`, `maxTestedAgdaVersion 2.9.0`.
- **Dogfooding agents**: Codex and Claude Code are the primary agents driving the loop; their integration ergonomics matter.
- **Testing**: `vitest` (unit / property / integration / examples); property-based tests via `@fast-check/vitest`.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript (target ES2022, strict mode) - All server source in `src/`
- The server also parses/generates Agda source text (`.agda` files) as data, but does not compile Agda itself — it drives an external Agda binary.
- Shell scripting (Bash) - `tooling/scripts/run-pinned-agda.sh` (referenced/optional pinned-Agda wrapper, resolved by `src/agda/binary-discovery.ts`)
- JavaScript (ESM, `.mjs`) - Node scripts under `scripts/` (build helpers, test runners, local MCP client)
## Runtime
- Node.js >= 24 (enforced via `"engines": { "node": ">=24" }` in `package.json:64` and `.nvmrc` = `24`)
- Module system: native ESM (`"type": "module"` in `package.json`), compiled to `Node16` module/moduleResolution per `tsconfig.json`
- npm (pinned via `"packageManager": "npm@11.11.0"` in `package.json`)
- Lockfile: present — `package-lock.json`
- `.npmrc` enforces `engine-strict=true` and `package-lock=true`
## Frameworks
- `@modelcontextprotocol/sdk` (^1.12.0) - MCP server framework; `McpServer` and `StdioServerTransport` used in `src/index.ts` to expose tools over stdio JSON-RPC to MCP clients (Claude Desktop, VS Code, etc.)
- `zod` (^4.0.0) - Runtime schema validation for tool inputs/outputs (used throughout `src/tools/*` and `src/protocol/response-schemas.ts`)
- `vitest` (^4.1.2) - Test runner; config in `vitest.config.ts` (includes `test/examples`, `test/unit`, `test/property`, `test/integration`; 30s test timeout)
- `@fast-check/vitest` (^0.3.0) - Property-based testing integration, used under `test/property/`
- `typescript` (^5.9.3) - Compiler; `tsc -p tsconfig.json` emits to `dist/` (declarations + source maps)
- `tsx` (^4.0.0) - Dev-mode TS execution (`npm run dev` runs `tsx src/index.ts`)
- `@types/node` (^24.5.2) - Node type definitions
## Key Dependencies
- `@modelcontextprotocol/sdk` - Defines the entire tool-registration/transport contract the server implements (`src/tools/register-core-tools.ts`, `src/tools/tool-registration.ts`)
- `zod` (^4.0.0, major-version dependency) - Powers input/output schema validation across nearly every tool definition; a breaking zod upgrade would ripple through `src/protocol/response-schemas.ts` and every `src/tools/*` file
- Node builtins only for runtime infra: `node:child_process` (spawn/execFileSync), `node:fs`, `node:os`, `node:path`, `node:url` — there is no database, ORM, or HTTP server dependency; the "infrastructure" this project integrates with is the external `agda` CLI binary (see INTEGRATIONS.md)
## Configuration
- Configured entirely through environment variables read directly via `process.env` (no `.env` file loading library / dotenv dependency observed)
- Key env vars (documented in `src/index.ts` help text and `README.md`):
- Project-level config file: `.agda-mcp.json` at the project root, validated against `schemas/agda-mcp.schema.json` (JSON Schema draft-07); parsed in `src/session/project-config.ts`
- `tsconfig.json` - main build config (strict TS, `Node16` module resolution, `stripInternal`, declarations + source maps, `outDir: dist`, `rootDir: src`)
- `tsconfig.test.json` - separate TS config for test compilation
- `vitest.config.ts` - test include globs and timeout
- `.prettierrc` - formatting (`tabWidth: 2`, `useTabs: false`); no ESLint config detected in repo root listing
- `.editorconfig` - baseline editor formatting rules
- `scripts/copy-json-assets.mjs` - post-`tsc` build step that copies JSON assets (e.g. schemas) into `dist/`
## Platform Requirements
- Node.js 24 (via `.nvmrc`/`engines`)
- npm 11.x
- A local `agda` binary on PATH (or `AGDA_BIN` override) for integration/e2e tests; CI installs Agda via `wenkokke/setup-agda` (`.github/workflows/ci.yml`)
- Agda compatibility contract declared in `package.json`: `"agdaMcpServer": { "minAgdaVersion": "2.6.4.3", "maxTestedAgdaVersion": "2.9.0" }`, enforced/warned via `src/server-version.ts`
- Distributed as an npm package (`agda-mcp-server`) with a `bin` entry (`./dist/index.js`) — runs as a CLI/stdio MCP server, not a hosted service
- No deployment target beyond "wherever Node 24 + an Agda installation are available" (e.g. local dev machine, CI runner, Claude Desktop's MCP host, VS Code MCP extension host)
- `publishConfig.access: "public"` - published to the public npm registry
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all TypeScript source files: `session-load-impl.ts`, `agda-process-spawn.ts`, `tool-envelope.ts`
- Barrel/facade files delegate to focused sub-modules once they approach the size ceiling (see Module Design below), e.g. `src/agda/agent-ux.ts` → `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`
- Test files mirror the source file name with a `.test.ts` suffix (`goal-analysis.test.ts`) or `.property.test.ts` for property-based tests (`goal-analysis.property.test.ts`)
- JSON data files sit alongside the module that consumes them under a `data/` subdirectory, e.g. `src/agda/data/agda-feature-flags.json`, `src/protocol/data/protocol-command-registry.json`
- camelCase throughout: `parseContextEntry`, `deriveSuggestions`, `classifyLoadResult`, `reconcileGoalsViaMetas`
- Verb-first names describing the action: `buildLoadOptionsList`, `invalidatePriorLoadState`, `missingPathToolError`, `toToolInvocationError`
- Boolean-returning/predicate helpers read as questions or assertions where practical (`versionAtLeast`, `agdaAvailable`)
- camelCase; short, scoped names in tight loops (`r`, `s`) are acceptable in test files but production code favors descriptive names (`absPath`, `baseGoals`, `profilingEnabled`)
- Constants that act as singletons/config are UPPER_SNAKE_CASE: `NOT_FOUND_RESULT` (`src/agda/session-constants.ts`), `DEBUG` (`src/agda/logger.ts`), `FIXTURES` (test files)
- PascalCase for interfaces, types, and classes: `ToolEnvelope<T>`, `ToolDiagnostic`, `LoadResult`, `AgdaSession`, `ToolInvocationError`
- Generic type parameters use single uppercase letters or short PascalCase (`T extends Record<string, unknown>`)
- Discriminated result types use an explicit `ok: boolean` (or similar) tag plus payload, e.g. `buildLoadOptionsList` returns `{ ok: true; optsList; profilingEnabled } | { ok: false; result: LoadResult }` (`src/agda/session-load-helpers.ts`)
## Code Style
- Prettier, config in `.prettierrc`: `tabWidth: 2`, `useTabs: false` (all other options default)
- `.editorconfig` enforces LF line endings, final newline, UTF-8 charset, 2-space indent for `*.js`, `*.ts`, `*.mjs`, `*.json`
- No dedicated npm `format`/`lint` script is defined in `package.json`; formatting is enforced via `.prettierrc` + editor integration rather than a CI lint gate
- No ESLint config present in the repo (no `.eslintrc*`, `eslint.config.*`). Code quality is instead enforced through TypeScript `strict` mode (`tsconfig.json`) and the test suite, including dedicated invariant tests like `test/unit/protocol/no-bare-command-strings.test.ts` and `test/unit/tools/no-dead-tool-references.test.ts`
## File Header Convention
## Import Organization
- None configured. All cross-module imports use relative paths (`../protocol/command-builder.js`, `../session/goal-positions.js`). `moduleResolution: "Node16"` in `tsconfig.json` requires this.
## Error Handling
- A single structured error class, `ToolInvocationError` (`src/tools/tool-errors.ts`), carries `classification`, `diagnostics[]`, and a `data` payload. Tools throw this (or let a generic `Error`/`PathSandboxError` propagate) and a shared translation layer converts any thrown error into a final MCP `ToolResult` via `toToolInvocationError()` + `makeTextToolErrorResult()`.
- Every tool response — success or failure — is wrapped in a `ToolEnvelope<T>` (`src/tools/tool-envelope.ts`) with `ok`, `classification`, `summary`, `data`, `diagnostics[]`, optional `stale`/`provenance`/`elapsedMs`. Use `okEnvelope()` for the happy path and `errorEnvelope()` for failures; never construct the envelope object literal directly.
- Diagnostics are constructed via helpers `errorDiagnostic()`, `warningDiagnostic()`, `infoDiagnostic()` — each takes `(message, code?, nextAction?)`. `nextAction` should point the calling agent at the next MCP tool to call to resolve the issue (a "self-healing" hint pattern used throughout `src/tools/`).
- Domain-level "failure" values (e.g. `LoadResult` on a failed Agda load) are returned as plain data objects with a `classification` string field rather than thrown, since a failed Agda load is an expected outcome, not an exceptional one. See `failedLoadResult()` / `invalidOptions()` / `loadIncompleteNoTerminus()` in `src/agda/session-load-helpers.ts`.
- Best-effort side operations that should not fail the overall operation are wrapped in `try/catch` with a `logger.warn(...)` and a safe fallback value, never re-thrown — e.g. `reconcileGoalsViaMetas()` and `countExplicitSourceHoles()` in `src/agda/session-load-helpers.ts`.
- Path-escape attempts are represented by a dedicated `PathSandboxError` (`src/repo-root.ts`) and specifically translated to an `"invalid-path"` classification in `toToolInvocationError()`.
- Throw `ToolInvocationError` for anything the calling agent should be able to branch on (a `classification` string), rather than a bare `Error`.
- Use `missingPathToolError(kind, path)` (`src/tools/tool-errors.ts`) as the template for new "resource not found" style errors.
## Logging
- `logger.trace(msg, data?)` — fine-grained trace (commands sent/received). Fully no-op unless `AGDA_MCP_DEBUG=1` is set (compiles to a no-op function reference, no runtime branch cost when disabled).
- `logger.warn(msg, data?)` — always active; writes to `stderr` (never `stdout`, since stdout carries MCP JSON-RPC traffic).
- Log lines are prefixed `[agda-mcp]` and append a JSON-serialized `data` object when provided, swallowing serialization errors (`" [unserializable]"` fallback).
- Use `logger.warn` for recoverable/best-effort failures inside `try/catch`, passing structured `{ file, error }`-shaped data rather than string concatenation.
## Comments
- Every exported function that encodes a non-obvious invariant or design decision gets a short JSDoc-style `/** ... */` block explaining *why*, not just what — e.g. `invalidatePriorLoadState()`, `loadFailedAfterReconciliation()`, `classifyLoadResult()` in `src/agda/session-load-helpers.ts`.
- Section dividers in test files use a `// ── Section Name ──` comment banner to group related test cases (see `test/unit/agda/goal-analysis.test.ts`, `test/integration/agda/agda-load.test.ts`).
- Inline comments are used sparingly, generally only to explain a subtle ordering/timing constraint (e.g. why state is cleared before an async call).
- Used opportunistically on exported functions/types with non-trivial contracts (see `toolEnvelopeSchema()` in `src/tools/tool-envelope.ts` for an extensive example explaining three competing schema constraints). Not enforced on every export — simple, self-explanatory helpers are left uncommented.
## Function Design
## Module Design
- Note: `src/session/agda-transport.ts` (535 lines) currently exceeds the ceiling — treat as a known outlier, not a template for new files (see CONCERNS.md if generated).
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
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
- One `AgdaSession` instance per server process, constructed once in `src/index.ts` and threaded through every `register()` call — never re-instantiated per tool call (see the invariant comment at `src/index.ts:103-111`, issue #39 regression).
- Commands are serialized through a promise chain (`commandQueue`) so concurrent MCP tool calls never interleave on the single Agda stdin/stdout.
- Strict 500-line-per-file ceiling in `src/` (documented in root `ARCHITECTURE.md` and `AGENTS.md`); oversized modules are split into barrels + focused sibling modules with free functions taking the owning object as first argument (e.g. `session-process-lifecycle.ts`, `session-load-impl.ts`, `session-command-dispatch.ts` all operate on an `AgdaSession` reference passed in).
- Static data tables (rename maps, protocol parity matrices, version-gating facts) live in JSON under `src/<area>/data/*.json`, loaded via `loadJsonData()` (`src/json-data.ts`) rather than hardcoded in TypeScript.
## Layers
- Purpose: Pure command construction and response decoding for Agda's `--interaction-json` protocol.
- Location: `src/protocol/`
- Contains: `command-builder.ts` (IOTCM string assembly — `command()`, `goalCommand()`, `quoted()`, `stringList()`, `boolLiteral()`), `command-line-options.ts` (per-call flag validation, blocklist), `command-line-suggestions.ts` (Levenshtein "did you mean"), `profile-options.ts` (profile-flag validator), `responses/*.ts` (per-`kind` decoders: `load-display.ts`, `goal-display.ts`, `search-about.ts`, `backend.ts`, etc.).
- Depends on: nothing internal (leaf layer aside from `agda/response-parsing.ts`'s `escapeAgdaString`).
- Used by: `src/agda/` (command construction), `src/session/` (indirectly via `src/agda/`).
- Purpose: Own the long-running `agda --interaction-json` child process and the IOTCM command queue; expose domain operations (goal type/context, case split, give, refine, auto, compute, infer, constraints, solve, scope, elaborate, search, backend/compile).
- Location: `src/agda/`
- Contains: `session.ts` (the `AgdaSession` class — lifecycle facade only), `session-process-lifecycle.ts`, `session-command-dispatch.ts`, `session-load-impl.ts`, `agda-process-spawn.ts`, `agda-version-detection.ts`, `binary-discovery.ts`, `goal-operations.ts`, `expression-operations.ts`, `advanced-queries.ts`, `display-operations.ts`, `backend-operations.ts`, `agent-ux.ts` barrel (→ `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`), `types.ts` (shared result types), `response-parsing.ts`, `normalize-response.ts`, `parse-load-responses.ts`, `library-registration.ts`, `agdai-cache.ts`.
- Depends on: `src/protocol/` (command building, response decoding), `src/session/` (transport, goal-state, session-namespaces, command-completion, project-config).
- Used by: `src/session/` (load orchestration wraps `AgdaSession`), `src/tools/` (tool handlers call `session.*` methods directly).
- Purpose: Wrap the Agda layer with project-aware semantics — config merging, proof-edit application, goal-position scanning, literate-Agda extraction, MCP registration support for session-oriented tools.
- Location: `src/session/`
- Contains: `project-config.ts` (`.agda-mcp.json` + `AGDA_MCP_DEFAULT_FLAGS` loader/merger/cache), `project-config-diagnostics.ts`, `apply-proof-edit.ts` barrel (→ `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`), `goal-positions.ts`, `goal-state.ts`, `goal-catalog.ts`, `reload-and-diagnose.ts`, `load-tool-shared.ts`, `load-tool-registration.ts`, `process-tool-registration.ts`, `register-agda-load.ts`, `register-agda-load-no-metas.ts`, `register-agda-typecheck.ts`, `register-agda-apply-edit.ts`, `agda-transport.ts` (IOTCM transport/response collection), `command-completion.ts` (idle-timeout completion detection), `session-namespaces.ts` (builds `session.goal`/`.expr`/`.query`/`.display`/`.backend` sub-namespaces), `session-state.ts` (phase derivation), `session-snapshot.ts`, `stdout-line.ts`, `tool-presentation.ts`, `tool-recommendation.ts`, `literate/` subdirectory (literate-Agda format detection/extraction: markdown, LaTeX, org, reST, tree).
- Depends on: `src/agda/` (imports `AgdaSession` type and result types), `src/protocol/` (IOTCM envelope building for control commands).
- Used by: `src/tools/` (session-oriented tool registration delegates here).
- Purpose: Thin adapters that validate input via Zod, call into `session/` or `agda/`, and wrap results in a `ToolResult` envelope.
- Location: `src/tools/`
- Contains: per-domain registration files (`session.ts`, `goal-tools.ts`, `expression-tools.ts`, `query-tools.ts`, `file-tools.ts`, `scope-tools.ts`, `display.ts`, `backend.ts`, `analysis-tools.ts`, `reporting-tools.ts`, `cache-tools.ts`, `impact-tool.ts`, `agent-ux-tools.ts`), infrastructure (`tool-envelope.ts`, `tool-registration.ts`, `tool-errors.ts`, `tool-gates.ts`, `tool-helpers.ts`, `tool-schemas.ts`, `tool-provenance.ts`, `manifest.ts`), subdirectories `file/` (read-module, list-modules, search-definitions, check-postulates) and `agent-ux/` (edit-tools, import-tools, migration-tools, options-tools, project-tools).
- Depends on: `src/session/`, `src/agda/`, `src/protocol/` (only through re-exports/types, not hand-built commands).
- Used by: `src/index.ts` via `registerCoreTools()`.
## Data Flow
### Primary Request Path (e.g. `agda_case_split`)
### Load Flow (`agda_load` / `agda_typecheck`)
- All interaction state (`currentFile`, `goalIds`, load metadata, process handle, command queue, cancellation counters) lives as instance fields on the single `AgdaSession` object constructed in `src/index.ts:127`.
- `commandSerial` / `cancelledThrough` implement queue-cancellation for `Cmd_abort`/`Cmd_exit` control commands so a wedged Agda process doesn't starve interruption behind a backlog (`src/agda/session-command-dispatch.ts:128-161`).
- Session phase (`starting`/`ready`/`busy`/`exiting`/etc.) is derived on demand from `proc`/`currentFile`/`collecting`/`exiting` via `deriveSessionPhase` (`src/session/session-state.ts`), not stored redundantly.
## Key Abstractions
- Purpose: Single stateful facade over the Agda subprocess and all interaction state.
- Examples: `src/agda/session.ts`
- Pattern: Class-as-facade — public methods delegate to free-function helpers in sibling files (`session-process-lifecycle.ts`, `session-command-dispatch.ts`, `session-load-impl.ts`) that take the `AgdaSession` instance as first argument and mutate its module-internal (non-private) fields. Session-domain namespaces (`session.goal`, `.expr`, `.query`, `.display`, `.backend`) are built once in the constructor via `createSessionNamespaces`.
- Purpose: Uniform structured response contract for every MCP tool.
- Examples: `src/tools/tool-envelope.ts`
- Pattern: `{ ok, summary, classification, data, diagnostics, provenance, elapsedMs }`. `summary` is a single-line (≤200 char) digest; multi-line content goes in `data.text`. Diagnostics are severity-tagged with optional `nextAction` recovery hints — error diagnostics SHOULD always set one.
- Purpose: Keep files under the enforced 500-line cap without losing cohesion.
- Examples: `src/agda/agent-ux.ts` (barrel, 71 lines) → `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`; `src/session/apply-proof-edit.ts` (barrel, 37 lines) → `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`; `src/tools/agent-ux-tools.ts` (barrel, 38 lines) → `agent-ux/*.ts`.
- Pattern: Barrel file re-exports only; all logic lives in focused sibling modules. New tools/logic in an existing group extend the sibling module, not the barrel.
- Purpose: SSOT for pure lookup data (rename maps, version-gating facts, protocol parity matrices) instead of scattering literals across TypeScript.
- Examples: `src/agda/data/agda-source-extensions.json`, `src/agda/data/agda-feature-flags.json`, `src/protocol/data/protocol-command-registry.json`, `src/tools/agent-ux/data/stdlib-migrations.json`.
- Pattern: Loaded and validated via `loadJsonData()` (`src/json-data.ts`); the build's `scripts/copy-json-assets.mjs` copies `*.json` under `src/` into `dist/` so runtime resolution works post-build.
## Entry Points
- Location: `src/index.ts`
- Triggers: Invoked as `node dist/index.js` (binary `agda-mcp-server`) or via `npm run dev` (`tsx src/index.ts`).
- Responsibilities: CLI flag handling (`--help`/`--version`), `PROJECT_ROOT` validation, single `AgdaSession` construction, best-effort Agda-version provenance stamping (via `execFileSync`, never `execSync`, to avoid shell-injection via env-derived paths — see inline security comment), `registerCoreTools()` composition, optional external-extension loading (`AGDA_MCP_EXTENSION_MODULES`), `StdioServerTransport` connection, and idempotent SIGINT/SIGTERM shutdown that awaits `session.destroy()` before `process.exit()`.
- Location: `src/tools/register-core-tools.ts`
- Triggers: Called once from `main()`'s synchronous setup path in `src/index.ts:190`.
- Responsibilities: Wires ~13 `register()` functions (session, goal, expression, query, file, scope, display, backend, analysis, reporting, cache, impact, agent-ux tools) onto the shared `McpServer` + `AgdaSession` + `PROJECT_ROOT`.
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
### Fat tool handlers with embedded domain logic
### Second parallel `AgdaSession` instance
## Error Handling
- `src/tools/tool-errors.ts`'s `ToolInvocationError` + `toToolInvocationError()` centralizes mapping of `PathSandboxError` and unexpected exceptions into envelopes.
- `src/tools/tool-registration.ts` wrapper functions (`wrapStructuredHandler`, `wrapStructuredGoalHandler`, etc.) catch handler exceptions and call `makeTextToolErrorResult`/`makeToolResult` uniformly, so individual tool handlers don't need their own try/catch for the common case.
- Session-command dispatch (`src/agda/session-command-dispatch.ts`) uses `try/finally` around the preflight + transport send so `resetFileBoundStateIfProcDied` always runs, preventing stale `currentFile`/`goalIds` from surviving a process death.
- Load failures set `LoadResult.projectConfigWarnings`/`classification` rather than throwing, so a bad `.agda-mcp.json` flag becomes a warning rather than a hard failure.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
