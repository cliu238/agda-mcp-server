// MIT License — see LICENSE
//
// TEAM-02's upload client: packs a finished dogfooding run (its own
// `.agda-mcp/runs/<run-id>/` artifacts, the specific captures it
// staged, and matching Claude Code / Codex session logs) into a
// tar.gz with macOS AppleDouble metadata excluded, and POSTs it with
// a Bearer key to the TEAM-03 ingest endpoint — fail-open (D-12), with
// a bounded local retry queue (D-08: 20 archives / 2 GiB,
// drop-oldest with a loud warning, env-tunable).
//
// "No key configured" is a hard, mechanical gate (TEAM-01): with
// AGDA_MCP_TEAM_UPLOAD_KEY/URL unset, runUploadForRun returns before
// constructing any archive or touching `fetch` — zero network
// behavior, by construction, not by convention.
//
// A failed upload (unreachable URL, non-2xx response, or any other
// thrown error) NEVER throws out of runUploadForRun and NEVER sets a
// non-zero process exit code — the packed archive is preserved and a
// retry-queue entry is appended instead, mirroring
// scripts/dogfood/dogfood-run.mjs's own "best-effort side effect,
// log-and-continue" convention for auto-persisting captures.
//
// Zero new npm dependencies (D-14): system `tar` (spawned, argv array,
// shell: false — CWE-78 discipline per src/index.ts's documented
// convention) piped through `node:zlib`'s own gzip transform, and the
// global `fetch` for the streamed upload itself.
//
// Run with: npx tsx scripts/dogfood/upload-run.mjs <run-id> | --retry-only
// (NOT plain `node` — this script's src/ imports use .js-suffixed
// specifiers pointing at sibling .ts files; Node's native TS
// type-stripping does not rewrite .js -> .ts. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file.)

import { spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { SERVER_REPO_ROOT } from "../../src/repo-root.js";
import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { isMainModule } from "../test-with-sentinel.mjs";
import { selectClaudeCodeLogs, selectCodexSessionLogs } from "./agent-log-selection.mjs";
import { resolveRunsRoot } from "./transcript-writer.mjs";

/** Grace window applied on BOTH sides of a run's [startedAt, endedAt]
 *  interval before matching agent-session logs against it — a session
 *  log's own mtime rarely lines up to the millisecond with the proxy's
 *  own recorded timestamps. */
const SESSION_LOG_MATCH_GRACE_MS = 600_000; // 10 minutes

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveUploadKey() {
  return process.env.AGDA_MCP_TEAM_UPLOAD_KEY?.trim() || undefined;
}

export function resolveUploadUrl() {
  return process.env.AGDA_MCP_TEAM_UPLOAD_URL?.trim() || undefined;
}

export function resolveRetryQueuePath() {
  const override = process.env.AGDA_MCP_TEAM_UPLOAD_QUEUE_PATH?.trim();
  if (override) {
    return override;
  }
  return join(SERVER_REPO_ROOT, ".agda-mcp", "team", "upload-queue.jsonl");
}

export function resolvePendingArchiveDir() {
  return join(dirname(resolveRetryQueuePath()), "pending");
}

export function resolveRetryMaxCount() {
  return parsePositiveInt(process.env.AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_COUNT, 20);
}

export function resolveRetryMaxBytes() {
  return parsePositiveInt(process.env.AGDA_MCP_TEAM_UPLOAD_RETRY_MAX_BYTES, 2 * 1024 * 1024 * 1024);
}

/** Best-effort single-file/dir copy: logs and continues on failure
 *  rather than aborting the whole staging pass — a missing capture or
 *  a rotated-away session log must never prevent the rest of the
 *  archive from being staged. */
function copyBestEffort(copyFn, src, dest, label) {
  try {
    copyFn(src, dest);
  } catch (err) {
    process.stderr.write(
      `upload-run: failed to stage ${label} ${src} (continuing without it): `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

/**
 * Build a fresh scratch directory containing everything this run's
 * archive should contain: `runs/<run-id>/` (the run's own artifacts,
 * copied verbatim), `captures/<basename>` for every entry in
 * `runReport.stagedCaptures`, and `agent-logs/{claude,codex}/` for
 * whatever `selectClaudeCodeLogs`/`selectCodexSessionLogs` (injectable
 * via `options.deps`) return for this run's corpus root and time
 * window (widened by `SESSION_LOG_MATCH_GRACE_MS` on both sides).
 * Every individual copy is best-effort — a single missing/unreadable
 * source file never aborts the whole staging pass. Returns
 * `{ stagingDir, cleanup }`; `cleanup()` removes the staging directory
 * and must be called by the caller (even on failure).
 */
export async function buildArchiveStaging(runId, runReport, options = {}) {
  const staging = mkdtempSync(join(tmpdir(), "agda-mcp-upload-"));

  const runsDestDir = join(staging, "runs", runId);
  mkdirSync(runsDestDir, { recursive: true });
  copyBestEffort(
    (src, dest) => cpSync(src, dest, { recursive: true }),
    join(resolveRunsRoot(), runId),
    runsDestDir,
    "run directory",
  );

  const capturesDestDir = join(staging, "captures");
  mkdirSync(capturesDestDir, { recursive: true });
  const stagedCaptures = Array.isArray(runReport?.stagedCaptures) ? runReport.stagedCaptures : [];
  for (const entry of stagedCaptures) {
    if (typeof entry?.stagedPath !== "string") {
      continue;
    }
    copyBestEffort(
      copyFileSync,
      entry.stagedPath,
      join(capturesDestDir, basename(entry.stagedPath)),
      "capture",
    );
  }

  const startedAtMs = Date.parse(runReport?.startedAt);
  const endedAtMs = Date.parse(runReport?.endedAt ?? new Date().toISOString());
  const window = {
    sinceMs: Number.isFinite(startedAtMs) ? startedAtMs - SESSION_LOG_MATCH_GRACE_MS : undefined,
    untilMs: Number.isFinite(endedAtMs) ? endedAtMs + SESSION_LOG_MATCH_GRACE_MS : undefined,
  };

  const selectClaude = options.deps?.selectClaudeCodeLogs ?? selectClaudeCodeLogs;
  const selectCodex = options.deps?.selectCodexSessionLogs ?? selectCodexSessionLogs;

  const claudeDestDir = join(staging, "agent-logs", "claude");
  mkdirSync(claudeDestDir, { recursive: true });
  for (const logPath of selectClaude(runReport?.corpusRoot, window)) {
    copyBestEffort(copyFileSync, logPath, join(claudeDestDir, basename(logPath)), "Claude Code log");
  }

  const codexDestDir = join(staging, "agent-logs", "codex");
  mkdirSync(codexDestDir, { recursive: true });
  for (const logPath of selectCodex(runReport?.corpusRoot, window)) {
    copyBestEffort(copyFileSync, logPath, join(codexDestDir, basename(logPath)), "Codex session log");
  }

  return {
    stagingDir: staging,
    cleanup() {
      rmSync(staging, { recursive: true, force: true });
    },
  };
}

/**
 * Pack `stagingDir`'s contents into a gzip'd tar at `outputPath`.
 * `tar` is spawned (never `execFileSync` — the archive can be
 * multi-GB, and `execFileSync` buffers the whole child output in
 * memory) with an argv array and `shell: false` (CWE-78 discipline).
 * `COPYFILE_DISABLE=1` plus explicit `--exclude` globs suppress macOS
 * AppleDouble (`.DS_Store`, `._*`) sidecar junk (T-07-06) even when a
 * literal file with one of those names already exists in the staging
 * tree. Rejects if the `tar` child exits non-zero OR the gzip/write
 * pipeline itself fails.
 */
export async function packStagingDir(stagingDir, outputPath, options = {}) {
  const spawnFn = options.deps?.spawn ?? spawn;

  const child = spawnFn(
    "tar",
    ["-c", "-f", "-", "--exclude=.DS_Store", "--exclude=._*", "-C", stagingDir, "."],
    {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    },
  );

  let stderrOutput = "";
  child.stderr.on("data", (chunk) => {
    stderrOutput += chunk.toString();
  });

  const childExit = new Promise((resolveExit, rejectExit) => {
    child.on("error", rejectExit);
    child.on("close", (code) => {
      if (code === 0) {
        resolveExit(undefined);
      } else {
        rejectExit(new Error(`tar exited with code ${code}: ${stderrOutput}`));
      }
    });
  });

  const gzip = createGzip();
  const destination = createWriteStream(outputPath);

  await Promise.all([pipeline(child.stdout, gzip, destination), childExit]);
}

/**
 * Read the NDJSON retry queue at `queuePath`. An absent file or any
 * unreadable/malformed line degrades gracefully (missing file -> `[]`,
 * a bad line is skipped) — never throws, matching this project's
 * established `readQueueFile`-style flat-file reader convention
 * (scripts/queue/intake.mjs).
 */
export function readRetryQueue(queuePath = resolveRetryQueuePath()) {
  if (!existsSync(queuePath)) {
    return [];
  }
  let raw;
  try {
    raw = readFileSync(queuePath, "utf8");
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return entries;
}

async function writeRetryQueue(queuePath, entries) {
  mkdirSync(dirname(queuePath), { recursive: true });
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  await writeFileAtomic(queuePath, entries.length > 0 ? `${body}\n` : "");
}

/**
 * Append `entry` (a pending-upload record: `{ ts, runId, archivePath,
 * url, key, bytes, error }`) to the retry queue at `options.queuePath`
 * (default `resolveRetryQueuePath()`). D-08's bound enforcement: while
 * the queue would exceed `options.maxCount` (default
 * `resolveRetryMaxCount()`) entries OR `options.maxBytes` (default
 * `resolveRetryMaxBytes()`) total bytes, the entry with the SMALLEST
 * `ts` (oldest) is dropped first — its `archivePath` pending file is
 * deleted (best-effort) and one stderr warning line is written naming
 * the dropped run — before the new entry is appended. The whole queue
 * file is rewritten via `writeFileAtomic` (a bound-enforcement pass
 * replaces the whole file; this is NOT the plain single-append case
 * most NDJSON side-channels in this project use).
 */
export async function appendRetryQueueEntry(entry, options = {}) {
  const queuePath = options.queuePath ?? resolveRetryQueuePath();
  const maxCount = options.maxCount ?? resolveRetryMaxCount();
  const maxBytes = options.maxBytes ?? resolveRetryMaxBytes();

  const queue = [...readRetryQueue(queuePath), entry];
  const totalBytes = () => queue.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);

  while (queue.length > maxCount || totalBytes() > maxBytes) {
    let oldestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if ((queue[i].ts ?? 0) < (queue[oldestIndex].ts ?? 0)) {
        oldestIndex = i;
      }
    }
    const [dropped] = queue.splice(oldestIndex, 1);
    if (dropped?.archivePath) {
      try {
        unlinkSync(dropped.archivePath);
      } catch {
        // Already gone — fine, this delete is best-effort.
      }
    }
    process.stderr.write(
      `upload-run: retry queue bound exceeded — dropping oldest pending upload for run `
        + `${dropped?.runId ?? "unknown"} (queued at ${dropped?.ts ?? "unknown"})\n`,
    );
  }

  await writeRetryQueue(queuePath, queue);
}

/**
 * POST `archivePath`'s bytes to `url` with an `Authorization: Bearer
 * <key>` header and a run-id header, streaming the file rather than
 * buffering it in memory (`duplex: "half"` is required by `fetch` for
 * any streamed request body). `deps.fetch` overrides the global
 * `fetch` (the ONLY seam this module's tests may use — no real network
 * call is ever made from a test). Any thrown error (network failure)
 * surfaces as a REJECTED promise — this function is deliberately not
 * its own try/catch boundary; `runUploadForRun` is.
 */
export async function uploadArchive(archivePath, { key, url, runId }, deps = {}) {
  const fetchFn = deps?.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${key}`,
    "X-Agda-Mcp-Run-Id": runId,
    "Content-Type": "application/gzip",
  };
  const body = Readable.toWeb(createReadStream(archivePath));
  const response = await fetchFn(url, { method: "POST", headers, body, duplex: "half" });
  return { ok: response.ok, status: response.status };
}

/**
 * Drain the retry queue: attempt `uploadArchive` for every pending
 * entry (oldest first) using THAT ENTRY's own stored `key`/`url`/
 * `runId` — never the current run's — since a queued archive may
 * predate a key rotation or point at a different endpoint. A
 * successful upload removes the entry (and its pending archive file);
 * a failure leaves it in place and moves on — one bad entry never
 * blocks draining the rest. Returns `{ flushed, remaining }` counts.
 */
export async function flushRetryQueue(options = {}) {
  const queuePath = options.queuePath ?? resolveRetryQueuePath();
  const uploadFn = options.deps?.uploadArchive ?? uploadArchive;

  const queue = readRetryQueue(queuePath);
  const remaining = [];
  let flushed = 0;

  for (const entry of queue) {
    let result;
    try {
      result = await uploadFn(entry.archivePath, { key: entry.key, url: entry.url, runId: entry.runId }, options.deps);
    } catch (err) {
      result = { ok: false, error: err };
    }

    if (result?.ok) {
      flushed += 1;
      try {
        unlinkSync(entry.archivePath);
      } catch {
        // Already gone — fine.
      }
    } else {
      remaining.push(entry);
    }
  }

  if (remaining.length !== queue.length) {
    await writeRetryQueue(queuePath, remaining);
  }

  return { flushed, remaining: remaining.length };
}

/**
 * Run the full upload attempt for one finished dogfooding run.
 * TEAM-01's mechanical gate: with no key or no url (resolved from
 * `options.key`/`options.url`, falling back to
 * `resolveUploadKey()`/`resolveUploadUrl()`), this returns BEFORE
 * flushing the retry queue, reading `run-report.json`, or constructing
 * any archive — zero network behavior, by construction.
 *
 * Everything after the gate is wrapped so that NO error — a missing
 * run-report.json, a `tar` spawn failure, a rejected `fetch`, a
 * non-2xx response — ever propagates out of this function or blocks
 * the caller (mirrors `scripts/dogfood/dogfood-run.mjs`'s
 * `promoteCapture` fail-open shape exactly): a failed upload is queued
 * for retry and reported via the return value, never thrown.
 */
export async function runUploadForRun(runId, options = {}) {
  const key = options.key ?? resolveUploadKey();
  const url = options.url ?? resolveUploadUrl();

  if (!key) {
    return { attempted: false, reason: "no-key" };
  }
  if (!url) {
    return { attempted: false, reason: "no-url" };
  }

  try {
    await flushRetryQueue({ deps: options.deps, queuePath: options.queuePath });
  } catch (err) {
    process.stderr.write(
      `upload-run: retry-queue flush failed (continuing with this run's own upload): `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  let cleanup = () => {};
  let tmpArchivePath;
  try {
    const runReportPath = join(resolveRunsRoot(), runId, "run-report.json");
    const runReport = JSON.parse(readFileSync(runReportPath, "utf8"));

    const staged = await buildArchiveStaging(runId, runReport, options);
    cleanup = staged.cleanup;
    // A SIBLING path to stagingDir (never nested inside it) — tar is
    // about to recursively read stagingDir's own contents, so writing
    // the growing archive INSIDE that same directory would race tar
    // into trying to include its own not-yet-finished output.
    tmpArchivePath = `${staged.stagingDir}.tar.gz`;

    await packStagingDir(staged.stagingDir, tmpArchivePath, options);

    let result;
    try {
      result = await uploadArchive(tmpArchivePath, { key, url, runId }, options.deps);
    } catch (err) {
      result = { ok: false, error: err };
    }

    if (result.ok) {
      return { attempted: true, uploaded: true };
    }

    const pendingDir = resolvePendingArchiveDir();
    mkdirSync(pendingDir, { recursive: true });
    const pendingArchivePath = join(pendingDir, `${runId}-${Date.now()}.tar.gz`);
    copyFileSync(tmpArchivePath, pendingArchivePath);

    await appendRetryQueueEntry(
      {
        ts: Date.now(),
        runId,
        archivePath: pendingArchivePath,
        url,
        key,
        bytes: statSync(pendingArchivePath).size,
        error: String(result.error ?? result.status ?? "unknown upload failure"),
      },
      {
        queuePath: options.queuePath,
        pendingDir,
        maxCount: options.maxCount,
        maxBytes: options.maxBytes,
      },
    );

    return { attempted: true, uploaded: false };
  } catch (err) {
    process.stderr.write(
      `upload-run: upload attempt failed unexpectedly (fail-open — the dogfooding session is unaffected): `
        + `${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { attempted: true, uploaded: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    cleanup();
    if (tmpArchivePath) {
      try {
        unlinkSync(tmpArchivePath);
      } catch {
        // Never created, or already handled above — fine either way.
      }
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * CLI entry point. `--retry-only` runs ONLY `flushRetryQueue` and
 * exits (no run-id required) — a manual/cron-able drain of previously
 * queued uploads. Otherwise a run-id positional is required (usage +
 * exitCode 1 if missing — the ONE case that is a genuine usage error,
 * not an upload outcome). `runUploadForRun`'s own result ALWAYS exits
 * 0 regardless of upload success/failure — fail-open all the way to
 * the process exit code (D-12/TEAM-02: a failed upload is never a
 * script failure).
 */
export async function scriptMain(argv = process.argv.slice(2)) {
  if (argv.includes("--retry-only")) {
    try {
      const result = await flushRetryQueue();
      process.stdout.write(
        `upload-run: retry-only flush complete — ${result.flushed} uploaded, ${result.remaining} still pending\n`,
      );
    } catch (err) {
      process.stderr.write(
        `upload-run: retry-only flush failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    process.exitCode = 0;
    return;
  }

  const runId = argv[0];
  if (!runId) {
    process.stderr.write("Usage: npx tsx scripts/dogfood/upload-run.mjs <run-id> | --retry-only\n");
    process.exitCode = 1;
    return;
  }

  const result = await runUploadForRun(runId);
  process.stdout.write(`upload-run: ${JSON.stringify(result)}\n`);
  process.exitCode = 0;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
