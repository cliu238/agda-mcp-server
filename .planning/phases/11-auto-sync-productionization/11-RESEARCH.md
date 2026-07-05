# Phase 11: Auto-Sync Productionization - Research

**Researched:** 2026-07-05
**Domain:** macOS `launchd` scheduled automation + Claude Code headless (`claude -p`) carrier design
**Confidence:** HIGH

## Summary

This phase builds a **carrier**, not a policy — the `upstream-sync` skill (`.agents/skills/upstream-sync/SKILL.md`) is the already-shipped policy SSOT, and this research is scoped entirely to the launchd/wrapper/bookkeeping shell around it. Unlike most phases, almost every open question here was resolved through **direct, live, empirical verification on the target machine** rather than documentation alone, because the entire risk surface of this phase (does keychain auth survive a non-interactive launch context? does the PATH problem actually manifest? does a naive timeout actually kill things?) is machine-observable right now, cheaply and reversibly, without waiting 3 days or performing a real merge.

Three live throwaway `launchctl bootstrap`/`bootout` experiments were run against this exact Mac during this research session (all cleaned up, verified gone — see Sources): (1) a bare-PATH probe, (2) a real `claude -p` round-trip probe, (3) a macOS-notification probe. The results resolve the two highest-risk open questions decisively: **launchd's default PATH is `/usr/bin:/bin:/usr/sbin:/sbin` only** (confirms D-03's concern is real, not hypothetical), and **`claude -p` in default (non-`--bare`) mode authenticates via the macOS login keychain with zero configuration inside a real launchd LaunchAgent context** (`apiKeySource":"none"` in the captured JSON result — this is the single most important finding of this research, since the entire carrier design depends on it).

**Primary recommendation:** Use a **single daily `StartCalendarInterval` fire at 03:00** (not an enumerated day-of-month array) combined with a **wrapper-owned interval-guard state file** that no-ops (heartbeat+log only, per D-04) unless ≥3 days have elapsed since the last real invocation. Resolve all tool paths (Node 24, Agda, `gh`, `claude`, `gsd-sdk`) **once, at install time**, baked into the generated plist/wrapper config — never rely on launchd's own PATH. Enforce the ~2-hour hard timeout via Node's own `child_process.spawn({ detached: true })` + explicit process-group kill (`process.kill(-pid, "SIGTERM")`) — **not** a plain `timeout` option, which was empirically proven to leave grandchild processes (e.g. a hung `agda`) running past the deadline.

## Architectural Responsibility Map

This phase is OS/CLI automation, not a web app — tiers are adapted accordingly.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recurring schedule trigger (~3 days, wake catch-up) | OS Scheduler (`launchd`) | — | Only `StartCalendarInterval` has documented wake-catch-up coalescing [VERIFIED: man 5 launchd.plist]; no userland replacement gets this for free |
| Environment/PATH/tool pre-flight assertions | Carrier wrapper (Node script) | Installer (one-time path resolution) | Must run and fail BEFORE any LLM cost is spent (D-03); pure, fast, deterministic — no reason to pay for a `claude -p` boot to discover a missing binary |
| Merge/verify/escalate/rollback policy | Agent session (`claude -p` + SKILL.md) | — | Already-shipped policy SSOT (out of scope for this phase); carrier must add zero policy |
| GSD-native sync bookkeeping (`.planning/quick/*`, STATE.md row) | Agent session (SKILL.md Section 7, the one in-skill edit) | — | Only happens on a **non-silent** run; committed to git; NOT the wrapper's job |
| Carrier heartbeat/log (D-04) | Carrier wrapper (Node script) | — | Happens on **every** invocation including guard-exits and 0-commit silent exits; explicitly OUTSIDE git |
| Carrier-failure alerting (D-05) | Carrier wrapper (Node script) | External services (`gh issue create`, macOS Notification Center) | Wrapper-detected failures only (pre-flight, crash, timeout) — skill-level escalations keep their existing `gh issue` path |
| Credential resolution (Anthropic OAuth, GitHub) | OS Keychain / `gh` keyring | Wrapper (invocation only) | Wrapper must never read/pass secrets directly — it only invokes already-authenticated CLIs [VERIFIED: live probe, see below] |
| Sync-clone lifecycle | Installer (initial `git clone`) | Wrapper (`fetch` + assert-clean, never force-reset) | Splits "create" (rare, install-time) from "verify fresh" (every run) — matches D-03's assert-don't-degrade philosophy |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | launchd runs the `upstream-sync` skill headlessly every 3 days (`StartCalendarInterval`, missed runs caught up on wake), invoking `claude -p` with the real-Agda full verification gates | Daily-fire+interval-guard mechanism recommendation; PATH pre-flight design (guarantees the LOCAL gate is actually selected, not silently degraded); verified `StartCalendarInterval` wake-catch-up semantics; verified `claude -p` invocation form and auth |
| SYNC-02 | Sync bookkeeping is GSD-native: each sync produces a real `.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY plus a STATE.md Quick-Tasks row, committed with the merge; falls back to `docs/UPSTREAM-SYNC-LOG.md` when gsd-sdk is absent | Clarifies this is the SKILL's Section 7 job (git-committed), distinct from the wrapper's own non-git heartbeat/log (D-04); confirms `gsd-sdk` resolution is a PATH pre-flight concern, not a new mechanism |
| SYNC-03 | One real end-to-end headless carrier run proven: the scheduled invocation executes the skill through its gates (no-op or behind state both acceptable) and produces the bookkeeping artifact | Verified `launchctl kickstart` semantics ("run immediately, regardless of configured launch conditions" — identical execution context to a calendar fire); flags the interval-guard/kickstart interaction that must be handled so the proof isn't accidentally guard-blocked |

</phase_requirements>

## User Constraints (from CONTEXT.md)

### Locked Decisions (do not relitigate — cite, don't re-derive)

- Carrier = local headless launchd, user-level LaunchAgent, `StartCalendarInterval`, every 3 days, missed-while-asleep runs caught up on wake, invoking `claude -p` to execute the `upstream-sync` skill (SYNC-01; cloud carrier SYNC-05 parked, GitHub Action digest SYNC-04 deferred).
- Skill stays the policy SSOT; carrier adds zero policy; carrier swap requires zero skill edits — **except** the settled Section 7 upgrade: when `gsd-sdk` is available, each non-silent sync produces a real `.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY + STATE.md Quick-Tasks row committed with the merge; `docs/UPSTREAM-SYNC-LOG.md` fallback when gsd-sdk absent (SYNC-02).
- STATE.md discipline: sync job appends only; user pulls before local work. `.planning/` is git-tracked, so git IS the state-sync layer.
- Cadence: every 3 days; never tighter than daily without first adding a `concurrency:` group to `deploy-ingest.yml`; each merge-bearing push costs one accepted ~30 min deploy cycle (phase-08 decision "D-06": deploy on EVERY push to main, no path filter — locked, do not re-add change detection).
- Merge never rebase; guarded-file list; 2-fix-attempt bound; escalation = `upstream-sync` branch + `gh issue`; never leave main broken — all per the skill, unchanged.
- **D-01** Fire time = 03:00.
- **D-02** Sync runs in a dedicated clone, never the user's working checkout (forced by correctness).
- **D-03** Real-Agda gate must be guaranteed, never silently degraded. Wrapper MUST pre-flight assert: `agda` present, pinned Node 24 present, `gh` authenticated, `claude` authenticated, clean `main` in the sync clone — any missing ⇒ loud carrier-level failure (D-05 channels), never a degraded run.
- **D-04** No-op trace = heartbeat + log only, no watchdog. Every run (including 0-new-commits silent exits) touches a local timestamp/heartbeat file and appends to a log — both OUTSIDE git. User explicitly declined the optional daily watchdog daemon.
- **D-05** Carrier-level failure notification = dual channel: `gh issue create` first, then macOS notification; log always written. Skill-level policy escalations keep their existing gh-issue path unchanged.
- **D-06** Permissions = `--dangerously-skip-permissions` for the headless `claude -p` run, inside the dedicated clone. Safety boundary = the skill's bounded-autonomy policy + physical isolation of the sync clone.
- **D-07** SYNC-03 proof = `launchctl kickstart` of the real job (identical launchd execution context, env, and permissions as a calendar fire) — do not wait up to 3 days for a natural fire. A no-op outcome is an acceptable proof result.

