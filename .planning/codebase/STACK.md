# Technology Stack

**Analysis Date:** 2026-07-04

## Languages

**Primary:**
- TypeScript (target ES2022, strict mode) - All server source in `src/` (`tsconfig.json`)
- The server also parses/generates Agda source text (`.agda`/`.lagda*` files) as data, but does not compile Agda itself — it drives an external `agda` binary as a subprocess.

**Secondary:**
- JavaScript (ESM, `.mjs`) - Node scripts under `scripts/`: build helpers (`scripts/copy-json-assets.mjs`), test runners (`scripts/test-all-continuing.mjs`, `scripts/test-with-sentinel.mjs`), the local MCP client (`scripts/mcp-local-client.mjs`), the oracle-triad judging pipeline (`scripts/oracle/*.mjs`), the fix-queue tooling (`scripts/queue/*.mjs`), the dogfooding recording proxy and upload chain (`scripts/dogfood/*.mjs`), and the v1.1 team feedback channel (`scripts/team/*.mjs`)
- Shell scripting (Bash) - `tooling/scripts/run-pinned-agda.sh` (referenced/optional pinned-Agda wrapper, resolved by `src/agda/binary-discovery.ts`; not committed as a tracked file, so absent by default)

## Runtime

**Environment:**
- Node.js >= 24 (enforced via `"engines": { "node": ">=24" }` in `package.json` and `.nvmrc` = `24`; `.npmrc` sets `engine-strict=true` so an out-of-range Node fails `npm install` outright)
- Module system: native ESM (`"type": "module"` in `package.json`), compiled to `Node16` module/moduleResolution per `tsconfig.json` — every internal cross-module import must use an explicit `.js`-suffixed relative specifier (source files are `.ts`, but Node16 resolution requires the emitted-JS extension in the import path)
- Several `scripts/*.mjs` files under `scripts/dogfood/` and `scripts/team/` import sibling `src/*.ts`/`test/*.ts` files through the same `.js`-suffixed specifier convention. This only resolves correctly under `tsx` or vitest's own resolver — running one of these scripts with plain `node` fails module resolution. Every such script's header comment says "Run with: npx tsx ..." explicitly for this reason.

