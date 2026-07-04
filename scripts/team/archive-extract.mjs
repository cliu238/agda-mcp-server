// MIT License — see LICENSE
//
// TEAM-04 (Task 1): sandboxed, disposable tar.gz extraction for
// archives ingested by 07-03's ingest-server.mjs. Two INDEPENDENT
// defensive layers — mirroring scripts/oracle/orcl-01-differential.mjs's
// proven materializeCaptureEnvironment doctrine — neither of which
// trusts the tar binary's own guard alone (PITFALLS.md Pitfall 6;
// node-tar's own CVE history shows library guards are insufficient,
// even though this module shells out to the SYSTEM tar binary, never
// node-tar):
//
//   (1) PRE-extraction: `tar -tf` lists every entry BEFORE any bytes
//       are extracted; an absolute path or a `..` path segment
//       anywhere in the listing rejects the WHOLE archive, before
//       `tar -x` is ever invoked. A SECOND, verbose (`-tvf`) listing
//       (WR-04) additionally rejects any hard-link-type entry — a
//       hard link's OWN name can look perfectly safe while its header
//       linkname points at an arbitrary pre-existing file on the same
//       filesystem, which the plain name-only listing above cannot see
//       and which never manifests as a symlink for layer (2) below to
//       catch either (it appears as an ordinary same-inode file).
//   (2) POST-extraction: every extracted entry's canonical (symlink-
//       resolved) path is re-verified to stay within the scratch
//       directory via src/repo-root.ts's resolveExistingPathWithinRoot
//       — the realpath-following check that catches a symlink-based
//       escape a syntactic (non-realpath) check like
//       resolveFileWithinRoot would miss.
//
// Extraction itself is BOUNDED, never fire-and-forget (T-07-19,
// plan-checker finding 1): tar is spawned asynchronously and the
// scratch directory's cumulative on-disk size is polled every 500ms
// while it runs — a breach mid-extraction SIGKILLs tar and removes the
// scratch dir immediately, rather than waiting for a (potentially
// enormous) decompression bomb to finish writing to disk first. The
// post-extraction walk (layer 2 above) re-checks the final cumulative
// size as a second, independent layer once the tree is stable.
//
// Every real subprocess/filesystem primitive here accepts an
// `options.deps.<fnName>` override (this codebase's own DI convention
// — scripts/queue/mirror-github.mjs, scripts/oracle/run-oracle.mjs),
// so this module's own tests can inject fakes with zero real
// subprocess cost for the defense-in-depth paths, while still
// exercising a REAL crafted path-traversal tar for the primary
// pre-extraction rejection test.
//
// This module has no CLI entry point of its own — it is imported
// directly by scripts/team/cron-ingest-wrapup.mjs (never re-invoked as
// a subprocess). It must still be reached via `npx tsx`/vitest (not
// plain `node`) transitively, since it imports src/repo-root.ts via a
// .js-suffixed specifier pointing at a sibling .ts file.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PathSandboxError, resolveExistingPathWithinRoot } from "../../src/repo-root.js";

/**
 * A generous, documented defense-in-depth ceiling on TOTAL decompressed
 * bytes an extracted archive may occupy on disk — an engineering
 * default (5 GiB), not derived from any specific requirement number.
 * D-09's 512 MiB ingest cap already bounds the COMPRESSED upload size
 * at the HTTP layer (scripts/team/ingest-server.mjs); this is the
 * independent decompressed-size ceiling for this SEPARATE extraction
 * step, since a small compressed payload can still expand far past its
 * compressed size (T-07-19).
 */
export const DEFAULT_MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * WR-05: a generous, documented defense-in-depth ceiling on the TOTAL
 * NUMBER of entries an archive may contain, independent of
 * DEFAULT_MAX_DECOMPRESSED_BYTES above. Both the mid-extraction poll and
 * the post-extraction walk sum only `stats.size` of regular files — a
 * tar archive containing a very large number of zero-byte (or few-byte)
 * files compresses extremely well (the 512 MiB compressed-size ingest
 * cap comfortably allows tens of millions of near-empty tar-header
 * entries) yet contributes ~0 to the summed byte total at every
 * checkpoint, so the byte ceiling never fires even though
 * `readdirSync(scratchDir, { recursive: true })` and the extraction
 * itself still have to materialize an entry (inode + directory entry)
 * per file — a real, comparatively cheap-to-construct path to
 * exhausting inodes/memory/CPU on the judging host. A few thousand is
 * generous for any legitimate capture bundle this project produces
 * (runs/captures/agent-logs — dozens to low hundreds of files, typically).
 */
export const DEFAULT_MAX_ENTRY_COUNT = 5000;

