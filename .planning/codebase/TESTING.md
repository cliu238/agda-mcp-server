# Testing Patterns

**Analysis Date:** 2026-07-04

## Test Framework

**Runner:**
- Vitest ^4.1.2, config: `vitest.config.ts`. `include` globs: `test/examples/**/*.test.ts`, `test/unit/**/*.test.ts`, `test/property/**/*.test.ts`, `test/integration/**/*.test.ts`. `testTimeout: 30_000`. `passWithNoTests: true` is set deliberately — the capture-regression matrix runner (`test/integration/mcp/capture-regression.test.ts`) registers zero `test()` calls when its data-driven matrix is empty, and vitest 4 otherwise treats a zero-collected-tasks file as an error.
- Global test types are enabled via `tsconfig.test.json` (`"types": ["node", "vitest/globals"]`), but test files still explicitly `import { test, expect } from "vitest";` rather than relying on globals.

**Property-based testing:**
- `@fast-check/vitest` ^0.3.0. Convention: import only `{ fc }` from it and drive assertions with plain vitest `test()` + `await fc.assert(fc.property(...))`. The `fc.test` wrapper form is never used (0 occurrences across `test/property/`) — do not introduce it in new property tests.

**Assertion Library:** Vitest's built-in `expect` (Chai-compatible). Boolean expressions/comparisons are frequently normalized to `.toBeTruthy()` rather than composed matchers, e.g. `expect(r.goals.length >= 1).toBeTruthy();` (`test/integration/agda/agda-load.test.ts`).

**Current test-file scale** (file counts, not individual `test()`/`it()` cases): 232 total `*.test.ts` files — 170 under `test/unit/`, 43 under `test/property/`, 18 under `test/integration/` (11 in `test/integration/agda/`, 6 in `test/integration/mcp/`, plus `backend-commands.test.ts`), 1 under `test/examples/`.

**Run Commands:**
```bash
npm test                           # vitest run — examples/unit/property/integration globs; Agda-gated tests self-skip
npm run typecheck:test             # tsc -p tsconfig.test.json --noEmit — see "Type-Checking Gate" below
npm run test:examples              # vitest run test/examples/
npm run test:property              # vitest run test/property/
npm run test:integration:raw       # vitest run test/integration/ (no auto-continue wrapper)
npm run test:integration:fixtures  # vitest run test/integration/agda/agda-fixture-matrix.test.ts
npm run test:integration:mcp       # vitest run test/integration/mcp/mcp-server.test.ts
npm run test:all                   # node scripts/test-all-continuing.mjs — build, then examples/unit/property/integration tiers IN SEQUENCE, continuing past a failing tier, writing quiet+verbose logs to test-output/
npm run test:e2e                   # npm run build && vitest run test/integration/mcp/
npm run test:release:bugs          # curated cross-cutting release-bug regression set (named files, see package.json)
npm run test:release:bugs:sentinel # same set, wrapped by scripts/test-with-sentinel.mjs (see below)
npm run test:release:full          # node scripts/test-release-full.mjs — live Agda + GHC/JS backend, continues past failures, writes test-output/release-full.{quiet,verbose}.log
npm run verify                     # npm test && npm pack --dry-run — the pre-publish gate
```
`pretest` runs `npm run build` automatically before `npm test`. This matters specifically because `test/helpers/mcp-harness.ts` always spawns the **compiled** `dist/index.js` (never `tsx`-executed source) — every MCP-harness-driven integration/e2e test exercises what actually ships, not just what typechecks.

`scripts/test-with-sentinel.mjs` wraps a single `npx vitest run <args>` invocation and prints one unambiguous final line — `PASSED: <label>` or `FAILED: <label> (exit code N)` — treating a signal-terminated child (e.g. a timeout kill) as a failure too. Use it (or `--label`) whenever a wrapped/timed invocation needs one greppable final status line instead of parsing vitest's own multi-line summary.

## Type-Checking Gate (`typecheck:test`)

`npm run typecheck:test` runs `tsc -p tsconfig.test.json --noEmit`. `tsconfig.test.json` extends the root `tsconfig.json`, overrides `rootDir` to `.` and `types` to `["node", "vitest/globals"]`, and includes **both** `src/**/*.ts` and `test/**/*.ts`.

