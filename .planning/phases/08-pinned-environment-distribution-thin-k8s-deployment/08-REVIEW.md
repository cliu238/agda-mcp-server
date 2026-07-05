---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
reviewed: 2026-07-05T04:00:50Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - .dockerignore
  - .github/workflows/deploy-ingest.yml
  - Dockerfile
  - docs/DEPLOY-OPERATIONS.md
  - docs/TEAM-ONBOARDING.md
  - k8s/cronjob.yaml
  - k8s/deployment.yaml
  - k8s/ingress.yaml
  - k8s/team-keys-secret.yaml.template
  - scripts/team/clone-fuel-corpora.mjs
  - scripts/team/install-pinned-env.mjs
  - scripts/team/install-pinned-env.sh
  - test/integration/team/team-onboarding-walkthrough.test.ts
  - test/unit/tools/team-clone-fuel-corpora.test.ts
  - test/unit/tools/team-install-pinned-env.test.ts
findings:
  critical: 1
  warning: 11
  info: 5
  total: 17
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-05T04:00:50Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

Reviewed the Phase 8 packaging surface: Dockerfile + `.dockerignore`, the CI deploy workflow, the three k8s manifests + secret template, the two runbooks, the TEAM-05 installer scripts, and their three test files. Cross-checked every referenced contract against the actual modules (`scripts/data/fuel-corpora.json` shape and SHA pins, `ingest-server.mjs` env names/port 8787 default/`createIngestServer` signature, `issue-key.mjs` sha256-hashed registry, `cron-ingest-wrapup.mjs` `--queue-path`/`--no-push` flags, `binary-discovery.ts` wrapper resolution, `upload-run.mjs` deps seam names, `.gitignore`). The live-deploy-proven paths (manifests, workflow plumbing, ingress rewrite/body-size arithmetic, PVC subPath/initContainer scheme, probe timing) check out and are internally consistent with the runbook.

What remains is concentrated exactly where the task predicted: latent bugs on the *not-yet-exercised* paths (installer re-runs, first real in-image `agda` execution), secret-handling gaps around the private-corpus token and the local Docker-build context, one supply-chain pinning hole (Hackage index), and a false-green in the fresh-teammate installer — the highest-severity finding, because it contradicts both the onboarding doc's contract and this project's own anti-false-green charter.

## Critical Issues

### CR-01: Installer reports success ("done.", exit 0) while fuel-corpus provisioning fails — guaranteed false-green on the default fresh-teammate path

**File:** `scripts/team/install-pinned-env.mjs:178` (and `docs/TEAM-ONBOARDING.md:70-75, 81-86`)
**Issue:** `scriptMain()` discards the return value of `cloneAllFuelCorpora(resolveFuelRoot(), deps)` — no summary line, no exit-code reflection. The standalone CLI (`clone-fuel-corpora.mjs:210-212`) sets `process.exitCode = 1` on any failure and prints an `N/M corpora ready` summary; the installer — the documented entry point every teammate actually runs — does neither. This is not an edge case: a fresh teammate has neither `GH_TOKEN` nor an authenticated `gh`, so **both private corpora (`codex-homotopy-group`, `autoformalizing-hopf`) always skip** with `private-repo-no-credential`, their two stderr lines get buried under the subsequent minutes of `npm ci` inherited output, and the run ends with exit 0 and `"install-pinned-env: done."`. `docs/TEAM-ONBOARDING.md` compounds it: Step 2 states unconditionally that the installer "Clones all 4 fuel corpora", and the failure section says "If it exits 1: it means Agda is missing or does not match 2.8.0" — implying exit 0 covers everything else. The doc never mentions that the two private corpora need GitHub credentials (or per-user access grants to `emilyriehl/*`) at all. `codex-homotopy-group` is "the FIRST OFFICIAL dogfood-run target" per its own SSOT notes — the teammate discovers the missing corpus days later at Step 3/5, disconnected from the cause. No test covers `scriptMain`'s success path (the walkthrough test drives the pieces individually with all-ok fakes), so nothing catches this.
**Fix:**
```javascript
// scripts/team/install-pinned-env.mjs — consume the results:
const results = cloneAllFuelCorpora(resolveFuelRoot(), deps);
const okCount = results.filter((r) => r.ok).length;
process.stdout.write(`install-pinned-env: ${okCount}/${results.length} fuel corpora ready under ${resolveFuelRoot()}\n`);
if (okCount < results.length) {
  process.stderr.write(
    "install-pinned-env: some corpora did not clone. Private corpora need `gh auth login` " +
      "or GH_TOKEN with access to the repo — see docs/TEAM-ONBOARDING.md, then re-run.\n",
  );
  process.exitCode = 1; // fail loud; re-run is idempotent
  return; // do not print "done." on a partial install
}
runNpmCi(repoRoot, deps);
```
And in `docs/TEAM-ONBOARDING.md` Step 2: document the private-corpora credential prerequisite (`gh auth login`, plus requesting access to the two `emilyriehl` repos) and update the "If it exits 1" section to cover the corpus-clone failure mode.

