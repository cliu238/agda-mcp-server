# Architecture Research — v1.1 "Feed the Loop"

**Domain:** Team feedback ingest + prebuilt `.agdai` interface-cache distribution, integrating into an already-shipped `scripts/`-layer self-improvement loop wrapped around a TypeScript MCP server (`agda-mcp-server`)
**Researched:** 2026-07-03
**Confidence:** HIGH for integration points (grounded in direct reads of the shipped `scripts/`, `src/`, `test/fixtures/` code and a real local corpus checkout); MEDIUM/LOW flagged inline for anything that depends on the not-yet-provisioned k8s server or the not-locally-cloned Hopf repo.

**Supersedes:** The prior `.planning/research/ARCHITECTURE.md` (dated 2026-07-01) described the *pre-implementation* design for Loop ②. That design shipped as v1.0 and is now real, working code — mapped authoritatively in `.planning/codebase/ARCHITECTURE.md`. This file does **not** re-derive that design; it documents ONLY the four new v1.1 integration surfaces (upload client, ingest+cron, cache distribution, local↔k8s seam) against the actual shipped files.

---

## 0. Ground Truth Established Before Designing Anything

Four facts, each verified by reading real shipped files, drive almost every recommendation below:

1. **Captures are self-contained except for one field.** `src/agda/session-capture/manifest-builder.ts`'s `buildReplayManifest()` embeds the entire first-party source closure verbatim (`inlinedFirstPartySources: Array<{path, content}>`, via `inlineFirstPartySources`). A capture artifact replays with **zero dependency on the recording machine's absolute paths** for the code under test. The ONE exception is `manifest.agdaDirContents.libraries` — an array of **absolute filesystem paths** to `.agda-lib` files (written by `src/agda/library-registration.ts`'s `createLibraryRegistration()`, read back by `readRealizedAgdaDir()`). `scripts/oracle/cold-agda-session.mjs`'s `agdaDirHashProbe` does `existsSync(path)` on each one. **Any capture that uses external library registration will abstain as `inconclusive` on a machine where those paths don't exist** — this is the central portability constraint for Theme 2's cron (§4).

2. **The flagship corpora vendor their dependency, they don't register it externally.** `~/projects6/Codex-Homotopy-Group/Codex-Homotopy-Group.agda-lib` (read directly) declares:
   ```
   name: Codex-Homotopy-Group
   include:
     src
     agda-unimath/src
   ```
   `agda-unimath` is a git submodule (`.gitmodules`) *inside* the CHG project root, included via a relative `include:` path — **not** `-l`-registered through `AGDA_DIR`. This means CHG's own `_build/` and agda-unimath's (vendored) `_build/` are the same directory tree. This directly shapes what a "library-cache prewarming whitelist" can safely mean for CHG/Hopf (§3) — it is a different case from a standalone `-l agda-stdlib`/`-l agda-unimath` registration.

3. **The W2/POLICY-01 bug has a concrete, verified root cause, and it's a portability landmine.** `scripts/oracle/orcl-02-soundness-scan.mjs`'s `resolveDefaultPolicyKey()` reads the `.agda-lib`'s `name:` field verbatim (`Codex-Homotopy-Group`) and `loadOraclePolicy()` loads `scripts/data/oracle-policy/${projectKey}.json` — a case-sensitive path. The actual policy file is `scripts/data/oracle-policy/codex-homotopy-group.json` (kebab-case). **On a case-sensitive filesystem (any Linux box — i.e. the k8s ingest/cron server, and any Linux teammate) this lookup fails outright and always returns `null`.** On the maintainer's Mac (default case-insensitive APFS) it likely *appears* to work by accident. This means local-Mac verification of the POLICY-01 fix is insufficient by itself — see §7.

4. **The oracle's cold replay already runs in a disposable, throwaway temp dir — nixpkgs' own `.agdai`-bundle shape validates the cache design.** `scripts/oracle/orcl-01-differential.mjs`'s `materializeCaptureEnvironment()` uses `mkdtempSync(join(tmpdir(), "agda-mcp-orcl01-src-"))`; `buildFreshProbe` asserts no `_build` exists there before the cold `Cmd_load`. Separately, `src/agda/session-capture/manifest-builder.ts` already models a **`buildMode: "shared"`** classification (a pre-existing `_build` older than 5 minutes) as a legitimate state for a *live* session — the capture schema already anticipates warm/shared caches, just never for the oracle's own disposable replay. And [nixpkgs' own `agdaPackages.mkDerivation`](https://ryantm.github.io/nixpkgs/languages-frameworks/agda/) ships exactly `.agda` sources + `.agdai` interfaces + `.agda-lib` per library derivation — confirming the bundle shape independently.

---

## 1. Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│  UNCHANGED — the shipped v1.0 loop (scripts/dogfood, scripts/oracle,      │
│  scripts/queue) + the published server (src/). Nothing here is modified   │
│  except two narrow plumbing seams marked with (*).                        │
└───────────────────────────────────────────────────────────────────────────┘

  Teammate's laptop                                    Maintainer's Mac (today)
  ┌─────────────────────────────┐                      ┌───────────────────┐
  │ .agents/skills/agda-dogfoo- │                      │ same, local-only   │
  │  ding/SKILL.md runbook      │                      │ endpoint mode      │
  │        │                    │                      └─────────┬─────────┘
  │        ▼                    │                                │
  │ dogfood-run.mjs (proxy) ────┼─── stdio ──► dist/index.js      │
  │        │ writes             │              (the server,       │
  │        ▼                    │               UNCHANGED)        │
  │ .agda-mcp/runs/<id>/        │                                  │
  │ .agda-mcp/captures/*.json   │                                  │
  │        │                    │                                  │
  │        ▼                    │                                  │
  │ dogfood-wrapup.mjs   (*policyKey plumbing, §7)                  │
  │        │ files/abstains                                        │
  │        ▼                    │                                  │
  │ test/fixtures/fix-queue.json│                                  │
  │        │                    │                                  │
  │        ▼  NEW (TEAM-02)     │                                  │
  │ scripts/dogfood/            │                                  │
  │   upload-run.mjs ───────────┼── HTTPS, Bearer key ────────────►│
  │  (tar.gz + fail-open        │                                  │
  │   retry queue, §2)          │                                  │
  └─────────────────────────────┘                                  │
                                                                     ▼
                                          ┌──────────────────────────────────┐
                                          │ NEW (TEAM-03) — scripts/team/     │
                                          │ ingest-server.mjs                 │
                                          │  storage: AGDA_MCP_TEAM_STORAGE_  │
                                          │  DIR (local dir today, Ceph PVC   │
                                          │  mount after ~07-07 — SAME code,  │
                                          │  §6)                              │
                                          │  layout: <root>/<person>/<date>/  │
                                          │          <run-id>.tar.gz          │
                                          └───────────────┬────────────────────┘
                                                           │ unattended cron
                                                           ▼
                                          ┌──────────────────────────────────┐
                                          │ NEW (TEAM-03) — scripts/team/     │
                                          │ cron-ingest-wrapup.mjs            │
                                          │  extracts to an isolated tmp dir, │
                                          │  imports (NOT re-invokes the CLI):│
                                          │   wrapUpCapture()  — dogfood-     │
                                          │     wrapup.mjs, UNCHANGED         │
                                          │   runOracle()      — run-oracle.  │
                                          │     mjs, UNCHANGED                │
                                          │   upsertQueueEntry()— queue/      │
                                          │     intake.mjs, UNCHANGED         │
                                          └───────────────┬────────────────────┘
                                                           ▼
                                    test/fixtures/fix-queue.json (SAME SSOT,
                                    now needs a commit/push step — §7 gap)
```

```
┌───────────────────────────────────────────────────────────────────────────┐
│  NEW (Theme 3) — CACHE distribution, orthogonal to the graph above         │
└───────────────────────────────────────────────────────────────────────────┘

  scripts/data/fuel-corpora.json (UNCHANGED, already the SSOT)
   { key, pinnedRef (=corpus SHA), policyKey }
  scripts/data/oracle-policy/<policyKey>.json (UNCHANGED, already has requiredFlags)
                       │  both already pinned — CACHE-01 needs ZERO new SSOT
                       ▼
  ┌─────────────────────────────────────┐
  │ NEW — scripts/cache/build-cache.mjs │   runs on a k8s pod registered as a
  │  clone corpus @ pinnedRef,          │   GitHub Actions self-hosted runner
  │  real `agda --version` (NOT         │   (>10GB RAM request — §6)
  │  package.json's maxTestedAgdaVersion│
  │  ceiling), full typecheck against   │
  │  the library's own entry module     │
  └─────────────────┬────────────────────┘
                     ▼ tar.gz of <checkout>/_build/<agdaVersion>/agda/**/*.agdai
                       + the .agda-lib file, sha256 sidecar
  ┌─────────────────────────────────────┐
  │ NEW — scripts/cache/publish-cache   │   `gh release upload` (private repo,
  │  .mjs                                │   reuses ALREADY-authed `gh` — zero
  └─────────────────┬────────────────────┘   new credentials)
                     ▼
  ┌─────────────────────────────────────┐
  │ NEW — scripts/cache/fetch-prebuilt- │   teammate's or ingest server's own
  │  cache.mjs (CACHE-02)                │   *persistent* clone of agda-stdlib /
  │  gates: exact `agda --version` ==,  │   agda-unimath (NEVER the corpus
  │  corpus HEAD SHA ==, sha256 verify,  │   under test's own _build — §3)
  │  else fall back to local build       │
  │  NEVER invoked by the server itself  │
  └───────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status | File |
|-----------|----------------|--------|------|
| Recording proxy | Tees agent↔server stdio, auto-persists captures | Unchanged | `scripts/dogfood/dogfood-run.mjs` |
| Wrap-up pipeline | Oracle triad → flake gate → queue filing | Unchanged (consumed) | `scripts/dogfood/dogfood-wrapup.mjs` |
| Oracle composer | Runs ORCL-01/02/03, writes verdict sidecar | Unchanged (consumed); needs a `policyKey` passthrough (§7) | `scripts/oracle/run-oracle.mjs` |
| Server-faithfulness differential | Cold replay in an isolated OS-tmp dir | Unchanged (consumed) — its fresh-`_build` invariant is the boundary CACHE-01 must respect | `scripts/oracle/orcl-01-differential.mjs` |
| Soundness scan | Static cheat scan + policy diff | Unchanged; already accepts `options.policyKey` override (unused today by its callers) | `scripts/oracle/orcl-02-soundness-scan.mjs` |
| Queue intake | Upsert-by-fingerprint into the flat-file SSOT | Unchanged (consumed) | `scripts/queue/intake.mjs` |
| Fuel corpus pins | `key → pinnedRef (corpus SHA) → policyKey` | Unchanged — already supplies 2 of CACHE-01's 3 cache-key components | `scripts/data/fuel-corpora.json` |
| Interface-cache inspection | Locates/busts per-source `.agdai` artifacts | Unchanged; directly reusable to *verify* a prewarm landed correctly | `src/agda/agdai-cache.ts` |
| Upload client | Tar/gzip captures+runs+agent logs, Bearer auth, fail-open retry | **NEW (TEAM-02)** | `scripts/dogfood/upload-run.mjs` |
| Ingest endpoint | ~100-line HTTPS receiver, archives by person/date | **NEW (TEAM-03)** | `scripts/team/ingest-server.mjs` |
| Cron re-drive | Extracts uploads, re-invokes wrap-up machinery unattended | **NEW (TEAM-03)** | `scripts/team/cron-ingest-wrapup.mjs` |
| Key issuance | Per-person revocable Bearer key ↔ person mapping | **NEW (TEAM-01)** | `scripts/team/issue-key.mjs` |
| Pinned-env installer | Exact server + Agda version, fixed fuel-corpus clone convention | **NEW (TEAM-04)** | `scripts/team/install-pinned-env.mjs` (or devcontainer) |
| Cache builder | Full cold typecheck of one pinned library corpus | **NEW (CACHE-01)** | `scripts/cache/build-cache.mjs` |
| Cache publisher | Uploads bundle + sha256 via `gh release` | **NEW (CACHE-01)** | `scripts/cache/publish-cache.mjs` |
| Cache fetcher | Strict-gated fetch, graceful local-build fallback | **NEW (CACHE-02)** | `scripts/cache/fetch-prebuilt-cache.mjs` |
| k8s manifests | Ingest Deployment/Service/Ingress + cache-build runner | **NEW** | `k8s/*.yaml` (new top-level dir, cloned pattern from `litellm-k8s-deploy`) |

---

## 2. Recommended Project Structure

```
agda-mcp-server/
├── src/                          # UNTOUCHED by this milestone (loop-wraps-the-server)
├── scripts/
│   ├── dogfood/
│   │   ├── dogfood-run.mjs       # unchanged
│   │   ├── dogfood-wrapup.mjs    # (*) gains a --policy passthrough, see §7
│   │   └── upload-run.mjs        # NEW (TEAM-02) — client-side, chained at wrap-up end
│   ├── oracle/                   # unchanged; run-oracle.mjs (*) threads options.policyKey through
│   ├── queue/                    # unchanged
│   ├── team/                     # NEW top-level dir — server-side Theme 2 pieces
│   │   ├── issue-key.mjs         # TEAM-01
│   │   ├── ingest-server.mjs     # TEAM-03 (the ~100-line HTTPS endpoint)
│   │   ├── cron-ingest-wrapup.mjs# TEAM-03 (unattended re-drive)
│   │   ├── install-pinned-env.mjs# TEAM-04
│   │   └── data/
│   │       └── team-keys.json    # gitignored — key-hash -> person mapping (revocation list)
│   └── cache/                    # NEW top-level dir — Theme 3
│       ├── build-cache.mjs       # CACHE-01
│       ├── publish-cache.mjs     # CACHE-01
│       └── fetch-prebuilt-cache.mjs # CACHE-02
├── k8s/                          # NEW top-level dir — ops only, cloned from litellm-k8s-deploy
│   ├── namespace.yaml
│   ├── ingest-deployment.yaml    # small footprint, mirrors litellm's deployment.yaml shape
│   ├── ingest-service.yaml
│   ├── ingest-ingress.yaml       # nginx-ingress, path-based, TLS terminated at ingress
│   ├── ingest-pvc.yaml           # Ceph-backed, RWX, archived uploads
│   └── cache-builder-runner.yaml # DIFFERENT resource profile: >10Gi memory request, no ingress
├── Dockerfile                    # NEW — Node 24 + agda (pinned) + git + gh; npm ci WITHOUT
│                                  #        --omit=dev (tsx/typescript are devDependencies and
│                                  #        scripts/ needs them at runtime, not just build time)
├── .github/workflows/
│   ├── ci.yml                    # unchanged
│   ├── deploy-ingest.yml         # NEW — mirrors litellm's deploy.yml (GHCR + SSH-jump kubectl)
│   └── build-agdai-cache.yml     # NEW — runs-on: [self-hosted, agda-cache-builder]
└── .agda-mcp/                    # already gitignored, already "emit-only, out-of-repo"
    ├── captures/, runs/          # unchanged
    └── team/
        └── upload-queue.jsonl    # NEW — client-side fail-open retry state (append-only NDJSON)
```

### Structure Rationale

- **`scripts/team/` is a new sibling of `scripts/dogfood/`, `scripts/oracle/`, `scripts/queue/`, not a subfolder of any of them.** The client-side piece (`upload-run.mjs`) belongs inside `scripts/dogfood/` because it is literally named there in the locked decisions (`.planning/NEXT-MILESTONE-SEED.md` Theme 2) and because it runs on the *recording* machine, chained at the end of the exact same wrap-up flow. The server-side pieces (ingest, cron, key issuance, pinned-env installer) run on a *different* machine entirely and have no reason to share a directory with client-only tooling — `scripts/team/` keeps that boundary explicit.
- **`scripts/cache/` is new and independent of `scripts/team/`.** Cache distribution and team-upload ingest happen to share one physical k8s box (delivery constraint), but they are logically unrelated pipelines (one is about interface-file distribution, the other about defect-report intake). Keeping them in separate directories avoids accidentally coupling their code paths the way the physical-server coupling might tempt.
- **`k8s/` and `Dockerfile` sit at the repo root, never under `scripts/` or `src/`.** They are declarative ops artifacts, not Node/tsx automation — this exactly mirrors `litellm-k8s-deploy`'s own top-level `k8s/` + `Dockerfile` + `.github/workflows/deploy.yml` layout (`/Users/eric/projects6/litellm/.claude/skills/litellm-k8s-deploy/assets/`).
- **`.agda-mcp/team/upload-queue.jsonl` extends an already-meaningful convention** rather than introducing a new gitignored bucket. `.agda-mcp/` is already documented in `.gitignore` as "Captured session artifacts (emit-only, out-of-repo)" and already hosts exactly this shape of append-only NDJSON side-channel (`oracle-metrics.jsonl` in `scripts/oracle/run-oracle.mjs`, `flaky-captures.jsonl` in `scripts/dogfood/dogfood-wrapup.mjs`). (The repo also has an unused, conventionless `local-only/` gitignore entry — grepped, zero references anywhere — so it carries no established meaning and isn't a natural fit either.)

---

## 3. Architectural Patterns

### Pattern 1: Reuse wrap-up machinery by importing its exported functions, never by re-invoking its CLI

**What:** `cron-ingest-wrapup.mjs` should `import { wrapUpCapture } from "../dogfood/dogfood-wrapup.mjs"` and `import { runOracle } from "../oracle/run-oracle.mjs"` directly, calling them once per extracted staged capture — exactly the same functions `dogfood-wrapup.mjs`'s own `scriptMain()` calls internally (`scripts/dogfood/dogfood-wrapup.mjs:197,328`).
**When:** Any time the milestone context says "reuses the existing wrap-up machinery unchanged."
**Trade-offs:** Direct import avoids spawning N subprocesses per cron tick and lets the cron driver supply per-upload `config.queueJsonPath`/`config.flakyLogPath` values cleanly (both already parameters `wrapUpCapture` accepts, `scripts/dogfood/dogfood-wrapup.mjs:197`). The cost is that the cron driver's own package.json/tsx resolution must live inside a full checkout of this repo (needed anyway — see Pattern 5).

### Pattern 2: One code path, one env var, two values (local dir vs Ceph PVC / GH self-hosted)

**What:** `scripts/team/ingest-server.mjs` resolves its storage root via a single `AGDA_MCP_TEAM_STORAGE_DIR` env var (naming consistent with the project's existing all-env-var configuration style: `AGDA_MCP_ROOT`, `AGDA_MCP_CAPTURE`, `AGDA_MCP_DEFAULT_FLAGS`, `AGDA_MCP_DOGFOOD_RUNS_ROOT` — the last of these, in `scripts/dogfood/transcript-writer.mjs:42`, is the direct precedent for this exact "env var overrides a repo-relative default" shape).
**When:** Any local-Mac-first-then-k8s seam (the delivery constraint's core requirement).
**Trade-offs:** Zero code branches on "am I in k8s" — the *only* difference between local mode and k8s mode is what path the env var is set to (a bind-mounted local dir vs. `/data/team-uploads` backed by the Ceph PVC, exactly mirroring `litellm`'s own `/data/logs` PVC mount in `assets/k8s/deployment.yaml:53-56`).

### Pattern 3: Fail-open client + gitignored local retry-queue NDJSON

**What:** `upload-run.mjs` wraps its HTTPS POST in try/catch; on failure it appends `{ts, runId, archivePath, error}` to `.agda-mcp/team/upload-queue.jsonl` and exits 0 regardless (upload failure must never fail the dogfooding session or the wrap-up chain — this is an explicit locked decision in `.planning/NEXT-MILESTONE-SEED.md` Theme 2).
**When:** Any network call from client-side tooling in this loop.
**Trade-offs:** Mirrors two existing precedents exactly: `scripts/dogfood/dogfood-run.mjs`'s own EPIPE-swallowing philosophy (`process.stdout.on("error", () => {})`, lines 175-176) and `promoteCapture`'s non-fatal try/catch pattern in `dogfood-run.mjs:226-236`. A separate, simple retry sweep (re-read the NDJSON, retry each line, truncate on success) can be its own tiny script or a flag on `upload-run.mjs` itself (`--retry-pending`) — no need for a queueing library.
**Caution:** Because `dogfood-wrapup.mjs` sets a non-zero `process.exitCode` when any capture errors (`scripts/dogfood/dogfood-wrapup.mjs:371`), chaining `upload-run.mjs` with `&&` after it would skip the upload on a partial-error wrap-up run. Chain with `;` (or invoke unconditionally) so uploads still happen when the local wrap-up run had partial trouble — the whole point of Theme 2 is to get real sessions off of a laptop and into the shared oracle-replay/queue pipeline even when the local run wasn't perfectly clean.

### Pattern 4: Corpus self-description closes the policyKey/portability gap (new, minimal schema addition)

**What:** Neither `ReplayManifest` (`src/agda/session-capture/artifact-types.ts`) nor `OracleSubstrate` (`src/agda/session-capture/oracle-substrate.ts`) nor the run report (`scripts/dogfood/transcript-writer.mjs`'s `getReport()`) currently records *which* `scripts/data/fuel-corpora.json` `key` a captured session belongs to — verified by grep, zero hits. `dogfood-run.mjs` already has the parsed task manifest in hand at the exact moment it builds the run (`loadTaskManifest(manifestPath)`, `scripts/dogfood/dogfood-run.mjs:147`), and `taskManifestEntrySchema.corpus` (`test/fixtures/task-manifest-schema.ts:28`) already carries this identity by convention. Recommendation: stash the distinct `corpus` value(s) actually used into `run-report.json` at recording time (`transcript-writer.mjs`'s `getReport()` return shape, currently `{schemaVersion, runId, startedAt, endedAt, corpusRoot, manifestPath, totalToolCalls, perTool, stagedCaptures, transcriptPath}` — add `taskManifestCorpora: string[]`).
**When:** Needed specifically so the unattended cron (which has no human to type `--policy <key>`) can look up `fuel-corpora.json[corpus].policyKey` and pass it through to `runOracle(artifactPath, { policyKey })` → `judgeOrcl02(artifactPath, { policyKey })` (the low-level function *already* accepts this override — `scripts/oracle/orcl-02-soundness-scan.mjs:550,588` — it is only ever called without it today).
**Trade-offs:** A tiny, additive, backward-compatible field (old run reports without it just mean the cron falls back to `resolveDefaultPolicyKey`, i.e. today's fragile behavior) versus inferring corpus identity from `corpusRoot`'s absolute-path basename (fragile in exactly the same way the W2 bug is fragile — reject this alternative).

### Pattern 5: GH Releases as the cache distribution channel — reuse already-authenticated `gh`, add zero new credentials

**What:** `scripts/cache/publish-cache.mjs`/`fetch-prebuilt-cache.mjs` use `gh release upload` / `gh release download` against the private `agda-mcp-server` (or a small companion) repo, rather than standing up a new object-storage credential or a bespoke auth scheme.
**When:** CACHE-01/02's build+publish+fetch pipeline.
**Trade-offs:** `.planning/PROJECT.md` explicitly states "No new credentials are needed before the server arrives: gh is authed as cliu238" — GH Releases give sha256-checkable, versioned, access-controlled (private-repo) asset hosting for free, and `gh` is already the tool this project reaches for whenever it needs authenticated GitHub access (`scripts/data/fuel-corpora.json`'s own notes cite `gh api`/`gh repo clone` throughout). The alternative (a bespoke bucket) would need its own credential, contradicting the explicit "no new credentials" constraint.

---

## 4. Data Flow

### Team feedback flow (upload → ingest → cron → wrapup → queue)

1. A teammate runs a dogfooding session (`.agents/skills/agda-dogfooding/SKILL.md` runbook, `scripts/dogfood/dogfood-run.mjs`) exactly as today; nothing about the *local* recording changes.
2. At session end, `scripts/dogfood/upload-run.mjs` (NEW) tars/gzips `.agda-mcp/captures/`, `.agda-mcp/runs/`, the Claude Code project log dir (`~/.claude/projects/<slug>/`), and the relevant Codex session files (picked by session/mtime, per the locked Theme 2 decision) — using the system `tar` binary via `child_process` (argv form, consistent with this project's existing "shell out to a real binary, never a shell string" security posture in `scripts/oracle/cold-agda-session.mjs`), **not** a new npm tar dependency (no npm publishing/2FA friction, and `.planning/PROJECT.md` states "npm deliberately not required anywhere" for this milestone).
3. POSTs the archive over HTTPS with `Authorization: Bearer <AGDA_MCP_TEAM_UPLOAD_KEY>` to `AGDA_MCP_TEAM_UPLOAD_URL`. No key set → the script no-ops entirely (locked decision: "No key → zero network behavior").
4. `scripts/team/ingest-server.mjs` (NEW) validates the Bearer key against its key→person map, writes the archive to `<AGDA_MCP_TEAM_STORAGE_DIR>/<person>/<date>/<runId>.tar.gz`, responds 2xx. It does **not** judge anything itself — pure archival, keeping the ~100-line budget.
5. An unattended cron (k8s `CronJob`, or plain crontab pre-k8s) runs `scripts/team/cron-ingest-wrapup.mjs` (NEW) on a schedule. For each not-yet-processed archive: extract to an isolated `mkdtempSync` dir (mirrors `materializeCaptureEnvironment`'s own convention in `scripts/oracle/orcl-01-differential.mjs:86`), read `run-report.json`, and for each `stagedCaptures[i].stagedPath` call `wrapUpCapture(artifactPath, artifact, { queueJsonPath, flakyLogPath, n, policyKey })` — **unchanged function**, imported from `scripts/dogfood/dogfood-wrapup.mjs`.
6. `wrapUpCapture` → `runOracle` → ORCL-01 (cold differential, in its own separate disposable tmp dir — see §5) / ORCL-02 (soundness scan, now policy-aware per Pattern 4) / ORCL-03 (conformance) → flake-gate (`classifyFlakiness`, `scripts/dogfood/flake-classify.mjs`) → `upsertQueueEntry` into `test/fixtures/fix-queue.json` — **the same SSOT** the local loop already uses.
7. Mark the archive processed (a `<archive>.processed.json` sidecar, mirroring the `.verdict.json` sidecar convention `scripts/oracle/run-oracle.mjs:239` already uses) so re-running the cron is idempotent.

**Gap flagged for requirements, not silently resolved here:** step 6's write to `test/fixtures/fix-queue.json` happens on the ingest server's own checkout. Getting that write back into the tracked repo (the actual SSOT lives in git) needs an explicit decision — either the cron commits+pushes to `main` directly (gh is already authed with presumably write access to this repo too) or opens a PR per batch. This is a genuine open design point, not an implementation detail — see §8.

### Cache flow (build → publish → fetch → corpus `_build/`)

1. `scripts/cache/build-cache.mjs` (NEW) clones (or updates) a **standalone** pinned library corpus — `agda-stdlib` or `agda-unimath`, per `scripts/data/fuel-corpora.json`'s `pinnedRef` — at its own dedicated checkout path (never the CHG/Hopf checkouts, which vendor agda-unimath rather than depend on it externally — §5).
2. Runs the pinned `agda` binary (resolved the same way `src/agda/binary-discovery.ts` does, or the `tooling/scripts/run-pinned-agda.sh` wrapper referenced in `CLAUDE.md`) against the library's own "everything" entry module, forcing a full typecheck of every module and fully populating `<checkout>/_build/<agdaVersion>/agda/**/*.agdai` — the exact layout `src/agda/agdai-cache.ts`'s header comment documents (citing Agda's own `Agda.Interaction.FindFile.toIFile`).
3. Tars up `_build/<agdaVersion>/agda/` + the corpus's own `.agda-lib` (mirroring nixpkgs' own install-phase contents), computes sha256, and `scripts/cache/publish-cache.mjs` uploads both as `gh release` assets tagged with a key derived purely from already-pinned data: `<policyKey>-agda<realAgdaVersion>-<pinnedRef short-SHA>.tar.gz` (zero new pinning SSOT — `fuel-corpora.json.pinnedRef` is the corpus-SHA component, `oracle-policy/<key>.json.requiredFlags` is the flags component, and a **real `agda --version` probe on the build machine** — never `package.json`'s `maxTestedAgdaVersion`, which is a compatibility ceiling, not an exact pin — is the version component).
4. `scripts/cache/fetch-prebuilt-cache.mjs` (NEW, CACHE-02), run by a teammate (or the pinned-env installer) *before* opening a heavy corpus: checks the local checkout's exact `agda --version` and `git rev-parse HEAD` against the bundle's tag, verifies sha256, and only then extracts directly into `<checkout>/_build/<agdaVersion>/agda/` — the exact path Agda itself already reads from natively, so no server-side config change is needed for Agda to "see" the warm cache. Any mismatch (wrong Agda version, corpus has moved past the pinned SHA, checksum fails) → no-op, falls through to a normal cold `agda_load` which builds the cache locally as it does today. **The running MCP server (`src/index.ts`) never calls this script itself** — fetching is always an explicit, human- or install-script-triggered step, never automatic, because `.agdai` files are unconditionally trusted by Agda (a poisoned interface can fake a checked proof) — this is a hard trust boundary, not a convenience default.

---

## 5. The ORCL-01 Fresh-`_build` Invariant vs. Library-Cache Prewarming

This is the open design point the milestone context calls out explicitly, and it resolves cleanly once the two "warm" scenarios in this codebase are told apart:

**Scenario A — a live dogfooding session (Theme 2's actual target).** A human/agent opens a real, persistent checkout (a teammate's clone of CHG, or a maintainer's clone of agda-unimath itself) and calls `agda_load`. `src/agda/session-capture/manifest-builder.ts`'s `detectBuildFreshness()` *already* classifies this as `"shared"` when a pre-existing `_build` is more than 5 minutes old — a state the capture schema already names and accepts. **A prewarmed `.agdai` cache in this scenario is not a new concept; it's the existing `"shared"` buildMode, just deliberately populated ahead of time instead of accumulated incidentally across sessions.** This is where CACHE-01/02's actual value proposition lives — the milestone text's "agda-unimath cold typecheck is ~hours + >10GB RAM" is about *this* first `agda_load`, and it is not gated by any freshness invariant today.

**Scenario B — ORCL-01's cold replay (must stay untouched).** `orcl-01-differential.mjs`'s `materializeCaptureEnvironment()` always creates a brand-new OS-tmp directory holding only `inlinedFirstPartySources` (the sources under test), and `buildFreshProbe` fails the whole replay ("inconclusive") if `_build` exists there *at all* before the cold `Cmd_load` — a coarse, existence-only check. **This check must never be relaxed for the corpus's own first-party sources being tested** — that is precisely what "server-faithfulness" means: it has to fail exactly as a from-scratch clone would fail.

The interaction the milestone context asks about:

- For `agda-stdlib` and standalone `agda-unimath` (both pinned in `scripts/data/fuel-corpora.json`, both cloned on their own, both real `-l`-style library roots): a prewarmed `_build` lives at `<their-own-checkout>/_build/...` — a directory ORCL-01's `materializeCaptureEnvironment` **never touches** (it only ever writes into a fresh `mkdtempSync` dir, never into a persistent library checkout). **Zero conflict.** These are the corpora a prewarm whitelist should target.
- For CHG and (very likely, unverified — see confidence note below) Hopf, agda-unimath is **vendored inside the same project root** (`include: src / agda-unimath/src`, verified directly against `~/projects6/Codex-Homotopy-Group/Codex-Homotopy-Group.agda-lib`). Its `inlinedFirstPartySources` therefore include agda-unimath's own vendored files, and its `_build` is the *same* `_build` ORCL-01's `buildFreshProbe` inspects. **A whitelist that pre-seeds any `.agdai` file into that replay's `_build` would trip `buildFreshProbe` today** (it is a whole-directory existence check, not a per-path-prefix check) — turning every ORCL-01 replay against CHG/Hopf permanently `inconclusive`.
- **Recommendation for v1.1:** scope the prewarm whitelist to standalone library corpora only (agda-stdlib, agda-unimath-as-pinned-standalone) for both the live-session cache *and* CACHE-01/02's build/fetch pipeline. Do **not** attempt to extend prewarming into ORCL-01's disposable replay tmp dir for CHG/Hopf in this milestone — doing so safely would require changing `buildFreshProbe` from "no `_build` at all" to "no `_build` entries outside an explicit vendored-library path-prefix whitelist," which is a real code change to Phase-2-owned oracle code, not a data/ops change, and is better deferred until the live-session cache has actually proven its value. Document this explicitly as a known, deliberate limitation rather than silently under-delivering it.
- (Confidence note: Hopf's exact vendoring style — vendored submodule like CHG, vs. genuinely `-l`-registered — is **not independently verified**; only CHG's `.agda-lib` was read directly. Verify Hopf's own `.agda-lib`/`include:` the same way once it is cloned, since it changes which bucket it falls into above.)

---

## 6. `.agdai` Bundle Anatomy and the Local↔k8s Seam

### What's in the bundle (HIGH confidence — cited from shipped code + external precedent)

- The per-source interface tree `<corpusRoot>/_build/<agdaVersion>/agda/<relPathFromLibraryRoot>.agdai` — this is Agda's own "separated interface" layout, documented (with a citation to Agda's own `Agda.Interaction.FindFile.toIFile`) in `src/agda/agdai-cache.ts:6-20`.
- The corpus's own `.agda-lib` file (needed so a fetcher/consumer can confirm identity/version compatibility without re-parsing anything else).
- Independently validated by [nixpkgs' own `agdaPackages.mkDerivation`](https://ryantm.github.io/nixpkgs/languages-frameworks/agda/), whose default install phase "copies Agda source files, Agda interface files (`*.agdai`) and `*.agda-lib` files to the output directory" — the exact same three-part shape.

### What's NOT in it

- **No MAlonzo / compiled-backend output.** Grepped `src/` and `scripts/` for `MAlonzo` — zero hits outside the `.gitignore` entry for integration-test fixtures (`test/fixtures/agda/MAlonzo/`, unrelated to this milestone). MAlonzo is GHC-backend codegen output for `agda --compile`/`Cmd_compile` (`src/agda/backend-operations.ts`); the milestone's own stated cost ("cold typecheck is ~hours") is specifically about typechecking, which never touches MAlonzo. Do not bundle it.

### Where it lands, and the seam

- `fetch-prebuilt-cache.mjs` extracts **directly into** `<checkout>/_build/<agdaVersion>/agda/` — no indirection layer, because that's the exact path Agda itself reads natively; `src/agda/agdai-cache.ts`'s existing `findAgdaiArtifacts`/`bustAgdaiCache` functions can even be reused as-is to *verify* a prewarm landed (they already understand this precise layout).
- The **local↔k8s seam for the fetch/build side is a checkout-path argument, not an env var** — `build-cache.mjs`/`fetch-prebuilt-cache.mjs` operate on whatever corpus checkout path they're pointed at; on a teammate's laptop that's wherever they cloned agda-stdlib/agda-unimath, on the k8s build box it's a path on the same PVC the build job mounts.
- The **local↔k8s seam for the ingest endpoint** is `AGDA_MCP_TEAM_STORAGE_DIR` (Pattern 2) — locally a plain directory under, e.g., a scratch path outside the repo; on k8s, a Ceph PVC mount (mirroring `litellm`'s own `sciserver-datavolumes-01-rw` PVC mounted at `/data/logs`, `assets/k8s/deployment.yaml:53-56,93-96`).
- **Resource-request asymmetry (k8s side):** the ingest endpoint is a small, always-on HTTP service — `litellm`'s own Deployment requests only `256Mi`/`250m` CPU (`assets/k8s/deployment.yaml:66-68`), and the ingest endpoint should look similar. The cache-build workload is the opposite: a rare, large, one-shot batch job needing `>10Gi` memory request (the milestone's own stated floor; recommend requesting comfortably above it, e.g. 16Gi request / 24Gi limit, pending real measurement on first build). **These cannot share one Deployment's resource profile** — model the cache builder as a registered GitHub Actions self-hosted runner (`runs-on: [self-hosted, agda-cache-builder]` in a new `.github/workflows/build-agdai-cache.yml`, triggered by `workflow_dispatch`/schedule) running on its own pod/Job with its own oversized resource request, decoupled from the ingest Deployment's manifest. This also reuses the exact CI/CD skeleton (`GHCR + GitHub Actions` — though here there's no container image to push, just a data artifact published via `gh release`) `litellm-k8s-deploy`'s `assets/.github/workflows/deploy.yml` already demonstrates.
- **New Dockerfile complexity worth flagging early:** unlike `litellm`'s Python-proxy image, this image needs Node 24, a full `npm ci` **including devDependencies** (because `tsx`/`typescript` — currently `package.json` devDependencies — are required at runtime by every `scripts/*.mjs` file, not just at build time), `npm run build` (producing `dist/index.js`, which `test/helpers/mcp-harness.ts:34`'s `buildHarnessServerParameters()` spawns directly — the flake-gate replay and any real dogfooding session both need a *built* server, not `tsx src/index.ts`), a pinned `agda` binary matching the fuel corpora's validated version, plus `git` and `gh`. This is meaningfully heavier than `litellm`'s own Dockerfile and should be budgeted as its own build-order step (§7), not assumed to be a copy-paste of the existing skill's Dockerfile.

---

## 7. Suggested Build Order

The server itself arrives ~2026-07-07 (day ~4 of this milestone per the delivery constraint); everything must be locally verifiable on the Mac first, with k8s deployment as a genuinely thin, late step. Ordering below is dependency-driven, not theme-ordered:

1. **POLICY-01 fix first, before anything else touches the oracle path.** `judgeOrcl02` already accepts `options.policyKey` (`scripts/oracle/orcl-02-soundness-scan.mjs:550`) — the fix is CLI/options plumbing through `run-oracle.mjs` (add `options.policyKey` passthrough to its `judgeOrcl02` call, currently dropped) and `dogfood-wrapup.mjs` (add a `--policy` flag). **Verify the fix on a case-sensitive filesystem or with a unit test that doesn't rely on macOS's case-insensitive default** — §0.3 showed the bug can silently "pass" locally on the maintainer's Mac while remaining fully broken on the Linux k8s server. This is why it's first: Theme 2's whole cron depends on ORCL-02 actually firing for CHG/Hopf-shaped uploads, and this milestone explicitly notes POLICY-01 "directly protects Theme 2's team-submitted corpora" (`.planning/PROJECT.md`).
2. **REVERIFY-01** (re-run the 8 `needsReverify` CHG specs through the now-fixed pipeline). This is both real fuel for the loop and a live end-to-end test of the fixed policy plumbing before any new infrastructure is built on top of it.
3. **Theme 2, client-and-manual-server-first (no k8s needed yet):** build `upload-run.mjs` (TEAM-02) and a **local-mode** `ingest-server.mjs` (TEAM-03, listening on localhost, `AGDA_MCP_TEAM_STORAGE_DIR` pointed at a local scratch dir) together, since they're two ends of one wire protocol and are cheapest to test as a pair. Add the corpus-self-description field to `run-report.json` (Pattern 4) in the same pass, since the cron (next step) needs it.
4. **`cron-ingest-wrapup.mjs`**, run manually (not yet on a schedule) against the local ingest storage dir, proving the "extract → `wrapUpCapture` → `fix-queue.json`" path end to end using the real captures from step 2's re-verification run as fixture data. Resolve the "how does a queue write on a server get back into git" gap (§4) here — a decision, not an afterthought — before this is ever unattended.
5. **TEAM-01 (key issuance) + consent text**, layered onto the now-working ingest endpoint — this is process/documentation work, cheap, and gates nothing upstream, so it can slot in whenever convenient before real teammates are onboarded.
6. **Theme 3, build-side first:** `build-cache.mjs` against `agda-stdlib` (small, fast, public — a cheap proof of the whole pipeline) before attempting `agda-unimath` (large, slow, the actual pain point). Confirm the bundle's exact contents/size and the real wall-clock/RAM cost empirically here — this is what turns the milestone's own ">10GB RAM" estimate from an assumption into a measured fact for the later k8s resource request.
7. **`fetch-prebuilt-cache.mjs` (CACHE-02)** against the agda-stdlib bundle from step 6, proving the strict-gate/fallback logic locally.
8. **`agda-unimath` cache build**, now that the pipeline is proven cheap-corpus-first. Explicitly do *not* attempt to extend this to CHG/Hopf's own vendored `_build` (§5) in this pass — document it as deferred.
9. **TEAM-04 (pinned-environment distribution)**, once both Theme 2 and Theme 3 have real, working local scripts to pin — this is intentionally late because it packages steps 3-8's outputs (install script/devcontainer referencing the real upload URL, key mechanism, and cache-fetch script), and because it's also where the fuel-corpus **absolute-path portability problem** (§0.1) should be solved once, structurally: mandate a fixed clone-path convention (e.g. always under `~/.agda-mcp-fuel/<corpus-key>`) across every dogfooding machine, including whatever the k8s box eventually clones to.
10. **k8s deployment, last and thin.** Once every script above is proven locally: write `k8s/*.yaml` (cloning `litellm-k8s-deploy`'s Deployment/Service/Ingress/PVC/Secret/ConfigMap shapes for the ingest endpoint specifically) plus the separate self-hosted-runner registration + oversized resource request for cache builds, the new Dockerfile (§6's flagged complexity), and `.github/workflows/deploy-ingest.yml` + `build-agdai-cache.yml`. Point `AGDA_MCP_TEAM_STORAGE_DIR` at the real Ceph PVC mount and re-run steps 3-4's tests against the deployed endpoint before calling Theme 2 "live." This step is naturally gated on the server's ~07-07 arrival and should not be started earlier than that.

**Why POLICY-01 leads and k8s trails:** every other new piece either produces or consumes fix-queue entries whose correctness depends on ORCL-02 actually being able to load a policy for the two flagship corpora — building the ingest/cron/cache pipeline on top of a silently-broken policy lookup would mean the very first real uploads from teammates get judged wrong in a way that's invisible until someone notices zero cheat-findings ever file. And the k8s manifests are pure packaging around scripts that are each independently, locally testable — front-loading them would mean debugging application logic through a slower k8s deploy/redeploy cycle instead of `node`/`tsx` directly.

---

## 8. Anti-Patterns

### Loop-wraps-the-server violations (existing invariant, re-affirmed for this milestone)

**What people might do:** Add the ingest endpoint, the upload hook, or cache-fetch logic as a new `src/tools/*.ts` MCP tool or a new module under `src/`.
**Why it's wrong:** `.planning/PROJECT.md`'s own locked decision states the upload hook "lives in the recording proxy / wrap-up layer, never in the published npm server (public package stays telemetry-free)." All four new components in this milestone are process tooling around the server, exactly like the entire v1.0 loop — none of them belong in `src/`.
**Do this instead:** `scripts/team/`, `scripts/cache/`, and `k8s/` as laid out in §2.

### Auto-fetching `.agdai` bundles from inside the running server

**What people might do:** Have `src/index.ts` or any `src/agda/*` module reach out to fetch a prebuilt cache automatically on startup or on a cache-miss.
**Why it's wrong:** `.agdai` files are unconditionally trusted by Agda — a poisoned interface can fake a checked proof. `.planning/NEXT-MILESTONE-SEED.md` states explicitly: "the server NEVER auto-downloads." This is a trust boundary, not a convenience default.
**Do this instead:** `fetch-prebuilt-cache.mjs` is always an explicit, separately-invoked script (by a human or an install step), never wired into any code path the running MCP server executes.

### Inferring corpus/policy identity from a filesystem name string

**What people might do:** Fix POLICY-01 (or the cron's corpus lookup) by pattern-matching `corpusRoot`'s absolute-path basename against known corpus names.
**Why it's wrong:** This is the exact fragility class that caused W2 in the first place (`.agda-lib`'s `name:` field vs. the oracle-policy filename convention silently disagreeing) — case sensitivity, punctuation, and casing conventions drift independently across the `.agda-lib` `name:` field, the directory a corpus happens to be cloned into, and the `scripts/data/oracle-policy/*.json` filename.
**Do this instead:** Thread an explicit, already-pinned identity (`fuel-corpora.json`'s `key`, sourced from the task manifest's `corpus` field per Pattern 4) rather than re-deriving it from a string that was never designed to be a stable identifier.

### Verifying a cross-platform bug only on the (case-insensitive) Mac

**What people might do:** Confirm the POLICY-01 fix works because a local `npm run test:all` passes on the maintainer's Mac.
**Why it's wrong:** §0.3 shows the underlying bug (case mismatch between `Codex-Homotopy-Group` and `codex-homotopy-group.json`) can silently succeed on default-case-insensitive APFS while remaining completely broken on the Linux k8s server this milestone is explicitly building toward.
**Do this instead:** Add a unit test that asserts `loadOraclePolicy()`/`resolveDefaultPolicyKey()` behavior with an explicit case-sensitive string comparison (not relying on the filesystem to paper over a mismatch), or run the relevant test on a case-sensitive volume/CI runner before considering the fix verified.

### Conflating the live-session "shared" cache with ORCL-01's disposable replay cache

**What people might do:** Try to make CACHE-01/02's prewarm whitelist also speed up ORCL-01's cold differential for CHG/Hopf by pre-seeding their materialized replay tmp dir.
**Why it's wrong:** As shown in §5, `buildFreshProbe` is a coarse whole-directory check today; pre-seeding any `.agdai` there makes every replay against those two flagship corpora permanently `inconclusive` until the probe itself is refined to a path-prefix-aware check — a real Phase-2-oracle code change, not a data/ops change.
**Do this instead:** Scope prewarming to standalone library checkouts (agda-stdlib, agda-unimath-as-pinned) for both the live-session cache and CACHE-01/02; leave CHG/Hopf's oracle-replay path exactly as slow (and exactly as fresh) as it is today, and document the limitation rather than quietly under-delivering it.

---

## 9. Integration Points

### External services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| JHU IDIES k8s-dev cluster (arrives ~07-07) | Same namespace-per-app / SSH-jump `kubectl` pattern as `litellm-k8s-deploy` (`dslogin01.pha.jhu.edu` → `k8slgn.idies.jhu.edu:14132`) | A **new** namespace will need provisioning (unlike `llm-gateway`, already provisioned) — confirm the actual namespace name before writing manifests, per the skill's own Lesson 14 ("always verify the actual provisioned namespace name") |
| Ceph PVC | Mount at an app-chosen path (e.g. `/data/team-uploads`), referenced via `AGDA_MCP_TEAM_STORAGE_DIR` | Reuse the skill's Lesson 16 (`runAsUser` must match the Ceph directory owner UID) and Lesson 12 (PVC creation may be read-only for this account — check `kubectl get pvc` for an existing one before assuming a new one can be created) |
| GHCR | Container registry for the ingest endpoint's own image | Reuse Lesson 17 (link the GHCR package to the repo with Write access before first Actions push) |
| GitHub Releases (via `gh`) | Cache bundle storage (Pattern 5) | Zero new credentials — `gh` is already authed as `cliu238` |
| GitHub Actions self-hosted runner | Registered on the k8s cache-build pod | New infrastructure, not present in the `litellm-k8s-deploy` skill at all — budget real setup time (runner registration token, `actions-runner-controller` vs. a manually-registered persistent runner — an open decision, see below) |
| nginx-ingress | Path-based routing for the ingest HTTPS endpoint | Directly clone `litellm`'s `assets/k8s/ingress.yaml` pattern (`ImplementationSpecific` pathType per Lesson 4, `ssl-redirect: true`) |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| `scripts/team/cron-ingest-wrapup.mjs` ↔ `scripts/dogfood/dogfood-wrapup.mjs` | Direct ESM import of `wrapUpCapture` | Zero modification to the callee; the cron is purely a new caller supplying a different `artifactPath`/`config` per invocation |
| `scripts/team/cron-ingest-wrapup.mjs` ↔ `scripts/oracle/run-oracle.mjs` | Direct ESM import of `runOracle`, now with an added `options.policyKey` | One additive parameter on an existing function signature — backward compatible (undefined `policyKey` preserves today's `resolveDefaultPolicyKey` fallback) |
| `scripts/team/ingest-server.mjs` ↔ `scripts/team/cron-ingest-wrapup.mjs` | Filesystem (archives on `AGDA_MCP_TEAM_STORAGE_DIR`), not a direct call | Decoupled on purpose — the ingest endpoint stays a small, low-risk receiver; all judging logic (and its dependency on a full server checkout + `dist/` build) lives in the cron, which can be redeployed/rerun independently |
| `scripts/cache/*` ↔ `src/agda/agdai-cache.ts` | Read-only reuse of `findAgdaiArtifacts` for verification, never `bustAgdaiCache` (that's a live-session concern) | No modification to `src/` needed — this is exactly why `agdai-cache.ts`'s existing exports are reusable as verification tooling |
| Ingest endpoint's own server checkout ↔ `test/fixtures/fix-queue.json` | Same file, written to directly by the cron | Needs an explicit sync-back-to-git decision (§4's flagged gap) before this is safe to run unattended against the tracked SSOT |

---

## 10. Open Questions / Gaps for Requirements Phase

- **Fix-queue write-back path.** The cron writes to a checked-out `test/fixtures/fix-queue.json` on the ingest server; getting that back into the tracked repo (direct push to `main`, a PR-per-batch, or something else) is unresolved here and should be decided explicitly, not defaulted.
- **Hopf's vendoring style is unverified.** Only CHG's `.agda-lib` was read directly (§0.2). Confirm `autoformalizing-hopf`'s own `include:`/library-registration shape once it's cloned, since it changes whether it falls into the "vendored, oracle-replay-excluded-from-prewarm" bucket or the "genuinely external, prewarm-eligible" bucket.
- **Self-hosted-runner registration mechanism.** Persistent Deployment-style runner vs. ephemeral per-build Job vs. `actions-runner-controller` is a real infra decision with different operational tradeoffs (idle resource cost vs. setup complexity) — flagged in §9, not resolved.
- **k8s namespace name and PVC provisioning** for this project are unknown until the server actually arrives (~07-07) — do not hardcode a namespace/PVC name into any manifest before confirming it, per the skill's own Lesson 14.
- **Exact fixed clone-path convention for TEAM-04.** A specific convention (e.g. `~/.agda-mcp-fuel/<corpus-key>`) is recommended in §7 step 9 but the exact path/mechanism (plain install script vs. devcontainer) is a genuine taste/ergonomics choice for the requirements discussion, not something forced by the code.

---

## Sources

- Direct reads (HIGH confidence): `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/flake-classify.mjs`, `scripts/dogfood/task-manifest.mjs`, `scripts/dogfood/transcript-writer.mjs`, `scripts/dogfood/install-dogfood-skill.mjs`, `scripts/oracle/run-oracle.mjs`, `scripts/oracle/orcl-01-differential.mjs`, `scripts/oracle/orcl-02-soundness-scan.mjs`, `scripts/oracle/cold-agda-session.mjs`, `scripts/oracle/verdict-schema.mjs`, `scripts/queue/intake.mjs`, `scripts/promote-capture.mjs`, `scripts/data/fuel-corpora.json`, `scripts/data/oracle-policy/{agda-unimath,autoformalizing-hopf,codex-homotopy-group}.json`, `test/fixtures/task-manifest-schema.ts`, `test/fixtures/fix-queue.ts`, `test/helpers/mcp-harness.ts`, `src/agda/agdai-cache.ts`, `src/agda/library-registration.ts`, `src/agda/session-capture/manifest-builder.ts`, `src/agda/session-capture/artifact-types.ts`, `src/agda/session-capture/oracle-substrate.ts`, `src/reporting/bug-report.ts`, `src/repo-root.ts`, `package.json`, `.gitignore`, `.github/workflows/ci.yml`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md`, `.planning/PROJECT.md`, `.planning/NEXT-MILESTONE-SEED.md`, `.planning/codebase/ARCHITECTURE.md`.
- Direct reads, external repo (HIGH confidence for what was read; the repo itself is a private local checkout, not part of this project): `~/projects6/Codex-Homotopy-Group/Codex-Homotopy-Group.agda-lib`, `~/projects6/Codex-Homotopy-Group/.gitmodules`.
- Direct reads, sibling skill (HIGH confidence): `/Users/eric/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md`, `assets/k8s/deployment.yaml`, `assets/k8s/pvc.yaml`, `assets/k8s/ingress.yaml`.
- External verification (MEDIUM-HIGH confidence, one live web search): [Agda | nixpkgs](https://ryantm.github.io/nixpkgs/languages-frameworks/agda/) — confirms `agdaPackages.mkDerivation`'s default install phase copies `.agda` sources + `.agdai` interfaces + `.agda-lib` files, validating the recommended bundle anatomy in §6 independently of this project's own code.

---
*Architecture research for: agda-mcp-server v1.1 "Feed the Loop"*
*Researched: 2026-07-03*
