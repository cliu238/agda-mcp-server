---
name: upstream-sync
description: Use when syncing this fork (cliu238/agda-mcp-server) with upstream InvariantHoldings/agda-mcp-server, to merge, verify, push, and watch-or-roll-back within a bounded-autonomy policy — escalating instead of guessing whenever judgment is required.
---

# Upstream sync runbook

## 1. Overview

This fork's `main` (origin = cliu238/agda-mcp-server) auto-deploys to a live
JHU cluster on EVERY push (decision D-06, ~30 min cycle, an accepted cost).
Pushing to upstream (InvariantHoldings/agda-mcp-server) is deliberately
disabled — the `upstream` remote's push URL is literally
`DISABLED-push-to-cliu238-origin-instead`. Sync direction is strictly one-way:
upstream → fork.

At authoring time the divergence is 488 commits ahead / 5 behind, and the 5
upstream commits textually conflict in 6 files, 4+ of which are on the
guarded list (Section 3). The FIRST real sync is therefore EXPECTED to end in
an escalation — that is the policy working, not a bug. Automation pays for
itself from sync #2 onward.

Bounded autonomy in one line: mechanical merges proceed unattended; judgment
work always escalates.

## 2. Policy

Allowed:

- `git fetch upstream`.
- `git merge upstream/main` — MERGE, NEVER rebase: 488 published commits,
  tags like v1.1, and an auto-deploying main make history rewriting
  destructive.
- Resolving conflicts only OUTSIDE the guarded files (Section 3).
- Running the environment-appropriate verification gate (Section 5).
- Pushing main only when everything is green.
- Watching the deploy and rolling back on red (Section 4, steps 7-8).

Forbidden:

- Rebase. Force-push. Resolving guarded-file conflicts.
- Pushing with any gate red.
- Leaving main in a broken or mid-merge state.

## 3. Guarded files

Any merge conflict touching ANY of these paths = NO push to main; escalate
per Section 6:

- `src/agda/session-load-impl.ts`
- `src/agda/session-load-helpers.ts`
- `src/agda/parse-load-responses.ts`
- `src/session/agda-transport.ts`
- `src/session/command-completion.ts`
- `src/session/register-agda-load-no-metas.ts`
- `src/protocol/command-builder.ts`
- `src/agda/session-capture/**`

Why: these are the false-green-critical seams — the load/verdict/capture
pipeline this server's whole credibility rests on.

## 4. Flow

1. `git fetch upstream`.
2. `git rev-list --count main..upstream/main` — if 0, EXIT SILENTLY: no log
   entry, no commit, nothing.
3. Confirm a clean working tree on `main`, then run
   `git merge --no-ff upstream/main` with a message of the form
   `merge: upstream/main (<N> commits, through <short-sha>)`.
4. On conflicts, run `git diff --name-only --diff-filter=U`. If ANY
   conflicted path matches Section 3, go to Section 6 (escalate). Otherwise
   resolve the non-guarded conflicts and complete the merge commit.
5. Run the Section 5 verification gate for the current environment.
6. All green → `git push origin main`. This push triggers the deploy.
7. Watch the deploy:
   `gh run list --workflow=deploy-ingest.yml --branch main --limit 1` to get
   the new run id, then `gh run watch <id> --exit-status`, then
   `curl -fsS https://dev.sites.idies.jhu.edu/agda-mcp/healthz` expecting
   HTTP 200. Retry the curl a few times over several minutes — the rollout
   takes time.
8. Workflow failure OR healthz never returning 200 = deploy red → ROLLBACK:
   `git revert -m 1 <merge-commit-sha>`, push the revert, re-watch the
   workflow + healthz until green, then escalate-notify per Section 6
   (issue only — main is already safe again).
9. Append the bookkeeping entry (Section 7).

## 5. Verification gates per environment

Detect the environment: `command -v agda` succeeds → LOCAL; otherwise CLOUD.

LOCAL gate (real Agda, full suite):

```bash
export PATH="/Users/eric/.local/share/mise/installs/node/24/bin:$PATH"
npm ci
npm run build
npx tsc -p tsconfig.test.json --noEmit
RUN_AGDA_INTEGRATION=1 npx vitest run
```

`RUN_AGDA_INTEGRATION=1` is what makes the Agda-gated integration tests
actually run instead of self-skipping (the vitest.config.ts contract) —
fulfilling the locked "full, real Agda" intent. The quarantine env var stays
UNSET locally: macOS is not the quarantined lane.

CLOUD gate (no Agda; quarantine-aware, mirroring .github/workflows/ci.yml):

```bash
npm ci
npm run build
npx tsc -p tsconfig.test.json --noEmit
AGDA_MCP_CI_QUARANTINE="test/integration/mcp/dogfood-flake-classify-live.test.ts,test/integration/mcp/capture-regression.test.ts,test/unit/agda/session-capture/manifest-builder.test.ts,test/unit/tools/oracle-orcl-01.test.ts,test/unit/tools/oracle-orcl-03.test.ts" npx vitest run
```

Cloud notes: `npm ci` is engine-strict (Node >= 24) — an engine failure means
the environment cannot run this repo at all: escalate. `RUN_AGDA_INTEGRATION`
stays UNSET in cloud, so Agda-gated integration tests self-skip. The
quarantine list excludes the 5 documented pre-existing Linux-lane failures
(fix-queue fb57abbe7df6dfe8) so only NEW regressions turn the gate red; the
list above was copied from ci.yml's integration job at authoring time — if
they ever drift, ci.yml is the SSOT.

Fix-iteration bound: at most 2 fix attempts on a red gate. Still red after
2 → escalate.

## 6. Escalation

Triggers:

a. Any guarded-file conflict (Section 3).
b. A from-RED regression lock fails and the fix is not mechanically obvious.
c. Upstream adds new tools/features under `src/tools` — these need
   manifest/tool-recommendation/docs integration, which is judgment work.
d. More than 2 fix iterations with the gate still red.
e. Engine/toolchain failure in cloud.

Procedure — preserve work on a branch, never main:

1. If mid-merge on main, `git switch -c upstream-sync` (this carries the
   in-progress merge state with it; main's ref never moves). Complete a
   best-effort merge commit there — guarded-file resolutions are PROVISIONAL
   and must be flagged as unreviewed — then
   `git push -u origin upstream-sync`. If even that is untenable,
   `git merge --abort` and push nothing.
2. `gh issue create` on cliu238/agda-mcp-server with a digest: upstream
   commit range + count, conflicted files (guarded ones flagged), gate
   results so far, branch name if pushed, and exact next-human-step notes.

Hard rule: NEVER leave main broken — main is either untouched, green-merged,
or reverted-back-to-green.

## 7. Bookkeeping (env-adaptive)

The cloud environment has NO gsd-sdk — use plain `git` commits only.

Every non-silent run appends one entry to `docs/UPSTREAM-SYNC-LOG.md` (create
the file on the first append), committed WITH the merge (or with the revert,
for rollbacks). Entry fields:

- date; environment (local/cloud)
- upstream range merged (`<old>..<new>`, N commits)
- conflicted files, if any
- gate result
- deploy run id + healthz outcome
- final outcome: merged / rolled-back / escalated with issue #

Local/manual runs MAY wrap the whole sync in `/gsd-quick` instead; cloud runs
must not attempt it.

## 8. Cadence notes

The production routine runs every 3 days. Do NOT tighten the cadence below
daily without first adding a `concurrency:` group to
`.github/workflows/deploy-ingest.yml` — it has none today, and two rapid
syncs racing deploys is a known Info-level gap. Each sync push costs one
accepted ~30 min deploy cycle (D-06).
