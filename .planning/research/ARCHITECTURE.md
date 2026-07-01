# Architecture Research

**Domain:** Self-improvement / dogfooding loop ("Loop ②") plugging into an existing layered TypeScript MCP server (`agda-mcp-server`)
**Researched:** 2026-07-01
**Confidence:** HIGH for codebase-integration decisions (grounded in existing source: `bug-report.ts`, reporting tools, `fixture-matrix.json`, MCP harness); MEDIUM for loop-design opinions (reasoned from constraints, not externally benchmarked)

---

## Guiding Principle: The Loop Wraps the Server; It Does Not Live Inside It

The single most important architectural decision: **Loop ② is process tooling that surrounds the server, not a feature layer bolted into `src/`.** The server is the product under test. The loop *uses* it the same way an external agent does — over the existing MCP stdio boundary. Almost all Loop ② machinery therefore belongs in `scripts/`, repo data directories (`triage/`, `test/fixtures/regressions/`), and `test/regression/` — **not** in `src/`.

The only justified addition inside `src/` is a thin **in-band capture tool** that snapshots live session state at the moment a defect surfaces, because that context (goal IDs, last tool payload, diagnostics, load classification) exists only inside the running `AgdaSession` and cannot be reliably reconstructed from outside. That tool follows the existing `agda_bug_report_bundle` precedent exactly: it **emits a structured artifact envelope; it never writes to the repo.** Materialization into fixtures/tests/queue is a separate out-of-band step.

This keeps the 500-line ceiling, the layering, and the single-`AgdaSession` invariant untouched, and it prevents the server binary from growing self-referential test-harness code.