**Why this exists as a separate gate:** Vitest transforms `.ts` test files with esbuild, which strips types without checking them — a type error confined to a test file (a wrong mock shape, a stale import after a signature change) can pass `npm test` silently. `typecheck:test` is the only step that full-type-checks the test tree against current `src/` types. It runs as its own CI step (`.github/workflows/ci.yml`, job `verify`, step "Typecheck tests") **before** "Verify package" (`npm run verify`) and before the separate `integration` job that needs live Agda — a test-file type regression fails fast, before any Agda-backed job even starts.

When changing a `src/` type that test files depend on (an exported interface, a function signature), run `npm run typecheck:test` locally before relying on `npm test` alone — a green `vitest run` does not guarantee the test tree still typechecks.

## Test File Organization

**Location:** Fully separated from source — all tests live under `test/`, mirroring the `src/` directory shape by subsystem, not by co-location with source files.

**Top-level test directories:**
- `test/unit/` (170 files) — pure unit tests, organized by subsystem: `agda/` (incl. `agda/session-capture/` for the capture-session domain), `protocol/`, `session/`, `tools/`, `reporting/`, `helpers/`, `fixtures/` (meta-tests validating the fixture/matrix JSON itself, e.g. `test/unit/fixtures/fix-queue.test.ts`)
- `test/property/` (43 files) — fast-check property-based tests, mirroring `test/unit/`'s subsystem folders (`agda/`, `helpers/`, `protocol/`, `reporting/`, `session/`, `tools/`)
- `test/integration/` (18 files) — tests requiring a real Agda binary and/or the built server, split into `agda/` (direct `AgdaSession` integration, e.g. `agda-load.test.ts`, `backend-commands.test.ts`) and `mcp/` (built-server MCP end-to-end, e.g. `mcp-server.test.ts`, `capture-regression.test.ts`, `dogfood-proxy-passthrough.test.ts`)
- `test/examples/` (1 file) — covers the extension examples catalog (`examples/extensions/`)
- `test/fixtures/` — Agda source fixtures (`.agda`, `.lagda*` literate variants) plus JSON+TS "matrix" SSOT files (see "Fixtures and Factories" below)
- `test/helpers/` — shared non-test utilities: `mcp-harness.ts`, `isolated-agda-dir.ts`, `agda-version.ts`, `typecheck-disposable.ts`, `repo-root.ts`, `json-data.ts`, `library-registration-fixture.ts`, `capture-regression-runner.ts`

**Naming:**
- Unit test: `<module-name>.test.ts` matching the source module it targets, e.g. `test/unit/agda/goal-analysis.test.ts` ↔ `src/agda/goal-analysis.ts`. Tests for `scripts/*.mjs` files also live under `test/unit/tools/` even though the module under test isn't in `src/tools/` — named for the script, e.g. `test/unit/tools/team-archive-extract.test.ts` ↔ `scripts/team/archive-extract.mjs`, `test/unit/tools/dogfood-run-spawn-options.test.ts` ↔ `scripts/dogfood/dogfood-run.mjs`.
- Property test: `<module-name>.property.test.ts`, e.g. `test/property/agda/goal-analysis.property.test.ts`.
- Integration test: descriptive of the scenario, not 1:1 with a single source file, e.g. `test/integration/agda/agda-load.test.ts`, `test/integration/mcp/mcp-remaining-tools-e2e.test.ts`.

## Test Structure

**Suite organization — two coexisting styles:**
1. **Flat `test(...)` calls grouped by a comment banner** — still the dominant style, especially for pure-function unit/property tests in `src/agda`, `src/protocol`:
```typescript
import { test, expect } from "vitest";
import { parseContextEntry, deriveSuggestions } from "../../../src/agda/goal-analysis.js";

// ── parseContextEntry ────────────────────────────────────

test("parseContextEntry: simple binding", () => {
  const entry = parseContextEntry("x : Nat");
  expect(entry.name).toBe("x");
  expect(entry.type).toBe("Nat");
});
```
(`test/unit/agda/goal-analysis.test.ts`)

