# Phase 1: Capture Foundation - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 8 (2 mandated `src/` surfaces, decomposed into their sibling modules, plus 1 `scripts/` file and `.gitignore`)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/agda/session-capture/session-capture.ts` (barrel) | model (barrel) | transform | `src/agda/agent-ux.ts` (barrel pattern) / `src/agda/session-load-impl.ts` (free-function-over-shared-state) | role-match |
| `src/agda/session-capture/manifest-builder.ts` | model | transform (reads live session state → `ReplayManifest`) | `src/agda/session-load-impl.ts` (`runLoad`) | exact (same free-function-over-`AgdaSession` shape) |
| `src/agda/session-capture/import-closure-hash.ts` | utility | batch (file-set walk + hash) | `src/agda/import-graph.ts` (`buildImportGraph`/`computeImpact`) + `src/reporting/bug-report.ts` (`fingerprintBugReport`, hash-over-normalized-identity pattern) | role-match |
| `src/agda/session-capture/recorded-transport.ts` | middleware (decorator) | event-driven (wraps a command-dispatch call site) | `src/agda/session-command-dispatch.ts` (`dispatchSessionCommand`) | role-match (decoration point, not a literal analog — this is the "genuinely novel" piece) |
| `src/agda/session-capture/dedup-index.ts` | service | CRUD (read-only lookup) | `src/reporting/bug-report.ts` (`fingerprintBugReport`) | role-match (fingerprint reuse; index-read is new) |
| `src/agda/session-capture/oracle-substrate.ts` | model | request-response (Cmd_goal_type / Cmd_infer_toplevel round trip) | `src/agda/session-load-impl.ts` (`command()`/`quoted()` + `session.sendCommand` usage) | role-match |
| `src/agda/session-capture/artifact-types.ts` | model (types only) | — | `src/agda/types.ts` (`LoadResult` discriminated shape) | role-match |
| `src/tools/register-capture-session.ts` | controller (MCP tool) | request-response (emit-only) | `src/tools/register-bug-bundles.ts` (`registerBugReportBundle`) | exact |
| `scripts/promote-capture.mjs` | utility (out-of-band script) | file-I/O (read staged artifact, write index, promote into repo) | none in-repo (`scripts/` has build helpers only, e.g. `scripts/copy-json-assets.mjs`) — no close analog | no analog |
| `.gitignore` (add `.agda-mcp/`) | config | — | existing `.gitignore` entries (`test/fixtures/agda/_build/`) | exact |

## Pattern Assignments

### `src/agda/session-capture/manifest-builder.ts` (model, transform)

**Analog:** `src/agda/session-load-impl.ts` (`runLoad`)

**Imports pattern** (lines 1-27 of the analog):
```typescript
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { AgdaSession } from "./session.js";
import type { LoadResult } from "./types.js";
import { command, quoted } from "../protocol/command-builder.js";
```
Mirror: import `AgdaSession` as a type only, import from `../protocol/command-builder.js` for any `Cmd_*` string built here, never hand-build IOTCM strings (SSOT invariant, enforced by `test/unit/protocol/no-bare-command-strings.test.ts`).

**Free-function-over-shared-state pattern** (lines 57-71):
```typescript
export async function runLoad(
  session: AgdaSession,
  filePath: string,
  options?: { profileOptions?: string[]; commandLineOptions?: string[] },
): Promise<LoadResult> {
  invalidatePriorLoadState(session);
  const absPath = resolve(session.repoRoot, filePath);
  if (!existsSync(absPath)) {
    return finalizeEarlyReturn(session, fileNotFound(absPath));
  }
  ...
```
Copy this shape exactly for `buildReplayManifest(session: AgdaSession): ReplayManifest` — first arg is always the live `AgdaSession`, function reads/derives fields, never constructs a second session or re-invokes side-effecting constructors.

