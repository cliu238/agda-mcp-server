# Technology Stack

**Analysis Date:** 2026-07-01

## Languages

**Primary:**
- TypeScript (target ES2022, strict mode) - All server source in `src/`
- The server also parses/generates Agda source text (`.agda` files) as data, but does not compile Agda itself — it drives an external Agda binary.

**Secondary:**
- Shell scripting (Bash) - `tooling/scripts/run-pinned-agda.sh` (referenced/optional pinned-Agda wrapper, resolved by `src/agda/binary-discovery.ts`)
- JavaScript (ESM, `.mjs`) - Node scripts under `scripts/` (build helpers, test runners, local MCP client)

## Runtime

**Environment:**
- Node.js >= 24 (enforced via `"engines": { "node": ">=24" }` in `package.json:64` and `.nvmrc` = `24`)
- Module system: native ESM (`"type": "module"` in `package.json`), compiled to `Node16` module/moduleResolution per `tsconfig.json`

**Package Manager:**
- npm (pinned via `"packageManager": "npm@11.11.0"` in `package.json`)
- Lockfile: present — `package-lock.json`
- `.npmrc` enforces `engine-strict=true` and `package-lock=true`

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` (^1.12.0) - MCP server framework; `McpServer` and `StdioServerTransport` used in `src/index.ts` to expose tools over stdio JSON-RPC to MCP clients (Claude Desktop, VS Code, etc.)
- `zod` (^4.0.0) - Runtime schema validation for tool inputs/outputs (used throughout `src/tools/*` and `src/protocol/response-schemas.ts`)

**Testing:**
- `vitest` (^4.1.2) - Test runner; config in `vitest.config.ts` (includes `test/examples`, `test/unit`, `test/property`, `test/integration`; 30s test timeout)
- `@fast-check/vitest` (^0.3.0) - Property-based testing integration, used under `test/property/`

**Build/Dev:**
- `typescript` (^5.9.3) - Compiler; `tsc -p tsconfig.json` emits to `dist/` (declarations + source maps)
- `tsx` (^4.0.0) - Dev-mode TS execution (`npm run dev` runs `tsx src/index.ts`)
- `@types/node` (^24.5.2) - Node type definitions

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` - Defines the entire tool-registration/transport contract the server implements (`src/tools/register-core-tools.ts`, `src/tools/tool-registration.ts`)
- `zod` (^4.0.0, major-version dependency) - Powers input/output schema validation across nearly every tool definition; a breaking zod upgrade would ripple through `src/protocol/response-schemas.ts` and every `src/tools/*` file

**Infrastructure:**
- Node builtins only for runtime infra: `node:child_process` (spawn/execFileSync), `node:fs`, `node:os`, `node:path`, `node:url` — there is no database, ORM, or HTTP server dependency; the "infrastructure" this project integrates with is the external `agda` CLI binary (see INTEGRATIONS.md)

## Configuration

**Environment:**
- Configured entirely through environment variables read directly via `process.env` (no `.env` file loading library / dotenv dependency observed)
- Key env vars (documented in `src/index.ts` help text and `README.md`):
  - `AGDA_MCP_ROOT` - project root Agda files resolve against (read in `src/repo-root.ts`)
  - `AGDA_BIN` - explicit override for the Agda binary path (`src/agda/binary-discovery.ts:13`)
  - `AGDA_DIR` - Agda library directory / registration workspace (`src/agda/library-registration.ts:161,177`)
  - `AGDA_MCP_DEFAULT_FLAGS` - default CLI flags merged into every load
  - `AGDA_MCP_EXTENSION_MODULES` - colon-separated extension module specifiers dynamically `import()`-ed at startup (`src/index.ts:222-243`)
  - `AGDA_MCP_COMMAND_TIMEOUT_MS`, `AGDA_MCP_IDLE_COMPLETION_MS`, `AGDA_MCP_DEBUG`
- Project-level config file: `.agda-mcp.json` at the project root, validated against `schemas/agda-mcp.schema.json` (JSON Schema draft-07); parsed in `src/session/project-config.ts`

**Build:**
- `tsconfig.json` - main build config (strict TS, `Node16` module resolution, `stripInternal`, declarations + source maps, `outDir: dist`, `rootDir: src`)
- `tsconfig.test.json` - separate TS config for test compilation
- `vitest.config.ts` - test include globs and timeout
- `.prettierrc` - formatting (`tabWidth: 2`, `useTabs: false`); no ESLint config detected in repo root listing
- `.editorconfig` - baseline editor formatting rules
- `scripts/copy-json-assets.mjs` - post-`tsc` build step that copies JSON assets (e.g. schemas) into `dist/`

## Platform Requirements

**Development:**
- Node.js 24 (via `.nvmrc`/`engines`)
- npm 11.x
- A local `agda` binary on PATH (or `AGDA_BIN` override) for integration/e2e tests; CI installs Agda via `wenkokke/setup-agda` (`.github/workflows/ci.yml`)
- Agda compatibility contract declared in `package.json`: `"agdaMcpServer": { "minAgdaVersion": "2.6.4.3", "maxTestedAgdaVersion": "2.9.0" }`, enforced/warned via `src/server-version.ts`

**Production:**
- Distributed as an npm package (`agda-mcp-server`) with a `bin` entry (`./dist/index.js`) — runs as a CLI/stdio MCP server, not a hosted service
- No deployment target beyond "wherever Node 24 + an Agda installation are available" (e.g. local dev machine, CI runner, Claude Desktop's MCP host, VS Code MCP extension host)
- `publishConfig.access: "public"` - published to the public npm registry

---

*Stack analysis: 2026-07-01*
