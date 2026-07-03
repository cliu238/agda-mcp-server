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
  return {
    command: built.command,
    args: built.args,
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
  // until the gate has passed.
  loadTaskManifest(manifestPath);

  const runDir = join(resolveRunsRoot(), runId);
  mkdirSync(runDir, { recursive: true });

  const recorder = createRunRecorder({ transcriptPath: join(runDir, "transcript.jsonl") });

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
  async function finalize() {
    if (finalized) return;
    finalized = true;

    try {
      if (child.exitCode === null && child.signalCode === null) {
        // Never leak an orphaned Agda process — mirrors
        // cold-agda-session.mjs / mcp-local-client.mjs's convention.
        // Killing FIRST (the agent-disconnect path) also ends the
        // child's stdout, which is what lets the drain below complete.
        child.kill();
      }

      // Snapshot the report only AFTER the child's stdout has fully
      // drained, so a tail response recorded to the transcript is never
      // omitted from run-report.json's stagedCaptures. Bounded so a
      // wedged child that never closes its pipe cannot hang finalize.
      await Promise.race([
        fromServerClosed,
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000).unref()),
      ]);

      const report = recorder.getReport({ runId, startedAt, corpusRoot, manifestPath });
      await writeRunReport(runDir, report);
      process.stderr.write(
        `\n[dogfood-run] run ${runId} finished — ${report.totalToolCalls} tool call(s), `
          + `${recorder.stagedCaptures.length} capture(s) staged. To judge them: `
          + `npx tsx scripts/dogfood/dogfood-wrapup.mjs ${runId}\n`,
      );
    } catch (err) {
      process.stderr.write(
        `dogfood-run: failed to write run report: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      const exitCode = child.exitCode ?? 0;
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
  // reports and shuts down cleanly instead of crashing.
  child.on("error", (err) => {
    process.stderr.write(
      `dogfood-run: server child process error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    void finalize();
  });
  fromAgent.on("close", () => {
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