2. **`describe()`-nested grouping** — a real, growing minority (25 of 232 test files: 12 in `test/unit/session/`, 7 in `test/unit/tools/`, 3 each in `test/unit/protocol/` and `test/unit/agda/`), used when a single schema/module needs many related cases grouped under one name, e.g. `describe("getToolSchemaEntry", ...)` / `describe("manifest consistency", ...)` in `test/unit/tools/manifest-schema.test.ts`. Either style is acceptable for a new test file; prefer flat `test()` + banner comments unless the file naturally has 2+ independent groupings that benefit from a shared `describe` label.

**Test naming convention:** `"<functionName>: <scenario under test>"` — the function name always leads, colon-separated from a short scenario description. Regression tests additionally append a parenthesized finding/lock ID — see "From-RED Regression Convention" below.

**Conditional/gated tests:** see "RUN_AGDA_INTEGRATION Gating" below.

**Setup/teardown:** No global `beforeEach`/`afterEach` hooks in the simple pure-function suites; resource lifecycle (spawning/destroying an `AgdaSession`, temp directories) is wrapped per-test in a local async helper using `try { ... } finally { ... }`:
```typescript
async function loadFixture(name: string) {
  const session = new AgdaSession(FIXTURES);
  try {
    return await session.load(name);
  } finally {
    await session.destroy();
  }
}
```
(`test/integration/agda/agda-load.test.ts`). Files that manage several disposable temp directories per test (the `team-*`/`dogfood-*` suites) do use `afterEach` — a module-scoped `tempDirs: string[]` array is pushed to per test and swept in one `afterEach(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); tempDirs = []; })` (`test/unit/tools/team-archive-extract.test.ts`).

## From-RED Regression Convention

Every regression test in this codebase should be traceable to something that was once observably broken. Two distinct mechanisms exist — use the matrix pipeline only for oracle-confirmed load-family false-greens; use the tagged-test convention for everything else.

