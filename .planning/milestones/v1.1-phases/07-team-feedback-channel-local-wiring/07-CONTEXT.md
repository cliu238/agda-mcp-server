# Phase 7: Team Feedback Channel — Local Wiring - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A teammate's captured proof session flows end-to-end — issue-key consent (TEAM-01), fail-open upload (TEAM-02), local ingest endpoint (TEAM-03), unattended-capable judging into the fix queue (TEAM-04) — proven entirely on localhost before any k8s dependency exists. Acceptance is E2E-01: one fresh **live** Codex dogfooding session on the pinned CHG corpus runs the complete loop with zero fixture shortcuts, reaching a definitive per-capture verdict with correct dedup against existing CHG entries.

Out of this phase: pinned-env distribution + real k8s deployment (Phase 8, TEAM-05/DEPLOY-01); the POLICY-01 fix itself (Phase 6 dependency — this phase *consumes* it for policyKey resolution).

</domain>

<decisions>
## Implementation Decisions

### Fix-queue write-back (the open architecture decision — RESOLVED)
- **D-01:** **The judge pushes directly to `main`.** The cron judge intakes confirmed entries into the tracked queue SSOT (`test/fixtures/fix-queue.json`) via the existing intake machinery, then auto-commits and pushes to `main`. No PR-per-batch, no manual pull/merge step. User chose this with the tradeoffs on the table: in Phase 8 the judging server will hold a repo write credential (scope it minimally — fine-grained PAT or deploy key, stored as a k8s Secret; flag for the DEBT-05 security review), and a bad batch lands on `main` directly (recovery = `git revert`; the zod queue schema validation + fingerprint dedup are the pre-push gates).
- **D-02:** Phase 7 local mode exercises the same code path: judge writes the working copy's queue file, commits, pushes. A dev-only `--no-push` escape hatch for test iterations is fine (Claude's discretion), but the E2E-01 acceptance run uses the real commit+push path.
- **D-03:** This supersedes REQUIREMENTS.md's v2 TEAM-07 placeholder ("manual review/pull step, automate later") — v1.1 automates write-back now, per owner decision 2026-07-03.

### E2E-01 acceptance session
- **D-04:** **Codex drives the live acceptance session** — reproduces the same usage pattern that exposed CHG's original defects. Precondition: Codex CLI available on the Mac. (`dogfood-run.mjs` is agent-agnostic; Claude Code path needs no special support work.)
- **D-05:** The proof task is chosen at execution time from real open goals in CHG. Acceptance is loop-to-verdict — a definitive per-capture verdict + correct queue behavior — NOT "must find a new defect" (locked in REQUIREMENTS E2E-01).
- **D-06:** The maintainer plays the "teammate" locally — the entire wire (key issuance → upload → ingest → judge) runs on localhost per the phase boundary.
- **D-07:** Documented-not-engineered precondition: CHG's vendored agda-unimath built locally once (overnight, via the corpus's own tooling). Start this build early so it never blocks the acceptance run.

### Bounds & defaults (adopted as recorded in REQUIREMENTS.md — the "numbers TBD" note in STATE.md is stale)
- **D-08:** Upload retry queue: bounded at **20 archives / 2 GiB**, drop-oldest with loud warning, env-tunable (TEAM-02).
- **D-09:** Ingest size cap: **512 MiB compressed** default, env-tunable; oversize rejected with a clear error (TEAM-03).
- **D-10:** Archive retention: **keep everything** — v1.1's recorded conscious default; pruning is v2 TEAM-06.

### Operational wiring
- **D-11:** Phase 7 judge is a **manually invoked, cron-able script**; true unattended scheduling arrives as the Phase 8 k8s CronJob. (Research: "manually-run local cron before an unattended k8s CronJob".)
- **D-12:** Upload chaining switch = the key itself: key + upload URL configured → wrap-up chains `upload-run.mjs` automatically, joined with `;` never `&&` (wrap-up sets non-zero exit on partial errors); no key → zero network behavior (TEAM-01).
- **D-13:** Key registry stores **hashes only** (never plaintext keys); Bearer comparison via `crypto.timingSafeEqual`, never `===`.
- **D-14:** File layout per research: `scripts/team/` (ingest-server, cron judge, issue-key) + `scripts/dogfood/upload-run.mjs`; **zero new npm dependencies** (`node:http`/`crypto`/`zlib`/`stream`, system `tar`, global `fetch`); storage root via single env var (`AGDA_MCP_TEAM_STORAGE_DIR`) so local-dir and Ceph-PVC modes are the same code path; `src/` untouched.

