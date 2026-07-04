// MIT License — see LICENSE
//
// Real-HTTP unit tests for scripts/team/ingest-server.mjs (TEAM-03).
// Every test starts a REAL http.Server on an OS-assigned ephemeral
// port and issues REAL requests via global fetch against
// 127.0.0.1:<port> — never a mocked `http` module. Covers auth
// (missing/wrong/revoked Bearer key), the streamed size cap enforced
// BEFORE the full body is buffered, run-id path-traversal rejection,
// and untouched byte-identical storage on the happy path (see
// 07-03-PLAN.md <threat_model> T-07-10..T-07-15).
//
// mkdtempSync-per-test + afterEach cleanup, mirroring
// test/unit/tools/queue-intake.test.ts and
// test/unit/tools/team-issue-key.test.ts exactly — never a shared
// fixture directory across tests. The key registry is always seeded
// via the REAL issueKey/revokeKey functions from 07-01, never a
// hand-written fake hash.

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

// @ts-expect-error script module lacks types
import { createByteCounterGuard, createIngestServer, SizeLimitExceededError } from "../../../scripts/team/ingest-server.mjs";
// @ts-expect-error script module lacks types
import { issueKey, revokeKey } from "../../../scripts/team/issue-key.mjs";

let tempDirs: string[] = [];
let servers: Server[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  servers = [];
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

/** Every file that recursively exists under `dir`, or [] if `dir` is absent — used to assert "nothing was written". */
function listFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursively(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Wait for any pending temp-file cleanup (async catch block) to settle. */
function settle(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startServer(options: { maxBytes?: number } = {}): Promise<{
  storageDir: string;
  keysPath: string;
  port: number;
}> {
  const storageDir = makeTempDir("agda-mcp-team-ingest-storage-");
  const keysPath = join(makeTempDir("agda-mcp-team-ingest-keys-"), "team-keys.json");
  const maxBytes = options.maxBytes ?? 536_870_912;

  const server: Server = createIngestServer({ storageDir, maxBytes, keysPath });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return { storageDir, keysPath, port };
}

// ── GET /healthz ───────────────────────────────────────────────────

test("GET /healthz returns 200 with no Authorization header", async () => {
  const { port } = await startServer();

  const res = await fetch(`http://127.0.0.1:${port}/healthz`);

  expect(res.status).toBe(200);
});

// ── Auth failures (401) ──────────────────────────────────────────

test("POST /ingest with no Authorization header returns 401 and writes nothing to disk", async () => {
  const { port, storageDir } = await startServer();

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { "x-agda-mcp-run-id": "run-1" },
    body: Buffer.from("hello"),
  });

  expect(res.status).toBe(401);
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

test("POST /ingest with Authorization: Bearer wrong-key returns 401", async () => {
  const { port, keysPath, storageDir } = await startServer();
  await issueKey("alice", keysPath);

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { authorization: "Bearer wrong-key", "x-agda-mcp-run-id": "run-1" },
    body: Buffer.from("hello"),
  });

  expect(res.status).toBe(401);
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

test("POST /ingest with a revoked key returns 401 and writes nothing to disk", async () => {
  const { port, keysPath, storageDir } = await startServer();
  const { rawKey } = await issueKey("alice", keysPath);
  await revokeKey("alice", keysPath);

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}`, "x-agda-mcp-run-id": "run-1" },
    body: Buffer.from("hello"),
  });

  expect(res.status).toBe(401);
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

// ── Run-id validation (400) ──────────────────────────────────────

test("POST /ingest with a path-traversal-shaped run-id header returns 400 and writes nothing", async () => {
  const { port, keysPath, storageDir } = await startServer();
  const { rawKey } = await issueKey("alice", keysPath);

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}`, "x-agda-mcp-run-id": "../evil" },
    body: Buffer.from("hello"),
  });

  expect(res.status).toBe(400);
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

test("POST /ingest with a missing run-id header returns 400 and writes nothing", async () => {
  const { port, keysPath, storageDir } = await startServer();
  const { rawKey } = await issueKey("alice", keysPath);

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}` },
    body: Buffer.from("hello"),
  });

  expect(res.status).toBe(400);
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

// ── Happy path: byte-identical, untouched storage ────────────────

test("POST /ingest with a valid key + run-id + small body returns 200 and stores byte-identical content at alice/<today-UTC>/<runId>.tar.gz", async () => {
  const { port, keysPath, storageDir } = await startServer();
  const { rawKey } = await issueKey("alice", keysPath);
  const body = Buffer.from("fake tar.gz archive content — not really gzip, but bytes are bytes");

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}`, "x-agda-mcp-run-id": "run-42" },
    body,
  });

  expect(res.status).toBe(200);
  const json = (await res.json()) as { ok: boolean; storedAt: string };
  expect(json.ok).toBe(true);

  const today = new Date().toISOString().slice(0, 10);
  expect(json.storedAt).toBe(join("alice", today, "run-42.tar.gz"));

  const onDisk = readFileSync(join(storageDir, json.storedAt));
  expect(onDisk.equals(body)).toBe(true);
});

// ── Size cap: Content-Length precheck (fast path, 413) ───────────

test("POST /ingest with an honest Content-Length larger than a small maxBytes returns 413 and leaves no file (not even a temp file) on disk", async () => {
  const { port, keysPath, storageDir } = await startServer({ maxBytes: 16 });
  const { rawKey } = await issueKey("alice", keysPath);
  const oversizedBody = Buffer.alloc(100, "a");

  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}`, "x-agda-mcp-run-id": "run-big" },
    body: oversizedBody,
  });

  expect(res.status).toBe(413);

  await settle();
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

// ── Size cap: streamed guard (Content-Length absent/untruthful) ──

test("POST /ingest with a streamed body (no precomputable Content-Length) exceeding a small maxBytes is rejected and leaves no complete oversized file on disk", async () => {
  const { port, keysPath, storageDir } = await startServer({ maxBytes: 16 });
  const { rawKey } = await issueKey("alice", keysPath);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1024).fill(1));
      controller.close();
    },
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { authorization: `Bearer ${rawKey}`, "x-agda-mcp-run-id": "run-stream" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    // Either a clean 413 (if headers were still open when the guard
    // fired) or the fetch above throws (connection aborted mid-
    // stream) — both are acceptable per 07-03-PLAN.md's own behavior
    // spec: "the connection is aborted / a 413 is sent if headers are
    // still open". The filesystem assertion below is what actually
    // matters for this test.
    expect(res.status).toBe(413);
  } catch {
    // Connection aborted mid-stream — acceptable, see comment above.
  }

  await settle();
  expect(listFilesRecursively(storageDir)).toEqual([]);
});

// ── createByteCounterGuard: pure unit coverage, no HTTP needed ───

test("createByteCounterGuard passes chunks through under the cap and errors with SizeLimitExceededError on the chunk that crosses it", async () => {
  const guard = createByteCounterGuard(10);
  const received: Buffer[] = [];
  let caught: unknown;

  const settled = new Promise<void>((resolve) => {
    guard.on("data", (chunk: Buffer) => received.push(chunk));
    guard.on("end", resolve);
    guard.on("error", (err: unknown) => {
      caught = err;
      resolve();
    });
  });

  guard.write(Buffer.from("12345")); // 5 bytes — under the 10-byte cap.
  guard.write(Buffer.from("123456")); // +6 = 11 bytes — crosses the cap.

  await settled;

  expect(Buffer.concat(received).toString("utf8")).toBe("12345");
  expect(caught).toBeInstanceOf(SizeLimitExceededError);
});
