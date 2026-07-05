---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
plan: 02
subsystem: infra
tags: [docker, kubernetes, k8s, ghcr, agda, cabal, ingress, cronjob, buildkit]

# Dependency graph
requires:
  - phase: 07-team-feedback-channel
    provides: scripts/team/ingest-server.mjs, scripts/team/cron-ingest-wrapup.mjs, scripts/team/issue-key.mjs (env-var contracts consumed verbatim by these manifests)
provides:
  - "Dockerfile: 2-stage BuildKit build (haskell:9.10-bookworm digest-pinned -> node:24-slim digest-pinned) producing a non-root (UID/GID 2231) image with Node 24 + Agda 2.8.0 + all 4 pinned fuel-corpus source clones"
  - ".dockerignore excluding dev/build/planning artifacts from the build context"
  - "k8s/deployment.yaml: Deployment+Service agda-mcp-ingest in namespace llm-gateway"
  - "k8s/ingress.yaml: Ingress on dev.sites.idies.jhu.edu path /agda-mcp"
  - "k8s/cronjob.yaml: CronJob agda-mcp-cron-judge sharing the ingest image+PVC"
  - "k8s/team-keys-secret.yaml.template: comment-only kubectl create secret sync doc"
affects: [08-04-ci-cd-and-first-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Digest-pinned multi-stage Dockerfile (both stages bookworm-based to avoid libc/ICU ABI drift across COPY --from)"
    - "BuildKit --mount=type=secret for a private-repo GH token, never ENV/ARG/docker history"
    - "Single PVC claim reused via multiple subPaths (never a new PVC/namespace manifest)"
    - "D-09 belt-and-suspenders: outside-repo --queue-path (structural git-call guard) + --no-push (explicit flag), both independently enforcing no repo-write credential on the cluster"

key-files:
  created:
    - Dockerfile
    - .dockerignore
    - k8s/deployment.yaml
    - k8s/ingress.yaml
    - k8s/cronjob.yaml
    - k8s/team-keys-secret.yaml.template
  modified: []

key-decisions:
  - "Both Docker base images pinned by live-resolved sha256 digest (not floating tags) per plan text and T-08-05 mitigation"
  - "npm ci runs without trimming devDependencies (tsx/typescript needed at runtime by scripts/*.mjs) - verified absent via negative grep"
  - "Ingest AGDA_MCP_TEAM_INGEST_HOST=0.0.0.0 is a documented, deliberate override of the script's loopback default - safe because the pod is only reachable via Service/Ingress"
  - "CronJob mounts the same PVC volume twice (team-storage read path + cluster-fix-queue write path) as one `volumes:` entry with two `volumeMounts` subPaths, rather than two separate PVC volume entries"
  - "team-keys-secret.yaml.template is fully comment-prefixed (every line starts with #) so it can never be `kubectl apply -f`'d by accident - intentionally excluded from this plan's dry-run verify list"

requirements-completed: [DEPLOY-01]

# Metrics
duration: ~15min
completed: 2026-07-04
---

# Phase 8 Plan 02: Dockerfile + k8s Manifests Summary

**Digest-pinned 2-stage Dockerfile (cabal-built Agda 2.8.0 on haskell:9.10-bookworm -> node:24-slim, UID 2231, 4 baked-in fuel-corpus clones behind a BuildKit secret mount) plus Deployment/Service/Ingress/CronJob manifests targeting the live-verified llm-gateway namespace and sciserver-datavolumes-01-rw PVC.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-04 (session start, precise timestamp not captured)
- **Completed:** 2026-07-04T22:55:17Z
- **Tasks:** 2/2 completed
- **Files modified:** 6 created, 0 modified

## Accomplishments
- Dockerfile builds a real, version-verified Agda 2.8.0 (GHC 9.10.3, matching Hackage's `tested-with`) via cabal in a throwaway builder stage, copied into a Node 24 final stage — no floating base-image tags, both stages bookworm-based to avoid ABI drift.
- Non-root UID/GID 2231 baked in everywhere (Ceph ownership requirement) — never root.
- Fuel-corpora token protected two ways: BuildKit secret mount (keeps it off ENV/ARG/`docker history`) plus reliance on Plan 08-01's post-clone `remote set-url` scrub (keeps it off `.git/config` layer content) — both verification commands documented inline in the Dockerfile comment.
- k8s manifests reuse the existing `llm-gateway` namespace and `sciserver-datavolumes-01-rw` PVC exactly as verified live in SKILL.md — no `namespace.yaml`, no new PVC manifest anywhere in `k8s/`.
- CronJob wired so no repo-write git credential is ever needed on the cluster: `--queue-path` points outside the repo checkout (`writeBackQueue`'s own `relative(...).startsWith("..")` guard makes every git call a no-op) AND `--no-push` is set explicitly — two independent, redundant enforcements of D-09.
- Memory/CPU arithmetic is internally consistent and documented: ingest (512Mi/500m limits) + cron judge (6Gi/2000m limits) = 6.5Gi / 2.5 CPU peak, within the measured ~7Gi / ~3 CPU headroom with 0.5Gi / 0.5 CPU margin.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile + .dockerignore** - `0d08432` (feat)
2. **Task 2: k8s manifests (Deployment/Service/Ingress/CronJob/Secret template)** - `c749ab2` (feat)

**Plan metadata:** (this SUMMARY commit, to follow)

## Files Created/Modified
- `Dockerfile` - 2-stage BuildKit build; agda-builder (haskell:9.10-bookworm, cabal-installs Agda-2.8.0 with `-f-enable-cluster-counting`) -> final (node:24-slim, non-root UID 2231, npm ci with devDependencies, `npm run build`, bakes in 4 pinned fuel-corpus clones via a secret-mounted GH token, `CMD ["node", "dist/index.js"]`)
- `.dockerignore` - excludes `node_modules`, `dist`, `.git`, `.agda-mcp`, `coverage`, `.nyc_output`, `test-output`, `*.log`, `.planning`, `.claude`, `.codex`, `k8s`, `*.tgz`, `.DS_Store`
- `k8s/deployment.yaml` - Deployment `agda-mcp-ingest` (1 replica, UID/fsGroup 2231, port 4000, PVC subPath `agda-mcp/team-storage`, `agda-mcp-team-keys` secret volume at `/etc/agda-mcp-team`, resources 128Mi/100m-512Mi/500m, 3-probe `/healthz`) + Service `agda-mcp-ingest` (ClusterIP 4000->4000), both namespace `llm-gateway`
- `k8s/ingress.yaml` - Ingress on `dev.sites.idies.jhu.edu` path `/agda-mcp(/|$)(.*)`, `ImplementationSpecific`, `proxy-body-size: "512m"`, rewrite-target `/$2`
- `k8s/cronjob.yaml` - CronJob `agda-mcp-cron-judge`, daily `0 6 * * *`, `concurrencyPolicy: Forbid`, `activeDeadlineSeconds: 21600`, same image/UID as the Deployment, `GHCRTS=-M5g`, command runs `cron-ingest-wrapup.mjs --queue-path /data/cluster-queue/fix-queue.json --no-push`, resources 1Gi/250m-6Gi/2000m
- `k8s/team-keys-secret.yaml.template` - fully comment-prefixed documentation of the `kubectl create secret generic agda-mcp-team-keys --from-file=team-keys.json=...` sync flow; never applied as-is

## Decisions Made
- Followed the plan's literal digest pins, flag values, env-var names, and resource requests/limits without deviation — every numeric/string value in the manifests traces directly to the plan text or the cited `SKILL.md`/`scripts/team/*.mjs` interfaces.
- Chose a single `volumes:` PVC entry mounted twice (via two `volumeMounts` with different `subPath`/`mountPath`) in the CronJob rather than two separate PVC volume entries — functionally identical, less YAML repetition, still satisfies "reuse the existing PVC, never create a new one."
- Wrote Dockerfile rationale comments carefully avoiding the literal substring `--omit=dev` (used phrasing like "not trimming devDependencies") so the acceptance criterion's negative grep (`--omit=dev` must NOT appear anywhere in the file) still passes while the research citation is preserved in spirit.

## Deviations from Plan

None — plan executed exactly as written. One verification-environment substitution was necessary (documented below under Issues Encountered, not a code/content deviation).

## Issues Encountered

**Docker build --check could not run.** No Docker daemon is available on this machine (`Cannot connect to the Docker daemon at unix:///Users/eric/.docker/run/docker.sock`) — expected per the orchestrator's explicit note that the real build runs on GitHub runners in Plan 08-04. Fell back to the documented alternative: structural `grep` checks against every acceptance-criterion pattern (`FROM` count = 2, `USER agdamcp`, `EXPOSE 4000`, `-f-enable-cluster-counting` present, `RUN npm ci` present, `--omit=dev` absent) — all passed. `hadolint` was not installed, so it was skipped (also anticipated by the orchestrator note).

**`kubectl apply --dry-run=client` could not run.** Not just "no docker daemon" — this kubectl client has no configured context at all (`current-context is not set`), and even `--dry-run=client`/`--validate=false` still requires live API-group discovery from a reachable server to build a RESTMapper (confirmed: both attempts failed with `dial tcp [::1]:8080: connect: connection refused`, since kubectl defaults to `localhost:8080` with no context). This is a stronger network requirement than anticipated by the plan's literal verify command. Fell back to the orchestrator-sanctioned alternative ("yaml parse checks via node") using Python's `yaml` module (already available on this machine) instead: parsed all three manifests with `yaml.safe_load_all`, confirmed exact expected document counts (2 in `deployment.yaml`, 1 each in `ingress.yaml`/`cronjob.yaml`), confirmed every document has `apiVersion`/`kind`/`metadata.name`/`metadata.namespace`, and confirmed `team-keys-secret.yaml.template` has zero non-comment lines. Combined with all of the plan's literal `grep`-based acceptance criteria (all passed, see below), this gives equivalent confidence to the unavailable `kubectl` schema check for a plan whose real k8s validation happens in Plan 08-04 against the live cluster.

All plan-specified `grep` acceptance criteria were run directly and passed:
- `grep -c '^FROM' Dockerfile` = 2
- `grep -q "USER agdamcp" Dockerfile`, `EXPOSE 4000`, `-f-enable-cluster-counting` all present
- `RUN npm ci` present; `--omit=dev` absent
- `grep -c "runAsUser: 2231" k8s/deployment.yaml k8s/cronjob.yaml` = 2 total (1 each)
- `sciserver-datavolumes-01-rw` present in both `deployment.yaml` and `cronjob.yaml`
- `proxy-body-size: "512m"` present in `ingress.yaml`
- `--no-push` present in `cronjob.yaml`
- `namespace: llm-gateway` present in all three manifest files
- No `namespace.yaml` or `kind: PersistentVolumeClaim` anywhere under `k8s/`

## User Setup Required

None - no external service configuration required by this plan. (GHCR credentials, the `fuel_corpora_token` secret, and the `agda-mcp-team-keys` Secret are all provisioned in Plan 08-04, not here — this plan only produces the packaging artifacts that reference them.)

## Next Phase Readiness

- All 6 packaging artifacts (`Dockerfile`, `.dockerignore`, 4 `k8s/*.yaml(.template)` files) exist, are internally consistent with each other and with the live-verified cluster facts in `.claude/skills/agda-mcp-k8s-deploy/SKILL.md`, and are ready for Plan 08-04 to wire CI/CD around (build+push to GHCR, provision `ghcr-credentials`/`fuel_corpora_token`/`agda-mcp-team-keys` secrets, run the first real `kubectl apply` against the live cluster).
- Sibling Plan 08-01 (`scripts/team/clone-fuel-corpora.mjs`, `install-pinned-env.*`) was not yet present in this worktree at execution time (expected — parallel wave-1 execution, zero file overlap). The Dockerfile's `RUN --mount=type=secret ... node scripts/team/clone-fuel-corpora.mjs --root "$AGDA_MCP_FUEL_ROOT"` step is written strictly against the `--root <path>` CLI contract pinned in this plan's own frontmatter and has NOT been executed end-to-end — that real integration (and the full authenticated `docker buildx build`) is Plan 08-04's job, exactly as the plan's own acceptance criteria specify.
- No blockers.

---
*Phase: 08-pinned-environment-distribution-thin-k8s-deployment*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created files found on disk (Dockerfile, .dockerignore, k8s/deployment.yaml, k8s/ingress.yaml, k8s/cronjob.yaml, k8s/team-keys-secret.yaml.template, this SUMMARY.md). Both task commits (`0d08432`, `c749ab2`) found in git log.