/**
 * Best-effort recursive sum of on-disk file sizes under `dir`. Used by
 * the mid-extraction 500ms poll (extractBounded, below) against a
 * LIVE, still-mutating tree — an entry that disappears or is briefly
 * unreadable mid-scan (a race with the still-running tar process)
 * contributes 0 rather than throwing, since throwing here would abort
 * a legitimate in-flight extraction. This is deliberately NOT a
 * security check (no path-containment assertion) — it exists purely to
 * enforce the decompressed-size DoS ceiling as early as possible. The
 * AUTHORITATIVE, security-relevant walk is extractArchiveSafely's own
 * post-extraction Step C below, which independently re-verifies both
 * containment (resolveExistingPathWithinRoot) and the final cumulative
 * size against a now-stable (fully extracted) tree.
 */
function sumFileSizesUnderDir(dir, deps = {}) {
  const readdir = deps.readdirSync ?? readdirSync;
  const stat = deps.statSync ?? statSync;

  let relPaths;
  try {
    relPaths = readdir(dir, { recursive: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const relPath of relPaths) {
    try {
      const stats = stat(join(dir, relPath));
      if (stats.isFile()) {
        total += stats.size;
      }
    } catch {
      // Race with the still-running tar process, or an otherwise-
      // unreadable entry — contribute 0, never throw mid-poll.
    }
  }
  return total;
}

/**
 * Spawn `tar -x` against `archivePath` into `scratchDir` and await its
 * completion, polling `scratchDir`'s cumulative on-disk size every
 * 500ms while it runs (T-07-19 / plan-checker finding 1: extraction
 * must be BOUNDED, never fire-and-forget). A breach mid-extraction
 * SIGKILLs the child, removes scratchDir, and resolves
 * `{ok:false, reason:"decompressed-size-exceeded-during-extraction"}`
 * WITHOUT waiting for tar to exit on its own — a genuine decompression
 * bomb might otherwise never finish writing.
 *
 * Never passes `-P`/`--absolute-names`: refusing to honor an absolute
 * path recorded in the archive is tar's OWN default second layer,
 * independent of this module's own pre-extraction listing check
 * (Step A in extractArchiveSafely).
 */
function extractBounded(archivePath, scratchDir, maxDecompressedBytes, deps) {
  const spawnFn = deps.spawn ?? spawn;
  const rm = deps.rmSync ?? rmSync;

  const child = spawnFn("tar", ["-x", "-f", archivePath, "-C", scratchDir], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  let stderrTail = "";
  child.stderr?.on("data", (chunk) => {
    stderrTail += chunk.toString();
  });

  return new Promise((resolvePromise) => {
    let settled = false;

    const pollTimer = setInterval(() => {
      if (settled) {
        return;
      }
      const total = sumFileSizesUnderDir(scratchDir, deps);
      if (total > maxDecompressedBytes) {
        settled = true;
        clearInterval(pollTimer);
        child.kill("SIGKILL");
        rm(scratchDir, { recursive: true, force: true });
        resolvePromise({
          ok: false,
          reason: "decompressed-size-exceeded-during-extraction",
          detail: `${total} bytes exceeds ${maxDecompressedBytes} during extraction`,
        });
      }
    }, 500);

    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(pollTimer);
      rm(scratchDir, { recursive: true, force: true });
      resolvePromise({
        ok: false,
        reason: "extraction-failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(pollTimer);
      if (code !== 0) {
        rm(scratchDir, { recursive: true, force: true });
        resolvePromise({
          ok: false,
          reason: "extraction-failed",
          detail: stderrTail.trim() || `tar exited with code ${code}`,
        });
        return;
      }
      resolvePromise({ ok: true });
    });
  });
}

/**
 * Extract `archivePath` (a tar.gz) into a fresh, disposable scratch
 * directory, applying two independent sandboxing layers (see header
 * comment) plus a decompressed-size ceiling enforced both DURING
 * (extractBounded above) and AFTER extraction (Step C below). Returns
 * `{ok:true, scratchDir, cleanup}` on success — `cleanup()` removes
 * scratchDir — or `{ok:false, reason, detail}` on any rejection, with
 * scratchDir ALREADY removed: the caller never needs to clean up an
 * `{ok:false}` result itself.
 */
export async function extractArchiveSafely(archivePath, options = {}) {
  const deps = options.deps ?? {};
  const execFile = deps.execFileSync ?? execFileSync;
  const mkdtemp = deps.mkdtempSync ?? mkdtempSync;
  const rm = deps.rmSync ?? rmSync;
  const readdir = deps.readdirSync ?? readdirSync;
  const stat = deps.statSync ?? statSync;
  const maxDecompressedBytes = options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
  const maxEntryCount = options.maxEntryCount ?? DEFAULT_MAX_ENTRY_COUNT;

  // Step A (pre-check): reject the WHOLE archive on the first
  // offending entry, before any extraction is ever attempted.
  let listing;
  try {
    // -P on the LIST call only (NEVER on extraction): GNU tar otherwise
    // TRANSFORMS displayed member names — a stored "../secret.txt" is
    // shown as "secret.txt" (with only a stderr warning), making the
    // name check below blind to traversal entries on Linux (the exact
    // platform the cluster judge runs on). With -P both GNU tar and
    // bsdtar print the raw stored name, so the check behaves
    // identically cross-platform. Listing with -P writes nothing to
    // disk; extraction below deliberately still omits -P so tar's own
    // strip-on-extract remains an independent second layer.
    listing = execFile("tar", ["-t", "-P", "-f", archivePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "listing-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const entries = listing.split("\n").filter(Boolean);

  // WR-05: cheapest check first — a many-tiny/empty-file archive is
  // rejected on ENTRY COUNT alone, before the (relatively) more
  // expensive per-entry unsafe-path scan below and long before either
  // byte-based ceiling (DEFAULT_MAX_DECOMPRESSED_BYTES) ever gets a
  // chance to fire.
  if (entries.length > maxEntryCount) {
    return {
      ok: false,
      reason: "entry-count-exceeded",
      detail: `${entries.length} entries exceeds ${maxEntryCount}`,
    };
  }

  const unsafe = entries.find((entry) => entry.startsWith("/") || entry.split("/").includes(".."));
  if (unsafe) {
    return { ok: false, reason: "unsafe-entry-path", detail: unsafe };
  }

  // WR-04: the plain `-tf` listing above prints ONLY each entry's own
  // NAME, never its type or (for a hard-link entry) its link target — a
  // hard-link entry whose header linkname points OUTSIDE the sandbox is
  // invisible to that check (it can only ever reject based on the new
  // link's own name). It also does not manifest as a symlink for Step
  // C's post-extraction resolveExistingPathWithinRoot check to catch
  // either: a hard link shares an inode with its target and appears to
  // stat/realpath as an ORDINARY file already inside scratchDir. A
  // separate verbose listing (`-tvf`) is required to see entry
  // types/link targets — kept as a second pass (rather than parsing
  // -tvf for everything) because its columnar, whitespace-separated
  // format is far less robust to parse for a bare entry name than -tf's
  // own one-name-per-line output above. Both GNU tar and bsdtar print a
  // hard-link entry's mode string starting with the type flag `h`
  // (verified empirically against this repo's own system tar/bsdtar).
  // A legitimate capture-bundle archive (produced by this project's own
  // upload-run.mjs packStagingDir, a plain directory tar with no hard
  // links) never contains one, so this check has zero false-positive
  // risk against real dogfooding uploads.
  let verboseListing;
  try {
    verboseListing = execFile("tar", ["-t", "-v", "-P", "-f", archivePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "listing-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const hardLinkEntry = verboseListing.split("\n").find((line) => line.startsWith("h"));
  if (hardLinkEntry) {
    return { ok: false, reason: "unsafe-entry-path", detail: hardLinkEntry.trim() };
  }

  // Step B: extract into a disposable scratch dir, bounded (see
  // extractBounded's own header comment).
  const scratchDir = mkdtemp(join(tmpdir(), "agda-mcp-team-extract-"));
  const extractResult = await extractBounded(archivePath, scratchDir, maxDecompressedBytes, deps);
  if (!extractResult.ok) {
    return extractResult;
  }

  // Step C (post-extraction realpath containment + cumulative size,
  // ONE combined walk over the now-stable, fully-extracted tree).
  let totalBytes = 0;
  const relPaths = readdir(scratchDir, { recursive: true });
  for (const relPath of relPaths) {
    let contained;
    try {
      contained = resolveExistingPathWithinRoot(scratchDir, relPath);
    } catch (err) {
      if (err instanceof PathSandboxError) {
        rm(scratchDir, { recursive: true, force: true });
        return { ok: false, reason: "post-extraction-escape", detail: relPath };
      }
      throw err;
    }
    const stats = stat(contained);
    if (stats.isFile()) {
      totalBytes += stats.size;
      if (totalBytes > maxDecompressedBytes) {
        rm(scratchDir, { recursive: true, force: true });
        return {
          ok: false,
          reason: "decompressed-size-exceeded",
          detail: `${totalBytes} bytes exceeds ${maxDecompressedBytes}`,
        };
      }
    }
  }

  return {
    ok: true,
    scratchDir,
    cleanup: () => rm(scratchDir, { recursive: true, force: true }),
  };
}
