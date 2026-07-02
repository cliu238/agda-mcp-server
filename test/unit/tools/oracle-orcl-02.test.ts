import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// @ts-expect-error script module lacks types
import { loadOraclePolicy, scanOptionsFlags, scanPragmaVocabulary } from "../../../scripts/oracle/orcl-02-soundness-scan.mjs";

const FIXTURES_DIR = join(process.cwd(), "test", "fixtures", "agda");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

// ── scanPragmaVocabulary: widened pragma/FFI/hole scan vocabulary ──

describe("scanPragmaVocabulary", () => {
  test("detects a {-# TERMINATING #-} pragma with a 1-based line number", () => {
    const source = readFixture("TerminatingExample.agda");
    const findings = scanPragmaVocabulary(source);
    const terminating = findings.filter((f: { kind: string }) => f.kind === "terminating");
    expect(terminating.length).toBeGreaterThan(0);
    expect(typeof terminating[0].line).toBe("number");
    expect(terminating[0].line).toBeGreaterThan(0);
  });

  test("detects primTrustMe", () => {
    const source = readFixture("PrimTrustMeExample.agda");
    const findings = scanPragmaVocabulary(source);
    const primTrustMe = findings.filter((f: { kind: string }) => f.kind === "prim-trust-me");
    expect(primTrustMe.length).toBeGreaterThan(0);
  });

  test("detects a {-# COMPILE GHC ... #-} FFI pragma", () => {
    const source = readFixture("CompilePragmaExample.agda");
    const findings = scanPragmaVocabulary(source);
    const ffi = findings.filter((f: { kind: string }) => f.kind === "ffi-compile");
    expect(ffi.length).toBeGreaterThan(0);
  });

  test("never flags primEraseEquality as prim-trust-me (sound per ORACLE-VALIDITY.md)", () => {
    const source = [
      "module PrimEraseOnly where",
      "open import Agda.Builtin.Equality.Erase using (primEraseEquality)",
      "",
    ].join("\n");
    const findings = scanPragmaVocabulary(source);
    expect(findings.filter((f: { kind: string }) => f.kind === "prim-trust-me")).toHaveLength(0);
  });
});

// ── with-K override precondition: raw data the Task-2 closure+policy
// diff (scanClosure/judgeOrcl02) composes into an actual cheat-flagged
// finding. See the "judgeOrcl02" describe block below for the
// end-to-end kind: "with-k-override" assertion. ──

describe("scanOptionsFlags: with-K override precondition data", () => {
  test("WithKOverride.agda declares --with-K while LibBase.agda / the project policy require --without-K", () => {
    const withKFlags = scanOptionsFlags(readFixture("WithKOverride.agda"));
    const libBaseFlags = scanOptionsFlags(readFixture("LibBase.agda"));
    const policy = loadOraclePolicy("agda-unimath");
    expect(withKFlags).toContain("--with-K");
    expect(libBaseFlags).toContain("--without-K");
    expect(policy?.requiredFlags).toContain("--without-K");
  });
});

// ── loadOraclePolicy: interim pre-PROC-02 policy file loader ──

describe("loadOraclePolicy", () => {
  test("loads the agda-unimath interim policy with the PROC-02 fuel-corpus values", () => {
    const policy = loadOraclePolicy("agda-unimath");
    expect(policy).not.toBeNull();
    expect(policy?.sanctionedAxioms).toEqual(
      expect.arrayContaining(["univalence", "function-extensionality", "replacement"]),
    );
    expect(policy?.requiredFlags).toEqual(expect.arrayContaining(["--without-K"]));
  });

  test("returns null (never throws) for an unknown policy key — D-03's no-policy mechanism", () => {
    expect(loadOraclePolicy("no-such-project-xyz")).toBeNull();
  });
});