**Critical field-read pitfalls (do NOT reuse these two functions for CAP-01):**
- `mergeCommandLineOptions()` — `src/session/project-config.ts:389-404` — **deduplicates with last-wins**:
```typescript
export function mergeCommandLineOptions(
  projectDefaults: string[] | undefined,
  perCallOptions: string[] | undefined,
): string[] {
  const combined = [...(projectDefaults ?? []), ...(perCallOptions ?? [])];
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = combined.length - 1; i >= 0; i--) {
    const opt = combined[i];
    if (!seen.has(opt)) { seen.add(opt); result.unshift(opt); }
  }
  return result;
}
```
CAP-01 requires duplicates preserved — do not call this for the manifest's `mergedArgv` field; record the pre-dedup ordered segments (project file flags ++ env flags ++ per-call flags) at the point they're about to reach `Cmd_load`, as a new capture-only concatenation helper.
- `createLibraryRegistration()` — `src/agda/library-registration.ts:164-198` — **non-deterministic** (fresh `mkdtempSync(join(tmpdir(), "agda-mcp-libs-"))` unless `AGDA_DIR` is externally stable, lines 177-184). Never call this again for the manifest. Instead read the already-realized dir off the live session (`session.libraryRegistration.agdaDir`, set once in `session-process-lifecycle.ts`) and list its `libraries`/`defaults` files directly, same pattern as `readConfiguredLibraries()` (lines 72-94) / `readNonCommentLines()` (lines 32-41) in that file — reuse the *reading* helpers, never the *registration* constructor.

### `src/agda/session-capture/import-closure-hash.ts` (utility, batch)

**Analog:** `src/agda/import-graph.ts` (`buildImportGraph`, `computeImpact`) + `src/reporting/bug-report.ts` (hash pattern)

**Core closure-walk pattern** (`buildImportGraph`, lines 240-281; `computeImpact`, lines 293-309+):
```typescript
export function buildImportGraph(
  projectRoot: string,
  agdaVersion?: AgdaVersion,
): ImportGraph { /* walks sources, builds imports/importedBy maps, sorted for determinism */ }

export function computeImpact(
  graph: ImportGraph,
  projectRoot: string,
  sourceFile: string,
): ImpactResult | null {
  const absPath = isAbsolute(sourceFile) ? sourceFile : resolve(projectRoot, sourceFile);
  const relPath = relative(projectRoot, absPath);
  const mod = graph.modules.get(relPath);
  if (!mod) return null;
  const directDependencies = (graph.imports.get(relPath) ?? []).slice();
  const transitiveDependencies = collectReachable(graph.imports, relPath);
  ...
```
Reuse verbatim for the file-set walk (already used by `agda_postulate_closure`/`agda_bulk_status`/`agda_impact`) — do not write a second BFS/module-graph walker.