## Warnings

### WR-01: Interrupted credentialed clone leaves the token in `.git/config` forever — the idempotent re-run path never re-scrubs

**File:** `scripts/team/clone-fuel-corpora.mjs:122-123, 130-138`
**Issue:** The T-08-02 scrub (`remote set-url origin <clean-url>`) runs only on the *fresh-clone* branch, strictly after the clone completes. If the process dies between `git clone` (token-bearing URL now persisted in `destDir/.git/config`) and the `set-url` — Ctrl-C, OOM, laptop sleep-kill — the token stays in plaintext on disk indefinitely: every subsequent run takes the `existsSync(destDir)` branch (line 122-123), which only fetches and never re-asserts the clean URL. The security control has a persistence hole exactly on its crash path.
**Fix:** Re-assert the clean remote URL in the exists-branch (idempotent, one cheap subprocess):
```javascript
if (existsSync(destDir)) {
  // Re-scrub defensively: a prior run interrupted between clone and
  // set-url leaves a token-bearing origin URL behind (T-08-02).
  execFile("git", ["-C", destDir, "remote", "set-url", "origin", resolveCloneUrl(entry, deps, null)], gitOpts);
  execFile("git", ["-C", destDir, "fetch", "origin", entry.pinnedRef], gitOpts);
}
```
(`resolveCloneUrl(entry, deps, null)` keeps the `deps.cloneUrl` test seam working.)

### WR-02: Token leaks into `ps` argv during clone and is retained verbatim in stored error strings

**File:** `scripts/team/clone-fuel-corpora.mjs:81, 130-132, 158-165`
**Issue:** Two exposure vectors for `GH_TOKEN`/`FUEL_CORPORA_READ_TOKEN`: (1) the token is embedded in the `git clone https://x-access-token:<token>@github.com/...` argv — visible via `ps` to any local user for the clone's duration (minutes for these corpora) on a multi-user machine; (2) when that clone fails non-zero (expired token, network error), Node's `execFileSync` throws an `Error` whose `message` is `Command failed: git clone https://x-access-token:<token>@github.com/... <dest>` — the full token — and the catch block stores it verbatim into `{ reason: "clone-failed", error: error.message }`. Nothing prints the `error` field today, but it sits in the returned results array one `console.log(results)` / debug change away from a log leak, and future consumers of `cloneAllFuelCorpora`'s return value have no signal that the field is secret-bearing.
**Fix:** Scrub the token from any stored error text, and prefer keeping it out of argv entirely:
```javascript
} catch (error) {
  let message = error instanceof Error ? error.message : String(error);
  if (token) message = message.split(token).join("***");
  return { ok: false, key: entry.key, reason: "clone-failed", error: message };
}
```
(`token` needs to be hoisted to the function scope.) For argv, the stronger fix is `git -c credential.helper= -c http.extraHeader="Authorization: Basic <b64>" clone <clean-url>` with the header passed via `GIT_CONFIG_*` env vars, or a one-shot `GIT_ASKPASS` script — the token then never appears in argv or `.git/config` and WR-01 disappears too.

### WR-03: Private-corpus *update* path has no credential mechanism and no `GIT_TERMINAL_PROMPT=0` — documented "idempotent re-run" hangs on a password prompt or fails

