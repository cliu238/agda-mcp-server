# Phase 11: Auto-Sync Productionization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 11-Auto-Sync Productionization
**Areas discussed:** Fire time, No-op run trace, Carrier-failure notification, Headless permission mode

**Format note:** Per the user's standing discuss-phase rules, gray areas were classified first (forced / empirical-defer / genuine-taste). Only 4 genuine-taste questions remained, so the "which areas to discuss" menu was skipped; forced conclusions were briefed inline (with forcing constraints cited) and the 4 questions asked directly in one batch, in Chinese. All forced conclusions were presented as vetoable; none were vetoed.

---

## Forced conclusions briefed (not asked — user could veto, did not)

1. Arming gated on Phase 10 completion (roadmap hard ordering constraint).
2. Carrier form locked by seed doc + SYNC-01: launchd user LaunchAgent, `StartCalendarInterval`, every 3 days, wake catch-up, `claude -p` executing the `upstream-sync` skill; skill stays policy SSOT.
3. Wrapper must pre-flight assert agda/node/gh-auth/claude-auth/clean-main and fail loudly — silent env-detection degradation to the CLOUD gate would violate SYNC-01's "real-Agda full verification gates".
4. Sync runs in a dedicated clone, not the live working checkout (correctness: clean-main requirement, dirty trees, overnight autonomous GSD sessions racing STATE.md).
5. "Commit a trace every run" excluded as an option: phase-08 D-06 locks deploy-on-every-push with no path filter ⇒ no-op pushes would burn a ~30 min deploy every 3 days.
6. SYNC-03 proof via `launchctl kickstart` of the real job, not waiting for a calendar fire.
7. Empirical items routed to research/planner: every-3-days launchd mechanism, claude CLI keychain access under launchd, timeout, log paths, plist naming, installer placement.

---

## Fire time

| Option | Description | Selected |
|--------|-------------|----------|
| 03:00 (recommended) | Mac doubles as Tailscale jump host, usually awake overnight — runs quietly at night; if asleep that night, becomes a laptop-open catch-up run (~20 min sluggish start) | ✓ |
| 12:00 noon | Mac almost certainly awake; never "open-lid lag", but runs while user is working; lunch window minimizes impact | |
| 21:00 evening | Usually awake, low work intensity; if asleep, catch-up next morning | |

**User's choice:** 凌晨 03:00(推荐)
**Notes:** Recommendation rationale (jump-host stays awake) accepted as-is.

---

## No-op run trace

| Option | Description | Selected |
|--------|-------------|----------|
| Heartbeat + watchdog (recommended) | Timestamp file + log on every run (incl. no-ops), never committed; plus a tiny daily launchd watchdog that posts a macOS notification when heartbeat >4 days stale — dead automation actively alerts. Cost: one more component | |
| Heartbeat + log only | Same timestamp file + log, no watchdog: liveness checkable any time, but a dead carrier never announces itself — relies on the user occasionally checking | ✓ |
| Fully silent (skill as written) | 0-new-commits runs leave zero trace; cleanest history; dead automation is indistinguishable from a quiet upstream | |

**User's choice:** 只留心跳+日志
**Notes:** User declined the watchdog (recommended option) — simpler wins; revisit only if a dead-carrier incident actually happens. Recorded in CONTEXT.md Deferred Ideas.

---

## Carrier-failure notification

| Option | Description | Selected |
|--------|-------------|----------|
| gh issue + macOS notification dual channel (recommended) | Wrapper failure ⇒ try `gh issue create` first (remote-visible, durable, reaches phone), then local notification; only if both fail is the log the sole record. Cost: carrier faults also leave repo issues | ✓ |
| macOS notification + log only | Zero repo noise; but a dismissed notification is gone, and away-from-machine failures go unseen | |
| gh issue only | Durable and remote; poor local immediacy, and totally silent if gh itself is what broke | |

**User's choice:** issue+本地通知双通道(推荐)
**Notes:** Applies to carrier-level failures only; skill-level policy escalations keep their existing gh-issue path unchanged.

---

## Headless permission mode

| Option | Description | Selected |
|--------|-------------|----------|
| Skip permission prompts (recommended) | `--dangerously-skip-permissions` — standard unattended practice; simple, robust to skill evolution; risk bounded by the skill's bounded-autonomy policy (guarded files, no rebase/force-push, fix-attempt cap) + dedicated-clone isolation | ✓ |
| Maintain a command allowlist | Harder mechanical boundary — claude cannot execute unlisted commands even if misled; cost: allowlist becomes a maintenance burden that must track every skill/toolchain change; one missed pattern = 3 AM false failure escalation | |

**User's choice:** 跳过权限询问(推荐)

---

## Claude's Discretion

- Every-3-days launchd expression (calendar day-array vs daily fire + interval-guard file; guard variant also covers powered-off gaps)
- claude CLI keychain/OAuth verification under a non-interactive LaunchAgent
- `claude -p` invocation form, model choice, hard timeout (~2 h suggested), log/heartbeat paths, plist label, sync-clone path, wrapper/installer repo placement (follow `scripts/` house style; `install-pinned-env.sh` precedent)

## Deferred Ideas

- SYNC-04 GitHub Action merge-tree digest (already in REQUIREMENTS.md Future)
- SYNC-05 cloud-routine carrier (parked behind org GitHub-sync re-arm path)
- Heartbeat watchdog daemon (offered and declined this session)
