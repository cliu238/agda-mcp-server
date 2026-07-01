# Stack Research

**Domain:** Reproducible self-improvement / dogfooding loop ("Loop ②") on a Node 24 / TypeScript / vitest / `@modelcontextprotocol/sdk` MCP server
**Researched:** 2026-07-01
**Confidence:** HIGH for "compose with existing stack, add almost nothing"; MEDIUM on the external MCP-eval tooling landscape (fast-moving, LLM-in-the-loop, mostly out of v1 scope)

## Headline Recommendation

**Build Loop ②'s scaffold almost entirely from tooling you already own.** The existing stack — vitest 4 (with its built-in snapshot engine), `@modelcontextprotocol/sdk` Client via `test/helpers/mcp-harness.ts`, the fixture-matrix SSOT pattern, `bug-report.ts` with stable fingerprints, and GitHub Issues + `gh` — already covers every layer of dogfood → capture → regression test → fix queue. There is **no off-the-shelf library for "record a live Agda `--interaction-json` subprocess session and replay it as a deterministic test"** because the transport is a bespoke stdin/stdout JSON dialect (IOTCM), not HTTP. So the one thing to *build* (not install) is a small in-repo transcript recorder/replayer at the Agda transport seam. Adding heavy dependencies here would fight the project's "Node builtins + one CLI binary, hard 500-line ceiling" constraints for near-zero gain.

## Recommended Stack

### Core Technologies (already present — reuse, do not replace)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| vitest | 4.1.x (latest 4.1.9; repo on ^4.1.2) | Test runner + **built-in snapshot engine** (`toMatchSnapshot`, `toMatchInlineSnapshot`, `toMatchFileSnapshot`) + custom snapshot serializers | Snapshot testing is the native mechanism for "captured session → locked regression." `toMatchFileSnapshot` stores large recorded transcripts/`ToolResult` envelopes as reviewable `.snap`-style files; custom serializers normalize volatile Agda output. Zero new deps. |
| `@modelcontextprotocol/sdk` | latest 1.29.0 (repo on ^1.12.0) | The dogfooding harness primitive: `Client` + `StdioClientTransport` already wrapped in `test/helpers/mcp-harness.ts` | This *is* your MCP evaluation harness. It drives the built `dist/index.js` exactly as Codex/Claude Code do. Extend it (capture transcripts + timing) rather than adopting a third-party eval framework. Consider a routine minor bump for spec-compliance, but it is orthogonal to Loop ②. |
| `@fast-check/vitest` | 0.4.x (latest 0.4.1; repo on ^0.3.0) | Property-based TDD (repo mandate in AGENTS.md) | Already the required test style. A captured defect that generalizes should become a *property* (invariant over generated inputs), not only a single-example snapshot. |
| Node builtins (`node:child_process`, `node:fs`, `node:readline`, `node:crypto`) | Node >= 24 | Subprocess capture, JSONL transcript read/write, stable hashing | The project's stated infra posture is "Node builtins only, no database/HTTP." Transcript capture/replay fits entirely within these. `node:crypto` already backs `bug-report.ts` fingerprints. |
| `zod` | 4.4.x (repo on ^4.0.0) | Schema for the captured-session / bug-bundle records | Already the boundary validator. Give the transcript record and the bug-bundle a Zod schema so captures are validated on write and on replay. |

### Supporting Libraries (add only if a concrete need appears)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@modelcontextprotocol/inspector` | 0.22.0 | Interactive manual dogfooding / debugging UI for the running MCP server (run via `npx`, not a dependency) | Human-in-the-loop exploration of tool calls while hunting bugs. Complements the scripted `npm run mcp:local` client. Keep as a `npx` dev tool, do **not** add to `dependencies`. |
| (nothing else) | — | — | Resist adding a logger, a VCR/cassette lib, a snapshot lib, or an eval framework. Each is either already covered or HTTP-shaped and inapplicable (see "What NOT to Use"). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| GitHub Issues + labels + `gh` CLI | The triage / fix queue | `bug-report.ts` already models `existingIssue?: number` and kinds (`new-bug`/`update`/`regression`). Render a bundle to a `gh issue create --label` body. Solo-maintainer- and agent-friendly: agents can propose the bundle; a thin script opens/updates the issue. |
| In-repo JSONL "capture queue" (e.g. `captures/` or under `.planning/`) | Durable local SSOT for captured sessions before/after they become issues | Mirrors the existing fixture-matrix SSOT philosophy. Append-only JSONL of validated bug bundles; a sync script reconciles to GitHub issues via `gh`. Agents read/append files trivially. |
| Fixture-matrix pattern (`test/fixtures/**-matrix.json` + `.ts`) | Where a captured defect graduates into a permanent regression case | Extend `release-bug-matrix.json/.ts` (already "cross-cutting regression matrix for previously-fixed release bugs") — this is the natural landing zone for locked-in Loop ② fixes. |
| vitest custom snapshot serializers (`expect.addSnapshotSerializer`) | Normalize non-deterministic Agda output before snapshotting | Strip/rewrite absolute paths, Agda version strings, metavariable numbering, and timing so recorded transcripts are stable across machines and Agda 2.6.4.3–2.9.0. |

