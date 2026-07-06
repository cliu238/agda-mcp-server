---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
plan: 03
audited: 2026-07-06T02:47:02Z
subsystem: mcp-tool-surface
status: candidates-drafted
scope: read-only audit; no file under src/, docs/, or test/ modified by this plan
requirements: [D-02, C-02, C-05]
---

# Phase 12 Plan 03: MCP Tool Surface Audit — Real Usage Evidence + D-02 Cut-List Candidates

## Purpose

D-02 allows direct, one-pass deletion of redundant MCP tools (no deprecation
period). C-05 requires that the concrete cut targets come from an audit, not
a guess. This document builds the real per-tool usage-evidence table
RESEARCH.md's JSON-RPC-aware method produces, then — only after applying the
C-02 (Loop② stage-entry) and Security Domain cross-checks *first* — drafts
D-02 cut-list candidate rows with a fully pre-mapped six-step deletion
lockstep checklist, so Plan 12-09's execution work is a checklist walk, not a
re-derivation.

**Severity scale** (no repo-wide convention exists — 12-PATTERNS.md "No
Analog Found" — defined once here, matching Plan 12-01's scale for
consistency across this phase's audit docs):
- **Critical:** actively broken or a live security/correctness gap.
- **High:** confirmed redundancy or dead-end guidance that will mislead an
  agent or a maintainer today.
- **Medium:** confirmed redundancy with limited/contained blast radius, or
  correct today but a latent divergence risk.
- **Low:** genuine but low-stakes duplication (code or tool-surface), no
  correctness/security implication.

---

## Task 1: Real Usage Evidence

### Method

Per this plan's `read_first`, the aggregation script is copied verbatim from
12-RESEARCH.md's Code Examples section ("Real tool-usage aggregation
(JSON-RPC-envelope-aware, not a flat grep)") — filtering on
`direction == "to-server"` and `parsed.method == "tools/call"`, reading
`parsed.params.name`. No simplified grep-based substitute was written (per
RESEARCH.md Pitfall 3: a naive string grep over-counts by ~3x because
`agda_tools_catalog`'s own response payload embeds every tool name inside its
catalog listing).

**Worktree note:** this plan executes inside an isolated git worktree.
`.agda-mcp/runs/` is gitignored and therefore absent from the worktree
checkout, but it lives on the same filesystem in the main checkout at
`/Users/eric/projects6/agda-mcp-server/.agda-mcp/runs/`. The aggregation
script's glob pattern was pointed at that absolute path rather than a
worktree-relative one; every other read (manifest, coverage matrix, tool
source) used the worktree's own checked-out files. No transcript content
was fabricated or estimated — every count below is a live re-run against
the transcripts present at execution time.

**Re-glob result at execution time (2026-07-06):** 21 run directories under
`.agda-mcp/runs/`, each with a `transcript.jsonl` — the same count
RESEARCH.md recorded at research time (no new runs landed since). Re-running
the aggregation script verbatim reproduced RESEARCH.md's own numbers exactly:
**72 total `tools/call` invocations, 17 distinct tools with any recorded
invocation, `agda_load` (29) and `agda_capture_session` (11) dominating.**

Tool categories were cross-referenced by booting the live manifest the same
way `test/unit/tools/mcp-e2e-coverage.test.ts` does (`AgdaSession` +
`registerCoreTools()` + `listToolManifest()`, no live Agda process spawned —
construction alone never spawns the subprocess). `requiresLiveAgda` /
`requiresBackend` came from `test/fixtures/e2e/mcp-tool-coverage.json`. Both
sources report exactly 74 tool names, and both sets are identical
(zero tools in one but not the other) — matching `mcp-e2e-coverage.test.ts`'s
own bidirectional-equality assertion.

### Real Usage Evidence Table (74 rows)

| Tool | Category | Real Invocation Count | requiresLiveAgda | requiresBackend |
|---|---|---|---|---|
| `agda_abort` | process | 0 | true | false |
| `agda_add_missing_clauses` | proof | 0 | false | false |
| `agda_apply_edit` | session | 1 | false | false |
| `agda_apply_rename` | navigation | 0 | false | false |
| `agda_auto` | proof | 2 | true | false |
| `agda_auto_all` | proof | 0 | true | false |
| `agda_backend_hole` | backend | 0 | true | true |
| `agda_backend_top` | backend | 0 | true | true |
| `agda_bug_report_bundle` | reporting | 0 | true | false |
| `agda_bug_report_update_bundle` | reporting | 0 | true | false |
| `agda_builtin_migration_map` | reporting | 0 | false | false |
| `agda_bulk_status` | analysis | 0 | false | false |
| `agda_cache_info` | navigation | 0 | false | false |
| `agda_capture_session` | reporting | 11 | false | false |
| `agda_case_split` | proof | 3 | true | false |
| `agda_check_postulates` | navigation | 0 | false | false |
| `agda_compile` | backend | 0 | true | true |
| `agda_compute` | proof | 1 | true | false |
| `agda_constraints` | proof | 0 | true | false |
| `agda_context` | proof | 0 | true | false |
| `agda_effective_options` | analysis | 0 | false | false |
| `agda_elaborate` | proof | 0 | true | false |
| `agda_exit` | process | 0 | true | false |
| `agda_find_clash_source` | analysis | 0 | false | false |
| `agda_give` | proof | 3 | true | false |
| `agda_goal` | proof | 0 | true | false |
| `agda_goal_analysis` | analysis | 0 | true | false |
| `agda_goal_candidates` | proof | 2 | false | false |
| `agda_goal_catalog` | proof | 1 | false | false |
| `agda_goal_type` | proof | 4 | true | false |
| `agda_goal_type_context_check` | proof | 4 | true | false |
| `agda_goal_type_context_infer` | proof | 0 | true | false |
| `agda_helper_function` | proof | 0 | true | false |
| `agda_highlight` | highlighting | 0 | true | false |
| `agda_impact` | navigation | 0 | false | false |
| `agda_infer` | proof | 1 | true | false |
| `agda_infer_fixity_conflicts` | analysis | 0 | false | false |
| `agda_intro` | proof | 0 | true | false |
| `agda_list_modules` | navigation | 0 | false | false |
| `agda_load` | session | 29 | true | false |
| `agda_load_highlighting_info` | highlighting | 0 | true | false |
| `agda_load_no_metas` | session | 2 | true | false |
| `agda_metas` | proof | 0 | true | false |
| `agda_postulate_closure` | analysis | 0 | false | false |
| `agda_project_config` | analysis | 2 | false | false |
| `agda_project_progress` | analysis | 0 | false | false |
| `agda_proof_status` | analysis | 2 | true | false |
| `agda_protocol_parity` | reporting | 0 | false | false |
| `agda_read_module` | navigation | 0 | false | false |
| `agda_refine` | proof | 0 | true | false |
| `agda_refine_exact` | proof | 0 | true | false |
| `agda_reload` | analysis | 0 | true | false |
| `agda_search_about` | navigation | 0 | true | false |
| `agda_search_definitions` | navigation | 0 | false | false |
| `agda_session_snapshot` | reporting | 0 | false | false |
| `agda_session_status` | session | 0 | true | false |
| `agda_show_implicit_args` | process | 0 | true | false |
| `agda_show_irrelevant_args` | process | 0 | true | false |
| `agda_show_module` | navigation | 0 | true | false |
| `agda_show_version` | process | 0 | true | false |
| `agda_solve_all` | proof | 0 | true | false |
| `agda_solve_one` | proof | 0 | true | false |
| `agda_stdlib_migration_map` | reporting | 0 | false | false |
| `agda_suggest_import` | navigation | 0 | false | false |
| `agda_term_search` | analysis | 2 | true | false |
| `agda_toggle_implicit_args` | process | 0 | true | false |
| `agda_toggle_irrelevant_args` | process | 0 | true | false |
| `agda_token_highlighting` | highlighting | 0 | true | false |
| `agda_tool_recommend` | reporting | 0 | false | false |
| `agda_tools_catalog` | reporting | 0 | false | false |
| `agda_triage_error` | analysis | 0 | false | false |
| `agda_typecheck` | session | 2 | true | false |
| `agda_verify_builtin` | analysis | 0 | false | false |
| `agda_why_in_scope` | navigation | 0 | true | false |

**Row count check:** 74 rows, matching `test/fixtures/e2e/mcp-tool-coverage.json`'s 74 entries exactly (cross-verified: zero names in the manifest but not the matrix, zero in the matrix but not the manifest).

**Category rollup:** proof 23, analysis 13, navigation 11, reporting 9, process 7, session 5, backend 3, highlighting 3 (sums to 74).

### Reliability Disclaimer

This evidence is one weak input among several inputs to any tool-deletion
decision, and it must never be treated as a sole deletion criterion. The 21
local run directories are real, measured invocations — not estimated or
fabricated — but the sample is small and skewed toward RT1–RT8 narrow
regression probes plus a handful of acceptance sessions; it does not include
any team-channel-uploaded session archive (those live on the JHU cluster
PVC, not locally accessible from this worktree). A tool showing zero
recorded local invocations may simply be a legitimate, low-frequency, or
specialized capability (e.g. the three `backend`-category tools all require
a configured compiler backend, a setup none of the local runs happened to
exercise) rather than evidence that no one needs it. Every zero-usage tool
considered below for cut-list inclusion was additionally cross-checked
against the Loop②-stage-entry and Security Domain criteria before being
treated as a genuine candidate — usage count alone never triggered inclusion
by itself in Task 2 below.

---

## Task 2: Redundancy Analysis, Loop②/Security Cross-Checks, Cut-List Candidates

### Method

Order of operations, applied to every candidate before it could reach the
Cut-List Candidates section: (1) C-02 Loop②-stage-entry check first — a
stage entry point is excluded outright, never listed as a candidate; (2)
Security Domain / Known Threat Pattern cross-check for any zero-usage
candidate; (3) only then, genuine overlapping-purpose / mis-selection-risk
candidates were drafted with a fully pre-filled six-step lockstep checklist.
Candidates were sought via close reading of tool descriptions, protocol
commands, and — where two tools looked similar — the actual source
implementation (not description text alone), grouped by manifest category
(`session` 5, `proof` 23, `navigation` 11, `process` 7, `highlighting` 3,
`backend` 3, `analysis` 13, `reporting` 9).

### Excluded-as-Loop2-Stage-Entry

Loop② = use → capture → judge → file → fix → lock (C-02: the loop's stages
are not cuttable; only their implementation may be simplified).

| Tool | Stage | Why it is the stage's primary MCP interface |
|---|---|---|
| `agda_capture_session` | capture | The sole MCP tool that stages a full-fidelity `CaptureArtifact` (replay manifest + recorded action log + oracle substrate) into `.agda-mcp/captures/` for `scripts/dogfood/dogfood-wrapup.mjs` to later judge. `.agents/skills/agda-dogfooding/SKILL.md` names it explicitly as *the* capture verb (Section 3, "Call `agda_capture_session`... whenever"). 11 real local invocations — the second-most-used tool in the sample. Excluded outright; never a cut candidate regardless of any redundancy signal. |

**Why no other stage got an exclusion row:** the *judge* (`scripts/oracle/*`),
*file* (`scripts/queue/intake.mjs`), and *lock* (a `test()` case + fix-queue
entry) stages are each implemented entirely in `scripts/`/`test/` — outside
the 74-tool MCP surface — so no MCP tool is any of their primary interface;
there is nothing here for this cross-check to name. The *use* stage (the
agent actually proving theorems) is served by the broad, redundantly-covered
proof/goal/expression tool surface (23 `proof`-category tools alone) with no
single point of failure — deleting any one proof tool does not remove the
"use" stage, since many overlapping-capability tools remain. Accordingly
"use" has no single stage-entry tool to exclude, unlike the narrow,
single-tool "capture" stage.

### Security Domain Cross-Check

RESEARCH.md's Security Domain section (Applicable ASVS Categories + Known
Threat Patterns tables) was checked row-by-row against every zero-usage
tool under consideration below.

