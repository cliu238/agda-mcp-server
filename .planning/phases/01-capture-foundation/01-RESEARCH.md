# Phase 1: Capture Foundation - Research

**Researched:** 2026-07-01
**Domain:** Reproducible-capture substrate for a stateful `agda --interaction-json` subprocess (single-`AgdaSession` TypeScript MCP server); no external libraries — this is a codebase-integration problem, not a library-selection problem.
**Confidence:** HIGH (all findings verified directly against this repo's source, not training-data guesses)

## Summary

Phase 1 adds exactly two `src/` surfaces on top of existing, already-verified codebase seams: (1) a pure `session-capture` model (barrel + siblings, mirroring `session-load-impl.ts`'s free-function-over-shared-state pattern) that assembles a `CaptureArtifact`, and (2) a thin emit-only tool (`agda_capture_session`) that follows `register-bug-bundles.ts`'s shape but returns a P2 *reference*, not the payload. Everything else — persistence, the dedup-index writer, staging promotion — lives in `scripts/` + a new gitignored `.agda-mcp/captures/` data dir, never inside `src/`.

Three findings materially change what "auto-stamped, never caller-supplied" (CAP-01) requires versus what's currently on the singleton `AgdaSession`: (a) `mergeCommandLineOptions()` in `project-config.ts` **deduplicates** flags (last-wins), which directly contradicts CAP-01's "ordered argv vector with duplicates preserved" — the capture model needs its own flag-recording path that captures the pre-merge, pre-dedup argv construction Agda actually received, not a call to `mergeCommandLineOptions()`. (b) `createLibraryRegistration()` is genuinely non-deterministic (writes to a fresh `mkdtempSync` dir unless `AGDA_DIR` is externally stable) and is called once per process inside `session-process-lifecycle.ts`, not per-load — the manifest must read the *realized* `session.libraryRegistration.agdaDir` contents already on disk from the live session, never re-invoke `createLibraryRegistration()` (which would silently produce a *different* ephemeral dir). (c) There is no existing content-hash-of-import-closure primitive; `buildImportGraph()`/`computeImpact()` in `import-graph.ts` give the transitive dependency file set for free (already used by `agda_postulate_closure`/`agda_bulk_status`) but CAP-01's SHA-256 over that closure's *content* must be built new — hash each file's bytes in graph-computed order, don't invent a second closure walker.

The `RecordedTransport` cassette (CAP-04) is genuinely novel — nothing off-the-shelf recorded a stdio-newline-JSON protocol exists in this codebase or standard Node tooling (VCR/nock/Polly are explicitly out — wrong seam, HTTP-only). It composes as a decorator around `AgdaTransport` at the tool-call boundary (`dispatchSessionCommand` in `session-command-dispatch.ts`), draining a bounded ring buffer of `{command, timestamp, normalizedResponses}` triples into the artifact at capture time, gated by `AGDA_MCP_CAPTURE=1` per D-06.

**Primary recommendation:** Build `src/agda/session-capture/` (barrel `session-capture.ts` + siblings `manifest-builder.ts`, `import-closure-hash.ts`, `recorded-transport.ts`, `dedup-index.ts`, `artifact-types.ts`) as free functions taking `AgdaSession` — mirroring `session-load-impl.ts` exactly — plus one new `src/tools/register-capture-session.ts` thin adapter. Reuse `fingerprintBugReport()` verbatim (CAP-02), `buildImportGraph()`/`computeImpact()` for the closure walk (CAP-01/CAP-05), `safe-source-io.ts`'s atomic-write + O_NOFOLLOW pattern for any file the capture model touches on disk, and `Cmd_goal_type`/`Cmd_infer_toplevel` via `command-builder.ts` for CAP-05's substrate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capture-verb request/response (MCP tool) | API / Backend (`src/tools/`) | — | Thin adapter over the Agda-domain layer; validates via Zod, wraps `ToolEnvelope` |
| Replay-manifest assembly (Agda version, argv, `AGDA_DIR`, closure hash) | API / Backend (`src/agda/session-capture/`) | — | Reads live `AgdaSession` state; domain logic, not a tool concern |
| Action-log recording (`RecordedTransport`) | API / Backend (`src/session/agda-transport.ts` seam) | — | Wraps the existing IOTCM stdio transport; must live in `session/` per the layering table |
| Dedup index read (`fingerprintBugReport()` → prior-report map) | API / Backend (`src/agda/session-capture/`) | Persistence (`scripts/` + `.agda-mcp/captures/index.json`) | Capture *reads* the index (in-process); an out-of-band script *writes* it (persistence tier) |
| Artifact staging (write to `.agda-mcp/captures/`) | Persistence / Local filesystem (`scripts/` + data dir) | — | D-09/D-10: emit-only means the tool itself may stage out-of-repo, but promotion into the repo is explicitly an out-of-band script, not `src/` |
| Import-closure content-hash | API / Backend (`src/agda/session-capture/`) | — | Pure computation over `buildImportGraph()` output; no I/O beyond file reads already sandboxed by `repo-root.ts` |
| Cold-replay proof (success criterion 6) | Out of process (`scripts/` + a second machine) | — | Explicitly a scripts-tier validation exercise, not server runtime behavior |

## Standard Stack

### Core
No new external dependencies. This phase is 100% composition over existing internal modules — `node:crypto` (`createHash`, already used in `bug-report.ts`), `node:fs`/`node:fs/promises` (already used throughout `session/`), and the existing `zod` v4 schema conventions.

### Supporting
| Module (internal) | Purpose | Reuse Contract |
|---|---|---|
| `src/reporting/bug-report.ts` (`fingerprintBugReport`) | CAP-02 dedup fingerprint | Reuse verbatim — do not invent a second fingerprint function |
| `src/agda/import-graph.ts` (`buildImportGraph`, `computeImpact`) | Transitive import closure (CAP-01 hash input, CAP-05 substrate scope) | Reuse for the file-set walk; hash the file *contents* on top |
| `src/session/safe-source-io.ts` | O_NOFOLLOW read + atomic write | Reuse for any capture-model file I/O — "New capture/replay code adds its own file read/write path" is a named Security Mistake in PITFALLS.md |
| `src/tools/tool-envelope.ts` (`okEnvelope`/`errorEnvelope`) | Response shape | Reuse — never construct the envelope literal directly |
| `src/protocol/command-builder.ts` (`topLevelCommand`, `command`, `quoted`) | `Cmd_goal_type`/`Cmd_infer_toplevel` construction | Reuse — CAP-05's intended-goal-type / expected-signature substrate must route through the SSOT, never a hand-built IOTCM string |
| `src/agda/library-registration.ts` (types only, NOT `createLibraryRegistration()`) | Realized `AGDA_DIR` contents | **Read** `session.libraryRegistration.agdaDir` (already realized by the live process) — do NOT call `createLibraryRegistration()` again, which is non-deterministic (fresh `mkdtempSync` unless `AGDA_DIR` is stable) |
| `src/server-version.ts` (`getServerVersion`) | Server version stamp | Reuse — same accessor `register-bug-bundles.ts` already uses via `tryGetAgdaVersion` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `RecordedTransport` decorator | HTTP VCR libs (nock/Polly/msw) | Explicitly ruled out in REQUIREMENTS.md Out of Scope — wrong seam (bespoke IOTCM/JSON over stdio, not HTTP) |
| SHA-256 content-hash over closure | A hash of just file paths + mtimes | Rejected: mtimes aren't portable across the "second machine" cold-replay success criterion; must hash content bytes |
| New fingerprint algorithm for CAP-02 | `fingerprintBugReport()` reuse | Rejected: CONTEXT.md D-03 and CAP-02 explicitly mandate reusing the existing sha256, not inventing a parallel identity scheme |

**Installation:** None — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — Phase 1 introduces zero new npm dependencies. All work is internal composition over existing modules (`node:crypto`, `node:fs`, `zod`, `@modelcontextprotocol/sdk` — already installed).

## Architecture Patterns

### System Architecture Diagram

```
 Agent (Codex/Claude Code)
        │  MCP tool call: agda_capture_session({ note?, expectedSignature?, beforeSource? })
        ▼
 ┌───────────────────────────────────────────────────────────┐
 │ src/tools/register-capture-session.ts  (thin adapter)      │
 │  - Zod-validate input                                      │
 │  - call into session-capture model                         │
 │  - wrap ToolEnvelope (P2: reference, not payload)           │
 └───────────────┬───────────────────────────────────────────┘
                 ▼
 ┌───────────────────────────────────────────────────────────┐
 │ src/agda/session-capture/  (pure model, barrel + siblings) │
 │                                                              │
 │  1. manifest-builder.ts                                     │
 │     reads LIVE AgdaSession state (never re-derives):        │
 │       - session.detectedVersion, findAgdaBinary(repoRoot)   │
 │       - argv actually sent to Cmd_load (captured at the     │
 │         dispatch boundary — NOT via mergeCommandLineOptions │
 │         which dedupes)                                      │
 │       - session.libraryRegistration.agdaDir (realized,      │
 │         already-written libraries/defaults files)           │
 │       - repoRoot, cwd, fresh-vs-shared _build                │
 │                                                              │
 │  2. import-closure-hash.ts                                  │
 │     buildImportGraph() + computeImpact() → file set          │
 │     → SHA-256 over sorted (path, content-bytes) pairs        │
 │                                                              │
 │  3. recorded-transport.ts (RecordedTransport)                │
 │     ring buffer of {command, ts, normalizedResponses}        │
 │     wraps AgdaTransport at session-command-dispatch.ts seam  │
 │     gated by AGDA_MCP_CAPTURE=1 (default OFF, D-06)          │
 │                                                              │
 │  4. dedup-index.ts                                           │
 │     reads (never writes) .agda-mcp/captures/index.json       │
 │     fingerprint → { recurrence, kind } via fingerprintBugReport│
 │                                                              │
 │  5. artifact-types.ts — CaptureArtifact interface (barrel)   │
 └───────────────┬───────────────────────────────────────────┘
                 ▼
 ToolResult.data = { stagedPath, fingerprint, kind, recurrence,
                      summary, keyDiagnostics, nextAction }
 (full CaptureArtifact JSON is STAGED, not inlined — P2/D-09)
                 │
                 ▼
 .agda-mcp/captures/<fingerprint>-<n>.json   (out-of-repo, gitignored)
                 │
                 ▼ (out-of-band, scripts/ — NOT this phase's src/)
 scripts/promote-capture.mjs → writes into .agda-mcp/captures/index.json
                                (dedup-index write-side)
```

### Recommended Project Structure
```
src/agda/session-capture/
├── session-capture.ts        # barrel — re-exports only
├── manifest-builder.ts        # CAP-01: server-stamped replay manifest
├── import-closure-hash.ts     # CAP-01: content-hash of transitive closure
├── recorded-transport.ts      # CAP-04: ring-buffer action-log recorder
├── dedup-index.ts             # CAP-02: read-only index lookup
├── oracle-substrate.ts        # CAP-05: source diff + goal-type + expected-signature capture
└── artifact-types.ts          # CaptureArtifact / RecordedAction / ReplayManifest types

src/tools/
└── register-capture-session.ts   # the one new MCP tool

scripts/
└── promote-capture.mjs        # out-of-band: reads staged artifact, writes index, promotes into repo
```

### Pattern 1: Free-function-over-shared-state (mirror `session-load-impl.ts`)
**What:** Every capture-model function takes `AgdaSession` as its first argument and reads/derives from its live fields; no second `AgdaSession`, no re-invocation of side-effecting constructors like `createLibraryRegistration()`.
**When to use:** Every function in `src/agda/session-capture/*.ts`.
**Example:**
```typescript
// Source: pattern mirrored from src/agda/session-load-impl.ts:57 (runLoad)
export function buildReplayManifest(session: AgdaSession): ReplayManifest {
  return {
    agdaVersion: session.getAgdaVersion(),
    agdaBinaryPath: findAgdaBinary(session.repoRoot),
    serverVersion: getServerVersion(),
    node: process.version,
    os: `${process.platform}-${process.arch}`,
    // NEVER call mergeCommandLineOptions() here — it dedupes.
    // Read the raw ordered argv recorded at dispatch time instead.
    mergedArgv: session.lastDispatchedArgv ?? [],
    agdaDirContents: readRealizedAgdaDir(session.libraryRegistration?.agdaDir ?? null),
    cwd: session.repoRoot,
    buildMode: detectBuildFreshness(session.repoRoot),
  };
}
```

### Pattern 2: Emit-only tool returning a reference (mirror `register-bug-bundles.ts` + P2)
**What:** The tool builds the full artifact, stages it to `.agda-mcp/captures/`, and returns only `{ stagedPath, fingerprint, kind, recurrence, summary, keyDiagnostics, nextAction }` in `ToolResult.data` — never the full bundle.
**When to use:** `src/tools/register-capture-session.ts`.
**Example:**
```typescript
// Source: shape mirrored from src/tools/register-bug-bundles.ts:72-138
registerStructuredTool({
  server,
  name: "agda_capture_session",
  description: "Snapshot the current session (stuck, failed, or suspicious-green) into a self-replaying capture artifact. Emit-only: stages out-of-repo; does not write into the repo tree.",
  category: "reporting", // matches agda_bug_report_bundle's category
  requiresLoadedSession: false, // D-01: state-agnostic, must work even without a clean load
  inputSchema: {
    expectedSignature: z.string().optional().describe("Task-authored expected top-level signature (CAP-05, optional per D-02)"),
    beforeSource: z.string().optional().describe("Source text before the agent's edits, for the diff substrate (CAP-05)"),
  },
  outputDataSchema: captureReferenceSchema, // { stagedPath, fingerprint, kind, recurrence, summary, keyDiagnostics, nextAction }
  callback: async (inputs) => { /* build artifact, stage, return reference */ },
});
```

### Pattern 3: Bounded ring-buffer recorder gated by env switch
**What:** `RecordedTransport` wraps `AgdaTransport` (or intercepts at the `dispatchSessionCommand` call site) and appends a `{command, timestamp, normalizedResponses}` triple per call, capped at N entries (drop oldest — but see the STATE.md warning that the buffer must not drop the *early* actions of a long dogfood session; consider drop-newest-when-full with a truncation diagnostic instead of drop-oldest, or size N generously and document the tradeoff explicitly in the plan).
**When to use:** Only active when `process.env.AGDA_MCP_CAPTURE === "1"` (D-06); zero-cost no-op otherwise.
**Anti-pattern to avoid:** Growing `agda-transport.ts` (535 lines, already over the 500-line ceiling per CONTEXT.md canonical refs) — compose via wrapping/decoration, do not add fields/methods directly to `AgdaTransport`.

### Anti-Patterns to Avoid
- **Calling `createLibraryRegistration()` a second time to "get" the AGDA_DIR for the manifest:** it is non-deterministic (fresh temp dir) and would silently manifest a *different* AGDA_DIR than the one the live session actually used. Always read `session.libraryRegistration.agdaDir` off the live singleton.
- **Calling `mergeCommandLineOptions()` to reconstruct "the argv" for CAP-01:** it deduplicates (last-wins) by design for `session.load()`'s purposes; CAP-01 explicitly requires duplicates preserved. The capture model needs to record the pre-dedup, ordered list as constructed (project file flags ++ env flags ++ per-call flags, in that order, undeduped) — this is a genuinely new code path, not a call-through.
- **A second `AgdaSession` for cold-replay verification:** issue #39's invariant — Phase 1 only *captures*; the cold-replay proof (success criterion 6) happens out-of-process on a second machine/script, never via a second in-process session.
- **Golden-mastering the current (possibly buggy) `ok`/`classification` as "correct" inside the capture artifact:** Phase 1 is state-agnostic (D-01) — capture must faithfully record what happened, including a suspicious green, without asserting it is correct. That judgment is Phase 2's job entirely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bug/defect fingerprinting | A new hash-of-identity-fields function | `fingerprintBugReport()` (`src/reporting/bug-report.ts`) | CAP-02 explicitly requires reuse; a second fingerprint scheme would let the same logical defect dedup two different ways |
| Transitive import closure walk | A new module-graph BFS | `buildImportGraph()` / `computeImpact()` (`src/agda/import-graph.ts`) | Already battle-tested by `agda_postulate_closure`/`agda_bulk_status`/`agda_impact`; a second walker risks drifting on the comment-stripping / module-name-parsing edge cases already solved there |
| Atomic file writes for any staged artifact | `fs.writeFileSync` direct | `writeFileAtomic()` / read guard in `src/session/safe-source-io.ts` | PITFALLS.md Security Mistakes: "New capture/replay code adds its own file read/write path" → TOCTOU symlink race named explicitly as a risk |
| IOTCM command construction for `Cmd_goal_type`/`Cmd_infer_toplevel` | Hand-built strings | `command()`/`topLevelCommand()`/`goalCommand()` (`src/protocol/command-builder.ts`) | SSOT invariant — `test/unit/protocol/no-bare-command-strings.test.ts` enforces this repo-wide |
| Recorded-session cassette format | An HTTP VCR library (nock/Polly/msw) | Hand-rolled `RecordedTransport` at the stdio seam | Explicitly out of scope (REQUIREMENTS.md) — wrong protocol shape entirely |

**Key insight:** Almost every hard sub-problem CAP-01/02/04/05 name already has a partially-built, verified answer somewhere in this codebase (`fingerprintBugReport`, `buildImportGraph`, `safe-source-io`, `command-builder`). The actual net-new work in Phase 1 is narrow: (1) the RecordedTransport decorator, (2) the pre-dedup ordered-argv capture point, (3) reading (not re-deriving) the realized `AGDA_DIR`, and (4) assembling all of the above into one `CaptureArtifact` shape.

## Common Pitfalls

### Pitfall 1: Non-reproducible captures — "the report can't be replayed"
**What goes wrong:** A capture bundle is missing session lineage (prior commands), environment timing knobs, or the exact merged flags — so it becomes an anecdote, not a repro.
**Why it happens:** A failure is a function of a *stateful* subprocess plus *heuristic* idle-timer completion detection, not a pure input→output pair (see `AGDA_MCP_IDLE_COMPLETION_MS` etc. in `command-completion.ts`).
**How to avoid:** The manifest must pin `agda --version` output verbatim, the resolved project root, merged config, all `AGDA_MCP_*` env overrides in effect, and the ordered action log — not just the final failing call. Store inline first-party source (per D-07), never a path reference to a mutable on-disk file.
**Warning signs:** A captured bundle whose `stagedPath` references files that could have changed since capture; fingerprints that differ run-to-run for the same logical bug (timing leaking into the fingerprint).

### Pitfall 2: The flag-dedup mismatch (CAP-01-specific, found during this research)
**What goes wrong:** A planner or implementer instinctively reaches for `mergeCommandLineOptions()` to "get the merged flags" for the manifest, and silently violates CAP-01's "duplicates preserved" requirement, because that function's entire job (for `session.load()`) is to deduplicate with last-wins semantics.
**Why it happens:** `mergeCommandLineOptions()` is the only existing "merged flags" abstraction in the codebase, so it looks like the obvious reuse target — but it was built for a different, narrower purpose than CAP-01's replay-fidelity requirement.
**How to avoid:** Record the argv as three ordered, undeduped segments (project file flags, env flags, per-call flags) at the point they are about to be passed to `Cmd_load`'s options list — capture that pre-merge sequence directly, or add a new capture-only helper that concatenates without deduping. Do not route CAP-01's argv field through `mergeCommandLineOptions()`.
**Warning signs:** A CAP-01 acceptance test with `--flag --flag` in the input config that comes back as a single `--flag` in the captured manifest.

### Pitfall 3: Timing/idle-completion nondeterminism captured as "a bug" (or masking one)
**What goes wrong:** A capture records a transient idle-timer truncation (exactly the #65/#66 root cause) and gets filed as a logic bug; or a real trailing event is dropped and a false-green gets captured as clean.
**Why it happens:** Completion detection (`idleCompletionDelay`, `shouldResolveOnIdle` in `command-completion.ts`) is wall-clock heuristic, not protocol-guaranteed.
**How to avoid (Phase 1 scope):** Phase 1 does not need to solve re-run/flake-classification (that's process-level, later phases) — but the action log must record the terminus-tracking fields (`awaitGoalTerminus`, `sawInteractionPoints`/`sawAllGoalsWarnings`/`sawLoadError` from `agda-transport.ts`) alongside each recorded action, so a later phase can distinguish a truncated stream from a genuine result without re-deriving it.

### Pitfall 4: Trusting `ok-complete` as ground truth inside the capture itself
**What goes wrong:** If the capture tool internally reloads or re-verifies via the *same warm session* to "confirm" the state before staging, it inherits #64/#61's exact false-green risk (warm-session transitive-`.agdai`-staleness).
**Why it happens:** It's tempting to make the capture verb "smart" and re-check before staging.
**How to avoid:** D-01 already forces this correctly — capture is **state-agnostic**, it snapshots whatever `session.lastClassification`/`session.getLastClassification()` currently says without re-running anything to "confirm" it. Do not add a re-verification step inside the capture tool; that judgment belongs entirely to Phase 2's oracle triad.

### Pitfall 5: Growing `agda-transport.ts` past the ceiling to add recording
**What goes wrong:** The natural instinct is to add ring-buffer fields directly onto `AgdaTransport` (it already owns `responseQueue`). But it's already 535 lines — over the 500-line ceiling.
**How to avoid:** `RecordedTransport` must be a wrapping/composing layer (e.g. intercepting at `dispatchSessionCommand`'s `session.transport.sendCommand(...)` call site, or a decorator object holding a reference to `AgdaTransport`), not new fields/methods added in-place.

## Code Examples

### Reusing `fingerprintBugReport()` for CAP-02 dedup
```typescript
// Source: src/reporting/bug-report.ts:73-96 (existing, verified in this session)
import { fingerprintBugReport } from "../../reporting/bug-report.js";

const fingerprint = fingerprintBugReport({
  kind: "new-bug", // dedup-index lookup below determines the real kind
  affectedTool: captureContext.affectedTool ?? "agda_capture_session",
  classification: session.getLastClassification() ?? "unknown",
  observed: captureContext.observedSummary,
  expected: captureContext.expectedSummary,
  reproduction: recordedActions.map((a) => a.command),
  serverVersion: getServerVersion(),
});
```

### Reading the realized `AGDA_DIR` (never re-deriving)
```typescript
// session.libraryRegistration is set once per process lifecycle
// by src/agda/session-process-lifecycle.ts:122 — read its agdaDir,
// then list what's actually on disk there (libraries/defaults files).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readRealizedAgdaDir(agdaDir: string | null): { libraries: string[]; defaults: string[] } | null {
  if (!agdaDir) return null;
  const librariesFile = join(agdaDir, "libraries");
  const defaultsFile = join(agdaDir, "defaults");
  return {
    libraries: existsSync(librariesFile) ? readFileSync(librariesFile, "utf8").split(/\r?\n/u).filter(Boolean) : [],
    defaults: existsSync(defaultsFile) ? readFileSync(defaultsFile, "utf8").split(/\r?\n/u).filter(Boolean) : [],
  };
}
```

### Content-hashing the transitive import closure
```typescript
// Source: composed from src/agda/import-graph.ts (buildImportGraph, computeImpact)
// + node:crypto (already used in src/reporting/bug-report.ts)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildImportGraph, computeImpact } from "../import-graph.js";

function hashImportClosure(repoRoot: string, filePath: string, agdaVersion?: AgdaVersion): string {
  const graph = buildImportGraph(repoRoot, agdaVersion);
  const impact = computeImpact(graph, repoRoot, filePath);
  const files = new Set<string>([
    ...(impact?.directDependencies ?? []),
    ...(impact?.transitiveDependencies ?? []),
  ]);
  const rel = filePath; // already repo-root-relative by convention elsewhere
  files.add(rel);
  const sorted = [...files].sort();
  const hash = createHash("sha256");
  for (const f of sorted) {
    hash.update(f);
    hash.update("\0");
    hash.update(readFileSync(resolve(repoRoot, f))); // raw bytes, not text-decoded
    hash.update("\0");
  }
  return hash.digest("hex");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `agda_bug_report_bundle` inlines the whole bundle in `ToolResult.data` | `agda_capture_session` returns only a staged-path reference | This phase (per DESIGN-PRINCIPLES.md P2, adopted 2026-07-01) | Capture artifacts (with inline source + action log) are far larger than bug bundles — inlining would burn an agent's context budget over a long proof session |
| Manual/ad-hoc bug report authoring | Auto-stamped replay manifest, never caller-supplied | This phase (CAP-01) | Removes the #1 named pitfall (non-reproducible captures) at the source — an agent cannot omit environment fields even by mistake |

**Deprecated/outdated:** None — this phase doesn't replace or deprecate an existing tool; `agda_bug_report_bundle` remains the lighter-weight sibling for cases that don't need a full replay manifest.

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new tool + new model), not a rename/refactor/migration. No existing runtime state (stored data, live service config, OS registrations, secrets) is being renamed or moved.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The pre-dedup ordered argv (project file flags ++ env flags ++ per-call flags) is not currently captured anywhere in the codebase and must be recorded as a new field at the `session.load()` call site (or equivalent), rather than reconstructed after the fact from `mergeCommandLineOptions()`'s inputs | Architecture Patterns / Pitfall 2 | If wrong (i.e. if `mergeCommandLineOptions()`'s pre-dedup inputs happen to already be threaded through to a place the capture model can read), the plan could reuse existing plumbing instead of adding a new capture point — worth a quick verification pass in plan-phase before committing to "new field on `AgdaSession`" |
| A2 | A bounded ring buffer sized to "the last N tool-call + normalized-envelope pairs" (per D-06) is sufficient without special-casing "don't drop the first N actions of a long session" — STATE.md explicitly flags this as an open sizing question for plan-phase, not resolved here | Architecture Patterns / Pattern 3 | If the buffer silently drops early actions of exactly the sessions Loop ② cares most about (long dogfooding runs), CAP-04's "ordered tool calls" replay value degrades for the highest-value captures; plan-phase should size N generously and/or make truncation an explicit diagnostic rather than a silent drop |
| A3 | `.agda-mcp/captures/` (gitignored, out-of-repo-tree but inside the project directory) is the correct staging convention, matching CONTEXT.md D-09/D-10's "OS temp or gitignored `.agda-mcp/captures/`" — I have not verified whether `.agda-mcp/` needs to be added to `.gitignore` (it is currently absent from `.gitignore`) | Architecture Patterns / diagram | If unaddressed, a capture artifact could get accidentally `git add`-ed; plan-phase should include a task to add `.agda-mcp/` to `.gitignore` |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Where exactly does the "before" source diff (CAP-05) get its baseline from?**
   - What we know: D-04 explicitly defers this to plan-phase research: "how the 'before' source of the diff is reconstructed (git vs recorded edits vs agent-supplied)."
   - What's unclear: Whether to shell out to `git diff`/`git show` (requires the project to be a git repo and the file to be tracked — not guaranteed for every dogfooding target), to track edits via the recorder (requires wiring proof-edit application, `apply-*.ts`, into the same recording seam), or to require the agent to pass `beforeSource` explicitly as a tool input.
   - Recommendation: The lowest-risk default for Phase 1 is agent-supplied `beforeSource` (optional, like `expectedSignature` per D-02's optionality pattern) with a `git diff`-based best-effort fallback when the target is inside a git repo and the file is tracked — falling back to "no diff available" (with a `nextAction` warning) otherwise. This avoids a hard git dependency while still capturing the common case automatically. Confirm this choice explicitly in plan-phase, not silently.

2. **Where precisely does `RecordedTransport` intercept — the `AgdaTransport` class itself, or the `dispatchSessionCommand`/`dispatchSessionControlCommand` call sites in `session-command-dispatch.ts`?**
   - What we know: CONTEXT.md flags this as the exact seam decision left to plan-phase ("Ring-buffer sizing and exactly where `RecordedTransport` wraps the transport are for plan-phase"). `agda-transport.ts` is already at 535 lines (over ceiling) so new fields there are out.
   - What's unclear: Whether recording at the `AgdaTransport.sendCommand`/`sendFireAndForgetCommand` level (captures raw `AgdaResponse[]`) or at `dispatchSessionCommand` level (captures the already-normalized/ higher-level tool-call boundary CAP-04's "normalized envelopes" language suggests) is the correct layer — CAP-04 explicitly says "normalized envelopes," which points toward the `ToolEnvelope` boundary in `src/tools/tool-registration.ts`'s `timedCallback` wrapper, not the raw transport.
   - Recommendation: Record at the MCP tool-call boundary (in `tool-registration.ts`'s `timedCallback`, or a thin wrapper around it) so "ordered tool calls + args + normalized envelopes" is captured verbatim as CAP-04 literally states, rather than reconstructing normalized envelopes from raw `AgdaResponse[]` after the fact. This also naturally captures *all* tool calls (not just Agda-protocol ones), which may matter for a faithful session lineage. Verify this reading against CAP-04's exact wording in plan-phase.

3. **What counts as "fresh vs shared `_build`" for the manifest field, given this project's `_build` convention (`test/fixtures/agda/_build/` is gitignored, but dogfooding targets are arbitrary external Agda projects)?**
   - What we know: `.gitignore` only knows about the repo's own `test/fixtures/agda/_build/`; dogfooding targets (agda-unimath, Codex-Homotopy-Group) are separate external projects with their own build/interface-cache conventions.
   - What's unclear: How the capture model detects "fresh" vs "shared" `_build` for an arbitrary external target project, not just this repo's own fixtures.
   - Recommendation: Likely a simple existence + mtime-recency heuristic on the target project's own `_build`/interface-cache directory (if any), or an explicit flag threaded from the dogfooding driver script (Phase 5) rather than server-side detection. Flag for plan-phase to decide the exact detection heuristic.

## Environment Availability

Skipped — no external tooling/service dependencies beyond what's already required project-wide (Node.js ≥24, npm, the `agda` binary already resolved via `findAgdaBinary()`). No new CLI, database, or service dependency is introduced by this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` ^4.1.2 |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run test/unit/agda/session-capture --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAP-01 | Manifest is server-stamped (never caller-supplied); argv preserves duplicates; realized `AGDA_DIR` read, not re-derived; closure content-hash computed | unit | `npx vitest run test/unit/agda/session-capture/manifest-builder.test.ts` | ❌ Wave 0 |
| CAP-02 | Re-capture routes as `update` with incremented recurrence via `fingerprintBugReport()` | unit | `npx vitest run test/unit/agda/session-capture/dedup-index.test.ts` | ❌ Wave 0 |
| CAP-03 | `agda_capture_session` returns a reference (not full bundle) in `ToolResult.data`; writes nothing into the repo tree | integration | `npx vitest run test/integration/tools/register-capture-session.test.ts` | ❌ Wave 0 |
| CAP-04 | Recorded action log captures ordered tool calls + args + normalized envelopes; replayable | unit + integration | `npx vitest run test/unit/agda/session-capture/recorded-transport.test.ts` | ❌ Wave 0 |
| CAP-05 | Source diff, intended goal type (`Cmd_goal_type`), expected signature substrate all attach to the artifact; optional-but-warned when absent (D-02) | unit | `npx vitest run test/unit/agda/session-capture/oracle-substrate.test.ts` | ❌ Wave 0 |
| Success criterion 6 | A captured bundle self-replays cold on a second machine | manual / scripts | `node scripts/verify-cold-replay.mjs <staged-artifact-path>` (new script, not vitest) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run test/unit/agda/session-capture --reporter=dot`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`; cold-replay script run at least once manually (criterion 6 is inherently a two-machine manual check, not CI-automatable in this phase)

### Wave 0 Gaps
- [ ] `test/unit/agda/session-capture/manifest-builder.test.ts` — covers CAP-01
- [ ] `test/unit/agda/session-capture/dedup-index.test.ts` — covers CAP-02
- [ ] `test/integration/tools/register-capture-session.test.ts` — covers CAP-03
- [ ] `test/unit/agda/session-capture/recorded-transport.test.ts` — covers CAP-04
- [ ] `test/unit/agda/session-capture/oracle-substrate.test.ts` — covers CAP-05
- [ ] `scripts/verify-cold-replay.mjs` — supports success criterion 6 (not a vitest test; a standalone verification script per D-07/D-08's "no automatic minimization, this is manual/scripted verification")
- [ ] No new test-fixture Agda files anticipated beyond existing `test/fixtures/agda/*` — capture-model unit tests can synthesize minimal fixtures inline or reuse `CompleteFixture.agda`/`AbstractHoleMultiple.agda` for hole/postulate scenarios

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Server is a local stdio MCP process, no auth surface |
| V3 Session Management | no | N/A — `AgdaSession` is a process-lifecycle concept, not a web session |
| V4 Access Control | no | Single local user/agent context |
| V5 Input Validation | yes | Zod schema on `agda_capture_session` inputs (`expectedSignature`, `beforeSource`); path-related fields (if any) MUST route through `resolveExistingPathWithinRoot`/`resolveFileWithinRoot` from `repo-root.ts`, never a raw `fs` call on caller input |
| V6 Cryptography | yes | SHA-256 for content-hash and fingerprinting is `node:crypto`'s `createHash`, already the repo convention (`bug-report.ts`) — never hand-roll a hash function |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| TOCTOU symlink race on capture-model file reads/writes (explicitly named in PITFALLS.md Security Mistakes) | Tampering | Reuse `src/session/safe-source-io.ts`'s O_NOFOLLOW read + atomic temp-file-rename write; never a fresh `fs.readFileSync`/`writeFileSync` path in the capture model |
| Path escape when staging/reading capture artifacts from untrusted proof projects | Tampering / Information Disclosure | Keep the `resolveFileWithinRoot`/`PathSandboxError` sandbox boundary (`src/repo-root.ts`) for any path the capture model resolves, including dogfooding targets outside this repo |
| Oversized capture artifact (huge inline source, huge recorded action log) exhausting memory | Denial of Service | Apply the same size discipline as `MAX_AGDA_SOURCE_BYTES` (512 KiB) / `MAX_CONFIG_FILE_BYTES` (256 KiB) conventions already in the codebase — cap inline source size and ring-buffer entry count, with a truncation diagnostic rather than silent drop or OOM |
| Capture staging path escaping the intended `.agda-mcp/captures/` convention (e.g. via a crafted repo root or symlinked `.agda-mcp/`) | Tampering | Resolve the staging directory once via `resolveProjectRoot()` + a fixed relative join, then sandbox-check before any write, same pattern as `resolveFileWithinRoot` |

## Sources

### Primary (HIGH confidence — verified directly against this repo's source in this session)
- `src/reporting/bug-report.ts` — `fingerprintBugReport()`, `buildBugReportBundle()` (read in full)
- `src/tools/register-bug-bundles.ts` — the `agda_bug_report_bundle` emit-only precedent (read in full)
- `src/session/agda-transport.ts` — IOTCM stdio transport, completion-detection heuristics, terminus tracking (read in full)
- `src/agda/session-command-dispatch.ts` — command-queue dispatch, control-command interruption pattern (read in full)
- `src/tools/tool-envelope.ts` — `ToolEnvelope`/`okEnvelope`/`errorEnvelope` (read in full)
- `src/agda/session.ts` — the `AgdaSession` class, all public/internal fields (read in full)
- `src/session/project-config.ts` — `mergeCommandLineOptions()` dedup behavior (read in full; source of Pitfall 2 finding)
- `src/protocol/command-builder.ts` — IOTCM command construction SSOT (read in full)
- `src/agda/library-registration.ts` — `createLibraryRegistration()` non-determinism, AGDA_DIR realization (read in full; source of the "never re-derive" finding)
- `src/agda/binary-discovery.ts` — `findAgdaBinary()` pinned-binary resolution (read in full)
- `src/agda/session-load-impl.ts` — free-function-over-shared-state pattern to mirror (read in full)
- `src/agda/import-graph.ts` — `buildImportGraph`/`computeImpact` transitive closure (partially read, header + core types)
- `src/tools/agent-ux/options-tools.ts`, `src/tools/agent-ux/project-tools.ts` — `agda_effective_options`, `agda_postulate_closure` precedents (read in full)
- `src/session/safe-source-io.ts` — atomic-write/O_NOFOLLOW convention (read in full)
- `src/repo-root.ts` — path-sandboxing primitives (partially read)
- `src/tools/tool-registration.ts` — `registerStructuredTool()` signature and the `timedCallback` wrapper (partially read)
- `src/tools/manifest.ts` — `ToolCategory` enumeration (partially read)
- `.planning/DESIGN-PRINCIPLES.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/01-capture-foundation/01-CONTEXT.md` — full read

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — process-level pitfalls (HIGH confidence per its own self-rating, grounded in this repo's issue history #58/#61/#64/#65/#66)
- `.planning/research/FUEL-CORPORA.md` — cross-phase artifact inventory (private-repo-sourced, not independently re-verified this session — carried forward as prior research)

### Tertiary (LOW confidence)
- None — all findings in this document trace to direct repo reads or the project's own prior research artifacts.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; entirely internal composition, every reused module read in full
- Architecture: HIGH — directly derived from reading the actual layering (`session.ts`, `session-command-dispatch.ts`, `agda-transport.ts`) and the existing barrel/sibling pattern in `session-load-impl.ts`
- Pitfalls: HIGH — sourced from this repo's own `PITFALLS.md` (grounded in real issue history) plus two net-new findings (flag-dedup mismatch, AGDA_DIR non-determinism) verified by reading the actual source this session

**Research date:** 2026-07-01
**Valid until:** 30 days (internal codebase research; stale only if `project-config.ts`/`library-registration.ts`/`agda-transport.ts` are refactored before planning starts)
