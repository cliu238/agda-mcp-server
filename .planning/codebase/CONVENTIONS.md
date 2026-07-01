# Coding Conventions

**Analysis Date:** 2026-07-01

## Naming Patterns

**Files:**
- kebab-case for all TypeScript source files: `session-load-impl.ts`, `agda-process-spawn.ts`, `tool-envelope.ts`
- Barrel/facade files delegate to focused sub-modules once they approach the size ceiling (see Module Design below), e.g. `src/agda/agent-ux.ts` → `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`
- Test files mirror the source file name with a `.test.ts` suffix (`goal-analysis.test.ts`) or `.property.test.ts` for property-based tests (`goal-analysis.property.test.ts`)
- JSON data files sit alongside the module that consumes them under a `data/` subdirectory, e.g. `src/agda/data/agda-feature-flags.json`, `src/protocol/data/protocol-command-registry.json`

**Functions:**
- camelCase throughout: `parseContextEntry`, `deriveSuggestions`, `classifyLoadResult`, `reconcileGoalsViaMetas`
- Verb-first names describing the action: `buildLoadOptionsList`, `invalidatePriorLoadState`, `missingPathToolError`, `toToolInvocationError`
- Boolean-returning/predicate helpers read as questions or assertions where practical (`versionAtLeast`, `agdaAvailable`)

**Variables:**
- camelCase; short, scoped names in tight loops (`r`, `s`) are acceptable in test files but production code favors descriptive names (`absPath`, `baseGoals`, `profilingEnabled`)
- Constants that act as singletons/config are UPPER_SNAKE_CASE: `NOT_FOUND_RESULT` (`src/agda/session-constants.ts`), `DEBUG` (`src/agda/logger.ts`), `FIXTURES` (test files)

**Types:**
- PascalCase for interfaces, types, and classes: `ToolEnvelope<T>`, `ToolDiagnostic`, `LoadResult`, `AgdaSession`, `ToolInvocationError`
- Generic type parameters use single uppercase letters or short PascalCase (`T extends Record<string, unknown>`)
- Discriminated result types use an explicit `ok: boolean` (or similar) tag plus payload, e.g. `buildLoadOptionsList` returns `{ ok: true; optsList; profilingEnabled } | { ok: false; result: LoadResult }` (`src/agda/session-load-helpers.ts`)

## Code Style

**Formatting:**
- Prettier, config in `.prettierrc`: `tabWidth: 2`, `useTabs: false` (all other options default)
- `.editorconfig` enforces LF line endings, final newline, UTF-8 charset, 2-space indent for `*.js`, `*.ts`, `*.mjs`, `*.json`
- No dedicated npm `format`/`lint` script is defined in `package.json`; formatting is enforced via `.prettierrc` + editor integration rather than a CI lint gate

**Linting:**
- No ESLint config present in the repo (no `.eslintrc*`, `eslint.config.*`). Code quality is instead enforced through TypeScript `strict` mode (`tsconfig.json`) and the test suite, including dedicated invariant tests like `test/unit/protocol/no-bare-command-strings.test.ts` and `test/unit/tools/no-dead-tool-references.test.ts`

## File Header Convention

Every source file in `src/` opens with a two-line SPDX-style comment followed by a short prose summary of the module's purpose and non-obvious design rationale:

```typescript
// MIT License — see LICENSE
//
// Tool invocation error type and helpers. Tools throw a
// ToolInvocationError when they want a specific classification,
// diagnostic list, and data payload surfaced in the error envelope...
```
(`src/tools/tool-errors.ts`, `src/tools/tool-envelope.ts`, `src/agda/session-load-helpers.ts`)

This header doubles as "why this file exists" documentation — new files should include one, especially when they are extracted sub-modules of a larger barrel file.

## Import Organization

**Order:**
1. Node builtins first, with `node:` prefix (`import { readFileSync } from "node:fs";`)
2. External packages next (`zod`, `@modelcontextprotocol/sdk/...`)
3. A blank line, then local relative imports, ordered roughly from "type-only/shared" to "specific collaborator" — types imported with `import type { ... }` when only used as types
4. All relative imports use explicit `.js` extensions (ESM/Node16 module resolution), even though the source is `.ts` — e.g. `import { logger } from "./logger.js";`, `import { mergeGoals } from "./goal-merging.js";`

**Path Aliases:**
- None configured. All cross-module imports use relative paths (`../protocol/command-builder.js`, `../session/goal-positions.js`). `moduleResolution: "Node16"` in `tsconfig.json` requires this.

## Error Handling

**Patterns:**
- A single structured error class, `ToolInvocationError` (`src/tools/tool-errors.ts`), carries `classification`, `diagnostics[]`, and a `data` payload. Tools throw this (or let a generic `Error`/`PathSandboxError` propagate) and a shared translation layer converts any thrown error into a final MCP `ToolResult` via `toToolInvocationError()` + `makeTextToolErrorResult()`.
- Every tool response — success or failure — is wrapped in a `ToolEnvelope<T>` (`src/tools/tool-envelope.ts`) with `ok`, `classification`, `summary`, `data`, `diagnostics[]`, optional `stale`/`provenance`/`elapsedMs`. Use `okEnvelope()` for the happy path and `errorEnvelope()` for failures; never construct the envelope object literal directly.
- Diagnostics are constructed via helpers `errorDiagnostic()`, `warningDiagnostic()`, `infoDiagnostic()` — each takes `(message, code?, nextAction?)`. `nextAction` should point the calling agent at the next MCP tool to call to resolve the issue (a "self-healing" hint pattern used throughout `src/tools/`).
- Domain-level "failure" values (e.g. `LoadResult` on a failed Agda load) are returned as plain data objects with a `classification` string field rather than thrown, since a failed Agda load is an expected outcome, not an exceptional one. See `failedLoadResult()` / `invalidOptions()` / `loadIncompleteNoTerminus()` in `src/agda/session-load-helpers.ts`.
- Best-effort side operations that should not fail the overall operation are wrapped in `try/catch` with a `logger.warn(...)` and a safe fallback value, never re-thrown — e.g. `reconcileGoalsViaMetas()` and `countExplicitSourceHoles()` in `src/agda/session-load-helpers.ts`.
- Path-escape attempts are represented by a dedicated `PathSandboxError` (`src/repo-root.ts`) and specifically translated to an `"invalid-path"` classification in `toToolInvocationError()`.