## The One Thing You Build: a Session Recorder/Replayer at the Agda transport seam

This is the load-bearing piece with no off-the-shelf equivalent. Shape it around what the codebase already has:

1. **Record** — at the `AgdaSession` / command-builder boundary, tee every outbound IOTCM command string and every inbound Agda `--interaction-json` message into an append-only **JSONL transcript** (`{ dir, seq, sentAt, iotcm, responses[] }`). This runs only when a capture flag is set, so normal operation is untouched. The `command-builder.ts` SSOT already guarantees every wire string flows through one place — hook there.
2. **Fingerprint + bundle** — feed the failing transcript's salient fields into the existing `buildBugReportBundle` / `fingerprintBugReport` so identical defects collapse to one stable id (dedup for the queue).
3. **Replay** — a `RecordedTransport` that satisfies the same read/write contract as the real Agda stdio transport but sources responses from a stored transcript. This yields a **deterministic regression test that runs in the default `npm test` suite (no live Agda, no `RUN_AGDA_INTEGRATION=1` gate)** — closing the "lock it in" step for CI.
4. **Two-tier locking** — pair each captured defect with (a) a fast replay/snapshot test (default suite) and, where the behavior is Agda-version-sensitive, (b) a live integration test gated by `RUN_AGDA_INTEGRATION=1` + `itSince(minVersion)` per the existing convention.

Recommended storage: `toMatchFileSnapshot` for the normalized envelope/transcript (large, reviewable in PR diffs), plus a checked-in JSONL cassette for the raw replay input.

## Installation

