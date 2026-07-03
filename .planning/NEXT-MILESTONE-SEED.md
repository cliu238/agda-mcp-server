# Next Milestone Seed — "Feed the Loop" (v1.1 candidate scope)

Captured 2026-07-03 from post-v1.0 planning discussion. Input for `/gsd-new-milestone`
(questioning → research → requirements → roadmap). Items are candidates, not commitments.

## Theme 1 — Digest existing cargo (P0: first real workload for the shipped pipeline)

- **REVERIFY-01**: Re-verify the 8 `needsReverify` CHG defect specs in `test/fixtures/fix-queue.json`
  (v0.6.7-era measurements) against current main using the shipped wrap-up pipeline
  (`dogfood-run.mjs` + `dogfood-wrapup.mjs`). Confirmed → normal fix flow; not-reproducible → close.
  Also closes the deferred quick task `260702-29k-re-verify-chg-v0-6-7-defect-list-against`
  (see STATE.md Deferred Items).
- **W2 / POLICY-01** (headline tech debt from v1.0 audit): ORCL-02 runtime policy passthrough.
  Today the policy key derives only from the corpus root `.agda-lib` `name:`; a mismatch on the two
  agda-unimath-based corpora silently disables cheat auto-filing (still fails loudly as not-true-green,
  but never files). Fix: `--policy` flag on wrapup/run-oracle, or consume `policyKey` from the task
  manifest. Directly protects Theme 2's team-submitted corpora.

## Theme 2 — Team feedback channel (TEAM, deliberately minimal)

Decisions already made (do not relitigate in discuss-phase):
- Internal colleagues only; **one-time consent = the act of issuing a per-person revocable API key**,
  with a written statement of exactly what uploads (captures + runs + **agent logs full text**).
  No key → zero network behavior. No per-event prompts. NEVER extended to the public.
- Upload full project logs verbatim — no trimming, no redaction (trusted team). Claude Code logs are
  naturally scoped by project dir (`~/.claude/projects/<slug>/`); pick Codex session files for this
  project by session/mtime.
- Upload hook lives in the **recording proxy / wrap-up layer**, never in the published npm server
  (public package stays telemetry-free).
- GitHub Issues are NOT the ingest path. `fix-queue.json` remains the SSOT; `mirror-github.mjs`
  stays an optional post-triage visibility mirror (cron it if wanted).

Requirements sketch:
- **TEAM-01**: Consent + key issuance (per-person, revocable, attributable) + consent text.
- **TEAM-02**: `scripts/dogfood/upload-run.mjs` — tar/gzip `.agda-mcp/captures/` + `.agda-mcp/runs/`
  + Claude Code project log dir + Codex session files; Bearer key; **fail-open** (upload failure never
  blocks work; local queue + retry); optionally chained at wrap-up end.
- **TEAM-03**: Ingest entry (pick ONE, cheapest wins: private git inbox repo via deploy key, or a
  ~100-line HTTPS endpoint dropping into a bucket), archived by person/date. Cron: captures →
  oracle triad → N-rerun gate → intake → queue as `new` (unattended; reuses wrap-up machinery).
  Logs stored as archives, read on demand only. Oracle replay of uploaded sources runs in isolated
  temp dirs (existing materialize behavior — keep).
- **TEAM-04**: Pinned environment distribution (install script or devcontainer: exact server version,
  exact Agda via `tooling/scripts/run-pinned-agda.sh`). Version unification WITHOUT remote hosting.

## Theme 3 — Prebuilt interface-cache distribution (CACHE, chosen over shared-host / remote MCP)

Rationale: agda-unimath cold typecheck is ~hours + >10GB RAM; `.agdai` bundles keyed by
(exact Agda version × corpus SHA × flags baseline) are portable — proven publicly by nixpkgs
`agdaPackages`. All three key components are already pinned by `scripts/data/fuel-corpora.json` +
oracle-policy flag baselines + `package.json` version contract.

- **CACHE-01**: Build+publish pipeline: per (exact agda version × corpus SHA × flags) bundle,
  built on a **self-hosted runner** (GitHub free runners OOM on unimath), sha256 checksums.
- **CACHE-02**: `fetch-prebuilt-cache` script: exact `agda --version` gate + corpus SHA match +
  sha256 verify + graceful fallback to local build. Pull-only; the server NEVER auto-downloads.
- **CACHE-03** (deferrable): public channel via GitHub Releases + build provenance/attestation +
  README docs. TRUST-CRITICAL: `.agdai` files are unconditionally trusted by Agda — a poisoned
  interface can fake a checked proof. Public CI builds, published checksums, attestation are hard
  requirements before opening to the public.
- Oracle-policy detail to settle in discuss-phase: ORCL-01 cold replay keeps "fresh `_build`" for the
  user's module but may allow a **library-cache prewarming whitelist** (matches unimath CI practice).

Rejected alternatives (recorded so they stay rejected):
- Remote-hosting the MCP server itself (agent-local files diverge from server view; #39 single-session
  invariant needs a session-pool rework; file-sync latency would recreate the #64/#61 staleness
  false-green class the oracle was built to kill).
- Shared dev host as the primary answer (kept on file as a fallback option; cache distribution chosen
  because it also serves the future public path).

## Theme 4 — Residual debt sweep (P2, from v1.0 audit `milestones/v1.0-MILESTONE-AUDIT.md`)

- `scripts/verify-cold-replay.mjs`: harden per unexecuted plan 01-07 (path traversal CR-01,
  false-PASS CR-02) **or delete** (superseded by ORCL-01; zero importers).
- W1: retire the dead-ended `.agda-mcp/captures/index.json` write in `promote-capture.mjs`
  (Phase 4 repointed `readDedupIndex` to the fix queue) + fix its stale header comment.
- WR-01 durability edge: move `resetRecordedActions()` to after successful `writeFileAtomic`
  in `register-capture-session.ts`.
- Phase-5 Info findings: IN-01 argv/run-id sanitization; IN-02 dangling-symlink handling in
  `install-dogfood-skill.mjs`; IN-04 `git check-ignore` exit-status ambiguity in its test;
  IN-05 wrapup catch handler re-dereference.
- `/gsd:secure-phase` retroactive SECURITY.md (at least for Phase 5's process-spawning scripts).
- `tsc -p tsconfig.test.json` seam errors (ReplayManifest index signatures, `structuredContent`
  unknown) — give the `.mjs` ↔ `.ts` fixture seams compile-time enforcement.
- `/gsd:map-codebase` refresh (24 structural elements drifted).

## Standalone small items (can run outside the milestone)

- **PUB-01**: Publish `@cliu238/agda-mcp-server` to npm (account + 2FA + rename/version 0.7.0 +
  repository field → cliu238 repo + `npm publish`; tarball = dist only, no scripts/.planning).
- **FEED-01**: GitHub issue template for external users: attach `agda_bug_report_bundle` output or
  capture file + `AGDA_MCP_DEBUG=1` stderr snippet + `agda --version`.
- Housekeeping: `git push origin v1.0` (tag still local); installer already run for
  `.claude/skills/agda-dogfooding` on this machine (new clones: run
  `npx tsx scripts/dogfood/install-dogfood-skill.mjs` once).