**1. The capture-regression matrix pipeline (load-family false-green defects only):**
- SSOT: `test/fixtures/capture-regression-matrix.json` (data) + `.ts` (zod-validated typed loader, `captureRegressionEntrySchema`). Each entry has `id`, `issue[]`, **`status: "red" | "locked"`**, `tool`, `fixtureDir`, `entryFile`, an optional `mutation` (a `targetFile`/`sourceFile` pair simulating a dependency edit), optional `serverEnv`, and `expected` (a normalized classification/success/goalCount/errorCategories tuple — ORCL-01's cold-run shape, never raw wire text/timing).
- ONE generic runner, `test/integration/mcp/capture-regression.test.ts`, iterates the matrix and calls the shared `replayCaptureRegressionEntry()` helper (`test/helpers/capture-regression-runner.ts`) — the exact same function `scripts/emit-regression.mjs` uses for its own emit-time self-check, so the emitter and the CI runner can never silently diverge on what "matches" means.
- **Both `"red"` and `"locked"` entries run as a plain `test()` — never `test.fails()`.** This was a deliberate correction (commit `0cbdfbe`, "WR-02 assert RED structurally instead of test.fails masking"): a `"red"` entry asserts the observed result does **NOT** match `expected` (the defect is still live); a `"locked"` entry asserts it **DOES** match. A harness/infrastructure throw (missing fixture, Agda spawn failure) always surfaces as a genuine test failure in both directions — it is never absorbed as "expected to fail" the way `test.fails()` would silently do. When a fix lands, a `"red"` entry's assertion flips failing, which forces the one-line `status: "red"` → `"locked"` promotion rather than letting a fix go unnoticed.
- New entries are produced by `scripts/emit-regression.mjs <artifact.json>`, never hand-authored with a fabricated bug (D-09: "no hand-built synthetic bundles"). The emitter runs a fresh oracle verdict, refuses (`emit-regression refused: ...`, exit 1) if the oracle can't confirm a genuine false-green or if policy is unresolved, materializes fixture files, composes the matrix entry, and **self-checks RED** via the same `replayCaptureRegressionEntry`/`matchesExpected` pair before ever writing the matrix — if the observed result already matches `expected`, it refuses with "cannot demonstrate RED — nothing to lock" rather than writing a vacuous entry. `--dry-run` prints the composed entry and rolls back without touching the matrix file.

**2. Ad hoc "from-RED" tagged unit tests (everything else — any fixed bug or code-review finding):**
- A plain `test()` whose title ends in a parenthesized `(<FINDING-ID>, from-RED)` tag, e.g. `test("extractArchiveSafely: a listing with more entries than maxEntryCount is rejected BEFORE extraction is ever attempted (WR-05, from-RED)", ...)` (`test/unit/tools/team-archive-extract.test.ts`). The finding ID is a review-warning (`WR-NN`), critical-finding (`CR-NN`), or similar tracked ID from the phase that fixed it.
- The test asserts the **current, correct, post-fix behavior** — there is no special runner or `status` field involved. The `(from-RED)` tag is a pure documentation/traceability convention: it tells a future reader "this exact case used to fail before a specific fix; this test is the permanent lock proving it stays fixed," pointing them at the originating finding ID rather than requiring a git-blame archaeology session.
- Currently used in `test/unit/tools/{team-archive-extract, team-cron-ingest-wrapup, dogfood-run-report-checkpoint, dogfood-run-spawn-options, dogfood-agent-log-selection, dogfood-upload-run}.test.ts` (23 occurrences across 6 files). Apply this tag to any new regression test for a numbered finding; skip it for a test that isn't tied to a specific tracked defect/finding ID.

## Dependency-Injection Seam (`scripts/`)

`scripts/*.mjs` files that shell out to a real subprocess, hit the filesystem, or make a network call accept an **`options.deps`** bag — literally named `deps` — overriding each real primitive with a same-named optional field, always falling back to the real implementation via `??`:

```javascript
// scripts/team/archive-extract.mjs
export async function extractArchiveSafely(archivePath, options = {}) {
  const deps = options.deps ?? {};
  const execFile = deps.execFileSync ?? execFileSync;
  const mkdtemp = deps.mkdtempSync ?? mkdtempSync;
  // ...
}
```

This is documented in-repo as this codebase's own convention (`scripts/oracle/run-oracle.mjs`'s JSDoc calls it a "Dependency-injection seam"). Current adopters: `scripts/oracle/run-oracle.mjs`, `scripts/oracle/orcl-02-soundness-scan.mjs`, `scripts/queue/mirror-github.mjs`, `scripts/team/archive-extract.mjs`, `scripts/team/cron-ingest-wrapup.mjs`, `scripts/dogfood/flake-classify.mjs`, `scripts/dogfood/upload-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`.

**Why:** it lets a test inject a `vi.fn()` fake for a real subprocess/filesystem/network primitive (`execFileSync`, `spawn`, `fetch`, `readdirSync`, `statSync`, `mkdtempSync`, `rmSync`) at **zero real cost** for defense-in-depth or hard-to-trigger edge-case paths, while the primary/happy-path test still exercises the real thing. `test/unit/tools/team-archive-extract.test.ts` is the clearest example: its mandatory path-traversal-rejection test builds a **real** crafted `../`-entry tar via the system `tar` binary (no mocking of the listing step at all), while its bounded-extraction-kill-switch and entry-count-ceiling tests inject `deps.spawn`/`deps.execFileSync` fakes to avoid actually writing gigabytes or 10,000 files to disk.

**When to reach for `vi.mock()` instead:** only when the function being replaced has no DI seam and isn't cheaply exercisable for real — e.g. `test/unit/tools/dogfood-wrapup-corrupt-capture-entry.test.ts` and `test/unit/agda/spawn-error-listener.test.ts` both `vi.mock("node:child_process", async (importOriginal) => ({ ...await importOriginal(), spawn: () => { /* fake */ } }))` to stop a script's own unconditional subprocess-spawning tail step from ever launching a real process. Always use `importOriginal()` and override only the specific export you need — preserve every other export's real behavior. The same partial-override idiom is used for a `src/` module in `test/unit/tools/register-capture-session.test.ts` (`vi.mock("../../../src/session/safe-source-io.js", ...)`, overriding only `writeFileAtomic` with `vi.fn(actual.writeFileAtomic)` — calls through to the real implementation by default, only overridden per-test with `mockImplementationOnce` for the one concurrency regression that needs it).