### Claude's Discretion (this research resolves these)

- Every-3-days launchd mechanism: calendar day-array vs daily fire + interval-guard state file.
- `claude` CLI auth under launchd: verify keychain/OAuth credential access from a non-interactive LaunchAgent context.
- Exact `claude -p` invocation form, model selection, hard timeout, log/heartbeat file locations, plist label naming, sync-clone path convention, wrapper + installer placement in the repo.

### Deferred Ideas (OUT OF SCOPE)

- SYNC-04 — scheduled GitHub Action `merge-tree` dry-run digest issue. Already deferred in REQUIREMENTS.md Future.
- SYNC-05 — cloud-routine carrier; parked behind the recorded org GitHub-sync re-arm path.
- Heartbeat watchdog daemon — explicitly declined 2026-07-05; revisit only if a dead-carrier incident actually bites.

## Project Constraints (from CLAUDE.md)

- **File size:** Hard 500-line-per-file ceiling in `src/` (does not strictly apply to `scripts/`, but the existing `scripts/team/*.mjs` siblings stay well under this anyway and the new `scripts/sync/*.mjs` files should follow the same discipline).
- **Naming:** kebab-case filenames; camelCase functions; verb-first names (`shouldRunSync`, `assertPreflight`, `writeHeartbeat`); PascalCase types.
- **Testing:** `vitest`; test files mirror source name with `.test.ts` suffix, under `test/unit/tools/` for non-MCP `scripts/*.mjs` siblings (established precedent: `scripts/team/cron-ingest-wrapup.mjs` → `test/unit/tools/team-cron-ingest-wrapup.test.ts`).
- **Error handling / logging convention:** loud failure, never silent degradation (mirrors `ToolInvocationError`/`errorEnvelope()` philosophy in `src/`); this is the exact same discipline D-03/D-05 already impose at the carrier level.
- **Module design:** free functions taking a `deps` bag for dependency injection (used throughout `scripts/team/*.mjs` — e.g. `config.deps?.execFileSync ?? execFileSync`) — the new wrapper/installer/guard modules should follow this so pre-flight assertions are unit-testable with a stub PATH/execFileSync without real subprocess cost.
- **No database/HTTP server; only external integration is the `agda` CLI** — reinforces that this phase adds zero new runtime infrastructure beyond OS-level scheduling.
- **GSD workflow enforcement:** file-changing work must go through a GSD entry point — not directly relevant to research itself but the planner should route implementation through `/gsd-execute-phase`.

## Standard Stack

This phase installs **zero new npm/pip/cargo packages**. Its "stack" is OS-level tools and Node built-ins already present on the target machine.

### Core

| Tool | Version (this machine) | Purpose | Why Standard |
|------|------|---------|--------------|
| `launchd` / `launchctl` | Darwin 24.5.0 (macOS Sequoia-generation) | Scheduling, process supervision | The macOS-native replacement for cron; Apple's own `crontab(5)` man page states cron/at "functionality has been absorbed into launchd(8)" [VERIFIED: `man crontab` on this machine] |
| `claude` CLI | 2.1.201 [VERIFIED: `claude --version`] | Headless agent execution (`-p`/`--print`) | Already the project's chosen agent; `-p` is the documented non-interactive entry point [CITED: code.claude.com/docs/en/headless] |
| Node.js `child_process` (built-in) | Node ≥24 (project requirement) | Spawn `claude -p`, enforce hard timeout via `{detached:true}` + process-group kill | Zero new dependency; `spawn({timeout})` exists but is **insufficient alone** — see Common Pitfalls |
| `security` (macOS built-in, `/usr/bin/security`) | — | Pre-flight-verify keychain item existence (never reads the secret value) | Built-in, zero-install, matches existing `docs/DEPLOY-OPERATIONS.md` "never echo raw token" discipline |
| `gh` CLI | 2.96.0 [VERIFIED: `gh --version`] | `gh auth status` pre-flight check, `gh issue create` for D-05/escalation | Already used throughout SKILL.md and `docs/DEPLOY-OPERATIONS.md` |
| `osascript` (macOS built-in) | — | D-05's local macOS notification channel | Zero-install (built into macOS); [VERIFIED live] executes successfully without hanging from a real launchd context |
| `plutil` (macOS built-in) | — | Plist syntax validation (`-lint`) | Zero-install; [VERIFIED live] exit 0 on valid plist, exit 1 with a specific error on malformed plist |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `terminal-notifier` (already installed at `/usr/local/bin/terminal-notifier` on this machine, Homebrew formula) | Alternative to `osascript` for D-05's local notification | Only if the planner wants a dedicated Notification Center identity distinct from generic script-host attribution — **not recommended as the default** since it adds an external Homebrew-formula dependency the installer would then need to verify, for no functional gain over the already-built-in `osascript` |
| `mise` (already installed, pins project Node 24 per `.nvmrc`) | Resolves the pinned Node 24 absolute path at install time | Installer-time only — never assume mise shims are on launchd's PATH at runtime |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node `spawn({detached:true})` + manual process-group kill | GNU coreutils `timeout`/`gtimeout` | **Not installed** on this machine [VERIFIED: `which timeout`/`gtimeout` both empty] and would add a new Homebrew dependency the installer must verify; Node's own mechanism needs zero new install and was empirically proven correct (see Code Examples) |
| Daily-fire + interval-guard state file | Enumerated day-of-month array in `StartCalendarInterval` | Simpler plist (no wrapper-side state) but produces systematic 1–4 day gaps at month boundaries in BOTH directions (some gaps looser, some tighter than 3 days) — see Architecture Patterns |
| `osascript` notification | `terminal-notifier` | Slightly more control (custom icon/sender) at the cost of an extra Homebrew dependency; not worth it here |

**Installation:** N/A — no new packages. All tools above are already present on the target machine (verified live during this research session).

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new npm/pip/cargo packages — everything used (`launchd`, `security`, `osascript`, `plutil`, `gh`, `git`, Node built-ins) is either a macOS system tool or an already-installed, already-authenticated CLI the project already depends on. The Package Legitimacy Gate protocol is skipped per its own trigger condition ("any phase that installs external packages").

The one discretionary tool choice (`terminal-notifier`) is explicitly **not recommended** for adoption (see Alternatives Considered) precisely to avoid introducing a new external-package legitimacy surface where a zero-dependency built-in (`osascript`) already suffices and was verified working.

## Architecture Patterns

### System Architecture Diagram