**Hashing pattern (sha256-over-normalized-identity), mirror from `fingerprintBugReport`** (`src/reporting/bug-report.ts:73-96`):
```typescript
export function fingerprintBugReport(input: ...): string {
  const identity = { kind: input.kind, affectedTool: input.affectedTool, ... };
  return createHash("sha256")
    .update(stableStringify(identity))
    .digest("hex")
    .slice(0, 16);
}
```
For the closure hash: sort the file set, then hash `(path, content-bytes)` pairs in sorted order (not text-decoded — raw bytes, per RESEARCH.md's `hashImportClosure` example) — same `node:crypto` `createHash("sha256")` convention, new pure function, not a call into `fingerprintBugReport` (different identity object).

### `src/agda/session-capture/recorded-transport.ts` (middleware, event-driven — novel)

**Analog (decoration point, not implementation):** `src/agda/session-command-dispatch.ts` (`dispatchSessionCommand`, lines 40-94)

```typescript
export function dispatchSessionCommand(
  session: AgdaSession,
  command: string,
  timeoutMs: number,
  options: { awaitGoalTerminus?: boolean } = {},
): Promise<AgdaResponse[]> {
  const mySerial = ++session.commandSerial;
  const task = session.commandQueue.then(async () => {
    assertSessionAlive(session);
    ...
    try {
      responses = await session.transport.sendCommand(proc, command, timeoutMs, options);
    } finally {
      resetFileBoundStateIfProcDied(session, proc);
    }
    ...
    return responses;
  });
  session.commandQueue = task.then(() => { }, () => { });
  return task;
}
```
Per RESEARCH.md Open Question 2, the recommended interception point is the **MCP tool-call boundary** (`timedCallback` in `src/tools/tool-registration.ts:171-191`, see excerpt below), not this file — CAP-04 says "normalized envelopes," which is the `ToolEnvelope` shape produced at that layer, not raw `AgdaResponse[]`. `dispatchSessionCommand` is included here only as the free-function-over-shared-state template and as the reason `agda-transport.ts` (535 lines, already over ceiling) must not gain new fields — compose via wrapping.

**Tool-call boundary to record at** (`src/tools/tool-registration.ts:171-191`):
```typescript
const timedCallback = async (toolArgs: any) => {
  const startMs = performance.now();
  let result: unknown;
  try {
    result = await args.callback(toolArgs);
  } catch (err) {
    result = makeTextToolErrorResult(args.name, err, {});
  }
  const elapsed = Math.round(performance.now() - startMs);
  if (result && typeof result === "object" && "structuredContent" in result) {
    const structuredContent = (result as any).structuredContent;
    if (structuredContent && typeof structuredContent === "object" && structuredContent.elapsedMs === undefined) {
      structuredContent.elapsedMs = elapsed;
    }
  }
  return result;
};
```
`RecordedTransport`'s ring-buffer append should hook here (or a thin wrapper composed around it), appending `{command: args.name, timestamp: startMs, normalizedResponse: structuredContent}` — this naturally captures every tool call (not just Agda-protocol ones), matches CAP-04's "normalized envelopes" wording, and needs zero changes to `agda-transport.ts`. Gate the whole append behind `process.env.AGDA_MCP_CAPTURE === "1"` (D-06) as a cheap `if` at the top — zero-cost no-op otherwise.

### `src/agda/session-capture/dedup-index.ts` (service, CRUD — read-only)

**Analog:** `src/reporting/bug-report.ts` (`fingerprintBugReport`, reused verbatim — see above)

```typescript
import { fingerprintBugReport } from "../../reporting/bug-report.js";

const fingerprint = fingerprintBugReport({
  kind: "new-bug",
  affectedTool: captureContext.affectedTool ?? "agda_capture_session",
  classification: session.getLastClassification() ?? "unknown",
  observed: captureContext.observedSummary,
  expected: captureContext.expectedSummary,
  reproduction: recordedActions.map((a) => a.command),
  serverVersion: getServerVersion(),
});
```
Reuse `fingerprintBugReport()` import + call shape verbatim (CAP-02, D-03). The dedup-index *read* (`.agda-mcp/captures/index.json` → `Map<fingerprint, {recurrence, kind}>`) is new logic; mirror `readNonCommentLines()`'s existsSync-guard style from `src/agda/library-registration.ts:32-41` for the "absent index ⇒ empty" fallback (first capture ⇒ `new-bug`, recurrence 1, per D-03).

### `src/agda/session-capture/oracle-substrate.ts` (model, request-response)

**Analog:** `src/protocol/command-builder.ts` (SSOT) as used in `session-load-impl.ts`

```typescript
// src/protocol/command-builder.ts:29-39
export function command(name: string, ...parts: CommandAtom[]): string {
  return [name, ...parts.map(atom)].join(" ");
}
export function goalCommand(name: string, goalId: number, ...parts: CommandAtom[]): string {
  return command(name, goalId, "noRange", ...parts);
}
export function topLevelCommand(name: string, ...parts: CommandAtom[]): string {
  return command(name, ...parts);
}
```
Usage template (`session-load-impl.ts:83-87`):
```typescript
const responses = await session.sendCommand(
  session.iotcmFor(absPath, command("Cmd_load", quoted(absPath), optsBuild.optsList)),
  undefined,
  { awaitGoalTerminus: true },
);
```
For CAP-05's live `Cmd_goal_type`/`Cmd_infer_toplevel` grab: build the command string via `command()`/`goalCommand()`/`topLevelCommand()` from `command-builder.ts`, never a hand-built string — `test/unit/protocol/no-bare-command-strings.test.ts` enforces this repo-wide. Route the call through `session.sendCommand(...)` (the singleton), never a second `AgdaSession`.

### `src/tools/register-capture-session.ts` (controller, request-response, emit-only)

**Analog:** `src/tools/register-bug-bundles.ts` (`registerBugReportBundle`, lines 72-139)

**Imports pattern** (lines 1-27):
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AgdaSession } from "../agda-process.js";
import { buildBugReportBundle } from "../reporting/bug-report.js";
import { getServerVersion } from "../server-version.js";

