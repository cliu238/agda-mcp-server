# MCP Design Trends (2025–2026) — mapped to agda-mcp-server

**Researched:** 2026-07-01 (workflow: 4 investigators → synthesis → 2 adversarial fact-checkers → finalize; agents verified against the live codebase).
**Confidence:** HIGH on codebase facts and shipped-spec (2025-06-18) claims; the 2026 RC is forward-looking — verify against the published final spec before building on it.

> **Provenance.** Verified against live primary sources on **2026-07-01** (modelcontextprotocol.io + blog.modelcontextprotocol.io + the spec repo). **Current stable spec = 2025-11-25.** The **2026-07-28 RC** is real, locked 2026-05-21, ratifies 2026-07-28 (not yet final at time of writing); SEP-2577 (deprecations) is already **Final** status (created 2026-04-14). Build against 2025-11-25 today; design forward-compatibly for the RC but don't depend on unratified RC-only details.

## Headline

**agda-mcp-server is already spec-native where it counts.** Code-verified: `src/tools/tool-envelope.ts` already emits `structuredContent` + per-tool `outputSchema` + `isError` — the thing most MCP servers still lack (it uses a `superRefine` trick, ~lines 42–114, to keep `outputSchema.type:'object'` and strict-validate `data` only on `ok:true`). The `diagnostics`/`nextAction` design is exactly the in-band, self-correctable error shape the spec is moving toward. So the real work is **finishing cheap shipped-today primitives** (annotations, progress+cancellation, in-band input-validation, stdout-hygiene guard) + **slow-subprocess survival**, then building **Loop 1 in capability-graceful layers** — and explicitly **NOT** on sampling.

## What's new (relative to ~2026-01)

**Stable, 2025-06-18 (load-bearing — the repo already implements the structured-output half):**
- **Structured tool output**: `structuredContent` + per-tool `outputSchema`.
- **Elicitation**: server requests structured input from the user mid-request (flat schema: enums/strings, no nesting).
- Resource links in tool results; `_meta` on more types; `title` display fields; **JSON-RPC batching removed**.

**Stable, 2025-03-26:** tool annotations (`readOnlyHint`/`idempotentHint`/`destructiveHint`/`openWorldHint`), progress `message` field, completions capability, audio content, Streamable HTTP, OAuth 2.1. *(Note: cancellation `notifications/cancelled` is OLDER — shipped 2024-11-05, safe to build on.)*

**Current stable — 2025-11-25 (verified):** experimental **Tasks** (SEP-1686 — durable requests: polling + deferred result retrieval); elicitation enums titled/untitled/single/multi-select (SEP-1330) + default values (SEP-1034) + **URL-mode** (send the user to a browser OAuth/credential flow, SEP-1036); **JSON Schema 2020-12** default dialect (SEP-1613); **input-validation errors = Tool Execution Errors, not protocol errors, to enable model self-correction (SEP-1303)** — now a spec convention, and *exactly* the repo's `diagnostics/nextAction` philosophy; tool-calling in sampling (SEP-1577); icons metadata (SEP-973); stderr for all stdio logging (PR #670).

**RC — 2026-07-28 (verified real; locked 2026-05-21, not yet ratified):** "MCP goes stateless." **Stateless core** — removes the `initialize`/`initialized` handshake (SEP-2575; protocol version + client info now ride in `_meta` on every request) and the `Mcp-Session-Id` header / protocol-level sessions (SEP-2567); server→client requests only during active request processing (SEP-2260). **Deprecates Roots / Sampling / Logging (SEP-2577, *Final*)** with a **≥12-month** window (wire-level unchanged during deprecation): sampling → integrate directly with an LLM provider API; logging → **stderr / OpenTelemetry** (the repo already uses stderr); roots → tool params / resource URIs / config. **Tasks becomes an extension** (SEP-2663): `tools/call` returns a task handle; client drives `tasks/get` / `tasks/update` / `tasks/cancel` (no `tasks/list`). Also: multi-round-trip requests / `InputRequiredResult` (SEP-2322), response caching `ttlMs`/`cacheScope` (SEP-2549), W3C Trace Context in `_meta` (SEP-414), Extensions framework w/ reverse-DNS IDs (SEP-2133), MCP Apps = server-rendered HTML in sandboxed iframes (SEP-1865), full 2020-12 unions/`$ref`/conditionals (SEP-2106), feature-lifecycle policy (SEP-2596).

