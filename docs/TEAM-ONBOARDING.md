# Team Onboarding: Zero to Uploading

## TL;DR

```bash
git clone https://github.com/<org>/agda-mcp-server.git
cd agda-mcp-server
git fetch --tags
git checkout "$(git tag --list 'v*' | sort -V | tail -1)"
bash scripts/team/install-pinned-env.sh
```

```bash
export AGDA_MCP_TEAM_UPLOAD_KEY="<key from maintainer>"
export AGDA_MCP_TEAM_UPLOAD_URL="https://dev.sites.idies.jhu.edu/agda-mcp/ingest"
```

```bash
npx tsx scripts/dogfood/dogfood-run.mjs
npx tsx scripts/dogfood/dogfood-wrapup.mjs
npx tsx scripts/dogfood/upload-run.mjs <run-id>
```

Details and failure modes below.

## 1. Prerequisites

- **Node >= 24**, **git**.
- **Agda exactly 2.8.0** on `PATH` — verify-and-instruct, never force-installed (D-03): the installer (Step 2) checks your `agda` binary and tells you how to fix it if wrong. Install via nix or ghcup, your choice.
- **GitHub credentials for 2 private fuel corpora** — `codex-homotopy-group` and `autoformalizing-hopf` (both `emilyriehl/*`, private) need your GitHub account granted read access (ask the maintainer) plus a usable local credential (`gh auth login` or `GH_TOKEN`). Without this, Step 2 reports `2/4 fuel corpora ready` and exits 1. The 2 public corpora (`agda-stdlib`, `agda-unimath`) need no credentials.

### Windows

Install WSL2 first and run every step below — Step 1 through Step 5 — inside it, never from a native Windows shell: no script in this repo handles native Windows paths (D-02), and the fuel-corpus clone root resolves to your WSL home (`~/agda-mcp-fuel/...`).

## 2. Step 1: Get the pinned server

Clone the repo and check out the highest git tag by version sort (never a hardcoded version string):

```bash
git clone https://github.com/<org>/agda-mcp-server.git
cd agda-mcp-server
git fetch --tags
git checkout "$(git tag --list 'v*' | sort -V | tail -1)"
```

No npm account is used anywhere in this repo (D-01: git install, not `npm publish`).

## 3. Step 2: Run the installer

```bash
bash scripts/team/install-pinned-env.sh
```

Checks Node/git, verifies your `agda` is exactly `2.8.0`, generates a pinned `tooling/scripts/run-pinned-agda.sh` wrapper, clones the 4 fuel corpora under `~/agda-mcp-fuel/<corpus-key>` (or `$AGDA_MCP_FUEL_ROOT`, D-04/D-05), runs `npm ci`, and prints an `N/4 fuel corpora ready` summary — exiting 1 on anything less than 4/4.

**If it exits 1:**

- **Wrong/missing Agda** — follow the printed nix/ghcup instructions, then re-run. Nothing else runs until Agda verifies correctly.
- **Partial corpus clone** (e.g. `2/4 fuel corpora ready`) — everything else installed; fix the GitHub credential prerequisite above, then re-run (idempotent, only re-fetches missing corpora). Don't proceed to Step 3 with a partial clone — `codex-homotopy-group` is the first dogfood target and later steps fail confusingly without it.

## 4. Step 3: First corpus build (overnight, once)

Documented, not automated: open each cloned corpus (under `~/agda-mcp-fuel/` or your `$AGDA_MCP_FUEL_ROOT`) in your editor/agent and let its first full typecheck run to completion, once. Larger corpora (`agda-unimath`-scale) can take hours — expected. Subsequent loads are fast once `_build` is warm.

## 5. Step 4: Get an upload key

The maintainer runs `scripts/team/issue-key.mjs`'s `issue` subcommand for you out of band and shares your Bearer key plus the consent statement over a side channel (Slack, email — never a committed file). Then set:

```bash
export AGDA_MCP_TEAM_UPLOAD_KEY="<the key the maintainer gave you>"
export AGDA_MCP_TEAM_UPLOAD_URL="https://dev.sites.idies.jhu.edu/agda-mcp/ingest"
```

The endpoint is live — check `https://dev.sites.idies.jhu.edu/agda-mcp/healthz`.

**If the cluster endpoint is unreachable:** run `npx tsx scripts/team/ingest-server.mjs` locally and point `AGDA_MCP_TEAM_UPLOAD_URL` at `http://127.0.0.1:8787/ingest` instead.

## 6. Step 5: Do proof work and upload

```bash
npx tsx scripts/dogfood/dogfood-run.mjs
# ... do your proof work through the proxy ...
npx tsx scripts/dogfood/dogfood-wrapup.mjs
npx tsx scripts/dogfood/upload-run.mjs <run-id>
```

Or let the upload auto-chain at the end of `dogfood-wrapup.mjs` (existing TEAM-02 behavior).

## 7. Known limitations

The cron judge's flaky-classification log is diagnostic-only and ephemeral on the cluster (does not survive a pod restart). The fix-queue on the PVC (`fix-queue.json`, D-09) is durable and is the source of truth — treat it, not the flaky log, as authoritative.
