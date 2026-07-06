---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
document: 12-HEALTH-REPORT.md
audited: 2026-07-06
status: cut-list-pending-signoff
severity_scale:
  critical: "Actively produces an incorrect result, a security exposure, or violates C-01/C-02/C-04 if left unaddressed; would block the phase gate."
  high: "A confirmed, reproducible defect or duplication that has already caused (not merely risked) a real incident, or sits on a deploy-relevant path where a mishandled cut would break production."
  medium: "A genuine, evidenced redundancy or gap with a clear, low-risk fix; no active harm yet, but the risk the finding warns about has already started to materialize (observed drift) or would materialize on the very next unrelated edit."
  low: "Surface-level cleanup (an orphaned one-off script, a stale doc line) whose removal has zero functional impact and saves only incidental future attention."
category_enum: [pipeline, docs-residue, tools, src-subtraction]
candidate_counts:
  pipeline: 2
  docs-residue: 7
  tools: 2
  src-subtraction: 9
  total: 20
source_docs:
  - 12-AUDIT-PIPELINE.md (Plan 12-01)
  - 12-AUDIT-DOCS.md (Plan 12-02)
  - 12-AUDIT-TOOLS.md (Plan 12-03)
  - 12-AUDIT-SRC-DEBT.md (Plan 12-04)
  - 12-AUDIT-LOCKS-RT6RT7.md (Plan 12-05)
---

# Phase 12 Health Report & Cut List

**Purpose:** This is the single, consolidated, severity-graded health report and cut list the D-03 sign-off checkpoint (Plan 12-07) presents to the user for item-by-item approval. It merges the five Wave-1 front-half audit reports — pipeline (`scripts/`), docs and planning residue, MCP tool surface, `src/` low-risk subtraction, and regression locks + RT6/RT7 — into one document. This plan (12-06) performs **no cut itself**: every candidate below is a proposal awaiting sign-off (Plan 12-07); nothing here has been executed.

**Total CUT-NN candidates: 20** — 2 pipeline + 7 docs-residue + 2 tools + 9 src-subtraction, matching the sum of Cut-List Candidates rows stated by each source audit doc itself (12-01: "two Cut-List Candidates" = 2; 12-02: "Seven rows below" = 7; 12-03: "Two well-evidenced Cut-List Candidates" = 2; 12-04: "9 rows below" = 9; 12-05 contributes zero cut-list rows — its content instead becomes this report's Regression-Lock Exclusion List and RT6/RT7 Re-Evaluation Verdicts sections below). CUT-NN ids are assigned once, sequentially, across all four categories combined, in the order the categories are presented below (pipeline → docs-residue → tools → src-subtraction).

## Severity Scale

Defined once, here, as this report's authoritative scale (no repo-wide severity convention existed before this phase — `12-PATTERNS.md`'s "No Analog Found" table confirms this). Per this plan's own instruction, 12-01 ("Pipeline Audit Report") is the primary definition; 12-02/12-03/12-04 each independently defined an equivalent four-tier scale with the same spirit but slightly different wording (grading philosophy, not different tiers). Every row below carries its own original severity **judgment** unchanged; only the **tier-name capitalization** is normalized to the four canonical labels below (e.g. a source row's `low`/`Low`/`medium`/`Medium` all normalize to `Low`/`Medium` here — the qualifying prose that follows each row's severity value is preserved verbatim).

- **Critical** — actively produces an incorrect result, a security exposure, or violates C-01/C-02/C-04 if left unaddressed; would block the phase gate.
- **High** — a confirmed, reproducible defect or duplication that has already caused (not merely risked) a real incident, or sits on a deploy-relevant path where a mishandled cut would break production.
- **Medium** — a genuine, evidenced redundancy or gap with a clear, low-risk fix; no active harm yet, but the risk the finding warns about has already started to materialize (observed drift) or would materialize on the very next unrelated edit.
- **Low** — surface-level cleanup (an orphaned one-off script, a stale doc line) whose removal has zero functional impact and saves only incidental future attention.

