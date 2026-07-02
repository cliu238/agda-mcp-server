---
phase: 2
slug: the-oracle-triad-server-faithfulness-soundness-hygiene-confo
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.2 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run test/unit --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit --reporter=dot`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01 Task 1 | 02-01 | 1 | ORCL-01 | T-02-01-01 | `lastDispatchedLoadArgv` resets to `[]` in `loadNoMetas()`/`resetFileBoundStateIfProcDied`/`handleSessionProcessClose`, never in the shared `resetProcBoundState` respawn helper — a replay manifest never reports a stale prior load's flags (WR-08) | unit + integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/agda/session-capture/manifest-builder.test.ts --reporter=dot` | ✅ (existing file, extended) | ⬜ pending |
| 02-01 Task 2 | 02-01 | 1 | ORCL-01 | T-02-01-02, T-02-01-03 | Cold subprocess spawned via argv-array only (never a shell string); every `sendCommand` is idle/hard-timed and `kill()` is idempotent; all 7 named env probes independently report `ok:false` naming themselves on a failing synthetic input | unit + integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-cold-agda-session.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-02 Task 1 | 02-02 | 1 | ORCL-02 | — | Widened pragma/FFI scan vocabulary detects postulate/TERMINATING/NO_POSITIVITY_CHECK/NO_UNIVERSE_CHECK/primTrustMe/COMPILE/residual-hole against concrete fixtures incl. the empirically-verified `--with-K` override pair; `primEraseEquality` never flagged | unit | `npx vitest run test/unit/tools/oracle-orcl-02.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-02 Task 2 | 02-02 | 1 | ORCL-02 | T-02-02-01, T-02-02-02, T-02-02-03 | Transitive closure walk + whitelist-diff distinguishes `clean`/`cheat-flagged`/`no-policy` (D-03); a `residual-hole` finding is gated on the resolved warm classification — never cheat-flagged when `ok-with-holes`, cheat-flagged when `ok-complete` (D-08 cross-predicate guardrail) | unit | `npx vitest run test/unit/tools/oracle-orcl-02.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-03 Task 1 | 02-03 | 2 | ORCL-01 | T-02-03-01, T-02-03-03, T-02-03-04 | Path-traversal-crafted `inlinedFirstPartySources[].path` entries refused via `resolveFileWithinRoot` before any `writeFileSync`; library registration replayed verbatim, `createLibraryRegistration` never called; `.agda-lib` closure-inclusion fidelity gap (RESEARCH.md Open Question 2) confirmed and documented in code | unit | `npx vitest run test/unit/tools/oracle-orcl-01.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-03 Task 2 | 02-03 | 2 | ORCL-01 | T-02-03-02 | Cold `Cmd_load` diffed via `parseLoadResponses`/`classifyLoadResult` (never a crude DisplayInfo/Error-presence scan); emits `pass`/`server-false-green-candidate`/`INCONCLUSIVE(probe)`/`skip` honestly, never a false pass on an evidence-free response stream | unit + integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-orcl-01.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-04 Task 1 | 02-04 | 3 | ORCL-03 | — | Depth-aware `expectedSignature` parser splits on the first top-level colon (not a naive `indexOf`); whitespace-normalized alpha-diff comparison proven against a nested-colon edge case | unit | `npx vitest run test/unit/tools/oracle-orcl-03.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-04 Task 2 | 02-04 | 3 | ORCL-03 | T-02-04-01, T-02-04-02 | Cold-loads then infers on the SAME session (never a second independent `Cmd_load`); every ORCL-03 outcome is structurally incapable of gating true-green — exit code never blocks on `conformance-flagged` | unit + integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-orcl-03.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-05 Task 1 | 02-05 | 4 | ORCL-01, ORCL-02, ORCL-03 | T-02-05-02 | `trueGreen` asserted iff `orcl01.kind === "pass"` AND `orcl02.kind === "clean"`; full per-predicate outcomes always persisted, never collapsed to a bare boolean; `consistencyProbe` always the unmechanized `{attempted:false}` hook | unit | `npx vitest run test/unit/tools/oracle-verdict-schema.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |
| 02-05 Task 2 | 02-05 | 4 | ORCL-01, ORCL-02, ORCL-03 | T-02-05-01, T-02-05-03 | Verdict sidecar path is a pure suffix-replace on the CLI's own input path, never joined with unsanitized artifact-internal fields; ORCL-01/ORCL-03 share one cold session when both run; `--only orcl-03` alone falls back to the standalone `judgeOrcl03` (never a bare placeholder) | unit + integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/unit/tools/oracle-run-oracle.test.ts --reporter=dot` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None of the 6 test files or 5 fixture files below exist in the repo today — "existing infrastructure covers all phase requirements" would be inaccurate for this phase. Each is scaffolded and populated within its own owning task (every task in this phase is `tdd="true"`, RED-then-GREEN); there is no separate dedicated Wave-0 plan for this phase.

- [ ] `test/unit/tools/oracle-cold-agda-session.test.ts` — new file; created by Plan 02-01 Task 2 (`spawnColdAgdaSession`/`runEnvironmentProbes` coverage)
- [ ] `test/unit/tools/oracle-orcl-02.test.ts` — new file; created by Plan 02-02 Task 1, extended by Task 2 (pragma/FFI scan + closure-walk + whitelist-diff + D-08 gate coverage)
- [ ] `test/unit/tools/oracle-orcl-01.test.ts` — new file; created by Plan 02-03 Task 1, extended by Task 2 (materialization + cold differential coverage, incl. the `.agda-lib` fidelity test)
- [ ] `test/unit/tools/oracle-orcl-03.test.ts` — new file; created by Plan 02-04 Task 1, extended by Task 2 (signature parse/compare + cold infer coverage)
- [ ] `test/unit/tools/oracle-verdict-schema.test.ts` — new file; created by Plan 02-05 Task 1 (D-02 composition coverage)
- [ ] `test/unit/tools/oracle-run-oracle.test.ts` — new file; created by Plan 02-05 Task 2 (composed CLI end-to-end coverage, incl. the `--only orcl-03`-alone fallback)
- [ ] New Agda fixtures under `test/fixtures/agda/` (none of this pragma vocabulary had existing fixtures before this phase, per RESEARCH.md's Wave 0 Gaps): `TerminatingExample.agda`, `PrimTrustMeExample.agda`, `CompilePragmaExample.agda`, `LibBase.agda`, `WithKOverride.agda` — all created by Plan 02-02 Task 1
- [ ] Framework install: none — vitest/tsx/zod are already fully configured (RESEARCH.md Package Legitimacy Audit: zero new dependencies this phase)

Also extended (not new): `test/unit/agda/session-capture/manifest-builder.test.ts` (pre-existing from Phase 1) — Plan 02-01 Task 1 adds 3 new test cases to it for the WR-08 regression.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-02
