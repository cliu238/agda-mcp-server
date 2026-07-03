# Feature Research

**Domain:** Internal engineering-loop feed mechanisms — (a) trusted-team feedback/artifact-upload channel, (b) prebuilt compiler/interface-cache distribution. Analog domains surveyed: crash-reporter / internal-telemetry-inbox systems (Sentry, Mozilla Socorro/Firefox); compiler- and proof-assistant-cache ecosystems (Lean 4 mathlib `lake exe cache get`, nixpkgs `agdaPackages` + `cache.nixos.org`, ccache/sccache, Bazel/Gradle remote build caches, Coq/Rocq + Cachix).
**Researched:** 2026-07-03
**Confidence:** MEDIUM-HIGH overall (HIGH for nixpkgs derivation/signing mechanics, Bazel AC/CAS trust model, Sentry size/retention numbers, GitHub Release limits, GitHub Artifact Attestation direction; MEDIUM for mathlib's exact hashing internals and sccache's remote-backend trust model, pieced together from official docs + community sources rather than one authoritative deep source)

This milestone (v1.1 "Feed the Loop") adds two genuinely new feature areas to an already-shipped Loop ② scaffold: a **TEAM** feedback channel (colleagues' proof sessions → fix queue) and a **CACHE** distribution channel (prebuilt `.agdai` bundles → fast corpus startup). Neither has a market "competitor" in the product sense — the useful comparison is against **how mature reference systems in adjacent ecosystems solve the same structural problem**. Both reference ecosystems turn out to converge on the same few hard-won rules; where this project's design already matches them, that is strong validation. Where it doesn't (yet), that's flagged as a gap for requirements-scoping. (v1.0's already-built Loop ② scaffold — capture tool, oracle triad, capture→regression lock pipeline, fix queue, dogfooding runbook, fuel manifest — is out of scope for this research; see the archived v1.0-era research if needed.)

## Feature Landscape

### Table Stakes — (a) TEAM feedback channel

Features every reference system (crash reporters, internal telemetry inboxes) treats as non-negotiable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Credential-derived attribution (TEAM-01) | Every reference system attributes an event to a source — Sentry via SDK-attached release/user context, Socorro via build/channel metadata, ours via the per-person Bearer key itself | LOW | Stronger than most: attribution comes from *which key authenticated the request*, not a self-reported field in the payload — harder to spoof than Sentry's client-declared `user` context |
| One-time, credential-gated consent (TEAM-01) | Universal pattern for **enterprise/internal** tools with a pre-existing trust relationship: Sentry SDK init/DSN config is a one-time step; enterprise-managed Firefox sets crash-reporter consent silently via policy (`policies.json`), not per-crash | LOW | Contrast: **public/anonymous** Firefox shows a per-crash "Tell Mozilla" dialog *because there is no prior relationship with a random user* — that constraint doesn't apply here (internal, keyed, consented colleagues), so collapsing to one-time consent is the correct call, not a shortcut |
| Fail-open ingestion, judge after acceptance (TEAM-02/03) | Socorro's processor performs signature/dedup grouping *after* a crash is accepted, never as an accept/reject gate; Firefox's Breakpad reporter always accepts the local crash and separately tracks delivery state | LOW (already decided) | Matches "fail-open upload… local retry queue" exactly |
| Local pending/retry queue on upload failure (TEAM-02) | Firefox's crash reporter literally keeps `pending/` and `submitted/` subfolders — a crash is never lost just because the network call failed | MEDIUM | Needs a *bound* (age or count cap) — see Anti-Features/gaps below; Firefox's own pending folder is unbounded in practice, which is a known minor pain point, not a model to copy blindly |
| Dedup/grouping computed post-ingestion, reusing existing logic (TEAM-03) | Sentry fingerprint rules and Socorro's stack-signature generation both run *inside the processing pipeline*, not at the network edge | LOW (fully reused) | This is **already built** — `bug-report.ts` fingerprinting + the fix-queue's existing dedup. TEAM-03's cron only needs to point the *existing* oracle triad + N-rerun anti-flake gate at a new archive location, not reimplement judging |
| Isolated/sandboxed replay of ingested artifacts (TEAM-03) | Bazel's hermeticity discipline (never execute an action against ambient/shared state) is the general form of this; crash-reporter analogs don't need it (they don't *re-execute* anything), but our oracle triad does | LOW (already exists) | Already covered by the existing "materialize into isolated temp dir" behavior — explicitly called out in the seed as "keep" |
| Archival partitioning by identity + time (TEAM-03) | Sentry/Socorro both store events keyed by project/build + timestamp for later retrieval | LOW | Matches "archived by person/date" |
| Explicit, non-public ingest surface (TEAM-03) | Neither Sentry nor Socorro use a general-purpose issue tracker as the raw ingest surface — both front a purpose-built ingest API and only use ticket-like UIs on the *output/triage* side | LOW | Validates the decision that GitHub Issues is NOT the ingest path; `fix-queue.json` (ticket-like output) stays the SSOT |
| Written scope-of-collection statement at consent time (TEAM-01) | Every reference system ships some form of "what we collect" disclosure — Sentry's data-scrubbing docs, Firefox's crash-report contents page | LOW | Matches "written statement of exactly what uploads" |

### Table Stakes — (b) CACHE distribution

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Exact-match keying on ALL correctness-relevant inputs before considering a hit (CACHE-01/02) | Universal across every system studied: nixpkgs derivation hashes cover compiler version + source hash + dependency hashes + build flags; Lean's Lake keys per-file on content + transitive import hashes + toolchain; ccache hashes source/includes + flags + compiler identity — **none of these systems attempt fuzzy/partial matching for a correctness-critical cache** | LOW (already the design) | Confirms `(exact Agda version × corpus SHA × flags baseline)` is the *correct* grain of "exact," not over-engineering |
| Independent content-hash verification of the fetched payload itself, not just the lookup key (CACHE-01/02) | Bazel's own docs are explicit: its input-addressed Action Cache is *not* verified ("if you can reproduce the hash of the inputs you can poison the cache") — only its content-addressed CAS is self-verifying by checking the digest of what it downloads. Nix goes further with cryptographically signed `narinfo` | LOW (already the design) | The milestone's sha256 checksum on the bundle is the CAS-style layer Bazel shows is mandatory — this is table stakes, **not** gold-plating |
| Explicit, separately-invoked fetch — never triggered from inside the compiler/session process (CACHE-02) | All four reference systems keep the "does this exist in a cache?" check *outside* the tool being cached: `lake exe cache get` is a distinct command; Nix substitution happens during an explicit `nix build`; ccache/sccache wrap the compiler invocation rather than modifying the compiler; opam/Cachix require an explicit `nix build`/`opam install` | LOW (already the design) | Directly validates "the server never auto-downloads" against every reference system — none of them have the underlying compiler/typechecker itself reach out to a cache mid-session either |
| Graceful fallback to a real local build on any miss or mismatch (CACHE-02) | Universal: Lean's "files not found in cache" still builds locally (diagnosed as "local checkout diverged from upstream"); ccache miss just compiles; Nix substitution failure falls back to building the derivation from source | LOW (already the design) | No reference system treats a cache miss as fatal |
| Published checksums alongside the artifact (CACHE-01) | Standard release-engineering practice; Nix's narinfo goes further (signed), but even unsigned published checksums are baseline | LOW (already the design) | — |
| Version string checked directly against the real tool (`agda --version`), not inferred from a wrapper's mtime/size (CACHE-02) | ccache's documented weak point: when the compiler is invoked through a wrapper, ccache falls back to hashing the wrapper's mtime+size, which silently misses real compiler upgrades | LOW (already the design, reassurance not a gap) | The fetch script's plan to call `agda --version` directly sidesteps ccache's exact documented failure mode |
| Whitelisted "library cache may be prewarmed, module under test must be fresh" boundary (CACHE-02 ↔ ORCL-01) | Mirrors agda-unimath's own CI practice (prewarm library dependency caches, still freshly typecheck the file under review) | MEDIUM | **Load-bearing correctness dependency, not just a nice-to-have**: getting this boundary wrong reintroduces exactly the transitive-staleness false-green class the oracle triad was built to kill (`ORACLE-VALIDITY.md`, #64/#61 lineage). Must be scoped precisely in requirements, not left implicit |

### Differentiators — (a) TEAM feedback channel

Features that go beyond what the reference systems require, but are genuinely valuable given this project's specific loop.

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Oracle-triad-verified team reports (TEAM-03) | Most crash-reporter/telemetry systems only *group and display* — Sentry and Socorro never independently re-execute/re-verify that a reported crash is real before surfacing it. Routing team uploads through the *same* differential + soundness-scan + conformance oracle used for self-found bugs means team-submitted defects get identical rigor, not just raw unverified evidence | MEDIUM (mostly reuse) | Directly serves this project's core value: every real session — including a colleague's — reliably converts into a stronger server, not just a raw complaint |
| Pinned-environment distribution before ingestion (TEAM-04) | Reference crash reporters generally do **not** control the reporting client's environment (Sentry's SDK runs on whatever stack the host app has; Firefox runs on whatever OS/build the end user has). Constraining colleagues to an exact server + exact pinned Agda version *before* they even generate a session removes a whole class of "is this even the same server the maintainer would test?" noise before it reaches the oracle | LOW-MEDIUM | Reduces false inputs to the oracle triad, which matters more here than in a generic crash reporter because the oracle's ground truth depends on environment exactness |
| Full-fidelity artifact upload (captures + runs + complete verbatim agent logs) (TEAM-02) | Sentry/Socorro send curated, size-capped event payloads (stack trace + limited context). Uploading the *entire* session transcript is richer signal for diagnosing agent-behavior failure modes (narrowing, shortcut-taking, flag-planting — the exact behaviors the Hopf-experiment corpus surfaced) than any crash reporter captures by default | MEDIUM | This is the one place "more data than a typical crash reporter" is a deliberate, well-justified choice rather than scope creep — but it is also exactly why a size cap (currently unspecified) matters more here than for a typical crash report |

### Differentiators — (b) CACHE distribution

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Corpus-SHA-level pinning of externally hosted, non-packaged research corpora (CACHE-01) | Neither nixpkgs nor Lean's cache do this well: nixpkgs packages *named libraries at a maintainer-controlled version* (`agdaPackages.standard-library`), and Lean's cache is scoped to mathlib's own commit history. Nothing in either ecosystem is shaped for "an arbitrary pinned commit SHA of a fast-moving external research repo," which is exactly this project's "organic fuel, not curated benchmark" strategy | MEDIUM | Genuinely tailored capability; the key space (arbitrary corpus × arbitrary SHA) is inherently messier than a single well-known library's version history |
| Self-hosted-runner build path for corpora too large for hosted CI (CACHE-01) | Already decided, and grounded: heavy typechecking workloads routinely exceed GitHub-hosted runner memory (7 GB on standard hosted runners); mathlib's own CI is famous for needing serious memory/parallelism, and agda-unimath is comparably heavy | MEDIUM-HIGH (infra-heavy, not algorithmically hard) | Real but bounded differentiator — don't over-invest in general-purpose runner orchestration for this milestone |
| **DEFERRED** — Public channel + build provenance/attestation (CACHE-03) | GitHub is moving artifact attestation from opt-in to **default for public repos through 2026** (SLSA Build Level 2 by default, Level 3 achievable, in-toto format bound to source repo + workflow). This is the exact "hard requirement before public" the milestone already names, now confirmed as a concrete, current, actionable mechanism rather than a hand-wave | HIGH when eventually built | Do not scope for v1.1. Flagged here only so the requirements step has the *categorization* ready when this is revisited — matches Nix's much stronger signed-narinfo model as the bar to clear before the trust tier changes from "internal, keyed" to "public" |

### Anti-Features — (a) TEAM feedback channel

| Anti-Feature | Why Requested | Why Problematic | Alternative (already chosen) |
|--------------|----------------|-------------------|-------------------------------|
| Per-event consent prompts | Feels maximally "safe"/consent-respecting | No reference system with a pre-existing trust relationship does this (enterprise-managed Firefox sets consent once via policy, not per-crash); per-event prompts exist *specifically* in public/anonymous products that have no other consent mechanism available — a condition that doesn't hold for consented, keyed internal colleagues | One-time consent = the act of issuing a per-person revocable key + written statement |
| Public/anonymous write access to the ingest endpoint | Seems more "open"/frictionless | Every public-facing ingest surface (Sentry SaaS, Firefox's public crash endpoint) requires a *substantially larger* investment in anti-abuse (rate limiting, anomaly detection, spam filtering) precisely because it's publicly writable — none of that machinery exists here | Per-person revocable Bearer key; no key → zero network behavior |
| GitHub Issues as the raw ingest path | Reuses existing tooling, looks like "free" triage UI | Neither Sentry nor Socorro use a ticket tracker as their *ingest* surface — both front a purpose-built ingest API and only resemble a tracker on the *output* side. Issues also have no natural place to archive full binary/log bundles or drive an unattended cron judge | `fix-queue.json` stays SSOT; `mirror-github.mjs` remains an optional post-triage visibility mirror |
| Real-time dashboard/alerting for team uploads | Feels more "production-grade" | Self-hosted Sentry itself is explicitly scoped for **under ~1M events/month** as its "low traffic" tier — a handful of colleagues' occasional sessions is orders of magnitude below even that floor. Building live alerting now is solving a scale problem that doesn't exist yet | Cron-driven judging into the existing flat-file queue + dashboard |
| Per-field redaction/PII scrubbing of uploaded logs | Sounds like due diligence | Even Sentry — a public SaaS product serving a much lower-trust audience than an internal team — **explicitly does not scrub attachments/raw files**, only structured event fields. Building a bespoke redaction pipeline for a *higher-trust* internal context than Sentry's own attachment policy would be over-engineering relative to what even lower-trust systems bother doing | Upload full logs verbatim, no trimming, no redaction (trusted team, already decided) |
| Unbounded local retry queue (no age/count cap) | Not requested, but a silent gap worth flagging | Firefox's own unbounded `pending/` folder is a known minor pain point (crash reports accumulate indefinitely if the network is down); a colleague whose upload target is unreachable for days would otherwise fill local disk | **Gap to close in requirements**: add a simple max-age or max-count bound to the local retry queue |
| Unspecified payload size cap | Not requested, but every reference system has one | Sentry's numeric limits (≈20MB compressed request, 100–200MB uncompressed attachments/event, 40MB for minidumps even compressed) exist precisely because *some* system somewhere will otherwise try to upload something disk- or bandwidth-breaking — and this project's "full verbatim agent logs, no trimming" policy makes an oversized session *more* likely than a typical crash report, not less | **Gap to close in requirements**: define a size cap and a defined fail-open behavior when a session bundle exceeds it (reject locally before sending, don't silently truncate) |
| No retention/pruning policy | Not requested, but every reference system defines one | Sentry ties retention to explicit plan tiers (30/90 days); Socorro has a documented retention/anonymization policy. An indefinitely growing person/date archive on a shared PVC is a capacity-planning problem waiting to happen, even at low volume | **Gap to flag for requirements** (not necessarily urgent at v1.1 volume, but should be a conscious deferral, not a silent omission) |

### Anti-Features — (b) CACHE distribution

| Anti-Feature | Why Requested | Why Problematic | Alternative (already chosen) |
|--------------|----------------|-------------------|-------------------------------|
| Auto-download by the server itself | Feels convenient ("just works" on first load) | **No reference system does this.** `lake exe cache get` is an explicit command; Nix substitution only happens during an explicit `nix build` from pre-configured substituters; ccache/sccache wrap the compiler invocation without modifying it; opam/Cachix require an explicit install step. An MCP server that silently phones home mid-session would be a genuinely novel (and worse) trust posture than any of these | Server never auto-downloads; a separate `fetch-prebuilt-cache` script is invoked explicitly |
| Public CACHE channel before provenance/attestation exists | Seems like the natural next step once the private channel works | `.agdai` files are **unconditionally trusted by Agda** (no independent re-checker exists for Agda, unlike Lean's `lean4checker`/Lean4Lean — see `LEAN-COMPARISON.md`). A poisoned interface file can fake a checked proof. GitHub's own 2026 direction — moving attestation from opt-in to default for public repos — confirms that checksums-only is a materially weaker trust tier than what a public channel needs | Checksums-only tier stays internal/keyed; public channel explicitly deferred until provenance/attestation exists |
| Fine-grained per-file cache (Lean-style Merkle keying) as a v1.1 target | Looks strictly more capable (partial reuse across corpus revisions) | Real implementation cost for a benefit that doesn't matter yet: manifest/revision-mapping bookkeeping, per-file hash storage, and OS-dependent hashing edge cases (Lean's own cache tool has a documented CRLF-handling divergence from Lake's own hashing, a real historical bug class) — for 4 rarely-updated pinned corpora, whole-bundle invalidation is cheap enough | Coarse per-(version × SHA × flags) bundle, matching nixpkgs' per-derivation (not per-file) granularity |
| Adopting Nix/Cachix as the CACHE-01/02 delivery mechanism | Nix is already used locally for Agda itself; Coq's own ecosystem piggybacks on exactly this (coq-on-cachix) | Packaging-unit mismatch: nixpkgs/Cachix key on **named libraries at a maintainer-controlled version**, not arbitrary externally-pinned commit SHAs of a fast-moving research corpus (agda-unimath) that no one is going to review-and-merge into nixpkgs on this project's cadence. Would also force a hard Nix dependency onto every consumer of the fetch script beyond what "clone with git, run one script" needs | Bespoke tar + sha256 + strict-gated fetch script |
| Cryptographic signing/attestation for the *private* channel right now | Feels like "doing it right the first time" | Disproportionate to the stated trust tier: a small number of consenting, keyed colleagues fetching from a channel they already reach via a trusted path is a materially different threat model than a public, anonymous channel. Nix's signed-narinfo model and GitHub Artifact Attestation are the right tool for CACHE-03, not CACHE-01/02 | sha256 checksums now; signing/attestation reserved for the deferred public channel |
| One monolithic multi-GB bundle per corpus, unsplit | Simplest possible packaging | GitHub Releases hard-caps at **2 GiB per file** (1000 assets per release) — a full agda-unimath `.agdai` tree could plausibly approach or exceed that for a single bundle | Flagged as a packaging constraint to check against actual bundle size early; may require per-library or per-module splitting if GitHub Releases is the eventual (CACHE-03) transport, though CACHE-01/02's private channel is not required to use GitHub Releases at all |

## Feature Dependencies

```
TEAM-01 (key issuance + consent text)
    └──requires──> nothing new (standalone)

TEAM-02 (upload script: tar/gzip + Bearer auth + fail-open + local retry)
    └──requires──> TEAM-01 (a key must exist to authenticate with)

TEAM-03 (ingest endpoint + unattended cron judge)
    └──requires──> TEAM-02 (something must be arriving to archive/judge)
    └──reuses────> existing oracle triad + N-rerun anti-flake gate + fix-queue filing (v1.0, NOT rebuilt)
    └──requires──> POLICY-01/W2 fix (ORCL-02 policy passthrough) — WITHOUT this fix, team-submitted
                    agda-unimath-based corpora silently skip cheat auto-filing (still fails loudly as
                    not-true-green, but never files) — this is a correctness prerequisite, not optional polish

TEAM-04 (pinned-environment git-install distribution)
    └──enhances──> TEAM-03 (fewer environment-divergence false inputs reaching the oracle)

CACHE-01 (build+publish pipeline: self-hosted runner, tar+sha256 bundles)
    └──requires──> scripts/data/fuel-corpora.json (existing pin) + oracle-policy flag baselines (existing)
                    + package.json version contract (existing) — all three key components already pinned

CACHE-02 (strict-gated fetch script: version+SHA+checksum match, fallback to local build)
    └──requires──> CACHE-01 (something published to fetch)
    └──touches───> ORCL-01's "fresh _build for the module under test" boundary — must NOT silently
                    relax freshness for the module under test, only for upstream library dependencies
                    (mirrors unimath's own CI prewarming practice)

CACHE-03 (public channel + provenance/attestation)
    └──requires──> CACHE-01 + CACHE-02 proven privately first (explicitly deferred this milestone)

Fine-grained per-file cache (Lean-style, v2 idea)
    └──enhances──> CACHE-01 (only valuable once corpus-update churn makes coarse invalidation costly)
```

### Dependency Notes

- **TEAM-03 requires POLICY-01/W2 fixed first (or landed alongside):** this is the single most important cross-theme dependency. Theme 1's headline tech-debt item (ORCL-02's policy key deriving only from the corpus root `.agda-lib` name) directly determines whether Theme 2's team-submitted corpora get auto-filed correctly. Sequencing TEAM-03 before POLICY-01 would silently reproduce the exact defect the audit already found.
- **TEAM-03 reuses, not rebuilds, the oracle triad/anti-flake gate/fix-queue:** this is the load-bearing "dependency on existing scaffold" for the whole TEAM theme — the net-new surface is archival plumbing and cron wiring, not judging logic.
- **CACHE-02 touches ORCL-01's freshness boundary:** this is the load-bearing "dependency on existing scaffold" for the CACHE theme — a whitelist that's too permissive re-creates the transitive-staleness false-green class (`ORACLE-VALIDITY.md`); a whitelist that's too strict defeats the point of the cache. Must be an explicit, narrow design decision, not an implicit side effect of "the fetch script ran."
- **CACHE-01 requires nothing new to be pinned:** exact Agda version, corpus SHA, and flags baseline are all *already* pinned artifacts from v1.0 (`fuel-corpora.json`, oracle-policy baselines, `package.json`'s `agdaMcpServer` field) — CACHE-01's job is build/publish automation around existing pins, not inventing a new pinning scheme.

## MVP Definition

### Launch With (v1.1)

- [ ] TEAM-01 — key issuance + written consent text — foundational, zero value without it
- [ ] TEAM-02 — upload script (fail-open, local retry) — the producer side of the channel
- [ ] TEAM-03 — ingest endpoint + cron judge reusing existing oracle/fix-queue machinery — the consumer side; this is where the reused v1.0 investment pays off
- [ ] TEAM-04 — pinned-environment git-install distribution — cheap, removes a whole noise class before it reaches the oracle
- [ ] POLICY-01/W2 fix — correctness prerequisite for TEAM-03 to file team-submitted agda-unimath-based defects at all
- [ ] CACHE-01 — build+publish pipeline with sha256 checksums
- [ ] CACHE-02 — strict-gated fetch script (exact version + SHA + checksum match) with graceful local-build fallback

### Add After Validation (v1.x)

- [ ] Bounded local retry queue (max age or count) for TEAM-02 — trigger: first colleague hits an unreachable-ingest-endpoint scenario for more than a day
- [ ] Payload size cap + defined reject-before-send behavior for TEAM-02/03 — trigger: before the first "full verbatim agent log" upload that's unusually large (this is foreseeable now, not hypothetical — flag it early rather than waiting for an incident)
- [ ] Lightweight archive retention/pruning policy for TEAM-03 — trigger: PVC/disk usage becomes visible as a concern, or before onboarding more than a handful of colleagues

### Future Consideration (v2+)

- [ ] CACHE-03 — public channel + build provenance/attestation (GitHub Artifact Attestations / SLSA, matching Nix's signed-narinfo trust tier) — why defer: trust-critical, and the private channel needs to be proven first per the milestone's own stated rationale
- [ ] Fine-grained per-file/per-module cache keying (Lean-style Merkle hashing) — why defer: no evidence yet that coarse whole-bundle invalidation is actually costly at 4 rarely-updated pinned corpora; adds real bookkeeping and cross-platform hashing risk for a currently-hypothetical benefit
- [ ] Generalized "verified artifact fetch" primitive reused beyond `.agdai` bundles — why defer: premature generalization; revisit only if a second cached-artifact type actually appears

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| TEAM-01 (key issuance + consent) | HIGH | LOW | P1 |
| TEAM-02 (upload script, fail-open) | HIGH | MEDIUM | P1 |
| TEAM-03 (ingest + cron judge, reuses oracle) | HIGH | MEDIUM-HIGH | P1 |
| TEAM-04 (pinned-env git-install distribution) | MEDIUM | LOW-MEDIUM | P1 |
| POLICY-01/W2 (ORCL-02 passthrough fix) | HIGH (blocks TEAM-03 correctness) | LOW-MEDIUM | P1 |
| CACHE-01 (build+publish pipeline) | HIGH | MEDIUM-HIGH | P1 |
| CACHE-02 (strict-gated fetch script) | HIGH | LOW-MEDIUM | P1 |
| TEAM upload size cap (gap) | MEDIUM | LOW-MEDIUM | P2 |
| TEAM local-retry-queue bound (gap) | LOW-MEDIUM | LOW | P2 |
| TEAM archive retention/pruning (gap) | LOW (now) / MEDIUM (later) | LOW-MEDIUM | P2/P3 |
| CACHE-03 (public channel + attestation) | MEDIUM (future) | HIGH | P3 (deferred) |
| Fine-grained per-file cache | LOW (now) | HIGH | P3 (deferred) |

**Priority key:** P1: must have for v1.1. P2: should have, add when convenient / before it becomes a problem. P3: explicitly deferred, revisit on a concrete trigger.

## Reference System Comparison

### CACHE distribution: how the reference ecosystems solve the same problem

| Dimension | Lean/mathlib (`lake exe cache get`) | nixpkgs `agdaPackages` + `cache.nixos.org` | ccache / sccache | Bazel / Gradle remote cache | Coq/Rocq (opam + coq-on-cachix) | **This project (CACHE-01/02)** |
|---|---|---|---|---|---|---|
| Keying granularity | Per-file: Merkle-style hash mixture of a module's own content + transitive import hashes + toolchain (Lake README; MEDIUM-HIGH confidence, official source) | Per-derivation: whole-library output, hash covers Agda version + source hash + every dependency derivation hash + build flags (HIGH, official nixpkgs docs) | Per-compilation-unit: hash of preprocessed/direct source + flags + compiler identity (HIGH, official docs) | Per-action: hash of command + declared inputs + environment (HIGH, official Bazel docs) | Reuses the Nix/Cachix per-derivation model via `coq-on-cachix` (MEDIUM, project docs) | Per-bundle: (exact Agda version × corpus SHA × flags baseline) — same grain as nixpkgs, coarser than Lean |
| Integrity check on fetch | Not documented in official sources found (LOW confidence *negative* claim — absence of evidence, not evidence of absence) | Ed25519-signed `narinfo`, verified against configured `trusted-public-keys` before substitution (HIGH, official) | XXH3 checksum — detects corruption, not tampering/authenticity (HIGH, official ccache docs) | CAS is digest-verified by Bazel itself; **Action Cache is explicitly NOT verified** — "if you can reproduce the hash of the inputs you can poison the cache" (HIGH, official Bazel/BuildBuddy sources) | Inherits Nix/Cachix's signed model | sha256 checksum published alongside bundle — a CAS-style check, no signing layer |
| Auto-fetch from inside the compiler/session itself? | No — explicit `lake exe cache get` | No — substitution occurs during an explicit `nix build`, only from pre-configured substituters | No — wraps the compiler invocation; doesn't self-trigger | No — client must configure the remote endpoint explicitly | No — explicit `opam`/`nix build` | No — separate `fetch-prebuilt-cache` script; server never auto-downloads |
| Fallback on miss/mismatch | Falls back to local build; diagnosed in community docs as "local checkout diverged from upstream" | Falls back to building the derivation from source | Falls back to a real compile | AC miss → re-run the action; CAS miss → build inputs unavailable, fails | Falls back to source opam build | Falls back to local Agda build (required by design) |
| Write/trust model | Single-writer (mathlib's own CI), many readers | Single-writer (Hydra/nixpkgs CI), many readers, cryptographically enforced | Depends entirely on the remote backend's own credentials (AWS keys/IAM role, Redis password, GCS service account) — sccache adds no signing layer of its own (MEDIUM-HIGH, official sccache docs) | Depends on the cache operator; a publicly-writable remote cache is a documented real vulnerability class | Single-writer (Cachix org owner) | Single-writer (maintainer's self-hosted runner), many readers — matches Lean/nixpkgs pattern |
| Known pitfall | Community-reported OS-dependent hashing: the cache tool's own line-ending normalization diverges from Lake's (Zulip "Lake hashes are OS dependent"; MEDIUM confidence, community-sourced) | Packaging unit is a *named library at a maintainer-controlled version* — a poor fit for an arbitrary pinned commit SHA of an external, fast-moving research corpus | Compiler-identity fallback (mtime+size) silently misses upgrades when the compiler is invoked through a wrapper | "If you can reproduce the input hash, you can poison the cache" — official, explicit | opam itself is mostly source-only; the prebuilt path is fully delegated to a third-party hosted service | GitHub Releases hard-caps at 2 GiB per file / 1000 assets per release (HIGH, official docs) — may force splitting a large corpus bundle if that transport is used |

### TEAM feedback channel: how the reference ecosystems solve the same problem

| Dimension | Sentry (self-hosted) | Mozilla Socorro / Firefox crash reporter | Generic support-bundle tools (sosreport, `kubectl` diagnostics, vendor support bundles) | **This project (TEAM-01..04)** |
|---|---|---|---|---|
| Attribution | SDK-attached release/environment/user context — payload-declared (HIGH, official docs) | Build/channel metadata + submission credentials | Bundle metadata + whoever ran the tool | Per-person Bearer key **is** the attribution — credential-derived, not self-reported (arguably stronger than payload-declared) |
| Dedup | Fingerprint rules over structured event fields, computed post-ingestion (MEDIUM, official docs) | Stack-signature generation inside the processor, post-ingestion (HIGH, official Socorro docs) | Usually none built in; manual triage | Reuses **existing** v1.0 fingerprint/dedup logic (`bug-report.ts` + fix-queue), post-ingestion — same shape, no new logic |
| Size caps | Hard numeric limits: ~20 MB compressed request; 100–200 MB uncompressed attachments/event; 40 MB for minidumps even compressed (HIGH, official docs) | Documented in official docs, not independently re-verified this pass (not verified) | Usually soft warnings, rarely hard rejection | **Not yet specified — flagged gap** |
| Retention | Plan-tiered auto-expiry: 30 or 90 days (HIGH, official docs) | Documented retention/anonymization policy (not independently re-verified this pass) | Vendor-defined, often short-lived/manual purge | **Not yet specified — flagged gap** |
| Consent | One-time SDK init/DSN configuration; no per-event prompt (HIGH, official docs) | Public/anonymous users see a per-crash "Tell Mozilla" dialog by default; enterprise-managed deployments set consent once via policy instead (MEDIUM, general product knowledge) | Explicit manual invocation = implicit consent | One-time consent = act of issuing the key + written statement — matches the *enterprise*, not the *public*, branch of Mozilla's own model |
| Redaction/scrubbing | Applied to structured event fields; **explicitly not applied to attachments** (HIGH, official docs) | Some PII handling in the public-facing pipeline (different, lower-trust boundary than ours) | Some tools scrub known-sensitive paths — needed because they cross a customer→vendor trust boundary | None, deliberately — matches Sentry's own attachment non-scrubbing precedent, and the peer-internal trust boundary is if anything *higher* trust than Sentry's own audience |
| Ingestion gate | Fail-open at the SDK — crash reporting must never crash the host app (HIGH, general product design) | Fail-open; local `pending/`→`submitted/` folder state tracks delivery, not acceptance (HIGH, official support docs) | N/A — synchronous, manual, offline artifact | Fail-open by design; local retry queue mirrors Firefox's pending/submitted split |
| Ingest surface | Purpose-built ingest API, distinct from any issue tracker | Purpose-built ingest pipeline, distinct from Bugzilla | N/A (hand-delivered artifact) | ~100-line HTTPS endpoint — not GitHub Issues |

## Sources

- Lean/mathlib caching: [mathlib4 README](https://github.com/leanprover-community/mathlib4/blob/master/README.md) (`lake exe cache get`/`get!` behavior — HIGH); [Lake README](https://github.com/leanprover/lean4/blob/master/src/lake/README.md) (content-hash-addressed artifact endpoint + git-revision-to-hash mapping endpoint, per-module Merkle trace hashing, on-disk hash caching with `--rehash` — MEDIUM-HIGH, official but pieced together); Zulip "[Some files not found in the cache](https://leanprover-community.github.io/archive/stream/287929-mathlib4/topic/Some.20files.20not.20found.20in.20the.20cache.html)" (miss diagnosis = local checkout diverged — MEDIUM); Zulip "Lake hashes are OS dependent" (CRLF-handling divergence between the cache tool's hashing and Lake's own — MEDIUM, community-sourced, not independently verified in source)
- nixpkgs Agda packaging: [nixpkgs `agda.section.md`](https://github.com/NixOS/nixpkgs/blob/master/doc/languages-frameworks/agda.section.md) (`agdaPackages.mkDerivation`, `agda --build-library`, `.agdai`/`.agda-lib` install phase — HIGH, official); [nixpkgs agda packages tree](https://github.com/NixOS/nixpkgs/tree/master/pkgs/development/libraries/agda)
- Nix binary cache trust model: [NixOS Wiki Binary Cache](https://wiki.nixos.org/wiki/Binary_Cache); [nix.dev binary cache guide](https://nix.dev/guides/recipes/add-binary-cache.html) (`narinfo` signature format, `trusted-public-keys`, Ed25519 signing/verification — HIGH, official)
- ccache/sccache: [ccache manual](https://ccache.dev/manual/latest.html) (BLAKE3 input hash, direct vs preprocessor mode, XXH3 corruption checksums, compiler-identity mtime/size fallback weakness — HIGH, official); [mozilla/sccache](https://github.com/mozilla/sccache) and [sccache GCS docs](https://github.com/mozilla/sccache/blob/main/docs/Gcs.md) (S3/GCS/Redis credential-based auth, no independent signing layer — HIGH, official docs, absence of a signing feature confirmed by omission)
- Bazel/Gradle remote cache: [Bazel Remote Caching docs](https://bazel.build/remote/caching) and [BuildBuddy explainer](https://www.buildbuddy.io/blog/bazels-remote-caching-and-remote-execution-explained/) (AC vs CAS distinction, hermeticity requirement — HIGH, official + corroborated); ["Saving the remote cache from cache poisoning?" bazelbuild/bazel#4276](https://github.com/bazelbuild/bazel/issues/4276) and [Understanding Bazel remote caching (jmmv.dev)](https://jmmv.dev/2025/09/bazel-remote-caching.html) ("if you can reproduce the hash of the inputs you can poison the cache" — HIGH)
- Coq/Rocq: [coq-on-cachix INSTALL.md](https://github.com/coq/coq-on-cachix/blob/master/INSTALL.md) (prebuilt binaries via Cachix, updated only when the latest commit is available there — MEDIUM, official project docs); [Coq Platform docs](https://rocq-prover.org/doc/V8.18.0/refman/practical-tools/utilities.html)
- Crash reporter/telemetry design: [Sentry Size Limits](https://docs.sentry.io/concepts/data-management/size-limits/) and [Sentry Attachments docs](https://docs.sentry.io/platforms/native/enriching-events/attachments/) (numeric caps, no attachment scrubbing — HIGH, official); [Sentry self-hosted troubleshooting](https://develop.sentry.dev/self-hosted/troubleshooting/) (<1M events/month scoping — HIGH, official); [Socorro documentation](https://socorro.readthedocs.io/en/latest/) and [Socorro Signature Generation](https://socorro.readthedocs.io/en/latest/signaturegeneration.html) (post-ingestion grouping — HIGH, official); [Mozilla Crash Reporter support doc](https://support.mozilla.org/en-US/kb/mozillacrashreporter) (pending/submitted local folders, "Tell Mozilla" consent checkbox — HIGH, official; enterprise-policy one-time-consent framing is MEDIUM, general product knowledge not independently re-verified this pass)
- Supply-chain trust (for CACHE-03, deferred): [GitHub Artifact Attestations docs](https://docs.github.com/en/actions/concepts/security/artifact-attestations) and [GitHub Changelog: SLSA Build Level 3](https://github.blog/changelog/2026-01-20-strengthen-your-supply-chain-with-code-to-cloud-traceability-and-slsa-build-level-3-security/) (attestation moving opt-in → default for public repos through 2026 — HIGH, official)
- Platform constraints: [GitHub repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) (2 GiB per release asset, 1000 assets/release — HIGH, official)
- Project context (not re-researched, used for dependency mapping): `.planning/PROJECT.md`, `.planning/NEXT-MILESTONE-SEED.md`, `.planning/research/LEAN-COMPARISON.md`, `.planning/research/ORACLE-VALIDITY.md` (referenced, not re-read in full this pass)

---
*Feature research for: agda-mcp-server v1.1 "Feed the Loop" — TEAM feedback channel + CACHE distribution*
*Researched: 2026-07-03*
