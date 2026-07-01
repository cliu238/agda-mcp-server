# MCP Design Trends (2025–2026) — mapped to agda-mcp-server

**Researched:** 2026-07-01 (workflow: 4 investigators → synthesis → 2 adversarial fact-checkers → finalize; agents verified against the live codebase).
**Confidence:** HIGH on codebase facts and shipped-spec (2025-06-18) claims; the 2026 RC is forward-looking — verify against the published final spec before building on it.

> **Provenance caveat.** Assistant knowledge cutoff is 2026-01. The 2025-06-18 spec and Anthropic engineering posts are pre-cutoff and reliable. The **2026-07-28 RC** and exact **SEP/PR numbers** are post-cutoff: one fact-check lens confirmed the RC SEPs verbatim on blog.modelcontextprotocol.io, the other could not corroborate — treat as forward-looking, confirm against the published final spec (reportedly locked 2026-05-21) before depending on any of it.

## Headline

**agda-mcp-server is already spec-native where it counts.** Code-verified: `src/tools/tool-envelope.ts` already emits `structuredContent` + per-tool `outputSchema` + `isError` — the thing most MCP servers still lack (it uses a `superRefine` trick, ~lines 42–114, to keep `outputSchema.type:'object'` and strict-validate `data` only on `ok:true`). The `diagnostics`/`nextAction` design is exactly the in-band, self-correctable error shape the spec is moving toward. So the real work is **finishing cheap shipped-today primitives** (annotations, progress+cancellation, in-band input-validation, stdout-hygiene guard) + **slow-subprocess survival**, then building **Loop 1 in capability-graceful layers** — and explicitly **NOT** on sampling.

## What's new (relative to ~2026-01)

**Stable, 2025-06-18 (load-bearing — the repo already implements the structured-output half):**
- **Structured tool output**: `structuredContent` + per-tool `outputSchema`.
- **Elicitation**: server requests structured input from the user mid-request (flat schema: enums/strings, no nesting).
- Resource links in tool results; `_meta` on more types; `title` display fields; **JSON-RPC batching removed**.

**Stable, 2025-03-26:** tool annotations (`readOnlyHint`/`idempotentHint`/`destructiveHint`/`openWorldHint`), progress `message` field, completions capability, audio content, Streamable HTTP, OAuth 2.1. *(Note: cancellation `notifications/cancelled` is OLDER — shipped 2024-11-05, safe to build on.)*

**Stable, 2025-11-25 (version confirmed; exact SEP numbers unconfirmed):** JSON Schema **2020-12** as default dialect; elicitation enum/default refinements; **experimental Tasks**; a convention that **input-validation errors are tool-execution errors** (in-band `isError`, not protocol errors).

**RC, 2026-07-28 (post-cutoff — VERIFY before use):** reportedly **deprecates Roots / Sampling / Logging** (SEP-2577); **Tasks** extension for async call-now/fetch-later (SEP-2663); multi-roundtrip elicitation / `InputRequiredResult` (SEP-2322); full 2020-12 **unions/oneOf** (SEP-2106); result caching `ttlMs`/`cacheScope` (SEP-2549); W3C Trace Context (SEP-414); Extensions (SEP-2133); MCP Apps (SEP-1865). **Key signal: sampling is on the way out.**

## Advanced-concepts canon (Anthropic, pre-cutoff, real — the "先进理念" target)
- **"Writing effective tools for agents":** prefer **workflow tools** over thin API wrappers; add a `response_format` concise/detailed enum; natural-language IDs; a response **cap with truncation-that-steers**; **eval-driven** tool refinement.
- **"Code execution with MCP":** **progressive disclosure** of a large tool surface; keep big intermediate results **out of the model's context** (present the server as a code API the agent writes against). Token figures in these posts are illustrative Claude Code defaults — **measure before adopting**.
- **Agent Skills** layer procedural know-how *over* MCP tools (strategy as a Skill, not server-side if/else).

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

**SKIP (local stdio server):** HTTP / OAuth / registry / stateless-core / `Mcp-Session-Id` — single-session statefulness (the AgdaSession SSOT) is correct, not debt. And do **NOT** architect Loop 1 on **sampling** (redundant — the driving agent already IS a client LLM; unevenly supported; RC-deprecated).

## Watch list (verify before citing/building)
- The **2026-07-28 RC** and all SEP numbers — confirm against the published final spec; especially the **sampling deprecation** (SEP-2577) and **Tasks** (SEP-2663) before leaning on them.
- The **2025-11-25 SEP/PR integers** are unconfirmed (directions are safe; numbers need a changelog check).
- **Installed `@modelcontextprotocol/sdk`** version is unknown (package.json `^1.12.0`, no lockfile resolvable here). Confirm `server.elicitInput` + resource-subscription helpers exist before Loop-1 work (elicitation likely landed ~1.10.0).
- **Target MCP client(s)** unspecified — elicitation/resources/Tasks support is uneven; this determines Loop-1 sequencing. Prompts are the safe first step.
- Anthropic **token figures** are illustrative defaults — measure via the Loop-2 eval harness before treating as targets.

---
*Informs Loop 2 operational hardening (now) and Loop 1 sequencing (LOOP1-01, later). Companion: `ORACLE-VALIDITY.md`, `LEAN-COMPARISON.md`.*
