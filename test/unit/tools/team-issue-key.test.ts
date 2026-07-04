// MIT License — see LICENSE
//
// Unit tests for scripts/team/issue-key.mjs: the TEAM-01 key registry +
// CLI (issue/rotate/revoke/verify/list). Covers D-13's mandatory
// invariants — hash-only registry, timing-safe Bearer verification,
// 0600 file mode — plus the T-07-01..T-07-05 threat-register
// mitigations these tests exist to prove (see 07-01-PLAN.md
// <threat_model>). mkdtempSync-per-test + afterEach cleanup, mirroring
// test/unit/tools/queue-intake.test.ts exactly — never a shared
// fixture directory across tests.

import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import {
  CONSENT_STATEMENT,
  hashKey,
  isValidPersonSlug,
  issueKey,
  readKeyRegistry,
  revokeKey,
  scriptMain,
  verifyBearerToken,
} from "../../../scripts/team/issue-key.mjs";

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

/** A throwaway temp registry path — never a shared/real file. */
function throwawayKeysPath(): string {
  return join(makeTempDir("agda-mcp-team-issue-key-"), "team-keys.json");
}

const HEX64_RE = /\b[0-9a-f]{64}\b/;

// ── issueKey: creation, no-plaintext-on-disk, file mode 0600 ───────────

test("issueKey on an absent registry file creates it, returns a 64-hex-char rawKey, and the raw key never appears on disk", async () => {
  const keysPath = throwawayKeysPath();

  const result = await issueKey("alice", keysPath);

  expect(result.person).toBe("alice");
  expect(result.rawKey).toMatch(/^[0-9a-f]{64}$/);
  expect(typeof result.issuedAt).toBe("string");

  const onDiskRaw = readFileSync(keysPath, "utf8");
  expect(onDiskRaw.includes(result.rawKey)).toBe(false);

  const onDisk = JSON.parse(onDiskRaw);
  expect(onDisk).toHaveLength(1);
  expect(onDisk[0].person).toBe("alice");
  expect(onDisk[0].keyHash).toBe(hashKey(result.rawKey));
  expect(onDisk[0].revoked).toBe(false);
  expect(onDisk[0].revokedAt).toBeNull();
});

test("the registry file is chmod'd 0600 after issueKey writes it", async () => {
  const keysPath = throwawayKeysPath();
  await issueKey("alice", keysPath);
  expect(statSync(keysPath).mode & 0o777).toBe(0o600);
});

// ── Rotation ───────────────────────────────────────────────────────────

test("re-issuing a key for the same person rotates it: old key stops verifying, new key verifies, no second row is appended", async () => {
  const keysPath = throwawayKeysPath();

  const first = await issueKey("alice", keysPath);
  const second = await issueKey("alice", keysPath);

  expect(second.rawKey).not.toBe(first.rawKey);

  const registry = readKeyRegistry(keysPath);
  expect(registry).toHaveLength(1); // rotation replaces in place, never duplicates

  expect(verifyBearerToken(first.rawKey, registry)).toBeNull();
  expect(verifyBearerToken(second.rawKey, registry)).toBe("alice");

  // File mode survives the rotation's second write untouched.
  expect(statSync(keysPath).mode & 0o777).toBe(0o600);
});

// ── Revocation ───────────────────────────────────────────────────────

test("revokeKey then verifyBearerToken rejects the revoked key on the very next lookup", async () => {
  const keysPath = throwawayKeysPath();
  const issued = await issueKey("alice", keysPath);

  expect(verifyBearerToken(issued.rawKey, readKeyRegistry(keysPath))).toBe("alice");

  const revoked = await revokeKey("alice", keysPath);
  expect(revoked).toEqual({ person: "alice", revoked: true });

  // readKeyRegistry re-reads from disk every time — no in-memory cache
  // to invalidate (T-07-03).
  expect(verifyBearerToken(issued.rawKey, readKeyRegistry(keysPath))).toBeNull();
});

test("revokeKey on a never-issued person returns revoked:false without throwing", async () => {
  const keysPath = throwawayKeysPath();
  writeFileSync(keysPath, "[]\n", "utf8");

  await expect(revokeKey("nobody", keysPath)).resolves.toEqual({ person: "nobody", revoked: false });
});