**When adding new tool logic:**
- Throw `ToolInvocationError` for anything the calling agent should be able to branch on (a `classification` string), rather than a bare `Error`.
- Use `missingPathToolError(kind, path)` (`src/tools/tool-errors.ts`) as the template for new "resource not found" style errors.

## Logging

**Framework:** Custom zero-cost debug logger, `src/agda/logger.ts` — not a third-party logging library.

**Patterns:**
- `logger.trace(msg, data?)` — fine-grained trace (commands sent/received). Fully no-op unless `AGDA_MCP_DEBUG=1` is set (compiles to a no-op function reference, no runtime branch cost when disabled).
- `logger.warn(msg, data?)` — always active; writes to `stderr` (never `stdout`, since stdout carries MCP JSON-RPC traffic).
- Log lines are prefixed `[agda-mcp]` and append a JSON-serialized `data` object when provided, swallowing serialization errors (`" [unserializable]"` fallback).
- Use `logger.warn` for recoverable/best-effort failures inside `try/catch`, passing structured `{ file, error }`-shaped data rather than string concatenation.

## Comments

**When to Comment:**
- Every exported function that encodes a non-obvious invariant or design decision gets a short JSDoc-style `/** ... */` block explaining *why*, not just what — e.g. `invalidatePriorLoadState()`, `loadFailedAfterReconciliation()`, `classifyLoadResult()` in `src/agda/session-load-helpers.ts`.
- Section dividers in test files use a `// ── Section Name ──` comment banner to group related test cases (see `test/unit/agda/goal-analysis.test.ts`, `test/integration/agda/agda-load.test.ts`).
- Inline comments are used sparingly, generally only to explain a subtle ordering/timing constraint (e.g. why state is cleared before an async call).

**JSDoc/TSDoc:**
- Used opportunistically on exported functions/types with non-trivial contracts (see `toolEnvelopeSchema()` in `src/tools/tool-envelope.ts` for an extensive example explaining three competing schema constraints). Not enforced on every export — simple, self-explanatory helpers are left uncommented.

## Function Design

**Size:** Kept small and single-purpose; most functions in `src/agda/session-load-helpers.ts` and `src/tools/tool-errors.ts` are under ~20 lines. Complex logic is decomposed into named helper functions rather than large inline blocks.

**Parameters:** Functions with more than 2-3 parameters, or parameters likely to grow, take a single destructured options object with named fields (see `okEnvelope(args: {...})`, `errorEnvelope(args: {...})`, `ToolInvocationError` constructor). Simple, stable-arity helpers use positional parameters (`parseContextEntry(input: string)`).

**Return Values:** Prefer explicit discriminated-union return shapes (`{ ok: true; ... } | { ok: false; ... }`) over throwing for expected-failure paths (see `buildLoadOptionsList`). Functions that can silently degrade return a safe default (e.g. `0`, `[]`) alongside a logged warning rather than propagating the error.

## Module Design

**Size ceiling:** Every source file under `src/` must stay **at or under 500 lines** (documented in `ARCHITECTURE.md`, "Module-size convention", and reinforced in `AGENTS.md`). Files that grow past this are treated as mixed-concern grab bags and must be split into cohesive sub-modules rather than patched further. Established split pattern: pull free functions that operate on session/state references into a sibling file (e.g. `session-load-impl.ts` + `session-process-lifecycle.ts` + `session-load-helpers.ts`).
- Note: `src/session/agda-transport.ts` (535 lines) currently exceeds the ceiling — treat as a known outlier, not a template for new files (see CONCERNS.md if generated).

**Layering:** `src/tools/` must stay thin — MCP registration adapters and output/presentation helpers only. Reusable domain logic belongs in `src/agda/` (process/session/domain operations), `src/session/` (session-domain helpers), `src/protocol/` (command builders, response decoders), or `src/reporting/` (bug bundles/fingerprints). See `AGENTS.md` "Architecture" section.

**Exports:** Named exports throughout; no default exports observed in `src/`. Barrel-style files re-export/delegate to focused sub-modules rather than re-implementing logic inline.

**Data-driven behavior:** Prefer JSON data files under a module's `data/` directory plus a thin typed loader over hardcoding tables/lists in TypeScript (e.g. `src/protocol/data/protocol-command-registry.json` backing `src/protocol/command-registry.ts`, `src/tools/data/tool-family-examples.json` backing `src/tools/tool-family-examples.ts`). This keeps the manifest/registry as a single source of truth (SSOT) that both runtime code and tests validate against.

**Validation:** `zod` (v4 API preferred, per `AGENTS.md`) is the standard schema/validation library for envelope shapes, tool I/O schemas, and decoders (`src/tools/tool-envelope.ts`, `src/protocol/response-schemas.ts`).

---

*Convention analysis: 2026-07-01*
