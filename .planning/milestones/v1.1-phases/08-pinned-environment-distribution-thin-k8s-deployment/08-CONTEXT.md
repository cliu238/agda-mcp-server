# Phase 8: Pinned-Environment Distribution + Thin k8s Deployment - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning (k8s environment facts deferred to post-arrival research — see Deferred-Empirical below)

<domain>
## Phase Boundary

Two deliverables, both thin packaging around Phase 7's already-locally-proven scripts — **no new application logic**:

1. **TEAM-05** — a teammate goes zero → uploading via a documented install script: pins the exact server version (git tag) and exact Agda (`tooling/scripts/run-pinned-agda.sh`), clones the pinned fuel corpora to a fixed convention, no npm account anywhere in the flow.
2. **DEPLOY-01** — the Phase 7 ingest endpoint + cron judge run for real on the JHU IDIES-style k8s server (litellm-k8s-deploy pattern), with local mode remaining a working fallback and POLICY-01's case-sensitivity fix re-verified on the cluster.

Gated on the physical server's arrival (~2026-07-07). Must not block, and must not be blocked by, Phases 6–7.

</domain>

<decisions>
## Implementation Decisions

### Distribution vehicle (TEAM-05)
- **D-01: Install script, not devcontainer.** One script checks/installs everything on the teammate's host. Editor and agents (Codex/Claude Code) run natively on the host; MCP wiring gets no container layer; overnight corpus builds run on the native filesystem. No devcontainer is built or maintained in v1.1.
- **D-02: Windows teammates go through WSL2 — no native Windows support.** A minority of teammates run Windows (user-supplied fact). Forced by the phase boundary (thin packaging, no new logic): `run-pinned-agda.sh` stays POSIX, corpus overnight builds are only proven on Unix, and no script grows Windows path handling. The onboarding doc gets a "Windows: install WSL2 first" section; inside WSL everything follows the standard Linux path, including the clone convention resolving to the WSL home.
- **D-03: Agda strategy = verify-and-instruct, never force-install.** The script locates an existing `agda`, verifies the pinned version (2.8.0 — what the corpora target), and generates `tooling/scripts/run-pinned-agda.sh` pinning that binary. If missing or mismatched, it prints install instructions (nix or ghcup, teammate's choice) and exits. Rationale: the server-side judge is the authoritative verdict with its own pinned Agda; teammate-side friction should be minimal.

### Fuel-corpus clone convention (TEAM-05)
- **D-04: Default clone root = visible `~/agda-mcp-fuel/<corpus-key>`** (e.g. `~/agda-mcp-fuel/agda-stdlib`), keys from `scripts/data/fuel-corpora.json`. Chosen over the research draft's hidden `~/.agda-mcp-fuel/` because teammates *work inside* these clones (editor + agent proof sessions) — a visible path is discoverable in Finder/terminal.
- **D-05: Env-var override is mandatory (forced, not taste).** The container's clones live at an in-image path and the maintainer's own clones live elsewhere (`~/projects6/Codex-Homotopy-Group`), so every consumer script resolves the root from an env var first and falls back to the default. One root variable + `<root>/<corpus-key>` resolution; exact variable name is planner's choice.

### Deployment trigger (DEPLOY-01)
- **D-06: Auto-deploy on every push to main** — the litellm `deploy.yml` pattern verbatim (GHCR build + SSH-jump kubectl rollout). Explicit user choice over tag-gated or path-filtered triggers, accepting that main-branch commits unrelated to the ingest also rebuild the image and roll the endpoint. Keeps CI/CD identical to the proven reference skill.

### Deployment architecture (forced conclusions, carried from research/requirements)
- **D-07: Repo layout per research §2** — `k8s/` manifests + `Dockerfile` at repo root, server-side scripts in `scripts/team/`, mirroring the litellm-k8s-deploy layout. (The CACHE-related entries in that research layout are void — theme deleted 2026-07-03.)
- **D-08: Cron judge = native k8s CronJob** sharing the ingest Deployment's image and PVC (the image already contains Node + Agda + corpus clones). Default schedule: daily — ORCL-01 cold replays can run for hours; the schedule and `activeDeadlineSeconds` are manifest-tunable knobs for the planner.
- **D-09: Fix-queue write-back from the cluster = manual review/pull step.** TEAM-07 is a locked v2 deferral — the cron judge's queue intake accumulates on the PVC; the maintainer pulls and reviews. Do not build push-back automation.
- **D-10: Image contents locked by DEPLOY-01 text**: `linux/amd64` on GHCR; Node + pinned Agda + pinned corpus *source* clones only (no caches); nginx-ingress path app with `proxy-body-size` matching the TEAM-03 cap; Ceph-UID-correct `securityContext`; `imagePullSecrets` for the private GHCR image. Buildable on standard hosted runners or locally — **no self-hosted runner** (locked out of scope: public repo + box holding teammate keys/logs).
- **D-11: A real git tag must be cut and pushed** for the installer to pin — the v1.0 tag exists locally but was never pushed; resolve as part of this phase.

### Deferred-empirical (do NOT decide before the server arrives)
Cannot be desk-researched; assigned to `/gsd:plan-phase 8 --research-phase` after ~2026-07-07 arrival:
- Actual k8s namespace name (lesson 14: provisioned name may differ from requested).
- PVC provisioning mode (lesson 12: creation may be read-only; check existing PVCs first).
- Ceph backing-store mode RBD vs CephFS — determines whether `fs.rename`-based atomic writes are safe for the storage root.

### Claude's Discretion
- Exact env-var name for the corpus-root override.
- Installer language (bash vs Node bootstrap) — note the bootstrap ordering: the installer must be runnable *before* `npm ci` has run, and must check/install Node ≥ 24 itself.
- Exact CronJob schedule/deadline values (daily default, tunable).
- How Agda gets into the Docker image (nix layer vs cabal multi-stage vs prebuilt binary) — constrained only by "buildable on standard hosted runners or locally".
- Onboarding doc location and structure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Deployment pattern (the reference implementation)
- `/Users/eric/projects6/litellm/.claude/skills/litellm-k8s-deploy/SKILL.md` — canonical k8s deployment pattern + the 22 lessons learned (SSH jump `dslogin01.pha.jhu.edu` → `k8slgn.idies.jhu.edu:14132`, kubeconfig under `/var/k8s/users/cliu238/`, Ceph UID 2231, GHCR first-push 403 fix, `--platform linux/amd64`, ingress `pathType: ImplementationSpecific`, base64 SSH secret). Outside this repo — absolute path.
- `/Users/eric/projects6/litellm/.claude/skills/litellm-k8s-deploy/assets/` — copyable k8s manifests, Dockerfile, `deploy.yml` workflow templates.
- `/Users/eric/projects6/litellm/.claude/skills/litellm-k8s-deploy/references/cluster-info.md` — cluster access, network, permissions.

### v1.1 research (this milestone's design ground)
- `.planning/research/ARCHITECTURE.md` — §2 recommended repo layout (`k8s/`, `Dockerfile`, `scripts/team/`), §7 sequencing; CACHE-related portions are void (theme deleted 2026-07-03).
- `.planning/research/SUMMARY.md` — Phase-8 rationale ("late, thin phase by design") and the deferred post-arrival unknowns list.
- `.planning/research/PITFALLS.md` — GHCR lesson-17 note; version-string-insufficient pitfall (context for D-03's wrapper-pinning).
- `.planning/research/STACK.md` — `docker buildx` cross-build commands for the ingest image.

### Requirements & pins
- `.planning/REQUIREMENTS.md` — TEAM-05 and DEPLOY-01 exact text; Out of Scope table (no self-hosted runner, TEAM-06/07 deferrals).
- `.planning/ROADMAP.md` — Phase 8 goal, dependencies, success criteria.
- `scripts/data/fuel-corpora.json` — SSOT for corpus keys, pinned refs, policy keys; the `<corpus-key>` in D-04's convention is this file's `key` field.

### Code seams this phase touches
- `src/agda/binary-discovery.ts` — already resolves `tooling/scripts/run-pinned-agda.sh` first; the installer generates that file (it does not exist yet — `tooling/` currently contains only `protocol/`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/agda/binary-discovery.ts` — the pinned-Agda wrapper hook already exists in resolution order; TEAM-05's installer only needs to *generate* `tooling/scripts/run-pinned-agda.sh`, no src/ change.
- `scripts/data/fuel-corpora.json` — pinned refs + policy keys for all 4 corpora; the installer's clone step iterates this file.
- Phase 7 deliverables (`scripts/dogfood/upload-run.mjs`, `scripts/team/ingest-server.mjs`, `scripts/team/cron-ingest-wrapup.mjs`, `scripts/team/issue-key.mjs`) — this phase packages them (image + manifests + installer docs); it does not modify their logic.
- `.github/workflows/ci.yml` — existing CI; the deploy workflow (`deploy-ingest.yml`) is additive alongside it.

### Established Patterns
- "Loop wraps the server": all Phase-8 work lives in `scripts/`, `k8s/`, `Dockerfile`, `tooling/`, docs — `src/` stays untouched.
- Env-var configuration read directly via `process.env` (no dotenv) — the corpus-root override follows this.
- JSON data SSOT loaded via `loadJsonData()` — corpus pins stay in `fuel-corpora.json`, never hardcoded.

### Integration Points
- `tooling/scripts/` — new directory for the generated `run-pinned-agda.sh`.
- Repo root — new `k8s/` + `Dockerfile`.
- `.github/workflows/deploy-ingest.yml` — new, mirrors litellm `deploy.yml`, triggers on push to main (D-06).
- Dockerfile note from research: `npm ci` **without** `--omit=dev` — `tsx`/`typescript` are devDependencies that `scripts/` needs at runtime.

</code_context>

<specifics>
## Specific Ideas

- A minority of teammates run Windows — the onboarding doc must carry a WSL2 section (D-02); no script grows native-Windows branches.
- User explicitly chose litellm-verbatim auto-deploy-on-main (D-06) over the recommended tag-gated trigger — keep the workflow as close to the litellm skill's `deploy.yml` as possible.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Pre-existing deferrals unchanged: TEAM-06 retention policy and TEAM-07 automated fix-queue write-back are v2 items; the CACHE family is v2, anchored on CACHE-04.)

</deferred>

---

*Phase: 8-Pinned-Environment Distribution + Thin k8s Deployment*
*Context gathered: 2026-07-03*