## Design philosophy — the "先进理念" (verified 2026-07-01)

The center of gravity in MCP/agent design has moved from *protocol features* to **context engineering**: an agent's context window is a finite "attention budget", accuracy degrades as it fills ("context rot"), so the job is to find "the smallest set of high-signal tokens." Everything below follows from that.

- **Context engineering** ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)): tools must return **only actionable, high-signal** info; provide metadata that lets the agent decide what to fetch next; support lightweight retrieval (grep/glob/IDs) over full-context dumps. Long-horizon work uses **compaction**, **structured note-taking** (external memory), and **sub-agents** (clean context → condensed summary).
- **Code execution with MCP / "MCP as a code API"** ([Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp); study [arXiv 2602.15945](https://arxiv.org/abs/2602.15945); Cloudflare "Code Mode"): the frontier shift. Instead of loading ALL tool defs upfront and round-tripping every intermediate result through the model, present tools as a code API the agent **writes code against** — load defs on-demand, **filter/transform data in the sandbox before it reaches the model** (their example: 10k rows → 5; ~98.7% token cut reported), native loops/conditionals/error-handling, intermediates stay private. Trade-off (the study): code execution wins tokens/latency/turns; direct calls win error-isolation & step-verification → **hybrid**.
- **Progressive disclosure & just-in-time retrieval**: don't front-load; discover/load layer-by-layer via lightweight identifiers (paths, URIs, IDs, queries). The shared mechanism behind both code-execution tool-loading and Agent Skills; mirrors human "retrieve on demand" over "memorize everything."
- **Agent Skills** ([Anthropic](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)): package procedural know-how as files loaded on-demand — the progressive-disclosure way to ship *expertise*, complementary to tools. Strategy/heuristics belong in a Skill, not hardcoded server-side.
- **Tool-design canon** ([Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)): fewer **workflow tools** over thin API wrappers; **namespacing**; **risk-tiered** tools (read auto-runs, write/destructive gated); typed I/O validation; a `response_format` concise/detailed; a response **cap with steering truncation**; and **eval-driven** refinement — build an eval and let an agent optimize the tools against it. (Research [arXiv 2602.14878](https://arxiv.org/abs/2602.14878): MCP tool *descriptions* materially affect agent efficiency — audit them.)
- **Where the ecosystem is heading** ([2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)): working-group-driven; transport/statelessness/scale, agent communication (Tasks: retry semantics, result expiration), governance, enterprise-via-**extensions** — keep the core minimal. Mostly infra, not local-server design.

*Token figures above are illustrative (often Claude Code defaults) — measure via the Loop-2 eval harness before treating any as targets.*

## Project mapping

**NOW (Loop 2 / operational — cheap, shipped-today, mostly plumbing):**
| Concept | Concrete use |
|---|---|
| Tool annotation VALUES | Plumbing exists but ZERO hints set across ~62 registrations. Mark introspection tools `readOnly`+`idempotent`; `agda_load`/`give`/`refine`/`case_split` non-readOnly/`destructive`. Better client auto-approve + a mutate-vs-read signal for Loop-1. |
| In-band input validation | `tool-registration.ts:197` hands `inputSchema` straight to the SDK while try/catch wraps only the body — bad ARGS can throw a protocol `McpError` the agent can't self-correct. Add a test asserting `ok:false`+`nextAction`; wrap input parsing if the SDK throws. |
| Progress + timeout contract | Wire per-line load output (`parse-load-responses.ts`) to **coalesced/debounced** `notifications/progress` with Agda phase text + a heartbeat. Caveat: server progress is necessary but NOT sufficient — `resetTimeoutOnProgress` is a client opt-in, `~60s` is an SDK default. Document a timeout contract. |
| Protocol-native cancellation | SDK exposes `notifications/cancelled` as an AbortSignal on the handler's `extra.signal`. Read it → `session.abort()`, reusing `cancelledThrough`/`commandSerial`. |
| Cancel-vs-finishing-load race + retry idempotency | A correctness REQUIREMENT on the single AgdaSession: define abandon vs `Cmd_abort` vs let-finish, and how a retried `Cmd_load` coalesces with an in-flight one. |
| Subprocess-death → in-band envelope | Lift `agda-process-spawn.ts` onClose/onError into `ok:false` + `nextAction(respawn)`. |
| stdout-is-protocol CI guard | Code is already correct today; add a lint ban on `process.stdout.write`/`console.log` in server paths + a regression test that Agda output never reaches server stdout. |
| `response_format` {concise,detailed} + steering cap | High-volume tools (`agda_goal_catalog`, `agda_session_snapshot`) default concise; on truncation embed `nextAction` telling the agent how to narrow. |
| Keep the structured envelope (NO rebuild) | Verify the zod→JSON-Schema layer advertises the 2020-12 dialect; keep the single-object+superRefine approach until full unions land. |

**NEXT (Loop 1 — capability-graceful layers, reasoning kept OUT of the server):**
1. **Prompts** as user-invoked proof-strategy slash-commands (`/prove-by-induction n`, `/refine-and-auto`) — work in every client, no capability dependency.
2. **Elicitation enums** ("which goal? split on which var?"), gated on the client's elicitation capability, with a `structuredContent` ranked-suggestions fallback; always handle decline/cancel.
3. **Subscribable `agda://session/goals` resource** — the live-state channel (MCP has no structured partial-result channel on a normal request); emit `notifications/resources/updated` after each load/refine.
4. **Emit ranked next-move candidates as DATA** (`data` + `diagnostics.nextAction`) and package heuristics as an **Agent Skill** — never server-side reasoning, never sampling.

**LATER:** Tasks-ready internal op (stable id+status so a slow load can become a Task cheaply — don't build Tasks yet); move `provenance`/`elapsedMs` into a namespaced `_meta` key (interop polish); progressive disclosure of the tool surface **only if** the eval harness shows measurable upfront token cost.

**SKIP (local stdio server):** HTTP / OAuth / registry — out of scope. The RC's **stateless core** (SEP-2575/2567) is a *protocol/HTTP-routing* concern; it does NOT touch your **application** state — the single AgdaSession SSOT stays correct (the SDK handles the stdio handshake). Do **NOT** build Loop 1 on **sampling** (now *Final*-deprecated, ≥12-mo window; redundant — the driving agent already IS a client LLM). Skip the MCP **logging** channel too (also deprecated → keep using stderr, which the repo already does).

## Watch list (real unknowns / verify before building)
- **RC not yet ratified** (2026-07-28). The 2025-11-25 and RC facts above are verified against primary sources, but RC-only features (the Tasks *extension* shape, stateless core) can still shift — re-confirm on/after ratification. Build against **2025-11-25** today.
- **Installed `@modelcontextprotocol/sdk`** version is unknown here (package.json `^1.12.0`, no lockfile resolvable). Confirm `server.elicitInput` + resource-subscription helpers exist before Loop-1 work.
- **Target MCP client(s)** unspecified — elicitation/resources/Tasks support is uneven across clients ([feature-support matrix](https://modelcontextprotocol.io/clients)); this determines Loop-1 sequencing. **Prompts are the safe first step** (no capability dependency).
- Client **timeout** behavior is implementation-defined (`resetTimeoutOnProgress` is a client opt-in; the ~60s figure is an SDK default). Document a timeout contract; don't assume server progress alone prevents a timeout.
- Anthropic **token figures** are illustrative defaults — measure via the Loop-2 eval harness before treating as targets.

---
*Informs Loop 2 operational hardening (now) and Loop 1 sequencing (LOOP1-01, later). Companion: `ORACLE-VALIDITY.md`, `LEAN-COMPARISON.md`.*
