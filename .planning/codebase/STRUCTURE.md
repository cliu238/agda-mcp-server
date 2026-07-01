# Codebase Structure

**Analysis Date:** 2026-07-01

## Directory Layout

```
agda-mcp-server/
├── src/                        # TypeScript source (compiled to dist/ via tsc)
│   ├── index.ts                # Server entrypoint — CLI flags, session, tool registration, shutdown
│   ├── agda-process.ts         # Backward-compat barrel re-exporting src/agda/session.ts + types
│   ├── json-data.ts            # loadJsonData() — SSOT loader for static *.json data tables
│   ├── repo-root.ts            # PROJECT_ROOT / SERVER_REPO_ROOT resolution
│   ├── server-version.ts       # Server version + Agda supported-range classification
│   ├── agda/                   # Agda subprocess + protocol-aware domain operations
│   │   ├── session.ts          # AgdaSession class (lifecycle facade, SSOT)
│   │   ├── session-process-lifecycle.ts
│   │   ├── session-command-dispatch.ts
│   │   ├── session-load-impl.ts
│   │   ├── agda-process-spawn.ts
│   │   ├── agda-version-detection.ts
│   │   ├── agda-version.ts
│   │   ├── binary-discovery.ts
│   │   ├── goal-operations.ts
│   │   ├── expression-operations.ts
│   │   ├── advanced-queries.ts
│   │   ├── display-operations.ts
│   │   ├── backend-operations.ts
│   │   ├── backend-expression.ts
│   │   ├── agent-ux.ts         # barrel → error-classifier/source-parsers/refactor-helpers/clause-fixity
│   │   ├── error-classifier.ts, source-parsers.ts, refactor-helpers.ts, clause-fixity.ts
│   │   ├── types.ts            # Shared result types (LoadResult, GoalInfo, etc.)
│   │   ├── response-parsing.ts, normalize-response.ts, parse-load-responses.ts
│   │   ├── goal-analysis.ts, goal-merging.ts
│   │   ├── library-registration.ts, agdai-cache.ts
│   │   ├── completeness.ts, protocol-errors.ts, version-support.ts
│   │   ├── import-graph.ts, source-parsers.ts, source-path-utils.ts
│   │   ├── logger.ts, session-constants.ts
│   │   └── data/               # Static JSON tables (source extensions, feature flags, fixities)
│   ├── session/                # Load orchestration, project config, proof-edit appliers
│   │   ├── agda-transport.ts   # IOTCM transport — response collection, completion detection
│   │   ├── command-completion.ts
│   │   ├── project-config.ts, project-config-diagnostics.ts
│   │   ├── apply-proof-edit.ts # barrel → safe-source-io/apply-goal-edit/apply-batch-edits/apply-text-edit
│   │   ├── safe-source-io.ts, apply-goal-edit.ts, apply-batch-edits.ts, apply-text-edit.ts
│   │   ├── goal-positions.ts, goal-state.ts, goal-catalog.ts
│   │   ├── reload-and-diagnose.ts, load-tool-shared.ts
│   │   ├── load-tool-registration.ts, process-tool-registration.ts
│   │   ├── register-agda-load.ts, register-agda-load-no-metas.ts
│   │   ├── register-agda-typecheck.ts, register-agda-apply-edit.ts
│   │   ├── session-namespaces.ts, session-state.ts, session-snapshot.ts
│   │   ├── stdout-line.ts, tool-presentation.ts, tool-recommendation.ts
│   │   └── literate/           # Literate-Agda format detection/extraction (md, LaTeX, org, reST, tree)
│   ├── protocol/                # Pure IOTCM wire-format functions — no side effects
│   │   ├── command-builder.ts  # SSOT for IOTCM string assembly
│   │   ├── command-line-options.ts, command-line-suggestions.ts, profile-options.ts
│   │   ├── command-registry.ts, metadata.ts, parity-matrix.ts, response-schemas.ts
│   │   ├── responses/          # Per-`kind` response decoders (load, goal, backend, search-about, ...)
│   │   └── data/                # Protocol command registry, parity overrides, command-line-options.json
│   ├── tools/                    # MCP adapter layer — thin registration files
│   │   ├── session.ts, goal-tools.ts, expression-tools.ts, query-tools.ts
│   │   ├── file-tools.ts, scope-tools.ts, display.ts, backend.ts
│   │   ├── analysis-tools.ts, reporting-tools.ts, cache-tools.ts, impact-tool.ts
│   │   ├── agent-ux-tools.ts    # barrel → agent-ux/*.ts
│   │   ├── register-core-tools.ts       # composes all register() groups (main() call site)
│   │   ├── register-bug-bundles.ts, register-goal-catalog.ts, register-protocol-parity.ts
│   │   ├── register-session-snapshot.ts, register-tool-recommend.ts, register-tools-catalog.ts
│   │   ├── manifest.ts          # Runtime SSOT for exposed tools/categories/schema field names
│   │   ├── tool-envelope.ts     # ToolResult / ToolDiagnostic shape + envelope builders
│   │   ├── tool-registration.ts # wrapStructuredHandler / wrapStructuredGoalHandler etc.
│   │   ├── tool-errors.ts, tool-gates.ts, tool-helpers.ts
│   │   ├── tool-schemas.ts, tool-provenance.ts, tool-family-examples.ts
│   │   ├── path-utils.ts, reporting-schemas.ts
│   │   ├── file/                # read-module, list-modules, search-definitions, check-postulates
│   │   └── agent-ux/            # migration-tools, edit-tools, import-tools, options-tools, project-tools, shared
│   └── reporting/
│       └── bug-report.ts        # Structured bug-bundle construction + fingerprints
├── test/                        # Vitest test suite
│   ├── unit/                    # Fast, no live Agda — mirrors src/ subtree (agda/, session/, protocol/, reporting/, tools/, helpers/)
│   ├── integration/              # Live Agda required (RUN_AGDA_INTEGRATION=1) — agda/, mcp/
│   ├── property/                 # fast-check property-based tests — agda/, protocol/, reporting/, session/, tools/, helpers/
│   ├── examples/                 # Extension-catalog / example-based tests
│   ├── fixtures/                 # Agda source fixtures + fixture-matrix.json (SSOT for fixture cases)
│   │   ├── agda/                 # .agda fixture files, FixtureDeps/ (cross-module import fixtures)
│   │   └── e2e/                  # mcp-tool-coverage.json — SSOT mapping tools to MCP e2e scenarios
│   └── helpers/                  # Shared test helpers (mcp-harness, isolated-agda-dir, repo-root, etc.)
├── scripts/                      # Node maintenance/build/test-orchestration scripts (.mjs)
├── schemas/                       # agda-mcp.schema.json — JSON Schema for .agda-mcp.json ($schema autocomplete)
├── docs/                          # extensions.md, assistant-workflows.md, literate-agda-assessment.md
├── examples/extensions/           # Example external extension modules (AGDA_MCP_EXTENSION_MODULES)
├── tooling/protocol/data/         # Cross-version Agda protocol reference metadata
├── ARCHITECTURE.md                # Root-level architecture doc (authoritative source; mirrored context in .planning/codebase/ARCHITECTURE.md)
├── AGENTS.md                      # Agent/contributor guidance — conventions, testing, TDD discipline
├── CONTRIBUTING.md, CHANGELOG.md, SECURITY.md, README.md
└── package.json                   # dist/index.js bin entry, npm scripts, engines: node >= 24
```

