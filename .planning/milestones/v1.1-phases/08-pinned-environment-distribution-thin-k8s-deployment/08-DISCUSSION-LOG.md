# Phase 8: Pinned-Environment Distribution + Thin k8s Deployment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 8-Pinned-Environment Distribution + Thin k8s Deployment
**Areas discussed:** Distribution vehicle, Fuel-corpus clone path, Deployment trigger, Teammate Agda pinning

Per the maintainer's standing discuss-phase rules, all-forced areas were briefed as conclusions (not asked): post-arrival k8s unknowns deferred to research-phase; repo layout per research §2; image contents per DEPLOY-01 text; CronJob judge with manual queue pull-back (TEAM-07 locked deferral); no self-hosted runner; git-tag push + `run-pinned-agda.sh` creation as mechanical prerequisites; env-var override for the corpus root. Only the four genuine-taste questions below went to the user (asked in Chinese per language preference).

---

## Distribution vehicle (TEAM-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Install script | Host-native; agents/editor run directly, no container layer; overnight corpus builds on native FS | ✓ |
| devcontainer | Fully pinned container, but requires Docker, adds MCP wiring friction, slow Docker-FS builds on Mac | |
| Both | Widest coverage but two install paths to maintain — fattens a thin phase | |

**User's choice:** Install script
**Notes:** Recommended option; accepted.

---

## Fuel-corpus clone path (TEAM-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Visible `~/agda-mcp-fuel/<key>` | Teammates work inside these clones; visible path is discoverable | ✓ |
| Hidden `~/.agda-mcp-fuel/<key>` | Research draft's suggestion; treats clones as tool-managed assets | |
| Installer-recorded custom root | Most flexible; loses the "same path everywhere" debugging affordance | |

**User's choice:** Visible directory — with the added constraint that a minority of teammates use **Windows**.
**Notes:** First AskUserQuestion pass returned no answer for this question; on re-ask the user clarified in free text. Windows consequence resolved as a forced conclusion (phase boundary = thin packaging): Windows teammates go through WSL2; no native Windows support; onboarding doc gains a WSL2 section. User did not veto.

---

## Deployment trigger (DEPLOY-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Tag/manual dispatch (recommended) | Deliberate releases, matches the pinning philosophy; one extra manual step | |
| Path-filtered auto-deploy | Deploy only when k8s//Dockerfile/ingest files change | |
| Auto-deploy on every push to main | litellm pattern verbatim; unrelated commits also rebuild + roll the endpoint | ✓ |

**User's choice:** Auto-deploy on every push to main
**Notes:** User chose against the recommendation — keep `deploy-ingest.yml` as close to the litellm skill's proven `deploy.yml` as possible.

---

## Teammate Agda pinning (TEAM-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Verify version + instructions (recommended) | Script pins whatever correct-version binary exists via generated `run-pinned-agda.sh`; prints install instructions if absent | ✓ |
| Force-install via nix | Strongest reproducibility, but demands nix on every teammate machine | |
| Prefer nix, fall back to verify | Covers both, doubles the install-script code paths | |

**User's choice:** Verify version + instructions
**Notes:** Server-side judge (own pinned Agda) is the authoritative verdict; teammate-side friction minimized.

---

## Claude's Discretion

- Env-var name for the corpus-root override; installer language (bash vs Node bootstrap); CronJob schedule/deadline values; how Agda enters the Docker image; onboarding doc location/structure.

## Deferred Ideas

- None new. Pre-existing v2 deferrals unchanged (TEAM-06, TEAM-07, CACHE family).
