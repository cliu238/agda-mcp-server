# Phase 10: Upstream Reconcile - Research

**Researched:** 2026-07-05
**Domain:** Git merge reconciliation (real merge commit, no rebase) between two independently-evolving forks of the same TypeScript MCP server; load-terminus protocol semantics adjudication; MCP tool feature adoption; k8s deploy acceptance.
**Confidence:** HIGH — every claim below was verified by actually running the merge (`git fetch upstream` + a throwaway `git merge --no-commit --no-ff` dry run, then aborted and the branch deleted) and reading both sides' real source, not by inference from the seed doc.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Most decisions here were **forced** by settled milestone decisions (`.planning/research/UPSTREAM-SYNC.md`), roadmap success criteria, or codebase conventions — briefed to the user with veto opportunity, none vetoed. D-09 is the one genuine-taste decision the user made.

**Merge mechanics**
- **D-01:** `git merge upstream/main` — merge, NEVER rebase (settled; 509 published commits, pushed tags, auto-deploy-on-main). All 6 conflict files resolved by hand in this phase, **including the `upstream-sync` skill's guarded files** — Phase 10 IS the human-attended escalation work that skill is designed to hand off to; its guarded-file prohibition binds only unattended runs.
- **D-02:** Merge target pinned at `d4497a2` (MERGE-01 text). If upstream gains commits after this discussion, do NOT widen scope mid-phase — the tail is Phase 11's first routine sync's business.
- **D-03:** Version handling is mechanical: `package.json` is not in the conflict set, so upstream's 0.6.8 bump is accepted as-is. Our `v1.x` milestone tag scheme is unaffected; `v1.2` gets tagged at milestone completion (after Phase 11), not in this phase.

