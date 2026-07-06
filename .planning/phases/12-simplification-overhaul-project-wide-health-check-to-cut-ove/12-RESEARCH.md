# Phase 12: Simplification Overhaul - Research

**Researched:** 2026-07-06
**Domain:** Repository self-audit (dead-code/tool-surface/doc-surface detection) in a TypeScript ESM MCP server with a co-located, unpublished Node/.mjs pipeline
**Confidence:** HIGH (nearly every claim below is a direct measurement against the current working tree, not inference)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Forced constraints (briefed 2026-07-05, none vetoed — cite, do not relitigate)**
- **C-01 Regression locks untouchable:** No simplification may delete or weaken any from-RED regression-locked test, and the full suite (incl. `RUN_AGDA_INTEGRATION=1` real-Agda lane) must stay green after every cut. Carrying forward Phase 10 D-05's test-authority rule.
- **C-02 Loop ② closed loop is not cuttable:** use → capture → judge → file → fix → lock is the project's Core Value. Its *implementation* may be simplified; no *stage* of the loop may be removed.
- **C-03 Upstream conflict-surface constraint:** In `src/` files that overlap upstream, simplification prefers *deleting our extra code / converging toward upstream*; avoid large-scale renames/moves/restructurings that re-inflate the merge conflict surface Phase 10 just reconciled (milestone goal: divergence stops accumulating). `scripts/` is ours alone — no such constraint there.
- **C-04 Architecture invariants stay:** single `AgdaSession` (issue #39), `command-builder.ts` SSOT, 500-line file ceiling, protocol→agda→session→tools layering. The health check audits *against* these; they are not up for debate.
- **C-05 What is over-engineered is an audit finding, not a user guess:** concrete cut targets come from the audit, not from this discussion.

**Decisions made this discussion (2026-07-05)**
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

### Deferred Ideas (OUT OF SCOPE)
- **RT6 implementation** (structured `agda_load` five-state response schema) — if the D-04 re-evaluation verdict is "do it", it becomes its own future phase (schema addition + breaking response change).
- **RT7 implementation** (timeout/process-state diagnostic taxonomy) — same handling as RT6.
- **Phase 11 auto-sync carrier** — already deferred to Future at the roadmap level; its kept-intact artifacts are out of this phase's cutting scope.

### Canonical References (from CONTEXT.md — read before planning/implementing)
- `.planning/codebase/CONCERNS.md`, `.planning/milestones/v1.1-MILESTONE-AUDIT.md`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md`, `test/fixtures/fix-queue.json` — known-debt inventories (primary audit seed).
- `ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `src/tools/manifest.ts` — architecture ground truth.
- `.planning/phases/10-upstream-reconcile/10-CONTEXT.md`, `docs/LOAD-TERMINUS-ADJUDICATION.md`, `.agents/skills/upstream-sync/SKILL.md` — constraint carriers.

### Phase boundary (from CONTEXT.md)
A project-wide health check that produces a severity-graded simplification list ("cut list"), a user sign-off checkpoint on that list, and then execution of the approved cuts — to reduce over-engineering, maintenance burden, and user-facing complexity. The audit covers the whole repo (published server `src/`, unpublished Loop ② pipeline `scripts/`, docs, planning residue); the cutting emphasis is on `scripts/` + docs + planning residue, with the server body limited to low-risk subtraction — except that redundant MCP tools may be deleted outright (D-02). Pinned goal: *"The project is measurably simpler: an audited, user-approved cut list is executed; redundant pipeline/doc/tool surface is deleted; every regression lock and the full real-Agda suite stay green; RT6/RT7 get a definitive re-evaluation verdict (implementation deferred)."*
</user_constraints>

## Project Constraints (from CLAUDE.md)

Directives extracted from `./CLAUDE.md` that the plan must not contradict:

- **Single `AgdaSession` per server process** (issue #39) — every load-family path routes through the singleton constructed once in `src/index.ts`. No cut may introduce a second construction site.
- **`src/protocol/command-builder.ts` is the SSOT for IOTCM command strings** — no hand-built wire strings anywhere else. A cut that touches command-construction code must not reintroduce a parallel string-builder.
- **Hard 500-line-per-file ceiling in `src/`** — oversized modules split into barrel + focused siblings. `src/session/agda-transport.ts` is currently at exactly 500 (see Summary) — any addition there, even incidental to a cut, needs a pre-emptive extraction.
- **Layering: `protocol → agda → session → tools`** (data-flow direction; domain logic stays in its owning layer). A "simplification" that moves logic across a layer boundary (e.g. decoding a response inside a `src/tools/*` callback) would be a violation, not a fix.
- **Tech stack is frozen for this milestone:** TypeScript ES2022 strict, Node.js >= 24, native ESM, `@modelcontextprotocol/sdk`, `zod` v4, no database/HTTP server. The audit must not propose adding any of these categories of infrastructure.
- **`vitest` is the only test runner**, property-based tests via `@fast-check/vitest`; no ESLint config exists — code quality is enforced via TypeScript strict mode plus dedicated invariant tests (e.g. `test/unit/protocol/no-bare-command-strings.test.ts`, `test/unit/tools/no-dead-tool-references.test.ts`). Any new automated check this phase adds should follow this same house pattern, not introduce a linter framework.
- **Naming/module-design conventions** (kebab-case files, barrel+siblings for oversized modules, `register*` prefix for MCP tool-registration entry points, JSON data tables under a sibling `data/` dir loaded via `loadJsonData()`) — any file the audit restructures must keep following these.
- **`AGDA_MCP_DEBUG`-gated `logger.trace`, always-on `logger.warn` to stderr** — no new logging mechanism should be introduced by a cut.
- **GSD workflow enforcement:** file-changing tool use must go through a GSD command (`/gsd-quick`, `/gsd-debug`, `/gsd-execute-phase`) — this phase's execution plans are exactly that entry point; nothing here authorizes bypassing it.

## Summary

This phase is introspective: the "domain" is this repository itself, not an external library or framework. The highest-value research finding is that **several numbers the phase was framed around are stale or wrong**, and the audit's health report must re-measure rather than inherit them. Concretely: the phase description's "~40 tools" is off by nearly 2x (74 registered tools, verified two independent ways); `src/session/agda-transport.ts` — flagged in the 2026-07-04 concerns audit as "3 lines under the 500-line ceiling" — is now sitting at **exactly 500 lines** after Phase 10's upstream merge replaced its implementation; and two of the three previously-known orphaned scripts (`scripts/verify-cold-replay.mjs`, `scripts/promote-capture.mjs`) have already been deleted by Phase 9, so the audit should not rediscover them.

The second-highest-value finding is that **tool deletion is already partially mechanically guarded**. `test/unit/tools/mcp-e2e-coverage.test.ts` asserts a strict bidirectional set-equality between the live tool manifest and `test/fixtures/e2e/mcp-tool-coverage.json` — deleting a tool without updating that fixture fails the suite immediately. `test/unit/tools/tool-family-examples.test.ts` provides a one-directional version of the same guard for the curated examples file. Neither test's write extends to prose documentation (`README.md`, `docs/assistant-workflows.md`, `.agents/skills/*/SKILL.md`) — `no-dead-tool-references.test.ts` only scans `src/**/*.ts`, never `docs/` — so prose-doc lockstep on tool deletion remains a **manual** review step, not something "the suite stayed green" will catch.

The third-highest-value finding is methodological: this codebase already has ample *known* debt (a 2026-07-04 concerns audit, two milestone audits, and a fix-queue with named regression-locked tests) that the audit should treat as a **seed to re-verify**, not a blank slate to rediscover. Re-verifying a sample of it this session already found: the `assertSafeRunId` duplication is still present but has *already silently drifted* (the two copies' error-message text differs, though the validation logic is identical) — a stronger case for extraction than the original finding implied. Combined with the tool-usage-evidence method below (aggregating real `tools/call` invocations from local dogfooding transcripts — 17 of 74 tools show *any* recorded real use, though the sample is small and biased), the audit has concrete, reproducible starting signal rather than needing to invent a methodology from scratch.

**Primary recommendation:** Seed the audit from the existing known-debt inventories (re-verify, don't rediscover), extend the project's own established pattern of small bespoke invariant tests (already used for tool-reference and manifest-consistency checks) rather than adding permanent linting infrastructure, and use `npx knip` (zero `package.json` footprint) as a one-shot supplementary cross-check for unreferenced files/exports across both `src/**/*.ts` and `scripts/**/*.mjs` — configured with explicit entry points so it does not flood the report with false positives on CLI scripts nothing in `src/` imports.

## Architectural Responsibility Map

This phase has no browser/frontend/backend web tiers — it is a CLI/stdio MCP server plus an unpublished pipeline. The map below substitutes this repo's actual architectural tiers (per `ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md`) for the generic web-app tiers the standard template assumes.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit execution itself (grep sweeps, manifest diffing, transcript aggregation, one-shot `npx knip`) | Ad hoc / dev-time only (never `src/`) | `.planning/phases/12-.../` output artifacts | The audit is a one-shot process, not a runtime capability — putting it in `src/` would itself be the over-engineering this phase exists to cut |
| MCP tool surface (74 tools, D-02 deletion target) | `src/tools/` (MCP adapter layer) | `src/session/{load,process}-tool-registration.ts` (8 of the 74 tools register here, not under `src/tools/`) | `src/tools/manifest.ts` is the runtime SSOT (`ARCHITECTURE.md`); `registerCoreTools()` composes 13 top-level groups |
| Loop ② pipeline (dogfood/oracle/queue/team, D-01's main cutting target) | `scripts/` (unpublished — `package.json#files` never lists it) | `test/unit/tools/` (26 of 26 non-seed scripts have dedicated unit tests) | `scripts/` has no 500-line ceiling and is explicitly outside the `src/` layering rules |
| Regression-lock enforcement (C-01 referee) | `test/` (vitest) | `test/fixtures/fix-queue.json` + `test/fixtures/capture-regression-matrix.json` (data, not code) | Tests are C-01's referee; matrix + fix-queue prose are the two places locks are *declared*, not enforced |
| Documentation / discoverability surface | `docs/`, `README.md`, `.agents/skills/*/SKILL.md` | `src/tools/manifest.ts` (schema-derived ground truth `agda_tools_catalog` reads from) | README already defers to the live manifest for the tool list (see State of the Art) — docs should describe *workflow*, not duplicate the catalog |
| Live deployed runtime (k8s ingest + cron judge) | External (JHU cluster, Ceph PVC) — outside this repo's own process boundary | `scripts/team/`, `Dockerfile` (`COPY . .` bakes the whole repo in) | Cuts touching `scripts/team/`, `scripts/oracle/`, or `scripts/queue/intake.mjs` are deploy-relevant (see Deployment & Runtime Surface below); cuts confined to `scripts/dogfood/` are not |

## Standard Stack

This phase does not add a runtime dependency. "Stack" here means the audit's own tooling.

### Core (already in the repo, zero new footprint)
| Tool | Version | Purpose | Why Standard Here |
|------|---------|---------|--------------------|
| `vitest` | 4.1.2 [VERIFIED: package.json] | The only test runner; C-01's referee for every cut | Already the project's sole test framework; `RUN_AGDA_INTEGRATION=1 npx vitest run` is the established full-suite gate (`.agents/skills/upstream-sync/SKILL.md` Section 5, `docs/LOAD-TERMINUS-ADJUDICATION.md`'s referee command) [CITED: .agents/skills/upstream-sync/SKILL.md] |
| `tsc` (via `npm run typecheck:test`) | 5.9.3 [VERIFIED: package.json] | Compile-time contract check across `src/` + `test/` | Already a CI gate (`.github/workflows/ci.yml`); catches a class of dangling-reference bugs a cut could introduce (e.g. an import left behind after a file deletion) |
| `find` / `wc -l` / `grep` (POSIX) | n/a | File-count, LOC, and pattern-based inventory sweeps | Zero-dependency, already how this research derived every baseline number below; sufficient at this repo's scale (150 `src/` files, 32 `scripts/` files) |
| Bespoke small invariant tests (project's own established pattern) | n/a | Narrow, semantic checks a generic tool can't express (e.g. "does this tool name exist in the manifest") | `test/unit/tools/no-dead-tool-references.test.ts`, `test/unit/protocol/no-bare-command-strings.test.ts`, `test/unit/tools/mcp-e2e-coverage.test.ts` are the house pattern (`CLAUDE.md`: "No ESLint config... enforced through TypeScript strict mode... and dedicated invariant tests") [CITED: CLAUDE.md] |

### Supporting (optional, one-shot, zero permanent footprint)
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `knip` (via `npx knip`, never added to `package.json`) [ASSUMED — package identity discovered via WebSearch, not Context7; see Package Legitimacy Audit] | 6.24.0, published 2026-07-02 [VERIFIED: npm registry — `npm view knip version time.modified`] | Cross-file unused-export/unused-file/unused-dependency detection spanning both `src/**/*.ts` and `scripts/**/*.mjs` in one pass | Only if the audit wants a machine cross-check beyond manual/grep sweeps; **requires an explicit `entry` config** (see Common Pitfalls) or it will flag the entire `scripts/` CLI surface as dead |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `knip` | `ts-prune` [ASSUMED — same provenance caveat] | Last published 2022-05-22 [VERIFIED: npm registry — `npm view ts-prune time.modified`], i.e. **stale for 4+ years**; TS-only, no `.mjs`/dependency/file coverage. Not recommended — included only because it's the tool a training-data-era search would surface first. |
| `knip` (for module-level cycle detection specifically) | `dependency-cruiser` [ASSUMED] or `madge` [ASSUMED] | Both are mature and legitimate (`dependency-cruiser` created 2016, v18.0.0; `madge` created 2012, v8.0.0 — both [VERIFIED: npm registry]) but solve a narrower problem (import cycles) this repo's own architecture doc says isn't currently a live concern ("No circular imports documented... enforced by convention" — `ARCHITECTURE.md`) [CITED: ARCHITECTURE.md]. Only reach for one of these if the audit's manual layer sweep surfaces a suspected cycle; don't add either speculatively. |
| A fresh generic "is this referenced anywhere" script | Extending `no-dead-tool-references.test.ts`'s pattern to also scan `docs/*.md` | The existing test proves the pattern works for `src/`; widening its `SRC_ROOT` (or adding a sibling test) to also walk `docs/` + `.agents/skills/` closes the one real gap identified below, without a new dependency |

**Installation:** None required for the Core tier (already present). For the Supporting tier, no `npm install` is needed — invoke as `npx knip` directly; do not add it to `devDependencies`.

**Version verification:** Confirmed 2026-07-06 via `npm view <pkg> version time.modified` against the live npm registry (not training data) for all four candidate audit-tooling packages named above.

## Package Legitimacy Audit

This phase does not require installing any package into `package.json`. The table below covers the four audit-tooling candidates evaluated for optional, one-shot `npx` invocation (never persisted as a dependency).

| Package | Registry | Age | Downloads (last week) | Source Repo | slopcheck | Disposition |
|---------|----------|-----|------------------------|--------------|-----------|-------------|
| `knip` | npm | created 2022-10-09 [VERIFIED: npm registry] | 9,422,620 [VERIFIED: npm registry `api.npmjs.org`] | github.com/webpro-nl/knip [VERIFIED: npm registry `repository.url`] | `[OK]` (0.6.1, ecosystem npm) [VERIFIED: slopcheck, this session] | Approved for one-shot `npx` use, package-identity tag `[ASSUMED]` (see below) |
| `ts-prune` | npm | created 2019-04-29 [VERIFIED: npm registry] | 556,287 [VERIFIED: npm registry] | github.com/nadeesha/ts-prune [VERIFIED: npm registry] | `[OK]` | Not recommended (stale 4+ yrs) but not a security risk; package-identity tag `[ASSUMED]` |
| `dependency-cruiser` | npm | created 2016-11-20 [VERIFIED: npm registry] | 2,447,364 [VERIFIED: npm registry] | github.com/sverweij/dependency-cruiser [VERIFIED: npm registry] | `[OK]` | Not needed unless a cycle is suspected; package-identity tag `[ASSUMED]` |
| `madge` | npm | created 2012-05-20 [VERIFIED: npm registry] | 2,534,049 [VERIFIED: npm registry] | github.com/pahen/madge [VERIFIED: npm registry] | `[OK]` | Not needed unless a cycle is suspected; package-identity tag `[ASSUMED]` |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

**Important nuance on tagging:** all four packages scanned `[OK]` under `slopcheck scan --pkg npm <name> --json` (run live this session, slopcheck 0.6.1). Per the package-name-provenance rule, however, the package *identity* claim ("knip is the real, current, actively-maintained tool for this job") is still tagged `[ASSUMED]` because it was discovered via WebSearch/training knowledge, not Context7 — registry+slopcheck confirmation does not upgrade that specific claim to `[VERIFIED]`. The *factual* sub-claims about each already-named package (version number, publish date, download count, repo URL) ARE `[VERIFIED: npm registry]`, since those came directly from a live registry query about a package whose name the planner should still confirm before the first real `npx knip` invocation. **Recommendation for the planner:** gate the first `npx knip` run behind a lightweight `checkpoint:human-verify` (confirm `github.com/webpro-nl/knip` is the intended package before running arbitrary downloaded code against the repo), consistent with graceful degradation under the package legitimacy protocol.

## Architecture Patterns

### System Architecture Diagram

The "system" here is the audit-to-cut pipeline this phase's three-part shape (D-03) already specifies. The diagram traces data flow from input sources through to the final health-report update.

```text
INPUT SOURCES (read-only, front half)
┌───────────────────────────────────────────────────────────────────┐
│ .planning/codebase/CONCERNS.md (2026-07-04 known debt)             │
│ .planning/milestones/v1.0-MILESTONE-AUDIT.md, v1.1-MILESTONE-AUDIT.md│
│ test/fixtures/fix-queue.json (triaged/locked defect ledger)         │
│ src/tools/manifest.ts (74-tool runtime SSOT)                        │
│ .agda-mcp/runs/*/transcript.jsonl (21 local real-usage samples)     │
│ npx knip output (optional, supplementary)                           │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  RE-VERIFY, DON'T       │   <- re-run each known-debt item's
                  │  REDISCOVER              │      own repro/check against HEAD;
                  │  (per-layer sweep)       │      drop anything already fixed
                  └────────────────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  SEVERITY-GRADED         │   <- one row per candidate:
                  │  CUT LIST                │      what/saves/breaks/severity
                  │  (health report output)  │
                  └────────────────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  USER SIGN-OFF           │   <- D-03: per-item approval,
                  │  CHECKPOINT              │      NOT a single all-or-nothing gate
                  └────────────────────────┘
                              │
                    approved items only
                              ▼
                  ┌────────────────────────┐
                  │  EXECUTE ONE CUT         │◄──┐  <- batch by category
                  │  (or small batch)        │   │     (script / doc / tool / src)
                  └────────────────────────┘   │
                              │                 │
                              ▼                 │
                  ┌────────────────────────┐   │  loop until
                  │  LOCAL FULL-SUITE GATE  │   │  approved list
                  │  RUN_AGDA_INTEGRATION=1 │───┘  exhausted
                  │  (C-01 referee)          │
                  └────────────────────────┘
                              │  all green
                              ▼
                  ┌────────────────────────┐
                  │  DEPLOY-RELEVANT?        │──yes──► watch redeploy + healthz
                  │  (scripts/team|oracle|   │         (D-06/D-10 pattern)
                  │   queue/intake touched?) │
                  └────────────────────────┘
                              │ no
                              ▼
                  ┌────────────────────────┐
                  │  RE-MEASURE METRICS      │   <- file/LOC/tool/script/doc
                  │  (before/after diff)     │      counts, diffed against the
                  │                          │      front-half baseline
                  └────────────────────────┘
```

### Recommended Project Structure (audit artifacts, not new `src/` code)

```
.planning/phases/12-simplification-overhaul-project-wide-health-check-to-cut-ove/
├── 12-CONTEXT.md            # already exists — locked decisions
├── 12-RESEARCH.md           # this file
├── 12-01-PLAN.md ...        # front-half: audit + health report + cut list
├── 12-0N-PLAN.md ...        # sign-off checkpoint plan (thin — mostly a checkpoint task)
├── 12-0N-PLAN.md ...        # back-half: execute approved cuts, batched by category
└── (health report + cut list live as a section of a PLAN's output, or a
     dedicated committed doc under docs/ or .planning/ — planner's call per
     "cut-list granularity and report format" being Claude's Discretion)
```

### Pattern 1: Re-verify known debt before treating it as a fresh finding
**What:** For every item in `CONCERNS.md`, both milestone audits, and `fix-queue.json`'s `triaged` entries, re-run the specific grep/read/measurement the original finding was based on against current `HEAD`, not just cite it.
**When to use:** Always, as the very first audit step — this session found the pattern pays off immediately (see Code Examples: two items already resolved, one item's severity increased).
**Example:**
```bash
# Source: this research session, re-verifying CONCERNS.md's 2026-07-04 file-size list
wc -l src/session/agda-transport.ts src/agda/session.ts \
      src/tools/agent-ux/project-tools.ts src/tools/tool-registration.ts \
      src/tools/analysis-tools.ts src/session/project-config.ts \
      src/agda/import-graph.ts
# Result 2026-07-06: agda-transport.ts is now EXACTLY 500 (was 497 on 2026-07-04,
# pre-Phase-10-merge); analysis-tools.ts grew 422->439; the rest are unchanged.
```

### Pattern 2: Let existing tests do the tool-deletion lockstep check for you
**What:** `test/unit/tools/mcp-e2e-coverage.test.ts`'s second test asserts `matrixNames` (from `test/fixtures/e2e/mcp-tool-coverage.json`) equals `manifestNames` (from `listToolManifest()`) via `toEqual` on sorted arrays — a strict bidirectional set equality.
**When to use:** Whenever D-02 deletes or renames a tool. Delete the manifest registration AND the coverage-matrix entry in the same commit; the suite will refuse to pass otherwise.
**Example:**
```typescript
// Source: test/unit/tools/mcp-e2e-coverage.test.ts (verified in-repo, 2026-07-06)
test("every registered core tool has an MCP E2E coverage assignment", async () => {
  // ...
  const manifestNames = listToolManifest().map((entry) => entry.name).sort();
  const matrixNames = mcpToolCoverageMatrix.map((entry) => entry.tool).sort();
  expect(matrixNames).toEqual(manifestNames);
});
```
`test/unit/tools/tool-family-examples.test.ts`'s "every referenced tool name is registered in the live manifest" test provides the one-directional equivalent for `src/tools/data/tool-family-examples.json` (117 lines; only a curated subset of tools appear there, so this direction only fires if the deleted tool happens to be one of the curated examples).

### Anti-Patterns to Avoid
- **Trusting "CI is green" as proof C-01 holds:** `.github/workflows/ci.yml`'s `integration` job runs on `ubuntu-latest` with `AGDA_MCP_CI_QUARANTINE` excluding 5 files (fix-queue `fb57abbe7df6dfe8`, pre-existing Linux-lane platform deltas) — and **`test/integration/mcp/capture-regression.test.ts` is one of the five quarantined files**, which is exactly the file that runs the flagship `#64/#61` transitive-staleness regression lock. CI green does not prove C-01; only the LOCAL macOS+real-Agda gate does (`RUN_AGDA_INTEGRATION=1 npx vitest run`, no quarantine env set).
- **Treating "few or zero import-graph consumers" as "dead code":** `src/agda/import-graph.ts` was flagged by both `CONCERNS.md` and `12-CONTEXT.md` as "architecturally separate from the `.agdai` cache" and "a candidate for scope reassessment." Verified this session: it has 4 real, non-test consumers (`import-closure-hash.ts`, `agent-ux/import-tools.ts`, `agent-ux/project-tools.ts`, `impact-tool.ts`) backing 6 live tools (`agda_suggest_import`, `agda_find_clash_source`, `agda_project_progress`, `agda_bulk_status`, `agda_postulate_closure`, `agda_impact`) plus the capture/dedup pipeline. It is not dead; `CONCERNS.md`'s own fix-approach already says "no action needed unless a new staleness report surfaces." Don't re-litigate a documented, deliberate design decision without new evidence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Is this file/export referenced anywhere in `src/`+`scripts/`?" (broad reachability) | A custom AST-walking unused-export scanner | `npx knip` (one-shot, entry-configured) | Knip already solves cross-module reachability across `.ts`+`.mjs` in one tool; a bespoke walker would re-implement module resolution for zero benefit |
| "Does this tool name still exist in the manifest?" (narrow, semantic) | A generic doc-linter dependency | Extend `no-dead-tool-references.test.ts`'s existing pattern to also walk `docs/*.md` + `.agents/skills/*/SKILL.md` | This project's own established convention (no ESLint; small bespoke invariant tests) already does 90% of the work — the gap is *scope* (it currently only walks `src/`), not a missing tool |
| "Which tools does real usage actually exercise?" | A new logging/telemetry subsystem | Aggregate the JSON-RPC `tools/call` envelopes already recorded in `.agda-mcp/runs/*/transcript.jsonl` by `dogfood-run.mjs`'s existing recorder | The data already exists (21 local runs); a naive key-grep over-counts by conflating real invocations with `agda_tools_catalog`'s own catalog-listing dumps (see Common Pitfalls) — the fix is a 15-line JSON-RPC-aware script, not new instrumentation |
| "Is the tool-manifest/coverage-matrix/examples-file trio consistent after a deletion?" | A new cross-file consistency checker | `test/unit/tools/mcp-e2e-coverage.test.ts` + `test/unit/tools/tool-family-examples.test.ts` (already exist, already run on every `npm test`) | Confirmed this session: these already enforce exactly the invariant D-02's lockstep checklist worries about, for 2 of its 3 file types |
| "How much simpler did we make it?" (before/after metrics) | A metrics-tracking dependency or dashboard | `find <dir> -name '<ext>' \| wc -l` / `find <dir> -name '<ext>' -exec cat {} + \| wc -l` snapshots, committed as plain numbers in the health report | One-time comparison; this session's own baseline (below) was produced with zero dependencies in under a minute |

**Key insight:** This repo's own convention (documented in `CLAUDE.md`: no ESLint, invariant tests instead) is unusually well-suited to a simplification audit — the existing safety nets are narrow-but-real, not "we have no tooling." The audit's job is mostly to *identify the one real gap* (prose docs aren't machine-checked) and *extend* the existing pattern into it, not to bolt on a new generic framework.

## Deployment & Runtime Surface (cut-relevance map)

Not a standard template section, but load-bearing for sequencing back-half execution batches. This is not a rename/refactor/migration phase in the strict sense that triggers a formal Runtime State Inventory, but cutting pipeline code that is *also* the live-deployed runtime has a directly analogous hidden-state risk, so the equivalent check is included here.

| scripts/ subtree | Baked into deployed image? | Actually executed in production? | Cut requires watched redeploy (D-06/D-10 pattern)? |
|---|---|---|---|
| `scripts/dogfood/*` | Yes (`Dockerfile` line 96, `COPY --chown=2231:2231 . .` copies the whole repo) [VERIFIED: Dockerfile] | No — dev-machine-only recording proxy, never invoked by any k8s workload | **No** |
| `scripts/oracle/*` | Yes | Yes — `cron-ingest-wrapup.mjs` (team/) calls into `run-oracle.mjs` to judge uploaded captures | **Yes** |
| `scripts/queue/intake.mjs` | Yes | Yes — the only writer of the fix-queue SSOT; the cluster cron judge writes through it | **Yes** |
| `scripts/queue/{dashboard,mirror-github,priority,seed-initial-cargo}.mjs` | Yes | No — dev-machine-only (dashboard regeneration, optional GitHub mirror, one-off historical seed) | **No** |
| `scripts/team/*` | Yes | Yes — `ingest-server.mjs` (Deployment) and `cron-ingest-wrapup.mjs` (CronJob) are the two k8s workload entrypoints, per `STATE.md`'s Phase-08 decision log [CITED: .planning/STATE.md] | **Yes** |

**Practical consequence for sequencing:** batch cuts so `scripts/dogfood/*` and `scripts/queue/{dashboard,mirror-github,priority}.mjs` deletions (never executed on the cluster) can land in commits that do NOT need a watched redeploy, while any cut touching `scripts/oracle/`, `scripts/queue/intake.mjs`, or `scripts/team/` gets bundled into the smaller number of pushes that DO get the D-06/D-10 watch treatment — directly serving Claude's-Discretion "push cadence... batch local commits, minimal pushes."

## Common Pitfalls

### Pitfall 1: CI green is not proof of C-01
**What goes wrong:** Concluding a cut is safe because `.github/workflows/ci.yml` passed.
**Why it happens:** The CI `integration` job quarantines 5 files for pre-existing Linux/real-Agda platform deltas (fix-queue `fb57abbe7df6dfe8`) — and `test/integration/mcp/capture-regression.test.ts`, which carries the flagship `#64/#61` and `guard-no-metas-clean-load-under-fault-injection` regression locks, is one of them.
**How to avoid:** Run the LOCAL gate for every cut batch: `RUN_AGDA_INTEGRATION=1 npx vitest run` with `AGDA_MCP_CI_QUARANTINE` unset, on macOS with a real `agda` on `PATH` — exactly the command in `.agents/skills/upstream-sync/SKILL.md` Section 5 and `docs/LOAD-TERMINUS-ADJUDICATION.md`.
**Warning signs:** A plan step that says "CI passed, cut confirmed safe" without a separate local-gate run.

### Pitfall 2: The default shell's Node is not the project's Node
**What goes wrong:** Running `npm ci`/`vitest` under whatever `node` resolves first in `PATH`.
**Why it happens:** [VERIFIED this session] the default `node --version` in this environment resolves to v22.22.0, but `package.json#engines.node` is `>=24` and `.npmrc` sets `engine-strict=true` — an engine-strict `npm ci` under Node 22 fails outright, not just "might behave oddly."
**How to avoid:** `export PATH="/Users/eric/.local/share/mise/installs/node/24/bin:$PATH"` before any verification command — the exact prefix both `docs/LOAD-TERMINUS-ADJUDICATION.md`'s referee command and `.agents/skills/upstream-sync/SKILL.md`'s LOCAL gate already use.
**Warning signs:** `npm ci` failing with an engine-mismatch error, or vitest silently using a different Node than expected.

### Pitfall 3: Naive transcript-usage aggregation massively over-counts
**What goes wrong:** Grepping `.agda-mcp/runs/*/transcript.jsonl` for `"name":"agda_X"` to measure real tool usage.
**Why it happens:** [VERIFIED this session — see Code Examples] `agda_tools_catalog`'s own structured response embeds every registered tool's `name` field inside its listing payload; a naive grep can't distinguish "this tool was actually called" from "this tool's name appeared inside a catalog dump." The naive version reported ~54 of 74 tools at an identical, meaningless "~20" baseline; a JSON-RPC-envelope-aware pass (filtering `direction:"to-server"` + `method:"tools/call"`) found only 17 tools with any real invocation, totaling 72 real calls across 21 local runs.
**How to avoid:** Parse each transcript line's `raw` field as JSON, filter on `direction === "to-server"` and `parsed.method === "tools/call"`, and read `parsed.params.name` — never a flat string grep.
**Warning signs:** Every tool showing a suspiciously uniform usage count.

### Pitfall 4: `knip` (or any generic unused-export scanner) without an entry config will flag the entire `scripts/` pipeline as dead
**What goes wrong:** Running `npx knip` with zero configuration and treating "unused file" results at face value.
**Why it happens:** Nothing under `src/` imports `scripts/dogfood/dogfood-run.mjs`, `scripts/oracle/run-oracle.mjs`, etc. — they are CLI entry points invoked externally (`npx tsx scripts/dogfood/dogfood-run.mjs ...` per `.agents/skills/agda-dogfooding/SKILL.md`, or as a k8s workload command). A generic reachability scanner with no declared entry points will report every one of them as unreferenced.
**How to avoid:** Supply an explicit `entry` list (e.g. `src/index.ts`, every `scripts/{dogfood,oracle,queue,team}/*.mjs` file that has its own CLI `scriptMain`/argv-parsing block, and the test tree) before trusting any "unused" verdict about `scripts/`.
**Warning signs:** A knip report claiming 20+ files under `scripts/` are entirely unused — that is the false-positive signature, not a real finding.

### Pitfall 5: Regression locks live mostly as prose in `fix-queue.json`, not in the matrix file
**What goes wrong:** Treating `test/fixtures/capture-regression-matrix.json` (currently exactly **2** `locked` entries) as the complete C-01 untouchable-test inventory.
**Why it happens:** The matrix format only supports load-family ORCL-01 false-green candidates (per the fix-queue's own notes: "emit-regression/judgeRefusal + replayCaptureRegressionEntry support only load-family ORCL-01 false-green candidates"). Every non-load-family fix (agda_give, agda_auto, agda_search_definitions, agda_proof_status, the RT2/RT3 expression-operations fixes, RT8) is regression-locked as one or more **individually named vitest `test()` cases**, documented only inside `fix-queue.json`'s free-text `notes` field, using inconsistent phrasing ("Regression lock:" in 8 entries, "Regression evidence:" in at least one — `0bc76d15c2fec8df`).
**How to avoid:** Build the untouchable-test inventory by reading every `locked`/`triaged` fix-queue entry's `notes` field in full (see Code Examples for an extraction script covering the "Regression lock:" phrasing — extend the pattern to also catch "Regression evidence:" and read entries the pattern misses by hand), not by grepping the matrix file alone.
**Warning signs:** A cut-list item whose "what it breaks" column only checked the matrix file.

### Pitfall 6: Low-usage is not the same signal as low-security-value
**What goes wrong:** Applying a "few callers → cut candidate" heuristic uniformly across the codebase.
**Why it happens:** Security-load-bearing modules are deliberately narrow and rarely change: `src/session/safe-source-io.ts`'s `O_NOFOLLOW` symlink guard + `MAX_AGDA_SOURCE_BYTES` cap, `scripts/team/archive-extract.mjs`'s intentionally-layered (not single-guard) tar-extraction defense, `scripts/team/issue-key.mjs`'s `timingSafeEqual` Bearer-key comparison, and `src/protocol/responses/proof-actions.ts`'s two-sided rejection-detection SSOT all have few callers by design, not by neglect.
**How to avoid:** Cross-reference any "low usage" candidate against the Security Domain section below before adding it to the cut list.
**Warning signs:** A cut-list item in `src/session/`, `src/repo-root.ts`, or `scripts/team/` whose justification is purely "low reference count."

## Code Examples

### Real tool-usage aggregation (JSON-RPC-envelope-aware, not a flat grep)
```python
# Source: this research session, run live against .agda-mcp/runs/**/transcript.jsonl
# (21 local run directories present at research time). Result: 72 real tools/call
# invocations, 17 distinct tools actually invoked, agda_load (29) and
# agda_capture_session (11) dominating — the rest of the manifest shows zero
# recorded LOCAL invocation. Extend this same script against any team-channel
# archive the audit can access for a larger, less RT-probe-biased sample before
# treating "zero local usage" as a strong redundancy signal on its own.
import json, glob, collections

counts = collections.Counter()
for fp in glob.glob(".agda-mcp/runs/**/transcript.jsonl", recursive=True):
    for line in open(fp):
        try:
            rec = json.loads(line)
            if rec.get("direction") != "to-server":
                continue
            raw = json.loads(rec["raw"])
            if raw.get("method") == "tools/call":
                counts[raw["params"]["name"]] += 1
        except (json.JSONDecodeError, KeyError):
            continue
print(counts.most_common())
```

### Regression-lock extraction from fix-queue.json prose
```python
# Source: this research session. Extend the regex to also match
# "Regression evidence:" (seen in fingerprint 0bc76d15c2fec8df) — this
# pattern-based extraction is a starting heuristic, not exhaustive; a full
# read of every locked/triaged entry remains the only reliable method.
import json, re
data = json.load(open("test/fixtures/fix-queue.json"))
for entry in data:
    m = re.search(r"Regression (?:lock|evidence):(.*?)(?:\. Mechanism:|$)",
                   entry.get("notes", ""), re.S)
    if m:
        print(entry["fingerprint"], "->", [t.strip() for t in m.group(1).split(";") if t.strip()])
```

### Baseline metrics snapshot (before/after "measurably simpler" evidence)
```bash
# Source: this research session, run 2026-07-06 against the current working tree.
# Re-run identically after the back-half executes to produce the health report's
# before/after diff.
find src -name "*.ts" | wc -l                 # 150 files
find src -name "*.ts" -exec cat {} + | wc -l  # 23,813 LOC
find scripts -name "*.mjs" | wc -l            # 32 files
find scripts -name "*.mjs" -exec cat {} + | wc -l  # 9,891 LOC
find test -name "*.ts" | wc -l                # 256 files
grep -c "name: \"agda_" src/tools/**/*.ts src/session/{load,process}-tool-registration.ts 2>/dev/null
# 74 total registered MCP tools (cross-verified against
# test/fixtures/e2e/mcp-tool-coverage.json's 74-entry SSOT — see Pitfall/Pattern 2)
```

### LOCAL full verification gate (C-01's actual referee, not CI)
```bash
# Source: .agents/skills/upstream-sync/SKILL.md Section 5 (LOCAL gate),
# reused verbatim by docs/LOAD-TERMINUS-ADJUDICATION.md's referee command.
export PATH="/Users/eric/.local/share/mise/installs/node/24/bin:$PATH"
npm ci
npm run build
npx tsc -p tsconfig.test.json --noEmit
RUN_AGDA_INTEGRATION=1 npx vitest run
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ts-prune` for TS unused-export detection | `knip` (unused files + exports + dependencies + multi-language in one tool) | `ts-prune` last published 2022-05-22 [VERIFIED: npm registry]; `knip` actively released through 2026-07-02 [VERIFIED: npm registry] | If the audit reaches for a generic scanner at all, `knip` is the current-generation choice, not the one a stale training snapshot would name first |
| Hand-maintained tool catalogs in README | README defers to the live `agda_tools_catalog` MCP tool ("always in sync with the running server, unlike a hand-maintained doc") | Already done — `README.md` was rewritten 2026-07-05 (quick task `260705-gn0`, 615→104 lines) [CITED: README.md, .planning/STATE.md] | Meaningfully de-risks D-02: README's tool-doc lockstep burden is already small (only ~10 illustrative tool names appear in prose) |
| Milestone-end retrospective code review as the only debt-capture mechanism | A tracked, structured fix-queue (`test/fixtures/fix-queue.json`) with fingerprints, status, and named regression-lock tests | Established v1.0 (Phase 4), used continuously since | This phase should feed its cut-list *into* the same tracked artifacts/vocabulary rather than inventing a parallel one-off report format |

**Deprecated/outdated:**
- `scripts/verify-cold-replay.mjs` and `scripts/promote-capture.mjs`: both previously flagged in the v1.0 milestone audit as orphaned/superseded — **confirmed deleted already** (Phase 9, "Residual v1.0 Debt Sweep"). Do not re-flag.
- `src/session/load-terminus-tracker.ts`: the pre-Phase-10 load-terminus heuristic — **confirmed deleted** as part of Phase 10's adjudicated merge (`docs/LOAD-TERMINUS-ADJUDICATION.md`). Do not re-flag.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `knip` is the current best-in-class unused-export/file/dependency detector for this repo's mixed TS+`.mjs` shape (package identity via WebSearch, not Context7) | Standard Stack, Package Legitimacy Audit | Low — it is optional/supplementary/one-shot; slopcheck `[OK]` plus directly-verified registry recency (2026-07-02) independently support it even if a better alternative exists |
| A2 | `ts-prune` is community-superseded by `knip` (a WebSearch-summarized claim, not an official deprecation notice) | Standard Stack alternatives | Low — the underlying, independently-verified fact (last published 2022-05-22) supports "don't use this" regardless of whether "superseded by knip" specifically is the right frame |
| A3 | `dependency-cruiser`/`madge` would be overkill for this repo's dependency-graph complexity | Standard Stack alternatives | Low-Medium — this is my own judgment call from reading `ARCHITECTURE.md`'s "no circular imports documented" claim, not from actually running either tool against the repo; if the audit's manual sweep does surface a suspected cycle, this assumption should be revisited immediately, not defended |
| A4 | The 74-tool count and the specific file-size/LOC baselines are frozen at this research session's commit (working tree at `bcecafd` + uncommitted `.planning/config.json` changes) | Summary, Code Examples baseline | Low — re-running the one-line count commands takes seconds; the plan should re-snapshot at execution start rather than trusting this document's numbers as permanently current |
| A5 | The 21 local dogfooding transcripts are a representative-enough sample to inform (not decide) tool-redundancy candidates | Common Pitfalls, Code Examples | Medium — the sample is real but small and skewed toward RT1–RT8 narrow regression probes plus a few acceptance sessions; team-channel-archived sessions (on the JHU cluster PVC, not locally accessible from here) are NOT included, so "zero local usage" must be treated as one weak input among several, never a sole deletion criterion |

**If this table is empty:** N/A — see rows above.

## Open Questions (RESOLVED)

All three are resolved via their Recommendation fields below; each maps to a specific plan that implements it (Q1 → 12-03 Task 1's weak-input treatment; Q2 → 12-02's informational-note handling; Q3 → 12-02/audit front-half categorization). None blocks planning.

1. **Can the audit access team-channel-uploaded session archives for a larger usage-evidence sample?**
   - What we know: `.agda-mcp/team/storage/<person>/<date>/*.tar.gz` exists on the live JHU cluster PVC (per `.planning/milestones/v1.1-MILESTONE-AUDIT.md`'s live evidence); 21 local runs exist on this machine.
   - What's unclear: whether pulling those archives (e.g. via `kubectl cp` or the existing `cron-ingest-wrapup.mjs --no-push` path) is in scope for this phase, or whether the local sample is accepted as "good enough, weakly weighted" input.
   - RESOLVED: default to the local sample as one input among several (see Pitfall 3/A5); only reach for the cluster archives if the audit's per-tool-usage question becomes load-bearing for an actual deletion decision, not just informational. (Implemented by Plan 12-03: usage evidence is one weak input, never a sole deletion criterion.)

2. **Should `.claude/skills/agda-mcp-k8s-deploy` be promoted into the tracked `.agents/skills/` directory, or left as local/personal scratch?**
   - What we know: unlike `agda-dogfooding` and `upstream-sync` (both tracked under `.agents/skills/`, symlinked into the gitignored `.claude/skills/`), `agda-mcp-k8s-deploy` (208 lines) exists ONLY under the gitignored `.claude/skills/` — it is not part of the git-tracked repository at all, and neither are its adjacent workspace artifacts (`.claude/skills/agda-mcp-k8s-deploy-workspace/{viewer.log,iteration-1,contaminated-baselines}`).
   - What's unclear: whether this is intentional (a personal, still-being-iterated skill) or an oversight (a skill that should have been promoted like the other two).
   - RESOLVED: out of this phase's cut-list scope either way (git can't "cut" what it never tracked) — flag it as a one-line note in the health report, not a cut-list item, and let the user decide promotion vs. leave-as-is separately. (Handled by Plan 12-02 as an informational note.)

3. **Do the "Nyquist VALIDATION.md missing" gaps (Phases 6–9, both milestone audits) belong on this phase's cut list?**
   - What we know: both audits list `VALIDATION.md missing` as tracked tech debt for 4+ phases each; `.planning/` itself is explicitly in D-01's cutting scope ("planning residue").
   - What's unclear: whether "missing planning artifact" is a simplification target (drop the workflow's expectation) or a completeness gap (backfill it) — these are opposite directions, and C-05 says the audit, not this research, decides which.
   - RESOLVED: flag for the audit's own front-half categorization; do not pre-judge the direction here. (Routed to Plan 12-02's audit categorization per C-05.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 24 | `engine-strict` npm operations, the full verification gate | Partial — mise-managed install present, default shell PATH resolves to v22.22.0 [VERIFIED this session] | 24.x via `/Users/eric/.local/share/mise/installs/node/24/bin` | Always `export PATH=".../node/24/bin:$PATH"` first (see Pitfall 2) — no other fallback needed, this is a solved problem in the existing skills |
| `agda` binary | The local full-suite gate (`RUN_AGDA_INTEGRATION=1`), any real-Agda validation of a cut | Yes | 2.8.0 [VERIFIED this session, `agda --version`] — within `[minAgdaVersion 2.6.4.3, maxTestedAgdaVersion 2.9.0]` | — |
| `gh` CLI | Watching a redeploy for deploy-relevant cuts (D-06/D-10 pattern) | Yes | 2.96.0 [VERIFIED this session] | — |
| `git` | All version control operations | Yes | 2.49.0 [VERIFIED this session] | — |
| `slopcheck` (Python) | Package legitimacy gate, if any new one-shot tool is proposed | Yes (installed this session) | 0.6.1 [VERIFIED this session] | If unavailable in the execution environment, tag any newly-proposed package `[ASSUMED]` and gate behind `checkpoint:human-verify` |
| `npx knip` (optional) | Supplementary dead-file/export cross-check | Resolvable (registry-confirmed, not locally cached) | 6.24.0 | Skip entirely — the manual/grep methodology above is sufficient on its own at this repo's size; knip is supplementary, not required |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Node 24 on default `PATH` (fallback: explicit mise path export, already the established convention).

## Validation Architecture

No `REQ-ID`s are mapped to this phase (ROADMAP.md: "Requirements: TBD") — the standard requirement-to-test table below is adapted to map this phase's actual CONTEXT.md-defined success criteria and cut *categories* to their validation method, since that is the equivalent structure that exists here.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (`test/{examples,unit,property,integration}/**/*.test.ts`; `AGDA_MCP_CI_QUARANTINE` env-gated exclusion for CI only) |
| Quick run command | `npx vitest run <specific-file-or-dir>` (fast, no live Agda, seconds) |
| Full suite command | `RUN_AGDA_INTEGRATION=1 npx vitest run` (real Agda subprocess required, ~minutes; this is C-01's actual referee) |

### Cut Category → Validation Map
| Cut Category | Validation Method | Automated Command | Extra Step |
|---|---|---|---|
| `scripts/{dogfood,oracle,queue,team}/*.mjs` deletion | That script's own `test/unit/tools/<prefix>-*.test.ts` files must be deleted in the same commit (not left orphaned, referencing a deleted import) | `npx vitest run test/unit/tools/<prefix>-<name>.test.ts` (should fail-to-collect / error if the script is gone but the test isn't deleted) | If the script is deploy-relevant (see Deployment & Runtime Surface), a watched redeploy after the push |
| `docs/*.md` / `README.md` / `.agents/skills/*/SKILL.md` edits or deletions | **No automated check exists today** — `no-dead-tool-references.test.ts` only scans `src/`. Manual read-through required. | none (documented gap — see Don't Hand-Roll for the low-cost fix) | Manual cross-check against `src/tools/manifest.ts`'s current tool list |
| `src/tools/*` MCP tool deletion (D-02) | `mcp-e2e-coverage.test.ts` (manifest ↔ coverage-matrix set equality) + `tool-family-examples.test.ts` (examples → manifest one-directional) both already enforce this mechanically | `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts test/unit/tools/tool-family-examples.test.ts` | Manual doc pass for `README.md`/`docs/assistant-workflows.md` per the gap above |
| `src/` low-risk subtraction (dead code, duplicate impls, unused exports) | Full local suite green (C-01); `typecheck:test` for dangling-import detection | `RUN_AGDA_INTEGRATION=1 npx vitest run && npx tsc -p tsconfig.test.json --noEmit` | If the file touches an upstream-conflict-surface path (C-03), confirm the deletion converges toward upstream rather than diverging further |
| Regression-lock test files (C-01 untouchable) | **Must never be a cut target.** Grep `fix-queue.json` for "Regression lock:"/"Regression evidence:" (Pitfall 5) plus the 2 `capture-regression-matrix.json` entries to build the exclusion list before touching any `test/` file | `python3` extraction script in Code Examples | — |

### Sampling Rate
- **Per cut (single file/small batch):** targeted `npx vitest run <affected test files>` + `npx tsc -p tsconfig.test.json --noEmit`.
- **Per approved-category batch (e.g. "all of `scripts/dogfood/` cuts"):** full local gate, `RUN_AGDA_INTEGRATION=1 npx vitest run`.
- **Phase gate:** full local suite green one final time + (if any deploy-relevant cut landed) a watched redeploy to green `/healthz`, before the health report's before/after metrics are finalized.

### Wave 0 Gaps
- [ ] No automated doc-reference check for `docs/*.md`/`README.md`/`.agents/skills/*/SKILL.md` against the live manifest — extend `no-dead-tool-references.test.ts`'s pattern (or add a sibling test) if the planner wants this gap closed durably; optional, not required to execute the phase safely (manual review is a viable substitute for a one-time audit).
- [ ] No committed "baseline metrics" snapshot exists yet — the front-half plan should capture the Code Examples baseline numbers into the health report before any cut lands, so the back-half has something concrete to diff against.

*(No gaps block starting the phase — both items above are enhancements, not prerequisites.)*

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, which per policy means enabled. This phase adds no new input surface, so the ASVS lens here is inverted from the usual "what controls does the new feature need" — it is "which existing controls must survive a cut."

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No new surface | `scripts/team/issue-key.mjs`'s Bearer-key issuance/verification is out of this phase's normal cutting path — do not modify under a "simplify" pretense |
| V3 Session Management | N/A | `AgdaSession` is a process-lifecycle concept, not an ASVS web session |
| V4 Access Control | Yes (preserve, don't add) | `src/repo-root.ts`'s `PathSandboxError` + `resolveFileWithinRoot`; `scripts/team/ingest-server.mjs`'s Bearer-auth gate |
| V5 Input Validation | Yes (preserve) | Zod schemas across all 74 tools; `src/protocol/command-line-options.ts`'s blocklist; `assertValidAutoHint()` (the RT4/RT5 fix) in `refactor-helpers.ts` |
| V6 Cryptography | Yes (preserve, never hand-roll changes) | `scripts/team/issue-key.mjs` (`randomBytes`/`timingSafeEqual`), `src/reporting/bug-report.ts` (`createHash` fingerprinting) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation (must survive any cut) |
|---------|--------|----------------------------------------------|
| Path traversal via a user-supplied file path | Tampering | `src/repo-root.ts` sandbox boundary; `scripts/team/archive-extract.mjs`'s explicitly-layered (pre-list rejection + bounded/polled extraction + post-extraction realpath containment) defense — do not collapse this into a single guard, it is layered on purpose |
| Symlink TOCTOU on proof-edit file I/O | Tampering | `src/session/safe-source-io.ts`'s `O_NOFOLLOW` read guard + atomic temp-file+rename write |
| CLI-flag/command injection into the Agsy search payload | Tampering | `assertValidAutoHint()` (already regression-locked, fingerprints `5abecc959e43fef3`/`004d161b839ce725`) — any refactor of `refactor-helpers.ts` must keep this boundary check intact |
| Bearer-key timing attack | Information Disclosure | `timingSafeEqual` comparison in `scripts/team/issue-key.mjs` |
| Zip-slip / decompression bomb on an uploaded archive | Denial of Service | `scripts/team/archive-extract.mjs`'s two-layer sandboxed extraction + `ingest-server.mjs`'s streamed size cap |

## Sources

### Primary (HIGH confidence — direct measurement against this repo, 2026-07-06)
- `ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONCERNS.md` — layering, directory purposes, 2026-07-04 known-debt snapshot (re-verified, not just cited)
- `test/fixtures/fix-queue.json`, `test/fixtures/capture-regression-matrix.json` — defect/regression-lock ledger, read in full and cross-referenced against current source
- `src/tools/manifest.ts`, `src/tools/register-core-tools.ts`, `src/tools/session.ts`, `src/session/{load,process}-tool-registration.ts` — tool registration surface, 74-tool count derived and cross-verified two independent ways
- `test/fixtures/e2e/mcp-tool-coverage.json`, `test/unit/tools/mcp-e2e-coverage.test.ts`, `test/unit/tools/tool-family-examples.test.ts`, `test/unit/tools/no-dead-tool-references.test.ts` — existing mechanical safety-net inventory
- `.agda-mcp/runs/*/transcript.jsonl` (21 local runs) — real tool-usage evidence, aggregated live this session
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`, `.planning/milestones/v1.1-MILESTONE-AUDIT.md` — prior tech-debt ledgers, cross-checked against current tree (2 items confirmed already resolved)
- `.agents/skills/upstream-sync/SKILL.md`, `.agents/skills/agda-dogfooding/SKILL.md`, `docs/LOAD-TERMINUS-ADJUDICATION.md`, `.planning/phases/10-upstream-reconcile/10-CONTEXT.md` — canonical operational/constraint references
- `Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/deploy-ingest.yml`, `package.json`, `vitest.config.ts`, `.gitignore` — build/CI/deploy surface
- npm registry (`npm view`, `api.npmjs.org/downloads`) — live version/age/download queries for `knip`/`ts-prune`/`dependency-cruiser`/`madge`
- `slopcheck` 0.6.1 (installed and run live this session) — package legitimacy scan for all 4 candidate audit tools

### Secondary (MEDIUM confidence)
- WebSearch: "knip unused exports dead code detection TypeScript ESM .mjs scripts support" — package capability claims, cross-verified against the live npm registry entry (version/publish date) but package *identity* remains `[ASSUMED]` per provenance rule

### Tertiary (LOW confidence)
- None retained — every claim in this document was either directly verified against the repository/registry this session or explicitly tagged `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Repo-state facts (tool count, file sizes, test inventory, deploy wiring): HIGH — directly measured, several cross-verified two independent ways
- Audit methodology recommendation (seed-from-known-debt, extend existing invariant-test pattern, one-shot `npx knip` as supplement): HIGH — grounded in what already exists and already works in this repo, not external best practice
- Audit-tooling package identity (`knip` et al.): MEDIUM (`[ASSUMED]` per provenance rule, despite registry+slopcheck confirmation) — low practical risk since usage is optional/one-shot/supplementary
- Real-usage-evidence interpretation (17-of-74 tools with local invocation): MEDIUM — sound method, small/biased sample; explicitly flagged as one weak input, not a deletion criterion on its own

**Research date:** 2026-07-06
**Valid until:** Short — this document's numeric baselines (tool count, file sizes, fix-queue state) are a point-in-time snapshot of a fast-moving, self-editing repository. Re-run the Code Examples baseline commands at plan/execution time rather than trusting the numbers here beyond ~7 days or the next merged commit, whichever comes first.