// ── verifyBearerToken robustness ─────────────────────────────────────

test("verifyBearerToken never throws for undefined/empty/garbage tokens and resolves to null", async () => {
  const keysPath = throwawayKeysPath();
  await issueKey("alice", keysPath);
  const registry = readKeyRegistry(keysPath);

  expect(() => verifyBearerToken(undefined, registry)).not.toThrow();
  expect(verifyBearerToken(undefined, registry)).toBeNull();

  expect(() => verifyBearerToken("", registry)).not.toThrow();
  expect(verifyBearerToken("", registry)).toBeNull();

  expect(() => verifyBearerToken("not-a-real-key-garbage", registry)).not.toThrow();
  expect(verifyBearerToken("not-a-real-key-garbage", registry)).toBeNull();
});

test("verifyBearerToken never matches a revoked entry even with the correct raw key", async () => {
  const keysPath = throwawayKeysPath();
  const issued = await issueKey("bob", keysPath);
  await revokeKey("bob", keysPath);

  expect(verifyBearerToken(issued.rawKey, readKeyRegistry(keysPath))).toBeNull();
});

// ── isValidPersonSlug ────────────────────────────────────────────────

test("isValidPersonSlug rejects capitals, spaces, empty strings, and path-shaped input; accepts lowercase-kebab slugs", () => {
  expect(isValidPersonSlug("Alice")).toBe(false);
  expect(isValidPersonSlug("alice smith")).toBe(false);
  expect(isValidPersonSlug("")).toBe(false);
  expect(isValidPersonSlug("a/b")).toBe(false);
  expect(isValidPersonSlug("../etc")).toBe(false);
  expect(isValidPersonSlug("alice.smith")).toBe(false);
  expect(isValidPersonSlug("alice")).toBe(true);
  expect(isValidPersonSlug("alice-2")).toBe(true);
});

test("issueKey throws for an invalid person slug before any file I/O (the registry file is never created)", async () => {
  const keysPath = throwawayKeysPath();

  await expect(issueKey("Not Valid", keysPath)).rejects.toThrow(/invalid person slug/i);

  expect(() => readFileSync(keysPath, "utf8")).toThrow();
});

// ── scriptMain(["list"]) never leaks key material ───────────────────

test("scriptMain(['list']) prints person/issuedAt/revoked but never a keyHash or any 64-hex-char key-shaped value", async () => {
  const keysPath = throwawayKeysPath();
  await issueKey("alice", keysPath);
  await issueKey("bob", keysPath);

  const originalEnv = process.env.AGDA_MCP_TEAM_KEYS_PATH;
  process.env.AGDA_MCP_TEAM_KEYS_PATH = keysPath;

  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  try {
    await scriptMain(["list"]);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.AGDA_MCP_TEAM_KEYS_PATH;
    } else {
      process.env.AGDA_MCP_TEAM_KEYS_PATH = originalEnv;
    }
  }

  const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
  writeSpy.mockRestore();

  expect(output).toContain("alice");
  expect(output).toContain("bob");
  expect(output.toLowerCase()).not.toContain("keyhash");
  expect(HEX64_RE.test(output)).toBe(false);
});

test("scriptMain with no subcommand prints Usage to stderr and sets a non-zero exitCode without calling process.exit", async () => {
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;

  let output = "";
  try {
    await scriptMain([]);
    expect(process.exitCode).toBe(1);
    // Capture BEFORE mockRestore() — mockRestore() also clears mock.calls
    // (same semantics as mockReset()), so reading it after would see [].
    output = errSpy.mock.calls.map((call) => String(call[0])).join("");
  } finally {
    errSpy.mockRestore();
    process.exitCode = originalExitCode;
  }

  expect(output).toMatch(/usage/i);
});

// ── CONSENT_STATEMENT wording ────────────────────────────────────────

test("CONSENT_STATEMENT names captures, runs, and agent session logs, and states nothing is redacted", () => {
  const lower = CONSENT_STATEMENT.toLowerCase();
  expect(lower).toContain("captures");
  expect(lower).toContain("runs");
  expect(lower).toContain("agent");
  expect(lower).toContain("log");
  expect(lower).toContain("redact");
});
