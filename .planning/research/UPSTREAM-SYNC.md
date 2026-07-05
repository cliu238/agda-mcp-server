# Upstream Reconcile + Auto-Sync — Next-Milestone Seed

**Written:** 2026-07-05 (end of v1.1 close-out session). All numbers below are LIVE-MEASURED
that day, not estimates. This file is the seed for the next milestone's upstream theme —
`/gsd-new-milestone` questioning/research should treat the Decisions section as settled
(user-approved in session) and the Facts section as a measurement snapshot to re-verify
cheaply (one `git fetch upstream` + `git merge-tree`) before planning.

## Why this theme

Upstream (`InvariantHoldings/agda-mcp-server`) is actively developing the same server —
including two independent fixes to the SAME load-terminus false-green family we fixed in
03.1, and a feature commit mentioning a "0.7.0-gate". Divergence cost grows superlinearly;
both sides keep editing the same seams. The user's standing choice: manage our own repo
only (upstream-PR contribution path PARKED — our repo is NOT a GitHub fork of upstream,
so cross-repo PRs can't even be opened without new access arrangements).

## Facts (measured 2026-07-05)

- Fork point (merge-base): `e38f90a` 2026-06-30 ("fix: preserve goal IDs ... (#65,#66)").
- We are **488 ahead / 5 behind**; upstream head `d4497a2`; upstream version v0.6.8, ours 0.6.7-base.
- Upstream's 5 commits = 38 files, +1518/−411:
  - `390a502` #68 load completion rework ("wait for Agda's goal state instead of guessing; drop invented status") — 12 files +217/−304
  - `974cc38` #69 load terminus hardening ("fatal-stderr, inactivity timeout, strict false-green") — 11 files +418/−94
  - `b717ad4` #70 FEATURE: type-directed term search + new tool `agda_goal_candidates` + Mimer auto fix + "0.7.0-gate reconcile" — 17 files +801/−31 (mostly additive)
  - `9409131` v0.6.8 bump; `d4497a2` test harness: **fail suite on unexpected logger.warn** (+98, touches vitest.config.ts) — our code logger.warns in best-effort catches by convention → our ~1600-test suite may need expected-warn registrations post-merge.
- `git merge-tree` dry run: **6 real textual conflict files** — `src/agda/refactor-helpers.ts`, `src/agda/session-load-impl.ts`, `src/session/agda-transport.ts`, `src/session/command-completion.ts`, `src/tools/goal-tools.ts`, `test/unit/agda/agent-ux.test.ts`. Four of these are on the guarded load-terminus seam.
- 15 files modified by BOTH sides; upstream touches **zero** of `scripts/`, `k8s/`, `.github/`, `Dockerfile` — our loop/deploy value-add is structurally disjoint and merges clean forever.
- Upstream #68/#69 vs our 03.1 fix (`src/session/load-terminus-tracker.ts` + surroundings): two independent implementations of overlapping semantics. Our from-RED regression locks (#64/#61 flagship, RT8) are the REFEREE: if they stay green under upstream's implementation, adopt theirs and consider deleting our tracker; if red, keep ours and graft their extra hardening (fatal-stderr, inactivity timeout).

## Phase A sketch — first upstream reconcile (2–3 plans, do FIRST)

1. Mechanical merge (`git merge upstream/main` — merge, NEVER rebase: 488 published commits,
   3 pushed tags, auto-deploy-on-main) + trivial-conflict resolution + logger.warn
   test-strictness reconciliation.
2. Load-terminus semantic adjudication (the real work): per sub-behavior decide
   ours/theirs/hybrid with BOTH repos' regression suites green; from-RED locks referee.
3. Adopt #70 features: wire `agda_goal_candidates` + term search + Mimer fix into
   src/tools manifest + tool-recommendation + docs; full verify
   (local full suite w/ real Agda, `typecheck:test`, build) + one dogfood session as
   acceptance — the loop verifying its own upstream merge is the designed use.
   Push at the end = one accepted D-06 deploy; watch it green.

## Phase B sketch — auto-sync productionization (AFTER Phase A; arming before reconcile = a guaranteed escalation every 3 days)

- Policy SSOT already shipped: `.agents/skills/upstream-sync/SKILL.md` (commit `ed20063`,
  on origin) — bounded autonomy: 9 guarded files, merge-never-rebase, env-adaptive
  verification gates, push→deploy-watch→`git revert -m 1` rollback, escalation =
  `upstream-sync` branch + `gh issue`, cadence guard. Environment-adaptive by design —
  carrier swap requires zero skill edits.
- **Carrier = local headless** (launchd `StartCalendarInterval` every 3 days, catches up
  missed runs on wake; invokes `claude -p` to execute the upstream-sync skill). Strictly
  stronger gate than cloud (real Agda, `RUN_AGDA_INTEGRATION=1` full suite).
- GSD integration (user-requested, design settled): upgrade skill Section 7 bookkeeping to
  GSD-NATIVE artifacts when `gsd-sdk` is available — each sync produces a real
  `.planning/quick/<id>-upstream-sync-<date>/` (PLAN+SUMMARY) + STATE.md Quick-Tasks row,
  committed with the merge; falls back to `docs/UPSTREAM-SYNC-LOG.md` when gsd-sdk absent.
  Key insight: `.planning/` is git-tracked, so git IS the state-sync layer — no new
  mechanism. Discipline: sync job appends-only to STATE.md; user pulls before local work.
- Optional cheap watcher: scheduled GitHub Action doing fetch + `git merge-tree` dry-run →
  digest issue (zero-risk signal between syncs).
- **Cloud routine path (BLOCKED, re-arm recorded):** claude.ai org "JHU DSAI Engineering"
  has GitHub sync unavailable at ORG level ("GitHub sync isn't available for your
  organization" — verified in browser 2026-07-05; RemoteTrigger create = 401 thrice).
  GitHub App itself IS installed (installation 99276110, All repositories). Re-arm: org
  admin enables GitHub sync → re-run the 9-step probe verbatim (in
  `.planning/quick/260705-79k-*/260705-79k-PLAN.md` Task 2; extended version adds a
  gsd-sdk cloud-availability step + gh-issue report delivery) → if `TOOLCHAIN: green` +
  `PUSH_TO_MAIN: possible`, arm every-3-days routine. Cloud gate would be the DEGRADED
  verification (no Agda: unit/property + quarantine lanes only) — acceptable, documented
  in the skill.

## Settled decisions (do not relitigate at discuss-phase)

- Manage own repo only; upstream-PR path parked.
- Merge, never rebase. Real merges to main (not PR-parking) once verification gates pass — bounded autonomy with the guarded-file list as the hard line.
- Reconcile BEFORE arming any recurring sync.
- Sync cadence: every 3 days; never tighter than daily without adding a `concurrency:`
  group to `deploy-ingest.yml` (known Info-level gap). Never fall >1 upstream minor behind;
  sync at every milestone boundary.
- Each auto-merge push costs one accepted ~30 min D-06 deploy cycle.

## Pointers

- Skill (policy SSOT): `.agents/skills/upstream-sync/SKILL.md`
- Quick-task record incl. org-block evidence chain: `.planning/quick/260705-79k-upstream-auto-sync-via-scheduled-cloud-r/`
- v1.1 audit tech-debt ledger (other carried candidates): `milestones/v1.1-MILESTONE-AUDIT.md`
