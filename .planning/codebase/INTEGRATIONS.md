# External Integrations

**Analysis Date:** 2026-07-04

## APIs & External Services

**Model Context Protocol (MCP):**
- The server itself IS an MCP integration point — it exposes Agda tooling as MCP tools over stdio JSON-RPC, consumed by MCP-compatible hosts (Claude Desktop, VS Code, GitHub Copilot coding agent, Codex CLI, Claude Code).
  - SDK/Client: `@modelcontextprotocol/sdk` (`server/mcp.js`, `server/stdio.js`)
  - Wiring: `src/index.ts` (`McpServer` + `StdioServerTransport`, constructed once, connected in `main()`)
  - Tool registration entry point: `src/tools/register-core-tools.ts` (wires ~13 `register()` functions)
  - No auth: stdio transport trusts the local process that spawned the server (typically the MCP host application)
  - Extension mechanism (in-process, still over the same stdio channel): `AGDA_MCP_EXTENSION_MODULES` env var lists colon-separated module paths/specifiers; `src/index.ts` dynamically `import()`s each and calls any exported `register*` function with `(server, session, projectRoot)`, letting third-party packages register additional MCP tools against the same shared `AgdaSession`/`McpServer` instance. Example layout under `examples/extensions/`; contract documented in `docs/extensions.md`.
- **Dogfooding proxy reuses the same stdio contract as a transparent tee**, not a new protocol: `scripts/dogfood/dogfood-run.mjs` sits between an AI agent's stdin/stdout and a spawned child `dist/index.js` real server, line-buffering and recording every JSON-RPC message (`scripts/dogfood/transcript-writer.mjs`) while forwarding it unchanged. It never constructs a second `AgdaSession` itself (issue #39 invariant) — it wraps the one child server process. The child is spawned `detached: true` so its own Agda grandchild subprocess joins the same POSIX process group and can be group-signalled if the proxy needs to force a teardown.

