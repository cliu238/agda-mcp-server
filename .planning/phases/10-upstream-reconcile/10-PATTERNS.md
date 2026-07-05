# Phase 10: Upstream Reconcile - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 17 (6 conflict files + 2 load-terminus implementations + 5 adoption-wiring files + 1 new doc + 1 test-harness file + 2 Wave-0-gap fixtures)
**Analogs found:** 15 / 17 (2 are net-new files carried in wholesale by the merge — no local analog needed, upstream's own source IS the pattern)

**How to read this file:** this phase is not "build new features from scratch" — it is a `git merge` + adjudicate + wire-in phase. Most "closest analog" entries below are **the file's own pre-merge self** (i.e., resolve the conflict by extending the existing local structure), not a different file elsewhere in the tree. Two genuinely new files (`goal-terminus.ts`, `register-goal-candidates.ts`) are carried in verbatim by the merge and have no pre-existing local analog — their patterns come from upstream's own source (already read during RESEARCH.md) and the local files that must import/wire them.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `src/agda/refactor-helpers.ts` (conflict) | utility | transform | itself, pre-merge (150 lines, no split needed) | exact — textual union of both hunks |
| `test/unit/agda/agent-ux.test.ts` (conflict) | test | transform | itself, pre-merge (237 lines) | exact — textual union of both hunks |
| `src/tools/goal-tools.ts` (conflict) | controller (MCP tool adapter) | request-response | itself, pre-merge (173 lines) + `src/tools/goal-write-tools.ts` (sibling split) | exact — keep our split, port one logic delta |
| `src/session/command-completion.ts` (conflict) | utility (pure functions, protocol-state derivation) | transform | itself, pre-merge (192 lines) | architectural — adjudicate via referee, D-04 |
| `src/session/agda-transport.ts` (conflict) | service (transport/process I/O) | streaming (stdout/stderr line collection) | itself, pre-merge (497 lines) | architectural — adjudicate via referee, D-04 |
| `src/agda/session-load-impl.ts` (conflict) | service (orchestration) | request-response (Cmd_load round trip) | itself, pre-merge (270 lines) | architectural — adjudicate via referee, D-04 |
| `src/session/load-terminus-tracker.ts` (adjudication subject, possible deletion) | utility (protocol state machine) | transform | upstream's `src/session/goal-terminus.ts` (`GoalTerminusTracker`) | architectural — D-04 referee decides winner |
| `src/session/goal-terminus.ts` (upstream, net-new, carried in by merge) | utility (protocol state machine) | transform | `src/session/load-terminus-tracker.ts` (the file it may replace) | architectural — no local pre-merge analog; upstream's own source is the pattern |
| `src/tools/register-goal-candidates.ts` (upstream, net-new, carried in by merge) | controller (MCP tool adapter) | request-response | `src/tools/register-goal-catalog.ts` (closest sibling: read-only goal-state query tool with a best-effort-catch logger.warn) | role-match — wiring pattern, not content, is local business |
| `src/tools/register-core-tools.ts` (modified: +1 import +1 call) | controller composition (barrel) | request-response | itself, pre-merge (40 lines, 13 existing `register()` calls) | exact — 14th line in an established list |
| `src/tools/manifest.ts` (consumed, not directly edited) | registry/SSOT | CRUD (in-memory `Map`) | itself — `registerManifestEntry` already auto-populates from `registerStructuredTool` | exact — zero new manifest code needed |
| `src/session/tool-recommendation.ts` (modified: +1 recommendation entry) | service (pure derivation) | transform | itself, pre-merge (270 lines) — the "has holes" branch (lines 145-204) | exact — same file, same branch, one more `addIfAvailable` call |
| `src/tools/data/tool-family-examples.json` (modified: +1 entry under `"proof"`) | config (JSON SSOT) | transform | itself, pre-merge (111 lines) — the `"proof"` array | exact — same file, same array |
| `test/fixtures/e2e/mcp-tool-coverage.json` (modified: +1 entry) | test fixture (JSON SSOT) | transform | itself — existing `agda_goal_catalog`/`agda_auto` entries | exact — Wave-0 gap, same file same shape |
| `vitest.config.ts` (modified: +`setupFiles`) | config | transform | itself, pre-merge (39 lines) — auto-merges per RESEARCH.md | exact — upstream's own diff is the pattern |
| `test/helpers/warn-guard.ts` (upstream, net-new, carried in by merge) | test utility | event-driven (`vi.spyOn` intercept) | none locally — nearest sibling is `test/helpers/mcp-harness.ts` (a shared test-setup helper under `test/helpers/`) | no analog — file arrives verbatim; only the *usage* pattern (`expectWarning`) needs per-site examples |
| `docs/LOAD-TERMINUS-ADJUDICATION.md` (new) | doc (durable operational record) | transform | `docs/DEPLOY-OPERATIONS.md` (534 lines) — the project's convention for durable ops/decision records | role-match — same doc genre, different subject |
| Individual test files touching the 8 existing `logger.warn(` call sites (MERGE-02 triage) | test | event-driven | `test/unit/agda/spawn-error-listener.test.ts` (closest existing example of asserting behavior around a `logger.warn`-adjacent code path) | partial — no existing test currently asserts on `logger.warn` output directly; the *shape* to add is `expectWarning()`, per upstream's own `test/helpers/warn-guard.ts` |

## Pattern Assignments

### `src/agda/refactor-helpers.ts` (utility, transform) — mechanical conflict

**Analog:** itself, pre-merge (`src/agda/refactor-helpers.ts`, 150 lines, read in full)

**Resolution pattern — keep both, textual union (RESEARCH.md Pattern 1):**
The current file already contains our from-RED `assertValidAutoHint` guard (lines 113-121) feeding `buildAutoSearchPayload` (lines 129-150). Upstream's conflicting hunk adds a doc comment about engine-selection (mimer vs agsy) near the same function. These are additive, not competing — resolve by keeping the full current file body and splicing in upstream's doc comment / any genuinely new helper function, never removing `assertValidAutoHint` or narrowing its regex (D-05: never weaken a from-RED lock).

**Core pattern to preserve verbatim** (lines 113-121, the T-06-12/RT4 regression guard):
```typescript
function assertValidAutoHint(original: string, trimmed: string): void {
  if (trimmed.startsWith("-") || /\s/u.test(trimmed)) {
    throw new Error(
      `agda_auto hint ${JSON.stringify(original)} is not a valid Agsy hint: ` +
        `hints must be bare identifier/module names (no leading "-", no whitespace); ` +
        `refusing to inject it into the search payload.`,
    );
  }
}
```

---

### `test/unit/agda/agent-ux.test.ts` (test, transform) — additive conflict

**Analog:** itself, pre-merge (`test/unit/agda/agent-ux.test.ts`, 237 lines, read in full)

**Resolution pattern — keep both test blocks (RESEARCH.md Pattern 1):**
Our file already has the `buildAutoSearchPayload` describe block (lines 151-196) with the from-RED T-06-12/RT4 regressions (lines 165-190) that must NEVER be weakened (D-05). Upstream adds a "mimer mode emits bare hints..." test to the same describe block. Resolution: keep every existing `test(...)` call verbatim, append upstream's new test(s) inside the same `describe("buildAutoSearchPayload", ...)` block.

**Import pattern to preserve** (lines 1-18):
```typescript
import { describe, expect, test } from "vitest";

import {
  applyScopedRename,
  buildAutoSearchPayload,
  buildMissingClause,
  classifyAgdaError,
  extractPostulateSites,
  extractSuggestedRename,
  inferFixityConflicts,
  inferMissingClauseArity,
  matchesTypePattern,
  parseAgdaLibFlags,
  parseModuleSourceShape,
  parseOptionsPragmas,
  parseTopLevelDefinitions,
  rewriteCompilerPlaceholders,
} from "../../../src/agda/agent-ux.js";
```
If upstream's mimer test needs a new export (e.g. `usesMimerProofSearch` or similar), add it to this same barrel import list rather than a separate import statement.

**From-RED lock to protect exactly as-is** (lines 168-175, never touch the regex or the assertion message):
```typescript
test("rejects a flag-shaped hints token instead of injecting it into the payload", () => {
  expect(() => buildAutoSearchPayload({ hints: ["-t 999999"] })).toThrow(
    /not a valid Agsy hint/u,
  );
  ...
```

---

### `src/tools/goal-tools.ts` (controller, request-response) — structural conflict

**Analog:** itself, pre-merge (`src/tools/goal-tools.ts`, 173 lines) + sibling `src/tools/goal-write-tools.ts` (359 lines, not read this pass — file-split partner referenced by RESEARCH.md Pattern 2)

**Resolution pattern (RESEARCH.md Pattern 2) — keep our two-file split, port ONE logic delta:**
Upstream is still a 507-line monolith (goal-tools.ts pre-split); our side already extracted write-capable actions into `goal-write-tools.ts`. Do NOT re-merge into upstream's monolith shape — that would violate the 500-line ceiling and CLAUDE.md's Module Design convention. Instead:
1. Keep this file exactly as read (read-only goal queries: `agda_goal_type`, `agda_goal`, `agda_context`, `agda_goal_type_context_check`, `agda_goal_type_context_infer`, then `registerGoalWriteTools(server, session, repoRoot)` at line 172).
2. Port upstream's genuine delta — `usesMimerProofSearch(session.getAgdaVersion())` engine dispatch — into `goal-write-tools.ts`'s existing `agda_auto` registration (around its `buildAutoSearchPayload(options)` call, currently always defaults to `"mimer"`).

**Registration pattern to preserve verbatim** (this file's shape, lines 18-49, `registerGoalTextTool`):
```typescript
export function register(
  server: McpServer,
  session: AgdaSession,
  repoRoot: string,
): void {
  registerGoalTextTool({
    server,
    session,
    name: "agda_goal_type",
    description: "Show the type and local context for a specific goal. Requires a file to be loaded first via agda_load.",
    category: "proof",
    protocolCommands: ["Cmd_goal_type_context"],
    inputSchema: { goalId: goalIdSchema.describe("The goal ID (from agda_load output)") },
    outputDataSchema: z.object({ text: z.string(), goalId: goalIdSchema, goalType: z.string(), context: z.array(z.string()) }),
    callback: async ({ goalId }) => { /* ... */ },
  });
  // ...
  registerGoalWriteTools(server, session, repoRoot);
}
```

**Correction to RESEARCH.md Pattern 2's premise:** live grep of `src/agda/version-support.ts` (220 lines, read in full this pass) confirms `usesMimerProofSearch` does **not** currently exist anywhere in our `src/` (only `mimerResponseSchema` exists, in `src/protocol/response-schemas.ts:187`). The function must either arrive net-new via the merge (if upstream's commit touches `version-support.ts`, which is NOT in the 6-conflict list, so it should auto-merge cleanly) or be authored fresh following this file's existing version-gate idiom:
```typescript
// src/agda/version-support.ts:150-153 — the idiom to follow for a new
// usesMimerProofSearch(agdaVersion) if it doesn't arrive via the merge:
export function hasStructuredGiveResult(agdaVersion: AgdaVersion): boolean {
  return atLeastMajorMinor(agdaVersion, 2, 9);
}
```

---

### `src/session/command-completion.ts` / `src/session/agda-transport.ts` / `src/agda/session-load-impl.ts` (service, streaming + request-response) — architectural conflicts, MERGE-03

**Analog:** each file's own pre-merge self (read in full this pass); the actual "pattern to copy" is the **referee procedure**, not a code excerpt to imitate.

**Do not resolve these three by code-reading/taste.** Per D-04/D-05 and RESEARCH.md Pitfall 1, run the actual referee before choosing:
```bash
RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts
```
Both of these matrix entries (`test/fixtures/capture-regression-matrix.json`, read in full) must stay green under whichever implementation is adopted:
```json
{
  "id": "issue-64-61-transitive-staleness",
  "tool": "agda_load_no_metas",
  "serverEnv": { "AGDA_MCP_IDLE_COMPLETION_MS": "1", "AGDA_MCP_POST_STATUS_IDLE_MS": "1" },
  "expected": { "classification": "type-error", "success": false, "goalCount": 0, "invisibleGoalCount": 0, "hasHoles": false, "errorCategories": ["UnequalTerms"] }
},
{
  "id": "guard-no-metas-clean-load-under-fault-injection",
  "tool": "agda_load_no_metas",
  "serverEnv": { "AGDA_MCP_IDLE_COMPLETION_MS": "1", "AGDA_MCP_POST_STATUS_IDLE_MS": "1" },
  "expected": { "classification": "ok-complete", "success": true, "goalCount": 0, "invisibleGoalCount": 0, "hasHoles": false, "errorCategories": [] }
}
```

**Regardless of which side wins**, graft upstream's fatal-stderr-as-terminus improvement (RESEARCH.md Pitfall 4) — the transport-level analog to extend is `recordCollectedResponse` in `agda-transport.ts` (lines 409-455, read in full), which currently updates `sawStatusDone`/`lastResponseKind`/calls `recordLoadTerminusResponse` but never inspects `StderrOutput` as a completion signal:
```typescript
// src/session/agda-transport.ts:449-452 — current call site to extend
// with a StderrOutput-aware fatal-stderr check (upstream's sawFatalStderr
// wiring lives in `GoalTerminusTracker.record()` on their side):
if (response.kind === "Status") {
  this.sawStatusDone = true;
}
recordLoadTerminusResponse(this.terminus, response);
```
The existing local fatal-stderr detector to reuse/relocate is `throwOnFatalProtocolStderr` (`src/agda/protocol-errors.ts`, 18 lines, read in full):
```typescript
const FATAL_PROTOCOL_PATTERNS = [
  /^cannot read:/i,
  /^failed to parse/i,
  /^invalid\b/i,
];

export function throwOnFatalProtocolStderr(responses: AgdaResponse[]): void {
  const fatal = decodeStderrOutputs(responses)
    .map((text) => text.trim())
    .filter((text) => FATAL_PROTOCOL_PATTERNS.some((pattern) => pattern.test(text)));
  if (fatal.length > 0) {
    throw new Error(fatal.join("\n"));
  }
}
```
Currently called only from `session-load-impl.ts` (lines 88, 219) AFTER `sendCommand` resolves — the D-04 hardening moves an equivalent check earlier, into the transport's per-response path, so a fatal stderr unblocks the terminus immediately instead of waiting the full 120s `configuredCommandTimeoutMs()`.

**Pitfall 2 note (do not budget adjudication effort here):** `test/unit/session/register-agda-load-no-metas.test.ts` (RT8) uses a fully mocked session and never discriminates between terminus implementations — treat as an always-green sanity check, not a referee input.

**Pitfall 5 note:** `resetInactivityTimer`-style inactivity-timeout logic is NOT part of the conflict diff at all (verified: `private resetInactivityTimer` sits outside all 7 conflict-marker blocks) — do not scope separate adjudication work for it.

---

### `src/session/load-terminus-tracker.ts` vs. `src/session/goal-terminus.ts` (utility, transform) — the adjudication subject itself

**Our file** (`src/session/load-terminus-tracker.ts`, 81 lines, read in full): `createLoadTerminusState`, `recordLoadTerminusResponse`, `isLoadTerminusSatisfied` — mode is `"metas" | "strict" | null`, strict mode is satisfied ONLY by `sawLoadError` (no positive success signal for a clean strict load).

**Upstream's file** (`src/session/goal-terminus.ts`, `GoalTerminusTracker` class, carried in net-new by the merge — no local pre-merge analog, its own source at `git show upstream/main:src/session/goal-terminus.ts` is the pattern to inspect during adjudication, already read during RESEARCH).

**Decision rule (D-04, already settled, not this agent's business to pre-decide):** if the two `capture-regression.test.ts` matrix entries pass under upstream's `Cmd_load` + client-side hole/meta-counting implementation, delete `load-terminus-tracker.ts` entirely and adopt `goal-terminus.ts`, updating all three importers (`agda-transport.ts`, `command-completion.ts`, `session-load-impl.ts`) to the new import path. If locks fail under upstream's implementation, keep this file's exports **exactly as they are** (never weaken `isLoadTerminusSatisfied`'s strict-mode branch) and only graft the fatal-stderr hardening described above.

**Interface shape to preserve whichever way it goes** (lines 22-27, this is the contract every importer depends on):
```typescript
export interface LoadTerminusState {
  mode: LoadTerminusMode;
  sawInteractionPoints: boolean;
  sawAllGoalsWarnings: boolean;
  sawLoadError: boolean;
}
```

---

### `src/tools/register-goal-candidates.ts` (controller, request-response) — ADOPT-01 net-new file

**Analog:** `src/tools/register-goal-catalog.ts` (closest sibling already in the codebase — a read-only goal-introspection tool with a best-effort-catch `logger.warn`, lines 85-114 read in full this pass)

**Core pattern to match on adoption** (best-effort per-goal catch, lines 93-113 of `register-goal-catalog.ts` — the shape the adopted file's own `logger.warn("goal_candidates typeContext query failed", ...)` should mirror for MERGE-02 triage purposes):
```typescript
for (const goalId of goalIds) {
  try {
    const info = await session.goal.typeContext(goalId);
    goalInfos.push({ goalId, type: info.type, context: info.context });
  } catch (err) {
    failedGoalQueries++;
    logger.warn("goal typeContext query failed", {
      goalId,
      error: err instanceof Error ? err.message : String(err),
    });
    goalInfos.push({ goalId, type: "?", context: [] });
  }
}
```
This is the 9th `logger.warn` call site RESEARCH.md counted (8 pre-existing + this 1 new one) — it needs its own `expectWarning`/`ackWarnings` registration in whatever test exercises `agda_goal_candidates`'s error path (the carried-in `test/unit/tools/goal-candidates.test.ts`).

**Adoption wiring pattern — exact diff shape** (verified against live `src/tools/register-core-tools.ts`, lines 8-20 for the import block, lines 27-39 for the call sequence):
```typescript
// src/tools/register-core-tools.ts — add import + one call, same
// pattern as the other 13 register() functions already wired here:
import { register as registerAgentUxTools } from "./agent-ux-tools.js";
import { registerGoalCandidates } from "./register-goal-candidates.js"; // NEW

export function registerCoreTools(
  server: McpServer,
  session: AgdaSession,
  projectRoot: string,
): void {
  // ...existing 13 calls unchanged...
  registerAgentUxTools(server, session, projectRoot);
  registerGoalCandidates(server, session, projectRoot); // NEW, same signature
}
```
Once wired, `registerStructuredTool` (`src/tools/tool-registration.ts:134-160`, read in full) auto-calls `registerManifestEntry` (`src/tools/manifest.ts:85-133`, read in full) — **no manual manifest code is needed**. `registerManifestEntry`'s duplicate-name guard (lines 113-118) will throw loudly at startup if `agda_goal_candidates` somehow double-registers — a useful built-in safety net, not something to route around.

---

### `src/session/tool-recommendation.ts` (service, transform) — ADOPT-01 recommendation entry

**Analog:** itself, pre-merge (270 lines, read in full) — the "has holes" branch, lines 145-204

**Core pattern to extend** (add `agda_goal_candidates` alongside the existing `agda_goal_catalog`/`agda_auto`/`agda_case_split` entries inside the `if (input.goalIds.length > 0) { ... }` block, lines 145-204):
```typescript
addIfAvailable(recommendations, toolSet, input.availableTools, {
  tool: "agda_goal_catalog",
  rationale: `${input.goalIds.length} goal(s) available. Get a structured overview of all goals.`,
  priority: 2,
  knownArgs: {},
  blockers: [],
});
// ... NEW entry follows the same shape, e.g.:
// addIfAvailable(recommendations, toolSet, input.availableTools, {
//   tool: "agda_goal_candidates",
//   rationale: "Search for type-directed term candidates for a goal.",
//   priority: <pick an unused slot, e.g. 5.5-equivalent int, or renumber>,
//   knownArgs: { goalId: firstGoal },
//   blockers: [],
// });
```
`addIfAvailable` (lines 251-266) already no-ops safely if the tool name isn't in `toolSet` (manifest-derived) — so this entry is inert until `register-core-tools.ts` is wired, meaning wiring order between the two files doesn't matter for correctness, only for whether the recommendation appears.

---

### `src/tools/data/tool-family-examples.json` (config, transform) — ADOPT-02 discoverability entry

**Analog:** itself, pre-merge (111 lines, read in full) — the `"proof"` family array, lines 18-35

**Core pattern to extend:**
```json
"proof": [
  {
    "tool": "agda_case_split",
    "summary": "Split a goal on a variable and write the new clauses back.",
    "args": { "goalId": 0, "variable": "xs" },
    "note": "Set writeToFile=false to preview without modifying the source."
  },
  {
    "tool": "agda_give",
    "summary": "Fill a goal with a candidate term.",
    "args": { "goalId": 0, "expression": "zero" }
  },
  {
    "tool": "agda_auto",
    "summary": "Ask Agda to find a term for the goal automatically.",
    "args": { "goalId": 0 }
  }
  // NEW entry here, e.g.:
  // {
  //   "tool": "agda_goal_candidates",
  //   "summary": "Search for type-directed term candidates for a goal.",
  //   "args": { "goalId": 0 }
  // }
]
```
Note the file's own `$comment` (line 2): "format change must be matched by `src/tools/tool-family-examples.ts`" — check that consumer file exists and is unaffected by a pure data-array addition (it should be, since the shape is unchanged).

---

### `test/fixtures/e2e/mcp-tool-coverage.json` (test fixture, transform) — Wave-0 gap, NOT in RESEARCH.md but discovered this pass

**Analog:** itself — existing `agda_goal_catalog`/`agda_auto` entries (read via grep this pass)

**Why this file must also change:** `test/unit/tools/mcp-e2e-coverage.test.ts` (46 lines, read in full) asserts `matrixNames === manifestNames` — i.e., **every** manifest-registered tool must have a coverage-matrix entry, or this test goes RED the moment `agda_goal_candidates` is wired into `register-core-tools.ts`:
```typescript
test("every registered core tool has an MCP E2E coverage assignment", async () => {
  clearToolManifest();
  const server = createServer();
  const session = new AgdaSession(TEST_FIXTURE_PROJECT_ROOT);
  try {
    registerCoreTools(server, session, TEST_FIXTURE_PROJECT_ROOT);
    const manifestNames = listToolManifest().map((entry) => entry.name).sort();
    const matrixNames = mcpToolCoverageMatrix.map((entry) => entry.tool).sort();
    expect(matrixNames).toEqual(manifestNames);
  } finally {
    await session.destroy();
    clearToolManifest();
  }
});
```
**Core pattern to extend** (existing entry shape, e.g. `agda_goal_catalog`):
```json
{
  "tool": "agda_goal_catalog",
  "suite": "test/unit/session/goal-catalog.test.ts",
  "scenario": "goal catalog introspection",
  "requiresLiveAgda": false
},
// NEW entry needed:
// {
//   "tool": "agda_goal_candidates",
//   "suite": "test/unit/tools/goal-candidates.test.ts",
//   "scenario": "<describe the carried-in test's actual scenario>",
//   "requiresLiveAgda": false
// }
```
This satisfies both the pre-existing Wave-0 gap RESEARCH.md flagged ("no existing test asserts manifest inclusion post-wiring" — this test already does, but only once the fixture has a matching entry) and prevents a same-day regression in an unrelated, already-green test.

---

### `test/helpers/warn-guard.ts` (test utility, event-driven) — MERGE-02, net-new file carried in by merge

**Analog:** none locally with the same mechanism (`vi.spyOn(logger, "warn")` interception is new to this codebase); nearest sibling by directory role is `test/helpers/mcp-harness.ts` (shared test-setup helper, not read this pass — out of scope since the file itself needs zero modification, only consumption).

**Usage pattern (verified from upstream's actual file, per RESEARCH.md Code Examples — copy verbatim per legitimate call site):**
```typescript
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

**The 8 pre-existing call sites needing per-test triage** (verified via live grep this pass, matches RESEARCH.md's count of 9 when the new `register-goal-candidates.ts` site is included):
```
src/tools/register-goal-catalog.ts:104   logger.warn("goal typeContext query failed", ...)
src/agda/session-load-helpers.ts:128     logger.warn("post-load metas reconciliation failed", ...)
src/agda/session-load-helpers.ts:187     logger.warn("explicit hole scan failed", ...)
src/agda/agda-process-spawn.ts:140       logger.warn("Late error from abandoned Agda process", ...)
src/session/agda-transport.ts:228        logger.warn("Control command not acknowledged; terminating proc", ...)
src/session/agda-transport.ts:290        logger.warn("sendCommand still waiting", ...)
src/session/agda-transport.ts:319        logger.warn("sendCommand timed out", ...)
src/session/project-config.ts:322        logger.warn("Failed to parse .agda-mcp.json", ...)
```
Per D-07/Pitfall 6: do NOT plan 8-9 discrete triage tasks from this static list alone — run the guarded full suite FIRST (`npx vitest run` right after taking upstream's `vitest.config.ts` + `warn-guard.ts`) and use the actual failure list as ground truth, since one call site can be exercised by multiple test files or by none.

**`vitest.config.ts` wiring (auto-merges cleanly per RESEARCH.md — do not hand-edit):**
```typescript
// upstream adds, alongside our existing exclude/include/testTimeout/passWithNoTests:
setupFiles: ["test/helpers/warn-guard.ts"],
```

---

### `docs/LOAD-TERMINUS-ADJUDICATION.md` (doc, transform) — MERGE-03 durable record, new file

**Analog:** `docs/DEPLOY-OPERATIONS.md` (534 lines; first 80 lines read in full this pass) — the project's established convention for durable maintainer/operational records: H1 title, short framing paragraph naming the phase/decision that produced it, then structured sections with explicit tables and command recipes.

**Structural pattern to follow** (from `DEPLOY-OPERATIONS.md`'s opening, lines 1-13):
```markdown
# Deploy Operations

Maintainer runbook for the `agda-mcp-server` ingest endpoint + cron judge running
on the JHU IDIES k8s-dev cluster (Phase 8, DEPLOY-01). This file is extended
further by later plans (08-05, 08-06) as more of the deployment is verified.

## Cluster access recap
...
```
Apply the same shape to the new doc: H1 title, a framing paragraph naming Phase 10/MERGE-03 as the origin, then **one table row per sub-behavior** (D-06's explicit requirement) with columns for `ours` / `theirs` / `hybrid` decision, rationale, and referee evidence (the two `capture-regression-matrix.json` entry IDs + pass/fail outcome per candidate implementation). Suggested sections per D-06 + the three sub-behaviors identified in RESEARCH.md (Pitfall 5's scoping): completion-signal detection, fatal-stderr handling, inactivity timeout (documented as "already common code, no adjudication needed" rather than omitted silently).

## Shared Patterns

### MCP tool registration composition
**Source:** `src/tools/register-core-tools.ts` (40 lines, read in full)
**Apply to:** `register-goal-candidates.ts` wiring (ADOPT-01)
```typescript
export function registerCoreTools(
  server: McpServer,
  session: AgdaSession,
  projectRoot: string,
): void {
  registerSession(server, session, projectRoot);
  // ...12 more calls, same signature...
}
```
Every `register()` function takes exactly `(server, session, projectRoot)` and is called once, in a flat sequence, with no conditional logic — the new `registerGoalCandidates` call must match this shape exactly, not introduce a feature flag or gate.

### Manifest auto-population (no manual bookkeeping)
**Source:** `src/tools/tool-registration.ts:134-160` (`registerStructuredTool`) → `src/tools/manifest.ts:85-133` (`registerManifestEntry`)
**Apply to:** ADOPT-01 (automatic), ADOPT-02 (the catalog/recommendation layers read this same `Map`, never re-derive it)
```typescript
export function registerStructuredTool(args: { /* ... */ }): void {
  registerManifestEntry({
    name: args.name,
    description: args.description,
    category: args.category,
    protocolCommands: args.protocolCommands,
    inputSchema: args.inputSchema,
    outputDataSchema: args.outputDataSchema,
    annotations: args.annotations,
    requiresLoadedSession: args.requiresLoadedSession,
  });
  // ...timing + error-catch wrapper follows...
}
```

### Best-effort-catch + `logger.warn` (the convention every MERGE-02 site follows)
**Source:** `src/agda/session-load-helpers.ts:121-132` (`reconcileGoalsViaMetas`)
**Apply to:** all 9 MERGE-02 triage sites, and any new site the adopted `register-goal-candidates.ts` introduces
```typescript
try {
  const metas = await session.goal.metas();
  if (metas.goals.length > 0) {
    goals = mergeGoals(baseGoals, metas.goals);
    goalIds = goals.map((goal) => goal.goalId);
  }
} catch (err) {
  logger.warn("post-load metas reconciliation failed", {
    file: absPath,
    error: err instanceof Error ? err.message : String(err),
  });
}
```
Never re-throw here — the function still returns a safe fallback value (`goals`/`goalIds` unchanged from before the failed enrichment attempt). This is the shape every `expectWarning(...)` call in the corresponding test should target.

### Version-gated capability functions
**Source:** `src/agda/version-support.ts:150-166` (`hasStructuredGiveResult`, `hasConstraintsRewriteMode`)
**Apply to:** wherever `usesMimerProofSearch`-equivalent logic needs to land (Pattern 2's `agda_auto` engine dispatch) if it doesn't arrive automatically via the merge
```typescript
export function hasConstraintsRewriteMode(agdaVersion: AgdaVersion): boolean {
  return atLeastMajorMinor(agdaVersion, 2, 9);
}
```
Uses `atLeastMajorMinor` (not `versionAtLeast`) deliberately — see the file's own comment block (lines 139-148) on why prerelease builds must match their stable-release parser shape.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/session/goal-terminus.ts` (upstream) | utility | transform | Genuinely new architecture carried in wholesale by the merge — there is no local pre-merge file that does the same thing differently enough to call an "analog"; it competes with `load-terminus-tracker.ts` directly (see Pattern Assignments above), not extends a gap |
| `test/helpers/warn-guard.ts` (upstream) | test utility | event-driven | No existing local mechanism intercepts `logger.warn` in tests at all (confirmed: zero `vi.spyOn(logger` hits in `test/`) — this is a wholesale new capability, not a variant of an existing pattern |

## Metadata

**Analog search scope:** `src/agda/`, `src/session/`, `src/tools/`, `src/tools/data/`, `test/unit/agda/`, `test/unit/tools/`, `test/fixtures/`, `test/helpers/`, `docs/`, plus every file named explicitly in `10-CONTEXT.md`/`10-RESEARCH.md`.
**Files scanned:** 24 read in full or targeted-range this pass (register-core-tools.ts, manifest.ts, tool-recommendation.ts, tool-registration.ts [partial], refactor-helpers.ts, agda-transport.ts, session-load-impl.ts, command-completion.ts, goal-tools.ts, load-terminus-tracker.ts, agent-ux.test.ts, vitest.config.ts, capture-regression-matrix.json, tool-family-examples.json, DEPLOY-OPERATIONS.md [partial], session-load-helpers.ts [partial], register-goal-catalog.ts [partial], project-config.ts [partial], agda-process-spawn.ts [partial], protocol-errors.ts, version-support.ts, spawn-error-listener.test.ts, mcp-e2e-coverage.test.ts, mcp-tool-coverage.json [grep]).
**Pattern extraction date:** 2026-07-05
**Correction filed against RESEARCH.md:** Pattern 2's claim that `usesMimerProofSearch` "already exists in our `src/agda/version-support.ts` (line 176)" does not hold against a live read of that file today (220 lines, function absent) — flagged above with the fallback authoring pattern in case it does not arrive automatically via the merge.
