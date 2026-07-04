# Coding Conventions

**Analysis Date:** 2026-07-04

## Naming Patterns

**Files:**
- kebab-case for all TypeScript source files: `session-load-impl.ts`, `agda-process-spawn.ts`, `tool-envelope.ts`
- kebab-case for all `.mjs` scripts under `scripts/`, including subsystem prefixes for the newer orchestration scripts: `scripts/dogfood/dogfood-run.mjs`, `scripts/oracle/orcl-01-differential.mjs`, `scripts/team/cron-ingest-wrapup.mjs`, `scripts/queue/mirror-github.mjs`
- Barrel/facade files delegate to focused sub-modules once they approach the 500-line ceiling (see Module Design below), e.g. `src/agda/agent-ux.ts` → `error-classifier.ts`, `source-parsers.ts`, `refactor-helpers.ts`, `clause-fixity.ts`; `src/tools/agent-ux-tools.ts` → `src/tools/agent-ux/{edit,import,migration,options,project}-tools.ts` + `shared.ts`
- Test files mirror the source file name with a `.test.ts` suffix (`goal-analysis.test.ts`) or `.property.test.ts` for property-based tests (`goal-analysis.property.test.ts`); see `TESTING.md` for the full test-tree layout (tests live under `test/`, never co-located with `src/`)
- JSON data files sit alongside the module that consumes them under a `data/` subdirectory, e.g. `src/agda/data/agda-feature-flags.json`, `src/protocol/data/protocol-command-registry.json`, `src/tools/agent-ux/data/stdlib-migrations.json`

**Functions:**
- camelCase throughout: `parseContextEntry`, `deriveSuggestions`, `classifyLoadResult`, `reconcileGoalsViaMetas`
- Verb-first names describing the action: `buildLoadOptionsList`, `invalidatePriorLoadState`, `missingPathToolError`, `toToolInvocationError`, `throwIfWriteRejected`, `materializeCaptureEnvironment`, `judgeRefusal`
- Boolean-returning/predicate helpers read as questions or assertions where practical (`versionAtLeast`, `agdaAvailable`)
- `.mjs` scripts follow the identical camelCase/verb-first convention as `src/` — there is no separate JS-vs-TS naming dialect in this codebase (e.g. `scripts/team/archive-extract.mjs`'s `extractArchiveSafely`, `sumFileSizesUnderDir`, `scripts/oracle/run-oracle.mjs`'s `runOracle`)

**Variables:**
- camelCase; short, scoped names in tight loops (`r`, `s`) are acceptable in test files but production code favors descriptive names (`absPath`, `baseGoals`, `profilingEnabled`)
- Constants that act as singletons/config/defaults are UPPER_SNAKE_CASE: `NOT_FOUND_RESULT` (`src/agda/session-constants.ts`), `DEBUG` (`src/agda/logger.ts`), `FIXTURES` (test files), `DEFAULT_MAX_DECOMPRESSED_BYTES` / `DEFAULT_MAX_ENTRY_COUNT` (`scripts/team/archive-extract.mjs`)
- Dependency-injection parameters in `scripts/*.mjs` are always named `deps` — see `TESTING.md`'s "Dependency-Injection Seam" section for the full convention; this is a script-layer testability pattern, not a `src/` pattern

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
- No ESLint config present in the repo (no `.eslintrc*`, `eslint.config.*`) — still true as of this analysis. Code quality is instead enforced through TypeScript `strict` mode (`tsconfig.json`), the CI-gated `npm run typecheck:test` step (see `TESTING.md`), and **source-text invariant tests** that grep/scan committed source as a project-specific lint substitute: `test/unit/protocol/no-bare-command-strings.test.ts` (fails if any file outside `src/protocol/command-builder.ts` hand-assembles an IOTCM string or ships a bare command literal), `test/unit/tools/no-dead-tool-references.test.ts`, `test/unit/tools/output-schema-invariants.test.ts`. When adding a new invariant that can't be expressed as a normal unit test (e.g. "nobody hand-builds a wire string"), follow this pattern rather than reaching for a linter you'd have to configure from scratch.

## File Header Convention

