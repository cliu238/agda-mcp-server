# Phase 9: Residual v1.0 Debt Sweep - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Every P2 tech-debt item recorded in `.planning/milestones/v1.0-MILESTONE-AUDIT.md` is resolved — **deleted, fixed, or explicitly decided-and-recorded** — so v1.0's accumulated non-blocking findings don't silently carry forward. Requirements: DEBT-01..DEBT-07. This is a closed, pre-itemized checklist; no new capabilities.

**Coverage note (forced by the phase goal's own wording):** the audit's P2 list contains three minor items no DEBT requirement names explicitly — **WR-08** (stale `mergedArgv`), **WR-12** (test-fixture pollution) from unexecuted gap plan 01-06, and **W5** (dogfood-wrapup filing tests assert a locally-defined minimal `fixQueueEntrySchema` with `upsertQueueEntry` mocked). The phase goal says "every P2 item"; minimum bar for these is an explicit fix-or-defer decision with recorded reason. Planner decides fix vs. record per item — do not silently skip them.

</domain>

<decisions>
## Implementation Decisions

### Sequencing (user-decided)
- **D-01:** Phase 9 executes **after Phase 7 completes** (filling the gap while Phase 8 waits on the k8s server, ~2026-07-07). The whole phase runs in one pass — no split batches. Consequences:
  - DEBT-05's security review covers Phase 5's process-spawning scripts **and** Phase 7's then-existing network surfaces (ingest endpoint, upload client) in a single `/gsd:secure-phase` pass.
  - DEBT-07's `/gsd:map-codebase` refresh captures Phases 6–7 code and won't immediately re-drift (only Phase 8's thin deploy step lands after).

### DEBT-06 — test typecheck (user-decided)
- **D-02:** Scope is **fully clean**, not just the audit-named error families. Live measurement 2026-07-03: `npx tsc -p tsconfig.test.json --noEmit` → **68 errors across 16 files** (grew from the audit snapshot's two families — `structuredContent` + 8 ReplayManifest index-signature errors — via post-audit drift). All 68 must go.
- **D-03:** After the fix, add a **permanent CI gate**: `tsc -p tsconfig.test.json --noEmit` as a CI step (and/or npm script) so test-code type regressions fail CI. Rationale: the drift from 2 families to 16 files happened precisely because no gate existed; matches the project's fix-and-lock core value.

### DEBT-01 — verify-cold-replay.mjs (forced by recorded default; user did not veto)
- **D-04:** **Delete** `scripts/verify-cold-replay.mjs` (REQUIREMENTS.md records delete as default — superseded by ORCL-01's `materializeCaptureEnvironment`, which does guard traversal). Zero-importer claim re-verified 2026-07-03: no code imports it; only 3 comment-only references remain and must be updated in the same change: `scripts/promote-capture.mjs:17`, `scripts/oracle/orcl-01-differential.mjs:22`, `scripts/oracle/cold-agda-session.mjs:11` (and `:48`). Record the decision + zero-importer evidence in PROJECT.md Key Decisions and the plan SUMMARY. The unexecuted 01-07 hardening plan (CR-01/CR-02) is thereby closed as superseded-by-deletion.

### Mechanical items (forced — locations verified 2026-07-03)
- **D-05 (DEBT-02):** Retire the dead-ended `.agda-mcp/captures/index.json` write in `scripts/promote-capture.mjs` (write at ~line 82 region; header comment lines ~3–17 stale — claims `readDedupIndex()` still reads it, but Phase 4 repointed `readDedupIndex` to `test/fixtures/fix-queue.json`).
- **D-06 (DEBT-03):** In `src/tools/register-capture-session.ts`, move `resetRecordedActions()` to after a successful `writeFileAtomic` (WR-01: a write failure currently loses the drained action log with no artifact). Behavior change → regression test per repo convention.
- **D-07 (DEBT-04):** Fix the four Phase-5 Info findings: IN-01 argv/run-id sanitization; IN-02 dangling-symlink handling — target file is at `scripts/dogfood/install-dogfood-skill.mjs` (audit's path lacks the `dogfood/` segment); IN-04 `git check-ignore` exit-status ambiguity in its test; IN-05 wrapup catch-handler re-dereference of `staged.stagedPath`.
- **D-08 (DEBT-05):** The existing root `SECURITY.md` is a vulnerability-disclosure policy and does NOT satisfy DEBT-05. The deliverable is a `/gsd:secure-phase` threat-model review artifact in the `.planning` phase directory — no filename collision with the root file.
- **D-09 (DEBT-07):** Refresh `.planning/codebase/` via `/gsd:map-codebase` as the phase's final step (after all code-changing items land, per D-01).

### Claude's Discretion
- Fix-vs-record choice for the three unmapped P2 residuals (WR-08, WR-12, W5) — planner assesses effort and either fixes inline or records an explicit defer decision.
- Plan structure (how many plans, ordering within the phase) — natural grouping is mechanical code fixes → typecheck cleanup + CI gate → security review → map refresh last.
- Exact CI wiring for D-03 (separate workflow step vs. extending the existing test job).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope source (the checklist itself)
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md` — the P2 tech-debt list (frontmatter `tech_debt:` block) that defines every item in this phase, with per-item fix directions and file:line pointers.
- `.planning/REQUIREMENTS.md` — DEBT-01..DEBT-07 requirement text (§ Residual Debt Sweep).
- `.planning/ROADMAP.md` — Phase 9 goal + success criteria.

### DEBT-01 evidence context
- `.planning/milestones/v1.0-phases/01-capture-foundation/01-07-PLAN.md` — the unexecuted hardening plan (CR-01 path traversal, CR-02 false-PASS) that deletion supersedes; read to record what is being closed.
- `.planning/milestones/v1.0-phases/01-capture-foundation/01-06-PLAN.md` — source of the unmapped WR-08 / WR-12 residuals.

### DEBT-05 security review
- `SECURITY.md` (repo root) — existing disclosure policy; distinct from the threat-model deliverable, do not overwrite.

</canonical_refs>

<code_context>
## Existing Code Insights

### Verified current state (scouted 2026-07-03)
- `scripts/verify-cold-replay.mjs` exists; zero real importers (3 comment-only refs listed in D-04).
- `scripts/promote-capture.mjs` still writes `.agda-mcp/captures/index.json` with the stale header.
- `src/tools/register-capture-session.ts` still has the WR-01 ordering issue.
- `npx tsc -p tsconfig.test.json --noEmit`: 68 errors / 16 files. Affected files: `test/helpers/capture-regression-runner.ts`, `test/helpers/typecheck-disposable.ts`, `test/property/reporting/bug-report.property.test.ts`, `test/property/session/session-snapshot.property.test.ts`, `test/property/session/tool-recommendation.property.test.ts`, `test/unit/agda/{command-serialization,completeness,process-termination}.test.ts`, `test/unit/session/{agda-transport,tool-recommendation}.test.ts`, `test/unit/tools/{emit-regression,oracle-orcl-01,oracle-orcl-02,oracle-orcl-03,oracle-run-oracle,output-schema-invariants}.test.ts`. Error shapes: missing new required fields in test literals (`requiresLoadedSession`, `profiling`, `projectRootExists`), `structuredContent` unknown, ReplayManifest index signatures, implicit-any params.

### Established Patterns
- Repo convention: behavior-changing fixes get regression tests (`vitest`); pure comment/dead-code removals do not.
- Decision recording: PROJECT.md Key Decisions table + plan SUMMARY frontmatter.
- CI: `.github/workflows/ci.yml` (installs Agda via `wenkokke/setup-agda`) — D-03's gate lands here.

### Integration Points
- This phase is scripts/tests/docs-only maintenance plus one `src/` ordering fix (D-06); no MCP tool surface changes, no new capabilities.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above — the audit's per-item fix directions are the spec.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 9-Residual v1.0 Debt Sweep*
*Context gathered: 2026-07-03*