```bash
# Core: nothing new — already in package.json
#   vitest, @modelcontextprotocol/sdk, @fast-check/vitest, zod, @types/node

# Optional interactive dogfooding UI — run on demand, do NOT add as a dependency
npx @modelcontextprotocol/inspector node dist/index.js

# Triage queue — GitHub CLI (system tool, not an npm dep)
#   gh issue create / gh issue list --label loop2
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| In-repo JSONL transcript recorder | `pino` 10.x (structured logger) | If you later want general structured operational logging across the server. For *targeted session capture*, a purpose-built transcript beats a generic log stream, and pino adds a runtime dep the project has so far avoided. Not for v1. |
| vitest built-in snapshots | `jest-image-snapshot` / external snapshot libs | Never here — vitest's engine already covers text/JSON/file snapshots with serializers. |
| Reuse `mcp-harness.ts` (SDK Client) | `mcp-evals` 2.x, MCPJam, Scorecard-style LLM eval harnesses | Only if/when you build **LLM-in-the-loop grading** (does the agent *choose* the right tool?). That is Loop ①/knowledge-accumulation territory — explicitly deferred to v2+. v1 needs deterministic reproduction, not model grading. |
| GitHub Issues + `gh` + JSONL SSOT | Dedicated backlog tools (Linear, Backlog.md, task-runner apps) | If the team grows beyond solo + agents and needs assignment/workflow features. Overkill for a solo maintainer whose agents already live in the repo and speak `gh`. |
| GitHub MCP server for agent-filed issues | Manual `gh` from a script | When you actually automate issue creation from agents (v2 "auto-PR / automation"). v1 keeps a human/script in the loop, matching the "scaffold, not automation" scope. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `nock` / `@pollyjs/*` / `msw` (HTTP record-replay "VCR" libs) | The Agda transport is a long-lived stdin/stdout **IOTCM/JSON subprocess**, not HTTP. These libraries intercept `http`/`fetch` and cannot see subprocess stdio. Wrong seam entirely. | A bespoke `RecordedTransport` at the Agda stdio boundary (build, ~one small module). |
| A third-party "session record/replay" npm package | None targets the Agda `--interaction-json` protocol; generic ones assume HTTP or Redis-backed web sessions. Adopting one adds a dep and still needs a custom adapter. | In-repo JSONL cassette + replay transport (above). |
| Heavyweight MCP eval frameworks (`mcp-evals`, LLM-graded benchmark runners) for v1 | They optimize for "did the model pick/orchestrate the right tools" via an LLM judge — nondeterministic, API-key-bound, and aimed at agent-quality benchmarking. v1's fuel is *organic* usage and its goal is *deterministic* defect lock-in. Conflicts with the stated "no curated benchmark suite" decision. | Existing `mcp-harness.ts` scripted client + deterministic replay/snapshot tests. Revisit for v2 Loop ①. |
| `pino`/`winston` as a Loop-② dependency | Generic logging ≠ structured capture; adds a runtime dep against the "Node builtins only" posture and the 500-line/no-infra discipline. | Purpose-built JSONL transcript writer using `node:fs`. |
| A database / embedded store (SQLite, lowdb) for the queue | Violates the explicit "no database" constraint; a solo + agent workflow is well served by files + GitHub. | Append-only JSONL SSOT + GitHub Issues. |
| MCP `resources`/`prompts`/`sampling` protocol features to expose capture | PROJECT.md defers "advanced MCP protocol features" (they serve deferred Loop ①). Capture is an internal/test-time concern, not a new protocol surface. | Internal transcript hook + existing tool envelopes. |

## Stack Patterns by Variant

**If the captured defect is deterministic given a fixed Agda version:**
- Store a recorded transcript cassette + normalized `ToolResult` snapshot; replay via `RecordedTransport` in the **default `npm test`** suite.
- Because it needs no live Agda, it locks the fix into CI cheaply and runs on every push.

**If the defect depends on Agda version behavior (2.6.4.3 → 2.9.0):**
- Add a live integration test gated by `RUN_AGDA_INTEGRATION=1` and `itSince(minVersion)` (existing convention).
- Because Agda's `--interaction-json` output for metas/errors shifts across versions and cannot be faithfully frozen for all versions in one cassette.

**If the defect generalizes into an invariant (not one example):**
- Promote it to a `@fast-check/vitest` property under `test/property/…` in addition to the snapshot.
- Because AGENTS.md mandates property-based TDD and invariants catch the *class* of bug, not just the instance.

**If the capture is an agent-driven end-to-end failure (Codex/Claude Code):**
- Reproduce through `mcp-harness.ts` against built `dist/index.js`, capture the MCP-level transcript, and store as an e2e replay under `test/integration/mcp/`.
- Because that path exercises exactly what ships.

## Version Compatibility

| Package | Version verified (npm, 2026-07-01) | Notes |
|---------|-----------------------------------|-------|
| vitest | 4.1.9 latest | Repo on ^4.1.2 — snapshot API (`toMatchFileSnapshot`, custom serializers) stable in v4; no upgrade needed for Loop ②. |
| @modelcontextprotocol/sdk | 1.29.0 latest | Repo on ^1.12.0 — Client/StdioClientTransport contract used by the harness is stable across this range; bump is optional and Loop-②-orthogonal. |
| @fast-check/vitest | 0.4.1 latest | Repo on ^0.3.0 — still pre-1.0; pin and bump deliberately. Property API used (`fc.assert`/`fc.property`) unaffected. |
| zod | 4.4.3 latest | Repo on ^4.0.0 — v4 line; new capture/bundle schemas should use the same v4 API already in `response-schemas.ts`. |
| @modelcontextprotocol/inspector | 0.22.0 | Dev-only via `npx`; pre-1.0, expect churn — do not depend on it programmatically. |

## Sources

- Codebase (authoritative, HIGH): `.planning/PROJECT.md`, `.planning/codebase/STACK.md`, `.planning/codebase/TESTING.md`, `src/reporting/bug-report.ts`
- npm registry version checks (HIGH, 2026-07-01): `vitest`, `@modelcontextprotocol/sdk`, `@fast-check/vitest`, `zod`, `@modelcontextprotocol/inspector`, `pino`, `mcp-evals`
- MCP evaluation / dogfooding landscape (MEDIUM, WebSearch): [Demystifying evals for AI agents — Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [MCP Inspector / tooling — modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [2026-07-28 MCP spec release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
