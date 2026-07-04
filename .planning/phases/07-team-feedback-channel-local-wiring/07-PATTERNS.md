# Phase 7: Team Feedback Channel — Local Wiring - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 9 (4 new scripts, 2 modified scripts, 3 new test files)
**Analogs found:** 9 / 9 (all have at least a role-match CLI/lifecycle analog; 4 sub-concerns — HTTP serving, tar/gzip pipeline, crypto key material, git write-back — have zero codebase precedent and are flagged separately)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `scripts/team/issue-key.mjs` (TEAM-01, NEW) | utility | CRUD | `scripts/queue/intake.mjs` | role-match |
| `scripts/dogfood/upload-run.mjs` (TEAM-02, NEW) | utility | file-I/O | `scripts/dogfood/dogfood-run.mjs` | role-match |
| `scripts/team/ingest-server.mjs` (TEAM-03, NEW) | service | streaming | `scripts/dogfood/dogfood-run.mjs` (lifecycle/env shell only) | partial |
| `scripts/team/cron-ingest-wrapup.mjs` (TEAM-03/04, NEW) | service | batch | `scripts/dogfood/dogfood-wrapup.mjs` | exact |
| `scripts/dogfood/dogfood-wrapup.mjs` (MODIFIED — D-12 upload chaining) | service | batch | itself (existing `scriptMain`) | exact |
| `scripts/dogfood/transcript-writer.mjs` (MODIFIED — Pattern 4 `taskManifestCorpora`) | utility | transform | itself (existing `getReport()`) | exact |
| `test/unit/tools/team-issue-key.test.ts` (NEW) | test | CRUD | `test/unit/tools/queue-intake.test.ts` | exact |
| `test/unit/tools/dogfood-upload-run.test.ts` (NEW) | test | file-I/O | `test/unit/tools/dogfood-wrapup-filing.test.ts` | role-match |
| `test/unit/tools/team-cron-ingest-wrapup.test.ts` (NEW) | test | batch | `test/unit/tools/dogfood-wrapup-filing.test.ts` | exact |

All new scripts are `.mjs` under `scripts/team/` (new sibling dir of `scripts/dogfood/`, `scripts/oracle/`, `scripts/queue/`) or `scripts/dogfood/` per ARCHITECTURE.md §2. `src/` is untouched by this phase.

---

## Pattern Assignments

### `scripts/team/issue-key.mjs` (utility, CRUD) — TEAM-01

**Analog:** `scripts/queue/intake.mjs` (structural: read-a-JSON-array-or-object, find-by-key, upsert-or-append, atomic-write-back). No analog exists for the key-generation/hashing half — see "Gaps" below.

**Header + `isMainModule` CLI-guard convention** (`scripts/queue/intake.mjs:1-29`, `scripts/test-with-sentinel.mjs:12-18`):
```javascript
// Run with: npx tsx scripts/queue/intake.mjs <path-to-entry.json> [queue-json-path]
// (NOT plain `node` — this script's src/ + test/ imports use
// .js-suffixed specifiers pointing at sibling .ts files ...)
import { isMainModule } from "../test-with-sentinel.mjs";
...
if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```
`isMainModule` (`scripts/test-with-sentinel.mjs:12-18`):
```javascript
export function isMainModule(moduleUrl, argvPath) {
  if (!argvPath) {
    return false;
  }
  return moduleUrl === pathToFileURL(argvPath).href;
}
```
Every `.mjs` script in this codebase gates its CLI entry point behind this exact check (not `require.main === module` — this is ESM), so `scriptMain` stays importable/testable from vitest without side effects.

**Core upsert-registry pattern** (`scripts/queue/intake.mjs:37-93`, adapt "queue entry keyed by fingerprint" → "key registry entry keyed by person"):
```javascript
export function readQueueFile(queueJsonPath) {
  if (!existsSync(queueJsonPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(readFileSync(queueJsonPath, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function upsertQueueEntry(entryData, queueJsonPath, options = {}) {
  const existing = readQueueFile(queueJsonPath);
  const existingIndex = existing.findIndex((entry) => entry.fingerprint === entryData.fingerprint);
  const candidate = existingIndex === -1 ? entryData : { ...existing[existingIndex], ...entryData, /* ... */ };
  const validated = fixQueueEntrySchema.parse(candidate);
  const updated = [...existing];
  if (existingIndex === -1) { updated.push(validated); } else { updated[existingIndex] = validated; }
  await writeFileAtomic(queueJsonPath, `${JSON.stringify(updated, null, 2)}\n`);
  return validated;
}
```
For `scripts/team/data/team-keys.json` (gitignored key→person registry, D-13: hashes only, never plaintext), mirror this shape 1:1: `readKeyRegistry` (absent/malformed → `[]`, never throws), `issueKey`/`revokeKey` (find-by-`person`, validate via a zod schema, `writeFileAtomic` back), never a second ad hoc JSON reader/writer.

