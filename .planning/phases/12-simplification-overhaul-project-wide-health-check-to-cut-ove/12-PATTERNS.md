# Phase 12: Simplification Overhaul - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 3 new/candidate artifacts, 2 modified scripts, 2 deletion-lockstep file groups (exact deletion targets are TBD — the audit itself produces them, per CONTEXT.md C-05)
**Analogs found:** 5 / 5 classifiable categories (see Phase-Shape Note)

## Phase-Shape Note

This is a subtraction/audit phase, not a feature phase — most "files" this phase touches are either (a) one or two genuinely new artifacts, or (b) an unknown-in-advance set of deletion targets that only exist after the front-half audit runs (CONTEXT.md C-05: "concrete cut targets come from the audit, not from this discussion"). Accordingly:

- The standard role taxonomy (controller/component/service/model/...) doesn't cleanly cover a Markdown audit report or an invariant test; I've extended it pragmatically (`report`, `test`) rather than force-fitting.
- For deletion targets, there is no per-file "copy this code" analog to give — the transferable pattern is a **process checklist** (what else must change in the same commit), not a code excerpt. Those are captured under Shared Patterns, anchored to one real historical deletion commit and the two tests that already mechanically enforce tool-deletion lockstep.
- Baseline-metrics commands and the LOCAL verification-gate command already exist verbatim in `12-RESEARCH.md` § Code Examples — referenced below, not re-derived.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| Health report + severity-graded cut list (name/location TBD — see Pattern 1) | report | batch | `.planning/milestones/v1.1-MILESTONE-AUDIT.md` + `.planning/codebase/CONCERNS.md` | exact |
| New doc-reference invariant test (optional — RESEARCH.md Wave 0 Gap) | test | batch | `test/unit/tools/no-dead-tool-references.test.ts` | exact |
| `scripts/dogfood/run-id.mjs` (proposed name — already the name CONCERNS.md itself recommends) | utility | transform | `scripts/dogfood/flake-classify.mjs`, `scripts/dogfood/transcript-writer.mjs`, `scripts/dogfood/task-manifest.mjs`, `scripts/dogfood/agent-log-selection.mjs` | role-match (no prior "extract a duplicate" analog exists in `scripts/`, but the sibling-focused-module convention is exact) |
| `scripts/dogfood/dogfood-run.mjs` (MODIFIED — delete local `assertSafeRunId`, import from new module) | utility (CLI entrypoint) | event-driven | itself, pre-refactor (lines 110-116, 30-34) | exact (self-analog) |
| `scripts/dogfood/dogfood-wrapup.mjs` (MODIFIED — same edit) | utility (CLI entrypoint) | event-driven | itself, pre-refactor (lines 434-440) + sibling `dogfood-run.mjs`'s identical edit | exact (self-analog) |
| Any `scripts/{dogfood,oracle,queue,team}/*.mjs` cut target (TBD by audit) | utility | varies | Phase 9 deletion commit `a88e369` (`scripts/verify-cold-replay.mjs` + `scripts/promote-capture.mjs`) | exact (real precedent for "what a clean deletion commit looks like") |
| Any `src/tools/**` MCP tool cut target + its lockstep files (TBD by audit; D-02) | controller + config/data + doc | request-response | `src/tools/manifest.ts`, `test/unit/tools/mcp-e2e-coverage.test.ts`, `test/unit/tools/tool-family-examples.test.ts`, Phase 10-03 SUMMARY (reverse/tool-ADD checklist) | exact |

## Pattern Assignments

### Pattern 1: Health report + severity-graded cut list (NEW doc)

**Analogs:** `.planning/milestones/v1.1-MILESTONE-AUDIT.md` (frontmatter + narrative structure) and `.planning/codebase/CONCERNS.md` (per-finding field shape)

