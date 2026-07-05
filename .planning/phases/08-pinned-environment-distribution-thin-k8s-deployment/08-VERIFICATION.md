---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
verified: 2026-07-05T04:32:42Z
status: passed
score: 22/22 must-haves verified
overrides_applied: 0
re_verification: false
warnings:
  - id: W-TAG-LAG
    summary: "v1.1 (the tag TEAM-05's documented checkout resolves to) predates the 10 review-fix commits (634a15c..efbdaa8), including the CR-01 installer false-green fix. A teammate onboarding today gets the pre-fix installer and pre-fix onboarding doc. Recommendation: cut+push v1.1.1 after the batch push."
  - id: W-UNBUILT-DOCKERFILE
    summary: "WR-05/WR-06/WR-07 Dockerfile changes have never been executed by any Docker build (no local daemon; commits unpushed). First exercise is the next push-to-main's D-06 deploy run — watch it."
  - id: W-GIT-STATE
    summary: "Local main (efbdaa8) is 13 commits ahead of origin/main (6c0d716) by design — review fixes + docs batched for a final push after verification. Deliberate; recorded here so the state is auditable."
---

# Phase 8: Pinned-Environment Distribution + Thin k8s Deployment — Verification Report

**Phase Goal:** A teammate can go from zero to a working, version-pinned install with no npm account anywhere in the flow, and the ingest endpoint + cron judge run for real on the arrived JHU IDIES-style k8s server — a thin packaging step around already-locally-proven scripts, not new application logic.
**Verified:** 2026-07-05T04:32:42Z
**Status:** passed (with 3 recorded warnings — see Warnings & Known Deliberate State)
**Re-verification:** No — initial verification
**Requirements:** TEAM-05, DEPLOY-01 — both SATISFIED; the "Complete" marks in REQUIREMENTS.md are accurate.

## Evidence Basis

Two evidence classes, kept distinct throughout:

- **Re-verified by this verifier (2026-07-05T04:2x-04:3xZ):** live healthz curl; `gh run view` on both deploy runs; `git ls-remote --tags origin`; `git cat-file -e v1.1:<path>` for all 11 phase artifacts; vitest runs (32/32 phase tests, 96/96 regression suite, 127 unique with fixer additions); plain-node import of both installer modules from outside the repo; all file-level artifact/wiring/anti-pattern checks.
- **Established this session (cluster access off-limits to verifier; cited, not re-run):** PVC landing of the real upload at `eric/2026-07-05/08-05-accept-20260705T031840Z.tar.gz` with 2231-owned dirs (08-05); manual cron-judge Jobs Completed with honest zero-candidate digest + durable `.processed.json` (08-05); D-09 write-back-disabled in-pod proof (no `/app/.git`, queue-path-outside-repo guard, `--no-push`, sha256 identity of baked fix-queue.json) (08-05); POLICY-01 6/6 green inside the live pod (08-06).

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Teammate zero → uploading via documented install script pinning exact server version (git tag) + exact Agda (`tooling/scripts/run-pinned-agda.sh`), no npm account anywhere; corpus onboarding one documented step, overnight first build via corpus's own tooling (TEAM-05) | ✓ VERIFIED | `docs/TEAM-ONBOARDING.md` documents clone → `git checkout "$(git tag --list 'v*' \| sort -V \| tail -1)"` → `bash scripts/team/install-pinned-env.sh` (lines 56-71); installer exact-matches Agda 2.8.0 (`versionSatisfies`, install-pinned-env.mjs:90-92) and writes the wrapper `src/agda/binary-discovery.ts:16` resolves first; no `npm login`/registry step anywhere; corpus clone = installer step, overnight build = doc Step 3 (no cache system); v1.1 tag pushed (`git ls-remote`: `refs/tags/v1.1` → 6c0d716) containing all 11 artifacts (verified per-path with `git cat-file -e`); walkthrough test proves the chain to a real loopback upload (re-run green) |
| SC2 | Ingest endpoint + cron judge run on the k8s server: GHCR `linux/amd64` image = Node + pinned Agda + pinned corpus source clones only (no caches), nginx-ingress path app with proxy-body-size matching the TEAM-03 cap, PVC storage root, Ceph-UID-correct securityContext (DEPLOY-01) | ✓ VERIFIED | Live healthz `ok` (re-run by verifier, exit 0); deploy runs 28726436348 (ece6ff1) and 28728480947 (6c0d716 = the v1.1 commit) both `success` with all 3 jobs green (re-checked via `gh run view`); real upload through public ingress landed on Ceph PVC (established, 08-05); manual cron-judge Jobs Completed on-cluster (established, 08-05); `platforms: linux/amd64` (deploy-ingest.yml:55); Dockerfile = Node 24 + cabal Agda 2.8.0 + `clone-fuel-corpora.mjs` source clones, zero corpus-build steps; `proxy-body-size: "512m"` (ingress.yaml:12) == `AGDA_MCP_TEAM_INGEST_MAX_BYTES=536870912` (deployment.yaml:103) == ingest-server default (ingest-server.mjs:80); PVC `sciserver-datavolumes-01-rw`; `runAsUser/fsGroup: 2231` in both workloads + `pvc-dirs` initContainer |
| SC3 | Local mode remains a working fallback; POLICY-01 case-sensitivity fix re-verified on the cluster (DEPLOY-01) | ✓ VERIFIED | Local-mode regression re-run BY VERIFIER on Node 24: 6 files, **96/96** (exactly reproducing 08-06's claim; union with fixer-extended installer tests = 127 unique tests, matching the fixer's 127/127); local-fallback recipe documented in TEAM-ONBOARDING Step 4; POLICY-01 `kubectl exec` vitest run on live pod: **6 passed \| 29 skipped, exit 0** incl. the real CHG case-mismatch shape throwing `PolicyResolutionError` (established, 08-06 + DEPLOY-OPERATIONS.md:461-484) |

