# External Integrations

**Analysis Date:** 2026-07-01

## APIs & External Services

**Model Context Protocol (MCP):**
- The server itself IS an MCP integration point — it exposes Agda tooling as MCP tools over stdio JSON-RPC, consumed by MCP-compatible hosts (Claude Desktop, VS Code, GitHub Copilot coding agent, custom clients).
  - SDK/Client: `@modelcontextprotocol/sdk` (`server/mcp.js`, `server/stdio.js`)
  - Wiring: `src/index.ts:17-18,184-187,246-250` (`McpServer` + `StdioServerTransport`)
  - Tool registration entry point: `src/tools/register-core-tools.ts`
  - No auth: stdio transport trusts the local process that spawned the server (typically the MCP host application)

**Agda CLI (subprocess integration — the core external dependency):**
- The server does not link against Agda as a library; it spawns the `agda` executable as a long-lived child process in `--interaction-json` mode and speaks Agda's IOTCM/JSON interaction protocol over stdin/stdout.
  - Binary discovery/resolution order: `src/agda/binary-discovery.ts` — `AGDA_BIN` env override → repo-pinned `tooling/scripts/run-pinned-agda.sh` (if present) → `agda` on `PATH`
  - Process spawn: `src/agda/agda-process-spawn.ts:100-105` — `spawn(agdaBin, ["--interaction-json", ...libraryArgs], { cwd: repoRoot, env: { ...process.env, AGDA_DIR }, stdio: ["pipe","pipe","pipe"] })`
  - Transport/wire-format parsing: `src/session/agda-transport.ts`, `src/agda/response-parsing.ts`, `src/agda/parse-load-responses.ts`, `src/agda/normalize-response.ts`
  - Command construction: `src/protocol/command-builder.ts`, `src/protocol/command-line-options.ts`
  - Process lifecycle (spawn/respawn/terminate): `src/agda/session-process-lifecycle.ts`, `src/agda/agda-process-spawn.ts` (SIGTERM then SIGKILL escalation after a 3s grace period, `DEFAULT_TERMINATE_GRACE_MS`)
  - Version detection: `src/agda/agda-version.ts` uses `execSync("agda --version", ...)`; `src/agda/agda-version-detection.ts` (async/process-based detection); `src/index.ts:147-154` uses `execFileSync` (not `execSync`) specifically to avoid shell-metacharacter injection (CWE-78) since `agdaBin`/`AGDA_MCP_ROOT` are attacker-influenceable env vars — documented inline at `src/index.ts:136-145`
  - Compatibility contract: `package.json` `agdaMcpServer.minAgdaVersion` / `maxTestedAgdaVersion`, checked in `src/server-version.ts`
  - Session state/dispatch: `src/agda/session.ts`, `src/agda/session-command-dispatch.ts`

**Agda Library Registration (filesystem-based, not a network integration):**
- `src/agda/library-registration.ts` builds a per-session `AGDA_DIR` workspace: reads existing `libraries`/`defaults` config from `~/.agda` (or `AGDA_DIR` if set), auto-discovers `*.agda-lib` files in the project root, merges them, and writes a synthesized `libraries`/`defaults` pair into a temp dir (`mkdtempSync(join(tmpdir(), "agda-mcp-libs-"))`) unless `AGDA_DIR` points at an existing stable directory (`createLibraryRegistration`, `src/agda/library-registration.ts:164-198`)
- Cleanup via `LibraryRegistration.cleanup()`, invoked on session destroy

## Data Storage

**Databases:**
- None. No ORM, no database client dependency in `package.json`.

**File Storage:**
- Local filesystem only:
  - Agda source files read/written directly under the resolved project root (`src/repo-root.ts` — `PROJECT_ROOT`, `resolveProjectPath`)
  - Agda's own `_build/` interface cache directory (managed by the `agda` binary itself, not by this server) — see `src/agda/agdai-cache.ts`
  - Temp directories for library registration workspaces (`node:os` `tmpdir()`/`mkdtempSync`, `src/agda/library-registration.ts`)
  - Project config file `.agda-mcp.json` at `PROJECT_ROOT`, read/cached by mtime in `src/session/project-config.ts`

