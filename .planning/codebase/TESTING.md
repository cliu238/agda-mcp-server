# Testing Patterns

**Analysis Date:** 2026-07-01

## Test Framework

**Runner:**
- Vitest ^4.1.2, config: `vitest.config.ts`
- Global test types enabled via `tsconfig.test.json` (`"types": ["node", "vitest/globals"]`), but test files still explicitly `import { test, expect } from "vitest";` rather than relying on globals

**Property-based testing:**
- `@fast-check/vitest` ^0.3.0 (imported as `import { fc } from "@fast-check/vitest";`), used alongside plain `test`/`expect` from vitest rather than the `fc.test` wrapper — see `test/property/agda/goal-analysis.property.test.ts`

**Assertion Library:** Vitest's built-in `expect` (Chai-compatible). Boolean expressions/comparisons are frequently normalized to `.toBeTruthy()` rather than composed matchers, e.g. `expect(r.goals.length >= 1).toBeTruthy();` (`test/integration/agda/agda-load.test.ts`).

**Run Commands:**
```bash
npm test                          # vitest run (fast suite: examples/unit/property/integration globs, but Agda-gated tests self-skip)
npm run test:examples              # vitest run test/examples/
npm run test:property              # vitest run test/property/
npm run test:integration:raw       # vitest run test/integration/ (no auto-continue wrapper)
npm run test:integration:fixtures  # vitest run test/integration/agda/agda-fixture-matrix.test.ts
npm run test:integration:mcp       # vitest run test/integration/mcp/mcp-server.test.ts
npm run test:e2e                   # npm run build && vitest run test/integration/mcp/
npm run test:release:bugs          # curated cross-cutting release-bug regression set (see package.json)
npm run test:release:full          # node scripts/test-release-full.mjs — live Agda + backend, continues past failures, writes logs to test-output/
```
`pretest` runs `npm run build` automatically before `npm test`, so unit/property/integration tests exercise compiled behavior assumptions consistent with the published package.

## Test File Organization

**Location:** Fully separated from source — all tests live under `test/`, mirroring the `src/` directory shape by subsystem, not by co-location with source files.

**Top-level test directories:**
- `test/unit/` — pure unit tests, organized by subsystem: `agda/`, `protocol/`, `session/`, `tools/`, `reporting/`, `helpers/`
- `test/property/` — fast-check property-based tests, mirroring `test/unit/`'s subsystem folders (`agda/`, `protocol/`, `session/`, `tools/`, `reporting/`, `helpers/`)
- `test/integration/` — tests requiring a real Agda binary or full server build, split into `agda/` (direct `AgdaSession` integration) and `mcp/` (built-server MCP end-to-end)
- `test/examples/` — tests covering the extension examples catalog (`examples/extensions/`)
- `test/fixtures/` — Agda source fixtures (`.agda`, `.lagda*` literate variants) plus JSON+TS "matrix" files that are the SSOT for fixture-driven test expansion (`fixture-matrix.json`/`.ts`, `expression-query-matrix.json`/`.ts`, `navigation-query-matrix.json`/`.ts`, `library-registration-matrix.json`/`.ts`, `release-bug-matrix.json`/`.ts`)
- `test/helpers/` — shared non-test utilities: `mcp-harness.ts`, `isolated-agda-dir.ts`, `agda-version.ts`, `typecheck-disposable.ts`, `repo-root.ts`, `json-data.ts`, `library-registration-fixture.ts`

**Naming:**
- Unit test: `<module-name>.test.ts` matching the source module it targets, e.g. `test/unit/agda/goal-analysis.test.ts` ↔ `src/agda/goal-analysis.ts`
- Property test: `<module-name>.property.test.ts`, e.g. `test/property/agda/goal-analysis.property.test.ts`
- Integration test: descriptive of the scenario, not 1:1 with a single source file, e.g. `test/integration/agda/agda-load.test.ts`, `test/integration/mcp/mcp-remaining-tools-e2e.test.ts`

## Test Structure

**Suite organization** — flat `test(...)` calls grouped visually with a comment banner, no `describe()` nesting observed:
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

**Test naming convention:** `"<functionName>: <scenario under test>"` — the function name always leads, colon-separated from a short scenario description.

**Conditional/gated tests:** Integration tests that require a live Agda binary alias `test`/`test.skip` into a local `it` (and `itSince(minVersion)` for version-gated cases) at module scope, based on binary availability and an env var gate:
```typescript
const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;

const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

function itSince(minVersion: string) {
  if (!agdaVersion) return test.skip;
  return versionAtLeast(agdaVersion, parseAgdaVersion(minVersion)) ? it : test.skip;
}
```
(`test/integration/agda/agda-load.test.ts`) — this is the standard pattern for any new Agda-version-sensitive integration test.

**Setup/teardown:** No global `beforeEach`/`afterEach` hooks seen in the sampled files; instead, resource lifecycle (spawning/destroying an `AgdaSession`) is wrapped per-test in a local async helper using `try { ... } finally { await session.destroy(); }`:
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

## Mocking