### Observable Truths — Plan Must-Haves

| # | Truth (plan) | Status | Evidence |
|---|--------------|--------|----------|
| 1 | One script clones all 4 fuel corpora at pinnedRef under visible env-overridable root (D-04/D-05) | ✓ VERIFIED | `resolveFuelRoot()` (env `AGDA_MCP_FUEL_ROOT`, default `~/agda-mcp-fuel`); `fuel-corpora.json` 4 entries with SHA pins; unit tests green; D-10 CI job proves the 2 public corpora clone for real in a Docker build; credentialed 4/4 proven by green image builds |
| 2 | Installer verifies Agda 2.8.0 exact, never force-installs (D-03) | ✓ VERIFIED | install-pinned-env.mjs:176-190 prints nix/ghcup instructions + `exitCode=1`; no install path exists; missing-Agda early-exit unit-tested |
| 3 | Credential-less private corpus → loud stderr skip, batch continues (never crashes others) | ✓ VERIFIED | `cloneAllFuelCorpora` stderr line per skip (clone-fuel-corpora.mjs:230); never-throws contract; D-10 job asserts both `private-repo-no-credential` lines + `2/4 corpora ready` in REAL build logs (green on both re-checked runs) |
| 4 | Image = Node + version-verified Agda 2.8.0 + 4 pinned source clones, no `_build` caches (D-10) | ✓ VERIFIED | Dockerfile stages; post-fix build-time `RUN agda --version \| grep -qF "Agda version 2.8.0"` (WR-05, line 62); no corpus-build steps anywhere; green GHCR builds on both runs (pre-fix Dockerfile — see W-UNBUILT-DOCKERFILE) |
| 5 | Non-root UID/GID 2231 everywhere | ✓ VERIFIED | Dockerfile `USER agdamcp` (2231); both manifests `runAsUser: 2231`/`fsGroup: 2231`; PVC tree 2231-owned live (established, 08-05) |
| 6 | Ingest + cron fit ~3 CPU / 7Gi headroom with documented margin | ✓ VERIFIED | Limits 512Mi/500m + 6Gi/2000m = 6.5Gi/2.5CPU; margin documented (08-02 SUMMARY, runbook quota section); pods ran live without quota rejections |
| 7 | Cron judge needs no repo-write git credential (D-09): outside-repo `--queue-path` + `--no-push` | ✓ VERIFIED | cronjob.yaml:79-85 args; `writeBackQueue` short-circuits `queue-path-outside-repo` (cron-ingest-wrapup.mjs:506); proven in-pod: no `/app/.git` + sha256 identity of baked fix-queue.json (established, 08-05) |
| 8 | Documented onboarding: WSL2 (D-02), no-npm-account (D-01), overnight first build | ✓ VERIFIED | TEAM-ONBOARDING.md sections 1 (Windows/WSL2), 2 (D-01 git install), 4 (overnight build, no cache system) |
| 9 | Automated fresh-teammate walkthrough → real local upload, zero real Agda dependency | ✓ VERIFIED | team-onboarding-walkthrough.test.ts: real `createIngestServer` + real `issueKey` + real `runUploadForRun` over loopback, asserts `{attempted:true, uploaded:true}` + archive on disk; re-run green by verifier |
| 10 | Local mode proven end-to-end before any cluster | ✓ VERIFIED | 08-03 completed 2026-07-04 pre-deploy; same test re-run green now |
| 11 | Push to main triggers deploy unconditionally (D-06, no path filter) | ✓ VERIFIED | deploy-ingest.yml `on.push.branches: [main]`, no `paths:`; D-06 lock comment (lines 3-10); two real push-triggered runs re-checked green |
| 12 | GHCR pull creds + team-keys reach cluster only as k8s Secrets, never baked/committed | ✓ VERIFIED | `imagePullSecrets: agda-mcp-ghcr`; team-keys Secret volume mode 0400; secret template = 32 lines, 0 non-comment (cannot be applied); BuildKit `--mount=type=secret` for corpus token; `.dockerignore` excludes `scripts/team/data` (WR-04) |
| 13 | First real deploy green; healthz 200 | ✓ VERIFIED | Run 28726436348: 3/3 jobs success (re-checked); healthz `ok` re-run by verifier |
| 14 | Real off-cluster upload via real Bearer key lands on Ceph PVC at person/date/runId | ✓ VERIFIED (established) | `/data/team-uploads/eric/2026-07-05/08-05-accept-20260705T031840Z.tar.gz`, all levels 2231-owned (08-05 evidence + runbook literal outputs) |
| 15 | Manual cron-judge processes archive with honest outcome, no crash/hang | ✓ VERIFIED (established) | Job Completed in seconds; digest `processed 1 archive(s), 0 capture(s) — 0 filed, 0 abstained (0.0%)...`; `.processed.json` durable across pod death; second Job confirms no re-judging (08-05) |
| 16 | Zero git write-back from pod after cron run (D-09 in practice) | ✓ VERIFIED (established) | Stronger than planned: `/app` has no `.git` at all; + structural guard + `--no-push` + sha256 byte-identity (08-05) |
| 17 | POLICY-01 case-exact loud-fail passes on cluster Linux/CephFS | ✓ VERIFIED (established) | `kubectl exec ... vitest run oracle-orcl-02.test.ts -t "policy resolution is case-exact and loud"` → 6 passed, exit 0 on live pod (08-06); image-layer-vs-PVC distinction documented |
| 18 | Local mode passes full coverage at PHASE END | ✓ VERIFIED | Re-run by verifier: 6 files 96/96 green on Node 24.16.0 (post-fixer working tree — i.e., the fixes did not regress the shipped local path) |
| 19 | Real pushed tag whose tree contains TEAM-01..05 + DEPLOY-01 artifacts (D-11) | ✓ VERIFIED | `git ls-remote`: `refs/tags/v1.1` → 6c0d716 on origin; `git cat-file -e v1.1:<path>` passes for all 11 phase artifacts; `git tag --list 'v*' \| sort -V \| tail -1` → v1.1 |

