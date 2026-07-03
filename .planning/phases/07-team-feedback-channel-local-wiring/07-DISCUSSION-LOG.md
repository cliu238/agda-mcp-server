# Phase 7: Team Feedback Channel — Local Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 7-Team Feedback Channel — Local Wiring
**Areas discussed:** Fix-queue write-back mechanism, E2E-01 acceptance session driver, adoption of forced conclusions

Per the user's standing discuss-phase rules, every gray area was classified first (forced / empirical-defer / genuine taste); only 2 genuine-taste questions plus one adoption confirmation were asked — no meta-menu. Questions were asked in plain Chinese with consequence-based options.

---

## Fix-queue write-back mechanism (the research-flagged open architecture decision)

| Option | Description | Selected |
|--------|-------------|----------|
| 手动拉取合并 (manual pull/merge; was recommended) | Judge output stays in server storage; maintainer pulls, reviews, merges into the tracked queue file. Zero server credentials; human gate for sensitive log content; one manual step per batch. Aligned with the v2 TEAM-07 deferral. | |
| 机器人直接推 main (direct push to main) | Judge auto-commits + pushes queue updates to `main`. Zero human steps, fastest into queue; server holds a repo write credential in Phase 8; bad batch pollutes main directly. | ✓ |
| 每批自动开 PR (PR-per-batch) | Judge opens a PR per batch, human merges. Review gate + visibility, but same credential exposure plus PR noise, and the manual step isn't saved. | |

**User's choice:** Direct push to `main` — chosen with the credential-exposure and bad-batch tradeoffs explicitly on the table.
**Notes:** Supersedes the v2 TEAM-07 "manual review/pull, automate later" placeholder. Mitigations recorded in CONTEXT D-01: minimally-scoped credential as k8s Secret (Phase 8), flag for DEBT-05 security review, zod validation + fingerprint dedup as pre-push gates, `git revert` as recovery.

---

## E2E-01 acceptance session driver

| Option | Description | Selected |
|--------|-------------|----------|
| Codex (recommended) | Reproduces the exact usage pattern that exposed CHG's original defects; corpus-history-consistent; requires local Codex CLI. | ✓ |
| Claude Code | Most convenient to orchestrate locally; log-collection path also packaged by the upload script; usage pattern differs slightly from the original Codex sessions. | |
| 执行时看情况 (decide at run time) | Both driver paths documented in the plan; pick whichever is convenient on acceptance day. | |

**User's choice:** Codex.
**Notes:** `dogfood-run.mjs` is agent-agnostic, so this is a runbook choice, not a code-support choice.

---

## Adoption of forced conclusions & defaults

| Option | Description | Selected |
|--------|-------------|----------|
| 全部采纳 (adopt all) | The 7 forced conclusions/defaults go into CONTEXT.md as-is. | ✓ |
| 个别要改 (amend some) | User specifies which to change. | |

**User's choice:** Adopt all 7: bounds already recorded in REQUIREMENTS.md (retry queue 20/2 GiB, size cap 512 MiB, keep-everything retention); manually-invoked cron-able judge in Phase 7; key-presence = upload switch (`;`-chained); hashed key registry + `timingSafeEqual`; research file layout with zero new deps; maintainer plays the teammate on localhost; proof task picked at execution time.

---

## Claude's Discretion

Endpoint port/route naming, key-registry format/location, retry-queue file format (NDJSON suggested), person-identifier convention, processed-archive marking, consent-statement wording (English), `--no-push` dev flag shape, `run-report.json` policyKey-threading details.

## Deferred Ideas

None new — discussion stayed within phase scope. Retention/pruning remains v2 TEAM-06; TEAM-07 is resolved (not deferred) by the direct-push decision.
