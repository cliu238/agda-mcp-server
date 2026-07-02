# Phase 5: Dogfooding Orchestration + Fuel - Research

**Researched:** 2026-07-02
**Domain:** Recording MCP-stdio proxy orchestration + reproducible fuel-corpus pinning for an existing capture/oracle/queue pipeline (Phases 1-4 already complete)
**Confidence:** MEDIUM-HIGH overall — HIGH on internal codebase composition (everything read directly), MEDIUM on external agent-tooling conventions (Skill discovery, `codex mcp add`/`claude mcp add`, cross-verified via official docs but a fast-moving space), LOW/flagged on anything requiring a live multi-week corpus run to validate empirically.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> **Classification legend** (per the established Phase-1/2/3/4 convention):
> **[FORCED]** = fixed by correctness / a requirement / the phase boundary / an existing convention or charter — alternatives ruled out (reason given). Non-negotiable downstream.
> **[TASTE]** = a genuine values call the maintainer made.
> **[DEFERRED]** = deliberately unresolved (empirical or later-phase).
>
> This discussion surfaced exactly **two** taste decisions (D-01, D-02); the six forced conclusions (D-03…D-08) were briefed to the user with veto offered — none exercised.

**Driver model (success criterion 3)**

- **D-01 [TASTE — user decision]:** v1's core is the **recording-proxy mode**: the agent (Codex or Claude Code, interactively driven by the maintainer as in the real CHG campaign) has its MCP server command pointed at `scripts/dogfood-run.mjs`, which spawns the real server over stdio, passes JSON-RPC through transparently, records the full tool-call transcript, and auto-persists captures at session end. **Headless one-shot mode** (dogfood-run spawning a `codex exec` child fed by a task manifest) is deferred — not ruled out, just not v1's core. Unattended cron looping stays v2 (AUTO-06) under either mode. Rationale: matches how the team actually works, minimizes new dependency surface (headless CLI behavior), and interactive sessions were previously *unrecorded* — this closes that gap first.
  - *Criterion-3 wording note for planners:* the roadmap says "via the existing harness"; the proxy satisfies the criterion's intent (single server process / single `AgdaSession`, transcript recorded, captures auto-persisted). `test/helpers/mcp-harness.ts` remains the natural client vehicle where the orchestrator genuinely IS a client — the post-run replay / N-rerun flake classification (D-04).

**Fuel set (PROC-02)**

- **D-02 [TASTE — user decision]:** The v1 pinned fuel set is **exactly the four requirement-named corpora**: `agda-stdlib` (public), `agda-unimath` (public; host of the Hopf work), `emilyriehl/Codex-Homotopy-Group` (private; directly dogfoods this server; policy whitelist + flag baseline ready-made), `emilyriehl/autoformalizing-hopf` (private; paper repo) — all at pinned commits. No additional OSS corpora in v1. **The first official dogfood run targets CHG** — it has measured false-greens against this very server, its `.agda-lib`-derived policy facts are ready, and it is the most likely to surface real defects immediately. (stdlib-first was considered and rejected as the lower-yield first cut; it stays in the set for subsequent runs.)

**Signature hard gate (PROC-01)**

