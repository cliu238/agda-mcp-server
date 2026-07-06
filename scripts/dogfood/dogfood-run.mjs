// MIT License — see LICENSE
//
// Plan 05-02's D-01 transparent recording proxy: a line-buffered stdio
// tee between an agent (this process's stdin/stdout) and the ONE real
// spawned `dist/index.js` server process (this process's own child).
// It gates every run behind PROC-01's mechanical hard gate
// (loadTaskManifest — Plan 05-01), unconditionally sets
// AGDA_MCP_CAPTURE=1 on the child so the in-server recorder is never
// silently a no-op, and records an unbounded transcript + per-tool-
// call run report (scripts/dogfood/transcript-writer.mjs) — all
// without EVER constructing or importing a second AgdaSession itself
// (#39): this module wraps the one child server process; it never
// reaches into src/agda/ at all.
//
// Ships as a scripts/ + repo-data-dir artifact per D-05 — no new MCP
// verb, no new src/ tool surface. Must be launched via `npx tsx` or a
// resolved node_modules/.bin/tsx, never plain `node`: it imports .ts
// siblings (src/repo-root.ts, test/helpers/mcp-harness.ts) via
// .js-suffixed specifiers, and Node's native TS type-stripping does
// not rewrite .js -> .ts. tsx resolves this correctly, and so does
// vitest's own resolver when this module is imported from a .test.ts
// file.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
import { buildHarnessServerParameters } from "../../test/helpers/mcp-harness.js";
import { isMainModule } from "../test-with-sentinel.mjs";
import { assertSafeRunId } from "./run-id.mjs";
import { loadTaskManifest } from "./task-manifest.mjs";
import { createRunRecorder, resolveRunsRoot, writeRunReport } from "./transcript-writer.mjs";

/**
 * Build the child spawn options for the real `dist/index.js` server
 * this proxy wraps. Reuses `buildHarnessServerParameters` (the SAME
 * child-spawn-parameter builder `test/helpers/mcp-harness.ts` uses)
 * rather than hand-rolling a second one — `serverRepoRoot` (this
 * checkout, resolves `dist/index.js`) and `corpusRoot` (the target
 * fuel corpus, becomes `AGDA_MCP_ROOT`) are deliberately two different
 * paths.
 *
 * `extraEnv` is spread FIRST, then `AGDA_MCP_CAPTURE: "1"` is applied
 * AFTER so it always wins and can NEVER be shadowed by a caller's own
 * `extraEnv.AGDA_MCP_CAPTURE` (T-05-02-… threat register / D-06: every
 * dogfood-run.mjs child spawn sets AGDA_MCP_CAPTURE=1 unconditionally,
 * so the in-server recorder is never silently a no-op for a
 * dogfooding run).
 *
 * Returns a raw `child_process.spawn`-shaped options object (`stdio`
 * fixed to `["pipe", "pipe", "pipe"]` — never inheriting the parent's
 * real stdio, which would break the tee) rather than
 * `buildHarnessServerParameters`'s own SDK-transport-specific return
 * shape (its `stderr` field is irrelevant here).
 *
 * WR-09: `detached: true` makes the child the LEADER of its own new
 * POSIX process group, rather than inheriting this proxy's own group.
 * `dist/index.js` in turn spawns the real Agda subprocess itself
 * (`src/agda/agda-process-spawn.ts`, plain `spawn()`, no `detached` of
 * its own) — that grandchild therefore joins THIS SAME new group,
 * since a process with no `detached` option of its own inherits its
 * immediate parent's group. finalize() below can then signal the
 * WHOLE group (`process.kill(-child.pid, ...)`) and reach the Agda
 * grandchild even when `dist/index.js` itself is too wedged to run its
 * own `SIGINT`/`SIGTERM` cleanup (`src/index.ts`'s own
 * `session.destroy()` handler) — a plain positive-PID signal, targeting
 * only `child.pid` itself, NEVER propagates to a process's own
 * children, confirmed by a live process-tree reproduction (the
 * grandchild survives, reparented to PID 1). `stdio` stays 3 real
 * pipes, unaffected — `detached` only changes process-group/session
 * membership, not file-descriptor inheritance.
 */
