# Project Research Summary

**Project:** agda-mcp-server — v1.1 "Feed the Loop"
**Domain:** Internal engineering-loop feed mechanisms layered onto an already-shipped agent self-improvement loop (Loop ②) — a trusted-team feedback/artifact-upload channel, and a prebuilt Agda interface-cache (`.agdai`) distribution pipeline, built entirely in `scripts/`+ops tooling around an unchanged TypeScript MCP server
**Researched:** 2026-07-03
**Confidence:** HIGH

## Executive Summary

This research covers only the four **new** v1.1 capabilities layered on top of the already-shipped v1.0 Loop ② scaffold: a team feedback channel (TEAM-0x), prebuilt `.agdai` interface-cache distribution (CACHE-0x), the backlog-digestion fix that gates the first correctly (POLICY-01/W2), and a residual debt sweep the research explicitly did not re-cover. The single strongest conclusion, confirmed independently by both the stack and architecture research, is that **none of this requires a new npm dependency**: `node:http`, `node:crypto`, `node:zlib`, `node:stream`, `node:child_process`, the global `fetch`, plus the already-ambient `tar` and `gh` binaries cover the ~100-line ingest endpoint, the fail-open upload client, and the cache build/publish/fetch pipeline in full. The feature research independently validates the milestone's already-locked design choices by comparing them against mature reference ecosystems (Sentry/Mozilla Socorro for the team channel; nixpkgs/Lean-Lake/ccache/Bazel/Nix-Cachix for the cache) — every one of those systems converges on the same rules this project already chose: explicit, never-automatic cache fetch; exact-match keying with no fuzzy matching; independent content-hash verification; fail-open ingestion with judging deferred to after acceptance; and one-time, credential-derived consent rather than per-event prompts. Where the design doesn't yet match those references (no payload size cap, no retry-queue bound, no retention policy), the research flags these as explicit, load-bearing gaps for the requirements/planning step, not silent omissions.

