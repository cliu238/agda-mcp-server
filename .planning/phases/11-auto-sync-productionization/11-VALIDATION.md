---
phase: 11
slug: auto-sync-productionization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `11-RESEARCH.md` § Validation Architecture. Task IDs are filled in by the planner; requirement→test mapping below is authoritative.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` ^4.1.2 [existing project config] |
| **Config file** | `vitest.config.ts` (includes `test/unit/**/*.test.ts`) |
| **Quick run command** | `npx vitest run test/unit/tools/sync-*.test.ts` |
| **Full suite command** | `npm test` (`= vitest run`; `pretest` runs `npm run build`). LOCAL gate adds `RUN_AGDA_INTEGRATION=1 npx vitest run` per SKILL.md §5 |
| **Estimated runtime** | Quick: ~seconds (pure-fn / DI-stubbed only). Full: minutes |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit/tools/sync-*.test.ts` (pure-function / DI-stubbed tests only — fast, zero real subprocess/LLM cost)
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green **PLUS** the one real `launchctl kickstart` D-07 proof (SYNC-03)
- **Max feedback latency:** ~30 seconds (quick run)

---

## Per-Task Verification Map

> Task IDs assigned by the planner. Rows below are the requirement-level contract every task must map onto.

| Req | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| SYNC-01 | Plist syntactically valid; declares daily `StartCalendarInterval {Hour:3,Minute:0}` | — | N/A | unit (shell-out `plutil -lint`) | `npx vitest run test/unit/tools/sync-install-launchd-carrier.test.ts -t "plist lint"` | ❌ W0 | ⬜ pending |
| SYNC-01 | Interval-guard allows/blocks on elapsed time; handles no-prior-state and corrupt-state fail-open | — | N/A | unit (pure fn, no I/O) | `npx vitest run test/unit/tools/sync-interval-guard.test.ts` | ❌ W0 | ⬜ pending |
| SYNC-01 | Pre-flight assertions fail loudly when a required tool is absent from PATH (D-03) | T-11-01 | Missing tool ⇒ loud carrier failure, never a degraded CLOUD-gate run | unit (DI-injected fake PATH/execFileSync) | `npx vitest run test/unit/tools/sync-preflight-assertions.test.ts` | ❌ W0 | ⬜ pending |
| SYNC-01 | Hard-timeout kill reaps the FULL process group, not just the direct child | T-11-02 | Orphaned `agda`/`npm` grandchildren cannot survive the ~2h kill | integration (real spawn, short timeout, real nested subprocess) | `npx vitest run test/unit/tools/sync-run-upstream-sync.test.ts -t "process group kill"` | ❌ W0 | ⬜ pending |
| SYNC-01/D-05 | Carrier failure ⇒ dual channel (gh issue then macOS notification); diagnostic body allowlisted, no raw env/token | T-11-03 | No secret/token/raw-env leakage into issue body or logs | unit (stub `gh`/`osascript`) | `npx vitest run test/unit/tools/sync-carrier-notify.test.ts` | ❌ W0 | ⬜ pending |
| SYNC-02 | A forced NON-silent run produces the correct GSD-native bookkeeping artifact shape (`.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY + STATE.md row; `docs/UPSTREAM-SYNC-LOG.md` fallback when gsd-sdk absent) | — | N/A | integration (synthetic "upstream ahead by 1 trivial commit" fixture) | needs Wave-0 fixture (see below) | ❌ W0 | ⬜ pending |
| SYNC-03 | `launchctl kickstart` of the real installed job completes end-to-end through real-Agda gate and updates carrier state | — | N/A | manual/operational (D-07 — NOT a 3-day wait; proven safe/fast during research) | `launchctl kickstart -k gui/$(id -u)/<label>` then inspect `~/.agda-mcp/upstream-sync/state.json` + `carrier.log` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/tools/sync-interval-guard.test.ts` — SYNC-01 cadence logic (pure fn)
- [ ] `test/unit/tools/sync-preflight-assertions.test.ts` — SYNC-01 / D-03 assertions, DI-stubbed PATH
- [ ] `test/unit/tools/sync-carrier-notify.test.ts` — D-05 dual-channel logic, stub `gh`/`osascript`
- [ ] `test/unit/tools/sync-run-upstream-sync.test.ts` — process-group timeout kill + `claude -p` JSON result parsing
- [ ] `test/unit/tools/sync-install-launchd-carrier.test.ts` — plist generation + `plutil -lint`
- [ ] Synthetic "upstream is 1 trivial commit ahead" fixture repo/remote — exercises SYNC-02's non-silent bookkeeping path without waiting for a real InvariantHoldings commit

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real headless `claude -p "/upstream-sync"` end-to-end under real launchd env/permissions | SYNC-03 | Requires the actual launchd execution context; no unit substitute. Research already proved a lighter `claude -p` round-trip succeeds under launchd. | `launchctl kickstart -k gui/$(id -u)/<label>`; confirm pre-flight green → skill enters → heartbeat/state updated. A 0-commit no-op is acceptable success (only the heartbeat/log path exercised). |
| Notification banner is visually rendered on-screen | D-05 | Command exit-0 is unit-testable; actual on-screen render is not observable from a headless session. | One-time manual install-verification: trigger a forced carrier failure, confirm the macOS banner appears. |
| SYNC-02 bookkeeping for a genuinely non-silent (merge-bearing) run | SYNC-02 | The likely first real run is a no-op (Phase 10 just reconciled); non-silent path needs a real upstream commit or the Wave-0 synthetic fixture. | Run against the synthetic "1-commit-ahead" fixture, or wait for a natural upstream commit, then assert the quick-task PLAN+SUMMARY + STATE.md row committed. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