## Directory Purposes

**`src/agda/`:**
- Purpose: Owns the Agda subprocess (`agda --interaction-json`) and every operation that speaks the IOTCM protocol at the domain level (goals, expressions, backend/compile, scope, search).
- Contains: The `AgdaSession` class and its lifecycle/dispatch/load helper siblings, domain operation modules (`*-operations.ts`, `advanced-queries.ts`), agent-UX helper barrel, shared types, static JSON data (`data/`).
- Key files: `src/agda/session.ts`, `src/agda/session-process-lifecycle.ts`, `src/agda/types.ts`.

**`src/session/`:**
- Purpose: Project-aware semantics layered on top of `src/agda/` — config merging, proof-edit application, goal-position resolution, MCP registration support for load/process tools, literate-Agda extraction.
- Contains: Project config loader, edit-applicator modules, goal-position/state helpers, load-tool registration wrappers, the IOTCM transport, literate-format subdirectory.
- Key files: `src/session/agda-transport.ts`, `src/session/project-config.ts`, `src/session/apply-proof-edit.ts`.

**`src/protocol/`:**
- Purpose: Pure, side-effect-free IOTCM wire-format construction and decoding.
- Contains: Command-string builders, per-response-`kind` decoders (`responses/`), flag/option validators, static protocol data (`data/`).
- Key files: `src/protocol/command-builder.ts` (SSOT — no other module hand-builds command strings), `src/protocol/responses/`.

