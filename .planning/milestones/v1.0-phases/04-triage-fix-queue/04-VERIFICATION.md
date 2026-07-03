---
phase: 04-triage-fix-queue
verified: 2026-07-02T19:20:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 4: Triage / Fix Queue Verification Report

**Phase Goal:** Captured defects persist and flow through a durable in-repo queue with status, prioritization, and classification — so intake neither evaporates at session end nor outpaces throughput into a write-only graveyard.
**Verified:** 2026-07-02T19:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | QUEUE-01 — An in-repo flat-file queue is the single source of truth for captured defects, keyed by fingerprint with a status (new/triaged/fixing/locked); defects persist and flow across sessions rather than evaporating. | VERIFIED | `test/fixtures/fix-queue.ts` exports a zod schema (`fixQueueEntrySchema`) with a `.superRefine` enforcing the two terminal-status invariants (`rejected`⇒`rejectedReason`, `locked`/`rejected`⇒non-null `closedAt`) and a typed loader (`fixQueue`) via `loadValidatedJsonData`. `test/fixtures/fix-queue.json` is git-tracked and holds exactly 13 real entries (independently counted via `node -e`, not just SUMMARY's claim). The flagship (`e6f0c1169032b9d5`) is `status:"locked"`, `closedAt` non-null, `matrixEntryId:"issue-64-61-transitive-staleness"` which I cross-referenced against `test/fixtures/capture-regression-matrix.json` and confirmed the `id`/`issue`/`status` fields match exactly. All 8 `needsReverify:true` entries are `status:"new"` (independently verified — none are asserted as confirmed defects). `scripts/queue/intake.mjs`'s `upsertQueueEntry` appends-new-or-bumps-in-place (read source + ran `test/unit/tools/queue-intake.test.ts`, 5 tests pass). `src/agda/session-capture/dedup-index.ts`'s `readDedupIndex` is repointed to `test/fixtures/fix-queue.json` — confirmed `grep -c '.agda-mcp'` on the file is 0 (old path fully removed, not left as fallback). |
| 2 | QUEUE-02 — The queue carries a prioritization signal composed from already-captured data (false-green > crash > wrong-result > missing-feature; ties by recurrence), giving one clear ordering. | VERIFIED | `scripts/queue/priority.mjs` exports `DEFECT_KIND_WEIGHT` (frozen, `false-green:0 < crash:1 < wrong-result:2 < missing-feature:3`) and `comparePriority`/`sortByPriority`, which are pure and non-mutating (`[...entries].sort(...)`). Ran `test/unit/tools/queue-priority.test.ts` (6 tests, all pass) proving band ordering, within-band recurrence-descending tie-break, non-mutation, and determinism. `docs/FIX-QUEUE-DASHBOARD.md` was independently read (not trusted from SUMMARY) and its table order was manually re-verified against the seed data: all 8 `false-green` entries precede the 2 `wrong-result` entries, which precede the 3 `missing-feature` entries — exact QUEUE-02 ordering, against REAL seeded data, not a synthetic fixture. |
| 3 | QUEUE-03 — An `agda_triage_error`-class classifier turns a raw Agda error into a machine class with confidence + suggested action, feeding both capture-time classification and fix-queue routing. | VERIFIED | The pre-existing `classifyAgdaError()` (`src/agda/error-classifier.ts`) is reused verbatim (never reimplemented) via `src/agda/agent-ux.ts`'s barrel from the new `src/agda/session-capture/triage-derivation.ts`'s `deriveTriageFromActions()`. Traced the actual runtime data shape end-to-end (not assumed): `src/session/register-agda-load.ts:236,263` emits `data.errors` on the tool envelope; `src/tools/tool-registration.ts:208-211` records that envelope verbatim as `RecordedAction.normalizedResponse`; `triage-derivation.ts`'s `extractLoadErrorText` reads `action.normalizedResponse?.data.errors[0]` — the exact same path — so the wiring is not dead. `src/agda/session-capture/artifact-types.ts` carries `triage: TriageResult \| null` (always explicit-null, matching the file's own convention). `src/tools/register-capture-session.ts` calls `deriveTriageFromActions(...)` exactly once inline — no scan/classification logic embedded in the tool handler (CLAUDE.md's fat-handler anti-pattern avoided; file is 234 lines). Ran `test/unit/agda/session-capture/triage-derivation.test.ts` (3 tests) and `test/unit/tools/register-capture-session.test.ts` (both the null-path and the real-classification-via-fake-`agda_load`-call path) — all pass. `triageClass`/`triageConfidence` are carried as fields on every `FixQueueEntry` (populated with real `classifyAgdaError()` output for the 3 grounded seed entries — flagship/agda_auto/agda_give — independently re-verified via `test/unit/fixtures/fix-queue.test.ts`'s re-derivation test, which calls the real classifier on the raw error text and compares against the seeded values). |
| 4 | QUEUE-04 — The in-repo queue can be mirrored one-way to GitHub Issues via `gh` (optional, non-authoritative — flat file stays SSOT). | VERIFIED | `scripts/queue/mirror-github.mjs`'s `mirrorEntry` is dry-run by default — traced the control flow line-by-line: `execFile` is only a function *reference* at the top; the `options.execute !== true` branch (line 155) returns before any `execFile(...)` **call** anywhere in the function, so no default/CLI invocation can shell out. I did NOT just trust this — I ran `npx tsx scripts/queue/mirror-github.mjs` (no `--execute`) against the REAL 13-entry seed data as a live behavioral spot-check: it printed "DRY RUN", correctly gated all 8 `status:"new"` entries as `not-eligible-status` (D-13) and the 5 `triaged`/`locked` entries as `dry-run` candidates, and `git diff --stat` on `test/fixtures/fix-queue.json` confirmed zero mutation. Every real `gh` call uses `execFileSync` with an argv array and `shell: false` (4 call sites, grep-confirmed, zero `execSync` usage). `linkedIssue = entry.githubIssue ?? entry.issue?.[0]` (line 153) is computed once and reused, so a pre-existing `entry.issue[]` (e.g. flagship's `[64,61]`) routes to `edit`, never `create` — proven by test assertion (5). CR-01 (the code-review BLOCKER: backlink persistence was silently bumping `recurrence`) is FIXED and verified in the actual source, not just claimed: `mirror-github.mjs:243-245` calls `upsertQueueEntry(..., { bumpRecurrence: false })`, and `scripts/queue/intake.mjs:66-80`'s `upsertQueueEntry` genuinely honors that option (traced the ternary). `test/unit/tools/queue-intake.test.ts` has a dedicated regression test proving both the bump and no-bump paths. Ran the full mocked test suite (`test/unit/tools/queue-mirror-github.test.ts`, 8 assertions) — all pass, zero live `gh` calls, no writes to the committed fixture. |