**Caching:**
- Agda's native `.agdai` interface-file cache is tracked/interpreted (not generated) by `src/agda/agdai-cache.ts`
- In-process caching of parsed library registration and project config (mtime-based invalidation), no external cache service (Redis, memcached, etc.)

## Authentication & Identity

**Auth Provider:**
- None. The server has no user-facing auth layer; trust boundary is the local process/stdio channel established by the MCP host that spawns the server. Security posture documented in `SECURITY.md`.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Bugsnag/etc. dependency). Errors are classified locally via `src/agda/error-classifier.ts` and surfaced through structured MCP tool-error envelopes (`src/tools/tool-errors.ts`, `src/tools/tool-envelope.ts`).

**Logs:**
- Custom lightweight logger: `src/agda/logger.ts`
- Debug logging gated by `AGDA_MCP_DEBUG=1` env var (documented in `src/index.ts` help text)
- Stderr used for startup diagnostics (e.g. missing `PROJECT_ROOT`, out-of-range Agda version warnings) — `src/index.ts:118-125,165-176`

## CI/CD & Deployment

**Hosting:**
- Published as an npm package (`agda-mcp-server`) via `publishConfig.access: "public"`; not a hosted web service. Runs wherever the consumer installs/launches it.

**CI Pipeline:**
- GitHub Actions, `.github/workflows/ci.yml`:
  - `verify` job: Node 24 setup, `npm ci`, `npm audit --audit-level=high`, `npm run verify` (runs full test suite + `npm pack --dry-run`)
  - `integration` job (depends on `verify`): installs Agda via `wenkokke/setup-agda@v2` (`agda-version: 2.7.0.1`, `agda-stdlib-version: 2.1.1`), verifies `agda --version`, runs `npm run test:all` with `RUN_AGDA_INTEGRATION=1`
- `.github/workflows/copilot-setup-steps.yml`: provisions Agda + Node for the GitHub Copilot coding agent sandbox so it can run integration tests / use the MCP server live

## Environment Configuration

**Required env vars (all optional with sensible defaults — see STACK.md for full list):**
- `AGDA_MCP_ROOT` - project root for file resolution
- `AGDA_BIN` - Agda binary override
- `AGDA_DIR` - Agda library dir override
- `AGDA_MCP_DEFAULT_FLAGS`, `AGDA_MCP_EXTENSION_MODULES`, `AGDA_MCP_COMMAND_TIMEOUT_MS`, `AGDA_MCP_IDLE_COMPLETION_MS`, `AGDA_MCP_DEBUG`
- `RUN_AGDA_INTEGRATION` - gates integration tests that require a real Agda binary (used in CI and `scripts/test-all-continuing.mjs`)

**Secrets location:**
- No secrets management observed — no `.env` files, credential files, or secret-scoped config present in the repo. `.gitignore` present at repo root (contents not enumerated here per forbidden-file policy where applicable).

## Webhooks & Callbacks

**Incoming:**
- None. The only "inbound" channel is stdio JSON-RPC from the MCP host process (`StdioServerTransport`).

**Outgoing:**
- None. No outbound HTTP calls, webhooks, or third-party API calls detected in `src/`.

## Extension Mechanism (in-process plugin integration)

- `AGDA_MCP_EXTENSION_MODULES` env var lists colon-separated module paths/specifiers; `src/index.ts:222-243` dynamically `import()`s each and calls any exported `register*` function with `(server, session, projectRoot)`, letting third-party packages register additional MCP tools against the same shared `AgdaSession` and `McpServer` instance. Example extension layout under `examples/extensions/`.

---

*Integration audit: 2026-07-01*
