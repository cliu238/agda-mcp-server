# Phase 11: Auto-Sync Productionization - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 13 (6 new `scripts/sync/*.mjs`, 5 new `test/unit/tools/sync-*.test.ts`, 1 new `docs/UPSTREAM-SYNC-CARRIER.md`, 1 edit to `.agents/skills/upstream-sync/SKILL.md` Section 7) + 1 generated, uncommitted artifact (the `.plist`)
**Analogs found:** 13 / 14 (every file has at least a partial analog; only the macOS-notification half of `carrier-notify.mjs` and the plist's own concrete on-disk form have no in-repo committed precedent — the plist's *template* is already given verbatim in RESEARCH.md)

This phase's new code all lives in `scripts/` (`.mjs`, ESM, no build step) and `test/unit/tools/` (flat convention already used for every non-MCP `scripts/*.mjs` sibling) — it does not touch `src/`. The three richest in-repo analogs are `scripts/team/cron-ingest-wrapup.mjs` (unattended CLI wrapper shape), `scripts/dogfood/dogfood-run.mjs` (the **exact** process-group timeout-kill mechanism RESEARCH.md's Pattern 2 describes — already shipped here, not just verified live this session), and `scripts/team/install-pinned-env.{mjs,sh}` (verify-and-instruct installer, D-03-style loud partial failure).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/sync/run-upstream-sync.mjs` | controller (CLI orchestrator) | batch + process-spawn (event-driven signal/timeout handling) | `scripts/team/cron-ingest-wrapup.mjs` (CLI/DI/summary shape) + `scripts/dogfood/dogfood-run.mjs` (spawn+timeout-kill mechanics) | exact (composite of two exact matches) |
| `scripts/sync/interval-guard.mjs` | utility (pure fn + tiny state file) | transform + file-I/O | none strong — RESEARCH.md Code Examples gives the complete function | none / research-provided |
| `scripts/sync/preflight-assertions.mjs` | middleware (guard/assertion layer) | request-response (queries external tools, returns ok/detail) | `scripts/team/install-pinned-env.mjs` (`locateAgdaBinary`, `getAgdaVersion`, `versionSatisfies`) + `scripts/queue/mirror-github.mjs` (`isGhAvailable`) | exact |
| `scripts/sync/carrier-notify.mjs` | service (dual-channel notifier) | event-driven / pub-sub (publish to 2 channels on failure) | `scripts/queue/mirror-github.mjs` (`gh issue create` half only) | role-match (gh half exact; osascript half has no analog) |
| `scripts/sync/install-launchd-carrier.mjs` | config (installer: resolves paths, renders plist, clones, bootstraps) | file-I/O + CRUD (creates clone/state) | `scripts/team/install-pinned-env.{mjs,sh}` (installer shape) + `scripts/team/clone-fuel-corpora.mjs` (`cloneFuelCorpus`, the dedicated-clone half) | exact |
| `scripts/sync/uninstall-launchd-carrier.mjs` | config (uninstaller) | file-I/O | `scripts/team/install-pinned-env.mjs` (inverse operation, weak — no uninstall counterpart exists in-repo) | partial |
| `~/Library/LaunchAgents/com.cliu238.agda-mcp-server.upstream-sync.plist` (generated, not committed) | config (data artifact) | config | none committed in-repo; RESEARCH.md Pattern 1 gives the exact skeleton, cross-checked against the local (uncommitted) `com.eric.llm-proxy.plist` | none / research-provided |
| `test/unit/tools/sync-interval-guard.test.ts` | test | transform (pure fn) | `test/unit/tools/team-install-pinned-env.test.ts` (`versionSatisfies`/`checkNodeVersion` pure-fn test style) | role-match |
| `test/unit/tools/sync-preflight-assertions.test.ts` | test | request-response (DI-stubbed) | `test/unit/tools/team-install-pinned-env.test.ts` (`locateAgdaBinary`/`getAgdaVersion` DI-stub tests) | exact |
| `test/unit/tools/sync-carrier-notify.test.ts` | test | event-driven (DI-stubbed) | `test/unit/tools/team-cron-ingest-wrapup.test.ts` (`writeBackQueue` execFileSync-spy tests) | exact |
| `test/unit/tools/sync-run-upstream-sync.test.ts` | test | process-spawn (real subprocess, real timeout+kill) | `test/unit/tools/dogfood-run-report-checkpoint.test.ts` (`killGroup`/`spawnProxy`/`waitFor`, real detached-process-group signal test) | exact |
| `test/unit/tools/sync-install-launchd-carrier.test.ts` | test | file-I/O (plist generation + `plutil -lint`) | `test/unit/tools/team-install-pinned-env.test.ts` (installer scriptMain tests, temp-repoRoot pattern) | role-match |
| Synthetic "1 commit ahead" fixture (SYNC-02 bookkeeping test, file TBD by planner — likely inline in `sync-run-upstream-sync.test.ts` or a new `test/fixtures/sync-upstream-fixture.ts`) | test fixture | file-I/O (real local git repo) | `test/unit/tools/team-clone-fuel-corpora.test.ts` (`createBareFixtureRepo`) | exact |
| `.agents/skills/upstream-sync/SKILL.md` (Section 7 edit only) | config (policy doc) | transform (doc content) | itself — Section 7 lines 153-170 (in-place upgrade, not a new-file pattern) | n/a (edit, not new) |
| `docs/UPSTREAM-SYNC-CARRIER.md` | config (operational runbook doc) | n/a | `docs/DEPLOY-OPERATIONS.md` (house style for maintainer runbooks) | exact |

## Pattern Assignments

### `scripts/sync/run-upstream-sync.mjs` (controller, batch + process-spawn)

**Analog 1 (CLI/DI/summary shape):** `scripts/team/cron-ingest-wrapup.mjs`

**File header convention** (lines 1-54, esp. 1-2 and 47-54) — every `scripts/*.mjs` in this repo opens with an MIT-license line, then a long WHY-comment block (design rationale, cited decision IDs), then a `// Run with: ...` line stating the exact invocation and WHY (tsx vs plain node — see Shared Patterns below, this is a load-bearing decision for the new files):
```javascript
// MIT License — see LICENSE
//
// TEAM-04 (Task 2): the unattended cron judge. Discovers archives
// staged by 07-03's ingest-server.mjs under ...
// ...
// Run with: npx tsx scripts/team/cron-ingest-wrapup.mjs [--no-push]
//   [--rerun-n <N>] [--storage-dir <path>] [--queue-path <path>]
// (NOT plain `node` — this script's src/ + test/ imports use
// .js-suffixed specifiers pointing at sibling .ts files...)
```

**Imports** (lines 56-69):
```javascript
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";
import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
```

**CLI argv parsing** (lines 603-622) — flat `argv.indexOf("--flag")` lookups, env-var fallback, throw on invalid value:
```javascript
function parseCronArgv(argv) {
  const noPush = argv.includes("--no-push");
  const rerunNFlagIndex = argv.indexOf("--rerun-n");
  const rerunNRaw =
    rerunNFlagIndex !== -1 ? argv[rerunNFlagIndex + 1] : (process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? "3");
  const rerunN = Number(rerunNRaw);
  if (!Number.isInteger(rerunN) || rerunN < 1) {
    throw new Error(`--rerun-n / AGDA_MCP_DOGFOOD_RERUN_N must be a positive integer, got "${rerunNRaw}"`);
  }
  // ...
}
```

**scriptMain shape** (lines 645-705) — persist a per-run JSON summary under a gitignored `.agda-mcp/...` dir, print a one-line stdout digest (nobody is watching an unattended run), set `process.exitCode = 1` on any failure signal, gate real execution behind `isMainModule`:
```javascript
export async function scriptMain(argv = process.argv.slice(2), options = {}) {
  // ... discover, loop with per-item try/catch, aggregate stats ...
  const summaryDir = join(SERVER_REPO_ROOT, ".agda-mcp", "team", "cron-runs");
  mkdirSync(summaryDir, { recursive: true });
  const summaryPath = join(summaryDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFileAtomic(summaryPath, JSON.stringify(summary, null, 2));
  process.stdout.write(`[cron-ingest-wrapup] processed ${summary.totalArchives} archive(s)...\n`);
  if (summary.errors > 0 /* ... */) {
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```
**Keep:** the DI-via-`options.deps` shape, per-step try/catch isolation, non-git JSON summary + one-line stdout digest, non-zero exit on failure, `isMainModule` gate.
**Change:** target dir becomes `~/.agda-mcp/upstream-sync/carrier.log` + `state.json` (HOME-relative, per RESEARCH.md's Recommended Project Structure — NOT `.agda-mcp/` under `SERVER_REPO_ROOT` like this analog, since D-04's heartbeat/log must survive independently of any single checkout).

**Analog 2 (the exact spawn+timeout-kill mechanism — this is a shipped, in-repo pattern, not a novel one):** `scripts/dogfood/dogfood-run.mjs`

RESEARCH.md's Pattern 2 (detached process-group kill) frames this as newly-verified-this-session, but **this exact mechanism already ships in this codebase**. Use it as the primary template over RESEARCH.md's own code example.

**Spawn options — `detached: true`** (lines 75-99, comment 58-73 explains why):
```javascript
export function buildDogfoodChildOptions({ corpusRoot, extraEnv = {} }) {
  const built = buildHarnessServerParameters({ /* ... */ });
  return {
    command: built.command,
    args: testChildEntry ? [testChildEntry] : built.args,
    cwd: built.cwd,
    env: built.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  };
}
```

**Process-group kill** (lines 213-243) — copy this near-verbatim for `run-upstream-sync.mjs`'s hard-timeout kill:
```javascript
/**
 * WR-09: signal the ENTIRE process group `childProc` leads, not just
 * its own PID... Guards for a missing/never-assigned pid (never signal
 * `-undefined`/`-NaN`) and swallows ESRCH (group already gone)...
 */
function killChildGroup(childProc, signal) {
  if (typeof childProc.pid !== "number") {
    return false;
  }
  try {
    process.kill(-childProc.pid, signal);
    return true;
  } catch {
    return false; // ESRCH — group already gone.
  }
}
```

**Pure exit-code decision table** (lines 200-211) — mirror this shape for deciding carrier success/failure from `claude -p`'s parsed JSON result + timeout/kill state (keep it a separately-exported, separately-unit-tested pure function, exactly like this one):
```javascript
export function computeProxyExitCode({ childExitCode, childSignalCode, childFailed, proxyKilledChild }) {
  if (typeof childExitCode === "number") return childExitCode;
  if (childSignalCode != null) {
    return proxyKilledChild && !childFailed ? 0 : 1;
  }
  return 1; // both null: terminal state never actually observed -> always a failure
}
```
**Keep:** `detached: true` + negative-PID `process.kill(-pid, signal)`, the pid-type guard, the ESRCH swallow, the separately-exported pure decision-table function.
**Change:** the target command is `claude -p "/upstream-sync" --dangerously-skip-permissions --output-format json` (per D-06/RESEARCH.md's verified invocation) instead of `dist/index.js`; add the SIGTERM-then-SIGKILL-after-grace escalation timer RESEARCH.md's own Pattern 2 code example shows (this repo's two existing kill helpers — this one and `src/agda/agda-process-spawn.ts`'s `terminateAgdaProcess`, lines 46-70 there — both already do a SIGTERM-then-timed-SIGKILL escalation with an `unref()`'d timer; reuse that shape, not just the single-signal `killChildGroup`).

---

### `scripts/sync/preflight-assertions.mjs` (middleware/guard, request-response)

**Analog:** `scripts/team/install-pinned-env.mjs` (D-03's own "verify-and-instruct, never force" precedent this codebase already established) + `scripts/queue/mirror-github.mjs`

**Never-throw probe pattern** (`install-pinned-env.mjs` lines 57-68 and 75-84):
```javascript
export function locateAgdaBinary(deps = {}) {
  if (process.env.AGDA_BIN) return process.env.AGDA_BIN;
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    const stdout = execFile("which", ["agda"], { stdio: "pipe", shell: false }).toString();
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
```

**Exact-match / graceful-false comparison** (lines 90-92) — never throws on `null`/`undefined`:
```javascript
export function versionSatisfies(detected, pinned = PINNED_AGDA_VERSION) {
  return typeof detected === "string" && detected.trim() === pinned.trim();
}
```

**Second analog — `gh auth status` probe**, `scripts/queue/mirror-github.mjs` lines 56-75 (RESEARCH.md's own `assertGhAuth`/`assertClaudeAuth` code examples, lines 424-452 of RESEARCH.md, already follow this exact shape):
```javascript
export function isGhAvailable(options = {}) {
  const execFile = options.deps?.execFileSync ?? execFileSync;
  try {
    execFile("gh", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, shell: false });
    execFile("gh", ["auth", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000, shell: false });
    return true;
  } catch {
    return false;
  }
}
```
**Keep:** `deps.execFileSync ?? execFileSync` DI seam, `{ ok, detail }`-shaped or boolean-return never-throw probes, `timeout` on every probe subprocess call.
**Change:** D-03 requires each assertion to be independently checkable (`assertAgdaPresent`, `assertNode24Present`, `assertGhAuth`, `assertClaudeAuth`, `assertCleanSyncClone`) and the CALLER (`run-upstream-sync.mjs`) must treat ANY failure as loud-carrier-failure (D-05 notify) — unlike `mirrorEntry`'s permissive "degrade to skip" posture, this is an assert-or-abort gate, not a best-effort probe.

**Sync-clone "assert clean, never force-reset" half — Analog:** `scripts/team/clone-fuel-corpora.mjs` `cloneFuelCorpus` (lines 132-218+), used for the git mechanics only:
```javascript
const gitOpts = {
  stdio: "pipe",
  shell: false,
  // GIT_TERMINAL_PROMPT=0 on every git/gh invocation: a credential-less
  // private fetch/clone must fail fast, never hang on an interactive
  // username/password prompt — git prompts on /dev/tty directly, which
  // stdio:"pipe" does NOT suppress.
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
};
```
**Keep:** `GIT_TERMINAL_PROMPT: "0"` on every git invocation (critical — without this, an unattended fetch can hang forever on a credential prompt instead of failing fast), `shell: false`, argv-array git calls, `existsSync(destDir)` branch structure.
**Change (important divergence, flag to planner):** `cloneFuelCorpus` deliberately **never throws** and returns `{ ok: false, reason }` per-entry, because one bad corpus in a batch of N must not sink the rest. D-03's sync-clone assertion is the **opposite** posture: this is the single make-or-break clone, so an unclean/wrong-branch/mid-merge state must be a loud, thrown/asserted failure (per the Common Pitfalls #5 in RESEARCH.md: never auto-heal, never silently skip) — reuse the git-subprocess mechanics, not the silent-degrade error contract.

---

### `scripts/sync/carrier-notify.mjs` (service, event-driven dual-channel)

**Analog (gh-issue channel only):** `scripts/queue/mirror-github.mjs` lines 144-201

**Dry-run-first gate, then create with parsed-URL fallback** — note the load-bearing ordering (no subprocess call happens before the eligibility/dry-run checks) and the loud-throw-on-unparseable-output discipline:
```javascript
export function mirrorEntry(entry, options = {}) {
  const execFile = options.deps?.execFileSync ?? execFileSync;
  // ... eligibility check returns early, no subprocess call yet ...
  if (options.execute !== true) {
    return { skipped: true, reason: "dry-run", /* ... */ };
  }
  if (!isGhAvailable(options)) {
    return { skipped: true, reason: "gh-unavailable" };
  }
  const stdout = execFile("gh", ["issue", "create", "--title", entry.title, "--body", body], {
    encoding: "utf8", timeout: 15000, shell: false,
  });
  const trimmed = String(stdout).trim();
  const match = /\/issues\/(\d+)\s*$/.exec(trimmed);
  if (!match) {
    // gh issue create has no --json flag; never guess an issue number —
    // throw loudly instead of silently misassigning the backlink.
    throw new Error(`mirrorEntry: could not parse an issue number from "gh issue create" output: ${JSON.stringify(trimmed)}`);
  }
  return { created: true, githubIssue: Number(match[1]) };
}
```
**Keep:** `execFileSync("gh", ["issue", "create", "--title", ..., "--body", ...], { shell: false, timeout: ... })`, the loud-throw-on-unparseable-URL discipline, `deps.execFileSync` DI seam.
**Change:** D-05 wants this to always run on carrier failure (no dry-run flag/gate — this is unconditionally the failure path), then chain to the second channel (`osascript`) regardless of whether the `gh issue create` call itself succeeded or failed (never let a `gh` failure suppress the local notification — the two channels are independent, not sequential-gated).

**osascript channel — no in-repo analog.** RESEARCH.md's Don't-Hand-Roll table and Sources section confirm `osascript -e 'display notification ...'` was verified live this session but has zero prior committed usage in this repo. Use RESEARCH.md's verification note directly (no code example given there beyond "executes successfully, exit 0"); wrap it with the same `deps.execFileSync ?? execFileSync` + `shell: false` + never-throw-outward convention as every other subprocess call in this codebase (see Shared Patterns).

---

### `scripts/sync/install-launchd-carrier.mjs` (config, file-I/O + CRUD)

**Analog 1 (installer shape, D-03 verify-and-instruct, loud partial-failure):** `scripts/team/install-pinned-env.mjs`

**Template-generation + safe-quoting for a generated script** (lines 106-126) — same shape needed for rendering the plist's XML values from resolved absolute paths:
```javascript
export function generateRunPinnedAgdaScript(resolvedAgdaPath) {
  const singleQuoted = `'${resolvedAgdaPath.replaceAll("'", `'\\''`)}'`;
  return `#!/usr/bin/env bash\nset -euo pipefail\nexec ${singleQuoted} "$@"\n`;
}

export function writeRunPinnedAgdaScript(repoRoot, resolvedAgdaPath, deps = {}) {
  const scriptPath = join(repoRoot, "tooling", "scripts", "run-pinned-agda.sh");
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, generateRunPinnedAgdaScript(resolvedAgdaPath));
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}
```

**Loud partial-install (CR-01), never a false-green "done."** (lines 172-249, condensed):
```javascript
export function scriptMain(argv = process.argv.slice(2), deps = {}) {
  const nodeCheck = checkNodeVersion(deps);
  if (!nodeCheck.ok) {
    process.stderr.write(`install-pinned-env: detected Node ${nodeCheck.detected}, but Node >= 24 is required. ...\n`);
    process.exitCode = 1;
    return;
  }
  // ... locate+verify Agda, same verify-and-instruct pattern, early return + exit 1 on mismatch ...
  // ... write artifact, do the real work ...
  if (okCount < cloneResults.length) {
    // ... names every failure, exitCode = 1 ...
    return;
  }
  process.stdout.write("\ninstall-pinned-env: done.\n" + "Next steps: ...\n");
}
```
**Keep:** verify-THEN-instruct-THEN-exit-1 (never force-install/auto-fix), the "done." success line is the LAST thing printed and gated on every sub-check passing, `deps.repoRoot` override seam for tests.
**Change:** this installer must additionally render + write the launchd `.plist` (new logic, no in-repo XML-templating analog beyond RESEARCH.md's Pattern 1 skeleton) and run `launchctl bootstrap` (new — `execFileSync("launchctl", ["bootstrap", "gui/<uid>", plistPath], ...)`, same DI/shell:false convention).

**Analog 2 (the dedicated-clone creation step):** `scripts/team/clone-fuel-corpora.mjs` `cloneFuelCorpus` — see excerpt and keep/change notes already given under `preflight-assertions.mjs` above (the clone-creation half of this function belongs to the installer — one-time, D-02 — while the fetch+assert-clean half belongs to the wrapper's own preflight, run every invocation; RESEARCH.md's Architectural Responsibility Map row "Sync-clone lifecycle" makes this split explicit).

**Plist template** — no committed in-repo analog exists (the only real-world precedent, `~/Library/LaunchAgents/com.eric.llm-proxy.plist`, lives outside any repo and is unversioned). Use RESEARCH.md's Pattern 1 code block verbatim as the template source (Architecture Patterns section, "Example (plist skeleton)"):
```xml
<key>ProgramArguments</key>
<array>
    <!-- ABSOLUTE path, resolved by the installer at install time via `which node`
         launchd does NOT do PATH lookup for ProgramArguments[0]. -->
    <string>/Users/eric/.local/share/mise/installs/node/24/bin/node</string>
    <string>/Users/eric/projects6/agda-mcp-server/scripts/sync/run-upstream-sync.mjs</string>