- **D-03 [FORCED — PROC-01 "up front" wording + CHG field evidence]:** The expected-signature hard gate is **mechanically enforced by the orchestrator at run start**: a proving run requires a task manifest carrying the expected top-level signature per target; without it, `dogfood-run` refuses to start. Ruled out: runbook-prose-only (CHG's multi-week campaign produced ZERO structured captures despite instructions, and its two planning docs disagreed on a homotopy-group index — soft guidance demonstrably fails); intake-time gating (not "up front" — by then the session already ran with ORCL-03 vacuous). Capture-time remains optional per Phase-1 D-02 lineage (crash/failure captures inherently have no expected signature).

**Post-run pipeline (success criterion 4)**

- **D-04 [FORCED — charter P5 + Phase-4 queue design]:** The wrap-up pipeline is **auto-chained in code**: one wrap-up command takes a finished run through the oracle triad → N-times re-run flake classification (deterministic → real defect; flaky → tagged `timing/nondeterministic`, never filed as deterministic) → **auto-files true defects into the Phase-4 queue as `new`**. No pre-intake human confirm: Phase 4 deliberately placed the human review point *inside* the queue (`new` → `triaged` is the human step, and `new` never auto-publishes to GitHub per Phase-4 D-13). DESIGN-PRINCIPLES P5 names this orchestrator as the compose-in-code exemplar — per-step model round-trips are ruled out.

**Run artifacts & privacy**

- **D-05 [FORCED — Phase-4 D-11 privacy line + `.agda-mcp/` convention]:** Transcripts, run reports, and staged captures live in **gitignored `.agda-mcp/runs/`** (machine-local staging, per the Phase-1/2 convention). Private-corpus source (CHG, autoformalizing-hopf) never enters the public repo tree; only summary-level, source-free data flows into queue entries per Phase-4 D-11 payload rules.

**Transcript recording**

- **D-06 [FORCED — criterion-3 wording + bounded ring buffer]:** The **proxy records the full-session transcript itself** (unbounded, on disk) and sets `AGDA_MCP_CAPTURE=1` on the child server so the capture verb has its in-server action log. The server-side recorder is a bounded ring buffer (long sessions overflow it — Phase-1 D-06) and is therefore *not* the transcript; the two records serve different consumers (proxy transcript → run report/forensics; ring buffer → `CaptureArtifact.actionLog`).

**Runbook packaging (PROC-01)**

- **D-07 [FORCED — charter P6 + dual-agent constraint]:** The runbook ships as an **Agent Skill usable by both Codex and Claude Code** (CHG's `.codex/skills/agda-unimath-skills` and leanprover/skills are the templates). It must explicitly script **when and how to invoke `agda_capture_session`** — the antidote to the STATE.md open risk (zero captures in the wild means Loop ② is not self-feeding) — and must describe the legitimate **scaffold-hole workflow** (intentional `{!!}` + `--allow-unsolved-metas` is in-progress work, never a defect to capture).

**Run report instrumentation**

- **D-08 [FORCED — charter P7 "measured, not assumed"]:** The run report carries **basic instrumentation**: per-tool call counts, durations, capture/defect tallies. P7 names the Loop-2 harness as the measuring instrument for token/turn budgets; the CHG baseline (711 calls, `agda_load` = 46%, introspection ≫ mutation) is the comparison point. Exact metric set and whether token counts are approximated by payload size at the stdio seam = plan-phase detail.

### Claude's Discretion

- Policy-file schema + location (formalizing the Phase-2 interim whitelist/flag-baseline handoff into PROC-02's home), and the fuel-pointer file format/location.
- Task-manifest file format (what a "target + expected signature" entry looks like).
- Default N for flake-classification re-runs.
- Skill directory layout serving both agents (`.codex/skills/` vs `.claude/skills/` vs shared source).
- Proxy CLI shape, flags, and run/session naming under `.agda-mcp/runs/`.
- Run-report format (JSON + human summary, per the Phase-4 dashboard precedent).

### Deferred Ideas (OUT OF SCOPE)

- **Headless one-shot mode** (`dogfood-run` spawning `codex exec` against a task manifest) — deferred past v1's core by D-01; revisit once the proxy mode has produced real runs.
- **Unattended loop orchestration** (cron over pinned fuel) → AUTO-06 (v2).
- **Agent-facing capture hints** ("this smells like a defect — capture it" via `nextAction`) → AUTO-02 (v2).
- **ORCL-02 hardened flag-baseline hard half** → AUTO-07 (v2); the policy file should leave schema room for it.
- **Token-accurate budget measurement** beyond call counts/payload sizes — empirical refinement once run reports exist (P7's consolidation decisions are gated on this data).
- **Fixing the harvested cargo** — ongoing post-scaffold work (PROJECT.md "continuous feature completion + bug fixing"); this phase delivers the harvest process, not the fixes.

**Scope fence (from the orchestrator prompt, reinforcing CONTEXT.md):** PROC-01 (runbook + driver prompt + the orchestrator script + the N-times gate) and PROC-02 (fuel-pointer set) ONLY. Do NOT build v2 work: knowledge accumulation, auto-PR, unattended/autonomous orchestration (AUTO-07). The orchestrator is on-demand, not a daemon.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROC-01 | A written dogfooding runbook + driver-prompt snippet makes the *process* reproducible — telling an agent when and how to invoke the capture verb while proving against real corpora, so "point Codex at stdlib and harvest defects" can be re-run on demand. **Declaring the target's expected top-level signature up front is a hard gate** (without it ORCL-03's conformance proxy is vacuous). | See Architecture Patterns (Pattern 1: transparent recording proxy, Pattern 2: manifest hard gate), Code Examples (task-manifest schema, SKILL.md skeleton, pre-flight gate), Common Pitfalls (Skill-discovery/.gitignore conflict, npm-package-doesn't-ship-scripts/), Sources (Codex/Claude Code Skill discovery, `codex mcp add`/`claude mcp add`). |
| PROC-02 | A pinned fuel pointer set lists the source corpora (agda-stdlib, chosen OSS Agda projects, the maintainer's own math projects) with pinned commits, so dogfooding runs are reproducible across time. It is the home for the per-project machine-readable policy (sanctioned-axiom whitelist + required/forbidden flag baseline) ORCL-02 reads. | See Standard Stack (extend, don't replace, the existing `scripts/data/oracle-policy/*.json` mechanism), Code Examples (fuel-pointer manifest sketch), Don't Hand-Roll (reuse `loadOraclePolicy`'s read path unchanged), Assumptions Log (which corpora are actually clonable / access-gated). |
</phase_requirements>

## Summary

Phases 1–4 already built every mechanical piece this phase needs to compose: a capture verb (`agda_capture_session`) that stages a full replay manifest + action log; an oracle triad (`scripts/oracle/run-oracle.mjs` and its `orcl-01/02/03` siblings) that judges a staged capture; a fix queue (`test/fixtures/fix-queue.json` + `scripts/queue/intake.mjs`) that accepts filed defects. **Phase 5 adds no new correctness logic to any of those — it adds the glue that makes running them, together, a repeatable one-command act**, plus the pinned-corpus data that makes "which project, which commit, which policy" a checked-in fact instead of tribal knowledge.

The single biggest architectural decision — already locked by CONTEXT.md D-01 — is that the orchestrator is a **transparent stdio recording proxy**, not a second MCP client. The agent's own MCP config points at `scripts/dogfood-run.mjs` instead of the bare server; the proxy spawns the real `dist/index.js` as a child (preserving the single-`AgdaSession` invariant, #39), forwards every JSON-RPC line unchanged in both directions, and *additionally* parses each line (MCP stdio is newline-delimited JSON-RPC 2.0 with no embedded newlines — a stable, spec-guaranteed framing) to build a transcript and detect `agda_capture_session` results. This means the proxy needs **no new MCP protocol implementation** (no `Server`/`Client` pair from the SDK) — it is closer to a line-buffered `tee`, a shape this codebase already has working prior art for in `scripts/oracle/cold-agda-session.mjs`'s NDJSON parsing loop.

Two research findings materially change what "ships as a Skill for both Codex and Claude Code" (D-07) actually requires, and both are addressed concretely below: (1) **Claude Code and Codex CLI do not share a skill directory today** — Claude Code discovers project skills only from `.claude/skills/`, while Codex CLI's own current docs say it scans `.agents/skills/` (not `.codex/skills/`, despite that being what CHG's private repo happens to use); and (2) **this repo's own `.gitignore` excludes both `.claude/` and `.codex/` wholesale**, so naively dropping `SKILL.md` into either would silently fail to ship it. The clean resolution: track the canonical `SKILL.md` under `.agents/skills/` (satisfies Codex natively, not gitignored) and add a tiny install script that symlinks it into the gitignored `.claude/skills/` for Claude Code's own discovery.

The other high-value finding is architectural, not packaging: Pitfall 3 (PITFALLS.md) and CONTEXT.md's own callout of `mcp-harness.ts` as "the vehicle for... N-rerun flake classification" both point toward the N-times re-run being a **warm-replay stability check** (re-run the recorded trigger against N fresh built-server instances via `createMcpHarness` and see if the observed envelope is stable), which is a different and complementary signal to ORCL-01's single cold-vs-warm differential. This research recommends a two-stage classifier that reuses both, rather than re-running ORCL-01's cold spawn N times (a plausible but, on the evidence, less well-supported reading — flagged as an Open Question for plan-phase to settle explicitly).

**Primary recommendation:** Build exactly two new scripts (`scripts/dogfood-run.mjs` — the recording proxy; `scripts/dogfood-wrapup.mjs` — the auto-chained oracle→classify→file pipeline), one new tracked data file pair (a fuel-pointer manifest + typed loader, extending — not replacing — the existing `scripts/data/oracle-policy/*.json` mechanism), one new task-manifest schema (`{ target, expectedSignature, corpus }[]`, matching the existing matrix-as-SSOT idiom), and one Agent Skill tracked at `.agents/skills/agda-dogfooding/SKILL.md` with a Claude-Code-local symlink. No new `src/` surface, no new npm dependency.

## Architectural Responsibility Map

> This project is a stdio MCP server + CLI scripts tooling, not a web app — the standard Browser/SSR/API/CDN/DB tier vocabulary doesn't map cleanly. The table below substitutes this project's own established layers (`.planning/codebase/ARCHITECTURE.md`: protocol → agda → session → tools) plus the two tiers this phase actually touches (orchestration scripts, and tracked/untracked data).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Transparent stdio pass-through + transcript recording | Orchestration/scripts (NEW: `scripts/dogfood-run.mjs`) | — | Sits *between* the agent and the server; must never gain Agda-domain knowledge or a second `AgdaSession` — pure transport plumbing |
| Task-manifest hard gate (expected signature, PROC-01) | Orchestration/scripts (NEW, inside `dogfood-run.mjs`'s pre-flight) | Data/staging (tracked task-manifest JSON) | Pure data validation before the child process is even spawned; no protocol knowledge needed |
| Capture verb (`agda_capture_session`) | MCP tool layer (`src/tools/register-capture-session.ts`) — EXISTING, Phase 1 | Session/Agda domain (`src/agda/session-capture/*`) | Untouched by this phase; the Skill only documents *when* an agent should call it |
| Oracle triad judgment (ORCL-01/02/03) | Orchestration/scripts (`scripts/oracle/*.mjs`) — EXISTING, Phase 2 | — | Phase 5 composes/re-invokes `runOracle()`; does not modify its internals |
| N-times flake classification (NEW) | Orchestration/scripts (NEW, inside `dogfood-wrapup.mjs`) | Test-helper tier (`test/helpers/mcp-harness.ts`, reused as a library) | Needs to spin up fresh warm sessions — the same "client" role `mcp-harness.ts` already serves for Phase-3 regression replay |
| Queue intake (`new` filing) | Orchestration/scripts (`scripts/queue/intake.mjs`) — EXISTING, Phase 4 | Data/staging (`test/fixtures/fix-queue.json`, tracked) | Phase 5 only calls `upsertQueueEntry`; queue semantics are untouched |
| Fuel-pointer + policy manifest (PROC-02) | Data/staging (NEW tracked JSON + typed loader) | Orchestration/scripts (consumed by ORCL-01/02 and the manifest hard gate) | Matrix-as-SSOT convention; the "formal home" CONTEXT.md names |
| Dogfooding runbook / driver prompt (PROC-01) | Agent Skill tier (NEW: `.agents/skills/` + `.claude/skills/` symlink) | — | Strategy lives in a Skill per DESIGN-PRINCIPLES P6, never server-side logic |
| Run transcripts / staged run reports | Data/staging (gitignored `.agda-mcp/runs/`) | — | Machine-local, privacy-sensitive (may echo private-corpus source in transcripts) |
| Single long-lived Agda process (#39 invariant) | Session/Agda domain (`src/agda/session.ts`, inside the CHILD process only) | — | The proxy is a separate OS process from the child; it never imports `AgdaSession` and never spawns Agda itself (the oracle's cold spawns are separate, already-isolated, already-existing processes from Phase 2) |

## Standard Stack

### Core

No new external packages. This phase composes existing, already-vendored dependencies and existing in-repo modules.

| Library | Version (verified from `package.json`) | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| Node.js builtins (`node:child_process`, `node:readline`, `node:fs`, `node:path`, `node:crypto`) | Node >=24 (`.nvmrc`, `engines`) | Spawn the child server, line-buffer stdio, write run artifacts | This project's established posture is "Node builtins only... no new logger/database/HTTP dependency" (REQUIREMENTS.md Out of Scope); a stdio tee needs nothing beyond `spawn` + line buffering |
| `tsx` | `^4.0.0` [VERIFIED: local `package.json`] | Run scripts that import `.ts` sibling modules via `.js`-suffixed specifiers | Every existing oracle/queue script in this repo (`run-oracle.mjs`, `intake.mjs`, `emit-regression.mjs`) already documents this exact requirement in its own header comment — same reason applies to any new script importing `src/`/`test/helpers/` |
| `zod` | `^4.0.0` [VERIFIED: local `package.json`] | Validate the new task-manifest and fuel-pointer JSON shapes | Matches `fixQueueEntrySchema` / `captureRegressionEntrySchema` / `oraclePolicySchema` — the established "matrix-as-SSOT + zod + typed loader" idiom (`test/helpers/json-data.ts`'s `loadValidatedJsonData`) |
| `@modelcontextprotocol/sdk` | `^1.12.0` [VERIFIED: local `package.json`] | Referenced only indirectly (the SDK already governs the child server's own stdio framing); the proxy itself does **not** need to import `Server`/`Client` from this package — see Architecture Patterns, Pattern 1 | Confirms the proxy can stay a thin transport layer, not a second protocol implementation |
| `vitest` | `^4.1.2` [VERIFIED: local `package.json`] | Test the proxy/wrap-up logic against small local fixtures | Existing suite convention (`vitest.config.ts`); see Validation Architecture |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `git` (external CLI, already required by CONTRIBUTING.md workflows) | n/a (system tool) | Clone/pin the public fuel corpora (agda-stdlib, agda-unimath) at a specific commit | PROC-02's fuel-pointer manifest records a `pinnedRef`; the runbook instructs `git checkout <ref>` (or `git clone --branch <tag>`) inside the target corpus, not inside this repo |
| `gh` (GitHub CLI) | 2.86.0 confirmed installed locally [VERIFIED: local `gh --version`] | Clone the two private/access-gated corpora (CHG, autoformalizing-hopf) | Already the established mechanism (`FUEL-CORPORA.md`: "re-clone via `gh repo clone emilyriehl/Codex-Homotopy-Group`"); not a new dependency — `gh` is already assumed elsewhere in this repo (QUEUE-04's mirror) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A thin line-buffered tee proxy (recommended) | A full second MCP `Server`+`Client` pair from the SDK, re-implementing `initialize`/`tools/list`/`tools/call` semantics | More "structured" access to each tool call, but doubles the SDK-version coupling surface and contradicts D-01's own wording ("passes JSON-RPC through transparently"); also a strictly bigger, harder-to-verify surface for a scaffold phase whose charter (P7) says "don't build more than the eval evidence justifies" |
| Extending `scripts/data/oracle-policy/*.json` (recommended) | A brand-new policy-file location/schema that duplicates sanctioned-axiom/flag data already in `scripts/data/oracle-policy/agda-unimath.json` | A parallel structure risks the exact split-brain Phase-4 D-04 explicitly reasoned against for the dedup index ("two files carrying [the same kind of] data would inevitably diverge") |
| Re-running ORCL-01's cold differential N times for flake classification | Re-running the recorded action through `createMcpHarness` N times (recommended primary signal — see Architecture Patterns, Pattern 3) | Re-running only the cold side tells you whether cold-agda's answer is stable (it should always be — cold agda has no idle-timer heuristic); it does **not** by itself test the thing Pitfall 3 actually describes (the *warm* server's idle-timer-driven nondeterminism). Recommend combining both; flagged as an Open Question for the plan to resolve explicitly, since it changes what "N-rerun" means operationally |
| A single monolithic `dogfood-run.mjs` that also runs the heavy oracle+classify+file pipeline internally at child-process exit | Two separate scripts: `dogfood-run.mjs` (session proxy) and `dogfood-wrapup.mjs` (post-run pipeline), with the proxy printing the wrap-up command as its own `nextAction`-style hint on exit | A single script that auto-triggers a potentially multi-minute cold-Agda-spawning pipeline the instant an interactive MCP session closes has surprising latency/blocking behavior for the agent's process supervisor; splitting keeps each script small, keeps "on-demand, not a daemon" honest, and mirrors this repo's existing script-per-concern convention (`promote-capture.mjs` / `run-oracle.mjs` / `intake.mjs` are already three separate scripts, not one) |

**Installation:**

No install step — every dependency above is already present in `package.json`/`package-lock.json`. Do not add a `dependencies`/`devDependencies` entry for this phase.

**Version verification:** Confirmed directly by reading `/Users/eric/projects6/agda-mcp-server/package.json` (a local, authoritative source — stronger than a registry query for "is this already installed"). No `npm view` calls were necessary because no new package is being recommended.

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new external packages.** Every tool named above (`tsx`, `zod`, `@modelcontextprotocol/sdk`, `vitest`, `git`, `gh`) is either a Node builtin, an already-installed `package.json` dependency, or a system CLI this repo's workflows already assume. The Package Legitimacy Gate protocol (slopcheck, registry verification, postinstall-script scan) is scoped to "whenever this phase installs external packages" — it does not here, so no packages are flagged `[SLOP]`/`[SUS]`/`[ASSUMED]` and no `checkpoint:human-verify` gate is needed on this account.

## Architecture Patterns

### System Architecture Diagram

```text
 Maintainer / driver prompt (Codex or Claude Code, interactive)
        │
        │ 1. codex mcp add / claude mcp add --transport stdio
        │    points the agent's MCP client at scripts/dogfood-run.mjs
        ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ scripts/dogfood-run.mjs  (NEW — the recording proxy)          │
 │                                                                 │
 │  pre-flight: load + zod-validate --manifest <task-manifest>   │
 │              (PROC-01 hard gate — refuses to start if absent/  │
 │              empty; see Pattern 2)                             │
 │                                                                 │
 │  spawn child: node dist/index.js                               │
 │     env: AGDA_MCP_ROOT=<target corpus>, AGDA_MCP_CAPTURE=1     │
 │                                                                 │
 │   agent stdin  ─────line-buffered tee───────▶ child stdin      │
 │   agent stdout ◀────line-buffered tee──────── child stdout     │
 │   child stderr ─────passthrough + logged─────▶ agent stderr    │
 │                                                                 │
 │  each JSON-RPC line is JSON.parse'd (never re-serialized       │
 │  differently — byte-identical forwarding) to:                  │
 │    - append to the unbounded on-disk transcript                │
 │    - detect tools/call requests/responses for the run report   │
 │    - detect agda_capture_session responses → note stagedPath   │
 │                                                                 │
 │  on child exit / parent stdin EOF:                             │
 │    - flush transcript + run report to .agda-mcp/runs/<id>/     │
 │    - auto-persist: dedup-index-bump each staged capture seen   │
 │      (the "auto-persists captures" of success criterion 3)     │
 │    - print: "N captures staged — run:                          │
 │              node scripts/dogfood-wrapup.mjs <run-id>"         │
 └───────────────────────────────────────────────────────────────┘
        │ spawns (single AgdaSession, #39 — the ONLY session-holding
        │ process in this whole diagram)
        ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ dist/index.js  (EXISTING — unmodified — the real MCP server)  │
 │  registerCoreTools() ... agda_capture_session (Phase 1)        │
 │  stages CaptureArtifact under <target corpus>/.agda-mcp/       │
 │  captures/  (per-target, not per-this-repo)                    │
 └───────────────────────────────────────────────────────────────┘

 ── separate, later, on-demand invocation ──────────────────────

 ┌───────────────────────────────────────────────────────────────┐
 │ scripts/dogfood-wrapup.mjs  (NEW — the post-run pipeline)      │
 │  input: a run-id / run-report path from the step above         │
 │                                                                 │
 │  for each staged capture referenced by the run:                │
 │   1. runOracle(artifactPath)      [EXISTING, Phase 2]          │
 │   2. IF orcl01 touched a real cold spawn (kind pass/           │
 │      server-false-green-candidate): re-run the WARM side N     │
 │      times via createMcpHarness  [Pattern 3]                   │
 │        all N agree            → "deterministic"                │
 │        any disagree           → "flaky" (tag timing/           │
 │                                   nondeterministic, do NOT file │
 │                                   as a defect)                  │
 │   3. IF deterministic AND verdict.trueGreen === false:         │
 │      upsertQueueEntry(..., status: "new")  [EXISTING, Phase 4] │
 │                                                                 │
 │  auto-chained in code end to end (D-04) — no per-step model    │
 │  round-trip, no human confirmation before filing as `new`      │
 │  (Phase 4 already placed the human gate at new→triaged)         │
 └───────────────────────────────────────────────────────────────┘
```

A reader can trace the primary use case (an agent proves a theorem against agda-unimath, the server false-greens, and the defect ends up filed) by following the arrows top to bottom: driver prompt → proxy pre-flight gate → child server → (agent calls `agda_capture_session` mid-session, per the Skill) → proxy notices + persists the reference at session end → maintainer runs the wrap-up → oracle judges → N-rerun classifies → queue receives a `new` entry.

### Recommended Project Structure

```
scripts/
├── dogfood-run.mjs              # NEW — the recording proxy (this phase's centerpiece)
├── dogfood-wrapup.mjs           # NEW — oracle → N-rerun classify → queue-file pipeline
├── dogfood/                     # NEW sibling-module dir (keep dogfood-run.mjs itself small)
│   ├── task-manifest.mjs        #   load + zod-validate the task manifest; the hard gate
│   ├── transcript-writer.mjs    #   line framing, JSON-RPC line tee, run-report shape
│   └── flake-classify.mjs       #   the N-times warm-replay comparison (Pattern 3)
├── data/
│   ├── oracle-policy/           # EXISTING (Phase 2) — extend, do not replace
│   │   ├── agda-unimath.json    #   EXISTING interim file
│   │   ├── agda-stdlib.json     #   NEW — likely near-empty (no HoTT axioms to whitelist)
│   │   ├── codex-homotopy-group.json   # NEW
│   │   └── autoformalizing-hopf.json   # NEW
│   └── fuel-corpora.json        # NEW — PROC-02's pinned-commit + corpus→policy-key manifest
├── oracle/                      # EXISTING (Phase 2), consumed not modified
└── queue/                       # EXISTING (Phase 4), consumed not modified

test/fixtures/
├── fuel-corpora.ts              # NEW — typed loader (loadValidatedJsonData idiom)
└── task-manifest-schema.ts      # NEW — the zod schema shared by dogfood-run.mjs and any
                                  #       future validation/tests (schema, not data — no
                                  #       committed real task-manifest instance, since a
                                  #       task manifest is per-run, per-target, and often
                                  #       references a private corpus)

.agents/skills/
└── agda-dogfooding/
    └── SKILL.md                 # NEW — canonical, TRACKED, discovered natively by Codex CLI

.claude/skills/
└── agda-dogfooding -> ../../.agents/skills/agda-dogfooding   # NEW — symlink, created by an
                                                                # install script, gitignored
                                                                # (matches existing .gitignore)

scripts/install-dogfood-skill.mjs   # NEW — tiny, idempotent symlink-creation script

.agda-mcp/runs/<run-id>/           # gitignored (D-05) — proxy output lands here
├── transcript.jsonl
├── run-report.json
└── run-report.md                 # human-readable summary, per the Phase-4 dashboard precedent
```

### Pattern 1: Transparent line-buffered recording proxy (no second MCP protocol stack)

**What:** `dogfood-run.mjs` spawns the child server the exact same way `test/helpers/mcp-harness.ts`'s `buildHarnessServerParameters()` already does (`process.execPath`, `[resolve(serverRepoRoot, "dist/index.js")]`, merged env, `stderr: "pipe"`), then wires up bidirectional byte streams with `node:readline`-style line buffering on both `process.stdin`/child `stdout` and child `stdin`/`process.stdout`. Because MCP's stdio transport is newline-delimited JSON-RPC 2.0 with **no embedded newlines permitted inside a message** (messages are serialized so any internal `\n` is escaped to `\n` — confirmed against the official MCP spec, see Sources), a proxy can safely split on `\n` and treat each complete line as exactly one JSON-RPC message, without needing to understand MCP's higher-level semantics (`initialize`, capability negotiation, etc.) at all. Each parsed line is written to the transcript file **and then re-serialized and forwarded unchanged** (or, more simply, the original raw line bytes are forwarded as-is and only a `JSON.parse`'d *copy* is used for transcript/logging purposes — this avoids any risk of the proxy accidentally normalizing a field the agent or server round-trips literal-for-literal).

**When to use:** Any time the goal is "observe every message on a stdio JSON-RPC channel without becoming a protocol participant." This is the same shape this codebase already uses for the cold-Agda IOTCM channel (`scripts/oracle/cold-agda-session.mjs`'s `sendCommand` loop: buffer chunks, split on `\n`, `JSON.parse` each complete line with a raw fallback) — reuse that exact idiom's *shape* (not its code, since that module is Agda-IOTCM-specific, not MCP-JSON-RPC-specific).

**Example (illustrative sketch, not a verbatim existing file):**
```javascript
// Source: pattern derived from test/helpers/mcp-harness.ts's spawn
// parameters + the NDJSON line-buffering idiom already used in
// scripts/oracle/cold-agda-session.mjs (this repo, verified by direct read)
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn(process.execPath, [distIndexPath], {
  cwd: serverRepoRoot,
  env: { ...process.env, AGDA_MCP_ROOT: targetCorpusRoot, AGDA_MCP_CAPTURE: "1" },
  stdio: ["pipe", "pipe", "pipe"],
});

// agent -> child (requests, including tools/call)
createInterface({ input: process.stdin }).on("line", (line) => {
  appendToTranscript({ direction: "to-server", line, ts: Date.now() });
  child.stdin.write(line + "\n");
});

// child -> agent (responses, notifications)
createInterface({ input: child.stdout }).on("line", (line) => {
  appendToTranscript({ direction: "to-client", line, ts: Date.now() });
  maybeNoteCaptureReference(line); // watches for agda_capture_session results
  process.stdout.write(line + "\n");
});

child.stderr.pipe(process.stderr);
```

### Pattern 2: Mechanical pre-flight hard gate (PROC-01's "up front" wording)

**What:** Before `dogfood-run.mjs` spawns the child at all, it requires a `--manifest <path>` CLI argument, reads + zod-validates it against a schema requiring a non-empty array of `{ target: string, expectedSignature: string, corpus: string }` entries, and **refuses to start** (non-zero exit, clear stderr message naming exactly what's missing) if the flag is absent, the file doesn't parse, or the array is empty. This is the mechanical enforcement CONTEXT.md's D-03 requires — the runbook/Skill's prose telling an agent to supply `expectedSignature` is necessary but, per CHG's own multi-week zero-capture campaign, empirically insufficient on its own.

**When to use:** Any workflow where a downstream predicate (here, ORCL-03) is vacuous without an up-front artifact, and prose instructions have already been shown not to reliably produce that artifact.

**Example (schema sketch):**
```typescript
// Source: pattern matches test/fixtures/fix-queue.ts's zod + loadValidatedJsonData idiom
import { z } from "zod";

export const taskManifestEntrySchema = z.object({
  target: z.string().min(1), // e.g. "π₃(S²) ≃ ℤ homotopy-group computation"
  // Same "name : Type" convention agda_capture_session's own
  // expectedSignature field and scripts/oracle/orcl-03-conformance.mjs's
  // parseExpectedSignature already use (first TOP-LEVEL colon split) —
  // reuse that convention verbatim so the manifest's field feeds
  // directly into the capture verb's input without reformatting.
  expectedSignature: z.string().min(1),
  corpus: z.string().min(1), // fuel-pointer manifest key (Pattern 4)
  notes: z.string().optional(),
});

export const taskManifestSchema = z.array(taskManifestEntrySchema).min(1);
```

### Pattern 3: Two-stage capture classification (warm-replay stability, then cold-vs-warm agreement)

**What:** Two genuinely different questions get conflated by the phrase "re-run N times": (a) *is the server's own answer to this exact recorded call stable across repeated fresh warm sessions* (tests the idle-timer/completion-heuristic nondeterminism Pitfall 3 and issues #65/#66 describe), and (b) *does the server's answer agree with a cold, from-scratch `agda` compile* (already ORCL-01's job, and already a single deterministic-by-construction comparison — cold agda has no idle-timer heuristic of its own to be flaky about). This research recommends implementing (a) as the actual "N-rerun" step, because: it is what Pitfall 3's own prose describes ("re-run the **capture** N times... classify: deterministic (same envelope every time)"); `test/helpers/mcp-harness.ts` and `createMcpHarness` are the tool CONTEXT.md explicitly names as "the vehicle for... the post-run replay / N-rerun flake classification"; and `scripts/oracle/orcl-01-differential.mjs`'s own `materializeCaptureEnvironment(artifact)` function (which already reconstructs a fresh temp dir from a raw `CaptureArtifact`'s `inlinedFirstPartySources`/`agdaDirContents` — see that file, lines 85-131) is exactly the missing piece needed to point a fresh `createMcpHarness` at a faithfully-materialized copy of the captured environment, without needing to invent a second materializer.

**When to use:** Any time a captured "defect" might actually be a heuristic-timing artifact of the thing being tested, and there is already a working cold-vs-warm comparator (ORCL-01) whose SINGLE result should not itself be mistaken for a stability check.

**Example (composition sketch — every imported function is a REAL, already-existing export, verified by direct file read):**
```javascript
// Source: composes materializeCaptureEnvironment (scripts/oracle/
// orcl-01-differential.mjs, verified export) with createMcpHarness
// (test/helpers/mcp-harness.ts, verified export) — a NEW combination
// neither existing module performs today.
import { materializeCaptureEnvironment, findWarmLoadTuple } from "./oracle/orcl-01-differential.mjs";
import { createMcpHarness } from "../test/helpers/mcp-harness.js"; // via tsx

async function classifyFlakiness(artifact, n = 3) {
  const warm = findWarmLoadTuple(artifact); // the same last-load-family lookup ORCL-01 uses
  if (warm === null) return { classification: "not-applicable" };

  const observedClassifications = [];
  for (let i = 0; i < n; i++) {
    const materialized = await materializeCaptureEnvironment(artifact);
    const harness = await createMcpHarness({
      serverRepoRoot: SERVER_REPO_ROOT,
      projectRoot: materialized.tmpDir,
    });
    try {
      const result = await harness.callTool("agda_load", { file: warm.file });
      observedClassifications.push(result?.structuredContent?.data?.classification);
    } finally {
      await harness.close();
      materialized.cleanup();
    }
  }

  const allAgree = observedClassifications.every((c) => c === observedClassifications[0]);
  return { classification: allAgree ? "deterministic" : "flaky", observedClassifications };
}
```
Default `n = 3` is a reasonable starting point (matches Pitfall 3's own suggested "3-5") but is explicitly Claude's Discretion per CONTEXT.md — expose it as an env var / CLI flag (e.g. `AGDA_MCP_DOGFOOD_RERUN_N`) rather than a hardcoded literal, consistent with this repo's existing env-knob conventions (`AGDA_MCP_IDLE_COMPLETION_MS` etc.).

### Pattern 4: Fuel-pointer manifest that extends, not replaces, the existing policy loader

**What:** `scripts/oracle/orcl-02-soundness-scan.mjs` already has a working, security-reviewed loader — `loadOraclePolicy(projectKey)` — that reads `scripts/data/oracle-policy/${projectKey}.json` (path-sandboxed against traversal, degrades to `null`/`no-policy` on any malformed input). PROC-02 should NOT change that function's contract. Instead, add sibling policy files for the other three corpora, and add ONE new top-level manifest, `scripts/data/fuel-corpora.json`, that cross-references a corpus's pinned commit/access-level with its existing `oracle-policy` key.

**Example:**
```json
{
  "$comment": "PROC-02 pinned fuel-pointer set. Each entry's policyKey resolves via scripts/oracle/orcl-02-soundness-scan.mjs's EXISTING loadOraclePolicy(), unchanged.",
  "corpora": [
    {
      "key": "agda-stdlib",
      "repo": "agda/agda-stdlib",
      "access": "public",
      "pinnedRef": "REPLACE-WITH-A-REAL-TAG-OR-COMMIT-AT-IMPLEMENTATION-TIME",
      "policyKey": "agda-stdlib",
      "notes": "CI already pins agda-stdlib-version 2.1.1 via wenkokke/setup-agda@v2 (.github/workflows/ci.yml) - align or note divergence."
    },
    {
      "key": "agda-unimath",
      "repo": "UniMath/agda-unimath",
      "access": "public",
      "pinnedRef": "REPLACE-WITH-A-REAL-COMMIT-AT-IMPLEMENTATION-TIME",
      "policyKey": "agda-unimath",
      "notes": "Existing interim policy: sanctionedAxioms=[univalence,function-extensionality,replacement]; requiredFlags include --without-K. Library currently targets Agda 2.8.0 per its own docs."
    },
    {
      "key": "codex-homotopy-group",
      "repo": "emilyriehl/Codex-Homotopy-Group",
      "access": "private",
      "pinnedRef": "REPLACE-WITH-A-REAL-COMMIT-AT-IMPLEMENTATION-TIME",
      "policyKey": "codex-homotopy-group",
      "notes": "Directly dogfoods this server; first official dogfood run targets this corpus (D-02). Re-clone via: gh repo clone emilyriehl/Codex-Homotopy-Group"
    },
    {
      "key": "autoformalizing-hopf",
      "repo": "emilyriehl/autoformalizing-hopf",
      "access": "private",
      "pinnedRef": "REPLACE-WITH-A-REAL-COMMIT-AT-IMPLEMENTATION-TIME",
      "policyKey": "autoformalizing-hopf",
      "notes": "The Hopf/pi-3(S^2) motivating experiment; also built on agda-unimath."
    }
  ]
}
```
No commit SHAs are fabricated above — see Assumptions Log A1. Pin actual refs via `git ls-remote <repo> <ref>` (public corpora) or `gh repo clone` + `git rev-parse HEAD` (private corpora) at implementation time, not from training data.

### Anti-Patterns to Avoid

- **A second `AgdaSession` inside the proxy.** The proxy must never construct or import `AgdaSession` — it is a pure transport relay. The ONLY Agda-session-holding process in the whole system is the child `dist/index.js`. (Reconfirms `.gitignore`d `.claude/CLAUDE.md`'s own invariant and issue #39.)
- **Re-implementing MCP protocol semantics in the proxy.** Building a second `Server`+`Client` pair (SDK-level) to relay tool calls is unnecessary machinery for a "pass through transparently" requirement and doubles the SDK-version coupling surface for no observed benefit.
- **Publishing the proxy via `npx -y agda-mcp-server@<ver>`.** `package.json`'s `files` field is `["dist", "README.md", "LICENSE", "schemas"]` — `scripts/` is **not** included in the published npm tarball. CHG's existing launch line (`npx -y agda-mcp-server@<ver>`) works for the bare server but **cannot** work for `dogfood-run.mjs`; the runbook must instruct users to run the proxy from a local clone of this repo (absolute path), not via `npx`. See Common Pitfalls.
- **Treating `.codex/skills/` as Codex CLI's current project-skill discovery path.** It is not, per Codex's own current documentation (see Sources) — Codex CLI scans `.agents/skills/`. CHG's private repo happens to use `.codex/skills/`, but that does not establish it as Codex's actual auto-discovery mechanism today; do not copy that path uncritically.
- **Extending `DEFECT_KIND_WEIGHT` / `fixQueueEntrySchema`'s `status`/`defectKind` enums to add a "flaky" value without checking downstream consumers.** `scripts/queue/priority.mjs`'s `DEFECT_KIND_WEIGHT` is a frozen, exhaustively-tested ordering table; `scripts/queue/dashboard.mjs` imports `sortByPriority` from it. Adding a band silently changes queue ordering semantics established in Phase 4 — flagged as an Open Question, not decided here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spawning the built server with the right argv/env/cwd | A new ad-hoc `spawn()` call in `dogfood-run.mjs` | The exact parameter shape `test/helpers/mcp-harness.ts`'s `buildHarnessServerParameters()` already builds (`process.execPath`, `dist/index.js` resolved against `serverRepoRoot`, `AGDA_MCP_ROOT` env, `stderr: "pipe"`) | Already correct, already used by `scripts/mcp-local-client.mjs` and every MCP integration test; re-deriving it risks a subtle argv/env mismatch that makes the proxy's child behave differently than a directly-launched server |
| Materializing a `CaptureArtifact`'s inlined sources + `AGDA_DIR` into a fresh temp dir | A new materializer for the wrap-up pipeline | `materializeCaptureEnvironment(artifact)` (`scripts/oracle/orcl-01-differential.mjs`, already handles path-sandbox-safe writes via `resolveFileWithinRoot`, already replays `agdaDirContents` byte-for-byte) | This exact function is designed to take a raw `CaptureArtifact` (not a curated `CaptureRegressionEntry`) and already has a security review behind its path handling; a second materializer is duplicated, unreviewed surface |
| Composing the three oracle predicates + writing a verdict sidecar | A new "mini-oracle" inside the wrap-up script | `runOracle(artifactPath, options)` (`scripts/oracle/run-oracle.mjs`, already writes the `.verdict.json` sidecar and appends to `oracle-metrics.jsonl`) | The verdict composition rule ("`trueGreen` only when ORCL-01=pass AND ORCL-02=clean") is a subtle, already-tested invariant (`scripts/oracle/verdict-schema.mjs`'s `composeVerdict`) — re-deriving it risks silently drifting from Phase 2's contract |
| Filing a defect into the fix queue | Direct `writeFileSync` on `test/fixtures/fix-queue.json` | `upsertQueueEntry(entryData, queueJsonPath, options)` (`scripts/queue/intake.mjs`, already handles the D-06 graveyard guard — dedup-bump instead of duplicate rows — and zod-validates before writing) | Bypassing this risks re-introducing exactly the write-only-graveyard failure mode Phase 4 was built to prevent (PITFALLS.md Pitfall 6) |
| Reading a per-corpus soundness policy (whitelist + flags) | A new loader/schema for the fuel-pointer manifest's embedded policy | `loadOraclePolicy(projectKey)` (`scripts/oracle/orcl-02-soundness-scan.mjs`) unchanged, fed by NEW sibling data files under the SAME `scripts/data/oracle-policy/` directory | This loader already has a documented CR-01 path-traversal fix (bare-filename-only `projectKey` validation) — reproducing that hardening in a second reader is unnecessary risk for zero benefit |
| Detecting whether a stdio JSON-RPC line is a request/response/notification | Hand-rolled ad-hoc string sniffing | Standard JSON-RPC 2.0 shape checks (`"method" in msg` = request/notification, `"id" in msg && !("method" in msg)` = response) — this is public protocol structure, not something to reverse-engineer per-project | MCP is JSON-RPC 2.0 verbatim at the transport layer (confirmed via the official spec) — the request/response/notification distinction is a stable, documented invariant, not server-specific behavior worth guessing at |

**Key insight:** every "hard part" of this phase already has a tested implementation sitting in `scripts/oracle/` or `scripts/queue/` or `test/helpers/`. The actual net-new code this phase should ship is deliberately thin: a transport tee, a pre-flight validator, a small composition script, and data files. If a plan for this phase proposes non-trivial new logic anywhere other than "detect a capture reference in a transcript line" or "compare N warm replay outcomes," that is a signal the plan is re-deriving something Phases 1–4 already built.

## Common Pitfalls

### Pitfall 1: Skill packaging silently fails to ship (the `.gitignore` conflict)

**What goes wrong:** A plan puts the dogfooding runbook at `.claude/skills/agda-dogfooding/SKILL.md` (matching the CHG template CONTEXT.md names) or `.codex/skills/...`. Both paths are wholesale-excluded by this repo's own `.gitignore` (`.claude/` and `.codex/` are both listed, confirmed by direct read). The file exists locally, works for whoever authored it, and then silently isn't there for anyone who clones the repo fresh — exactly the "reproducible across time" property PROC-01 exists to guarantee, defeated by a gitignore line nobody thought to check against a brand-new file path.

**Why it happens:** `.claude/` and `.codex/` are gitignored for a good, unrelated reason (local agent session state/credentials shouldn't be committed) — but that blanket exclusion also catches any legitimate, intentionally-tracked content someone later tries to put in a subdirectory of either.

**How to avoid:** Track the canonical `SKILL.md` at `.agents/skills/agda-dogfooding/SKILL.md` instead (confirmed NOT excluded by this repo's `.gitignore`, and confirmed to be Codex CLI's actual current project-skill discovery path per its official docs). Add a tiny, idempotent install script (`scripts/install-dogfood-skill.mjs`) that creates a symlink at `.claude/skills/agda-dogfooding` pointing at `../../.agents/skills/agda-dogfooding`, run once per clone (documented as runbook step 0). This keeps a single source of truth while satisfying both agents' actual discovery mechanisms.

**Warning signs:** `git status` doesn't show the new `SKILL.md` as untracked after `git add .claude` (because the parent dir itself is ignored, not just the file); a fresh clone "loses" the skill; `git check-ignore -v .claude/skills/agda-dogfooding/SKILL.md` (a good verification command for the plan's own acceptance check) reports a match against the `.gitignore` line.

**Phase to address:** This phase (PROC-01) — verify at plan-check time with `git check-ignore -v <chosen path>` before committing to a final skill location.

### Pitfall 2: The published npm package does not contain `scripts/`

**What goes wrong:** The runbook tells a user to launch the proxy the same way CHG's `MCP-SETUP.md` launches the bare server today: `codex mcp add agda --env AGDA_MCP_ROOT=… -- npx -y agda-mcp-server@<ver>`. This works for the server binary (which the npm package does ship, via its `bin` field) but **cannot** work for `scripts/dogfood-run.mjs`, because `package.json`'s `files` array (`["dist", "README.md", "LICENSE", "schemas"]`) does not include `scripts/`. A user who only ever `npm install -g agda-mcp-server` (never clones the repo) has no `dogfood-run.mjs` to point at.

**Why it happens:** The server and the dogfooding tooling have different distribution models — one is a published package, the other is dev/maintainer tooling that assumes a git checkout (consistent with every other script in `scripts/oracle/`, `scripts/queue/`, all of which already assume `SERVER_REPO_ROOT`-relative imports from a real checkout, not an installed package).

**How to avoid:** The runbook's launch line must reference an absolute (or `git`-checkout-relative) path into a cloned `agda-mcp-server` repo, e.g. `codex mcp add agda-dogfood --env AGDA_MCP_ROOT=<target-corpus-path> --env AGDA_MCP_CAPTURE=1 -- node /path/to/agda-mcp-server/scripts/dogfood-run.mjs --manifest /path/to/task-manifest.json`, and must state the prerequisite: `npm run build` has been run in that checkout (since the proxy spawns `dist/index.js`, exactly like `mcp-harness.ts` does).

**Warning signs:** A runbook example that pastes CHG's `npx -y agda-mcp-server@<ver>` line unmodified for the *proxy* invocation (it is fine, unmodified, for anyone who wants the bare server without dogfooding instrumentation — that distinction must be explicit in the doc).

**Phase to address:** This phase (PROC-01 runbook content).

### Pitfall 3: Codex's and Claude Code's skill directories are not actually shared

**What goes wrong:** A plan assumes "ship one `SKILL.md`, both tools find it" is a location-agnostic guarantee. As of the official docs fetched during this research (2026), Claude Code discovers **project** skills only from `.claude/skills/<name>/SKILL.md` (plus personal `~/.claude/skills/`); Codex CLI discovers repo skills only from `.agents/skills/` (scanned from cwd up to the repo root), not `.codex/skills/`. There is currently no single directory both tools read natively.

**Why it happens:** Both tools converged on the same **file format** (the open "Agent Skills" standard, agentskills.io) well before converging on the same **directory convention** — the ecosystem is mid-transition (this is explicitly a fast-moving space; re-verify against current docs before the plan locks in a final path, since this could change within the phase's own validity window).

**How to avoid:** Author one `SKILL.md` at `.agents/skills/agda-dogfooding/` (Codex-native, tracked) and symlink it into `.claude/skills/agda-dogfooding` (Claude-Code-native, gitignored by existing convention, recreated by the install script). Keep the `SKILL.md` frontmatter to the tool-agnostic subset (`name`, `description`) so it renders identically wherever it's discovered from.

**Warning signs:** A plan task titled "add SKILL.md to `.codex/skills/`" without a corresponding Claude Code path, or vice versa; no verification step confirming BOTH agents actually load the file in a real session.

**Phase to address:** This phase (PROC-01). Re-verify current discovery paths at plan-check/execute time if this phase's implementation lands more than ~30 days after this research (see Metadata's "Valid until").

### Pitfall 4: N-rerun scoped too broadly (or too narrowly)

**What goes wrong:** A wrap-up implementation either (a) re-runs the full oracle triad — including ORCL-02's static AST scan, which has no timing-dependent behavior at all — N times per capture (wasted compute, no signal), or (b) re-runs literally every staged capture N times regardless of whether it even has a load-family action to compare (captures of `agda_give`/`agda_auto`-family defects have no meaningful cold-vs-warm differential at all per `COMPLETENESS_CLASSIFICATIONS`/`findWarmLoadTuple`'s own `skip` logic).

**Why it happens:** "Re-run N times" reads as a blanket instruction if Pitfall 3 (PITFALLS.md) and CONTEXT.md D-04 aren't cross-referenced against ORCL-01's own existing `skip`-vs-real-comparison distinction.

**How to avoid:** Gate the N-rerun step on `findWarmLoadTuple(artifact) !== null` (a load-family action exists) — for anything else, classification is trivially `"not-applicable"`, and the capture proceeds straight to a single oracle pass. Only ORCL-01 (and, if reused, ORCL-03's shared cold session) is a candidate for timing nondeterminism; ORCL-02 never needs repeating.

**Warning signs:** A wrap-up run taking noticeably longer than `(number of load-family captures) × N × (one cold Agda spawn + one harness spawn)`; a flake classification report listing captures that have no `agda_load`/`agda_typecheck` action at all.

**Phase to address:** This phase, in `dogfood-wrapup.mjs`'s design.

### Pitfall 5: Long real-corpus compiles blow past the oracle's own timeout, masquerading as flakiness

**What goes wrong:** STATE.md's own Blockers/Concerns section already flags this: "a from-scratch unimath/Hopf recompile will often exceed `AGDA_MCP_COMMAND_TIMEOUT_MS` and abstain exactly where signal is most wanted." When Phase 5 runs the wrap-up pipeline against real fuel corpora (agda-unimath, CHG) rather than small unit-test fixtures, cold recompiles of large modules can be slow enough that ORCL-01's own (uncapped-by-default, but potentially budget-flagged) cold spawn times out, or that N repeated warm-harness replays each take long enough that "N re-runs" becomes a multi-minute-to-multi-hour operation per capture.

**Why it happens:** Real fuel corpora are large HoTT libraries with genuinely expensive typechecking, unlike this repo's own small, fast `test/fixtures/agda/*.agda` files.

**How to avoid:** Treat repeated `INCONCLUSIVE(timeout)` results as their own explicit, surfaced category in the run report (not silently retried forever, not misclassified as "flaky" in the timing/nondeterministic sense Pitfall 3 means) — this is a capacity/budget signal, distinct from idle-timer flakiness. Document, in the runbook, that a first CHG/agda-unimath run may need a larger explicit oracle budget flag (ORCL-01's `D-04`-documented optional budget override) than this repo's own default.

**Warning signs:** Every capture from a real-corpus run coming back `INCONCLUSIVE(timeout)`; the abstention-rate metric (`oracle-metrics.jsonl`, already built in Phase 2) spiking specifically on real-corpus runs vs. this repo's own fixtures.

**Phase to address:** This phase's runbook (documenting the expectation) — not a new mechanism; Phase 2 already built the `INCONCLUSIVE`/budget machinery this phase should just know to use.

### Pitfall 6: The fix-queue schema has no slot for "flaky"

**What goes wrong:** `test/fixtures/fix-queue.ts`'s `fixQueueEntrySchema` enumerates `defectKind` as exactly `["false-green", "crash", "wrong-result", "missing-feature"]` — there is no fifth value for "this was flaky, not a real defect, but still worth knowing about." A wrap-up implementation that tries to file flaky classifications into the tracked queue either (a) invents a new enum value (silently changing `scripts/queue/priority.mjs`'s frozen `DEFECT_KIND_WEIGHT` ordering contract, a cross-phase schema change outside this phase's stated scope fence) or (b) awkwardly overloads an existing `defectKind` for something it doesn't mean.

**Why it happens:** Phase 4 designed the queue schema before Phase 5's N-rerun requirement existed; "flaky, tag it, don't discard it" (PITFALLS.md Pitfall 3's own phrasing) was written with the `#58` AgdaTransport-timing GitHub-issue track in mind, not the fix queue.

**How to avoid:** Do not extend the queue schema in this phase. Route flaky classifications to a separate, lightweight, machine-local artifact instead — e.g. append to `.agda-mcp/runs/<run-id>/flaky-captures.jsonl` (gitignored, per D-05) and surface a summary count prominently in the human-readable run report. This satisfies "tag, don't discard" (the information is recorded and visible) without a schema migration this phase's scope fence doesn't authorize. Flagged explicitly as an Open Question below in case the planner judges a schema extension is actually warranted.

**Warning signs:** A plan task that touches `test/fixtures/fix-queue.ts`'s `TRIAGE_CLASSES`/`defectKind` enum or `scripts/queue/priority.mjs`'s `DEFECT_KIND_WEIGHT` table.

**Phase to address:** This phase's wrap-up design — resolve before implementation, since it's cheap to get right up front and expensive to migrate later (the existing queue already has 13 real entries per `test/fixtures/fix-queue.json`).

### Pitfall 7: Forgetting `AGDA_MCP_CAPTURE=1` on the child, and defeating the whole point of recording

**What goes wrong:** The proxy spawns the child server without setting `AGDA_MCP_CAPTURE=1` in its env. Per `src/agda/session-capture/recorded-transport.ts`'s own documented behavior, the in-server ring-buffer recorder is a zero-cost no-op unless this env var is `"1"` — a session run this way produces a capture artifact whose `recordedActions` is empty, and `agda_capture_session`'s own existing diagnostic already warns about exactly this ("No recorded actions - AGDA_MCP_CAPTURE was not enabled for this session"). Combined with the proxy's OWN separate transcript (D-06), it's easy to assume "the proxy records everything anyway" and skip setting the child's env var — but the two records serve different consumers (the in-server ring buffer feeds `CaptureArtifact.recordedActions`, which ORCL-01's `findWarmLoadTuple` reads; the proxy's own transcript is a separate forensic record).

**Why it happens:** D-06 explicitly documents that BOTH records must exist for different reasons; a plan or implementation that only builds the proxy's own transcript and forgets to also flip the env var on the child produces artifacts that "look" complete (the proxy has a transcript) but are missing exactly the field the oracle needs.

**How to avoid:** `dogfood-run.mjs` must always set `AGDA_MCP_CAPTURE=1` when spawning the child (never conditionally) — this is not optional/discretionary, it's what makes the whole downstream pipeline (ORCL-01's `findWarmLoadTuple`) work at all.

**Warning signs:** A wrap-up run reporting `orcl01Outcome.kind === "skip"` ("no load-family recorded action to diff against") for every single capture from a real dogfooding run, even ones the maintainer knows involved `agda_load` calls.

**Phase to address:** This phase — a one-line env-var default, but a silent, easy-to-miss correctness dependency.

## Code Examples

### SKILL.md skeleton (tool-agnostic frontmatter, per Pitfall 3)

```markdown
---
name: agda-dogfooding
description: Use when proving theorems against a real Agda corpus (agda-stdlib, agda-unimath, or a project built on them) through the agda-mcp-server MCP tools, to reliably capture defects instead of silently working around them.
---

# Agda dogfooding runbook

## Before you start (the hard gate)

This session's MCP server was launched through `scripts/dogfood-run.mjs`, which
REFUSED to start unless a task manifest listing this target's EXPECTED TOP-LEVEL
SIGNATURE was supplied up front. If you don't know your target's expected
signature, STOP and ask the maintainer — do not guess one after the fact.

## When to capture

Call `agda_capture_session` (not `agda_bug_report_bundle`) whenever:
- a tool result looks successful but something about it feels wrong (a green
  you don't fully trust) — capturing a suspicious "green" is EXPLICITLY
  in scope, not just failures;
- you are stuck after 2-3 attempts at the same goal;
- `agda_load`/`agda_typecheck` disagrees with what you expected given a recent
  edit to a DEPENDENCY (not just the file itself) — this is the #64/#61
  transitive-staleness shape this whole server exists to catch.

Always pass `expectedSignature` (from the task manifest) when calling
`agda_capture_session` for a proving task. Do NOT skip this because it feels
redundant — CAP-05/ORCL-03 depend on it, and it is optional-but-nagged rather
than blocked at capture time specifically so crash/failure captures aren't
prevented from being captured at all.

## What is NOT a defect: the scaffold-hole workflow

Placing a deliberate `{!!}` plus a file-level `--allow-unsolved-metas` while you
build out a proof's shape is normal, in-progress work — NOT a defect. Only
capture a hole as suspicious if you believe the proof is COMPLETE and the
server is still reporting one, or if a hole appears somewhere you did not
place one.

## Do not trust "ok" blindly (yet)

[Runbook-specific guidance goes here, informed by CHG's own retracted-once-
proven "do not trust MCP ok-complete" warning (a real per-project Skill
precedent this file's own trust language should track over time as Loop 2
runs accumulate evidence).]
```

### Wrap-up pipeline composition (`scripts/dogfood-wrapup.mjs`)

```javascript
// Source: composes runOracle (scripts/oracle/run-oracle.mjs, verified
// export) + upsertQueueEntry (scripts/queue/intake.mjs, verified export)
// + the flake classifier from Pattern 3 above.
import { runOracle } from "./oracle/run-oracle.mjs";
import { upsertQueueEntry } from "./queue/intake.mjs";
import { classifyFlakiness } from "./dogfood/flake-classify.mjs";
import { findWarmLoadTuple } from "./oracle/orcl-01-differential.mjs";

export async function wrapUpCapture(artifactPath, artifact, queueJsonPath) {
  const verdict = await runOracle(artifactPath); // writes the .verdict.json sidecar itself

  const hasLoadFamilyAction = findWarmLoadTuple(artifact) !== null;
  if (!hasLoadFamilyAction) {
    return { filed: verdict.trueGreen ? false : await fileIfDefect(verdict, artifact, queueJsonPath) };
  }

  const { classification } = await classifyFlakiness(artifact, Number(process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? 3));
  if (classification === "flaky") {
    await appendFlakyLog(artifactPath, verdict); // .agda-mcp/runs/<id>/flaky-captures.jsonl - NOT the tracked queue (Pitfall 6)
    return { filed: false, classification: "flaky" };
  }

  return { filed: await fileIfDefect(verdict, artifact, queueJsonPath), classification: "deterministic" };
}

async function fileIfDefect(verdict, artifact, queueJsonPath) {
  if (verdict.trueGreen) return false; // nothing to file - this really was correct
  await upsertQueueEntry(
    {
      fingerprint: artifact.dedup.fingerprint,
      status: "new",
      defectKind: "false-green", // ORCL-01 candidate / ORCL-02 cheat-flagged both indicate this band
      triageClass: artifact.triage?.class ?? null,
      triageConfidence: artifact.triage?.confidence ?? null,
      recurrence: artifact.dedup.recurrence,
      title: `Dogfood-surfaced: ${artifact.dedup.fingerprint}`,
      summary: verdict.orcl01?.kind === "server-false-green-candidate"
        ? "ORCL-01 server-faithfulness differential flagged a candidate false-green."
        : "ORCL-02 soundness-hygiene scan flagged a cheat.",
      affectedTool: artifact.recordedActions.at(-1)?.tool ?? "unknown",
      capturePath: artifact.stagedPath ?? null,
      verdictPath: `${artifact.stagedPath}.verdict.json`,
      matrixEntryId: null,
      createdAt: new Date().toISOString(),
      closedAt: null,
    },
    queueJsonPath,
  );
  return true;
}
```

### Install-time skill symlink (Pitfall 1)

```javascript
// scripts/install-dogfood-skill.mjs (NEW) - idempotent, safe to re-run
import { existsSync, mkdirSync, symlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { SERVER_REPO_ROOT } from "../src/repo-root.js"; // via tsx

const canonical = join(SERVER_REPO_ROOT, ".agents", "skills", "agda-dogfooding");
const claudeLink = join(SERVER_REPO_ROOT, ".claude", "skills", "agda-dogfooding");

mkdirSync(join(SERVER_REPO_ROOT, ".claude", "skills"), { recursive: true });
if (existsSync(claudeLink) || lstatSync(claudeLink, { throwIfNoEntry: false })) {
  console.log("Skill symlink already present:", claudeLink);
} else {
  symlinkSync(canonical, claudeLink, "dir");
  console.log("Linked", claudeLink, "->", canonical);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Interactive Codex/Claude Code sessions driven against the bare MCP server, unrecorded | A recording stdio proxy sits between agent and server, transparently | This phase | Turns "we hope the agent remembers to file a bug" into "every session leaves a durable transcript, regardless of whether the agent files anything" |
| Skills as tool-specific conventions (Claude's `.claude/skills/`, various ad-hoc per-project doc files) | A converging cross-tool "Agent Skills" open standard (agentskills.io) — same `SKILL.md` file format works across 26+ tools, per Claude Code's own docs | Ongoing through 2025-2026; directory-level convergence (which folder each tool scans) is NOT yet unified as of this research (see Pitfall 3) | A single authored Skill can serve both Codex and Claude Code today via the *file format*, but still needs a per-tool discovery path (symlink/install step) until (if) the ecosystem also converges on directory location |
| CHG's `loop.sh` bash `gate_verify` — a hand-rolled oracle-triad prototype, invoked manually per session | This project's `scripts/oracle/run-oracle.mjs`, already built in Phase 2 | Phase 2 of this milestone (complete) | Phase 5 does not need to re-invent oracle judgment at all — it only needs to invoke what already exists, reliably, at the right point in a run's lifecycle |

**Deprecated/outdated:**
- CHG's `.codex/skills/agda-unimath-skills/SKILL.md` as evidence of Codex's *current* discovery convention — treat it as a template for **content** (what a proof-strategy Skill should say), not as evidence for **where** Codex looks for skills today.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No real commit SHAs are asserted for any of the four fuel corpora in this document — the fuel-pointer manifest sketch uses placeholder strings deliberately. | Architecture Patterns (Pattern 4) | None if the placeholder convention is honored; HIGH if a plan or implementation copies a training-data-recalled SHA verbatim without re-verifying via `git ls-remote`/`gh repo clone` at implementation time — a stale or hallucinated commit would silently break PROC-02's entire "reproducible across time" premise |
| A2 | Codex CLI's project-skill discovery path is `.agents/skills/` (not `.codex/skills/`), and Claude Code's is `.claude/skills/` only (no `.agents/skills/` fallback) | Summary, Pattern 3/Pitfall 3 | MEDIUM — both directly fetched from official docs (`developers.openai.com/codex/skills`, `code.claude.com/docs/en/skills`) and cross-verified against a secondary aggregator (agensi.io), but this is an actively-evolving space; if either tool adds the other's directory as a fallback before this phase executes, the symlink workaround becomes unnecessary (harmless if kept) rather than wrong |
| A3 | `agda-unimath`'s canonical repo is `github.com/UniMath/agda-unimath` (not e.g. `agda-unimath/agda-unimath`) | Architecture Patterns (Pattern 4 example) | LOW-MEDIUM — verified via WebSearch cross-referencing the GitHub URL directly, the project's own docs site, and its `.agda-lib` file path; a wrong org name would break a `git clone`/fuel-pointer entry |
| A4 | `agda-unimath` currently targets/is compatible with Agda 2.8.0 | Pattern 4 example notes | LOW — MEDIUM confidence from a single WebSearch synthesis (not a direct fetch of the library's README); re-verify against the library's actual `agda-unimath.agda-lib`/README at implementation time before treating this as load-bearing for the fuel-pointer manifest's own version-compatibility note |
| A5 | The N-rerun step (success criterion 4) should be implemented as N warm-replays via `createMcpHarness` (testing server-side idle-timer stability), not N repeats of ORCL-01's cold differential | Architecture Patterns (Pattern 3), Standard Stack (Alternatives Considered) | MEDIUM-HIGH risk if wrong: this is the anti-phantom gate (success criterion 4) and the two readings produce materially different code. This research's recommendation is well-supported by PITFALLS.md's exact wording and CONTEXT.md's own callout of `mcp-harness.ts`, but it is still a novel synthesis (no existing code implements either reading yet) — flagged again as Open Question 1 below for explicit plan-phase sign-off, not silently assumed |
| A6 | Flaky classifications should be routed to a gitignored side-channel (`.agda-mcp/runs/.../flaky-captures.jsonl`) rather than into the tracked fix-queue schema | Common Pitfalls (Pitfall 6), Code Examples | LOW-MEDIUM — grounded directly in the existing, read `fixQueueEntrySchema`'s enum (verified: no "flaky" value exists) and Pitfall 3's "route to the transport/terminus track (#58), not the general fix queue" wording, but the planner may reasonably choose to extend the schema instead; presented as a recommendation with an explicit alternative, not asserted as the only valid design |
| A7 | `dogfood-run.mjs` and `dogfood-wrapup.mjs` should be two separate scripts rather than one script that auto-chains the wrap-up at child-process exit | Standard Stack (Alternatives Considered), Architecture Patterns (system diagram) | LOW — a design recommendation grounded in "on-demand, not a daemon" (scope fence) and this repo's existing one-script-per-concern convention, but Claude's Discretion explicitly leaves "Proxy CLI shape" open, so a planner combining them is not contradicting any locked decision |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Does "re-run N times" (success criterion 4) mean re-running the recorded action against fresh warm sessions, or re-running ORCL-01's cold differential, or both?**
   - What we know: Pitfall 3's prose ("re-run the capture N times... classify: deterministic (same envelope every time)") and CONTEXT.md's explicit naming of `test/helpers/mcp-harness.ts` as the N-rerun vehicle both point toward warm-replay. ORCL-01 itself is a single, already-existing cold-vs-warm comparison, not naturally a thing you'd "re-run" for its own sake (cold agda has no timing heuristic to be unstable about).
   - What's unclear: whether the plan should ALSO re-run ORCL-01's cold side N times as a belt-and-suspenders check (cheap insurance, since a from-scratch `agda --interaction-json` invocation could in principle also have its own environment-level flakiness, e.g. filesystem cache state) — this research recommends starting with warm-replay-only (Pattern 3) as the primary signal and treating cold-side repetition as a nice-to-have, not required for success criterion 4.
   - Recommendation: plan-phase should make this an explicit, named design decision (not left implicit in a "we'll figure it out during implementation" way), since it is genuinely the mechanism behind this phase's flagship anti-phantom guarantee.

2. **Where do flaky-classified captures live, if not the tracked fix queue?**
   - What we know: the existing `fixQueueEntrySchema`'s `defectKind` enum has no slot for "flaky"; `scripts/queue/priority.mjs`'s ordering table is frozen and load-bearing for Phase 4's already-shipped dashboard.
   - What's unclear: whether the maintainer would actually prefer a schema extension (a genuinely valid alternative — it's a values call, not a correctness constraint) over a side-channel file.
   - Recommendation: default to the side-channel (`.agda-mcp/runs/.../flaky-captures.jsonl`, Pitfall 6) unless the planner has a specific reason to extend the tracked schema; either way, decide explicitly rather than defaulting by omission.

3. **Should `dogfood-run.mjs` auto-invoke `dogfood-wrapup.mjs` at child-process exit, or must the maintainer always run it as a separate command?**
   - What we know: CONTEXT.md's scope fence says "on-demand, not a daemon"; D-04 says the wrap-up pipeline itself is "auto-chained in code" (meaning: once invoked, its internal steps run without per-step human confirmation) — but this doesn't settle whether the TRIGGER for starting the wrap-up is automatic-on-exit or a separate manual command.
   - What's unclear: whether auto-triggering on exit would create surprising latency (a real corpus's cold recompiles are slow, per Pitfall 5) for whatever process is waiting on the proxy to exit (the agent's own MCP client teardown).
   - Recommendation: default to two separate commands (this research's Pattern in the Alternatives Considered table), with the proxy printing the exact next command to run as its own exit message — cheap to implement, avoids the latency surprise, and is trivially upgradable to auto-chaining later if real usage shows the manual step is friction (consistent with PITFALLS.md Pitfall 7's "don't automate before the manual step has a documented rubric").

4. **What exactly does "the maintainer's own math project" (PROC-02, REQUIREMENTS.md wording) resolve to, concretely?**
   - What we know: CONTEXT.md's D-02 resolves this to the two named private repos (`emilyriehl/Codex-Homotopy-Group`, `emilyriehl/autoformalizing-hopf`), both already access-gated and both already inventoried in `FUEL-CORPORA.md`.
   - What's unclear: nothing operationally — this is already answered by CONTEXT.md D-02 and does not need further plan-phase resolution. Listed here only to make explicit that this research did not find a THIRD, undocumented "maintainer's math project" corpus to add.
   - Recommendation: no action needed; the fuel-pointer manifest sketch (Pattern 4) already reflects the D-02-resolved set of exactly four corpora.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running any script in this phase | Partial | v22.22.0 active in this shell; repo declares `>=24` (`.nvmrc`, `engines`, `engine-strict=true` in `.npmrc`) | Switch to Node 24 via nvm/fnm before running `npm ci`/`npm install` (engine-strict will hard-fail those specifically under v22); ad hoc `node`/`tsx` script execution was observed to still run under v22 in this environment, but is out of contract — do not rely on that |
| `agda` binary | The child server's actual Agda interaction; ORCL-01/03's cold spawns | Yes | 2.8.0 (`agda --version`, confirmed locally) — within this project's supported range (min 2.6.4.3, maxTested 2.9.0) and matches agda-unimath's own current target version (A4) | — |
| `tsx` | Any new script importing `src/`/`test/helpers/` `.ts` siblings via `.js` specifiers | Yes | 4.22.4 (resolvable via `npx`) | — |
| `npm` | Build (`npm run build`), which the proxy's child (`dist/index.js`) depends on existing | Yes | 11.11.1 | — |
| `git` | Cloning/pinning the two public fuel corpora | Yes | 2.49.0 | — |
| `gh` (GitHub CLI) | Cloning the two private/access-gated fuel corpora | Yes | 2.86.0 | Already the established mechanism per `FUEL-CORPORA.md`; not newly introduced by this phase |
| Network access to `github.com` | Cloning any of the four fuel corpora at their pinned ref | Not probed (sandboxed research session) | — | The runbook should note that pinning/cloning corpora is a one-time, maintainer-driven setup step, not something the proxy itself does per-run |

**Missing dependencies with no fallback:** None identified — every external tool this phase needs is already present in this environment.

**Missing dependencies with fallback:** Node version mismatch (v22 active vs. `>=24` declared) has a known, cheap fallback (switch active Node version before any `npm install`/`npm ci`); does not block ad hoc script execution observed in this session, but should not be relied upon as a supported configuration.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` `^4.1.2` (existing, `vitest.config.ts`) |
| Config file | `/Users/eric/projects6/agda-mcp-server/vitest.config.ts` |
| Quick run command | `npx vitest run test/unit/dogfood/` (new dir, mirrors `test/unit/agda/session-capture/` placement convention) |
| Full suite command | `npm test` (unit+property+integration, Agda-free by default); `RUN_AGDA_INTEGRATION=1 npm run test:all` for anything that spawns real Agda |

This phase's hardest-to-test property — "the orchestrator correctly handles a multi-week, multi-hundred-call real dogfooding session against agda-unimath" — is explicitly **not** reproducible in CI or in a fast local suite, and should not be attempted. Instead, test the mechanism in isolation against this repo's own tiny, already-existing fixtures (`test/fixtures/agda/*.agda`), gating anything that needs real Agda behind the existing `RUN_AGDA_INTEGRATION=1` convention, exactly as Phase 1-4's own tests already do.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROC-01 | Proxy forwards a `tools/list` and `tools/call` request/response pair byte-identically end to end | integration (spawns the built child, but NOT real Agda — `agda_tools_catalog` needs no Agda process) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/dogfood/proxy-passthrough.test.ts` | ❌ Wave 0 |
| PROC-01 | Proxy refuses to start without `--manifest`, or with an empty-array manifest | unit (no subprocess at all — pure argument/schema validation) | `npx vitest run test/unit/dogfood/task-manifest.test.ts` | ❌ Wave 0 |
| PROC-01 | Proxy sets `AGDA_MCP_CAPTURE=1` on the spawned child unconditionally | unit (assert on the constructed spawn options, dependency-injected `spawn`, mirroring `run-oracle.mjs`'s own `spawnColdAgdaSession` DI seam) | `npx vitest run test/unit/dogfood/dogfood-run-spawn-options.test.ts` | ❌ Wave 0 |
| PROC-01 | Proxy's transcript + run report are written to `.agda-mcp/runs/<id>/` and reference every `agda_capture_session` result seen | integration (small fixture: load a tiny fixture, call `agda_capture_session`, end the session, inspect the written report) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/dogfood/run-report.test.ts` | ❌ Wave 0 |
| Success criterion 4 (N-rerun) | A deterministic capture (same fixture, same result every time) classifies `"deterministic"`; an artificially-injected-flaky capture (dependency-injected harness that alternates its return value) classifies `"flaky"` | unit (dependency-inject `createMcpHarness`/`materializeCaptureEnvironment`, mirroring `run-oracle.mjs`'s own `options.deps` seam — no real Agda spawn needed to test the CLASSIFICATION LOGIC itself) | `npx vitest run test/unit/dogfood/flake-classify.test.ts` | ❌ Wave 0 |
| Success criterion 4 (N-rerun) | A real, small #64/#61-shaped fixture (already exists from Phase 3/3.1's own flagship regression) N-reruns as deterministic end to end | integration, real Agda | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/dogfood/flake-classify-live.test.ts` | ❌ Wave 0 — but the underlying FIXTURE already exists (Phase 3.1's flagship capture-regression-matrix entry `issue-64-61-transitive-staleness`) |
| Success criterion 3 (auto-persist) | Wrap-up files a true-non-green capture into the queue as `new`, and does NOT file a true-green one | unit (dependency-inject `runOracle`'s composed verdict, assert on `upsertQueueEntry`'s call args against a throwaway temp queue file, never the real tracked `test/fixtures/fix-queue.json`) | `npx vitest run test/unit/dogfood/wrapup-filing.test.ts` | ❌ Wave 0 |
| PROC-02 | `scripts/data/fuel-corpora.json` validates against its zod schema and every `policyKey` resolves via the EXISTING `loadOraclePolicy()` | unit | `npx vitest run test/unit/fixtures/fuel-corpora.test.ts` (mirrors `test/unit/fixtures/capture-regression-matrix.test.ts`'s existing pattern) | ❌ Wave 0 |
| PROC-01 (Skill packaging) | `.agents/skills/agda-dogfooding/SKILL.md` is NOT gitignored; `.claude/skills/agda-dogfooding` resolves (post-install-script) to the same content | unit/script-check (`git check-ignore -v`, `readlink`) | A small assertion script, or a `test.skip`-gated manual checklist item if a filesystem-symlink test proves awkward in CI | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the relevant `npx vitest run test/unit/dogfood/...` file(s) for the task just completed (fast, no Agda).
- **Per wave merge:** `npx vitest run test/unit/dogfood/ test/unit/fixtures/fuel-corpora.test.ts` (all new unit coverage) plus, where a wave touched the proxy/wrap-up integration paths, `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/dogfood/`.
- **Phase gate:** Full suite green (`npm test`, plus `RUN_AGDA_INTEGRATION=1 npm run test:all` at least once) before `/gsd:verify-work`. A live, real-fuel-corpus dogfooding run is explicitly OUT of scope for the automated gate — it is a manual, maintainer-driven validation step (the actual "first CHG dogfood run" CONTEXT.md's Specific Ideas section names), not something CI or `/gsd:verify-work` should attempt to reproduce.

### Wave 0 Gaps

- [ ] `test/unit/dogfood/` — new directory, no existing coverage (this whole phase is greenfield)
- [ ] `test/unit/dogfood/task-manifest.test.ts` — covers PROC-01's hard gate
- [ ] `test/unit/dogfood/flake-classify.test.ts` — covers success criterion 4 (with dependency-injected fakes, no real Agda)
- [ ] `test/unit/dogfood/wrapup-filing.test.ts` — covers success criterion 3's auto-persist / queue-filing logic, against a throwaway temp queue file (never the real tracked `test/fixtures/fix-queue.json`)
- [ ] `test/integration/dogfood/proxy-passthrough.test.ts` — covers the transparent-forwarding property end to end against the real built server (small fixture, no real proof work needed)
- [ ] `test/unit/fixtures/fuel-corpora.test.ts` — covers PROC-02's manifest schema + cross-reference into `loadOraclePolicy()`
- [ ] Framework install: none — `vitest`/`tsx` are already present; no new test-framework setup needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase adds no authentication surface — it's local CLI tooling over stdio, not a network service |
| V3 Session Management | Partial | The proxy IS a session-lifecycle boundary (child spawn → tee → child exit), but there is no user-session/credential concept to manage; the relevant control is process lifecycle hygiene (always kill the child on parent exit/error, never leak an orphaned Agda process) — reuse the existing `try/finally` kill-on-exit convention already used throughout `scripts/oracle/*.mjs` |
| V4 Access Control | No | No new access-control surface; private-corpus access is already gated by `gh`'s own auth, unrelated to this phase's code |
| V5 Input Validation | Yes | The task manifest and fuel-pointer manifest are both untrusted-ish input (hand-edited JSON files) — validate via `zod`, exactly like every existing matrix/schema in this repo (`fixQueueEntrySchema`, `captureRegressionEntrySchema`, `oraclePolicySchema`) |
| V6 Cryptography | No | Nothing in this phase touches cryptographic primitives |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via a fuel-pointer/task-manifest `policyKey`/`corpus` field resolving outside `scripts/data/oracle-policy/` | Tampering / Information Disclosure | Reuse `loadOraclePolicy()`'s EXISTING bare-filename-only regex validation (`/^[A-Za-z0-9._-]+$/u` plus a non-all-dot check) unchanged — do not write a second, laxer validator for the new fuel-pointer manifest's own key field |
| Shell-injection via an untrusted/artifact-supplied binary path or corpus path passed to `spawn` | Tampering | Always use `spawn`'s argv-array form (`spawn(cmd, [args])`), never a shell string — this repo's own `src/index.ts` header comment and `scripts/oracle/cold-agda-session.mjs` already document and follow this exact rule; the proxy's own child-spawn must follow it identically |
| A malicious/malformed captured artifact's `inlinedFirstPartySources[].path` escaping the materialized replay directory during flake-classification re-materialization | Tampering / Elevation of Privilege | Already solved by `materializeCaptureEnvironment`'s use of `resolveFileWithinRoot` (path-sandboxed, throws `PathSandboxError` on `..` escape) — reusing that function (Don't Hand-Roll) inherits the fix for free; a hand-rolled second materializer would risk reintroducing the exact CR-01 hole Phase 3's own verification already found and fixed once |
| Symlink race / TOCTOU when writing run transcripts/reports under `.agda-mcp/runs/` | Tampering | Reuse `writeFileAtomic` (`src/session/safe-source-io.ts` — `O_CREAT\|O_EXCL` via the `"wx"` flag, same-directory temp + rename) for the run report and any other single-shot artifact write, exactly as every other script in this repo already does; an append-only transcript stream (many small writes) is lower-risk than a single mutable file and can reasonably use plain `appendFileSync`, matching `run-oracle.mjs`'s own precedent for `oracle-metrics.jsonl` |
| Private-corpus source leaking into the tracked repo or into a GitHub-mirrored queue entry | Information Disclosure | Already governed by Phase 4 D-11 (mirror payload is summary-only, never full bundle contents) and this phase's own D-05 (`.agda-mcp/runs/` gitignored) — no new leak surface as long as the wrap-up pipeline's queue-filing code never copies `recordedActions`/`inlinedFirstPartySources` verbatim into a `FixQueueEntry` (which has no field shaped to hold them anyway — the schema itself is the guardrail) |

## Sources

### Primary (HIGH confidence)
- Direct file reads (this repository, `/Users/eric/projects6/agda-mcp-server`): `.planning/phases/05-dogfooding-orchestration-fuel/05-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/DESIGN-PRINCIPLES.md`, `.planning/research/FUEL-CORPORA.md`, `.planning/research/ORACLE-VALIDITY.md`, `.planning/research/PITFALLS.md`, `.planning/phases/{01,02,03,04}-*/{01,02,03,04}-CONTEXT.md`, `.planning/ROADMAP.md`, `package.json`, `.gitignore`, `AGENTS.md`, `docs/assistant-workflows.md`, `docs/extensions.md`, `.github/workflows/ci.yml`, `vitest.config.ts`, `test/helpers/mcp-harness.ts`, `scripts/mcp-local-client.mjs`, `scripts/promote-capture.mjs`, `scripts/verify-cold-replay.mjs`, `scripts/test-with-sentinel.mjs`, `scripts/oracle/{run-oracle,orcl-01-differential,orcl-02-soundness-scan,orcl-03-conformance,verdict-schema,cold-agda-session}.mjs`, `scripts/queue/{intake,priority}.mjs`, `scripts/data/oracle-policy/agda-unimath.json`, `src/tools/register-capture-session.ts`, `src/agda/session-capture/{artifact-types,session-capture,recorded-transport}.ts`, `src/session/project-config.ts`, `src/repo-root.ts`, `src/session/safe-source-io.ts` (writeFileAtomic), `test/fixtures/{fix-queue,capture-regression-matrix}.ts`, `test/fixtures/fix-queue.json`, `test/helpers/capture-regression-runner.ts`, `scripts/emit-regression.mjs`
- [MCP stdio transport specification](https://modelcontextprotocol.io/specification/draft/basic/transports) — newline-delimited JSON-RPC, no embedded newlines, confirmed the proxy's line-buffering approach is spec-safe
- [Extend Claude with skills — Claude Code Docs](https://code.claude.com/docs/en/skills) — directly fetched; confirms `.claude/skills/<name>/SKILL.md` project-skill discovery, no `.agents/skills/` fallback documented
- [Agent Skills – Codex | OpenAI Developers](https://developers.openai.com/codex/skills) — directly fetched twice (once for a general summary, once for verbatim path quotes); confirms `.agents/skills/` (cwd up to repo root), `$HOME/.agents/skills`, `/etc/codex/skills` — NOT `.codex/skills/` for repo-level skills

### Secondary (MEDIUM confidence)
- WebSearch: ["codex mcp add" command syntax](https://developers.openai.com/codex/mcp) — cross-referenced across multiple secondary summaries (verdent.ai, inventivehq.com, composio.dev), consistent syntax found: `codex mcp add <name> --env K=V -- <cmd> [args]`
- WebSearch: ["claude mcp add" command syntax](https://code.claude.com/docs/en/mcp) — cross-referenced across multiple secondary summaries, consistent syntax found: `claude mcp add --transport stdio --env K=V <name> -- <cmd> [args]`, plus `-s project`/`-s user` scope flags
- WebSearch cross-reference on Agent Skills directory conventions (agensi.io's "SKILL.md: The Open Standard for AI Agent Skills") — corroborates (does not contradict) the two direct-fetch findings above
- WebSearch: agda-unimath's GitHub org (`github.com/UniMath/agda-unimath`) — corroborated by the repo URL, its docs site (`unimath.github.io/agda-unimath`), and its `.agda-lib` file path all appearing in the same result set

### Tertiary (LOW confidence)
- WebSearch synthesis on agda-unimath's current Agda-version compatibility (2.8.0) — a single search-engine synthesis, not a direct fetch of the library's own README/`.agda-lib`; flagged in Assumptions Log A4 for re-verification at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack / internal composition: HIGH — every reused function/module was located and read directly in this repository, not inferred from training data
- Architecture (proxy design, two-script split, fuel-pointer manifest): MEDIUM-HIGH — grounded in direct reads plus a verified protocol spec, but the exact N-rerun semantics (Open Question 1) and the proxy/wrap-up split (Open Question 3) are novel syntheses this research recommends rather than facts already decided in CONTEXT.md
- Pitfalls: HIGH for internally-grounded ones (gitignore conflict, npm-package `files` scope, queue-schema enum gap — all directly verified by reading the actual files); MEDIUM for the Skill cross-tool directory finding (externally sourced, fast-moving space, re-verify if this phase's execution is delayed)

**Research date:** 2026-07-02
**Valid until:** 30 days for the internal-composition findings (stable — this repo's own code doesn't drift on its own); **7-14 days** specifically for the Skill-discovery-directory claims (Pitfall 3 / Assumption A2) given how recently both ecosystems appear to have been iterating on this exact convention — re-fetch both official docs pages before finalizing the Skill's shipping location if planning/execution starts more than ~2 weeks after this research date.
