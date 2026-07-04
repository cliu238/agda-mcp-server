// MIT License — see LICENSE
//
// TEAM-03: a locally-running node:http ingest endpoint that
// authenticates a Bearer key against 07-01's key registry
// (scripts/team/issue-key.mjs), enforces a compressed-size cap BEFORE
// the body is ever fully buffered, and stores accepted archives
// untouched under <storageDir>/<person>/<date>/<runId>.tar.gz. This
// endpoint NEVER extracts an archive — extraction is exclusively
// 07-05's sandboxed cron-judge job (see 07-CONTEXT.md D-09/D-13/D-14;
// threat register T-07-10..T-07-15).
//
// Security invariants:
//   - `person` is ALWAYS the authenticated registry lookup's own
//     value — no client-supplied header naming a person is ever read
//     anywhere in this file, so a client can never choose its own
//     storage directory (T-07-11).
//   - `runId` is allowlist-validated (sanitizeRunId) before it ever
//     touches a path, and the final destination is still built via
//     resolveFileWithinRoot as a second, independent layer of
//     defense-in-depth.
//   - The size cap is enforced twice: a fast Content-Length precheck
//     (rejects an HONEST oversized declaration before any body byte
//     is read) and a streamed createByteCounterGuard Transform
//     (catches an absent or untruthful Content-Length against the
//     ACTUAL streamed byte count) — the request body is never fully
//     buffered in memory at any point (T-07-12).
//   - Default bind host is 127.0.0.1 (loopback only); a non-default
//     AGDA_MCP_TEAM_INGEST_HOST is an explicit, documented opt-in
//     (T-07-14).
//
// Run with: npx tsx scripts/team/ingest-server.mjs
// (NOT plain `node` — this file's src/repo-root import uses a
// .js-suffixed specifier pointing at a sibling .ts file, and only
// tsx/vitest's resolver rewrites those correctly; see
// scripts/team/issue-key.mjs's header for the same note.)

import { createServer } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream, mkdirSync } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { isMainModule } from "../test-with-sentinel.mjs";

import { readKeyRegistry, resolveKeysPath, verifyBearerToken } from "./issue-key.mjs";

import { PathSandboxError, resolveFileWithinRoot, SERVER_REPO_ROOT } from "../../src/repo-root.js";

// ── Env-tunable resolvers ────────────────────────────────────────────
// Every numeric/path env var resolves through one small named
// function (never an inline `process.env.X ?? default` at the call
// site), matching this codebase's own convention
// (scripts/dogfood/transcript-writer.mjs's resolveRunsRoot,
// src/session/command-completion.ts's configuredCommandTimeoutMs).

/**
 * Root directory accepted archives are stored under.
 * `AGDA_MCP_TEAM_STORAGE_DIR` wins when set (local-dir mode now,
 * Ceph-PVC mode after the Phase 8 k8s deploy — same code path,
 * different env value); otherwise defaults to a gitignored path under
 * the repo's own `.agda-mcp/` scratch directory.
 */
export function resolveTeamStorageDir() {
  const override = process.env.AGDA_MCP_TEAM_STORAGE_DIR?.trim();
  if (override) {
    return override;
  }
  return join(SERVER_REPO_ROOT, ".agda-mcp", "team", "storage");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** D-09: 512 MiB compressed default, env-tunable via AGDA_MCP_TEAM_INGEST_MAX_BYTES. */
export function resolveIngestMaxBytes() {
  return parsePositiveInt(process.env.AGDA_MCP_TEAM_INGEST_MAX_BYTES, 536_870_912);
}

/** Default 8787, env-tunable via AGDA_MCP_TEAM_INGEST_PORT. */
export function resolveIngestPort() {
  return parsePositiveInt(process.env.AGDA_MCP_TEAM_INGEST_PORT, 8787);
}

/**
 * Default loopback-only (T-07-14) — a non-default
 * AGDA_MCP_TEAM_INGEST_HOST is an explicit, documented opt-in, never
 * the implicit default.
 */
export function resolveIngestHost() {
  return process.env.AGDA_MCP_TEAM_INGEST_HOST?.trim() || "127.0.0.1";
}

// ── Run-id validation ────────────────────────────────────────────────

/**
 * Validate a client-supplied run-id header against the identical
 * bare-filename-segment allowlist `loadOraclePolicy` uses for policy
 * keys (scripts/oracle/orcl-02-soundness-scan.mjs) — reused for
 * consistency, not re-derived. A runId that passes this check can
 * never contain `/` (or any other path separator), so it can never
 * escape the `<storageDir>/<person>/<date>/` directory once suffixed
 * with `.tar.gz`; resolveFileWithinRoot below is the second,
 * independent layer of defense against the same attack class.
 */
export function sanitizeRunId(raw) {
  return typeof raw === "string" && /^[A-Za-z0-9._-]+$/.test(raw) && raw.length > 0 ? raw : null;
}

// ── Streamed size cap ────────────────────────────────────────────────

/**
 * Thrown by createByteCounterGuard's Transform once the running byte
 * total crosses maxBytes. A named class (mirroring PathSandboxError's
 * shape in src/repo-root.ts) so the pipeline() catch block below can
 * `instanceof`-check it and choose 413 over a generic 500.
 */
export class SizeLimitExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = "SizeLimitExceededError";
  }
}

/**
 * A Transform that passes bytes through unchanged while the running
 * total stays at or below maxBytes, and errors on the chunk that
 * would push the total over it. This is the enforcement layer for a
 * request whose Content-Length header is absent or untruthful — the
 * fast Content-Length precheck in handleRequest below only catches an
 * HONEST oversized declaration; this guard is what actually caps the
 * bytes written to disk regardless of what the client claims. `total`
 * is a closure-local per call, never module-level state, so
 * concurrent requests never share a counter.
 */