Plan-traceability truths (D-NN citation counts): 08-01: 11≥4, 08-02: 10≥5, 08-03: 7≥2, 08-04: 11≥2, 08-05: 7≥2, 08-06: 5≥1 — all pass.

**Score:** 22/22 truths verified (3 roadmap SCs + 19 plan truths).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/team/clone-fuel-corpora.mjs` | Clone primitive, plain-node, exports incl. `cloneAllFuelCorpora` | ✓ VERIFIED | 263 lines; all declared exports present + `resolveCloneUrl` (WR-10); plain-node import verified from /tmp; WR-01/02/03 fixes in place (re-scrub on exists branch, token scrub in errors, `GIT_TERMINAL_PROMPT=0`, credentialed URL-fetch) |
| `scripts/team/install-pinned-env.mjs` | Agda verify + wrapper gen + npm ci + clone orchestration | ✓ VERIFIED | 237 lines; CR-01 fix: consumes clone results, `N/M fuel corpora ready` after npm ci, per-corpus NOT-ready lines, `exitCode=1` on partial, no "done." on partial; WR-09 single-quote escaping; both CR-01 paths unit-tested |
| `scripts/team/install-pinned-env.sh` | Node>=24 + git gate before .mjs handoff | ✓ VERIFIED | 33 lines, `set -euo pipefail`, resolves .mjs via own dir; handoff + version-gate covered by real bash subprocess tests |
| `Dockerfile` | 2-stage digest-pinned, Agda 2.8.0, UID 2231, corpora via BuildKit secret | ✓ VERIFIED | Digest-pinned both stages; WR-05 smoke test; WR-06 Hackage index pin; WR-07 same-layer ownership; built green in CI (pre-fix version — see W-UNBUILT-DOCKERFILE) |
| `.dockerignore` | Excludes dev/build/secret trees | ✓ VERIFIED | WR-04 additions: `scripts/team/data`, `.env*`, `local-only`, `.local-reference`, `tmp`, `temp` |
| `k8s/deployment.yaml` | Ingest Deployment + Service, llm-gateway, PVC subPath, keys Secret, 2231 | ✓ VERIFIED | Incl. `command:` override (CrashLoop postmortem), `agda-mcp-ghcr` pull secret, `pvc-dirs` initContainer (bc2f873), 3 probes on /healthz; applied live, pod 1/1 Running (established) |
| `k8s/ingress.yaml` | Path app on dev.sites.idies.jhu.edu/agda-mcp, 512m body | ✓ VERIFIED | Regex path + `ImplementationSpecific` + rewrite; serves live healthz (re-run) |
| `k8s/cronjob.yaml` | Daily judge, same image+PVC, D-09 flags | ✓ VERIFIED | 06:00 UTC, `concurrencyPolicy: Forbid`, `activeDeadlineSeconds: 21600`, `GHCRTS=-M5g`, both D-09 layers; manual Jobs ran live (established) |
| `k8s/team-keys-secret.yaml.template` | Comment-only sync doc | ✓ VERIFIED | 32 lines, 0 non-comment — un-applyable by construction |
| `.github/workflows/deploy-ingest.yml` | D-06 build+push, D-10 verify, SSH deploy | ✓ VERIFIED | SHA-pinned actions; BuildKit secret; contract-based D-10 asserts; pipe-shipped manifests + fail-fast; WR-08 accept-new + no inner `-A`; 2 green runs re-checked |
| `docs/TEAM-ONBOARDING.md` | Zero-to-uploading walkthrough | ✓ VERIFIED | 200 lines, 7 sections; CR-01 doc half: private-credential prerequisite + both exit-1 modes documented; `<org>` placeholder remains (IN-02, info) |
| `docs/DEPLOY-OPERATIONS.md` | Runbook: access, rotation, verification, phase-end evidence | ✓ VERIFIED | 534 lines; WR-11 recipes (no /tmp staging, no PAT argv); complete upload/cron/POLICY-01/tag evidence with literal outputs |
| `scripts/data/fuel-corpora.json` | SSOT: 4 corpora, SHA pins, policyKeys | ✓ VERIFIED | 2 public + 2 private, full-SHA `pinnedRef`, `policyKey` per entry |
| `test/integration/team/team-onboarding-walkthrough.test.ts` | Fresh-teammate acceptance | ✓ VERIFIED | Real server/key/upload over loopback; re-run green |
| `test/unit/tools/team-{clone-fuel-corpora,install-pinned-env}.test.ts` | Unit coverage incl. fixer additions | ✓ VERIFIED | 31 tests total incl. CR-01 both-paths, WR-09 ×2, WR-10 production-URL form; re-run green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| install-pinned-env.sh | install-pinned-env.mjs | `exec node "$SCRIPT_DIR/install-pinned-env.mjs" "$@"` | ✓ WIRED | .sh:33; real-subprocess handoff test |
| install-pinned-env.mjs | clone-fuel-corpora.mjs | `import { cloneAllFuelCorpora, resolveFuelRoot }` | ✓ WIRED | .mjs:26; results consumed (CR-01) |
| clone-fuel-corpora.mjs | scripts/data/fuel-corpora.json | `readFileSync` via `import.meta.url` | ✓ WIRED | .mjs:47; no tsx/zod dependency |
| installer wrapper | src/agda/binary-discovery.ts | writes `tooling/scripts/run-pinned-agda.sh` | ✓ WIRED | binary-discovery.ts:16 resolves that exact path first |
| k8s/deployment.yaml | scripts/team/ingest-server.mjs | `command:` override + 5 env vars | ✓ WIRED | All 5 env names read by scripts (ingest-server.mjs:66,80,85,94; issue-key.mjs:60); cap 536870912 == ingress 512m |
| k8s/cronjob.yaml | scripts/team/cron-ingest-wrapup.mjs | `--queue-path /data/cluster-queue/fix-queue.json --no-push` | ✓ WIRED | Flags parsed (:604,:617); outside-repo guard (:506) |
| Dockerfile | clone-fuel-corpora.mjs | `RUN --mount=type=secret,id=fuel_corpora_token ... --root "$AGDA_MCP_FUEL_ROOT"` | ✓ WIRED | Dockerfile:115-116; exercised by every green CI build |
| deploy-ingest.yml | Dockerfile | `file: ./Dockerfile, platforms: linux/amd64, secrets: fuel_corpora_token` | ✓ WIRED | :50-60; green builds |
| deploy-ingest.yml | k8s manifests | `kubectl apply -f "$WORK/k8s/"` (pipe-shipped, fail-fast) | ✓ WIRED | :205; documented deviation from planned `kubectl apply -f k8s/` — same link, fail-fast form (attempt-1 false-green fix) |
| walkthrough test | install-pinned-env.mjs / upload-run.mjs | named-export imports + real assertions | ✓ WIRED | :43-53, asserts `{attempted:true, uploaded:true}`; documented deviation: drives individual exports per plan `<behavior>` spec instead of frontmatter's illustrative `scriptMain` import — traceability pattern satisfied |
| TEAM-ONBOARDING.md | install-pinned-env.sh | documented invocation | ✓ WIRED | :71 |
| DEPLOY-OPERATIONS.md | cronjob / oracle-orcl-02.test.ts | `create job --from=cronjob` recipe; kubectl-exec vitest recipe | ✓ WIRED | :325, :461; test block exists (oracle-orcl-02.test.ts:391) |

### Data-Flow Trace (Level 4)

Infra phase — data flow proven by execution rather than static trace:

| Flow | Evidence | Status |
|------|----------|--------|
| Teammate upload → ingress → ingest pod → Ceph PVC | Real archive at documented person/date/runId path, 2231-owned (established) | ✓ FLOWING |
| PVC archive → cron judge → digest + durable marker | Honest zero-candidate digest; `.processed.json` read back after pod death (established) | ✓ FLOWING |
| Loopback: installer chain → real local server → archive on disk | Walkthrough test re-run green by verifier | ✓ FLOWING |
| GH push → GHCR image → cluster rollout | Two green push-triggered runs re-checked via gh | ✓ FLOWING |

### Behavioral Spot-Checks (run by verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live healthz | `curl -sf https://dev.sites.idies.jhu.edu/agda-mcp/healthz` | `ok`, exit 0 | ✓ PASS |
| Deploy run (first green) | `gh run view 28726436348` | success; 3/3 jobs success (ece6ff1) | ✓ PASS |
| Deploy run (v1.1 commit) | `gh run view 28728480947` | success; 3/3 jobs success (6c0d716) | ✓ PASS |
| Phase-8 test files | `npx vitest run` (3 files, Node 24) | 32/32 passed | ✓ PASS |
| 08-06 regression suite | `npx vitest run` (6 files, Node 24) | 96/96 passed — reproduces 08-06's claim; 127 unique with installer tests = fixer's claim | ✓ PASS |
| Plain-node bootstrap contract | `node -e "import(...)"` from /tmp | both modules load; all key exports `function` | ✓ PASS |
| v1.1 tag reachability + contents | `git ls-remote --tags origin`; `git cat-file -e v1.1:<path>` ×11 | tag on origin → 6c0d716; all 11 artifacts present | ✓ PASS |

