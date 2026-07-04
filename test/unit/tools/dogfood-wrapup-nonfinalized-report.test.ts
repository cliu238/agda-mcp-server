// MIT License — see LICENSE
//
// Unit tests for scripts/dogfood/dogfood-wrapup.mjs's
// checkReportFinalized(): fix-queue defect 0bc76d15c2fec8df's
// acceptance half. A `finalized:false` run-report.json (written
// incrementally by dogfood-run.mjs, never rewritten with
// finalized:true because the proxy died hard before it could run its
// own graceful shutdown) must be ACCEPTED — never refused outright —
// with a LOUD warning rather than silent acceptance, since the
// recorded actions inside it were durably persisted before the death
// and remain fully trustworthy evidence.

import { afterEach, expect, test, vi } from "vitest";

// @ts-expect-error script module lacks types
import { checkReportFinalized } from "../../../scripts/dogfood/dogfood-wrapup.mjs";

const priorExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = priorExitCode;
});

test("checkReportFinalized: a finalized:false report prints a loud stderr warning and returns false", () => {
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const result = checkReportFinalized({ finalized: false, totalToolCalls: 3 }, "some-run-id");

  expect(result).toBe(false);
  expect(stderrSpy).toHaveBeenCalledTimes(1);
  const [warningText] = stderrSpy.mock.calls[0] as [string];
  expect(warningText).toContain("WARNING");
  expect(warningText).toContain("some-run-id");
  expect(warningText).toContain("finalized:false");
  expect(warningText).toContain("trustworthy");

  stderrSpy.mockRestore();
});

test("checkReportFinalized: a finalized:true report is silent and returns true", () => {
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const result = checkReportFinalized({ finalized: true, totalToolCalls: 3 }, "some-run-id");

  expect(result).toBe(true);
  expect(stderrSpy).not.toHaveBeenCalled();

  stderrSpy.mockRestore();
});

test("checkReportFinalized: a report with no finalized field at all (pre-fix schema) is treated as finalized, silently", () => {
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const result = checkReportFinalized({ totalToolCalls: 1 }, "pre-fix-run-id");

  expect(result).toBe(true);
  expect(stderrSpy).not.toHaveBeenCalled();

  stderrSpy.mockRestore();
});