### Claude's Discretion
- Endpoint port/route naming, key-registry file format/location, retry-queue file format (research suggests NDJSON at `.agda-mcp/team/upload-queue.jsonl`), person-identifier convention (e.g. GitHub handle slug), processed-archive marking, consent-statement wording (English), `--no-push` dev flag shape.
- policyKey threading details for bundles from other machines — research proposes an additive `taskManifestCorpora` field in `run-report.json` at recording time; builds on Phase 6's POLICY-01 fix.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TEAM-01..04 + E2E-01 full text, and the **locked context preamble** of the TEAM section (consent model, full logs no redaction, no GitHub-Issues ingest, upload hook never in the published MCP server)
- `.planning/ROADMAP.md` — Phase 7 goal, dependency on Phase 6 (POLICY-01), success criteria 1–5

### v1.1 research (team-channel sections)
- `.planning/research/SUMMARY.md` — stack/architecture/pitfall synthesis; the write-back question this CONTEXT resolves
- `.planning/research/ARCHITECTURE.md` — component/file plan (`upload-run.mjs`, `ingest-server.mjs`, `cron-ingest-wrapup.mjs`), import-not-CLI-reinvoke rule
- `.planning/research/PITFALLS.md` — tar path-traversal/decompression-bomb surface; fail-open retry-storm; W2 recurrence
- `.planning/research/FEATURES.md` — reference-system validation (Sentry/Socorro), bounds rationale
- `.planning/research/STACK.md` — node:http/crypto/zlib/stream + system tar + global fetch, no new deps

### Existing loop machinery (reuse, never rebuild)
- `scripts/queue/intake.mjs` — queue SSOT path + upsert/dedup interface (`test/fixtures/fix-queue.json` under repo root)
- `test/fixtures/fix-queue.json` — the tracked queue SSOT; existing CHG entries are E2E-01's dedup targets
- `scripts/dogfood/dogfood-run.mjs` + `scripts/dogfood/dogfood-wrapup.mjs` — recording proxy (agent-agnostic) and the wrap-up chain point for upload
- `scripts/oracle/run-oracle.mjs` + `scripts/oracle/orcl-01-differential.mjs` — oracle triad entry; the proven `mkdtempSync` + path-sandbox materialize pattern to reuse for archive extraction
- `scripts/data/fuel-corpora.json` — pinned CHG corpus entry; `scripts/data/oracle-policy/` — policy keys

### Deployment target (informs interface design only, this phase stays local)
- `~/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md` — the k8s pattern Phase 8 will package this into (22 lessons)
- `milestones/v1.0-MILESTONE-AUDIT.md` — W2/ORCL-02 headline debt (fixed in Phase 6; this phase depends on it)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/queue/intake.mjs` upsert + fingerprint dedup: the cron judge's queue write goes through this — never a second queue writer.
- `scripts/oracle/orcl-01-differential.mjs` materialize pattern (`mkdtempSync` + `resolveFileWithinRoot`/`PathSandboxError`): the archive-extraction sandbox for TEAM-04 — never bare tar trust (node-tar's own CVE history shows library guards are insufficient).
- `dogfood-wrapup.mjs` / `run-oracle.mjs` / intake: cron judge **imports their functions directly**, never re-invokes their CLIs (research architecture rule).

### Established Patterns
- "The loop wraps the server": all new code in `scripts/` — `src/` untouched, published package stays dependency-light and telemetry-free.
- Env-var configuration, no dotenv; zod-validated flat-file state; atomic writes.
- Queue SSOT discipline (D-03 of v1.0 Phase 4): `test/fixtures/fix-queue.json` is the only source of truth; `mirror-github.mjs` stays optional post-triage visibility.

### Integration Points
- `dogfood-wrapup.mjs` end → chain `upload-run.mjs` with `;` (D-12).
- Judge → `intake.mjs` → commit+push to `main` (D-01) — the new write-back step wraps the existing intake, it does not replace it.
- `run-report.json` — the one schema addition (corpus/policyKey self-description) so bundles from other machines resolve policy correctly via Phase 6's fix.

</code_context>

<specifics>
## Specific Ideas

- Research's named file plan adopted: `scripts/dogfood/upload-run.mjs`, `scripts/team/ingest-server.mjs`, `scripts/team/cron-ingest-wrapup.mjs`, plus an `issue-key` script (TEAM-01).
- Per-run INCONCLUSIVE/abstention rate must be surfaced in the judge's run summary — no human is watching otherwise (TEAM-04 text).

</specifics>

<deferred>
## Deferred Ideas

- Archive retention/pruning policy — v2 **TEAM-06** (keep-everything is v1.1's conscious default, D-10).
- v2 **TEAM-07** (write-back automation deferral) is *resolved* rather than deferred: D-01 automates write-back in v1.1 as direct push. Remove/annotate TEAM-07 when REQUIREMENTS.md is next touched.
- No new scope-creep ideas surfaced — discussion stayed within phase scope.

</deferred>

---

*Phase: 7-Team Feedback Channel — Local Wiring*
*Context gathered: 2026-07-03*