export function buildDogfoodChildOptions({ corpusRoot, extraEnv = {} }) {
  const built = buildHarnessServerParameters({
    serverRepoRoot: SERVER_REPO_ROOT,
    projectRoot: corpusRoot,
    extraEnv: { ...extraEnv, AGDA_MCP_CAPTURE: "1" },
  });
  // Test-only override (mirrors transcript-writer.mjs's own
  // AGDA_MCP_DOGFOOD_RUNS_ROOT precedent): substitutes a lightweight
  // fixture script (test/fixtures/dogfood-fake-mcp-child.mjs) for the
  // real dist/index.js child so the signal-handling regression suite
  // (test/unit/tools/dogfood-run-report-checkpoint.test.ts) can spawn
  // dogfood-run.mjs as a genuine OS subprocess and exercise real
  // SIGKILL/SIGTERM delivery without needing a real Agda binary or a
  // full `npm run build`. Unset in every real dogfooding invocation —
  // has zero effect on the actual dogfood-run.mjs launch path.
  const testChildEntry = process.env.AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY?.trim();
  return {
    command: built.command,
    args: testChildEntry ? [testChildEntry] : built.args,
    cwd: built.cwd,
    env: built.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  };
}

/** Extracts `--manifest <path>`, `--corpus-root <path>`, and an
 *  optional `--run-id <id>` from a flat `--flag value` argv array.
 *  Presence validation (`--corpus-root` required) happens in
 *  `scriptMain`, not here — `manifestPath`/`corpusRoot` may come back
 *  `undefined`. The resolved run-id's FORMAT (IN-01) is validated
 *  here, unconditionally, whether it came from an explicit `--run-id`
 *  or the generated default below. */
export function parseDogfoodArgv(argv) {
  let manifestPath;
  let corpusRoot;
  let runId;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--manifest") {
      manifestPath = argv[i + 1];
      i += 1;
    } else if (flag === "--corpus-root") {
      corpusRoot = argv[i + 1];
      i += 1;
    } else if (flag === "--run-id") {
      runId = argv[i + 1];
      i += 1;
    }
  }

  if (!runId) {
    // Sortable (ISO-timestamp prefix), human-scannable, still-unique
    // (an 8-char randomUUID slice) default run id.
    runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  }

  assertSafeRunId(runId);

  return { manifestPath, corpusRoot, runId };
}

/**
 * Decide the proxy's OWN exit code from the child's terminal state.
 * A child that exited on its own passes its exit code straight
 * through. A child that died via a SIGNAL is confirmed dead, but only
 * the ONE legitimate signal death — the proxy's own kill-group
 * teardown (killChildGroup) on the agent-disconnect path — is a clean
 * 0; a SPONTANEOUS signal death (OOM kill, an operator's `kill -9`
 * aimed at the server) is a failure -> 1.
 *
 * WR-07: `childExitCode`/`childSignalCode` BOTH null means the child's
 * terminal state was NEVER ACTUALLY OBSERVED — either a spawn 'error'
 * (the process never ran at all) or the bounded drain/SIGKILL-
 * escalation race in finalize() below elapsed without Node ever seeing
 * the child die. `proxyKilledChild` being true only means a kill SIGNAL
 * was deliverable, never that the process actually died — treating an
 * UNCONFIRMED child as a clean exit used to let a wedged child (or one
 * itself blocked on its own unresponsive Agda grandchild) survive past
 * the whole finalize() sequence while run-report.json still claimed a
 * clean, successful exit for what could be a leaked orphan process.
 * Both-null is therefore ALWAYS a failure now, so a harness or CI
 * wrapper gating on the proxy's exit status never reads "we gave up
 * waiting for the child to die" as success.
 *
 * WR-10: the signal branch also consults `childFailed`, not just the
 * both-null branch. The pre-WR-07 formula ORed `childFailed` into the
 * failure condition unconditionally
 * (`childFailed || (childSignalCode != null && !proxyKilledChild)`),
 * but the WR-07 rewrite dropped it entirely once `childSignalCode`
 * became non-null — narrowing this exported decision table's own
 * documented contract: a child that fired an 'error' event and ALSO
 * later received a legitimate, proxy-initiated signal death would
 * report a false clean 0 instead of the failure it actually is.
 * Currently unreachable via this file's one real call site (a
 * pre-spawn 'error' leaves `child.signalCode` permanently null, since
 * there was never a process to signal, so it always routes into the
 * both-null branch instead), but `computeProxyExitCode` is an
 * independently exported, independently unit-tested decision table per
 * its own contract above — closing the gap defensively costs nothing
 * and protects any future caller (e.g. an IPC channel or some other
 * 'error' trigger that could make it reachable).
 *
 * Pure and exported so the decision table is directly unit-testable
 * (test/unit/tools/dogfood-run-spawn-options.test.ts); the single
 * live call site is finalize()'s `finally` in runDogfoodProxy.
 */
