# Phase 11: Auto-Sync Productionization - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning — **but execution is hard-gated on Phase 10 completing first** (settled ordering constraint: arming recurring sync before the one-time reconcile guarantees an escalation every 3 days)

<domain>
## Phase Boundary

The shipped `upstream-sync` skill (`.agents/skills/upstream-sync/SKILL.md`, policy SSOT) runs unattended every 3 days on the user's Mac via a launchd carrier invoking `claude -p`, with each run's outcome captured as GSD-native bookkeeping — so upstream divergence stops re-accumulating after Phase 10's one-time reconcile. Covers SYNC-01 (launchd carrier), SYNC-02 (GSD-native bookkeeping), SYNC-03 (one proven end-to-end headless run).

This phase builds the **carrier and bookkeeping around** the skill. The skill's merge/verify/escalate/rollback policy itself is NOT this phase's business — the only planned skill edit is the Section 7 bookkeeping upgrade already settled in `.planning/research/UPSTREAM-SYNC.md`.

</domain>

<decisions>
## Implementation Decisions

### Locked upstream of this discussion (cite, do not relitigate)
- Carrier = **local headless launchd**, user-level LaunchAgent, `StartCalendarInterval`, every 3 days, missed-while-asleep runs caught up on wake, invoking `claude -p` to execute the `upstream-sync` skill (SYNC-01 wording + seed doc; cloud carrier SYNC-05 parked, GitHub Action digest SYNC-04 deferred).
- Skill stays the policy SSOT; carrier adds zero policy; carrier swap requires zero skill edits — **except** the settled Section 7 upgrade: when `gsd-sdk` is available, each non-silent sync produces a real `.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY + STATE.md Quick-Tasks row committed with the merge; `docs/UPSTREAM-SYNC-LOG.md` fallback when gsd-sdk absent (SYNC-02).
- STATE.md discipline: sync job appends only; user pulls before local work. `.planning/` is git-tracked, so git IS the state-sync layer.
- Cadence: every 3 days; never tighter than daily without first adding a `concurrency:` group to `deploy-ingest.yml`; each merge-bearing push costs one accepted ~30 min deploy cycle (phase-08 decision "D-06": deploy on EVERY push to main, no path filter — locked, do not re-add change detection).
- Merge never rebase; guarded-file list; 2-fix-attempt bound; escalation = `upstream-sync` branch + `gh issue`; never leave main broken — all per the skill, unchanged.

### Decisions made this discussion (2026-07-05)
- **D-01 Fire time = 03:00.** Rationale: the Mac doubles as an always-on Tailscale jump host, so overnight runs usually execute quietly at 03:00; when it did sleep, the wake catch-up run at laptop-open is an accepted cost.
- **D-02 Sync runs in a dedicated clone, never the user's working checkout** (forced by correctness, user accepted): the skill requires a clean `main`; the working repo routinely has dirty trees, feature branches, and overnight autonomous GSD sessions mutating STATE.md. A 03:00 `npm ci` + full-suite run + STATE.md commit inside the live checkout would race active work. Bookkeeping reaches the working repo via origin push → user pull.
- **D-03 Real-Agda gate must be guaranteed, never silently degraded** (forced by SYNC-01's "real-Agda full verification gates"): launchd spawns with a minimal environment; without explicit PATH setup the skill's `command -v agda` env-detection would silently select the weaker CLOUD gate. The wrapper MUST pre-flight assert: `agda` present, pinned Node 24 present, `gh` authenticated, `claude` authenticated, clean `main` in the sync clone — any missing ⇒ loud carrier-level failure (D-05 channels), never a degraded run.
- **D-04 No-op trace = heartbeat + log only, no watchdog.** Every run (including 0-new-commits silent exits) touches a local timestamp/heartbeat file and appends to a log — both OUTSIDE git (no commit, no push, no deploy burn). User explicitly declined the optional daily watchdog daemon that would alert on stale heartbeat; liveness checking is manual (look at the heartbeat/log or `launchctl list` when curious). Committed-artifact-per-run was ruled out upfront: with deploy-on-every-push locked, a no-op push would burn a ~30 min deploy every 3 days.
- **D-05 Carrier-level failure notification = dual channel:** on any carrier failure (pre-flight assertion, `claude -p` crash/timeout, non-green outcome the skill didn't already handle), the wrapper first attempts `gh issue create` (durable, remote-visible), then posts a macOS notification; log always written. Skill-level policy escalations keep their existing gh-issue path unchanged — this decision covers only failures where the skill never got to act.
- **D-06 Permissions = `--dangerously-skip-permissions`** for the headless `claude -p` run, inside the dedicated clone. Safety boundary = the skill's bounded-autonomy policy (guarded files, no rebase/force-push, fix-attempt bound) + physical isolation of the sync clone. User explicitly chose this over maintaining a command allowlist (allowlist = new maintenance burden; one missed pattern = 3 AM false failure).
- **D-07 SYNC-03 proof = `launchctl kickstart` of the real job** (identical launchd execution context, env, and permissions as a calendar fire) — do not wait up to 3 days for a natural fire. The calendar config itself is verified by plist inspection; the next natural fire is a bonus confirmation. A no-op outcome (0 new upstream commits — likely right after Phase 10 merges everything) is an acceptable proof result per SYNC-03, in which case the "bookkeeping artifact" it must produce is the heartbeat/log trace (D-04), since SYNC-02's committed artifacts are defined for merge-bearing runs only.

### Claude's Discretion (research/planner resolves — do not ask the user)
- **Every-3-days launchd mechanism**: calendar day-array vs daily fire + interval-guard state file (the guard variant also covers powered-off missed runs naturally). Constraints: ~3-day effective cadence, never denser than daily, wake catch-up honored, fires at 03:00 (D-01).
- **`claude` CLI auth under launchd**: verify keychain/OAuth credential access from a non-interactive LaunchAgent context; if constrained, document the working invocation (LaunchAgents run in the user's Aqua session and normally do have keychain access — verify, don't assume).
- Exact `claude -p` invocation form (slash-command vs prompt naming the skill), model selection (default is fine), hard timeout for the run (suggest ~2 h kill), log/heartbeat file locations, plist label naming, sync-clone path convention, wrapper + installer placement in the repo (follow existing `scripts/` `.mjs` house style; installer precedent: `scripts/team/install-pinned-env.sh`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Policy & settled design (the spine of this phase)
- `.agents/skills/upstream-sync/SKILL.md` — the skill this phase productionizes; policy SSOT (guarded files, gates, escalation, bookkeeping Section 7 that this phase upgrades). The LOCAL gate block already pins the mise Node 24 PATH.
- `.planning/research/UPSTREAM-SYNC.md` — milestone seed doc; "Phase B sketch" section = this phase's settled design; "Settled decisions" section = do-not-relitigate list.
- `.planning/REQUIREMENTS.md` — SYNC-01/02/03 exact wording; SYNC-04/05 deferral records.
- `.planning/ROADMAP.md` — Phase 11 goal + success criteria; hard ordering constraint on Phase 10.

### Prior art & operational facts
- `.planning/quick/260705-79k-upstream-auto-sync-via-scheduled-cloud-r/260705-79k-SUMMARY.md` — why the cloud carrier is blocked (org GitHub-sync gate), the recorded re-arm path, and the skill-authoring verification record.
- `.planning/quick/260705-79k-upstream-auto-sync-via-scheduled-cloud-r/260705-79k-PLAN.md` — Task 2 probe prompt preserved verbatim (only relevant if the cloud gate ever opens; not this phase's work).
- `.github/workflows/deploy-ingest.yml` — top-of-file comment block documents the locked deploy-on-every-push decision (phase-08 "D-06"); no path filter, no concurrency group. This is why no-op commits are forbidden (D-04) and cadence must never beat daily.
- `docs/DEPLOY-OPERATIONS.md` — deploy watch / healthz / rollback operational reference the skill's flow steps 7–8 rely on.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.agents/skills/upstream-sync/SKILL.md` + gitignored `.claude/skills/upstream-sync` symlink — skill discovery pattern already installed locally (absolute main-repo target).
- `scripts/team/cron-ingest-wrapup.mjs` — closest analog in-repo: a sandboxed unattended cron wrapper with a bounded environment (runs as the k8s judge). Mirrors what the launchd wrapper must do locally: pin env, run, record, fail loudly.
- `scripts/team/install-pinned-env.sh` / `install-pinned-env.mjs` — installer house pattern for "reproducibly set up a pinned environment"; the launchd plist installer should follow it.
- `gsd-sdk` at `/Users/eric/.local/bin/gsd-sdk` — user-level install; wrapper must put it on PATH; works in any checkout containing `.planning/` (which is git-tracked, so the dedicated clone has it).

