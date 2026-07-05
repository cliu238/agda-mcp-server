---
phase: 08-pinned-environment-distribution-thin-k8s-deployment
reviewed: 2026-07-05T04:38:22Z
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
  critical: 0
  warning: 0
  info: 7
  total: 7
status: clean
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-05T04:38:22Z (re-review, iteration 2; initial review 2026-07-05T04:00:50Z; WR-12 fix pass, iteration 3, closed 2026-07-05)
**Depth:** standard
**Files Reviewed:** 15
**Status:** clean (0 Critical / 0 Warning open; 7 Info open by policy)

> Frontmatter counts reflect **currently open** findings (0 Critical, 0 Warning, 7 Info).
> Cumulative found across all passes: 1 Critical + 12 Warnings + 7 Info; CR-01 and
> WR-01..WR-11 are verified fixed below; WR-12 (found in re-review) was fixed in the
> capped third iteration — commit `c6e85a0`: conditional scrub (only userinfo-embedding
> origins rewritten; SSH/clean-https origins preserved), transport-respecting fetch
> (origin remote when no token), and failed-fetch tolerance when the pinned SHA already
> resolves locally (`git cat-file -e <sha>^{commit}`); verified by 34/34 tests including
> two new cohort regressions (SSH-origin re-run, clean-https untouched) with the WR-01
> on-disk scrub test still green. IN-01..IN-07 remain open by policy (IN-06/IN-07 are
> accepted residuals of the WR-08 and WR-02/03 fixes, recorded for visibility).

## Narrative Findings (AI reviewer)

## Summary

Re-review after the fix loop (commits 634a15c, 5d87a91, 9fdcb9f, 1bc2188, 34d4a31, 0acfe91, 70a44a7, dfad2d0, bde1d41, efbdaa8). Every one of the 12 addressed findings (CR-01, WR-01..WR-11) was re-verified against the current file state, not the commit messages: the installer's summary/exit contract was traced end to end through `install-pinned-env.sh` (exec → exit-code propagation) and the two new CR-01 tests were confirmed to drive the real `scriptMain`; the Dockerfile ownership restructure was diffed against the pre-fix version and checked for the three contracts the task flagged (npm ci still runs as root — safe under npm 11, which neither de-escalates scripts nor infer-chowns; the BuildKit secret-mount semantics are unchanged, with the `sh -c 'GH_TOKEN=... node ... && chown -R ...'` compound preserving the D-10 fail-at-clone behavior; every heavy write now chowns in its producing layer, leaving only trivially-small root-owned stragglers that nothing writes at runtime). The new clone-fuel-corpora token hygiene was checked against all four SSOT entries (all pinnedRefs are full SHAs, so the explicit-URL fetch is semantically equivalent to the old `fetch origin <sha>` on GitHub), against the walkthrough test's no-op-fake path (unaffected), and against the D-10 verify job's exact grep strings (still match). The WR-10 scrub test now genuinely plants the token-bearing URL in `.git/config` before the production scrub runs — non-vacuous. All three touched test files pass 32/32 under the pinned Node 24 runtime.

One genuine regression was introduced by the WR-01/WR-03 fix (WR-12 below): the exists-branch now unconditionally rewrites `origin` to the https URL and fetches over https, which breaks the documented idempotent re-run for gh-authenticated teammates on the SSH protocol — a cohort that worked before the fix. Two accepted residuals from the fixes are recorded as Info (IN-06, IN-07) so they stay visible.

## Critical Issues

### CR-01: Installer reports success ("done.", exit 0) while fuel-corpus provisioning fails — guaranteed false-green on the default fresh-teammate path