```
   [launchd, gui/<uid> domain]
            │
            │  StartCalendarInterval {Hour:3, Minute:0}   (fires daily; wake-catch-up
            │  OR  launchctl kickstart (SYNC-03 proof, D-07)   coalesces missed fires)
            ▼
   ┌─────────────────────────────────────────────────────────┐
   │  scripts/sync/run-upstream-sync.mjs  (the CARRIER)       │
   │                                                           │
   │  1. PATH setup — prepend INSTALL-TIME-RESOLVED absolute   │
   │     dirs for node24/agda/gh/claude/gsd-sdk                │
   │           │                                                │
   │           ▼                                                │
   │  2. Interval-guard check (pure fn: now vs lastRunAt)      │
   │     ── <3 days ──▶ heartbeat + log ONLY, EXIT (no LLM $)  │
   │           │ ≥3 days (or kickstart force / first run)      │
   │           ▼                                                │
   │  3. Pre-flight assertions (D-03) — agda present, node24    │
   │     present, `gh auth status`, `claude auth status`,      │
   │     sync-clone `git fetch` + assert clean-on-main          │
   │     ── ANY FAIL ──▶ D-05 dual-channel notify, log, EXIT   │
   │           │ ALL PASS                                       │
   │           ▼                                                │
   │  4. spawn `claude -p "/upstream-sync"                      │
   │       --dangerously-skip-permissions --output-format json` │
   │     {cwd: syncClone, detached:true, PATH: resolved}        │
   │     + timer: process-group SIGTERM at ~2h, SIGKILL after   │
   │           │                                                 │
   │           ▼                                                │
   │  5. Parse JSON result (`type:"result"` event, `is_error`)  │
   │     ── crash/timeout/is_error ──▶ D-05 notify, log         │
   │     ── success ──▶ update interval-guard state, heartbeat, │
   │        log (regardless of whether the skill found 0 or N   │
   │        upstream commits — that distinction is the SKILL's) │
   └─────────────────────────────────────────────────────────┘
            │ (inside the spawned session, entirely the skill's business)
            ▼
   ┌─────────────────────────────────────────────────────────┐
   │  .agents/skills/upstream-sync/SKILL.md  (POLICY — no      │
   │  changes this phase except Section 7 bookkeeping upgrade) │
   │  fetch upstream → count → merge → guarded-file triage →   │
   │  LOCAL gate (real Agda) → push → watch deploy → rollback   │
   │  on red → Section 7: IF non-silent, commit                │
   │  .planning/quick/<id>-upstream-sync-<date>/ + STATE.md row │
   └─────────────────────────────────────────────────────────┘
            │
            ▼
   [origin (cliu238/agda-mcp-server)] ──push──▶ [deploy-ingest.yml, D-06 every-push deploy]
```

### Recommended Project Structure

```
scripts/sync/                          # NEW — mirrors scripts/team/'s themed-subdirectory pattern
├── run-upstream-sync.mjs              # launchd ProgramArguments target; orchestrates steps 1-5 above
├── interval-guard.mjs                 # pure fn: shouldRunSync(lastRunAt, now, minDays), readState/writeState
├── preflight-assertions.mjs           # assertAgdaPresent, assertNode24Present, assertGhAuth, assertClaudeAuth, assertCleanSyncClone
├── carrier-notify.mjs                 # dual-channel: tryGhIssueCreate() then tryMacNotify() (D-05)
├── install-launchd-carrier.mjs        # resolves tool paths via `which` at install time, renders + writes plist, initial `git clone`, `launchctl bootstrap`
└── uninstall-launchd-carrier.mjs      # `launchctl bootout` + remove plist (operational hygiene, mirrors install/uninstall symmetry)

test/unit/tools/                       # existing flat convention for non-MCP scripts/*.mjs siblings
├── sync-interval-guard.test.ts
├── sync-preflight-assertions.test.ts
├── sync-carrier-notify.test.ts
├── sync-run-upstream-sync.test.ts
└── sync-install-launchd-carrier.test.ts

docs/
└── UPSTREAM-SYNC-CARRIER.md           # NEW sibling to DEPLOY-OPERATIONS.md — install/uninstall/kickstart/log-locations/troubleshooting runbook

~/Library/LaunchAgents/                # OUTSIDE the repo — generated by the installer, never committed
└── com.cliu238.agda-mcp-server.upstream-sync.plist

~/.agda-mcp/upstream-sync/             # OUTSIDE the repo, HOME-relative (survives sync-clone recreation)
├── clone/                             # D-02's dedicated clone (git clone of origin, never the working checkout)
├── state.json                        # {lastWrapperTouchAt, lastClaudeInvocationAt, lastClaudeInvocationOutcome}
└── carrier.log                        # append-only, human-readable (D-04)
```

**Why `~/.agda-mcp/upstream-sync/` (home-relative) and not inside the sync clone itself:** the existing project convention already uses a `.agda-mcp/` directory name for gitignored local operational state (`.agda-mcp/runs/`, `.agda-mcp/team/cron-runs/` — both confirmed present in the working checkout). This phase echoes that naming but roots it at `$HOME` rather than inside any single checkout, because the interval-guard state and heartbeat/log MUST survive independently of the sync clone's own lifecycle — if the clone is ever deleted and recreated (the correct recovery path when D-03's pre-flight finds it unclean; see Common Pitfalls), the carrier's own cadence memory must not be lost with it. `[ASSUMED — recommended convention, not empirically forced; see Assumptions Log]`

### Pattern 1: Daily fire + wrapper-owned interval-guard (recommended cadence mechanism)

**What:** A single `StartCalendarInterval` dictionary `{Hour: 3, Minute: 0}` (Day/Weekday/Month omitted = wildcard = every day) fires the wrapper once daily. The wrapper itself reads a small JSON state file recording `lastClaudeInvocationAt`; if fewer than 3 days have elapsed, it exits immediately after touching the heartbeat/log (D-04) — never invoking `claude -p` at all.

**When to use:** This is the recommended default for SYNC-01's "every 3 days" requirement.

**Why over the alternative (enumerated day-of-month array, e.g. `Day: [1,4,7,...,28]` as N separate `<dict>` entries in the `StartCalendarInterval` array):**
- [VERIFIED: `man 5 launchd.plist`] Each `StartCalendarInterval` field (`Day`, `Hour`, etc.) takes a single integer; achieving "day 1 AND day 4 AND day 7..." requires **multiple whole dictionaries** in the array (one per day), not one dictionary with an array-valued `Day` — meaning a day-array plist needs ~10 near-duplicate `<dict>` blocks vs. the daily approach's single block.
- The day-array approach produces **systematic month-boundary drift in both directions**: e.g. with days `1,4,7,...,28`, a 31-day month's last hit (day 28) to the next month's first hit (day 1) is a 4-day gap; a 28-day February's day-28 hit to March 1 is only a 1-day gap. Neither direction is a hard policy violation (the 1-day case is still ≤1/day, never denser-than-daily; the 4-day case never breaks "never tighter than daily" either) but both drift away from the intended ~3-day cadence in ways that compound unpredictably across the year.
- The daily+guard approach's drift is **one-directional and self-correcting**: gaps are always ≥3 days (guard blocks anything sooner) and only exceed 3 days if the Mac was genuinely asleep through some 03:00 fires — which is exactly the case StartCalendarInterval's wake-catch-up coalescing (below) already handles gracefully.
- The interval-guard's elapsed-time check is a **pure, trivially unit-testable function** (`shouldRunSync(lastRunAt, now, minDays)`), which composes cleanly with this phase's Nyquist validation requirements (see Validation Architecture) — the day-array approach has no equivalent testable logic, only a bigger plist to eyeball.
- The interval-guard's "last run" update **naturally composes with D-07's kickstart proof**: on first install there is no state file yet, so the guard's first-ever check has nothing to compare against and must allow the run through (a "fail open toward running" default — see Common Pitfalls for the corollary about NOT treating a missing/corrupt state file as "block forever").

