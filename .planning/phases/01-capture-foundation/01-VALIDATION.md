---
phase: 1
slug: capture-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-01
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (+ @fast-check/vitest 0.3.x for property tests) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run test/unit --reporter=dot` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds (full suite; integration tests need a local `agda` binary) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/unit --reporter=dot`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 Task 1 | 01-01 | 1 | CAP-01, CAP-03 | T-01-01 | RED test proves `agda_capture_session` and `artifact-types.ts` do not yet exist | unit | `npx vitest run test/unit/tools/register-capture-session.test.ts` | ✅ | ✅ green |
| 01-01 Task 2 | 01-01 | 1 | CAP-01, CAP-02 | T-01-02 | Guarded dedup-index read never throws on missing/malformed index.json | unit | `npx vitest run test/unit/agda/session-capture/manifest-builder.test.ts test/unit/agda/session-capture/dedup-index.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-01 Task 3 | 01-01 | 1 | CAP-01, CAP-02, CAP-03 | T-01-01, T-01-02 | Emit-only staging write (never repo tree), sessionClassification always surfaced (D-10) | unit | `npx vitest run test/unit/tools/register-capture-session.test.ts test/unit/tools/mcp-e2e-coverage.test.ts test/unit/tools/no-dead-tool-references.test.ts test/unit/tools/output-schema-invariants.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-02 Task 1 | 01-02 | 2 | CAP-01 | — | Pre-dedup ordered argv captured, duplicates preserved | unit | `npx vitest run test/unit/agda/session-capture/manifest-builder.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-02 Task 2 | 01-02 | 2 | CAP-01 | — | Realized `AGDA_DIR` read only, never re-invokes `createLibraryRegistration()` | unit | `npx vitest run test/unit/agda/session-capture/manifest-builder.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-02 Task 3 | 01-02 | 2 | CAP-01 | — | SHA-256 content-hash over transitive import closure; first-party sources inlined (D-07) | unit | `npx vitest run test/unit/agda/session-capture/import-closure-hash.test.ts test/unit/agda/session-capture/manifest-builder.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-03 Task 1 | 01-03 | 2 | CAP-04 | T-05-03 | Bounded ring-buffer recorder never unbounded-grows | unit | `npx vitest run test/unit/agda/session-capture/recorded-transport.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-03 Task 2 | 01-03 | 2 | CAP-04 | T-05-03 | Recording hooked at MCP tool-call boundary (`timedCallback`), gated by `AGDA_MCP_CAPTURE=1` (D-06) | unit | `npx vitest run test/unit/agda/session-capture/recorded-transport.test.ts test/unit/tools/tool-registration-error-safety.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-04 Task 1 | 01-04 | 2 | CAP-05 | — | Before-source resolution: agent-supplied > git fallback > unavailable (Q1 resolution) | unit | `npx vitest run test/unit/agda/session-capture/oracle-substrate.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-04 Task 2 | 01-04 | 2 | CAP-05 | — | Goal-type/signature substrate built via `command-builder.ts` SSOT, no hand-built IOTCM strings | unit | `npx vitest run test/unit/agda/session-capture/oracle-substrate.test.ts test/unit/protocol/no-bare-command-strings.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-05 Task 1 | 01-05 | 3 | CAP-01..05 | T-05-03 | Full-fidelity artifact assembled in one call; sessionClassification (D-10) preserved through extension | unit | `npx vitest run test/unit/tools/register-capture-session.test.ts --reporter=dot` | ✅ | ✅ green |
| 01-05 Task 2 | 01-05 | 3 | CAP-02 | T-05-02 | Dedup-index write-side validates artifact JSON before writing, refuses malformed input | script (manual-adjacent, automated exit-code check) | `node scripts/promote-capture.mjs /nonexistent-path-xyz 2>&1; test $? -ne 0 && echo NONZERO_CONFIRMED` | ✅ | ✅ green |
| 01-05 Task 3 | 01-05 | 3 | CAP-01 (success criterion 6) | T-05-01 | Standalone cold-replay script, no `src/` imports, never throws unhandled to caller | script (grep gate; full replay is Manual-Only, below) | `grep -c "from \"\\.\\./src\|from \"\\./src" scripts/verify-cold-replay.mjs \| grep -qx 0 && echo STANDALONE_CONFIRMED` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Test stubs for the capture tool (manifest stamping, action log, fingerprint routing, oracle substrate) under `test/unit/` mirroring source file names — `01-01 Task 1` is the RED-test wave-0 seed (`register-capture-session.test.ts`), extended by `01-02`/`01-03`/`01-04`'s own dedicated unit test files.
- [x] Existing vitest infrastructure covers framework needs — no new install required

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold-start self-replay on a second machine | CAP-01 (success criterion 6) | Requires a second machine / clean environment | Copy captured bundle to a clean checkout, run `node scripts/verify-cold-replay.mjs <staged-artifact-path>`, confirm PASS (identical classification family to the one recorded at capture time) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-01
