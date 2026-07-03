# Requirements: Agda MCP Server — v1.1 Feed the Loop

**Defined:** 2026-07-03
**Core Value:** Every real proof session reliably converts into a stronger server — v1.1 feeds the shipped Loop ② pipeline its first real cargo and wires up its permanent fuel inlets.

## v1.1 Requirements

Actors: the maintainer, internal teammates (trusted, consented), and AI coding agents (Codex, Claude Code) driving the server. Each requirement maps to a roadmap phase.

### Backlog Digestion (POLICY / REVERIFY)

- [ ] **POLICY-01**: ORCL-02's policy key is passed through at runtime — a `--policy` flag on `run-oracle.mjs`/`dogfood-wrapup.mjs` and/or consuming the task manifest's `policyKey` — replacing today's `.agda-lib` `name:`-only derivation. An unresolvable/mismatched policy **fails loudly** (never silently disables cheat auto-filing). Regression-tested against the real CHG mismatch (`Codex-Homotopy-Group` vs `codex-homotopy-group.json`) and verified on a **case-sensitive filesystem** (Linux container/CI) — macOS APFS masks the bug. (v1.0 audit headline W2; correctness prerequisite for all team-channel judging.)
- [ ] **REVERIFY-01**: All 8 `needsReverify` CHG defect specs in `test/fixtures/fix-queue.json` (v0.6.7-era measurements) are re-verified against current main through the shipped pipeline (replay + wrap-up oracle); every entry ends `confirmed` (fresh capture + verdict evidence) or closed as unreproducible (with evidence) — zero remain `needsReverify`. Closes deferred quick task `260702-29k`.
- [ ] **REVERIFY-02**: Confirmed live defects in the queue (the CHG-confirmed set — `agda_auto` CLI-flag leak, `agda_give` ok:true-wrapping-error, `agda_search_definitions` hardcoded `agda/` layout — plus whatever REVERIFY-01 confirms) are driven through the normal loop in QUEUE-02 priority order: fix → regression lock → queue `locked`. Every confirmed entry ends `locked` or explicitly re-triaged with a recorded reason — none silently stalled. (The loop's first sustained real workload.)

### Team Feedback Channel (TEAM)

Locked context (not re-litigated): internal colleagues only; one-time consent = the act of issuing a per-person revocable key, with a written statement of exactly what uploads; full-text logs, no redaction (trusted team); upload hook lives in the proxy/wrap-up layer, never in the published MCP server; GitHub Issues is NOT the ingest path.

- [ ] **TEAM-01**: Maintainer can issue a per-person revocable Bearer key with an `issue-key` script: generates the key, records it in a server-side key registry, and emits the written consent statement naming exactly what uploads (captures + runs + **full agent logs**). Revocation removes the key and takes effect on the next request. No key → uploader has zero network behavior.
- [ ] **TEAM-02**: Teammate's wrap-up can upload their session: `upload-run.mjs` packs `.agda-mcp/captures/` + `.agda-mcp/runs/` + the Claude Code project-log dir + this project's Codex session files (selected by project slug/mtime) into tar.gz (macOS AppleDouble metadata excluded), POSTs with the Bearer key, and is **fail-open**: no failure ever blocks or errors the teammate's work; failed uploads land in a bounded local retry queue (default: 20 archives / 2 GiB, drop-oldest with loud warning; env-tunable) retried on next invocation; optionally chained at `dogfood-wrapup.mjs` end.
- [ ] **TEAM-03**: A ~100-line `node:http` ingest endpoint (same code local and k8s; TLS terminates at nginx-ingress) authenticates the Bearer key, enforces a size cap (default 512 MiB compressed, env-tunable; oversize rejected with a clear error), and stores archives untouched by person/date/run-id under an env-configured storage root (local dir now, Ceph PVC after deploy). Logs are stored as archives and read on demand only — extraction happens at judge time, never at ingest.
- [ ] **TEAM-04**: Unattended cron judging digests uploads: safely extract (materialize-pattern path-sandboxing — never bare tar trust) → oracle triad → N-rerun flake gate → intake → fix queue as `new`, reusing the shipped wrap-up machinery with parameterized corpus-clone paths and policy keys so bundles from another machine don't silently abstain (closes the `agdaDirContents.libraries` absolute-path probe gap). Per-run INCONCLUSIVE/abstention rate is surfaced in the run summary — no human is watching otherwise.
- [ ] **TEAM-05**: A teammate can go zero → uploading with pinned-environment distribution via **git install**: an install script (or devcontainer) pins the exact server version (git tag) and exact Agda (`tooling/scripts/run-pinned-agda.sh`), with documented steps. No npm account anywhere in the flow.

### Prebuilt Interface Caches (CACHE)

Locked context: reshaped 2026-07-03 after a scope challenge — the GitHub-Releases pack/upload/fetch channel had **zero v1.1 consumers** (active teammates already have local builds; the oracle is cold by design; no CI requirement) and is deferred to v2 (CACHE-05). v1.1 ships the build primitive plus server-image prebake instead — the server directly uses prepared content; nothing is ever auto-downloaded; ORCL-01's cold replay stays untouched and always-cold (prebuilt caches serve live sessions, never the oracle).

- [ ] **CACHE-01**: An idempotent `ensure-corpus-built` script: given (exact `agda --version` × corpus `pinnedRef` × oracle-policy flags baseline — all three already pinned by existing SSOT files), builds the corpus `_build` interface cache on the current machine and skips when the key already matches; every run records measured build duration and on-disk cache size into a small manifest (the data that decides whether a distribution channel is ever worth building). Works on macOS and Linux; proven end-to-end on agda-stdlib; agda-unimath documented via the `caffeinate` background path. This is both the teammate "build once locally" official path and the primitive the image bake (CACHE-02) reuses. **No public-repo self-hosted runner** — heavy builds run locally or as a cluster-internal job (DEPLOY-02).
- [ ] **CACHE-02**: The server image pre-bakes prepared corpora: the DEPLOY container image layers pinned Agda + pinned corpus checkouts **with warm interface caches** built at image-build time via CACHE-01 (checkout and `_build` created in the same layer so Agda's mtime staleness check holds). Acceptance: inside the container, a warm load of a cached corpus module skips recompilation. Published to GHCR (layers handle storage/transfer/dedup — no bespoke distribution channel); consumed by the cluster jobs and available to any container-using teammate.

### Deployment (DEPLOY) — gated on server arrival (~2026-07-07)

- [ ] **DEPLOY-01**: The ingest endpoint + cron judge run on the JHU IDIES-style k8s server, containerized per the litellm-k8s-deploy pattern (GHCR image built `linux/amd64`, nginx-ingress path app with `proxy-body-size` raised to match the TEAM-03 cap, PVC storage root, Ceph-UID-correct securityContext). Local mode remains a working fallback; POLICY-01's case-sensitivity fix is re-verified on the cluster.
- [ ] **DEPLOY-02**: Corpus-cache/image builds are runnable as a cluster-internal job on the same server (resource requests sized for agda-unimath's >10 GB needs): running CACHE-01's script and baking/pushing the CACHE-02 image layers to GHCR — never wired to public-repo GitHub Actions. If cluster resources turn out not to permit the unimath build, the documented local-Mac build path (CACHE-01) is the accepted fallback (recorded, not silent).

### Residual Debt Sweep (DEBT) — from `milestones/v1.0-MILESTONE-AUDIT.md`

- [ ] **DEBT-01**: `scripts/verify-cold-replay.mjs` is resolved: deleted (default — superseded by ORCL-01, zero importers) or hardened per unexecuted plan 01-07 (CR-01 path traversal, CR-02 false-PASS); the decision and evidence are recorded.
- [ ] **DEBT-02**: The dead-ended `.agda-mcp/captures/index.json` write in `promote-capture.mjs` is retired and its stale header comment fixed (W1 — Phase 4 repointed `readDedupIndex` to the fix queue).
- [ ] **DEBT-03**: WR-01 durability edge: `resetRecordedActions()` moves to after successful `writeFileAtomic` in `register-capture-session.ts`.
- [ ] **DEBT-04**: Phase-5 Info findings fixed: IN-01 argv/run-id sanitization; IN-02 dangling-symlink handling in `install-dogfood-skill.mjs`; IN-04 `git check-ignore` exit-status ambiguity in its test; IN-05 wrapup catch-handler re-dereference.
- [ ] **DEBT-05**: Retroactive security review (`/gsd:secure-phase` → SECURITY.md) covering Phase 5's process-spawning scripts and extended to v1.1's new network surfaces (ingest endpoint, upload client).
- [ ] **DEBT-06**: `tsc -p tsconfig.test.json` seam errors fixed (ReplayManifest index signatures, `structuredContent` unknown) — the `.mjs` ↔ `.ts` fixture seams get compile-time enforcement.
- [ ] **DEBT-07**: `.planning/codebase/` map refreshed (24 drifted structural elements) via `/gsd:map-codebase`.

## v2 Requirements

Deferred. Tracked, not in the current roadmap.

### Cache — public channel

- **CACHE-03**: Public distribution channel: GitHub Releases opened to external users with build provenance/attestation (GitHub Artifact Attestations or equivalent), public CI builds, published checksums, README docs. TRUST-CRITICAL: `.agdai` files are unconditionally trusted by Agda — a poisoned interface can fake a checked proof. Hard-gated on the private channel being proven.
- **CACHE-04**: Oracle prewarm whitelist — allowing ORCL-01 cold replays to consume prebuilt *library* caches (fresh `_build` for the user's module only), scoped to standalone corpora (agda-stdlib, pinned agda-unimath; CHG/Hopf vendor unimath as a submodule and cannot be safely prewarmed without changing `buildFreshProbe`). Trigger: cron judging's INCONCLUSIVE/timeout rate on heavy corpora becomes the bottleneck.
- **CACHE-05**: Raw `.agdai` bundle pack/publish/fetch channel (GitHub Releases per-bundle tags, sha256 gates, 2 GiB split fallback, explicit post-extract mtime re-stamp) — the originally-scoped v1.1 design, deferred because it had no consumers. Trigger: a real non-container consumer appears (CI running unimath tests, external users) AND CACHE-01's measured sizes make distribution worthwhile.

### Team channel — scale

- **TEAM-06**: Archive retention/pruning policy for the person/date store (keep-everything is v1.1's recorded conscious default; revisit at volume).
- **TEAM-07**: Fix-queue write-back mechanism from the ingest server into the tracked git SSOT (direct push vs PR-per-batch) — v1.1 may run judge output through a manual review/pull step; automating write-back is deferred until volume demands.

### Carried forward from v1.0 (unchanged)

- **AUTO-01..08** (automation & intelligence: repro minimization, capture hints, recurrence views, knowledge accumulation, auto-PR, unattended loop orchestration over pinned fuel, ORCL-02 hard half, mechanized consistency probe) and **LOOP1-01** (Loop ① productization) — see `milestones/v1.0-REQUIREMENTS.md` for full text.

## Out of Scope

| Feature | Reason |
|---------|--------|
| npm publishing (PUB-01), external-user GitHub issue template (FEED-01), v1.0 tag push | Standalone items deliberately outside v1.1; run ad hoc via `/gsd-quick` |
| Remote-hosting the MCP server / shared dev host as primary answer | Rejected: agent-local file divergence, #39 single-session invariant, would recreate the staleness false-green class |
| Public cache channel before the private one is proven | Trust-critical (`.agdai` unconditionally trusted); needs provenance/attestation first (CACHE-03) |
| Self-hosted GitHub Actions runner on the public repo | Live security risk: public-repo PRs could execute code on the box holding ingest keys + colleague logs; cluster-internal jobs instead |
| Wiring prebuilt caches into ORCL-01 in v1.1 | Oracle is offline-batch by design; prewarm is a v2 refinement (CACHE-04) with a real correctness boundary |
| GitHub-Releases cache pack/fetch channel in v1.1 | Zero current consumers (teammates built locally, oracle forbidden, no CI need); deferred to v2 (CACHE-05) pending CACHE-01's measured size data |
| Dropping the server entirely (GitHub-inbox + Mac-only alternative) | Analyzed 2026-07-03 and offered; maintainer explicitly chose to keep the JHU k8s server plan, accepting two runtime environments and the ~07-07 dependency |
| Per-event consent prompts, log redaction/trimming | One-time key-issuance consent, trusted internal team (locked decision; Sentry precedent: attachments aren't scrubbed either) |
| GitHub Issues as ingest path | `fix-queue.json` stays SSOT; `mirror-github.mjs` remains optional post-triage visibility |
| Auto-download of caches by the server | Fetch is explicit/pull-only (mathlib `cache get` precedent) |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| — | — | — |

**Coverage:**
- v1.1 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19 ⚠️ (roadmap pending)

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-03 after initial definition*