export function computeProxyExitCode({ childExitCode, childSignalCode, childFailed, proxyKilledChild }) {
  if (typeof childExitCode === "number") {
    return childExitCode;
  }
  if (childSignalCode != null) {
    return proxyKilledChild && !childFailed ? 0 : 1;
  }
  // Both null: the child's terminal state was never actually observed
  // (a spawn 'error', or an unconfirmed-dead child even after finalize()'s
  // own SIGKILL escalation) — always a failure now, see header comment.
  return 1;
}

/**
 * WR-09: signal the ENTIRE process group `childProc` leads, not just
 * its own PID. `buildDogfoodChildOptions` spawns the child `detached:
 * true`, making `childProc.pid` the leader of its own new POSIX
 * process group — POSIX targets the whole group when the signalled pid
 * is NEGATED. A plain positive-PID signal (the pre-fix `child.kill()`)
 * reaches ONLY the immediate child, never a descendant it spawns itself
 * (in production, the real Agda subprocess
 * `src/agda/agda-process-spawn.ts` spawns), so a wedged process
 * survived even finalize()'s own SIGKILL as a permanent orphan
 * (reparented to PID 1) — confirmed by a live process-tree
 * reproduction. Guards for a missing/never-assigned pid (never signal
 * `-undefined`/`-NaN`) and swallows ESRCH (group already gone) —
 * mirrors dogfood-run-report-checkpoint.test.ts's own `killGroup`
 * helper, which targets this exact same process tree from the outside
 * for the identical reason. Returns true only when the signal was
 * actually DELIVERABLE, never that every process in the group has
 * actually died (mirrors `ChildProcess.prototype.kill()`'s own boolean
 * contract, which this replaces).
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

/**
 * Run the transparent recording proxy for one dogfooding session.
 *
 * Sequencing is load-bearing: `loadTaskManifest` (the D-03 hard gate)
 * is called and allowed to throw BEFORE any run directory is created
 * or any child process is spawned — a gate failure must never leave
 * behind a half-started run.
 */
