# Phase 12: Simplification Overhaul - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

A project-wide health check that produces a severity-graded simplification list ("cut list"), a user sign-off checkpoint on that list, and then execution of the approved cuts — to reduce over-engineering, maintenance burden, and user-facing complexity. The audit covers the whole repo (published server `src/`, unpublished Loop ② pipeline `scripts/`, docs, planning residue); the **cutting emphasis is on `scripts/` + docs + planning residue**, with the server body limited to low-risk subtraction — except that **redundant MCP tools may be deleted outright** (see D-02).

The ROADMAP goal for this phase was "[To be planned]" — this document pins it: *"The project is measurably simpler: an audited, user-approved cut list is executed; redundant pipeline/doc/tool surface is deleted; every regression lock and the full real-Agda suite stay green; RT6/RT7 get a definitive re-evaluation verdict (implementation deferred)."*

</domain>

<decisions>
## Implementation Decisions

### Forced constraints (briefed 2026-07-05, none vetoed — cite, do not relitigate)
- **C-01 Regression locks untouchable:** No simplification may delete or weaken any from-RED regression-locked test, and the full suite (incl. `RUN_AGDA_INTEGRATION=1` real-Agda lane) must stay green after every cut. Carrying forward Phase 10 D-05's test-authority rule.
- **C-02 Loop ② closed loop is not cuttable:** use → capture → judge → file → fix → lock is the project's Core Value. Its *implementation* may be simplified; no *stage* of the loop may be removed.
- **C-03 Upstream conflict-surface constraint:** In `src/` files that overlap upstream, simplification prefers *deleting our extra code / converging toward upstream*; avoid large-scale renames/moves/restructurings that re-inflate the merge conflict surface Phase 10 just reconciled (milestone goal: divergence stops accumulating). `scripts/` is ours alone — no such constraint there.
- **C-04 Architecture invariants stay:** single `AgdaSession` (issue #39), `command-builder.ts` SSOT, 500-line file ceiling, protocol→agda→session→tools layering. The health check audits *against* these; they are not up for debate.
- **C-05 What is over-engineered is an audit finding, not a user guess:** concrete cut targets come from the audit, not from this discussion.

### Decisions made this discussion (2026-07-05)
- **D-01 Cutting emphasis = pipeline + docs; server = low-risk subtraction.** The audit is project-wide, but cut effort concentrates on `scripts/` (dogfood/oracle/queue/team), docs, and planning residue — no external users, no upstream conflict constraint, lowest risk. `src/` gets low-risk deletions only (dead code, duplicate implementations, unused exports), not restructurings.
- **D-02 MCP tool surface: direct deletion allowed.** Tools the audit judges redundant (overlapping purpose, unused, or increasing agent mis-selection) are deleted or merged in one pass — no deprecation period. Team is small and syncable; ship a new `v*` tag and update onboarding/tool docs (README, `docs/assistant-workflows.md`, tool catalog/manifest) in the same phase. Old usage patterns breaking on upgrade is accepted.
- **D-03 Audit → user sign-off → execute.** The phase front half produces a health report + severity-graded cut list where each item states: what gets cut, what maintenance it saves, what it breaks. The user approves items individually (拍板 checkpoint); the back half executes only the approved list. No cut lands before sign-off.
- **D-04 RT6/RT7: re-evaluate, do not implement.** Fix-queue triaged items RT6 (`agda_load` five-state conflation, fingerprint `ad2b6d31f58f1759`) and RT7 (timeout/process-state taxonomy, fingerprint `b6821f42952c6ff8`) had the explicit trigger "re-evaluate after the merge lands" — the trigger has fired (Phase 10 complete). This phase's report must contain a definitive verdict per item (do it / don't / how), but implementation (a schema *addition*, not a subtraction) belongs to a separate future phase.

