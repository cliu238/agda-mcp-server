---
phase: 09
slug: residual-v1-0-debt-sweep
status: draft
threats_open: 0
asvs_level: 1
created: 2026-07-04
---

# Phase 09 — Residual v1.0 Debt Sweep — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

## Scope

This is a **retroactive consolidation**, not new threat discovery. It satisfies **DEBT-05** (`.planning/milestones/v1.0-MILESTONE-AUDIT.md`): no `SECURITY.md`-shaped artifact existed for any phase despite `workflow.security_enforcement: true`. Per **D-01**, this phase runs after Phase 7 landed the team-feedback network surfaces, so DEBT-05's scope is extended to cover Phase 5 (process-spawning dogfooding/oracle scripts) **and** Phase 7 (ingest endpoint, upload client, cron judge write-back) in one pass, rather than reviewing Phase 5 alone and leaving Phase 7 for later. Per **D-08**, the repo-root `SECURITY.md` is a vulnerability-*disclosure* policy and does not satisfy this requirement — this is a distinct, phase-scoped threat-model artifact.

Every threat below was already identified, mitigated, and verified during Phase 5's and Phase 7's own planning/review/verification cycles (each `05-0N-PLAN.md` / `07-0N-PLAN.md`'s own `<threat_model>` block, `07-REVIEW.md`'s resolved Critical/Warning/Info findings, and both phases' `*-VERIFICATION.md`). This document reads and synthesizes; it does not re-derive new threats.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Local process spawning (dogfooding/oracle scripts) | Phase 5's `dogfood-run.mjs` proxy, the oracle differential/soundness-hygiene scripts, capture-promotion, and the one-shot skill-install script spawn or relay to local child processes on the same machine, same operator — no network/remote input crosses this boundary. Risk is entirely local: a second concurrent `AgdaSession`, an orphaned Agda child, a shell-string-injected spawn, or a clobbered pre-existing file. | Task-manifest strings, run transcripts/capture JSON (may embed private-corpus source), CLI argv/flags, fix-queue entries, filesystem symlinks |
| Teammate's local machine -> network -> ingest server | Phase 7's upload client (`scripts/dogfood/upload-run.mjs`) sends a teammate's compressed run archive over a network hop (loopback/LAN in v1.1 local mode) to the ingest HTTP server (`scripts/team/ingest-server.mjs`), authenticated via a Bearer key issued by the key registry (`scripts/team/issue-key.mjs`). | Compressed archive bytes (agent logs + captures, full fidelity, no redaction), Bearer token, person/runId path components |
| Ingest server's local storage root | The ingest server persists accepted archives under a person/date/runId-derived path inside its storage root; the cron judge (`scripts/team/cron-ingest-wrapup.mjs`) later extracts, judges, and writes verdicts back into the tracked fix-queue via an automated git commit (and, outside dev mode, push) using the operator's own local git credential. | Extracted archive contents (captures/logs/manifests), judged ORCL-01/ORCL-02 verdicts, automated git write-back to the fix-queue on `main` |

---

## Threat Register

### Phase 5 — Dogfooding Orchestration & Fuel (`05-dogfooding-orchestration-fuel`)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01-01 | Tampering | `scripts/data/fuel-corpora.json` / `oracle-policy/*.json` | mitigate | zod schema validation (`fuelCorpusEntrySchema` / the existing unchanged `oraclePolicySchema`) rejects a malformed shape at load time; `pinnedRef`'s 40-hex-char regex specifically rejects a truncated SHA or a bare tag/branch name that could otherwise resolve ambiguously across time. | closed |
| T-05-01-02 | Tampering | a future task-manifest JSON's `corpus`/`target`/`expectedSignature` string fields | accept | These are free-form strings validated only for non-emptiness — none are resolved into a filesystem path anywhere in this plan's code, so there is no path-traversal surface here. The actual path-resolving consumer, `loadOraclePolicy`, already carries the CR-01 bare-filename regex fix and is reused unchanged by later plans. | closed |
| T-05-01-03 | Repudiation | `scripts/dogfood/task-manifest.mjs`'s thrown errors | accept | This library function never writes to disk or mutates state — a thrown Error is the complete, correct behavior; no audit trail is needed beyond the caller's own stderr output (Plan 05-02). | closed |
| T-05-02-01 | Tampering | `dogfood-run.mjs`'s child spawn | mitigate | `spawn(options.command, options.args, {...})` — always the argv-array form, never a shell string; `corpusRoot`/`manifestPath` flow through as discrete argv elements via `buildHarnessServerParameters`, never string-concatenated into a command. | closed |
| T-05-02-02 | Elevation of Privilege | a second `AgdaSession` inside the proxy | mitigate | `dogfood-run.mjs`/`transcript-writer.mjs` never import `AgdaSession` — enforced by an automated, anchored source-text regex test, not merely a header comment. | closed |
| T-05-02-03 | Information Disclosure | the unbounded transcript / run report echoing tool-call arguments from a potentially private target corpus | mitigate | Written only under gitignored `.agda-mcp/runs/` (D-05); the runbook (Plan 05-04) states this explicitly so the maintainer knows never to `git add -f` it. | closed |
| T-05-02-04 | Denial of Service | an ungracefully-terminated proxy leaking an orphaned Agda child process | mitigate | `runDogfoodProxy`'s finalize path always calls `child.kill()` before `process.exit`, mirroring `cold-agda-session.mjs`/`mcp-local-client.mjs`'s established convention. | closed |
| T-05-02-05 | Tampering | `promoteCapture`'s dedup-index write, triggered per detected capture | closed (component removed 2026-07, DEBT-02) | Originally `accept` — reused the existing, already-reviewed `scripts/promote-capture.mjs` unchanged (no new write path introduced by 05-02). Superseded by this consolidation: sibling plan 09-01 (same phase, DEBT-02) deletes `scripts/promote-capture.mjs` and its dedup-index write outright this same wave, so the component this threat concerned no longer exists in the codebase. | closed |
| T-05-03-01 | Information Disclosure | private-corpus source flowing from a `CaptureArtifact` into a filed `FixQueueEntry` | mitigate | `buildQueueEntryFromVerdict` copies only summary-level scalar fields (`fingerprint`/`title`/`summary`/`affectedTool`/`triageClass`) — `fixQueueEntrySchema` has no field shaped to hold `recordedActions`/`inlinedFirstPartySources`, so there is no accidental verbatim-copy path (Phase-4 D-11 inherited). | closed |
| T-05-03-02 | Tampering | `materializeCaptureEnvironment`'s temp-dir writes during each of the N replay iterations | accept | Reused unchanged from `orcl-01-differential.mjs`, which already resolves every inlined path via `resolveFileWithinRoot` (CR-01-hardened) — no new write path is introduced by this plan. | closed |
| T-05-03-03 | Repudiation | a real, independently-confirmed ORCL-02 cheat silently dropped because a co-occurring ORCL-01 signal's N-rerun flake-classifies as unstable | mitigate | The filing gate checks `orcl02.kind === "cheat-flagged"` first and unconditionally, before ever evaluating `orcl01`'s flakiness — an ORCL-02 finding always files, independent of a co-occurring ORCL-01 N-rerun outcome (proven by an automated test). A pure ORCL-01 flaky classification is instead always appended to the gitignored side-channel file (never silently discarded); the wrap-up summary tallies filed/flaky/not-a-candidate counts so a non-zero flaky count stays visible. | closed |
| T-05-03-04 | Repudiation | an environment abstention (ORCL-01 INCONCLUSIVE) misfiled as a confirmed "server bug" defect | mitigate | The filing gate checks the explicit `orcl01.kind === "server-false-green-candidate"` / `orcl02.kind === "cheat-flagged"` signal, never the bare `!trueGreen` shortcut — an INCONCLUSIVE/skip/no-policy verdict is always a no-op, proven by an automated test. | closed |
| T-05-04-01 | Tampering | `install-dogfood-skill.mjs` overwriting a pre-existing non-symlink `.claude/skills/agda-dogfooding` | mitigate | `lstatSync` type-checks the target before acting; a real pre-existing file/directory is left completely untouched (`action: "skipped-existing-non-symlink"`), proven by an automated test, never blindly clobbered by `symlinkSync`. | closed |
| T-05-04-02 | Information Disclosure | SKILL.md prose accidentally embedding real source/credentials from the two private fuel corpora | accept | SKILL.md references only corpus keys/repo names already public in `FUEL-CORPORA.md`/`fuel-corpora.json` — no source excerpts from `Codex-Homotopy-Group` or `autoformalizing-hopf` are pasted into this Skill. | closed |

### Phase 7 — Team Feedback Channel (`07-team-feedback-channel-local-wiring`)

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-07-01 | Information Disclosure | `scripts/team/issue-key.mjs` registry writes | mitigate | Store `sha256(key)` only, never the raw key (D-13); raw key printed to stdout exactly once at issuance, never logged/persisted anywhere else. | closed |
| T-07-02 | Tampering | `scripts/team/data/team-keys.json` file permissions | mitigate | `chmod(keysPath, 0o600)` after every write — unreadable by other local users. | closed |
| T-07-03 | Spoofing | Stale/cached registry read allowing a revoked key to keep authenticating | mitigate | `readKeyRegistry` always re-reads from disk; no in-memory cache anywhere in this module — revocation is effective on the consumer's very next lookup. | closed |
| T-07-04 | Information Disclosure | Timing side-channel on Bearer comparison | mitigate | `crypto.timingSafeEqual`, never `===`, per D-13. | closed |
| T-07-05 | Tampering | `.gitignore` omission accidentally commits the secret registry | mitigate | Explicit literal `.gitignore` entry added, verified via grep in acceptance_criteria. | closed |
| T-07-06 | Tampering | AppleDouble/`.DS_Store` junk leaking local filesystem metadata into the uploaded archive | mitigate | `COPYFILE_DISABLE=1` on the tar child + explicit `--exclude=.DS_Store --exclude=._*`, verified by a pack-then-extract round-trip test. | closed |
| T-07-07 | Denial of Service (against the teammate's own workflow) | A hanging/slow upload blocking the dogfood session | mitigate | Fail-open try/catch around the whole upload attempt (D-12); a stuck `fetch` degrades to "queued for retry" rather than hanging the caller indefinitely. | closed |
| T-07-08 | Information Disclosure | Full verbatim agent logs + captures stored unencrypted in the local retry-queue pending directory | accept | Locked context: trusted internal team, one-time consent, full-fidelity logs by design (no redaction) — matches the Sentry precedent cited in RESEARCH.md. | closed |
| T-07-08b | Information Disclosure | `scripts/dogfood/upload-run.mjs`'s retry-queue NDJSON entries | accept | Same local, single-user trust boundary as T-07-08 (trusted internal team, one-time consent, full-fidelity by design); explicitly re-affirmed here per 07-02-SUMMARY.md's own flag that the plan's literal field list omitted the `key` field from its accepted-disclosure enumeration. Retry-queue NDJSON entries store the plaintext `AGDA_MCP_TEAM_UPLOAD_KEY` (not just `url`/`runId`) alongside the already-accepted full-fidelity logs/captures living in the same `.agda-mcp/team/` local directory. **New row added by this consolidation — not present as its own ID in any Phase 7 source plan.** | closed |
| T-07-09 | Repudiation | No record of why an upload failed | mitigate | Retry-queue NDJSON entry records `ts`, `runId`, `error` for every failure, inspectable later. | closed |
| T-07-SC | Tampering (supply chain) | npm/pip/cargo installs | n/a | Zero new npm dependencies added by 07-02 (`node:child_process`, `node:zlib`, `node:stream`, `node:fs`, global `fetch` only) — Package Legitimacy Gate not triggered. | closed |
| T-07-10 | Spoofing | Forged/missing/revoked Bearer token | mitigate | `verifyBearerToken` (07-01) via `crypto.timingSafeEqual`, checked before any body read; registry re-read fresh per request so revocation is immediate. | closed |
| T-07-11 | Tampering | Path traversal via person/runId in the storage path | mitigate | `person` is always derived from the authenticated registry entry, never a client header; `runId` is allowlist-validated (`^[A-Za-z0-9._-]+$`) before use; final path built via `resolveFileWithinRoot`. | closed |
| T-07-12 | Denial of Service | Oversized or slow-streamed body exhausting memory/disk | mitigate | `Content-Length` pre-check (fast path) + streamed `createByteCounterGuard` Transform (catches an absent/lying Content-Length) — both enforced before the body is fully buffered; temp file cleaned up on breach. | closed |
| T-07-13 | Tampering | Archive extracted/executed at ingest time | mitigate | This endpoint never extracts — it only ever streams bytes to a temp file and renames; extraction is exclusively 07-05's sandboxed job. | closed |
| T-07-14 | Elevation of Privilege | Server accidentally bound beyond loopback, exposing it on the LAN/internet | mitigate | Default bind host `127.0.0.1`; a non-default `AGDA_MCP_TEAM_INGEST_HOST` is an explicit, documented opt-in only. | closed |
| T-07-15 | Repudiation | No record of accepted/rejected requests | accept | Out of scope for the ~100-line budget in v1.1 local mode; the stored path itself (person/date/runId) is the primary audit trail; revisit if abuse is observed. | closed |
| T-07-16 | Tampering (of intent) | Upload chaining accidentally masking/overwriting a real judging-error exit code | mitigate | `chainUploadRun` is called strictly after the `summary.errors > 0` exit-code branch and never reassigns `process.exitCode` itself — proven by a dedicated test. | closed |
| T-07-17 | Information Disclosure | `taskManifestCorpora` recording which internal corpus a run targeted | accept | Low sensitivity — an internal `fuel-corpora.json` key name, not secret content; consumed only by the local unattended judge (07-05). | closed |
| T-07-18 | Tampering | tar-slip / path-traversal / symlink escape during extraction | mitigate | Two independent layers: pre-extraction listing rejection of absolute/`..` entries, and post-extraction `resolveExistingPathWithinRoot` realpath containment re-check — never bare tar trust, per PITFALLS.md Pitfall 6. | closed |
| T-07-19 | Denial of Service | Decompression bomb inflating far past the 512 MiB ingest cap | mitigate | `DEFAULT_MAX_DECOMPRESSED_BYTES` ceiling (5 GiB) enforced during extraction via a 500ms scratch-dir size watcher that SIGKILLs tar on breach, plus a post-extraction walk re-check as a second layer — archive rejected and scratch dir removed on breach in both layers. | closed |
| T-07-20 | Elevation of Privilege | The git write-back credential (repo push access to `main`) | accept (local mode) | Phase 7 runs with the operator's own already-trusted local git credential; D-01 explicitly notes Phase 8 must scope a service credential minimally (fine-grained PAT/deploy key) — flagged for that phase's DEBT-05 security review, not re-litigated here. This consolidation re-affirms the disposition for local mode only. | closed (local-mode scope only; remains open for Phase 8 — see Accepted Risks Log) |
| T-07-21 | Repudiation | An automated commit lands on `main` with unclear provenance | mitigate | Commit message names the finding count and that it came from the unattended cron judge; recovery path is `git revert` (D-01); `--no-push` dev flag avoids polluting remote history during iteration. | closed |
| T-07-22 | Tampering | An unresolvable/mismatched policyKey silently degrading cheat-detection for an uploaded corpus | mitigate | `resolveCronPolicyKey` only ever returns a value on an exact, unambiguous `fuelCorpora[].key` match; `wrapUpCapture`/`runOracle`/`judgeOrcl02` (all unchanged, Phase 6) already throw `PolicyResolutionError` uncaught for an explicitly-requested-but-unresolvable key — loud, never silent (D-03), inherited automatically since this plan never re-derives from `.agda-lib`. | closed |
| T-07-23 | Information Disclosure | Upload key/URL visible in the human's own shell history/env during the live session | accept | Local, trusted, single-operator machine (D-06); the key is scoped to `eric` and revocable via `issue-key.mjs revoke` immediately after the acceptance run if desired. | closed |
| T-07-24 | Repudiation | This E2E run's own automated commit landing on the real tracked branch | accept | This is D-01/D-02's intended behavior for the acceptance run specifically (real commit+push path, not `--no-push`); recovery is `git revert` if the outcome is ever wrong. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-07-20 | Git write-back credential scope: Phase 7 runs with the operator's own already-trusted local git credential (repo push access to `main`), accepted for **local mode only**. Carried forward verbatim from the source row's own words: "D-01 explicitly notes Phase 8 must scope a service credential minimally (fine-grained PAT/deploy key) — flagged for that phase's DEBT-05 security review, not re-litigated here." **This remains OPEN for Phase 8's k8s deployment (the JHU k8s ingest/cache-build server) — not resolved by this consolidation.** Phase 8's own DEBT-05-equivalent review must scope its service credential before assuming any git-write-back capability. | Phase 7 planning (07-05-PLAN.md); re-affirmed by Phase 9 consolidation | 2026-07-04 |
| AR-02 | T-07-08b | Plaintext `AGDA_MCP_TEAM_UPLOAD_KEY` stored in retry-queue NDJSON entries (`scripts/dogfood/upload-run.mjs`) shares T-07-08's already-accepted local, single-user, full-fidelity trust boundary (trusted internal team, one-time consent). Explicitly re-affirmed per 07-02-SUMMARY.md's own Threat Flags note that the original plan's literal field list did not name `key`. | Phase 9 consolidation (this document) | 2026-07-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| {YYYY-MM-DD} | {N} | {N} | {N} | {name / agent} |

---

## Source Documents (Provenance)

- `.planning/milestones/v1.0-phases/05-dogfooding-orchestration-fuel/05-01-PLAN.md` through `05-04-PLAN.md` (each `<threat_model>` block) and `05-VERIFICATION.md`
- `.planning/phases/07-team-feedback-channel-local-wiring/07-01-PLAN.md` through `07-06-PLAN.md` (each `<threat_model>` block) and `07-VERIFICATION.md`
- `.planning/phases/07-team-feedback-channel-local-wiring/07-02-SUMMARY.md` (Threat Flags section — source of T-07-08b)
- `.planning/phases/07-team-feedback-channel-local-wiring/07-REVIEW.md` (resolved Critical/Warning/Info findings — CR-01, WR-01..WR-10, IN-01..IN-04 — corroborating that Phase 7's network surfaces were independently code-reviewed, not merely self-attested)

---

## Sign-Off

- [ ] All threats have a disposition (mitigate / accept / transfer)
- [ ] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** pending
