# Phase 10: Upstream Reconcile - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The entire one-time upstream reconcile: upstream v0.6.8 (5 commits, head `d4497a2`) merged into `main` via a real merge commit (never rebase), all 6 conflict files resolved, upstream's fail-on-unexpected-`logger.warn` test strictness reconciled with our ~1600-test suite, load-terminus semantics adjudicated per sub-behavior with our from-RED regression locks as referee, upstream #70's `agda_goal_candidates` / term-search / Mimer-auto features adopted through our manifest + tool-recommendation + docs, and full acceptance (real-Agda suite, one real dogfood session, final push's D-06 deploy watched green).

Phase 11 (recurring auto-sync) is explicitly NOT armed until this phase fully completes — hard ordering constraint, settled.

Live re-check at discussion time (2026-07-05): upstream head still `d4497a2`, 509 ahead / 5 behind, conflict set unchanged from the seed doc's measurement.

</domain>

<decisions>
## Implementation Decisions

Most decisions here were **forced** by settled milestone decisions (`.planning/research/UPSTREAM-SYNC.md`), roadmap success criteria, or codebase conventions — briefed to the user with veto opportunity, none vetoed. D-09 is the one genuine-taste decision the user made.

### Merge mechanics
- **D-01:** `git merge upstream/main` — merge, NEVER rebase (settled; 509 published commits, pushed tags, auto-deploy-on-main). All 6 conflict files resolved by hand in this phase, **including the `upstream-sync` skill's guarded files** — Phase 10 IS the human-attended escalation work that skill is designed to hand off to; its guarded-file prohibition binds only unattended runs.
- **D-02:** Merge target pinned at `d4497a2` (MERGE-01 text). If upstream gains commits after this discussion, do NOT widen scope mid-phase — the tail is Phase 11's first routine sync's business.
- **D-03:** Version handling is mechanical: `package.json` is not in the conflict set, so upstream's 0.6.8 bump is accepted as-is. Our `v1.x` milestone tag scheme is unaffected; `v1.2` gets tagged at milestone completion (after Phase 11), not in this phase.