**One candidate facially matched a Security Domain row and was investigated
in full rather than reflexively excluded or reflexively kept:**
`agda_bug_report_bundle` / `agda_bug_report_update_bundle` are the only
callers of `buildBugReportBundle` (`src/reporting/bug-report.ts`), and
RESEARCH.md's V6 Cryptography row names that exact file
("`src/reporting/bug-report.ts` (`createHash` fingerprinting)") as a control
to preserve. Tracing the import graph: `bug-report.ts`'s
`fingerprintBugReport()` (the function that actually calls
`createHash("sha256")`) is **also** re-exported verbatim by
`src/agda/session-capture/dedup-index.ts` ("Reuses `fingerprintBugReport()`
verbatim from bug-report.ts") and consumed by `agda_capture_session` — the
confirmed capture-stage entry point excluded above — for its own dedup
routing. Deleting `agda_bug_report_bundle`/`_update_bundle` removes only
`buildBugReportBundle`/`defaultBugTitle` (pure data-shaping helpers with no
cryptographic content of their own) and their two thin tool wrappers; the
named V6 control (`fingerprintBugReport`'s `createHash` call) continues to
be exercised by the surviving capture pipeline regardless. **Verdict: not
excluded on security grounds** — the specific control the row names survives
the cut. This reasoning, and the candidate itself, are recorded in full
under Cut-List Candidates below rather than silently pre-deciding either way.

No other zero-usage tool matched a Security Domain ASVS row or Known Threat
Pattern row by name:
- `agda_apply_edit` (the tool that *does* touch `safe-source-io.ts`'s
  `O_NOFOLLOW`/atomic-write guard, a real V4/Tampering-relevant control) has
  1 real recorded invocation — not a zero-usage candidate in the first
  place, and it is the sole text-substitution editor tool with no
  overlapping-purpose sibling.
- `agda_auto_all` (zero usage) does **not** call `buildAutoSearchPayload`/
  `assertValidAutoHint` (the CLI-flag-injection guard named under Known
  Threat Patterns) at all — verified via source read: its `inputSchema` is
  empty (`{}`) and its callback calls `session.query.autoAll()` directly
  with no hint/payload construction. Only `agda_auto`'s "agsy" engine path
  touches that guard, and `agda_auto` has 2 real invocations. No match.
- `agda_effective_options` (zero usage) only *reports* which options would
  apply (pragma/`.agda-lib`/`.agda-mcp.json` provenance); it does not itself
  invoke `command-line-options.ts`'s blocklist validator (that runs at
  actual command-construction time inside `agda_load`/`agda_typecheck`, not
  here). No match.
- No zero-usage tool touches `scripts/team/issue-key.mjs`'s Bearer-key
  verification, `scripts/team/archive-extract.mjs`'s extraction defense, or
  `scripts/team/ingest-server.mjs`'s auth gate — none of those live behind
  any of the 74 MCP tools; they are exclusively `scripts/team/` surface.

### Excluded-on-Security-Grounds

No zero-usage MCP tool is excluded on security grounds. The one candidate
that facially matched a Security Domain row
(`agda_bug_report_bundle`/`_update_bundle` vs. V6 Cryptography's
`bug-report.ts` citation) was investigated to the level of tracing the
actual shared function, confirmed that the specific control survives the
cut via `agda/session-capture/dedup-index.ts`'s independent re-export
consumed by the surviving `agda_capture_session`, and is therefore listed as
a genuine Cut-List Candidate below (with this reasoning attached to its row)
rather than excluded here. This is an intentionally empty section, stated
explicitly per this plan's requirement that zero rows must be an explicit,
reasoned outcome, not a silent omission.

### Considered, Not Flagged

Documented so the audit's negative findings are auditable, not just its
positive ones — each of these was read in source, not just by description
text, before being ruled out:

| Tools | Why considered | Why not flagged |
|---|---|---|
| `agda_goal` / `agda_goal_type` / `agda_context` / `agda_goal_type_context_check` / `agda_goal_type_context_infer` / `agda_refine` / `agda_refine_exact` / `agda_intro` | Names/descriptions cluster tightly around "goal type/context" and "refine" | Each maps to a **distinct native Agda IOTCM command** (`Cmd_goal_type`, `Cmd_goal_type_context`, `Cmd_context`, `Cmd_goal_type_context_check`, `Cmd_goal_type_context_infer`, `Cmd_refine_or_intro`, `Cmd_refine`, `Cmd_intro` respectively) — this project has a standing, tool-verified design goal of Agda IOTCM protocol parity (`agda_protocol_parity` exists specifically to report mapped-vs-gap status). Cutting any one would reduce protocol parity, not remove agent-facing duplication. |
| `agda_show_implicit_args`/`agda_toggle_implicit_args`, `agda_show_irrelevant_args`/`agda_toggle_irrelevant_args` | Each pair looks like a "set" + "toggle" duplicate | Both members of each pair map to distinct native commands (`ShowImplicitArgs`/`ToggleImplicitArgs`, `ShowIrrelevantArgs`/`ToggleIrrelevantArgs`) — a standard, deliberate set-vs-toggle API pattern, not incidental duplication. Zero usage on all four, but this is a `process`-category, low-frequency-by-nature display-toggle capability. |
| `agda_highlight` / `agda_load_highlighting_info` / `agda_token_highlighting` | All in the `highlighting` category, all zero usage | Each maps to a distinct native command (`Cmd_highlight`, `Cmd_load_highlighting_info`, `Cmd_tokenHighlighting`) — protocol-parity surface, same reasoning as above. |
| `agda_backend_hole` / `agda_backend_top` / `agda_compile` | All `backend` category, all zero usage | All three `requiresBackend: true` per the coverage matrix — a configured compiler backend is a specialized setup none of the local runs exercised. Zero usage here is explained by A5's sample-bias caveat, not by redundancy; each maps to a distinct native command. |
| `agda_search_about` vs. `agda_search_definitions` | Both start with "agda_search_", both zero usage | `agda_search_about` requires a **loaded live session** and searches only the loaded module's scope via Agda's own `Cmd_search_about_toplevel` (type-component matching); `agda_search_definitions` is a **static, offline, cross-file** filesystem search (`requiresLiveAgda: false`), and does not require `agda_load` first. Different mechanism, different scope — not redundant, though the name prefix is a mild documentation-clarity note (not severe enough to warrant a cut-list row on its own). |
| `agda_impact` / `agda_bulk_status` / `agda_project_progress` | All static, project-wide, zero-usage analysis tools | Three distinct views (dependency-impact graph; multi-file failure clustering; per-subdirectory hole/postulate progress), not the same computation. `12-CONTEXT.md` and `12-RESEARCH.md` (Anti-Patterns) already explicitly adjudicated `import-graph.ts` (which backs `agda_impact`) as **not** dead code with 4 real non-test consumers backing 6 live tools — re-litigating it here without new evidence would contradict that prior finding. |
| `agda_builtin_migration_map` vs. `agda_stdlib_migration_map` | Both "curated migration map" lookups, both zero usage, same file/pattern (`src/tools/agent-ux/migration-tools.ts`) | Verified via source: genuinely different schemas (`{fromVersion,toVersion,from,to}` vs. `{name,module,renamedFrom,removedIn,replacement}`) covering different data domains (stdlib symbol renames vs. builtin lifecycle records). Forcing a merge would add a discriminated-union input/output shape — more agent-facing complexity, not less, contradicting this phase's own "reduce user-facing complexity" goal. |
| `agda_session_snapshot` vs. `agda_proof_status` | Both "one-call state summary" tools, both cite similar-sounding fields (phase/loaded-file) | Verified via source: different field sets and different cost profiles. `agda_session_snapshot` (`requiresLiveAgda: false`) is a **pure, free, in-memory** derivation from state the session already holds (adds `phase`, `projectRoot`/`projectRootExists`, `agdaVersion`, `lastLoadedAt`, `suggestedActions` — none of which `agda_proof_status` reports). `agda_proof_status` (`requiresLiveAgda: true`) issues **live** `Cmd_metas`/`Cmd_constraints` round trips for per-goal types and constraint text — neither of which `agda_session_snapshot` reports. Different purpose (agent orientation without touching the process vs. authoritative current goal/constraint state). |
| `agda_proof_status` vs. `agda_session_status` + `agda_metas` + `agda_constraints` | `agda_proof_status`'s own description says it composes these three | This is a **documented, intentional** composite-vs-granular pattern, not accidental duplication — the description itself already disambiguates ("Use this instead of calling agda_session_status + agda_metas + agda_constraints separately"), which is exactly the kind of self-disambiguating text that mitigates the mis-selection risk this task looks for. The granular tools remain independently useful (e.g. `agda_metas` alone, without a full proof-status dashboard). |

---

## Cut-List Candidates

### Candidate 1: `agda_bug_report_bundle` + `agda_bug_report_update_bundle` (superseded by `agda_capture_session`)

- **Issue:** These two tools produce a manually-authored, GitHub-issue-shaped bug bundle. The project's own canonical dogfooding runbook (`.agents/skills/agda-dogfooding/SKILL.md` §3) explicitly instructs agents: *"Call `agda_capture_session` (not `agda_bug_report_bundle`) whenever..."* — a direct, authored supersession signal, not an inference. Despite that, `docs/assistant-workflows.md` — this same server's primary workflow doc — still dedicates its entire "## 6. Filing a bug report" section (lines 136–177) to `agda_bug_report_bundle`/`_update_bundle`, and its "Typical full session pattern" walkthrough's Step 5 ("If stuck") recommends `agda_bug_report_bundle` as the go-to action (line 200). The repository's own two canonical docs actively disagree about which tool an agent should reach for when something goes wrong — a confirmed, concrete mis-selection risk, not a speculative one.
  - Files: `src/tools/register-bug-bundles.ts` (212 lines — sole registration site for both tools), `src/tools/reporting-tools.ts` (2 register calls + import to remove), `src/reporting/bug-report.ts` (partially affected — see Impact), `test/unit/reporting/bug-report.test.ts`, `test/property/reporting/bug-report.property.test.ts`, `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (bug-bundle test cases), `test/fixtures/e2e/mcp-tool-coverage.json` (2 entries), `src/tools/data/tool-family-examples.json` (1 entry, `agda_bug_report_bundle` only — `agda_bug_report_update_bundle` has none), `src/session/tool-recommendation.ts` (1 real `addIfAvailable` entry, priority 10, in the has-error branch), `docs/assistant-workflows.md` (§6 in full + the Step 5 mention), `.agents/skills/agda-dogfooding/SKILL.md` (line 78's "not agda_bug_report_bundle" parenthetical becomes stale prose once the tool no longer exists).
  - Impact: removes 2 tools + a 212-line registration file + its dedicated tests. **Does not** remove `src/reporting/bug-report.ts`'s cryptographic fingerprinting — see Security cross-check below; only `buildBugReportBundle`/`defaultBugTitle` (pure data-shaping, no crypto) become dead code inside that file, so the file itself is not deleted, only trimmed. Removing the `tool-recommendation.ts` entry with no replacement would silently regress agent guidance in the "has error" branch (verified: `agda_capture_session` currently has **zero** entries anywhere in `tool-recommendation.ts` — it is not recommended by the engine at all today) — the fix approach below accounts for this explicitly rather than leaving a guidance gap.
  - Fix approach: delete outright (D-02) — no schema merge is applicable, since `agda_capture_session`'s replay-manifest capture artifact is a categorically different shape from a GitHub-issue-style bundle, not a drop-in replacement API. Replace `docs/assistant-workflows.md`'s §6 with a short section demonstrating `agda_capture_session` (mirroring the dogfooding skill's own §3 example), update the Step-5 mention, and **add** (not merely remove) a new `tool-recommendation.ts` entry recommending `agda_capture_session` in the same has-error branch the deleted `agda_bug_report_bundle` entry currently occupies, so agent guidance is preserved rather than silently dropped.
  - Severity: Medium — confirmed redundancy with an active, currently-live mis-selection risk (two of the repo's own docs disagree today), but current real-world exposure is limited by zero recorded local usage and the dogfooding skill already steering agents away from it.
  - Real-usage-count: `agda_bug_report_bundle` = 0, `agda_bug_report_update_bundle` = 0 (of 72 total recorded invocations across 21 local runs — small, RT-probe-biased sample per the Reliability Disclaimer above; not treated as a sole criterion here, the supersession/mis-selection evidence above is independent of the usage count).
  - Loop②-stage-entry: none. (`agda_capture_session` is the confirmed capture-stage entry point, excluded above; these bundle tools are a parallel, non-pipeline-integrated manual path — their output never flows into `scripts/dogfood/dogfood-wrapup.mjs`'s judge→file chain.)
  - Security cross-check: RESEARCH.md's V6 Cryptography row names `src/reporting/bug-report.ts` (`createHash` fingerprinting). Traced: `fingerprintBugReport()` (the function containing the actual `createHash("sha256")` call) is re-exported verbatim by `src/agda/session-capture/dedup-index.ts` and consumed independently by `agda_capture_session` for its own dedup routing. This cut does not remove that function or its only crypto-relevant call site — confirmed not excluded on security grounds (see Security Domain Cross-Check above for the full trace).
  - Lockstep-checklist (six steps, fully spelled out, not a reference):
    1. Delete both `registerBugReportBundle`/`registerBugReportUpdateBundle` call sites and their imports in `src/tools/reporting-tools.ts`; delete `src/tools/register-bug-bundles.ts` outright (both tools' only registration site — confirmed via grep, no other file imports from it).
    2. Delete the `agda_bug_report_bundle` and `agda_bug_report_update_bundle` entries from `test/fixtures/e2e/mcp-tool-coverage.json` (74 → 72 rows); run `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts` before and after to confirm the set-equality assertion passes both times relative to its own state.
    3. Delete the single `agda_bug_report_bundle` entry from the `"reporting"` family array in `src/tools/data/tool-family-examples.json` (confirmed: `agda_bug_report_update_bundle` has no entry there, so this step is a no-op for the update-bundle tool specifically). Run `npx vitest run test/unit/tools/tool-family-examples.test.ts` after.
    4. Manual doc pass (no automated check covers `docs/`): replace `docs/assistant-workflows.md`'s entire "## 6. Filing a bug report" section (currently lines 136–177) with an `agda_capture_session` example mirroring `.agents/skills/agda-dogfooding/SKILL.md` §3's worked example; change the "Typical full session pattern" Step 5 line (currently line 200, `agda_bug_report_bundle → file a structured report if the server misbehaves`) to recommend `agda_capture_session` instead. In `.agents/skills/agda-dogfooding/SKILL.md` line 78, rephrase the now-stale "(not `agda_bug_report_bundle`)" parenthetical (the contrast target no longer exists) to something like "capture, don't hand-author a separate bug bundle" or drop the parenthetical entirely. Leave `docs/release-0.7.0-triage.md` untouched — confirmed it is an explicitly dated, reconciled historical release-gate record ("Status: ... This doc was stale. Last updated: 2026-07-04"), not living workflow documentation; editing history would be wrong here (Shared Pattern C's generated-vs-authored distinction, extended to historical-vs-living).
    5. In `src/session/tool-recommendation.ts`, remove the `addIfAvailable(..., { tool: "agda_bug_report_bundle", rationale: "If the error is unexpected, file a structured bug report.", priority: 10, ... })` block in the has-error branch, and **add** a replacement `addIfAvailable(..., { tool: "agda_capture_session", ... })` entry in the same branch so the "you're stuck/erroring, here's what to do" guidance is preserved rather than silently regressed (confirmed: no existing entry recommends `agda_capture_session` anywhere in this file today).
    6. Delete `test/unit/reporting/bug-report.test.ts` and `test/property/reporting/bug-report.property.test.ts` **only if** their test cases exclusively exercise `buildBugReportBundle`/`defaultBugTitle` (the parts that become dead); if either file also exercises `fingerprintBugReport()` itself (the surviving shared function), keep those specific cases — re-scope the file rather than deleting it outright, matching the "collapse the barrel only if it drops to trivial size" instinct. Delete the bug-bundle-specific test cases inside `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (the tool-level E2E coverage for these two tools, now gone). Verify with `npx vitest run test/unit/reporting/ test/property/reporting/ test/integration/mcp/mcp-remaining-tools-e2e.test.ts` before and after.

### Candidate 2: `agda_goal_analysis` (merge into `agda_goal_catalog` via an optional `goalId` filter)

- **Issue:** `agda_goal_analysis`'s callback (`src/tools/analysis-tools.ts` lines 108–191, ~84 lines) duplicates, field-for-field, the exact per-goal computation `agda_goal_catalog`'s domain logic (`src/session/goal-catalog.ts`'s `buildGoalCatalog`) already performs for *every* open goal in one call. Both call the identical pure functions `parseContextEntry`/`deriveSuggestions` from `src/agda/goal-analysis.ts`, and both compute "splittable variables" via the identical filter predicate (`!isImplicit && name && type`). `agda_goal_analysis` is functionally a single-goal-filtered view of what `agda_goal_catalog` already returns for all goals in one round trip — this is a confirmed source-level duplication (traced by reading both implementations), not a name-similarity guess.
  - Files: `src/tools/analysis-tools.ts` (delete the `agda_goal_analysis` registration, ~84 lines), `src/tools/register-goal-catalog.ts` + `src/session/goal-catalog.ts` (add an optional `goalId` input/fast-path — see Fix approach), `test/fixtures/e2e/mcp-tool-coverage.json` (1 entry), `src/tools/data/tool-family-examples.json` (1 entry — the *only* entry in the `"analysis"` family array; see Impact), `docs/assistant-workflows.md` (no direct mention of `agda_goal_analysis` by name — confirmed via grep, no edit needed there), `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (E2E coverage case), `test/unit/session/goal-catalog.test.ts` + `test/property/session/goal-catalog.property.test.ts` (gain new single-goal-filter test cases; no dedicated `agda_goal_analysis`-only test file exists to delete — confirmed via `find test -iname "*goal-analysis*"` returning only `test/unit/agda/goal-analysis.test.ts` and its `.property.test.ts` sibling, which test the shared `src/agda/goal-analysis.ts` pure functions both tools consume, not the `agda_goal_analysis` MCP tool itself — these stay untouched since the underlying functions survive).
  - Impact: removes 1 tool + ~84 duplicated lines. This is a **merge**, not a pure subtraction: `agda_goal_catalog` needs a small, low-risk addition (an optional `goalId` field that, when present, queries only that one goal via `session.goal.typeContext(goalId)` directly instead of iterating every `session.getGoalIds()` entry) to preserve the efficient single-goal round-trip cost `agda_goal_analysis` currently provides — without it, an agent that only wants one goal's analysis would pay for N goal queries instead of 1 on a large multi-goal proof. Deleting `agda_goal_analysis`'s sole `tool-family-examples.json` entry leaves the `"analysis"` family's curated-examples array **empty** (it is the only entry there) — the fix approach below adds a replacement example rather than leaving the family unrepresented.
  - Fix approach: merge (D-02 explicitly allows merge, not only delete). Add an optional `goalId` input to `agda_goal_catalog`'s schema and a single-goal fast path through `buildGoalCatalog`; once verified schema-compatible and covered by new unit tests, delete `agda_goal_analysis`'s registration. Because this requires new code (not pure subtraction), it carries slightly more implementation risk than Candidate 1 — flag this explicitly to whoever executes Plan 12-09 so it isn't treated as a same-risk-tier deletion.
  - Severity: Low — genuine code/tool-surface duplication with no correctness or security implication; zero usage locally (with the standard A5 sample-size caveat), but the code-level duplication evidence stands independently of the usage count.
  - Real-usage-count: `agda_goal_analysis` = 0, `agda_goal_catalog` = 1 (of 72 total recorded invocations across 21 local runs — small sample, not a sole criterion here; the source-level duplication finding is the primary evidence for this candidate).
  - Loop②-stage-entry: none. (Neither tool is any Loop② stage's primary interface — both are read-only goal introspection, unrelated to capture/judge/file/fix/lock.)
  - Security cross-check: neither tool appears in, or calls into, any Security Domain ASVS row or Known Threat Pattern (pure read-only goal-state introspection: no file writes, no cryptography, no auth boundary). Not excluded.
  - Lockstep-checklist (six steps, fully spelled out, not a reference):
    1. **Add before deleting:** extend `src/tools/register-goal-catalog.ts`'s input schema with an optional `goalId: goalIdSchema.optional()`, and thread a single-goal path through `src/session/goal-catalog.ts`'s `buildGoalCatalog` (or a new sibling pure function) that queries only the one requested goal via `session.goal.typeContext(goalId)` when `goalId` is present, falling back to the existing all-goals iteration when it is absent. Only after this is implemented and tested does step 2 apply — this candidate's merge direction means the addition must land before the subtraction, unlike Candidate 1's pure delete.
    2. Delete the `agda_goal_analysis` registration block from `src/tools/analysis-tools.ts` (confirmed lines 108–191) once the goalId-filtered `agda_goal_catalog` path covers its use case.
    3. Delete the `agda_goal_analysis` entry from `test/fixtures/e2e/mcp-tool-coverage.json` (74 → 73 rows, pending Candidate 1's own 2-row deletion in the same or a different batch); update `agda_goal_catalog`'s own `scenario` text if it should now mention the single-goal filter path. Run `npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts` before and after.
    4. Replace (do not merely delete) the sole `"analysis"` family entry in `src/tools/data/tool-family-examples.json` (currently `{"tool": "agda_goal_analysis", "summary": "Inspect a goal's expected type, locals, and useful suggestions.", "args": {"goalId": 0}}`) with an equivalent example calling `agda_goal_catalog { "goalId": 0 }`, so the `"analysis"` family is not left with an empty examples array. Run `npx vitest run test/unit/tools/tool-family-examples.test.ts` after.
    5. `src/session/tool-recommendation.ts` — confirmed no existing entry recommends `agda_goal_analysis` (grep found none), so no removal is needed here; `agda_goal_catalog` already has its own recommendation entry (priority 2, "Get a structured overview of all goals") which needs no change since the tool it recommends is unchanged from the agent's perspective (the new `goalId` field is additive/optional).
    6. Delete the `agda_goal_analysis`-specific test case(s) inside `test/integration/mcp/mcp-remaining-tools-e2e.test.ts` (the tool-level E2E coverage, now gone with the tool); **add** new single-goal-filter test cases to `test/unit/session/goal-catalog.test.ts` and (if a property test is warranted for the new filter parameter) `test/property/session/goal-catalog.property.test.ts` to cover the merged behavior. Do not touch `test/unit/agda/goal-analysis.test.ts`/`.property.test.ts` — those test the shared pure functions (`parseContextEntry`/`deriveSuggestions`) both tools consumed and continue to consume; they are unaffected by which MCP tool wraps them.

---

## Summary

Two well-evidenced Cut-List Candidates are drafted, both surviving the C-02
Loop②-stage-entry check (neither is a stage entry point) and the Security
Domain cross-check (one candidate facially matched a Security Domain row and
was investigated in full — the specific control it might appear to touch
was confirmed to survive the cut via a separate code path, so it was
included rather than excluded, with that reasoning documented on its row).
A third, larger set of same-category/similar-sounding tool clusters was
deliberately investigated and NOT flagged, with per-cluster reasoning
recorded under "Considered, Not Flagged" — most of this codebase's apparent
tool-surface density reflects a deliberate Agda-IOTCM-protocol-parity design
goal (verified by the existence of a dedicated `agda_protocol_parity`
reporting tool) or a documented composite-vs-granular pattern, not
accidental duplication. Both drafted candidates carry a fully pre-filled
six-step lockstep checklist naming exact files, exact line ranges where
known, and exact existing call sites (verified by source read, not assumed
present), so Plan 12-09 can execute either row directly.
