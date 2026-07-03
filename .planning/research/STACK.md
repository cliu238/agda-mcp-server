# Stack Research

**Domain:** v1.1 "Feed the Loop" additions to `agda-mcp-server` — team feedback upload channel, HTTPS ingest endpoint (local-then-k8s), and prebuilt `.agdai` interface-cache build/publish/fetch pipeline
**Researched:** 2026-07-03
**Confidence:** HIGH — every load-bearing claim below (Node built-in capabilities, GitHub Releases limits, `gh` CLI syntax, Node LTS status, nginx-ingress defaults, macOS tar behavior) was verified against official documentation or first-party sources during this research pass, not asserted from training data alone. A small number of forward-looking/experimental-API points are explicitly flagged MEDIUM inline.

## Scope Note

This document covers **only the new capabilities for v1.1** (TEAM-0x team upload channel + CACHE-0x interface-cache distribution + the ingest app's container build). The existing, already-validated project stack — TypeScript ES2022 strict, Node.js >=24 native ESM, `@modelcontextprotocol/sdk`, `zod` v4, `vitest`+`@fast-check/vitest`, plain-`.mjs` orchestration scripts — is documented in `.planning/codebase/STACK.md` and is explicitly **not re-researched here** per the milestone brief.

## Headline Finding

**Zero new npm dependencies are required for either the team upload channel or the cache distribution pipeline.** Every capability needed — a minimal HTTP(S) ingest server, Bearer-key auth, streaming SHA-256 checksums, gzip/zstd compression, and a streaming HTTP upload/download client — is reachable through Node.js core modules already guaranteed by this project's existing `engines.node >=24` constraint, plus two CLIs that are already ambient on every target machine (`tar`, `gh`). This is the single most important, and most verifiable, conclusion of this research pass: it directly satisfies the milestone's "strong bias: Node.js built-ins first" instruction and the "no express/fastify... no AWS SDK" downstream guidance without any compromise.

All new code for these features must live **outside `src/`** — under `scripts/` (plain `.mjs`, matching the existing zero-dependency scripts convention) and/or a new non-published top-level directory for the deployable ingest service — because the locked decision is that the published MCP server package stays dependency-light and telemetry-free; the upload hook belongs to the recording-proxy/wrap-up layer only.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|------------------|
| `node:http` | Node >=24 (bundled) | The ~100-line ingest endpoint, in **both** local-Mac and in-cluster deployment modes | A single-route, raw-binary-body upload endpoint needs no routing/middleware. TLS is handled *outside* the app (loopback trust in local mode; nginx-ingress termination in k8s — the same pattern the reference `litellm-k8s-deploy` skill already uses for its own proxy container), so the Node process itself never touches certs. This directly satisfies "no express/fastify if node:http suffices." |
| `node:crypto` | Node >=24 (bundled) | Bearer-key comparison via `crypto.timingSafeEqual` (never `===` on secrets); streaming SHA-256 over every archive via `crypto.createHash('sha256')` piped through the upload/download stream | Streaming hashing handles multi-GB bundles in constant memory — never buffer a whole `.agdai` bundle into a `Buffer` to hash it. Also used to mint per-person keys (`crypto.randomBytes(32).toString('base64url')`). |
| `node:zlib` — gzip (Stable) and zstd (Experimental, see Version Compatibility) | Node >=24 (bundled); zstd APIs since v22.15.0 / v23.8.0 | Compression/decompression of tar streams for both TEAM-02 upload archives and CACHE-01/02 `.agdai` bundles | Node ships **both** codecs natively now — see "Compression choice" below. This means no system `zstd` binary is required on *any* target, which matters because zstd is **not** preinstalled on macOS (verified — Homebrew/MacPorts only) and is not guaranteed present on minimal Debian/Alpine container images either. |
| `node:stream` (`pipeline`/`promises.pipeline`, `Readable.toWeb`) | Node >=24 (bundled) | Composing `spawn(tar).stdout → zlib transform → fs.WriteStream` (pack) and the reverse (fetch/extract); adapting a Node `Readable` into a WHATWG stream for a `fetch` request body | `pipeline()` (not raw `.pipe()` chains) gives correct error propagation and guarantees streams/file descriptors are cleaned up on failure — important once these pipelines are moving multi-GB data unattended in a cron job. |
| `node:child_process` (`spawn`, not `execFileSync`, for anything multi-GB) | Node >=24 (bundled) | Spawn system `tar` for archive **structure only** (never ask `tar` to also compress); spawn `agda --version` / `gh` as already done elsewhere in `scripts/` | `execFileSync` buffers output in process memory (and has a `maxBuffer` ceiling) — wrong tool once files are multi-GB. `spawn` with the child's stdout/stdin wired directly into Node streams (or straight to a file descriptor) keeps memory bounded. This mirrors the project's existing convention (`scripts/oracle/cold-agda-session.mjs`, `scripts/oracle/orcl-01-differential.mjs`, `scripts/queue/mirror-github.mjs` already spawn/execFile external binaries rather than wrapping them in npm libraries). |
| System `tar` binary (bsdtar on macOS / GNU tar on Debian-based Linux) | Whatever ships with the OS — both are effectively always present | Archive **structure** only: bundle many small `.agdai`/capture/log files into one stream (`tar -cf - -C <dir> .` to stdout; `tar -xf -` from stdin) | Ubiquitous on both target OSes (macOS ships bsdtar by default; `tar` is part of Debian's essential package set), zero install step, and stylistically consistent with the project already shelling out to external binaries (`agda`, `gh`) instead of wrapping them in npm packages. |
| `gh` CLI (already authenticated per project constraints) | Any current 2.x release | `gh release create` / `gh release upload` / `gh release download` for CACHE bundle publish + fetch | Already a project dependency in spirit — `scripts/queue/mirror-github.mjs` already shells out to `gh`. Handles auth uniformly whether the release lives on a public or private repo, avoiding hand-rolled REST/token logic. |
| Global `fetch` (undici-backed) | Node >=24 (bundled; stable, unflagged since ~Node 21) | TEAM-02 upload client → ingest endpoint HTTP(S) request | Streaming request bodies work via `duplex: 'half'` plus `Readable.toWeb(nodeStream)` — verified current WHATWG/Node behavior (see Sources). Avoids `axios`/`node-fetch`/`got`, none of which do anything Node's own `fetch` doesn't already do on Node >=24. |
| Docker, official `node:24-bookworm-slim` (or `node:24-alpine`) base image | Node 24.x line (Active LTS) | Container for the ingest app | Published as a genuine multi-arch manifest (`linux/amd64` + `linux/arm64`). Because the app has **zero npm dependencies**, the Dockerfile needs no `npm install`/build stage at all — a `COPY *.mjs .` is the entire "build." This removes the most common Apple-Silicon-cross-build pain point (native addon compilation under QEMU emulation) entirely, since there is nothing to compile. |

### Supporting Libraries

**None required.** No `dependencies` or `devDependencies` entries need to be added to any `package.json` for TEAM-0x or CACHE-0x. See "What NOT to Use" below for the specific libraries this recommendation deliberately passes over, and why.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `docker buildx` | Cross-build the ingest image for `linux/amd64` from an Apple Silicon dev machine | `docker buildx build --platform linux/amd64 -t ghcr.io/<org>/agda-mcp-ingest:<tag> -f ingest/Dockerfile ingest/ --push` — directly reuses lesson #11 from `litellm-k8s-deploy`. Because there's no native compilation, this build is fast and low-risk compared to a typical Node app with native deps. |
| GitHub Actions self-hosted runner (`actions/runner`) | Runs CACHE-01's build+pack pipeline (GitHub-hosted free runners OOM on agda-unimath) | Standard GitHub-provided runner software registered directly on a host that already has Agda 2.8.0, git, `tar`, and Node >=24 (per project constraints). This is an ops setup, not a new library choice. |
| `kubectl` + nginx-ingress annotations | Deploy the ingest app per the `litellm-k8s-deploy` pattern (Deployment + ClusterIP Service + Ingress + Secret/ConfigMap) | **Requires** `nginx.ingress.kubernetes.io/proxy-body-size` override (verified default is ~1 MB) — see Pitfalls below. Without it, uploads beyond a few hundred KB silently 413. |
| GHCR (`ghcr.io`) | Container registry for the ingest image | Same pattern as the reference skill; remember the first-push "Manage Actions access → Add Repository → Write" step (lesson #17 in `litellm-k8s-deploy`) or CI gets a 403. |

## Installation

```bash
# No new runtime dependencies for src/ or scripts/ — the team-upload and
# cache-distribution additions use Node.js core modules exclusively:
#   node:http, node:crypto, node:zlib, node:stream, node:child_process,
#   node:fs, node:path, node:url, and the global `fetch`.
# There is nothing to `npm install`.

# Verify the two ambient external CLIs a fresh machine / self-hosted runner needs
# (already present per project constraints, listed here for completeness):
tar --version              # bsdtar (macOS) or GNU tar (Debian-based Linux) — both fine
gh --version && gh auth status

# Container build for the ingest app, cross-built from Apple Silicon for the
# amd64 k8s cluster (no native deps ⇒ no QEMU compilation risk):
docker buildx build --platform linux/amd64 \
  -t ghcr.io/<org>/agda-mcp-ingest:<tag> \
  -f ingest/Dockerfile ingest/ --push
```

## Compression Choice: gzip vs zstd for Multi-GB `.agdai` Bundles

**Recommendation: use Node's built-in `node:zlib` for compression in both cases — default to zstd for CACHE bundles (where ratio/speed on multi-GB payloads matters most), and gzip is an equally valid, fully-stable fallback if the team wants to avoid relying on an experimental API.** Critically, **never ask `tar` itself to compress** (no `-z`, no `--zstd`, no `-J`). Split the two responsibilities:

1. `tar -cf - -C <dir> .` — system `tar`, uncompressed, archive **structure only**, piped to stdout.
2. Pipe that raw tar stream through `zlib.createZstdCompress()` (or `createGzip()`) — Node's own compression, in-process, into the output file.

This split matters because:
- **zstd is not preinstalled on macOS** (verified: Homebrew/MacPorts only) and is not guaranteed present in minimal Debian/Alpine container images without an explicit package install. Relying on `tar --zstd` would require installing/maintaining a system `zstd` binary on every target (dev laptops, the self-hosted runner, and any container image) — an entire class of "which OS package happened to be installed" bugs that Node's own bundled zlib/zstd codec sidesteps completely, since it ships inside the Node binary itself on every target already satisfying this project's `engines.node >=24` requirement.
- Node's zstd implementation was added in **v22.15.0 / v23.8.0** (`zlib.createZstdCompress`/`createZstdDecompress`, plus one-shot `zstdCompress`/`zstdCompressSync`/`zstdDecompress`/`zstdDecompressSync`), so it is unconditionally available on Node 24.x. It exposes both streaming Transform classes and one-shot sync/async functions, and supports the standard tunables (compression level via `zlib.constants.ZSTD_c_compressionLevel`, checksums, dictionaries).
- **Caveat (MEDIUM confidence, honestly flagged):** as of the current Node docs, this API is marked **Stability: 1 (Experimental)** — it has not yet graduated to Stable. The blast radius of this is low here specifically because this code lives entirely in `scripts/`/the ingest app, never in `src/` (the published npm package), so a future signature change is a one-file fix, not a breaking change for any downstream consumer of `agda-mcp-server` itself. Isolate all compression calls behind one small shared helper module so that fix, if ever needed, stays localized.
- If the team prefers to avoid any experimental Node API for this milestone, `zlib.createGzip()`/`createGunzip()` (Stability: 2, fully Stable, present since early Node) is a drop-in substitute in the same helper module — same architecture, slightly worse ratio/speed on large corpora.
- **Hard constraint regardless of codec choice:** GitHub Releases caps each asset at **2 GiB** (verified — see below). agda-unimath's actual compiled `.agdai` closure size was not independently verified in this research pass (treat this as a real, unverified number — do not assume it fits comfortably under 2 GiB just because compression helps). Build the pack script with a size check and a splitting fallback (numbered part-assets, e.g. `bundle.tar.zst.part001`, reassembled by the fetch script) from day one, rather than retrofitting it after a corpus crosses the line.

## HTTPS Ingest Endpoint: Local-Then-k8s Design

The cleanest reading of "must run BOTH as a plain local Node process AND as a container on a k8s cluster" is that **the Node app code is identical in both modes** — a plain `node:http` server — because TLS is not the app's job in either topology:

- **Local mode (pre-2026-07-07):** the server binds to `127.0.0.1:<port>` (or `0.0.0.0` if testing across the LAN) and speaks plain HTTP. This is a bring-up/verification phase per `PROJECT.md`, not the trusted-team production path, so no self-signed cert machinery is needed.
- **k8s mode (post-arrival):** the identical container is deployed behind nginx-ingress (matching `litellm-k8s-deploy`'s Deployment + ClusterIP Service + Ingress shape). The ingress terminates TLS (cluster-provided cert, same pattern as `dev.sites.idies.jhu.edu`) and forwards plain HTTP to the pod. From the client's perspective the endpoint is genuinely `https://...`; the app itself never imports `node:https` or manages a certificate.

Point `scripts/dogfood/upload-run.mjs` at an env var (e.g. `AGDA_MCP_INGEST_URL`) so the same client code runs unmodified across both modes — only the URL changes.

### Server-side request handling (why no multipart library is needed)

Metadata (person, run-id, timestamp) fits naturally in custom request headers or the query string; the body itself can therefore be **one continuous raw octet-stream** (the already-compressed `.tar.zst`/`.tar.gz` file), not a `multipart/form-data` payload. That eliminates any need for `busboy`/`multer`/`formidable`: the `node:http` server just does (conceptually) `req.pipe(hashPassThrough).pipe(fs.createWriteStream(destPath))`, enforcing a max-byte guard while streaming and checking `Authorization: Bearer <key>` via `crypto.timingSafeEqual` against a hashed per-person key table (loaded from a local JSON file in dev, a mounted k8s Secret in production). This is precisely what keeps the endpoint at "~100 lines."

A `/healthz` branch in the same handler (unauthenticated, matching the reference skill's `/health/liveliness` pattern) is worth including for k8s liveness/readiness probes — it costs a handful of lines, not a new dependency.

## GitHub Releases: Current Limits (Verified)

- **Per-asset size limit: 2 GiB**, when uploaded via the API or `gh` CLI. The **web UI** upload path is capped much lower (25 MB) — irrelevant here since this pipeline is CLI-driven, but worth knowing if anyone is tempted to babysit a release by hand.
- **Up to 1000 release assets** may be associated with a single release (GitHub has begun actively enforcing this as policy).
- **No limit on total release size**, and no bandwidth-usage limit is documented.
- These figures come directly from GitHub's own "About releases" documentation (see Sources).

## `gh` CLI Idioms for CACHE-01/02

Verified against the current `cli.github.com` manual pages:

```bash
# CACHE-01 — publish (recommend one release TAG per exact
# (agda-version × corpus-SHA × flags) key, not one shared release with
# repeatedly re-uploaded same-named assets — see caveat below)
gh release create cache-agda2.8.0-agdastdlib-<sha8>-<flagshash> \
  --title "agda-stdlib @ 2.8.0 / <sha8>" \
  --notes "Prebuilt .agdai interface cache" \
  bundle.tar.zst bundle.sha256 manifest.json

# Uploading additional/updated assets to an existing release
gh release upload <tag> bundle.tar.zst manifest.json

# CACHE-02 — fetch: pull the small manifest FIRST, gate on it, only then
# pull the (potentially multi-GB) bundle
gh release download <tag> --pattern 'manifest.json' --dir <tmpdir>
# ... verify exact agda --version + corpus SHA + flags match the manifest ...
gh release download <tag> --pattern '*.tar.zst' --dir <tmpdir> --clobber
```

**Caveat worth designing around:** `gh release upload --clobber`'s own docs warn that clobbered assets are *deleted before* the new ones are uploaded — "if the upload fails, the original assets will be lost." For a rebuild-and-republish workflow, prefer **a fresh release tag per exact key tuple** (as above) over relying on `--clobber` to overwrite same-named assets inside one long-lived release; this sidesteps the data-loss window entirely and also matches how these bundles are naturally keyed.

**Recommended manifest-first gating pattern:** publish a small `manifest.json` (`{ agdaVersion, corpusKey, corpusSha, flagsHash, bundleFilename, sha256, sizeBytes, builtAt }`) as its own tiny release asset alongside the large bundle. CACHE-02's fetch script downloads this cheap file first and only pulls the multi-GB bundle if every gate (exact `agda --version`, corpus SHA, flags) matches — this directly and cheaply implements "strict-gated fetch script with graceful fallback to local build" without wasting bandwidth on a wrong-version download.

## Pitfalls Specific to This Stack (Verified)

1. **nginx-ingress default body-size cap.** The ingress-nginx default `client_max_body_size` (via the `nginx.ingress.kubernetes.io/proxy-body-size` annotation) is commonly **~1 MB**; anything larger gets a silent 413 unless the Ingress manifest explicitly overrides it (e.g. `proxy-body-size: "0"` for unlimited, or a generous explicit value). This is the single most likely "works locally, fails in the cluster" surprise for TEAM-03 and must be in the Ingress manifest from the first k8s deploy, not discovered after a failed upload.
2. **macOS `tar` embeds AppleDouble sidecar files by default.** bsdtar on macOS silently includes `._*` extended-attribute sidecar files unless disabled — pass `--no-mac-metadata` to `tar` directly (or set `COPYFILE_DISABLE` in the environment before invoking it) when packing an archive on a contributor's Mac. This matters concretely for TEAM-02: `scripts/dogfood/upload-run.mjs` runs on teammates' local (almost certainly macOS) dev machines, and every archive it produces will otherwise be littered with junk entries once extracted on the Linux ingest/judging side. It is largely moot for CACHE-01 if that pipeline's pack step runs on a Linux self-hosted runner.
3. **`gh release upload --clobber` is not atomic** — see the `gh` CLI idioms section above; prefer per-key release tags over clobbering.
4. **A single-shared-release-with-clobbered-assets model doesn't compose with the 2 GiB/asset or 1000-assets/release caps as the fuel-corpora matrix grows** (4 corpora × multiple Agda versions × multiple flag baselines). Key releases by tag (one per exact tuple) rather than by asset name inside one release; this both avoids the clobber risk and keeps each release's asset count trivially low.
5. **Do not let the ingest app import anything from this package's own `dist/`.** Even though the ingest service is not distributed via npm, importing from `agda-mcp-server`'s compiled output would pull in `@modelcontextprotocol/sdk` + `zod` for the sake of one tiny atomic-write helper, and would couple a supposedly-isolated ops service to the published package's internals. Re-implement the small "write to a temp file, then `fs.rename`" pattern directly and locally in the ingest app's own plain `.mjs` — a few lines, deliberately duplicated for isolation.
6. **Atomic `fs.rename` on the Ceph-backed PVC (MEDIUM confidence, worth a footnote):** POSIX rename-within-directory is safe on a local/RBD-backed volume; if the provisioned PVC is instead a shared CephFS mount, verify this before relying on rename-based atomicity for archive writes. The reference `litellm-k8s-deploy` skill's own logger only *appends* to daily JSONL files on that same class of storage rather than relying on atomic renames — worth confirming which backing mode is actually provisioned before the ingest app's write path is finalized.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Ingest HTTP server | `node:http` raw server | Express / Fastify | A single-route, raw-body upload endpoint gains nothing from a routing framework; adding one directly contradicts the "~100-line ingest endpoint" and "no express/fastify if node:http suffices" instructions. |
| Body parsing | Raw octet-stream body, metadata in headers | `multer` / `busboy` / `formidable` (multipart parsing) | Multipart exists to mix files and form fields in one request. Metadata here is a handful of scalar values that fit in headers/query string, so the body can be one continuous byte stream — no multipart parser is needed at all. |
| Archive creation | Spawn system `tar` (structure only) | npm `tar` package (pure JS, the same one npm itself uses) | A legitimate choice if Windows portability or "no external process" purity were required — neither applies (macOS dev machines + Debian-based Linux containers/runners only), and the codebase already spawns external binaries (`agda`, `gh`) rather than wrapping them, so spawning `tar` is the stylistically consistent choice, not an outlier. |
| Compression | Node built-in `zlib` (gzip stable; zstd experimental) | Shell out to system `gzip`/`zstd` binaries | `zstd` is not preinstalled on macOS and not guaranteed in minimal Linux container images; Node's own zlib module ships both codecs identically on every already-required target, removing an OS-package-availability dependency entirely. |
| Upload/fetch HTTP client | Global `fetch` (+ `duplex:'half'` for streaming uploads) | `axios`, `node-fetch`, `got` | All three exist to paper over gaps in Node's HTTP client ergonomics that no longer exist on Node >=24's built-in `fetch`/undici. |
| CACHE publish/fetch transport | `gh release create/upload/download` | Hand-rolled GitHub REST calls, or an S3/GCS bucket + AWS/GCS SDK | `gh` is already authenticated and used elsewhere in the repo (`scripts/queue/mirror-github.mjs`); no cloud storage account exists or is in scope, and a public cache channel is explicitly deferred. |
| Auth scheme | Static per-person Bearer key + `crypto.timingSafeEqual` | JWT (`jsonwebtoken` or similar) | Keys are hand-issued (one per teammate) and hand-revoked; there are no claims to encode, no expiry to verify beyond "is this key still active." A signed-token library solves a problem this design doesn't have. |
| Unattended judging schedule | OS/k8s-native scheduling (`cron` locally, a k8s `CronJob` in-cluster) invoking the existing wrap-up CLI | `node-cron` / `node-schedule` in-process scheduler | The judging step is already a batch CLI invocation (`dogfood-wrapup.mjs`); wrapping it in a persistent in-process Node scheduler adds a long-lived component and a new failure mode for no benefit over the platform's own cron/CronJob primitive. |
| Ingest app language | Plain `.mjs`, Node built-ins only | TypeScript (own `tsconfig`, build step) | Matches the existing `scripts/` convention exactly and keeps the Dockerfile to a single `COPY` (no `tsc` build stage, no multi-stage image). If type-checking is wanted later, JSDoc + `// @ts-check` (dev-time `tsc --noEmit` only) is a zero-runtime-dependency middle ground. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Express / Fastify | Adds a routing/middleware dependency to a deliberately minimal, single-route endpoint; contradicts the explicit "no express/fastify if node:http suffices" instruction | `node:http.createServer()` with one `if (req.method === 'POST' && url.pathname === '/ingest')` branch |
| `multer` / `busboy` / `formidable` | Solve multipart-form parsing; this endpoint has no multipart body | Raw octet-stream request body + custom headers for metadata |
| npm `tar` package | Reimplements in pure JS what the OS already provides on every target this project runs on | `node:child_process.spawn('tar', [...])` |
| System `gzip`/`zstd` CLI binaries (shelled out to directly) | `zstd` is not preinstalled on macOS and not guaranteed in minimal Linux images; adds an OS-package-availability dependency Node's own runtime already removes | `node:zlib`'s `createGzip()`/`createZstdCompress()` |
| `axios` / `node-fetch` / `got` | Recreate what Node's built-in, unflagged `fetch` (undici) already does on Node >=24 | Global `fetch` |
| `aws-sdk` / `@google-cloud/storage` | No cloud storage account exists or is in scope; storage is Ceph PVC (k8s) or local disk, and the artifact channel is GitHub Releases | `node:fs` streams (local/PVC) + `gh release upload`/`download` (GitHub Releases) |
| `jsonwebtoken` / other JWT libraries | Static, hand-issued/hand-revoked per-person keys have no claims or expiry to encode/verify | `crypto.randomBytes` to mint, `crypto.timingSafeEqual` to check, against a small keys table |
| `node-cron` / `node-schedule` | Adds a persistent in-process scheduler for what is really a periodic batch-CLI invocation | Host `cron` (local) or a k8s `CronJob` (in-cluster) calling the existing wrap-up script |
| A database / embedded store (SQLite, lowdb) for ingest bookkeeping | Violates the project's existing "no database" constraint; a small append-only JSONL log (matching `.agda-mcp/runs/<run-id>/flaky-captures.jsonl`'s existing convention) is already sufficient | `fs.appendFile`-based JSONL log of ingest events (person, timestamp, size, sha256, result) |

## Stack Patterns by Variant

**If running in local-Mac mode (pre-2026-07-07, before the k8s box arrives):**
- Bind the `node:http` ingest server to `127.0.0.1:<port>` (plain HTTP, no TLS in-app) for bring-up/verification.
- Drive `scripts/dogfood/upload-run.mjs` against `http://localhost:<port>/ingest` via an env var so the exact same client code works unmodified once the target flips to the k8s ingress host.

**If running in k8s mode (post-arrival):**
- Same Docker image, same `node:http` server code, deployed behind nginx-ingress (Deployment + ClusterIP Service + Ingress + Secret/ConfigMap, mirroring `litellm-k8s-deploy`).
- MUST set `nginx.ingress.kubernetes.io/proxy-body-size: "0"` (or an explicit generous value) on the Ingress — the ~1 MB default silently 413s real uploads.
- TLS terminates at the ingress; do not add a TLS/cert-handling library to the app itself.

**If packing an archive on macOS (a teammate's laptop, for TEAM-02):**
- Pass `--no-mac-metadata` to `tar` (or set `COPYFILE_DISABLE` first) to stop AppleDouble `._*` sidecar files from polluting every archive extracted later on the Linux side.

**If packing/extracting `.agdai` bundles on the Linux self-hosted runner or inside the container (for CACHE-01/02):**
- No macOS-specific handling needed.
- Still keep the two responsibilities split: `tar -cf - -C <dir> .` (uncompressed, to stdout) piped through the shared Node zlib helper — never `tar -czf`/`tar --zstd` directly — so the compression codec is controlled by one place instead of depending on which compression plugins happen to be linked into whichever `tar` build is present.

## Version Compatibility

| Package / Tool | Compatible With | Notes |
|-----------------|------------------|-------|
| `node:zlib` zstd APIs | Node >=22.15.0 / >=23.8.0 → unconditionally present across all of Node 24.x | Stability 1 (Experimental) per current Node docs; API shape has been stable since introduction but not yet promoted to Stable. Confined to `scripts/`/the ingest app, never `src/`, so a future change has zero blast radius on the published package. |
| Node.js 24.x | Active LTS as of mid-2026; EOL **2028-04-30** | Confirms the project's existing `engines.node >=24` constraint remains sound for this milestone's lifetime and well beyond. |
| `node:24-bookworm-slim` / `node:24-alpine` (Docker Hub official `node` image) | Multi-arch manifest: `linux/amd64` + `linux/arm64` | Cross-building `--platform linux/amd64` from Apple Silicon pulls only the amd64 layer of the base image; there is no native compilation step to cross-build since the app has zero npm dependencies. |
| GitHub Releases | 2 GiB hard cap per asset (API/`gh`); 25 MB cap only for the web-UI upload path; ≤1000 assets/release; no total-release-size cap | If any single (agda version × corpus SHA × flags) bundle's compressed size approaches 2 GiB, the pack script must split into numbered part-assets from day one — exact `.agdai` bundle size for agda-unimath was not independently verified in this pass; treat 2 GiB as a hard design constraint, not a distant hypothetical. |
| `gh` CLI | Any current 2.x release (already authenticated per project constraints) | `release create/upload/download` flag surface (`--pattern`, `--dir`, `--clobber`, `--skip-existing`, `-p`/`-t`/`-n`/`-F`) verified against the current `cli.github.com` manual pages. |

## Sources

- [About releases — GitHub Docs](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) — HIGH, verified per-asset (2 GiB), per-release asset count (1000), and "no total size limit" language directly.
- [gh release upload — cli.github.com manual](https://cli.github.com/manual/gh_release_upload) — HIGH, verified syntax, `--clobber` semantics and its documented data-loss caveat.
- [gh release create — cli.github.com manual](https://cli.github.com/manual/gh_release_create) — HIGH, verified syntax for title/notes/prerelease/draft/asset attachment.
- `gh release download` manual (cli.github.com) — HIGH, verified `--pattern`/`-D`/`--clobber`/`--skip-existing` flags.
- [Zlib — Node.js API docs](https://nodejs.org/api/zlib.html) — HIGH, verified zstd API surface, version introduced (v22.15.0/v23.8.0), Experimental stability marking, streaming + one-shot variants, default compression level.
- [Node.js — End-Of-Life / release schedule](https://nodejs.org/en/about/eol) and [endoflife.date/nodejs](https://endoflife.date/nodejs) — HIGH, verified Node 24 Active LTS status and 2028-04-30 EOL.
- [Docker Hub official `node` image](https://hub.docker.com/_/node) — HIGH, verified `-bookworm-slim`/`-alpine` multi-arch tag scheme.
- [ingress-nginx annotations reference](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/) and a HashiCorp support article on resolving 413s on nginx-ingress — HIGH, verified `proxy-body-size` annotation and the ~1 MB default-cap behavior.
- WebSearch corroboration (multiple independent hits) that `zstd` is not part of a stock macOS install and requires Homebrew/MacPorts (formulae.brew.sh and related) — MEDIUM-HIGH (no single official Apple source, but consistent across every independent hit).
- [macOS-created tar files display errors on Linux — aruljohn.com](https://aruljohn.com/blog/macos-created-tar-files-linux-errors/) and [Removing AppleDouble files — craig.is](https://craig.is/archiving/removing-apple-double-files-in-mac-os-x/23) — MEDIUM-HIGH, corroborate the AppleDouble `._*` sidecar-file behavior and the `COPYFILE_DISABLE` / `--no-mac-metadata` fix.
- [MDN: Request.duplex](https://developer.mozilla.org/en-US/docs/Web/API/Request/duplex), [Chrome for Developers: streaming requests with fetch](https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests), [whatwg/fetch issue #1254](https://github.com/whatwg/fetch/issues/1254) — MEDIUM-HIGH, confirm `duplex: 'half'` requirement for streaming fetch request bodies and explicitly name Node.js as a server capable of consuming a streamed request.
- Local codebase inspection (HIGH): `package.json`, `scripts/**/*.mjs` (existing `spawn`/`execFileSync`/`gh` conventions), `.planning/PROJECT.md`, `.planning/NEXT-MILESTONE-SEED.md`, `scripts/data/fuel-corpora.json`, `~/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md` (k8s deployment target pattern + 22 lessons).

---
*Stack research for: v1.1 "Feed the Loop" — team upload channel + `.agdai` cache distribution additions*
*Researched: 2026-07-03*