**What NOT to mock, regardless of mechanism:** never mock the Agda subprocess/transport wholesale. Exercise a real `AgdaSession`/built MCP server behind the `RUN_AGDA_INTEGRATION=1` gate, or test pure decoding/domain functions directly with literal input. `vi.fn`/`vi.spyOn`/`vi.mock` usage is concentrated in `test/unit/tools/` (16 files, almost entirely `scripts/` DI-seam injection) plus one `src/agda/` file (`spawn-error-listener.test.ts`, a narrow child-process spawn-error-listener case) — not in the Agda session/transport core.

## Fixtures and Factories

**Agda source fixtures:** Real, minimal `.agda` files under `test/fixtures/agda/`, one concern per file, named for the behavior under test (`WithHoles.agda`, `MultipleHoles.agda`, `TypeError.agda`, `NestedWhereHole.agda`). Literate-mode variants use `.lagda`, `.lagda.md`, `.lagda.org`, `.lagda.rst`, `.lagda.tex`, `.lagda.typ`, `.lagda.tree` extensions to cover each literate format. `test/fixtures/agda/FixtureDeps/` holds multi-file dependency-chain fixtures (e.g. transitive-staleness scenarios).

**"Expected output" fixture pairs:** For write/edit operations, a `Foo.agda` input fixture is paired with a `Foo.expected.agda` fixture representing post-edit state (e.g. `WriteGiveSimple.agda` / `WriteGiveSimple.expected.agda`, `WriteCaseSplit.agda` / `WriteCaseSplit.expected.agda`).

**Fixture matrices (SSOT pattern):** a checked-in JSON array is the SSOT; a sibling `.ts` module validates it once via `zod` + `loadValidatedJsonData(moduleDir, relativePath, schema)` (`test/helpers/json-data.ts`) and exports a typed constant — consumers import the typed constant, never the raw JSON. Current matrices:
- `test/fixtures/agda/fixture-matrix.json`/`.ts` — general fixture matrix (`AGENTS.md`: "the preferred place to add new Agda cases before adding ad hoc fixture lists in tests")
- `test/fixtures/agda/expression-query-matrix.json`/`.ts`, `navigation-query-matrix.json`/`.ts`, `library-registration-matrix.json`/`.ts`
- `test/fixtures/capture-regression-matrix.json`/`.ts` — the from-RED replay pipeline's matrix (see above)
- `test/fixtures/release-bug-matrix.json`/`.ts` — a lighter-weight, frozen evidence-pointer matrix for the historical 0.6.2 release bug set (issues 3/4/5/7/8); its test (`test/unit/reporting/release-bug-matrix.test.ts`) only asserts uniqueness/consistency and that every referenced evidence/suite path exists — it does not replay anything live, unlike the capture-regression matrix.
- `test/fixtures/e2e/mcp-tool-coverage.json`/`.ts` — SSOT mapping each exposed core MCP tool to the e2e scenario that covers it
- `test/fixtures/fix-queue.json`/`.ts`, `test/fixtures/fuel-corpora.ts`, `test/fixtures/task-manifest-schema.ts` — process/queue-tracking schemas exercised by their own `test/unit/fixtures/*.test.ts` meta-tests

**Fake subprocess fixtures:** `test/fixtures/dogfood-fake-mcp-child.mjs` is a full stand-in MCP child process (not data) — tests that need to drive `scripts/dogfood/dogfood-run.mjs` end-to-end swap it in via the test-only `AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY` env override, so process-lifecycle/signal-handling tests (`test/unit/tools/dogfood-run-report-checkpoint.test.ts`) need neither a real Agda binary nor `npm run build`.

**Isolated environments:** `test/helpers/isolated-agda-dir.ts`'s `withIsolatedAgdaDir(run)` gives a test a scratch `AGDA_DIR` (with empty `libraries`/`defaults` files) and restores the prior env value in `finally`. `test/helpers/typecheck-disposable.ts` and `test/helpers/library-registration-fixture.ts` provide similar disposable-resource helpers for typecheck and library-registration scenarios. The `team-*`/`dogfood-*` unit-test suites use a local `makeTempDir(prefix)` + module-scoped `tempDirs` array pattern (see "Test Structure" above) for the same purpose at the script-test layer.