**CLI entry point + usage/error convention** (`scripts/queue/intake.mjs:106-127`):
```javascript
export async function scriptMain(argv = process.argv.slice(2)) {
  const entryPath = argv[0];
  if (!entryPath) {
    process.stderr.write("Usage: npx tsx scripts/queue/intake.mjs <path-to-entry.json> [queue-json-path]\n");
    process.exitCode = 1;
    return;
  }
  try {
    /* ... */
    process.stdout.write(`Upserted ${result.fingerprint} ... \n`);
  } catch (err) {
    process.stderr.write(`queue intake failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
```
Every script in this codebase uses `process.exitCode = 1` (never `process.exit()` inside a reusable/importable function) plus a stderr message on failure — reserve `process.exit()` for a true top-level proxy process like `dogfood-run.mjs`, not a one-shot CLI utility.

**Hashing precedent (technique-level, not a role match):** `src/reporting/bug-report.ts:5,92-95` shows the only `node:crypto` usage pattern in the codebase (`createHash("sha256").update(...).digest("hex")`) — reuse this same `createHash` shape for storing a key's hash in the registry, but see "Gaps" below: `crypto.randomBytes` (key generation) and `crypto.timingSafeEqual` (constant-time compare, D-13) have zero precedent anywhere in this repo and must be written fresh per RESEARCH.md/STACK.md.

---

### `scripts/dogfood/upload-run.mjs` (utility, file-I/O) — TEAM-02

**Analog:** `scripts/dogfood/dogfood-run.mjs` (fail-open philosophy, env-tunable child options, never-crash-on-broken-pipe conventions). The tar/gzip archive-building and the `fetch` POST itself have no precedent — see "Gaps."

**Fail-open / never-let-a-side-effect-crash-the-caller convention** (`scripts/dogfood/dogfood-run.mjs:175-176, 226-236`):
```javascript
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
...
// Best-effort relative to the proxy's own liveness: a
// promote-capture failure is reported but never crashes the
// proxy or blocks forwarding subsequent lines.
void (async () => {
  try {
    await promoteCapture(staged.stagedPath);
  } catch (err) {
    process.stderr.write(
      `dogfood-run: auto-persist failed for ${staged.stagedPath}: `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
})();
```
`upload-run.mjs`'s entire POST-and-append-to-retry-queue-on-failure body should follow this exact try/catch-log-and-continue shape (locked decision D-12/TEAM-02: "upload failure must never fail the dogfooding session or the wrap-up chain").

**"No key → zero network behavior" gate convention** (structurally identical to `scripts/queue/mirror-github.mjs:144-167`'s dry-run-by-default gate, D-12's TEAM-01 requirement is the same shape inverted):
```javascript
if (options.execute !== true) {
  // The critical autonomous-safety branch: no execFileSync call has
  // happened, or will happen, anywhere above this line ...
  return { skipped: true, reason: "dry-run", /* ... */ };
}
```
Apply the same "return before any network/subprocess call" structure for `upload-run.mjs`: if `AGDA_MCP_TEAM_UPLOAD_KEY`/`AGDA_MCP_TEAM_UPLOAD_URL` are unset, return/exit 0 immediately, before constructing any archive or touching `fetch`.

**Env-tunable resolver convention, for `AGDA_MCP_TEAM_STORAGE_DIR`-style config and the D-08 retry-queue bound (20 archives / 2 GiB)** (`scripts/dogfood/transcript-writer.mjs:41-47`, numeric variant `src/session/command-completion.ts:41-48`):
```javascript
export function resolveRunsRoot() {
  const override = process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT?.trim();
  if (override) {
    return override;
  }
  return join(SERVER_REPO_ROOT, ".agda-mcp", "runs");
}
```
```javascript
function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
export function configuredCommandTimeoutMs() {
  return parsePositiveInt(process.env.AGDA_MCP_COMMAND_TIMEOUT_MS, 120_000);
}
```
Use this exact `resolveXxx()`-returns-a-value / `parsePositiveInt`-with-fallback pair for `AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT` (default 20) and `AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES` (default 2 GiB) — every numeric/path env var in this codebase resolves through one small named function, never an inline `process.env.X ?? default` scattered at the call site.

**NDJSON append-only side-channel convention, for `.agda-mcp/team/upload-queue.jsonl`** (`scripts/dogfood/transcript-writer.mjs:70-83`):
```javascript
let transcriptAppendFailureWarned = false;
function appendTranscriptLine(transcriptPath, direction, raw) {
  try {
    appendFileSync(transcriptPath, `${JSON.stringify({ direction, ts: Date.now(), raw })}\n`, "utf8");
  } catch (err) {
    if (!transcriptAppendFailureWarned) {
      transcriptAppendFailureWarned = true;
      process.stderr.write(`transcript-writer: failed to append transcript line (suppressing further warnings): ...`);
    }
  }
}
```
Three siblings already use this same `appendFileSync` (never `writeFileAtomic`) convention for a growing, single-writer, many-small-records file: `scripts/oracle/run-oracle.mjs:261-262` (`oracle-metrics.jsonl`), `scripts/dogfood/dogfood-wrapup.mjs:174-187` (`flaky-captures.jsonl` via `appendFlakyLog`). `upload-queue.jsonl`'s append-on-failure and truncate/rewrite-on-successful-retry-sweep should follow the same file-category rule: append via `appendFileSync`, but note `writeFileAtomic` for the drop-oldest bound-enforcement rewrite (structurally different from a single append — that operation replaces the whole file, matching `writeFileAtomic`'s use case instead).

**Subprocess-spawn security convention (for the `tar` child process)** (`src/index.ts:136-145`, applied via argv-array `spawn()` in `scripts/oracle/cold-agda-session.mjs:102-106`):
```javascript
// SECURITY: we use execFileSync, not execSync, because agdaBin is derived
// from PROJECT_ROOT which is derived from the AGDA_MCP_ROOT env var (and
// can also be the AGDA_BIN env var directly). execSync's string form runs
// the command through `/bin/sh -c` ... (CVE class: CWE-78). execFileSync
// calls execvp() on the raw path with the args array, so the shell is
// never involved ...
```
```javascript
proc = spawn(agdaBin, ["--interaction-json", ...extraSpawnArgs], {
  cwd, env, stdio: ["pipe", "pipe", "pipe"],
});
```
PITFALLS.md mandates `spawn` (never `execFileSync`) for the tar child specifically because archives can be multi-GB (`execFileSync` buffers the whole output in memory) — reuse the argv-array-never-shell-string discipline from this comment, but the streaming/`pipeline()` composition itself has no precedent (see "Gaps").

---

### `scripts/team/ingest-server.mjs` (service, streaming) — TEAM-03

**Analog:** `scripts/dogfood/dogfood-run.mjs` for the *lifecycle shell only* (long-running process, env-resolved storage root, graceful-shutdown discipline) — grep-confirmed zero `node:http`/Express/Fastify usage anywhere in this codebase, so the actual request-handling core has no analog (see "Gaps").

**Env-var-resolved storage root, the exact "one code path, two values" seam ARCHITECTURE.md Pattern 2 calls out** (`scripts/dogfood/transcript-writer.mjs:41-47`, same pattern cited above): `AGDA_MCP_TEAM_STORAGE_DIR` should resolve via the identical `resolveXxx()` shape — `process.env.AGDA_MCP_TEAM_STORAGE_DIR?.trim()` with a documented local-scratch-dir fallback for dev/test, so local-Mac and future-Ceph-PVC modes are literally the same code path differing only in the env var's value.

**Path-sandboxing the archive's ultimate on-disk destination** (`src/repo-root.ts:19-27,69-76`, see full excerpt under "Shared Patterns" below) — every path this server writes (`<storageRoot>/<person>/<date>/<runId>.tar.gz`) must be built via `resolveFileWithinRoot(storageRoot, relPath)`, never raw `path.join` with a client-influenced `person`/`runId` segment, so a crafted `person` value (`../../etc`) cannot escape `AGDA_MCP_TEAM_STORAGE_DIR`.

**Bearer-auth gate shape (structural precedent only — the crypto itself has none):** `scripts/queue/mirror-github.mjs:56-75`'s `isGhAvailable()` best-effort-probe-returns-boolean-never-throws shape is the closest structural analog for "validate this request's Bearer token against the key registry, return a boolean, never let a malformed header crash the handler." The actual `crypto.timingSafeEqual` comparison (D-13: never `===`) has zero precedent — see "Gaps."

**Size-cap-before-any-parsing convention (numeric bound wiring)**: reuse the `parsePositiveInt(process.env.X, fallback)` shape (`src/session/command-completion.ts:41-48`, cited above) for `AGDA_MCP_TEAM_INGEST_MAX_BYTES` (D-09 default 512 MiB) — PITFALLS.md Pitfall 6/Security Mistakes table requires this cap enforced at the HTTP layer *before* any tar/zlib logic runs, not after buffering the body.

---

### `scripts/team/cron-ingest-wrapup.mjs` (service, batch) — TEAM-03/04

**Analog:** `scripts/dogfood/dogfood-wrapup.mjs` — near-exact structural match: both iterate N artifacts, judge each with per-item error isolation, and write one summary report. `cron-ingest-wrapup.mjs` is the unattended, upload-sourced sibling of this exact loop, plus an added extraction step and a git write-back step at the end.

**Per-item error-isolation + summary-with-counts loop** (`scripts/dogfood/dogfood-wrapup.mjs:408-459`) — this is also the direct precedent for TEAM-04's explicit requirement to surface the per-run INCONCLUSIVE/abstention rate, since the summary object already tallies exactly this shape of count:
```javascript
const results = [];
for (const staged of stagedCaptures) {
  // Per-capture error isolation: one deleted/corrupt staged file ...
  // must never zero out the whole run ...
  try {
    const artifact = JSON.parse(readFileSync(staged.stagedPath, "utf8"));
    const outcome = await wrapUpCapture(staged.stagedPath, artifact, { queueJsonPath, flakyLogPath, n: rerunN, policyKey });
    if (outcome.verdict?.orcl02?.kind === "no-policy") {
      process.stderr.write(`dogfood-wrapup: WARNING — no ORCL-02 policy resolved for ${staged.stagedPath}; ...\n`);
    }
    results.push({ stagedPath: staged.stagedPath, ...outcome });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`dogfood-wrapup: failed to judge ${staged.stagedPath}: ${message}\n`);
    results.push({ stagedPath: staged.stagedPath, filed: false, classification: "error", error: message });
  }
}

const summary = {
  runId, queueJsonPath, n: rerunN, policyKey: policyKey ?? null,
  totalCaptures: results.length,
  filed: results.filter((r) => r.filed).length,
  flaky: results.filter((r) => r.classification === "flaky").length,
  replayInconclusive: results.filter((r) => r.classification === "replay-inconclusive").length,
  notACandidate: results.filter((r) => r.classification === "not-a-candidate").length,
  noPolicy: results.filter((r) => r.verdict?.orcl02?.kind === "no-policy").length,
  errors: results.filter((r) => r.classification === "error").length,
  results,
};
await writeFileAtomic(join(runDir, "wrapup-report.json"), JSON.stringify(summary, null, 2));
```
`cron-ingest-wrapup.mjs`'s own per-archive loop should mirror this exactly (`totalArchives`, `filed`, `inconclusive`/`abstained`, `errors`, per-archive `results[]`), written to a comparable summary artifact — this is a copy-the-shape situation, not a build-from-scratch one.

**Import-not-reinvoke reuse (ARCHITECTURE.md Pattern 1 — mandatory, not discretionary)** (`scripts/dogfood/dogfood-wrapup.mjs:44-48`):
```javascript
import { runOracle } from "../oracle/run-oracle.mjs";
import { upsertQueueEntry } from "../queue/intake.mjs";
import { classifyFlakiness } from "./flake-classify.mjs";
```
`cron-ingest-wrapup.mjs` must import `wrapUpCapture` from `scripts/dogfood/dogfood-wrapup.mjs` and `upsertQueueEntry` from `scripts/queue/intake.mjs` the same way — direct ESM import of the exported function, never `spawn`/`execFileSync` re-invoking either script's own CLI.

**policyKey passthrough — already-shipped Phase 6 machinery to *consume*, not rebuild** (`scripts/dogfood/dogfood-wrapup.mjs:291-334`):
```javascript
export function resolveWrapupPolicyKey({ policyFlag, manifestPath }) {
  if (policyFlag !== undefined) {
    return policyFlag;
  }
  if (!manifestPath) {
    return undefined;
  }
  let manifest;
  try {
    manifest = loadTaskManifest(manifestPath);
  } catch (err) {
    process.stderr.write("dogfood-wrapup: WARNING — could not derive a corpus policy key ...");
    return undefined;
  }
  const corpora = [...new Set(manifest.map((entry) => entry.corpus))];
  if (corpora.length !== 1) { /* warn, return undefined */ }
  const [corpus] = corpora;
  const fuelCorpusEntry = fuelCorpora.find((entry) => entry.key === corpus);
  if (!fuelCorpusEntry) { /* warn, return undefined */ }
  return fuelCorpusEntry.policyKey;
}
```
Per CONTEXT.md's "Specific Ideas" (`taskManifestCorpora` field in `run-report.json`), `cron-ingest-wrapup.mjs` — having no human to type `--policy`, unlike interactive `dogfood-wrapup.mjs` — should resolve the policy key from the uploaded run's own `run-report.json.taskManifestCorpora` field (once Pattern-4's schema addition lands) via the identical `fuelCorpora.find((entry) => entry.key === corpus)` lookup, rather than re-deriving from `.agda-lib` (the exact W2/POLICY-01 anti-pattern ARCHITECTURE.md §8 warns against repeating).

**Materialize-into-isolated-tmp-dir pattern for archive extraction (the mandatory reuse target for tar-safety, PITFALLS.md Pitfall 6)** (`scripts/oracle/orcl-01-differential.mjs:34-56, 85-131`):
```javascript
import { PathSandboxError, resolveFileWithinRoot } from "../../src/repo-root.js";
...
export async function materializeCaptureEnvironment(artifact) {
  const tmpDir = mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-src-"));
  const agdaDirTmp = mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-agdadir-"));
  const root = resolve(tmpDir);
  const sources = Array.isArray(artifact?.manifest?.inlinedFirstPartySources) ? artifact.manifest.inlinedFirstPartySources : [];
  for (const entry of sources) {
    if (typeof entry?.path !== "string" || typeof entry?.content !== "string") { continue; }
    let dest;
    try {
      dest = resolveFileWithinRoot(root, entry.path);
    } catch (err) {
      if (err instanceof PathSandboxError) {
        // Path-traversal entry — skip, never write outside tmpDir.
        continue;
      }
      throw err;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.content, "utf8");
  }
  return {
    tmpDir, agdaDirTmp,
    cleanup() {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(agdaDirTmp, { recursive: true, force: true });
    },
  };
}
```
This is the PITFALLS.md-mandated, already-proven pattern to reuse verbatim for tar extraction: `mkdtempSync` a fresh scratch dir per archive, then validate **every** extracted entry's target path via `resolveFileWithinRoot`/catch-`PathSandboxError`-and-skip before writing it — never trust the tar library's own guard alone, and always provide a `cleanup()` closure the caller invokes in a `finally`.

**Git commit+push write-back (D-01/D-02) — partial precedent only, via the "shell out to a real CLI with argv array, gate behind an explicit flag" shape** (`scripts/queue/mirror-github.mjs:40-75, 144-201`):
```javascript
import { execFileSync } from "node:child_process";
...
export function isGhAvailable(options = {}) {
  const execFile = options.deps?.execFileSync ?? execFileSync;
  try {
    execFile("gh", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, shell: false });
    execFile("gh", ["auth", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, shell: false });
    return true;
  } catch {
    return false;
  }
}
...
if (options.execute !== true) {
  return { skipped: true, reason: "dry-run", /* ... */ };
}
```
No `git commit`/`git push` call exists anywhere in this codebase today, but `mirror-github.mjs` is the closest available shape for "shell out to a real VCS-adjacent CLI via `execFileSync` with an argv array, `shell: false`, gated behind an explicit boolean (here: `--no-push`, D-02's dev-only escape hatch, inverted from `mirror-github`'s `--execute`)." Model `git add test/fixtures/fix-queue.json && git commit -m ... && git push` as three separate argv-array `execFileSync` calls (never one shell string), each independently caught, with the `--no-push` flag short-circuiting before the first `git commit` call — same "return before any subprocess call" structure as `mirrorEntry`'s dry-run branch above.

**Test dependency-injection convention (`options.deps`)** — used consistently across `run-oracle.mjs:183`, `dogfood-wrapup.mjs:214-218`, `mirror-github.mjs:56-57,144-145`: every subprocess/network/filesystem-writing function accepts an optional `options.deps.<fnName>` override defaulting to the real implementation. `cron-ingest-wrapup.mjs`'s git-write-back function should accept `options.deps?.execFileSync` the same way so its own unit tests never actually shell out to `git`.

---

### `scripts/dogfood/dogfood-wrapup.mjs` (MODIFIED — D-12 upload chaining)

**Analog:** itself — the existing `scriptMain` (`scripts/dogfood/dogfood-wrapup.mjs:372-476`) already has the exact "always finish and write the report, regardless of per-item outcomes" shape this change extends.

**Insertion point and unconditional-tail-step precedent** (`scripts/dogfood/dogfood-wrapup.mjs:461-475`):
```javascript
await writeFileAtomic(join(runDir, "wrapup-report.json"), JSON.stringify(summary, null, 2));

