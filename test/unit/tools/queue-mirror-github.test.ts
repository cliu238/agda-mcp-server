// MIT License — see LICENSE
//
// Unit tests for scripts/queue/mirror-github.mjs: the QUEUE-04 GitHub
// Issues mirror. Every test in this file is fully mocked via the
// deps.execFileSync DI seam — ZERO live `gh` invocations occur anywhere
// in this suite, and no test ever writes to the committed
// test/fixtures/fix-queue.json.
//
// Assertion (1) is THE MANDATORY ONE: it proves the mirror does not
// shell out by default. Assertion (5) proves a pre-existing
// entry.issue[] number (e.g. the flagship's [64, 61]) routes to
// `gh issue edit`, never `gh issue create` (RESEARCH.md Pitfall 2).
// Assertion (8) closes D-12's multi-run idempotency loop: a freshly
// created-and-persisted backlink must route a SECOND --execute run to
// edit, never create.

import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { buildMirrorPayload, isGhAvailable, mirrorEntry } from "../../../scripts/queue/mirror-github.mjs";

// @ts-expect-error script module lacks types
import { readQueueFile, upsertQueueEntry } from "../../../scripts/queue/intake.mjs";

import { fixQueueEntrySchema } from "../../../test/fixtures/fix-queue.js";

// ── Test scaffolding ─────────────────────────────────────────────────

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

function baseEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fingerprint: "fp-mirror-base",
    status: "triaged",
    defectKind: "crash",
    triageClass: null,
    triageConfidence: null,
    recurrence: 1,
    title: "Example defect",
    summary: "A short summary.",
    affectedTool: "agda_load",
    capturePath: null,
    verdictPath: null,
    matrixEntryId: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

/**
 * A fake `execFileSync` that only records/responds to `gh issue ...`
 * invocations — `gh --version`/`gh auth status` probes made internally
 * by `isGhAvailable` succeed silently (empty string, never throws) and
 * are NOT what these tests care about. `issueCallsOf` below filters a
 * fake's recorded calls down to the actual `gh issue create`/`gh issue
 * edit` invocation(s), so "the fake was called exactly once" always
 * means exactly one real mutating gh call, regardless of how many
 * availability probes ran first.
 */
function makeIssueAwareExecFileSync(issueCallReturn = "") {
  return vi.fn((_cmd: string, args: string[], _opts: Record<string, unknown>) => {
    if (Array.isArray(args) && args[0] === "issue") {
      return issueCallReturn;
    }
    return "";
  });
}

function issueCallsOf(fake: ReturnType<typeof makeIssueAwareExecFileSync>) {
  return fake.mock.calls.filter((call) => Array.isArray(call[1]) && call[1][0] === "issue");
}

// ── (1) THE MANDATORY ONE: dry-run is the default ───────────────────

test("mirrorEntry never shells out by default (dry-run is the default)", () => {
  const entry = fixQueueEntrySchema.parse(baseEntry({ fingerprint: "fp-default-dry-run" }));

  // (a) No second argument at all.
  const resultNoOptions = mirrorEntry(entry);
  expect(resultNoOptions).toMatchObject({ skipped: true, reason: "dry-run" });

  // (b) options.deps supplied but options.execute is NOT set — still
  // dry-run, and the fake must never be invoked, proving the mirror
  // does not mutate a real repo unless a caller explicitly opts in.
  const fakeExecFileSync = vi.fn();
  const result = mirrorEntry(entry, { deps: { execFileSync: fakeExecFileSync } });
  expect(result).toMatchObject({ skipped: true, reason: "dry-run" });
  expect(fakeExecFileSync).toHaveBeenCalledTimes(0);
});

// ── (2) D-13: status "new" is never eligible, even with execute:true ─

test("mirrorEntry skips a status:new entry as not-eligible, even with execute:true", () => {
  const entry = fixQueueEntrySchema.parse(baseEntry({ fingerprint: "fp-new-status", status: "new" }));
  const fakeExecFileSync = vi.fn();

  const result = mirrorEntry(entry, { execute: true, deps: { execFileSync: fakeExecFileSync } });

  expect(result).toEqual({ skipped: true, reason: "not-eligible-status" });
  expect(fakeExecFileSync).toHaveBeenCalledTimes(0);
});

// ── (3) Create path: argv array, shell:false, parsed issue number ───

test("mirrorEntry creates a new issue via an execFileSync argv array with shell:false, parsing the returned issue number", () => {
  const entry = fixQueueEntrySchema.parse(baseEntry({ fingerprint: "fp-create" }));
  const fakeExecFileSync = makeIssueAwareExecFileSync(
    "https://github.com/InvariantHoldings/agda-mcp-server/issues/999\n",
  );

  const result = mirrorEntry(entry, { execute: true, deps: { execFileSync: fakeExecFileSync } });

  const calls = issueCallsOf(fakeExecFileSync);
  expect(calls).toHaveLength(1);

  const [cmd, args, opts] = calls[0] as [string, string[], Record<string, unknown>];
  expect(cmd).toBe("gh");
  expect(Array.isArray(args)).toBe(true);
  expect(args[0]).toBe("issue");
  expect(args[1]).toBe("create");
  for (const arg of args) {
    expect(arg).not.toContain(";");
    expect(arg).not.toContain("&&");
    expect(arg).not.toContain("`");
  }
  expect(opts).toMatchObject({ shell: false });

  expect(result).toMatchObject({ created: true, githubIssue: 999 });
});

// ── (4) Update path: a pre-set entry.githubIssue routes to edit ─────