**Status (re-review 2): FIXED** — verified in `scripts/team/install-pinned-env.mjs:194-231`. `scriptMain` now consumes `cloneAllFuelCorpora`'s results, prints the `N/M fuel corpora ready` summary after `npm ci` (deliberately last-on-screen, a reasonable improvement over the suggested pre-`npm ci` placement), lists each failed corpus by key+reason on stderr, prints an instructive PARTIAL message pointing at the credential prerequisite, sets `process.exitCode = 1`, and never prints "done." on a partial install. `install-pinned-env.sh:33` `exec`s node, so the exit code propagates to the documented entry point. `docs/TEAM-ONBOARDING.md` now documents the private-corpora credential prerequisite (lines 23-36) and the two distinct exit-1 modes (lines 102-122). Two new tests (`team-install-pinned-env.test.ts:253-341`) drive the real `scriptMain` through both the all-ok and the exact fresh-teammate no-credential paths, asserting summary text, per-corpus stderr, absence of "done.", and exit code — genuine production-path coverage (the `fuelCorporaJsonPath` deps seam flows through `cloneAllFuelCorpora`'s real read path). Both tests pass under Node 24.

**Original issue (for the record):** `scriptMain()` discarded the return value of `cloneAllFuelCorpora()` — no summary, no exit-code reflection — so a fresh teammate without GitHub credentials got both private corpora silently skipped under minutes of npm output, then `"done."` + exit 0.

## Warnings

### WR-01: Interrupted credentialed clone leaves the token in `.git/config` forever — the idempotent re-run path never re-scrubs

**Status (re-review 2): FIXED** — verified at `scripts/team/clone-fuel-corpora.mjs:145-155`. The exists-branch now re-asserts the clean origin URL via `resolveCloneUrl(entry, deps, null)` as its first action, before the fetch — so the crash-hole closes even if the subsequent fetch fails. The `deps.cloneUrl` seam is preserved. Regression test `team-clone-fuel-corpora.test.ts:278-308` plants a token-bearing origin (simulating the interrupted prior run) and asserts the re-run scrubs it from the real on-disk `.git/config`. See WR-12 for a side effect of making this scrub unconditional.

### WR-02: Token leaks into `ps` argv during clone and is retained verbatim in stored error strings

**Status (re-review 2): FIXED (as scoped)** — the prescribed fix (scrub stored error strings) is implemented at `scripts/team/clone-fuel-corpora.mjs:200-209`: `token` is hoisted to function scope (lines 139-142, correctly gated to `null` for public entries and guarded by `if (token)` so an empty-string token can never trigger the catastrophic `split("")`), and `error.message` is redacted to `***` before storage. Test `team-clone-fuel-corpora.test.ts:367-390` mimics execFileSync's real failure shape and asserts redaction. The optional stronger fix (keeping the token out of argv entirely) was not adopted; that residual — now present on two commands instead of one — is recorded as IN-07.

### WR-03: Private-corpus *update* path has no credential mechanism and no `GIT_TERMINAL_PROMPT=0` — documented "idempotent re-run" hangs on a password prompt or fails

**Status (re-review 2): FIXED** — verified at `scripts/team/clone-fuel-corpora.mjs:131-135` (every git/gh invocation now carries `env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }` — fail fast, never a /dev/tty hang) and lines 162-166 (the re-run fetch goes through an explicit URL, credentialed when a token is available, leaving `.git/config` untouched). Test `team-clone-fuel-corpora.test.ts:310-363` pins the production argv contract (scrub-then-credentialed-fetch) and asserts the prompt-proof env on every invocation. Verified equivalence: all four `scripts/data/fuel-corpora.json` pinnedRefs are full commit SHAs, so `git fetch <url> <sha>` has the same want-negotiation semantics as the old `git fetch origin <sha>` against GitHub. However, the finding's own suggested fallback for non-token setups ("falling back to plain `fetch origin` for public/gh-helper setups") was only partially realized — public corpora fetch fine over the clean https URL, but the gh-credential cohorts are worse off; see WR-12 (new regression).

### WR-04: `.dockerignore` does not exclude the gitignored team-key registry (or `.env*`) — a local `docker build` bakes "Team channel secrets" into the pushed image

**Status (re-review 2): FIXED** — `.dockerignore:15-26` now excludes `scripts/team/data`, `.env`, `.env.*`, `local-only`, `.local-reference`, `tmp`, and `temp` (the last a bonus beyond the prescribed list). Verified no in-image consumer breaks: the ingest Deployment overrides the key path via `AGDA_MCP_TEAM_KEYS_PATH=/etc/agda-mcp-team/team-keys.json` (`k8s/deployment.yaml:104-105`), and nothing committed lives under `scripts/team/data` (`git ls-files` empty). Also verified the `ref/` private-repo mirror referenced in project history no longer exists in the working tree, so no analogous uncovered secret-bearing tree remains. Residual non-secret local junk (`.vscode/`, `.cache/`, `*.tsbuildinfo`, `test/fixtures/agda/_build/`) can still enter a local build — hygiene only, no secrets, not re-flagged.

