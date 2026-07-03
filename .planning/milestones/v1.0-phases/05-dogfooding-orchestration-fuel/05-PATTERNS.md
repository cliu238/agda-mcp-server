# Phase 5: Dogfooding Orchestration + Fuel - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 20 (6 new scripts, 4 new data JSON, 2 new typed-loader/schema modules, 1 new Skill doc + 1 generated symlink, 6 new tests)
**Analogs found:** 20 / 20 (every file has at least a role-match analog; none are genuinely analog-free — see "No Analog Found" for the one partial exception)

This phase is explicitly **compose-not-rebuild** (RESEARCH.md's own framing). Every "hard part" already has a tested implementation in `scripts/oracle/`, `scripts/queue/`, or `test/helpers/`. This map is therefore weighted toward **exact reuse of existing exported functions**, not toward inventing new logic — if a plan proposes non-trivial new logic anywhere other than the pre-flight gate, the transcript tee, or the N-rerun comparison, that is a signal it is re-deriving something Phases 1-4 already built.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/dogfood-run.mjs` | controller (CLI orchestrator/proxy) | streaming + event-driven | `scripts/oracle/cold-agda-session.mjs` (NDJSON tee) + `test/helpers/mcp-harness.ts` (child spawn params) + `scripts/mcp-local-client.mjs` (CLI shape) | composed (3 strong role/dataflow matches, no single exact analog exists) |
| `scripts/dogfood/task-manifest.mjs` | middleware (pre-flight hard gate) | transform (validate) | `test/fixtures/fix-queue.ts` (zod schema) + `scripts/oracle/orcl-02-soundness-scan.mjs`'s `loadOraclePolicy` (validated-load-with-explicit-failure-mode) | role-match |
| `scripts/dogfood/transcript-writer.mjs` | utility (line framing + artifact write) | streaming + file-I/O | `scripts/oracle/cold-agda-session.mjs` (line buffering) + `scripts/oracle/run-oracle.mjs` (`appendFileSync` metrics-line precedent) | role-match |
| `scripts/dogfood/flake-classify.mjs` | service (N-rerun comparison) | batch + transform | RESEARCH.md Pattern 3's own composition sketch, built from REAL exports: `materializeCaptureEnvironment`/`findWarmLoadTuple` (`scripts/oracle/orcl-01-differential.mjs`) + `createMcpHarness` (`test/helpers/mcp-harness.ts`) | composed, novel synthesis (flagged Open Question A5 in RESEARCH.md) |
| `scripts/dogfood-wrapup.mjs` | controller (CLI composition entry point) | batch (pipeline) | `scripts/oracle/run-oracle.mjs` — **exact structural analog**: read artifact → compose N sub-results → write sidecar → CLI wrapper | exact (structure), composed (content) |
| `scripts/install-dogfood-skill.mjs` | utility (one-shot idempotent setup) | file-I/O | `scripts/promote-capture.mjs` (small single-purpose out-of-band script) | role-match |
| `scripts/data/fuel-corpora.json` | config | file I/O (static) | `scripts/data/oracle-policy/agda-unimath.json` | exact (same directory tier, same `$comment` + flat-data convention) |
| `scripts/data/oracle-policy/agda-stdlib.json`, `codex-homotopy-group.json`, `autoformalizing-hopf.json` | config | file I/O (static) | `scripts/data/oracle-policy/agda-unimath.json` | exact |
| `test/fixtures/fuel-corpora.ts` | model (typed loader) | transform | `test/fixtures/fix-queue.ts` / `test/fixtures/capture-regression-matrix.ts` | exact |
| `test/fixtures/task-manifest-schema.ts` | model (zod schema, no committed data instance) | transform | Schema half of `test/fixtures/fix-queue.ts` | role-match |
| `.agents/skills/agda-dogfooding/SKILL.md` | doc (Agent Skill; no code-role fits cleanly) | n/a | `docs/assistant-workflows.md` (content/structure precedent) | partial — see "No Analog Found" |
| `test/unit/tools/dogfood-task-manifest.test.ts` | test | transform | `test/unit/fixtures/capture-regression-matrix.test.ts` (schema-validation unit test) | exact |
| `test/unit/tools/dogfood-run-spawn-options.test.ts` | test | streaming | `test/unit/tools/oracle-cold-agda-session.test.ts` (spawn/DI probe testing) | role-match |
| `test/unit/tools/dogfood-flake-classify.test.ts` | test | batch | `test/unit/tools/oracle-run-oracle.test.ts` (fake-artifact + temp-dir + DI-seam pattern) | exact |
| `test/unit/tools/dogfood-wrapup-filing.test.ts` | test | batch | `test/unit/tools/queue-intake.test.ts` (temp queue-file, never the real tracked one) | exact |
| `test/unit/fixtures/fuel-corpora.test.ts` | test | transform | `test/unit/fixtures/capture-regression-matrix.test.ts` | exact |
| `test/integration/mcp/dogfood-proxy-passthrough.test.ts` | test | request-response | `test/integration/mcp/capture-regression.test.ts` (MCP-harness-driven integration test) | role-match |

**Note on file naming/placement — a real discrepancy with RESEARCH.md's suggested layout:** RESEARCH.md's "Recommended Project Structure" proposes a nested `test/unit/dogfood/` directory and `test/integration/dogfood/`. Direct inspection of this repo's ACTUAL existing convention shows every prior oracle/queue/capture test lives as a **flat, prefixed file** directly under `test/unit/tools/` (`oracle-run-oracle.test.ts`, `oracle-cold-agda-session.test.ts`, `queue-intake.test.ts`, `register-capture-session.test.ts`) or `test/integration/mcp/` (`capture-regression.test.ts`) — there is no `test/unit/oracle/` or `test/unit/queue/` subdirectory anywhere in the repo. The table above follows the **actual, verified convention** (flat + prefixed) rather than RESEARCH.md's proposed nested layout. Flag this explicitly for plan-check.

## Pattern Assignments

### `scripts/dogfood-run.mjs` (controller, streaming + event-driven)

**Analogs:** `scripts/oracle/cold-agda-session.mjs` (NDJSON tee core) + `test/helpers/mcp-harness.ts` (child spawn parameters) + `scripts/mcp-local-client.mjs` (CLI script shape)

**Spawn pattern — argv-array form, never a shell string** (`scripts/oracle/cold-agda-session.mjs:100-116`):
```javascript
let proc;
try {
  proc = spawn(agdaBin, ["--interaction-json", ...extraSpawnArgs], {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (err) {
  const spawnError = err instanceof Error ? err : new Error(String(err));
  // spawn() itself threw synchronously (rare — e.g. a bad cwd).
  return {
    sendCommand: () => Promise.reject(spawnError),
    kill: () => {},
  };
}
```

**Line-buffered NDJSON parsing loop — the exact idiom to mirror for the stdio tee** (`scripts/oracle/cold-agda-session.mjs:152-177`):
```javascript
proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const jsonText = trimmed.startsWith("JSON> ") ? trimmed.slice("JSON> ".length) : trimmed;
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = { raw: jsonText };
    }
    if (pending) {
      pending.responses.push(parsed);
    }
  }
  bumpIdleTimer();
});
```
For the MCP proxy: same split-on-`\n` + `JSON.parse`-with-raw-fallback shape, but **forward the original raw line bytes unchanged** in both directions (never re-serialize a parsed-then-restringified copy) — the parsed copy is for the transcript/report only. No `"JSON> "` prefix-stripping needed (that's Agda's own interactive-mode quirk, not MCP's).

**Child spawn parameters — the exact shape to reuse for `dist/index.js`** (`test/helpers/mcp-harness.ts:20-43`):
```typescript
export function buildHarnessServerParameters({
  serverRepoRoot,
  repoRoot = serverRepoRoot,
  projectRoot = repoRoot ?? serverRepoRoot,
  extraEnv = {},
}: HarnessOptions = {}) {
  const effectiveServerRepoRoot = repoRoot ?? serverRepoRoot;
  if (!effectiveServerRepoRoot) {
    throw new Error("serverRepoRoot is required");
  }
  return {
    command: process.execPath,
    args: [resolve(effectiveServerRepoRoot, "dist/index.js")],
    cwd: effectiveServerRepoRoot,
    env: filterStringEnv({
      ...process.env,
      ...extraEnv,
      AGDA_MCP_ROOT: projectRoot,
    }),
    stderr: "pipe" as const,
  };
}
```
Critically: `serverRepoRoot` (this checkout, resolves `dist/index.js`) and `projectRoot` (the target fuel corpus, becomes `AGDA_MCP_ROOT`) are **two different paths** — this is exactly CHG's "two-location deploy-into-sandbox model" the canonical refs call out. The proxy's own child-spawn must set `extraEnv: { AGDA_MCP_CAPTURE: "1" }` (see Shared Patterns and Pitfall 7 below) alongside `AGDA_MCP_ROOT`.

**CLI script shape (argv parsing → harness → try/finally cleanup)** (`scripts/mcp-local-client.mjs:33-45, 68-97`):
```javascript
async function main() {
  const repoRoot = process.cwd();
  const [command, firstArg, secondArg] = process.argv.slice(2);
  if (!command) { usage(); process.exit(1); }
  // ... arg parsing ...
  const harness = await createMcpHarness({ repoRoot, projectRoot });
  try {
    // ... action dispatch ...
  } finally {
    await harness.close();
    const stderr = harness.getStderr().trim();
    if (stderr) { console.error("\n[server stderr]"); console.error(stderr); }
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
```
`dogfood-run.mjs` is a raw stdio pipe, not an MCP `Client`, so it will `spawn()` the child directly (like `cold-agda-session.mjs`) rather than call `createMcpHarness` — but the `main().catch(...)` / `try/finally` kill-on-exit shape is the convention to reuse for "never leak an orphaned Agda process."

**File header + CLI-sentinel convention (apply to every new script)** — every existing `scripts/oracle/*.mjs` and `scripts/queue/*.mjs` file opens with `// MIT License — see LICENSE` plus a purpose block, and ends with the `isMainModule` sentinel from `scripts/test-with-sentinel.mjs:12-18`:
```javascript
import { isMainModule } from "../test-with-sentinel.mjs"; // or "./test-with-sentinel.mjs" depending on depth
// ...
if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```
Use this exact sentinel (NOT the older `new URL(import.meta.url).pathname === process.argv[1]` form still present in `scripts/promote-capture.mjs:121-123` — that predates the shared helper and should not be copied into new Phase-5 scripts).

**Header comment must document `npx tsx`, not plain `node`, whenever the script imports a `src/`/`test/` `.ts` sibling via a `.js`-suffixed specifier** — every oracle/queue script that does this documents it verbatim (e.g. `scripts/queue/intake.mjs:12-19`); `dogfood-run.mjs` will need this note since it imports `SERVER_REPO_ROOT`/`AGDA_MCP_CAPTURE` gating from `src/repo-root.js` and validates against `test/fixtures/task-manifest-schema.js`.

---

### `scripts/dogfood/task-manifest.mjs` (middleware — pre-flight hard gate)

**Analog:** `test/fixtures/fix-queue.ts`'s zod-schema idiom + `scripts/oracle/orcl-02-soundness-scan.mjs`'s `loadOraclePolicy` explicit-failure-mode loader

**Zod schema shape to copy** (`test/fixtures/fix-queue.ts:44-56`, adapted — same `z.object({...}).min(1)`-on-array idiom):
```typescript
import { z } from "zod";

export const taskManifestEntrySchema = z.object({
  target: z.string().min(1),
  expectedSignature: z.string().min(1),
  corpus: z.string().min(1),
  notes: z.string().optional(),
});

export const taskManifestSchema = z.array(taskManifestEntrySchema).min(1);
```

**Hard-fail-with-clear-stderr pattern to copy** (`scripts/queue/intake.mjs:106-114`, the exact "read arg → validate → clear stderr message → `process.exitCode = 1`, never `process.exit()` inside a reusable function" shape D-03 needs):
```javascript
export async function scriptMain(argv = process.argv.slice(2)) {
  const entryPath = argv[0];
  if (!entryPath) {
    process.stderr.write(
      "Usage: npx tsx scripts/queue/intake.mjs <path-to-entry.json> [queue-json-path]\n",
    );
    process.exitCode = 1;
    return;
  }
  // ...
}
```
Difference for `task-manifest.mjs`: this is a *library* function called from `dogfood-run.mjs`'s own pre-flight (not a standalone CLI), so it should **throw** a descriptive `Error` (or return a discriminated `{ ok: false, reason }`) rather than set `process.exitCode` itself — `dogfood-run.mjs` is the one place that translates a thrown/failed gate into a non-zero exit + stderr message, mirroring how `scripts/oracle/run-oracle.mjs:281-289`'s `scriptMain` wraps `runOracle`'s own throw in one `try/catch`.

**Graceful-degrade-on-malformed-input idiom** (`scripts/oracle/orcl-02-soundness-scan.mjs:63-76`) — useful precedent for "how to fail informatively without throwing raw zod errors":
```javascript
export function loadOraclePolicy(projectKey) {
  if (
    typeof projectKey !== "string"
    || !/^[A-Za-z0-9._-]+$/u.test(projectKey)
    || !/[A-Za-z0-9_-]/u.test(projectKey)
  ) {
    return null;
  }
  try {
    return loadJsonData(`../data/oracle-policy/${projectKey}.json`, oraclePolicySchema, import.meta.url);
  } catch {
    return null;
  }
}
```
Note the CR-01 path-sandbox regex — reuse this EXACT bare-filename validation pattern (`/^[A-Za-z0-9._-]+$/u` + non-all-dot check) if `task-manifest.mjs` or `fuel-corpora.ts` ever resolves a `corpus`/`policyKey` string into a filesystem path; never write a second, laxer validator (see Shared Patterns).

---

### `scripts/dogfood/transcript-writer.mjs` (utility — line framing + artifact writes)

**Analog:** `scripts/oracle/cold-agda-session.mjs` (line buffering) + `scripts/oracle/run-oracle.mjs` (append-only metrics line)

**Append-only log-line pattern to copy for `transcript.jsonl`** (`scripts/oracle/run-oracle.mjs:244-251`):
```javascript
// D-04: one appended line per run, regardless of `only` — lets the
// abstention/INCONCLUSIVE rate be computed later by counting lines.
// mkdirSync-free: the captures directory already exists since the
// artifact itself lives there. Single-writer, out-of-band script —
// appendFileSync (not writeFileAtomic) matches this project's own
// promote-capture.mjs precedent for this exact category of file.
const metricsPath = join(dirname(artifactPath), "oracle-metrics.jsonl");
appendFileSync(metricsPath, `${JSON.stringify(abstentionMetricLine(verdict))}\n`, "utf8");
```
Apply the same reasoning to `.agda-mcp/runs/<run-id>/transcript.jsonl`: a single-writer, out-of-band, append-only stream of many small writes is lower-risk than one mutable file, so `appendFileSync` per line (not `writeFileAtomic`) is the correct, precedent-matching choice — reserve `writeFileAtomic` (below) for the **single-shot** `run-report.json` written once at proxy exit.

**Single-shot atomic write pattern for `run-report.json`** (`scripts/oracle/run-oracle.mjs:239-242`, using `src/session/safe-source-io.ts:157-173`'s `writeFileAtomic`):
```javascript
const sidecarPath = artifactPath.endsWith(".json")
  ? `${artifactPath.slice(0, -".json".length)}.verdict.json`
  : `${artifactPath}.verdict.json`;
await writeFileAtomic(sidecarPath, JSON.stringify(verdict, null, 2));
```
`writeFileAtomic`'s own contract (temp-file + `O_CREAT|O_EXCL` + same-directory `rename()`) is documented in full at `src/session/safe-source-io.ts:125-156` — import it unchanged (`import { writeFileAtomic } from "../../src/session/safe-source-io.js"`), never re-implement.

---

### `scripts/dogfood/flake-classify.mjs` (service — N-rerun classification)

**Analog:** RESEARCH.md's own Pattern 3 composition (every function it calls is REAL and already verified by direct read in this session):

**`materializeCaptureEnvironment` — the artifact-to-temp-dir materializer to reuse unchanged** (`scripts/oracle/orcl-01-differential.mjs:85-131`, full function read):
```javascript
export async function materializeCaptureEnvironment(artifact) {
  const tmpDir = mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-src-"));
  const agdaDirTmp = mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-agdadir-"));
  const root = resolve(tmpDir);
  const sources = Array.isArray(artifact?.manifest?.inlinedFirstPartySources)
    ? artifact.manifest.inlinedFirstPartySources : [];
  for (const entry of sources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string") continue;
    let dest;
    try {
      dest = resolveFileWithinRoot(root, entry.path); // path-sandboxed — CR-01 fix inherited for free
    } catch (err) {
      if (err instanceof PathSandboxError) continue; // traversal entry — skip, never escape tmpDir
      throw err;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.content, "utf8");
  }
  // ... agdaDirContents replay ...
  return { tmpDir, agdaDirTmp, cleanup() { rmSync(tmpDir, ...); rmSync(agdaDirTmp, ...); } };
}
```

**`findWarmLoadTuple` — the "does this capture even have a load-family action" gate** (`scripts/oracle/orcl-01-differential.mjs:269-295`, and the constants it depends on at lines 240/242):
```javascript
export const COMPLETENESS_CLASSIFICATIONS = new Set(["ok-complete", "ok-with-holes", "type-error"]);
const LOAD_FAMILY_TOOL_PATTERN = /^agda_(load|typecheck)/;

export function findWarmLoadTuple(artifact) {
  const actions = Array.isArray(artifact?.recordedActions) ? artifact.recordedActions : [];
  for (let i = actions.length - 1; i >= 0; i--) {
    const action = actions[i];
    if (typeof action?.tool !== "string" || !LOAD_FAMILY_TOOL_PATTERN.test(action.tool)) continue;
    const data = action?.normalizedResponse?.data;
    if (!data || typeof data.file !== "string" || typeof data.classification !== "string") continue;
    // ... returns { file, tuple, categories } ...
  }
  return null;
}
```
**Gate the N-rerun on `findWarmLoadTuple(artifact) !== null`** (Pitfall 4) — anything else classifies trivially as `"not-applicable"` and skips straight to a single oracle pass; never re-run ORCL-02 (no timing-dependent behavior at all).

**`createMcpHarness` — the fresh-warm-session vehicle for each of the N replays** (`test/helpers/mcp-harness.ts:45-76`, already excerpted above under `dogfood-run.mjs` — reused here for a DIFFERENT purpose: N independent fresh server instances against the SAME materialized directory, not one long-lived proxied session).

**DI seam to mirror for testability** (`scripts/oracle/run-oracle.mjs:177-185, 199-203`, the exact `options.deps` unwrap-to-named-param convention already proven in this codebase):
```javascript
/**
 * @param {{ spawnColdAgdaSession?: Function }} [options.deps] -
 *   Dependency-injection seam, used by this module's own tests to
 *   count cold-session spawns... Never needed by real callers.
 */
export async function runOracle(artifactPath, options = {}) {
  const spawnOverride = options.deps?.spawnColdAgdaSession;
  // ...
  ({ orcl01Outcome, orcl03Outcome } = await runSharedOrcl01AndOrcl03(artifact, runOrcl03, spawnOverride));
```
`classifyFlakiness(artifact, n, options)` should expose the analogous `options.deps.createMcpHarness` / `options.deps.materializeCaptureEnvironment` override — this is exactly the seam `test/unit/dogfood-flake-classify.test.ts` needs to inject a fake harness that alternates its return value (per RESEARCH.md's Phase Requirements → Test Map row for success criterion 4), with zero real Agda/subprocess cost.

---

### `scripts/dogfood-wrapup.mjs` (controller — the auto-chained pipeline)

**Analog:** `scripts/oracle/run-oracle.mjs` — this is the single strongest structural analog in the whole phase; the shapes are nearly identical (read one staged artifact → run N composed steps → write one output artifact → append one metrics/log line → CLI wrapper with the same sentinel).

**The exact composition shape to mirror** (`scripts/oracle/run-oracle.mjs:183-258`, abbreviated to the control flow):
```javascript
export async function runOracle(artifactPath, options = {}) {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  // ... run 3 sub-predicates, composing outcomes ...
  const verdict = composeVerdict({ orcl01: orcl01Outcome, orcl02: orcl02Outcome, orcl03: orcl03Outcome, capturePath: artifactPath, fingerprint: artifact?.dedup?.fingerprint ?? "unknown", recurrence: artifact?.dedup?.recurrence ?? 0 });
  await writeFileAtomic(sidecarPath, JSON.stringify(verdict, null, 2));
  appendFileSync(metricsPath, `${JSON.stringify(abstentionMetricLine(verdict))}\n`, "utf8");
  process.stdout.write(`orcl01=${orcl01Outcome.kind} orcl02=${orcl02Outcome.kind} orcl03=${orcl03Outcome.kind} trueGreen=${verdict.trueGreen}\n`);
  return verdict;
}
```
`dogfood-wrapup.mjs`'s `wrapUpCapture(artifactPath, artifact, queueJsonPath)` (RESEARCH.md's own Code Examples section already sketches this against REAL imports) follows the identical shape, substituting: `runOracle(artifactPath)` for the 3-predicate composition, `classifyFlakiness(...)` for the extra N-rerun step, and `upsertQueueEntry(...)` for the sidecar write.

**`composeVerdict`'s `trueGreen` invariant — read, never re-derive** (`scripts/oracle/verdict-schema.mjs:52-69`):
```javascript
export function composeVerdict({ orcl01, orcl02, orcl03, capturePath, fingerprint, recurrence }) {
  // ...
  trueGreen: orcl01.kind === "pass" && orcl02.kind === "clean",
```
`fileIfDefect` in the wrap-up must check `verdict.trueGreen` (never re-derive its own truthiness from `orcl01`/`orcl02` fields directly) — this is the "subtle, already-tested invariant" the Don't-Hand-Roll table warns against re-deriving.

**`upsertQueueEntry` — the exact filing call** (`scripts/queue/intake.mjs:66-93`, full function read):
```javascript
export async function upsertQueueEntry(entryData, queueJsonPath, options = {}) {
  const bumpRecurrence = options.bumpRecurrence !== false;
  const existing = readQueueFile(queueJsonPath);
  const existingIndex = existing.findIndex((entry) => entry.fingerprint === entryData.fingerprint);
  const candidate = existingIndex === -1 ? entryData : { ...existing[existingIndex], ...entryData, recurrence: bumpRecurrence ? existing[existingIndex].recurrence + 1 : existing[existingIndex].recurrence };
  const validated = fixQueueEntrySchema.parse(candidate); // throws on invalid, file left untouched
  // ... writeFileAtomic ...
  return validated;
}
```
Note `fixQueueEntrySchema`'s enum has no "flaky" `defectKind` value (see Pitfall 6 in RESEARCH.md) — the wrap-up must route flaky classifications to a SEPARATE side-channel file (e.g. `appendFileSync` into `.agda-mcp/runs/<id>/flaky-captures.jsonl`, same append-only idiom as `transcript-writer.mjs` above), never attempt to file them through `upsertQueueEntry`.

---

### `scripts/install-dogfood-skill.mjs` (utility — idempotent symlink installer)

**Analog:** `scripts/promote-capture.mjs` (the closest existing "small, single-purpose, out-of-band script with no committed test fixture of its own" precedent)

**Idempotent-existence-check-before-mutate shape to copy** (`scripts/promote-capture.mjs:29-42`, adapted from index-read to symlink-check):
```javascript
function readExistingIndex(indexPath) {
  if (!existsSync(indexPath)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(indexPath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  } catch {
    return {};
  }
}
```
The same "check first, degrade gracefully, never throw on the common case" shape applies to the symlink check (`existsSync(claudeLink)` before `symlinkSync`), as RESEARCH.md's own Code Examples section (`scripts/install-dogfood-skill.mjs` sketch) already demonstrates using `SERVER_REPO_ROOT` from `src/repo-root.js` — reuse that constant rather than `process.cwd()` (this script must work regardless of the caller's cwd, unlike `promote-capture.mjs` which deliberately DOES use `process.cwd()` as a fallback for a different reason — cross-machine capture promotion).

---

### `scripts/data/fuel-corpora.json` + `scripts/data/oracle-policy/{agda-stdlib,codex-homotopy-group,autoformalizing-hopf}.json` (config)

**Analog:** `scripts/data/oracle-policy/agda-unimath.json` (exact — full file read):
```json
{
  "$comment": "Interim pre-PROC-02 sanctioned-axiom whitelist + required-flag baseline for the agda-unimath fuel corpus (Phase 2, ORCL-02). Formal policy home + hardened flag-baseline re-check land in Phase 5 (PROC-02) / AUTO-07. Values sourced from .planning/research/FUEL-CORPORA.md.",
  "sanctionedAxioms": ["univalence", "function-extensionality", "replacement"],
  "requiredFlags": ["--without-K", "--exact-split", "--no-import-sorts", "--auto-inline", "--no-require-unique-meta-solutions", "--no-postfix-projections"],
  "forbiddenFlags": []
}
```
The 3 new sibling policy files (`agda-stdlib.json` likely near-empty per RESEARCH.md, `codex-homotopy-group.json`/`autoformalizing-hopf.json` populated from `FUEL-CORPORA.md`'s already-inventoried facts) must validate against the SAME `oraclePolicySchema` at `scripts/oracle/orcl-02-soundness-scan.mjs:35-40` unchanged:
```javascript
const oraclePolicySchema = z.object({
  $comment: z.string().optional(),
  sanctionedAxioms: z.array(z.string()),
  requiredFlags: z.array(z.string()),
  forbiddenFlags: z.array(z.string()),
});
```
`scripts/data/fuel-corpora.json` itself (the NEW top-level manifest cross-referencing pinned commits to `policyKey`) has no direct sibling file yet — RESEARCH.md's Pattern 4 sketch is the template; it should sit in the SAME `scripts/data/` directory (not a new top-level location) per the "matrix-as-SSOT lives under `scripts/data/`" convention this directory already establishes.

---

### `test/fixtures/fuel-corpora.ts` (model — typed loader)

**Analog:** `test/fixtures/capture-regression-matrix.ts` (exact — full file read):
```typescript
import { z } from "zod";
import { loadValidatedJsonData } from "../helpers/json-data.js";

export const captureRegressionEntrySchema = z.object({ /* ... */ });
export type CaptureRegressionEntry = z.infer<typeof captureRegressionEntrySchema>;

export const captureRegressionMatrix: CaptureRegressionEntry[] =
  loadValidatedJsonData(import.meta.dirname, "./capture-regression-matrix.json", z.array(captureRegressionEntrySchema));
```
`fuel-corpora.ts` follows this pattern **verbatim**, exporting `fuelCorpora: FuelCorpusEntry[]` validated against a `fuelCorpusEntrySchema` (`{ key, repo, access: z.enum(["public","private"]), pinnedRef, policyKey, notes }`). **Important seam distinction** (do not conflate the two `loadJsonData` functions in this repo — they have different signatures and different callers):
- `test/helpers/json-data.ts:10-12`'s `loadValidatedJsonData(moduleDir, relativePath, schema)` — used by every `test/fixtures/*.ts` typed loader (this is the one `fuel-corpora.ts` should use).
- `src/json-data.ts:4-12`'s `loadJsonData(relativePath, schema, baseUrl)` — used by `scripts/oracle/orcl-02-soundness-scan.mjs`'s `loadOraclePolicy` to read `scripts/data/oracle-policy/*.json` at runtime from a `.mjs` script (NOT from `test/fixtures/`). `fuel-corpora.ts`'s own schema should cross-reference `policyKey` but must NOT re-implement policy loading — `loadOraclePolicy(projectKey)` stays the single, unchanged, CR-01-hardened entry point (see Don't-Hand-Roll below).

---

### Test files (all)

**Analog for temp-dir-per-test + `afterEach` cleanup, DI via constructor options** (`test/unit/tools/queue-intake.test.ts`, full 127-line file read):
```typescript
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { readQueueFile, upsertQueueEntry } from "../../../scripts/queue/intake.mjs";

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
Every new `scripts/dogfood-*` test (`dogfood-wrapup-filing.test.ts` especially — RESEARCH.md itself says "never the real tracked `test/fixtures/fix-queue.json`") must use this exact temp-dir-per-test shape, never touch the real tracked fixture files.

**Analog for `RUN_AGDA_INTEGRATION`-gated real-Agda tests + fake-artifact builders** (`test/unit/tools/oracle-run-oracle.test.ts:1-110`):
```typescript
import { detectAgdaVersion } from "../../helpers/agda-version.js";
const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;
// ... baseArtifact(overrides) helper builds a minimal-but-schema-shaped fake CaptureArtifact ...
```
`dogfood-flake-classify.test.ts` needs the SAME `agdaAvailable`/`RUN_AGDA_INTEGRATION` gating for any test that spawns a real harness, plus its own `baseArtifact()`-style builder (or import the one from `oracle-run-oracle.test.ts` if it is exported/shared — check before duplicating).

**Analog for matrix-schema unit tests** (`test/unit/fixtures/capture-regression-matrix.test.ts`, full 66-line file read):
```typescript
test("capture regression matrix loads and validates, even when empty", () => {
  expect(Array.isArray(captureRegressionMatrix)).toBe(true);
});
test("capture regression matrix entries have unique ids", () => {
  const ids = captureRegressionMatrix.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
});
```
`test/unit/fixtures/fuel-corpora.test.ts` mirrors this exactly, plus RESEARCH.md's own required check: "every `policyKey` resolves via the EXISTING `loadOraclePolicy()`" — i.e. add `expect(loadOraclePolicy(entry.policyKey)).not.toBeNull()` (or the documented near-empty-policy equivalent) per fuel-corpora entry.

## Shared Patterns

### File header + MIT License comment block
**Source:** every file in `scripts/oracle/*.mjs`, `scripts/queue/*.mjs`, `src/**/*.ts`
**Apply to:** every new file in this phase (scripts, data-loader `.ts` modules — NOT the `.json` data files themselves, which use `"$comment"` instead, see below)
```javascript
// MIT License — see LICENSE
//
// <one paragraph: what this module is, which requirement ID it
// implements, and — for scripts/ files — the "Ships as scripts/ +
// repo-data-dir artifact per D-05 — no new MCP verb, no new src/ tool
// surface" disclaimer every Phase-2/4 oracle/queue script already
// carries>
```

### `isMainModule` CLI sentinel
**Source:** `scripts/test-with-sentinel.mjs:12-18`, consumed by every current `scripts/oracle/*.mjs` and `scripts/queue/*.mjs`
**Apply to:** `dogfood-run.mjs`, `dogfood-wrapup.mjs`, `install-dogfood-skill.mjs` (any script meant to be both `import`ed by tests AND run standalone)
```javascript
export function isMainModule(moduleUrl, argvPath) {
  if (!argvPath) return false;
  return moduleUrl === pathToFileURL(argvPath).href;
}
// consumer:
if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```
Do NOT copy the older `new URL(import.meta.url).pathname === process.argv[1]` form still present in `scripts/promote-capture.mjs:121-123` (a Phase-1 predecessor to the shared helper) — `isMainModule` is the current, tested convention.

### `writeFileAtomic` for single-shot artifact writes; `appendFileSync` for append-only logs
**Source:** `src/session/safe-source-io.ts:157-173` (writeFileAtomic); `scripts/oracle/run-oracle.mjs:250-251` (appendFileSync precedent)
**Apply to:** `transcript-writer.mjs` (`run-report.json` = atomic single-shot; `transcript.jsonl`/`flaky-captures.jsonl` = append-only), `dogfood-wrapup.mjs` (delegates to `writeFileAtomic` transitively via `runOracle`/`upsertQueueEntry`, never calls `fs.writeFileSync` directly)
```typescript
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.agda-mcp-tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, { encoding: "utf-8", flag: "wx" });
    await rename(tmpPath, filePath);
  } catch (err) {
    try { await unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}
```

### `options.deps` dependency-injection seam
**Source:** `scripts/oracle/run-oracle.mjs:177-185` (`options.deps?.spawnColdAgdaSession`) unwrapped into `scripts/oracle/orcl-01-differential.mjs:355-356`'s named-param override (`spawnColdAgdaSession: spawnFn = spawnColdAgdaSession`)
**Apply to:** `flake-classify.mjs` (inject `createMcpHarness`/`materializeCaptureEnvironment`), `dogfood-run.mjs` (inject `spawn` itself, per RESEARCH.md's own Phase Requirements → Test Map row: "assert on the constructed spawn options, dependency-injected `spawn`, mirroring `run-oracle.mjs`'s own `spawnColdAgdaSession` DI seam")
```javascript
export async function someFn(input, options = {}) {
  const override = options.deps?.someRealFunction;
  // use `override ?? realFunctionDefault` wherever the real call happens
}
```

### Path-sandboxed filename/key validation (CR-01 lineage)
**Source:** `src/repo-root.ts:19-27, 69-76` (`PathSandboxError`, `resolveFileWithinRoot`) + `scripts/oracle/orcl-02-soundness-scan.mjs:63-70`'s bare-filename regex
**Apply to:** any new code resolving a `corpus`/`policyKey`/`target` string (task-manifest, fuel-corpora) into a filesystem path
```typescript
export function resolveFileWithinRoot(projectRoot: string, targetPath: string): string {
  const resolvedRoot = resolve(projectRoot);
  const resolvedPath = resolve(projectRoot, targetPath);
  if (!isPathWithinRoot(resolvedRoot, resolvedPath)) {
    throw new PathSandboxError(targetPath, `Path '${targetPath}' escapes project root`);
  }
  return resolvedPath;
}
```
Reused UNCHANGED and inherited "for free" by `flake-classify.mjs` via `materializeCaptureEnvironment`; never write a second, laxer path validator anywhere in this phase.

### `zod` + typed-loader matrix-as-SSOT idiom
**Source:** `test/helpers/json-data.ts:10-12` (`loadValidatedJsonData`) — the SAME idiom used by `test/fixtures/fix-queue.ts` and `test/fixtures/capture-regression-matrix.ts`
**Apply to:** `test/fixtures/fuel-corpora.ts`, `test/fixtures/task-manifest-schema.ts`
```typescript
export function loadValidatedJsonData<T>(moduleDir: string, relativePath: string, schema: ZodType<T>): T {
  return schema.parse(loadJsonData(resolve(moduleDir, relativePath)));
}
```

### `spawn()` argv-array form — never a shell string
**Source:** confirmed convention across `scripts/oracle/cold-agda-session.mjs:102`, `test/helpers/mcp-harness.ts:33-34`, `scripts/oracle/orcl-01-differential.mjs:399-405`
**Apply to:** `dogfood-run.mjs`'s child spawn (the single highest-value security rule this phase must not violate — an untrusted/artifact-controlled path reaching a shell string is exactly the "Tampering" threat pattern RESEARCH.md's Security Domain table names)

### Directory-layout precedent for a composing entry script + focused siblings
**Source:** `scripts/oracle/` (contains `run-oracle.mjs` — the entry point — FLAT alongside `orcl-01-differential.mjs`/`orcl-02-soundness-scan.mjs`/`orcl-03-conformance.mjs`/`verdict-schema.mjs`/`cold-agda-session.mjs`, all in ONE directory) and `scripts/queue/` (same: `intake.mjs`/`priority.mjs`/`dashboard.mjs`/`mirror-github.mjs`/`seed-initial-cargo.mjs` all flat in one directory, no separate root-level entry script)
**Note for planner:** RESEARCH.md's own "Recommended Project Structure" proposes `scripts/dogfood-run.mjs` + `scripts/dogfood-wrapup.mjs` at the `scripts/` ROOT with helpers in a `scripts/dogfood/` SUBDIRECTORY — a layout with no exact precedent in this repo. The verified, existing convention is "one directory per concern, entry point(s) and helper siblings all flat inside the SAME subdirectory." A closer-to-convention alternative worth flagging to the planner: `scripts/dogfood/{dogfood-run,dogfood-wrapup,task-manifest,transcript-writer,flake-classify}.mjs`, all flat under one new `scripts/dogfood/` directory, invoked as `npx tsx scripts/dogfood/dogfood-run.mjs ...`. Not a locked decision (Claude's Discretion covers "proxy CLI shape") — presented as a pattern-consistency observation, not a correctness requirement.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.agents/skills/agda-dogfooding/SKILL.md` | doc (Agent Skill) | n/a | No `SKILL.md` or any Agent-Skill-shaped file exists anywhere in this repo today (`.agents/`, `.claude/`, `.codex/` all confirmed empty of skill content by direct `ls`) — this is genuinely greenfield packaging. **Best partial content/structure analog:** `docs/assistant-workflows.md` (numbered `## N. <topic>` sections, a fenced tool-call example, then a `**What you get:**` bullet list, then a `**Typical pattern:**` numbered flow) — this repo's own established "how to tell an agent to use these tools" writing convention, even though it targets a different doc format/discovery mechanism. RESEARCH.md's own Code Examples section already provides a full SKILL.md frontmatter+body skeleton grounded in D-07/Pitfall-3's external findings (CHG's `.codex/skills/agda-unimath-skills/SKILL.md`, not directly readable — private repo — but referenced secondhand in FUEL-CORPORA.md) — use that skeleton for structure, `docs/assistant-workflows.md` for this repo's own voice/format conventions (concrete tool-call blocks, not abstract prose). |

Every other file in this phase has at least a role-and-dataflow-matching analog (see table above) — the "compose-not-rebuild" premise holds throughout.

## Metadata

**Analog search scope:** `scripts/oracle/`, `scripts/queue/`, `scripts/*.mjs` (root), `scripts/data/oracle-policy/`, `test/helpers/`, `test/fixtures/`, `test/unit/tools/`, `test/unit/fixtures/`, `test/integration/mcp/`, `src/repo-root.ts`, `src/json-data.ts`, `src/session/safe-source-io.ts`, `src/agda/session-capture/`, `src/tools/register-capture-session.ts`, `docs/*.md`, `.agents/`, `.claude/`, `.codex/`, `package.json`, `.gitignore`

**Files scanned (read in full or targeted-range):** `scripts/oracle/cold-agda-session.mjs` (full, 477 lines), `scripts/oracle/run-oracle.mjs` (full, 295 lines), `scripts/oracle/orcl-01-differential.mjs` (targeted: 1-140, 269-320, 355-419 of 593 lines), `scripts/oracle/orcl-02-soundness-scan.mjs` (targeted: 1-80 of 601 lines), `scripts/oracle/verdict-schema.mjs` (grep-targeted), `scripts/queue/intake.mjs` (full, 131 lines), `scripts/queue/priority.mjs` (full, 64 lines), `scripts/promote-capture.mjs` (full, 124 lines), `scripts/mcp-local-client.mjs` (full, 103 lines), `scripts/test-with-sentinel.mjs` (full, 67 lines), `scripts/data/oracle-policy/agda-unimath.json` (full, 13 lines), `test/helpers/mcp-harness.ts` (full, 97 lines), `test/helpers/json-data.ts` (full, 13 lines), `src/json-data.ts` (full, 12 lines), `src/repo-root.ts` (full, 98 lines), `src/session/safe-source-io.ts` (full, 173 lines), `src/agda/session-capture/artifact-types.ts` (full, 155 lines), `src/tools/register-capture-session.ts` (full, 234 lines), `test/fixtures/fix-queue.ts` (full, 109 lines), `test/fixtures/capture-regression-matrix.ts` (full, 82 lines), `test/unit/tools/queue-intake.test.ts` (full, 127 lines), `test/unit/tools/oracle-run-oracle.test.ts` (targeted: 1-110 of 299 lines), `test/unit/fixtures/capture-regression-matrix.test.ts` (full, 66 lines), `test/unit/tools/oracle-cold-agda-session.test.ts` (grep-targeted), `docs/assistant-workflows.md` (full, 206 lines), `docs/extensions.md` (full, 217 lines), `package.json` (partial), `.gitignore` (full)

**Pattern extraction date:** 2026-07-02