### Established Patterns
- Everything operational lives in the repo (`scripts/` for `.mjs`, `tooling/scripts/` for shell) with docs — the plist/wrapper/installer must be tracked + documented, not hand-configured.
- Loud-failure convention: never silently degrade (mirrors the server's error-envelope philosophy and the skill's escalate-don't-guess stance).

### Integration Points
- launchd (`~/Library/LaunchAgents/`) — new; no launchd precedent in repo (the existing cron is a k8s CronJob).
- `docs/` — carrier operations need a short runbook section (install/uninstall/kickstart/log locations), likely a sibling or extension of `docs/DEPLOY-OPERATIONS.md`.
- Skill Section 7 — the one in-skill edit (GSD-native bookkeeping upgrade per SYNC-02).

</code_context>

<specifics>
## Specific Ideas

- The Mac doubles as an always-on Tailscale jump host — that fact drove the 03:00 choice; if that machine role ever changes, revisit D-01.
- SYNC-03's most likely real-world proof outcome is a no-op (Phase 10 just merged everything upstream had) — the plan should treat "kickstart → pre-flight green → skill enters → 0 commits → silent exit → heartbeat updated" as full success, not try to manufacture a merge.

</specifics>

<deferred>
## Deferred Ideas

- **SYNC-04** — scheduled GitHub Action `merge-tree` dry-run digest issue (zero-risk between-sync signal). Already deferred in REQUIREMENTS.md Future; add via `/gsd-quick` if the blind spot hurts.
- **SYNC-05** — cloud-routine carrier; parked behind the recorded org GitHub-sync re-arm path (quick 260705-79k Task 2 probe, preserved verbatim).
- **Heartbeat watchdog daemon** — a tiny daily launchd job alerting on stale heartbeat (>4 days). Offered 2026-07-05, explicitly declined (one component too many); revisit only if a dead-carrier incident actually bites.

</deferred>

---

*Phase: 11-Auto-Sync Productionization*
*Context gathered: 2026-07-05*