process.stdout.write(`[dogfood-wrapup] run ${runId}: ${summary.totalCaptures} capture(s) judged — ...\n`);

if (summary.errors > 0) {
  // The report is complete, but at least one capture went unjudged —
  // surface that as a non-zero exit so a caller/CI can notice.
  process.exitCode = 1;
}
```
Per D-12 ("wrap-up chains `upload-run.mjs` automatically ... joined with `;` never `&&`" — i.e. the upload must still run even when `summary.errors > 0` already set a non-zero `process.exitCode`), the new upload-chaining step belongs **after** this block, unconditional on `summary.errors`, and must not let a failed/no-op upload downgrade an otherwise-successful `process.exitCode`. Follow `promoteCapture`'s already-established "best-effort side effect, log-and-continue" try/catch shape (`scripts/dogfood/dogfood-run.mjs:226-236`, cited above) rather than propagating an upload failure into `dogfood-wrapup.mjs`'s own exit code — TEAM-02's fail-open contract is that upload failure is invisible to the caller of `dogfood-wrapup.mjs`.

**Precedent for spawning a sibling script from inside a script (if implemented as a child process rather than a direct function import):** `scripts/dogfood/dogfood-run.mjs:26,155-159`'s `spawn(options.command, options.args, { cwd, env, stdio })` argv-array-not-shell-string convention. Prefer this over `execFileSync` if `upload-run.mjs`'s own network call could be slow — a synchronous `execFileSync` would block `dogfood-wrapup.mjs`'s process for the whole upload.

---

### `scripts/dogfood/transcript-writer.mjs` (MODIFIED — Pattern 4: `taskManifestCorpora` field)

**Analog:** itself — `getReport()`'s existing return shape (`scripts/dogfood/transcript-writer.mjs:204-221`):
```javascript
getReport({ runId, startedAt, corpusRoot, manifestPath }) {
  let totalToolCalls = 0;
  for (const tally of Object.values(perTool)) {
    totalToolCalls += tally.count;
  }
  return {
    schemaVersion: 1,
    runId,
    startedAt,
    endedAt: new Date().toISOString(),
    corpusRoot,
    manifestPath,
    totalToolCalls,
    perTool,
    stagedCaptures,
    transcriptPath,
  };
},
```
ARCHITECTURE.md Pattern 4 specifies adding one additive field, `taskManifestCorpora: string[]`, to this exact object — the caller (`scripts/dogfood/dogfood-run.mjs`'s `finalize()`, which already has `loadTaskManifest(manifestPath)`'s parsed result in scope per `dogfood-run.mjs:147`) should pass the distinct `corpus` values used (`[...new Set(manifest.map((entry) => entry.corpus))]`, the same dedup-and-array-from-Set idiom `resolveWrapupPolicyKey` already uses at `dogfood-wrapup.mjs:312`) into `getReport()`'s existing parameter object. `schemaVersion` stays `1` (additive, backward-compatible field — old reports without it simply lack the key, exactly as ARCHITECTURE.md §3 Pattern 4 specifies).

**`writeRunReport` stays unchanged** (`scripts/dogfood/transcript-writer.mjs:278-281`) — it JSON-serializes whatever `report` object it is given, so no changes are needed there; only `getReport()`'s call sites and its own parameter list grow one field.

---

### Test files (NEW) — `test/unit/tools/team-issue-key.test.ts`, `dogfood-upload-run.test.ts`, `team-cron-ingest-wrapup.test.ts`

**Analog:** `test/unit/tools/dogfood-wrapup-filing.test.ts` (dependency-injection style) + `test/unit/tools/queue-intake.test.ts` (temp-dir-per-test style). Both are the established way `.mjs` scripts get unit-tested via their exported functions in this codebase — never a subprocess-spawning "run the CLI and check stdout" test.

**mkdtempSync-per-test + afterEach cleanup convention** (`test/unit/tools/queue-intake.test.ts:16-26`, identical in `dogfood-wrapup-filing.test.ts:27-36`):
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
The `// @ts-expect-error script module lacks types` comment directly above every `.mjs` import is load-bearing convention, not decoration — every test file importing a `scripts/*.mjs` module in this codebase has it.

