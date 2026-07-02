# Phase 4: Triage / Fix Queue - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 13 (6 create, 3 modify-additive, 4 test)
**Analogs found:** 12 / 13 (1 partial — dashboard markdown-builder has no in-repo precedent, noted below)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `<queue-dir>/fix-queue.json` (SSOT data — location TBD, see note below) | config (static data table) | CRUD | `test/fixtures/capture-regression-matrix.json` | exact |
| `<queue-dir>/fix-queue.ts` (typed loader) | model | transform (validate) | `test/fixtures/capture-regression-matrix.ts` | exact |
| `scripts/queue/intake.mjs` | service (CLI script) | CRUD + file-I/O | `scripts/emit-regression.mjs` (append/dup-guard/atomic-write shape) + `scripts/promote-capture.mjs` (dedup bump-in-place) | exact (composite) |
| `scripts/queue/priority.mjs` | utility (pure fn) | transform | `scripts/oracle/verdict-schema.mjs` (`composeVerdict`) | role-match |
| `scripts/queue/dashboard.mjs` | utility (view generator) | transform + file-I/O | `scripts/emit-regression.mjs` (CLI + `writeFileAtomic` shape only — no markdown-builder analog) | partial |
| `scripts/queue/mirror-github.mjs` | service (external CLI shell-out) | request-response / event-driven | `src/agda/session-capture/oracle-substrate.ts` (`resolveBeforeSource`, execFileSync+fallback) + `src/index.ts` (execFileSync security convention) + `scripts/oracle/run-oracle.mjs` (DI seam) | role-match (composite) |
| `src/agda/session-capture/artifact-types.ts` (MODIFY, additive) | model | transform | itself + `src/agda/error-classifier.ts` (`TriageResult`/`TriageClass` being embedded) | exact |
| `src/agda/session-capture/dedup-index.ts` (MODIFY, read-repoint) | service (read layer) | CRUD (read) | itself (existing guarded-read contract) + `scripts/promote-capture.mjs` (`readExistingIndex`) | exact |
| `src/tools/register-capture-session.ts` (MODIFY, additive wiring) | controller (MCP tool adapter) | request-response | itself + `src/tools/agent-ux/edit-tools.ts` (`agda_triage_error` — shows the `classifyAgdaError()` call shape) | exact |
| `test/unit/queue/queue-schema.test.ts` (or `test/unit/tools/fix-queue-*.test.ts` — see naming-convention note) | test | transform validation | `test/unit/fixtures/capture-regression-matrix.test.ts` (freshest) + `test/unit/reporting/release-bug-matrix.test.ts` | exact |
| `test/unit/queue/priority.test.ts` | test (pure fn) | transform | `test/unit/tools/oracle-verdict-schema.test.ts` | exact |
| `test/unit/queue/dashboard.test.ts` | test | transform + file-I/O | `test/unit/tools/emit-regression.test.ts` (tmpdir + writeFileAtomic test shape) | role-match |
| `test/unit/queue/mirror-github.test.ts` | test (mocked subprocess via DI seam) | request-response (mocked) | `test/unit/tools/oracle-run-oracle.test.ts` (DI-seam override + fake-artifact-builder shape) | role-match |

**Placement note (not this agent's decision — CONTEXT.md D-01/Claude's Discretion):** The queue JSON+loader's exact tracked directory is still open. The table above assumes the maximal-idiom-consistency option (sibling `.json`+`.ts` in one directory, exactly like `capture-regression-matrix.{json,ts}`). RESEARCH.md's own primary recommendation instead splits them (`docs/fix-queue.json` + `test/fixtures/fix-queue-schema.ts`), which requires the loader's `loadValidatedJsonData(import.meta.dirname, "../../docs/fix-queue.json", ...)` call to cross directories instead of using a bare `"./fix-queue.json"` sibling reference. Both are mechanically identical once a directory is chosen — this doc gives the pattern; the planner fixes the path.