**Load-terminus adjudication (MERGE-03)**
- **D-04:** Adjudication mechanism is settled and outcome is empirical — do not pre-decide winners. Per sub-behavior (completion-signal detection, fatal-stderr handling, inactivity timeout): from-RED locks (#64/#61 flagship, RT8) are the referee. Locks green under upstream's implementation → adopt theirs AND delete our parallel `load-terminus-tracker.ts` implementation (the locks remain as tests; one less parallel implementation = permanently smaller conflict surface for every future sync — forced by the milestone's divergence-stops-accumulating goal). Locks red → keep ours + graft upstream's fatal-stderr / inactivity-timeout hardening.
- **D-05:** Test-authority rule: our from-RED locks may NEVER be weakened or adapted — that is their entire referee role. Upstream's #68/#69 regression tests that assert losing semantics may be rewritten to assert the adjudicated semantics (rationale recorded), never deleted.
- **D-06:** Adjudication decisions + rationale recorded durably in `docs/` (e.g. `docs/LOAD-TERMINUS-ADJUDICATION.md`) — the repo's convention for durable operational records (cf. `docs/DEPLOY-OPERATIONS.md`). Future 3-day sync escalations must be able to answer "why are the semantics the way they are" without archaeology. One table row per sub-behavior: ours/theirs/hybrid + rationale + referee evidence.

**Test-strictness reconciliation (MERGE-02)**
- **D-07:** Every legitimate best-effort-catch `logger.warn` call site gets explicitly allow-listed/registered under upstream's new fail-suite-on-unexpected-warn harness — never deleted, never silenced (success-criterion text). The registration mechanism's shape (per-test expectation vs central registry) is researcher/planner business.

**Feature adoption (ADOPT-01/02)**
- **D-08:** Keep upstream's tool name `agda_goal_candidates` verbatim — renaming creates a permanent re-conflict on every future sync, violating the milestone goal. Wire through OUR conventions: manifest SSOT (`src/tools/manifest.ts`), tool-recommendation, and the existing tool-documentation locations (README / tool catalog) so a driving agent can discover and use it without reading source.

**Acceptance (ACCEPT-01/02/03)**
- **D-09 (user's choice):** The dogfood acceptance session runs on the pinned CHG corpus (`Codex-Homotopy-Group`, local clone — the proven E2E-01 path), driven by Codex headless, and **must genuinely invoke `agda_goal_candidates` at least once during the session** — so the merge quality and the newly adopted feature are both proven in the same real use, not just by tests and docs.
- **D-10:** Push cadence: exactly ONE push to `origin main` at the end of the phase = one accepted ~30 min D-06 deploy cycle, watched to green (`gh run watch` + cluster `/healthz` = ok). Intermediate commits stay local. If the deploy goes red, this is attended work: fix forward rather than auto-revert (the skill's `git revert -m 1` rule exists for unattended runs).

**Scope guardrails**
- **D-11:** RT6 (five-state load conflation) and RT7 (timeout diagnostics) stay out of scope even though the adjudication touches the same seam — re-evaluate only after the merge lands (REQUIREMENTS.md Out of Scope, explicit).

### Claude's Discretion
- Working on local `main` vs a temporary branch during the multi-plan reconcile (nothing is pushed until the end either way).
- The exact filename/format of the adjudication record within `docs/`.
- The allow-list mechanism for `logger.warn` registrations (within D-07's constraint).
- Plan decomposition (~3 plans per the seed doc's Phase A sketch is a suggestion, not a mandate — plan-phase's business).

### Deferred Ideas (OUT OF SCOPE)
- RT6 / RT7 redesigns — explicitly re-evaluated only after the merge lands (already in REQUIREMENTS.md Out of Scope; recorded here so adjudication work doesn't drift into them).
- Any upstream commits landing after `d4497a2` — Phase 11's first routine sync picks them up.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MERGE-01 | Upstream v0.6.8 (5 commits, head `d4497a2`) merged into `main` via `git merge` (never rebase), all 6 conflict files resolved, build + `typecheck:test` green | Live dry-run merge confirms exactly the 6 documented conflict files and no others; `package.json`/`vitest.config.ts` verified to auto-merge cleanly with no lost content (`typecheck:test` script confirmed to survive). See Architecture Patterns (system diagram) and Runtime State Inventory. |
| MERGE-02 | Upstream's fail-suite-on-unexpected-`logger.warn` test strictness reconciled with our full suite — ~1600 tests green, with expected-warn registrations wherever our best-effort-catch convention legitimately warns | Full `test/helpers/warn-guard.ts` mechanism read and documented (Code Examples); 9 current `logger.warn(` call sites in `src/` counted; Pitfall 6 gives the recommended triage procedure (run the guarded suite once, use the failure list as ground truth rather than the static grep count). |
| MERGE-03 | Load-terminus semantics adjudicated per sub-behavior (ours / theirs / hybrid vs upstream #68/#69), with our from-RED regression locks (#64/#61 flagship, RT8) as referee and BOTH repos' regression suites green; adjudication decisions recorded | Deep source-level comparison of `load-terminus-tracker.ts` vs `goal-terminus.ts`, `session-load-impl.ts`'s two `runLoadNoMetas` implementations, and `command-completion.ts`'s snapshot shape (Architecture Patterns, Pitfalls 1-5). Correctly identifies the REAL from-RED referee (`test/integration/mcp/capture-regression.test.ts`'s two `agda_load_no_metas` matrix entries) and corrects an initial misidentification (Pitfall 1). Flags the Agda-2.8.0 version-gate gap in our current implementation (Pitfall 3) and the fatal-stderr transport-layer gap (Pitfall 4) as concrete adjudication inputs. |
| ADOPT-01 | Upstream #70's `agda_goal_candidates` (type-directed term search) + Mimer auto fix work through our tool manifest (SSOT) and tool-recommendation | Full source of `src/tools/register-goal-candidates.ts` read; confirmed `registerStructuredTool` auto-populates the manifest; exact 2-line wiring diff given (Pattern 3, Code Examples); `usesMimerProofSearch` engine-dispatch gap identified in current `goal-write-tools.ts` (Pattern 2). |
| ADOPT-02 | The adopted tools are documented (README / tool catalog) and discoverable by driving agents | Confirmed `agda_tools_catalog` is fully manifest-derived (no manual doc-sync needed); identified the `tool-family-examples.json` discretionary polish step for full discoverability quality (Pattern 3); flagged a Wave 0 test gap (no existing test asserts manifest inclusion post-wiring). |
| ACCEPT-01 | Post-merge full verify green: real-Agda full suite, `typecheck:test`, build | Exact verified commands given (Validation Architecture); Node 24 vs. ambient shell v22 environment gotcha flagged (Environment Availability). |
| ACCEPT-02 | One real dogfood session runs against the merged server as acceptance — the loop verifying its own upstream merge | `.claude/skills/agda-dogfooding/SKILL.md` read in full; pinned CHG corpus commit confirmed in `scripts/data/fuel-corpora.json`; `codex` CLI confirmed available locally. |
| ACCEPT-03 | The final push's auto-deploy (D-06) watched to green — cluster healthz `ok` | `.claude/skills/upstream-sync/SKILL.md` Section 4 (steps 6-8) read in full for the exact watch procedure; `gh` CLI auth confirmed; live `/healthz` baseline already returns 200 pre-phase. |
</phase_requirements>

## Summary

The seed doc's numbers hold up under a live re-check: upstream head is still `d4497a2`, still exactly 5 commits behind (390a502/#68, 974cc38/#69, b717ad4/#70, 9409131 version bump, d4497a2 warn-harness), and a real dry-run merge against current `main` (513 commits ahead now, up from 509 at discussion time — our own commits, not new upstream divergence) produces **exactly the 6 documented conflict files**, no more, no fewer. `package.json` and `vitest.config.ts` — both touched by both sides — auto-merge cleanly with no conflict markers and no lost content (verified by reading the merged result, not just trusting the exit code).

The real substance of MERGE-03 is now concrete rather than speculative: our `load-terminus-tracker.ts` and upstream's `goal-terminus.ts` are NOT just two names for the same idea — they encode a genuine architectural fork in how "strict load" (`agda_load_no_metas`) is implemented. Ours sends Agda's real `Cmd_load_no_metas` IOTCM command (version-gated to Agda ≥ 2.8.0; on 2.6.4.3–2.7.x it throws a fatal-protocol-stderr tool error, which is a real, previously-undocumented gap against our own declared `minAgdaVersion`). Upstream's sends a plain `Cmd_load` and reproduces strict pass/fail via client-side hole/meta counting, which works uniformly across every Agda version we claim to support. Upstream also wires fatal-protocol-stderr detection directly into the terminus tracker (`sawFatalStderr`) so a rejected command unblocks immediately instead of waiting out the full command timeout — ours only throws `throwOnFatalProtocolStderr` after `sendCommand` resolves, and our terminus tracker does not treat `StderrOutput` as a completion signal at all, so a fatal-stderr load would currently hang until the 120s command timeout. The genuine from-RED referee for the strict path is `test/integration/mcp/capture-regression.test.ts`'s two `agda_load_no_metas` matrix entries (`issue-64-61-transitive-staleness` + `guard-no-metas-clean-load-under-fault-injection`), both run under deliberately hostile idle-timing fault injection (`AGDA_MCP_IDLE_COMPLETION_MS=1`) — not the file I initially mis-identified (`agda-stale-dependency.test.ts`, which is actually upstream's own analogous test for the *metas* path, added net-new by their commits, not ours).

MERGE-02's warn-guard is a small, well-written ~80-line `vitest` `setupFiles` module (`test/helpers/warn-guard.ts`) that `vi.spyOn`s `logger.warn` per-test and fails any test with an un-acknowledged warn call; opt-in is `expectWarning(match?)` or the escape-hatch `ackWarnings()`. Our codebase has 9 `logger.warn(` call sites in `src/` today (all best-effort-catch, per CLAUDE.md convention) and currently zero `expectWarning`/`ackWarnings` usages in `test/` — every test that exercises one of those 9 paths will start red the moment this harness lands, and each needs its call site triaged individually.

ADOPT-01/02 is mechanically simple once the file lands: `registerStructuredTool` (which upstream's new `register-goal-candidates.ts` already uses) auto-populates the manifest via `registerManifestEntry`, and `agda_tools_catalog` is entirely manifest-derived — so wiring is a two-line addition to `register-core-tools.ts` plus a `tool-recommendation.ts` entry and (for full ADOPT-02 discoverability quality) a `tool-family-examples.json` entry.

**Primary recommendation:** Do the merge as a real `git merge --no-ff upstream/main` on `main` (working directly on `main`, nothing pushed until the phase's single end-of-phase push per D-10); resolve the 4 structural/mechanical conflicts (refactor-helpers.ts, command-completion.ts, goal-tools.ts, agent-ux.test.ts) by keeping our file-split structure and merging in upstream's genuinely new content (mimer-mode test, `usesMimerProofSearch` engine dispatch); resolve the 2 architectural conflicts (session-load-impl.ts, agda-transport.ts) empirically by actually running the two from-RED capture-regression-matrix entries against each candidate implementation, adopting whichever combination keeps both green while also adopting upstream's fatal-stderr-as-terminus improvement regardless of which side wins the metas/strict architecture question.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Merge conflict resolution (mechanical + structural) | API/Backend (src/) | — | Pure server-side TypeScript; no client/browser tier exists in this project |
| Load-terminus completion-signal detection | API/Backend (`src/session/agda-transport.ts`, `command-completion.ts`) | — | Transport-layer protocol state machine; owns when a `Cmd_load`/`Cmd_load_no_metas` round trip is "done" |
| Fatal-protocol-stderr handling | API/Backend (`src/agda/protocol-errors.ts` + transport) | — | Detecting Agda's own command-rejection signal is a transport concern, not a tool-layer concern |
| `agda_goal_candidates` tool adoption | API/Backend (`src/tools/register-goal-candidates.ts`) | — | Thin MCP tool adapter per project convention; no UI tier |
| Tool discoverability (manifest, recommendation, catalog) | API/Backend (`src/tools/manifest.ts`, `src/session/tool-recommendation.ts`) | Docs (README/tool catalog) | Runtime SSOT lives server-side; docs are a secondary, human-facing mirror |
| Test-strictness reconciliation (warn-guard) | Build/Test tooling (`vitest.config.ts`, `test/helpers/`) | — | Test-infrastructure concern, not application code |
| Full acceptance verify + dogfood session | API/Backend (real Agda subprocess) + CI/CD | — | The dogfood session drives the actual MCP server; ACCEPT-03's deploy-watch is CI/CD + k8s, not application code |
| Auto-deploy watch (D-06) | CI/CD (`.github/workflows/deploy-ingest.yml`) | Database/Storage (k8s cluster `/healthz`) | Deploy pipeline already exists from Phase 8; this phase only consumes it once |

## Standard Stack

No new external packages are introduced by this phase. All "stack" additions are first-party files carried in from upstream via the merge itself.

### Core (carried in by the merge, not separately installed)
| File | Origin | Purpose | Why it matters here |
|------|--------|---------|---------------------|
| `test/helpers/warn-guard.ts` | upstream `d4497a2` | Global `vitest` `setupFiles` fail-on-unexpected-warn guard | MERGE-02's entire mechanism |
| `src/session/goal-terminus.ts` (`GoalTerminusTracker`) | upstream `390a502`/`974cc38` | Alternative load-terminus tracker | MERGE-03 adjudication subject |
| `src/session/command-wait-diagnostics.ts` | upstream `974cc38` | Shared sentry/timeout log helper | Net-new file, no conflict — auto-merges |
| `src/tools/register-goal-candidates.ts` | upstream `b717ad4` (#70) | `agda_goal_candidates` tool | ADOPT-01 subject |
| `src/agda/goal-analysis.ts` additions (`parseContextEntry`, `matchTermsByType`) | upstream `b717ad4` | Type-directed term matching used by `agda_goal_candidates` | Extends an existing shared file (not in conflict list) — auto-merges |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real `git merge --no-ff` (D-01, locked) | `git rebase` | Forbidden by settled decision — 513 published commits, pushed tags, auto-deploy-on-main make history rewriting destructive. Not a live option; do not relitigate. |
| Keep our `Cmd_load_no_metas`-based strict load | Adopt upstream's `Cmd_load`+client-side-check strict load | See MERGE-03 section — this is the actual empirical question this phase must answer, not a foregone conclusion either way |

**Installation:** None. `npm ci` after the merge is the only install step (verifies `package-lock.json` resolved cleanly post-merge).

**Version verification:** `package.json`'s version bump (0.6.7 → 0.6.8) is accepted mechanically per D-03 — verified live: the merged `package.json` retains `typecheck:test` (a script only OUR side has; upstream never had it, so there is no 3-way deletion race — false alarm ruled out by direct inspection of the merged file) and correctly picks up `"version": "0.6.8"`.

## Package Legitimacy Audit

Not applicable — this phase installs zero new external (npm-registry) packages. Every new file is first-party TypeScript carried in via the git merge from a known, already-vetted upstream repository (`InvariantHoldings/agda-mcp-server`, the fork origin). `npm ci` after the merge should show no `package-lock.json` diff beyond the version bump — verify this explicitly as a merge-sanity check, since an unexpected lockfile diff would indicate a dependency actually changed and would need its own legitimacy check at that point.

## Architecture Patterns

### System Architecture Diagram

```
git fetch upstream (5 commits behind, unchanged since discussion)
        │
        ▼
git merge --no-ff upstream/main  ──► 6 conflicts (verified live, exact match to seed doc)
        │                              ├─ src/agda/refactor-helpers.ts        (mechanical: doc/comment collision)
        │                              ├─ src/tools/goal-tools.ts            (structural: file-split vs monolith)
        │                              ├─ test/unit/agda/agent-ux.test.ts    (additive: keep both test blocks)
        │                              ├─ src/session/command-completion.ts  (architectural: snapshot field shape)
        │                              ├─ src/session/agda-transport.ts      (architectural: terminus tracker choice)
        │                              └─ src/agda/session-load-impl.ts      (architectural: Cmd_load_no_metas vs Cmd_load+check)
        ▼
Resolve mechanical/structural conflicts by inspection (Plan 1 territory)
        │
        ▼
Resolve architectural conflicts EMPIRICALLY:
   run test/integration/mcp/capture-regression.test.ts
   (2 matrix entries: issue-64-61-transitive-staleness,
    guard-no-metas-clean-load-under-fault-injection)
   against each candidate implementation combination
        │
        ▼
Adopt winning combination + upstream's fatal-stderr-as-terminus hardening
(independent of which side wins the metas/strict architecture question)
        │
        ▼
Reconcile MERGE-02 (warn-guard): triage 9 logger.warn call sites,
add expectWarning()/ackWarnings() per legitimately-warning test
        │
        ▼
Wire ADOPT-01/02: register-core-tools.ts (+2 lines) →
manifest auto-populates → tool-recommendation.ts entry →
tool-family-examples.json entry (discoverability polish)
        │
        ▼
ACCEPT-01: full verify (build, typecheck:test, RUN_AGDA_INTEGRATION=1 full suite)
        │
        ▼
ACCEPT-02: one real dogfood session on pinned CHG corpus via codex exec,
           must invoke agda_goal_candidates at least once
        │
        ▼
ACCEPT-03: ONE push to origin main → gh run watch deploy-ingest.yml →
           curl .../agda-mcp/healthz until 200
```

### Recommended Project Structure
No new directories. All work lands inside the existing `src/session/`, `src/agda/`, `src/tools/`, `test/` layout; `docs/LOAD-TERMINUS-ADJUDICATION.md` (or similarly named, per D-06, Claude's discretion on exact filename) is the one new file this phase adds outside of the merge itself.

### Pattern 1: Resolve mechanical conflicts as "keep both, don't choose"
**What:** For `refactor-helpers.ts` and `agent-ux.test.ts`, both sides added genuinely compatible, non-overlapping content (our T-06-12/RT4 hint-validation tests + upstream's mimer-mode test in `agent-ux.test.ts`; our `assertValidAutoHint` guard + upstream's engine-selection doc comment in `refactor-helpers.ts`). The correct resolution is textual union, not a pick-one adjudication.
**When to use:** Any conflict where the two hunks describe different, additive behaviors rather than competing implementations of the identical behavior.
**Example (verified from the actual dry-run merge conflict markers):**
```typescript
// Source: live dry-run merge of test/unit/agda/agent-ux.test.ts, lines 196-241
// KEEP: our from-RED T-06-12/RT4 regression tests (never weaken per D-05)
test("rejects a flag-shaped hints token instead of injecting it into the payload", () => { /* ... */ });
test("allows a hyphenated identifier that does not lead with '-'", () => { /* ... */ });
// ADD: upstream's new mimer-mode coverage (genuinely new, not competing)
test("mimer mode emits bare hints and drops flag-only options", () => { /* ... */ });
```

### Pattern 2: Resolve the `goal-tools.ts` structural conflict by re-applying OUR split
**What:** Upstream's `goal-tools.ts` is still a 507-line monolith containing both read-only goal queries AND write-capable proof actions (`agda_case_split`, `agda_give`, `agda_refine`, `agda_intro`, `agda_auto`, etc.). Our side already split this into `goal-tools.ts` (515 lines, read-only) + `goal-write-tools.ts` (359 lines, write-capable) to stay under the 500-line ceiling. The conflict is therefore a false architectural disagreement — upstream simply hasn't hit the ceiling split yet.
**When to use:** Whenever a conflict is actually "our file organization moved a function upstream still has inline."
**Resolution:** Keep our two-file split. Port upstream's ONE genuine logic delta buried inside the monolith — `agda_auto`'s engine dispatch via `usesMimerProofSearch(session.getAgdaVersion())` selecting `"mimer"` vs `"agsy"` at runtime — into `goal-write-tools.ts`'s existing `agda_auto` registration (currently calls `buildAutoSearchPayload(options)` with no `engine` argument, silently defaulting to `"mimer"` always). Note `usesMimerProofSearch` already exists in our `src/agda/version-support.ts` (line 176) — it is simply unused by our current `agda_auto` wiring. Since our `minAgdaVersion` is `2.6.4.3` (already ≥ the 2.6.3 Mimer cutover), this is a real-but-low-severity gap: only matters for the sliver of versions `2.6.3`–pre-cutover, if any exist in practice.

### Pattern 3: The `agda_goal_candidates` adoption wiring (verified against live source)
**What:** The exact mechanical steps to satisfy ADOPT-01/02.
```typescript
// Source: live src/tools/register-core-tools.ts (13 existing register() calls, same pattern)
import { registerGoalCandidates } from "./register-goal-candidates.js"; // new import
// ...
registerGoalCandidates(server, session, projectRoot); // new line, same signature as all 13 siblings
```
`registerGoalCandidates` internally calls `registerStructuredTool` (`src/tools/tool-helpers.ts` → `src/tools/tool-registration.ts:151`), which calls `registerManifestEntry` (`src/tools/manifest.ts`) automatically — so the manifest, `agda_tools_catalog` (fully manifest-derived per `src/tools/register-tools-catalog.ts`), and `listToolManifest()` all pick up the new tool with zero additional code once this one call is wired in. What remains genuinely discretionary work for full ADOPT-02 quality:
1. A `tool-recommendation.ts` entry (pattern: `src/session/tool-recommendation.ts` lines ~145-200, the "has holes" branch that already recommends `agda_goal_catalog`/`agda_auto`/`agda_case_split` — `agda_goal_candidates` belongs alongside these).
2. A `src/tools/data/tool-family-examples.json` entry under the `"proof"` family (this file directly feeds `agda_tools_catalog`'s "representative example invocations" — the concrete discoverability surface the ADOPT-02 success criterion asks for, beyond the bare manifest listing).
3. `agda_goal_candidates`'s own `logger.warn("goal_candidates typeContext query failed", ...)` best-effort catch (in the adopted file) is itself a NEW MERGE-02 warn-guard registration site — don't forget it when counting/triaging call sites.

### Anti-Patterns to Avoid
- **Renaming `agda_goal_candidates` on adoption:** Explicitly forbidden by D-08 — a rename creates a permanent re-conflict on every future 3-day sync.
- **Deleting `load-terminus-tracker.ts` before running the actual referee tests:** D-04 requires the locks to demonstrably stay green under upstream's implementation FIRST; do not delete on architectural taste alone.
- **Weakening or deleting a from-RED test to make MERGE-02's warn-guard pass:** D-05/D-07 forbid this — every legitimate warn call site must be allow-listed via `expectWarning`/`ackWarnings`, never silenced by deleting the assertion or the warn call itself.
- **Resolving `package.json`/`vitest.config.ts` by hand:** Both auto-merge cleanly (verified live) — do not manually re-edit them; doing so risks accidentally reintroducing a conflict git already resolved correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deciding which load-terminus implementation is correct | A new from-scratch reasoning framework | The existing `test/integration/mcp/capture-regression.test.ts` matrix (2 `agda_load_no_metas` entries, real MCP-harness-level, fault-injection-driven) | This is already the exact referee mechanism the project built for precisely this class of question (Phase 3.1's own false-green fix) — running it against each candidate implementation is strictly more reliable than manual code reading |
| Detecting a "legitimate" `logger.warn` call site | A bespoke allow-list schema | `expectWarning(match?)` / `ackWarnings()` from upstream's own `test/helpers/warn-guard.ts` | The mechanism ships with the merge itself — this is D-07's whole point |
| Discoverability for a new tool | A separate hand-maintained tool-listing doc | The existing manifest → `agda_tools_catalog` → `tool-family-examples.json` pipeline | Already fully automated; hand-rolling a parallel doc would immediately drift |

**Key insight:** Every mechanism this phase needs (regression referee, warn-registration, tool-discoverability plumbing) already exists in one codebase or the other — the work is genuinely "reconcile and wire," not "design and build."

## Runtime State Inventory

Not applicable in the rename/refactor/migration sense — this phase does not rename or rebrand anything. However, MERGE-01/03 do carry an analogous "what survives the merge automatically vs. needs an explicit check" concern, documented here for planning completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Local git state | 11 local commits ahead of `origin/main` before this phase starts (this session's own docs/context commits) | None — D-10 already accounts for this: intermediate commits stay local, exactly ONE push at phase end |
| CI/CD workflow config | `.github/workflows/deploy-ingest.yml` untouched by upstream (upstream touches zero of `.github/`, `scripts/`, `k8s/`, `Dockerfile` — verified: `git diff --name-status main upstream/main` confirms no hits in those paths) | None — deploy pipeline is structurally disjoint from the merge |
| `package-lock.json` | Not independently inspected this session (no dependency changes in upstream's 5 commits per the diff stat) | Run `npm ci` post-merge and diff `package-lock.json` against pre-merge as a sanity check; escalate only if unexpectedly different |
| Fix-queue / regression-matrix state (`test/fixtures/fix-queue.json`, `capture-regression-matrix.json`) | Both files are OUR data, not touched by upstream's 5 commits (not in the diff stat) | None — these stay authoritative for the adjudication referee |

## Common Pitfalls

### Pitfall 1: Misidentifying the from-RED referee test
**What goes wrong:** `test/integration/agda/agda-stale-dependency.test.ts` LOOKS like it should be "our" #61/#64 flagship lock (it literally has a comment reading "Regression for the stale-dependency false-green (issues #61 / #64)") — but it is actually **upstream's own net-new test file**, added by their `390a502`/`974cc38` commits, exercising the *metas* (`agda_load`) path only. It does not exist on our `main` pre-merge at all.
**Why it happens:** Both repos share pre-fork issue-tracker numbering (merge-base commit references `#65,#66`), so upstream independently wrote a test for the same historical bug class, using the same issue numbers, for a different tool (`agda_load` vs our `agda_load_no_metas`).
**How to avoid:** The actual from-RED referee (verified via `test/fixtures/fix-queue.json`'s own text: *"Fixed by the strict terminus guard (Phase 3.1); capture-regression-matrix entry issue-64-61-transitive-staleness is locked"*) is `test/integration/mcp/capture-regression.test.ts`, driven by `test/fixtures/capture-regression-matrix.json`'s two `agda_load_no_metas` entries: `issue-64-61-transitive-staleness` (broken dep → must be `type-error`) and `guard-no-metas-clean-load-under-fault-injection` (clean load → must stay `ok-complete`), both under `AGDA_MCP_IDLE_COMPLETION_MS=1` fault injection. Run these two specifically (`RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts`), not the superficially-similar-looking upstream file.
**Warning signs:** A test file whose header comment references your own issue numbers but that `git show main:<path>` reports as nonexistent pre-merge.

### Pitfall 2: Assuming RT8 is a load-terminus-mechanism referee
**What goes wrong:** REQUIREMENTS.md/CONTEXT.md list "RT8" alongside the #64/#61 flagship as a referee lock. RT8's actual regression test (`test/unit/session/register-agda-load-no-metas.test.ts`) uses a fully mocked `session` object (`loadNoMetas: async () => ({...})`) — it verifies the tool-registration layer's session-history *reporting* (previousClassification/reloaded diagnostics), completely independent of which terminus-tracking implementation underlies the real `loadNoMetas()` call.
**Why it happens:** RT8 and the #64/#61 flagship were fixed in the same phase (03.1/06) and are documented together, inviting the assumption they test the same layer.
**How to avoid:** RT8 will stay green regardless of the MERGE-03 adjudication outcome (it never calls real Agda) — do not spend adjudication effort trying to make RT8 discriminate between implementations. Treat it as a cheap always-green sanity check, not a decision input.

### Pitfall 3: `agda_load_no_metas` silently version-gated to Agda ≥ 2.8.0 today
**What goes wrong:** Our current `Cmd_load_no_metas`-based strict-load implementation depends on an Agda IOTCM verb that (per `test/integration/agda/agda-fixture-matrix.test.ts`'s own comment) **does not exist before Agda 2.8.0** — "the protocol parser emits 'cannot read: IOTCM ...' which now surfaces as a thrown tool error." Our declared `minAgdaVersion` is `2.6.4.3`. This means `agda_load_no_metas` is currently broken (throws) on roughly half our declared-supported version range.
**Why it happens:** The Cmd_load_no_metas IOTCM command itself is a recent Agda addition; our Phase 3.1 fix built directly on it without cross-checking the project's own min-version contract.
**How to avoid:** This is a strong, empirically-verified point in favor of seriously considering upstream's Cmd_load+client-side-check approach for the strict path (it never issues the version-gated verb, so it works uniformly across 2.6.4.3–2.9.0) — but confirm via the actual referee tests (Pitfall 1) rather than adopting on this reasoning alone, since the two approaches may still diverge on edge cases (e.g., `abstract`-block invisible-goal detection, source-hole-marker fallback scanning).
**Warning signs:** Any adjudication decision that keeps `Cmd_load_no_metas` without an explicit plan for what happens on Agda < 2.8.0 (currently: a thrown error with a fatal-stderr message, not a graceful degrade).

### Pitfall 4: Fatal-protocol-stderr does not currently unblock our terminus
**What goes wrong:** Our `load-terminus-tracker.ts`'s `recordLoadTerminusResponse` only inspects `InteractionPoints` and `DisplayInfo` response kinds — never `StderrOutput`. `throwOnFatalProtocolStderr` is called by `session-load-impl.ts` only AFTER `sendCommand` resolves. If Agda emits a fatal protocol-rejection stderr (e.g. "cannot read: IOTCM...") for any reason, our transport-level terminus never sees it as a completion signal, and (per `shouldResolveOnIdle`'s `awaitGoalTerminus && !sawGoalTerminus` guard) the command would not resolve on idle — it would wait out the full 120s command timeout before the caller-level `throwOnFatalProtocolStderr` ever gets a chance to run.
**Why it happens:** Our fatal-stderr detection (`src/agda/protocol-errors.ts`, added independently by our own commit `f1b45eb`, predating this merge) was wired at the load-impl layer, not the transport layer — a reasonable design at the time, but upstream's `974cc38` wires the equivalent detection (`isFatalProtocolStderr`) directly into `GoalTerminusTracker.record()`'s `sawFatalStderr` field, feeding `reached()` immediately.
**How to avoid:** Per D-04's explicit fallback ("Locks red → keep ours + graft upstream's fatal-stderr / inactivity-timeout hardening"), plan to graft upstream's transport-level fatal-stderr wiring into whichever terminus implementation is adopted, regardless of the metas/strict architecture outcome — this is a strict improvement with no visible downside.
**Warning signs:** Any adjudication plan that treats fatal-stderr handling as bundled with (rather than separable from) the metas/strict architecture choice.

### Pitfall 5: The "inactivity timeout" sub-behavior may already be common code
**What goes wrong:** Assuming all three named sub-behaviors (completion-signal detection, fatal-stderr handling, inactivity timeout) are equally in dispute and need separate adjudication.
**Why it happens:** The `resetInactivityTimer` mechanism upstream's commit message (`974cc38`) describes as new ("The per-command timeout is now an inactivity watchdog... resets on each response") is **already present, verbatim-equivalent, and auto-merging cleanly with zero conflict** in our current `agda-transport.ts` (`private resetInactivityTimer: (() => void) | null = null;` sits OUTSIDE all 7 conflict-marker blocks in that file). Whether we added this independently or it predates the fork needs no further investigation — the practical fact is it does not appear in the conflict diff at all.
**How to avoid:** Scope MERGE-03's actual adjudication work to the two things that DO genuinely differ: (1) completion-signal detection / strict-load architecture (session-load-impl.ts + agda-transport.ts's `terminus` vs `awaitGoalTerminus`/`goalTerminus` fields), and (2) fatal-stderr-as-terminus (Pitfall 4). Don't budget separate adjudication effort for inactivity-timeout — verify it's already equivalent (a 10-minute check) rather than treating it as a third open question.
**Warning signs:** A plan task that treats "inactivity timeout" as requiring its own from-RED test run — check the actual merge diff first.

### Pitfall 6: The MERGE-02 warn-guard blast radius is untriaged and easy to underestimate
**What goes wrong:** Assuming the 9 `logger.warn(` call sites in `src/` map 1:1 to 9 test fixes. In practice, a single call site can be exercised by multiple test files (unit + integration), and conversely some call sites may not currently be exercised by any test at all (meaning the guard would never fire for them, but ALSO means they get zero coverage-driven confidence they even correctly warn).
**Why it happens:** The guard is being added at the `vitest.config.ts` global level (`setupFiles`), so it applies uniformly to all ~1600 existing tests simultaneously, not incrementally.
**How to avoid:** Budget an actual full-suite run with the guard installed (`npx vitest run` right after taking upstream's `vitest.config.ts`+`warn-guard.ts` addition, before resolving anything else) as the FIRST diagnostic step of MERGE-02 — the failure list IS the authoritative triage list, more reliable than grepping `logger.warn(` call sites by hand (which was the method used for this research's 9-site count and may over- or under-count actual test impact).
**Warning signs:** A plan that estimates MERGE-02 effort purely from the static `logger.warn(` grep count without having actually run the guarded suite once.

## Code Examples

### Warn-guard opt-in pattern (verified from upstream's actual file)
```typescript
// Source: upstream d4497a2, test/helpers/warn-guard.ts (carried in verbatim by the merge)
import { expectWarning } from "../helpers/warn-guard.js"; // adjust relative path per test file location

test("some best-effort catch logs a warning and falls back safely", () => {
  const result = doSomethingThatWarns();
  expectWarning("expected substring from the logger.warn message");
  expect(result).toEqual(safeFailureFallback);
});

// Escape hatch for genuinely variable warn output (prefer expectWarning when possible):
// import { ackWarnings } from "../helpers/warn-guard.js";
// ackWarnings();
```

### Running the actual MERGE-03 referee (verified command, gated correctly)
```bash
# Requires real Agda (2.8.0 confirmed installed locally) + the integration-test env flag.
RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts
# Two tests must both pass, regardless of which terminus implementation is adopted:
#   "issue-64-61-transitive-staleness: agda_load_no_metas matches ORCL-01 cold expected value"
#   "guard-no-metas-clean-load-under-fault-injection: agda_load_no_metas matches ORCL-01 cold expected value"
```

### The exact ADOPT-01 wiring diff shape
```typescript
// src/tools/register-core-tools.ts — add import + one call, same pattern as the other 13
import { registerGoalCandidates } from "./register-goal-candidates.js";
// ...inside registerCoreTools(server, session, projectRoot):
registerGoalCandidates(server, session, projectRoot);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Guessing `Cmd_load` completion from an idle gap | Waiting for Agda's explicit goal-state terminus (InteractionPoints+AllGoalsWarnings, or Error) | Our Phase 3.1 (independently) AND upstream's #68 (independently) — both sides converged on the same core fix for the *metas* path | Both implementations agree on this; no adjudication needed for the metas path itself |
| Strict load via a version-gated Agda-native `Cmd_load_no_metas` verb | (upstream's alternative) Strict load via ordinary `Cmd_load` + client-side hole/meta counting | Upstream #69 (974cc38), same v0.6.8 release as their #68 fix | Broader Agda-version compatibility (works < 2.8.0) if adopted; needs referee verification before adoption |
| `logger.warn` output leaking to console during test runs | Fail-suite-on-unexpected-warn guard with explicit opt-in acknowledgment | Upstream d4497a2 (2026-07-04), not yet merged | Every legitimate warn call site across ~1600 tests needs explicit registration post-merge |

**Deprecated/outdated:**
- The seed doc's "488 ahead" / discussion-time "509 ahead" figures are both stale by design (our own commit count keeps moving); "513 ahead / 5 behind" is this session's live re-verified number, itself expected to have moved again by execution time — always re-run `git fetch upstream && git log --oneline main..upstream/main` at the start of execution, not just at research/discuss time.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Upstream's Cmd_load+client-side-check strict-load approach will pass BOTH capture-regression-matrix referee entries (hypothesis, not yet empirically run against a live swapped-in implementation) | MERGE-03 / Summary | If wrong, the "prefer upstream's version-compatible approach" recommendation inverts — plan must budget time to actually run the referee before committing to an adjudication outcome, not assume this research's hypothesis |
| A2 | The 9-site `logger.warn(` grep count in `src/` accurately reflects MERGE-02's test-triage effort | Pitfall 6 | Likely undercounts or miscounts test impact — Pitfall 6 already recommends treating a full guarded suite run as authoritative instead |
| A3 | `usesMimerProofSearch`'s absence from our current `agda_auto` wiring is low-severity because `minAgdaVersion` already exceeds the Mimer cutover | Pattern 2 | If any teammate or CI lane actually runs Agda < 2.6.3 (contradicting the declared min-version contract), this would be a live functional gap, not just a doc nicety |

**None of these are compliance/retention/security-standard claims** — all are ordinary engineering-tradeoff assumptions, verifiable by running the referenced tests during plan execution.

## Open Questions

1. **Does upstream's `Cmd_load`+client-side-check strict-load implementation actually pass both capture-regression-matrix referee entries?**
   - What we know: The architecture is fundamentally different from ours (real IOTCM verb vs. simulated strictness); upstream's approach has a robust positive-error-terminus signal for the broken-dependency case (a real `DisplayInfo Error` from the underlying `Cmd_load`), which should in principle satisfy `issue-64-61-transitive-staleness`.
   - What's unclear: Whether `needsExplicitHoleScan`/`countExplicitSourceHoles`'s client-side fallback (used when Agda reports zero visible+invisible goals but source still has `{!!}`/`?` markers) covers every edge case our real `Cmd_load_no_metas` verb's native strictness covers — e.g. certain `abstract`-block or postulate interactions.
   - Recommendation: This is exactly what the referee tests are for — the plan should treat "run the two matrix entries against upstream's swapped-in implementation" as a first-class Task, not a foregone conclusion.

2. **Exact allow-list mechanism shape for MERGE-02 (per-test `expectWarning` vs. a central registry)?**
   - What we know: D-07 leaves this to researcher/planner discretion; upstream's shipped mechanism is purely per-test (`expectWarning`/`ackWarnings`), no central registry exists.
   - What's unclear: Whether the ~1600-test scale makes a central allow-list (e.g. a JSON list of `{file, expectedSubstring}`) more maintainable than scattering `expectWarning()` calls, given the project's existing JSON-SSOT convention for other lookup tables.
   - Recommendation: Given upstream ships the per-test mechanism ready-to-use and it requires zero new infrastructure, default to it; only reach for a central registry if the full-suite triage run (Pitfall 6) reveals an unmanageably large or repetitive set of sites.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `agda` binary | Full real-Agda integration suite, referee tests, dogfood session | ✓ | 2.8.0 (`/Users/eric/.nix-profile/bin/agda`) | — |
| Node.js 24 | `npm ci`, build, all test commands (package.json engine-strict) | ✓ (via mise, NOT the ambient shell default) | `24.16.0` at `/Users/eric/.local/share/mise/installs/node/24/bin` | The ambient shell's default `node` resolves to v22.22.0 — every command in this phase MUST `export PATH=".../node/24/bin:$PATH"` first, exactly as the upstream-sync skill's LOCAL gate already documents |
| `gh` CLI | ACCEPT-03 deploy watch (`gh run watch`) | ✓ | 2.96.0, authenticated as `cliu238` | — |
| `codex` CLI | ACCEPT-02 dogfood session (D-09, headless via `codex exec`) | ✓ | codex-cli 0.142.5 | — |
| `git` remote `upstream` | MERGE-01 | ✓ | fetch-only; push URL deliberately `DISABLED-push-to-cliu238-origin-instead` | — |
| Cluster `/healthz` endpoint | ACCEPT-03 final check | ✓ (reachable now, pre-phase baseline) | Returns HTTP 200 at `https://dev.sites.idies.jhu.edu/agda-mcp/healthz` | — |
| `npx tsc` (typecheck:test) | MERGE-01 success criterion | ✓ | TypeScript 5.9.3 | — |

**Missing dependencies with no fallback:** None — every dependency this phase needs is already present and verified.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.2 (confirmed installed: `v4.1.2` per DEPLOY-OPERATIONS.md's cluster-pod run) |
| Config file | `vitest.config.ts` (auto-merges cleanly; post-merge gains `setupFiles: ["test/helpers/warn-guard.ts"]` alongside our existing `exclude`/`ciQuarantine`/`passWithNoTests` logic) |
| Quick run command | `npx vitest run <specific file>` (per-task, e.g. the two capture-regression-matrix entries) |
| Full suite command | `RUN_AGDA_INTEGRATION=1 npx vitest run` (local gate, per `.claude/skills/upstream-sync/SKILL.md` Section 5) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MERGE-01 | Merge completes, build + typecheck green | smoke | `npm run build && npx tsc -p tsconfig.test.json --noEmit` | ✅ existing scripts |
| MERGE-02 | Full suite green under warn-guard | integration | `RUN_AGDA_INTEGRATION=1 npx vitest run` | ✅ existing suite, guard is new but self-contained |
| MERGE-03 | Both terminus-adjudication referee entries pass | integration | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` | ✅ `test/integration/mcp/capture-regression.test.ts` + `test/fixtures/capture-regression-matrix.json` |
| ADOPT-01 | `agda_goal_candidates` registered + manifest-visible | unit | `npx vitest run test/unit/tools/goal-candidates.test.ts` (carried in by merge) + a manifest-registration assertion | ✅ Wave 0 — carried in by merge, verify it stays green post-wiring |
| ADOPT-02 | Tool discoverable via `agda_tools_catalog` | unit/manual | `npx vitest run test/unit/tools/agent-ux-tools.test.ts` (mentions the catalog) or a fresh assertion on `listToolManifest()` including `agda_goal_candidates` | ⚠️ Wave 0 gap — no existing test asserts the FULL catalog includes this specific tool name after wiring; add one |
| ACCEPT-01 | Full verify green | integration | `npm run build && npx tsc -p tsconfig.test.json --noEmit && RUN_AGDA_INTEGRATION=1 npx vitest run` | ✅ existing scripts |
| ACCEPT-02 | Real dogfood session, invokes `agda_goal_candidates` | manual-only (justified: requires a live Codex session against a real corpus; not automatable in a unit/integration test) | `codex exec` driven session per `.claude/skills/agda-dogfooding/SKILL.md` | N/A — manual by design |
| ACCEPT-03 | Deploy watched to green, healthz ok | manual/CI | `gh run watch <id> --exit-status` + `curl -fsS https://dev.sites.idies.jhu.edu/agda-mcp/healthz` | ✅ documented in `.claude/skills/upstream-sync/SKILL.md` Section 4 |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <file>` for whatever the task touched (e.g. the capture-regression-matrix file during MERGE-03 adjudication work).
- **Per wave merge:** `RUN_AGDA_INTEGRATION=1 npx vitest run` (full suite, real Agda).
- **Phase gate:** Full suite green (ACCEPT-01) before `/gsd:verify-work`, followed by the one-time dogfood session (ACCEPT-02) and the single end-of-phase push + deploy watch (ACCEPT-03).

### Wave 0 Gaps
- [ ] A manifest-level assertion that `agda_goal_candidates` appears in `listToolManifest()`/`agda_tools_catalog` output after wiring (no existing test currently asserts this for a tool not yet registered — the carried-in `test/unit/tools/goal-candidates.test.ts` tests the tool's OWN callback behavior, not its manifest registration from `register-core-tools.ts`).
- [ ] A `docs/LOAD-TERMINUS-ADJUDICATION.md` (or equivalent, per D-06) — this is a documentation deliverable, not a test, but its absence is itself a MERGE-03 acceptance gap worth tracking here since the phase's success criteria treat it as durable evidence.

*(No framework-install gap — vitest is already fully configured and working.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | This phase touches no auth surface — the merge is server-internal; the deploy-watch step uses existing `gh`/cluster credentials already provisioned in Phase 8 |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes (incidental) | The `agda_goal_candidates` tool being adopted already validates its one input (`limitPerGoal`) via `z.number().int().min(1).max(100).optional()` — verified in the actual upstream source; no new validation surface introduced by adoption |
| V6 Cryptography | no | N/A — no secrets are created/rotated by this phase; the deploy-watch step only reads an existing public `/healthz` endpoint and existing `gh` auth |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Guarded-file conflict resolved incorrectly, silently regressing a false-green-critical seam | Tampering (of protocol correctness, not security in the classic sense) | The referee-test-driven adjudication process (MERGE-03) IS the mitigation — do not resolve `session-load-impl.ts`/`agda-transport.ts` conflicts by inspection alone |
| A malicious/compromised upstream commit landing silently via `git merge` | Tampering | Out of scope for this phase's threat model per the settled "manage own repo, one-way sync" decision — upstream is a trusted co-maintainer relationship, not an adversarial input source; not re-litigated here |
| Push to `main` triggering an unreviewed auto-deploy of broken code | Availability | Already mitigated by the existing D-06/upstream-sync skill's push→watch→`git revert -m 1` rollback procedure (Section 4, steps 6-8) — this phase consumes that existing mitigation, does not need to build a new one |

## Sources

### Primary (HIGH confidence — verified by directly running commands / reading source in this session)
- `git fetch upstream` + `git log --oneline main..upstream/main` — live divergence re-check (5 behind, head `d4497a2`, unchanged from discussion time)
- `git merge --no-commit --no-ff upstream/main` on a throwaway branch (`__dryrun_upstream_reconcile`, created from `main`, later `git merge --abort`'d and deleted) — the actual 6-conflict-file list and every conflict's textual content
- `src/session/load-terminus-tracker.ts`, `src/session/agda-transport.ts`, `src/agda/session-load-impl.ts`, `src/session/command-completion.ts` (our current `main`) — read in full
- `git show upstream/main:src/session/goal-terminus.ts`, `git show upstream/main:src/agda/session-load-impl.ts`, `git show upstream/main:src/session/command-completion.ts`, `git show upstream/main:test/helpers/warn-guard.ts`, `git show upstream/main:src/tools/register-goal-candidates.ts` — upstream's actual source at `d4497a2`
- `git show 974cc38`, `git show b717ad4`, `git show d4497a2` — upstream's own commit messages, verified against their diff stats
- `test/fixtures/capture-regression-matrix.json`, `test/fixtures/fix-queue.json`, `test/integration/mcp/capture-regression.test.ts`, `test/helpers/capture-regression-runner.ts` — the actual from-RED referee mechanism
- `test/integration/agda/agda-fixture-matrix.test.ts` (comment re: `Cmd_load_no_metas`'s Agda-2.8.0 version gate)
- Live tool checks: `agda --version` (2.8.0), `node --version` vs. `.../mise/installs/node/24/bin/node --version`, `gh --version`/`gh auth status`, `codex --version`, `curl` against the live `/healthz` endpoint (200)
- `.claude/skills/upstream-sync/SKILL.md`, `.claude/skills/agda-dogfooding/SKILL.md` — read in full
- `.planning/research/UPSTREAM-SYNC.md`, `.planning/phases/10-upstream-reconcile/10-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json`

### Secondary (MEDIUM confidence)
- `docs/DEPLOY-OPERATIONS.md` — established procedure, not re-verified live this session (Phase 8 already proved it; this phase only consumes it)
- `docs/release-0.7.0-triage.md` — context for upstream #70's framing, cross-referenced against upstream's actual `b717ad4` commit message which explicitly says the 0.7.0-gate tools "already shipped" and this commit reconciles the stale doc

### Tertiary (LOW confidence)
- None — every substantive claim in this document was verified against live command output or direct source inspection during this research session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every file's origin and content directly verified via `git show`
- Architecture (MERGE-03 adjudication): HIGH on the factual/architectural description (verified source reading); MEDIUM on the predicted referee-test OUTCOME (A1, an untested hypothesis pending actual execution)
- Pitfalls: HIGH — every pitfall in this document was discovered by actually hitting it during research (e.g. the agda-stale-dependency.test.ts misidentification was caught and corrected in real time, not theorized)

**Research date:** 2026-07-05
**Valid until:** 3-7 days — upstream's own commit cadence is slow (this exact 5-commit/`d4497a2` state has now been stable across the discuss-phase session and this research session), but our own `main` continues to move (513 ahead and rising), so re-run the live divergence check (`git fetch upstream && git log --oneline main..upstream/main`) at the START of plan execution regardless of this document's age.