**File:** `scripts/team/clone-fuel-corpora.mjs:119, 122-123`
**Issue:** The exists-branch runs `git -C <dest> fetch origin <pinnedRef>` with the scrubbed (clean, token-free) origin URL and never consults `deps.ghToken`/`GH_TOKEN`/`gh` — those are only read on the fresh-clone branch. git does not read `GH_TOKEN`. So on re-run against a private corpus: with no credential helper configured, git prompts for username/password **directly on /dev/tty** (`stdio: "pipe"` does not prevent this) — the installer appears to hang mid-run on an unexplained auth prompt, twice; in a non-tty context it fails and degrades to `clone-failed`. A `gh repo clone`-provisioned corpus only fetches if the teammate happened to run `gh auth setup-git`. The docstring's "idempotent re-run" claim (line 92) holds only for public corpora. This also bites the pinnedRef-bump scenario: bumping a private corpus's SHA in `fuel-corpora.json` cannot be picked up by any credentialed re-run.
**Fix:** (1) Add `env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }` to `gitOpts` so failure is fast and non-interactive, never a hang. (2) Apply the same credential resolution to the fetch as to the clone, e.g. for the token case: `execFile("git", ["-C", destDir, "fetch", resolveCloneUrl(entry, deps, token), entry.pinnedRef], gitOpts)` (fetching from an explicit URL leaves `.git/config` untouched), falling back to plain `fetch origin` for public/`gh`-helper setups.

### WR-04: `.dockerignore` does not exclude the gitignored team-key registry (or `.env*`) — a local `docker build` bakes "Team channel secrets" into the pushed image

**File:** `.dockerignore:1-14` (with `Dockerfile:64`)
**Issue:** `.gitignore` classifies `scripts/team/data/team-keys.json` under "Team channel secrets", and `.env`/`.env.*`, `local-only/`, `.local-reference/`, `tmp/` as local-only — none of them appear in `.dockerignore`. `Dockerfile:64` does `COPY . .`. CI builds from a clean checkout so these files are absent there, but D-10 explicitly blesses building "on standard hosted runners **or locally**", and the maintainer's working tree is exactly where `scripts/team/data/team-keys.json` lives (it must, per the secret-rotation runbook). A local build+push therefore ships the key registry (person slugs + sha256 key hashes — not raw-key-equivalent, since keys are 32 random bytes, but still the team roster and revocation state) and any local `.env` into a GHCR image layer. Defense-in-depth failure: the boundary currently depends on *where* you build.
**Fix:** Append to `.dockerignore`:
```
scripts/team/data
.env
.env.*
local-only
.local-reference
tmp
```

### WR-05: Final image never executes `agda` — no build-time smoke test, and the live acceptance never ran it either; first execution is an unattended nightly cron

**File:** `Dockerfile:37-44` (header claim at line 4)
**Issue:** The header claims a "version-verified Agda 2.8.0", but no stage ever runs the binary: stage 2 copies `/agda-bin/agda` from the haskell:bookworm builder into `node:24-slim` and trusts that every dynamically linked library it needs exists there. Today it plausibly works only *transitively*: `libgmp10` and `libffi8` arrive via `git → libcurl3-gnutls → gnutls/p11-kit` Depends chains, `libtinfo6` via bash — none of them requested on purpose, so dropping/replacing the `git` install or a base-image change silently removes them. Critically, the 2026-07-05 cluster acceptance never executed `agda` in the image either: the cron-judge run processed a **zero-capture** archive ("0 capture(s)" — no ORCL replay, no agda spawn) and the POLICY-01 vitest run is pure unit tests. So the very first `agda` execution in this image will be the first capture-bearing nightly run — overnight, unattended, with `activeDeadlineSeconds` as the only backstop. A one-line build-time assert converts that latent runtime failure into a build failure.
**Fix:**
```dockerfile
COPY --from=agda-builder /agda-bin/agda /usr/local/bin/agda
COPY --from=agda-builder /agda-bin/agda-mode /usr/local/bin/agda-mode
# Fail the build if the binary cannot exec in THIS base image (shared
# libs) or is not the pinned version.
RUN agda --version && agda --version | grep -qF "Agda version 2.8.0"
```

### WR-06: Hackage index not pinned — `cabal update && cabal install Agda-2.8.0` re-resolves transitive deps on every (deliberately no-cache) rebuild