**Full dependency-injection (`config.deps`) test shape** (`test/unit/tools/dogfood-wrapup-filing.test.ts:95-115`):
```typescript
test("wrapUpCapture: a true-green verdict (orcl01=pass, orcl02=clean) is never filed and never classified for flakiness", async () => {
  const artifact = baseArtifact();
  const runOracleFn = vi.fn(async () => fakeVerdict({ orcl01: { kind: "pass" }, orcl02: { kind: "clean" } }));
  const classifyFn = vi.fn();
  const upsertFn = vi.fn();
  const appendFlakyFn = vi.fn();

  const result = await wrapUpCapture("fake-capture.json", artifact, {
    queueJsonPath: throwawayQueuePath(),
    flakyLogPath: throwawayFlakyLogPath(),
    deps: { runOracle: runOracleFn, classifyFlakiness: classifyFn, upsertQueueEntry: upsertFn, appendFlakyLog: appendFlakyFn },
  });

  expect(result.filed).toBe(false);
  expect(result.classification).toBe("not-a-candidate");
  expect(upsertFn).not.toHaveBeenCalled();
});
```
`team-cron-ingest-wrapup.test.ts` should inject fakes for `wrapUpCapture`, `upsertQueueEntry`, and the new git-write-back function exactly this way — zero real Agda/subprocess/filesystem/network cost. `dogfood-upload-run.test.ts` should inject a fake `fetch` (global `fetch` override or a `deps.fetch` param) the same way, and assert the retry-queue NDJSON file's contents directly via `readFileSync` (mirroring `queue-intake.test.ts:56-59`'s "assert both the return value and the on-disk file" style) rather than asserting only the function's return value.