Every `src/` source file — and every current-generation `scripts/*.mjs` file — opens with a two-line SPDX-style comment followed by a prose summary of the module's purpose and non-obvious design rationale:

```typescript
// MIT License — see LICENSE
//
// Tool invocation error type and helpers. Tools throw a
// ToolInvocationError when they want a specific classification,
// diagnostic list, and data payload surfaced in the error envelope...
```
(`src/tools/tool-errors.ts`, `src/tools/tool-envelope.ts`, `scripts/team/archive-extract.mjs`, `scripts/oracle/run-oracle.mjs`)

This header doubles as "why this file exists" documentation — new files should include one, especially extracted sub-modules of a larger barrel file. A handful of pre-existing utility scripts predate this convention and still lack it (`scripts/copy-json-assets.mjs`, `scripts/mcp-local-client.mjs`, `scripts/refresh-official-protocol-references.mjs`, `scripts/test-all-continuing.mjs`, `scripts/test-release-full.mjs`, `scripts/test-with-sentinel.mjs`) — treat these six as historical outliers, not a template; every `scripts/dogfood/`, `scripts/oracle/`, `scripts/queue/`, `scripts/team/` file and `scripts/emit-regression.mjs` already follows the header convention.

**ID-citation convention (comments):** Non-trivial comments — in `src/`, `scripts/`, and `test/` alike — routinely cite the specific planning/review-finding ID that motivated the code, not just a prose rationale: review-finding IDs (`WR-05`, `CR-01`), design-decision IDs (`D-09`), requirement IDs (`LOCK-02`, `CAP-04`, `POLICY-01`), pitfall/task IDs (`T-07-19`), oracle-predicate IDs (`ORCL-01`), and occasionally a bare bug fingerprint hash (`bfcba437f5426fd6`). See `src/tools/tool-errors.ts`'s `giveRejectedError` (cites its fingerprint) and `writeActionRejectedError` (cites `CR-01`/`CR-02`/`CR-03`) for the pattern. When fixing a captured or reviewed defect, cite its ID in the fix's comment and in the regression test's name (see `TESTING.md`, "from-RED" convention) — this is how a reader traces "why does this exact check exist" back to its origin without spelunking git blame.

## Import Organization

**Order:**
1. Node builtins first, with `node:` prefix (`import { readFileSync } from "node:fs";`)
2. External packages next (`zod`, `@modelcontextprotocol/sdk/...`)
3. A blank line, then local relative imports, ordered roughly from "type-only/shared" to "specific collaborator" — types imported with `import type { ... }` when only used as types
4. All relative imports use explicit `.js` extensions (ESM/Node16 module resolution), even though the source is `.ts` — e.g. `import { logger } from "./logger.js";`, `import { mergeGoals } from "./goal-merging.js";`. `.mjs` scripts under `scripts/` and `test/` follow the same rule when importing a `.ts` sibling (e.g. `test/team-archive-extract.test.ts` imports `../../../src/repo-root.js`) — this only resolves correctly when executed through `tsx`/`vitest`, never plain `node` (see `TESTING.md`).

**Path Aliases:**
- None configured. All cross-module imports use relative paths (`../protocol/command-builder.js`, `../session/goal-positions.js`). `moduleResolution: "Node16"` in `tsconfig.json` requires this.

## Error Handling

**The envelope contract — `ToolEnvelope<T>` (`src/tools/tool-envelope.ts`):**
- Every tool response — success or failure — is a `ToolEnvelope<T>` with `tool: string` (the originating MCP tool name), `ok: boolean`, `classification: string`, `summary: string` (single-line, ≤200 char digest — multi-line content goes in `data.text`), `data: T`, `diagnostics: ToolDiagnostic[]`, plus optional `stale?`, `provenance?`, `elapsedMs?`.
- Build envelopes with `okEnvelope(args)` / `errorEnvelope(args)` — **never construct the envelope object literal directly.** Both helpers call `mergeProvenance()` so process-wide metadata (server/Agda version) always lands in the final envelope without the tool re-assembling it. `errorEnvelope` defaults `classification` to `"tool-error"` and, if no `diagnostics` are supplied, synthesizes one `errorDiagnostic(summary)`.
- `makeToolResult(envelope, text?)` wraps an envelope into the final MCP `ToolResult` (`{ content, structuredContent, isError }`); `isError` is derived from `envelope.ok`, never set independently.
- `toolEnvelopeSchema(dataSchema)` builds the zod output schema for a tool: strict on `ok: true` (a happy-path envelope must conform to `dataSchema`, via `.superRefine`), lenient on `ok: false` (so the structural safety net that turns an uncaught throw into an error envelope with a partial `data` never gets rejected by its own schema), and always keeps a single object schema (never a `z.union`) so the MCP SDK's `tools/list` introspection still sees `type: "object"`. Read the docstring in `src/tools/tool-envelope.ts` before changing this — it resolves three competing constraints, not an arbitrary choice.

