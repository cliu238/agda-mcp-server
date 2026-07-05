---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
plan: 04
subsystem: infra
tags: [ci-cd, github-actions, ghcr, buildkit, kubernetes, ssh, secrets, deploy]

# Dependency graph
requires:
  - phase: 08-02
    provides: Dockerfile (Node 24 + cabal-built Agda 2.8.0 + 4 pinned fuel corpora) and k8s manifests (Deployment/Service/Ingress/CronJob) that this pipeline builds, pushes, and applies
  - phase: 07
    provides: scripts/team/ingest-server.mjs (the service the Deployment actually runs) + scripts/team/issue-key.mjs (the key registry synced to the cluster as agda-mcp-team-keys)
provides:
  - .github/workflows/deploy-ingest.yml — auto-deploy on every push to main (D-06, no path filter): GHCR build+push (linux/amd64, BuildKit fuel_corpora_token secret, no-cache) + D-10 uncredentialed-build verification job + SSH-jump kubectl deploy (manifests shipped base64-tar through the SSH pipe, fail-fast, keepalives, 10m rollout budget)
  - docs/DEPLOY-OPERATIONS.md — maintainer runbook: CI vs human cluster-access paths, agda-mcp-ghcr + agda-mcp-team-keys rotation recipes, pre-deploy pod-quota check
  - "Live cluster state: agda-mcp-ghcr + agda-mcp-team-keys Secrets in llm-gateway; agda-mcp-ingest Deployment 1/1 Running; https://dev.sites.idies.jhu.edu/agda-mcp/healthz returns ok"
  - GitHub Actions repository secrets K8S_SSH_PRIVATE_KEY + FUEL_CORPORA_READ_TOKEN set (human-minted, Task 3 checkpoint)
affects: [08-05, 08-06]

# Tech tracking
tech-stack:
  added: [docker/setup-buildx-action@v4.2.0 (SHA-pinned), docker/login-action@v4.4.0, docker/metadata-action@v6.2.0, docker/build-push-action@v6.19.2]
  patterns:
    - "Manifests ship base64-tar THROUGH the SSH pipe into a mktemp dir under set -euo pipefail — never a mutable remote clone (the attempt-1 false-green fix)"
    - "Every k8s workload on this image overrides command: explicitly — the image CMD is the MCP stdio server and silently CrashLoops in a pod"
    - "Per-app dedicated GHCR pull secret (agda-mcp-ghcr) — a shared litellm-era secret is never overwritten"

key-files:
  created:
    - .github/workflows/deploy-ingest.yml
    - docs/DEPLOY-OPERATIONS.md
  modified:
    - k8s/deployment.yaml
    - k8s/cronjob.yaml

key-decisions:
  - "Dedicated agda-mcp-ghcr pull secret instead of the plan's ghcr-credentials: litellm SHARES that secret name and the two credentials 403 on each other's packages both directions (verified live) — overwriting would have broken litellm"
  - "FUEL_CORPORA_READ_TOKEN is a classic repo-scope PAT, not the plan's fine-grained PAT — cross-owner private repos (emilyriehl's) never appear in the fine-grained token picker, making the plan's spec impossible on GitHub's platform"
  - "GHCR pull credential is a classic PAT with ONLY read:packages — GHCR rejects fine-grained PATs for container pulls, and repo scope does not cover package pulls"
  - "Ingest Deployment overrides command: with npx tsx scripts/team/ingest-server.mjs — the image CMD (node dist/index.js) is the MCP STDIO server, which exits the instant pod stdin closes"

patterns-established:
  - "SSH-pipe manifest shipping: tar -czf k8s/*.yaml | base64 through the 2-hop ssh, decode+apply from mktemp, trap-cleanup, fail-fast"
  - "D-10 asserts target the clone script's OWN observable contract (2/4-corpora-ready summary + no skip lines for public corpora), never git's stdio (swallowed by stdio:'pipe')"