---

## Shared Patterns

### Path sandboxing (mandatory reuse — PITFALLS.md Pitfall 6, "never trust the tar library's own guard alone")
**Source:** `src/repo-root.ts:19-27,69-76`
**Apply to:** `scripts/team/cron-ingest-wrapup.mjs` (archive extraction), `scripts/team/ingest-server.mjs` (final archive destination path)
```typescript
export class PathSandboxError extends Error {
  readonly targetPath: string;
  constructor(targetPath: string, message: string) {
    super(message);
    this.name = "PathSandboxError";
    this.targetPath = targetPath;
  }
}
...
export function resolveFileWithinRoot(projectRoot: string, targetPath: string): string {
  const resolvedRoot = resolve(projectRoot);
  const resolvedPath = resolve(projectRoot, targetPath);
  if (!isPathWithinRoot(resolvedRoot, resolvedPath)) {
    throw new PathSandboxError(targetPath, `Path '${targetPath}' escapes project root`);
  }
  return resolvedPath;
}
```
Live consumer to copy the *usage* pattern from (not just the primitive): `scripts/oracle/orcl-01-differential.mjs:97-106` (`try { dest = resolveFileWithinRoot(root, entry.path); } catch (err) { if (err instanceof PathSandboxError) { continue; } throw err; }`).