**Agda CLI (subprocess integration — the core external dependency):**
- The server does not link against Agda as a library; it spawns the `agda` executable as a long-lived child process in `--interaction-json` mode and speaks Agda's IOTCM/JSON interaction protocol over stdin/stdout.
  - Binary discovery/resolution order: `src/agda/binary-discovery.ts` (`findAgdaBinary`) — `AGDA_BIN` env override → repo-pinned `tooling/scripts/run-pinned-agda.sh` (if present on disk) → plain `agda` on `PATH`
  - Process spawn: `src/agda/agda-process-spawn.ts` (`spawnAgdaProcess`) — `spawn(agdaBin, ["--interaction-json", ...registration.agdaArgs], { cwd: repoRoot, env: { ...process.env, AGDA_DIR }, stdio: ["pipe","pipe","pipe"] })`
  - Transport/wire-format parsing: `src/session/agda-transport.ts`, `src/agda/response-parsing.ts`, `src/agda/parse-load-responses.ts`, `src/agda/normalize-response.ts`
  - Command construction (SSOT, no hand-built IOTCM strings elsewhere): `src/protocol/command-builder.ts`, `src/protocol/command-line-options.ts`
  - Process lifecycle (spawn/respawn/terminate): `src/agda/session-process-lifecycle.ts`, `src/agda/agda-process-spawn.ts` (`terminateAgdaProcess` — SIGTERM then SIGKILL escalation after a 3s grace period, `DEFAULT_TERMINATE_GRACE_MS`, escalation timer is `unref()`'d)
  - Version detection: `src/agda/agda-version.ts`'s `detectAgdaVersion()` uses `execSync("agda --version", ...)` (a hardcoded literal string, not attacker-influenceable, so `execSync` is safe here); `src/index.ts` uses `execFileSync` (never `execSync`) specifically because `agdaBin`/`AGDA_MCP_ROOT` there ARE attacker-influenceable env-derived values — an inline SECURITY comment documents the CWE-78 (shell-injection) rationale for that choice
  - Compatibility contract: `package.json`'s `agdaMcpServer.{minAgdaVersion,maxTestedAgdaVersion}` block, read once and cached by `src/server-version.ts`; classified against a detected version via `classifyAgdaAgainstSupportedRange()` and surfaced as a non-blocking stderr warning at startup (`describeOutOfRangeWarning()`)
  - Session state/dispatch: `src/agda/session.ts`, `src/agda/session-command-dispatch.ts`
  - **Reused by the oracle-triad replay pipeline**, not only the live MCP session: `scripts/oracle/cold-agda-session.mjs` spawns a fresh, independent `agda --interaction-json` process to cold-rerun a captured proof outside the live session (the "cold-rerun differential" leg of the false-green defense described in project memory). Critically, `scripts/oracle/orcl-01-differential.mjs` re-spawns Agda using the **original capture's own recorded** `manifest.agdaBinaryPath` (`execFileSync(artifact.manifest.agdaBinaryPath, ["--version"], ...)`, argv-array form since that path is untrusted artifact data) rather than re-running `findAgdaBinary()` — this guarantees the differential replays against the exact binary that produced the original verdict, not whatever binary happens to be on the judging machine's `PATH` today.

**Agda Library Registration (filesystem-based, not a network integration):**
- `src/agda/library-registration.ts` builds a per-session `AGDA_DIR` workspace: reads existing `libraries`/`defaults` config from `~/.agda` (or `AGDA_DIR` if set), auto-discovers `*.agda-lib` files in the project root, merges them, and writes a synthesized `libraries`/`defaults` pair into a temp dir (`mkdtempSync(join(tmpdir(), "agda-mcp-libs-"))`) unless `AGDA_DIR` points at an existing stable directory
- Cleanup via `LibraryRegistration.cleanup()`, invoked on session destroy

**GitHub (issue tracker + Actions, two independent integration points):**
- **CI/CD** — see the "CI/CD & Deployment" section below.
- **One-way, optional issue mirror** (`scripts/queue/mirror-github.mjs`, QUEUE-04): publishes fix-queue entries (`test/fixtures/fix-queue.json`, always the authoritative source of truth) to this repo's public GitHub issue tracker via the `gh` CLI, never the GitHub REST/GraphQL API directly.
  - Requires the `gh` CLI installed and authenticated locally/in CI; `isGhAvailable()` probes `gh --version` + `gh auth status` and degrades to a no-op (never a hard failure) if either check fails
  - **Dry-run by default** — `mirrorEntry()` only calls `execFileSync("gh", ...)` when the caller passes `options.execute === true`; the CLI itself requires the literal `--execute` flag
  - Idempotent upsert: an entry with an existing `githubIssue` backlink or a pre-existing `issue[]` number routes to `gh issue edit`, never a second `gh issue create`
  - Only entries at `triaged` status or later are eligible (`isEntryMirrorEligible`) — raw `new` intake is never auto-published
  - Payload whitelist (D-11): only `title`/`summary`/`fingerprint`/`defectKind`/`triageClass`/`status` are ever read from an entry — capture-bundle content (`capturePath`/`verdictPath`/`notes`) may reference an access-gated private corpus and must never leak into the public tracker
  - Every real `gh` invocation is `execFileSync` with an argv array and `shell: false` (same CWE-78 discipline as `src/index.ts`'s own Agda version probe)

## v1.1 Team Feedback Channel (new HTTP surface)

This is the one genuinely new class of external-facing integration added in v1.1: a locally-run (not yet cloud-deployed) HTTP ingest endpoint plus an unattended cron judge, letting teammates upload real dogfooding sessions to the maintainer without a manual hand-off. **None of this is part of the published npm package** (`scripts/` is excluded from `package.json`'s `"files"` field) and none of it is documented in the public-facing `README.md` — it is maintainer/team-internal tooling only, always run from a local git checkout.

**Ingest server (`scripts/team/ingest-server.mjs`):**
- A hand-rolled `node:http` server (zero new npm dependencies) exposing exactly two routes: `GET /healthz` (plaintext `ok`) and `POST /ingest` (accepts one `.tar.gz` archive per request)
- Bind address defaults to `127.0.0.1` (loopback-only); `AGDA_MCP_TEAM_INGEST_HOST` must be explicitly set to bind non-locally — this default-safe posture is a documented security invariant (T-07-14), not an oversight
- Default port `8787` (`AGDA_MCP_TEAM_INGEST_PORT`)
- Auth: `Authorization: Bearer <key>` checked against the on-disk key registry (`scripts/team/issue-key.mjs`'s `readKeyRegistry`/`verifyBearerToken`) — the resolved `person` identity is **always** the authenticated registry lookup's own value; no client-supplied header naming a person is ever trusted, so a client can never choose its own storage subdirectory
- Run identifier: `X-Agda-Mcp-Run-Id` header, allowlist-validated (`sanitizeRunId`, `/^[A-Za-z0-9._-]+$/`) before it ever touches a filesystem path
- Storage layout: `<storageDir>/<person>/<date>/<runId>.tar.gz`, written via a same-directory temp-file-then-`rename()` (atomic on one filesystem); `storageDir` resolves via `AGDA_MCP_TEAM_STORAGE_DIR` or defaults to the gitignored `.agda-mcp/team/storage/` under the repo root
- Size cap: `AGDA_MCP_TEAM_INGEST_MAX_BYTES` (default 512 MiB compressed), enforced twice — a fast `Content-Length` precheck (rejects an honest oversized declaration before reading any body byte) and a streamed `createByteCounterGuard` Transform (catches an absent/untruthful `Content-Length` against the actual streamed byte count); the request body is **never** fully buffered in memory
- This endpoint **never extracts** an uploaded archive — extraction is exclusively the cron judge's job (see below), a deliberate separation of "accept and store" from "untrusted-content processing"
- Every request handler is wrapped so an unexpected exception (e.g. `ENOSPC` from `mkdirSync`) degrades to one failed request, never a server crash affecting other in-flight requests

**Key registry (`scripts/team/issue-key.mjs`):**
- Maintainer-run CLI: `npx tsx scripts/team/issue-key.mjs issue|revoke|list <person>`
- The on-disk registry (`scripts/team/data/team-keys.json`, gitignored, chmod'd `0o600` after every write) never stores a plaintext key — only `sha256(key)` per entry; the raw key is printed to stdout exactly once, at issuance
- Bearer comparison uses `crypto.timingSafeEqual`, never `===`, to avoid a timing side-channel leaking how many hash bytes matched
- `readKeyRegistry` always re-reads from disk (no in-memory cache) — a revocation takes effect on the very next lookup
- Issuing a key for a `person` who already has one **rotates** it (previous hash discarded, stops verifying immediately)
- Prints an explicit consent statement at issuance naming exactly what an upload contains: structured captures, full run reports/transcripts, and **complete, unredacted** agent session logs (Claude Code / Codex) — nothing is filtered or redacted before upload

**Sandboxed archive extraction (`scripts/team/archive-extract.mjs`):**
- Only ever invoked by the cron judge (never a standalone CLI); extracts an ingested `.tar.gz` under two independent defense layers, neither of which trusts the `tar` binary's own guards alone:
  1. **Pre-extraction**: `tar -tf` lists every entry before any bytes are extracted — an absolute path or a `..` segment anywhere rejects the whole archive before `tar -x` ever runs. A second, verbose `tar -tvf` listing additionally rejects any hard-link-type entry (a hard link's name can look safe while its header linkname points at an arbitrary pre-existing file on the same filesystem — invisible to both the plain listing and to a symlink check).
  2. **Post-extraction**: every extracted entry's canonical (symlink-resolved) path is re-verified to stay within the scratch directory via `src/repo-root.ts`'s `resolveExistingPathWithinRoot`.
- Extraction is **bounded, never fire-and-forget**: `tar -x` is spawned asynchronously while the scratch directory's cumulative on-disk size is polled every 500ms; a breach mid-extraction SIGKILLs `tar` and removes the scratch dir immediately rather than waiting for a decompression bomb to finish writing
- Ceilings: `DEFAULT_MAX_DECOMPRESSED_BYTES` = 5 GiB (independent of the 512 MiB compressed HTTP-layer cap), `DEFAULT_MAX_ENTRY_COUNT` = 5000 (guards against a many-tiny-files archive that compresses well but is expensive to materialize as inodes)
- Every real subprocess/filesystem primitive accepts a `deps` override for dependency-injected testing, mirroring this codebase's existing DI convention

**Unattended cron judge (`scripts/team/cron-ingest-wrapup.mjs`):**
- Run with `npx tsx scripts/team/cron-ingest-wrapup.mjs [--no-push] [--rerun-n <N>] [--storage-dir <path>] [--queue-path <path>]`
- Discovers every archive under `<storageDir>/<person>/<date>/*.tar.gz` without a sibling `<archive>.processed.json` marker, extracts each via the sandboxed extractor above, and drives every staged capture through the **same unchanged** oracle-triad + N-rerun flake-gate + queue-intake pipeline local dogfooding already uses (`scripts/dogfood/dogfood-wrapup.mjs`'s `wrapUpCapture`, imported as a function — never re-invoked as a subprocess)
- Policy-key resolution is strict: resolves `policyKey` **only** from the archive's own recorded `taskManifestCorpora` via the `fuel-corpora.json` lookup — never re-derived from a `.agda-lib` file inside the extracted scratch dir, which would repeat a known false-positive-prone anti-pattern this project's backlog-digestion phase exists to close. A corpus-bearing bundle whose policy key cannot be resolved is a loud, terminal per-archive error, never a silent fallback.
- Idempotency: a `<archive>.processed.json` sidecar marks every judged archive (success or terminal failure) so a cron tick never re-pays the extraction+judging cost for the same archive
- Server-version skew between capture time and judge time is recorded (as a queue-entry annotation) but never gates or invalidates a verdict
- Write-back guard (CR-01): an automated write-back refuses to overwrite **any** existing queue entry whose status is not `"new"` (i.e. anything a human has already triaged/started fixing/locked/rejected) — a colliding fingerprint from an untrusted upload is refused with a loud stderr warning and recorded as a `terminal-conflict`, never silently applied
- Write-back (D-01/D-02): once at least one capture across the run was filed, the queue JSON (`test/fixtures/fix-queue.json`) is `git commit`'d and (absent `--no-push`) `git push`'d directly to the current branch — every real `git` call is `execFileSync` argv-array + `shell: false`
- Run summaries (counts, abstention rate, version-skew count, terminal-conflict count) persist to `.agda-mcp/team/cron-runs/<timestamp>.json`

**Dogfood-side upload client (`scripts/dogfood/upload-run.mjs`, TEAM-02):**
- Packs a finished dogfooding run's `.agda-mcp/runs/<run-id>/` artifacts, its staged captures, and matching Claude Code / Codex session logs (`scripts/dogfood/agent-log-selection.mjs`) into a `.tar.gz` (macOS AppleDouble metadata excluded via `COPYFILE_DISABLE=1` + `--exclude` globs) and POSTs it with a Bearer key to the ingest endpoint
- **Mechanical no-op gate**: with `AGDA_MCP_TEAM_UPLOAD_KEY`/`AGDA_MCP_TEAM_UPLOAD_URL` unset, `runUploadForRun()` returns before constructing any archive or touching `fetch` — zero network behavior by construction
- **Fail-open** (D-12): a failed upload (unreachable URL, non-2xx, any thrown error) never throws out of `runUploadForRun` and never sets a non-zero exit code; the packed archive is preserved under a pending-uploads directory and a retry-queue entry is appended
- Bounded local retry queue (D-08): default 20 archives / 2 GiB, drop-oldest-with-a-warning when exceeded, env-tunable via `AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT`/`AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES`; guarded by an advisory `.lock` file (`acquireRetryQueueLock`, `O_CREAT|O_EXCL`, self-verifying stale-lock reclaim, fails open on sustained contention)
- Agent-log discovery (`scripts/dogfood/agent-log-selection.mjs`, empirically-confirmed conventions, not a stable public API): Claude Code project logs at `~/.claude/projects/<slugified-corpus-root>/*.jsonl`; Codex session logs at `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-*.jsonl`, matched by each file's first-line `payload.cwd`. Both selectors are best-effort — a missing directory or corrupt file degrades to "skip", never a thrown exception.
- CLI: `npx tsx scripts/dogfood/upload-run.mjs <run-id> | --retry-only`

**Planned but not yet implemented — JHU IDIES k8s deployment:**
- `.claude/skills/agda-mcp-k8s-deploy/SKILL.md` documents a planned deployment of the ingest endpoint + cron judge to the JHU IDIES `k8s-dev` cluster (shared host `dev.sites.idies.jhu.edu`, path `/agda-mcp`, modeled on a sibling project's litellm k8s deployment), feasibility-verified live against the cluster but **not yet built**: no k8s manifests, Dockerfile, or `.github/workflows/deploy.yml` exist in this repository as of this analysis. Today, the ingest server and cron judge only run locally via `npx tsx`.

## Data Storage

**Databases:**
- None. No ORM, no database client dependency in `package.json`.

**File Storage:**
- Local filesystem only:
  - Agda source files read/written directly under the resolved project root (`src/repo-root.ts` — `PROJECT_ROOT`, `resolveProjectPath`)
  - Agda's own `_build/` interface cache directory (managed by the `agda` binary itself, not by this server) — tracked/interpreted by `src/agda/agdai-cache.ts`
  - Temp directories for library registration workspaces (`node:os` `tmpdir()`/`mkdtempSync`, `src/agda/library-registration.ts`)
  - Project config file `.agda-mcp.json` at `PROJECT_ROOT`, read/cached by mtime in `src/session/project-config.ts`
  - Fix-queue flat file: `test/fixtures/fix-queue.json` — the single source of truth for the defect-tracking loop, read/written by `scripts/queue/intake.mjs`, mirrored (never authoritatively read back) to GitHub Issues
  - v1.1 team-channel storage: `.agda-mcp/team/storage/<person>/<date>/<runId>.tar.gz` (ingested archives), `.agda-mcp/team/cron-runs/*.json` (judge run summaries), `.agda-mcp/team/cron-flaky.jsonl` (flake log), `scripts/team/data/team-keys.json` (gitignored key registry)
  - v1.1 dogfood-upload local state: `.agda-mcp/team/upload-queue.jsonl` (retry queue, gitignored) plus a `pending/` archive directory

**Caching:**
- Agda's native `.agdai` interface-file cache is tracked/interpreted (not generated) by `src/agda/agdai-cache.ts`
- In-process caching of parsed library registration and project config (mtime-based invalidation), no external cache service (Redis, memcached, etc.)

## Authentication & Identity

**Auth Provider:**
- Core MCP server: none. No user-facing auth layer; trust boundary is the local process/stdio channel established by the MCP host that spawns the server. Security posture documented in `SECURITY.md`.
- v1.1 team ingest endpoint: a maintainer-issued, revocable Bearer key per person (`scripts/team/issue-key.mjs`), verified via `crypto.timingSafeEqual` against a `sha256`-hashed on-disk registry. This is the only network-facing auth surface anywhere in this codebase.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Bugsnag/etc. dependency). Errors are classified locally via `src/agda/error-classifier.ts` and surfaced through structured MCP tool-error envelopes (`src/tools/tool-errors.ts`, `src/tools/tool-envelope.ts`).

**Logs:**
- Custom lightweight logger: `src/agda/logger.ts` — `logger.trace()` (no-op unless `AGDA_MCP_DEBUG=1`) and `logger.warn()` (always active, writes to stderr, prefixed `[agda-mcp]`)
- Stderr used for startup diagnostics (e.g. missing `PROJECT_ROOT`, out-of-range Agda version warnings) — `src/index.ts`
- v1.1 team-channel run summaries are the closest thing to structured observability in this codebase: `.agda-mcp/team/cron-runs/<timestamp>.json` persists per-run counts (filed/flaky/replay-inconclusive/errors/abstention-rate/version-skews/terminal-conflicts) for the unattended cron judge, since no human watches it interactively (`scripts/team/cron-ingest-wrapup.mjs`'s `summarizeArchiveResults`)

## CI/CD & Deployment

**Hosting:**
- Published as an npm package (`agda-mcp-server`) via `publishConfig.access: "public"`; not a hosted web service. Runs wherever the consumer installs/launches it.
- The v1.1 team ingest server/cron judge are locally-run only today (see "Planned but not yet implemented" above).

**CI Pipeline (`.github/workflows/ci.yml`):**
- `verify` job (`ubuntu-latest`): checkout → Node 24 setup (`actions/setup-node`, npm cache) → `npm ci` → **`npm run typecheck:test`** (new gate: `tsc -p tsconfig.test.json --noEmit`, type-checks `src/**` and `test/**` together without a full build) → `npm audit --audit-level=high` → `npm run verify` (full test suite + `npm pack --dry-run`)
- `integration` job (`needs: verify`): checkout → installs Agda via `wenkokke/setup-agda@v2` (`agda-version: 2.7.0.1`, `agda-stdlib-version: 2.1.1`) → Node 24 setup → `npm ci` → verifies `agda --version` → `npm run test:all` with `RUN_AGDA_INTEGRATION=1`
- `.github/workflows/copilot-setup-steps.yml`: provisions Agda + Node 24 for the GitHub Copilot coding agent sandbox (triggered on `workflow_dispatch`/pushes or PRs touching that workflow file itself) so Copilot can run integration tests / use the MCP server live
- Both workflows pin third-party actions to a specific commit SHA (`actions/checkout@11bd719...`, `actions/setup-node@49933ea...`, `wenkokke/setup-agda@13475d9...`), with the version tag as a trailing comment
- No `deploy.yml` or CD workflow exists in this repository

**Maintainer-only reference-data fetch (not a runtime integration):**
- `npm run protocol:refresh:official` (`scripts/refresh-official-protocol-references.mjs`) is a manual, maintainer-invoked tool that `fetch()`es the official Agda `Agda-Interaction-JSON`/`Agda-Interaction-Highlighting-JSON`/`Agda-Main`/`Agda-Interaction-Library` Haddock documentation pages from `agda.github.io` (sources pinned in `tooling/protocol/data/official-reference-sources.json`) and writes them to the gitignored `.local-reference/agda-protocol/` for manual protocol-parity cross-checking. This never runs automatically (not part of `build`, `test`, or CI) and the server has no runtime dependency on network access to `agda.github.io`.

## Environment Configuration

See STACK.md's "Configuration" section for the full enumerated list of environment variables (core server, test gates, v1.1 team-channel, v1.1 dogfood-upload).

**Secrets location:**
- Core server: no secrets management — no `.env` files, credential files, or secret-scoped config present in the repo.
- v1.1 team channel: `scripts/team/data/team-keys.json` (the Bearer-key registry) is explicitly gitignored and chmod'd `0o600`; `AGDA_MCP_TEAM_UPLOAD_KEY` is expected to be supplied via environment variable at upload time, never committed.

## Webhooks & Callbacks

**Incoming:**
- Core MCP server: none — the only inbound channel is stdio JSON-RPC from the MCP host process (`StdioServerTransport`).
- **New in v1.1**: `POST /ingest` on the team channel's ingest server (`scripts/team/ingest-server.mjs`) is the one genuine inbound HTTP webhook-shaped surface in this codebase — see "v1.1 Team Feedback Channel" above for its full auth/size/storage contract.

**Outgoing:**
- `scripts/dogfood/upload-run.mjs`'s `uploadArchive()` — streamed `fetch(url, { method: "POST", ... })` to the team ingest endpoint, gated behind the mechanical no-key/no-url no-op check above.
- `scripts/queue/mirror-github.mjs` — `gh issue create`/`gh issue edit` (via the `gh` CLI subprocess, not a direct HTTP call) to this repo's GitHub issue tracker, dry-run by default.
- `scripts/refresh-official-protocol-references.mjs` — manual-only `fetch()` of static Agda documentation pages (see above); not part of any automated pipeline.
- No other outbound HTTP calls, webhooks, or third-party API calls exist in `src/` or `scripts/`.

---

*Integration audit: 2026-07-04*
