---
phase: 07-team-feedback-channel-local-wiring
plan: 01
subsystem: auth
tags: [node-crypto, bearer-auth, timing-safe-equal, cli, key-rotation, key-registry]

# Dependency graph
requires: []
provides:
  - "scripts/team/issue-key.mjs: hash-only Bearer key registry (issueKey/revokeKey/verifyBearerToken/readKeyRegistry/writeKeyRegistry)"
  - "isValidPersonSlug/hashKey/resolveKeysPath primitives + issue|revoke|list CLI"
  - "CONSENT_STATEMENT text printed once at issuance (D-06)"
  - "scripts/team/data/team-keys.json gitignore entry (T-07-05)"
  - "12-case regression suite proving rotation/revocation/timing-safe-verify/no-plaintext/0600-mode invariants"
affects: ["07-03 (ingest endpoint auth consumes readKeyRegistry/verifyBearerToken)", "07-02 (upload key/URL wiring)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["hash-only secret registry (sha256, never plaintext)", "crypto.timingSafeEqual Bearer comparison", "chmod 0600 on every secret-file write", "resolveXxx() env-override convention extended to AGDA_MCP_TEAM_KEYS_PATH"]

key-files:
  created: ["scripts/team/issue-key.mjs", "test/unit/tools/team-issue-key.test.ts"]
  modified: [".gitignore"]

key-decisions:
  - "D-13 implemented exactly as specified: sha256 hash-only registry, crypto.timingSafeEqual comparison (never ===)"
  - "D-06 implemented: CONSENT_STATEMENT explicitly names captures (.agda-mcp/captures/), runs (.agda-mcp/runs/), and complete/unredacted agent session logs"
  - "Rotation fully replaces the registry entry (filter-then-push, never appends a second row for the same person) so the old key's hash is discarded and stops verifying the instant the new write lands"

patterns-established:
  - "Hash-only secret registry: mirrors scripts/queue/intake.mjs's read/upsert/writeFileAtomic shape 1:1, adapted for person-keyed entries with a chmod(0o600) step after every write"
  - "Bearer-token verification never throws for malformed input (undefined/empty/garbage token, malformed registry entry, or a timingSafeEqual length mismatch) — always degrades to null"

requirements-completed: [TEAM-01]

# Metrics
duration: ~9min
completed: 2026-07-04
---

# Phase 7 Plan 1: Team Key Registry (issue-key.mjs) Summary

**Maintainer-run `issue-key.mjs` CLI mints/rotates/revokes per-person Bearer keys against a gitignored, sha256-hash-only registry, verified via `crypto.timingSafeEqual`, with a 12-case regression suite proving the security invariants.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `scripts/team/issue-key.mjs` — registry primitives (`readKeyRegistry`/`writeKeyRegistry`), `issueKey`/`revokeKey`/`verifyBearerToken`, `hashKey`/`isValidPersonSlug`/`resolveKeysPath`, `CONSENT_STATEMENT`, and an `issue|revoke|list` CLI, all in one file mirroring `scripts/queue/intake.mjs`'s shape.
- Security invariants proven both manually and via automated tests: registry never stores a plaintext key (sha256 hash only), file is `chmod 0o600` after every write, Bearer comparison uses `crypto.timingSafeEqual` (never `===`), and `readKeyRegistry` never caches — a revocation is effective on the very next lookup.
- `.gitignore` updated with a literal `scripts/team/data/team-keys.json` entry under a new `# Team channel secrets` heading (T-07-05).
- 12-case test suite in `test/unit/tools/team-issue-key.test.ts` covering issuance, rotation, revocation, timing-safe-verify robustness against malformed tokens, slug validation, file mode, and CLI output leak-safety (`list` never prints `keyHash` or any 64-hex-char value; missing-subcommand prints Usage to stderr and sets `process.exitCode = 1` without calling `process.exit()`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Key registry primitives + issue/revoke/verify + CLI** - `ce120ed` (feat)
2. **Task 2: Comprehensive registry/CLI test suite** - `5330a88` (test)

_Note: Task 1 had `tdd="true"` in the plan frontmatter but is CRUD/CLI infrastructure with no `<behavior>`-driven red/green split specified beyond the acceptance criteria already covered by Task 2's full suite — Task 2 is the comprehensive test coverage for both tasks' combined surface, run and passing before commit._

## Files Created/Modified
- `scripts/team/issue-key.mjs` - Key registry CRUD, issue/rotate/revoke/verify, CONSENT_STATEMENT, and issue/revoke/list CLI (257 lines)
- `.gitignore` - Added `scripts/team/data/team-keys.json` under a new "Team channel secrets" section
- `test/unit/tools/team-issue-key.test.ts` - 12-case regression suite (225 lines)

## Decisions Made
- Used a single consistent `issuedAt` timestamp shared between the registry entry and the `issueKey` return value (computed once, before the read-filter-push-write sequence), rather than two separately-computed `Date.now()` calls, to guarantee the CLI's printed timestamp always matches what lands on disk.
- `scriptMain` always resolves the registry path via `resolveKeysPath()` (env-var-only override) — no CLI flag to override the path — matching the "flag wins over env, env is the only override otherwise" convention used project-wide, since this script has no positional slot free for a path override without ambiguity against the person argument.

## Deviations from Plan

None - plan executed exactly as written. All required exports (`readKeyRegistry`, `writeKeyRegistry`, `hashKey`, `issueKey`, `revokeKey`, `verifyBearerToken`, `isValidPersonSlug`, `resolveKeysPath`, `CONSENT_STATEMENT`, `scriptMain`) are present exactly as specified in the plan's `must_haves.artifacts`.

## Issues Encountered
- While drafting Task 2's "no subcommand" test, an assertion initially read `errSpy.mock.calls` *after* calling `errSpy.mockRestore()` — Vitest's `mockRestore()` also clears `mock.calls` (same semantics as `mockReset()`), so the assertion saw an empty array. Fixed by capturing the joined output string before the `finally` block's `mockRestore()` call. Caught and fixed during Task 2's own test-writing/verification loop, before any commit — never landed as a broken test.

## User Setup Required

None - no external service configuration required. (`scripts/team/data/team-keys.json` is created automatically, gitignored, on first `issue` invocation — no manual setup step.)

## Next Phase Readiness
- `readKeyRegistry` and `verifyBearerToken` are ready for Plan 07-03 (ingest endpoint) to import directly and authenticate uploads — this plan's interface-first ordering goal is satisfied.
- `AGDA_MCP_TEAM_KEYS_PATH` env-override is available for the ingest server / cron judge to point at the same registry file (or a k8s-Secret-backed path in Phase 8) without any code change.
- No blockers for 07-02 (upload-run.mjs) or 07-03 (ingest-server.mjs) — both were explicitly out of this plan's file scope (sibling parallel plan / wave 2) and are untouched here.

---
*Phase: 07-team-feedback-channel-local-wiring*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: scripts/team/issue-key.mjs
- FOUND: test/unit/tools/team-issue-key.test.ts
- FOUND: .planning/phases/07-team-feedback-channel-local-wiring/07-01-SUMMARY.md
- FOUND: `.gitignore` entry `scripts/team/data/team-keys.json`
- FOUND: commit ce120ed (Task 1)
- FOUND: commit 5330a88 (Task 2)
