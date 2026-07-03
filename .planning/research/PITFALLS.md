# Pitfalls Research

**Domain:** Adding a team feedback ingest channel + prebuilt `.agdai` interface-cache distribution to an already-shipped agent self-improvement loop ("Loop ②")
**Researched:** 2026-07-03
**Confidence:** HIGH for `.agdai` relocatability/version/flag-consistency claims (official Agda docs + Agda GitHub issue tracker, cross-checked against agda-unimath's live CI workflow and this repo's own empirically-verified `src/agda/agdai-cache.ts`); HIGH for the W2 policy-key bug and its macOS-masking nuance (read directly from source plus a real corpus's `.agda-lib` file on disk); HIGH for the self-hosted-runner-on-public-repo risk (repo visibility checked live via `gh`, cross-checked against official GitHub security guidance); MEDIUM–HIGH for the `node-tar` CVE specifics (GitHub Security Advisories / Snyk, current-dated); MEDIUM for generic decompression-bomb / fail-open-upload engineering patterns (established practice, not Agda-specific); explicitly flagged LOW–MEDIUM inline where a claim is a reasoned inference rather than a directly-documented case.

**Supersedes scope, not validity, of the prior PITFALLS.md:** the v1.0 file (process pitfalls for *building* Loop ② — capture reproducibility, golden-master ossification, triage graveyards) remains true and is preserved in git history / `.planning/milestones/v1.0-*`. This file is rescoped to v1.1's two *new* additions per the research brief and does not repeat v1.0 content. `ORACLE-VALIDITY.md`'s findings (oracle triad validity, abstention, version-range handling) are extended here, not repeated — see individual pitfalls below for what's new.

---

## Critical Pitfalls

### Pitfall 1: A "successful" cache fetch that silently recompiles anyway

**What goes wrong:**
CACHE-02's fetch script downloads a `.agdai` bundle, the sha256 checksum matches, extraction reports success — and the very first `agda_load` still takes the full multi-hour cold-compile path, because nothing errored and nothing looked wrong. Agda's own staleness heuristic requires the interface's mtime to be at least as new as its source file's mtime (this is exactly what this repo's own `src/agda/agdai-cache.ts` already encodes: `fresh: mtimeMs >= sourceMtimeMs`, empirically verified against Agda 2.9.0). A freshly-cloned pinned-SHA corpus checked out *after* the cache bundle was built will have newer source mtimes than whatever timestamps a tar/GitHub-Releases round trip preserved (or didn't) on the `.agdai` files. The "prebuilt cache" delivers zero speedup and nothing surfaces this short of timing the load.

**Why it happens:**
tar archives may preserve original build-time mtimes or reset them to extraction time depending on tooling/flags; GitHub Releases artifacts carry no mtime guarantee across a machine boundary at all. agda-unimath's own CI sidesteps this by never actually crossing that boundary: its cache key is `{OS}-check-{git-ref}-{agda-version}-{hashFiles('repo/src/**')}` (verified from the live `ci.yaml`) and `actions/cache` restores as part of the *same* checkout, so relative mtime ordering is preserved for free. This milestone's distribution model (download independently of the checkout) does not get that guarantee automatically.

**How to avoid:**
After checksum verification and extraction, the fetch script must explicitly `utimes()` every extracted `.agdai` (and its `_build/<version>/agda/` tree) to a time strictly after the corresponding pinned source tree's mtimes — never trust archive-preserved timestamps. Verify with a self-test: fetch, then time an `agda_load` and assert it completed in "cache-hit" time, not "cold-build" time — a green checksum is not sufic evidence the cache actually engaged.

**Warning signs:**
`agda_load` on a freshly-fetched-cache project takes as long as a cold build; `find _build -newer <source>` shows fetched `.agdai` files older than sources; the fetch script has a checksum step but no explicit `touch`/`utimes` step.

**Phase to address:** cache-distribution

---

### Pitfall 2: "Exact Agda version" match is necessary but not sufficient

**What goes wrong:**
CACHE-01/02 key bundles by "exact Agda version." But two builds that both report `agda --version` as `2.8.0` are not necessarily interface-compatible: Agda's interface serializer is gated by a manually-maintained integer, `currentInterfaceVersion`, which is bumped only when the *serialization format* changes — the project convention is "every time the interface format is changed the interface version number should be bumped in the same patch" (verified from Agda's own `HACKING.md`/changelog guidance). That constant is decoupled from the human-readable release string. A colleague's own from-source Agda build with different cabal flags (e.g. `-f enable-cluster-counting`, custom optimization flags, a local patch) that reports the identical `2.8.0` version string is not guaranteed to be caught by Agda's own compatibility check, because that check compares the recorded format/option state, not full build provenance.

**Why it happens:**
The version string people match on (`agda --version`) and the interface-format compatibility gate are two different things that usually move together but are not contractually linked. This is a reasoned inference from how `currentInterfaceVersion` is documented (LOW–MEDIUM confidence on the specific cabal-flags scenario — no directly-documented case of this exact failure was found in the Agda tracker), but the risk is real enough that "match the version string" alone is an insufficient key.

**How to avoid:**
Pin the *build provenance*, not just the label: this project already has the primitive for this (`tooling/scripts/run-pinned-agda.sh` per `binary-discovery.ts`'s priority order, and TEAM-04's plan to use it) — the cache-build pipeline and every fetch-gate check should key off the same pinned-binary mechanism (or its resolved absolute path / a hash of the binary itself) rather than trusting `agda --version`'s string alone as the sole compatibility gate. Where only the version string is available (e.g. a colleague's ad hoc nix-installed Agda), treat it as a necessary-but-not-sufficient signal and prefer a byte-verified single canonical build (nix derivation hash, or literally the same binary used to build the cache) wherever the pipeline controls both ends.

**Warning signs:**
Two machines both report the same `agda --version` but were built via different package managers/flags; a fetched cache "matches" by version string but Agda re-typechecks anyway (see Pitfall 1's twin: flags/options mismatch, confirmed by search, causes Agda to **re-typecheck rather than error** — a silent, self-correcting-but-wasteful outcome, not a crash).

**Phase to address:** cache-distribution

---

### Pitfall 3: `.agdai` placement is not deterministic — "just drop files in `_build/<version>/agda/`" can silently miss

**What goes wrong:**
The cache-build/fetch pipeline assumes a stable target layout: `<projectRoot>/_build/<agdaVersion>/agda/<rel>.agdai` when a `.agda-lib` exists, else `<basename>.agdai` next to the source (this repo's own `agdai-cache.ts` documents and empirically verifies exactly this split). But Agda's own tracker has an **open, unresolved** regression (`agda/agda#7675`, filed against 2.6.4.2, still open as of the source checked in this research) showing `toIFile`'s placement logic depends on *which* interface files already happen to exist on disk at compile time, not a principled rule — meaning a corpus that has ever been locally compiled without a `_build` directory can scatter some interfaces locally and some into `_build`, even for the same project. A prebuilt cache bundle built assuming the clean "separated" layout can land alongside a machine that already has stray local `.agdai` files from an earlier ad hoc `agda` invocation, and Agda will pick whichever one `toIFile`'s existence-check finds first — not necessarily the one you just distributed.

**Why it happens:**
Interface placement is existence-dependent, and interface files can also be produced by unrelated tooling (an editor plugin invoking `agda` directly, a teammate running bare `agda` instead of through the MCP server) before the prebuilt cache is ever fetched.

**How to avoid:**
The fetch script should positively assert a clean starting state for the target project: check for (and warn on, or clear via the existing `bustAgdaiCache`) stray local-layout `.agdai` files before writing the separated-layout bundle, so there is no ambiguity about which interface Agda's existence-driven placement logic will pick up. Treat "distribute prebuilt cache" as requiring a clean target, not an additive drop.

**Warning signs:**
A corpus with a mix of local `<Module>.agdai` files sitting next to sources AND a populated `_build/` tree; the fetch script has no pre-flight check for stray local interfaces; a fetched cache "works" on some corpora but not others with identical version/SHA/flags.

**Phase to address:** cache-distribution

---

### Pitfall 4: The cache-build self-hosted runner is a new attack surface colocated with the ingest endpoint's secrets

**What goes wrong:**
CACHE-01 is planned on "a self-hosted runner (GitHub free runners OOM on unimath)." The GitHub repo in question, `InvariantHoldings/agda-mcp-server`, is **public** (verified live: `gh repo view` reports `"isPrivate":false`). GitHub's own documented threat model is unambiguous: self-hosted runners "should almost never be used for public repositories," because any external contributor can open a pull request whose workflow targets the runner and executes arbitrary code on it — this has been exploited in the wild (reverse shells, secret exfiltration, malicious pushes using the runner's own token). Per `PROJECT.md`, the cache-build machine is explicitly **the same k8s server** as the ingest endpoint holding per-person Bearer keys and archived colleague logs. A public-repo self-hosted runner compromise on that box is not a hypothetical — it is a direct path to the team-channel's trust boundary.

**Why it happens:**
"Self-hosted runner" reads as an infrastructure detail, not a security decision, and the OOM-avoidance rationale (real: GitHub-hosted runners cannot handle a from-scratch agda-unimath build) is the loudest signal in the room. The public-repo exposure is easy to miss because the *server* being deployed is the private-channel ingest box, while the *trigger* (a GitHub Actions workflow) lives on the public npm-published repo.

**How to avoid:**
Do not register any self-hosted GitHub Actions runner against `InvariantHoldings/agda-mcp-server` while it is public. This project already has the right pattern in hand for exactly this shape of problem: drive CACHE-01 builds the same way TEAM-03 drives judging — an operator/cron-triggered k8s Job or manually-invoked script that pulls the pinned corpus SHA and builds locally inside the cluster, with no GitHub Actions runner registration at all. If GitHub Actions must be involved, gate it behind `workflow_dispatch` only (never `pull_request`/`push` from forks) with required-reviewer environment protection, and note that none of the litellm-k8s-deploy skill's 22 lessons cover this — that skill's CI never needed a self-hosted runner (GitHub-hosted runners sufficed for a lightweight proxy image build), so this is genuinely new territory, not something to cargo-cult from the existing precedent.

**Warning signs:**
A `runs-on: [self-hosted, ...]` label anywhere in a workflow file that also triggers on `pull_request`/`push` in the public repo; no environment-protection rule gating the runner-targeting job; the runner pod sharing a namespace/service account/PVC mount with the ingest endpoint.

**Phase to address:** cache-distribution (blocks any GitHub-Actions-based build path until resolved; also a k8s-deploy dimension)

---

### Pitfall 5: Agda accepting a build's output during cache construction is not proof the build was correct

**What goes wrong:**
`CACHE-03`'s own framing states the sharpest version of this: "`.agdai` files are unconditionally trusted by Agda — a poisoned interface can fake a checked proof." That trust boundary does not switch off just because the *maintainer's own* build pipeline produced the bundle. A build-pipeline bug (wrong pinned SHA checked out, a stale local clone, a flags baseline drifted out of sync with `fuel-corpora.json`/`oracle-policy/*.json`, a partially-failed build that still emitted an `.agdai` for an earlier module) is invisible to "the build finished and Agda didn't complain" — that is exactly the same over-trust class ORCL-01/02/03 exist to correct for agent-submitted proofs, just moved to a different producer.

**Why it happens:**
"It's our own build, on our own pinned inputs" feels categorically safer than "an agent's submitted proof," but the underlying mechanism — Agda deserializing a `.agdai` and trusting its recorded state without re-deriving the proof from source — does not distinguish between the two. sha256 checksums (CACHE-01/02) only prove the downloaded bytes match what the build pipeline emitted; they say nothing about whether the build pipeline typechecked the *right* source under the *right* flags.

**How to avoid:**
Before publishing, run the build pipeline's own output through (at minimum) an ORCL-01-style differential — a fresh, independent `agda` invocation against the pinned SHA in an isolated directory, reusing the existing `materializeCaptureEnvironment`/isolated-temp-dir pattern from `scripts/oracle/orcl-01-differential.mjs` — and confirm the cache bundle's `.agdai` set matches. Do not let "Agda accepted it while building" substitute for that independent check, exactly per this project's own established doctrine (`ORACLE-VALIDITY.md`: cold re-run is necessary-but-not-sufficient, but IS sufficient for the specific "does the artifact reflect the pinned source" question the build pipeline needs answered).

**Warning signs:**
The cache-build pipeline has no post-build verification step distinct from "the build command exited 0"; published bundles are never spot-checked against a from-scratch rebuild; nobody can answer "how do we know bundle X really corresponds to SHA Y" other than "we built it that way."

**Phase to address:** cache-distribution

---

### Pitfall 6: tar-based ingest is a path-traversal / decompression-bomb / disk-fill surface even from trusted colleagues

**What goes wrong:**
TEAM-02/03's fail-open upload + ingest path moves a `tar.gz` bundle (captures + runs + full logs) from an agent's machine to the ingest server, which then extracts it for judging. Even with zero malicious intent, three concrete failure modes exist: (a) **path traversal** — a crafted or merely buggy tar entry (symlink/hardlink) can write outside the intended extraction directory; this is not theoretical for the exact tooling ecosystem this ingest endpoint would use — `node-tar` (the standard Node tar library) has a **current** advisory, `CVE-2026-23745`/`GHSA-34x7-hfp2-rc4v`, where hardlink-entry path resolution bypasses the traversal guard *even with `preservePaths: false` (the default)*, patched in 7.5.3; (b) **decompression bombs** — a small compressed payload expanding to gigabytes if the extractor doesn't track cumulative decompressed bytes; (c) **disk-fill** — repeated or oversized uploads with no size cap exhausting the PVC. This project has *already* shipped one path-traversal-class bug in an adjacent "replay an untrusted bundle" context: `scripts/verify-cold-replay.mjs`'s CR-01 finding (per `milestones/v1.0-MILESTONE-AUDIT.md`), while the *safe* pattern already exists a few files away (`orcl-01-differential.mjs`'s `materializeCaptureEnvironment`, which resolves every manifest-recorded path via `resolveFileWithinRoot`/`PathSandboxError` before writing, into a fresh `mkdtempSync` directory, silently skipping anything that escapes).

**Why it happens:**
"Trusted internal colleagues" addresses intent, not tooling bugs, stale client versions, or an old cached `tar.gz` accidentally re-uploaded from a different, larger directory. Ingest code is new, greenfield surface (no HTTP framework or tar dependency exists in this codebase today — `package.json` has none), so none of the project's existing path-sandboxing muscle memory applies automatically unless deliberately carried over.

**How to avoid:**
Pin whatever tar library is chosen to a patched version (`tar >= 7.5.3` if using `node-tar`) and do not rely on the library's own guard as the only layer — reuse the exact pattern already proven in this codebase: extract into a fresh `mkdtempSync` scratch directory, then validate every resulting path via `resolveFileWithinRoot`/`PathSandboxError` (or an equivalent realpath-contained check) before promoting anything to permanent storage. Decompress via streams (`zlib.createGunzip()` piped into the tar parser) and track cumulative bytes written across the whole archive, aborting once a hard ceiling (a few GB) is exceeded — never fully materialize an untrusted archive into memory or unbounded onto disk first. Enforce a hard `Content-Length`/streamed byte cap at the HTTP layer, before any tar logic runs at all.

**Warning signs:**
Extraction code trusts a third-party tar library's `preservePaths: false` as sufficient on its own; no independent post-extraction path check; no byte-count ceiling anywhere in the decompression path; the ingest endpoint has no request body size limit configured.

**Phase to address:** team-channel

---

### Pitfall 7: Fail-open retry storms burn expensive oracle-triad compute before the existing dedup ever engages

**What goes wrong:**
TEAM-02 is explicitly fail-open: upload failure never blocks work, and retries. A flaky network (exactly the condition fail-open is designed to tolerate) can cause the *same* capture bundle to reach the ingest server multiple times. This codebase's only current dedup mechanism, `upsertQueueEntry` (`scripts/queue/intake.mjs`), keys on the bug-report `fingerprint` and correctly collapses duplicates into a recurrence bump rather than a new row — but that dedup happens **after** the full oracle-triad + N-rerun anti-flake gate has already run to completion (potentially hours, per `ORACLE-VALIDITY.md`'s own numbers for agda-unimath/Hopf-scale corpora). Unattended cron judging with no upload-level dedup will cheerfully re-run the same expensive judgment N times for N retries of the identical bundle, and — if a queued cron slot only fires periodically — can starve genuinely-new uploads behind redundant re-verification of ones already resolved.

**Why it happens:**
The existing dedup was designed for the v1.0 hand-curated, low-volume queue-seeding flow, where re-running the triad twice for the same bug was never expensive relative to the number of intake events. Unattended, retry-tolerant upload changes that volume assumption.

**How to avoid:**
Add a cheap, early dedup layer *before* handing an uploaded bundle to the oracle triad: a content hash of the tar.gz itself (or a client-generated idempotency/upload ID persisted in the fail-open script's local retry state) checked against a small ingest-side ledger of already-processed archives. Treat the existing fingerprint-based queue dedup as the correctness backstop it already is — it does not need to change — but it should not be the *only* dedup layer once uploads are unattended and retry-driven.

**Warning signs:**
The cron judging log shows the same source hash/corpus SHA being fully re-triaged repeatedly; judging throughput degrades as retry volume grows; no upload-level identifier exists anywhere before the oracle pipeline is invoked.

**Phase to address:** team-channel

---

### Pitfall 8: Unattended cron judging turns "honest abstention" into invisible attrition

**What goes wrong:**
`ORACLE-VALIDITY.md` already establishes that a from-scratch unimath/Hopf-scale recompile will often exceed `AGDA_MCP_COMMAND_TIMEOUT_MS` and abstain (INCONCLUSIVE) "exactly where signal is most wanted," and that abstention rate must be "a first-class metric." That finding was made in a context where a human ran the wrap-up pipeline interactively and could *notice* a climbing abstention rate and retune. Unattended cron judging removes exactly that human. Once judging runs headless against a growing stream of team-uploaded corpora (each potentially a different size/shape than the four pinned fuel corpora the timeout defaults were tuned against), a rising INCONCLUSIVE rate becomes silent data loss — real defects an uploader thought they'd surfaced simply never reach the fix queue, and nobody is watching the trend to know it's happening.

**Why it happens:**
This is a genuinely *new* risk relative to v1.0/`ORACLE-VALIDITY.md`, not a repeat of it: the prior research treated abstention as a metric to *surface*; it did not yet have to contend with nobody being present to read the surfaced metric. Cron-driven judging on colleague-submitted corpora of unknown size/shape multiplies the chances of hitting a timeout that was tuned against four specific pinned corpora.

**How to avoid:**
Give the cron judging path its own alerting, not just a metric that sits in a log: track abstention rate over a rolling window and surface it somewhere a human will actually see (queue dashboard `scripts/queue/dashboard.mjs` is the natural home), with an explicit threshold that flags "abstention rate jumped" rather than requiring someone to go looking. Size the per-corpus timeout budget from the uploaded corpus's own declared scale where possible (e.g., a manifest field), rather than one global timeout tuned for the four known pinned corpora.

**Warning signs:**
No dashboard/alert surfaces INCONCLUSIVE trend over time; cron logs show growing abstention with nobody reviewing them; a colleague reports "I know I hit a bug" but nothing shows up in the queue and no INCONCLUSIVE record explains why.

**Phase to address:** team-channel

---

### Pitfall 9: The W2 policy-key bug is a recurring mismatch class, and it is invisible on the maintainer's own dev machine

**What goes wrong:**
The audited W2/POLICY-01 debt item (`scripts/oracle/run-oracle.mjs:222` calls `judgeOrcl02(artifactPath)` with **no** second argument, so `orcl-02-soundness-scan.mjs`'s `resolveDefaultPolicyKey` always derives the policy key from the corpus root's `.agda-lib` `name:` field, never consuming `fuel-corpora.json`'s already-test-validated `policyKey` column or the `--policy` flag the standalone script's own CLI already supports) is confirmed concretely on disk: `~/projects6/Codex-Homotopy-Group/Codex-Homotopy-Group.agda-lib` declares `name: Codex-Homotopy-Group`, while its policy file is `scripts/data/oracle-policy/codex-homotopy-group.json` (all-lowercase). **This is not a one-off fix — it is a structural mismatch class that will recur for every new corpus this milestone onboards** (Theme 2's team-submitted corpora have arbitrary `.agda-lib` names chosen by colleagues, not the maintainer). Worse: `loadOraclePolicy`'s regex validator (`^[A-Za-z0-9._-]+$`) happily accepts the mixed-case key, and macOS's default APFS/HFS+ filesystem is **case-insensitive but case-preserving** — so a lookup for `Codex-Homotopy-Group.json` on the maintainer's Mac dev machine will actually find `codex-homotopy-group.json` on disk and silently "work," masking the exact bug that will fail on any case-sensitive filesystem (Linux CI, and specifically the Linux-based JHU k8s judge this milestone is building toward).

**Why it happens:**
The default-policy-key heuristic ("derive from the corpus's own declared name") is a reasonable v1 shortcut for four hand-pinned corpora the maintainer controls the naming of. It stops being reasonable the moment external corpus names are involved, and the bug's local-dev invisibility is a pure accident of macOS filesystem semantics colliding with this specific naming mismatch.

**How to avoid:**
Fix at the root (already scoped as Theme 1/backlog-digestion): add `--policy` passthrough in `run-oracle.mjs` and/or consume `policyKey` from the task/upload manifest rather than re-deriving from `.agda-lib` `name:`. Critically, **test the fix on a case-sensitive filesystem or CI runner**, not just locally — a fix validated only on the maintainer's Mac could look correct while the exact mismatch it's meant to catch remains masked. Once Theme 2 ships, every ingested corpus needs an explicit, uploader-independent policy-key resolution (not a name-sniffing default) since colleagues will not curate `.agda-lib` names to match an internal policy filename scheme.

**Warning signs:**
A policy lookup that "just works" locally but was never verified against a deliberately-mismatched name on Linux; any new team-submitted corpus whose `.agda-lib` name doesn't exactly match an existing `scripts/data/oracle-policy/*.json` filename; ORCL-02 quietly reporting `no-policy` for a corpus that should have a policy.

**Phase to address:** backlog-digestion (root fix); recurs in team-channel if the fix doesn't also cover uploader-supplied corpora specifically

---

### Pitfall 10: Captures are version-pinned to Agda, but not to the agda-mcp-server release that produced them

**What goes wrong:**
`ORACLE-VALIDITY.md` point 8 establishes careful Agda-version handling: "do NOT treat every binary ≠ 2.9.0 as INCONCLUSIVE — only a binary that *differs from the captured one*." That discipline is about the **Agda** binary. It says nothing about the **agda-mcp-server** build that produced the original capture. A colleague's fail-open upload was generated by whatever server version their pinned-environment install (TEAM-04, git-install-based) happened to be on at capture time; the unattended cron judge runs against `main` at the time the cron fires — which, given ordinary development velocity, will usually be a *different* commit. If the classification logic, tool envelope shape, or `ToolResult` semantics changed between those two points (exactly the kind of change this milestone's own backlog-digestion theme is doing to ORCL-02!), replaying an old capture against a newer judge checkout can silently produce a different verdict than the one the uploader actually experienced — and nothing currently records or checks for that skew.

**Why it happens:**
This is a genuine extension of `ORACLE-VALIDITY.md`'s version-handling discipline into a dimension it didn't need to cover in v1.0, when every capture and every judgment ran against the same checkout. Team-channel uploads decouple "when this was captured" from "when this gets judged" for the first time.

**How to avoid:**
Record the server version (already available via `getServerVersion()`/`package.json`, plus ideally the git commit) in every capture/upload manifest, the same way Agda version is already recorded. When judging an upload whose recorded server version differs meaningfully from the judge's own checkout (a semver-minor bump, or a change touching classification logic since the capture), surface that as context on the resulting queue entry rather than treating the judgment as directly comparable to a same-version replay — mirroring the existing INCONCLUSIVE-on-Agda-version-diff discipline rather than inventing a new one.

**Warning signs:**
A queue entry sourced from an upload gives no indication what server commit produced the original capture; a defect judged "not reproducible" turns out to be an artifact of judging against a newer server than the one that captured it, not an actual non-repro.

**Phase to address:** team-channel

---

### Pitfall 11: Verbatim full-log uploads can carry accidental secrets, and the existing GitHub mirror is a re-broadcast risk

**What goes wrong:**
The team-channel design deliberately uploads full agent logs verbatim with no trimming or redaction (a decided, correctness-forced choice for a trusted-internal-colleagues channel — not being relitigated here). That decision is about *not prompting per upload*; it does not make the archived content immune to accidentally including something a colleague never meant to share broadly — a pasted API key, an absolute home-directory path, or content from an unrelated project the agent happened to read during the session. This project already has an **existing, optional** visibility mirror, `scripts/queue/mirror-github.mjs` ("stays an optional post-triage visibility mirror (cron it if wanted)"), which posts fix-queue content to GitHub Issues. If that mirror is ever cronned against queue entries whose provenance is a team-sourced upload, and it includes raw log excerpts in what it posts, the accidental-secret risk widens from "internal colleagues + maintainer" to "whoever can see that GitHub repo's issues" — a materially different trust boundary than the one the consent text describes.

**Why it happens:**
Theme 2 (verbatim upload) and an already-existing, independently-designed feature (`mirror-github.mjs`) were built for different purposes at different times and were never explicitly checked against each other's trust assumptions.

**How to avoid:**
Before enabling any cron on `mirror-github.mjs` for team-sourced entries, verify what it actually posts — if it includes raw log excerpts or file contents (not just fingerprints/summaries/classifications), either exclude team-sourced entries from the mirror or strip log content from what gets mirrored. Treat this as a required check at the point TEAM-03 ships, not an assumption.

**Warning signs:**
`mirror-github.mjs` is cronned without an explicit review of its output content for team-sourced entries; nobody can state definitively whether a mirrored GitHub issue could ever contain a verbatim log excerpt.

**Phase to address:** team-channel

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip the post-extraction `utimes()` step in the cache fetch script because it passes tests on a machine that happens to have compatible clock ordering | Simpler fetch script | Silent no-op cache on any machine where checkout postdates cache build (Pitfall 1) | Never |
| Match cache compatibility on `agda --version` string alone | Simple gate | Misses cabal-flag/build-provenance drift Agda's own check may not catch (Pitfall 2) | Only when the pipeline also controls the exact Agda binary at both ends (e.g. same nix derivation) |
| Trust the tar library's built-in path-traversal guard as the only defense | Less code to write | A single library-level bypass (as `node-tar` had, CVE-2026-23745) becomes a full compromise with no second layer (Pitfall 6) | Never for untrusted-origin archives, even from "trusted" uploaders |
| Register a self-hosted CI runner against the public repo because "it's just for a private cache build" | Fast path to solving OOM on GitHub-hosted runners | New RCE surface directly reachable by any public PR, colocated with ingest secrets (Pitfall 4) | Never while the repo is public |
| Derive oracle policy key from the corpus's own `.agda-lib` name rather than a passed-through manifest key | No extra plumbing | Silently degrades to no-policy for any corpus whose name doesn't match a policy filename — recurs per new corpus (Pitfall 9) | Never once external/uploaded corpora exist |
| Defer sha256/provenance discipline because "it's only the private channel for now" | Faster CACHE-01/02 ship | The unconditional-trust risk (Pitfall 5) doesn't wait for the public channel — a poisoned/mis-keyed bundle harms the private channel just as much | Acceptable to defer *public attestation* (CACHE-03, already deferred by design); never acceptable to defer basic build-output self-verification |
| Let the fail-open upload retry with no upload-level id/hash | Simpler client script | Retry storms redundantly burn hours of oracle-triad compute per duplicate before queue-level dedup ever engages (Pitfall 7) | Only tolerable at very low upload volume; revisit before wider team rollout |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Agda's `.agdai` staleness check | Assuming a checksum-verified download "just works" once placed | Explicitly re-stamp mtimes post-extraction; Agda's own freshness gate is mtime-based on top of hash/option consistency (Pitfall 1) |
| Agda's option-consistency check | Assuming a flags mismatch between cache and current run is silent/unsafe | Verified: Agda re-typechecks (does not error) when recorded options differ from current ones — self-correcting but wastes the whole point of the cache |
| Existing `scripts/oracle/run-oracle.mjs` → `orcl-02-soundness-scan.mjs` | Assuming the CLI's own `--policy` flag support means the orchestrator uses it | It doesn't (`judgeOrcl02(artifactPath)`, no options arg) — this is W2 exactly; any new call site (team-channel judging) must not repeat the same omission |
| Existing fix-queue dedup (`upsertQueueEntry` on `fingerprint`) | Assuming it's sufficient dedup for unattended, retry-tolerant uploads | It's a correct *final* backstop but runs only after full (expensive) judging; add an upload-level dedup layer earlier in the pipeline (Pitfall 7) |
| Existing `materializeCaptureEnvironment` safe-extraction pattern (`orcl-01-differential.mjs`) | Reinventing path-sandbox logic for the new tar ingest endpoint from scratch | Reuse the proven `mkdtempSync` + `resolveFileWithinRoot`/`PathSandboxError` pattern rather than trusting only the tar library's guard (Pitfall 6) |
| `scripts/queue/mirror-github.mjs` (existing, optional) | Assuming it was designed with team-sourced verbatim-log entries in mind | It predates Theme 2; audit its output content before cronning it against team-sourced entries (Pitfall 11) |
| `fuel-corpora.json`'s `policyKey` column | Assuming because it's "test-validated" it's actually consumed at runtime | It isn't (W2) — test validation of a data column is not the same as a runtime consumer existing |

## Kubernetes Deployment Lessons — Applicability (from `litellm-k8s-deploy`, 22 lessons)

The ingest endpoint and cache-build machine are explicitly the same JHU IDIES k8s-dev-style server the `litellm-k8s-deploy` skill already deployed to (same cluster family, same SSH-jump/CI/CD/Ceph pattern per `PROJECT.md`). Most infra plumbing lessons transfer directly; the two apps differ enough in shape (proxy Deployment vs. ingest endpoint + batch cache-build) that a few lessons need adaptation and a few real gaps exist that the litellm precedent never had to cover.

| # | Lesson | Applies here? |
|---|--------|----------------|
| 1 | SSH deploy key stored base64-encoded as a single line in GitHub Secrets | Verbatim |
| 2 | Image name must match the GitHub repo name exactly (underscore/hyphen) | Verbatim |
| 3 | Private images need `imagePullSecrets` in the deployment manifest | Verbatim |
| 4 | Ingress `pathType: ImplementationSpecific` for regex-shaped paths | Verbatim |
| 5 | Use non-root ports (not 80/443) since containers run as non-root | Verbatim |
| 6 | `ssh -A` + persist `SSH_AUTH_SOCK` via `$GITHUB_ENV` across CI steps | Verbatim |
| 7 | `no-cache: true` on Docker builds when changes seem not to take effect | Verbatim |
| 8 | No-cache headers on ingress responses | Verbatim — especially relevant for the cache-fetch endpoint's own HTTP responses |
| 9 | Aggregate logs into rolling files; avoid many small files on Ceph | Verbatim, and directly reusable: archive uploads as one rolling file per person/day (mirrors litellm's `YYYY-MM-DD.jsonl` pattern), not one file per capture event |
| 10 | Use unauthenticated `/health/liveliness` + `/health/readiness` for k8s probes | Verbatim |
| 11 | Build with `--platform linux/amd64` when developing on Apple Silicon | Verbatim — this dev machine is a Mac, cluster is amd64 |
| 12 | Check existing PVCs before requesting new ones (creation may be read-only) | Verbatim |
| 13 | Test SSH key access against the jump host before wiring CI/CD | Verbatim |
| 14 | Verify the actual provisioned namespace name (may differ from requested) | Verbatim |
| 15 | A config knob that looks like it should log/persist something may be a no-op | Adapted — the specific LiteLLM `log_file` trap doesn't apply, but the underlying lesson ("verify the ingest endpoint actually persists to the PVC, don't trust a config flag's name") transfers directly |
| 16 | Ceph directory owner UID (2231) must match pod `runAsUser` | Verbatim — same Ceph mount family, same UID requirement expected |
| 17 | First GHCR push needs manual "Add Repository" grant or Actions gets 403 | Verbatim |
| 18 | The CI SSH secret must exist before the deploy job can run | Verbatim |
| 19 | LiteLLM-specific OAuth-forwarding header bug + patch | **Not applicable** — app-specific to LiteLLM's Anthropic proxying |
| 20 | ConfigMap mount overrides the image-baked config; update both | Verbatim if config is templated via ConfigMap here too |
| 21 | Don't set `ANTHROPIC_API_KEY` on the pod for OAuth-based flows | **Not applicable** |
| 22 | Client `ANTHROPIC_AUTH_TOKEN` silently overrides Claude Code's OAuth flow | **Not applicable** |

**Genuine gaps the 22 lessons do not cover** (new territory this milestone must solve fresh, not by analogy): self-hosted-runner security on a public repo (litellm's CI never needed a self-hosted runner — see Pitfall 4); a from-scratch Bearer-key-per-person auth model (litellm uses OAuth passthrough + a single master key, a different shape than per-person revocable keys); tar/decompression-bomb handling (litellm accepts no file uploads at all); resource contention between two colocated heavy batch workloads on one node (litellm is a single stateless proxy Deployment, not a cron-judging + cache-building pair — see Performance Traps below).

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Ingest cron judging and CACHE-01 cache builds share one k8s node with no resource isolation | One OOM-kills the other; both stall | Set explicit k8s resource requests/limits on both workloads; schedule them to not overlap, or use separate node pools if the cluster supports it — `concurrencyPolicy: Forbid` alone only stops a CronJob from overlapping *itself*, not two different workloads | The first time a colleague's upload triggers judging at the same time a scheduled cache rebuild runs (agda-unimath-scale builds need >10GB RAM per `ORACLE-VALIDITY.md`) |
| Per-capture-event archival to Ceph (one small file per upload) | Ceph small-file performance degradation (the exact class litellm lesson #9 already flags) | Aggregate into rolling per-person/day archives, mirroring the litellm `jsonl_logger.py` pattern | As upload volume grows past a handful of colleagues |
| `test/fixtures/fix-queue.json` as a single flat file, fully read+parsed+rewritten atomically on every `upsertQueueEntry` call | Intake latency grows with queue size; write contention under concurrent cron judging | Fine at the current (dozens) scale; revisit (sharding, a real store) if unattended cron judging pushes intake volume well beyond the hand-curated v1.0 assumption | If team-channel + backlog-reverify intake rate exceeds what a full-file atomic rewrite can keep up with |
| Heavy corpora (agda-unimath/Hopf-scale) under a single global cron timeout tuned for four known pinned corpora | Rising INCONCLUSIVE rate on uploaded corpora of different shape/size (Pitfall 8) | Size timeout budget per-corpus where the manifest declares scale, rather than one global constant | As soon as an uploaded corpus is meaningfully larger/smaller than the four pinned fuel corpora the default was tuned against |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Registering a self-hosted GitHub Actions runner against the public `agda-mcp-server` repo for CACHE-01 builds | Arbitrary code execution on the same box as ingest Bearer keys and archived colleague logs, via any public PR (Pitfall 4) | Never register the runner on the public repo; drive builds via an operator/cron-triggered k8s Job instead |
| Trusting a tar library's path-traversal guard alone | A single library bug (e.g. the hardlink bypass in `node-tar` pre-7.5.3) becomes a full extraction-time compromise (Pitfall 6) | Pin the patched version AND independently re-validate every extracted path against the target root before promoting it |
| No request body size cap on the ~100-line HTTPS ingest endpoint | Memory/disk exhaustion from an oversized or slow upload, accidental or not | Enforce a hard streamed byte-count cap before any tar/zlib logic runs |
| Bearer key comparison via plain string equality | Minor timing side-channel (low severity for an internal tool, but free to close) | Use `crypto.timingSafeEqual` for the Bearer token check |
| Treating sha256 checksum verification as sufficient trust for `.agdai` bundles, even in the private channel | A mis-keyed or incorrectly-built bundle (wrong SHA, drifted flags) passes checksum but is still wrong — Agda will trust it unconditionally (Pitfall 5) | The build pipeline must independently re-verify its own output (at minimum an ORCL-01-style differential) before publishing, not just checksum what it produced |
| Assuming "verbatim, no redaction" for trusted uploads means the archived content is safe to mirror further | An incidentally-pasted secret or absolute path in a full agent log gets re-broadcast if `mirror-github.mjs` is ever cronned against team-sourced entries (Pitfall 11) | Audit `mirror-github.mjs`'s actual output content before enabling it for team-sourced queue entries |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Fail-open upload gives zero feedback on success/failure | A colleague has no idea whether their session ever reached the server, or whether a real defect they hit will ever surface | Write a local one-line "last upload: ok / failed, will retry" status at the end of the wrap-up script — still fail-open, just not silent to the person who ran it |
| CACHE-02's "graceful fallback to local build" fails cryptically | A maintainer burns time debugging a working-as-designed fallback, unsure if it's a real bug | Print the specific reason for fallback (version mismatch / SHA mismatch / checksum failure / network error), not just "using local build" |
| A revoked or never-issued Bearer key produces the same fail-open silence as a network blip | Nobody can tell "Alice's key was revoked" from "Alice's network dropped the upload" from the client side | Log enough server-side detail (per-key audit trail) to answer "why didn't this upload arrive" without over-sharing details back to the client |

## "Looks Done But Isn't" Checklist

- [ ] **Cache fetch script:** Often verified only by "checksum passed, exit 0" — verify it also re-stamps mtimes post-extraction and that a subsequent `agda_load` is measurably cache-fast, not cold-slow (Pitfall 1)
- [ ] **Cache fetch script, tested only on the build machine:** Often re-verified on the same machine that built the bundle, where stale mtimes/paths never surface — verify end-to-end from a fresh clone on a different machine
- [ ] **Ingest endpoint:** Often "accepts uploads with a Bearer key" without a body-size cap or a pinned/patched tar library — verify both exist before the first real colleague upload
- [ ] **Fail-open upload script:** Often "handles failures gracefully" untested — verify by pointing it at an unreachable URL and confirming the wrap-up script's exit code/duration are unaffected
- [ ] **Unattended cron judging:** Often "reuses the wrap-up machinery" without its own outer deadline — verify one wedged/hung corpus can't consume an entire cron slot indefinitely (needs a deadline distinct from per-command `AGDA_MCP_COMMAND_TIMEOUT_MS`)
- [ ] **W2 fix:** Often verified only against the two known corpora on the maintainer's Mac — verify against a deliberately-mismatched name on a case-sensitive filesystem/CI runner
- [ ] **CACHE-01 self-hosted runner:** Often assumed fine because "it's our own hardware" — verify it is not registered against the public repo before calling this shipped
- [ ] **`mirror-github.mjs` cronned for team-sourced entries:** Often enabled without auditing its actual output payload — verify it does not include raw log excerpts before enabling

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cache silently no-op'd for a while before noticed (Pitfall 1) | MEDIUM | Add a load-timing self-test to the fetch script; re-audit all previously "published" bundles specifically for the mtime issue; re-fetch/re-stamp as needed |
| Self-hosted runner already registered against the public repo (Pitfall 4) | HIGH | Immediately remove the runner label/registration from the public repo's workflows; rotate any secrets the runner could reach; audit Actions run history for unexpected forked-PR-triggered runs |
| W2-class policy mismatch caused a real cheat to go unfiled on a live upload (Pitfall 9) | MEDIUM | Re-run ORCL-02 with the corrected policy-key resolution against the archived original upload (raw uploads are retained precisely for this) — no data is lost |
| Ceph/queue-on-disk growth uncontrolled (Performance Traps) | LOW–MEDIUM | Retroactively aggregate historical per-event files into rolling per-person/day archives; add a retention/rotation policy going forward |
| A secret leaked via a mirrored GitHub issue (Pitfall 11) | HIGH | Revoke/rotate the leaked credential immediately; edit/delete the GitHub issue; add the missing content-exclusion to `mirror-github.mjs` before re-enabling its cron |
| Retry-storm burned significant judging compute on duplicate uploads (Pitfall 7) | LOW | Add the upload-level dedup layer; no queue corruption occurred since the fingerprint-based backstop already prevented duplicate rows |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Cache silently no-ops (mtime staleness) | cache-distribution | Fetch script re-stamps mtimes; self-test measures load time, not just checksum |
| 2. Exact-version-string insufficient (build provenance) | cache-distribution | Fetch gate keys off pinned-binary provenance, not `agda --version` string alone |
| 3. `.agdai` placement non-determinism | cache-distribution | Fetch script asserts/clears stray local-layout interfaces before writing |
| 4. Self-hosted runner on a public repo | cache-distribution | No `self-hosted` runner label registered against the public repo; builds run as a cluster-internal Job instead |
| 5. Cache build output unconditionally trusted | cache-distribution | Build pipeline runs an ORCL-01-style differential on its own output before publishing |
| 6. tar ingest path traversal / decompression bombs / disk-fill | team-channel | Patched tar version + independent post-extraction path check + streamed byte-cap all present before first real upload |
| 7. Fail-open retry storms burn judging compute | team-channel | Upload-level dedup (content hash / idempotency id) exists ahead of the oracle triad |
| 8. Unattended cron judging hides abstention | team-channel | Dashboard/alert surfaces INCONCLUSIVE rate trend; someone is notified, not just logged |
| 9. W2 policy-key recurrence (+ macOS masking) | backlog-digestion (root fix); team-channel (recurrence) | Fix verified on a case-sensitive filesystem against a deliberately-mismatched corpus name |
| 10. Version skew between capture and judge server build | team-channel | Capture/upload manifests record server version/commit; judged entries surface skew when meaningful |
| 11. Verbatim logs + GitHub mirror re-broadcast risk | team-channel | `mirror-github.mjs` output content audited/scoped before being cronned for team-sourced entries |

## Sources

- `agda.readthedocs.io/en/latest/tools/interface-files.html` — official interface-file relocatability, `_build/VERSION` layout (HIGH)
- `github.com/agda/agda` PR #3949 / issue #2610 — version-specific `_build` directory rationale (HIGH)
- `github.com/agda/agda` issue #7675 — open `toIFile` placement non-determinism regression, filed against 2.6.4.2 (HIGH)
- `github.com/agda/agda` issue #3199 — historical absolute-path serialization panic, Agda 2.5.4.1 (MEDIUM — old, illustrates historical fragility, not a live bug)
- `agda.readthedocs.io/en/latest/language/safe-agda.html` — coinfective options, `--safe`-disallowed feature table (HIGH)
- Agda `HACKING.md` / changelog guidance on `currentInterfaceVersion` bumping — interface format vs. release-string decoupling (HIGH for the mechanism; LOW–MEDIUM for the specific cabal-flags inference drawn from it)
- Search-verified: "if an interface file has been generated using different options... Agda will re-typecheck the file" — options-consistency behavior (MEDIUM-HIGH, multi-source corroborated)
- `github.com/UniMath/agda-unimath` live `ci.yaml` — actual CI cache key composition (`{OS}-check-{ref}-{agda-version}-{hashFiles(...)}`) (HIGH)
- `github.com/isaacs/node-tar` security advisory `GHSA-34x7-hfp2-rc4v` / `CVE-2026-23745` — current hardlink path-traversal bypass (HIGH)
- General decompression-bomb prevention practice (streaming + cumulative byte-count caps) (MEDIUM — established engineering consensus)
- `kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/` + community guidance — `concurrencyPolicy`/`activeDeadlineSeconds`/`startingDeadlineSeconds` (HIGH)
- GitHub official secure-use docs + community discussion #26722 — self-hosted runners on public repositories (HIGH)
- `gh repo view InvariantHoldings/agda-mcp-server` — live-checked repo visibility (`isPrivate: false`) (HIGH, directly verified)
- This repo: `src/agda/agdai-cache.ts`, `src/server-version.ts`, `src/agda/binary-discovery.ts`, `scripts/oracle/run-oracle.mjs`, `scripts/oracle/orcl-02-soundness-scan.mjs`, `scripts/oracle/orcl-01-differential.mjs`, `scripts/queue/intake.mjs`, `scripts/verify-cold-replay.mjs`, `scripts/data/fuel-corpora.json`, `scripts/data/oracle-policy/*.json`, `~/projects6/Codex-Homotopy-Group/Codex-Homotopy-Group.agda-lib` (HIGH — read directly)
- `.planning/research/ORACLE-VALIDITY.md`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md`, `.planning/NEXT-MILESTONE-SEED.md`, `.planning/PROJECT.md` (HIGH — primary project context)
- `~/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md` — 22 deployment lessons (HIGH — read directly)

---
*Pitfalls research for: adding a team feedback ingest channel + prebuilt `.agdai` interface-cache distribution to an existing agent self-improvement loop*
*Researched: 2026-07-03*
