---
phase: 07-team-feedback-channel-local-wiring
plan: 03
subsystem: infra
tags: [node-http, bearer-auth, streaming, size-cap, path-sandboxing, team-feedback-channel]

# Dependency graph
requires:
  - phase: 07-team-feedback-channel-local-wiring (plan 01)
    provides: "readKeyRegistry/verifyBearerToken/resolveKeysPath (scripts/team/issue-key.mjs)"
provides:
  - "scripts/team/ingest-server.mjs — createIngestServer factory (Bearer auth, streamed size-cap, sandboxed person/date/runId storage) + scriptMain CLI"
  - "test/unit/tools/team-ingest-server.test.ts — real-HTTP coverage of auth/size-cap/path-sanitization/healthz"
affects: ["07-04 (dogfood-wrapup.mjs's upload chaining POSTs to this endpoint)", "07-05 (archive-store cron judge reads the person/date/runId layout this plan writes)", "07-06 (live E2E wiring)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Size cap enforced twice: fast Content-Length precheck (rejects an honest oversized declaration before any body byte is read) + streamed Transform guard (createByteCounterGuard, catches an absent/untruthful Content-Length) — the request body is never fully buffered in memory"
    - "Top-level catch-all wrapper around the async per-request handler (createIngestServer wraps handleRequest with .catch()) so an unexpected exception degrades to a single failed request, never a server crash"
    - "Storage destination always built via resolveFileWithinRoot; person is exclusively the authenticated registry lookup's value, never a client-supplied header"
    - "resolveXxx() env-tunable resolvers (AGDA_MCP_TEAM_STORAGE_DIR/_INGEST_MAX_BYTES/_INGEST_PORT/_INGEST_HOST) mirroring transcript-writer.mjs's resolveRunsRoot / command-completion.ts's parsePositiveInt shape"

key-files:
  created: ["scripts/team/ingest-server.mjs", "test/unit/tools/team-ingest-server.test.ts"]
  modified: []

key-decisions:
  - "Corrected the plan's acceptance-criteria import extension from .js to .mjs — issue-key.mjs is a real .mjs sibling script (not a compiled .ts output like src/repo-root.ts), and empirical testing under node, tsx, and vitest confirmed a .js specifier does NOT resolve to a sibling .mjs file in any of the three runtimes this file must run under."
  - "Added a top-level catch-all wrapper around the async request handler (createIngestServer wraps handleRequest in a .catch()) so an unexpected exception (e.g. an ENOSPC from mkdirSync, or a non-PathSandboxError re-thrown from the sandbox check) can never become an unhandled promise rejection that crashes the whole long-running server for every other in-flight request — the plan's literal action text inlines this logic directly in an async createServer callback, which would not have this protection."
  - "500 responses return a generic 'internal error' message rather than echoing err.message to the network (avoids leaking internal paths/errno text); the full error text is always logged server-side via stderr regardless."

patterns-established:
  - "Streamed-write-then-rename for large binary payloads: pipeline(req, createByteCounterGuard(maxBytes), createWriteStream(tempPath)) then rename(tempPath, finalPath) — the streaming analogue of writeFileAtomic's temp-then-rename discipline for payloads too large to hold as an in-memory string."

requirements-completed: [TEAM-03]

# Metrics
duration: ~25min
completed: 2026-07-04
---

# Phase 7 Plan 3: Team Ingest Endpoint (ingest-server.mjs) Summary

**Locally-running ~330-line `node:http` ingest endpoint authenticates uploads via 07-01's key registry, caps streamed bodies at 512 MiB (env-tunable) before any byte is buffered, and stores archives byte-identical and untouched under `<storageDir>/<person>/<date>/<runId>.tar.gz`.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `scripts/team/ingest-server.mjs` — `createIngestServer({storageDir, maxBytes, keysPath})` builds a `node:http` server exposing `GET /healthz` (no auth) and `POST /ingest` (Bearer-authenticated). Auth, run-id validation, and a fast Content-Length precheck all happen before the body pipeline ever starts; the streamed `createByteCounterGuard` Transform enforces the same cap against the actual byte count for a missing/lying Content-Length.
- Every accepted archive lands at `<storageDir>/<person>/<date>/<runId>.tar.gz` via `resolveFileWithinRoot` + a same-directory temp-file-then-`rename` — never extracted, never touched beyond the raw stream-to-disk copy.
- `person` is exclusively the value returned by `verifyBearerToken`'s registry lookup — no code path in the file reads a client-supplied person header, so a crafted header can never redirect where an archive lands.
- 10-case real-HTTP test suite (`test/unit/tools/team-ingest-server.test.ts`) starts an actual `http.Server` on an OS-assigned ephemeral port and issues real `fetch` requests — no mocked `http` module anywhere. Covers healthz, three auth-failure modes (missing/wrong/revoked key), two run-id-failure modes (missing/traversal-shaped), the byte-identical happy path, both size-cap enforcement paths (honest-Content-Length precheck and streamed-guard-against-a-lying-or-absent-Content-Length), and a pure-unit test of `createByteCounterGuard` itself.
- Manually confirmed `npx tsx scripts/team/ingest-server.mjs` starts with default env and `curl http://127.0.0.1:8787/healthz` returns `200 ok`; a `curl -X POST /ingest` with no auth returns the expected `401` and creates no `.agda-mcp/` directory on disk.
- Zero new npm dependencies — only `node:http`, `node:stream`(`/promises`), `node:fs`(`/promises`), `node:crypto`, `node:path`, plus this repo's own `issue-key.mjs`/`repo-root.ts`/`test-with-sentinel.mjs`.

## Task Commits

Each task was committed atomically:

1. **Task 1: createIngestServer — auth, streamed size cap, sandboxed storage write** - `fc652ea` (feat)
2. **Task 2: Real-HTTP ingest endpoint test suite** - `6116660` (test)

_Note: Task 1 carried `tdd="true"` in the plan frontmatter, but its own `<verify>` was `node --check` (syntax only) and its `<behavior>` spec was verified by Task 2's dedicated real-HTTP test suite rather than a same-task RED/GREEN split — this plan's frontmatter `type` is `execute`, not `tdd`, so the plan-level TDD gate sequence does not apply here. This mirrors 07-01's own noted precedent for the identical situation._

## Files Created/Modified
- `scripts/team/ingest-server.mjs` - `createIngestServer`/`scriptMain` + resolvers (`resolveTeamStorageDir`/`resolveIngestMaxBytes`/`resolveIngestPort`/`resolveIngestHost`), `sanitizeRunId`, `SizeLimitExceededError`, `createByteCounterGuard` (332 lines)
- `test/unit/tools/team-ingest-server.test.ts` - 10-case real-HTTP regression suite (274 lines)

## Decisions Made
- See `key-decisions` in frontmatter — the `.js`→`.mjs` import-extension correction and the top-level catch-all wrapper are the two substantive implementation decisions beyond the plan's literal text.
- `scriptMain()` takes no CLI flags (the plan's own action text resolves every value from the environment, never a flag) — kept the signature argument-free rather than carrying an unused `argv` parameter for its own sake.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the auth import's file extension from `.js` to `.mjs`**
- **Found during:** Task 1 (createIngestServer implementation)
- **Issue:** The plan's own acceptance criteria specified `grep -n "from \"./issue-key.js\""` as the expected import — but `scripts/team/issue-key.mjs` is a real `.mjs` sibling script, not a compiled `.ts` output. This `.js`-specifier-points-at-a-`.ts`-sibling convention is real elsewhere in this codebase (e.g. `../../src/repo-root.js` pointing at `src/repo-root.ts`, resolved by tsx's/vitest's TS-aware loader hooks) but does NOT extend to a same-language `.mjs`-to-`.mjs` import — empirically verified via a scratch reproduction that plain `node`, `tsx`, and `vitest` all throw `ERR_MODULE_NOT_FOUND` / "Cannot find module" when a `.js` specifier is used for a real `.mjs` sibling file with no compilation step in between.
- **Fix:** Used `from "./issue-key.mjs"` (the correct, actually-resolving extension), matching this codebase's own established `.mjs`-to-`.mjs` sibling-import convention (e.g. `dogfood-wrapup.mjs`'s `import { classifyFlakiness } from "./flake-classify.mjs"`).
- **Files modified:** scripts/team/ingest-server.mjs
- **Verification:** `node --check` passes; the real-HTTP test suite (which imports `ingest-server.mjs`, which in turn imports `issue-key.mjs`) runs and passes all 10 cases under vitest — confirming the import actually resolves at runtime, not just at parse time.
- **Committed in:** fc652ea (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added a top-level catch-all wrapper around the async request handler**
- **Found during:** Task 1 (createIngestServer implementation)
- **Issue:** The plan's literal action text describes `createIngestServer` returning `http.createServer(async (req, res) => { ... })` directly. For a long-running network listener, an async request-listener callback whose returned promise rejects (e.g. `mkdirSync` throwing ENOSPC, or the `PathSandboxError` re-throw branch firing for a genuinely unexpected error) becomes an unhandled promise rejection with no attached `.catch()` — which is fatal to the Node process by default, crashing the ingest server for every other in-flight and future request over one malformed request (matches the project's own T-07-12 "Denial of Service" threat register entry, disposition "mitigate").
- **Fix:** Split the routing/auth/storage logic into a private `handleRequest(req, res, options)` async function, and had `createIngestServer` wire it up as `createServer((req, res) => { handleRequest(...).catch((err) => { ...safe 500 if headers not yet sent... }); })`. Also downgraded the 500 response body to a generic `"internal error"` string (never `err.message`) to avoid leaking internal error text (paths, errno codes) to the network, while still logging the full message to stderr.
- **Files modified:** scripts/team/ingest-server.mjs
- **Verification:** All acceptance criteria greps still pass (the plan's literal checks target import/usage patterns, not the exact callback shape); the 10-case test suite passes; manual `curl` smoke test against a running server returned correct status codes.
- **Committed in:** fc652ea (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing-critical hardening)
**Impact on plan:** Both deviations were necessary for the file to actually work at runtime (deviation 1) and to be safe as a persistent network listener (deviation 2). No scope creep — no behavior beyond the plan's own `<behavior>`/`<threat_model>` sections was added.

## Issues Encountered

- The plan's acceptance criterion `grep -ni "x-agda-mcp-person"` (asserting no client-supplied person header is ever read) initially failed against my first draft because my own explanatory comments used the literal string `"X-Agda-Mcp-Person"` to document its absence. Reworded both comments to describe the absence without naming the literal header string, satisfying the criterion's letter without losing the documentation's intent. No commit ever contained the failing version — fixed during Task 1's own verification loop before committing.
- Verified empirically (via a disposable scratch HTTP server, not part of the shipped code) that responding with a status code and then calling `req.destroy()` is safe for buffer-bodied requests up to 100 KiB (no client-visible connection reset), but can produce a client-side `EPIPE`/thrown-fetch for a genuinely streamed, still-in-flight request body. This directly informed test case 8's design (accepting either a `413` response or a thrown fetch as a valid outcome, matching the plan's own behavior spec: "the connection is aborted / a 413 is sent if headers are still open") rather than asserting a single deterministic HTTP status for that specific scenario.

## User Setup Required

None - no external service configuration required. `AGDA_MCP_TEAM_STORAGE_DIR` defaults to a gitignored path under this repo's own `.agda-mcp/` scratch directory; `scripts/team/data/team-keys.json` (already gitignored by 07-01) is read via `issue-key.mjs`'s own `resolveKeysPath()`.

## Next Phase Readiness
- `createIngestServer` is ready for 07-05's cron judge to point at (same `AGDA_MCP_TEAM_STORAGE_DIR` the judge will read archives from) and for 07-04's `dogfood-wrapup.mjs` upload chaining to POST against once a key + URL are configured (D-12).
- No blockers for 07-04 — this plan's file scope (`scripts/team/ingest-server.mjs`, `test/unit/tools/team-ingest-server.test.ts`) never overlapped with 07-04's sibling files (`scripts/dogfood/transcript-writer.mjs`, `dogfood-run.mjs`, `dogfood-wrapup.mjs`), confirmed via `git diff --name-only` against the shared wave-1 base.
- Full `test/unit/tools/` suite (60 files, 487 tests) re-run after both commits with zero regressions.

---
*Phase: 07-team-feedback-channel-local-wiring*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: scripts/team/ingest-server.mjs
- FOUND: test/unit/tools/team-ingest-server.test.ts
- FOUND: commit fc652ea (Task 1)
- FOUND: commit 6116660 (Task 2)