</array>
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>0</integer>
</dict>
```

**Plist validation — Analog:** RESEARCH.md's own `lintPlist` code example (Code Examples section), itself following this codebase's standard `deps.execFileSync ?? execFileSync` shape:
```javascript
export function lintPlist(path, deps = {}) {
  const execFile = deps.execFileSync ?? execFileSync;
  try {
    execFile("plutil", ["-lint", path], { stdio: "pipe" }); // exit 0 = OK
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.stdout?.toString() ?? String(err) };
  }
}
```

---

### `scripts/sync/uninstall-launchd-carrier.mjs` (config, file-I/O)

**No strong analog** — no existing `scripts/team/*` file has an uninstall counterpart. Structurally this is the smallest of the six new files: `execFileSync("launchctl", ["bootout", "gui/<uid>/<label>"], { shell: false })` then delete the plist file. Follow the same `deps.execFileSync ?? execFileSync` DI seam and `isMainModule` CLI gate as every other file in this phase (see Shared Patterns) even though there is no single file to copy the whole shape from.

---

### Test files

**Primary analog for DI-stubbed unit tests:** `test/unit/tools/team-install-pinned-env.test.ts` (496 lines, read in full)

**Temp-dir + env-var helpers** (lines 44-66) — reuse verbatim for every new `sync-*.test.ts`:
```typescript
let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const original = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
}
```

**DI-stubbed execFileSync test style** (lines 141-172) — exactly the shape for `sync-preflight-assertions.test.ts`:
```typescript
test("locateAgdaBinary falls back to `which agda` and returns null on non-zero exit", () => {
  withEnv("AGDA_BIN", undefined, () => {
    const found = locateAgdaBinary({ execFileSync: () => Buffer.from("/usr/local/bin/agda\n") });
    expect(found).toBe("/usr/local/bin/agda");
    const missing = locateAgdaBinary({ execFileSync: () => { throw new Error("not found"); } });
    expect(missing).toBeNull();
  });
});
```

**stdout/stderr-capturing scriptMain-runner helper** (lines 230-254) — reuse for `sync-run-upstream-sync.test.ts`'s and `sync-install-launchd-carrier.test.ts`'s CLI-level tests:
```typescript
function runScriptMainCapturing(deps: Record<string, unknown>, argv: string[] = []): { stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string) => { stdout += chunk; return true; }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => { stderr += chunk; return true; }) as typeof process.stderr.write;
  try {
    scriptMain(argv, deps);
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
  return { stdout, stderr };
}
```

**execFileSync call-order/args assertion style** (`test/unit/tools/team-cron-ingest-wrapup.test.ts`, `writeBackQueue` tests, lines 788-874) — the closest analog for `sync-carrier-notify.test.ts`'s and any git-subprocess assertion in `sync-preflight-assertions.test.ts`:
```typescript
test("writeBackQueue: filedCount > 0 and no --no-push calls execFileSync exactly 3 times in order (add, commit, push), each with shell:false and cwd:SERVER_REPO_ROOT", () => {
  const execFileSpy = vi.fn((..._args: any[]) => "");
  const result = writeBackQueue({ queueJsonPath, noPush: false, filedCount: 2, deps: { execFileSync: execFileSpy } });
  expect(result.committed).toBe(true);
  expect(execFileSpy).toHaveBeenCalledTimes(3);
  expect(execFileSpy.mock.calls[0][0]).toBe("git");
  expect(execFileSpy.mock.calls[0][1][0]).toBe("add");
  for (const call of execFileSpy.mock.calls) {
    expect(call[2]).toMatchObject({ cwd: SERVER_REPO_ROOT, shell: false });
  }
});

test("writeBackQueue: a git push failure still reports committed:true — the commit already succeeded and must never be understated (WR-02, from-RED)", () => {
  const execFileSpy = vi.fn((...args: any[]) => {
    if (args[1]?.[0] === "push") throw new Error("fatal: could not read from remote repository");
    return "";
  });
  const result = writeBackQueue({ queueJsonPath, noPush: false, filedCount: 1, deps: { execFileSync: execFileSpy } });
  expect(result.committed).toBe(true);
  expect(result.error).toContain("could not read from remote");
});
```
This "a later step's failure must never understate an earlier step's already-committed success" assertion style is directly relevant to `run-upstream-sync.mjs`'s own state/heartbeat update logic (D-04's heartbeat must be written even when the `claude -p` invocation itself fails).

**Real-subprocess, real-signal, process-group timeout test — Analog:** `test/unit/tools/dogfood-run-report-checkpoint.test.ts` (this is THE analog for `sync-run-upstream-sync.test.ts -t "process group kill"`, RESEARCH.md's own Phase-Requirements-to-Test-Map row)

**Why plain `child.kill()` is insufficient, stated up front** (file header, lines 21-44) — copy this framing into the new test's own header comment, adjusted for `claude -p` in place of `dist/index.js`:
```
// PROCESS-GROUP targeting is load-bearing, not cosmetic... Sending
// SIGKILL to ONLY the top-level spawned PID... is merely orphaned...
// every proxy here is spawned `detached: true` (its own process group)
// and killed via `process.kill(-pid, signal)`, delivering the signal
// to the ENTIRE tree... with no cascade for any single process to react to.
```

**killGroup / isAlive / spawnProxy / waitFor helpers** (lines 92-214):
```typescript
function killGroup(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (typeof child.pid !== "number") return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH (no such process/group) — already dead, nothing to do.
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, { timeoutMs = 5000, intervalMs = 20 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor: predicate never became true within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
```
The real spawn itself (lines 152-191) sets `detached: true` and swaps the real inner child for a lightweight fixture via a test-only env override (`AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY`) — mirror this exact substitution technique so `sync-run-upstream-sync.test.ts` can spawn a tiny fixture script (e.g. one that forks its own nested `sleep`-alike grandchild) instead of a real `claude -p`, proving the timeout-kill reaps the WHOLE tree without any real LLM cost. Also mirror the `afterEach` belt-and-suspenders reaper (lines 113-133) so a failing assertion never leaks a live process into later tests/CI.

**Synthetic one-commit-ahead fixture — Analog:** `test/unit/tools/team-clone-fuel-corpora.test.ts`, `createBareFixtureRepo` (lines 42-64) — this is the exact "real local git repo, no network" pattern SYNC-02's Wave-0 gap needs, extended by one more commit on top to simulate "upstream is 1 commit ahead":
```typescript
const GIT_OPTS = { stdio: "pipe" as const };

function createBareFixtureRepo(): { bareRepoPath: string; pinnedRef: string } {
  const workDir = makeTempDir("agda-mcp-fuel-fixture-work-");
  const bareDir = makeTempDir("agda-mcp-fuel-fixture-bare-");
  const bareRepoPath = join(bareDir, "fixture.git");
  execFileSync("git", ["init", "--bare", bareRepoPath], GIT_OPTS);
  execFileSync("git", ["init", workDir], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "config", "user.email", "test@example.com"], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "config", "user.name", "Test"], GIT_OPTS);
  writeFileSync(join(workDir, "README.md"), "fixture\n");
  execFileSync("git", ["-C", workDir, "add", "README.md"], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "commit", "-m", "init"], GIT_OPTS);
  execFileSync("git", ["-C", workDir, "remote", "add", "origin", bareRepoPath], GIT_OPTS);
  const branch = execFileSync("git", ["-C", workDir, "branch", "--show-current"], GIT_OPTS).toString().trim();
  execFileSync("git", ["-C", workDir, "push", "origin", branch], GIT_OPTS);
  const pinnedRef = execFileSync("git", ["-C", workDir, "rev-parse", "HEAD"], GIT_OPTS).toString().trim();
  return { bareRepoPath, pinnedRef };
}
```
**Keep:** this exact sequence (bare + work dir, config identity, one commit, push, capture SHA). **Change:** for SYNC-02's scenario you need two clones off the same bare repo (a stand-in "upstream" and a stand-in "fork origin"), diverged by exactly one trivial commit on the "upstream" side, so the skill's `git fetch upstream` + merge path has something real to merge. This models `upstream-sync`'s own `origin`/`upstream` two-remote setup (SKILL.md Section 1) at fixture scale.

---

### `docs/UPSTREAM-SYNC-CARRIER.md` (config, operational runbook)

**Analog:** `docs/DEPLOY-OPERATIONS.md` (full file read, 534 lines)

**Opening framing** (lines 1-13) — states what this doc is, cross-references the canonical skill/policy doc rather than duplicating it, and states it will be extended by later plans:
```markdown
# Deploy Operations

Maintainer runbook for the `agda-mcp-server` ingest endpoint + cron judge running
on the JHU IDIES k8s-dev cluster (Phase 8, DEPLOY-01). This file is extended
further by later plans (08-05, 08-06) as more of the deployment is verified.

## Cluster access recap

Full details ... live in [`.claude/skills/agda-mcp-k8s-deploy/SKILL.md`](...)
— read that file before touching the cluster by hand. Do not duplicate its
content here; this doc only lists the repeatable command recipes...
```
**House style to mirror:** short prose framing a command recipe, then a fenced code block with the EXACT command(s), followed (where a live run already happened) by a "Literal output from the `<date>` run:" fenced block quoting real captured output verbatim — e.g. (lines 336-338, 464-476):
````markdown
Literal main-container log from the 2026-07-05 acceptance run:

```text
[cron-ingest-wrapup] processed 1 archive(s), 0 capture(s) — 0 filed, 0 abstained (0.0%), 0 terminal-conflict(s), 0 error(s).
```
````
Sections end with an explicit "Cleanup (always):" command block where the recipe leaves any live state behind (lines 421-427).

**Keep:** the "recap + link to canonical doc, don't duplicate" opening move (this doc should point at `.agents/skills/upstream-sync/SKILL.md` the same way `DEPLOY-OPERATIONS.md` points at the k8s-deploy skill), the recipe-then-literal-verified-output block style, explicit cleanup sections.
**Content to cover (per CONTEXT.md/RESEARCH.md):** install/uninstall/`launchctl kickstart` (D-07 proof)/log+heartbeat file locations/`UPSTREAM_SYNC_FORCE=1` bypass (Pitfall 4)/recovery path for an unclean sync clone (Pitfall 5, delete-and-let-preflight-recreate, never auto-reset)/one-time notification-banner visual-confirmation step (Open Question 1).

---

### `.agents/skills/upstream-sync/SKILL.md` Section 7 edit (in-place, not a new-file pattern)

**Current text to replace** (full file read, lines 153-170):
```markdown
## 7. Bookkeeping (env-adaptive)

The cloud environment has NO gsd-sdk — use plain `git` commits only.

Every non-silent run appends one entry to `docs/UPSTREAM-SYNC-LOG.md` (create
the file on the first append), committed WITH the merge (or with the revert,
for rollbacks). Entry fields:

- date; environment (local/cloud)
- upstream range merged (`<old>..<new>`, N commits)
- conflicted files, if any
- gate result
- deploy run id + healthz outcome
- final outcome: merged / rolled-back / escalated with issue #

Local/manual runs MAY wrap the whole sync in `/gsd-quick` instead; cloud runs
must not attempt it.
```
Per CONTEXT.md's settled decision (locked, cite don't relitigate): "when `gsd-sdk` is available, each non-silent sync produces a real `.planning/quick/<id>-upstream-sync-<date>/` PLAN+SUMMARY + STATE.md Quick-Tasks row committed with the merge; `docs/UPSTREAM-SYNC-LOG.md` fallback when gsd-sdk absent (SYNC-02)." The edit upgrades the "Local/manual runs MAY wrap... instead" line (currently optional/local-only) into the primary path whenever `gsd-sdk` resolves on PATH — this is exactly why the wrapper's preflight (D-03) must put `gsd-sdk` on PATH itself, per RESEARCH.md's Architectural Responsibility Map row for SYNC-02. This is the ONE in-skill edit this phase makes; every other SKILL.md section is unchanged.

## Shared Patterns

### File header convention (every `scripts/*.mjs` in this repo)
**Source:** every file in `scripts/team/`, `scripts/dogfood/`, `scripts/queue/`
**Apply to:** all 6 new `scripts/sync/*.mjs` files
```javascript
// MIT License — see LICENSE
//
// <one-paragraph WHY: what this file does, which decision IDs it implements>
//
// Run with: <exact invocation> (state explicitly whether it's tsx or plain node, and WHY)
```

### `deps` dependency-injection seam
**Source:** every DI'd function across `scripts/team/*.mjs`, `scripts/queue/mirror-github.mjs`, `scripts/dogfood/dogfood-run.mjs`
**Apply to:** every exported function in every new `scripts/sync/*.mjs` file that shells out or touches the filesystem
```javascript
const execFile = deps.execFileSync ?? execFileSync; // or options.deps?.execFileSync ?? execFileSync
```
This is what makes every pre-flight assertion, notify channel, and spawn call unit-testable with zero real subprocess/LLM cost — required, not optional, given RESEARCH.md's own Validation Architecture table gates every Wave-0 test on exactly this seam.

### `isMainModule` CLI-entry gate
**Source:** `scripts/test-with-sentinel.mjs` lines 12-18, used at the bottom of every `scripts/*.mjs` with a CLI entry point
```javascript
export function isMainModule(moduleUrl, argvPath) {
  if (!argvPath) return false;
  return moduleUrl === pathToFileURL(argvPath).href;
}
// ... at the bottom of the file:
if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
```
**Apply to:** `run-upstream-sync.mjs`, `install-launchd-carrier.mjs`, `uninstall-launchd-carrier.mjs` (any file meant to be both `import`-able by its own tests AND directly executable by launchd/a human).

### `execFileSync` argv-array + `shell: false` (CWE-78 discipline)
**Source:** stated explicitly in `scripts/queue/mirror-github.mjs` lines 13-16 and `scripts/team/clone-fuel-corpora.mjs` lines 126-128; practiced in every subprocess call across all analog files
**Apply to:** every `gh`, `git`, `launchctl`, `plutil`, `osascript`, `claude` invocation in this phase. Never build a shell-string command.

### `GIT_TERMINAL_PROMPT=0` on unattended git calls
**Source:** `scripts/team/clone-fuel-corpora.mjs` lines 135-143
**Apply to:** every `git fetch`/`git clone` call in `preflight-assertions.mjs` and `install-launchd-carrier.mjs` — without it, a credential-less operation hangs on an interactive prompt instead of failing fast, which is fatal for an unattended 03:00 job.

### Loud failure / never silently degrade (CR-01-style)
**Source:** `scripts/team/install-pinned-env.mjs` lines 209-243 (partial-install is loud, `process.exitCode = 1`, "done." only printed on full success), `scripts/queue/mirror-github.mjs`'s throw-on-unparseable-output
**Apply to:** all of `preflight-assertions.mjs`, `run-upstream-sync.mjs`, `carrier-notify.mjs` — this is the same discipline CLAUDE.md documents for `src/` (`ToolInvocationError`/loud diagnostics) and is explicitly D-03/D-05's own requirement at the carrier level.

### Test temp-dir + env-var isolation helpers
**Source:** `test/unit/tools/team-install-pinned-env.test.ts` lines 44-66, repeated verbatim in `test/unit/tools/team-cron-ingest-wrapup.test.ts` lines 22-32 and `test/unit/tools/team-clone-fuel-corpora.test.ts` lines 27-37
**Apply to:** every new `test/unit/tools/sync-*.test.ts` file — `makeTempDir`/`afterEach` cleanup array, `withEnv` scoped-env-var helper.

## Cross-File Decision Point (flag to planner — not yet resolved by either CONTEXT.md or RESEARCH.md)

Comparing the two primary analogs' own header comments surfaces a concrete fork the planner must pick explicitly, once, for all 6 new files:

- `scripts/team/cron-ingest-wrapup.mjs` (header lines 47-54) MUST be run via `npx tsx`, never plain `node`, because it imports `.js`-suffixed specifiers pointing at sibling `.ts` files under `src/` (e.g. `../../src/repo-root.js`, `../../src/server-version.js`). Plain Node cannot resolve these without a prior build.
- `scripts/team/install-pinned-env.mjs` (header lines 10-16) is deliberately run via plain `node` and therefore **never imports anything from `src/`** — it computes its own repo-root locally instead (`repoRootFromThisFile()`, lines 135-137: `join(dirname(fileURLToPath(import.meta.url)), "..", "..")`).

Because launchd's `ProgramArguments[0]` is a single fixed, install-time-resolved absolute interpreter path (RESEARCH.md Pattern 1/3), `run-upstream-sync.mjs` cannot casually mix both styles. If it wants `SERVER_REPO_ROOT`/`getServerVersion` from `src/` (handy for stamping the carrier log with a server version), the plist must resolve and invoke `tsx`, not plain `node`. If it stays plain-node-loadable like `install-pinned-env.mjs` (simpler, one less moving part, no dependency on a prior `npm run build`), it must compute its own paths locally the way that file does. Recommend the latter (plain-node, self-contained path resolution) for all 6 new files, matching `install-pinned-env.mjs`'s own rationale ("must stay plain-node-loadable end to end") — the carrier has the same "must work with minimal ambient tooling" property a fresh-teammate installer has, arguably more so since launchd's PATH is even barer than a fresh teammate's shell.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/sync/interval-guard.mjs` | utility | transform + file-I/O | No existing in-repo module implements an elapsed-time cadence guard with fail-open-on-missing/corrupt-state semantics. RESEARCH.md's Code Examples section already provides the complete, correct pure function (`shouldRunSync`) — use it directly rather than searching further. |
| `scripts/sync/carrier-notify.mjs` (osascript half only) | service | event-driven | No committed usage of `osascript`/`terminal-notifier` anywhere in this repo. Follow the Shared Patterns (`deps.execFileSync`, `shell:false`, never-throw-outward) even though there is no macOS-notification-specific analog to copy structure from. |
| The `.plist` file itself | config | config | No committed plist exists in this repo (the one real-world precedent, `com.eric.llm-proxy.plist`, is outside any repo, unversioned, user-machine-only). RESEARCH.md's Pattern 1 code block is the authoritative template. |
| `scripts/sync/uninstall-launchd-carrier.mjs` | config | file-I/O | No existing `scripts/team/*` installer has an uninstall counterpart to mirror structurally; only the general DI/CLI-gate shared patterns apply. |

## Metadata

**Analog search scope:** `scripts/team/`, `scripts/dogfood/`, `scripts/queue/`, `scripts/test-with-sentinel.mjs`, `test/unit/tools/` (existing sibling tests for the above), `docs/DEPLOY-OPERATIONS.md`, `.agents/skills/upstream-sync/SKILL.md`, `src/agda/agda-process-spawn.ts` (checked for a competing timeout-kill analog; `dogfood-run.mjs`'s `killChildGroup` is the stronger match since it already targets a process GROUP, not just the direct child).
**Files scanned (fully or via targeted offset/limit reads):** `scripts/team/cron-ingest-wrapup.mjs` (705 lines, full), `scripts/team/install-pinned-env.mjs` (253 lines, full), `scripts/team/install-pinned-env.sh` (33 lines, full), `scripts/queue/mirror-github.mjs` (254 lines, full), `scripts/team/clone-fuel-corpora.mjs` (partial, lines 79-218), `scripts/dogfood/dogfood-run.mjs` (partial, lines 40-299), `scripts/test-with-sentinel.mjs` (67 lines, full), `src/agda/agda-process-spawn.ts` (145 lines, full), `test/unit/tools/team-install-pinned-env.test.ts` (496 lines, full), `test/unit/tools/team-cron-ingest-wrapup.test.ts` (partial, lines 1-100 + 786-886), `test/unit/tools/team-clone-fuel-corpora.test.ts` (partial, lines 1-65), `test/unit/tools/dogfood-run-report-checkpoint.test.ts` (partial, lines 1-230), `docs/DEPLOY-OPERATIONS.md` (534 lines, full), `.agents/skills/upstream-sync/SKILL.md` (177 lines, full).
**Pattern extraction date:** 2026-07-05