export async function runDogfoodProxy({ manifestPath, corpusRoot, runId }) {
  const startedAt = new Date().toISOString();

  // D-03's mechanical hard gate. Throws synchronously on a missing
  // --manifest, unparsable JSON, or an empty array — see
  // scripts/dogfood/task-manifest.mjs. Nothing below this line may run
  // until the gate has passed. The parsed manifest is captured (not
  // discarded) — finalize() below derives taskManifestCorpora from it
  // for run-report.json (Pattern 4).
  const manifest = loadTaskManifest(manifestPath);

  const runDir = join(resolveRunsRoot(), runId);
  mkdirSync(runDir, { recursive: true });

  const recorder = createRunRecorder({ transcriptPath: join(runDir, "transcript.jsonl") });

  // Distinct corpus values this run's own task manifest referenced —
  // computed once (the manifest never changes mid-run) and reused by
  // every report snapshot below, incremental or final.
  const taskManifestCorpora = [...new Set(manifest.map((entry) => entry.corpus))];

  /**
   * Builds one full run-report.json-shaped snapshot of the CURRENT
   * recorder state, synchronously (pure, no I/O) — `extra` overlays
   * `finalized`/`exit` for the terminal write. Called fresh at every
   * checkpoint rather than memoized, so each snapshot reflects
   * whatever `recorder` has observed up to the exact moment it is
   * built, never a stale earlier picture.
   */
  function buildReportSnapshot(extra = {}) {
    return {
      ...recorder.getReport({ runId, startedAt, corpusRoot, manifestPath, taskManifestCorpora }),
      finalized: false,
      ...extra,
    };
  }

  // Fix-queue 0bc76d15c2fec8df (07-06): the SIGKILL defense. A parent
  // agent (Codex) that hard-kills this proxy's own OS process — the
  // observed real-world shape on BOTH interactive quit and `codex exec`
  // completion — gives finalize() below zero chance to run: no signal
  // is even delivered (SIGKILL cannot be caught), so the only possible
  // defense is to have ALREADY written a trustworthy report to disk
  // before the kill arrives. `reportWriteChain` serializes every
  // scheduled write so rapid back-to-back tool-call responses can never
  // interleave two overlapping writes to the same file (whichever
  // completed LAST would otherwise win, which is not necessarily the
  // most recent one) — and so finalize()'s own terminal write is
  // guaranteed to run strictly after every incremental write already
  // queued ahead of it. Never throws to its caller: a failed write is
  // logged and the chain continues, so one bad write can never wedge
  // every later checkpoint (or finalize()'s own terminal write).
  let reportWriteChain = Promise.resolve();
  function scheduleReportWrite(report) {
    reportWriteChain = reportWriteChain
      .then(() => writeRunReport(runDir, report))
      .catch((err) => {
        process.stderr.write(
          `dogfood-run: failed to write incremental run report: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      });
    return reportWriteChain;
  }

  // The very first checkpoint: a report exists on disk (finalized:false,
  // zero tool calls) before the child is even spawned, so a run that
  // fails before its first recorded action still leaves SOME record
  // behind instead of nothing at all.
  await scheduleReportWrite(buildReportSnapshot());

  const options = buildDogfoodChildOptions({ corpusRoot });
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio,
    detached: options.detached,
  });

  // The agent owns the read ends of THIS process's stdout/stderr
  // pipes. If the agent dies abruptly mid-session (an operator killing
  // a wedged Codex/Claude session is a realistic dogfooding teardown),
  // any line still draining to the agent — a forwarded server response
  // on stdout, or the child's own piped stderr output during the
  // finalize drain window — surfaces as an ASYNC 'error' event (EPIPE)
  // on the corresponding stream. With no listener that is an uncaught
  // exception that kills the proxy BEFORE writeRunReport runs: no
  // run-report.json means dogfood-wrapup refuses the run and every
  // staged capture goes unjudged. Forwarding to a dead agent is moot,
  // but finalize (the run-report write) must still complete — so both
  // events are consumed. (A stderr listener also keeps
  // `child.stderr.pipe(process.stderr)` from destroying the
  // destination with an unhandled error for the same reason.)
  process.stdout.on("error", () => {});
  process.stderr.on("error", () => {});

  child.stderr.pipe(process.stderr);

  // Agent -> proxy -> server. Line-buffered via node:readline (MCP
  // stdio's own newline-delimited framing) — every line is recorded,
  // then forwarded to the child UNCHANGED (never a re-serialized
  // copy).
  const fromAgent = createInterface({ input: process.stdin });
  fromAgent.on("line", (line) => {
    recorder.recordToServerLine(line);
    // Guarded: an agent line can arrive in the window between the
    // child's death and the proxy's own exit — writing to a dead
    // child's stdin would raise an uncaught write-after-end.
    if (child.stdin.writable) {
      child.stdin.write(`${line}\n`);
    }
  });
  // Belt-and-braces for the unguardable race (`writable` flips false
  // only after a broken pipe surfaces): a stdin 'error' event with no
  // listener would crash the proxy mid-session, taking the agent's
  // live proving session down with it.
  child.stdin.on("error", (err) => {
    process.stderr.write(
      `dogfood-run: dropped agent line — server stdin unwritable: `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
  });

  // Server -> proxy -> agent.
  const fromServer = createInterface({ input: child.stdout });
  fromServer.on("line", (line) => {
    const event = recorder.recordToClientLine(line);
    // Guarded like the child.stdin forward above: recording (already
    // done) matters even when the agent's read end is gone, forwarding
    // does not.
    if (process.stdout.writable) {
      process.stdout.write(`${line}\n`);
    }

    if (event) {
      // Fire-and-forget relative to forwarding above (never delays the
      // agent-visible response — a live interactive session must not
      // feel laggy waiting on disk I/O): fingerprint 0bc76d15c2fec8df's
      // incremental checkpoint, one snapshot per recorded action.
      // Errors are caught and logged inside scheduleReportWrite itself.
      void scheduleReportWrite(buildReportSnapshot());
    }
  });

  // Resolves once the child's stdout has fully drained: readline
  // dispatches every buffered line before surfacing "close", so this is
  // the earliest point at which the recorder is guaranteed to have seen
  // the final server->agent line (including a tail agda_capture_session
  // response still sitting in the pipe when the child terminates).
  const fromServerClosed = new Promise((resolveClosed) => {
    fromServer.on("close", resolveClosed);
  });

  // Finalize exactly once, whichever fires first: the child closing on
  // its own (`close`, not `exit` — `exit` fires when the process
  // terminates, potentially BEFORE its stdout pipe has drained), or the
  // agent disconnecting (process.stdin ending, which node:readline
  // surfaces as fromAgent's own "close" event).
  let finalized = false;
  // WR-03: a child that dies without an exit CODE (a spawn 'error' —
  // the process never ran — or a signal kill) must not report a clean
  // exit 0. `childFailed` marks the 'error'-event path;
  // `proxyKilledChild` marks finalize's own kill() below as the one
  // LEGITIMATE signal death. See computeProxyExitCode.
  let childFailed = false;
  let proxyKilledChild = false;
  async function finalize() {
    if (finalized) return;
    finalized = true;

    // Computed unconditionally so the `finally` block below always has
    // a real value even when the try block throws before reaching its
    // own assignment further down.
    let exitCode = 0;
    try {
      if (child.exitCode === null && child.signalCode === null) {
        // Never leak an orphaned Agda process — mirrors
        // cold-agda-session.mjs / mcp-local-client.mjs's convention.
        // Killing FIRST (the agent-disconnect path) also ends the
        // child's stdout, which is what lets the drain below complete.
        // WR-09: targets the child's WHOLE process group (see
        // killChildGroup/buildDogfoodChildOptions's own `detached:
        // true`), reaching the real Agda grandchild dist/index.js
        // spawns even when dist/index.js itself is too wedged to run
        // its own SIGINT/SIGTERM cleanup — a plain positive-PID signal
        // never propagated past the immediate child. Returns true only
        // when the signal was actually deliverable — a never-spawned
        // child (no pid) yields false, so a spawn failure is never
        // mistaken for a proxy-initiated teardown. This is also the
        // proxy's OWN explicit forwarding step for the graceful
        // SIGINT/SIGTERM/SIGHUP handlers below: `detached: true` takes
        // the child out of a TERMINAL's own foreground process group,
        // so a Ctrl-C no longer reaches it "for free" the way it would
        // without `detached` — this explicit kill is what still
        // guarantees delivery.
        proxyKilledChild = killChildGroup(child, "SIGTERM");
      }

      // Snapshot the report only AFTER the child's stdout has fully
      // drained, so a tail response recorded to the transcript is never
      // omitted from run-report.json's stagedCaptures. Bounded so a
      // wedged child that never closes its pipe cannot hang finalize.
      const raced = await Promise.race([
        fromServerClosed.then(() => "closed"),
        new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 2000).unref()),
      ]);

      if (raced === "timeout" && child.exitCode === null && child.signalCode === null) {
        // WR-07: the SIGTERM above can be ignored or slow to act on by
        // a wedged process (or one itself blocked on its own
        // unresponsive Agda grandchild). The header comment's "never
        // leak an orphaned Agda process" promise is not actually kept
        // by SIGTERM alone — escalate to an unignorable SIGKILL rather
        // than silently giving up once the grace window elapses.
        // WR-09: escalating via killChildGroup (the whole process
        // group, not just child.pid) is what actually makes "never
        // leak an orphaned Agda process" true — SIGKILL delivered only
        // to the immediate dist/index.js PID never reaches ITS OWN
        // spawned Agda subprocess, which survives as a permanent
        // orphan (confirmed via a live process-tree reproduction: a
        // positive-PID SIGKILL kills the mid-parent but leaves its own
        // child reparented to PID 1, still running).
        killChildGroup(child, "SIGKILL");
      }

      // WR-07: wait a further SHORT, bounded moment for Node's OWN
      // 'close' event on the child PROCESS object itself, if it hasn't
      // already fired. This covers BOTH the just-escalated-to-SIGKILL
      // case above AND a separate, more common ordering quirk observed
      // empirically: `fromServerClosed` (the child's STDOUT STREAM
      // closing, raced above) can fire a tick or two BEFORE
      // `child.exitCode`/`child.signalCode` are actually populated, even
      // on an ordinary graceful SIGTERM shutdown with no wedged child at
      // all — relying on `fromServerClosed` alone therefore under-reports
      // "confirmed dead" far more often than only the rare wedged-child
      // case this fix was originally scoped to. SIGKILL cannot be
      // blocked/ignored and a same-process 'close' notification is a
      // pure Node/libuv internal event, so 500ms is generous for either.
      if (child.exitCode === null && child.signalCode === null) {
        await Promise.race([
          new Promise((resolveClosed) => child.once("close", resolveClosed)),
          new Promise((resolveTimeout) => setTimeout(resolveTimeout, 500).unref()),
        ]);
      }

      // Computed AFTER the (possible) SIGKILL escalation and the
      // confirmation wait above — both still null here means the
      // child's terminal state was NEVER actually observed, even after
      // an unignorable kill signal. Persisted into the exit metadata
      // below (never silently inferred) so a queue/report reader can
      // tell a "confirmed clean" exit from a merely "we gave up
      // waiting" one.
      const childConfirmedDead = child.exitCode !== null || child.signalCode !== null;

      exitCode = computeProxyExitCode({
        childExitCode: child.exitCode,
        childSignalCode: child.signalCode,
        childFailed,
        proxyKilledChild,
      });

      // The terminal checkpoint: finalized:true plus exit metadata.
      // Scheduled onto the SAME reportWriteChain every incremental
      // checkpoint above used, so this write is guaranteed to run
      // strictly after every action recorded before it — never racing
      // or getting clobbered by an in-flight incremental write.
      const report = buildReportSnapshot({
        finalized: true,
        exit: {
          childExitCode: child.exitCode,
          childSignalCode: child.signalCode,
          proxyExitCode: exitCode,
          childFailed,
          proxyKilledChild,
          childConfirmedDead,
        },
      });
      await scheduleReportWrite(report);
      process.stderr.write(
        `\n[dogfood-run] run ${runId} finished — ${report.totalToolCalls} tool call(s), `
          + `${recorder.stagedCaptures.length} capture(s) staged. To judge them: `
          + `npx tsx scripts/dogfood/dogfood-wrapup.mjs ${runId}\n`,
      );
    } catch (err) {
      process.stderr.write(
        `dogfood-run: failed to write run report: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      exitCode = computeProxyExitCode({
        childExitCode: child.exitCode,
        childSignalCode: child.signalCode,
        childFailed,
        proxyKilledChild,
      });
    } finally {
      // process.exit() does not wait for queued asynchronous stdout
      // writes, which would truncate tail lines still being forwarded
      // to the agent. Stream writes are FIFO, so this empty write's
      // callback fires only after every earlier queued chunk has been
      // flushed to the pipe.
      try {
        process.stdout.write("", () => process.exit(exitCode));
      } catch {
        process.exit(exitCode);
      }
    }
  }

  child.on("close", () => {
    void finalize();
  });
  // A spawn failure (missing binary, EACCES) surfaces as an unhandled
  // 'error' event, not an exit — route it into finalize so the proxy
  // reports and shuts down cleanly instead of crashing, while
  // `childFailed` keeps the resulting exit code non-zero (a
  // never-spawned child has exitCode === null, which must never read
  // as a clean 0 — see computeProxyExitCode).
  child.on("error", (err) => {
    childFailed = true;
    process.stderr.write(
      `dogfood-run: server child process error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    void finalize();
  });
  fromAgent.on("close", () => {
    void finalize();
  });

  // The graceful half of fingerprint 0bc76d15c2fec8df's fix: an
  // operator/supervisor that sends a CATCHABLE shutdown signal (unlike
  // Codex's own observed hard-kill behavior) gets a clean, fully
  // finalized:true report instead of relying solely on the incremental
  // checkpoints above. `finalize()`'s own `finalized` guard makes this
  // idempotent with the child-close/child-error/agent-stdin-close paths
  // above — whichever fires first wins, the rest are no-ops.
  process.on("SIGTERM", () => {
    void finalize();
  });
  process.on("SIGINT", () => {
    void finalize();
  });
  process.on("SIGHUP", () => {
    void finalize();
  });
}

export async function scriptMain(argv = process.argv.slice(2)) {
  let parsedArgs;
  try {
    // IN-01: parseDogfoodArgv now throws on a flag-shaped/path-
    // traversing --run-id value — surfaced here the same way every
    // other pre-flight failure in this function is, never a raw
    // stack trace.
    parsedArgs = parseDogfoodArgv(argv);
  } catch (err) {
    process.stderr.write(`dogfood-run: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }
  const { manifestPath, corpusRoot, runId } = parsedArgs;

  if (!corpusRoot) {
    process.stderr.write(
      "Usage: npx tsx scripts/dogfood/dogfood-run.mjs --manifest <path-to-task-manifest.json> "
        + "--corpus-root <path> [--run-id <id>]\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    // A thrown gate failure (including loadTaskManifest's own throw)
    // is caught HERE — the only place a pre-flight failure becomes a
    // non-zero exit + stderr message. No child is spawned in this
    // branch, since the throw happens before runDogfoodProxy's own
    // spawn() call.
    await runDogfoodProxy({ manifestPath, corpusRoot, runId });
  } catch (err) {
    process.stderr.write(`dogfood-run: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
