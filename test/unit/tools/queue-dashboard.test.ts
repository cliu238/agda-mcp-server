// MIT License — see LICENSE
//
// Unit tests for scripts/queue/dashboard.mjs: the D-03 derived
// human-readable dashboard (renderDashboard/regenerateDashboard).
// renderDashboard is asserted to be pure and its own table row order is
// cross-checked directly against sortByPriority — never a hardcoded
// expectation, so the two can never independently drift.
// regenerateDashboard is exercised only against a per-test tmpdir,
// never the real docs/ directory.

import { afterEach, expect, test } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { regenerateDashboard, renderDashboard } from "../../../scripts/queue/dashboard.mjs";
// @ts-expect-error script module lacks types
import { sortByPriority } from "../../../scripts/queue/priority.mjs";

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

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fingerprint: "0000000000000000",
    status: "new",
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

// ── renderDashboard: empty queue ─────────────────────────────────────

test("renderDashboard([]) returns a valid string with the header and a 0-total close-rate line, never throwing", () => {
  const result = renderDashboard([]);

  expect(typeof result).toBe("string");
  expect(result).toContain("# Fix Queue Dashboard");
  expect(result).toContain("0/0");
});

// ── renderDashboard: table row order cross-checked against sortByPriority ─

test("renderDashboard's table row order exactly matches sortByPriority(entries)'s own ordering, never hardcoded", () => {
  const entries = [
    makeEntry({ fingerprint: "aaaaaaaaaaaaaaaa", defectKind: "missing-feature" }),
    makeEntry({ fingerprint: "bbbbbbbbbbbbbbbb", defectKind: "false-green" }),
    makeEntry({ fingerprint: "cccccccccccccccc", defectKind: "crash" }),
  ];

  const expectedOrder = sortByPriority(entries).map((entry: { fingerprint: string }) =>
    entry.fingerprint.slice(0, 8),
  );

  const rendered = renderDashboard(entries);
  const tableLines = rendered
    .split("\n")
    .filter((line: string) => line.startsWith("| ") && !line.includes("---") && !line.includes("Fingerprint"));
  const renderedOrder = tableLines.map((line: string) => line.split("|")[1].trim());

  expect(renderedOrder).toEqual(expectedOrder);
});

// ── close-rate: hand-computed numerator/denominator ─────────────────

test("the close-rate line's numerator/denominator match a hand-computed count for a known status mix", () => {
  const entries = [
    makeEntry({ fingerprint: "1111111111111111", status: "locked" }),
    makeEntry({ fingerprint: "2222222222222222", status: "rejected" }),
    makeEntry({ fingerprint: "3333333333333333", status: "new" }),
    makeEntry({ fingerprint: "4444444444444444", status: "triaged" }),
  ];
  // closed = locked + rejected = 2; total = 4.

  const rendered = renderDashboard(entries);

  expect(rendered).toContain("2/4");
});

// ── WIP-limit: info wording vs warning wording ───────────────────────

test("the WIP-limit line uses info wording at the advisory limit and warning wording once it's exceeded", () => {
  const atLimit = [
    makeEntry({ fingerprint: "aaaa111111111111", status: "fixing" }),
    makeEntry({ fingerprint: "bbbb111111111111", status: "fixing" }),
    makeEntry({ fingerprint: "cccc111111111111", status: "fixing" }),
  ];
  const atLimitRendered = renderDashboard(atLimit);
  expect(atLimitRendered).toContain("3 entries in fixing (advisory WIP limit: 3)");
  expect(atLimitRendered).not.toContain("WARNING");

  const overLimit = [...atLimit, makeEntry({ fingerprint: "dddd111111111111", status: "fixing" })];
  const overLimitRendered = renderDashboard(overLimit);
  expect(overLimitRendered).toContain("WARNING: 4 entries in fixing exceeds the advisory WIP limit of 3");
});

// ── regenerateDashboard: writes atomically to a per-test tmpdir ─────

test("regenerateDashboard writes renderDashboard's own output to a per-test tmpdir, never the real docs/ directory", async () => {
  const dir = makeTempDir("agda-mcp-queue-dashboard-");
  const dashboardPath = join(dir, "FIX-QUEUE-DASHBOARD.md");
  const entries = [makeEntry({ fingerprint: "eeee222222222222" })];

  await regenerateDashboard(entries, dashboardPath);

  expect(existsSync(dashboardPath)).toBe(true);
  expect(readFileSync(dashboardPath, "utf8")).toBe(renderDashboard(entries));
});