test("mirrorEntry routes an entry with a pre-set githubIssue to gh issue edit, never create", () => {
  const entry = fixQueueEntrySchema.parse(baseEntry({ fingerprint: "fp-edit-known", githubIssue: 61 }));
  const fakeExecFileSync = makeIssueAwareExecFileSync();

  const result = mirrorEntry(entry, { execute: true, deps: { execFileSync: fakeExecFileSync } });

  const calls = issueCallsOf(fakeExecFileSync);
  expect(calls).toHaveLength(1);

  const [, args] = calls[0] as [string, string[], Record<string, unknown>];
  expect(args[0]).toBe("issue");
  expect(args[1]).toBe("edit");
  expect(args).toContain("61");
  expect(args).not.toContain("create");

  expect(result).toMatchObject({ updated: true, githubIssue: 61 });
});

// ── (5) [BLOCKER-FIX] Pre-existing entry.issue[] routes to edit ─────
// The exact scenario RESEARCH.md's Pitfall 2 names: the flagship's
// pre-existing, already-open GitHub issue array with no mirror
// backlink yet must never be treated as "unlinked".

test("mirrorEntry routes a pre-existing entry.issue[] number to gh issue edit, never create (RESEARCH.md Pitfall 2)", () => {
  const entry = fixQueueEntrySchema.parse(
    baseEntry({ fingerprint: "fp-preexisting-issue-array", issue: [64, 61] }),
  );
  const fakeExecFileSync = makeIssueAwareExecFileSync();

  const result = mirrorEntry(entry, { execute: true, deps: { execFileSync: fakeExecFileSync } });

  const calls = issueCallsOf(fakeExecFileSync);
  expect(calls).toHaveLength(1);

  const [, args] = calls[0] as [string, string[], Record<string, unknown>];
  expect(args[0]).toBe("issue");
  expect(args[1]).toBe("edit");
  expect(args).toContain("64");
  expect(args).not.toContain("create");

  expect(result).toMatchObject({ updated: true, githubIssue: 64 });
});

// ── (6) D-11 whitelist: buildMirrorPayload + rendered body ──────────

test("buildMirrorPayload whitelists exactly 6 fields; the rendered body never leaks notes/capturePath", () => {
  const entry = fixQueueEntrySchema.parse(
    baseEntry({
      fingerprint: "fp-whitelist",
      notes: "private stuff",
      capturePath: "/some/path",
    }),
  );

  const payload = buildMirrorPayload(entry);
  expect(Object.keys(payload).sort()).toEqual(
    ["defectKind", "fingerprint", "status", "summary", "title", "triageClass"].sort(),
  );

  const dryRun = mirrorEntry(entry);
  expect(dryRun.body).not.toContain("private stuff");
  expect(dryRun.body).not.toContain("capturePath");
});

// ── (7) isGhAvailable never throws ───────────────────────────────────

test("isGhAvailable returns false without propagating a thrown error", () => {
  const result = isGhAvailable({
    deps: {
      execFileSync: () => {
        throw new Error("boom");
      },
    },
  });

  expect(result).toBe(false);
});

// ── (8) [D-12 BACKLINK-PERSISTENCE] multi-run idempotency ───────────
// Proves the full round trip scriptMain performs internally on
// --execute: create once, persist the backlink via upsertQueueEntry,
// and every subsequent run against the persisted entry edits instead
// of duplicating. Uses an isolated mkdtempSync scratch queue file —
// never the committed test/fixtures/fix-queue.json.

test("a second --execute run against a freshly-persisted backlink routes to edit, never create (D-12 multi-run idempotency)", async () => {
  const dir = makeTempDir("agda-mcp-queue-mirror-");
  const scratchQueuePath = join(dir, "fix-queue.json");
  writeFileSync(scratchQueuePath, "[]\n", "utf8");

  const entry = fixQueueEntrySchema.parse(baseEntry({ fingerprint: "fp-multi-run" }));
  await upsertQueueEntry(entry, scratchQueuePath);

  // First run: no githubIssue, no issue[] — routes to create.
  const fakeCreateExecFileSync = makeIssueAwareExecFileSync(
    "https://github.com/InvariantHoldings/agda-mcp-server/issues/777\n",
  );
  const createResult = mirrorEntry(entry, {
    execute: true,
    deps: { execFileSync: fakeCreateExecFileSync },
  });
  expect(createResult).toMatchObject({ created: true, githubIssue: 777 });

  // scriptMain's own D-12 step: persist the backlink onto the real
  // entry via the Plan 04-01 write primitive — never a new write path.
  await upsertQueueEntry({ ...entry, githubIssue: createResult.githubIssue }, scratchQueuePath);

  const persisted = readQueueFile(scratchQueuePath).find(
    (candidate: { fingerprint: string }) => candidate.fingerprint === entry.fingerprint,
  );
  expect(persisted.githubIssue).toBe(777);

  // Second run against the persisted entry: githubIssue is now set, so
  // this MUST route to edit, never create again.
  const fakeEditExecFileSync = makeIssueAwareExecFileSync();
  const editResult = mirrorEntry(persisted, {
    execute: true,
    deps: { execFileSync: fakeEditExecFileSync },
  });

  const calls = issueCallsOf(fakeEditExecFileSync);
  expect(calls).toHaveLength(1);

  const [, args] = calls[0] as [string, string[], Record<string, unknown>];
  expect(args).toContain("edit");
  expect(args).toContain("777");
  expect(args).not.toContain("create");

  expect(editResult).toMatchObject({ updated: true, githubIssue: 777 });
});