export function createByteCounterGuard(maxBytes) {
  let total = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new SizeLimitExceededError(`request body exceeded ${maxBytes} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
}

// ── Request handling ─────────────────────────────────────────────────

/**
 * Write a JSON error response then destroy the request stream. Used
 * for every rejection path that fires BEFORE the body pipeline starts
 * (auth/run-id/size-precheck failures) — destroying req here ensures
 * we never accidentally attach a data listener to a request whose
 * body we've already decided not to trust, and frees the connection
 * promptly instead of leaving it half-read.
 */
function respondAndDestroy(req, res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
  req.destroy();
}

/**
 * The entire GET /healthz + POST /ingest routing table. Never wired
 * directly into createServer — see the thin catch-all wrapper in
 * createIngestServer below, which exists solely so an unexpected
 * exception in here (e.g. an ENOSPC from mkdirSync) can never become
 * an unhandled promise rejection that takes the whole long-running
 * server down for every other in-flight request (T-07-12: a network
 * listener must degrade to a single failed request, never a crash).
 */
async function handleRequest(req, res, { storageDir, maxBytes, keysPath }) {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (!(req.method === "POST" && url.pathname === "/ingest")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerMatch = typeof authHeader === "string" ? authHeader.match(/^Bearer (.+)$/) : null;
  if (!bearerMatch) {
    respondAndDestroy(req, res, 401, { ok: false, error: "missing or malformed Authorization header" });
    return;
  }

  // person ALWAYS comes from this authenticated registry lookup — no
  // client-supplied header naming a person is ever read anywhere in
  // this file, so a client can never choose its own storage directory.
  const person = verifyBearerToken(bearerMatch[1], readKeyRegistry(keysPath));
  if (!person) {
    respondAndDestroy(req, res, 401, { ok: false, error: "invalid or revoked key" });
    return;
  }

  const runId = sanitizeRunId(req.headers["x-agda-mcp-run-id"]);
  if (!runId) {
    respondAndDestroy(req, res, 400, { ok: false, error: "missing or invalid X-Agda-Mcp-Run-Id header" });
    return;
  }

  // Fast precheck: an HONEST Content-Length lets us reject an
  // oversized upload before reading a single body byte. A missing or
  // untruthful Content-Length falls through to the streamed
  // createByteCounterGuard below, which enforces the same cap against
  // the ACTUAL streamed byte count.
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    respondAndDestroy(req, res, 413, { ok: false, error: `request body exceeds ${maxBytes} bytes` });
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const relPath = join(person, date, `${runId}.tar.gz`);

  let finalPath;
  try {
    finalPath = resolveFileWithinRoot(storageDir, relPath);
  } catch (err) {
    if (!(err instanceof PathSandboxError)) {
      throw err;
    }
    // Unreachable in practice — person is an authenticated registry
    // value and runId is allowlist-validated above, so neither can
    // carry a path-traversal segment. Kept as defense in depth,
    // matching this project's own PathSandboxError-catch convention
    // (scripts/oracle/orcl-01-differential.mjs).
    respondAndDestroy(req, res, 400, { ok: false, error: "invalid storage path" });
    return;
  }

  mkdirSync(dirname(finalPath), { recursive: true });
  // Same-directory temp file so the final rename() is atomic on one
  // filesystem — mirrors writeFileAtomic's own temp-then-rename
  // discipline (src/session/safe-source-io.ts) without importing it,
  // since this is a STREAMED write, not a string write.
  const tempPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    await pipeline(req, createByteCounterGuard(maxBytes), createWriteStream(tempPath));
    await rename(tempPath, finalPath);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, storedAt: relPath }));
  } catch (err) {
    try {
      await unlink(tempPath);
    } catch {
      // Nothing to clean up — the guard may have errored before any
      // bytes were ever written to tempPath.
    }
    if (!res.headersSent) {
      if (err instanceof SizeLimitExceededError) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      } else {
        // Never echo raw internal error text (paths, ENOSPC, etc.) to
        // the network — the full message is still logged below.
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "internal error" }));
      }
    }
    process.stderr.write(
      `ingest-server: request failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

/**
 * Build (but do not start) the ingest HTTP server. All routing/auth/
 * size-cap/storage logic lives in handleRequest; this wrapper's only
 * job is to guarantee an exception anywhere in that async function
 * can never escape as an unhandled promise rejection and crash the
 * server for every other in-flight request.
 */
export function createIngestServer({ storageDir, maxBytes, keysPath }) {
  return createServer((req, res) => {
    handleRequest(req, res, { storageDir, maxBytes, keysPath }).catch((err) => {
      process.stderr.write(
        `ingest-server: unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "internal error" }));
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });
}

// ── CLI ──────────────────────────────────────────────────────────────

/**
 * CLI entry point: resolve every configuration value from the
 * environment (no flags — see the resolveXxx() functions above for
 * the exact env vars and defaults), start listening, and register a
 * graceful shutdown on SIGINT/SIGTERM.
 */
export async function scriptMain() {
  const storageDir = resolveTeamStorageDir();
  const maxBytes = resolveIngestMaxBytes();
  const port = resolveIngestPort();
  const host = resolveIngestHost();
  const keysPath = resolveKeysPath();

  const server = createIngestServer({ storageDir, maxBytes, keysPath });
  server.listen(port, host, () => {
    process.stdout.write(`listening on http://${host}:${port}\n`);
  });

  process.on("SIGINT", () => server.close());
  process.on("SIGTERM", () => server.close());

  return server;
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