**Score:** 4/4 truths verified (all four ROADMAP/REQUIREMENTS success criteria QUEUE-01..04)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `test/fixtures/fix-queue.ts` | zod schema + typed loader, ≥40 lines | VERIFIED | 109 lines. Exports `fixQueueEntrySchema`, `FixQueueEntry`, `fixQueue`. `superRefine` present (2 invariants). |
| `test/fixtures/fix-queue.json` | queue SSOT, 13-entry real cargo | VERIFIED | 13 entries confirmed by independent count. Flagship linked to `capture-regression-matrix.json`; 8 `needsReverify:true` at `status:"new"`. |
| `scripts/queue/intake.mjs` | `readQueueFile`/`upsertQueueEntry` + CLI | VERIFIED | 131 lines. `bumpRecurrence` option present (CR-01 fix). All 5 unit tests pass. |
| `scripts/queue/seed-initial-cargo.mjs` | idempotent seed script | VERIFIED | 355 lines. `SEED_ENTRIES` + `scriptMain`; the committed file matches the 13 entries at `recurrence:1` (idempotency was proven against a scratch copy per SUMMARY, independently plausible since the committed file shows uniform `recurrence:1`). |
| `src/agda/session-capture/dedup-index.ts` | repointed `readDedupIndex` | VERIFIED | 88 lines. Reads `test/fixtures/fix-queue.json`; `routeDedup` untouched; `.agda-mcp` literal count = 0. |
| `src/agda/session-capture/artifact-types.ts` | `CaptureArtifact.triage: TriageResult \| null` | VERIFIED | 155 lines. Field present at line 129, always explicit-null, documented inline. |
| `src/agda/session-capture/triage-derivation.ts` | `deriveTriageFromActions` helper | VERIFIED | 96 lines. Try/catch wraps the entire body; degrades to fallback shape (never throws) on any unexpected data shape — confirmed via `test/unit/agda/session-capture/triage-derivation.test.ts`'s malformed-`data.errors` test. |
| `src/tools/register-capture-session.ts` | thin wiring, no inline scan/classification | VERIFIED | 234 lines. Exactly one call to `deriveTriageFromActions(...)`; no scan/classification logic inline. |
| `scripts/queue/priority.mjs` | `DEFECT_KIND_WEIGHT`/`comparePriority`/`sortByPriority` | VERIFIED | 64 lines. Frozen weight table; unknown `defectKind` falls back to `Number.MAX_SAFE_INTEGER` (WR-01 fix, not `NaN`). |
| `scripts/queue/dashboard.mjs` | `renderDashboard`/`regenerateDashboard` | VERIFIED | 161 lines. Imports `sortByPriority` (never re-derives ordering). `escapeTableCell` neutralizes both `\|` and newlines (WR-02 fix). |
| `docs/FIX-QUEUE-DASHBOARD.md` | real, regenerated dashboard | VERIFIED | Read directly: per-status counts 1+4+8=13, close-rate `1/13`, WIP `0 entries in fixing (advisory WIP limit: 3)`, priority-sorted table matches the false-green>wrong-result>missing-feature band order against real data. |
| `scripts/queue/mirror-github.mjs` | 5-function mirror surface | VERIFIED | 254 lines. All 5 exports present (`isGhAvailable`/`buildMirrorPayload`/`isEntryMirrorEligible`/`mirrorEntry`/`scriptMain`). Dry-run-default control flow traced by hand and confirmed live via a real (non-mocked) dry-run CLI invocation against the real seed data. |