### Probe Execution

SKIPPED — no `scripts/*/tests/probe-*.sh` convention in this project and no probes declared in any Phase 8 PLAN/SUMMARY. The vitest suites above are the runnable checks; all executed in-process by the verifier.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEAM-05 | 08-01, 08-03, 08-06 | Zero → uploading via git install: script pins git tag + exact Agda, documented, no npm account | ✓ SATISFIED | SC1 row above; REQUIREMENTS.md `[x]` + "Complete" accurate |
| DEPLOY-01 | 08-02, 08-04, 08-05, 08-06 | Ingest + cron judge on k8s per litellm pattern; local fallback; POLICY-01 on cluster | ✓ SATISFIED | SC2/SC3 rows above; REQUIREMENTS.md `[x]` + "Complete" accurate |

No orphaned requirements: REQUIREMENTS.md maps exactly TEAM-05 and DEPLOY-01 to Phase 8; both are claimed by plans.

### Review-Fix Verification (08-REVIEW.md CR-01 + WR-01..11, commits 634a15c..efbdaa8)

All 11 in-scope findings verified resolved in the working tree, not just claimed:

| Finding | Fix verified at | Test coverage |
|---------|-----------------|---------------|
| CR-01 installer false-green | install-pinned-env.mjs:199-226 (summary after npm ci, per-corpus lines, exit 1, no "done." on partial); TEAM-ONBOARDING.md:23-36,102-122 (credential prerequisite + both exit-1 modes) | 2 dedicated scriptMain tests (all-ok + partial) |
| WR-01 re-run token persistence | clone-fuel-corpora.mjs:145-155 (exists-branch re-scrub) | exists-branch tests green |
| WR-02 token in argv/error strings | :139-142 hoisted token; :200-209 error-message scrub | token-hygiene tests |
| WR-03 private-fetch credential/hang | :131-135 `GIT_TERMINAL_PROMPT=0`; :162-166 credentialed URL-fetch | fetch-branch tests |
| WR-04 dockerignore secrets | .dockerignore:15-26 | n/a (config) |
| WR-05 no agda smoke test | Dockerfile:62 | build-time (next CI build — W-UNBUILT-DOCKERFILE) |
| WR-06 unpinned Hackage index | Dockerfile:33 `cabal update 'hackage.haskell.org,2026-07-04T00:00:00Z'` | build-time (next CI build) |
| WR-07 duplicate chown layer | Dockerfile:78-116 same-layer ownership; no standalone `RUN chown -R` | build-time (next CI build) |
| WR-08 SSH host keys / inner -A | deploy-ingest.yml:183-199 `accept-new` both hops, inner `-A` dropped | next deploy run |
| WR-09 unescaped wrapper path | install-pinned-env.mjs:106-112 single-quote splice | 2 dedicated WR-09 tests |
| WR-10 vacuous scrub test | `resolveCloneUrl` exported; test pins production `x-access-token` URL form | test:205-215 |
| WR-11 /tmp staging + PAT argv | DEPLOY-OPERATIONS.md: pipe-to-stdin team-keys sync (:137), local dry-run DCJ pattern for GHCR (no `--docker-password` in remote argv) | n/a (docs) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX/TODO/HACK in phase files | none found | Debt-marker gate: PASS |
| docs/TEAM-ONBOARDING.md | 57 | `<org>` placeholder in the first copy-paste clone command | ℹ️ Info (IN-02, unfixed) | Fresh teammate's first command fails as written; trivially self-resolvable |
| docs/DEPLOY-OPERATIONS.md | ~517 | Tag-resolution command quoted differently from onboarding doc (`--sort=-v:refname` vs `--list 'v*' \| sort -V`) | ℹ️ Info (IN-01, unfixed) | Both resolve v1.1 today |
| scripts/team/install-pinned-env.mjs | 163 | `scriptMain(argv)` still ignores argv (`--root` silently dropped) | ℹ️ Info (IN-03, unfixed) | Env var `AGDA_MCP_FUEL_ROOT` is the supported path |
| .github/workflows/deploy-ingest.yml | 182, — | Hardcoded 3-file tar list; no concurrency group; `:latest` rollout semantics | ℹ️ Info (IN-04, recorded; partly D-06-locked) | Drift/race risk on future changes |
| Dockerfile | 122 | Image CMD is the stdio MCP server; footgun documented only in manifests | ℹ️ Info (IN-05, unfixed) | Every current workload overrides `command:`; pattern locked in deployment.yaml comment |

