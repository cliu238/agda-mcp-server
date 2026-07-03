# Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance) - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 11 new-file targets (5 scripts, 1 policy-data file, 4 test files, 1 fixture group) + 1 conditionally-modified file
**Analogs found:** 10 / 11 direct role-match or better; 1 (verdict composition shape) has no full analog — nearest conceptual neighbors only

**Verified before mapping:** `git log --oneline` shows no `01-06-SUMMARY.md`/`01-07-SUMMARY.md` and no completion commit for either gap-closure plan — RESEARCH.md's Assumption A4 is CONFIRMED STILL TRUE as of this mapping. `scripts/verify-cold-replay.mjs` on disk today still has both CR-01 (no path-containment check in `materializeSources`) and CR-02 (`coldResponsesLookLikeSuccess([])` returns `true` on an empty responses array — a false PASS) unfixed. Every pattern excerpt below is taken from the **current, unfixed** file; ORCL-01's plan must design around both bugs rather than copy them forward (see Pattern Assignments and Shared Patterns below).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/oracle/orcl-01-differential.mjs` | script (differential verifier) | batch + subprocess (event-driven within one batch run) | `scripts/verify-cold-replay.mjs` | exact (same domain — cold `Cmd_load` replay + verdict — but analog has 2 known unfixed bugs, see note above) |
| `scripts/oracle/cold-agda-session.mjs` | service/utility (disposable subprocess lifecycle) | event-driven/streaming | `scripts/verify-cold-replay.mjs`'s `runColdLoad()` | partial (spawn/collect/idle shape reusable; kills proc after ONE command — must be extended to survive a 2nd command for ORCL-03, no existing code does this) |
| `scripts/oracle/orcl-02-soundness-scan.mjs` | script (static soundness/pragma scan) | transform/batch | `src/tools/agent-ux/project-tools.ts` (`agda_postulate_closure`) + `src/agda/source-parsers.ts` | role-match (closure-walk-then-scan composition already exists; whitelist-diff + widened pragma vocabulary is new) |
| `scripts/oracle/orcl-03-conformance.mjs` | script (conformance/advisory proxy) | transform | `src/agda/expression-operations.ts` (`inferTopLevel`) | role-match (thin wrapper around one IOTCM command; only the two-line command-construction is reusable, not the whole module — see note below) |
| `scripts/oracle/verdict-schema.mjs` | model (schema + composition rule) | transform | `src/tools/tool-envelope.ts` + `src/agda/completeness.ts` | conceptual-only (discriminated-outcome idea is standard here; no existing file composes 3 sub-verdicts into one gate — see "No Analog Found") |
| `scripts/data/oracle-policy/<project-key>.json` (+ loader) | config/data | static lookup | `src/protocol/data/*.json` + `src/protocol/command-registry.ts` + `src/json-data.ts` | exact (SSOT `loadJsonData()` + zod pattern; content schema itself is new — see "No Analog Found") |
| `test/unit/tools/oracle-orcl-01.test.ts` | test | n/a | `test/unit/agda/session-capture/oracle-substrate.test.ts` (+ target spec `01-07-PLAN.md`'s `test/unit/tools/verify-cold-replay.test.ts`, not yet landed) | role-match |
| `test/unit/tools/oracle-orcl-02.test.ts` | test | n/a | `test/unit/tools/check-postulates.test.ts` | exact (pure scan-function unit tests, no I/O) |
| `test/unit/tools/oracle-orcl-03.test.ts` | test | n/a | `test/unit/agda/session-capture/oracle-substrate.test.ts` | role-match |
| `test/unit/tools/oracle-verdict-schema.test.ts` | test | n/a | `test/unit/agda/session-capture/dedup-index.test.ts` | exact (pure discriminated-result function, `test()` + `toEqual`) |
| New fixtures: `TerminatingExample.agda`, `PrimTrustMeExample.agda`, `CompilePragmaExample.agda`, `LibBase.agda`+`WithKOverride.agda` under `test/fixtures/agda/` | test fixture (Agda source) | n/a | `test/fixtures/agda/WithK.agda`, `WithPostulates.agda` | exact |
| `scripts/verify-cold-replay.mjs` (conditionally modified — extend-vs-fork is plan-phase discretion per D-05) | script | batch + subprocess | itself (baseline) | n/a — see CR-01/CR-02 note above |

All four `oracle-orcl-0N.test.ts` / `oracle-verdict-schema.test.ts` files also share the **"testing a `scripts/*.mjs` export from a `.test.ts` file"** idiom, for which the exact, currently-existing analog is `test/unit/tools/copy-json-assets.test.ts` (see Shared Patterns).

## Pattern Assignments

### `scripts/oracle/orcl-01-differential.mjs` (script, batch+subprocess)

**Analog:** `scripts/verify-cold-replay.mjs` — same file materializes sources, spawns a cold `agda --interaction-json`, and produces a PASS/FAIL/SKIP verdict. Do not copy verbatim: it has two known, unfixed bugs (CR-01, CR-02) and only checks "any DisplayInfo Error" instead of the real classification tuple.

**Hand-rolled IOTCM construction to REPLACE with `tsx` import** (`scripts/verify-cold-replay.mjs:35-55`):
```javascript
function escapeAgdaString(s) { /* hand-rolled re-derivation */ }
function quoted(text) { return `"${escapeAgdaString(text)}"`; }
function stringList(values) { /* ... */ }
function iotcmEnvelope(filePath, innerCommand) {
  return `IOTCM "${escapeAgdaString(filePath)}" NonInteractive Direct (${innerCommand})`;
}
```
Replace with the verified-importable SSOT (RESEARCH.md's own tested example):
```javascript
import { command, quoted, stringList, iotcmEnvelope } from
  "/Users/eric/projects6/agda-mcp-server/src/protocol/command-builder.js";