**Location:** All fixtures/factories live under `test/fixtures/`; shared, reusable test infrastructure (not fixture data) lives under `test/helpers/`.

## MCP Test Harness

`test/helpers/mcp-harness.ts` wraps the official `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` to spawn the **built** server (`dist/index.js`) as a subprocess and drive it like a real MCP client:
```typescript
export async function createMcpHarness({ serverRepoRoot, repoRoot, projectRoot, extraEnv, clientInfo }: HarnessOptions = {}) {
  const client = new Client(clientInfo);
  const transport = new StdioClientTransport(buildHarnessServerParameters({ ... }));
  await client.connect(transport);
  return { client, transport, listTools, callTool, getServerVersion, getServerCapabilities, getStderr, close };
}
```
`projectRoot` defaults to `repoRoot` defaults to `serverRepoRoot` and becomes the spawned server's `AGDA_MCP_ROOT`; `extraEnv` is merged over `process.env` before that. Used by `test/integration/mcp/mcp-server.test.ts`, `capture-regression.test.ts`, and related e2e tests. Also drivable manually via `npm run mcp:local -- <subcommand>` (`scripts/mcp-local-client.mjs`) for interactive debugging — see `AGENTS.md`, "MCP harness."

## RUN_AGDA_INTEGRATION Gating

Every integration test file re-declares the same inline gate at module scope (there is no shared `it`/`itSince` export — only the underlying version helpers are shared):
```typescript
import { detectAgdaVersion, parseAgdaVersion, versionAtLeast } from "../../helpers/agda-version.js";

const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;

const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

function itSince(minVersion: string) {
  if (!agdaVersion) return test.skip;
  return versionAtLeast(agdaVersion, parseAgdaVersion(minVersion)) ? it : test.skip;
}
```
(`test/integration/agda/agda-load.test.ts`) — copy this exact shape into any new integration test file; do not gate on `agdaAvailable` alone (a live-Agda test must also require the explicit opt-in env var) and do not gate on the env var alone (an unavailable Agda binary must still degrade to `test.skip`, not a spawn error).

- **`RUN_AGDA_INTEGRATION=1`** is the primary gate — required by every file under `test/integration/`. Without it, `npm test` runs everything else and integration tests self-skip; the default suite is intentionally Agda-free (`CONTRIBUTING.md`, "Integration tests"; `AGENTS.md`: "Integration tests are intentionally gated by `RUN_AGDA_INTEGRATION=1`").
- **`RUN_AGDA_BACKEND_INTEGRATION=1`** additionally gates GHC/JS backend-compile-specific coverage, layered on top of `RUN_AGDA_INTEGRATION=1` — currently used in `test/integration/mcp/mcp-end-to-end-parity.test.ts` and `test/integration/agda/backend-commands.test.ts`.
- **`itSince(minVersion)`** is the standard pattern for any behavior that only exists/differs from a specific Agda version onward (e.g. `itSince("2.8.0")("WithHoles.agda: agda_load succeeds but agda_load_no_metas fails", ...)`).
- **Platform gating:** POSIX-only tests (real process-group signal delivery) use a local `const testPosix = process.platform === "win32" ? test.skip : test;` (`test/unit/tools/dogfood-run-report-checkpoint.test.ts`, mirroring `test/unit/agda/process-termination.test.ts`) — this is orthogonal to the Agda gate and does not require `RUN_AGDA_INTEGRATION`.
- **CI wiring** (`.github/workflows/ci.yml`): a separate `integration` job (depends on `verify` passing) installs a pinned Agda (`agda-version: "2.7.0.1"`, `agda-stdlib-version: "2.1.1"` via `wenkokke/setup-agda`) and runs `npm run test:all` with `RUN_AGDA_INTEGRATION: "1"` in its env — `RUN_AGDA_BACKEND_INTEGRATION` is not set in CI, so backend-compile tests self-skip there even on the integration job.

## Coverage

**Requirements:** No coverage threshold/config found (no `coverage` block in `vitest.config.ts`, no coverage script in `package.json`). Coverage is not formally enforced; correctness relies on the breadth of unit + property + integration + regression-matrix tests instead.