### Atomic writes
**Source:** `src/session/safe-source-io.ts:157-173`
**Apply to:** all single-shot JSON/report artifacts this phase writes (`team-keys.json`, `run-report.json`'s new field, `wrapup-report.json`-equivalent cron summary, the fix-queue write — already covered by `upsertQueueEntry`'s own internal `writeFileAtomic` call)
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
Never `fs.writeFileSync` directly for any file more than one process/retry could observe mid-write — this is imported today via `../../src/session/safe-source-io.js` from `scripts/queue/intake.mjs`, `scripts/oracle/run-oracle.mjs`, and `scripts/dogfood/transcript-writer.mjs`; every new script in this phase should import it the same way.

### Append-only NDJSON side-channel
**Source:** `scripts/dogfood/transcript-writer.mjs:70-83` (pattern), siblings at `scripts/oracle/run-oracle.mjs:261-262` and `scripts/dogfood/dogfood-wrapup.mjs:174-187`
**Apply to:** `.agda-mcp/team/upload-queue.jsonl` (retry queue), any per-archive processed-marker log
- `appendFileSync` (not `writeFileAtomic`) for growing many-small-record files, single writer, out-of-band.
- Never let an append failure throw past the caller — warn once (a module-level `warned` boolean), then go silent, matching `appendTranscriptLine`'s exact shape.