Info-level findings were explicitly out of the fixer's scope (CR-01 + WR-01..11); none blocks the phase goal.

### Warnings & Known Deliberate State

**W-TAG-LAG (the git-state caveat, assessed as instructed):** Local main (efbdaa8) is 13 commits ahead of origin/main (6c0d716): `d157134` + `a195f81` + `f9ad715` (docs) + the 10 review-fix commits. This is deliberate batching for a final push after verification. Implications for TEAM-05's installer-pins-tag contract:

- The v1.1 tag (what `git tag --list 'v*' | sort -V | tail -1` resolves to for a teammate today) does NOT contain the CR-01 fix or the onboarding doc's private-credential prerequisite. A teammate onboarding from v1.1 without GitHub credentials gets the pre-fix behavior: both private corpora skip with loud stderr lines (the plan's literal truth #3 holds even pre-fix), but those lines drown under `npm ci` output and the installer ends `"done."` with exit 0 — the false-green REVIEW judged Critical.
- Pushing main does NOT change this: the documented checkout pins the tag, not main. The fixes reach teammates only when a follow-up tag (e.g. v1.1.1) is cut and pushed.
- Verdict: no phase must-have fails on the tagged tree (every truth above was written pre-review and holds there; CR-01 is post-goal hardening), so this is a WARNING, not a gap. **Recommendation for the orchestrator/milestone close: after the batch push, cut and push v1.1.1 so the documented latest-tag checkout distributes the CR-01-fixed installer.** Never re-point the pushed v1.1.