All touched `src/` files are well under the 500-line ceiling (max: `artifact-types.ts` is not the largest — `register-capture-session.ts` at 234 lines is the largest touched `src/` file).

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scripts/queue/intake.mjs` | `test/fixtures/fix-queue.ts` | `fixQueueEntrySchema.parse(...)` before `writeFileAtomic` | WIRED | Confirmed at `intake.mjs:82`; invalid-entry test proves the file is left untouched on validation failure. |
| `src/agda/session-capture/dedup-index.ts` | `test/fixtures/fix-queue.json` | repointed `indexPath` | WIRED | Confirmed at `dedup-index.ts:45`; duck-typed parse loop over the array shape. |
| `src/tools/register-capture-session.ts` | `src/agda/session-capture/triage-derivation.ts` | `deriveTriageFromActions(actions, fallback)` call | WIRED | Confirmed at `register-capture-session.ts:127-131`. |
| `src/agda/session-capture/triage-derivation.ts` | `src/agda/agent-ux.ts` | `import { classifyAgdaError }` | WIRED | Confirmed at `triage-derivation.ts:16` (barrel import, never direct `error-classifier.js` import). |
| `src/tools/register-capture-session.ts` | `src/agda/session-capture/artifact-types.ts` | `triage` field on the `CaptureArtifact` object literal | WIRED | Confirmed at `register-capture-session.ts:186`. |
| `scripts/queue/seed-initial-cargo.mjs` | `scripts/queue/intake.mjs` | `upsertQueueEntry(...)` per seed entry | WIRED | Confirmed via source read; the committed `fix-queue.json` reflects the seed script's exact 13-entry field spec. |
| `scripts/queue/dashboard.mjs` | `scripts/queue/priority.mjs` | `import { sortByPriority }` | WIRED | Confirmed at `dashboard.mjs:24`; the real regenerated dashboard's row order matches. |
| `scripts/queue/mirror-github.mjs` | `test/fixtures/fix-queue.ts` | `FixQueueEntry` field reads via `buildMirrorPayload` | WIRED | Confirmed — reads exactly 6 whitelisted fields (D-11), proven by test assertion (6). |
| `scripts/queue/mirror-github.mjs` | `gh` CLI | `execFileSync(..., { shell: false })` | WIRED (gated) | 4 call sites, all argv-array + `shell:false`; unreachable on the default path (confirmed by live dry-run spot-check). |
| `scripts/queue/mirror-github.mjs` | `scripts/queue/intake.mjs` | `upsertQueueEntry(..., { bumpRecurrence: false })` on `--execute` backlink persist | WIRED | Confirmed at `mirror-github.mjs:243-245` — this is the CR-01 fix; never called on the dry-run path. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `triage-derivation.ts`'s `deriveTriageFromActions` | `action.normalizedResponse.data.errors` | `register-agda-load.ts:236,263` → `tool-registration.ts:208-211` (recorded verbatim) | Yes — traced the exact emission → recording → consumption path, not assumed | FLOWING |
| `docs/FIX-QUEUE-DASHBOARD.md` | `fixQueue` (13 real entries) | `test/fixtures/fix-queue.json` via `loadValidatedJsonData` | Yes — regenerated file's counts (1/4/8, close-rate 1/13) independently cross-checked against the raw JSON | FLOWING |
| `scripts/queue/mirror-github.mjs`'s CLI | `fixQueue` (13 real entries) | Same real queue file | Yes — live dry-run invocation against real data correctly gated 8 vs. 5 entries by status | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Mirror is inert by default against real seed data | `npx tsx scripts/queue/mirror-github.mjs` (no `--execute`) | "DRY RUN" banner; 8× `not-eligible-status`, 5× `dry-run`; `git diff --stat` on `fix-queue.json` empty afterward | PASS |
| Phase-4 targeted test suite | `npx vitest run` on all 8 phase-4 test files | 8 files / 46 tests passed | PASS |
| Full unit suite (regression check) | `npx vitest run test/unit` | 138 files passed, 1 skipped; 1246 tests passed, 17 skipped | PASS |
| Full suite incl. real-Agda integration | `npm test` (pretest→build→vitest run, real `agda 2.8.0` on PATH) | 185 files passed, 14 skipped; **1525 passed, 174 skipped, 0 failed** — exact match to the SUMMARY/context claim, independently reproduced | PASS |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | exit 0, clean | PASS |
| Invariant tests (no hand-built IOTCM / no dead tool refs) | `npx vitest run test/unit/protocol/no-bare-command-strings.test.ts test/unit/tools/no-dead-tool-references.test.ts` | 2 files / 6 tests passed | PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention; verification is via `npm test`/`vitest`/direct CLI spot-checks as above. SKIPPED (no probe-based verification declared for this phase).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| QUEUE-01 | 04-01, 04-03 | In-repo flat-file queue is SSOT, keyed by fingerprint, status lifecycle, persists across sessions | SATISFIED | See Truth #1 above. |
| QUEUE-02 | 04-05 | Prioritization signal: false-green > crash > wrong-result > missing-feature, tie-break recurrence | SATISFIED | See Truth #2 above. |
| QUEUE-03 | 04-02 | `agda_triage_error`-class classifier feeds capture-time classification + queue routing | SATISFIED | See Truth #3 above. |
| QUEUE-04 | 04-04 | One-way, optional, non-authoritative GitHub Issues mirror | SATISFIED | See Truth #4 above. |

No orphaned requirements: `REQUIREMENTS.md`'s traceability table maps only QUEUE-01..04 to Phase 4, and all four appear in at least one plan's `requirements:` frontmatter. `REQUIREMENTS.md` itself still shows all four as "Pending" (unchecked checkbox) — per the verifier's explicit instructions this is acceptable at verification time (flipped to complete during phase completion, not during verification) and is not counted as a gap.

### Anti-Patterns Found

None. Scanned every phase-4-touched file (`scripts/queue/*.mjs`, `src/agda/session-capture/*.ts`, `src/tools/register-capture-session.ts`, `test/fixtures/fix-queue.{ts,json}`) for `TBD|FIXME|XXX`, `TODO|HACK|PLACEHOLDER`, "placeholder/coming soon/not yet implemented", and empty-implementation patterns (`return null|return {}|return []|=> {}`) — zero matches across all files.

**Confirmation Bias Counter (disconfirmation pass, per verification protocol — reported even though overall status is PASS):**

1. **Partially-nuanced requirement:** QUEUE-03's wording ("feeding both capture-time classification and fix-queue routing") could be read as implying `triageClass` drives priority ordering. It does not — `comparePriority` (QUEUE-02) intentionally reads only `defectKind`/`recurrence`, never `triageClass`. This is a **deliberate, documented design decision** (04-CONTEXT.md D-09: "two separate classification axes, never merged... Merging them would conflate 'the proof has a coverage error' with 'the server lied about the result'"). `triageClass`/`triageConfidence` ARE carried as queue-entry fields (satisfying "carried on queue entries for routing" per the phase's own boundary text) and displayed on the dashboard — just not consumed as a sort key. Verified as intentional, not a gap.
2. **A test that doesn't fully test its stated behavior:** `test/unit/tools/queue-mirror-github.test.ts` assertion (8) (the D-12 multi-run-idempotency test) manually simulates `scriptMain`'s backlink-persist step via `upsertQueueEntry({ ...entry, githubIssue: N }, scratchQueuePath)` — but WITHOUT the `{ bumpRecurrence: false }` option that the REAL `scriptMain` (`mirror-github.mjs:243-245`) actually passes, and never asserts `persisted.recurrence`. This means the CR-01 fix's exact integration point (`scriptMain`'s own composition of `mirrorEntry` + `upsertQueueEntry`) is not exercised end-to-end by an automated test — `scriptMain` itself is never imported/called in this test file. The underlying behavior IS independently confirmed correct via (a) direct source reading of `mirror-github.mjs:243-245`, and (b) `test/unit/tools/queue-intake.test.ts`'s dedicated regression test proving `bumpRecurrence:false` preserves recurrence at the primitive level. This is a real test-coverage-depth gap (INFO, not a functional defect) worth a future hardening pass.
3. **An error path with no test coverage:** `mirrorEntry`'s `gh issue create` output-parse-failure throw (`mirror-github.mjs:190-198`, when the regex can't extract an issue number from `gh`'s stdout) and the `execute:true` + `gh`-unavailable skip branch (`mirror-github.mjs:169-171`, distinct from the standalone `isGhAvailable` test) both lack direct test coverage in `queue-mirror-github.test.ts`. Neither was mandated by the plan's 8-assertion spec; both are low-risk defensive branches, not exercised paths in this phase's real seed data (no entry currently triggers a `create` against a live, misbehaving `gh`).

None of these three items block phase-goal achievement — they are disclosed per the verification protocol's disconfirmation-pass requirement, not because they invalidate any must-have.

### Human Verification Required

None. This is a pure backend/infrastructure/scripting phase (JSON fixture + Node scripts + one additive TS field) with no UI/UX surface. The one path intentionally never exercised live — the mirror's real `--execute` against an actual GitHub repository — is a deliberate, documented safety design (dry-run-by-default; the phase's own `<verification>` sections for 04-04/04-05 explicitly state "no live `gh` call anywhere in this plan's own verification"). This was proven via mocked tests plus my own live (non-mocked) dry-run CLI invocation against the real seed data, which is sufficient evidence without ever mutating a real GitHub repo.

### Gaps Summary

No gaps. All 4 ROADMAP/REQUIREMENTS success criteria (QUEUE-01..04) are independently verified TRUE in the actual codebase — not merely claimed by SUMMARY.md. All artifacts exist, are substantive, are wired, and (where they render/consume dynamic data) genuinely carry real data end-to-end. The prior code-review's 1 BLOCKER (CR-01: recurrence silently bumped on backlink persist) and 2 WARNINGs (WR-01: NaN-breaking comparator; WR-02: newline-unsafe table escaping) were independently re-verified as genuinely fixed in the current source, not just claimed in 04-REVIEW-FIX.md. The full test suite (`npm test`) was independently re-run against a real, pinned Agda 2.8.0 binary and reproduced the exact 1525-passed/174-skipped/0-failed tally claimed in the phase context — a strong signal against silent regressions. `tsc` is clean. No anti-pattern markers were found. Three minor INFO-level test-coverage-depth observations are disclosed above per the disconfirmation-pass protocol but do not block phase completion.

---

_Verified: 2026-07-02T19:20:00Z_
_Verifier: Claude (gsd-verifier)_