### CLI argv/env parsing and exit-code convention
**Source:** `scripts/dogfood/dogfood-wrapup.mjs:345-370`, `scripts/oracle/run-oracle.mjs:273-316`, `scripts/dogfood/dogfood-run.mjs:80-106`
**Apply to:** every new script's `scriptMain`/`parseXxxArgv`
- Flat `for` loop over `argv` matching `--flag` then consuming `argv[i+1]`, never a CLI-parsing library (no new dependency).
- `process.env.AGDA_MCP_..._` is always the fallback when a flag is absent, never the other way around (flag wins).
- Positive-integer flags are validated and **thrown** synchronously in the parse helper (never allowed through as `NaN`) — see `dogfood-wrapup.mjs:352-358`'s `--rerun-n` validation as the template for TEAM-02/03's numeric bounds.
- `process.exitCode = 1` (never `process.exit()`) inside anything that might be imported/tested; reserve `process.exit()` for a genuine long-running top-level proxy (`dogfood-run.mjs`'s `finalize()` only).
- `if (isMainModule(import.meta.url, process.argv[1])) { await scriptMain(); }` as the universal last line.

### Subprocess spawning — argv array, never a shell string (CWE-78)
**Source:** `src/index.ts:136-145` (the canonical citation), applied in `scripts/oracle/cold-agda-session.mjs:102-106` (`spawn`) and `scripts/queue/mirror-github.mjs:56-75,177-189` (`execFileSync`)
**Apply to:** `upload-run.mjs`'s `tar` invocation, `cron-ingest-wrapup.mjs`'s extraction + `git commit`/`git push` calls
- `spawn`/`execFileSync(binary, [argv, array], { shell: false, ... })` — `shell: false` stated explicitly even though it is the default, "as belt-and-suspenders."
- Use `spawn` (not `execFileSync`) wherever output could be large/streamed (tar archives) — `execFileSync` buffers the whole child stdout in memory.
- Every real subprocess call sits behind an `options.deps?.<fn> ?? <realFn>` override so tests never actually shell out (see `mirror-github.mjs:56-57,144-145`).

### Fail-open / best-effort side effects
**Source:** `scripts/dogfood/dogfood-run.mjs:175-176,226-240`
**Apply to:** `upload-run.mjs` (the whole upload attempt), the D-12 upload-chain step inside `dogfood-wrapup.mjs`
- Wrap the effect in try/catch; on failure, `process.stderr.write` a one-line diagnostic and continue — never let a network/IO failure become an uncaught exception or propagate a non-zero exit code into an unrelated caller.

### policyKey resolution (Phase 6 dependency — consume, do not re-derive)
**Source:** `scripts/oracle/orcl-02-soundness-scan.mjs:500-506,549-617,669-698`, `scripts/oracle/run-oracle.mjs:177-187,228-233`, `scripts/dogfood/dogfood-wrapup.mjs:291-334`
**Apply to:** `scripts/team/cron-ingest-wrapup.mjs`
- `judgeOrcl02(artifactPath, options)`/`runOracle(artifactPath, options)` already accept `options.policyKey` — thread it through, do not reintroduce `.agda-lib`-name-derivation for uploaded corpora (the exact W2 anti-pattern).
- `PolicyResolutionError` (a named `Error` subclass carrying `.policyKey`) propagates **uncaught** for an explicitly-requested-but-unresolvable key — "loud, never silent" (D-03) is an established, repeated convention in this exact code path, not a one-off choice for `cron-ingest-wrapup.mjs` to relitigate.

### Test dependency injection
**Source:** `test/unit/tools/dogfood-wrapup-filing.test.ts:95-115`, `test/unit/tools/queue-intake.test.ts:16-26,48-60`
**Apply to:** all three new test files
- `mkdtempSync`-per-test + `afterEach` cleanup array, never a shared fixture directory across tests.
- `deps: { realFnName: vi.fn(...) }` passed as the last argument to the function under test; assert both the function's return value **and** the resulting on-disk file content where a write occurred.
- `// @ts-expect-error script module lacks types` immediately above every `scripts/*.mjs` import.

---

## Gaps: Techniques With No Codebase Precedent

These specific sub-concerns have zero prior art anywhere in `src/` or `scripts/` (grep-confirmed) — the planner should follow RESEARCH.md/STACK.md/PITFALLS.md directly for these, using the CLI/lifecycle scaffolding above only for everything *around* them:

| Concern | Needed in | Grep evidence | Follow instead |
|---------|-----------|----------------|-----------------|
| `node:http` server / request routing / body-size-capped streaming receive | `scripts/team/ingest-server.mjs` | Zero hits for `node:http`/`createServer` outside unrelated MCP-SDK test helpers (`test/unit/tools/session-tools.test.ts`, `mcp-e2e-coverage.test.ts` — a same-named local `createServer()` test helper, unrelated) | STACK.md's `node:http` section; PITFALLS.md Pitfall 6 / Security Mistakes table for the size-cap-before-parsing requirement |
| tar/gzip archive **creation** (`spawn(tar) → zlib transform → fs stream` pipeline) and **extraction** | `scripts/dogfood/upload-run.mjs` (create), `scripts/team/cron-ingest-wrapup.mjs` (extract) | Zero hits for `node:zlib`, `spawn(...tar...)`, or any tar dependency in `package.json` | STACK.md ("split archive structure via system `tar` from compression via Node's own `zlib`"); PITFALLS.md Pitfall 6 |
| Streaming HTTP upload via global `fetch` with `duplex: 'half'` | `scripts/dogfood/upload-run.mjs` | Zero hits for `fetch(` performing a POST with a streamed body anywhere in this repo | STACK.md's global-`fetch` section; MDN `Request.duplex` citation in SUMMARY.md Sources |
| `crypto.randomBytes` (key minting) and `crypto.timingSafeEqual` (constant-time Bearer compare, D-13) | `scripts/team/issue-key.mjs`, `scripts/team/ingest-server.mjs` | Zero hits for either symbol anywhere in `src/`/`scripts/` (only `createHash` exists, in `src/reporting/bug-report.ts`) | STACK.md's `node:crypto` section; PITFALLS.md Security Mistakes table ("Bearer key comparison via plain string equality") |
| `git commit` / `git push` from a script | `scripts/team/cron-ingest-wrapup.mjs` | Zero hits for `git commit`/`git push`/`'push'` in any `scripts/*.mjs` (only `gh` CLI calls exist, in `mirror-github.mjs`) | Model on `mirror-github.mjs`'s `execFileSync`-argv-array + explicit-flag-gate shape (see Pattern Assignment above); CONTEXT.md D-01/D-02 for exact commit/push semantics (direct push to `main`, `--no-push` dev escape hatch) |

## No Analog Found

No entire file lacks a usable analog — every new file has at least a role-match CLI/lifecycle precedent (see File Classification table). The table above scopes the *specific* no-precedent techniques instead, which is the more actionable gap for planning purposes.

## Metadata

**Analog search scope:** `scripts/` (all subdirectories), `src/repo-root.ts`, `src/session/safe-source-io.ts`, `src/reporting/bug-report.ts`, `src/index.ts`, `test/unit/tools/` (queue/dogfood/oracle test files)
**Files scanned:** ~30 `.mjs` scripts, 5 `src/*.ts` files, 4 test files read in full or via targeted line ranges; repo-wide grep for `node:http`, `node:zlib`, tar/spawn usage, `timingSafeEqual`, `randomBytes`, `git commit`/`git push`, `writeFileAtomic`, `materialize`/`PathSandbox`/`resolveFileWithinRoot`
**Pattern extraction date:** 2026-07-04