**Example (plist skeleton):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cliu238.agda-mcp-server.upstream-sync</string>
    <key>ProgramArguments</key>
    <array>
        <!-- ABSOLUTE path, resolved by the installer at install time via `which node`
             (or process.execPath if the installer itself runs under the pinned Node).
             launchd does NOT do PATH lookup for ProgramArguments[0] — see Common Pitfalls. -->
        <string>/Users/eric/.local/share/mise/installs/node/24/bin/node</string>
        <string>/Users/eric/projects6/agda-mcp-server/scripts/sync/run-upstream-sync.mjs</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>3</integer>
        <key>Minute</key><integer>0</integer>
        <!-- Day/Weekday/Month omitted = wildcard = fires every day; the wrapper's
             own interval-guard (Pattern 1) enforces the real ~3-day floor. -->
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/eric/.agda-mcp/upstream-sync/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/eric/.agda-mcp/upstream-sync/launchd-stderr.log</string>
</dict>
</plist>
```
*(Source: synthesized from `man 5 launchd.plist` [VERIFIED locally] + this project's own local precedent `~/Library/LaunchAgents/com.eric.llm-proxy.plist` [VERIFIED locally, absolute-interpreter-path ProgramArguments style].)*

### Pattern 2: Hard-timeout enforcement via process-group kill, not `spawn({timeout})` alone

**What:** Spawn `claude -p` with `{ detached: true }` (making it the leader of a new POSIX process group), track a manual timer, and on timeout call `process.kill(-child.pid, "SIGTERM")` (negative PID targets the whole group), escalating to `SIGKILL` after a grace period.

**When to use:** Any time the spawned process may itself fork subprocesses (here: `claude -p` running an agentic session that shells out to `git`, `npm`, `agda`, `gh` — exactly the workload SKILL.md describes) and a wall-clock cap must be guaranteed.

**Why not the simpler `spawn(cmd, args, { timeout: ms })` option:** [VERIFIED live, this session — see Common Pitfalls for the full reproduction] Node's built-in `timeout` option only signals the **direct** child. A grandchild process (simulated with `bash -c 'sleep 30 & ...; wait'`) survived 500ms past the parent's timeout-triggered `SIGTERM` in a real test. The `detached:true` + negative-PID-kill fix was then verified to correctly reap the grandchild.

**Example (verified working on this machine):**
```javascript
import { spawn } from "node:child_process";

const HARD_TIMEOUT_MS = 2 * 60 * 60 * 1000; // ~2h per CONTEXT.md's discretion note
const GRACE_MS = 10_000;

const child = spawn(resolvedNodePath /* or resolved claude path directly */, [
  "-p", "/upstream-sync",
  "--dangerously-skip-permissions",
  "--output-format", "json",
], {
  cwd: syncClonePath,
  env: { ...resolvedEnv }, // PATH pre-populated at install time, never launchd's bare default
  detached: true,          // makes child.pid the process-GROUP leader
});

let stdout = "";
child.stdout.on("data", (d) => (stdout += d));

const killTimer = setTimeout(() => {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch { /* group already gone */ }
  setTimeout(() => {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
  }, GRACE_MS);
}, HARD_TIMEOUT_MS);

child.on("exit", (code, signal) => {
  clearTimeout(killTimer);
  // parse stdout as a JSON array (verified shape — see Code Examples)
});
```

### Pattern 3: Install-time tool-path resolution, never launchd-time PATH guessing

**What:** The installer (run interactively by the maintainer, with a full normal shell PATH) resolves the absolute paths of every required tool (`node` for the pinned 24, `agda`, `gh`, `claude`, `gsd-sdk`) via `which`/`execFileSync`, and bakes the **resolved absolute paths** into either the generated plist's `ProgramArguments[0]` (for the Node interpreter itself) or a small environment-setup step the wrapper reads at runtime.

**Why:** [VERIFIED live, this session] A real launchd-spawned process on this machine had `PATH=/usr/bin:/bin:/usr/sbin:/sbin` — none of `node`, `npm`, `agda`, `gh`, `claude`, `gsd-sdk` resolved; only Apple's bundled `/usr/bin/git` did. This is not a hypothetical risk description in D-03 — it is the exact, reproducible, measured environment the real carrier will run in. This exact "resolve once at install time, generate a fixed artifact, never re-resolve at runtime" pattern is **already established in this codebase**: `scripts/team/install-pinned-env.mjs`'s `locateAgdaBinary()` + `writeRunPinnedAgdaScript()` do precisely this for Agda (D-03 in that phase: "verify-and-instruct, NEVER force-install").

### Anti-Patterns to Avoid

- **Relying on a shebang (`#!/usr/bin/env node`) for the wrapper script:** `env`'s own PATH lookup uses launchd's bare PATH, which does not contain `node` [VERIFIED live]. The plist's `ProgramArguments[0]` must be an absolute, install-time-resolved interpreter path — exactly how the existing local precedent (`com.eric.llm-proxy.plist`, `ProgramArguments[0] = "/usr/bin/python3"`) already does it.
- **Passing `--bare` to `claude -p`:** [VERIFIED: official docs + local `claude --help` text] `--bare` explicitly skips OAuth and keychain reads, requiring `ANTHROPIC_API_KEY` instead. A well-intentioned "use `--bare` for scripts/CI" habit (which the official docs themselves recommend for generic scripted calls) would **silently break** this specific design, which depends entirely on the existing OAuth/keychain session. Do not add `--bare`.
- **Hardcoding this-machine's absolute paths (`/Users/eric/...`) directly in committed `scripts/sync/*.mjs` source:** these are Eric-specific mise/nix install paths that will differ on any other machine or after a mise/nix version bump. Resolve them at install time (Pattern 3) and store the result in a generated, gitignored config artifact — never as string literals in tracked `.mjs` files.
- **Force-resetting the sync clone to "fix" an unclean pre-flight check:** D-03 wants an ASSERT-and-fail-loud, not a silent auto-heal. A dirty/mid-merge/wrong-branch clone is itself diagnostic evidence of a previous bad run; auto-resetting it would erase that evidence. The correct recovery path is documented in the runbook (delete `~/.agda-mcp/upstream-sync/clone` and let the next run's pre-flight discover it's simply missing and needs one — an explicit human-triggered action, not an automatic one).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Run something every ~3 days, catch up if the Mac was asleep" | A long-running Node daemon that sleeps/polls in a loop | `launchd` `StartCalendarInterval` | [VERIFIED: `man 5 launchd.plist`] launchd already coalesces missed calendar fires into one catch-up run on wake; a hand-rolled daemon would need ITS OWN LaunchAgent to survive reboot anyway (circular), plus its own crash-restart/throttle logic launchd gives for free |
| "Kill a long-running process tree after N hours" | A shell `timeout`/`gtimeout` wrapper (not installed on this machine) or a hand-rolled watchdog process | Node's own `spawn({detached:true})` + `process.kill(-pid, signal)` | Zero new dependency; [VERIFIED live] this exact recipe correctly reaps grandchild processes, which the simpler `spawn({timeout})` option does NOT |
| "Send a credential-authenticated request to Claude/Anthropic" | Any custom OAuth flow, token-refresh scheduler, or credential file | The existing `claude` CLI's own keychain-backed session | [VERIFIED live] already works with zero configuration inside a real launchd context; hand-rolling credential handling here only creates a new secret-at-rest surface for zero benefit |
| "Validate a plist before installing it" | A hand-written XML well-formedness check | `plutil -lint <path>` | [VERIFIED live] built-in, zero-install, exit-code-driven (0 = OK, 1 = specific parse error) |
| "Notify the user of a failure" | A custom push-notification service or email sender | `gh issue create` (durable/remote) then `osascript -e 'display notification ...'` (local) | [VERIFIED live] both execute successfully without hanging under a real launchd context; this is a single-user local Mac — no need for infrastructure beyond what D-05 already specifies |