import {
  errorEnvelope,
  makeToolResult,
  okEnvelope,
  registerStructuredTool,
} from "./tool-helpers.js";
```

**Emit-only registration pattern** (lines 72-93):
```typescript
export function registerBugReportBundle(server: McpServer, session: AgdaSession): void {
  registerStructuredTool({
    server,
    name: "agda_bug_report_bundle",
    description: "Emit a structured bundle for a new bug report or regression, suitable for issue filing or later updates.",
    category: "reporting",
    requiresLoadedSession: false,
    inputSchema: { /* zod fields */ },
    outputDataSchema: bugBundleSchema,
    callback: async (inputs) => { ... },
  });
}
```
Copy directly for `agda_capture_session`: `category: "reporting"`, `requiresLoadedSession: false` (D-01: state-agnostic, must work even without a clean load). **Deviation from this analog (per P2/D-09/D-10):** `register-bug-bundles.ts` inlines the whole `bundle` object into `data: { ...bundle }` (line 121) — the capture tool must NOT do this; it stages the full `CaptureArtifact` out-of-repo and returns only the lightweight reference `{ stagedPath, fingerprint, kind, recurrence, summary, keyDiagnostics, nextAction }` in `data`.

**Try/catch → envelope error-handling pattern** (lines 96-136):
```typescript
try {
  const bundle = buildBugReportBundle({ ... });
  return makeToolResult(
    okEnvelope({
      tool: "agda_bug_report_bundle",
      summary: `Built bug bundle ${bundle.bugFingerprint} for ${inputs.affectedTool}.`,
      classification: bundle.classification,
      data: { ...bundle },
    }),
    renderBugBundleText("Bug Report Bundle", bundle),
  );
} catch (err) {
  const message = `Bug bundle generation failed: ${err instanceof Error ? err.message : String(err)}`;
  return makeToolResult(
    errorEnvelope({
      tool: "agda_bug_report_bundle",
      summary: message,
      classification: "tool-error",
      data: baseErrorData({ ...inputs, kind }),
    }),
    message,
  );
}
```
Mirror this shape; the capture tool's `catch` must still return a full envelope (never let a stray exception escape — though `registerStructuredTool`'s `timedCallback` wrapper is also a safety net, see below).

**Barrel/orchestrator registration:** `src/tools/reporting-tools.ts:26-38` shows how a new tool file plugs into the existing `register()` barrel:
```typescript
export function register(server: McpServer, session: AgdaSession, _repoRoot: string): void {
  registerToolsCatalog(server, session);
  registerProtocolParity(server, session);
  registerBugReportBundle(server, session);
  registerBugReportUpdateBundle(server, session);
  ...
}
```
Add `registerCaptureSession(server, session, _repoRoot)` here (or wherever `register-core-tools.ts` wires the reporting group), following the same one-line-per-tool pattern.

## Shared Patterns

### Tool envelope / error translation
**Source:** `src/tools/tool-envelope.ts` (`okEnvelope`, lines 130-151; `errorEnvelope`, lines 153-174) + `src/tools/tool-registration.ts` (`registerStructuredTool`, lines 133-203)
**Apply to:** `register-capture-session.ts` exclusively (the only tool file in this phase).
```typescript
export function okEnvelope<T extends Record<string, unknown>>(args: {
  tool: string; summary: string; data: T; classification?: string;
  diagnostics?: ToolDiagnostic[]; stale?: boolean; provenance?: Record<string, unknown>; elapsedMs?: number;
}): ToolEnvelope<T> { ... }
```
Never construct `{ ok, classification, ... }` object literals directly — always go through `okEnvelope`/`errorEnvelope`. `registerStructuredTool`'s `timedCallback` (lines 171-191) already catches any uncaught exception from the callback body and converts it to a structured error envelope via `makeTextToolErrorResult`, so the tool's own try/catch is a second layer of defense, not the only one.

### Diagnostics with `nextAction` (P3 — every result carries next-step guidance)
**Source:** `src/tools/tool-envelope.ts` (`infoDiagnostic`/`warningDiagnostic`/`errorDiagnostic`, lines 118-128)
**Apply to:** Every diagnostic the capture tool emits — D-02's "expected signature absent" warning, D-06's "env-switch OFF, empty log" warning, D-04's "no before-source, no diff" warning must each carry a `nextAction` pointing at the follow-up MCP call/step (e.g. `nextAction: "Re-run agda_capture_session with AGDA_MCP_CAPTURE=1 set for a full action log."`).
```typescript
export function warningDiagnostic(message: string, code?: string, nextAction?: string): ToolDiagnostic {
  return { severity: "warning", message, code, nextAction };
}
```

### Atomic / hardened file I/O for any capture-model disk touch
**Source:** `src/session/safe-source-io.ts` (`readAgdaSourceFile`, lines 76-95; `writeFileAtomic`, lines 157-173)
**Apply to:** Any file the capture model reads (the dedup index, the target project's source for the closure hash) or writes (the staged artifact JSON in `.agda-mcp/captures/`).
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
PITFALLS.md names "new capture/replay code adds its own file read/write path" as a security mistake explicitly — reuse this module's O_NOFOLLOW-read + atomic-write pair rather than a fresh `fs.readFileSync`/`writeFileSync` call anywhere in `session-capture/`.

### IOTCM command construction SSOT
**Source:** `src/protocol/command-builder.ts` (`command`, `quoted`, `goalCommand`, `topLevelCommand`)
**Apply to:** `oracle-substrate.ts` (CAP-05's `Cmd_goal_type`/`Cmd_infer_toplevel`) and any other place a new IOTCM string is built.
Enforced by `test/unit/protocol/no-bare-command-strings.test.ts` — a hand-built `"Cmd_..."` string literal anywhere outside `command-builder.ts` fails CI.

### Single-`AgdaSession` routing (issue #39 invariant)
**Source:** `src/agda/session.ts` fields (`repoRoot`, `currentFile`, `goalIds`, `commandQueue`, `commandSerial`, `libraryRegistration`, `transport`) — the singleton constructed once in `src/index.ts`.
**Apply to:** Every function in `session-capture/*.ts` and the tool callback in `register-capture-session.ts` — always take/thread the one `AgdaSession` instance passed in at registration time; never `new AgdaSession(...)` inside capture code (this is exactly the #39 regression class, and Pitfall 4 in RESEARCH.md names re-verification-via-warm-session as the concrete way this phase could reintroduce it).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/promote-capture.mjs` | utility (out-of-band script) | file-I/O | `scripts/` currently only has build-tooling helpers (e.g. `scripts/copy-json-assets.mjs`, a post-`tsc` asset copier) — no existing script reads a staged JSON artifact, writes an index, and promotes files into the repo tree. RESEARCH.md's `scripts/verify-cold-replay.mjs` (success criterion 6) has the same gap. Both are genuinely new script shapes; use plain `node:fs/promises` + the `.mjs` ESM convention already established by `scripts/copy-json-assets.mjs`, but there is no in-repo behavioral analog to copy from beyond "small standalone `.mjs` file, no framework." |
| `src/agda/session-capture/recorded-transport.ts` (implementation, not decoration point) | middleware | event-driven | Explicitly flagged novel in CONTEXT.md/RESEARCH.md — no existing stdio-cassette/VCR-style recorder exists in this codebase or is reachable via a library (HTTP VCRs are the wrong protocol shape). The *decoration point* has an analog (`dispatchSessionCommand` / `timedCallback`, documented above); the ring-buffer recorder object itself does not. |

## Metadata

**Analog search scope:** `src/agda/`, `src/tools/`, `src/session/`, `src/protocol/`, `src/reporting/`, `scripts/` (all read directly, no Glob/Grep-only inference)
**Files scanned:** 12 read in full (`bug-report.ts`, `register-bug-bundles.ts`, `reporting-tools.ts`, `session-load-impl.ts`, `safe-source-io.ts`, `tool-registration.ts`, `command-builder.ts`, `library-registration.ts`, `tool-envelope.ts`, `session-command-dispatch.ts`) + 2 targeted excerpts (`project-config.ts` `mergeCommandLineOptions`, `import-graph.ts` `buildImportGraph`/`computeImpact`) + `.gitignore` verified to confirm A3 (no `.agda-mcp/` entry yet)
**Pattern extraction date:** 2026-07-01