**Package Manager:**
- npm (pinned via `"packageManager": "npm@11.11.0"` in `package.json`)
- Lockfile: present — `package-lock.json` (`lockfileVersion: 3`)
- `.npmrc` enforces `engine-strict=true` and `package-lock=true`

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` (^1.12.0, installed 1.27.1) - MCP server framework; `McpServer` and `StdioServerTransport` used in `src/index.ts` to expose tools over stdio JSON-RPC to MCP clients (Claude Desktop, VS Code, GitHub Copilot coding agent, Codex, etc.)
- `zod` (^4.0.0, installed 4.3.6) - Runtime schema validation for tool inputs/outputs (used throughout `src/tools/*` and `src/protocol/response-schemas.ts`)

**Testing:**
- `vitest` (^4.1.2, installed 4.1.2) - Test runner; config in `vitest.config.ts` (includes `test/examples`, `test/unit`, `test/property`, `test/integration`; 30s test timeout; `passWithNoTests: true` so the data-driven, currently-empty capture-regression matrix in `test/integration/mcp/capture-regression.test.ts` doesn't fail the suite for registering zero `test()` calls)
- `@fast-check/vitest` (^0.3.0) - Property-based testing integration, used under `test/property/`

**Build/Dev:**
- `typescript` (^5.9.3, installed 5.9.3) - Compiler; `tsc -p tsconfig.json` emits to `dist/` (declarations + source maps)
- `tsx` (^4.0.0) - Dev-mode TS execution (`npm run dev` runs `tsx src/index.ts`); also the required launcher for every `scripts/*.mjs` file that imports a sibling `.ts` module via a `.js`-suffixed specifier (dogfood/team/oracle/queue scripts)
- `@types/node` (^24.5.2) - Node type definitions

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` - Defines the entire tool-registration/transport contract the server implements (`src/tools/register-core-tools.ts`, `src/tools/tool-registration.ts`)
- `zod` (^4.0.0, major-version dependency) - Powers input/output schema validation across nearly every tool definition; a breaking zod upgrade would ripple through `src/protocol/response-schemas.ts` and every `src/tools/*` file

**Infrastructure:**
- Node builtins only for runtime infra: `node:child_process` (`spawn`/`execFileSync`/`execSync`), `node:fs` (incl. `node:fs/promises`), `node:os`, `node:path`, `node:url`, `node:crypto` (`randomBytes`, `randomUUID`, `createHash`, `timingSafeEqual` — team-channel key management), `node:http` (`createServer` — the v1.1 team ingest endpoint), `node:stream`/`node:stream/promises` (streamed archive upload/ingest), `node:zlib` (`createGzip` — dogfood upload packing)
- There is no database, ORM, or HTTP client/server framework dependency anywhere in `package.json`. The v1.1 team-channel ingest endpoint (`scripts/team/ingest-server.mjs`) is a hand-rolled `node:http` server with zero new npm dependencies — this is a deliberate constraint (documented inline as "D-14: Zero new npm dependencies"), not an oversight.
- No `tar`-family npm package is a dependency anywhere in `package-lock.json`. Every archive operation (dogfood upload packing, team-channel extraction) shells out to the **system** `tar` binary via `node:child_process.spawn`/`execFileSync` with an argv array and `shell: false` — never `execSync` with a shell string, and never a JS tar library.
- `"files"` in `package.json` is `["dist", "README.md", "LICENSE", "schemas"]` — the entire `scripts/` directory (dogfood proxy, team channel, oracle, queue tooling) is excluded from the published npm package by construction. These are maintainer/dogfooding-only tooling, always run from a local git checkout, never available to a consumer who only `npm install`s the package.

## Configuration

**Environment:**
- Configured entirely through environment variables read directly via `process.env` (no `.env` file loading library / dotenv dependency observed)
- Core server env vars (documented in `src/index.ts` `--help` text and `README.md`):
  - `AGDA_MCP_ROOT` - project root Agda files resolve against (`src/repo-root.ts`, `PROJECT_ROOT_ENV_VAR`)
  - `AGDA_BIN` - explicit override for the Agda binary path (`src/agda/binary-discovery.ts`)
  - `AGDA_DIR` - Agda library directory / registration workspace (`src/agda/library-registration.ts`)
  - `AGDA_MCP_DEFAULT_FLAGS` - default CLI flags merged into every load (`src/session/project-config.ts`, `ENV_DEFAULT_FLAGS`)
  - `AGDA_MCP_EXTENSION_MODULES` - colon-separated extension module specifiers dynamically `import()`-ed at startup (`src/index.ts`)
  - `AGDA_MCP_DEBUG` - enables `logger.trace` debug logging (`src/agda/logger.ts`)
  - Timing tunables, all in `src/session/command-completion.ts`: `AGDA_MCP_COMMAND_TIMEOUT_MS` (default 120000ms), `AGDA_MCP_IDLE_COMPLETION_MS` (default 250ms), `AGDA_MCP_POST_STATUS_IDLE_MS` (default 50ms), `AGDA_MCP_LOAD_TERMINUS_IDLE_MS` (default 2000ms — the wider idle window a metas `Cmd_load` holds completion open for until it observes the documented goal-state terminus), `AGDA_MCP_WAITING_SENTRY_MS` (default 0)
  - `AGDA_MCP_CAPTURE` - set to `"1"` to enable session-capture recording (`src/agda/session-capture/recorded-transport.ts`, `src/tools/register-capture-session.ts`) — the mechanism the dogfooding proxy (`scripts/dogfood/dogfood-run.mjs`) sets unconditionally on its spawned child server
- Test-only env gates: `RUN_AGDA_INTEGRATION` (gates tests needing a real Agda binary), `RUN_AGDA_BACKEND_INTEGRATION` + `AGDA_BACKEND_EXPR` (gates/parameterizes backend-compile integration tests), `TEST_RUN_CONSOLE=verbose` (`scripts/test-all-continuing.mjs` console mode)
- v1.1 team-channel env vars (all in `scripts/team/`, none published/documented in the npm package's README — maintainer-only surface): `AGDA_MCP_TEAM_STORAGE_DIR`, `AGDA_MCP_TEAM_KEYS_PATH`, `AGDA_MCP_TEAM_INGEST_MAX_BYTES` (default 512 MiB compressed), `AGDA_MCP_TEAM_INGEST_PORT` (default 8787), `AGDA_MCP_TEAM_INGEST_HOST` (default `127.0.0.1`, loopback-only unless explicitly overridden)
- v1.1 dogfood-upload env vars (`scripts/dogfood/upload-run.mjs`): `AGDA_MCP_TEAM_UPLOAD_KEY`, `AGDA_MCP_TEAM_UPLOAD_URL` (both required together — their absence is a hard "no-op, zero network calls" gate, not a soft default), `AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH`, `AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT` (default 20), `AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES` (default 2 GiB), `AGDA_MCP_DOGFOOD_RERUN_N` (default 3, N-rerun flake gate)
- Project-level config file: `.agda-mcp.json` at the project root, validated against `schemas/agda-mcp.schema.json` (JSON Schema draft-07, `additionalProperties: false`, currently exposing one property: `commandLineOptions`); parsed/mtime-cached in `src/session/project-config.ts`. No `.agda-mcp.json` exists at this repo's own root (this server dogfoods itself against external corpora, not its own source tree).

**Build:**
- `tsconfig.json` - main build config (strict TS, `Node16` module resolution, `stripInternal`, declarations + source maps, `outDir: dist`, `rootDir: src`)
- `tsconfig.test.json` - extends `tsconfig.json`; `rootDir: "."`, `noEmit: true`, adds `vitest/globals` types, includes both `src/**/*.ts` and `test/**/*.ts` — this is what `npm run typecheck:test` type-checks (no emit)
- `vitest.config.ts` - test include globs and timeout
- `.prettierrc` - formatting (`tabWidth: 2`, `useTabs: false`); no ESLint config detected in repo root listing
- `.editorconfig` - baseline editor formatting rules (LF endings, UTF-8, 2-space indent)
- `scripts/copy-json-assets.mjs` - post-`tsc` build step that copies JSON assets (e.g. `src/**/data/*.json`) into `dist/` so `loadJsonData()` (`src/json-data.ts`) resolves them at runtime post-build

## npm Scripts (`package.json`)

**Build/run:**
- `build` - `tsc -p tsconfig.json && node scripts/copy-json-assets.mjs`
- `typecheck:test` - `tsc -p tsconfig.test.json --noEmit` — **the CI gate that type-checks `test/**` alongside `src/**` without a full build**; new in this repository's CI pipeline (`.github/workflows/ci.yml`'s `verify` job runs this before `npm run verify`)
- `start` - `node dist/index.js`
- `dev` - `tsx src/index.ts`
- `mcp:local` - `node scripts/mcp-local-client.mjs`
- `protocol:refresh:official` - `npm run build && node scripts/refresh-official-protocol-references.mjs` (maintainer-only; see INTEGRATIONS.md)

**Test:**
- `pretest` - `npm run build` (runs automatically before `npm test`)
- `test` - `vitest run`
- `test:all` / `test:compiler` / `test:integration` - all alias `node scripts/test-all-continuing.mjs` (a vitest wrapper; see `TEST_RUN_CONSOLE` above)
- `test:with-sentinel` - `node scripts/test-with-sentinel.mjs`
- `test:examples` - `vitest run test/examples/`
- `test:property` - `vitest run test/property/`
- `test:integration:raw` - `vitest run test/integration/`
- `test:integration:fixtures` - `vitest run test/integration/agda/agda-fixture-matrix.test.ts`
- `test:integration:mcp` - `vitest run test/integration/mcp/mcp-server.test.ts`
- `test:e2e` / `test:e2e:raw` - build (or not) then `vitest run test/integration/mcp/`
- `test:release:full` - `node scripts/test-release-full.mjs`
- `test:release:bugs` / `test:release:bugs:sentinel` - fixed list of release-blocking regression test files (completeness, protocol parity, release-bug matrix, library-registration matrix, load/fixture-matrix/search/library integration, MCP server e2e)
- `verify` - `npm test && npm pack --dry-run` (also the `prepublishOnly` script)

## Platform Requirements

**Development:**
- Node.js 24 (via `.nvmrc`/`engines`)
- npm 11.x
- A local `agda` binary on PATH (or `AGDA_BIN` override) for integration/e2e tests; CI installs Agda via `wenkokke/setup-agda` (`.github/workflows/ci.yml`)
- The v1.1 team-channel archive extraction (`scripts/team/archive-extract.mjs`) and dogfood upload packing (`scripts/dogfood/upload-run.mjs`) both shell out to the **system** `tar` binary — required on any machine running the ingest server or cron judge, distinct from the Agda binary requirement
- Agda compatibility contract declared in `package.json`: `"agdaMcpServer": { "minAgdaVersion": "2.6.4.3", "maxTestedAgdaVersion": "2.9.0" }`, enforced/warned via `src/server-version.ts`

**Production:**
- Distributed as an npm package (`agda-mcp-server`) with a `bin` entry (`./dist/index.js`) — runs as a CLI/stdio MCP server, not a hosted service
- No deployment target beyond "wherever Node 24 + an Agda installation are available" (e.g. local dev machine, CI runner, Claude Desktop's MCP host, VS Code MCP extension host) for the **published package**
- The v1.1 team-channel HTTP surface (`scripts/team/ingest-server.mjs` + `scripts/team/cron-ingest-wrapup.mjs`) is a separate, unpublished, locally-run maintainer service — see INTEGRATIONS.md for its deployment status (local-first; a JHU IDIES k8s deployment is planned but not yet implemented in this repo — no `.github/workflows/deploy.yml` exists yet)
- `publishConfig.access: "public"` - published to the public npm registry

---

*Stack analysis: 2026-07-04*