**File:** `Dockerfile:24-29` (with `.github/workflows/deploy-ingest.yml:62`)
**Issue:** Both base images are digest-pinned and every GitHub Action is SHA-pinned, but the Agda build's entire transitive dependency closure floats: `cabal update` pulls the latest Hackage index at build time, and the workflow's `no-cache: true` guarantees a fresh resolution on every main push. Agda-2.8.0 itself is version-exact, but its dependency solve is not — a newly published (broken or malicious) version of any transitive dep changes the shipped judge binary with no diff in this repo. This is the one unpinned link in an otherwise fully pinned supply chain, on the binary whose verdicts the whole Loop ② trusts.
**Fix:** Pin the index state to the same date the image digests were resolved:
```dockerfile
RUN cabal update 'hackage.haskell.org,2026-07-04T00:00:00Z' && \
    cabal install Agda-2.8.0 \
      --install-method=copy \
      --installdir=/agda-bin \
      --overwrite-policy=always \
      -f-enable-cluster-counting
```

### WR-07: `RUN chown -R` duplicates `/app` (node_modules + build) and all 4 corpus clones into an extra layer — roughly doubling the image that already blew a rollout timeout

**File:** `Dockerfile:83`
**Issue:** In overlayfs, `chown -R agdamcp:agdamcp /app "$AGDA_MCP_FUEL_ROOT"` as its own `RUN` copies every affected file into a new layer — full `node_modules`, `dist`, and the four corpus clones (agda-unimath alone is hundreds of MB with history). That is not an abstract size nit here: the deploy workflow's own comment (`deploy-ingest.yml:180-181`) records that the ~1.8 GB compressed image caused a live rollout-status timeout ("cold node pull + 150s startup-probe window doesn't fit 5m reliably") and forced a 10m budget. Halving the image by eliminating the duplicate layer directly de-risks the deploy step and every cold-node cron pull.
**Fix:** Create the user before the heavy steps and run them *as* that user, so no post-hoc chown is needed:
```dockerfile
RUN groupadd -g 2231 agdamcp && useradd -u 2231 -g 2231 -m -d /home/agdamcp -s /usr/sbin/nologin agdamcp && \
    mkdir -p /app /opt/agda-mcp-fuel && chown agdamcp:agdamcp /app /opt/agda-mcp-fuel
USER agdamcp
WORKDIR /app
COPY --chown=agdamcp:agdamcp package.json package-lock.json ./
RUN npm ci
COPY --chown=agdamcp:agdamcp . .
RUN npm run build
# ... clone step runs as agdamcp; drop the final `RUN chown -R` entirely.
```

### WR-08: Deploy SSH: `StrictHostKeyChecking=no` on both hops, and the *inner* `-A` forwards the CI deploy agent onto k8slgn unnecessarily

**File:** `.github/workflows/deploy-ingest.yml:183-184`
**Issue:** (1) Host-key verification is disabled on both hops, so a MITM on runner→`dslogin01` (public internet) or `dslogin01`→`k8slgn` can transparently intercept the session — and because agent forwarding is active, *use the forwarded agent to authenticate as the deploy key* for the duration. (2) The outer `-A` is required (dslogin01 needs the agent to reach k8slgn), but the inner `-A` is not: the remote script on k8slgn runs only `kubectl`, never ssh — forwarding the agent there just hands root on a shared university login node a live socket that signs with the CI deploy key. litellm-verbatim shape or not, both are one-line least-privilege/host-authenticity fixes that don't change the pipeline's behavior.
**Fix:** Drop `-A` from the inner `ssh` invocation; pin host keys instead of disabling checking — e.g. store the two hosts' keys as a repo file or secret and write them in the key-setup step:
```bash
echo "${{ secrets.K8S_KNOWN_HOSTS }}" > ~/.ssh/known_hosts   # ssh-keyscan output, captured once
# then use -o StrictHostKeyChecking=yes (default) on both hops
```

### WR-09: Generated `run-pinned-agda.sh` embeds the Agda path unescaped inside double quotes — `$`, backtick, `"`, `\` in `AGDA_BIN` corrupt or execute; the T-08-04 comment's premise is false

