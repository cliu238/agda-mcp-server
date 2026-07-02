// MIT License — see LICENSE
//
// Unit tests for the capture-regression matrix's typed loader (D-01
// idiom, mirrors test/unit/reporting/release-bug-matrix.test.ts):
// the matrix must parse (even empty), every id must be unique, every
// referenced fixture/mutation path must actually exist on disk, and
// every errorCategories entry must be a bare category tag (never raw
// text - LOCK-02's "normalized envelope, never raw text").

import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { captureRegressionMatrix } from "../../fixtures/capture-regression-matrix.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const FIXTURES_AGDA_ROOT = resolve(REPO_ROOT, "test/fixtures/agda");

test("capture regression matrix loads and validates, even when empty", () => {
  expect(Array.isArray(captureRegressionMatrix)).toBe(true);
});

test("capture regression matrix entries have unique ids", () => {
  const ids = captureRegressionMatrix.map((entry) => entry.id);

  expect(new Set(ids).size).toBe(ids.length);
});

test("capture regression matrix entries reference existing fixture files", () => {
  for (const entry of captureRegressionMatrix) {
    expect(
      existsSync(
        resolve(FIXTURES_AGDA_ROOT, entry.fixtureDir, entry.entryFile),
      ),
    ).toBe(true);

    if (entry.mutation) {
      expect(
        existsSync(
          resolve(
            FIXTURES_AGDA_ROOT,
            entry.fixtureDir,
            entry.mutation.targetFile,
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          resolve(
            FIXTURES_AGDA_ROOT,
            entry.fixtureDir,
            entry.mutation.sourceFile,
          ),
        ),
      ).toBe(true);
    }
  }
});

test("capture regression matrix errorCategories are bare tags, never raw messages", () => {
  for (const entry of captureRegressionMatrix) {
    for (const category of entry.expected.errorCategories) {
      expect(category).not.toMatch(/\s/);
    }
  }
});