**Where to put it:** RESEARCH.md's own "Recommended Project Structure" section explicitly leaves the exact path as the planner's call ("cut-list granularity and report format" is Claude's Discretion in CONTEXT.md) — either a dedicated committed doc (mirroring how `deferred-items.md` was created ad hoc inside `.planning/phases/10-upstream-reconcile/` with no fixed naming template) or a section of a `PLAN.md`'s own output. Do not invent a brand-new report format from scratch; both analogs below already exist and are load-bearing precedent.

**Frontmatter + status/scores shape** (`.planning/milestones/v1.1-MILESTONE-AUDIT.md` lines 1-45):
```markdown
---
milestone: v1.1
audited: 2026-07-05T05:40:00Z
status: tech_debt
scores:
  requirements: 17/17
  phases: 4/4
  integration: 5/5
  flows: 5/5
gaps:
  requirements: []
  integration: []
  flows: []
tech_debt:
  - phase: 06-backlog-digestion-policy-fix-reverify
    items:
      - "Nyquist VALIDATION.md missing (discovery-only flag; run /gsd:validate-phase 6 to close retroactively)"
  - phase: 07-team-feedback-channel-local-wiring
    items:
      - "VERIFICATION 36/38: F-1 (origin push) resolved 2026-07-04; F-2 (libraries-probe gap) recorded as fix-queue entry 2eb1768df88bfb07 (triaged, recurrence 2)"
...
nyquist:
  compliant_phases: []
  partial_phases: []
  missing_phases: ["06", "07", "08", "09"]
  overall: missing
---
```
This is the strongest available precedent for a machine-parseable header the report can carry (phase-grouped findings list, a rollup `status`, explicit `gaps`/`nyquist` arrays). Adapt `tech_debt:` into your cut-list's per-item array; there is **no existing `severity: critical|high|medium|low` field anywhere in this repo's docs** — see No Analog Found below.

**Per-finding field shape** (`.planning/codebase/CONCERNS.md` lines 25-29, chosen because this exact entry is the `assertSafeRunId` finding Pattern 3 below implements):
```markdown
**`assertSafeRunId` duplicated verbatim across both dogfood CLIs:**
- Issue: the identical run-id validation function body (same condition, same character-class checks) exists independently in `scripts/dogfood/dogfood-run.mjs:110-116` and `scripts/dogfood/dogfood-wrapup.mjs:434-440`. Both copies are correct today, but a future change to the validation rule (e.g. a length cap, or rejecting NUL bytes) applied to only one copy would silently leave the other CLI under-validated.
- Files: `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`
- Impact: low today (both copies verified byte-identical and correct against the real default run-id shape), but a latent source of divergence.
- Fix approach: extract to a shared module, e.g. `scripts/dogfood/run-id.mjs` exporting `assertSafeRunId`, imported by both CLIs. (Filed as Info-1 in `.planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md`; explicitly out of scope for that phase's fix pass.)
```
Copy this exact 4-field shape (**Issue / Files / Impact / Fix approach**) per cut-list row — CONTEXT.md D-03 requires "what gets cut, what maintenance it saves, what it breaks" per item, which maps directly onto Files+Fix approach / Impact / Issue respectively. `CONCERNS.md` groups findings under `##` category headers (`Tech Debt`, `Known Bugs`, `Security Considerations`, `Performance Bottlenecks`, `Fragile Areas`, `Scaling Limits`, `Dependencies at Risk`, `Missing Critical Features`, `Test Coverage Gaps` — lines 5, 31, 62, 82, 96, 110, 122, 129, 143); the cut list should group by cut *category* instead (`scripts/dogfood`, `scripts/oracle`, `docs`, `src/tools` MCP surface, `src/` low-risk subtraction — matching D-01's stated cutting emphasis), reusing the same per-item field shape underneath.

**Cross-reference convention** (`CONCERNS.md` lines 29, 80, 155 all use this): a short id + pointer back to the originating review, e.g. `"Filed as Info-3 in .planning/phases/09-residual-v1-0-debt-sweep/09-REVIEW.md"`. Use the same style to cross-reference `RESEARCH.md`'s own findings (e.g. "measured in 12-RESEARCH.md § Common Pitfalls, Pitfall 3") instead of re-deriving evidence already captured there.

---

### Pattern 2: New doc-reference invariant test (NEW, optional — RESEARCH.md Wave 0 Gap)

**Analog:** `test/unit/tools/no-dead-tool-references.test.ts` (full file, 114 lines)

**Why this is optional, not required:** RESEARCH.md's Validation Architecture section is explicit — "No automated check exists today [for docs] ... Manual read-through required ... optional, not required to execute the phase safely." Only build this if the planner wants the doc-lockstep gap closed durably rather than covered by one-time manual review.

**Placement:** `test/unit/tools/` (co-locate with the other two manifest-consistency tests, not a new `test/unit/docs/` directory — no such directory currently exists, and this project colocates by *what it guards*, not by file-extension-of-target).

**Setup pattern to copy verbatim** (lines 15-47 — the `beforeAll`/`afterAll` manifest-population dance is identical across all three existing manifest tests):
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { AgdaSession } from "../../../src/agda-process.js";
import {
  clearToolManifest,
  listToolManifest,
} from "../../../src/tools/manifest.js";
import { registerCoreTools } from "../../../src/tools/register-core-tools.js";

const SRC_ROOT = resolve(import.meta.dirname, "..", "..", "..", "src");

let registeredNames: Set<string>;

beforeAll(async () => {
  clearToolManifest();
  const server = new McpServer({ name: "test", version: "0.0.0-test" });
  const session = new AgdaSession(process.cwd());
  try {
    registerCoreTools(server, session, process.cwd());
  } finally {
    await session.destroy();
  }
  registeredNames = new Set(listToolManifest().map((entry) => entry.name));
});

afterAll(() => {
  // The manifest is process-global; the duplicate-name guard in
  // registerManifestEntry would make a sibling test order-dependent
  // if we left it populated. Snapshot the names in `beforeAll` and
  // tear the manifest down here so subsequent test files start from
  // a clean slate.
  clearToolManifest();
});
```

**Core scanning pattern to widen** (lines 49-61 — currently walks only `.ts` files under `src/`; a new sibling test would call the equivalent walk over `docs/**/*.md`, `README.md`, and `.agents/skills/*/SKILL.md` instead):
```typescript
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}
```
Swap the `.endsWith(".ts")` filter for `.endsWith(".md")` and change the root(s) walked; the regex-match/allowlist/offender-collection logic below it (lines 70-106) is directly reusable as-is — it already only depends on `registeredNames`, which is manifest-derived and doc-format-agnostic.

**Assertion pattern** (lines 106, 112 — reuse both, they guard against different failure modes):
```typescript
expect(offenders).toEqual([]);
// ...
expect(registeredNames.size).toBeGreaterThan(20);
```
The second assertion (registered-tool-set non-triviality) exists specifically so an empty/broken manifest can't make the first assertion vacuously pass — keep this guard in any new sibling test, it is not optional boilerplate.

**Header/regression-fence comment convention** (lines 1-9 — every invariant test in this project explains *why* it exists and *what regressed before*, per CLAUDE.md's Comments convention):
```typescript
// MIT License — see LICENSE
//
// Regression fence: every `agda_*` tool name appearing inside a
// nextAction hint, error message, or tool description in the source
// tree must be a real registered tool. PR #54 introduced four
// references to `agda_file_list` / `agda_search` that did not exist
// — agents following those hints would fail to find the named tool.
// This suite walks src/ and fails if any hint references a tool name
// that the runtime manifest does not know about.
```

---

### Pattern 3: Shared module for `assertSafeRunId` (NEW — `scripts/dogfood/run-id.mjs`)

**Analogs:** `scripts/dogfood/flake-classify.mjs`, `scripts/dogfood/transcript-writer.mjs`, `scripts/dogfood/task-manifest.mjs`, `scripts/dogfood/agent-log-selection.mjs` (the established "focused single-concern sibling module" convention)

**Important scoping finding (drift already present — strengthens the case for extraction):** the two copies are NOT byte-identical (contradicting CONCERNS.md's claim). The validation *logic* is identical; the *error message text* has already drifted:

`scripts/dogfood/dogfood-run.mjs` (lines 101-116):
```javascript
/**
 * IN-01: a `--run-id`/positional run-id value is joined unvalidated
 * into a filesystem path (`join(resolveRunsRoot(), runId)` below, and
 * again in dogfood-wrapup.mjs) — reject anything that looks like an
 * accidentally-swallowed flag token (a missing value silently
 * consuming the NEXT flag, e.g. `--run-id --corpus-root`) or that
 * could escape the runs root once joined (a leading "..", or an
 * embedded "/"/"\\" path separator).
 */
function assertSafeRunId(runId) {
  if (runId.startsWith("--") || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
    throw new Error(
      `invalid --run-id value "${runId}": must not start with "--" or contain a path separator`,
    );
  }
}
```

`scripts/dogfood/dogfood-wrapup.mjs` (lines 425-440) — same condition, different message text and a different calling convention (positional arg here vs. `--run-id`-flag there):
```javascript
/**
 * IN-01: a positional run-id value is joined unvalidated into a
 * filesystem path (`join(resolveRunsRoot(), runId)` below, and again
 * in dogfood-run.mjs) — reject anything that looks like an
 * accidentally-swallowed flag token (e.g. running this CLI with only
 * `--rerun-n 3` and no runId at all lets "--rerun-n" itself land in
 * the positional runId slot) or that could escape the runs root once
 * joined (a leading "..", or an embedded "/"/"\\" path separator).
 */
function assertSafeRunId(runId) {
  if (runId.startsWith("--") || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
    throw new Error(
      `invalid run-id "${runId}": must not start with "--" or contain a path separator`,
    );
  }
}
```
Extraction should keep ONE message format (pick either; the `--run-id`-flag-shaped one is more informative and still correct for `dogfood-wrapup.mjs`'s positional-arg caller since the guard body itself is call-convention-agnostic) — this is a real behavior-normalizing change, not a pure refactor, so call it out explicitly in whatever plan executes it.

**No pre-existing `scripts/lib/` or `scripts/shared/` convention exists in this repo.** Cross-script sharing is done exclusively via direct relative imports of a named sibling `.mjs` file, never a generic grab-bag utils module. Evidence — `dogfood-run.mjs` imports (lines 30-34):
```javascript
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
import { buildHarnessServerParameters } from "../../test/helpers/mcp-harness.js";
import { isMainModule } from "../test-with-sentinel.mjs";
import { loadTaskManifest } from "./task-manifest.mjs";
import { createRunRecorder, resolveRunsRoot, writeRunReport } from "./transcript-writer.mjs";
```
`dogfood-wrapup.mjs` imports (lines 45-53, showing both same-directory and cross-directory sibling imports):
```javascript
import { isMainModule } from "../test-with-sentinel.mjs";
import { runOracle } from "../oracle/run-oracle.mjs";
import { upsertQueueEntry } from "../queue/intake.mjs";
import { classifyFlakiness } from "./flake-classify.mjs";
import { resolveRunsRoot } from "./transcript-writer.mjs";
import { loadTaskManifest } from "./task-manifest.mjs";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
```
So `scripts/dogfood/run-id.mjs` should be a same-directory sibling (not a new top-level `scripts/shared/`), exporting exactly `assertSafeRunId`, imported by both CLIs the same way `./flake-classify.mjs` and `./transcript-writer.mjs` already are.

**File-header convention to follow** (`scripts/dogfood/transcript-writer.mjs` lines 1-9 — every `scripts/*.mjs` file opens with an MIT-license line, then a `//`-comment block on *why*, matching CLAUDE.md's Comments convention applied to `.mjs`):
```javascript
// MIT License — see LICENSE
//
// Plan 05-02's run-recorder interface: an append-only NDJSON
// transcript of every line the proxy relays in either direction, plus
// a per-tool-call tally and a "which agda_capture_session results were
// observed" list, condensed at proxy exit into a JSON + Markdown run
// report under .agda-mcp/runs/<run-id>/ (D-05/D-08). Ships as a
// scripts/ + repo-data-dir artifact — no new MCP verb, no new src/
// tool surface.
```

**Test analog for the new module:** follow `test/unit/tools/dogfood-transcript-writer.test.ts` / `test/unit/tools/dogfood-flake-classify.test.ts` naming (i.e. `test/unit/tools/dogfood-run-id.test.ts`), matching the established `dogfood-<script-or-module-basename>.test.ts` naming convention (NOT a strict 1:1 mirror of the source path — this project's `scripts/` test naming flattens into `test/unit/tools/` with a `dogfood-`/`oracle-`/`queue-`/`team-` prefix rather than mirroring subdirectories).

---

### Pattern 4: Modified — `dogfood-run.mjs` / `dogfood-wrapup.mjs` call-site swap

Once `scripts/dogfood/run-id.mjs` exists, both CLIs delete their local `function assertSafeRunId(runId) { ... }` and add it to their existing sibling-import block (Pattern 3 above shows the exact insertion point — alongside `./task-manifest.mjs`/`./transcript-writer.mjs` in `dogfood-run.mjs`, alongside `./flake-classify.mjs`/`./transcript-writer.mjs`/`./task-manifest.mjs` in `dogfood-wrapup.mjs`). No other call sites change — `parseDogfoodArgv` (lines 125-153) and `parseWrapupArgv` (lines 454-...) stay in their own files; only the inner validator moves.

## Shared Patterns

### A. Script deletion lockstep (generic `scripts/*.mjs` cut)

**Source:** real historical precedent, commit `a88e369` ("feat(09-01): delete verify-cold-replay.mjs and promote-capture.mjs"), diffstat:
```
 scripts/dogfood/dogfood-run.mjs                    |  40 +--
 scripts/promote-capture.mjs                        | 124 -------
 scripts/verify-cold-replay.mjs                     | 371 ---------------------
 .../mcp/dogfood-proxy-passthrough.test.ts          |  28 +-
 4 files changed, 11 insertions(+), 552 deletions(-)
```
**Apply to:** any `scripts/{dogfood,oracle,queue,team}/*.mjs` file the audit's cut list approves for deletion.

**Checklist derived from this real commit** (do all of these in the same commit, not split across commits):
1. `git rm` the script file itself.
2. Grep every OTHER `scripts/**/*.mjs` file for an import of the deleted file's exports (e.g. `grep -rn "from .*promote-capture" scripts/`) — if found, remove/update the call site AND any header-comment prose that describes the now-removed behavior (this commit updated `dogfood-run.mjs`'s header comment to drop a now-false "auto-persists via promote-capture" claim).
3. Find and update/delete the corresponding test. **Caveat, do not assume 1:1:** not every `scripts/*.mjs` file has its own dedicated `test/unit/tools/<prefix>-*.test.ts` — `scripts/verify-cold-replay.mjs`/`scripts/promote-capture.mjs` never had one; the only test that changed was an *integration* test (`dogfood-proxy-passthrough.test.ts`) asserting a side effect the deletion retired. Check `find test -iname "*<script-basename>*"` first (see Metadata note on `install-dogfood-skill.mjs`, which also has none).
4. Check `package.json`'s `scripts` block — **only top-level `scripts/*.mjs` utilities are wired there** (`scripts/test-all-continuing.mjs`, `scripts/test-with-sentinel.mjs`, `scripts/mcp-local-client.mjs`, `scripts/copy-json-assets.mjs`, `scripts/refresh-official-protocol-references.mjs`, `scripts/test-release-full.mjs`). None of the `scripts/{dogfood,oracle,queue,team}/*.mjs` pipeline scripts have a `package.json` entry — they are invoked directly (`npx tsx scripts/dogfood/dogfood-run.mjs ...` per `.agents/skills/agda-dogfooding/SKILL.md`) or as a Docker `CMD`/k8s workload command. Remove a `package.json` entry only if the deleted file is one of the top-level-wired ones.
5. If the deleted script is deploy-relevant (per RESEARCH.md's Deployment & Runtime Surface table — anything under `scripts/oracle/`, `scripts/queue/intake.mjs`, or `scripts/team/`), the commit needs a watched redeploy after push (D-06/D-10 pattern); `scripts/dogfood/*` and `scripts/queue/{dashboard,mirror-github,priority,seed-initial-cargo}.mjs` do not.

### B. MCP tool deletion lockstep (D-02)

**Sources:** `src/tools/manifest.ts` (the runtime SSOT + duplicate-registration guard), `test/unit/tools/mcp-e2e-coverage.test.ts`, `test/unit/tools/tool-family-examples.test.ts`, and `.planning/phases/10-upstream-reconcile/10-03-SUMMARY.md` (the mirror-image tool-**ADD** wiring checklist — read it in reverse for a deletion).

**Apply to:** any tool the audit's cut list approves for deletion or merge (D-02 — no deprecation period).

**Mechanically enforced today (the suite fails immediately if you skip these):**
```typescript
// test/unit/tools/mcp-e2e-coverage.test.ts — strict bidirectional set equality
const manifestNames = listToolManifest().map((entry) => entry.name).sort();
const matrixNames = mcpToolCoverageMatrix.map((entry) => entry.tool).sort();
expect(matrixNames).toEqual(manifestNames);
```
```typescript
// test/unit/tools/tool-family-examples.test.ts — one-directional (only fires if the
// deleted tool happens to be one of the curated examples)
test("every referenced tool name is registered in the live manifest", () => {
  const registered = new Set(listToolManifest().map((entry) => entry.name));
  const referenced = listExampleToolNames();
  ...
});
```
1. Delete the tool's `register()` call site — check `src/tools/register-core-tools.ts`'s 13 top-level calls AND `src/session/{load,process}-tool-registration.ts` (8 of the 74 tools register there instead, per RESEARCH.md's Architectural Responsibility Map). `manifest.ts`'s `registerManifestEntry` guard (lines 113-118) throws on duplicate names, not on orphaned/missing ones — a forgotten manifest entry fails silently at the coverage-matrix test instead, so run that test, don't rely on a startup crash.
2. Delete the matching entry from `test/fixtures/e2e/mcp-tool-coverage.json` (schema in `test/fixtures/e2e/mcp-tool-coverage.ts`: `{ tool, suite, scenario, requiresLiveAgda, requiresBackend? }`).
3. Delete the matching entry from `src/tools/data/tool-family-examples.json` if present (structure: `{ "families": { "<category>": [ { "tool", "summary", "args", "note"? } ] } }`) — only a curated subset of tools appear here, so this step is a no-op for most deletions.
4. **Manual step, no automated check exists (RESEARCH.md Validation Architecture confirms this gap):** grep `README.md` and `docs/assistant-workflows.md` for the tool name and remove/rewrite the reference. README's current tool-mention surface is small by design (lines 89-95: only ~10 illustrative names, and it already defers to the live `agda_tools_catalog` rather than hand-listing everything) — this significantly de-risks D-02's doc burden. If Pattern 2's new invariant test gets built this phase, step 4 becomes mechanically checked too.
5. `src/session/tool-recommendation.ts` — check for an `addIfAvailable(...)` entry recommending the deleted tool (Phase 10-03 added exactly this for a tool-ADD; a tool-DELETE must remove the mirror-image entry).
6. Confirm the deletion doesn't orphan a `test/unit/tools/<tool-family>.test.ts` file's only remaining test case — if the file becomes empty, delete the file too (same "collapse the barrel" instinct CONTEXT.md's Established Patterns section already names for source barrels).

**Reverse-checklist precedent** (`.planning/phases/10-upstream-reconcile/10-03-SUMMARY.md` frontmatter, `provides:` field) — read this as "everywhere a tool-ADD touched, a tool-DELETE must also touch":
```
provides:
  - agda_goal_candidates recommended by tool-recommendation.ts's has-holes branch (priority 4.5, right after agda_context)
  - agda_goal_candidates documented in tool-family-examples.json's "proof" family, README.md's "What it can do", and docs/assistant-workflows.md's goal-level-work section
  - Confirmation (not assumption) that agda_goal_candidates is already manifest-registered end-to-end via upstream's own merge — mcp-e2e-coverage.test.ts was already GREEN before this plan touched any code
```
That plan also demonstrates a useful discipline for the deletion direction: it explicitly verified with a test run whether a registration already existed/still exists rather than assuming — do the same before deleting (`npx vitest run test/unit/tools/mcp-e2e-coverage.test.ts` both before and after the cut).

### C. Generated-doc marker convention (for distinguishing generated vs. authored docs before cutting)

**Source:** `docs/FIX-QUEUE-DASHBOARD.md` line 3:
```markdown
_Regenerated by `scripts/queue/dashboard.mjs` — never hand-edit. The JSON queue file (test/fixtures/fix-queue.json) is the only source of truth (D-03)._
```
**Apply to:** before cutting or hand-editing any `docs/*.md` file, grep its first ~5 lines for a "Regenerated by"/"never hand-edit" marker like this one. A doc cut targeting a generated view should retarget its *generator script* and/or upstream data file, not the rendered Markdown directly.

### D. Baseline metrics + LOCAL verification gate (reference only — do not re-derive)

**Source:** `12-RESEARCH.md` § Code Examples has both of these already, run live against this exact working tree on 2026-07-06. Re-run the same commands rather than inventing new ones, since the health report's before/after diff needs identical measurement commands on both ends:
- "Baseline metrics snapshot" block (file/LOC counts for `src/`, `scripts/`, `test/`, plus the 74-tool count derivation).
- "Real tool-usage aggregation (JSON-RPC-envelope-aware, not a flat grep)" Python snippet — needed if any cut-list item uses "low/zero recorded usage" as supporting evidence (per RESEARCH.md Pitfall 3, a naive grep over-counts; per Pitfall 6/A5, usage alone is never a sole deletion criterion).
- "Regression-lock extraction from fix-queue.json prose" Python snippet — build the C-01 untouchable-test inventory from this before finalizing any cut-list item's "what it breaks" column (RESEARCH.md Pitfall 5: the matrix file alone under-counts locked tests).

**The one command worth inlining here** because every cut-batch and the final phase gate all reuse it verbatim (`12-RESEARCH.md` § Code Examples, "LOCAL full verification gate"):
```bash
export PATH="/Users/eric/.local/share/mise/installs/node/24/bin:$PATH"
npm ci
npm run build
npx tsc -p tsconfig.test.json --noEmit
RUN_AGDA_INTEGRATION=1 npx vitest run
```
This is C-01's actual referee — CI green is explicitly NOT sufficient proof (RESEARCH.md Pitfall 1: CI quarantines 5 files including the flagship `#64/#61` regression-lock test).

## No Analog Found

| Item | Role | Reason |
|---|---|---|
| A `severity: critical\|high\|medium\|low` (or equivalent) grading vocabulary | report field | No file in this repo uses a consistent severity-tier scale. `fix-queue.json`/`FIX-QUEUE-DASHBOARD.md` use `status` (new/triaged/locked) + `defectKind`/`triageClass` (categorical, not severity-ordered); `CONCERNS.md` uses an ad hoc `Priority: High/Medium/Low` field, but ONLY inside its "Test Coverage Gaps" section (lines 149, 155, 161) — every other section omits it. The planner must define a severity scale once, explicitly, in the report's own header rather than assuming an existing convention. |
| Specific deletion-target file list (which `scripts/*.mjs`, which MCP tools, which `src/` dead code) | n/a | Not knowable at pattern-mapping time by design (C-05) — the audit plans produce this list; execution plans consume it. Shared Patterns A/B above give the process, not the targets. |
| A prior "extract a duplicated pure-function validator out of two CLI scripts" refactor | utility extraction | This specific refactor shape (Pattern 3) has no completed precedent in git history — `CONCERNS.md` recommends it (line 29) but it was explicitly deferred, never executed. The sibling-module *convention* it should follow is well-established (see Pattern 3); only the "duplicate-to-shared" transition itself is unprecedented. |

## Metadata

**Analog search scope:** `.planning/codebase/`, `.planning/milestones/`, `.planning/phases/10-upstream-reconcile/`, `test/unit/tools/`, `test/fixtures/e2e/`, `src/tools/`, `scripts/dogfood/`, `scripts/oracle/`, `scripts/queue/`, `scripts/team/`, `README.md`, `docs/assistant-workflows.md`, `docs/FIX-QUEUE-DASHBOARD.md`, `.agents/skills/upstream-sync/SKILL.md`, `package.json`, git history (`git log --diff-filter=D`).
**Files scanned (read in full or targeted range):** `12-CONTEXT.md`, `12-RESEARCH.md`, `CONCERNS.md`, `v1.1-MILESTONE-AUDIT.md`, `v1.0-MILESTONE-AUDIT.md`, `no-dead-tool-references.test.ts`, `mcp-e2e-coverage.test.ts`, `tool-family-examples.test.ts`, `10-03-SUMMARY.md`, `manifest.ts`, `dogfood-run.mjs` (imports + lines 90-159), `dogfood-wrapup.mjs` (imports + lines 420-469), `transcript-writer.mjs` (header), `flake-classify.mjs` (header), `README.md`, `mcp-tool-coverage.ts`/`.json` (structure), `tool-family-examples.json` (structure), `upstream-sync/SKILL.md` (guarded-files section), `docs/assistant-workflows.md` (goal-level-work section), `package.json` (scripts block).
**Pattern extraction date:** 2026-07-05

**Calibration note for the audit (not a pattern-mapping conclusion, flagging for the front-half plan to verify):** CONTEXT.md's Established Patterns claims "Every `scripts/*.mjs` is unit-tested under `test/unit/tools/`." Spot-checking all 8 files in `scripts/dogfood/` found `install-dogfood-skill.mjs` has no corresponding test file under `test/`, and `scripts/dogfood/dogfood-run.mjs:110-116` vs. `dogfood-wrapup.mjs:434-440`'s `assertSafeRunId` copies are not byte-identical as CONCERNS.md line 28 claims (error-message text differs — see Pattern 3). Both are small factual corrections the audit's re-verify-don't-rediscover pass (RESEARCH.md Pattern 1) should fold in.