### Claude's Discretion
- Audit methodology (parallel mappers, per-layer sweeps, metrics collected) — planner/researcher business.
- Cut-list granularity and report format.
- Plan decomposition (audit plans vs execution plans, checkpoint placement mechanics).
- Push cadence — default to the Phase 10 D-10 pattern (batch local commits, minimal pushes to `origin main`, each push = one accepted ~30 min deploy cycle watched green) unless the planner finds a reason to deviate.
- Whether milestone-audit debt ledgers (v1.0/v1.1 Info-grade findings, e.g. `assertSafeRunId` duplication, CI `permissions` scope) fold into the cut list — natural candidates, audit decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Known-debt inventories (primary audit seed)
- `.planning/codebase/CONCERNS.md` — the 2026-07-04 concerns audit: tech debt, fragile areas, file-size pressure, known bugs, test-coverage gaps. The closest thing to a pre-existing health report.
- `milestones/v1.1-MILESTONE-AUDIT.md` — v1.1 debt ledger (14 open Info-grade review findings enumerated in frontmatter).
- `milestones/v1.0-MILESTONE-AUDIT.md` — v1.0 debt ledger (9 items).
- `test/fixtures/fix-queue.json` — the tracked fix-queue SSOT; RT6 = `ad2b6d31f58f1759`, RT7 = `b6821f42952c6ff8` (both `triaged`), plus other triaged/deferred entries the audit should cross-check.

### Architecture ground truth (what "over-engineered" is judged against)
- `ARCHITECTURE.md` — authoritative `src/` layering + 500-line ceiling.
- `.planning/codebase/STRUCTURE.md` — full directory map incl. the src/-vs-scripts/ published/unpublished split.
- `src/tools/manifest.ts` — runtime SSOT of the exposed tool inventory (the "~40 tools" D-02 targets).

### Constraint carriers
- `.planning/phases/10-upstream-reconcile/10-CONTEXT.md` — D-04/D-05 (locks-as-referee, never weaken) and D-10 (push cadence) carried into C-01 and Claude's-discretion defaults.
- `docs/LOAD-TERMINUS-ADJUDICATION.md` — why load-terminus semantics are what they are (Phase 10 adjudication record); C-03 convergence decisions must not contradict it.
- `.agents/skills/upstream-sync/SKILL.md` — guarded-file list; cuts touching guarded files change what future manual syncs must hand-resolve.

</canonical_refs>

<code_context>
## Existing Code Insights

### Audit seeds already known (from CONCERNS.md scout)
- `assertSafeRunId` duplicated verbatim in `scripts/dogfood/dogfood-run.mjs` and `scripts/dogfood/dogfood-wrapup.mjs` — textbook cut-list item (extract shared module).
- Seven `src/` files within ~100 lines of the 500-line ceiling — audit should distinguish "needs planned split" from "contains deletable weight".
- `src/agda/import-graph.ts` consumed only by rename/impact/dedup tooling, never the load path — candidate for scope reassessment.
- Oracle tooling has three confirmed script-level defects (`2eb1768df88bfb07` ×2, `1220f2840142aab8`) — simplification of `scripts/oracle/` should not silently absorb or mask these open bugs.
- Phase 11 artifacts (5 plans + research, deferred) are explicitly kept intact for zero-rework revival — NOT planning residue, do not cut.

### Established patterns
- Barrel + focused-siblings split is the house pattern for oversized modules — cuts that shrink a barrel's siblings should collapse the barrel too if it drops to trivial size.
- Every `scripts/*.mjs` is unit-tested under `test/unit/tools/` via dependency-injected imports — deleting a script means deleting its tests + any `package.json` script entries in the same commit.
- `docs/FIX-QUEUE-DASHBOARD.md` is generated (never hand-edit); doc cuts must distinguish generated views from authored docs.

### Integration points
- Tool deletions (D-02) must be reflected in lockstep: `src/tools/manifest.ts`, tool-recommendation, README, `docs/assistant-workflows.md`, `tool-family-examples.json`, `test/fixtures/e2e/mcp-tool-coverage.ts` — the Phase 10-03 SUMMARY shows the full wiring checklist for the reverse operation (adding a tool).
- Each push to `origin main` triggers `deploy-ingest.yml` (~30 min watched deploy) — batch cuts into few pushes.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above — the audit defines the concrete targets; the user's involvement is concentrated at the D-03 sign-off checkpoint.

</specifics>

<deferred>
## Deferred Ideas

- **RT6 implementation** (structured `agda_load` five-state response schema) — if the D-04 re-evaluation verdict is "do it", it becomes its own future phase (schema addition + breaking response change).
- **RT7 implementation** (timeout/process-state diagnostic taxonomy) — same handling as RT6.
- **Phase 11 auto-sync carrier** — already deferred to Future at the roadmap level; its kept-intact artifacts are out of this phase's cutting scope.

</deferred>

---

*Phase: 12-Simplification Overhaul*
*Context gathered: 2026-07-05*