// invoke with: npx tsx scripts/oracle/orcl-01-differential.mjs  (NOT plain node)
const innerCommand = command("Cmd_load", quoted(materializedPath), stringList(mergedArgv));
const iotcm = iotcmEnvelope(materializedPath, innerCommand);
```

**CR-01 fix target — `materializeSources()` has NO containment check** (`scripts/verify-cold-replay.mjs:107-118`):
```javascript
function materializeSources(tmpDir, inlinedFirstPartySources) {
  for (const entry of inlinedFirstPartySources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string") continue;
    const destPath = join(tmpDir, entry.path);   // <-- no containment check; entry.path
    mkdirSync(dirname(destPath), { recursive: true }); //     with ".." escapes tmpDir
    writeFileSync(destPath, entry.content, "utf8");
  }
}
```
Fix using the exact containment primitive already used elsewhere in `src/` (`src/repo-root.ts:69-95`):
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
Import `resolveFileWithinRoot`/`PathSandboxError` via `tsx` and call it on `join(tmpDir, entry.path)` (with `tmpDir` as root) before every `writeFileSync`, per `01-07-PLAN.md`'s own spec (`must_haves.truths`: "refuses to write any file outside the freshly created temp replay directory... even when ... path contains `..` traversal segments").

**CR-02 fix target — empty response silently reads as success** (`scripts/verify-cold-replay.mjs:222-228`):
```javascript
function coldResponsesLookLikeSuccess(responses) {
  for (const response of responses) {
    if (response?.kind !== "DisplayInfo") continue;
    if (response?.info?.kind === "Error") return false;
  }
  return true;   // <-- an EMPTY responses array also returns true (false PASS)
}
```
Replace this whole function with `parseLoadResponses()` + `classifyLoadResult()` (both real functions, imported via `tsx`), and use `parseLoadResponses(...).sawLoadTerminus` (`src/agda/parse-load-responses.ts:193-197`) as the explicit "did Agda actually finish" gate before trusting `success` at all — this is the CR-02 fix `01-07-PLAN.md` specifies (INCONCLUSIVE, not PASS, on an evidence-free stream) and simultaneously fixes Pitfall 3 (crude Error-presence scan) in one move:
```typescript
const sawLoadTerminus =
  responses.some((resp) => resp.kind === "InteractionPoints") ||
  decodeDisplayInfoEvents(responses).some(
    (event) => event.infoKind === "AllGoalsWarnings" || event.infoKind === "Error",
  );