## Test Types

**Unit Tests (`test/unit/`):** Target pure functions and small modules directly with literal inputs/expected outputs — parsers, decoders, classifiers, tool schema/manifest validators, and (per "Dependency-Injection Seam" above) `scripts/*.mjs` orchestration logic exercised via injected fakes. No live Agda process, no real network calls.

**Property Tests (`test/property/`):** Use `fc.assert(fc.property(...))` to state invariants generatively over arbitrary inputs (`fc.string()`, `fc.record({...})`, `fc.array(...)`) rather than enumerated examples. Per `AGENTS.md`: "All new features and bug fixes must follow property-based TDD" and "Add property-based tests for invariants whenever the behavior can be stated generatively." Mirrors `test/unit/`'s subsystem folder structure.

**Integration Tests (`test/integration/agda/`, `test/integration/mcp/`):** Exercise a real `AgdaSession` or the built MCP server end-to-end against real `.agda` fixtures. Gated as described above. Also includes real-OS-subprocess process-lifecycle tests for the dogfood proxy (`dogfood-proxy-passthrough.test.ts`).

**Source-text invariant tests:** a project-specific substitute for the ESLint config this repo doesn't have — a test reads raw source text (not imported behavior) and asserts a structural invariant via string/regex scanning over comment-stripped source. Examples: `test/unit/protocol/no-bare-command-strings.test.ts` (fails if any file outside `src/protocol/command-builder.ts` hand-assembles an IOTCM wire string or ships a bare `Cmd_*` literal to a send function), `test/unit/tools/no-dead-tool-references.test.ts`, `test/unit/tools/output-schema-invariants.test.ts`. Reach for this pattern — not a linter dependency — when a new invariant is about source-code shape rather than runtime behavior.

**E2E Tests:** `test/integration/mcp/` run against the compiled `dist/index.js` server (via `npm run test:e2e`, which runs `npm run build` first) rather than `tsx`-executed source, to validate what actually ships.

**Release-bug regression suite:** `npm run test:release:bugs` runs a curated, cross-cutting set of unit + integration test files (completeness, protocol parity, release bug matrix, library registration matrix, load/fixture-matrix/search-about/library-registration integration, and the full MCP server e2e test) as a single gate before release. `npm run test:release:bugs:sentinel` runs the same set through `scripts/test-with-sentinel.mjs` for a single hang/pass/fail status line.

## Common Patterns

**Async testing:**
```typescript
test("deriveSuggestions: always includes auto for any input", async () => {
  await fc.assert(
    fc.property(fc.string(), (goalType) => {
      const suggestions = deriveSuggestions(goalType, []);
      expect(suggestions.some((s) => s.action === "auto")).toBeTruthy();
    }),
  );
});
```
(`test/property/agda/goal-analysis.property.test.ts`) — property assertions are awaited even though the property function body itself is synchronous, since `fc.assert` returns a promise in the async-check path used here.

**Resource cleanup with try/finally:**
```typescript
async function loadFixture(name: string) {
  const session = new AgdaSession(FIXTURES);
  try {
    return await session.load(name);
  } finally {
    await session.destroy();
  }
}
```
(`test/integration/agda/agda-load.test.ts`)

**Version-gated assertions:**
```typescript
itSince("2.8.0")("WithHoles.agda: agda_load succeeds but agda_load_no_metas fails", async () => {
  const load = await loadFixture("WithHoles.agda");
  const strict = await loadFixtureNoMetas("WithHoles.agda");
  expect(load.success).toBe(true);
  expect(strict.success).toBe(false);
});
```
(`test/integration/agda/agda-load.test.ts`)

**DI-seam injection in a script test:**
```typescript
const execFileSpy = vi.fn((cmd, args) => {
  if (Array.isArray(args) && args[0] === "-tf") return "/etc/passwd\n";
  return (execFileSync as any)(cmd, args);
});
const result = await extractArchiveSafely(archivePath, { deps: { execFileSync: execFileSpy } });
expect(result.ok).toBe(false);
expect(result.reason).toBe("unsafe-entry-path");
```
(`test/unit/tools/team-archive-extract.test.ts`)

---

*Testing analysis: 2026-07-04*