requirements-completed: [DEPLOY-01]

# Metrics
duration: ~3h 06m wall (Tasks 1-2 ~35min autonomous; remainder = Task 3 human-action gate + 4 live deploy attempts across a session handoff)
completed: 2026-07-05
---

# Phase 8 Plan 04: CI/CD Deploy Pipeline + Cluster Secrets + First Live Deploy Summary

**Auto-deploy-on-main CI/CD (GHCR build+push with BuildKit corpus token, D-10 uncredentialed-build proof, SSH-jump kubectl apply) driven through 4 real deploy attempts to a fully green run and a live public healthz — each attempt surfaced a distinct, real deploy defect that is now fixed and documented.**

## Performance

- **Duration:** ~3h 06m wall clock
- **Started:** 2026-07-04T23:23:05Z (Task 1 commit)
- **Completed:** 2026-07-05T02:29:21Z (confirmatory run 28726436348 finished green; service verified live ~02:20Z)
- **Tasks:** 3/3 (2 auto + 1 checkpoint:human-action)
- **Files modified:** 4 repo files (+ 2 GitHub Actions secrets, 2 cluster Secrets — non-repo artifacts)

## Accomplishments

- `.github/workflows/deploy-ingest.yml`: three jobs — `build-and-push` (GHCR, linux/amd64 explicit per D-10, BuildKit `fuel_corpora_token` secret for the 2 private corpora, `no-cache: true` per litellm gotcha #3, every action SHA-pinned), `verify-uncredentialed-build` (proves D-10 public buildability: 2 public corpora clone, 2 private skip with `private-repo-no-credential`), and `deploy` (2-hop SSH direct from the runner, manifests shipped through the pipe, fail-fast remote script, 10m rollout). Triggers unconditionally on every push to main — D-06 cited in a workflow comment so nobody "fixes" it with a path filter.
- `docs/DEPLOY-OPERATIONS.md`: maintainer runbook — the two distinct cluster-access paths (CI 2-hop vs human Tailscale 3-hop), full rotation recipes for both cluster secrets, the plan-checker's pod-quota pre-deploy check (hard limit 5 pods; peak here is 3), and a Verification placeholder that 08-05/08-06 extend.
- Cluster secrets live in `llm-gateway`: `agda-mcp-ghcr` (dedicated GHCR pull secret — see Deviations) and `agda-mcp-team-keys` (placeholder key for cliu238, rotatable via `issue-key.mjs`).
- **First live deploy is green end-to-end**: run 28726436348 (commit ece6ff1) — all 3 jobs success; `curl -sf https://dev.sites.idies.jhu.edu/agda-mcp/healthz` returns `ok`; pod `agda-mcp-ingest` 1/1 Running with `listening on http://0.0.0.0:4000` in its logs (verified live via 3-hop SSH ~02:1xZ; prior CrashLoop pods terminated). CI run 28726436323 on the same commit: success.
- Getting there took 4 attempts, and **every attempt surfaced a real, distinct defect** — the plan's key learning (see attempt history below). This is the project's core value applied to its own infrastructure: use it → surface a defect → fix and lock it.

## First-Deploy Attempt History (4 real defects)

| # | Run | Result | Defect surfaced | Fix |
|---|-----|--------|-----------------|-----|
| 1 | 28723827482 (00:02Z, on 0c114bc) | failure (D-10 job red); build+push green; **deploy job FALSE-GREEN** | Remote git clone predated `k8s/` and had no `set -e` — three dead kubectl calls still exited 0. D-10 asserts couldn't see build output (no `--progress=plain`). | `870ad4d`: manifests shipped base64-tar THROUGH the SSH pipe + `set -euo pipefail` (litellm reference pattern); `--progress=plain` on the D-10 build. |
| 2 | 28724465955 (00:32Z, on 870ad4d) | failure — 3 distinct issues | (a) Pods ImagePullBackOff: the shared litellm-era `ghcr-credentials` secret cannot pull our private GHCR package. (b) Deploy job died to SSH idle-timeout (`client_loop: send disconnect: Broken pipe`) during the silent 5-min rollout wait. (c) D-10 still red: asserts grepped git's "Cloning into" lines, which NEVER reach the log — `clone-fuel-corpora.mjs` runs git with `stdio:"pipe"`. | `cce9e31`: dedicated `agda-mcp-ghcr` cluster secret (human-minted classic `read:packages` PAT; litellm's secret untouched); `ServerAliveInterval=30`/`CountMax=10` on BOTH hops; rollout 5m→10m (image ~1.79 GB compressed); D-10 asserts rewritten to the clone script's own contract. + `0f7e300` (runbook recipe). |
| 3 | 28725583968 (01:23Z, on 5349169) | failure — image pulls in ~20s, D-10 GREEN, but rollout times out | Pods CrashLoopBackOff with COMPLETELY EMPTY logs: the image CMD (`node dist/index.js`) is the MCP STDIO server, which exits cleanly the instant pod stdin closes. Invisible until the first real pod ran — neither the plan nor 08-02 specified `command:`. | `ece6ff1`: Deployment overrides `command:` with `npx tsx scripts/team/ingest-server.mjs` (mirrors k8s/cronjob.yaml's explicit-command pattern); cronjob.yaml also moved to `agda-mcp-ghcr`. Fix validated by direct kubectl apply before pushing: pod 1/1 Running, public healthz ok. |
| 4 | 28726436348 (02:03–02:29Z, on ece6ff1) | **success — ALL 3 jobs green** | — | — (confirmatory run; healthz ok via public ingress) |

## Task Commits

1. **Task 1: deploy-ingest.yml — GHCR build+push then SSH-jump kubectl deploy (D-06)** - `c6e76e8` (feat)
2. **Task 2: Bootstrap cluster secrets + DEPLOY-OPERATIONS.md runbook** - `b2a3328` (docs)
3. **Task 3: GH secrets + first live deploy (checkpoint:human-action)** - human set both secrets (00:01/00:02Z); deploy-attempt fixes: `870ad4d`, `cce9e31`, `0f7e300`, `ece6ff1` (fix/docs)

_Session-continuity commits during the attempt loop (not task work): `8874068`, `42f6f12`, `5349169`, `31c7776` (wip handoffs / STATE.md), created across a mid-plan context-exhaustion handoff._

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `.github/workflows/deploy-ingest.yml` - The D-06 pipeline: build+push, D-10 uncredentialed-build verification, SSH-jump deploy with pipe-shipped manifests.
- `docs/DEPLOY-OPERATIONS.md` - Runbook: access paths, `agda-mcp-ghcr` + `agda-mcp-team-keys` rotation, pod-quota check, Verification placeholder for 08-05/08-06.
- `k8s/deployment.yaml` - `imagePullSecrets: agda-mcp-ghcr`; explicit `command:` override (ingest server, not the image's stdio-MCP CMD), with a comment locking the pattern for every future workload on this image.
- `k8s/cronjob.yaml` - Moved to `agda-mcp-ghcr` pull secret.

## Decisions Made

- **Dedicated `agda-mcp-ghcr` pull secret, litellm's `ghcr-credentials` left untouched.** Verified live: litellm's credential 403s on `ghcr.io/cliu238/agda-mcp-server`, and a cliu238 `read:packages` PAT 403s on `ghcr.io/jh-dsai/litellm` — the two apps need separate credentials and neither secret may overwrite the other.
- **Classic PATs for both human-minted credentials**, because GitHub's platform forecloses the plan's fine-grained spec (details under Deviations).
- **`command:` override is now a locked pattern** for every k8s workload on this image (documented in the deployment.yaml comment).
- **D-10 asserts pinned to the clone script's observable contract**, not incidental git output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Deploy job false-green: remote clone predated k8s/, no fail-fast**
- **Found during:** Task 3, attempt 1 (run 28723827482)
- **Issue:** The plan's deploy shape (clone/pull the repo on the login node, `kubectl apply -f k8s/`) silently no-oped — the remote checkout predated `k8s/`, and with no `set -e` three dead kubectl calls still exited 0. The deploy job showed green while deploying nothing.
- **Fix:** Manifests now ship base64-tar THROUGH the SSH pipe into a mktemp dir; the remote script runs under `set -euo pipefail`. This also changes the plan's literal key-link pattern `kubectl apply -f k8s/` to `kubectl apply -f "$WORK/k8s/"` — same link, fail-fast form.
- **Files modified:** .github/workflows/deploy-ingest.yml
- **Verification:** Attempt 2 applied all 4 resources (deployment/service/ingress/cronjob) on the cluster.
- **Committed in:** `870ad4d`

**2. [Rule 3 - Blocking] Plan's `ghcr-credentials`-from-`gh auth token` superseded by a dedicated `agda-mcp-ghcr` secret**
- **Found during:** Task 3, attempt 2 (pods ImagePullBackOff, GHCR 403)
- **Issue:** Plan Task 2 said to create/refresh `ghcr-credentials` from `gh auth token`. Discovery: litellm SHARES that secret name in `llm-gateway`; its credential cannot pull our package AND our PAT cannot pull litellm's (mutual 403s, verified) — overwriting would break litellm. Also `gh auth token`-derived credentials did not grant the pull; GHCR needs `read:packages`, which `repo` scope does not cover, and GHCR rejects fine-grained PATs for container pulls entirely.
- **Fix:** New dedicated `agda-mcp-ghcr` docker-registry secret created from a human-minted classic PAT with ONLY `read:packages` (auth gate — see below); `k8s/deployment.yaml` + `k8s/cronjob.yaml` point at it; the stale shared secret was left untouched; rotation recipe documented in the runbook. Token file deleted after use.
- **Files modified:** k8s/deployment.yaml, k8s/cronjob.yaml, docs/DEPLOY-OPERATIONS.md
- **Verification:** Attempt 3: image pulled in ~20s.
- **Committed in:** `cce9e31` (secret + manifests), `0f7e300` (runbook), `ece6ff1` (cronjob)

**3. [Rule 1 - Bug] Deploy job killed by SSH idle-timeout during the silent rollout wait**
- **Found during:** Task 3, attempt 2 (`client_loop: send disconnect: Broken pipe`)
- **Issue:** `kubectl rollout status` is silent for minutes; the idle SSH connection was disconnected mid-wait. Separately, the 5m rollout budget was too tight for a cold node pull of the ~1.79 GB compressed image + the 150s startup-probe window.
- **Fix:** `ServerAliveInterval=30 -o ServerAliveCountMax=10` on BOTH SSH hops; rollout timeout 5m→10m.
- **Files modified:** .github/workflows/deploy-ingest.yml
- **Verification:** Attempt 3's keepalive held the full 10-minute wait.
- **Committed in:** `cce9e31`

**4. [Rule 1 - Bug] D-10 uncredentialed-build asserts grepped for output that can never appear**
- **Found during:** Task 3, attempts 1–2 (D-10 job red both times)
- **Issue:** The asserts grepped git's "Cloning into" lines — but `clone-fuel-corpora.mjs` runs every git command with `stdio:"pipe"` (captured, discarded), so those lines never reach the build log. `--progress=plain` (attempt-1 fix) was necessary but not sufficient.
- **Fix:** Asserts rewritten to the clone script's OWN observable contract: the `2/4 corpora ready` summary line, the 2 private-corpus `private-repo-no-credential` skip lines present, and no skip line for either public corpus.
- **Files modified:** .github/workflows/deploy-ingest.yml
- **Verification:** D-10 job GREEN on runs 28725583968 and 28726436348.
- **Committed in:** `870ad4d` (progress=plain), `cce9e31` (contract asserts)

**5. [Rule 2 - Missing Critical] k8s Deployment must override `command:` — image CMD is the MCP stdio server**
- **Found during:** Task 3, attempt 3 (CrashLoopBackOff with completely empty logs)
- **Issue:** Neither the plan nor 08-02's manifests specified `command:` for the ingest Deployment; the image CMD (`node dist/index.js`) is the MCP STDIO server, which exits cleanly the instant pod stdin closes — a log-less CrashLoop invisible until the first real pod ran.
- **Fix:** `command: [npx, tsx, scripts/team/ingest-server.mjs]` on the Deployment (mirrors cronjob.yaml's existing explicit-command pattern), plus a comment making the override mandatory for every future workload on this image.
- **Files modified:** k8s/deployment.yaml
- **Verification:** Direct kubectl apply before pushing: pod 1/1 Running, `listening on http://0.0.0.0:4000`, public healthz ok; then confirmed by run 28726436348.
- **Committed in:** `ece6ff1`

### Plan-Spec Impossibility (documented substitution, human-approved)

**6. FUEL_CORPORA_READ_TOKEN: fine-grained PAT (plan + T-08-15) is IMPOSSIBLE — classic repo-scope PAT used**
- **Found during:** Task 3 secret minting (human, 2026-07-05T00:01Z)
- **Issue:** The plan (and threat-register mitigation T-08-15) specified a fine-grained PAT scoped to exactly the 2 `emilyriehl` private repos. Cross-owner private repositories never appear in GitHub's fine-grained token repository picker — the spec cannot be satisfied by any account that isn't the resource owner/org.
- **Resolution:** Classic PAT with `repo` scope, minted by the user. Broader than intended — see Threat Flags for the residual-risk disposition.

---

**Total deviations:** 5 auto-fixed (3 × Rule 1 bug, 1 × Rule 3 blocking, 1 × Rule 2 missing-critical) + 1 documented plan-spec impossibility.
**Impact on plan:** All fixes were necessary for a real (non-false-green) deploy; no scope creep. The deploy pipeline is strictly stronger than planned: fail-fast remote script, keepalives, contract-based D-10 asserts, and a pull-secret isolation boundary the plan didn't know it needed.

## Authentication Gates

- **Task 3 (planned checkpoint:human-action):** user set `K8S_SSH_PRIVATE_KEY` (base64 single-line, fetched from the JHU Mac via Tailscale, 00:02:41Z) and `FUEL_CORPORA_READ_TOKEN` (classic repo-scope PAT, 00:01:25Z) as GitHub Actions repository secrets. Verified via `gh secret list`.
- **Mid-execution gate (attempt 2):** the GHCR pull fix required a human-minted classic PAT with `read:packages` (no CLI path exists to mint PATs). User saved it to `~/.agda-mcp-ghcr-token` (chmod 600); it was piped into the cluster secret via the one-shot SSH pattern without ever being echoed, then the local file was deleted.

## Threat Flags

| Flag | File/Surface | Description |
|------|--------------|-------------|
| threat_flag: credential-scope-wider-than-planned | GitHub secret `FUEL_CORPORA_READ_TOKEN` | T-08-15's fine-grained mitigation is platform-impossible for cross-owner private repos; actual credential is a classic `repo`-scope PAT. Residual risk bounded by: stored only as an encrypted GH Actions secret, consumed only as a BuildKit secret (never an image layer), revocable/rotatable at any time; scope minimization should be revisited if the corpora ever move to an org that supports fine-grained grants. |
| threat_flag: new-long-lived-credential | k8s Secret `agda-mcp-ghcr` (llm-gateway) | New credential class not in the plan's threat model: a long-lived classic `read:packages` PAT living as a cluster docker-registry Secret. Minimal scope (read:packages only), rotation recipe in docs/DEPLOY-OPERATIONS.md. |

## Known Stubs

- `docs/DEPLOY-OPERATIONS.md` "Verification" section is an explicit placeholder — **intentional and plan-specified** ("extended by Plans 08-05 and 08-06 with the deploy-verification and cron-judge-verification command recipes once those plans land").

## Verification (re-run at close-out, 2026-07-05)

- `gh secret list --repo cliu238/agda-mcp-server` → `FUEL_CORPORA_READ_TOKEN` (2026-07-05T00:01:25Z), `K8S_SSH_PRIVATE_KEY` (2026-07-05T00:02:41Z). PASS
- `gh run list --workflow deploy-ingest.yml --limit 1` → 28726436348, conclusion `success`; per-job: build-and-push ✓, verify-uncredentialed-build (D-10) ✓, deploy ✓. PASS
- `curl -sf https://dev.sites.idies.jhu.edu/agda-mcp/healthz` → `ok` (exit 0). PASS
- Task 1 automated verify (no paths-filter, platforms, both secret names) → `ok`. PASS
- Task 2 automated verify (runbook exists, documents both secrets) → `ok`. PASS
- Plan traceability: `grep -c 'D-[0-9][0-9]'` on the plan → 11 (≥ 2 required). PASS
- Live pod state (verified via 3-hop SSH ~02:1xZ, cited — not re-run at close-out): `agda-mcp-ingest` 1/1 Running, logs `listening on http://0.0.0.0:4000`, prior CrashLoop pods terminated.

## Issues Encountered

- **Four deploy attempts were needed to reach green** — each surfaced a distinct real defect (false-green deploy job, shared-secret pull 403 + SSH idle-timeout + wrong D-10 asserts, stdio-CMD CrashLoop); all fixed and documented above. Exactly the defect-capture loop this project exists to run, applied to its own infrastructure.
- **Mid-plan context-exhaustion handoff:** the original executor died at the Task 3 checkpoint; per checkpoint protocol this close-out was performed by a fresh continuation executor against the recorded evidence.
- **Ops gotcha for future LOCAL applies:** macOS bsdtar smuggles `._*` AppleDouble entries through the manifest pipe (kubectl parse errors after the real files apply) — use `COPYFILE_DISABLE=1` when running the pipe pattern from a Mac. GitHub runners (GNU tar) are unaffected.

## User Setup Required

None remaining — the plan's `user_setup` (both GitHub Actions secrets) was completed and verified during Task 3 (`gh secret list` confirms both, timestamps 2026-07-05T00:01/00:02Z). No separate USER-SETUP.md generated: nothing is left incomplete.

## Next Phase Readiness

- The ingest endpoint is LIVE at `https://dev.sites.idies.jhu.edu/agda-mcp` — 08-05 (functional acceptance: real upload through the cluster, manual cron-judge trigger, write-back-disabled proof) is unblocked.
- DEPLOY-01 stays Pending in REQUIREMENTS.md by design: its truth-set includes cluster functional acceptance (08-05) and POLICY-01 cluster re-verify + local-mode regression (08-06). Same convention as TEAM-05 after 08-03.
- The cron judge (`agda-mcp-cron-judge`, daily 06:00 UTC) has never fired yet — 08-05 triggers it manually.
- Operational reality for everything downstream: **every push to main triggers a ~26-minute deploy cycle** (D-06) — batch pushes deliberately.

---
*Phase: 08-pinned-environment-distribution-thin-k8s-deployment*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: .github/workflows/deploy-ingest.yml
- FOUND: docs/DEPLOY-OPERATIONS.md
- FOUND: k8s/deployment.yaml (command override + agda-mcp-ghcr), k8s/cronjob.yaml (agda-mcp-ghcr)
- FOUND commit: c6e76e8 (Task 1), b2a3328 (Task 2)
- FOUND commits: 870ad4d, cce9e31, 0f7e300, ece6ff1 (Task 3 attempt-loop fixes)
- VERIFIED: run 28726436348 success (3/3 jobs green); CI run 28726436323 success; healthz `ok`; both GH secrets listed