**W-UNBUILT-DOCKERFILE:** The WR-05/WR-06/WR-07 Dockerfile changes and the WR-08 workflow changes have never been executed by any Docker build or deploy run (no local Docker daemon; commits unpushed). Both green deploy runs built the pre-fix Dockerfile. Syntax reviewed (cabal index-state pinning is a documented cabal form; the smoke test is trivial), and D-06's auto-deploy will exercise them loudly on the next push to main — watch that run's build-and-push, D-10, and deploy jobs.

**W-GIT-STATE:** Recorded above; auditable via `git rev-list --count origin/main..main` = 13 at verification time.

### Human Verification Required

None required to confirm the phase goal — every success criterion is confirmed by code-level verification plus live evidence (re-verified where cheap, cited as established where cluster access was required). The two follow-up watch items (first post-push deploy of the fixed Dockerfile; v1.1.1 patch-tag decision) are operational recommendations recorded under Warnings, not verification gaps.

### Gaps Summary

No gaps. The phase goal is achieved and live-proven: the TEAM-05 zero-to-uploading path exists end-to-end (documented, tag-pinned, walkthrough-tested to a real upload, plain-node bootstrap verified), and DEPLOY-01's ingest + cron judge run for real on the cluster (green auto-deploys re-checked, live healthz re-run, real upload on the Ceph PVC, real cron Jobs with D-09 proven in-pod, POLICY-01 6/6 on the pod, local mode 96/96 re-run at verification time). The review chain's CR-01 + WR-01..11 fixes are all present in code with test coverage where testable (127 unique tests green). Three warnings recorded — most importantly the deliberate tag-lag: the pushed v1.1 tag predates the review fixes, so a v1.1.1 patch tag after the batch push is the recommended closure.

---

_Verified: 2026-07-05T04:32:42Z_
_Verifier: Claude (gsd-verifier)_