**File:** `scripts/team/install-pinned-env.mjs:100-105` (input from lines 57-60)
**Issue:** `generateRunPinnedAgdaScript` interpolates `resolvedAgdaPath` into `exec "${resolvedAgdaPath}" "$@"`. Inside bash double quotes, `$`, `` ` ``, `\` and an embedded `"` are live: a path containing `$` (legal in Unix filenames) is expanded at wrapper runtime, and a `"` breaks the quoting entirely, letting the remainder execute as shell. The code comment asserts the input is "never teammate-supplied free text" — but `locateAgdaBinary` returns `process.env.AGDA_BIN` verbatim (line 58-60), which is exactly teammate-supplied free text. On a personal machine this is self-inflicted, but the wrapper is then silently resolved first by `src/agda/binary-discovery.ts` for every server run, so a mangled path becomes a confusing far-from-cause failure rather than an install-time error.
**Fix:** Single-quote with proper escaping (nothing is live inside single quotes):
```javascript
export function generateRunPinnedAgdaScript(resolvedAgdaPath) {
  const quoted = `'${resolvedAgdaPath.replaceAll("'", `'\\''`)}'`;
  return `#!/usr/bin/env bash\nset -euo pipefail\nexec ${quoted} "$@"\n`;
}
```
(Or reject paths matching `/["$\\`\n]/` at verify time with an instructive message.)

### WR-10: Token-scrub unit test is vacuous — the `deps.cloneUrl` override means the token never enters `.git/config`, so the "config does not contain token" assertions prove nothing

**File:** `test/unit/tools/team-clone-fuel-corpora.test.ts:204-240`
**Issue:** The test named "a credentialed private clone scrubs the embedded token from origin immediately after cloning" clones via `cloneUrl: () => bareRepoPath` — which `resolveCloneUrl` honors *before* any token embedding (`clone-fuel-corpora.mjs:77-79`). The clone URL git persists is the fixture path; `fake-token-value` is never written to `.git/config` at any point. The assertions `config.includes("x-access-token") === false` and `config.includes("fake-token-value") === false` therefore pass on any implementation, including one with the scrub deleted (the final `set-url` assertion would still catch removal of the call itself, but nothing verifies the production token-bearing URL form, since `resolveCloneUrl` is unexported and untested). The test file's own header says it validates the T-08-02 security control; as written, the "token was scrubbed" half of that confidence is unearned.
**Fix:** Export `resolveCloneUrl` and pin the production URL form directly, keeping the existing ordering assertion:
```typescript
test("resolveCloneUrl embeds the token in x-access-token basic-auth form (T-08-02 pre-scrub shape)", () => {
  expect(resolveCloneUrl({ repo: "example/private-corpus" }, {}, "tok")).toBe(
    "https://x-access-token:tok@github.com/example/private-corpus.git",
  );
});
```
Then either delete the vacuous `.git/config` negative assertions or annotate them as final-state checks only.

### WR-11: Runbook secret-sync recipes: predictable world-readable `/tmp` staging file on a shared login host, and the GHCR PAT in remote-command argv

**File:** `docs/DEPLOY-OPERATIONS.md:64-71, 98-105`
**Issue:** These recipes execute on `k8slgn`, a shared multi-user login node. (1) The team-keys sync decodes the registry to the fixed path `/tmp/agda-mcp-team-keys.json.sync` — created with default umask (world-readable) and pre-creatable/symlinkable by any local user (classic CWE-377: an attacker who pre-creates that exact name as a symlink redirects the write; one who pre-creates it 0666 reads the content). Content is hashed keys + roster, not raw keys — bounded damage, but avoidable entirely. (2) The GHCR rotation embeds the PAT as `--docker-password="<token value>"` in the remote `kubectl` argv — visible in `ps` to every user on the host for the command's duration (CWE-214), and the runbook's "never echo it" guidance doesn't cover argv exposure.
**Fix:** Eliminate both the temp file and the argv token by piping through stdin end-to-end:
```bash
# team-keys: no temp file at all
echo '<base64 blob>' | base64 -d | kubectl create secret generic agda-mcp-team-keys \
  --namespace=llm-gateway --from-file=team-keys.json=/dev/stdin \
  --dry-run=client -o yaml | kubectl apply -f -

# ghcr: build the dockerconfigjson secret locally, ship only the sealed YAML
kubectl create secret docker-registry agda-mcp-ghcr --namespace=llm-gateway \
  --docker-server=ghcr.io --docker-username=cliu238 \
  --docker-password="$(cat ~/.agda-mcp-ghcr-token)" \
  --dry-run=client -o yaml   # run LOCALLY, then pipe the YAML over ssh into `kubectl apply -f -`
```

## Info

### IN-01: Runbook misquotes the onboarding doc's tag-resolution command (and its own variant is less robust)

**File:** `docs/DEPLOY-OPERATIONS.md:479, 490` vs `docs/TEAM-ONBOARDING.md:46`
**Issue:** DEPLOY-OPERATIONS states TEAM-ONBOARDING's documented step is `git checkout "$(git tag --sort=-v:refname | head -1)"`; the onboarding doc actually says `git checkout "$(git tag --list 'v*' | sort -V | tail -1)"`. Both resolve `v1.1` today, but the runbook's unfiltered variant would pick any future non-`v` tag that sorts higher.
**Fix:** Update DEPLOY-OPERATIONS.md:479/490 to quote the actual onboarding command (the `--list 'v*'` form is the better of the two).

### IN-02: Onboarding clone command ships a literal `<org>` placeholder in a copy-paste block

**File:** `docs/TEAM-ONBOARDING.md:43`
**Issue:** `git clone https://github.com/<org>/agda-mcp-server.git` — the one command a fresh teammate copies first is the one that doesn't run as written; nothing else in the doc says what `<org>` is.
**Fix:** Use the real URL (`https://github.com/cliu238/agda-mcp-server.git`).

### IN-03: Installer CLI silently ignores all arguments; minor dead code

**File:** `scripts/team/install-pinned-env.mjs:148, 113`; `scripts/team/clone-fuel-corpora.mjs:201-205`
**Issue:** `scriptMain(argv = process.argv.slice(2), ...)` never reads `argv`, and `install-pinned-env.sh:33` forwards `"$@"` — so `bash install-pinned-env.sh --root /x` (a natural guess, since the sibling `clone-fuel-corpora.mjs` supports `--root`) is silently dropped and clones go to the default root. Also: `clone-fuel-corpora.mjs` `--root` with a missing value silently falls back to the default instead of erroring, and `writeRunPinnedAgdaScript`'s `deps = {}` parameter is unused.
**Fix:** Either reject unknown args with a message ("only AGDA_MCP_FUEL_ROOT is supported"), or support `--root` by passing it through to `cloneAllFuelCorpora`; error on `--root` without a value; drop the unused `deps` param.

### IN-04: Deploy workflow: hardcoded 3-file manifest list, no concurrency group, and `:latest`-based rollout side effects

**File:** `.github/workflows/deploy-ingest.yml:182, 42-44, 114-127`
**Issue:** (a) The tar list names exactly `k8s/deployment.yaml k8s/ingress.yaml k8s/cronjob.yaml` — a future `k8s/*.yaml` addition would build fine locally but silently never deploy (`tar -czf - k8s/*.yaml` would keep the `.template` excluded and remove the drift risk). (b) No `concurrency:` group — two rapid main pushes race `kubectl apply`/`rollout restart` and can fail each other's `rollout status`. (c) With `:latest` + `imagePullPolicy: Always`, the nightly CronJob adopts whatever image the *build* job last pushed, even when the *deploy* job failed after it — and a `workflow_dispatch` from a non-main branch builds a branch-sha tag but still rolls the Deployment onto the old `:latest`. (d) The D-10 verify job's `2/4` grep and per-corpus skip-line greps are deliberate tripwires but will need touching whenever `fuel-corpora.json` changes. All consistent with the locked D-06 "litellm verbatim" choice — recorded, not contested.
**Fix:** Add `concurrency: { group: deploy-ingest, cancel-in-progress: false }`; glob the tar input; optionally deploy the `{{branch}}-<sha>` tag the metadata step already produces (via `kubectl set image`) so the cron and Deployment only ever run deploy-gated images.

### IN-05: Image default CMD is the stdio MCP server that insta-exits in pods; `EXPOSE 4000` vs in-image default port 8787

**File:** `Dockerfile:87-89`
**Issue:** The first live deploy's silent CrashLoopBackOff came exactly from this default CMD (per `k8s/deployment.yaml:77-83`'s postmortem comment). The manifests now all override `command:`, but the footgun is documented only in the manifests, not in the image itself. Also cosmetic: `EXPOSE 4000` while `ingest-server.mjs` defaults to 8787 (the deployment pins 4000 via env, so no functional impact).
**Fix:** Make the default self-documenting, e.g. `CMD ["node", "-e", "console.error('agda-mcp-server image: no default workload. Override command: with scripts/team/ingest-server.mjs or scripts/team/cron-ingest-wrapup.mjs (see k8s/).'); process.exit(64)"]` — or at minimum add a Dockerfile comment beside `CMD` mirroring the deployment.yaml warning.

---

_Reviewed: 2026-07-05T04:00:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