### Load-terminus adjudication (MERGE-03)
- **D-04:** Adjudication mechanism is settled and outcome is empirical — do not pre-decide winners. Per sub-behavior (completion-signal detection, fatal-stderr handling, inactivity timeout): from-RED locks (#64/#61 flagship, RT8) are the referee. Locks green under upstream's implementation → adopt theirs AND delete our parallel `load-terminus-tracker.ts` implementation (the locks remain as tests; one less parallel implementation = permanently smaller conflict surface for every future sync — forced by the milestone's divergence-stops-accumulating goal). Locks red → keep ours + graft upstream's fatal-stderr / inactivity-timeout hardening.
- **D-05:** Test-authority rule: our from-RED locks may NEVER be weakened or adapted — that is their entire referee role. Upstream's #68/#69 regression tests that assert losing semantics may be rewritten to assert the adjudicated semantics (rationale recorded), never deleted.
- **D-06:** Adjudication decisions + rationale recorded durably in `docs/` (e.g. `docs/LOAD-TERMINUS-ADJUDICATION.md`) — the repo's convention for durable operational records (cf. `docs/DEPLOY-OPERATIONS.md`). Future 3-day sync escalations must be able to answer "why are the semantics the way they are" without archaeology. One table row per sub-behavior: ours/theirs/hybrid + rationale + referee evidence.

### Test-strictness reconciliation (MERGE-02)
- **D-07:** Every legitimate best-effort-catch `logger.warn` call site gets explicitly allow-listed/registered under upstream's new fail-suite-on-unexpected-warn harness — never deleted, never silenced (success-criterion text). The registration mechanism's shape (per-test expectation vs central registry) is researcher/planner business.

### Feature adoption (ADOPT-01/02)
- **D-08:** Keep upstream's tool name `agda_goal_candidates` verbatim — renaming creates a permanent re-conflict on every future sync, violating the milestone goal. Wire through OUR conventions: manifest SSOT (`src/tools/manifest.ts`), tool-recommendation, and the existing tool-documentation locations (README / tool catalog) so a driving agent can discover and use it without reading source.

### Acceptance (ACCEPT-01/02/03)
- **D-09 (user's choice):** The dogfood acceptance session runs on the pinned CHG corpus (`Codex-Homotopy-Group`, local clone — the proven E2E-01 path), driven by Codex headless, and **must genuinely invoke `agda_goal_candidates` at least once during the session** — so the merge quality and the newly adopted feature are both proven in the same real use, not just by tests and docs.
- **D-10:** Push cadence: exactly ONE push to `origin main` at the end of the phase = one accepted ~30 min D-06 deploy cycle, watched to green (`gh run watch` + cluster `/healthz` = ok). Intermediate commits stay local. If the deploy goes red, this is attended work: fix forward rather than auto-revert (the skill's `git revert -m 1` rule exists for unattended runs).

### Scope guardrails
- **D-11:** RT6 (five-state load conflation) and RT7 (timeout diagnostics) stay out of scope even though the adjudication touches the same seam — re-evaluate only after the merge lands (REQUIREMENTS.md Out of Scope, explicit).

### Claude's Discretion
- Working on local `main` vs a temporary branch during the multi-plan reconcile (nothing is pushed until the end either way).
- The exact filename/format of the adjudication record within `docs/`.
- The allow-list mechanism for `logger.warn` registrations (within D-07's constraint).
- Plan decomposition (~3 plans per the seed doc's Phase A sketch is a suggestion, not a mandate — plan-phase's business).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone seed & settled decisions
- `.planning/research/UPSTREAM-SYNC.md` — THE seed doc: measured divergence facts, the 6 conflict files, per-commit upstream anatomy (#68/#69/#70, warn-harness), Phase A sketch, and the settled-decisions list (do not relitigate).
- `.planning/REQUIREMENTS.md` — MERGE-01/02/03, ADOPT-01/02, ACCEPT-01/02/03 exact texts + Out of Scope table (RT6/RT7 exclusion).
- `.planning/ROADMAP.md` — Phase 10 success criteria (the authoritative five, incl. the 6 named conflict files).

### Sync policy & operations
- `.agents/skills/upstream-sync/SKILL.md` — policy SSOT: guarded-file list, LOCAL verification gate command sequence (real-Agda full suite), deploy-watch + healthz procedure, bookkeeping format. Phase 10 is the attended escalation this skill anticipates; its verification-gate and deploy-watch sections apply verbatim.
- `docs/DEPLOY-OPERATIONS.md` — D-06 deploy operations runbook for ACCEPT-03.

### Dogfood acceptance
- `.agents/skills/agda-dogfooding/SKILL.md` — the dogfooding runbook the ACCEPT-02 session follows.
- `scripts/data/fuel-corpora.json` — pinned corpus manifest (CHG entry).

### Upstream feature context
- `docs/release-0.7.0-triage.md` — pre-fork 0.7.0 gate triage; context for upstream #70's "0.7.0-gate reconcile" framing and for what the tool catalog already covers.

</canonical_refs>

<code_context>
## Existing Code Insights

### The contested seam (4 of 6 conflict files are on it)
- `src/session/load-terminus-tracker.ts` — OUR 03.1 implementation of load-terminus semantics; the adjudication subject. Candidate for deletion if upstream's implementation keeps the locks green (D-04).
- Conflict files: `src/agda/refactor-helpers.ts`, `src/agda/session-load-impl.ts`, `src/session/agda-transport.ts`, `src/session/command-completion.ts`, `src/tools/goal-tools.ts`, `test/unit/agda/agent-ux.test.ts`.
- From-RED referee locks: the #64/#61 flagship transitive-staleness lock and RT8 (locked from RED in Phases 3/03.1/6).

### Adoption wiring points (ADOPT-01)
- `src/tools/manifest.ts` — runtime SSOT for exposed tools/categories; `agda_goal_candidates` must register here.
- `src/session/tool-recommendation.ts` — must surface the new tool.
- `agda_tools_catalog` (manifest-derived) + README — the discoverability surface for ADOPT-02.

### Test harness (MERGE-02)
- `vitest.config.ts` — upstream's `d4497a2` warn-harness lands here (+98 lines); our best-effort-catch `logger.warn` convention (per CONVENTIONS.md) is widespread, so expect many legitimate registration sites across the ~1600 tests.

### Structural good news
- Upstream touches ZERO of `scripts/`, `k8s/`, `.github/`, `Dockerfile` — the entire Loop ② / deploy value-add merges clean; all real work concentrates in `src/` + `test/`.

</code_context>

<specifics>
## Specific Ideas

- The acceptance session is "the loop verifying its own upstream merge" — this framing is by design (the designed use of the server), not incidental. The E2E-01 precedent (live Codex on CHG, zero fixture shortcuts) is the quality bar.
- Codex headless driving per standing practice: drive live Codex sessions via `codex exec` directly; don't pause for checkpoints.

</specifics>

<deferred>
## Deferred Ideas

- RT6 / RT7 redesigns — explicitly re-evaluated only after the merge lands (already in REQUIREMENTS.md Out of Scope; recorded here so adjudication work doesn't drift into them).
- Any upstream commits landing after `d4497a2` — Phase 11's first routine sync picks them up.

</deferred>

---

*Phase: 10-Upstream Reconcile*
*Context gathered: 2026-07-05*
