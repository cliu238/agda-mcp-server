// MIT License — see LICENSE
//
// Plan 05-02's D-01 transparent recording proxy: a line-buffered stdio
// tee between an agent (this process's stdin/stdout) and the ONE real
// spawned `dist/index.js` server process (this process's own child).
// It gates every run behind PROC-01's mechanical hard gate
// (loadTaskManifest — Plan 05-01), unconditionally sets
// AGDA_MCP_CAPTURE=1 on the child so the in-server recorder is never
// silently a no-op, records an unbounded transcript + per-tool-call
// run report (scripts/dogfood/transcript-writer.mjs), and auto-
// persists every observed agda_capture_session result via the
// existing scripts/promote-capture.mjs — all without EVER
// constructing or importing a second AgdaSession itself (#39): this
// module wraps the one child server process; it never reaches into
// src/agda/ at all.
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
import { promoteCapture } from "../promote-capture.mjs";
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
  };
}

/** Extracts `--manifest <path>`, `--corpus-root <path>`, and an
 *  optional `--run-id <id>` from a flat `--flag value` argv array.
 *  Validation happens in `scriptMain`, not here — `manifestPath`/
 *  `corpusRoot` may come back `undefined`. */
function parseDogfoodArgv(argv) {
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

  return { manifestPath, corpusRoot, runId };
}

/**
 * Decide the proxy's OWN exit code from the child's terminal state.
 * A child that exited on its own passes its exit code straight
 * through. A child that never produced one (`childExitCode === null`
 * covers BOTH a spawn failure — the 'error' event fired and the
 * process never ran — and a signal death) must NOT collapse to a
 * clean 0: a spawn/'error' death or a SPONTANEOUS signal death (OOM
 * kill, an operator's kill -9 aimed at the server) is total failure
 * -> 1, so a harness or CI wrapper gating on the proxy's exit status
 * never reads "the server never started" as success. The ONE
 * legitimate signal death is the proxy's own `child.kill()` teardown
 * on the agent-disconnect path -> 0.
 *
 * Pure and exported so the decision table is directly unit-testable
 * (test/unit/tools/dogfood-run-spawn-options.test.ts); the single
 * live call site is finalize()'s `finally` in runDogfoodProxy.
 */
export function computeProxyExitCode({ childExitCode, childSignalCode, childFailed, proxyKilledChild }) {
  if (typeof childExitCode === "number") {
    return childExitCode;
  }
  return childFailed || (childSignalCode != null && !proxyKilledChild) ? 1 : 0;
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

    if (event?.isCaptureSession) {
      // Promote exactly the capture THIS response staged: a failed
      // capture call yields stagedCapture === null and stages nothing —
      // inferring via stagedCaptures.at(-1) here would silently
      // re-promote the PREVIOUS successful capture instead.
      const staged = event.stagedCapture;
      if (staged) {
        // Best-effort relative to the proxy's own liveness: a
        // promote-capture failure is reported but never crashes the
        // proxy or blocks forwarding subsequent lines.
        void (async () => {
          try {
            await promoteCapture(staged.stagedPath);
          } catch (err) {
            process.stderr.write(
              `dogfood-run: auto-persist failed for ${staged.stagedPath}: `
                + `${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
        })();
      } else {
        process.stderr.write(
          "dogfood-run: observed a failed agda_capture_session response — nothing staged to auto-persist.\n",
        );
      }
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
        // kill() returns true only when the signal was actually
        // deliverable — a never-spawned child yields false, so a spawn
        // failure is never mistaken for a proxy-initiated teardown.
        proxyKilledChild = child.kill();
      }

      // Snapshot the report only AFTER the child's stdout has fully
      // drained, so a tail response recorded to the transcript is never
      // omitted from run-report.json's stagedCaptures. Bounded so a
      // wedged child that never closes its pipe cannot hang finalize.
      await Promise.race([
        fromServerClosed,
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000).unref()),
      ]);

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
  const { manifestPath, corpusRoot, runId } = parseDogfoodArgv(argv);

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