**`src/tools/`:**
- Purpose: MCP adapter layer — every exposed tool (`agda_load`, `agda_case_split`, `agda_give`, etc.) is registered here as a thin Zod-validated wrapper around `session`/`agda` calls.
- Contains: Per-domain registration files, the tool-envelope/registration/error/gate infrastructure, the runtime manifest, `file/` and `agent-ux/` sub-groups.
- Key files: `src/tools/register-core-tools.ts` (composition root), `src/tools/manifest.ts` (runtime SSOT for tool inventory), `src/tools/tool-envelope.ts`.

**`src/reporting/`:**
- Purpose: Structured bug-bundle/fingerprint construction for issue reporting tools.
- Contains: `bug-report.ts`.
- Key files: `src/reporting/bug-report.ts`.

**`test/`:**
- Purpose: Vitest suite split by test type, mirroring `src/` subdirectory names within `unit/` and `property/`.
- Contains: `unit/` (fast, no live Agda), `integration/` (requires `RUN_AGDA_INTEGRATION=1`, real Agda subprocess or built-server MCP harness), `property/` (fast-check generative tests), `examples/`, `fixtures/` (Agda source fixtures + JSON matrices), `helpers/` (shared harness code).
- Key files: `test/fixtures/agda/fixture-matrix.json` (SSOT for the Agda fixture matrix), `test/fixtures/e2e/mcp-tool-coverage.json` (SSOT mapping tools → e2e coverage scenarios), `test/helpers/mcp-harness.ts`.

**`scripts/`:**
- Purpose: Node maintenance scripts invoked from `package.json` — build asset copying, protocol reference refresh, continuing test runners, local MCP debugging client.
- Contains: `copy-json-assets.mjs` (post-`tsc` step copying `src/**/*.json` into `dist/`), `mcp-local-client.mjs` (stdio MCP harness CLI), `test-all-continuing.mjs`, `test-with-sentinel.mjs`, `test-release-full.mjs`, `refresh-official-protocol-references.mjs`.
- Key files: `scripts/mcp-local-client.mjs` (used via `npm run mcp:local`).

**`docs/`:**
- Purpose: Longer-form reference documentation not part of the enforced architecture doc.
- Contains: `extensions.md` (`AGDA_MCP_EXTENSION_MODULES` API), `assistant-workflows.md` (recommended agent usage patterns), `literate-agda-assessment.md`, `release-0.7.0-triage.md`.

**`schemas/`:**
- Purpose: JSON Schema shipped with the npm package for `.agda-mcp.json` editor autocomplete.
- Contains: `agda-mcp.schema.json`.
- Generated: No. Committed: Yes.

**`tooling/protocol/data/`:**
- Purpose: Cross-version Agda protocol reference metadata used by `npm run protocol:refresh:official`.
- Contains: `official-reference-sources.json` and related crawl-source metadata.

## Key File Locations

**Entry Points:**
- `src/index.ts`: Server process entrypoint (`node dist/index.js`, bin name `agda-mcp-server`).
- `src/tools/register-core-tools.ts`: Tool-registration composition root called from `main()`.

**Configuration:**
- `schemas/agda-mcp.schema.json`: JSON Schema for `.agda-mcp.json` project config.
- `src/session/project-config.ts`: Loader/merger/cache for `.agda-mcp.json` + `AGDA_MCP_DEFAULT_FLAGS`.
- `tsconfig.json`, `package.json`: Build/toolchain configuration.

**Core Logic:**
- `src/agda/session.ts`: Stateful Agda process manager — treat transport/completion changes here as high-risk (per `AGENTS.md`).
- `src/protocol/command-builder.ts`: Typed Agda command construction — prefer over hand-built command strings.
- `src/tools/manifest.ts`: Runtime SSOT for exposed tools, categories, and schema field names.

**Testing:**
- `test/fixtures/agda/fixture-matrix.json`: SSOT for the expanding Agda fixture matrix.
- `test/fixtures/e2e/mcp-tool-coverage.json`: SSOT for which built-server MCP scenario covers each exposed core tool.
- `test/helpers/mcp-harness.ts`: Shared MCP stdio test harness.

## Naming Conventions

**Files:**
- Kebab-case throughout: `session-command-dispatch.ts`, `agda-version-detection.ts`, `apply-goal-edit.ts`.
- Barrel files carry the group's collective name and re-export from focused siblings (e.g. `src/agda/agent-ux.ts`, `src/session/apply-proof-edit.ts`, `src/tools/agent-ux-tools.ts`).
- `register*` prefix identifies MCP tool-registration entry functions (`register-agda-load.ts`, `register-core-tools.ts`, `register-tool-recommend.ts`).
- `*.test.ts` suffix for all Vitest test files, colocated under `test/{unit,integration,property,examples}/<mirrored-subtree>/`.
- Static data tables use `*.json` and live under a sibling `data/` directory (`src/agda/data/`, `src/protocol/data/`, `src/tools/agent-ux/data/`).