### WR-05: Final image never executes `agda` — no build-time smoke test

**Status (re-review 2): FIXED** — `Dockerfile:62`: `RUN agda --version && agda --version | grep -qF "Agda version 2.8.0"` in the final stage, after the binary COPY and the git/ca-certificates install. A missing shared library now fails the first `agda --version` (non-zero exec), and a version drift fails the grep — both convert the latent unattended-nightly failure into a build failure, exactly as prescribed.

### WR-06: Hackage index not pinned — `cabal update && cabal install Agda-2.8.0` re-resolves transitive deps on every rebuild

**Status (re-review 2): FIXED** — `Dockerfile:33`: `cabal update 'hackage.haskell.org,2026-07-04T00:00:00Z'` pins the index state to the same date the base-image digests were resolved, with a comment instructing that the timestamp be bumped together with the digest pins. Valid cabal syntax for the cabal 3.x shipped in `haskell:9.10-bookworm`; Agda-2.8.0 predates the timestamp. The transitive solve is now reproducible.

### WR-07: `RUN chown -R` duplicates `/app` (node_modules + build) and all 4 corpus clones into an extra layer

**Status (re-review 2): FIXED** — the post-hoc `RUN chown -R agdamcp:agdamcp /app "$AGDA_MCP_FUEL_ROOT"` layer is gone. Ownership is now fixed in each producing layer: `COPY --chown=2231:2231` for sources (`Dockerfile:86,96`), `npm ci && chown -R ... node_modules` in one RUN (line 94), `npm run build && chown -R ... dist` in one RUN (line 97), and the corpus-clone RUN chains its `chown -R "$AGDA_MCP_FUEL_ROOT"` after the clone in the same layer (line 116). Contract checks all hold: (a) `npm ci` still runs as root (USER agdamcp only at line 118) — safe under npm 11, which runs lifecycle scripts as the invoking user and does not infer-chown, so the explicit in-layer chown is exactly right; (b) the BuildKit secret mount is read as root, and the `node ... && chown -R` compound means the uncredentialed D-10 build still fails at the clone step exactly as before (exit 1 short-circuits the `&&`); (c) `/app` itself is pre-created 2231-owned (line 70-72) before WORKDIR, so the cron judge's runtime `/app/.agda-mcp/team/` writes as uid 2231 still work, and the in-pod vitest cache writes land in the 2231-owned `node_modules`. Only trivially-small build artifacts outside `dist`/`node_modules` could remain root-owned; nothing writes them at runtime. The duplicate multi-GB layer is eliminated.

### WR-08: Deploy SSH: `StrictHostKeyChecking=no` on both hops, and the *inner* `-A` forwards the CI deploy agent onto k8slgn unnecessarily

**Status (re-review 2): FIXED (with a recorded residual — see IN-06)** — `.github/workflows/deploy-ingest.yml:198-199`: the inner `-A` is dropped (the shared login node no longer receives a live signing oracle; verified the inner ssh still authenticates fine, since it consumes the agent forwarded by the outer `-A` — dropping the flag only stops forwarding *onward* to k8slgn), and both hops moved from `=no` to `accept-new`. On the inner hop this is real pinning (dslogin01's `known_hosts` persists across runs, and the SKILL.md interactive pattern already proves `accept-new` works on dslogin01's ssh client). On the outer hop, the ephemeral runner makes `accept-new` per-run TOFU — materially equivalent to `=no` against a first-contact MITM; the fix's own comment acknowledges this. The stronger known_hosts-pinning fix was not adopted; residual recorded as IN-06.

### WR-09: Generated `run-pinned-agda.sh` embeds the Agda path unescaped inside double quotes