```

**The normalized classification tuple to diff (both warm and cold MUST go through this)** — `src/agda/session-load-helpers.ts:162-175`:
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
The 3-value union this normalizes into is `src/agda/completeness.ts:7-10`'s `CompletenessClassification = "ok-complete" | "ok-with-holes" | "type-error"` — per RESEARCH.md's Pitfall 4, ORCL-01's tuple-diff must **only** engage when the captured warm classification is one of these 3 values; anything else (`"invalid-command-line-options"`, `"load-incomplete-no-terminus"`, `"process-died-during-reconciliation"`, `"not-found"`, etc.) has no meaningful cold counterpart and should map to a `SKIP`-equivalent outcome, mirroring `verify-cold-replay.mjs`'s existing `SKIP` verdict (`scripts/verify-cold-replay.mjs:266-272`).

**Anti-pattern to avoid — do NOT call this for the cold run** (`src/agda/library-registration.ts:164-198`, `createLibraryRegistration`):
```typescript
export function createLibraryRegistration(repoRoot: string): LibraryRegistration {
  // ... reads live ~/.agda / AGDA_DIR, mkdtempSync's a NEW temp dir every call ...
```
Non-deterministic per RESEARCH.md's Anti-Patterns section — ORCL-01 must replay the captured `manifest.agdaDirContents` (`src/agda/session-capture/artifact-types.ts:41-45`) verbatim (write its `libraries`/`defaults` lines into a fresh `AGDA_DIR` for the cold run), never re-derive via this function.

**Closure-hash probe — reuse the exact hash function against the materialized temp dir** (`src/agda/session-capture/import-closure-hash.ts:75-109`, `hashImportClosure`):
```typescript
export function hashImportClosure(repoRoot: string, filePath: string, agdaVersion?: AgdaVersion): string | null {
  const files = closureFileSet(repoRoot, filePath, agdaVersion); // buildImportGraph/computeImpact walk
  const hash = createHash("sha256");
  for (const relPath of files) { hash.update(relPath); hash.update("\0"); /* ...file bytes... */ hash.update("\0"); }
  return hash.digest("hex");
}
```
Since `buildImportGraph`/`computeImpact` only ever walk files under the given root (comment at `import-closure-hash.ts:13-17`), calling `hashImportClosure(tmpDir, materializedRelPath, agdaVersion)` **against the temp replay dir after materialization** should reproduce `manifest.importClosureHash` bit-for-bit if materialization was faithful — this IS the closure-hash probe, not a new algorithm.

**Version-match probe — reuse parsing/comparison, but NOT `detectAgdaVersion()` as-is** (`src/agda/agda-version.ts:99-106`):
```typescript
export function detectAgdaVersion(): AgdaVersion | undefined {
  try {
    const output = execSync("agda --version", { stdio: "pipe" }).toString(); // hardcoded "agda" on PATH
    return parseAgdaVersion(output);
  } catch { return undefined; }
}
```
This resolves plain `"agda"` on PATH, not the pinned `manifest.agdaBinaryPath`. Reuse `parseAgdaVersion`/`compareVersions`/`formatVersion` (`src/agda/agda-version.ts:24-58`) via `tsx`, but invoke the version probe yourself with `execFileSync(pinnedAgdaBin, ["--version"])` (argv-array form) — matching this project's own security convention (CLAUDE.md: "execFileSync, never execSync, to avoid shell-injection via env-derived paths"), since `manifest.agdaBinaryPath` is data read from a captured artifact, not a trusted literal.

**Test analog** — `test/unit/agda/session-capture/oracle-substrate.test.ts:24-42` for the `RUN_AGDA_INTEGRATION` gating idiom + temp-dir lifecycle (see Shared Patterns for full excerpt).

---

### `scripts/oracle/cold-agda-session.mjs` (service/utility, event-driven)

**Analog:** `scripts/verify-cold-replay.mjs`'s `runColdLoad()` (`scripts/verify-cold-replay.mjs:145-220`) — spawn/collect/idle-timeout shape is directly reusable, but it is architected for exactly ONE command then kill:
```javascript
function runColdLoad(agdaBin, cwd, iotcmCommand) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(agdaBin, ["--interaction-json"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    // ... buffer/newline-split JSON parsing, idle timer, hard timeout ...
    const finish = (result) => {
      if (settled) return;
      settled = true;
      // ...
      try { proc.kill("SIGTERM"); } catch { /* already gone */ }   // <-- kills after ONE round trip
      resolvePromise(result);
    };
    // ...
    proc.stdin.write(`${iotcmCommand}\n`);
  });
}
```
**Gap (Pitfall 7, no existing code covers this):** ORCL-03's `Cmd_infer_toplevel` requires a file already loaded in the SAME session (`ctx.requireFile()` in `src/agda/expression-operations.ts:21,36,54,69` — every expression command calls this first). No existing script sends a second IOTCM command to an already-spawned cold process and waits for a second response before killing it. `cold-agda-session.mjs` must refactor `runColdLoad`'s shape into a re-usable `{ proc, sendCommand(iotcm) -> Promise<responses>, kill() }` lifecycle object so ORCL-01 issues `Cmd_load` first and ORCL-03 (if `expectedSignature` is present) issues `Cmd_infer_toplevel` against the same still-open `proc` before either predicate calls `kill()`.

**Idle/newline-delimited JSON parsing to reuse as-is** (`scripts/verify-cold-replay.mjs:182-206`, the `proc.stdout.on("data", ...)` handler) — the `"JSON> "` prefix-stripping and per-line `JSON.parse` fallback-to-raw pattern is correct and should carry forward unchanged.

---

### `scripts/oracle/orcl-02-soundness-scan.mjs` (script, transform/batch)

**Analog 1 — closure-walk-then-scan composition:** `src/tools/agent-ux/project-tools.ts:86-123` (`agda_postulate_closure` handler body):
```typescript
const graph = buildImportGraph(repoRoot, session.getAgdaVersion() ?? undefined);
const impact = computeImpact(graph, repoRoot, filePath);
const deps = new Set<string>();
if (impact) {
  for (const dep of impact.directDependencies) deps.add(dep);
  for (const dep of impact.transitiveDependencies) deps.add(dep);
}
deps.add(relative(repoRoot, filePath));
// ...
for (const dep of deps) {
  const abs = resolve(repoRoot, dep);
  if (!existsSync(abs)) continue;
  let source: string;
  try { source = readFileSync(abs, "utf8"); } catch { continue; }  // per-file try/catch, never abort whole scan
  const sites = extractPostulateSites(source);
  // ...
}
```
This is a genuine full-BFS transitive closure already (`src/agda/import-graph.ts:327-351`, `collectReachable` — O(n+e), index-cursor BFS, not `Array.shift()`) — RESEARCH.md confirms **no rewrite needed here**, only extend the scan vocabulary applied per-file.

**Analog 2 — the scan primitives to extend:** `src/agda/source-parsers.ts`:
```typescript
// Lines 34-42
export function parseOptionsPragmas(source: string): string[] {
  const options: string[] = [];
  const re = /\{-#\s*OPTIONS\s+([^#]+)#-\}/gmu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) { options.push(...splitWords(m[1])); }
  return options;
}
// Lines 129-171: extractPostulateSites(source) — handles inline `postulate p q : Set`
// AND indented block form; reuse VERBATIM for ORCL-02's postulate half.
```
`parseOptionsPragmas` extracts `--with-K`/`--safe`/etc. flags already; it does NOT currently scan for `{-# TERMINATING #-}`, `{-# NO_POSITIVITY_CHECK #-}`/`NO_UNIVERSE_CHECK`, `primTrustMe`, or `{-# COMPILE ... #-}` — these need new regex/token scans in the same file-scanning style (line-based, block-comment-stripped first via `stripBlockComments`/`stripAgdaBlockComments` — two near-identical implementations already exist at `src/agda/import-graph.ts:99-123` and `src/tools/file/check-postulates.ts:59-87`; pick one, do not add a third).

**The verified, empirically-tested `--with-K` override cheat fixture pair** (RESEARCH.md Code Examples, confirmed against local Agda 2.8.0, exit 0 / zero diagnostics) — seed both ORCL-02's scan-target vocabulary and the new test fixtures from this exact pair:
```agda
{-# OPTIONS --without-K #-}
module LibBase where
open import Agda.Builtin.Equality
libLemma : {A : Set} {x y : A} -> x ≡ y -> y ≡ x
libLemma refl = refl
```
```agda
{-# OPTIONS --with-K #-}
module WithKOverride where
open import LibBase
open import Agda.Builtin.Equality
uip : {A : Set} {x y : A} (p q : x ≡ y) -> p ≡ q
uip refl refl = refl
-- exits 0, NO warning/error — Agda's own co-infective checking does NOT catch this direction.
```

**Whitelist-diff / D-03 `no-policy` outcome** has no existing analog in this codebase (see "No Analog Found"); the closest structural cousin for the interim policy-file's JSON shape is `src/protocol/data/command-line-options.json`'s `{blocked: {caseInsensitive, caseSensitive, prefixes}, common: [...]}` object (schema at `src/protocol/command-line-options.ts:26-33`), loaded via the same `loadJsonData()` SSOT (see Shared Patterns).

**Test analog** — `test/unit/tools/check-postulates.test.ts` (whole file, 151 lines) — pure-function `describe`/`test` blocks with synthetic multi-line source built via `.join("\n")`; see Shared Patterns for the full idiom.

---

### `scripts/oracle/orcl-03-conformance.mjs` (script, transform, advisory-only)

**Analog:** `src/agda/expression-operations.ts:65-77` (`inferTopLevel`) — but this module's exported functions all call `ctx.requireFile()` against a live server-side `AgdaCommandContext`, which ORCL-03 does not have (it runs inside `cold-agda-session.mjs`'s disposable process, not the server). **Only the 2-line command-construction pattern is reusable**, not the function itself:
```typescript
// src/agda/expression-operations.ts:65-77
export async function inferTopLevel(ctx: AgdaCommandContext, expr: string): Promise<InferResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", quoted(expr))),
  );
  const decoded = decodeExpressionDisplayResponses(responses);
  return { type: decoded.inferredType };
}
```
Reimplement the command-construction line directly against `cold-agda-session.mjs`'s lifecycle object, importing only `modeTopLevelCommand`/`quoted` via `tsx` (`src/protocol/command-builder.ts:57-63`, `:13-15`):
```javascript
import { modeTopLevelCommand, quoted } from ".../src/protocol/command-builder.js";
const inferCmd = modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", quoted(targetName));
```
Decoding the response can still reuse `decodeExpressionDisplayResponses` (`src/protocol/responses/expression-display.ts`, imported via `tsx`) since it is a pure response-shape decoder with no `ctx` dependency — verify this at implementation time.

**No implementation precedent for the alpha-diff itself** — see "No Analog Found" (RESEARCH.md Assumption A2 explicitly flags this as original synthesis).

**Test analog** — `test/unit/agda/session-capture/oracle-substrate.test.ts` (see Shared Patterns) for the "real vs. vacuous" split this predicate needs (`vacuous-no-expected-signature` mirrors this file's own `expectedSignature`-optional handling, `test/unit/agda/session-capture/oracle-substrate.test.ts:136-152`).

---

### `scripts/oracle/verdict-schema.mjs` (model, transform)

**Conceptual analog 1 — discriminated outcome, never a thrown exception for a judged result:** `src/agda/completeness.ts:7-18`:
```typescript
export type CompletenessClassification = "ok-complete" | "ok-with-holes" | "type-error";
export interface CompletenessStatus {
  classification: CompletenessClassification;
  goalCount: number; invisibleGoalCount: number; hasHoles: boolean; isComplete: boolean;
}
```
**Conceptual analog 2 — envelope with explicit `ok` boolean + classification + diagnostics, never compressed:** `src/tools/tool-envelope.ts:27-38, 130-151`:
```typescript
export interface ToolEnvelope<T> {
  tool: string; ok: boolean; classification: string; summary: string;
  data: T; diagnostics: ToolDiagnostic[]; /* ... */
}
export function okEnvelope<T>(args: { tool: string; summary: string; data: T; classification?: string; /* ... */ }): ToolEnvelope<T> {
  return { tool: args.tool, ok: true, classification: args.classification ?? "ok", /* ... */ };
}
```
**Conceptual analog 3 — small discriminated result from a pure routing function:** `src/agda/session-capture/dedup-index.ts:66-75` (`routeDedup`):
```typescript
export function routeDedup(index: Map<string, DedupIndexEntry>, fingerprint: string): DedupRouting {
  const prior = index.get(fingerprint);
  if (!prior) return { kind: "new-bug", fingerprint, recurrence: 1 };
  return { kind: "update", fingerprint, recurrence: prior.recurrence + 1 };
}
```
**Apply these three ideas, but note none of them composes MULTIPLE sub-verdicts into one gate** — that composition rule is genuinely new (D-02's exact enumeration: ORCL-01 ∈ {pass, server-false-green-candidate, INCONCLUSIVE(probe)}; ORCL-02 ∈ {clean, cheat-flagged(findings), no-policy(findings)}; ORCL-03 ∈ {consistent, conformance-flagged(diff), vacuous-no-expected-signature}; composed `true-green` iff ORCL-01=pass AND ORCL-02=clean). Build this directly from `02-CONTEXT.md`'s D-02 text, not from a codebase analog.

**Sidecar naming/placement convention (D-01)** — mirrors the existing dedup-index file's location convention (`src/agda/session-capture/dedup-index.ts:32`, `join(repoRoot, ".agda-mcp", "captures", "index.json")`) and `promote-capture.mjs`'s own reasoning about staying inside `.agda-mcp/captures/`; naming the verdict sidecar (e.g. `<fingerprint>-<recurrence>.verdict.json` next to `<fingerprint>-<recurrence>.json`) is Claude's Discretion per CONTEXT.md but should follow this existing directory convention, never a new top-level location.

**Test analog** — `test/unit/agda/session-capture/dedup-index.test.ts` (whole file, 57 lines) — see Shared Patterns.

---

### `scripts/data/oracle-policy/<project-key>.json` (+ loader)

**Analog — zod-schema + `loadJsonData()` SSOT:** `src/json-data.ts` (whole file, 12 lines):
```typescript
export function loadJsonData<T>(relativePath: string, schema: z.ZodType<T>, baseUrl: string): T {
  const url = new URL(relativePath, baseUrl);
  const raw = readFileSync(url, "utf8");
  return schema.parse(JSON.parse(raw));
}
```
**Consumer pattern** (`src/protocol/command-registry.ts:1-30`):
```typescript
export const protocolCommandRegistry: ProtocolCommandDefinition[] = loadJsonData(
  "./data/protocol-command-registry.json",
  z.array(protocolCommandDefinitionSchema),
  import.meta.url,
);
```
**Closest structural JSON shape (blocked/common flags list, schema at `src/protocol/command-line-options.ts:26-33`):**
```typescript
const commandLineOptionsDataSchema = z.object({
  $comment: z.string().optional(),
  blocked: z.object({ caseInsensitive: z.array(z.string()), caseSensitive: z.array(z.string()), prefixes: z.array(z.string()) }),
  common: z.array(z.string()),
});
```
This phase's policy file needs a different semantic shape (sanctioned-axiom whitelist + required-flags baseline, not blocked/common) — see "No Analog Found". Since the file lives under `scripts/data/` (not `src/*/data/`) per D-05, import `loadJsonData` from `src/json-data.ts` via `tsx` rather than re-deriving a second copy of this 12-line function.

**Concrete content this file must hold** (already known facts from FUEL-CORPORA.md, quoted in `02-RESEARCH.md`): `agda-unimath` sanctions `univalence`/`funext`/`replacement`; required flags are `--without-K --exact-split --no-import-sorts --auto-inline --no-require-unique-meta-solutions --no-postfix-projections`.

---

### Test files (grouped — all follow one of two established idioms)

**`test/unit/tools/oracle-orcl-01.test.ts`, `oracle-orcl-03.test.ts`** — need the real-Agda-spawn-gated idiom. Analog: `test/unit/agda/session-capture/oracle-substrate.test.ts:24-42`:
```typescript
const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

let tempDirs: string[] = [];
function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agda-mcp-oracle-substrate-"));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});
```
Import `detectAgdaVersion` from `test/helpers/agda-version.ts` (whole file — re-exports `src/agda/agda-version.ts`'s functions) and `TEST_FIXTURE_PROJECT_ROOT` from `test/helpers/repo-root.ts` (whole file) rather than reinventing either.

**`test/unit/tools/oracle-orcl-02.test.ts`** — needs the pure-function/no-I/O idiom. Analog: `test/unit/tools/check-postulates.test.ts` (whole file):
```typescript
import { describe, test, expect } from "vitest";
import { findPostulates } from "../../../src/tools/file/check-postulates.js";
describe("findPostulates — inline-comment handling", () => {
  test("treats `postulate -- comment` as a block-style header...", () => {
    const source = ["module M where", "postulate -- TODO fill me in", "  ax : Set", "", "x = ax"].join("\n");
    const blocks = findPostulates(source);
    expect(blocks).toHaveLength(1);
    // ...
  });
});
```

**`test/unit/tools/oracle-verdict-schema.test.ts`** — needs the small discriminated-object idiom. Analog: `test/unit/agda/session-capture/dedup-index.test.ts` (whole file, 57 lines):
```typescript
test("routeDedup routes an absent fingerprint as new-bug/recurrence 1", () => {
  const emptyIndex = new Map();
  expect(routeDedup(emptyIndex, "abc123")).toEqual({ kind: "new-bug", fingerprint: "abc123", recurrence: 1 });
});
```

**All four files** also need the "import a `scripts/*.mjs` export directly from a `.test.ts` file" idiom — the exact, currently-on-disk analog is `test/unit/tools/copy-json-assets.test.ts` (whole file, 27 lines):
```typescript
import { test, expect } from "vitest";
// @ts-expect-error script module lacks types
import { copyJsonAssets } from "../../../scripts/copy-json-assets.mjs";

test("copyJsonAssets copies nested json files and ignores non-json files", () => {
  const root = mkdtempSync(join(tmpdir(), "agda-mcp-copy-json-"));
  // ...
  copyJsonAssets(sourceRoot, destRoot);
  expect(existsSync(copiedFile)).toBe(true);
});
```
Note the `// @ts-expect-error script module lacks types` comment directly above the `.mjs` import — copy this exact convention for every oracle test file's import of `scripts/oracle/*.mjs`.

---

### New fixture files under `test/fixtures/agda/`

**Analogs:** `test/fixtures/agda/WithK.agda` (3-line module, single `{-# OPTIONS --with-K #-}` pragma, no `.agda-lib` needed) and `test/fixtures/agda/WithPostulates.agda` (plain `postulate` block, no pragma) — both show this project's minimal, single-purpose fixture convention (module header, one concept per file, no unrelated content):
```agda
{-# OPTIONS --with-K #-}
module WithK where
open import Agda.Builtin.Equality
K : {A : Set} {x : A} (P : x ≡ x → Set) → P refl → (p : x ≡ x) → P p
K P pr refl = pr
```
New fixtures needed per RESEARCH.md's Wave 0 Gaps: a `{-# TERMINATING #-}` example, a `primTrustMe` example, a `{-# COMPILE ... #-}` example, and the exact `LibBase.agda`/`WithKOverride.agda` pair already verified working in RESEARCH.md's Code Examples section (reproduced above under ORCL-02). Follow `test-fixtures.agda-lib`'s minimal 2-line convention (`name: test-fixtures` / `include: .`) if any new fixture needs project-level `.agda-lib` flags for the required-flags scan (Open Question 3).

## Shared Patterns

### Plain `scripts/*.mjs` idiom (header + `scriptMain` + bottom guard)
**Source:** `scripts/verify-cold-replay.mjs:346-371`, `scripts/promote-capture.mjs:97-125`
**Apply to:** all new oracle scripts that need a standalone CLI entry point
```javascript
export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write("Usage: node scripts/....mjs <path>\n");
    process.exitCode = 1;
    return;
  }
  // ... call the pure exported function, print verdict, set process.exitCode ...
}
const modulePath = new URL(import.meta.url).pathname;
if (process.argv[1] === modulePath) { await scriptMain(); }
```
**Preferable, independently-tested variant** — `scripts/test-with-sentinel.mjs:12-18`:
```javascript
export function isMainModule(moduleUrl, argvPath) {
  if (!argvPath) return false;
  return moduleUrl === pathToFileURL(argvPath).href;
}
// ...
if (isMainModule(import.meta.url, process.argv[1])) { await main(); }
```
Neither `verify-cold-replay.mjs` nor `promote-capture.mjs`'s inline guard is unit-tested; `isMainModule` is (implicitly, by being a plain exported function). Prefer this shape for new oracle scripts since it composes with the "test a `.mjs` export directly" idiom already established.

### Reuse via `tsx`, never re-derive
**Source:** RESEARCH.md's own verified finding + `src/protocol/command-builder.ts`, `src/agda/session-load-helpers.ts`, `src/agda/import-graph.ts`, `src/agda/source-parsers.ts`
**Apply to:** every oracle script that needs command construction, classification, or closure-walking
**Rule:** invoke with `npx tsx <script>.mjs`, never plain `node` — Node 24's native TS type-stripping does not rewrite this codebase's `.js`-suffixed sibling-import specifiers to `.ts`, and plain `node` fails with `ERR_MODULE_NOT_FOUND` on the very first `src/` import.

### Path containment for every artifact-derived filesystem write
**Source:** `src/repo-root.ts:19-27, 69-76, 82-95` (`PathSandboxError`, `resolveFileWithinRoot`, `resolveExistingPathWithinRoot`)
**Apply to:** `orcl-01-differential.mjs` / `cold-agda-session.mjs`'s source-materialization step (the exact CR-01 vector) — this is not optional; `01-07-PLAN.md`'s own must-have truth names this exact scenario.

### Discriminated result, never throw for a "judged" outcome
**Source:** `src/agda/completeness.ts:7-18`, `src/tools/tool-envelope.ts:27-38`, `src/agda/session-capture/dedup-index.ts:66-75`, `src/agda/session-load-helpers.ts:44-46` (`invalidOptions` — a failure is a return value, not a throw)
**Apply to:** `verdict-schema.mjs`'s per-predicate outcomes and the composed verdict; every "this capture could not be judged" case should be an explicit `INCONCLUSIVE`/`no-policy`/`vacuous-*` value, never a thrown exception the caller must remember to catch.

### JSON data + zod schema + `loadJsonData()`
**Source:** `src/json-data.ts` (whole file), `src/protocol/command-registry.ts:1-30`, `src/protocol/command-line-options.ts:26-38`, `src/agda/data/agda-feature-flags.json`
**Apply to:** `scripts/data/oracle-policy/<project-key>.json`'s loader inside `orcl-02-soundness-scan.mjs` — import `loadJsonData` from `src/json-data.ts` via `tsx`, define a new zod schema for the whitelist/required-flags shape (see "No Analog Found"), never hand-roll a second `JSON.parse`+validate path.

### Safe/atomic file writes
**Source:** `src/session/safe-source-io.ts:157-173` (`writeFileAtomic`, async, temp-file+rename+`wx`) vs. `scripts/promote-capture.mjs:88-92` (plain sync `writeFileSync`, justified inline: *"Single-writer, out-of-band script — atomic-write is a src/ concern for concurrent MCP tool calls..., not needed here since this script is run by hand, one invocation at a time"*)
**Apply to:** the verdict sidecar write, wherever it happens. The oracle is likewise a single-writer, hand-invoked (or CI-invoked, still one-at-a-time-per-artifact) batch tool — `promote-capture.mjs`'s reasoning transfers directly, so a plain `writeFileSync` with the same justification is defensible; reusing `writeFileAtomic` via `tsx` is the more defensive alternative if the plan wants belt-and-suspenders. Document whichever is chosen.

### Version-probe security convention
**Source:** CLAUDE.md's own stated invariant ("execFileSync, never execSync, to avoid shell-injection via env-derived paths") vs. `src/agda/agda-version.ts:99-106`'s `detectAgdaVersion()`, which uses `execSync("agda --version", ...)` against a hardcoded literal (safe as written, but not parameterized for a pinned/artifact-supplied binary path)
**Apply to:** ORCL-01's version-match probe — reuse `parseAgdaVersion`/`compareVersions`/`formatVersion` (pure parsing/comparison, safe to import via `tsx`) but invoke the actual version check yourselves via `execFileSync(pinnedAgdaBin, ["--version"])`, since `manifest.agdaBinaryPath` is untrusted artifact data, not a compile-time literal.

### `RUN_AGDA_INTEGRATION`-gated real-Agda tests
**Source:** `test/unit/agda/session-capture/oracle-substrate.test.ts:24-27, 182-195`, `test/helpers/agda-version.ts`, `test/helpers/repo-root.ts` (both whole files)
**Apply to:** the integration-test halves of `oracle-orcl-01.test.ts` and `oracle-orcl-03.test.ts` (both require a real cold Agda spawn per RESEARCH.md's Phase Requirements → Test Map).

### Testing a `scripts/*.mjs` export from a `.test.ts` file
**Source:** `test/unit/tools/copy-json-assets.test.ts` (whole file, 27 lines)
**Apply to:** all four new oracle test files — `// @ts-expect-error script module lacks types` immediately above `import { X } from "../../../scripts/oracle/....mjs"`.

## No Analog Found

Files/aspects with no close codebase match (planner should design from RESEARCH.md / CONTEXT.md directly, not force-fit an analog):

| File / Aspect | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/oracle/verdict-schema.mjs`'s cross-predicate composition rule (D-02: 3 independent sub-verdicts → one `true-green` gate) | model | transform | No existing file in this codebase composes multiple independently-computed sub-verdicts into a single gate; `ToolEnvelope`/`CompletenessStatus`/`DedupRouting` are all single-predicate discriminated results. Build directly from `02-CONTEXT.md`'s D-02 enumeration and `02-RESEARCH.md`'s architecture diagram. |
| `scripts/oracle/orcl-03-conformance.mjs`'s alpha-diff / token-canonicalization technique | script | transform | RESEARCH.md's own Assumption A2 flags this as original synthesis — "no off-the-shelf solution exists" anywhere, not just in this codebase. RESEARCH.md's Open Question 1 recommends starting with plain whitespace-normalized string equality and treating canonicalization as an empirical follow-up, rather than over-engineering from zero data. |
| `scripts/data/oracle-policy/<project-key>.json`'s precise field schema (sanctioned-axiom whitelist + required/forbidden flag baseline, keyed by `.agda-lib` name) | config/data | static lookup | No sanctioned-axiom-whitelist file exists anywhere in this repo yet (RESEARCH.md Assumption A1, explicitly flagged as this-session's original synthesis). `command-line-options.json`'s `{blocked, common}` shape is the nearest structural cousin but encodes different semantics (a single global blocked/common flag list, not a per-project axiom whitelist + required-flags baseline). |
| `scripts/oracle/cold-agda-session.mjs`'s "keep the process alive across 2 commands, then kill" lifecycle | service | event-driven | `verify-cold-replay.mjs`'s `runColdLoad()` kills the process the instant the first command's response settles (inside its own `finish()`). No existing script or `src/` module sends a second command to an already-spawned *disposable* cold process before terminating it — the live server's multi-command session (`src/agda/session.ts` + `session-command-dispatch.ts`) is architecturally the wrong analog here (D-05: the oracle must never touch the server's singleton `AgdaSession`), so this genuinely has to be designed fresh, informed only by RESEARCH.md's Pitfall 7. |

## Metadata

**Analog search scope:** `scripts/`, `src/agda/`, `src/protocol/`, `src/tools/`, `src/session/`, `src/agda/session-capture/`, `src/repo-root.ts`, `src/json-data.ts`, `test/unit/tools/`, `test/unit/agda/`, `test/unit/agda/session-capture/`, `test/helpers/`, `test/fixtures/agda/`
**Files scanned (read in full or by targeted line range):** 33 source/test/data files, plus `git log` + `find`/`ls`/`wc -l` structural probes
**Pattern extraction date:** 2026-07-02
**Key unresolved fact re-verified during this mapping (not just cited from RESEARCH.md):** `01-06`/`01-07` gap-closure plans for `scripts/verify-cold-replay.mjs` (CR-01 path-traversal, CR-02 false-PASS-on-empty-response) remain unexecuted as of this mapping — confirmed via `git log --oneline` (no `01-06-SUMMARY.md`/`01-07-SUMMARY.md`, no completion commit). The planner must re-check this immediately before deciding extend-vs-fork for ORCL-01, since a landed `01-07` would change which line ranges above are still accurate.

---

*Phase: 2-the-oracle-triad-server-faithfulness-soundness-hygiene-confo*
*Patterns mapped: 2026-07-02*