**Directories:**
- Top-level `src/` subdirectories are named after architectural layers (`agda/`, `session/`, `protocol/`, `tools/`, `reporting/`), not features.
- `test/` mirrors `src/` layer names one level down inside `unit/` and `property/` (e.g. `test/unit/session/`, `test/property/protocol/`).
- Grouped tool sub-features get their own directory under `src/tools/` (`file/`, `agent-ux/`) rather than a flat file-per-tool layout once a group exceeds a few files.

## Where to Add New Code

**New MCP tool (exposed to clients):**
- Registration: Add to the relevant existing `src/tools/*.ts` file if it fits a current group (session, goal, expression, query, file, scope, display, backend, analysis, reporting, cache, impact, agent-ux); only create a new top-level file for a genuinely new tool family, and wire it into `src/tools/register-core-tools.ts`.
- Manifest entry: `registerManifestEntry` call inside the tool-registration wrapper (see `src/tools/manifest.ts` and `src/tools/tool-registration.ts`) — required so `agda_tools_catalog` / tool-recommendation stay accurate.
- Tests: Unit test under `test/unit/tools/`; if the tool touches live Agda, add integration coverage under `test/integration/mcp/` and register it in `test/fixtures/e2e/mcp-tool-coverage.json`.

**New Agda domain operation (new IOTCM command):**
- Implementation: Add to the matching `src/agda/*-operations.ts` file (goal, expression, advanced-queries, display, backend) using `src/protocol/command-builder.ts` for command assembly — never hand-build the IOTCM string.
- Response decoding: Add a decoder under `src/protocol/responses/` keyed on the Agda response `kind`.
- Types: Extend `src/agda/types.ts` with the new result shape.
- Tests: `test/unit/agda/`, plus a new fixture in `test/fixtures/agda/fixture-matrix.json` if the behavior depends on real Agda semantics; add live coverage under `test/integration/agda/`.

**New project-config option or load-side behavior:**
- Implementation: `src/session/project-config.ts` (schema/merge logic) + `schemas/agda-mcp.schema.json` (update the JSON Schema in lockstep).
- Tests: `test/unit/session/`, `test/property/session/` for merge-invariant coverage.

**Utilities / shared helpers:**
- Cross-layer envelope/registration helpers: `src/tools/tool-helpers.ts`, `src/tools/tool-envelope.ts`.
- Shared test helpers: `test/helpers/`.
- Static reference data: new `*.json` under the relevant `src/<area>/data/` directory, loaded via `src/json-data.ts`'s `loadJsonData()`.

**Module-size constraint when adding code:**
- Every file under `src/` must stay ≤ 500 lines. If a change would push an existing file over the limit, extract a sibling module using the established pattern: free functions that accept the owning object (e.g. `AgdaSession`) as their first argument and mutate its module-internal fields, following `session-process-lifecycle.ts` / `session-load-impl.ts` / `session-command-dispatch.ts` as the reference shape.

## Special Directories

**`test/fixtures/`:**
- Purpose: Real `.agda` source fixtures plus JSON matrices describing expected coverage.
- Generated: No.
- Committed: Yes.

**`.local-reference/agda-protocol/` (produced by `npm run protocol:refresh:official`, not present by default):**
- Purpose: Gitignored local cache of official Agda documentation pages (manifest, search index, per-page raw/pretty HTML and extracted text) used as the protocol-parity SSOT during protocol work.
- Generated: Yes (via `scripts/refresh-official-protocol-references.mjs`).
- Committed: No.

**`dist/` (build output, not present in source tree until built):**
- Purpose: Compiled JS + copied JSON assets (via `scripts/copy-json-assets.mjs`) that `package.json#main`/`#bin` point to.
- Generated: Yes (`npm run build` = `tsc -p tsconfig.json && node scripts/copy-json-assets.mjs`).
- Committed: No.

**`examples/extensions/`:**
- Purpose: Example external MCP extension modules demonstrating the `AGDA_MCP_EXTENSION_MODULES` register-function contract described in `docs/extensions.md`.
- Generated: No.
- Committed: Yes.

---

*Structure analysis: 2026-07-01*