**Key insight:** every piece of this phase that looks like it needs custom infrastructure (scheduler, timeout enforcer, credential handling, notifier) already has a zero-dependency, already-installed, already-verified-working OS-native or CLI-native answer. The entire "stack" for this phase is glue code around existing primitives, not new infrastructure.

## Common Pitfalls

### Pitfall 1: `spawn({timeout})` alone does not kill grandchild processes

**What goes wrong:** The wrapper's hard-timeout kill only terminates the direct `claude -p` process; any subprocess IT spawned (e.g. a hung `agda`, a stuck `npm ci`, a wedged `git`) survives and keeps running indefinitely.

**Why it happens:** POSIX signal delivery via a plain (non-detached) `child_process.spawn` only reaches the immediate child, not its own children.

**How to avoid:** [VERIFIED live, this session — reproduced and fixed] Spawn with `{ detached: true }` and kill the whole process group via `process.kill(-child.pid, signal)` (negative PID). See Pattern 2 / Code Examples for the exact tested recipe.

**Warning signs:** After a timeout-triggered kill, `ps aux | grep agda` (or `npm`/`git`) still shows a live process whose parent PID is now `1` (reparented to launchd/init) minutes after the wrapper itself exited.

### Pitfall 2: `--bare` silently breaks authentication for this exact design

**What goes wrong:** A generically-reasonable "use `--bare` for scripted/CI calls" habit (which the official docs themselves suggest for generic automation) causes `claude -p` to require `ANTHROPIC_API_KEY`, which this design does not provide — the run fails immediately.

**Why it happens:** [CITED: code.claude.com/docs/en/headless + local `claude --help`] `--bare` explicitly documents "OAuth and keychain are never read" as its behavior.

**How to avoid:** Never pass `--bare` in the carrier's `claude -p` invocation. The default (non-bare) mode is what was verified to work via keychain OAuth.

**Warning signs:** `claude -p` exits fast with an authentication error mentioning `ANTHROPIC_API_KEY`.

### Pitfall 3: launchd's bare PATH silently degrades the skill's own LOCAL/CLOUD gate detection

