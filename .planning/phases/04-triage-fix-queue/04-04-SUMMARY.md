---
phase: 04-triage-fix-queue
plan: 04
subsystem: infra
tags: [gh-cli, execFileSync, argv-safety, idempotent-upsert, vitest, dependency-injection]

# Dependency graph
requires:
  - phase: 04-01
    provides: fixQueueEntrySchema/fixQueue typed loader + scripts/queue/intake.mjs's readQueueFile/upsertQueueEntry primitive this plan composes with (never duplicates) for D-12 backlink persistence
provides:
  - "scripts/queue/mirror-github.mjs: dry-run-by-default, idempotent one-way GitHub Issues mirror (QUEUE-04) exporting isGhAvailable / buildMirrorPayload / isEntryMirrorEligible / mirrorEntry / scriptMain"
  - "D-12's full backlink-persistence idempotency loop: scriptMain persists a created-or-newly-linked githubIssue back onto the entry via upsertQueueEntry on --execute, never on the default dry-run path"
  - "D-11's fixed 6-field payload whitelist and D-13's triaged-or-later eligibility gate, both proven by mocked tests rather than by inspection alone"
affects: [04-05, 05-dogfooding-orchestration-fuel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dry-run-by-default automation gate: options.execute must be the literal boolean true; every other input (including a caller that omits it) takes the safe no-op path before any execFileSync call is reachable"
    - "options.deps?.execFileSync ?? execFileSync DI seam (matching scripts/oracle/run-oracle.mjs's options.deps?.spawnColdAgdaSession ?? spawnColdAgdaSession convention) so tests never shell out for real"
    - "linkedIssue = entry.githubIssue ?? entry.issue?.[0] computed once and reused by both the dry-run and execute branches — a single source of truth for create-vs-update routing, never two independently-drifting checks"

key-files:
  created:
    - scripts/queue/mirror-github.mjs
    - test/unit/tools/queue-mirror-github.test.ts
  modified: []

key-decisions:
  - "renderIssueBody deliberately renders the fingerprint as a bold label (no markdown code-span backticks) rather than backtick-quoted inline code, so the rendered gh issue body text can never itself contain a shell metacharacter — keeps every gh argv element plain text end to end, and is what the test's own injection-shape guard (assertion 3) actually verifies"
  - "The markdown-body renderer is a private, non-exported helper (renderIssueBody) rather than a 6th public export — it operates only on buildMirrorPayload's already-whitelisted output, so a future unwhitelisted FixQueueEntry field can never leak into a rendered issue body even if this function forgets to exclude it"

patterns-established:
  - "A pre-existing entry.issue[] number (RESEARCH.md Pitfall 2 — the flagship's already-open [64, 61]) is treated as fully equivalent to a mirror-assigned entry.githubIssue for create-vs-update routing purposes; only the D-12 persistence step distinguishes them (writing the mirror's own backlink once, even for an issue[]-only match)"

requirements-completed: [QUEUE-04]

# Metrics
duration: 25min
completed: 2026-07-02
---

# Phase 04 Plan 04: GitHub Issues Mirror Summary

**Dry-run-by-default, idempotent one-way GitHub Issues mirror (`scripts/queue/mirror-github.mjs`) that never shells out unless a caller explicitly passes `execute: true`, routes any pre-existing issue number (mirror-assigned or already-known) to `gh issue edit` instead of duplicating it, and persists its own newly-created/newly-linked issue number back onto the queue entry so a second run never re-creates.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-02T22:20:00Z (approx.)
- **Completed:** 2026-07-02T22:44:18Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments

- Built the mirror's 5-function public surface (`isGhAvailable`, `buildMirrorPayload`, `isEntryMirrorEligible`, `mirrorEntry`, `scriptMain`), with `mirrorEntry` never invoking `execFileSync` unless `options.execute === true` — proven, not just claimed, by an automated mocked test.
- Every real `gh` invocation (probe, create, edit) uses an argv array via `execFileSync` with `shell: false` explicit — zero shell-string interpolation anywhere in the file (`execSync` is never imported or used).
- `linkedIssue = entry.githubIssue ?? entry.issue?.[0]` is computed once immediately after the eligibility check and reused by both the dry-run and execute branches, so a pre-existing `entry.issue[]` number (the flagship's `[64, 61]`) is never mistaken for "unlinked" and duplicated — the exact live risk RESEARCH.md's Pitfall 2 named.
- Closed D-12's full multi-run idempotency loop: on a real `--execute` run, `scriptMain` persists `mirrorEntry`'s created-or-newly-linked `githubIssue` back onto the entry via `scripts/queue/intake.mjs`'s existing `upsertQueueEntry` (no new write primitive), proven end-to-end by test assertion (8): create once, persist, and a second run against the persisted entry routes to `edit`, never `create`.
- `buildMirrorPayload` whitelists exactly 6 fields (D-11) — `capturePath`/`verdictPath`/`notes` are structurally unreachable from the rendered issue body, since the renderer only ever reads the already-whitelisted payload object, never the raw entry.

## Task Commits

Each task was committed atomically:

1. **Task 1: mirror-github.mjs — dry-run-default, idempotent one-way upsert** - `98b1608` (feat)
2. **Task 2: Test the mirror — dry-run-by-default, argv-safety, idempotent branching** - `967065c` (test)

_Note: Per this plan's `<parallel_execution>` instructions, STATE.md/ROADMAP.md are intentionally NOT updated by this executor — the orchestrator handles that separately for parallel-wave plans._

## Files Created/Modified

- `scripts/queue/mirror-github.mjs` - Dry-run-by-default GitHub Issues mirror: `isGhAvailable` (never-throwing gh presence/auth probe), `buildMirrorPayload` (D-11 6-field whitelist), `isEntryMirrorEligible` (D-13 triaged-or-later gate), `mirrorEntry` (the core one-way upsert), `scriptMain` (CLI entry point + D-12 backlink persistence)
- `test/unit/tools/queue-mirror-github.test.ts` - 8 assertions covering dry-run-default, D-13 eligibility, create/update argv shape + shell:false + injection-shape guard, pre-existing `issue[]` routing (RESEARCH.md Pitfall 2), D-11 whitelist + body content, `isGhAvailable`'s never-throw contract, and D-12's full multi-run backlink-persistence round trip

## Decisions Made

- Rendered the markdown issue body without code-span backticks around the fingerprint (bold label text instead) — keeps every `gh` argv element free of shell metacharacters end to end, matching the spirit of the plan's own "lightweight injection-shape guard" test assertion.
- Kept the markdown-body renderer (`renderIssueBody`) private/non-exported rather than adding a 6th public export, since the plan's `must_haves.artifacts` names exactly 5 provided symbols (`isGhAvailable`/`buildMirrorPayload`/`isEntryMirrorEligible`/`mirrorEntry`/`scriptMain`); the rendered body is still inspectable by tests via `mirrorEntry`'s dry-run return value's `body` field.
- Added a defensive `timeout` (5s for `gh --version`/`gh auth status` probes, 15s for the real `issue create`/`issue edit` calls) to every `execFileSync` invocation, mirroring `src/index.ts`'s own established `execFileSync` call-shape convention (Rule 2 — a subprocess call to an external network-touching CLI with no timeout can hang indefinitely).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Markdown body's code-span backticks tripped the file's own injection-shape guard**
- **Found during:** Task 2, first test run (assertion 3)
- **Issue:** The initial `renderIssueBody` implementation wrapped the fingerprint in markdown code-span backticks (e.g. `` `fp-create` ``), so the rendered body string — passed as one `execFileSync` argv element — legitimately contained a backtick character. Test assertion (3)'s "no single arg string contains a backtick" injection-shape guard then failed against the function's own real output.
- **Fix:** Changed `renderIssueBody` to render the fingerprint as plain bold-label text (`**Fingerprint:** ${payload.fingerprint}`) instead of a backtick-quoted code span. No behavior change to the whitelist or routing logic — purely a rendering-format fix.
- **Files modified:** `scripts/queue/mirror-github.mjs`
- **Verification:** `npx vitest run test/unit/tools/queue-mirror-github.test.ts` — all 8 assertions green after the fix.
- **Committed in:** `967065c` (part of the Task 2 commit, since the fix was made before Task 1's implementation was ever separately verified against Task 2's test — the Task 1 commit `98b1608` already reflects the corrected renderer, as Task 1 was re-verified via `node --check` only, which cannot catch this at the syntax level; the substantive fix and its test-driven discovery are both captured here for transparency).

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cosmetic rendering fix only — no change to the mirror's safety properties, routing logic, or D-11/D-12/D-13 behavior. No scope creep.

## Issues Encountered

None beyond the auto-fixed rendering issue above.

## User Setup Required

None - no external service configuration required. `gh` CLI presence/auth is probed defensively at runtime (`isGhAvailable`) and degrades to a graceful skip if absent or unauthenticated; this plan's own verification never invokes a live `gh` command.

## Next Phase Readiness

- QUEUE-04 is complete: the fix queue can now optionally publish a non-authoritative summary to GitHub Issues, but nothing does so automatically — `scripts/queue/mirror-github.mjs` was never run with `--execute` during this plan's execution, and no live GitHub call occurred anywhere in this plan's own verification.
- The mirror composes with (rather than duplicates) 04-01's `upsertQueueEntry` write primitive, so 04-05 (priority ordering) and Phase 5 (dogfooding orchestration) can call `mirrorEntry`/`scriptMain` directly without any additional wiring.
- No blockers. The flagship's real `issue: [64, 61]` seed entry (once 04-03 lands) will be handled correctly by this mirror's `entry.issue?.[0]` fallback without any further code change.

---
*Phase: 04-triage-fix-queue*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: scripts/queue/mirror-github.mjs
- FOUND: test/unit/tools/queue-mirror-github.test.ts
- FOUND: .planning/phases/04-triage-fix-queue/04-04-SUMMARY.md
- FOUND: commit 98b1608 (Task 1)
- FOUND: commit 967065c (Task 2)
