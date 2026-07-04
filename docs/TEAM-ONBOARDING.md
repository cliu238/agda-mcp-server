# Team Onboarding: Zero to Uploading

This is the walkthrough a new teammate follows to go from a clean machine to
their first successful dogfooding-run upload. It is the documented version of
exactly what `test/integration/team/team-onboarding-walkthrough.test.ts`
exercises end to end (against a local ingest endpoint) — that test is the
proof this walkthrough actually works, not just a description of one.

## 1. Prerequisites

You need:

- **Node >= 24** (`node --version`). Install via nvm/fnm/homebrew if needed:
  https://nodejs.org/
- **git**.
- **Agda 2.8.0** — the exact version the pinned fuel corpora target. This
  server never force-installs Agda for you (**D-03: verify-and-instruct,
  never force-install**): the installer (Step 2 below) locates whatever
  `agda` is already on your `PATH`, checks it is exactly `2.8.0`, and tells
  you how to fix it if not. Install it yourself, your choice of tool:
  - nix: https://nixos.org/download.html
  - ghcup: https://www.haskell.org/ghcup/

### Windows

Windows teammates install **WSL2** first and run every step below —
including all of Step 1 through Step 5 — **inside** the WSL2 Linux
environment, never from a native Windows shell (**D-02**). This is forced by
the phase boundary this onboarding flow was built under: no script in this
repo grows Windows-specific path handling. `tooling/scripts/run-pinned-agda.sh`
is POSIX-only, and the fuel-corpus clone root (Step 2) resolves to your WSL
home directory (`~/agda-mcp-fuel/...`), never a native `C:\...` path. Once
you are inside WSL2, everything below is identical to the standard Linux
path — there is no separate Windows track past this point.

## 2. Step 1: Get the pinned server

Clone the repo and check out the **highest git tag by version sort** — never
a hardcoded version string, which would go stale the moment a newer tag is
cut:

```bash
git clone https://github.com/<org>/agda-mcp-server.git
cd agda-mcp-server
git fetch --tags
git checkout "$(git tag --list 'v*' | sort -V | tail -1)"
```

No npm account is used or needed anywhere in this step, or in any step below
(**D-01: this is a git install, not an `npm publish` distribution** — you
never run `npm login`, never need registry credentials, and this server is
never installed via `npm install -g`).

## 3. Step 2: Run the installer

```bash
bash scripts/team/install-pinned-env.sh
```

This does, in order:

1. Checks Node itself is present and `>= 24` (the bash wrapper's own gate,
   before anything else runs).
2. Checks `git` is present.
3. Hands off to `scripts/team/install-pinned-env.mjs`, which:
   - Locates your `agda` binary (`AGDA_BIN` env var if set, else `which agda`)
     and verifies it reports exactly Agda `2.8.0` (**D-03**).
   - Generates `tooling/scripts/run-pinned-agda.sh` — a thin wrapper pinning
     that exact `agda` binary path, which `src/agda/binary-discovery.ts`
     already resolves first when the server looks for an Agda binary.
   - Clones all 4 fuel corpora (`agda-stdlib`, `agda-unimath`,
     `codex-homotopy-group`, `autoformalizing-hopf`) at their pinned refs
     under `~/agda-mcp-fuel/<corpus-key>` by default — or under
     `$AGDA_MCP_FUEL_ROOT/<corpus-key>` if you set that environment variable
     (**D-04**: a visible clone root, not a hidden dotfile path, because you
     work inside these clones with your editor and agent; **D-05**: the
     env-var override is mandatory, not optional, since the maintainer's own
     clones live at a different path than the container image's clones).
   - Runs `npm ci` in the repo.

**If it exits 1:** it means Agda is missing or does not match `2.8.0`. The
script prints the exact nix/ghcup instructions again — follow them, then
re-run `bash scripts/team/install-pinned-env.sh`. Nothing is partially
applied on this failure path: `tooling/scripts/run-pinned-agda.sh` is not
written, no fuel corpus is cloned, and `npm ci` does not run until Agda
verifies correctly.

## 4. Step 3: First corpus build (overnight, once)

This step is **documented, not automated** — there is no bespoke cache
system in this milestone (that idea was deliberately deleted from scope).
Open each corpus cloned into `~/agda-mcp-fuel/` (or your
`$AGDA_MCP_FUEL_ROOT`) in your editor/agent session and let its own first
full typecheck run to completion, once. The larger corpora
(`agda-unimath`-scale) can take **hours** on a first build — this is
expected and is why it is called out as its own step rather than folded into
the installer. Once each corpus has a warm local `_build`, subsequent loads
are fast.

## 5. Step 4: Get an upload key

The maintainer runs `scripts/team/issue-key.mjs`'s `issue` subcommand for you
out of band, and shares two things with you over a side channel — Slack,
email, or equivalent, **never a committed file**:

- your raw Bearer key
- the printed consent statement (states exactly what an upload contains —
  read it before uploading anything)

Once you have your key, set these in your shell profile:

```bash
export AGDA_MCP_TEAM_UPLOAD_KEY="<the key the maintainer gave you>"
export AGDA_MCP_TEAM_UPLOAD_URL="https://dev.sites.idies.jhu.edu/agda-mcp/ingest"
```

`AGDA_MCP_TEAM_UPLOAD_URL` is the real cluster endpoint — live once the
k8s deployment plan in this phase has shipped it.

**Local fallback:** if the cluster endpoint is unreachable, you can run the
ingest server yourself and point uploads at it instead:

```bash
npx tsx scripts/team/ingest-server.mjs
export AGDA_MCP_TEAM_UPLOAD_URL="http://127.0.0.1:8787/ingest"
```

This local-endpoint fallback is exactly the mechanism this onboarding
document's own acceptance test
(`test/integration/team/team-onboarding-walkthrough.test.ts`) exercises end
to end — a real local server, a real issued key, and a real upload over
loopback — so it is proven to work, not just described.

## 6. Step 5: Do proof work and upload

Run a dogfooding session, then wrap it up, then upload:

```bash
npx tsx scripts/dogfood/dogfood-run.mjs
# ... do your proof work through the proxy ...
npx tsx scripts/dogfood/dogfood-wrapup.mjs
npx tsx scripts/dogfood/upload-run.mjs <run-id>
```

Or let the upload auto-chain at the end of `dogfood-wrapup.mjs`, per the
existing TEAM-02 behavior — this onboarding flow introduces no new flag or
step for that.

## 7. Known limitations

The cron judge's flaky-classification log
(`.agda-mcp/team/cron-flaky.jsonl`) is **not configurable** via any CLI flag
or environment variable, and on the cluster it writes to the pod's ephemeral
filesystem rather than the PVC — it does **not** survive a CronJob pod
restart. This is a recorded, deliberate scope boundary, not an oversight:
fixing it would mean adding a new CLI flag to a script this onboarding phase
does not own, which is out of bounds for a phase whose whole boundary is thin
packaging with no new application logic.

By contrast, the fix-queue accumulation on the PVC (`fix-queue.json`, **D-09**)
**is** durable and is the authoritative record of what the cron judge found.
Treat the flaky log as diagnostic-only, and the fix queue as the source of
truth.