**Test-directory naming-convention note (concrete finding, not in RESEARCH.md's own recommendation):** RESEARCH.md proposes a new `test/unit/queue/` directory mirroring `scripts/queue/`. But the codebase's *actual established convention* for `scripts/*.mjs` tests is different: every existing `scripts/oracle/*.mjs` and `scripts/emit-regression.mjs` test lives as a **flat, domain-prefixed file directly under `test/unit/tools/`** — `test/unit/tools/oracle-run-oracle.test.ts`, `test/unit/tools/oracle-verdict-schema.test.ts`, `test/unit/tools/oracle-orcl-01.test.ts`, `test/unit/tools/emit-regression.test.ts` — never a `test/unit/scripts/oracle/` subtree. There is no `test/unit/scripts/` directory anywhere in the repo. Per the ranking rule ("prefer recent files, established precedent over a not-yet-used proposal"), the stronger-precedent option is `test/unit/tools/queue-intake.test.ts`, `test/unit/tools/queue-priority.test.ts`, `test/unit/tools/queue-dashboard.test.ts`, `test/unit/tools/queue-mirror-github.test.ts` (or `fix-queue-*.test.ts`), not a new nested `test/unit/queue/`. Flag this conflict for the planner explicitly — both satisfy `vitest.config.ts`'s `test/unit/**/*.test.ts` include glob, so either works mechanically; only precedent-consistency differs. The queue-*schema*-loader test (item 1 in the table) is the one exception: that one genuinely mirrors `capture-regression-matrix.test.ts` and belongs in whatever directory holds the JSON+loader pair itself (`test/unit/fixtures/` if the loader lives in `test/fixtures/`).

## Pattern Assignments

### `<queue-dir>/fix-queue.json` + `<queue-dir>/fix-queue.ts` (config/model, CRUD)

**Analog:** `test/fixtures/capture-regression-matrix.json` + `test/fixtures/capture-regression-matrix.ts` (freshest exact precedent, Phase 3) — secondarily `test/fixtures/release-bug-matrix.json` + `.ts` (Phase 1, simpler shape).

**Full loader pattern to copy** (`test/fixtures/capture-regression-matrix.ts:1-83`):
```typescript
// MIT License — see LICENSE
import { z } from "zod";
import { loadValidatedJsonData } from "../helpers/json-data.js";

const mutationSchema = z.object({ /* nested sub-shape, optional() on the parent field */ });

export const captureRegressionEntrySchema = z.object({
  id: z.string().min(1),
  issue: z.array(z.number().int().positive()),
  status: z.enum(["red", "locked"]),
  tool: z.string().min(1),
  fixtureDir: z.string().min(1),
  entryFile: z.string().min(1),
  mutation: mutationSchema.optional(),
  serverEnv: z.record(z.string(), z.string()).optional(),
  expected: expectedResultSchema,
});

export type CaptureRegressionEntry = z.infer<typeof captureRegressionEntrySchema>;

export const captureRegressionMatrix: CaptureRegressionEntry[] = loadValidatedJsonData(
  import.meta.dirname,
  "./capture-regression-matrix.json",
  z.array(captureRegressionEntrySchema),
);
```

**The loader function itself** (`test/helpers/json-data.ts:1-13`, copy verbatim — do not reimplement):
```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ZodType } from "zod";

export function loadJsonData(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadValidatedJsonData<T>(moduleDir: string, relativePath: string, schema: ZodType<T>): T {
  return schema.parse(loadJsonData(resolve(moduleDir, relativePath)));
}
```
Note: there is a second, simpler `loadJsonData` at `src/json-data.ts:1-13` used by `src/`-side consumers (different signature: `(relativePath, schema, baseUrl)`, URL-based). Do **not** import the `src/` one into a `test/fixtures/*.ts` loader or vice versa — they are deliberately separate per-tier utilities with different call signatures; use whichever matches the tier the queue loader ends up living in (almost certainly the `test/helpers/json-data.ts` one, since every existing matrix-as-SSOT loader uses it).

**Zod schema shape to adapt** — the concrete field set RESEARCH.md already drafted (Code Examples section) is ready to use as-is; it already follows this exact idiom (enum `status`, optional fields, `z.infer` export, `loadValidatedJsonData` call). Key idiom details to preserve:
- `z.enum([...])` for closed sets (`status`, `defectKind`, `triageClass`), never a bare `z.string()`.
- Optional/nullable fields modeled explicitly (`.optional()` vs `.nullable()`) — `capture-regression-matrix.ts`'s `mutation: mutationSchema.optional()` is the precedent for "field genuinely absent on most entries."
- One `z.infer<typeof ...>` type export per schema, named `<Thing>Entry` (matches `CaptureRegressionEntry`, `ReleaseBugEntry`).
- The array-wrapped top-level export (`z.array(entrySchema)`), never a bare object keyed by fingerprint — matches both existing matrices' shape and D-02's "mutate entry in place inside one array" requirement.

### `scripts/queue/intake.mjs` (service, CRUD + file-I/O)

**Analog:** `scripts/emit-regression.mjs` (append-with-duplicate-guard + atomic write) and `scripts/promote-capture.mjs` (dedup bump-in-place on a fingerprint key).

**Append-with-duplicate-refusal + atomic write pattern** (`scripts/emit-regression.mjs:283-305`):
```javascript
export async function writeMatrixEntry(entry, matrixJsonPath) {
  let existing = [];
  if (existsSync(matrixJsonPath)) {
    const raw = readFileSync(matrixJsonPath, "utf8").trim();
    existing = raw.length > 0 ? JSON.parse(raw) : [];
  }
  if (existing.some((existingEntry) => existingEntry.id === entry.id)) {
    throw new Error(`writeMatrixEntry: an entry with id "${entry.id}" already exists in ${matrixJsonPath}`);
  }
  const updated = [...existing, entry];
  await writeFileAtomic(matrixJsonPath, `${JSON.stringify(updated, null, 2)}\n`);
}
```
Intake needs the **opposite** branch on match (bump recurrence in place, D-06) rather than refuse — adapt this shape to: find-by-`fingerprint` → if absent, append with `status: "new"`, `recurrence: 1`; if present, replace that array element with `{ ...existing, recurrence: existing.recurrence + 1, ...freshFields }`, never append a second entry. `scripts/promote-capture.mjs:82-92`'s object-key-overwrite ("re-promoting the same fingerprint updates the entry in place rather than duplicating it") is the exact semantic precedent, just translated from an object-keyed index to an array-of-entries-keyed-by-field shape:
```javascript
// scripts/promote-capture.mjs:82-92 — the "bump in place, never duplicate" precedent
const indexPath = join(repoRoot, ".agda-mcp", "captures", "index.json");
const index = readExistingIndex(indexPath);
index[fingerprint] = { recurrence, kind };   // overwrite, not append
mkdirSync(dirname(indexPath), { recursive: true });
writeFileSync(indexPath, JSON.stringify(index, null, 2));
```

**CLI entry-point pattern to copy** (`scripts/emit-regression.mjs:386-495`, condensed): positional artifact-path arg + flag parsing (`flagValue(argv, "--flag")` helper, `argv.includes("--dry-run")` for booleans), a hoisted-mutable-state try/catch around the whole flow, `process.stderr.write(...)` + `process.exitCode = 1` on failure (never `process.exit()` inside a library function), `process.stdout.write(...)` for success/dry-run output. The `isMainModule` CLI-entry guard:
```javascript
// scripts/emit-regression.mjs:29 (import) + 493-495 (guard)
import { isMainModule } from "./test-with-sentinel.mjs";
// ...
if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```
`isMainModule` itself (`scripts/test-with-sentinel.mjs:12-18`, import — never reimplement):
```javascript
export function isMainModule(moduleUrl, argvPath) {
  if (!argvPath) return false;
  return moduleUrl === pathToFileURL(argvPath).href;
}
```
**Precedent-freshness note:** `scripts/promote-capture.mjs:121-124` has its *own* inline duplicate of this exact check (`const modulePath = new URL(import.meta.url).pathname; if (process.argv[1] === modulePath) {...}`) — that is the *older* Phase-1 pattern. The newer, currently-preferred convention (used by both `emit-regression.mjs` and `scripts/oracle/run-oracle.mjs`) imports the shared `isMainModule` from `test-with-sentinel.mjs`. New `scripts/queue/*.mjs` files should use the shared import, not reinvent the inline check.

**Usage note:** every `.mjs` script under `scripts/` that imports `src/` or `test/` TypeScript modules via `.js`-suffixed specifiers must be run with `npx tsx`, never bare `node` — documented at the top of `scripts/emit-regression.mjs:17-24` and `scripts/oracle/run-oracle.mjs:32-33`. Copy that same header-comment convention into every new `scripts/queue/*.mjs` file that imports `src/repo-root.js` / `src/session/safe-source-io.js` / the queue's own typed loader.

### `scripts/queue/priority.mjs` (utility, pure fn)

**Analog:** `scripts/oracle/verdict-schema.mjs`'s `composeVerdict()` — the closest in-repo precedent for "one pure, deterministic function that composes several already-judged fields into one derived value, with an explicit code comment naming it as the single place this logic may live."

**Pattern to copy** (`scripts/oracle/verdict-schema.mjs:35-71`, structure only — priority's own logic is simpler):
```javascript
/**
 * Compose ... into ONE ... value. The returned ... is the ONLY place
 * composition logic lives (this project's design-charter guardrail) —
 * every input is persisted verbatim alongside it, never collapsed away.
 */
export function composeVerdict({ orcl01, orcl02, orcl03, capturePath, fingerprint, recurrence }) {
  return {
    schemaVersion: 1,
    /* ...verbatim inputs, never re-derived... */
    trueGreen: orcl01.kind === "pass" && orcl02.kind === "clean",   // the ONE boolean expr
  };
}
```
Adapt directly into `comparePriority(a, b)` (RESEARCH.md's own Code Examples section already drafts this correctly — a `DEFECT_KIND_WEIGHT` lookup table + weight-diff-then-recurrence-tiebreak comparator). Both `priority.mjs` and `dashboard.mjs` **must import the same `comparePriority` function** rather than each re-sorting independently — this mirrors `run-oracle.mjs` importing `composeVerdict` from `verdict-schema.mjs` rather than inlining verdict composition at each call site, and mirrors `emit-regression.mjs`'s own comment on `matchesExpected` ("the ONE place ... logic lives ... so the two can never independently drift").

**Existing pure-fn test shape to copy exactly** (`test/unit/tools/oracle-verdict-schema.test.ts:1-11`):
```typescript
import { expect, test } from "vitest";
// @ts-expect-error script module lacks types
import { abstentionMetricLine, composeVerdict } from "../../../scripts/oracle/verdict-schema.mjs";

test("composeVerdict: orcl01 pass + orcl02 clean + orcl03 consistent -> trueGreen true", () => {
  const verdict = composeVerdict({ orcl01: { kind: "pass" }, /* ... */ });
  expect(verdict.trueGreen).toBe(true);
});
```
The `// @ts-expect-error script module lacks types` comment immediately above a relative import of a `.mjs` script is the load-bearing, repeatedly-used idiom (also present in `test/unit/tools/emit-regression.test.ts:17`, `test/unit/tools/oracle-run-oracle.test.ts:19,21`) — every new `test/unit/**/queue-*.test.ts` file that imports `scripts/queue/*.mjs` needs this exact comment immediately above the import line, or `tsc`'s test-compile step (`tsconfig.test.json`) will fail on the untyped `.mjs` specifier.

### `scripts/queue/dashboard.mjs` (utility, transform + file-I/O — PARTIAL analog)

**Analog:** `scripts/emit-regression.mjs`'s CLI shape (arg parsing, stdout/stderr conventions, `isMainModule` guard) and `writeFileAtomic` for the output write. **No in-repo precedent exists for markdown-table generation** — confirmed via RESEARCH.md's own "Don't Hand-Roll" table and this session's own file survey (no markdown-formatting package or hand-rolled table builder found anywhere in `scripts/` or `src/`). This is genuinely new logic; hand-rolling a ~10-20 line string-join (RESEARCH.md's own recommendation) is correct here, not a shortcut.

**Reuse for the write side** (`src/session/safe-source-io.ts:157-173`, same primitive `intake.mjs` uses for the queue JSON):
```typescript
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.agda-mcp-tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, { encoding: "utf-8", flag: "wx" });
    await rename(tmpPath, filePath);
  } catch (err) {
    try { await unlink(tmpPath); } catch { /* ignore cleanup failure */ }
    throw err;
  }
}
```
Import as `../../src/session/safe-source-io.js` from `scripts/queue/dashboard.mjs` (same relative-depth pattern `scripts/oracle/run-oracle.mjs:49` uses: `import { writeFileAtomic } from "../../src/session/safe-source-io.js";`).

**Test shape to copy** (`test/unit/tools/emit-regression.test.ts:1-37`) — tmpdir-per-test with `afterEach` cleanup, deterministic fixed-input-fixture assertions on the generated output string, never a live filesystem/git dependency:
```typescript
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error script module lacks types
import { /* ... */ } from "../../../scripts/emit-regression.mjs";

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});
```

### `scripts/queue/mirror-github.mjs` (service, request-response / event-driven)

**Analog (composite — no single close match, three sources combine):**

**1. execFileSync-not-execSync security convention** (`src/index.ts:19,136-149`, the canonical citation every later shell-out follows):
```typescript
import { execFileSync } from "node:child_process";
// SECURITY: we use execFileSync, not execSync, because agdaBin is derived
// from PROJECT_ROOT which is derived from the AGDA_MCP_ROOT env var (and
// can also be the AGDA_BIN env var directly). execSync's string form runs
// the command through `/bin/sh -c`, which would interpret any shell
// metacharacter in an attacker-controlled env var as a command separator
// (CVE class: CWE-78). execFileSync calls execvp() on the raw path with
// the args array, so the shell is never involved...
const rawVersion = execFileSync(agdaBin, ["--version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  timeout: 5000,
  shell: false,
});
```
Every `gh` invocation in `mirror-github.mjs` must follow this exact shape: `execFileSync("gh", [...argvArray], { encoding: "utf8", shell: false, ... })` — never a template-string command.

**2. Shell-out-with-safe-fallback-on-failure convention** (`src/agda/session-capture/oracle-substrate.ts:31-65`, the closest analog for "shell out to an external tool, treat every failure mode as a soft fallback rather than a thrown error"):
```typescript
export function resolveBeforeSource(session, explicit) {
  if (explicit !== undefined) return { beforeSource: explicit, beforeSourceOrigin: "agent-supplied" };
  if (!session.currentFile) return { beforeSource: null, beforeSourceOrigin: "unavailable" };
  try {
    const beforeSource = execFileSync("git", ["show", `HEAD:${relativePath}`], {
      cwd: session.repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { beforeSource, beforeSourceOrigin: "git-diff" };
  } catch {
    return { beforeSource: null, beforeSourceOrigin: "unavailable" };
  }
}
```
Adapt directly for "`gh` absent or unauthenticated → skip mirror gracefully, never throw" (QUEUE-04's own designed fallback per RESEARCH.md's Environment Availability table): probe with `execFileSync("gh", ["auth", "status"], {...})` wrapped in try/catch, same shape.

**3. Dependency-injection seam for the mocked test** (`scripts/oracle/run-oracle.mjs:176-185`, `scripts/oracle/orcl-01-differential.mjs:350-356`) — the exact seam shape to copy so `test/unit/**/mirror-github.test.ts` never calls the real `gh`:
```javascript
// scripts/oracle/run-oracle.mjs:176-185
/**
 * @param {{ spawnColdAgdaSession?: Function }} [options.deps] -
 *   Dependency-injection seam, used by this module's own tests to
 *   count cold-session spawns ... Never needed by real callers.
 */
export async function runOracle(artifactPath, options = {}) {
  const spawnOverride = options.deps?.spawnColdAgdaSession;
  // ...
}
```
```javascript
// scripts/oracle/orcl-01-differential.mjs:355-356 — the destructure-with-default-to-real-import shape
export async function runColdLoadAndDiff(artifact, materialized, warm, options = {}) {
  const { keepSessionAlive = false, spawnColdAgdaSession: spawnFn = spawnColdAgdaSession } = options;
  // ^ same name shadows the real import; `spawnFn` is what's actually called below
}
```
Adapt as: `export function mirrorEntry(entry, options = {}) { const execFile = options.deps?.execFileSync ?? execFileSync; /* ... execFile("gh", [...]) ... */ }` (this exact shape is also independently proposed in RESEARCH.md's own Code Examples section — the two sources agree). **No existing test in this repo mocks `execFileSync` specifically yet** (the DI-seam precedent so far only covers `spawnColdAgdaSession`) — `test/unit/queue/mirror-github.test.ts` will be the first, but the *shape* of the seam and its test (pass a fake function via `{ deps: { execFileSync: fakeFn } }`, assert on `fakeFn`'s recorded call args) is a direct, mechanical copy of the `run-oracle.mjs`/`orcl-01-differential.mjs` precedent.

**4. Path-sandboxed body-file writes** (if the mirror writes a temp body-file for `gh issue create --body-file`) — reuse `resolveFileWithinRoot`/`PathSandboxError` exactly as `scripts/emit-regression.mjs:128-151`'s `writeFixtureFile` does (sandbox root == intended write base, contain untrusted path segments before joining).

### `src/agda/session-capture/artifact-types.ts` (MODIFY, additive)

**Analog:** itself — the file's own header comment (`artifact-types.ts:1-11`) already documents the exact convention this change must follow: *"Fields not yet implemented in this plan are documented with which later plan populates them; this plan emits explicit placeholder values ... for those fields rather than omitting them, so every consumer can rely on the full shape always being present."* `OracleSubstrate | null` on `CaptureArtifact` (line 116) is the direct precedent for the new field's shape:
```typescript
// artifact-types.ts:111-120 (CaptureArtifact interface, current)
export interface CaptureArtifact {
  capturedAt: string;
  manifest: ReplayManifest;
  recordedActions: RecordedAction[];
  oracleSubstrate: OracleSubstrate | null;
  dedup: DedupRouting;
  note?: string;
}
```
Add `triage: TriageResult | null;` in this same style (never `triage?: TriageResult`, since the project convention is "always present, explicit null" not "optional/absent"), importing `TriageResult` from `../error-classifier.js` (the type already exported at `src/agda/error-classifier.ts:28-33`):
```typescript
// src/agda/error-classifier.ts:28-33 — the type being embedded
export interface TriageResult {
  category: TriageClass;
  confidence: number;
  suggestedAction: TriageSuggestedAction;
  suggestedRename?: string;
}
```
**One nuance vs. the OracleSubstrate precedent:** `oracleSubstrate`/`recordedActions` were *pre-declared as placeholder fields in Phase 1* and only later populated with real data (no interface change needed in the populating phase). `triage` has no such pre-declared placeholder — this is a genuinely new interface member, so both `artifact-types.ts`'s interface AND every literal object that constructs a `CaptureArtifact` (currently only `register-capture-session.ts:168-175`) must be touched together in the same commit, or `tsc --strict` will fail on a missing-property error at the construction site.

### `src/agda/session-capture/dedup-index.ts` (MODIFY, read-repoint)

**Analog:** itself (existing guarded-read contract, must be preserved exactly) + `scripts/promote-capture.mjs`'s `readExistingIndex` (mirrors the same "absent/malformed → safe empty default, never throw" guard on the sibling write-side script).

**Current guarded-read contract to preserve** (`src/agda/session-capture/dedup-index.ts:31-59`, only the file path + parse shape change per RESEARCH.md's Pattern 3):
```typescript
export function readDedupIndex(repoRoot: string): Map<string, DedupIndexEntry> {
  const indexPath = join(repoRoot, ".agda-mcp", "captures", "index.json");  // <- REPOINT this line only
  if (!existsSync(indexPath)) {
    return new Map();
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(indexPath, "utf8"));
    // ... per-entry shape validation, skip malformed entries ...
    return entries;
  } catch {
    // Malformed index.json — never throw, never leak a stack trace to
    // the tool caller (T-01-02). Downgrade to an empty Map.
    return new Map();
  }
}
```
The function's **signature and `Map<string, DedupIndexEntry>` return shape must not change** — only the internal `indexPath` (now the queue file) and the per-item parse loop (now iterating a `FixQueueEntry[]` array and mapping `item.fingerprint`/`item.recurrence` into the same `{recurrence, kind}` shape) change. `routeDedup` (lines 66-75) is untouched entirely.

**Sibling guarded-read precedent on the write side** (`scripts/promote-capture.mjs:23-42`, same defensive shape, useful as a second example of the idiom):
```javascript
function readExistingIndex(indexPath) {
  if (!existsSync(indexPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  } catch {
    return {};
  }
}
```

**Existing test file to extend, not replace** (`test/unit/agda/session-capture/dedup-index.test.ts:1-57`, full file already read — every one of its 4 tests must keep passing against the repointed source):
```typescript
test("readDedupIndex returns an empty Map when .agda-mcp/ is absent", () => { /* ... */ });
test("readDedupIndex never throws on a malformed index.json", () => { /* ... */ });
test("routeDedup routes an absent fingerprint as new-bug/recurrence 1", () => { /* ... */ });
test("routeDedup routes a present fingerprint as update/recurrence+1", () => { /* ... */ });
```
The first two tests' fixture-setup (`mkdirSync(join(dir, ".agda-mcp", "captures"))`, writing `index.json`) must be updated to instead write the queue file at its new location/shape — same `mkdtempSync`/`afterEach rmSync` scaffolding otherwise.

### `src/tools/register-capture-session.ts` (MODIFY, additive wiring)

**Analog:** itself (existing capture flow — the whole 221-line file was read in full) + `src/tools/agent-ux/edit-tools.ts`'s `agda_triage_error` registration (shows exactly how `classifyAgdaError()` is called and what its output looks like).

**Where the wiring lands** — `drainRecordedActions()` already returns the full action log before `triage` classification would run (`register-capture-session.ts:118-119`):
```typescript
// register-capture-session.ts:115-124 (current)
const { actions, truncated, droppedCount } = drainRecordedActions();
resetRecordedActions();

const oracleSubstrate = await buildOracleSubstrate(session, {
  expectedSignature: inputs.expectedSignature,
  beforeSource: inputs.beforeSource,
});
```
Insert triage derivation between these two blocks (or after `oracleSubstrate`, order does not matter — no dependency between them): scan `actions` (each a `RecordedAction` with `tool`/`args`/`normalizedResponse`) for the **last** action whose `tool` is a load-family verb (`agda_load`, `agda_load_no_metas`, `agda_typecheck`), read its raw error text off `normalizedResponse` (confirmed shape: the full `ToolEnvelope`, i.e. `{ ok, summary, classification, data, diagnostics }` — `src/tools/tool-registration.ts:203-212` confirms `normalizedResponse` IS `structuredContent`, never a separate "last error" getter; `LoadResult.errors: string[]` — confirmed at `src/agda/types.ts:78,270` — is where raw text lives inside `data.errors`), then call `classifyAgdaError(errors[0])`; emit `null` when no load-family action or no error text was ever recorded.

**The classifier call shape to copy** (`src/tools/agent-ux/edit-tools.ts:68-82`, `agda_triage_error`'s own callback — the only other call site of `classifyAgdaError` in `src/`):
```typescript
callback: async ({ error }: { error: string }) => {
  const triage = classifyAgdaError(error);
  return makeToolResult(
    okEnvelope({
      tool: "agda_triage_error",
      summary: `${triage.category} (${triage.confidence})`,
      classification: triage.category,
      data: {
        category: triage.category,
        confidence: triage.confidence,
        suggestedAction: triage.suggestedAction as unknown as Record<string, unknown>,
        suggestedRename: triage.suggestedRename,
      },
    }),
  );
},
```
Import `classifyAgdaError` the same way `edit-tools.ts:18` does — via the barrel: `import { classifyAgdaError } from "../agda/agent-ux.js";` (never import directly from `../agda/error-classifier.js`, which would bypass the barrel-facade convention `agda/agent-ux.ts` exists to enforce).

**`CaptureArtifact` construction site to extend** (`register-capture-session.ts:168-175`, add the new `triage` field here, alongside the artifact-types.ts interface change):
```typescript
const artifact: CaptureArtifact = {
  capturedAt: new Date().toISOString(),
  manifest,
  recordedActions: actions,
  oracleSubstrate,
  dedup,
  note: inputs.note,
  // ADD: triage,
};
```

**Existing test file to extend** (`test/unit/tools/register-capture-session.test.ts:1-256`, full file already read) — the fake `McpServer` (`makeCapturingServer()`, lines 33-43), `AgdaSession` construction against `TEST_FIXTURE_PROJECT_ROOT`, and the `staged = JSON.parse(readFileSync(data.stagedPath, "utf8"))` assertion pattern (line 118-120, 183-184) are the exact scaffolding a new "`staged.triage` is `null` when no load-family action ran" / "`staged.triage.category` matches when a load-family action recorded a real error" test pair should reuse.

## Shared Patterns

### Matrix-as-SSOT + typed loader
**Source:** `test/helpers/json-data.ts:10-12` (`loadValidatedJsonData`) + `test/fixtures/capture-regression-matrix.ts:31-82` (consumer idiom)
**Apply to:** the queue JSON file + its typed loader.
```typescript
export const fixQueue: FixQueueEntry[] = loadValidatedJsonData(
  import.meta.dirname, "./fix-queue.json", z.array(fixQueueEntrySchema),
);
```

### Crash-safe atomic writes
**Source:** `src/session/safe-source-io.ts:157-173` (`writeFileAtomic`)
**Apply to:** `scripts/queue/intake.mjs` (queue file), `scripts/queue/dashboard.mjs` (dashboard markdown) — both are "repeatedly hand-run-and-updated" files, the exact category `writeFileAtomic`'s own doc comment names as its use case.

### Path-traversal-safe writes
**Source:** `src/repo-root.ts:69-76` (`resolveFileWithinRoot`/`PathSandboxError`), consumed at `scripts/emit-regression.mjs:128-151`
**Apply to:** any queue/dashboard/mirror-body write whose path is derived from artifact-controlled or entry-controlled data.

### execFileSync-not-execSync (CWE-78 prevention)
**Source:** `src/index.ts:19,136-149`; second precedent at `src/agda/session-capture/oracle-substrate.ts:47-58`
**Apply to:** every `gh`/`git` invocation in `scripts/queue/mirror-github.mjs`.

### Dependency-injection seam for shell-outs/spawns
**Source:** `scripts/oracle/run-oracle.mjs:176-185`, `scripts/oracle/orcl-01-differential.mjs:350-356`
**Apply to:** `scripts/queue/mirror-github.mjs`'s `execFileSync("gh", ...)` calls, so `test/unit/**/mirror-github.test.ts` never shells out for real.
```javascript
const execFile = options.deps?.execFileSync ?? execFileSync;
```

### `isMainModule` CLI-entry guard
**Source:** `scripts/test-with-sentinel.mjs:12-18`, consumed at `scripts/emit-regression.mjs:29,493-495` and `scripts/oracle/run-oracle.mjs:38,293-295`
**Apply to:** every new `scripts/queue/*.mjs` file's `if (isMainModule(import.meta.url, process.argv[1])) { await scriptMain(); }` footer. Do not copy `scripts/promote-capture.mjs:121-124`'s older inline duplicate.

### Guarded, never-throw JSON read
**Source:** `src/agda/session-capture/dedup-index.ts:31-59`, `scripts/promote-capture.mjs:23-42`
**Apply to:** the repointed `readDedupIndex()` and any queue-file read that must degrade gracefully (absent file, malformed JSON) rather than throw.

### `.mjs`-script test-import idiom
**Source:** `test/unit/tools/oracle-verdict-schema.test.ts:10-11`, `test/unit/tools/emit-regression.test.ts:17-24`, `test/unit/tools/oracle-run-oracle.test.ts:19-22`
**Apply to:** every `test/**/*.test.ts` file that imports a `scripts/queue/*.mjs` module.
```typescript
// @ts-expect-error script module lacks types
import { comparePriority } from "../../../scripts/queue/priority.mjs";
```

### `classifyAgdaError()` / `agda_triage_error` (QUEUE-03 — reuse verbatim, do not rebuild)
**Source:** `src/agda/error-classifier.ts:101-194` (pure classifier, 7-class taxonomy), registered as a tool at `src/tools/agent-ux/edit-tools.ts:46-84`
**Apply to:** `register-capture-session.ts`'s new triage wiring (calls the same function directly, not via the tool) and any queue-entry `triageClass` derivation.
Exports: `classifyAgdaError(message: string): TriageResult`, `TriageResult { category: TriageClass; confidence: number; suggestedAction: TriageSuggestedAction; suggestedRename?: string }`, `TriageClass = "mechanical-import" | "mechanical-rename" | "parser-regression" | "coverage-missing" | "proof-obligation" | "dep-failure" | "toolchain"`. Also exported from the same module: `rewriteCompilerPlaceholders`, `extractSuggestedRename`, `normalizeConfidence` — all barrel-re-exported through `src/agda/agent-ux.ts`.

### `fingerprintBugReport()` (stable content-addressed defect identity — reuse verbatim)
**Source:** `src/reporting/bug-report.ts:73-96`, re-exported through `src/agda/session-capture/dedup-index.ts:15`
**Apply to:** any hand-seeded queue entry (the CHG cargo, D-05) that needs a fingerprint computed the same way a live capture would, so a future real re-capture of the same bug bumps recurrence instead of appearing as a new entry (RESEARCH.md Pitfall 3 — use the richer `agda_bug_report_bundle`-style input shape, not `register-capture-session.ts`'s weaker hardcoded-`affectedTool` shape).

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/queue/dashboard.mjs`'s markdown-table generation logic | utility | transform | No markdown-formatting library or hand-rolled table-builder exists anywhere in this repo (`src/` or `scripts/`) — confirmed by file survey. Only the surrounding CLI/write scaffolding has a precedent (see Pattern Assignment above). Hand-rolling a short string-join is RESEARCH.md's own correct recommendation, not a shortcut. |
| `scripts/queue/mirror-github.mjs`'s `gh`-specific argv shapes (`gh issue create --title ... --body-file ... --label bug`, parsing the created issue's URL from stdout since `gh issue create` has no `--json` flag) | service | request-response | No prior `gh` CLI usage exists anywhere in this repo's `scripts/`/`src/` (confirmed — `gh` is invoked only by CI workflow YAML and by this research session's own live introspection, never by in-repo script code). Only the generic execFileSync-security-convention and git-shelling analogs apply (see composite analog above); the `gh`-specific flag/parse logic itself must follow RESEARCH.md's own Code Examples section verbatim, which is the closest thing to a template. |
| `scripts/queue/priority.mjs`'s `DEFECT_KIND_WEIGHT` categorical ordering (`false-green > crash > wrong-result > missing-feature`) | utility | transform | This is new domain logic specific to QUEUE-02's forced requirement — no existing categorical-priority-sort exists in the repo. Structural analog (`composeVerdict`'s "one pure composition fn" shape) applies; the specific weight table does not come from any existing code, only from RESEARCH.md's own Code Examples section. |

## Metadata

**Analog search scope:** `test/fixtures/`, `test/helpers/`, `test/unit/{fixtures,reporting,tools,agda/session-capture}/`, `scripts/`, `scripts/oracle/`, `src/agda/`, `src/agda/session-capture/`, `src/tools/`, `src/tools/agent-ux/`, `src/reporting/`, `src/session/`, `src/repo-root.ts`, `src/index.ts`, `src/json-data.ts`, `docs/`.
**Files scanned (read in full or in targeted ranges):** 24 — `test/fixtures/capture-regression-matrix.{ts,json}`, `test/fixtures/release-bug-matrix.ts`, `test/helpers/json-data.ts`, `src/json-data.ts`, `scripts/emit-regression.mjs`, `scripts/promote-capture.mjs`, `scripts/oracle/run-oracle.mjs`, `scripts/oracle/verdict-schema.mjs`, `scripts/oracle/orcl-01-differential.mjs` (targeted), `scripts/test-with-sentinel.mjs`, `src/agda/error-classifier.ts`, `src/tools/agent-ux/edit-tools.ts`, `src/agda/session-capture/artifact-types.ts`, `src/agda/session-capture/dedup-index.ts`, `src/agda/session-capture/session-capture.ts`, `src/agda/session-capture/oracle-substrate.ts`, `src/tools/register-capture-session.ts`, `src/reporting/bug-report.ts`, `src/session/safe-source-io.ts`, `src/repo-root.ts`, `src/index.ts` (targeted), `src/tools/tool-registration.ts` (targeted), `docs/release-0.7.0-triage.md` (targeted), `test/unit/fixtures/capture-regression-matrix.test.ts`, `test/unit/agda/session-capture/dedup-index.test.ts`, `test/unit/tools/register-capture-session.test.ts`, `test/unit/reporting/release-bug-matrix.test.ts`, `test/unit/agda/agent-ux.test.ts` (targeted), `test/unit/tools/oracle-verdict-schema.test.ts`, `test/unit/tools/oracle-run-oracle.test.ts` (targeted), `test/unit/tools/emit-regression.test.ts` (targeted).
**Pattern extraction date:** 2026-07-02