Four facts recur across all four files and must anchor the roadmap. **First**, a strict dependency order exists: the ORCL-02 policy-key bug (POLICY-01/W2) — a case-mismatch between a corpus's `.agda-lib` `name:` field and its `scripts/data/oracle-policy/*.json` filename — is confirmed on disk today, and it is invisible on the maintainer's Mac only because default APFS is case-insensitive; on the Linux k8s judge this milestone is building toward, it fails outright and silently degrades team-submitted-corpus judging to "never files a cheat finding." It must be fixed **and verified on a case-sensitive filesystem** before any team-channel cron work is trusted. **Second**, the ingest endpoint and the cache-build machine are literally the same not-yet-arrived (~2026-07-07) JHU IDIES-style k8s server, so the entire build order is structured "locally verifiable on the Mac first, k8s deploy is a thin, late step" — every script in both new subsystems must prove itself with `node`/`tsx` locally before any manifest is written. **Third**, a self-hosted GitHub Actions runner for the cache-build workload is explicitly rejected while the repo (`InvariantHoldings/agda-mcp-server`) remains public — GitHub's own threat model treats this as a documented RCE path reachable by any external PR, and this project's own cluster-internal-Job pattern (already used for TEAM-03's cron) is the correct substitute, not a compromise. **Fourth**, `.agdai` bundles built on one machine and downloaded to another need an **explicit post-extraction `utimes()` re-stamp** — Agda's own freshness check is mtime-based, and a tar/GitHub-Releases round trip gives no cross-machine mtime guarantee, so a checksum-verified, "successfully" extracted cache can silently deliver zero speedup with nothing visibly wrong.

## Key Findings

### Recommended Stack

The stack conclusion is "zero new dependencies, reuse what's already ambient." Every capability needed for both new subsystems is reachable through Node.js core modules already covered by this project's `engines.node >=24` constraint, plus two CLIs already assumed present (`tar`, `gh`). All new code lives outside `src/` — the published npm package must stay dependency-light and telemetry-free; the upload hook belongs to the recording-proxy/wrap-up layer only. See STACK.md.

**Core technologies:**
- `node:http` — the ~100-line ingest endpoint in both local-Mac and in-cluster modes; TLS is never the app's job (loopback trust locally, nginx-ingress termination in k8s) — a routing framework (Express/Fastify) gains nothing for one route.
- `node:crypto` — `crypto.timingSafeEqual` for Bearer-key comparison (never `===`), streaming SHA-256 over every archive, `crypto.randomBytes` to mint per-person keys.
- `node:zlib` — gzip (Stable) and zstd (Experimental since Node v22.15.0/v23.8.0, unconditionally present on 24.x) for compressing tar streams; **never ask `tar` itself to compress** — split "archive structure" (system `tar`) from "compression" (Node's own zlib) so no system `zstd` binary (absent from stock macOS) is ever required.
- `node:stream` (`pipeline`) + `node:child_process` (`spawn`, never `execFileSync` for multi-GB data) — composing `spawn(tar) → zlib transform → fs stream` pipelines with bounded memory and correct error propagation.
- System `tar` (structure only) and `gh` CLI (already authenticated as `cliu238`) — `gh release create/upload/download` for cache bundle publish/fetch; no new credentials, no cloud-storage SDK.
- Global `fetch` (undici-backed, stable since ~Node 21) with `duplex:'half'` for streaming uploads — no `axios`/`node-fetch`/`got`.
- Docker `node:24-bookworm-slim`/`-alpine` — zero-npm-dependency image means the Dockerfile is a single `COPY`, no native-addon cross-build risk under QEMU.

**Hard platform constraint:** GitHub Releases caps each asset at 2 GiB (API/`gh` path; the 25 MB cap only applies to the web-UI path) and 1000 assets/release. agda-unimath's actual compiled `.agdai` bundle size was **not independently verified** this pass — treat 2 GiB as a real design constraint from day one (a part-splitting fallback, not a retrofit) rather than a distant hypothetical. Prefer one release tag per exact `(agda version × corpus SHA × flags)` key over `--clobber`-ing assets inside one long-lived release — `gh`'s own docs warn clobbered assets are deleted *before* the replacement upload, an unnecessary data-loss window this project doesn't need to accept.

### Expected Features

Comparison against mature reference systems (crash-reporter/telemetry-inbox ecosystems for the team channel; nixpkgs/Lean-Lake/ccache/Bazel/Nix-Cachix for the cache) shows this milestone's already-locked design matches table stakes almost feature-for-feature — strong validation, not a call to redesign. See FEATURES.md.

**Must have (table stakes, v1.1):**
- TEAM-01 — per-person revocable Bearer key + written consent text (credential-derived attribution is *stronger* than Sentry's self-reported client context; one-time consent matches the enterprise-managed, not public-anonymous, branch of every reference system).
- TEAM-02 — fail-open upload script (tar/gzip + Bearer auth + local retry queue) — judging must happen strictly after acceptance, never as an accept/reject gate, matching Socorro/Firefox exactly.
- TEAM-03 — ~100-line ingest endpoint + unattended cron judge that **reuses**, never rebuilds, the existing oracle triad/fix-queue dedup logic.
- TEAM-04 — pinned-environment git-install distribution (no npm) to remove environment-divergence noise before it reaches the oracle.
- POLICY-01/W2 fix — a correctness prerequisite for TEAM-03, not optional polish (see Executive Summary).
- CACHE-01 — build+publish pipeline with sha256 checksums, keyed on `(exact Agda version × corpus SHA × flags)` — the same coarse-but-correct grain nixpkgs uses; no reference system attempts fuzzy/partial matching for a correctness-critical cache.
- CACHE-02 — strict-gated fetch script (exact version + SHA + checksum match) with graceful fallback to a real local build on any miss — every reference system (Lake, Nix, ccache, Bazel) treats a cache miss as normal, never fatal, and none of them auto-fetch from inside the tool being cached.

**Should have (differentiators actually worth the extra cost):**
- Oracle-triad-verified team reports — no reference crash reporter independently re-executes/re-verifies a reported defect before surfacing it; routing team uploads through the same differential+soundness+conformance oracle gives them the same rigor as self-found bugs.
- Full-fidelity artifact upload (captures + runs + complete verbatim agent logs) — richer than any crash reporter's curated payload, deliberately justified by this project's specific interest in agent-behavior failure modes (narrowing, shortcuts, flag-planting).

**Defer / flagged gaps (add once triggered, not silently omitted):**
- Bounded local retry queue (max age/count) for TEAM-02 — trigger: first colleague hits an unreachable endpoint for more than a day.
- Payload size cap + defined reject-before-send behavior — trigger: before the first unusually large verbatim-log upload (foreseeable now, not hypothetical).
- Archive retention/pruning policy for TEAM-03 — trigger: PVC usage becomes visible, or before onboarding more than a handful of colleagues.
- CACHE-03 (public channel + build provenance/attestation, matching GitHub's 2026 move toward default SLSA attestation for public repos) and fine-grained per-file cache keying (Lean-style) — both explicitly v2+, trust-critical and/or unproven-need respectively.

### Architecture Approach

The governing pattern, re-affirmed for this milestone: **the loop wraps the server; it does not live inside it.** All four new components (upload client, ingest endpoint, cron judge, cache build/publish/fetch) are process tooling in `scripts/team/` and `scripts/cache/` (new siblings of `scripts/dogfood/`, `scripts/oracle/`, `scripts/queue/`) plus a new top-level `k8s/`/`Dockerfile` — `src/` is untouched. See ARCHITECTURE.md.

**Major components:**
1. **`scripts/dogfood/upload-run.mjs` (TEAM-02)** — tars/gzips captures+runs+agent logs, Bearer-authed POST, fail-open with a gitignored NDJSON retry queue (`.agda-mcp/team/upload-queue.jsonl`); chain with `;` after `dogfood-wrapup.mjs`, never `&&` (wrap-up sets a non-zero exit code on partial errors, which would otherwise skip the upload).
2. **`scripts/team/ingest-server.mjs` (TEAM-03)** — pure archival by `<person>/<date>/<runId>.tar.gz`, no judging; storage root resolved by one env var (`AGDA_MCP_TEAM_STORAGE_DIR`) so local-dir and Ceph-PVC modes are the *same code path*, differing only in the value of that variable.
3. **`scripts/team/cron-ingest-wrapup.mjs` (TEAM-03)** — imports `wrapUpCapture()`/`runOracle()`/`upsertQueueEntry()` directly (never re-invokes their CLIs), extracting each archive into an isolated `mkdtempSync` dir before judging.
4. **`scripts/cache/{build,publish,fetch-prebuilt-cache}.mjs` (CACHE-01/02)** — zero new pinning SSOT needed: `scripts/data/fuel-corpora.json` (corpus SHA), `scripts/data/oracle-policy/*.json` (flags), and a real `agda --version` probe (never `package.json`'s compatibility-ceiling field) supply all three cache-key components already.
5. **`k8s/*.yaml` + `Dockerfile` (new top-level dirs)** — ops-only, cloned from the `litellm-k8s-deploy` skill's Deployment/Service/Ingress/PVC shape; the ingest endpoint (small, always-on) and the cache-build workload (rare, one-shot, >10GB RAM) have incompatible resource profiles and must not share one Deployment's manifest.

**The one genuinely new schema addition:** neither the replay manifest nor the run report currently records *which* `fuel-corpora.json` key a session belongs to. Stashing a `taskManifestCorpora: string[]` field into `run-report.json` at recording time is what lets the unattended cron (no human to type `--policy <key>`) look up the correct `policyKey` and pass it through — the additive, backward-compatible fix to the exact same class of bug POLICY-01 is fixing at the root.

**The one resolved "keep it separate" design decision:** ORCL-01's disposable cold-replay tmp dir and the live-session "warm/shared" `.agdai` cache are different things and must stay different. A library-cache prewarm whitelist is safe and valuable for standalone corpora (agda-stdlib, standalone agda-unimath) but must **not** be extended into CHG/Hopf's replay path this milestone — those two corpora vendor agda-unimath inside their own project root, so their `_build/` is the same directory ORCL-01's coarse "no `_build` at all" freshness check inspects; pre-seeding it would make every replay against those corpora permanently `inconclusive`. Document this as a deliberate, known limitation, not a silent gap.

### Critical Pitfalls

Eleven documented; the five most load-bearing for sequencing and safety. See PITFALLS.md.

1. **The W2 policy-key bug recurs and is invisible on the maintainer's Mac** — case mismatch between `.agda-lib` `name:` and the policy filename convention silently "works" on case-insensitive APFS while failing outright on the Linux k8s judge. Fix the root cause (thread an explicit `policyKey` through rather than deriving it from a name string) and **verify with a case-sensitive-filesystem test**, not another local `npm test` run on the Mac.
2. **A "successful" cache fetch can silently recompile anyway** — checksum-verified, successfully-extracted `.agdai` bundles still trigger a full cold rebuild if source mtimes postdate the fetched interface mtimes. The fetch script must explicitly `utimes()` every extracted file and self-test that a subsequent `agda_load` actually completed in cache-hit time, not cold-build time.
3. **A self-hosted GitHub Actions runner on the public repo is a real, documented attack surface, not an infra detail** — it would be co-located with the ingest endpoint's Bearer-key secrets and archived colleague logs. Never register one against the public repo; drive CACHE-01 builds as a cluster-internal, operator/cron-triggered k8s Job instead, exactly the pattern already used for TEAM-03's judging.
4. **tar-based ingest is a path-traversal/decompression-bomb/disk-fill surface even from trusted colleagues** — `node-tar`'s own current CVE (hardlink-based traversal bypass, patched 7.5.3) shows a library's own guard isn't sufficient. Reuse this project's own already-proven `mkdtempSync` + `resolveFileWithinRoot`/`PathSandboxError` pattern (from `orcl-01-differential.mjs`) rather than trusting a tar library's guard alone, and cap cumulative decompressed bytes and request body size before any tar logic runs.
5. **Agda accepting a build's own output is not proof the build was correct** — `.agdai` files are unconditionally trusted by Agda; a build-pipeline bug (wrong SHA, stale clone, drifted flags) is invisible to "the build finished and Agda didn't complain." Before publishing, run the build pipeline's own output through an ORCL-01-style independent differential — the same doctrine this project already applies to agent-submitted proofs, just moved to a different producer.

## Implications for Roadmap

Research converges on a strict dependency order for the first phase and a "local-first, k8s-thin-and-late" shape for everything after. Team-channel and cache-distribution are logically independent subsystems (different files, different directories) that can be built in either order or in parallel, but both must reach "locally proven" before any k8s manifest is written, and both feed into one final late-packaging phase.

### Phase 1: Backlog Digestion — Policy-Key Fix First
**Rationale:** Every downstream correctness guarantee in Theme 2 depends on ORCL-02 resolving the right policy key; the bug is confirmed on disk today and is invisible on the maintainer's own dev machine (case-insensitive APFS masks it), so it must be fixed and proven on a case-sensitive filesystem before anything is built on top of the oracle path. This is the one place where every research file independently arrives at the same "must come first" conclusion.
**Delivers:** `--policy` passthrough plumbed through `run-oracle.mjs`/`dogfood-wrapup.mjs` (the low-level `judgeOrcl02` already accepts the override — it's pure CLI/options wiring); a unit test that asserts correct behavior via explicit case-sensitive string comparison, not filesystem happenstance; the 8 CHG `needsReverify` defect specs re-verified end-to-end through the now-fixed pipeline (REVERIFY-01), which doubles as a live validation of the fix itself.
**Addresses:** POLICY-01/W2, REVERIFY-01 (both P1 in FEATURES.md's prioritization matrix).
**Avoids:** Pitfall "W2 recurs and is invisible on the Mac"; the anti-pattern of "verifying a cross-platform bug only on the case-insensitive Mac."

### Phase 2: Team Feedback Channel — Local Wiring
**Rationale:** Build the upload client and ingest endpoint as a matched pair on localhost before any k8s dependency exists — they're two ends of one wire protocol and are cheapest to test together. Layer in the corpus-self-description field (`policyKey` passthrough into `run-report.json`) here since the cron judge needs it and it directly depends on Phase 1's fix being in place.
**Delivers:** `scripts/dogfood/upload-run.mjs` (fail-open, local NDJSON retry queue), `scripts/team/ingest-server.mjs` (local-mode `node:http`, `AGDA_MCP_TEAM_STORAGE_DIR` pointed at a scratch dir), `scripts/team/cron-ingest-wrapup.mjs` run manually against local storage, TEAM-01 key issuance + consent text, and an explicit decision on how the cron's `fix-queue.json` writes get back into the tracked repo (direct push vs. PR-per-batch — a genuine open design point, not an implementation detail).
**Addresses:** TEAM-01, TEAM-02, TEAM-03 (local mode).
**Uses:** `node:http`/`crypto`/`zlib`/`stream`/`child_process`, system `tar`, global `fetch` — zero new dependencies.
**Avoids:** tar path-traversal/decompression-bomb pitfall (reuse the proven `mkdtempSync`+path-sandbox pattern); the fail-open retry-storm pitfall (add a cheap upload-level dedup layer before the expensive oracle triad runs, ahead of the existing fingerprint-based queue dedup); audit `mirror-github.mjs`'s actual output content before ever cronning it against team-sourced entries (verbatim logs could carry an accidental secret).

### Phase 3: Cache Distribution — Local Pipeline
**Rationale:** Prove the whole build→publish→fetch mechanism on the small, fast, public agda-stdlib corpus first — a cheap end-to-end validation — before spending the large agda-unimath cold-build cost. This is also what turns the milestone's own ">10GB RAM" estimate from an assumption into a measured fact ahead of the later k8s resource request. Logically independent of Phase 2 (different files/directories); can run in parallel if resourced separately.
**Delivers:** `scripts/cache/build-cache.mjs` (real `agda --version` probe, full typecheck of the library's own entry module), `publish-cache.mjs` (`gh release`, zero new credentials), `fetch-prebuilt-cache.mjs` (strict version+SHA+checksum gate, explicit post-extraction `utimes()` re-stamp, graceful local-build fallback) — proven against agda-stdlib first, then repeated against agda-unimath.
**Addresses:** CACHE-01, CACHE-02.
**Uses:** `node:zlib` (gzip stable / zstd experimental, isolated behind one shared helper), `node:crypto` (sha256), `gh` CLI, system `tar` — zero new dependencies.
**Avoids:** the silent-no-op-cache pitfall (mandatory `utimes()` step + a load-timing self-test, not just a checksum check); the version-string-insufficient pitfall (prefer pinned build provenance via the existing `run-pinned-agda.sh` mechanism over trusting `agda --version`'s string alone); the `.agdai`-placement-non-determinism pitfall (assert/clear stray local-layout interfaces before writing the separated-layout bundle); the "Agda accepted it" over-trust pitfall (run an ORCL-01-style independent differential on the build's own output before publishing). Note early (for Phase 4's benefit): a self-hosted GitHub Actions runner is not an acceptable way to execute the heavy build while the repo is public — plan for a cluster-internal Job from the start rather than defaulting to `runs-on: [self-hosted, ...]`.

### Phase 4: Pinned-Environment Distribution + Thin k8s Deployment
**Rationale:** TEAM-04 packages the *outputs* of Phases 2 and 3 (the real upload URL, key mechanism, and cache-fetch script) into one fixed-clone-path convention, so it belongs after both are proven, not before. k8s deployment is pure packaging around already-locally-tested scripts and is explicitly gated on the physical server's ~2026-07-07 arrival — front-loading it would mean debugging application logic through a slow k8s deploy/redeploy cycle instead of fast local iteration. This is a late, thin phase by design, not an afterthought.
**Delivers:** TEAM-04's pinned-env installer/devcontainer (fixed clone-path convention, e.g. `~/.agda-mcp-fuel/<corpus-key>`, solving the fuel-corpus absolute-path portability problem structurally rather than per-machine); `k8s/*.yaml` (Deployment/Service/Ingress/PVC/Secret for the ingest endpoint, cloned from the `litellm-k8s-deploy` pattern) plus a **separate** cluster-internal Job/CronJob (not a registered GitHub Actions self-hosted runner) for cache builds with its own oversized memory request; re-running Phase 2/3's local tests against the real deployed endpoint before calling either theme "live."
**Addresses:** TEAM-04; the delivery constraint's "k8s deploy is a thin, late step."
**Avoids:** the self-hosted-runner-on-public-repo attack surface (resolved via cluster-internal Job); the resource-contention performance trap of judging-cron and cache-build sharing one node with no isolation.

### Phase 5: Residual v1.0 Debt Sweep
**Rationale:** This research pass deliberately did not re-cover Theme 4 — it is a fixed, already-fully-itemized P2 checklist from `milestones/v1.0-MILESTONE-AUDIT.md`, not a new capability needing feature/stack/architecture/pitfall research. It has no hard dependency on Phases 1–4 and can be sequenced wherever convenient, including interleaved with them.
**Delivers:** the P2 debt items — `scripts/verify-cold-replay.mjs` harden-or-delete, the `promote-capture.mjs` dead-code write retirement (W1), the `register-capture-session.ts` durability-ordering fix (WR-01), the Phase-5 info findings (IN-01/02/04/05), a retroactive `SECURITY.md` for Phase 5's process-spawning scripts, `tsconfig.test.json` seam-error cleanup, and a `/gsd:map-codebase` refresh.
**Addresses:** PROJECT.md's "Residual v1.0 debt sweep" Active requirement.

### Phase Ordering Rationale

- **Dependency-driven:** Phase 1 must lead because every subsequent team-channel judgment (Phase 2 onward) is only as correct as ORCL-02's policy-key resolution; sequencing team-channel work before the fix would silently reproduce the exact defect the v1.0 audit already found. Phase 4 must trail because TEAM-04 packages both Phase 2's and Phase 3's real outputs, and k8s deployment is gated on hardware that doesn't exist until ~07-07.
- **Independence-driven:** Phases 2 and 3 touch disjoint file trees (`scripts/team/` vs. `scripts/cache/`) and have no data dependency on each other — the suggested serial order reflects a single-developer sequencing preference from the architecture research, not a hard constraint; parallelize them if more than one contributor is available.
- **Risk-driven:** Front-load the cheapest, highest-leverage validation inside each subsystem — agda-stdlib before agda-unimath in Phase 3 (cheap proof of the whole pipeline before the expensive corpus); a manually-run local cron before an unattended k8s CronJob in Phase 2 (prove judging logic before removing the human).
- **Scope-driven:** Phase 5 is deliberately decoupled from the numbered dependency chain — it is bookkeeping/hardening work with a pre-existing, closed scope, not exploratory feature work, and should not block or be blocked by Phases 1–4.

### Research Flags

Phases likely needing deeper research or an explicit discuss-phase decision during planning:
- **Phase 2 (Team Feedback Channel):** the fix-queue write-back-to-git mechanism (direct push to `main` vs. a PR-per-batch from the cron) is an open architecture decision the research explicitly did not resolve — needs a discuss-phase conversation, not a default. The payload-size-cap, retry-queue-bound, and retention-policy gaps flagged in FEATURES.md also need concrete numbers decided here, even if the underlying pattern (a bound must exist) is settled.
- **Phase 4 (Pinned-Env + k8s Deploy):** genuine unknowns concentrate here and cannot be desk-researched further before the server exists — the actual k8s namespace name and PVC provisioning mode, the exact self-hosted-runner-alternative registration mechanism (persistent Deployment-style runner vs. ephemeral per-build Job vs. an equivalent controller), and confirmation of the Ceph PVC's backing-store mode (RBD vs. CephFS, which determines whether `fs.rename`-based atomic writes are safe). Flag for `/gsd:plan-phase --research-phase` once the server has actually arrived, plus an explicit taste/ergonomics decision on TEAM-04's exact fixed-clone-path convention.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1 (Backlog Digestion):** the root cause and fix location are already concretely identified (`judgeOrcl02` already accepts the override; it's pure plumbing) — the only requirement is a case-sensitive-filesystem test as a hard acceptance gate, which is a testing-methodology point, not an open research question.
- **Phase 3 (Cache Distribution):** every reference ecosystem studied (nixpkgs, Lean/Lake, ccache/sccache, Bazel) converges on the same design this project already chose; the one concrete empirical unknown (agda-unimath's actual bundle size vs. GitHub Releases' 2 GiB cap) is resolved by measurement during the stdlib-first build order, not further research.
- **Phase 5 (Debt Sweep):** already fully itemized by the v1.0 audit; standard maintenance/hardening patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every load-bearing claim (Node built-in capabilities, GitHub Releases limits, `gh` CLI syntax, Node LTS status, nginx-ingress defaults, macOS tar behavior) verified against official documentation, not asserted from training data. One inline MEDIUM: `node:zlib`'s zstd API remains Stability 1 (Experimental) — low blast radius since it's confined to `scripts/`, never `src/`. |
| Features | MEDIUM-HIGH | HIGH for nixpkgs derivation/signing mechanics, Bazel AC/CAS trust model, Sentry size/retention numbers, GitHub Release limits, and GitHub Artifact Attestation direction (all official docs). MEDIUM for Lean/mathlib's exact hashing internals and sccache's remote-backend trust model — pieced together from official docs + community sources rather than one authoritative deep source. |
| Architecture | HIGH | Integration points are grounded in direct reads of this repo's real shipped `scripts/`/`src/`/`test/fixtures/` code plus a real local corpus checkout (`~/projects6/Codex-Homotopy-Group`). Explicitly MEDIUM/LOW-flagged wherever a claim depends on the not-yet-provisioned k8s server or the not-yet-cloned Hopf repo (its exact library-vendoring style is unverified). |
| Pitfalls | HIGH | HIGH for `.agdai` relocatability/version/flag-consistency claims (official Agda docs + Agda's own issue tracker, cross-checked against this repo's empirically-verified `agdai-cache.ts`), the W2 case-sensitivity bug (read directly from source plus a real corpus file on disk), and the self-hosted-runner-on-public-repo risk (repo visibility checked live via `gh`). MEDIUM-HIGH for the `node-tar` CVE specifics. Explicitly LOW-MEDIUM flagged inline for the cabal-flags/build-provenance inference (reasoned, not directly documented). |

**Overall confidence:** HIGH — with individually-flagged MEDIUM/LOW pockets that are each low-blast-radius (confined to `scripts/`/ops tooling, never the published `src/` package) or explicitly gated on infrastructure that doesn't exist yet.

### Gaps to Address

- **agda-unimath's actual compiled `.agdai` bundle size is not independently verified** and could approach or exceed GitHub Releases' 2 GiB/asset cap. Phase 3's stdlib-first build order is designed to surface real numbers before the large corpus is attempted; have a part-splitting fallback (numbered part-assets) ready from day one rather than retrofitting it.
- **`autoformalizing-hopf`'s exact library-vendoring style is unverified** — only CHG's `.agda-lib` was read directly. This determines whether Hopf falls into the "vendored, oracle-replay-excluded-from-prewarm" bucket or the "genuinely external, prewarm-eligible" bucket; confirm once it's cloned, before finalizing the prewarm whitelist scope.
- **The fix-queue write-back-to-git mechanism is an open architecture decision**, not resolved by this research — the cron writes to a checked-out `fix-queue.json` on the ingest server, and getting that back into the tracked repo (direct push, PR-per-batch, or something else) needs an explicit choice during Phase 2 planning.
- **k8s namespace name and PVC provisioning mode are unknown until the server arrives** (~2026-07-07) — do not hardcode either into any manifest before confirming, per the `litellm-k8s-deploy` skill's own Lesson 14.
- **The cache-build workload's exact execution mechanism is undecided** — a persistent Deployment-style runner vs. an ephemeral per-build Job vs. an `actions-runner-controller`-equivalent all have different idle-cost/complexity tradeoffs; the "not a self-hosted GitHub Actions runner on the public repo" constraint is settled, but the concrete cluster-internal alternative is not yet chosen.
- **Ceph PVC backing-store mode (RBD vs. CephFS) is unconfirmed** — this determines whether `fs.rename`-based atomic writes are safe for the ingest endpoint's archive storage; verify before finalizing that write path.
- **TEAM-02/03's payload size cap, local-retry-queue bound, and archive retention/pruning policy remain unspecified** — every reference system studied (Sentry, Socorro) has all three; FEATURES.md flags these as concrete gaps to close in requirements, not hypothetical future work, since the "full verbatim log" upload policy makes an oversized session more likely than a typical crash report.
- **The cabal-flags/build-provenance drift risk (two Agda builds reporting the identical version string but built with different flags) is a reasoned inference, not a directly-documented failure case** — worth a defensive design choice (pin build provenance via the existing `run-pinned-agda.sh` mechanism) even without a confirmed historical incident in the Agda tracker.

## Sources

### Primary (HIGH confidence)
- [About releases — GitHub Docs](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) — per-asset (2 GiB) and per-release (1000 assets) limits.
- [Zlib — Node.js API docs](https://nodejs.org/api/zlib.html) — zstd API surface, version introduced, Experimental stability marking.
- `gh release create/upload/download` manuals (cli.github.com) — verified flag syntax, `--clobber` data-loss caveat.
- [ingress-nginx annotations reference](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/) — `proxy-body-size` default ~1 MB behavior.
- [nixpkgs `agda.section.md`](https://github.com/NixOS/nixpkgs/blob/master/doc/languages-frameworks/agda.section.md) and [NixOS Wiki Binary Cache](https://wiki.nixos.org/wiki/Binary_Cache) — derivation keying + signed-narinfo trust model.
- [Bazel Remote Caching docs](https://bazel.build/remote/caching) + [bazelbuild/bazel#4276](https://github.com/bazelbuild/bazel/issues/4276) — AC-vs-CAS trust distinction, "reproduce the input hash, poison the cache."
- [Sentry Size Limits](https://docs.sentry.io/concepts/data-management/size-limits/), [Sentry Attachments docs](https://docs.sentry.io/platforms/native/enriching-events/attachments/), [Socorro docs](https://socorro.readthedocs.io/en/latest/) — numeric caps, no-attachment-scrubbing, post-ingestion dedup.
- [GitHub Artifact Attestations docs](https://docs.github.com/en/actions/concepts/security/artifact-attestations) — attestation moving opt-in → default for public repos through 2026.
- `agda.readthedocs.io/en/latest/tools/interface-files.html`, Agda GitHub issues #7675 (open `toIFile` placement non-determinism) and #3949/#2610 (`_build` versioning rationale), `HACKING.md`'s `currentInterfaceVersion` guidance — all HIGH for the mechanism.
- `github.com/UniMath/agda-unimath` live `ci.yaml` — actual CI cache key composition.
- `github.com/isaacs/node-tar` advisory `GHSA-34x7-hfp2-rc4v`/`CVE-2026-23745` — current hardlink path-traversal bypass.
- `gh repo view InvariantHoldings/agda-mcp-server` — live-checked repo visibility (`isPrivate: false`), directly grounding the self-hosted-runner pitfall.
- Direct repo reads: `scripts/dogfood/*.mjs`, `scripts/oracle/*.mjs`, `scripts/queue/intake.mjs`, `scripts/data/fuel-corpora.json`, `scripts/data/oracle-policy/*.json`, `src/agda/agdai-cache.ts`, `src/agda/library-registration.ts`, `src/agda/session-capture/*.ts`, `package.json`, `.gitignore`, `.planning/PROJECT.md`, `.planning/NEXT-MILESTONE-SEED.md`, `milestones/v1.0-MILESTONE-AUDIT.md`.
- Direct reads, external: `~/projects6/Codex-Homotopy-Group/Codex-Homotopy-Group.agda-lib` + `.gitmodules`; `~/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md` (22 deployment lessons).

### Secondary (MEDIUM confidence)
- [mathlib4 README](https://github.com/leanprover-community/mathlib4/blob/master/README.md) / [Lake README](https://github.com/leanprover/lean4/blob/master/src/lake/README.md) — per-module Merkle-style cache hashing, pieced together from official-but-scattered sources.
- [ccache manual](https://ccache.dev/manual/latest.html) / [mozilla/sccache](https://github.com/mozilla/sccache) docs — compiler-identity mtime/size fallback weakness, no independent signing layer on remote backends.
- WebSearch corroboration (multiple independent hits, no single official Apple source) that `zstd` is absent from a stock macOS install.
- [MDN: Request.duplex](https://developer.mozilla.org/en-US/docs/Web/API/Request/duplex) / Chrome streaming-fetch docs — `duplex:'half'` requirement for streaming request bodies.

### Tertiary (LOW-MEDIUM confidence, needs validation)
- The cabal-flags/build-provenance drift scenario (Pitfall 2 in PITFALLS.md) — a reasoned inference from `currentInterfaceVersion` documentation, not a directly-documented failure case in the Agda tracker.
- Hopf's (`autoformalizing-hopf`) exact library-vendoring style — inferred by analogy to CHG's verified `.agda-lib`, not independently confirmed (repo not yet cloned locally).

---
*Research completed: 2026-07-03*
*Ready for roadmap: yes*