**What goes wrong:** SKILL.md's Section 5 detects environment via `command -v agda` — if `agda` isn't resolvable (because launchd's PATH is bare), the skill silently and "correctly" (from its own point of view) selects the weaker CLOUD gate, defeating SYNC-01's "real-Agda full verification gates" requirement without any error at all.

**Why it happens:** [VERIFIED live, this session] launchd's default PATH for a LaunchAgent is exactly `/usr/bin:/bin:/usr/sbin:/sbin` — `agda` (at `/Users/eric/.nix-profile/bin/agda` on this machine [VERIFIED: `which agda`]), pinned Node 24, `gh`, `claude`, and `gsd-sdk` are ALL absent from it.

**How to avoid:** This is precisely why D-03 mandates wrapper-level pre-flight assertions BEFORE invoking `claude -p` at all, with the wrapper's own PATH populated from install-time-resolved absolute directories (Pattern 3) — never launchd's own default.

**Warning signs:** A sync run "succeeds" but its bookkeeping/log shows the CLOUD gate (quarantine env var set, `RUN_AGDA_INTEGRATION` unset) was used instead of LOCAL.

### Pitfall 4: The interval-guard and D-07's `launchctl kickstart` proof can conflict

**What goes wrong:** If a real sync happened recently (within 3 days) and someone later runs `launchctl kickstart` to re-verify the carrier (e.g. while iterating on the wrapper), the interval-guard would treat it as "too soon" and short-circuit to a heartbeat-only exit — never actually invoking `claude -p`, silently defeating the verification attempt.

**Why it happens:** The guard has no built-in concept of "this kickstart is an intentional out-of-band verification, not a cadence-violating extra run."

**How to avoid:** Give the wrapper an explicit bypass (an env var like `UPSTREAM_SYNC_FORCE=1`, or treat "no state file yet" as the natural bypass for the very first install-time proof). Document this clearly in the runbook so a human re-testing the carrier doesn't get a false "nothing happened" result.

**Warning signs:** `launchctl kickstart` returns exit 0 quickly, but the log shows only a guard-exit, not a real `claude -p` invocation.

### Pitfall 5: Treating a missing/corrupt interval-guard state file as "block forever"

**What goes wrong:** If the state file is ever lost or corrupted, a guard implementation that fails closed (defaults to "not enough time has passed") would silently stop the carrier from ever running again.

**Why it happens:** Naive defensive coding often defaults to the "safe" (non-running) branch on any parse error.

**How to avoid:** Treat a missing or unparseable state file as "no prior run recorded" → allow the run to proceed. Failing open toward running (worst case: one run happens slightly early) is safer than failing closed toward silence (worst case: the carrier is permanently dead and D-04 already declined a watchdog to catch that).

### Pitfall 6: A plist bootstrapped only from a temp path won't survive reboot/relogin

**What goes wrong:** `launchctl bootstrap gui/<uid> <path>` works for the current session regardless of where the plist file lives, but launchd only re-scans the standard `~/Library/LaunchAgents/` directory on the next login — a plist left only in a scratch/temp location vanishes after reboot.

**Why it happens:** launchd's own persistence model is directory-scan-based, not purely bootstrap-registry-based.

**How to avoid:** The installer must WRITE the plist into `~/Library/LaunchAgents/<label>.plist` (matches the existing local precedent `com.eric.llm-proxy.plist`) AND THEN `bootstrap` it for the current session — both steps, not just one. [VERIFIED live, this session's own experiments used a scratch-dir bootstrap deliberately, for exactly this reason — to avoid leaving anything in the real LaunchAgents directory.]

**Warning signs:** `launchctl list | grep <label>` shows nothing after a reboot even though it worked yesterday.

### Pitfall 7: `launchctl print`'s output is explicitly not a stable API

**What goes wrong:** A test/inspection script that strictly parses `launchctl print`'s full structured output could break silently on a future macOS update.

**Why it happens:** [VERIFIED: `man launchctl`] The man page states outright: *"This output is NOT API in any sense at all. Do NOT rely on the structure or information emitted for ANY reason. It may change from release to release without warning."*

**How to avoid:** Any automated check against `launchctl print` output should `grep` for a small number of stable-looking substrings (`state = `, `last exit code`) rather than doing strict structured parsing — exactly how this research's own verification commands were written.

### Pitfall 8: `ThrottleInterval` (10s default) can make rapid iteration/testing confusing

**What goes wrong:** Repeatedly `kickstart`-ing the same job within a few seconds during manual testing/debugging may appear to silently no-op or delay.

**Why it happens:** [VERIFIED: `man 5 launchd.plist`] launchd's default throttling policy prevents jobs from being spawned more than once every 10 seconds.

**How to avoid:** When iterating on the wrapper manually, wait at least ~10s between `kickstart` attempts, or explicitly set `ThrottleInterval` to `0` temporarily during development (never in the shipped plist).

## Code Examples

### Interval guard (pure, unit-testable core logic)

```javascript
// scripts/sync/interval-guard.mjs
export function shouldRunSync(lastClaudeInvocationAt, now = new Date(), minDays = 3) {
  if (!lastClaudeInvocationAt) return true; // no prior record -> fail OPEN toward running (Pitfall 5)
  const last = new Date(lastClaudeInvocationAt);
  if (Number.isNaN(last.getTime())) return true; // corrupt timestamp -> same fail-open rule
  const elapsedMs = now.getTime() - last.getTime();
  return elapsedMs >= minDays * 24 * 60 * 60 * 1000;
}
```

### Parsing `claude -p --output-format json`'s captured shape

**Verified exact shape** (captured live from this session's own probe — a single-line JSON array, not newline-delimited):

```javascript
// stdout is ONE line containing a JSON array of event objects:
// [{"type":"system","subtype":"init",...}, {"type":"assistant",...},
//  {"type":"rate_limit_event",...}, {"type":"result","subtype":"success","is_error":false,"result":"PONG",...}]
const events = JSON.parse(stdout);
const resultEvent = events.find((e) => e.type === "result");
const succeeded = Boolean(resultEvent) && resultEvent.is_error === false && resultEvent.subtype === "success";
```

### Pre-flight assertions (DI-friendly, matches this codebase's `deps` convention)

```javascript
// scripts/sync/preflight-assertions.mjs
import { execFileSync } from "node:child_process";

export function assertClaudeAuth(deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    const out = JSON.parse(execFile("claude", ["auth", "status"], { stdio: "pipe" }).toString());
    return { ok: out.loggedIn === true, detail: out };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
// claude auth status is a lightweight, zero-model-cost, JSON-output command
// [VERIFIED live: {"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty",...}]
// — this is the right primitive for the D-03 pre-flight check, distinct from the
// heavier (but also verified-working) full round-trip this research used once for
// deep verification.

export function assertGhAuth(deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    execFile("gh", ["auth", "status"], { stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
```

### Plist validation (matches Nyquist "verifiable by inspection" requirement)

```javascript
import { execFileSync } from "node:child_process";
export function lintPlist(path, deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    execFile("plutil", ["-lint", path], { stdio: "pipe" }); // exit 0 = OK [VERIFIED live]
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.stdout?.toString() ?? String(err) };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `cron(1)`/`at(1)` for scheduled jobs on macOS | `launchd`/`launchctl` | Long-standing (Darwin); [VERIFIED: local `man crontab`: "under Darwin, their functionality has been absorbed into launchd(8)"] | cron silently skips fires that occur while the Mac is asleep; launchd's `StartCalendarInterval` catches up on wake — directly relevant since SYNC-01 explicitly requires wake catch-up |
| `launchctl load`/`unload`/`start`/`stop` (legacy subcommands) | `launchctl bootstrap`/`bootout`/`kickstart` (modern, domain-target-based subcommands) | macOS 10.11+ | This research used the modern subcommands throughout and confirmed they work correctly on this machine; the installer/runbook should use these, not the legacy forms |
| Generic "use `--bare` for scripts" automation advice | Default (non-`--bare`) `claude -p` for **this specific design** | N/A — a per-design tradeoff, not a chronological deprecation | The official docs' general automation guidance actively points the wrong way for a design that depends on keychain OAuth rather than an API key |

**Deprecated/outdated:** cron/at are still present on macOS but Apple's own documentation steers all scheduling toward launchd; this project has zero cron precedent to begin with (its only prior "cron" is a k8s CronJob, a completely different Linux/container context, not applicable here).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Plist Label = `com.cliu238.agda-mcp-server.upstream-sync` | Architecture Patterns / Project Structure | Cosmetic only — any unique reverse-DNS-style label works; easy to rename before install |
| A2 | Sync-clone + carrier-state root = `~/.agda-mcp/upstream-sync/` | Recommended Project Structure | Cosmetic/organizational only — any stable, HOME-relative path works equally well; the important property (independent of the clone's own lifecycle) is preserved under any concrete path choice |
| A3 | Hard timeout = exactly 2 hours (7,200,000 ms) | Pattern 2 / Code Examples | If a real merge+build+test+deploy-watch cycle legitimately needs longer, real runs could be killed mid-flight; CONTEXT.md itself frames this as "~2h suggested," so the planner/user should confirm the figure is generous enough for the LOCAL gate's actual measured duration (Phase 10's own full guarded suite run — see STATE.md — completed in well under 2h, so this is likely generous, but was not re-measured against THIS specific `claude -p`-driven flow) |
| A4 | `--max-budget-usd` used as a secondary safety net alongside the wall-clock timeout (exact dollar figure not fixed) | not yet in a code example — flagged for planner | If set too low, a legitimate long gate-watching sequence could be truncated; if omitted entirely, a runaway loop has no cost ceiling beyond the wall-clock timeout |
| A5 | New files land under a new `scripts/sync/` subdirectory (vs. e.g. `scripts/carrier/` or flattened into `scripts/`) | Recommended Project Structure | Purely organizational; matches the existing `scripts/team/`, `scripts/dogfood/`, `scripts/queue/`, `scripts/oracle/` themed-subdirectory convention, but the exact folder name is a naming choice |
| A6 | `osascript` (not `terminal-notifier`) is the default D-05 local-notification mechanism | Standard Stack / Don't Hand-Roll | If `osascript`'s notifications are ever found to be less visible/attributable than desired once actually observed on-screen (this research verified the COMMAND executes without hanging, but did not visually confirm the banner's on-screen appearance/attribution — see Open Questions), `terminal-notifier` is a drop-in alternative already installed on this machine |
| A7 | Docs runbook lands at a new `docs/UPSTREAM-SYNC-CARRIER.md` (not appended into `docs/DEPLOY-OPERATIONS.md`) | Recommended Project Structure | Purely organizational; CONTEXT.md's own code_context note left this as "likely a sibling or extension" — either placement satisfies the requirement |

## Open Questions

1. **Does the `osascript`/`terminal-notifier` notification banner actually become visually visible on screen from a launchd context, or could macOS Notification permissions silently suppress it?**
   - What we know: [VERIFIED live] both commands execute successfully (exit 0) without hanging or blocking on a permission dialog when run from a real launchd LaunchAgent process.
   - What's unclear: This research has no way to visually inspect the live desktop to confirm a banner actually rendered — exit 0 alone doesn't rule out a silently-suppressed notification if System Settings → Notifications permissions for the relevant requesting-app identity are set to deny.
   - Recommendation: Treat this as a one-time manual install-verification step in the runbook ("after installing, run `launchctl kickstart -k ...` once and confirm you actually SEE a banner; if not, check System Settings → Notifications"). Since `gh issue create` is the FIRST channel in D-05's dual-channel design and is fully verifiable programmatically (an issue either exists on GitHub or it doesn't), the local notification is correctly positioned as the secondary/best-effort channel, not the sole point of failure detection.

2. **Exact `--max-budget-usd` ceiling value for the `claude -p` invocation.**
   - What we know: The flag exists and is designed for exactly this use case (print-mode cost ceiling) [CITED: code.claude.com/docs/en/cli-reference].
   - What's unclear: No historical cost data exists yet for a full real `upstream-sync` LOCAL-gate run (build + full guarded suite + potential merge + deploy watch) driven through `claude -p` specifically, since this run mode hasn't been exercised end-to-end yet — Phase 10's own full-suite runs were driven by a different (interactive orchestrator) session, not this headless carrier.
   - Recommendation: Pick a generous placeholder (e.g. $20–50) for the first real run, and tune down after observing the first real `total_cost_usd` figure (which the JSON output directly reports, per this research's own captured example).

3. **Should the wrapper's own hard-timeout figure (~2h) be configurable via an env var/CLI flag, or hardcoded?**
   - What we know: CONTEXT.md frames 2h as a suggestion, not a hard number.
   - What's unclear: Whether the planner wants this trivially tunable without a code change (e.g. `UPSTREAM_SYNC_TIMEOUT_MS` env var read by the plist's `EnvironmentVariables` or the wrapper itself) or a fixed constant.
   - Recommendation: A simple exported constant with an env var override (mirrors this codebase's existing `AGDA_MCP_DOGFOOD_RERUN_N`-style override pattern in `scripts/team/cron-ingest-wrapup.mjs`) is low-cost and consistent with house style.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `launchd`/`launchctl` | SYNC-01 carrier | ✓ | Darwin 24.5.0 (macOS Sequoia-gen) | — (no fallback; this is the locked, only-considered mechanism) |
| `claude` CLI | SYNC-01 invocation | ✓ [VERIFIED: `claude --version`] | 2.1.201 | — |
| Node.js (ambient shell default) | — | ✓ | v22.22.0 (mise global default) | **Not** the version this phase should rely on — see pinned Node 24 below |
| Node.js 24 (pinned, project requirement) | Build/test/wrapper runtime | ✓ [VERIFIED: `mise list node`] | 24.16.0 at `/Users/eric/.local/share/mise/installs/node/24/bin` | — |
| `agda` | LOCAL gate (D-03) | ✓ [VERIFIED: `which agda`, `agda --version`] | 2.8.0 at `/Users/eric/.nix-profile/bin/agda` (matches `PINNED_AGDA_VERSION` in `scripts/team/install-pinned-env.mjs`) | — |
| `gh` CLI, authenticated | Escalation, deploy-watch, D-05 issue channel | ✓ [VERIFIED: `gh auth status`] | 2.96.0, logged in as `cliu238` with `repo`+`workflow` scopes | — |
| `gsd-sdk` | SYNC-02 bookkeeping | ✓ [VERIFIED: `which gsd-sdk`] | at `/Users/eric/.local/bin/gsd-sdk` | `docs/UPSTREAM-SYNC-LOG.md` fallback already specified by SYNC-02 itself |
| `osascript` | D-05 local notification | ✓ [VERIFIED: built-in + live test] | macOS built-in | `terminal-notifier` (already installed at `/usr/local/bin/terminal-notifier`) |
| `plutil` | Plist validation (Nyquist) | ✓ [VERIFIED: built-in + live test] | macOS built-in | — |
| GNU `timeout`/`gtimeout` | (considered, not used) | ✗ [VERIFIED: `which timeout`/`gtimeout` both empty] | — | Node's own `spawn({detached:true})` + process-group kill (Pattern 2) — no functional gap |

**Missing dependencies with no fallback:** none — every dependency this phase actually needs is present.

**Missing dependencies with fallback:** GNU `timeout`/`gtimeout` (not installed) — fallback is Node's own process-group-kill mechanism, which was verified superior anyway (correctly reaps grandchildren, which plain `timeout` also would not do without its own `--kill-after`/process-group handling).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` ^4.1.2 [existing project config] |
| Config file | `vitest.config.ts` (includes `test/unit/**/*.test.ts`, etc.) |
| Quick run command | `npx vitest run test/unit/tools/sync-*.test.ts` |
| Full suite command | `npm test` (= `vitest run`, `pretest` runs `npm run build`); LOCAL gate adds `RUN_AGDA_INTEGRATION=1 npx vitest run` per SKILL.md Section 5 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Plist is syntactically valid and declares the correct daily `StartCalendarInterval` | unit (shell-out to `plutil`) | `npx vitest run test/unit/tools/sync-install-launchd-carrier.test.ts -t "plist lint"` | ❌ Wave 0 |
| SYNC-01 | Interval-guard correctly allows/blocks based on elapsed time, including the "no prior state" and "corrupt state" fail-open cases | unit (pure function, no I/O) | `npx vitest run test/unit/tools/sync-interval-guard.test.ts` | ❌ Wave 0 |
| SYNC-01 | Pre-flight assertions correctly fail when a tool is absent from PATH (stub PATH/execFileSync) | unit (DI-injected fake PATH) | `npx vitest run test/unit/tools/sync-preflight-assertions.test.ts` | ❌ Wave 0 |
| SYNC-01 | Hard-timeout kill reaps the FULL process group, not just the direct child | integration (real spawn, short timeout, real nested subprocess) | `npx vitest run test/unit/tools/sync-run-upstream-sync.test.ts -t "process group kill"` | ❌ Wave 0 |
| SYNC-02 | A forced non-silent run produces the correct GSD-native bookkeeping artifact shape | integration (manufactured upstream-ahead fixture, not the real InvariantHoldings upstream) | manual/semi-automated — needs a synthetic "upstream ahead by 1 trivial commit" fixture repo | ❌ Wave 0 (needs a new fixture) |
| SYNC-03 | `launchctl kickstart` of the real installed job completes and updates carrier state | manual (real, but NOT a 3-day wait — proven safe/fast/reversible during this research) | `launchctl kickstart -k gui/$(id -u)/com.cliu238.agda-mcp-server.upstream-sync` then inspect `~/.agda-mcp/upstream-sync/state.json` + `carrier.log` | N/A — operational verification, not a test file |

### Sampling Rate

- **Per task commit:** quick run command above (pure-function/DI-stubbed tests only — fast, zero real subprocess/LLM cost).
- **Per wave merge:** full suite command.
- **Phase gate:** Full suite green, PLUS the one real `launchctl kickstart` D-07 proof, before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `test/unit/tools/sync-interval-guard.test.ts` — covers SYNC-01's cadence logic
- [ ] `test/unit/tools/sync-preflight-assertions.test.ts` — covers SYNC-01's D-03 assertions, DI-stubbed
- [ ] `test/unit/tools/sync-carrier-notify.test.ts` — covers D-05's dual-channel logic (stub `gh`/`osascript` calls)
- [ ] `test/unit/tools/sync-run-upstream-sync.test.ts` — covers Pattern 2's process-group timeout kill, and JSON result parsing
- [ ] `test/unit/tools/sync-install-launchd-carrier.test.ts` — covers plist generation + `plutil -lint`
- [ ] A synthetic "upstream is 1 trivial commit ahead" fixture repo/remote — needed to exercise SYNC-02's non-silent bookkeeping path without waiting for a real InvariantHoldings commit

### What Requires the Real Headless Run (vs. What's Verifiable Right Now)

This distinction was the explicit ask for this section — summarized directly:

**Verifiable by inspection/unit test, zero real run needed (all confirmed feasible/already demonstrated during this research):**
- Plist correctness — `plutil -lint` [VERIFIED live: exit 0/1 behavior confirmed]
- launchd job registration/state — `launchctl print <target>` grepped for stable substrings (with the explicit caveat that its full output is not a stable API [VERIFIED: `man launchctl`])
- Pre-flight assertion logic — pure/DI-stubbed unit tests (fake PATH, fake `execFileSync` responses)
- Interval-guard state-file logic — pure function unit tests, no I/O
- Process-group timeout-kill mechanism — a real (but tiny, seconds-long, zero-LLM-cost) integration test using a dummy nested-subprocess script instead of real `claude -p` [VERIFIED live: this exact technique is how this research itself proved the pitfall and the fix]

**Requires the real headless run (but NOT a 3-day wait — `launchctl kickstart` suffices per D-07, and was itself proven safe/fast/reversible during this research):**
- The actual `claude -p "/upstream-sync"` invocation succeeding end-to-end under real launchd env/permissions (this research already did a lighter-weight version of exactly this: a real `claude -p` round trip under real launchd context succeeded — see Sources)
- SYNC-02's bookkeeping artifact generation for a genuinely NON-SILENT run (needs either a real upstream commit to exist, or a manufactured fixture — see Wave 0 gaps) — a 0-commit silent/no-op run (the likely real-world first outcome per CONTEXT.md's own "Specific Ideas" note) does NOT exercise this path at all, only the heartbeat/log path
- The literal natural 3-day calendar fire (never required to wait for by D-07 — kickstart is accepted as equivalent execution context)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (consumption only) | Never store/pass credentials directly — rely exclusively on the OS keychain (`claude`) and `gh`'s own keyring-backed auth, both already verified functional under launchd; the wrapper never reads/echoes secret values (mirrors the existing `docs/DEPLOY-OPERATIONS.md` "never echo raw token" discipline) |
| V4 Access Control | Yes | The dedicated sync clone (D-02) IS the access-control boundary for `--dangerously-skip-permissions` (D-06) — physical filesystem isolation from the working checkout, not a command allowlist. This is already the locked design; this research adds no new requirement here |
| V5 Input Validation | Yes (skill's job, not carrier's) | Upstream commits are semi-trusted external input; the guarded-file list + bounded-autonomy policy (SKILL.md, unchanged by this phase) is the mitigation. The carrier itself performs no content validation of upstream commits |
| V6 Cryptography | No | No custom crypto anywhere in this phase — keychain/OAuth handling is entirely delegated to already-vetted OS/CLI mechanisms |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malicious/compromised upstream commit exploits `--dangerously-skip-permissions` during an unattended merge | Tampering / Elevation of Privilege | Already-locked D-06 mitigation: physical clone isolation + skill's guarded-file list + 2-fix-attempt escalation bound. This phase does not weaken or extend that boundary |
| Credential leakage via wrapper logs (e.g. a debug dump accidentally including a token or keychain-read output) | Information Disclosure | Wrapper log/heartbeat writes must never include raw command output that could contain a token; the `security` pre-flight check in this research deliberately avoided `-w` (never reads/prints the actual secret value) — the same discipline should apply to any new carrier logging |
| A `gh issue create` failure-diagnostic body accidentally includes sensitive local paths/environment dump | Information Disclosure | Explicitly allowlist what diagnostic fields go into the issue body (tool-presence booleans, exit codes, short error strings) rather than dumping raw `env`/full stdout |
| Notification banner content visible on an always-on, physically-accessible Mac | Information Disclosure (low severity) | Accepted risk on a single-user machine already used as a Tailscale jump host; no action needed beyond what D-05 already specifies |

## Sources

### Primary (HIGH confidence — direct empirical verification on this machine, this session)

- `man 5 launchd.plist` (local man page) — `StartCalendarInterval`/`StartInterval` semantics, wake-catch-up coalescing, `EnvironmentVariables`, `ExitTimeOut`, `ThrottleInterval`, `RunAtLoad`
- `man launchctl` (local man page) — `kickstart [-kp]`, `bootstrap`/`bootout`, `print` (with its own "not an API" caveat)
- `man crontab` (local man page) — Darwin's cron→launchd absorption note
- Live throwaway `launchctl bootstrap`/`bootout` experiment #1 (bare-PATH probe): confirmed `PATH=/usr/bin:/bin:/usr/sbin:/sbin` under a real LaunchAgent; `node`/`npm`/`agda`/`gh`/`claude`/`gsd-sdk` all absent, only `/usr/bin/git` present; keychain item `Claude Code-credentials` attribute-readable without hanging. Cleaned up and verified removed.
- Live throwaway `launchctl bootstrap`/`bootout` experiment #2 (`claude -p` auth round-trip): a real `claude -p "Reply with exactly the single word PONG..." --max-turns 1 --output-format json` invocation from inside the real launchd `gui/<uid>` domain succeeded (`"result":"PONG"`, `"is_error":false`, `"apiKeySource":"none"`). Cleaned up and verified removed.
- Live throwaway `launchctl bootstrap`/`bootout` experiment #3 (notification probe): both `osascript -e 'display notification ...'` and `terminal-notifier` executed successfully (exit 0) without hanging under real launchd context. Cleaned up and verified removed.
- Live Node functional tests (this session): reproduced the `spawn({timeout})` grandchild-orphan bug, then verified the `detached:true` + `process.kill(-pid, signal)` fix.
- Live `plutil -lint` tests against a valid plist (exit 0) and an intentionally malformed one (exit 1, specific error).
- `claude auth status` and `gh auth status` run live on this machine — exact JSON/text shapes captured.
- `which`/`--version` checks for `agda`, `node`, `gh`, `claude`, `gsd-sdk`, `terminal-notifier`, `osascript`, `mise`, `timeout`/`gtimeout` on this machine.
- This repo's own committed files: `.agents/skills/upstream-sync/SKILL.md`, `.planning/research/UPSTREAM-SYNC.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `scripts/team/cron-ingest-wrapup.mjs`, `scripts/team/install-pinned-env.{sh,mjs}`, `.github/workflows/deploy-ingest.yml`, `docs/DEPLOY-OPERATIONS.md`, `vitest.config.ts`, `package.json`, `.gitignore`.
- Local pre-existing LaunchAgent `~/Library/LaunchAgents/com.eric.llm-proxy.plist` — real-world precedent for absolute-interpreter-path `ProgramArguments` style.

### Secondary (MEDIUM–HIGH confidence — official documentation, cross-checked against local behavior)

- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless) — `-p`/`--print` mode, `--bare`'s exact auth behavior, skill slash-invocation in `-p` mode (`/skill-name`), background-task/subagent timeout defaults
- [Claude Code CLI Flags reference](https://code.claude.com/docs/en/cli-reference) — `--dangerously-skip-permissions`, `--permission-mode`, `--max-turns`, `--max-budget-usd`, `--model`, `--output-format`
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) — confirms `/skill-name` is the direct-invocation syntax tied to a `SKILL.md`'s frontmatter, matching this repo's `.agents/skills/upstream-sync` (`name: upstream-sync`) exactly

### Tertiary (LOW confidence — WebSearch only, used for orientation, all subsequently corroborated by primary sources above)

- [victoronsoftware.com — launchd agents and daemons](https://victoronsoftware.com/posts/macos-launchd-agents-and-daemons/) — general LaunchAgent-vs-LaunchDaemon/Aqua-session/keychain framing, subsequently confirmed directly by this session's own live probes (not relied upon alone)
- GitHub issue [anthropics/claude-code#7100](https://github.com/anthropics/claude-code/issues/7100) — headless/remote auth discussion; noted as **not** covering the local-launchd-on-an-already-logged-in-Mac scenario this phase actually uses (a materially easier case than the SSH/container scenarios that issue discusses) — included for completeness/honesty about what it does and doesn't cover, not as a basis for any claim in this document

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; every tool's presence/version was directly checked on the target machine
- Architecture (cadence mechanism, PATH handling, timeout enforcement, auth): HIGH — the three highest-risk unknowns (PATH bareness, keychain auth under launchd, timeout-kill correctness) were each resolved by a live, reproducible, cleaned-up experiment on the actual target machine, not by documentation inference alone
- Pitfalls: HIGH — every pitfall listed was either directly reproduced (timeout/grandchild, PATH bareness) or is a direct quote from a primary-source man page (launchctl print's API caveat, ThrottleInterval, StartInterval's non-catch-up)
- Naming conventions (plist label, clone path, file layout): LOW-MEDIUM, explicitly flagged `[ASSUMED]` in the Assumptions Log — these are genuinely discretionary and low-stakes, easy for the planner/user to adjust without re-deriving any of the technical findings above

**Research date:** 2026-07-05
**Valid until:** ~30 days for the launchd/OS-level findings (stable, OS-version-dependent facts unlikely to change on a monthly cadence); ~7-14 days for the `claude` CLI-specific findings (`--bare` semantics, flag names, `claude auth status` shape) given the CLI is under active development — re-verify `claude --version`/`claude --help` output before the planner locks exact invocation strings if significant time has passed since 2026-07-05.