*(For reference, the other three audits' own wordings, all reconciled onto the scale above: 12-02 used "leaving as-is or cutting incorrectly risks a security/correctness/data-loss regression" (critical) / "actively misleads... or creates a real, non-trivial maintenance trap" (high) / "genuine duplication, drift, or dangling-citation risk... impact is bounded" (medium) / "cosmetic, inert, or cleanup effort disproportionate to benefit" (low). 12-03 used "actively broken or a live security/correctness gap" (critical) / "confirmed redundancy or dead-end guidance that will mislead... today" (high) / "confirmed redundancy with limited/contained blast radius, or... a latent divergence risk" (medium) / "genuine but low-stakes duplication... no correctness/security implication" (low). 12-04 used "correctness/security break" (critical) / "real user-facing or architectural risk" (high) / "real but bounded maintenance cost" (medium) / "pure tidiness, zero behavior risk" (low), noting every one of its own 9 rows is Low "by construction" since its plan (D-01) scopes `src/` to low-risk subtraction only.)*

## Category Enum

Canonical, lowercase, four tokens — pinned by this plan; every downstream plan (12-07 through 12-12) keys off these exact tokens, never a synonym:

`pipeline` | `docs-residue` | `tools` | `src-subtraction`

| Section below | Category token | Candidate count |
|---|---|---|
| Pipeline | `pipeline` | 2 (CUT-01, CUT-02) |
| Docs and Planning Residue | `docs-residue` | 7 (CUT-03 – CUT-09) |
| MCP Tool Surface | `tools` | 2 (CUT-10, CUT-11) |
| src Low-Risk Subtraction | `src-subtraction` | 9 (CUT-12 – CUT-20) |

---

## Pipeline

**Source:** `12-AUDIT-PIPELINE.md` (Plan 12-01), audited 2026-07-06. Scope: `scripts/{dogfood,oracle,queue,team}/*.mjs` (25 files).

### CUT-01: Extract `assertSafeRunId` to a shared module

**Category:** pipeline

- **Issue:** Identical run-id validation *logic* is duplicated verbatim in two CLI scripts (`scripts/dogfood/dogfood-run.mjs` and `scripts/dogfood/dogfood-wrapup.mjs`); the copies have already begun to drift (error-message text differs — confirmed in the source audit's Finding 1), meaning a future validation-rule change (e.g. a length cap, rejecting NUL bytes) applied to only one copy would silently leave the other CLI under-validated.
  - **Files:** `scripts/dogfood/dogfood-run.mjs:101-116`, `scripts/dogfood/dogfood-wrapup.mjs:425-440` (both reduced to an import); new `scripts/dogfood/run-id.mjs` (created); new `test/unit/tools/dogfood-run-id.test.ts`; `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts:23,27` (existing regex assertions must be updated in the same commit — see Impact).
  - **Impact:** Low blast radius, but not zero — flagging a real gap `12-PATTERNS.md`'s own Pattern 3 write-up does not mention. Both CLIs' argv-parsing *behavior* is unchanged (the guard body is call-convention-agnostic, confirmed in Pattern 3). Adopting the more-informative `--run-id`-flag-shaped message (Pattern 3's own recommendation) for the shared module changes `dogfood-wrapup.mjs`'s user-visible error text from `invalid run-id "X": ...` to `invalid --run-id value "X": ...` — an admitted behavior change, not a pure refactor. This concretely **breaks** `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts:23` (`expect(...).toThrow(/invalid run-id/)`) and `:27` (same regex) unless those two assertions are updated in the same commit — confirmed via direct read of both the test file and the message text; the substring `"invalid run-id"` does not appear inside `"invalid --run-id value \"X\""`. `dogfood-run.mjs`'s own tests (`dogfood-run-spawn-options.test.ts:179,183`, asserting `/invalid --run-id/`) are unaffected since they already match the adopted message shape.
  - **Fix approach:** Extract to `scripts/dogfood/run-id.mjs` exporting `assertSafeRunId`, following `12-PATTERNS.md` Pattern 3 (module content, MIT-header/why-comment convention, same-directory sibling-import placement — no `scripts/lib/`/`scripts/shared/` convention exists in this repo) and Pattern 4 (the exact call-site swap in both CLIs) verbatim. Keep the `--run-id`-flag-shaped message text per Pattern 3's own recommendation. Add `test/unit/tools/dogfood-run-id.test.ts` per Pattern 3's `dogfood-<basename>.test.ts` naming convention. Update the two regex assertions in `dogfood-wrapup-argv-parsing.test.ts` (lines 23, 27) to match the new message text in the **same** commit — this is the one addition beyond Pattern 3/4's own text.
  - **Severity:** Medium (duplication is real and has already measurably drifted — no longer a purely hypothetical risk — but current functional correctness is unaffected in both copies today).
  - **Deploy-relevant:** no (`scripts/dogfood/*` per `12-RESEARCH.md`'s Deployment & Runtime Surface table — dev-machine-only recording proxy, never invoked by a k8s workload).
  - **Loop②-stage risk:** none — dogfood tooling is capture-adjacent, not itself a required Loop② stage (C-02); this candidate does not touch `oracle/`, `queue/intake.mjs`, or `team/`.

### CUT-02: Delete `scripts/queue/seed-initial-cargo.mjs`

**Category:** pipeline

- **Issue:** `scripts/queue/seed-initial-cargo.mjs` is a one-off historical seeding script (its own header: "must NOT be run for real a second time against the committed test/fixtures/fix-queue.json") that already completed its entire job — every one of its 13 seeded fingerprints (confirmed via `grep -n "fingerprint:"`) already exists durably in `test/fixtures/fix-queue.json`, the actual queue SSOT — and it is the only one of the 25 pipeline scripts with zero dedicated test coverage.
  - **Files:** `scripts/queue/seed-initial-cargo.mjs` (355 lines, sole file to remove); `.planning/codebase/STRUCTURE.md:123,217` (one-line mentions to update in the same commit).
  - **Impact:** None functionally, in either direction. Confirmed zero importers besides its own file (`grep -rln "seed-initial-cargo"` across `.mjs`/`.ts`/`.md`, excluding `.planning/`, returns only itself); not wired in `package.json`; not deploy-relevant (grouped with `dashboard`/`mirror-github`/`priority` in `12-RESEARCH.md`'s table as dev-machine-only). Its only runtime dependency, `scripts/queue/intake.mjs`'s `upsertQueueEntry`, is untouched by this cut — the "file" stage's real writer keeps working identically. The 13 fingerprints it transcribes remain permanently recorded in `test/fixtures/fix-queue.json` regardless of whether this script exists; the seeding rationale (why each field was set as it was) is preserved in git history at the commit that introduced it — this script's own Entry-1 comment cites exactly this convention verbatim ("D-02: git history remains the authoritative audit trail").
  - **Fix approach:** Delete outright per `12-PATTERNS.md` Shared Pattern A's script-deletion checklist: `git rm scripts/queue/seed-initial-cargo.mjs`; no other `scripts/**/*.mjs` file imports it (confirmed via grep, nothing to fix); no test file exists to remove (this row's own finding); no `package.json` entry to remove (confirmed above). Update `.planning/codebase/STRUCTURE.md`'s two one-line mentions (line 123's directory-tree comment, line 217's prose description) in the same commit — Shared Pattern A's checklist doesn't itself call out `.planning/codebase/` prose, but leaving a structural map describing a deleted file would be exactly the kind of stale-doc residue D-01 targets.
  - **Severity:** Low (pure cleanup; zero functional or deploy risk either way).
  - **Deploy-relevant:** no.
  - **Loop②-stage risk:** none — this script only ever ran once, historically, through `queue/intake.mjs`'s own public `upsertQueueEntry` API; deleting it does not touch `intake.mjs` itself (the actual "file" stage mechanism), so the stage's writer is fully preserved (C-02).

**Also considered, not cut-list candidates (12-01's own Reasoned Exclusions — see `12-AUDIT-PIPELINE.md` for full detail):** the three oracle-tooling defects (`.agda-lib` never re-materialized for multi-include-root corpora; unconditional cold-replay hole-scan; postulate-block parser mis-splitting multi-line signatures) are correctness bugs, not redundant/duplicated/orphaned code, and remain tracked in `test/fixtures/fix-queue.json` for a future hardening wave; `npx knip` was not run (manual/`find`-based inventory judged sufficient at 25 files); `scripts/team/clone-fuel-corpora.mjs` and `scripts/team/install-pinned-env.mjs` were checked and found not redundant (distinct consumers, dedicated test coverage).

---

## Docs and Planning Residue

**Source:** `12-AUDIT-DOCS.md` (Plan 12-02), audited 2026-07-06. Scope: `docs/*.md`, `README.md`, `.agents/skills/*/SKILL.md`, `.planning/research/*`, `.planning` gitignore hygiene, VALIDATION.md-missing debt, the `agda-mcp-k8s-deploy` skill note.

### CUT-03: Delete four shipped-and-superseded v1.1-scoped research docs

**Category:** docs-residue

- **Issue:** Four v1.1-scoped research docs describe TEAM/CACHE feature research for the already-shipped v1.1 milestone. Half their subject (the entire CACHE theme) was deleted from the product by consumer audit (2026-07-03, `PROJECT.md` Key Decisions); the TEAM half shipped and is superseded by `.planning/codebase/*` + the live deployment. No live (non-research, non-archived-phase) file cites any of the four.
  - Files: `.planning/research/FEATURES.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`
  - Impact: none — zero live citations found outside already-closed `.planning/milestones/v1.1-phases/07-*`/`08-*` archives (unaffected by deleting the source research, since archives are themselves historical snapshots).
  - Fix approach: delete all four. Preserve nothing separately — the one load-bearing fact any of them carries (the CACHE-deletion rationale) is already durably recorded in `PROJECT.md`'s Key Decisions table and `milestones/v1.1-MILESTONE-AUDIT.md`.
  - Severity: Low
  - Generated-or-authored: authored

### CUT-04: Delete `.planning/research/ARCHITECTURE.md` (inline its one live citation first)

**Category:** docs-residue

- **Issue:** `.planning/research/ARCHITECTURE.md` is the same kind of shipped-and-superseded v1.1-scoped research doc as CUT-03's group, but carries one live citation.
  - Files: `.planning/research/ARCHITECTURE.md`
  - Impact: `Dockerfile:89`'s comment cites this file by path as provenance for a real, still-relevant build decision (why `devDependencies` are not trimmed from the deploy image). Deleting without updating the comment leaves a dangling path reference in an actively-relied-upon build artifact.
  - Fix approach: inline the 2-sentence rationale directly into the `Dockerfile:89` comment (removing the cross-reference), then delete the research file.
  - Severity: Medium
  - Generated-or-authored: authored

### CUT-05: Delete `.planning/research/FUEL-CORPORA.md` (repoint one JSON citation first)

**Category:** docs-residue

- **Issue:** `.planning/research/FUEL-CORPORA.md`'s core factual content (the 4-corpus key/repo/access table) is now duplicated, more current, in the actively-maintained `.agents/skills/agda-dogfooding/SKILL.md` §6; a live JSON policy file cites the research doc's path as provenance.
  - Files: `.planning/research/FUEL-CORPORA.md`
  - Impact: `scripts/data/oracle-policy/agda-unimath.json`'s `$comment` field cites this path as the source of its `sanctionedAxioms`/`requiredFlags` values — a dangling citation if deleted (informational only; the JSON is never read at runtime against the research doc, so this is a human-readability concern, not a functional break).
  - Fix approach: repoint `scripts/data/oracle-policy/agda-unimath.json`'s `$comment` at `.agents/skills/agda-dogfooding/SKILL.md` §6, then delete the research file.
  - Severity: Medium
  - Generated-or-authored: authored

### CUT-06: `CHG-REVERIFY.md` / `RT-REVERIFY.md` — recorded, NOT recommended for cutting now

**Category:** docs-residue

- **Issue:** `.planning/research/CHG-REVERIFY.md` and `.planning/research/RT-REVERIFY.md` (one-off historical defect re-verification reports) are cited by path, multiple times, inside `test/fixtures/fix-queue.json`'s `notes` fields as defect-evidence provenance — including for still-open entries. `RT-REVERIFY.md` specifically underpins the still-open RT6 (`ad2b6d31f58f1759`)/RT7 (`b6821f42952c6ff8`) entries this very milestone's D-04 decision requires a definitive verdict on.
  - Files: `.planning/research/CHG-REVERIFY.md`, `.planning/research/RT-REVERIFY.md`
  - Impact: deleting now leaves dangling `"Source: .planning/research/....md"` citations inside the tracked, actively-consulted fix-queue SSOT and its seeding script's header comment (`scripts/queue/seed-initial-cargo.mjs`).
  - Fix approach: do not cut either file in this pass. Re-evaluate after this phase's RT6/RT7 D-04 verdict work completes and every citing `fix-queue.json` `notes` field has been checked to confirm the citation can be safely dropped or should be inlined first.
  - Severity: Low (recorded for completeness/sequencing; not recommended for cutting now)
  - Generated-or-authored: authored
  - **Note for the 12-07 sign-off checkpoint:** this row's own source audit recommends against executing this cut in this phase. It is transcribed here, unabridged, because the source audit explicitly listed it among its "Seven rows below" Cut-List Candidates — the sign-off decision this row calls for is "acknowledge / defer," not "approve for execution."

### CUT-07: Reconcile or delete `docs/literate-agda-assessment.md` (factually stale content)

**Category:** docs-residue

- **Issue:** `docs/literate-agda-assessment.md`'s "What Does Not Work" table is factually false against current `HEAD` — literate-format extension matching, module discovery, and test coverage are all now comprehensively shipped, beyond what the doc's own Phase 1/2 recommendations even asked for. (Source audit's Additional Accuracy Findings: `src/agda/data/agda-source-extensions.json` is the actual SSOT and already version-gates all 7 literate suffixes; a full `src/session/literate/` extraction subsystem exists; 7 dedicated fixtures exist.)
  - Files: `docs/literate-agda-assessment.md`
  - Impact: an agent or contributor reading this doc today is actively misled into believing literate Agda support has gaps that do not exist, risking wasted re-implementation effort.
  - Fix approach: either reconcile it (add a "Reconciliation" section confirming Phase 1/2 shipped, mirroring `docs/release-0.7.0-triage.md`'s own precedent) or delete outright, since `src/session/literate/*` plus its 7 dedicated fixtures are self-documenting. If deleted, also drop its one-line mention from `.planning/codebase/STRUCTURE.md` (lines 160, 240) in the same commit.
  - Severity: High — the only finding in this audit where a doc's *content*, not merely its existence, actively misleads.
  - Generated-or-authored: authored

### CUT-08: Remove one stale guarded-file entry from `.agents/skills/upstream-sync/SKILL.md`

**Category:** docs-residue

- **Issue:** `.agents/skills/upstream-sync/SKILL.md` Section 3's guarded-files list still names `src/session/load-terminus-tracker.ts`, deleted as part of Phase 10's merge (confirmed via direct filesystem check and `docs/LOAD-TERMINUS-ADJUDICATION.md`).
  - Files: `.agents/skills/upstream-sync/SKILL.md`
  - Impact: none functionally (a merge conflict cannot occur on a nonexistent path, so the stale entry is inert) — but it is inaccurate operational documentation a future sync-escalation reader would trip over. The file's other 8 guarded paths were individually re-verified to still exist and are accurate.
  - Fix approach: remove the single `src/session/load-terminus-tracker.ts` line from the guarded-files list.
  - Severity: Low
  - Generated-or-authored: authored

### CUT-09: Add `.gitignore` entries for `.planning/graphs/` and `graphify-out/`

**Category:** docs-residue

- **Issue:** `.planning/graphs/` and `graphify-out/` are untracked, uncommitted directories with no `.gitignore` entry (re-confirmed fresh in the source audit session — the orchestrator-supplied git-status snapshot at that session's start shows both as untracked: `?? .planning/graphs/`, `?? graphify-out/`; neither appears anywhere in `.gitignore`).
  - Files: `.gitignore` (the fix target — not a content deletion of the directories themselves)
  - Impact: none from adding the ignore entries; without them, a future `git add -A`-shaped command risks accidentally staging ~10 MB of generated graph output into a commit.
  - Fix approach: add `.planning/graphs/` and `graphify-out/` as new `.gitignore` entries. Tagged distinctly from every other row above: this is a gitignore-hygiene fix, not a doc or feature cut.
  - Severity: Low
  - Generated-or-authored: n/a (not a doc; infrastructure hygiene)

**Also considered, not cut-list candidates (12-02's own findings — see `12-AUDIT-DOCS.md` for full detail):** 11 of 12 scanned doc files (README.md, assistant-workflows.md, DEPLOY-OPERATIONS.md, extensions.md, the generated FIX-QUEUE-DASHBOARD.md, LOAD-TERMINUS-ADJUDICATION.md, team-intro.html, TEAM-ONBOARDING.md, both `.agents/skills/*/SKILL.md` files except the one guarded-file line above) had zero stale tool-name references; `docs/release-0.7.0-triage.md`'s one never-built proposed tool name (`agda_type_search`) is a "Should-have" backlog item, not a stale reference, and the doc is still actively cited by `CHANGELOG.md` so it is not flagged; the VALIDATION.md-missing debt (4+ phases) is an addition (backfill), not a subtraction, and stays out of this phase's cut list; `.claude/skills/agda-mcp-k8s-deploy/` is untracked by git entirely, so it is out of cutting scope either way (informational note only, not a cut-list row).

---

## MCP Tool Surface

**Source:** `12-AUDIT-TOOLS.md` (Plan 12-03), audited 2026-07-06. Real usage evidence: 72 total `tools/call` invocations across 21 local runs, 17 distinct tools with any recorded invocation, cross-referenced against the live 74-tool manifest and `test/fixtures/e2e/mcp-tool-coverage.json`.

### CUT-10: Delete `agda_bug_report_bundle` + `agda_bug_report_update_bundle` (superseded by `agda_capture_session`)

**Category:** tools

- **Issue:** These two tools produce a manually-authored, GitHub-issue-shaped bug bundle. The project's own canonical dogfooding runbook (`.agents/skills/agda-dogfooding/SKILL.md` §3) explicitly instructs agents: *"Call `agda_capture_session` (not `agda_bug_report_bundle`) whenever..."* — a direct, authored supersession signal, not an inference. Despite that, `docs/assistant-workflows.md` — this same server's primary workflow doc — still dedicates its entire "## 6. Filing a bug report" section (lines 136–177) to `agda_bug_report_bundle`/`_update_bundle`, and its "Typical full session pattern" walkthrough's Step 5 ("If stuck") recommends `agda_bug_report_bundle` as the go-to action (line 200). The repository's own two canonical docs actively disagree about which tool an agent should reach for when something goes wrong — a confirmed, concrete mis-selection risk, not a speculative one.
  - Files: `src/tools/register-bug-bundles.ts` (212 lines — sole registration site for both tools), `src/tools/reporting-tools.ts` (2 register calls + import to remove), `src/reporting/bug-report.ts` (partially affected — see Impact), `test/unit/reporting/bug-report.test.ts`, `test/property/reporting/bug-report.property.test.ts`, `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (bug-bundle test cases), `test/fixtures/e2e/mcp-tool-coverage.json` (2 entries), `src/tools/data/tool-family-examples.json` (1 entry, `agda_bug_report_bundle` only — `agda_bug_report_update_bundle` has none), `src/session/tool-recommendation.ts` (1 real `addIfAvailable` entry, priority 10, in the has-error branch), `docs/assistant-workflows.md` (§6 in full + the Step 5 mention), `.agents/skills/agda-dogfooding/SKILL.md` (line 78's "not agda_bug_report_bundle" parenthetical becomes stale prose once the tool no longer exists).
  - Impact: removes 2 tools + a 212-line registration file + its dedicated tests. **Does not** remove `src/reporting/bug-report.ts`'s cryptographic fingerprinting — see Security cross-check below; only `buildBugReportBundle`/`defaultBugTitle` (pure data-shaping, no crypto) become dead code inside that file, so the file itself is not deleted, only trimmed. Removing the `tool-recommendation.ts` entry with no replacement would silently regress agent guidance in the "has error" branch (verified: `agda_capture_session` currently has **zero** entries anywhere in `tool-recommendation.ts` — it is not recommended by the engine at all today) — the fix approach below accounts for this explicitly rather than leaving a guidance gap.
  - Fix approach: delete outright (D-02) — no schema merge is applicable, since `agda_capture_session`'s replay-manifest capture artifact is a categorically different shape from a GitHub-issue-style bundle, not a drop-in replacement API. Replace `docs/assistant-workflows.md`'s §6 with a short section demonstrating `agda_capture_session` (mirroring the dogfooding skill's own §3 example), update the Step-5 mention, and **add** (not merely remove) a new `tool-recommendation.ts` entry recommending `agda_capture_session` in the same has-error branch the deleted `agda_bug_report_bundle` entry currently occupies, so agent guidance is preserved rather than silently dropped.
  - Severity: Medium — confirmed redundancy with an active, currently-live mis-selection risk (two of the repo's own docs disagree today), but current real-world exposure is limited by zero recorded local usage and the dogfooding skill already steering agents away from it.
  - Real-usage-count: `agda_bug_report_bundle` = 0, `agda_bug_report_update_bundle` = 0 (of 72 total recorded invocations across 21 local runs — small, RT-probe-biased sample per the source audit's Reliability Disclaimer; not treated as a sole criterion here, the supersession/mis-selection evidence above is independent of the usage count).
  - Loop②-stage-entry: none. (`agda_capture_session` is the confirmed capture-stage entry point, excluded from this candidate list entirely; these bundle tools are a parallel, non-pipeline-integrated manual path — their output never flows into `scripts/dogfood/dogfood-wrapup.mjs`'s judge→file chain.)
  - Security cross-check: RESEARCH.md's V6 Cryptography row names `src/reporting/bug-report.ts` (`createHash` fingerprinting). Traced: `fingerprintBugReport()` (the function containing the actual `createHash("sha256")` call) is re-exported verbatim by `src/agda/session-capture/dedup-index.ts` and consumed independently by `agda_capture_session` for its own dedup routing. This cut does not remove that function or its only crypto-relevant call site — confirmed not excluded on security grounds.
  - Lockstep-checklist (six steps, fully spelled out, not a reference):
    1. Delete both `registerBugReportBundle`/`registerBugReportUpdateBundle` call sites and their imports in `src/tools/reporting-tools.ts`; delete `src/tools/register-bug-bundles.ts` outright (both tools' only registration site — confirmed via grep, no other file imports from it).
    2. Delete the `agda_bug_report_bundle` and `agda_bug_report_update_bundle` entries from `test/fixtures/e2e/mcp-tool-coverage.json` (74 → 72 rows); run `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts` before and after to confirm the set-equality assertion passes both times relative to its own state.
    3. Delete the single `agda_bug_report_bundle` entry from the `"reporting"` family array in `src/tools/data/tool-family-examples.json` (confirmed: `agda_bug_report_update_bundle` has no entry there, so this step is a no-op for the update-bundle tool specifically). Run `npx vitest run test/unit/tools/tool-family-examples.test.ts` after.
    4. Manual doc pass (no automated check covers `docs/`): replace `docs/assistant-workflows.md`'s entire "## 6. Filing a bug report" section (currently lines 136–177) with an `agda_capture_session` example mirroring `.agents/skills/agda-dogfooding/SKILL.md` §3's worked example; change the "Typical full session pattern" Step 5 line (currently line 200, `agda_bug_report_bundle → file a structured report if the server misbehaves`) to recommend `agda_capture_session` instead. In `.agents/skills/agda-dogfooding/SKILL.md` line 78, rephrase the now-stale "(not `agda_bug_report_bundle`)" parenthetical (the contrast target no longer exists) to something like "capture, don't hand-author a separate bug bundle" or drop the parenthetical entirely. Leave `docs/release-0.7.0-triage.md` untouched — confirmed it is an explicitly dated, reconciled historical release-gate record ("Status: ... This doc was stale. Last updated: 2026-07-04"), not living workflow documentation; editing history would be wrong here.
    5. In `src/session/tool-recommendation.ts`, remove the `addIfAvailable(..., { tool: "agda_bug_report_bundle", rationale: "If the error is unexpected, file a structured bug report.", priority: 10, ... })` block in the has-error branch, and **add** a replacement `addIfAvailable(..., { tool: "agda_capture_session", ... })` entry in the same branch so the "you're stuck/erroring, here's what to do" guidance is preserved rather than silently regressed (confirmed: no existing entry recommends `agda_capture_session` anywhere in this file today).
    6. Delete `test/unit/reporting/bug-report.test.ts` and `test/property/reporting/bug-report.property.test.ts` **only if** their test cases exclusively exercise `buildBugReportBundle`/`defaultBugTitle` (the parts that become dead); if either file also exercises `fingerprintBugReport()` itself (the surviving shared function), keep those specific cases — re-scope the file rather than deleting it outright. Delete the bug-bundle-specific test cases inside `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (the tool-level E2E coverage for these two tools, now gone). Verify with `npx vitest run test/unit/reporting/ test/property/reporting/ test/integration/mcp/mcp-remaining-tools-e2e.test.ts` before and after.

### CUT-11: Merge `agda_goal_analysis` into `agda_goal_catalog` via an optional `goalId` filter

**Category:** tools

- **Issue:** `agda_goal_analysis`'s callback (`src/tools/analysis-tools.ts` lines 108–191, ~84 lines) duplicates, field-for-field, the exact per-goal computation `agda_goal_catalog`'s domain logic (`src/session/goal-catalog.ts`'s `buildGoalCatalog`) already performs for *every* open goal in one call. Both call the identical pure functions `parseContextEntry`/`deriveSuggestions` from `src/agda/goal-analysis.ts`, and both compute "splittable variables" via the identical filter predicate (`!isImplicit && name && type`). `agda_goal_analysis` is functionally a single-goal-filtered view of what `agda_goal_catalog` already returns for all goals in one round trip — this is a confirmed source-level duplication (traced by reading both implementations), not a name-similarity guess.
  - Files: `src/tools/analysis-tools.ts` (delete the `agda_goal_analysis` registration, ~84 lines), `src/tools/register-goal-catalog.ts` + `src/session/goal-catalog.ts` (add an optional `goalId` input/fast-path — see Fix approach), `test/fixtures/e2e/mcp-tool-coverage.json` (1 entry), `src/tools/data/tool-family-examples.json` (1 entry — the *only* entry in the `"analysis"` family array; see Impact), `docs/assistant-workflows.md` (no direct mention of `agda_goal_analysis` by name — confirmed via grep, no edit needed there), `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (E2E coverage case), `test/unit/session/goal-catalog.test.ts` + `test/property/session/goal-catalog.property.test.ts` (gain new single-goal-filter test cases; no dedicated `agda_goal_analysis`-only test file exists to delete — confirmed via `find test -iname "*goal-analysis*"` returning only `test/unit/agda/goal-analysis.test.ts` and its `.property.test.ts` sibling, which test the shared `src/agda/goal-analysis.ts` pure functions both tools consume, not the `agda_goal_analysis` MCP tool itself — these stay untouched since the underlying functions survive).
  - Impact: removes 1 tool + ~84 duplicated lines. This is a **merge**, not a pure subtraction: `agda_goal_catalog` needs a small, low-risk addition (an optional `goalId` field that, when present, queries only that one goal via `session.goal.typeContext(goalId)` directly instead of iterating every `session.getGoalIds()` entry) to preserve the efficient single-goal round-trip cost `agda_goal_analysis` currently provides — without it, an agent that only wants one goal's analysis would pay for N goal queries instead of 1 on a large multi-goal proof. Deleting `agda_goal_analysis`'s sole `tool-family-examples.json` entry leaves the `"analysis"` family's curated-examples array **empty** (it is the only entry there) — the fix approach below adds a replacement example rather than leaving the family unrepresented.
  - Fix approach: merge (D-02 explicitly allows merge, not only delete). Add an optional `goalId` input to `agda_goal_catalog`'s schema and a single-goal fast path through `buildGoalCatalog`; once verified schema-compatible and covered by new unit tests, delete `agda_goal_analysis`'s registration. Because this requires new code (not pure subtraction), it carries slightly more implementation risk than CUT-10 — flag this explicitly to whoever executes the corresponding back-half plan so it isn't treated as a same-risk-tier deletion.
  - Severity: Low — genuine code/tool-surface duplication with no correctness or security implication; zero usage locally (with the standard sample-size caveat), but the code-level duplication evidence stands independently of the usage count.
  - Real-usage-count: `agda_goal_analysis` = 0, `agda_goal_catalog` = 1 (of 72 total recorded invocations across 21 local runs — small sample, not a sole criterion here; the source-level duplication finding is the primary evidence for this candidate).
  - Loop②-stage-entry: none. (Neither tool is any Loop② stage's primary interface — both are read-only goal introspection, unrelated to capture/judge/file/fix/lock.)
  - Security cross-check: neither tool appears in, or calls into, any Security Domain ASVS row or Known Threat Pattern (pure read-only goal-state introspection: no file writes, no cryptography, no auth boundary). Not excluded.
  - Lockstep-checklist (six steps, fully spelled out, not a reference):
    1. **Add before deleting:** extend `src/tools/register-goal-catalog.ts`'s input schema with an optional `goalId: goalIdSchema.optional()`, and thread a single-goal path through `src/session/goal-catalog.ts`'s `buildGoalCatalog` (or a new sibling pure function) that queries only the one requested goal via `session.goal.typeContext(goalId)` when `goalId` is present, falling back to the existing all-goals iteration when it is absent. Only after this is implemented and tested does step 2 apply — this candidate's merge direction means the addition must land before the subtraction, unlike CUT-10's pure delete.
    2. Delete the `agda_goal_analysis` registration block from `src/tools/analysis-tools.ts` (confirmed lines 108–191) once the goalId-filtered `agda_goal_catalog` path covers its use case.
    3. Delete the `agda_goal_analysis` entry from `test/fixtures/e2e/mcp-tool-coverage.json` (74 → 73 rows, pending CUT-10's own 2-row deletion in the same or a different batch); update `agda_goal_catalog`'s own `scenario` text if it should now mention the single-goal filter path. Run `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts` before and after.
    4. Replace (do not merely delete) the sole `"analysis"` family entry in `src/tools/data/tool-family-examples.json` (currently `{"tool": "agda_goal_analysis", "summary": "Inspect a goal's expected type, locals, and useful suggestions.", "args": {"goalId": 0}}`) with an equivalent example calling `agda_goal_catalog { "goalId": 0 }`, so the `"analysis"` family is not left with an empty examples array. Run `npx vitest run test/unit/tools/tool-family-examples.test.ts` after.
    5. `src/session/tool-recommendation.ts` — confirmed no existing entry recommends `agda_goal_analysis` (grep found none), so no removal is needed here; `agda_goal_catalog` already has its own recommendation entry (priority 2, "Get a structured overview of all goals") which needs no change since the tool it recommends is unchanged from the agent's perspective (the new `goalId` field is additive/optional).
    6. Delete the `agda_goal_analysis`-specific test case(s) inside `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (the tool-level E2E coverage, now gone with the tool); **add** new single-goal-filter test cases to `test/unit/session/goal-catalog.test.ts` and (if a property test is warranted for the new filter parameter) `test/property/session/goal-catalog.property.test.ts` to cover the merged behavior. Do not touch `test/unit/agda/goal-analysis.test.ts`/`.property.test.ts` — those test the shared pure functions (`parseContextEntry`/`deriveSuggestions`) both tools consumed and continue to consume; they are unaffected by which MCP tool wraps them.

**Also considered, not cut-list candidates (12-03's own findings — see `12-AUDIT-TOOLS.md` for full detail):** `agda_capture_session` is the confirmed Loop②-capture-stage entry point (excluded outright, never a candidate); a large "Considered, Not Flagged" set of same-category/similar-sounding tool clusters (goal/context/refine family, implicit/irrelevant-args show/toggle pairs, highlighting trio, backend trio, search_about vs. search_definitions, impact/bulk_status/project_progress trio, builtin vs. stdlib migration maps, session_snapshot vs. proof_status, proof_status vs. its own composed granular tools) were each individually investigated and found to reflect deliberate Agda-IOTCM-protocol-parity design or a documented composite-vs-granular pattern, not accidental duplication — none became a cut-list row.

---

## src Low-Risk Subtraction

**Source:** `12-AUDIT-SRC-DEBT.md` (Plan 12-04), audited 2026-07-06. Scope: `src/` excluding the MCP tool-registration surface (Plan 12-03's territory). Every row below is Low severity by construction — D-01 scopes `src/` to low-risk subtraction only; anything riskier is out of charter, not merely under-graded. Every row's Restructuring-or-deletion field is `low-risk-deletion`; Upstream-overlap is `yes` only for CUT-20 (the one row touching a guarded file in the union of Phase 10's MERGE-01 files and `.agents/skills/upstream-sync/SKILL.md`'s guarded-file list).

| CUT-NN | Category | Issue | Files | Impact | Fix approach | Severity | Restructuring-or-deletion | Upstream-overlap |
|---|---|---|---|---|---|---|---|---|
| CUT-12 | src-subtraction | `fileExists`/`fileMtimeMs` are genuinely dead: zero references anywhere in the repo (confirmed by whole-repo grep, not just the cross-reference pass) beyond their own declaration. Traces to a pre-fork upstream commit (`a3e26c1`, "Pre v0.6.5 bug hunt"); the file's own header comment ("Re-export existsSync/statSync indirectly via small helpers the tool layer can use...") describes an intended consumer that was never built. | `src/agda/import-graph.ts` (lines 353-364) | Removes 12 lines of long-standing, never-called dead code and a stale, misleading header comment (the comment implies a live consumer that doesn't exist). Zero behavior change; nothing imports these two functions. | Delete `fileExists`/`fileMtimeMs` and the 2-line "Re-export... via small helpers" header comment immediately above them. | Low | low-risk-deletion | no |
| CUT-13 | src-subtraction | `PATH_SEP` is an unused re-export of `node:path`'s `sep` — zero references anywhere else in the repo, and no internal use within its own file either. | `src/agda/agdai-cache.ts` (line 339) | Removes one dead line; the underlying `sep` import (if only used for this re-export) can also be dropped if confirmed otherwise-unused within the file. | Delete the `export const PATH_SEP = sep;` line; drop the `sep` import from `node:path` if it becomes unused as a result. | Low | low-risk-deletion | no |
| CUT-14 | src-subtraction | `projectLibraryNames`/`configuredLibraryFileNames` are unused convenience wrappers added in a single commit (`cda6ed1`, "[fix] Library registration SSOT") and never called since, despite this file having 7 dedicated test/fixture files — none of which reference these two functions directly. | `src/agda/library-registration.ts` (final ~8 lines) | Removes 8 lines of dead public surface; the internal functions they wrap (`discoverProjectLibraries`, `readConfiguredLibraries`) remain, still used by `createLibraryRegistration` (the file's actual live entry point). | Delete both exported wrapper functions. | Low | low-risk-deletion | no |
| CUT-15 | src-subtraction | 6 zod schema constants (`agdaResponseSchema`, `goalInfoSchema`, `solveAllSolutionSchema`, `infoErrorInnerSchema`, `moduleContentsEntrySchema`, `displayInfoPayloadSchema`) are exported but confirmed (full-file read) to be used only internally within `response-schemas.ts` itself as composition building blocks for other, externally-used schemas (e.g. `agdaResponseSchema` underlies `highlightingInfoResponseSchema` and 12 others via `.extend()`). Zero external file imports any of the 6 directly. | `src/protocol/response-schemas.ts` | Reduces the module's public surface to what's actually consumed elsewhere; zero behavior change since the values themselves stay exactly as-is, only the `export` keyword is removed from these 6 declarations. | Change `export const X = ...` to `const X = ...` for all 6; re-run `test/unit/protocol/*.test.ts` + `typecheck:test` to confirm nothing external was quietly relying on one of them. | Low | low-risk-deletion | no |
| CUT-16 | src-subtraction | `VERSION_DETECTION_TIMEOUT_MS` and `extractRawVersionString` are exported but used only internally within their own file (`preflightVersionDetection`/`piggybackVersionFromResponses`, both in the same file) — zero external references, including no direct test file for either symbol. | `src/agda/agda-version-detection.ts` (lines 44, 61) | Reduces public surface of a version-probe helper module; zero behavior change. | Remove `export` from both declarations. | Low | low-risk-deletion | no |
| CUT-17 | src-subtraction | `adoptSpawnedProcessForSession` is exported but called only internally within its own file (line 145, from `ensureProcessForSession` in the same file). | `src/agda/session-process-lifecycle.ts` (line 153) | Reduces public surface of a process-lifecycle helper; zero behavior change. | Remove `export` from the declaration. | Low | low-risk-deletion | no |
| CUT-18 | src-subtraction | `commandCategorySchema`/`commandExposureSchema` are exported but used only internally within `metadata.ts` itself (as `z.infer<>` targets and object-shape fields on the same lines). | `src/protocol/metadata.ts` (lines 3, 14) | Reduces public surface; zero behavior change. The derived `type CommandCategory`/`type CommandExposure` exports (lines 12, 19) are used externally and are **not** part of this candidate — only the two schema `const`s. | Remove `export` from the two schema-const declarations only; keep the two derived type exports as-is. | Low | low-risk-deletion | no |
| CUT-19 | src-subtraction | `renderDiagnosticsSection` is exported but called only internally within its own file (lines 126-127, same file as its declaration at line 74). | `src/session/tool-presentation.ts` (line 74) | Reduces public surface of a session-status formatting helper; zero behavior change. | Remove `export` from the declaration. | Low | low-risk-deletion | no |
| CUT-20 | src-subtraction | `invalidOptions` is exported but called only internally within its own file (`session-load-helpers.ts` lines 150, 159, same file as its declaration at line 44). | `src/agda/session-load-helpers.ts` (line 44) — **guarded file**, in the upstream-overlap union set | Reduces public surface of one of the load-path's guarded files by one keyword; zero behavior change; does not touch any load-terminus semantic Phase 10 adjudicated. | Un-export only (`export function` → `function`); no logic change. Framed as convergence, not restructuring — this file's current behavior is already the referee-approved implementation from Phase 10's MERGE-03 verdict, so this is a pure visibility tidy that neither diverges from nor re-derives upstream's semantics. **Recommendation for the D-03 sign-off:** given this file's guarded status means *any* future conflict here (including on this single line) requires human escalation per `.agents/skills/upstream-sync/SKILL.md` Section 3/6, the value-to-friction ratio of this specific one-line change is low enough that deferring or rejecting it at sign-off is a reasonable, defensible choice — flagged transparently rather than silently omitted. | Low | low-risk-deletion | **yes** |

**Cross-reference (from the source audit):** CUT-12 – CUT-14 are true dead-code deletions (function/constant bodies removed entirely); CUT-15 – CUT-20 are unused-export-surface tidies (code stays, only the `export` keyword is removed) — D-01 explicitly names "unused exports" as its own sanctioned low-risk-deletion sub-category alongside "dead code" and "duplicate implementations," so both groups qualify identically for the cut list despite the different literal diff shape. All 9 rows can land in a single commit per the corresponding back-half plan (same fix pattern, same verification command: `RUN_AGDA_INTEGRATION=1 npx vitest run && npx tsc -p tsconfig.test.json --noEmit`), except CUT-20 which the sign-off checkpoint may reasonably split out given its guarded-file status.

**Also considered, not cut-list candidates (12-04's own Excluded-on-Security-or-Invariant-Grounds — see `12-AUDIT-SRC-DEBT.md` for full detail):** un-exporting `resolveServerRepoRoot` (`src/repo-root.ts`) was excluded because its parameterized signature is a deliberate test-injection seam for the security-critical path-sandboxing boundary; un-exporting `AgdaSourceReadError` (`src/session/safe-source-io.ts`) was excluded because its exported, named-class shape is a documented design decision letting callers/tests distinguish guard rejections from real I/O errors. Both citations follow RESEARCH.md's Pitfall 6 ("low usage is not the same signal as low-security-value"). `src/agda/import-graph.ts` itself (the file, not its two dead internal helpers already captured as CUT-12) was independently re-confirmed **not** dead code (4 real non-test consumers backing 6 live tools) and is not re-litigated.

---

## Regression-Lock Exclusion List

*(Transcribed verbatim from `12-AUDIT-LOCKS-RT6RT7.md`, Plan 12-05's Task 1 output. Every cut approved at the D-03 sign-off checkpoint and executed by this phase's back-half plans must treat every file and test-case name below as untouchable — C-01: no simplification may delete or weaken any from-RED regression-locked test.)*

### Methodology

Both phrasings the fix-queue uses for a regression lock were searched:
**"Regression lock:"** (used in 8 of the 10 locked entries) and
**"Regression evidence:"** (used in fingerprint `0bc76d15c2fec8df`, the one
entry that phrases it differently). The RESEARCH.md Code Examples Python
regex snippet was run verbatim, extended to match both phrasings, against the
live `test/fixtures/fix-queue.json`. Independently of the regex, **every one
of the 10 locked entries' full `notes` field was read end-to-end in this
session, in full, not sampled** — this caught one entry (`e6f0c1169032b9d5`)
whose lock is matrix-driven prose ("Backfilled: matches
capture-regression-matrix.json's ...") rather than a `Regression lock:`/
`Regression evidence:` line, and one under-count in `0bc76d15c2fec8df`'s own
paraphrase (see Flagged Discrepancy below) that the regex alone would have
missed entirely.

Every extracted test file path was existence-checked directly (`test -f`)
against the real test tree — see the per-file "Existence check" line in each
Detail entry below. Beyond file existence, every individually quoted
vitest test-case string was **also** verified byte-for-byte present via
`grep -F` against its file's current contents, so this list does not merely
trust the fix-queue's prose to still be accurate.

### Locked-entry count (re-confirmed live, not assumed)

A fresh read of `test/fixtures/fix-queue.json` in the source-audit session confirms
**exactly 10 entries with `"status": "locked"`**, matching the plan's
planning-time count with no drift:

`e6f0c1169032b9d5`, `5abecc959e43fef3`, `bfcba437f5426fd6`,
`eb7439cb3ed9d6b9`, `fdc90bfde12fb938`, `e5f6de1fa365b887`,
`eaea6321183bdf7b`, `004d161b839ce725`, `3306edf4c2d01c53`,
`0bc76d15c2fec8df`.

`test/fixtures/capture-regression-matrix.json` contains exactly **2** entries,
both `"status": "locked"`: `issue-64-61-transitive-staleness` and
`guard-no-metas-clean-load-under-fault-injection`. Both map to fix-queue
fingerprint `e6f0c1169032b9d5`'s "Backfilled" note.

**Total exclusion-list rows: 12** (10 locked fix-queue entries + 2 matrix
entries) — matching the acceptance criteria exactly.

### Summary Table

| # | ID | Kind | Status | File(s) | Test-lock count | Existence check |
|---|----|------|--------|---------|------------------|------------------|
| 1 | `e6f0c1169032b9d5` | fix-queue (flagship) | locked | (matrix-driven — see rows 11–12) | 0 own; 2 via matrix | N/A — lock lives in the matrix rows |
| 2 | `5abecc959e43fef3` | fix-queue | locked | `test/unit/agda/agent-ux.test.ts`, `test/unit/tools/goal-tools-give.test.ts` | 4 | FOUND, all 4 strings verbatim-verified |
| 3 | `bfcba437f5426fd6` | fix-queue | locked | `test/unit/agda/goal-operations-give.test.ts`, `test/unit/tools/goal-tools-give.test.ts` | 2 | FOUND, both strings verbatim-verified |
| 4 | `eb7439cb3ed9d6b9` | fix-queue | locked | `test/unit/tools/file-tools.test.ts` | 2 | FOUND, both strings verbatim-verified |
| 5 | `fdc90bfde12fb938` | fix-queue | locked | `test/unit/tools/analysis-tools.test.ts` | 1 | FOUND, string verbatim-verified |
| 6 | `e5f6de1fa365b887` (RT2) | fix-queue | locked | `test/unit/agda/expression-operations.test.ts` | 4 | FOUND, all 4 strings verbatim-verified |
| 7 | `eaea6321183bdf7b` (RT3) | fix-queue | locked | `test/unit/agda/goal-operations-context-check.test.ts` | 2 | FOUND, both strings verbatim-verified |
| 8 | `004d161b839ce725` (RT4) | fix-queue | locked | `test/unit/agda/agent-ux.test.ts`, `test/unit/tools/goal-tools-give.test.ts` | 4 (== row 2, shared) | FOUND (identical set to row 2) |
| 9 | `3306edf4c2d01c53` (RT8) | fix-queue | locked | `test/unit/session/register-agda-load-no-metas.test.ts` | 1 | FOUND, string verbatim-verified |
| 10 | `0bc76d15c2fec8df` | fix-queue | locked | `test/unit/tools/dogfood-run-report-checkpoint.test.ts`, `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts` | **8 actual** (notes describe only 6 — see Flagged Discrepancy) | FOUND — both files exist; every actual `test()`/`testPosix()` in both enumerated by direct read |
| 11 | `issue-64-61-transitive-staleness` | matrix (→ `e6f0c1169032b9d5`) | locked | `test/integration/mcp/capture-regression.test.ts` | 1 | FOUND, generated test name verified against the file's own template literal |
| 12 | `guard-no-metas-clean-load-under-fault-injection` | matrix (→ `e6f0c1169032b9d5`) | locked | `test/integration/mcp/capture-regression.test.ts` | 1 | FOUND, generated test name verified against the file's own template literal |

### Detail

#### 1. `e6f0c1169032b9d5` — flagship #64/#61 transitive-staleness

- **Notes-cited lock:** none in its own `notes` field beyond: *"Backfilled:
  matches capture-regression-matrix.json's issue-64-61-transitive-staleness
  entry (status locked by Phase 3.1)."* No `Regression lock:`/`Regression
  evidence:` line — this entry's lock mechanism **is** the matrix, not a
  hand-named vitest test. Its two matrix rows (11, 12 below) carry the actual
  runnable test names.
- **Existence check:** N/A directly (see rows 11–12).
- **Proves:** a dependency file's on-disk change while its dependent is
  already loaded is detected as a real failure on the next
  `agda_load_no_metas`/`agda_load` call, never reported as a false
  "ok-complete" (the flagship #64/#61 transitive-staleness false-green Phase
  3.1 fixed).

#### 2. `5abecc959e43fef3` — `agda_auto` CLI-flag-injection guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a flag-shaped hints token instead of injecting it into the payload`
  - `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a flag-shaped excludeHints token instead of injecting it into the payload`
  - `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a hint token containing whitespace (would split into a second Agsy token)`
  - `test/unit/tools/goal-tools-give.test.ts` :: `agda_auto rejects a flag-shaped hint before calling session.goal.autoOne`
- **Existence check:** FOUND — both files exist (`test -f`); all 4 quoted
  strings verified byte-for-byte present via `grep -F`.
- **Proves:** `agda_auto`'s `hints`/`excludeHints` are rejected before
  reaching the Agsy CLI payload if they look like a flag or contain
  whitespace, so a flag-shaped hint can never be silently executed as an
  injected Agsy flag.

#### 3. `bfcba437f5426fd6` — `agda_give` ok-wrapping-a-rejection guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/goal-operations-give.test.ts` :: `give() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected`
  - `test/unit/tools/goal-tools-give.test.ts` :: `agda_give surfaces a rejected expression as ok:false / give-rejected`
- **Existence check:** FOUND — both files exist; both strings verified
  byte-for-byte present.
- **Proves:** an Agda-rejected `agda_give` expression surfaces as
  `ok:false`/`give-rejected`, never as a false `ok:true` wrapping the
  rejection text.

#### 4. `eb7439cb3ed9d6b9` — `agda_search_definitions` src/-layout guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/tools/file-tools.test.ts` :: `agda_search_definitions searches a caller-supplied directory for src/-layout projects`
  - `test/unit/tools/file-tools.test.ts` :: `agda_search_definitions rejects a directory parameter that escapes the project root`
- **Existence check:** FOUND — file exists; both strings verified
  byte-for-byte present.
- **Proves:** `agda_search_definitions` can search a caller-supplied
  `directory` (for `src/`-layout projects) and still rejects one that
  escapes the project root.

#### 5. `fdc90bfde12fb938` — `agda_proof_status` mislabel guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/tools/analysis-tools.test.ts` :: `agda_proof_status reports NOT confirmed complete when goals are empty but constraints remain`
- **Existence check:** FOUND — file exists; string verified byte-for-byte
  present.
- **Proves:** `agda_proof_status`'s prose summary never claims "All goals
  solved" when `constraintsText` still holds a real error.

#### 6. `e5f6de1fa365b887` (RT2) — compute/infer throw-on-Error-DisplayInfo guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/expression-operations.test.ts` :: `computeTopLevel throws instead of returning ok on an Error DisplayInfo (NotInScope)`
  - `test/unit/agda/expression-operations.test.ts` :: `inferTopLevel throws instead of returning ok on an Error DisplayInfo (NotInScope)`
  - `test/unit/agda/expression-operations.test.ts` :: `compute() (goal-scoped) throws instead of returning ok on an Error DisplayInfo (NotInScope)`
  - `test/unit/agda/expression-operations.test.ts` :: `infer() (goal-scoped) throws instead of returning ok on an Error DisplayInfo (NotInScope)`
- **Existence check:** FOUND — file exists; all 4 strings verified
  byte-for-byte present.
- **Proves:** both the top-level and goal-scoped `compute`/`infer`
  operations throw (never silently return an `ok:true` envelope) when Agda
  reports a `NotInScope`-class `Error` `DisplayInfo`.

#### 7. `eaea6321183bdf7b` (RT3) — `goalTypeContextCheck` throw guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/goal-operations-context-check.test.ts` :: `goalTypeContextCheck throws on a NotInScope Error DisplayInfo instead of embedding it in goalType`
  - `test/unit/agda/goal-operations-context-check.test.ts` :: `goalTypeContextCheck throws on a genuinely ill-typed (UnequalTerms) Error DisplayInfo`
- **Existence check:** FOUND — file exists; both strings verified
  byte-for-byte present.
- **Proves:** `goalTypeContextCheck` throws on any `Error DisplayInfo`
  (NotInScope or a genuine type mismatch) instead of embedding the raw error
  text inside `goalType` under an `ok:true` envelope.

#### 8. `004d161b839ce725` (RT4) — cross-referenced to row 2

- **Quoted regression lock (verbatim from notes):** identical text to
  `5abecc959e43fef3` (row 2) — same root cause, same fix
  (`assertValidAutoHint()`), same 4 tests. The fix-queue's own
  `relatedFingerprint` convention keeps this as its own row rather than
  merging it into row 2.
- **Existence check:** FOUND (identical to row 2's result).
- **Proves:** the identical guarantee as `5abecc959e43fef3` — deleting or
  weakening these 4 tests would silently un-lock **both** fingerprints, not
  just one.

#### 9. `3306edf4c2d01c53` (RT8) — `agda_load_no_metas` session-regression guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/session/register-agda-load-no-metas.test.ts` :: `agda_load_no_metas surfaces regression diagnostic and previousClassification when reload drops from ok-complete to failure`
- **Existence check:** FOUND — file exists; string verified byte-for-byte
  present.
- **Proves:** `agda_load_no_metas` surfaces a `previousClassification` +
  session-regression diagnostic on an ok-complete-to-failure transition,
  matching `agda_load`'s own pre-existing behavior.

#### 10. `0bc76d15c2fec8df` — dogfood-run.mjs checkpoint guard (see Flagged Discrepancy)

- **Notes-cited lock (paraphrased, not literally quoted — "Regression
  evidence:" phrasing):** *"test/unit/tools/dogfood-run-report-checkpoint.test.ts
  (3 tests: startup checkpoint, SIGKILL-to-process-group leaves
  finalized:false, SIGTERM-to-process-group finalizes with exit metadata)
  and test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts (3 tests:
  loud warning on finalized:false, silent on finalized:true, silent on the
  pre-fix schema's absent field) -- all 6 green."*
- **Actual test-case strings found by direct file read (all verified
  byte-for-byte present):**
  - `test/unit/tools/dogfood-run-report-checkpoint.test.ts` (5 `testPosix(...)` registrations, not 3):
    1. `writes an initial run-report.json (finalized:false, zero tool calls) immediately at startup, before any tool call is made`
    2. `a hard SIGKILL delivered to the whole process group after one recorded action still leaves run-report.json on disk with finalized:false (the primary SIGKILL defense)`
    3. `a graceful SIGTERM delivered to the whole process group finalizes the report (finalized:true) with exit metadata`
    4. `a child that ignores SIGTERM is escalated to SIGKILL after the grace window, and the report reflects a CONFIRMED (not merely assumed) clean exit (WR-07, from-RED)`
    5. `finalize()'s SIGKILL escalation kills the WHOLE process group, including a genuine grandchild the inner child spawns itself, not just the immediate child (WR-09, from-RED)`
  - `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts` (3 `test(...)` registrations, matches notes):
    1. `checkReportFinalized: a finalized:false report prints a loud stderr warning and returns false`
    2. `checkReportFinalized: a finalized:true report is silent and returns true`
    3. `checkReportFinalized: a report with no finalized field at all (pre-fix schema) is treated as finalized, silently`
- **Existence check:** FOUND — both files exist; all 8 actual test-case
  strings verified byte-for-byte present via `grep -F`.
- **Proves:** `dogfood-run.mjs` always leaves a `run-report.json` behind —
  incrementally checkpointed (`finalized:false`) after every recorded action
  and finalized on graceful shutdown — even under a hard, whole-process-group
  `SIGKILL` with zero cooperating exit path (tests 1–3), that a wedged child
  ignoring `SIGTERM` is correctly escalated to a confirmed `SIGKILL` (test 4),
  and that the escalation reaches a genuine grandchild process, not just the
  immediate child (test 5) — so a Codex-hard-killed dogfooding run can still
  enter the fix-queue loop, and `dogfood-wrapup.mjs` warns loudly (never
  silently) on an unfinalized report instead of misreading it as complete.

#### 11. `issue-64-61-transitive-staleness` (matrix entry, → `e6f0c1169032b9d5`)

- **Test lock:** `test/integration/mcp/capture-regression.test.ts` generates
  one `it(...)` per matrix entry via the template literal
  `` `${entry.id}: ${entry.tool} ${expectMatch ? "matches" : "does NOT yet match"} ORCL-01 cold expected value` ``
  (file lines 45–55). With this entry's `status: "locked"` (`expectMatch =
  true`), the generated, runnable test name is exactly:
  `issue-64-61-transitive-staleness: agda_load_no_metas matches ORCL-01 cold expected value`
  — matching `docs/LOAD-TERMINUS-ADJUDICATION.md`'s own referee-run citation
  verbatim.
- **Existence check:** FOUND — file exists; the generating template literal
  itself was read directly, not assumed.
- **Proves:** the same flagship guarantee as `e6f0c1169032b9d5`, replayed
  through the shared ORCL-01 matrix-replay runner
  (`replayCaptureRegressionEntry` + `matchesExpected`) against one
  oracle-vetted `expected` value, rather than a hand-written ad hoc
  assertion.

#### 12. `guard-no-metas-clean-load-under-fault-injection` (matrix entry, → `e6f0c1169032b9d5`)

- **Test lock:** same generating file/template as row 11. Generated,
  runnable test name:
  `guard-no-metas-clean-load-under-fault-injection: agda_load_no_metas matches ORCL-01 cold expected value`
- **Existence check:** FOUND — same file as row 11.
- **Proves:** a genuinely clean strict load (`agda_load_no_metas`) still
  reports `ok-complete` correctly even with the fault-injection env levers
  (`AGDA_MCP_IDLE_COMPLETION_MS`/`AGDA_MCP_POST_STATUS_IDLE_MS`, both fixture-set
  to `1`ms) pushed to their most aggressive values — i.e. the strict-load fix
  does not produce a false negative under timing pressure.

### Flagged Discrepancy: `0bc76d15c2fec8df`'s notes undercount its own regression lock

`0bc76d15c2fec8df`'s `notes` field states *"all 6 green"* (3 tests in
`dogfood-run-report-checkpoint.test.ts` + 3 in
`dogfood-wrapup-nonfinalized-report.test.ts`). A direct read of
`dogfood-run-report-checkpoint.test.ts` found **5** `testPosix(...)`
registrations, not 3 — the notes name only the first three ("startup
checkpoint", "SIGKILL...finalized:false", "SIGTERM...finalizes with exit
metadata"). The two additional tests (`WR-07`'s SIGKILL-escalation-after-a-
wedged-SIGTERM-ignoring-child test, and `WR-09`'s whole-process-group-reaches-
a-real-grandchild test) reference different fix identifiers (`WR-07`, `WR-09`)
than this entry's own (`0bc76d15c2fec8df`) — they were evidently added to the
same file in a later hardening pass but never folded into this fingerprint's
own notes text.

**Resolution for this exclusion list: all 8 actual tests across both files
are included** (row 10 above lists all 8), not just the 6 the notes describe
— under the source audit's own dual-method construction (full manual read),
under-listing here is exactly the failure mode the exclusion list exists to
prevent. This is reported as a discrepancy, not silently corrected in
`fix-queue.json` itself — that file's own edit is Task 2's scope in this
plan (12-06), and is limited strictly to appending RT6/RT7 re-evaluation
notes, never touching `0bc76d15c2fec8df`.

### Quick-reference file list (for every back-half execution plan's `read_first`)

Any cut touching one of these 11 files, or any of the 26 individually-named
test cases quoted above inside them, is **out of scope for deletion or
weakening** in this phase:

1. `test/integration/mcp/capture-regression.test.ts`
2. `test/unit/agda/agent-ux.test.ts`
3. `test/unit/tools/goal-tools-give.test.ts`
4. `test/unit/agda/goal-operations-give.test.ts`
5. `test/unit/tools/file-tools.test.ts`
6. `test/unit/tools/analysis-tools.test.ts`
7. `test/unit/agda/expression-operations.test.ts`
8. `test/unit/agda/goal-operations-context-check.test.ts`
9. `test/unit/session/register-agda-load-no-metas.test.ts`
10. `test/unit/tools/dogfood-run-report-checkpoint.test.ts`
11. `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts`

This list is a floor, not a ceiling: a back-half plan that discovers a new
`locked` fix-queue entry (e.g. a fix that lands mid-phase) must re-derive its
own lock set the same way, not assume this snapshot is still exhaustive.

None of the 20 CUT-NN candidates above touch any of these 11 files or their named test cases — cross-checked while transcribing each candidate's own `Files`/lockstep-checklist fields above.

---

## RT6/RT7 Re-Evaluation Verdicts

*(Transcribed verbatim from `12-AUDIT-LOCKS-RT6RT7.md`, Plan 12-05's Task 2 output. Per D-04: a definitive verdict per item — do it / don't / how — with implementation explicitly out of scope for this phase.)*

### RT6 Verdict

**Fingerprint:** `ad2b6d31f58f1759`
**Current status:** `triaged` (unchanged by the source audit plan — recording any status change is this plan's own Task 2 responsibility, executed below).

**Original finding:** `agda_load`'s response conflates five states (visible
goals, hidden metas, constraints, source-hole syntax, file completeness) into
one signal; two of the five remain genuinely conflated even after Phase 6's
partial fixes — (1) source-hole syntax has no field of its own (folded into
the single `hasHoles` boolean, with a gate that misses a hole co-occurring
with an unrelated hard error), and (2) `constraints` is absent from
`agda_load`'s own schema entirely (it exists only on `agda_proof_status`,
cross-referenced via the already-fixed `fdc90bfde12fb938`).

**HEAD re-reproduction check (source-audit session, against current merged HEAD,
post-Phase-10):**

- `src/agda/session-load-impl.ts` lines 124–129 (`runLoad`) and lines
  224–226 (`runLoadNoMetas`) both still gate the source-hole scan behind
  `parsed.success`:
  `const needsExplicitHoleScan = parsed.success && goals.length === 0 && parsed.invisibleGoalCount === 0;`
  (`runLoad`'s exact variable name; `runLoadNoMetas` uses
  `parsed.goalCount === 0` in place of `goals.length === 0`, same shape).
  This is the exact gate the original finding names as the root cause of the
  "a hole co-occurring with an unrelated hard error is never scanned for"
  symptom — **reproduces unchanged, byte-for-byte the same conditional, at
  current HEAD.**
- `src/agda/session-load-helpers.ts`'s `classifyLoadResult` (lines 170–183)
  still only derives a boolean `hasHoles`, `isComplete`, `classification`
  triple from `sourceHoleCount` — there is no field that surfaces the count
  itself, and no `constraints` input at all.
- `src/session/tool-presentation.ts`'s `loadDataSchema` (lines 9–32, the
  actual Zod schema `agda_load` returns to clients) confirms this
  client-visible: it exposes `goalCount`, `invisibleGoalCount`, `hasHoles`,
  `isComplete`, `classification` — **no `sourceHoleCount`, no `constraints`
  field exists on `agda_load`'s response at current HEAD.**

**Citation into `docs/LOAD-TERMINUS-ADJUDICATION.md` (Phase 10's decision):**
The adjudication's Decision table has exactly three rows — completion-signal
detection, fatal-stderr handling, inactivity timeout — all decided **Theirs
(upstream)**, and its own "Codebase state after this plan" section lists only
`src/session/agda-transport.ts`, `src/session/command-completion.ts`,
`src/agda/session-load-impl.ts` (plus the deleted
`load-terminus-tracker.ts`) as touched. `src/agda/session-load-helpers.ts`
and `src/session/tool-presentation.ts` — the two files RT6's own gap
actually lives in — are **not** on that list; they were untouched by the
merge. The adjudication's own "Scope note" states RT6 was "deliberately out
of scope for this adjudication even though they touch the same seam ... They
are re-evaluated only after the whole Phase 10 merge lands" — confirming
Phase 10 never attempted to resolve RT6, and the trigger firing means the
architecture RT6 sits downstream of is now stable, not that RT6 itself
changed.

**Verdict: HOW.** RT6's conflation is real, reproduces unchanged at current
HEAD, and is orthogonal to everything Phase 10 adjudicated — a future phase
should implement it. Target-shape sketch (schema addition, no implementation
here):

1. Add a `sourceHoleCount: number` field to `LoadResult` / `loadDataSchema`
   (today the count is computed internally by `countExplicitSourceHoles()`
   but only ever folds into the single `hasHoles` boolean — never surfaced
   on its own).
2. Add a `constraints`-shaped field to `agda_load`'s own response schema
   (today only `agda_proof_status` exposes anything constraint-shaped; RT6's
   cross-referenced sub-case `fdc90bfde12fb938` fixed `agda_proof_status`'s
   own mislabeling, but `agda_load` itself still has no constraints field at
   all).
3. Broaden the `needsExplicitHoleScan` gate in both `runLoad` and
   `runLoadNoMetas` (`src/agda/session-load-impl.ts`) so the source-hole scan
   also runs when `parsed.success` is false but `goals`/`invisibleGoalCount`
   are both zero — today's `parsed.success &&` term is exactly what hides a
   hole that co-occurs with an unrelated hard type error elsewhere in the
   same file.
4. This is a genuine breaking response-shape change on a widely-consumed
   schema (`loadDataSchema`), not a mechanical ≤2-file fix — it belongs to
   its own dedicated future phase, matching the fix-queue's own existing
   DEFERRED framing for this entry.

**Severity/urgency now that Phase 10 has landed:** unchanged from the
original filing — `missing-feature`, not a false-green (the file's overall
`classification` is still correctly `type-error` in the co-occurring-hole
case, so no incorrect "your proof is done" signal is ever given). Not
urgent/blocking, but the blind spot can cost an agent a wasted turn
concluding "nothing to fix here but the type error" when a valid,
syntactically-present hole is also waiting in the same file. A real,
mechanically-scoped candidate for a future phase; no change to its priority
relative to the rest of the backlog is warranted by Phase 10 landing.

### RT7 Verdict

**Fingerprint:** `b6821f42952c6ff8`
**Current status:** `triaged` (unchanged by the source audit plan).

**Original finding:** on a command timeout, `agda_load`'s response collapses
"timed out while Agda was still alive and mid-flight," "crashed," "never
started," and "produced no protocol response at all" into one
`classification: "process-error"` with one hardcoded `nextAction` diagnostic
("The Agda subprocess crashed or could not be started. Run `agda --version`
...") — even when the transport's own evidence
(`responseCount`/`sawStatusDone`/`lastResponseKind`) proves the process was
alive and actively responding right up to the deadline.

**HEAD re-reproduction check (source-audit session, against current merged HEAD,
post-Phase-10):**

- `src/session/agda-transport.ts`'s `onTimeout` handler (lines 299–311, part
  of the upstream-adopted, Phase-10-merged transport) still computes
  `responseCount`/`responseKinds` at the moment of timeout and embeds them
  only as free-text inside the rejected `Error`'s `.message`:
  `` `sendCommand timed out after ${timeoutMs}ms of inactivity (received ${responseCount} responses: ${JSON.stringify(responseKinds)})` ``
  — this evidence exists and is collected (confirmed also present:
  `sawStatusDone`, `lastResponseKind` as private fields feeding
  `waitDiagnostics`/`onDone`), but nothing structured carries it past this
  point.
- `src/session/load-tool-shared.ts`'s `processErrorResult` (lines 67–87)
  still **hardcodes** `classification: "process-error"` and the fixed
  crash/startup `nextAction` diagnostic text for every call, regardless of
  what `message` string it receives — **the exact same wording quoted
  verbatim in this fingerprint's own fix-queue notes is still the exact
  wording emitted today.**
- `src/session/register-agda-load.ts`'s catch site (lines 282–291) confirms
  the call pattern: any thrown error (including the now-detailed timeout
  `Error`) is funneled through `processErrorResult("agda_load", file,
  \`Agda load failed: ${err.message}\`)` — the raw message text lands in
  `data.errors[0]`, but `classification` and the actionable `nextAction` hint
  stay generic. The same call pattern repeats identically in
  `register-agda-load-no-metas.ts` and `register-agda-typecheck.ts`.
- **This reproduces RT7's original finding unchanged, at current HEAD, with
  the identical misleading `nextAction` text.**

**Citation into `docs/LOAD-TERMINUS-ADJUDICATION.md` (Phase 10's decision):**
Same reasoning as RT6 — the adjudication's three decided sub-behaviors
(completion-signal detection, fatal-stderr handling, inactivity timeout)
concern the *transport's* internal completion/timeout mechanism (when to
resolve or reject a command), not the *error-translation* layer
(`src/session/load-tool-shared.ts`'s `processErrorResult`) that turns a
rejected promise into the client-visible classification/diagnostic.
`load-tool-shared.ts` is one layer up from every file the adjudication's
"Codebase state after this plan" section lists as touched, and is absent
from that list — confirming it was untouched by the merge.
`src/session/command-completion.ts` (read in full in the source-audit session)
is exclusively about idle-timing/terminus-detection math
(`idleCompletionDelay`, `trailingResponseDelay`, `shouldResolveOnIdle`) and
contains no classification or diagnostic-text logic whatsoever — further
confirming RT7's gap is orthogonal to everything Phase 10 touched.

**Verdict: HOW.** RT7's diagnostic-taxonomy gap is real, reproduces unchanged
(with the identical wording) at current HEAD, and is orthogonal to Phase 10's
adjudication — a future phase should implement it. Target-shape sketch (no
implementation here):

1. Add a structured discriminator (e.g. `processState:
   "timed-out-while-alive" | "crashed" | "never-started" |
   "no-protocol-response"`) fed from the evidence `agda-transport.ts`'s
   `onTimeout`/`waitDiagnostics` already collects
   (`responseCount`/`sawStatusDone`/`lastResponseKind`), instead of
   collapsing every `session.load()`-family throw into one
   `"process-error"` classification.
2. Thread this new field through `processErrorResult`'s single
   implementation (`src/session/load-tool-shared.ts`) so the fix is
   centralized once, not duplicated across the three identical call sites in
   `register-agda-load.ts`, `register-agda-load-no-metas.ts`, and
   `register-agda-typecheck.ts`.
3. Make the `nextAction` diagnostic conditional on the new discriminator:
   keep the existing "crashed or could not be started, run `agda --version`"
   hint only for the genuine crash/never-started cases; add a distinct,
   correct hint for the timed-out-while-alive case (e.g. suggesting a larger
   `AGDA_MCP_COMMAND_TIMEOUT_MS` or splitting the module) instead of
   misdirecting the agent toward checking an installation that is
   demonstrably fine.
4. This is a breaking response-shape change (a new discriminated field
   alongside `classification`), not a mechanical ≤2-file fix — belongs to
   its own dedicated future phase, matching the fix-queue's own existing
   DEFERRED framing.

**Severity/urgency now that Phase 10 has landed:** slightly elevated
relative to a pure missing-feature framing. The current `nextAction` is not
merely silent on the distinction — it is **actively wrong** in the
timed-out-while-alive case, directing the agent to verify an Agda
installation that is demonstrably present and mid-flight. That directly cuts
against this project's own documented `nextAction` "self-healing hint"
convention (`CLAUDE.md` Error Handling: "`nextAction` should point the
calling agent at the next MCP tool to call to resolve the issue") and its
dogfooding-agent-ergonomics constraint. Recommend this be scheduled ahead of
purely-cosmetic backlog items when a future phase picks up the diagnostic-
taxonomy work — but it remains fully deferred, with zero implementation, per
D-04 in this plan.

### Provenance / Self-Check (from 12-05)

- Regression-lock extraction: RESEARCH.md's Python regex snippet, extended to
  match `Regression evidence:` as well as `Regression lock:`, run live in the
  source-audit session against `test/fixtures/fix-queue.json` — confirmed 10 locked
  entries and extracted 9 matches (all locked; `e6f0c1169032b9d5` is the
  10th, matrix-driven, non-matching-by-design entry).
- Every one of the 10 locked entries' full `notes` field, and both matrix
  entries, were read completely in that session (not sampled).
- All 11 distinct test files existence-checked via `test -f`; all 26
  individually-named test-case strings verified byte-for-byte present via
  `grep -F` against current file contents (except the 2 matrix-generated
  names, verified against their generating template literal in
  `test/integration/mcp/capture-regression.test.ts` instead, since they are
  not literal source text).
- RT6 HEAD evidence read: `src/agda/session-load-impl.ts` (full),
  `src/agda/session-load-helpers.ts` (full), `src/session/tool-presentation.ts`
  (full), `src/agda/types.ts` (`LoadResult`, lines 1–150).
- RT7 HEAD evidence read: `src/session/agda-transport.ts` (lines 255–335 in
  detail, full-file `wc -l`/grep sweep otherwise), `src/session/load-tool-shared.ts`
  (full), `src/session/register-agda-load.ts` (lines 255–294),
  `src/session/command-completion.ts` (full).
- `docs/LOAD-TERMINUS-ADJUDICATION.md` read in full for both verdicts'
  citation.
- No file under `test/`, `src/`, or `test/fixtures/fix-queue.json` was
  modified while producing the source `12-AUDIT-LOCKS-RT6RT7.md` document.

---

## Baseline Metrics (pre-cut)

Produced by re-running RESEARCH.md's Code Examples "Baseline metrics snapshot" command block live, this session (2026-07-06), against the current working tree — **not** copied from `12-RESEARCH.md`'s own numbers (which its own Metadata section marks stale beyond ~7 days or the next merged commit). Re-run these exact commands again after the back-half execution plans (12-08 through 12-11) land, to produce the phase's before/after "measurably simpler" diff (Plan 12-12's job).

### Commands run and live output (2026-07-06)

```bash
find src -name "*.ts" | wc -l
```
→ **150 files**

```bash
find src -name "*.ts" -exec cat {} + | wc -l
```
→ **23,813 LOC**

```bash
find scripts -name "*.mjs" | wc -l
```
→ **32 files**

```bash
find scripts -name "*.mjs" -exec cat {} + | wc -l
```
→ **9,891 LOC**

```bash
find test -name "*.ts" | wc -l
```
→ **256 files**

These five numbers are byte-identical to `12-RESEARCH.md`'s own 2026-07-06 snapshot — expected, not assumed: every Wave-1 audit plan (12-01 through 12-05) was read-only by its own explicit scope statement, so zero files under `src/`, `scripts/`, or `test/` changed between the research session and this one. This was re-run live rather than trusted, per this plan's own instruction, and happens to confirm no drift occurred.

### Tool count: re-run live, with a discrepancy found and reconciled

```bash
grep -c "name: \"agda_" src/tools/**/*.ts src/session/{load,process}-tool-registration.ts 2>/dev/null
```

Run live this session with `globstar` enabled (so `src/tools/**/*.ts` recurses into subdirectories), the per-file breakdown is:

| File | Count |
|---|---|
| `src/tools/agent-ux/edit-tools.ts` | 4 |
| `src/tools/agent-ux/import-tools.ts` | 2 |
| `src/tools/agent-ux/migration-tools.ts` | 3 |
| `src/tools/analysis-tools.ts` | 4 |
| `src/tools/agent-ux/options-tools.ts` | 2 |
| `src/tools/display.ts` | 7 |
| `src/tools/expression-tools.ts` | 4 |
| `src/tools/agent-ux/project-tools.ts` | 3 |
| `src/tools/backend.ts` | 3 |
| `src/tools/file/list-modules.ts` | 1 |
| `src/tools/file/read-module.ts` | 1 |
| `src/tools/cache-tools.ts` | 1 |
| `src/tools/goal-tools.ts` | 5 |
| `src/tools/file/check-postulates.ts` | 1 |
| `src/tools/file/search-definitions.ts` | 1 |
| `src/tools/goal-write-tools.ts` | 6 |
| `src/tools/impact-tool.ts` | 1 |
| `src/tools/register-bug-bundles.ts` | 2 |
| `src/tools/query-tools.ts` | 5 |
| `src/tools/register-session-snapshot.ts` | 1 |
| `src/tools/register-capture-session.ts` | 1 |
| `src/tools/register-goal-candidates.ts` | 1 |
| `src/tools/register-goal-catalog.ts` | 1 |
| `src/tools/register-tool-recommend.ts` | 1 |
| `src/tools/register-protocol-parity.ts` | 1 |
| `src/tools/register-tools-catalog.ts` | 1 |
| `src/tools/scope-tools.ts` | 3 |
| `src/session/process-tool-registration.ts` | 4 |
| (all other matched files) | 0 |

**Live sum: 70** — not 74. This is a genuine, live-measured discrepancy against every Wave-1 audit's own repeatedly cross-verified figure (12-02: "74-tool SSOT"; 12-03: "Both sources report exactly 74 tool names, and both sets are identical"). Re-verifying rather than assuming either number is right:

- **Root cause, confirmed by direct grep:** exactly 4 tool names — `agda_load`, `agda_load_no_metas`, `agda_typecheck`, `agda_apply_edit` — have their literal `name: "agda_..."` declaration inside `src/session/register-agda-load.ts`, `src/session/register-agda-load-no-metas.ts`, `src/session/register-agda-typecheck.ts`, and `src/session/register-agda-apply-edit.ts` respectively. None of these four files is covered by this exact grep command's glob (`src/tools/**/*.ts` + only the two files explicitly named, `load-tool-registration.ts`/`process-tool-registration.ts`, which are thin dispatchers with zero `name: "agda_` literals of their own). 70 + 4 = 74 exactly, confirming this fully accounts for the gap — no tool actually went missing.
- **Authoritative, independently re-confirmed count: 74.** Two live checks this session: (1) `test/fixtures/e2e/mcp-tool-coverage.json` parsed directly — 74 entries; (2) `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts` run live under Node 24 — **2 passed**, confirming the mechanically-enforced bidirectional set-equality between the live-booted manifest (`listToolManifest()`) and the coverage matrix still holds today, exactly as 12-02 and 12-03 each independently found.
- **Conclusion:** the RESEARCH.md grep command (and, by extension, its own inline `# 74 total registered MCP tools` comment) was already an approximation at research time — it undercounts by exactly 4 due to its own glob's blind spot, not a live regression. This report records the literal command's live output (70, honestly, with the reconciling per-file breakdown above) rather than silently substituting 74, while also stating the authoritative, independently-re-verified figure (74) that the rest of this report (candidate counts, `12-BASELINE-TOOLS.txt` row count, the Real Usage Evidence Table in `12-AUDIT-TOOLS.md`) correctly uses throughout.

### `12-BASELINE-TOOLS.txt`

Written this session as a sibling artifact to this report: `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-BASELINE-TOOLS.txt` — the sorted, one-per-line list of all **74** `agda_*` tool names currently in `test/fixtures/e2e/mcp-tool-coverage.json` (derived via a `node -e` script reading the matrix's `tool` field, sorting, and writing one name per line). Row count (74) matches the authoritative live tool count reconciled above, not the raw grep's 70. This file captures the pre-cut tool-name baseline so Plan 12-11's post-cut doc-reference check can compute `baseline minus post-deletion manifest` and flag only references to tools this phase actually deleted — never a never-built proposed name (e.g. `docs/release-0.7.0-triage.md`'s `agda_type_search`, CUT-list-excluded per the Docs audit).

---

## Sources

- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-PIPELINE.md` (Plan 12-01) — pipeline candidates CUT-01, CUT-02.
- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-DOCS.md` (Plan 12-02) — docs-residue candidates CUT-03 – CUT-09.
- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-TOOLS.md` (Plan 12-03) — tools candidates CUT-10, CUT-11.
- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-SRC-DEBT.md` (Plan 12-04) — src-subtraction candidates CUT-12 – CUT-20.
- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-AUDIT-LOCKS-RT6RT7.md` (Plan 12-05) — Regression-Lock Exclusion List, RT6/RT7 Verdicts.
- `.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/12-RESEARCH.md` — Baseline Metrics snapshot commands (Code Examples section), re-run live this session.
- `test/fixtures/e2e/mcp-tool-coverage.json`, `test/unit/tools/mcp-e2e-coverage.test.ts` — live tool-count reconciliation (74, re-confirmed this session via direct JSON read + a live `npx vitest run` pass).
- `test/fixtures/fix-queue.json` — RT6 (`ad2b6d31f58f1759`)/RT7 (`b6821f42952c6ff8`) current entries, read prior to Task 2's append (see `12-06-SUMMARY.md` for the append itself).