**Framework:** Vitest's `vi` (`vi.fn`, `vi.spyOn`) — usage is minimal and targeted; grep across `test/` finds it concentrated in `test/unit/agda/spawn-error-listener.test.ts`. The dominant strategy is **not** mocking the Agda process — tests either operate on pure functions with plain data, or spin up real `AgdaSession`/MCP server instances gated behind `RUN_AGDA_INTEGRATION=1`.

**What to Mock:**
- Narrow, hard-to-trigger low-level events (e.g. child-process spawn error listeners) — use `vi.spyOn`/`vi.fn` only at this boundary.

**What NOT to Mock:**
- Do not mock the Agda subprocess/transport wholesale. Prefer exercising real `AgdaSession` behavior against `.agda` fixtures under `RUN_AGDA_INTEGRATION=1`, or testing pure decoding/domain functions directly with literal input strings/objects (no mocks needed at all for most of `test/unit/` and `test/property/`).
- The default (`npm test`) suite must not require a live Agda installation (per `CONTRIBUTING.md`, "Integration tests"); anything needing live Agda must self-skip via the `RUN_AGDA_INTEGRATION=1` gate rather than being mocked into passing.

## Fixtures and Factories

**Agda source fixtures:** Real, minimal `.agda` files under `test/fixtures/agda/`, one concern per file, named for the behavior under test (`WithHoles.agda`, `MultipleHoles.agda`, `TypeError.agda`, `NestedWhereHole.agda`). Literate-mode variants use `.lagda`, `.lagda.md`, `.lagda.org`, `.lagda.rst`, `.lagda.tex`, `.lagda.typ`, `.lagda.tree` extensions to cover each literate format.

**"Expected output" fixture pairs:** For write/edit operations, a `Foo.agda` input fixture is paired with a `Foo.expected.agda` fixture representing post-edit state (e.g. `WriteGiveSimple.agda` / `WriteGiveSimple.expected.agda`, `WriteCaseSplit.agda` / `WriteCaseSplit.expected.agda`).

**Fixture matrices (SSOT pattern):** Larger fixture sets are declared once in a JSON file plus a typed `.ts` loader, avoiding ad hoc fixture lists scattered across test files:
- `test/fixtures/agda/fixture-matrix.json` + `.ts` — general fixture matrix (AGENTS.md: "the preferred place to add new Agda cases before adding ad hoc fixture lists in tests")
- `test/fixtures/agda/expression-query-matrix.json` + `.ts`
- `test/fixtures/agda/navigation-query-matrix.json` + `.ts`
- `test/fixtures/agda/library-registration-matrix.json` + `.ts`
- `test/fixtures/e2e/mcp-tool-coverage.json` + `.ts` — SSOT mapping each exposed core MCP tool to the e2e scenario that covers it
- `test/fixtures/release-bug-matrix.json` + `.ts` — cross-cutting regression matrix for previously-fixed release bugs

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
Used by `test/integration/mcp/mcp-server.test.ts` and related e2e tests. Also drivable manually via `npm run mcp:local -- <subcommand>` (`scripts/mcp-local-client.mjs`) for interactive debugging — see `AGENTS.md` "MCP harness" section.

## Coverage

**Requirements:** No coverage threshold/config found (no `coverage` block in `vitest.config.ts`, no coverage script in `package.json`). Coverage is not formally enforced; correctness relies on the breadth of unit + property + integration + release-bug-matrix tests instead.

## Test Types

**Unit Tests (`test/unit/`):** Target pure functions and small modules directly with literal inputs/expected outputs — parsers, decoders, classifiers, tool schema/manifest validators. No process spawning, no filesystem beyond reading committed fixtures.

**Property Tests (`test/property/`):** Use `fc.assert(fc.property(...))` to state invariants generatively over arbitrary inputs (e.g. `fc.string()`, `fc.record({...})`, `fc.array(...)`) rather than enumerated examples. Per `AGENTS.md`: "All new features and bug fixes must follow property-based TDD" and "Add property-based tests for invariants whenever the behavior can be stated generatively." Mirrors the same subsystem folder structure as `test/unit/`.

**Integration Tests (`test/integration/agda/`, `test/integration/mcp/`):** Exercise a real `AgdaSession` or the built MCP server end-to-end against real `.agda` fixtures. Gated behind `RUN_AGDA_INTEGRATION=1` (and `RUN_AGDA_BACKEND_INTEGRATION=1` for GHC/JS backend-specific coverage) so the default `npm test` run stays Agda-free and fast. Version-sensitive behavior uses the `itSince(minVersion)` gating helper.

**E2E Tests:** `test/integration/mcp/` run against the compiled `dist/index.js` server (via `npm run test:e2e`, which runs `npm run build` first) rather than `tsx`-executed source, to validate what actually ships.

**Release-bug regression suite:** `npm run test:release:bugs` runs a curated, cross-cutting set of unit + integration test files (completeness, protocol parity, release bug matrix, library registration matrix, load/fixture-matrix/search-about/library-registration integration, and the full MCP server e2e test) as a single gate before release. `npm run test:release:bugs:sentinel` runs the same set through `scripts/test-with-sentinel.mjs` for hang/sentinel detection.

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

---

*Testing analysis: 2026-07-01*