**Diagnostics:**
- Construct via `errorDiagnostic(message, code?, nextAction?)`, `warningDiagnostic(...)`, `infoDiagnostic(...)` — never build a `ToolDiagnostic` literal by hand.
- `nextAction` is a "self-healing" hint: it should name the specific MCP tool the calling agent should call next to resolve the diagnostic (e.g. `missingPathToolError`'s hint to call `agda_list_modules` or `agda_search_definitions`). Every error-severity diagnostic SHOULD set one.

**Throwing vs. returning:**
- Throw `ToolInvocationError` (`src/tools/tool-errors.ts`) for anything the calling agent should be able to branch on via a `classification` string. It carries `classification`, `diagnostics[]`, `data`, and an optional `text` override. `toToolInvocationError(err)` translates any thrown value (a `ToolInvocationError` passthrough, a `PathSandboxError` → `classification: "invalid-path"`, or a bare `Error`/unknown → `classification: "tool-error"`) into a normalized `ToolInvocationError`; `makeTextToolErrorResult(tool, err, defaultData)` chains that translation straight into a final `ToolResult`. Tool registration wrappers in `src/tools/tool-registration.ts` (`registerStructuredTool`, `registerTextTool`, `registerGoalTextTool`) already call this for you — individual tool handlers don't need their own top-level try/catch for the common case.
- Domain-level "failure" values (e.g. a failed `LoadResult`) are returned as plain data objects with a `classification` string field rather than thrown, since a failed Agda load is an expected outcome, not an exceptional one — see `failedLoadResult()` / `invalidOptions()` / `loadIncompleteNoTerminus()` in `src/agda/session-load-helpers.ts`.
- **Write-action rejection family** (the template for any write-capable proof action Agda might decline): `giveRejectedError(goalId, expr, rejectionText)` is the `agda_give`-specific case; `writeActionRejectedError(tool, goalId, attempted, rejectionText, extraData?)` generalizes it to `refine`/`refineExact`/`intro`/`case-split`/`auto`, deriving `classification` from the tool name (`agda_case_split` → `case-split-rejected`) so callers can branch per-tool instead of on a generic `tool-error`; `goalId` may be `undefined` for whole-file operations (e.g. `agda_auto_all`). `throwIfWriteRejected(tool, goalId, attempted, result)` is the one-line call-site helper — throws `writeActionRejectedError(...)` iff `result.rejected`, no-ops otherwise. Use this trio, not an ad hoc `if (rejected) throw new ToolInvocationError(...)`, whenever adding a new write-capable proof-action tool.
- Best-effort side operations that should not fail the overall operation are wrapped in `try/catch` with a `logger.warn(...)` and a safe fallback value, never re-thrown — e.g. `reconcileGoalsViaMetas()` and `countExplicitSourceHoles()` in `src/agda/session-load-helpers.ts`.
- Path-escape attempts are represented by a dedicated `PathSandboxError` (`src/repo-root.ts`, carries `targetPath`) and are specifically translated to an `"invalid-path"` classification in `toToolInvocationError()`.

**When adding new tool logic:**
- Throw `ToolInvocationError` for anything the calling agent should be able to branch on, rather than a bare `Error`.
- Use `missingPathToolError(kind, path)` (`src/tools/tool-errors.ts`) as the template for new "resource not found" style errors, and `writeActionRejectedError`/`throwIfWriteRejected` as the template for "Agda declined my write" errors.

## Logging

**Framework:** Custom zero-cost debug logger, `src/agda/logger.ts` — not a third-party logging library. Unchanged from prior analysis; still exactly two methods.

**Patterns:**
- `logger.trace(msg, data?)` — fine-grained trace (commands sent/received). Fully no-op unless `AGDA_MCP_DEBUG=1` is set (compiles to a no-op function reference, no runtime branch cost when disabled).
- `logger.warn(msg, data?)` — always active; writes to `stderr` (never `stdout`, since stdout carries MCP JSON-RPC traffic).
- Log lines are prefixed `[agda-mcp]` and append a JSON-serialized `data` object when provided, swallowing serialization errors (`" [unserializable]"` fallback).
- Use `logger.warn` for recoverable/best-effort failures inside `try/catch`, passing structured `{ file, error }`-shaped data rather than string concatenation.
- `scripts/*.mjs` orchestration code does not use `src/agda/logger.ts` (it's a `src/` internal); scripts write directly to `process.stdout`/`process.stderr` (see e.g. `scripts/emit-regression.mjs`'s `process.stderr.write("emit-regression refused: ...")`) since they are standalone CLI entry points, not part of the running MCP server process.

## Comments

**When to Comment:**
- Every exported function that encodes a non-obvious invariant or design decision gets a short JSDoc-style `/** ... */` block explaining *why*, not just what — e.g. `invalidatePriorLoadState()`, `loadFailedAfterReconciliation()`, `classifyLoadResult()` in `src/agda/session-load-helpers.ts`; `extractArchiveSafely()`'s multi-paragraph rationale in `scripts/team/archive-extract.mjs`.
- Section dividers in test files use a `// ── Section Name ──` comment banner to group related test cases (see `test/unit/agda/goal-analysis.test.ts`, `test/integration/agda/agda-load.test.ts`).
- Inline comments are used sparingly, generally only to explain a subtle ordering/timing constraint (e.g. why state is cleared before an async call) or a non-obvious security/defense-in-depth reason (see the two-layer sandboxing rationale at the top of `scripts/team/archive-extract.mjs`).
- File-level header comments on complex modules routinely run to 20-50 lines of prose covering *why* a mechanism exists, what alternatives were rejected, and which finding/requirement ID motivated it — see the Naming Patterns section above ("ID-citation convention") and the top of `scripts/team/archive-extract.mjs` or `test/helpers/capture-regression-runner.ts` for representative examples. This is deliberate: the codebase has no separate design-doc wiki, so the file header is often the only place the rationale lives.

**JSDoc/TSDoc:**
- Used opportunistically on exported functions/types with non-trivial contracts (see `toolEnvelopeSchema()` in `src/tools/tool-envelope.ts` for an extensive example explaining three competing schema constraints, or `runOracle()`'s `@param`-documented `options.deps` dependency-injection seam in `scripts/oracle/run-oracle.mjs`). Not enforced on every export — simple, self-explanatory helpers are left uncommented.

## Function Design

**Size:** Kept small and single-purpose; most functions in `src/agda/session-load-helpers.ts` and `src/tools/tool-errors.ts` are under ~20 lines. Complex logic is decomposed into named helper functions rather than large inline blocks — this discipline holds in `scripts/*.mjs` too (e.g. `scripts/team/archive-extract.mjs` splits `extractArchiveSafely` into `sumFileSizesUnderDir` + `extractBounded` + the exported entry point rather than one large function).

**Parameters:** Functions with more than 2-3 parameters, or parameters likely to grow, take a single destructured options object with named fields (see `okEnvelope(args: {...})`, `errorEnvelope(args: {...})`, `ToolInvocationError`'s constructor, `extractArchiveSafely(archivePath, options = {})`). Simple, stable-arity helpers use positional parameters (`parseContextEntry(input: string)`).

**Return Values:** Prefer explicit discriminated-union return shapes (`{ ok: true; ... } | { ok: false; ... }`) over throwing for expected-failure paths (see `buildLoadOptionsList`, `extractArchiveSafely`'s `{ok:true, scratchDir, cleanup}` / `{ok:false, reason, detail}`). Functions that can silently degrade return a safe default (e.g. `0`, `[]`) alongside a logged warning rather than propagating the error.

## Module Design

**Size ceiling — scoped to `src/` only:** Every source file under `src/` must stay **at or under 500 lines** (`ARCHITECTURE.md`, "Module-size convention"; reinforced in `AGENTS.md`). Files that grow past this are treated as mixed-concern grab bags and must be split into cohesive sub-modules rather than patched further. The ceiling does **not** apply to `scripts/` or `test/` — several current orchestration scripts legitimately exceed it (`scripts/oracle/orcl-02-soundness-scan.mjs` at 736 lines, `scripts/team/cron-ingest-wrapup.mjs` at 705, `scripts/dogfood/upload-run.mjs` at 683) and several test files do too (`test/unit/tools/team-cron-ingest-wrapup.test.ts` at 951 lines) — do not "fix" these by splitting; only `src/` is budget-constrained.
- The single closest-to-ceiling `src/` file today is `src/session/agda-transport.ts` at 497 lines — treat it as the current watch item for the next feature that touches transport/completion logic; a further net addition there should be split rather than pushed over 500. Other files worth knowing when nearby: `src/agda/session.ts` (477), `src/tools/agent-ux/project-tools.ts` (454), `src/tools/tool-registration.ts` (425), `src/tools/analysis-tools.ts` (422), `src/session/project-config.ts` (405).
- Established split pattern: pull free functions that operate on session/state references into a sibling file, taking the owning object as an explicit first argument (e.g. `session-load-impl.ts` + `session-process-lifecycle.ts` + `session-command-dispatch.ts`, all operating on a passed-in `AgdaSession`).

**Barrel pattern (current, verified line counts):**
- `src/agda/agent-ux.ts` (71 lines, barrel) → `error-classifier.ts` (194), `source-parsers.ts` (171), `clause-fixity.ts` (165), `refactor-helpers.ts` (150)
- `src/tools/agent-ux-tools.ts` (38 lines, barrel) → `src/tools/agent-ux/project-tools.ts` (454), `edit-tools.ts` (325), `options-tools.ts` (262), `import-tools.ts` (231), `shared.ts` (221), `migration-tools.ts` (198)
- `src/session/apply-proof-edit.ts` (37 lines, barrel) → `safe-source-io.ts`, `apply-goal-edit.ts`, `apply-batch-edits.ts`, `apply-text-edit.ts`
- Pattern: the barrel file re-exports only; all logic lives in the focused sibling modules. When adding a new tool/function to an existing group, extend the relevant sibling module — never inflate the barrel back toward the ceiling.

**Layering:** `src/tools/` must stay thin — MCP registration adapters and output/presentation helpers only. Reusable domain logic belongs in `src/agda/` (process/session/domain operations), `src/session/` (session-domain helpers), `src/protocol/` (command builders, response decoders), or `src/reporting/` (bug bundles/fingerprints). See `AGENTS.md`, "Coding guidance."

**Exports:** Named exports throughout; zero default exports in `src/` (verified — `export default` does not occur anywhere under `src/`).

**Data-driven behavior:** Prefer JSON data files under a module's `data/` directory plus a thin typed loader over hardcoding tables/lists in TypeScript (e.g. `src/protocol/data/protocol-command-registry.json` backing `src/protocol/command-registry.ts`, `src/tools/agent-ux/data/stdlib-migrations.json`). Load and validate via `loadJsonData(relativePath, schema, baseUrl)` (`src/json-data.ts`) — the test-side sibling `loadValidatedJsonData(moduleDir, relativePath, schema)` (`test/helpers/json-data.ts`) is the same idiom applied to fixture/matrix files (see `TESTING.md`). This keeps each table a single source of truth (SSOT) that both runtime code and tests validate against.

**Validation:** `zod` (v4 API, per `AGENTS.md`: "The repo now targets Zod 4 directly") is the standard schema/validation library for envelope shapes, tool I/O schemas, and decoders (`src/tools/tool-envelope.ts`, `src/protocol/response-schemas.ts`), and for every fixture/matrix JSON file (see `TESTING.md`).

---

*Convention analysis: 2026-07-04*