**Status (re-review 2): FIXED** — `scripts/team/install-pinned-env.mjs:106-112` now single-quotes with the standard `'\''` splice (`replaceAll("'", "'\\''")` — verified the replacement string contains no `$`-pattern characters, so `replaceAll`'s special replacement syntax cannot misfire), and the comment now correctly states that `AGDA_BIN` IS teammate-supplied free text. Tests are genuine: `team-install-pinned-env.test.ts:100-105` pins the escaped rendering for `$`, backtick, `"`, `\`, and embedded `'`; lines 107-119 actually **execute** the generated wrapper via a real bash subprocess against a fake agda living in a directory containing `$`, a space, and a single quote, asserting verbatim arg passthrough. Both pass.

### WR-10: Token-scrub unit test is vacuous — the `deps.cloneUrl` override means the token never enters `.git/config`

**Status (re-review 2): FIXED** — `resolveCloneUrl` is now exported with a WR-10 note (`clone-fuel-corpora.mjs:76-87`) and directly pinned in `team-clone-fuel-corpora.test.ts:205-215` (x-access-token form, plain form, and seam precedence). The scrub test (lines 217-274) was rebuilt: no `cloneUrl` seam; a spy intercepts only the network-bound `git clone`, clones the local fixture, then **persists the production token-bearing URL as origin** — byte-for-byte what real git leaves in `.git/config` — before the production scrub runs against real git. The final `.git/config` negative assertions are now non-vacuous (deleting the scrub turns them red), and assertion (a) pins the production argv URL form, (b) pins scrub immediacy. Verified passing.

### WR-11: Runbook secret-sync recipes: predictable world-readable `/tmp` staging file on a shared login host, and the GHCR PAT in remote-command argv

**Status (re-review 2): FIXED** — `docs/DEPLOY-OPERATIONS.md`: the team-keys sync (lines 126-144) now flows pipe-to-stdin end to end (`base64 -d | kubectl create secret generic --from-file=team-keys.json=/dev/stdin --dry-run=client -o yaml | kubectl apply -f -` — each pipeline stage's stdin verified distinct and correct), with an explicit rule for any future staging file (umask 077 + mktemp). The GHCR rotation (lines 65-102) builds the `.dockerconfigjson` payload locally with printf/base64 and ships only the sealed YAML manifest over the ssh stdin pattern — the PAT never appears in remote argv (classic PATs are alphanumeric, so the printf-JSON embedding is safe), and the doc explicitly labels `$DCJ` itself secret-equivalent. A general "no secret material at predictable paths, no secret values in remote argv" rule was added to the section header (lines 36-39). The (hashed-content) team-keys blob still transits remote argv as before — unchanged from the original recipe and outside this finding's flagged vectors.

### WR-12 (NEW, regression from the WR-01/WR-03 fix): Exists-branch unconditionally rewrites `origin` to https and fetches over https — breaking the documented idempotent re-run for gh-over-SSH teammates and falsely reporting fully-provisioned corpora as NOT ready

**File:** `scripts/team/clone-fuel-corpora.mjs:145-166` (with `docs/TEAM-ONBOARDING.md:118-120` and `install-pinned-env.mjs:218-224`)
**Issue:** The documented private-corpus credential prerequisite is "`gh auth login` **or** `GH_TOKEN`" (TEAM-ONBOARDING lines 29-31), and `gh auth login` lets teammates pick the SSH protocol. For that cohort, the fresh install works: `gh repo clone` creates the corpus with an **SSH origin** and clones via ssh-agent. Pre-fix, the re-run path (`git fetch origin <sha>`) also worked — over that same SSH remote. Post-fix, every re-run now (1) **clobbers the working SSH origin** with the https URL (the WR-01 re-scrub is unconditional, even though an SSH URL cannot contain the x-access-token credential the scrub exists to remove), then (2) fetches via the explicit **https** URL with no token and `GIT_TERMINAL_PROMPT=0` → fast failure → `clone-failed` → the installer reports `corpus NOT ready` and exits 1 — **for a corpus that is fully present and checked out at its pinned SHA**. The remediation text then tells the teammate to run `gh auth login`, which they already did. Net effect: TEAM-ONBOARDING's "re-runs are idempotent and only fetch/update corpora that already cloned" (line 119) is now false for this cohort, permanently (every re-run exits 1 until they mint a token or run `gh auth setup-git`), and their repo's remote config is actively rewritten to a form that is broken for them. (The gh-authenticated-but-no-helper https cohort also lands in `clone-failed`, but that cohort was already broken pre-fix — WR-03's hang — so for them this is an improvement, hang → fast fail, not a regression.) The Docker build path is unaffected (destDirs never pre-exist in-image). No test covers a re-run whose existing origin is an SSH URL.
**Fix:** Two small changes that preserve WR-01's crash-hole closure and WR-03's no-hang guarantee:
```javascript
if (existsSync(destDir)) {
  // WR-01 re-scrub — but only when origin actually embeds a credential:
  // the interrupted-run leak is ALWAYS the https x-access-token form; an
  // SSH or already-clean origin must be left alone (gh-SSH teammates).
  const origin = execFile("git", ["-C", destDir, "remote", "get-url", "origin"], gitOpts)
    .toString().trim();
  if (/^https?:\/\/[^/]*@/.test(origin)) {
    execFile("git", ["-C", destDir, "remote", "set-url", "origin",
      resolveCloneUrl(entry, deps, null)], gitOpts);
  }
  // Tolerate a failed update-fetch when the pin is already local: the
  // corpus IS ready; only a pinnedRef bump genuinely needs the network.
  try {
    execFile("git", ["-C", destDir, "fetch",
      token ? resolveCloneUrl(entry, deps, token) : origin, entry.pinnedRef], gitOpts);
  } catch (fetchError) {
    execFile("git", ["-C", destDir, "cat-file", "-e", `${entry.pinnedRef}^{commit}`], gitOpts);
    // object present locally -> proceed to checkout; else rethrow
  }
}
```
(Any equivalent shape works — the two load-bearing properties are: never rewrite a credential-free origin, and never report `clone-failed` for a corpus whose pinnedRef is already resolvable locally.) Add a regression test: pre-clone the fixture, set origin to an `ssh://`-style URL, re-run with no token, assert `ok: true` and origin unchanged.

## Info

### IN-01: Runbook misquotes the onboarding doc's tag-resolution command (and its own variant is less robust)

**Status (re-review 2): still open (by policy).** `docs/DEPLOY-OPERATIONS.md:517,528` still uses/attributes `git tag --sort=-v:refname | head -1`; `docs/TEAM-ONBOARDING.md:60` still documents `git tag --list 'v*' | sort -V | tail -1`.

### IN-02: Onboarding clone command ships a literal `<org>` placeholder in a copy-paste block

**Status (re-review 2): still open (by policy).** `docs/TEAM-ONBOARDING.md:57`.

### IN-03: Installer CLI silently ignores all arguments; minor dead code

**Status (re-review 2): still open (by policy).** `scriptMain(argv...)` in `install-pinned-env.mjs:163` still never reads `argv` (the `.sh` still forwards `"$@"`); `clone-fuel-corpora.mjs:246-250` still silently falls back on `--root` with a missing value; `writeRunPinnedAgdaScript`'s `deps` param still unused.

### IN-04: Deploy workflow: hardcoded 3-file manifest list, no concurrency group, and `:latest`-based rollout side effects

**Status (re-review 2): still open (by policy).** `deploy-ingest.yml:182` (tar list), no `concurrency:` block, `:latest` rollout semantics unchanged. The D-10 verify-job grep tripwires now also cover the scriptMain exit-code contract (comment lines 84-108 updated by the fixes — verified the grepped strings still exactly match the script's output, including the `--root`-derived `/opt/agda-mcp-fuel` path).

### IN-05: Image default CMD is the stdio MCP server that insta-exits in pods; `EXPOSE 4000` vs in-image default port 8787

**Status (re-review 2): still open (by policy).** `Dockerfile:120-122` unchanged.

### IN-06 (NEW): WR-08 residual — outer-hop host authenticity is per-run TOFU on the ephemeral runner (documented, accepted)

**File:** `.github/workflows/deploy-ingest.yml:185-198`
**Issue:** `accept-new` on the runner→dslogin01 hop provides no protection against a first-contact MITM because the runner's `known_hosts` starts empty every run — and the outer `-A` (necessarily retained) means such a MITM still gains a deploy-key signing oracle for the session. The fix's in-file comment explicitly acknowledges and accepts this ("on the ephemeral runner it is per-run TOFU — still never worse than =no"), matching the SKILL.md reference pattern. Recorded so the accepted risk stays visible, not contested.
**Fix (when revisited):** capture `ssh-keyscan` output for both hosts once into a `K8S_KNOWN_HOSTS` secret (or repo file), write it to `~/.ssh/known_hosts` in the key-setup step, and use default strict checking.

### IN-07 (NEW): WR-02/WR-03 residual — the private-corpus token now appears in `ps`-visible argv on two commands (clone and re-run fetch)

**File:** `scripts/team/clone-fuel-corpora.mjs:164,172-173`
**Issue:** The WR-03 fix's explicit credentialed fetch (`git fetch https://x-access-token:<token>@... <sha>`) adds a second argv-exposure site for the token alongside the pre-existing clone argv — visible via `ps` to other local users on a multi-user machine for the command's duration. Same accepted vector WR-02 originally described (its prescribed error-string scrub is implemented and covers fetch failures too, since `token` is function-scoped); recorded so the widened surface stays visible for a future hardening pass.
**Fix (when revisited):** pass the credential out-of-argv for both commands, e.g. `git -c http.extraHeader=` via `GIT_CONFIG_*` env vars or a one-shot `GIT_ASKPASS`; this would also eliminate the WR-01 scrub machinery entirely.

---

## Re-review verification record

| Finding | Status | Verified how |
|---|---|---|
| CR-01 | fixed | Code path traced (`scriptMain` → summary/exit → `.sh` exec propagation); both new tests drive real `scriptMain`; pass on Node 24 |
| WR-01 | fixed | Re-scrub is first action in exists-branch; on-disk regression test non-vacuous |
| WR-02 | fixed (residual → IN-07) | Catch-block redaction + hoisted/gated token; redaction test mimics real failure shape |
| WR-03 | fixed (side effect → WR-12) | `GIT_TERMINAL_PROMPT=0` on all invocations; explicit-URL credentialed fetch; argv-contract test; SHA-pin equivalence checked against SSOT |
| WR-04 | fixed | All secret-classified gitignore trees now dockerignored; no in-image consumer breaks; `ref/` mirror confirmed gone |
| WR-05 | fixed | Build-time exec + version grep in final stage |
| WR-06 | fixed | Index-state pin `2026-07-04T00:00:00Z`, valid cabal syntax, bump instruction present |
| WR-07 | fixed | Pre/post Dockerfile diffed; npm-ci-as-root, secret-mount, fail-at-clone, and 2231-ownership contracts all verified intact; duplicate layer gone |
| WR-08 | fixed (residual → IN-06) | Inner `-A` dropped (auth path verified unaffected); `accept-new` both hops; dslogin01 client compatibility proven by SKILL.md precedent |
| WR-09 | fixed | POSIX single-quote splice verified (incl. `replaceAll` replacement-pattern safety); wrapper executed for real against hostile path in test |
| WR-10 | fixed | `resolveCloneUrl` exported + pinned; scrub test plants token URL in real `.git/config` before production scrub |
| WR-11 | fixed | No staging file (stdin end-to-end, pipeline stdin semantics verified); PAT never in remote argv; macOS `base64 -i` correct for the local step |
| WR-12 | fixed (iteration 3, `c6e85a0`) | Conditional scrub + transport-respecting fetch + pin-satisfied fetch tolerance; 34/34 incl. 2 new cohort regression tests; WR-01 scrub test still green |
| IN-01..IN-05 | still open (by policy) | Each re-confirmed present at cited locations |
| IN-06, IN-07 | NEW — open (accepted residuals) | See above |

Tests: `test/unit/tools/team-clone-fuel-corpora.test.ts`, `test/unit/tools/team-install-pinned-env.test.ts`, `test/integration/team/team-onboarding-walkthrough.test.ts` — 3 files, 32/32 passed under Node 24.16.0 (failures under a stray Node 22 shell are the version gates working as designed, not defects).

---

_Reviewed: 2026-07-05T04:38:22Z (re-review pass 2)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