---

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│  OUT-OF-BAND HARNESS (scripts/ + repo data)  — the Loop ② machinery    │
│                                                                         │
│  ┌────────────────┐   spawn+drive over stdio   ┌────────────────────┐  │
│  │ dogfood-run    │ ─────────────────────────► │  MCP stdio client  │  │
│  │  .mjs          │   (reuses mcp-harness /     │  (existing)        │  │
│  │ (orchestrator) │    mcp-local-client)        └─────────┬──────────┘  │
│  └───────┬────────┘                                       │             │
│          │ records                                        │ tool calls  │
│          ▼                                                ▼             │
│  ┌────────────────┐        ┌──────────────────────────────────────┐    │
│  │ transcript     │        │        AGDA MCP SERVER (src/) —       │    │
│  │  sink (.jsonl) │        │        UNCHANGED PRODUCT              │    │
│  └───────┬────────┘        │  ┌────────────────────────────────┐  │    │
│          │                 │  │ tools → session → agda →        │  │    │
│          │  capture        │  │ protocol  (single AgdaSession)  │  │    │
│          │  artifact       │  │                                 │  │    │
│          │  (bundle JSON)  │  │  + NEW thin in-band tool:       │  │    │
│          ◄─────────────────┼──┤    agda_capture_session         │  │    │
│          │                 │  │    (emits CaptureArtifact,      │  │    │
│          │                 │  │     writes nothing)             │  │    │
│          ▼                 │  │    delegates to:                │  │    │
│  ┌────────────────┐        │  │      src/reporting/             │  │    │
│  │ capture-       │        │  │        session-capture.ts (NEW) │  │    │
│  │ materialize    │        │  │      + existing bug-report.ts   │  │    │
│  │  .mjs          │        │  │      + existing session-snapshot│  │    │
│  └───────┬────────┘        │  └────────────────────────────────┘  │    │
│          │ writes          └──────────────────────────────────────┘    │
│          ├──────────────► triage/<fingerprint>/  (IN-REPO FIX QUEUE)    │
│          ├──────────────► test/fixtures/regressions/<name>.agda         │
│          ├──────────────► test/fixtures/regressions/regression-matrix.json
│          └──────────────► test/regression/<name>.test.ts (scaffold)     │
│                                                                         │
│  ┌────────────────┐  optional one-way mirror                           │
│  │ triage-sync.mjs│ ──────────────────► GitHub issues (gh CLI)         │
│  └────────────────┘                                                    │
└───────────────────────────────────────────────────────────────────────┘
```

`fingerprintBugReport()` (already in `src/reporting/bug-report.ts`) is the **shared identity key** that threads through capture → queue → fixture → test, giving free deduplication and cross-referencing at every stage.

### Component Responsibilities

| Component | Responsibility | Where it lives / Typical implementation |
|-----------|----------------|------------------------------------------|
| Capture data model | Superset of `BugReportBundle`: adds session snapshot ref, tool-call transcript ref, repro `.agda` source ref, versions | `src/reporting/session-capture.ts` (NEW, sibling to `bug-report.ts`; pure, no I/O) |
| In-band capture tool | One MCP call an agent invokes mid-session to snapshot the live defect; **emits** a `CaptureArtifact` envelope, writes nothing | `src/tools/register-capture.ts` (NEW) or extend `reporting-tools.ts` barrel; thin adapter delegating to reporting + `session-snapshot.ts` |
| Artifact on-disk schema | Directory-per-capture format: `bundle.json`, `repro.agda`, `transcript.jsonl`, `meta.json` | `captures/<fingerprint>/` (raw, gitignored) + JSON Schema under `schemas/` |
| Dogfooding orchestrator/recorder | Launches server over stdio (reusing existing harness), drives an agent against a fuel source, records the full tool-call transcript | `scripts/dogfood-run.mjs` (NEW); reuses `test/helpers/mcp-harness.ts` / `scripts/mcp-local-client.mjs` |
| Materializer | Transforms a capture artifact → in-repo queue entry + regression fixture + regression-matrix row + scaffolded vitest test | `scripts/capture-materialize.mjs` (NEW) |
| In-repo fix queue | SSOT for open/closed defects, deduped by fingerprint, versioned alongside the fix | `triage/` directory (NEW): `triage/<fingerprint>/report.md` + `triage/index.json` |
| Regression fixtures + matrix | Real `.agda` repro sources + JSON matrix describing expected behavior (mirrors existing `fixture-matrix.json`) | `test/fixtures/regressions/` + `regression-matrix.json` (NEW) |
| Regression test runner | Vitest tests that replay each captured defect and assert the fixed behavior | `test/regression/*.test.ts` (NEW); matrix-driven like existing fixture tests |
| GitHub sync (optional) | One-way projection of the in-repo queue into GitHub issues for visibility | `scripts/triage-sync.mjs` (NEW); `gh` CLI |

---

## Recommended Project Structure

```
agda-mcp-server/
├── src/                                 # PRODUCT — minimal, surgical additions only
│   ├── reporting/
│   │   ├── bug-report.ts                # EXISTING seed — bundle + fingerprint (reused, unchanged)
│   │   └── session-capture.ts           # NEW — CaptureArtifact model (superset of BugReportBundle)
│   └── tools/
│       ├── reporting-tools.ts           # EXISTING barrel — add registerSessionCapture() wiring
│       └── register-capture.ts          # NEW — agda_capture_session thin adapter (emits, no write)
│
├── scripts/                             # LOOP MACHINERY (out-of-band, .mjs, no 500-line concern)
│   ├── dogfood-run.mjs                  # NEW — orchestrate + record a dogfooding session
│   ├── capture-materialize.mjs          # NEW — artifact → fixture + test + queue entry
│   ├── triage-sync.mjs                  # NEW (optional) — mirror queue → GitHub issues
│   ├── mcp-local-client.mjs             # EXISTING — reused by dogfood-run for stdio drive
│   └── copy-json-assets.mjs             # EXISTING
│
├── triage/                              # IN-REPO FIX QUEUE (SSOT, committed)
│   ├── index.json                       # fingerprint → {status, title, issueUrl?, fixtureName?}
│   └── <fingerprint>/report.md          # human-readable captured defect report
│
├── captures/                            # RAW capture artifacts (gitignored working area)
│   └── <fingerprint>/{bundle.json,repro.agda,transcript.jsonl,meta.json}
│
├── test/
│   ├── fixtures/
│   │   ├── agda/fixture-matrix.json     # EXISTING pattern to mirror
│   │   └── regressions/                 # NEW — captured repro .agda + regression-matrix.json
│   └── regression/                      # NEW — vitest tests locking each fixed defect
│
└── schemas/
    ├── agda-mcp.schema.json             # EXISTING
    └── capture-artifact.schema.json     # NEW — JSON Schema for the on-disk artifact
```

### Structure Rationale

- **`src/` additions are surgical:** one pure model file + one thin tool. Both fit comfortably under 500 lines and follow the existing reporting pattern (`bug-report.ts` + `register-bug-bundles.ts`). No new layer is introduced; the capture tool sits in the existing `tools/` adapter layer and delegates downward, never embedding domain logic.
- **`scripts/` owns orchestration:** the codebase already treats `scripts/*.mjs` as the home for test-orchestration and MCP-driving utilities (`mcp-local-client.mjs`, `test-all-continuing.mjs`). Loop ② orchestration is the same genre of tooling and belongs here, keeping it out of the shipped product and free of the 500-line ceiling.
- **`triage/` is committed, `captures/` is gitignored:** raw artifacts are a scratch working area; the *curated* queue entry (deduped, titled, linked to a fixture) is the durable SSOT and lives in git next to the code it constrains. This mirrors the existing "in-repo JSON SSOT" convention (`fixture-matrix.json`, `mcp-tool-coverage.json`, `manifest.ts`).
- **`test/fixtures/regressions/` mirrors `test/fixtures/agda/`:** reuse the proven matrix-driven fixture pattern rather than inventing a parallel one — a `regression-matrix.json` is the SSOT and the vitest runner iterates it, exactly like the existing fixture tests.

---

## Architectural Patterns

### Pattern 1: In-band capture emits, out-of-band step persists

**What:** The MCP capture tool produces a `CaptureArtifact` envelope in its `ToolResult.data` (just like `agda_bug_report_bundle` today). The dogfood harness (or the agent's host) receives that envelope and writes it to `captures/`. A separate `capture-materialize.mjs` run promotes it into repo artifacts.
**When to use:** Any time live session state must be captured but the capturer must stay side-effect-free and sandbox-safe.
**Trade-offs:** (+) Server stays pure, testable, and honors path-sandboxing; capture works identically whether driven by Codex, Claude Code, or a test. (−) Two steps instead of one — mitigated by `dogfood-run.mjs` auto-persisting on defect.

```typescript
// src/tools/register-capture.ts  (thin adapter — validation + delegate + envelope)
registerStructuredTool({
  server, name: "agda_capture_session", category: "reporting",
  requiresLoadedSession: false,
  inputSchema: { observed: z.string(), expected: z.string(),
                 affectedTool: z.string(), reproduction: z.array(z.string()) },
  handler: async (args) => {
    const artifact = buildCaptureArtifact({          // src/reporting/session-capture.ts
      bug: buildBugReportBundle({ ...args, kind: "new-bug",
                                 serverVersion: getServerVersion() }),
      snapshot: captureSessionSnapshot(session),      // EXISTING session-snapshot.ts
    });
    return okEnvelope({ summary: `capture ${artifact.fingerprint}`, data: artifact });
  },
});
```

### Pattern 2: Fingerprint as the cross-stage join key

**What:** `fingerprintBugReport()` (already stable + content-addressed) is computed once at capture and carried verbatim into the queue entry (`triage/<fingerprint>/`), the fixture name, the matrix row, and the regression test name.
**When to use:** Every stage of the loop — it is the dedup and cross-reference primitive.
**Trade-offs:** (+) Free dedup (re-capturing the same defect collides on directory name); trivially links a green test back to the queue entry it closed. (−) Fingerprint is sensitive to observed/expected text; normalize (already done via `.trim()` in `bug-report.ts`) to avoid spurious near-duplicates.

### Pattern 3: Matrix-driven regression tests (reuse, don't reinvent)

**What:** `regression-matrix.json` lists `{ fingerprint, fixture, expectedClassification, ... }`; a single `test/regression/regression.test.ts` iterates the matrix and loads each fixture through the MCP harness, asserting the fixed behavior.
**When to use:** Locking every captured defect. New captures append a row; no new test file needed per defect (though a hand-authored test may accompany subtle cases).
**Trade-offs:** (+) Matches the existing `fixture-matrix.json` SSOT convention; adding a regression is a data edit + a fixture file. (−) Very idiosyncratic reproductions may need a bespoke test alongside the matrix row.

```typescript
// test/regression/regression.test.ts  (matrix-driven, mirrors existing fixture tests)
for (const row of regressionMatrix) {
  it(`regression ${row.fingerprint}: ${row.fixture}`, async () => {
    const res = await harness.callTool("agda_load", { filePath: row.fixture });
    expect(res.classification).toBe(row.expectedClassification);
  });
}
```

---

## Data Flow

### Capture → Lock-in Flow

```
Agent dogfoods a real proof (fuel: stdlib / own project / ad-hoc)
    │  driven by scripts/dogfood-run.mjs over MCP stdio (single AgdaSession)
    ▼
Defect surfaces (wrong result / crash / missing capability)
    │  agent calls  agda_capture_session
    ▼
Server builds CaptureArtifact  (bug-report bundle + session-snapshot + fingerprint)
    │  returns it in ToolResult.data — writes nothing
    ▼
dogfood-run.mjs persists  captures/<fingerprint>/{bundle,repro,transcript,meta}
    ▼
capture-materialize.mjs
    ├─► triage/<fingerprint>/report.md   +  triage/index.json  (status: open)   ← FIX QUEUE
    ├─► test/fixtures/regressions/<name>.agda                                    ← REPRO FIXTURE
    ├─► test/fixtures/regressions/regression-matrix.json  (append row)           ← MATRIX SSOT
    └─► test/regression/... scaffold (usually just a matrix row)                 ← FAILING TEST
    ▼
Maintainer fixes defect in src/ → regression test goes green → fix LOCKED
    │  triage/index.json[fingerprint].status = closed
    ▼
(optional) triage-sync.mjs mirrors queue → GitHub issue (closed)
    ▼
Loop repeats — server is now strictly stronger
```

### CaptureArtifact data model (superset of existing `BugReportBundle`)

```
CaptureArtifact {
  fingerprint            // = fingerprintBugReport(bug)  — the join key
  bug: BugReportBundle   // EXISTING type, reused verbatim (kind/affectedTool/observed/expected/...)
  sessionSnapshot        // from EXISTING session-snapshot.ts (currentFile, goalIds, phase, classification)
  reproSource {          // enough to rebuild a minimal fixture
    path, contents, entryModule
  }
  transcriptRef          // path to transcript.jsonl (ordered tool calls + envelopes) — captured by harness
  versions { server, agda, node }
  capturedAt
}
```

The existing `BugReportBundle` already carries `affectedTool`, `classification`, `observed`, `expected`, `reproduction`, `diagnostics`, `evidence`, `toolPayload`, `serverVersion`, `agdaVersion`, `environment`, and `existingIssue`. `session-capture.ts` **wraps and extends** it rather than redefining — no duplication of the fingerprint or bundle logic.

### Fix-queue-location decision: in-repo files (SSOT) with GitHub as an optional mirror

| | In-repo `triage/` (recommended SSOT) | GitHub issues |
|---|---|---|
| Reproducibility (v1 goal) | ✓ versioned with the fix, works offline | ✗ external state, network-bound |
| Dedup by fingerprint | ✓ trivial (directory / index key) | ✗ needs API search each time |
| Ties fix ↔ regression ↔ report | ✓ same commit, same key | partial |
| Human visibility / discussion | limited | ✓ strong |
| Fits existing conventions | ✓ mirrors `fixture-matrix.json`, `manifest.ts` SSOTs | ✗ new external dependency |

**Verdict:** the in-repo queue is the source of truth; GitHub issues are a one-way, optional projection via `triage-sync.mjs`. This satisfies the "reproducible scaffold" core value (the loop must work end-to-end with only the repo) and matches how the codebase already treats in-repo JSON as SSOT. It also aligns with the existing bug bundles, which already emit an `existingIssue` field to link back to GitHub — that field becomes the mirror pointer.

---

## Suggested Build Order (component dependencies)

Ordered so each step is independently testable and unblocks the next. Roughly three phases.

**Phase A — Capture foundation (in-band, pure-first)**
1. **Capture data model** — `src/reporting/session-capture.ts`. Pure; wraps `BugReportBundle` + a session-snapshot shape. Unit-testable with no live Agda. *Depends on:* existing `bug-report.ts`, `session-snapshot.ts`. *Unblocks:* everything.
2. **Artifact on-disk schema** — `schemas/capture-artifact.schema.json` + the `captures/<fingerprint>/` directory contract. Pure data contract. *Depends on:* (1).
3. **In-band capture tool** — `agda_capture_session` via `src/tools/register-capture.ts`, wired into `reporting-tools.ts`, manifest entry, and `test/fixtures/e2e/mcp-tool-coverage.json`. *Depends on:* (1),(2).

**Phase B — Lock-in pipeline (out-of-band, defect → green test)**
4. **Regression fixture + matrix format** — `test/fixtures/regressions/` + `regression-matrix.json` + matrix-driven `test/regression/` runner. Establish the contract with one hand-made example first. *Depends on:* existing fixture-matrix pattern only — can start in parallel with Phase A.
5. **Materializer** — `scripts/capture-materialize.mjs`: artifact → queue entry + fixture + matrix row + test scaffold. *Depends on:* (2),(4).
6. **In-repo fix queue** — `triage/index.json` + `triage/<fingerprint>/report.md` conventions and dedup. *Depends on:* (1) fingerprint. Small; can land alongside (5).

**Phase C — Orchestration + optional reach**
7. **Dogfooding orchestrator/recorder** — `scripts/dogfood-run.mjs`: launch server via existing harness, drive an agent against a fuel source, record transcript, auto-persist captures. Ties the whole loop together. *Depends on:* (3) callable tool + (2) artifact format; reuses `mcp-harness.ts` / `mcp-local-client.mjs`.
8. **GitHub issue sync (optional)** — `scripts/triage-sync.mjs`, one-way mirror. *Depends on:* (6).

Critical path to a working v1 loop: **1 → 3 → 5 → 4 → 7**. Steps 6 and 8 are lightweight; 8 is deferrable.

---

## Anti-Patterns

### Anti-Pattern 1: Building the loop harness inside `src/`

**What people do:** Add a `src/loop/` layer with orchestration, file-writing triage, and test-gen logic in the shipped server.
**Why it's wrong:** Bloats the product with self-referential tooling, invites 500-line-ceiling churn, and blurs the "server is the product under test" boundary. Orchestration code has no place in a stdio JSON-RPC server.
**Do this instead:** Keep orchestration/materialization in `scripts/`; the only `src/` addition is the pure capture model + a thin emit-only tool.

### Anti-Pattern 2: Capture tool that writes to the repo

**What people do:** Have `agda_capture_session` write fixtures/queue files directly during the tool call.
**Why it's wrong:** Violates the emit-only precedent set by `agda_bug_report_bundle`, breaks path-sandboxing guarantees, and makes captures non-deterministic and un-testable. The agent's session must stay side-effect-free.
**Do this instead:** Emit a `CaptureArtifact` in `ToolResult.data`; persist and materialize out-of-band.

### Anti-Pattern 3: The harness constructs its own `AgdaSession`

**What people do:** `dogfood-run.mjs` or a regression test does `new AgdaSession(...)` to "just run Agda" instead of driving the built server over stdio.
**Why it's wrong:** Directly reintroduces the issue #39 regression — a second session diverges from the server's in-memory state and the recorded transcript no longer reflects the real product path.
**Do this instead:** Drive the server over MCP stdio via the existing `mcp-harness.ts` / `mcp-local-client.mjs`. The disposable-typecheck helper in `test/helpers/` is the only sanctioned out-of-graph exception and must not leak into the loop.

### Anti-Pattern 4: A curated benchmark suite masquerading as the fuel

**What people do:** Seed `test/fixtures/regressions/` up front with synthetic "hard proofs" to exercise the loop.
**Why it's wrong:** PROJECT.md explicitly rejects "testing for the sake of testing"; the matrix must grow only from *real* captured defects, or it accumulates low-signal fixtures.
**Do this instead:** Every regression fixture originates from an actual capture artifact with a fingerprint traceable to a `triage/` entry.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `session-capture.ts` ↔ `bug-report.ts` | direct import, wraps `BugReportBundle` + `fingerprintBugReport` | Reuse, do not redefine the bundle or fingerprint |
| `register-capture.ts` ↔ `session-snapshot.ts` | direct call for live session state | Snapshot is read-only; tool stays thin |
| `agda_capture_session` ↔ `manifest.ts` | `registerManifestEntry` in the registration wrapper | Required so tools-catalog / recommendation stay accurate |
| capture tool ↔ `mcp-tool-coverage.json` | add e2e coverage row | New tool must be covered like all others |
| `dogfood-run.mjs` ↔ server | **MCP stdio only** (via `mcp-harness` / `mcp-local-client`) | Never a second `AgdaSession` (issue #39) |
| materializer ↔ `regression-matrix.json` | append-row, matches `fixture-matrix.json` shape | Matrix is the SSOT the vitest runner iterates |
| `triage/index.json` ↔ regression tests | linked by `fingerprint` | Green test → flip queue status to closed |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub issues (optional) | one-way mirror via `gh` CLI in `triage-sync.mjs` | Projection, not SSOT; reuse `existingIssue` field on the bundle as the link pointer |
| `agda` CLI | unchanged — reached only through the server's existing subprocess | The loop never spawns Agda itself |
| Dogfooding agents (Codex, Claude Code) | stdio MCP client driving the built server | `dogfood-run.mjs` configures/records; ergonomics of the one-call `agda_capture_session` matter here |

---

## Sources

- `src/reporting/bug-report.ts` — existing `BugReportBundle` + `fingerprintBugReport` (capture data-model + dedup seed) [HIGH]
- `src/tools/register-bug-bundles.ts`, `src/tools/reporting-tools.ts` — existing emit-only bundle-tool precedent [HIGH]
- `test/fixtures/agda/fixture-matrix.json`, `test/fixtures/e2e/mcp-tool-coverage.json` — matrix-driven SSOT regression pattern to mirror [HIGH]
- `test/helpers/mcp-harness.ts`, `scripts/mcp-local-client.mjs` — existing stdio drivers reused by the orchestrator [HIGH]
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md` — layering, 500-line ceiling, single-`AgdaSession` (issue #39) invariants [HIGH]
- `.planning/PROJECT.md` — Loop ② scope, organic-fuel decision, in-repo SSOT preference [HIGH]

---
*Architecture research for: Loop ② self-improvement/dogfooding scaffold*
*Researched: 2026-07-01*
