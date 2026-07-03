# Phase 5: Dogfooding Orchestration + Fuel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 5-dogfooding-orchestration-fuel
**Areas discussed:** Driver model, Fuel set / first run (plus a forced-conclusions briefing with veto offered)

---

## Process note

Per the maintainer's standing rule (now codified in `~/.claude/CLAUDE.md` §GSD discussion rules, 4th recurrence this milestone): the four initially-identified gray areas (driver model, fuel set + task shape, hard-gate enforcement point, post-run pipeline depth) were classified sub-decision by sub-decision BEFORE asking. Six conclusions were forced by requirements / charter / field evidence and were presented as a plain-Chinese briefing with veto offered (none exercised): orchestrator-enforced signature gate (PROC-01 "up front" + CHG zero-captures evidence), auto-chained wrap-up pipeline with auto-intake as `new` (charter P5 + Phase-4 review-point design), run artifacts in gitignored `.agda-mcp/runs/` (Phase-4 D-11 privacy), proxy-recorded full transcript + `AGDA_MCP_CAPTURE=1` (criterion-3 wording + bounded ring buffer), runbook-as-Skill for both agents (charter P6), basic run-report instrumentation (charter P7). Only the two genuine taste questions below went to the user. An earlier jargon-dense area-selection menu was rejected by the user and is logged here as the trigger for the CLAUDE.md codification.

---

## Driver model (who drives the agent)

| Option | Description | Selected |
|--------|-------------|----------|
| 录音代理先行（推荐） | Recording proxy: agent stays interactive (as in the real CHG campaign); MCP server command points at dogfood-run.mjs which records everything in the middle. Lowest risk, matches actual team usage; headless left for later. | ✓ |
| 无头一键先行 | Headless one-shot: dogfood-run spawns an unattended `codex exec` fed by a task manifest. Closer to the literal "one command at stdlib" goal, but interactive work stays unrecorded and adds a headless-CLI dependency. | |
| 两个都进 v1 | Both modes in v1 — fullest coverage, largest workload, risks squeezing runbook/fuel polish. | |

**User's choice:** 录音代理先行 (recording proxy first)
**Notes:** Cron/unattended looping excluded from both options up front (AUTO-06, v2).

---

## Fuel set / first run

| Option | Description | Selected |
|--------|-------------|----------|
| 四个够，CHG 先跑（推荐） | v1 set = the four requirement-named corpora (agda-stdlib, agda-unimath, Codex-Homotopy-Group, autoformalizing-hopf); first run targets CHG — it directly dogfooded this server, measured false-greens, policy whitelist/flag baseline ready-made. Cost: private-repo access needed for setup. | ✓ |
| 四个够，stdlib 先跑 | Same four corpora but stdlib first: public, simplest environment, good for shaking down the process — but not the corpus that surfaced defects; likely a low-yield first cut. | |
| 还要再加别的开源项目 | Add further OSS Agda projects to the v1 set (user to name them). | |

**User's choice:** 四个够，CHG 先跑 (four corpora suffice; CHG first)
**Notes:** stdlib remains in the set for subsequent runs.

---

## Final confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| 写吧 | Write 05-CONTEXT.md with the 2 taste decisions + 6 forced conclusions as briefed. | ✓ |
| 还有要谈的 | Amend or veto items before writing. | |

**User's choice:** 写吧 (write it)

---

## Claude's Discretion

- Policy-file schema + location (formalizing the Phase-2 interim handoff); fuel-pointer file format/location.
- Task-manifest format; default N for flake re-runs.
- Skill directory layout for dual agents; proxy CLI shape; run naming under `.agda-mcp/runs/`; run-report format.

## Deferred Ideas

- Headless one-shot mode → after v1's proxy core proves out (D-01).
- Unattended cron loop → AUTO-06 (v2); agent-facing capture hints → AUTO-02 (v2); ORCL-02 hard half → AUTO-07 (v2).
- Token-accurate budget measurement beyond call counts → empirical, once run reports exist.
