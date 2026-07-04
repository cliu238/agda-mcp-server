// MIT License — see LICENSE
//
// Unit tests for scripts/team/archive-extract.mjs's extractArchiveSafely():
// the two-layer sandboxed, disposable tar.gz extraction TEAM-04's cron
// judge uses. The primary path-traversal rejection test builds a REAL
// tar via the system `tar` binary containing a genuine `../` entry (no
// mocking of the listing step) — everything else (bounded-extraction
// kill switch, post-extraction symlink escape) is DI-driven via
// `options.deps`, per this codebase's own convention, so no real tar
// bypass needs to be found to exercise those defense-in-depth layers.

import { afterEach, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { DEFAULT_MAX_DECOMPRESSED_BYTES, extractArchiveSafely } from "../../../scripts/team/archive-extract.mjs";

let tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

/** Builds a real tar.gz at `archivePath` containing every file under
 *  `sourceDir` (relative paths preserved), via the REAL system `tar`
 *  binary. The module under test always shells out to the real `tar`
 *  for its listing/extraction steps except where a test explicitly
 *  overrides `deps.spawn`/`deps.execFileSync`. */
function buildRealTarGz(archivePath: string, sourceDir: string): void {
  execFileSync("tar", ["-czf", archivePath, "-C", sourceDir, "."], { shell: false });
}

// ── Happy path: a real, well-formed archive extracts intact ──────────

test("extractArchiveSafely: a real, well-formed tar.gz extracts successfully with identical file contents", async () => {
  const sourceDir = makeTempDir("agda-mcp-archive-extract-src-");
  writeFileSync(join(sourceDir, "a.txt"), "hello a", "utf8");
  mkdirSync(join(sourceDir, "sub"));
  writeFileSync(join(sourceDir, "sub", "b.txt"), "hello b", "utf8");

  const archiveDir = makeTempDir("agda-mcp-archive-extract-archive-");
  const archivePath = join(archiveDir, "good.tar.gz");
  buildRealTarGz(archivePath, sourceDir);

  const result = await extractArchiveSafely(archivePath);

  expect(result.ok).toBe(true);
  tempDirs.push(result.scratchDir);

  expect(readFileSync(join(result.scratchDir, "a.txt"), "utf8")).toBe("hello a");
  expect(readFileSync(join(result.scratchDir, "sub", "b.txt"), "utf8")).toBe("hello b");

  result.cleanup();
  expect(existsSync(result.scratchDir)).toBe(false);
});

// ── The mandatory real-crafted-traversal-tar test ─────────────────────

test("extractArchiveSafely: a REAL crafted tar containing a literal ../ entry is rejected pre-extraction (unsafe-entry-path), without ever attempting extraction", async () => {
  const parentDir = makeTempDir("agda-mcp-archive-extract-traversal-parent-");
  const childDir = join(parentDir, "child");
  mkdirSync(childDir);
  writeFileSync(join(parentDir, "secret.txt"), "leaked", "utf8");

  const archiveDir = makeTempDir("agda-mcp-archive-extract-traversal-archive-");
  const archivePath = join(archiveDir, "evil.tar.gz");
  // The exact recipe that produces a raw "../secret.txt" entry name:
  // tar -C <childDir> -czf <archive> ../secret.txt — empirically
  // verified on this repo's own tar (bsdtar/libarchive and GNU tar
  // both preserve a relative ".." segment verbatim in the stored
  // entry name; only a leading "/" absolute path is special-cased).
  execFileSync("tar", ["-C", childDir, "-czf", archivePath, "../secret.txt"], { shell: false });

  const execFileSpy = vi.fn((...args: Parameters<typeof execFileSync>) => (execFileSync as any)(...args));
  const spawnSpy = vi.fn();

  const result = await extractArchiveSafely(archivePath, {
    deps: { execFileSync: execFileSpy, spawn: spawnSpy },
  });

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("unsafe-entry-path");
  expect(result.detail).toBe("../secret.txt");
  // Only ONE execFileSync invocation (the listing) — the extract step
  // (spawn("tar", ["-x", ...])) must never be reached once the listing
  // itself is unsafe.
  expect(execFileSpy).toHaveBeenCalledTimes(1);
  expect(spawnSpy).not.toHaveBeenCalled();
});

test("extractArchiveSafely: an absolute-path entry is also rejected pre-extraction", async () => {
  const sourceDir = makeTempDir("agda-mcp-archive-extract-abs-src-");
  writeFileSync(join(sourceDir, "a.txt"), "hello", "utf8");

  const archiveDir = makeTempDir("agda-mcp-archive-extract-abs-archive-");
  const archivePath = join(archiveDir, "abs.tar.gz");
  buildRealTarGz(archivePath, sourceDir);

  // Simulate a listing that reports an absolute-path entry (bsdtar/GNU
  // tar creation both refuse to embed a genuinely absolute path
  // without an explicit --absolute-names/-P flag we deliberately never
  // pass, so the listing is faked here to exercise this branch
  // directly rather than depending on flag-specific tar behavior).
  const execFileSpy = vi.fn((cmd: string, args: readonly string[], opts: unknown) => {
    if (Array.isArray(args) && args[0] === "-tf") {
      return "/etc/passwd\n";
    }
    return (execFileSync as any)(cmd, args, opts);
  });

  const result = await extractArchiveSafely(archivePath, { deps: { execFileSync: execFileSpy } });

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("unsafe-entry-path");
  expect(result.detail).toBe("/etc/passwd");
});

// ── Post-extraction realpath containment (defense-in-depth layer 2) ──

test("extractArchiveSafely: a symlink planted during extraction that resolves outside scratchDir is caught post-extraction (post-extraction-escape) and scratchDir is removed", async () => {
  const sourceDir = makeTempDir("agda-mcp-archive-extract-clean-src-");
  writeFileSync(join(sourceDir, "a.txt"), "hello", "utf8");

  const archiveDir = makeTempDir("agda-mcp-archive-extract-clean-archive-");
  const archivePath = join(archiveDir, "clean.tar.gz");
  buildRealTarGz(archivePath, sourceDir);

  const outsideDir = makeTempDir("agda-mcp-archive-extract-outside-");
  const outsideTarget = join(outsideDir, "leaked.txt");
  writeFileSync(outsideTarget, "leaked content", "utf8");

  let capturedScratchDir = "";
  const fakeSpawn = vi.fn((_cmd: string, args: readonly string[]) => {
    const scratchDirIndex = args.indexOf("-C") + 1;
    capturedScratchDir = args[scratchDirIndex] as string;
    // Simulate a tar extraction bypass (e.g. the node-tar hardlink-
    // guard-bypass CVE class, Pitfall 6) by planting a symlink INSIDE
    // scratchDir whose target resolves OUTSIDE it — this is what Step
    // C's resolveExistingPathWithinRoot (realpath-following) must
    // catch, since a syntactic check alone (resolveFileWithinRoot)
    // would see "escaped-link" as a perfectly ordinary in-root name.
    symlinkSync(outsideTarget, join(capturedScratchDir, "escaped-link"));
    const emitter = new EventEmitter() as EventEmitter & { kill: (signal?: string) => void; stderr: EventEmitter };
    emitter.kill = vi.fn();
    emitter.stderr = new EventEmitter();
    process.nextTick(() => emitter.emit("close", 0));
    return emitter;
  });

  const result = await extractArchiveSafely(archivePath, { deps: { spawn: fakeSpawn } });

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("post-extraction-escape");
  expect(existsSync(capturedScratchDir)).toBe(false);
});

// ── Post-extraction decompressed-size ceiling (defense-in-depth) ─────

test("extractArchiveSafely: cumulative decompressed content exceeding a small injected maxDecompressedBytes is rejected post-extraction (decompressed-size-exceeded)", async () => {
  const sourceDir = makeTempDir("agda-mcp-archive-extract-big-src-");
  writeFileSync(join(sourceDir, "big.bin"), "x".repeat(200), "utf8");

  const archiveDir = makeTempDir("agda-mcp-archive-extract-big-archive-");
  const archivePath = join(archiveDir, "big.tar.gz");
  buildRealTarGz(archivePath, sourceDir);

  const result = await extractArchiveSafely(archivePath, { maxDecompressedBytes: 10 });

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("decompressed-size-exceeded");
  expect(result.detail).toContain("exceeds 10");
});

// ── Mid-extraction bounded kill switch (plan-checker finding 1) ──────

test("extractArchiveSafely: a still-running extraction whose scratch dir already exceeds maxDecompressedBytes is SIGKILLed mid-flight and scratchDir is removed", async () => {
  vi.useFakeTimers();

  const sourceDir = makeTempDir("agda-mcp-archive-extract-midflight-src-");
  writeFileSync(join(sourceDir, "a.txt"), "hello", "utf8");
  const archiveDir = makeTempDir("agda-mcp-archive-extract-midflight-archive-");
  const archivePath = join(archiveDir, "midflight.tar.gz");
  buildRealTarGz(archivePath, sourceDir);

  let capturedScratchDir = "";
  const killSpy = vi.fn();
  const fakeSpawn = vi.fn((_cmd: string, args: readonly string[]) => {
    const scratchDirIndex = args.indexOf("-C") + 1;
    capturedScratchDir = args[scratchDirIndex] as string;
    // Simulate tar having already written far more than the injected
    // ceiling, but NOT yet closing — this is the exact shape a
    // decompression bomb takes: bytes land on disk well before the
    // process itself ever exits.
    writeFileSync(join(capturedScratchDir, "huge.bin"), Buffer.alloc(1000, 1));
    const emitter = new EventEmitter() as EventEmitter & { kill: (signal?: string) => void; stderr: EventEmitter };
    emitter.kill = killSpy;
    emitter.stderr = new EventEmitter();
    // Deliberately never emits "close" — the poll's kill switch, not a
    // graceful exit, must be what ends this extraction.
    return emitter;
  });

  const resultPromise = extractArchiveSafely(archivePath, {
    maxDecompressedBytes: 100,
    deps: { spawn: fakeSpawn },
  });

  await vi.advanceTimersByTimeAsync(500);
  const result = await resultPromise;

  expect(result.ok).toBe(false);
  expect(result.reason).toBe("decompressed-size-exceeded-during-extraction");
  expect(killSpy).toHaveBeenCalledWith("SIGKILL");
  expect(existsSync(capturedScratchDir)).toBe(false);
});

// ── Every {ok:false} path leaves no leaked scratch directory ─────────

test("extractArchiveSafely: every {ok:false} path removes its scratch directory (or never created one)", async () => {
  const sourceDir = makeTempDir("agda-mcp-archive-extract-leak-src-");
  writeFileSync(join(sourceDir, "a.txt"), "hello", "utf8");
  const archiveDir = makeTempDir("agda-mcp-archive-extract-leak-archive-");
  const archivePath = join(archiveDir, "leak.tar.gz");
  buildRealTarGz(archivePath, sourceDir);

  // listing-failed: point at a nonexistent archive path.
  const listingFailed = await extractArchiveSafely(join(archiveDir, "does-not-exist.tar.gz"));
  expect(listingFailed.ok).toBe(false);
  expect(listingFailed.reason).toBe("listing-failed");

  // decompressed-size-exceeded (post-extraction layer): scratchDir is
  // created then removed — captured via a spy on mkdtempSync.
  const realMkdtempSync = mkdtempSync;
  let createdScratchDir = "";
  const mkdtempSpy = vi.fn((prefix: string) => {
    createdScratchDir = realMkdtempSync(prefix);
    return createdScratchDir;
  });

  const oversized = await extractArchiveSafely(archivePath, {
    maxDecompressedBytes: 1,
    deps: { mkdtempSync: mkdtempSpy },
  });
  expect(oversized.ok).toBe(false);
  expect(createdScratchDir).not.toBe("");
  expect(existsSync(createdScratchDir)).toBe(false);
});

// ── Acceptance-criteria grep target (documented here for clarity) ────

test("DEFAULT_MAX_DECOMPRESSED_BYTES is a positive, generous engineering default", () => {
  expect(DEFAULT_MAX_DECOMPRESSED_BYTES).toBeGreaterThan(0);
  expect(DEFAULT_MAX_DECOMPRESSED_BYTES).toBe(5 * 1024 * 1024 * 1024);
});
