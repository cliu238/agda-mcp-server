# Phase 5: Dogfooding Orchestration + Fuel - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the dogfooding *process* reproducible — the last scaffold piece that turns "use it → capture → judge → lock → queue" into an on-demand, repeatable run:

1. a **written dogfooding runbook + driver-prompt snippet**, shipped as an Agent Skill, that tells an agent when and how to invoke the capture verb while proving against real corpora — with the **expected-top-level-signature hard gate** enforced up front (PROC-01),
2. a **pinned fuel-pointer set** listing the source corpora at pinned commits, which is also the formal home of the **machine-readable per-corpus policy** (sanctioned-axiom whitelist + required/forbidden flag baseline) that ORCL-02 reads (PROC-02),
3. the **orchestrator `scripts/dogfood-run.mjs`** — a recording stdio proxy that launches the real server (single `AgdaSession`, #39), records the full tool-call transcript, and auto-persists captures (success criterion 3),
4. a **post-run wrap-up pipeline**: oracle triad → re-run N times and classify (deterministic → real defect; flaky → `timing/nondeterministic`) → file into the Phase-4 queue (success criterion 4).

**Not in this phase:** headless one-shot agent spawning (deferred — see D-01), unattended cron loop orchestration (AUTO-06, v2), agent-facing capture hints via `nextAction` (AUTO-02, v2), the ORCL-02 hardened flag-baseline hard half (AUTO-07, v2), actually *fixing* harvested defects (ongoing post-scaffold work), knowledge accumulation (v2).

</domain>

<decisions>
## Implementation Decisions

> **Classification legend** (per the established Phase-1/2/3/4 convention):
> **[FORCED]** = fixed by correctness / a requirement / the phase boundary / an existing convention or charter — alternatives ruled out (reason given). Non-negotiable downstream.
> **[TASTE]** = a genuine values call the maintainer made.
> **[DEFERRED]** = deliberately unresolved (empirical or later-phase).
>
> This discussion surfaced exactly **two** taste decisions (D-01, D-02); the six forced conclusions (D-03…D-08) were briefed to the user with veto offered — none exercised.

### Driver model (success criterion 3)

- **D-01 [TASTE — user decision]:** v1's core is the **recording-proxy mode**: the agent (Codex or Claude Code, interactively driven by the maintainer as in the real CHG campaign) has its MCP server command pointed at `scripts/dogfood-run.mjs`, which spawns the real server over stdio, passes JSON-RPC through transparently, records the full tool-call transcript, and auto-persists captures at session end. **Headless one-shot mode** (dogfood-run spawning a `codex exec` child fed by a task manifest) is deferred — not ruled out, just not v1's core. Unattended cron looping stays v2 (AUTO-06) under either mode. Rationale: matches how the team actually works, minimizes new dependency surface (headless CLI behavior), and interactive sessions were previously *unrecorded* — this closes that gap first.
  - *Criterion-3 wording note for planners:* the roadmap says "via the existing harness"; the proxy satisfies the criterion's intent (single server process / single `AgdaSession`, transcript recorded, captures auto-persisted). `test/helpers/mcp-harness.ts` remains the natural client vehicle where the orchestrator genuinely IS a client — the post-run replay / N-rerun flake classification (D-04).

### Fuel set (PROC-02)

- **D-02 [TASTE — user decision]:** The v1 pinned fuel set is **exactly the four requirement-named corpora**: `agda-stdlib` (public), `agda-unimath` (public; host of the Hopf work), `emilyriehl/Codex-Homotopy-Group` (private; directly dogfoods this server; policy whitelist + flag baseline ready-made), `emilyriehl/autoformalizing-hopf` (private; paper repo) — all at pinned commits. No additional OSS corpora in v1. **The first official dogfood run targets CHG** — it has measured false-greens against this very server, its `.agda-lib`-derived policy facts are ready, and it is the most likely to surface real defects immediately. (stdlib-first was considered and rejected as the lower-yield first cut; it stays in the set for subsequent runs.)

### Signature hard gate (PROC-01)

- **D-03 [FORCED — PROC-01 "up front" wording + CHG field evidence]:** The expected-signature hard gate is **mechanically enforced by the orchestrator at run start**: a proving run requires a task manifest carrying the expected top-level signature per target; without it, `dogfood-run` refuses to start. Ruled out: runbook-prose-only (CHG's multi-week campaign produced ZERO structured captures despite instructions, and its two planning docs disagreed on a homotopy-group index — soft guidance demonstrably fails); intake-time gating (not "up front" — by then the session already ran with ORCL-03 vacuous). Capture-time remains optional per Phase-1 D-02 lineage (crash/failure captures inherently have no expected signature).

### Post-run pipeline (success criterion 4)

- **D-04 [FORCED — charter P5 + Phase-4 queue design]:** The wrap-up pipeline is **auto-chained in code**: one wrap-up command takes a finished run through the oracle triad → N-times re-run flake classification (deterministic → real defect; flaky → tagged `timing/nondeterministic`, never filed as deterministic) → **auto-files true defects into the Phase-4 queue as `new`**. No pre-intake human confirm: Phase 4 deliberately placed the human review point *inside* the queue (`new` → `triaged` is the human step, and `new` never auto-publishes to GitHub per Phase-4 D-13). DESIGN-PRINCIPLES P5 names this orchestrator as the compose-in-code exemplar — per-step model round-trips are ruled out.

### Run artifacts & privacy

- **D-05 [FORCED — Phase-4 D-11 privacy line + `.agda-mcp/` convention]:** Transcripts, run reports, and staged captures live in **gitignored `.agda-mcp/runs/`** (machine-local staging, per the Phase-1/2 convention). Private-corpus source (CHG, autoformalizing-hopf) never enters the public repo tree; only summary-level, source-free data flows into queue entries per Phase-4 D-11 payload rules.

### Transcript recording

- **D-06 [FORCED — criterion-3 wording + bounded ring buffer]:** The **proxy records the full-session transcript itself** (unbounded, on disk) and sets `AGDA_MCP_CAPTURE=1` on the child server so the capture verb has its in-server action log. The server-side recorder is a bounded ring buffer (long sessions overflow it — Phase-1 D-06) and is therefore *not* the transcript; the two records serve different consumers (proxy transcript → run report/forensics; ring buffer → `CaptureArtifact.actionLog`).

### Runbook packaging (PROC-01)

- **D-07 [FORCED — charter P6 + dual-agent constraint]:** The runbook ships as an **Agent Skill usable by both Codex and Claude Code** (CHG's `.codex/skills/agda-unimath-skills` and leanprover/skills are the templates). It must explicitly script **when and how to invoke `agda_capture_session`** — the antidote to the STATE.md open risk (zero captures in the wild means Loop ② is not self-feeding) — and must describe the legitimate **scaffold-hole workflow** (intentional `{!!}` + `--allow-unsolved-metas` is in-progress work, never a defect to capture).

### Run report instrumentation

- **D-08 [FORCED — charter P7 "measured, not assumed"]:** The run report carries **basic instrumentation**: per-tool call counts, durations, capture/defect tallies. P7 names the Loop-2 harness as the measuring instrument for token/turn budgets; the CHG baseline (711 calls, `agda_load` = 46%, introspection ≫ mutation) is the comparison point. Exact metric set and whether token counts are approximated by payload size at the stdio seam = plan-phase detail.

### Claude's Discretion

- Policy-file schema + location (formalizing the Phase-2 interim whitelist/flag-baseline handoff into PROC-02's home), and the fuel-pointer file format/location.
- Task-manifest file format (what a "target + expected signature" entry looks like).
- Default N for flake-classification re-runs.
- Skill directory layout serving both agents (`.codex/skills/` vs `.claude/skills/` vs shared source).
- Proxy CLI shape, flags, and run/session naming under `.agda-mcp/runs/`.
- Run-report format (JSON + human summary, per the Phase-4 dashboard precedent).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope (the contract this phase implements)
- `.planning/REQUIREMENTS.md` §Dogfooding Process (PROC) — PROC-01/02 exact wording (hard gate, pinned corpora, policy contents: unimath sanctioned axioms + required flags). Also AUTO-02/06/07/08 to know what is *deferred*.
- `.planning/ROADMAP.md` §"Phase 5: Dogfooding Orchestration + Fuel" — the 4 success criteria.

### Fuel & field evidence (PROC-02's concrete backing — MANDATORY read)
- `.planning/research/FUEL-CORPORA.md` — the full corpus inventory: both private repos, the artifact→phase table (MCP-SETUP.md, `.codex/skills/`, formalization plans with expected signatures, loop.sh), the agda-unimath required-flag + sanctioned-axiom facts the policy file encodes, and the v0.6.7 measurement caveat.
- `.planning/research/ORACLE-VALIDITY.md` — false-green families, INCONCLUSIVE semantics the wrap-up pipeline surfaces.
- `.planning/research/PITFALLS.md` §Pitfall 6 — the firehose/backpressure failure mode; Phase 5 is the moment the firehose turns on and the Phase-4 guards absorb it.

### Design charter (forces D-04/D-07/D-08)
- `.planning/DESIGN-PRINCIPLES.md` — P5 (compose in code; names `scripts/dogfood-run.mjs`), P6 (strategy lives in a Skill → runbook-as-Skill), P7 (measure tool efficiency; Loop 2 IS the eval harness), guardrail: never compress away `ok`/`classification`/false-green signal.

### Adjacent-phase contracts (the orchestrator's input/output seams)
- `.planning/phases/01-capture-foundation/01-CONTEXT.md` — D-02 (signature optional at capture; the hard gate lands HERE), D-06 (`AGDA_MCP_CAPTURE=1` env gate + bounded ring buffer), D-09/D-10 (emit-only + staging), and the deferred "Phase-5 integration constraints" bullet (CHG MCP-SETUP.md).
- `.planning/phases/02-the-oracle-triad-server-faithfulness-soundness-hygiene-confo/02-CONTEXT.md` — verdict sidecar contract the wrap-up pipeline invokes; the interim policy-file handoff this phase formalizes; multi-run flaky classification explicitly deferred to this phase.
- `.planning/phases/04-triage-fix-queue/04-CONTEXT.md` — intake path (D-04/D-05), graveyard guards built for this phase's volume (D-06), privacy payload rules (D-11), `new`-never-publishes (D-13). The wrap-up pipeline files into this queue.
- `.planning/phases/03-regression-lock-pipeline/03-CONTEXT.md` — where harvested captures go after triage (emitter refusal gates read the same verdicts).

### Codebase seams (reusable assets — full paths)
- `test/helpers/mcp-harness.ts` — the programmatic MCP client; vehicle for post-run replay / N-rerun classification.
- `scripts/mcp-local-client.mjs` — existing local MCP client script; closest seed for the proxy's plumbing.
- `scripts/promote-capture.mjs` — the intake write path the wrap-up pipeline drives (extended toward the queue in Phase 4).
- `scripts/verify-cold-replay.mjs` — cold-replay mechanics the flake re-runs build on (CR-01 path-sandbox fix applies).
- `src/tools/register-capture-session.ts` + `src/agda/session-capture/artifact-types.ts` — the capture verb + `CaptureArtifact`/`CaptureReference` the runbook scripts around.
- `src/session/project-config.ts` — `.agda-mcp.json` + env-flag merging (what "merged argv" means when the proxy launches the server).

### CHG integration constraints (deferred from Phase 1 to this phase's context)
- CHG `MCP-SETUP.md` — the real launch line the proxy must slot into: `codex mcp add agda --env AGDA_MCP_ROOT=… -- npx -y agda-mcp-server@<ver>`; `agda_effective_options` must surface the merged argv incl. injected `-l <library>`; the two-location deploy-into-sandbox model. (private repo; re-clone via `gh repo clone emilyriehl/Codex-Homotopy-Group`)
- CHG `.codex/skills/agda-unimath-skills/SKILL.md` — the Skill template PROC-01 models on, including the "do not trust MCP ok-complete" warning whose retraction is the measurable win.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcp-harness.ts`: spawns the built server and drives it as an MCP client — the wrap-up pipeline's replay/flake-rerun vehicle.
- `mcp-local-client.mjs`: existing script-side MCP client plumbing — proxy seed.
- `promote-capture.mjs` (+ its Phase-4 queue-intake extension): the persist/file step the proxy's session-end hook and wrap-up command call.
- `AGDA_MCP_CAPTURE=1` recorder (Phase 1): the in-server action log the proxy enables for every dogfood run.
- `agda_effective_options` tool: surfaces the merged argv — the runbook's pre-flight check that the sandbox launch matches the policy's flag baseline.

### Established Patterns
- Scripts as plain ESM `.mjs` under `scripts/`, importing server logic as a library (Phase-2 D-05 precedent) — the proxy + wrap-up pipeline follow this; **no new `src/` surface** in this phase.
- Gitignored `.agda-mcp/` = machine-local staging; tracked repo = durable truth. Run artifacts stage under `.agda-mcp/runs/`; only queue entries (summary-level) cross to the tracked side.
- Matrix-as-SSOT JSON + typed loader — the fuel-pointer + policy file follows this idiom.

### Integration Points
- **Inbound:** the agent's MCP config points at `dogfood-run.mjs` (proxy) instead of the bare server binary; the proxy spawns `dist/index.js` (single `AgdaSession`, #39).
- **Outbound:** session end → staged captures + transcript in `.agda-mcp/runs/`; wrap-up command → Phase-2 oracle scripts → N-rerun classification → Phase-4 queue intake as `new`.
- **Policy:** the PROC-02 fuel/policy file is read by ORCL-02 (whitelist) and ORCL-01 (flag baseline / conformance argv) — formalizes Phase 2's interim handoff.

</code_context>

<specifics>
## Specific Ideas

- **First-run shape (CHG):** pinned commit; task manifest seeded from CHG's own formalization plans' expected signatures — the two plans' 2-vs-3 off-by-one disagreement on a homotopy-group index is the standing proof of why a pinned, human-signed signature is required before the run starts.
- **Measurable win to aim for:** retracting the CHG Skill's "do not trust MCP ok-complete" warning — the server's earned role graduating from interactive-query-only back to trusted verdict participant.
- **P7 baseline for the run report:** CHG measured 711 `agda_*` calls with `agda_load` at 46% and introspection ≫ mutation — the comparison point for instrumentation output.
- **Flake-classification framing:** the N-rerun exists so timing/idle phantoms (#65/#66 family) never enter the queue as deterministic defects — tag, don't discard; flaky entries are still signal.

</specifics>

<deferred>
## Deferred Ideas

- **Headless one-shot mode** (`dogfood-run` spawning `codex exec` against a task manifest) — deferred past v1's core by D-01; revisit once the proxy mode has produced real runs.
- **Unattended loop orchestration** (cron over pinned fuel) → AUTO-06 (v2).
- **Agent-facing capture hints** ("this smells like a defect — capture it" via `nextAction`) → AUTO-02 (v2).
- **ORCL-02 hardened flag-baseline hard half** → AUTO-07 (v2); the policy file should leave schema room for it.
- **Token-accurate budget measurement** beyond call counts/payload sizes — empirical refinement once run reports exist (P7's consolidation decisions are gated on this data).
- **Fixing the harvested cargo** — ongoing post-scaffold work (PROJECT.md "continuous feature completion + bug fixing"); this phase delivers the harvest process, not the fixes.

</deferred>

---

*Phase: 5-dogfooding-orchestration-fuel*
*Context gathered: 2026-07-02*
