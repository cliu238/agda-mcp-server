# Phase 3: Regression Lock Pipeline - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 10 (9 new, 1 modify)
**Analogs found:** 10 / 10 — every new/modified file in this phase has a strong existing analog; this phase is a composition problem, not a new-pattern problem (confirms RESEARCH.md's own framing).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `test/fixtures/capture-regression-matrix.json` | config (data/matrix) | CRUD | `test/fixtures/release-bug-matrix.json` | exact |
| `test/fixtures/capture-regression-matrix.ts` | config (typed loader) | transform | `test/fixtures/release-bug-matrix.ts` | exact |
| `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda` | test fixture | file-I/O | `test/fixtures/agda/FixtureDeps/Transitive/Mid.agda` | exact |
| `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.agda` | test fixture | file-I/O | `test/fixtures/agda/FixtureDeps/Transitive/Base.agda` | exact |
| `test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.broken.agda` | test fixture (mutation payload) | file-I/O | `test/fixtures/agda/FixtureDeps/BrokenTypeDep.agda` | exact |
| `scripts/emit-regression.mjs` | script/CLI (emitter) | batch / transform | `scripts/oracle/run-oracle.mjs` (+ `scripts/promote-capture.mjs`) | exact |
| `test/integration/mcp/capture-regression.test.ts` | test (integration, generic matrix runner) | request-response + batch | `test/integration/agda/agda-fixture-matrix.test.ts` (matrix loop) + `test/integration/mcp/mcp-server.test.ts` (MCP-boundary gating) | exact (composite — needs both) |
| `test/unit/fixtures/capture-regression-matrix.test.ts` | test (unit, matrix integrity) | CRUD | `test/unit/reporting/release-bug-matrix.test.ts` | exact |
| `test/unit/tools/emit-regression.test.ts` | test (unit, scripts-tier logic) | transform | `test/unit/tools/oracle-orcl-01.test.ts` | exact |
| `src/tools/register-capture-session.ts` (MODIFY, ~lines 162-168) | tool (MCP registration) — BLOCKER bug fix | file-I/O | self (see Pattern Assignments — root cause lives in `src/agda/session-capture/dedup-index.ts`) | n/a (self, bug-fix) |

**Note on file placement:** `test/unit/tools/emit-regression.test.ts` corrects RESEARCH.md's speculative `test/unit/scripts/emit-regression.test.ts` path — no `test/unit/scripts/` directory exists in this codebase. Every existing unit test for a `scripts/oracle/*.mjs` module (`oracle-orcl-01.test.ts`, `oracle-orcl-02.test.ts`, `oracle-orcl-03.test.ts`, `oracle-run-oracle.test.ts`, `oracle-verdict-schema.test.ts`, `oracle-cold-agda-session.test.ts`) lives under `test/unit/tools/oracle-*.test.ts`. Follow the real, established convention.

## Reused As-Is (No New File Required)

- **REPRO-01's "scripted re-trigger check"**: do not build a new `scripts/check-repro.mjs`. The predicate ("still reproduces" = warm-green ∧ cold-red) is already exactly `judgeOrcl01`/`runColdLoadAndDiff` (`scripts/oracle/orcl-01-differential.mjs`). Invoke it directly — either `npx tsx scripts/oracle/orcl-01-differential.mjs <capture-path>` as a manual CLI step during trimming, or import `judgeOrcl01` programmatically. Trimming itself (editing the fixture down) stays manual per D-07; only the "did I break the repro" check is scripted, and it already exists.
- **The cold-vs-warm differential / category normalization**: never re-implement. Import `extractErrorCategory`/`categorySet`/`runColdLoadAndDiff` from `scripts/oracle/orcl-01-differential.mjs` wherever the emitted assertion or the emitter itself needs them.
- **The verdict schema/refusal-kind enums**: never invent a parallel format. Consume `scripts/oracle/verdict-schema.mjs`'s `composeVerdict` output and `scripts/oracle/orcl-02-soundness-scan.mjs`'s `judgeOrcl02` kind enum directly (see Pattern Assignments below for the exact shape).

---

## Pattern Assignments

### `test/fixtures/capture-regression-matrix.json` + `.ts` (config, CRUD/transform)

**Analog:** `test/fixtures/release-bug-matrix.ts` (full file, 20 lines) — same directory level (`test/fixtures/`, not `test/fixtures/agda/`), same idiom.

**Exact idiom to copy** (`test/fixtures/release-bug-matrix.ts:1-20`):
```typescript
import { z } from "zod";

import { loadValidatedJsonData } from "../helpers/json-data.js";

const releaseBugEntrySchema = z.object({
  issue: z.number().int().positive(),
  title: z.string().min(1),
  release: z.literal("0.6.2"),
  status: z.enum(["branch-fixed", "verified-live", "closed"]),
  localEvidence: z.array(z.string().min(1)).min(1),
  liveSuites: z.array(z.string().min(1)).min(1),
});

export type ReleaseBugEntry = z.infer<typeof releaseBugEntrySchema>;

export const releaseBugMatrix: ReleaseBugEntry[] = loadValidatedJsonData(
  import.meta.dirname,
  "./release-bug-matrix.json",
  z.array(releaseBugEntrySchema),
);
```

**Secondary analog for optional/regex-validated fields** (`test/fixtures/agda/fixture-matrix.ts:10-23` — shows the `.optional()` + regex-validated version-string idiom the new `serverEnv`/`status` fields need):
```typescript
const fixtureSchema = z.object({
  name: z.string().min(1),
  expectedSuccess: z.boolean(),
  expectedClassification: z.string().min(1),
  minAgdaVersion: z.string().regex(
    /^\d+(\.\d+)*(-[A-Za-z0-9.]+)?$/,
    "minAgdaVersion must be a dotted numeric version, e.g. '2.7.0' or '2.9.0-rc1'",
  ).optional(),
});
```

**Concrete field set** (RESEARCH.md's proposed schema, informed by what the flagship empirically needs — treat as a strong starting point, not final):
```typescript
const captureRegressionEntrySchema = z.object({
  id: z.string().min(1),
  issue: z.array(z.number().int().positive()),
  status: z.enum(["red", "locked"]),
  tool: z.string().min(1),
  fixtureEntry: z.string().min(1),        // relative to test/fixtures/agda/
  serverEnv: z.record(z.string(), z.string()).optional(),
  expected: z.object({
    classification: z.string(),
    success: z.boolean(),
    goalCount: z.number().int().nonnegative(),
    invisibleGoalCount: z.number().int().nonnegative(),
    hasHoles: z.boolean(),
    errorCategories: z.array(z.string()),
  }),
});
```
The loader helper itself (`test/helpers/json-data.ts:1-12`, full file) is a 12-line, already-stable primitive — `loadValidatedJsonData(moduleDir, relativePath, schema)` — do not reimplement it.

**Unit test analog** (`test/unit/reporting/release-bug-matrix.test.ts`, full file, 25 lines — copy this structure directly for `test/unit/fixtures/capture-regression-matrix.test.ts`):
```typescript
import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { releaseBugMatrix } from "../../fixtures/release-bug-matrix.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

test("release bug matrix tracks the 0.6.2 bug set uniquely", () => {
  const issues = releaseBugMatrix.map((entry) => entry.issue);
  expect(issues).toEqual([3, 4, 5, 7, 8]);
  expect(new Set(issues).size).toBe(issues.length);
});

test("release bug matrix references existing evidence files", () => {
  for (const entry of releaseBugMatrix) {
    for (const relativePath of [...entry.localEvidence, ...entry.liveSuites]) {
      expect(existsSync(resolve(REPO_ROOT, relativePath))).toBe(true);
    }
  }
});
```
Adapt to: unique `id`s, `fixtureEntry` paths resolve under `test/fixtures/agda/`, and (LOCK-02's "asserts on the normalized envelope only" requirement) every `expected.errorCategories` entry is a bare category tag (no raw message text).

---

### `test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda` (test fixture, file-I/O)

**Analogs:**
- `test/fixtures/agda/FixtureDeps/Transitive/Base.agda` (full file, the imported leaf):
  ```
  module FixtureDeps.Transitive.Base where

  data Token : Set where
    token : Token
  ```
- `test/fixtures/agda/FixtureDeps/Transitive/Mid.agda` (full file, the importer):
  ```
  module FixtureDeps.Transitive.Mid where

  open import FixtureDeps.Transitive.Base public

  idToken : Token -> Token
  idToken x = x
  ```
- `test/fixtures/agda/FixtureDeps/BrokenTypeDep.agda` (full file, the "deliberately broken" precedent):
  ```
  module FixtureDeps.BrokenTypeDep where

  data Nat : Set where
    zero : Nat

  bad : Nat
  bad = Set
  ```

**Content source:** RESEARCH.md's "Code Examples" section (lines 364-408) already contains the empirically-verified fixture content (6/6 reproducible) — use that content directly. **However, apply one required correction when transcribing it:**

**CRITICAL naming correction — module paths must be fully dotted to match the directory, not bare.** Every existing multi-file fixture in `FixtureDeps/` declares its module name as the FULL dotted path relative to `test/fixtures/agda/` (confirmed across all three: `module FixtureDeps.Transitive.Base where`, `module FixtureDeps.NatCore where`, `module FixtureDeps.BrokenTypeDep where`) — this is required because `test/fixtures/agda/test-fixtures.agda-lib`'s `include: .` makes Agda enforce module-name-matches-relative-path. RESEARCH.md's own illustrative Code Example used bare `module Main where` / `module Dep where` / `open import Dep` for expository brevity in its scratch reproduction — **do not transcribe that verbatim into the checked-in fixture files.** The committed files must read:
```
-- test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.agda
module FixtureDeps.TransitiveStaleness.Dep where
...

-- test/fixtures/agda/FixtureDeps/TransitiveStaleness/Main.agda
module FixtureDeps.TransitiveStaleness.Main where
open import FixtureDeps.TransitiveStaleness.Dep
...

-- test/fixtures/agda/FixtureDeps/TransitiveStaleness/Dep.broken.agda
-- (never loaded directly by Agda — its CONTENT is spliced over Dep.agda
--  mid-test, so it must declare the SAME module name Dep.agda uses)
module FixtureDeps.TransitiveStaleness.Dep where
...
```

**Consequence for the replay runner (see next section):** the isolated tmpdir copy (Pitfall 3) must preserve the `FixtureDeps/TransitiveStaleness/` subdirectory structure inside the tmpdir (copy the whole subtree, not just the two leaf files flattened into the tmpdir root), and the tool call must use the subdirectory-prefixed relative path: `harness.callTool("agda_load_no_metas", { file: "FixtureDeps/TransitiveStaleness/Main.agda" })` — matching the existing `import-graph.test.ts` convention of calling `computeImpact(graph, fixturesRoot, "FixtureDeps/NatCore.agda")` against `fixturesRoot = test/fixtures/agda`.

**No `.agda-lib` change needed** — `test-fixtures.agda-lib`'s `include: .` (2-line file, already read in full) already covers any new subdirectory automatically.

---

### `scripts/emit-regression.mjs` (script/CLI, batch/transform)

**Primary analog:** `scripts/oracle/run-oracle.mjs` (295 lines, read in full) — same shape: read an artifact, call existing sub-predicates, compose one output, write it as a sidecar, wrap in a CLI.

**Header/provenance-comment convention** (`run-oracle.mjs:1-33`) — copy this documentation style (why this ships as `scripts/`, not `src/`; explicit `npx tsx`, never plain `node`, requirement):
```javascript
// Ships as a `scripts/` + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface.
//
// Run with: npx tsx scripts/emit-regression.mjs <path> [flags]
// (NOT plain `node` — see orcl-01-differential.mjs's header for why.)
```

**Imports convention** (`run-oracle.mjs:35-49`, adapt directly):
```javascript
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { isMainModule } from "./test-with-sentinel.mjs";
import { runOracle } from "./oracle/run-oracle.mjs";
import { materializeCaptureEnvironment } from "./oracle/orcl-01-differential.mjs";
import { PathSandboxError, resolveFileWithinRoot } from "../src/repo-root.js";
import { writeFileAtomic } from "../src/session/safe-source-io.js";
```

**Refusal-gate logic (D-06) — exact kinds to check**, read directly from `scripts/oracle/orcl-02-soundness-scan.mjs:539-562` (`judgeOrcl02`'s own return statements):
```javascript
if (policy === null && findings.length > 0) {
  return { kind: "no-policy", findings };
}
if (findings.every((finding) => finding.sanctioned)) {
  return { kind: "clean", findings };
}
return { kind: "cheat-flagged", findings };
```
and `scripts/oracle/verdict-schema.mjs`'s documented enum comment (lines 20-28):
```javascript
//   Orcl01Outcome.kind ∈ "pass" | "server-false-green-candidate" |
//     "inconclusive" | "skip"
//   Orcl02Outcome.kind ∈ "clean" | "cheat-flagged" | "no-policy"
//     (... also "no-target", advisory, never sanctioned/unsanctioned)
```
So the emitter's refusal check is:
```javascript
if (verdict.orcl01.kind === "inconclusive") {
  refuse(`ORCL-01 inconclusive (probe: ${verdict.orcl01.probe})`);
}
if (verdict.orcl02.kind === "cheat-flagged") {
  refuse("ORCL-02 flagged a cheat — never golden-master a postulate/flag cheat as correct");
}
if (verdict.orcl02.kind === "no-policy" && verdict.orcl02.findings.length > 0) {
  refuse("ORCL-02 has no whitelist policy AND non-empty findings — cannot distinguish cheat from sanctioned axiom");
}
// orcl03 is NEVER checked here — advisory by requirement (D-06).
```

**Verdict-sidecar path convention** (`run-oracle.mjs:239-241` — reuse this exact suffix rule, never reconstruct from `dedup.fingerprint`/`recurrence`):
```javascript
const sidecarPath = artifactPath.endsWith(".json")
  ? `${artifactPath.slice(0, -".json".length)}.verdict.json`
  : `${artifactPath}.verdict.json`;
```

**Materializer reuse — the single most important "copy this, NOT that" contrast in this phase (D-08):**

USE `materializeCaptureEnvironment` (`scripts/oracle/orcl-01-differential.mjs:85-131`, already fixes CR-01):
```javascript
for (const entry of sources) {
  if (typeof entry?.path !== "string" || typeof entry?.content !== "string") continue;
  let dest;
  try {
    dest = resolveFileWithinRoot(root, entry.path);
  } catch (err) {
    if (err instanceof PathSandboxError) {
      continue; // Path-traversal entry — skip, never write outside tmpDir.
    }
    throw err;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, entry.content, "utf8");
}
```

NEVER copy `scripts/verify-cold-replay.mjs`'s `materializeSources` (`verify-cold-replay.mjs:110-118` — this is the UNFIXED CR-01 traversal hole, no sandboxing at all):
```javascript
// scripts/verify-cold-replay.mjs:110-118 — DO NOT COPY, has the CR-01 hole:
function materializeSources(tmpDir, inlinedFirstPartySources) {
  for (const entry of inlinedFirstPartySources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string") continue;
    const destPath = join(tmpDir, entry.path); // <-- no sandbox check
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, entry.content, "utf8"); // <-- writes anywhere ".." points
  }
}
```

**Additionally — a NEW use of the sandbox primitive this phase introduces:** unlike ORCL-01 (which only ever writes into a throwaway tmpdir), the emitter writes fixture files into the **tracked repo tree** (`test/fixtures/agda/FixtureDeps/<name>/...`). Apply `resolveFileWithinRoot` a second time here, against the repo root (or at minimum `test/fixtures/agda/`), before writing the emitted fixture files — D-08 explicitly calls this the phase's one genuine new security-relevant surface. Primitive to reuse (`src/repo-root.ts:19-27, 69-76`, full file already read):
```typescript
export class PathSandboxError extends Error {
  readonly targetPath: string;
  constructor(targetPath: string, message: string) { ... }
}

export function resolveFileWithinRoot(projectRoot: string, targetPath: string): string {
  const resolvedRoot = resolve(projectRoot);
  const resolvedPath = resolve(projectRoot, targetPath);
  if (!isPathWithinRoot(resolvedRoot, resolvedPath)) {
    throw new PathSandboxError(targetPath, `Path '${targetPath}' escapes project root`);
  }
  return resolvedPath;
}
```

**CLI wrapper convention** — two precedents, pick the newer idiom: `run-oracle.mjs:262-295` and `scripts/promote-capture.mjs:97-124` (full file, simpler) both follow: parse `argv[0]` as the artifact path, print a `Usage:` line + `process.exitCode = 1` when missing, wrap the real work in try/catch printing `<script-name> failed: <message>` to stderr. **Use the newer `isMainModule` helper** (from `scripts/test-with-sentinel.mjs`, imported by both `orcl-01-differential.mjs:46` and `run-oracle.mjs:38`) for the entry-point guard, not the older raw pathname-compare idiom still present in `promote-capture.mjs:121-124` / `verify-cold-replay.mjs:368-371` (`const modulePath = new URL(import.meta.url).pathname; if (process.argv[1] === modulePath) { ... }`) — the two most recently authored scripts (Phase 2) both already moved to `isMainModule`, prefer that:
```javascript
export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write("Usage: npx tsx scripts/emit-regression.mjs <path-to-artifact.json> [flags]\n");
    process.exitCode = 1;
    return;
  }
  try {
    // ... refusal gate, materialize, write matrix entry, self-verify RED (D-05) ...
  } catch (err) {
    process.stderr.write(`emit-regression failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```

**Fresh-verdict-at-emit-time (Open Question 2's resolution):** call `runOracle(artifactPath)` (`scripts/oracle/run-oracle.mjs`, exported function, line 183) directly as an imported library call — do not shell out and re-parse stdout, and do not trust a possibly-stale pre-existing `.verdict.json` sidecar.

**Write-safety note (unresolved tension worth flagging, not silently picking one):** `run-oracle.mjs` writes its sidecar via `writeFileAtomic` (imported from `src/session/safe-source-io.ts:157-165` — same-directory temp file + `O_CREAT|O_EXCL` + rename), while `promote-capture.mjs` deliberately uses plain `writeFileSync` with an explicit comment explaining why atomicity isn't needed for a "single-writer, out-of-band script run by hand" (`promote-capture.mjs:89-91`). The capture-regression matrix JSON is exactly this same category of repeatedly-hand-run-and-updated file — prefer `writeFileAtomic` (the more recent, more defensive Phase-2 choice) for the matrix write, since it protects against a torn/partial JSON file if the emitter is interrupted mid-write across many future invocations.

---

### `test/integration/mcp/capture-regression.test.ts` (test, integration — the one generic runner)

**Analog 1 — matrix-iteration loop** (`test/integration/agda/agda-fixture-matrix.test.ts:94-106`, adapt the `for` loop shape):
```typescript
for (const fixture of selectedFixtures()) {
  const runFixture = skipForVersion ? test.skip : it;
  runFixture(`${fixture.name}: load and batch typecheck match matrix expectations`, async (ctx) => {
    await withSession(async (session) => { ... });
  });
}
```

**Analog 2 — MCP-boundary gating + harness** (`test/integration/mcp/mcp-server.test.ts:1-39`, full gating preamble — this is the authoritative D-02/D-03-compliant precedent, since it drives the harness at the MCP tool-call boundary, not `AgdaSession` directly):
```typescript
import { createMcpHarness } from "../../helpers/mcp-harness.js";
import { TEST_SERVER_REPO_ROOT } from "../../helpers/repo-root.js";
import { detectAgdaVersion, parseAgdaVersion, versionAtLeast } from "../../helpers/agda-version.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

async function withHarness(run: (harness: any) => Promise<void>, projectRoot = FIXTURES) {
  const harness = await createMcpHarness({ serverRepoRoot: TEST_SERVER_REPO_ROOT, projectRoot });
  try {
    return await run(harness);
  } finally {
    await harness.close();
  }
}
```
Extend `withHarness` to thread the matrix entry's optional `serverEnv` into `createMcpHarness`'s existing `extraEnv` parameter (`test/helpers/mcp-harness.ts:45-59`, full function already read — `extraEnv` merges directly into the spawned server's `env`, see `buildHarnessServerParameters:36-40`).

**`itSince` helper** (`test/helpers/agda-version.ts:22-26`, full file, 11 lines — re-export, don't reimplement):
```typescript
function itSince(minVersion: string) {
  if (!agdaVersion) return test.skip;
  return versionAtLeast(agdaVersion, parseAgdaVersion(minVersion)) ? it : test.skip;
}
```

**Analog 3 — `test.fails` for the RED lifecycle (D-04)**, verified against installed vitest 4.1.2 (RESEARCH.md's own Pattern 3, already confirmed against `node_modules/@vitest/runner/dist/tasks.d-DI5LbrqA.d.ts`):
```typescript
for (const entry of captureRegressionMatrix) {
  const runEntry = entry.status === "red" ? it.fails : it;
  runEntry(`${entry.id}: ${entry.tool} matches ORCL-01 cold expected value`, async () => {
    await withHarness(async (harness) => {
      // ... drive entry's recorded trigger sequence, assert final envelope ...
    }, entry.serverEnv);
  });
}
```

**Isolation idiom — copy the fixture pair into a fresh tmpdir before mutating (Pitfall 3)** — model directly on `test/helpers/isolated-agda-dir.ts` (full file, 29 lines, `withIsolatedAgdaDir`'s `mkdtempSync` + `try/finally` + `rmSync` shape):
```typescript
export async function withIsolatedAgdaDir<T>(run: (agdaDir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "agda-mcp-test-agda-dir-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```
Apply the SAME shape to copy `test/fixtures/agda/FixtureDeps/TransitiveStaleness/` (preserving the subdirectory — see fixture section above) into a fresh `mkdtempSync` dir, `writeFileSync` the `Dep.broken.agda` content over the copy's `Dep.agda` mid-test, and point `projectRoot` at the tmpdir root. Never mutate the checked-in fixture tree directly (breaks parallel/repeated runs — Pitfall 3).

**Assertion target — normalize through the SAME functions ORCL-01 uses, never re-derive** (RESEARCH.md's own verified Code Example, `orcl-01-differential.mjs`'s `extractErrorCategory`/`categorySet`, imported directly):
```typescript
import { categorySet } from "../../../scripts/oracle/orcl-01-differential.mjs";

const data = result.structuredContent.data;
expect(result.structuredContent.classification).toBe(entry.expected.classification);
expect(data.success).toBe(entry.expected.success);
expect(data.goalCount).toBe(entry.expected.goalCount);
expect(data.invisibleGoalCount).toBe(entry.expected.invisibleGoalCount);
expect(data.hasHoles).toBe(entry.expected.hasHoles);
expect(categorySet([...data.errors, ...data.warnings])).toEqual(entry.expected.errorCategories);
```
This is the exact `ToolEnvelope<T>` shape (`src/tools/tool-envelope.ts:27-38`, full file already read) — `{ tool, ok, classification, summary, data, diagnostics, stale?, provenance?, elapsedMs? }`. Never assert on `content[0].text` (raw text) or wire/response ordering — D-03's explicit requirement.

---

### `test/unit/fixtures/capture-regression-matrix.test.ts` (test, unit)

Covered above under the matrix section — analog is `test/unit/reporting/release-bug-matrix.test.ts` in full.

---

### `test/unit/tools/emit-regression.test.ts` (test, unit — scripts-tier logic)

**Analog:** `test/unit/tools/oracle-orcl-01.test.ts` (348 lines; read the header/gating/helpers/path-sandbox-test ranges directly).

**Gating + import-with-no-types convention** (`oracle-orcl-01.test.ts:12-33`):
```typescript
import { afterEach, expect, test } from "vitest";
// @ts-expect-error script module lacks types
import {
  extractErrorCategory,
  judgeOrcl01,
  materializeCaptureEnvironment,
  runProbeGate,
} from "../../../scripts/oracle/orcl-01-differential.mjs";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;
```
The `// @ts-expect-error script module lacks types` comment is required on every import from a `.mjs` script module into a `.test.ts` file under this project's strict TS config — copy it verbatim on the `scripts/emit-regression.mjs` import.

**Synthetic-artifact builder pattern** (`oracle-orcl-01.test.ts:64-104`, `baseArtifact`/`writeArtifact` helpers) — reuse this exact shape to build fake `CaptureArtifact` + verdict-sidecar fixtures for the refusal-gate unit tests, never spawning real Agda for the pure-logic parts:
```typescript
function baseArtifact(overrides = {}): FakeArtifact {
  return {
    capturedAt: new Date().toISOString(),
    manifest: { /* ...all ReplayManifest fields, defaulted... */ ...overrides.manifest },
    recordedActions: overrides.recordedActions ?? [],
    oracleSubstrate: null,
    dedup: { kind: "new-bug", fingerprint: "test-fingerprint", recurrence: 1 },
  };
}
function writeArtifact(artifact: unknown): string {
  const dir = makeTempDir("agda-mcp-orcl01-artifact-");
  const artifactPath = join(dir, "artifact.json");
  writeFileSync(artifactPath, JSON.stringify(artifact), "utf8");
  return artifactPath;
}
```

**The exact path-traversal unit-test shape to mirror for LOCK-01's "materializer rejects path-traversal entries" requirement** (`oracle-orcl-01.test.ts:120-135`, full test — this IS the precedent, reused not reinvented since the emitter's fixture-placement code should reuse the SAME `resolveFileWithinRoot` primitive):
```typescript
test("materializeCaptureEnvironment: writes inlinedFirstPartySources verbatim; refuses a ..-escaping path entry", async () => {
  const artifact = baseArtifact({
    manifest: {
      inlinedFirstPartySources: [
        { path: "Good.agda", content: "module Good where\n" },
        { path: "../PWNED.txt", content: "pwned" },
      ],
    },
  });
  const materialized = await materializeCaptureEnvironment(artifact);
  cleanupFns.push(materialized.cleanup);
  expect(readFileSync(join(materialized.tmpDir, "Good.agda"), "utf8")).toBe("module Good where\n");
  expect(existsSync(join(tmpdir(), "PWNED.txt"))).toBe(false);
});
```
Write the analogous test for whatever new fixture-placement helper `scripts/emit-regression.mjs` adds (writing into `test/fixtures/agda/FixtureDeps/...` rather than a tmpdir) — assert the traversal entry never lands outside `test/fixtures/agda/`.

---

### `src/tools/register-capture-session.ts` (MODIFY — Phase-1 BLOCKER close-out, sequence first)

Per CONTEXT.md's explicit instruction, this fix must land before or as the first task of Phase 3 — it is not a "new file with an analog," it is a targeted bug fix. Documenting the exact current (buggy) pattern and the two remediation directions the Phase-1 verification already named.

**Current buggy code** (`src/tools/register-capture-session.ts:162-168`, already read in full):
```typescript
const captureDir = join(repoRoot, ".agda-mcp", "captures");
mkdirSync(captureDir, { recursive: true });
const stagedPath = join(
  captureDir,
  `${dedup.fingerprint}-${dedup.recurrence}.json`,
);
await writeFileAtomic(stagedPath, JSON.stringify(artifact, null, 2));
```

**Root cause** — `dedup.recurrence` is session-static because it is computed once via `routeDedup(index, fingerprint)` (`src/agda/session-capture/dedup-index.ts:66-75`, full file already read) against an on-disk index that is READ-ONLY in-process; the index only advances via the manual, out-of-band `scripts/promote-capture.mjs`. Two `agda_capture_session` calls in one session with the same classification/note therefore produce the identical `(fingerprint, recurrence)` pair and the identical `stagedPath`, and `writeFileAtomic`'s rename silently clobbers the first artifact.

**Two remediation directions, verbatim from `01-VERIFICATION.md`'s own gap-closure recommendation** (the phase's planner should pick one, not invent a third without cause):
1. "Append a monotonic timestamp/counter" to `stagedPath`'s filename — independent of the (session-static) fingerprint/recurrence pair. Caution if using `capturedAt` (already computed one line earlier at line ~154, an ISO-8601 string): ISO timestamps contain `:` characters — prefer `Date.now()` (numeric epoch millis) or a sanitized/colon-stripped form for filesystem safety.
2. "Check `existsSync(stagedPath)` and refuse/rename on collision rather than silently overwriting."

**Existing unit-test convention to extend** (`test/unit/agda/session-capture/dedup-index.test.ts`, full file, 57 lines) — plain `test()`/`expect()`, `mkdtempSync`-based isolation, one assertion per case:
```typescript
test("routeDedup routes an absent fingerprint as new-bug/recurrence 1", () => {
  const emptyIndex = new Map();
  expect(routeDedup(emptyIndex, "abc123")).toEqual({ kind: "new-bug", fingerprint: "abc123", recurrence: 1 });
});
```
A new regression test for the collision fix (e.g. "two captures in one session never collide on `stagedPath`") belongs in a sibling file next to `register-capture-session.ts`'s existing tests (check `test/unit/tools/` for a `register-capture-session.test.ts` if one exists, else create one following this exact shape) — assert two successive in-process `agda_capture_session` calls (same fingerprint/recurrence) produce two DIFFERENT staged paths, and both files exist afterward with distinct `capturedAt`/content.

**Out of scope for this fix:** `package.json`'s `test:release:bugs`/`test:release:bugs:sentinel` lists (`package.json:43-44`, both hardcoded file-path lists, not globs) do not need updating in Phase 3 — nothing gets promoted to `status: "locked"` until Phase 3.1 (D-09 part 2). `vitest.config.ts`'s `test/integration/**/*.test.ts` glob already covers the new runner automatically; no config change needed either.

---

## Shared Patterns

### ToolEnvelope — the assertion target for every replay
**Source:** `src/tools/tool-envelope.ts:27-38` (full file read)
**Apply to:** the replay runner's every assertion.
```typescript
export interface ToolEnvelope<T extends Record<string, unknown>> {
  tool: string;
  ok: boolean;
  classification: string;
  summary: string;
  data: T;
  diagnostics: ToolDiagnostic[];
  stale?: boolean;
  provenance?: Record<string, unknown>;
  elapsedMs?: number;
}
```
Never assert on `content[0].text` or raw wire text — D-03's explicit requirement (this is what "robust across Agda 2.6.4.3-2.9.0" means in practice).

### classifyLoadResult — the one normalization both warm and cold sides already share
**Source:** `src/agda/session-load-helpers.ts:168-181` (full file read)
**Apply to:** never re-derive `hasHoles`/`isComplete`/`classification` inline anywhere in the emitter or the replay runner; both `orcl-01-differential.mjs`'s cold side and the live server's warm side already funnel through this one function.
```typescript
export function classifyLoadResult(input: {
  success: boolean; goalCount: number; invisibleGoalCount: number; sourceHoleCount: number;
}): { hasHoles: boolean; isComplete: boolean; classification: string } {
  const hasHoles = input.goalCount > 0 || input.invisibleGoalCount > 0 || input.sourceHoleCount > 0;
  const isComplete = input.success && !hasHoles;
  const classification = input.success ? (hasHoles ? "ok-with-holes" : "ok-complete") : "type-error";
  return { hasHoles, isComplete, classification };
}
```

### extractErrorCategory / categorySet — category-set normalization
**Source:** `scripts/oracle/orcl-01-differential.mjs:250-260`
**Apply to:** the emitter's `expected.errorCategories` field AND the replay runner's observed-side comparison — import both from the same place, never a second slightly-different regex.
```javascript
export function extractErrorCategory(message) {
  const match = /\[([A-Za-z][A-Za-z0-9]*)\]/.exec(typeof message === "string" ? message : "");
  return match ? match[1] : "uncategorized";
}
export function categorySet(messages) {
  const unique = new Set((Array.isArray(messages) ? messages : []).map(extractErrorCategory));
  return [...unique].sort();
}
```

### Path-sandboxing — mandatory for every new filesystem-write path this phase adds
**Source:** `src/repo-root.ts:19-27, 69-76` (full file read)
**Apply to:** the emitter's fixture-placement writer (writing into the TRACKED `test/fixtures/agda/...` tree — D-08's mandatory new use) and any re-derived materialization code.

### Matrix + typed-loader idiom
**Source:** `test/helpers/json-data.ts` (full file, 12 lines) + `test/fixtures/release-bug-matrix.ts` / `test/fixtures/agda/fixture-matrix.ts`
**Apply to:** `test/fixtures/capture-regression-matrix.json`/`.ts` — the SSOT idiom, never a standalone generated `.test.ts` per defect (D-01).

### CLI script shape
**Source:** `scripts/oracle/run-oracle.mjs:262-295` (`scriptMain` + `isMainModule` guard) + `scripts/promote-capture.mjs:97-124` (simpler variant)
**Apply to:** `scripts/emit-regression.mjs` — `Usage:` message + `process.exitCode = 1` on missing arg, try/catch wrapping the real work, `<script-name> failed: <message>` to stderr, `isMainModule(import.meta.url, process.argv[1])` entry guard (prefer this over the older raw-pathname-compare idiom).

### `RUN_AGDA_INTEGRATION` / `itSince` gating
**Source:** `test/helpers/agda-version.ts` (full file, 11 lines) + `test/integration/mcp/mcp-server.test.ts:15-26`
**Apply to:** every new integration test — self-skips without `RUN_AGDA_INTEGRATION=1`; `itSince(minVersion)` for any Agda-version-dependent behavior (D-03).

### Isolated-tmpdir-copy-before-mutate
**Source:** `test/helpers/isolated-agda-dir.ts` (full file, 29 lines)
**Apply to:** the replay runner's fixture-pair copy step — never mutate the checked-in `test/fixtures/agda/...` tree directly (Pitfall 3).

### Atomic file writes
**Source:** `src/session/safe-source-io.ts:157-165` (`writeFileAtomic` — same-directory temp file, `O_CREAT|O_EXCL`, then `rename`)
**Apply to:** the emitter's matrix-JSON write (prefer this over plain `writeFileSync`, per the "prefer the more recent, more defensive Phase-2 convention" note above) and any fixture-file writes into the tracked tree.

## No Analog Found

None. Every new/modified file in this phase has a strong existing analog (see File Classification — 10/10). This is consistent with RESEARCH.md's own framing: "every mechanical piece it needs... already exists and ships in Phase 1/2's code."

## Metadata

**Analog search scope:** `test/fixtures/**`, `test/helpers/**`, `test/integration/agda/**`, `test/integration/mcp/**`, `test/unit/agda/session-capture/**`, `test/unit/reporting/**`, `test/unit/tools/**`, `scripts/**`, `scripts/oracle/**`, `src/tools/register-capture-session.ts`, `src/tools/tool-envelope.ts`, `src/agda/session-capture/**`, `src/agda/session-load-helpers.ts`, `src/repo-root.ts`, `src/session/safe-source-io.ts`, `package.json`, `vitest.config.ts`, `.gitignore`.
**Files scanned:** ~35 read/grepped directly (full-file reads for everything ≤ 350 lines; targeted grep-then-read for the two largest: `orcl-01-differential.mjs` 593 lines read whole since still < 2,000-line ceiling, `verify-cold-replay.mjs` 371 lines read whole).
**Pattern extraction date:** 2026-07-02

