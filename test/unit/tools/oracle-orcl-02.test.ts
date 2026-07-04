import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  diffAgainstWhitelist,
  judgeOrcl02,
  loadOraclePolicy,
  PolicyResolutionError,
  scanClosure,
  scanOptionsFlags,
  scanPragmaVocabulary,
  walkClosureFiles,
  // @ts-expect-error script module lacks types
} from "../../../scripts/oracle/orcl-02-soundness-scan.mjs";

const FIXTURES_DIR = join(process.cwd(), "test", "fixtures", "agda");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

/** A synthetic single-action CaptureArtifact JSON, minimal shape sufficient for judgeOrcl02 to resolve a target. */
function writeCaptureArtifact(
  dir: string,
  loadedFile: string,
  classification: string,
): string {
  const artifactPath = join(dir, "capture.json");
  writeFileSync(
    artifactPath,
    JSON.stringify({
      manifest: { repoRoot: dir, agdaVersion: null },
      recordedActions: [
        {
          tool: "agda_load",
          args: {},
          timestamp: 0,
          normalizedResponse: { data: { file: loadedFile, classification } },
        },
      ],
    }),
    "utf8",
  );
  return artifactPath;
}

/** Downstream.agda `open import`s Upstream.agda, which postulates `postulateName`. */
function buildClosureFixture(postulateName: string): { dir: string; artifactPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "orcl-02-closure-"));
  writeFileSync(
    join(dir, "Upstream.agda"),
    `module Upstream where\n\npostulate\n  ${postulateName} : Set\n`,
    "utf8",
  );
  writeFileSync(
    join(dir, "Downstream.agda"),
    "module Downstream where\n\nopen import Upstream\n",
    "utf8",
  );
  const artifactPath = writeCaptureArtifact(dir, "Downstream.agda", "ok-complete");
  return { dir, artifactPath };
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

  // Plan-level success criteria names all 7 cheat shapes explicitly
  // (postulate, TERMINATING, NO_POSITIVITY_CHECK/NO_UNIVERSE_CHECK,
  // primTrustMe, COMPILE/FOREIGN, --with-K override, residual holes).
  // The two below and the bare-hole/{! !} cases round out direct
  // coverage of the remaining named shapes not otherwise exercised by
  // a standalone fixture above.

  test("detects a {-# NO_POSITIVITY_CHECK #-} pragma", () => {
    const source = [
      "module NoPositivityExample where",
      "",
      "{-# NO_POSITIVITY_CHECK #-}",
      "data Bad : Set where",
      "  bad : (Bad → Bad) → Bad",
      "",
    ].join("\n");
    const findings = scanPragmaVocabulary(source);
    const noPositivity = findings.filter((f: { kind: string }) => f.kind === "no-positivity-check");
    expect(noPositivity.length).toBeGreaterThan(0);
    expect(noPositivity[0].line).toBe(3);
  });

  test("detects a {-# NO_UNIVERSE_CHECK #-} pragma", () => {
    const source = [
      "module NoUniverseExample where",
      "",
      "{-# NO_UNIVERSE_CHECK #-}",
      "data Type : Set where",
      "  wrap : Set → Type",
      "",
    ].join("\n");
    const findings = scanPragmaVocabulary(source);
    const noUniverse = findings.filter((f: { kind: string }) => f.kind === "no-universe-check");
    expect(noUniverse.length).toBeGreaterThan(0);
    expect(noUniverse[0].line).toBe(3);
  });

  test("detects a bare residual hole (?)", () => {
    const source = "module BareHole where\n\nholeOnly : Set\nholeOnly = ?\n";
    const findings = scanPragmaVocabulary(source);
    const holes = findings.filter((f: { kind: string }) => f.kind === "residual-hole");
    expect(holes.length).toBeGreaterThan(0);
    expect(holes[0].line).toBe(4);
  });

  test("detects an extended {! ... !} hole", () => {
    const source = "module ExtendedHole where\n\nholeOnly : Set\nholeOnly = {! !}\n";
    const findings = scanPragmaVocabulary(source);
    const holes = findings.filter((f: { kind: string }) => f.kind === "residual-hole");
    expect(holes.length).toBeGreaterThan(0);
    expect(holes[0].line).toBe(4);
  });

  // ── WR-01: comment/string blindness regressions. Tokens that live
  // ONLY inside `--` line comments, string literals, or a commented-out
  // pragma must produce NO findings (they previously misfired). ──

  test("WR-01: a bare ? inside a line comment or string literal is NOT flagged as a residual hole", () => {
    const source = [
      "module CommentsAndStrings where",
      "-- is this right?",
      "greeting : String",
      'greeting = "really?"',
    ].join("\n");
    const holes = scanPragmaVocabulary(source).filter((f: { kind: string }) => f.kind === "residual-hole");
    expect(holes).toHaveLength(0);
  });

  test("WR-01: a commented-out `-- {-# TERMINATING #-}` pragma is NOT flagged", () => {
    const source = [
      "module CommentedTerminating where",
      "-- {-# TERMINATING #-}",
      "loop : Set",
      "loop = Set",
    ].join("\n");
    const terminating = scanPragmaVocabulary(source).filter((f: { kind: string }) => f.kind === "terminating");
    expect(terminating).toHaveLength(0);
  });

  test("WR-01: a real pragma survives a trailing `-- ?` comment while the comment's ? is ignored", () => {
    const source = [
      "module RealPragmaPlusComment where",
      "{-# TERMINATING #-}   -- why is this here?",
      "loop : Set",
      "loop = loop",
    ].join("\n");
    const findings = scanPragmaVocabulary(source);
    expect(findings.filter((f: { kind: string }) => f.kind === "terminating")).toHaveLength(1);
    expect(findings.filter((f: { kind: string }) => f.kind === "residual-hole")).toHaveLength(0);
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

  test("WR-01: a commented-out `-- {-# OPTIONS --with-K #-}` yields no flags", () => {
    const source = ["-- {-# OPTIONS --with-K #-}", "module CommentedOptions where"].join("\n");
    expect(scanOptionsFlags(source)).not.toContain("--with-K");
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

  test("CR-01: rejects a policy key with path-traversal segments instead of loading an out-of-directory file", () => {
    // `../oracle-policy/agda-unimath` traverses out of and back into the
    // policy directory, landing on the REAL agda-unimath.json — the
    // vulnerable interpolation loaded it (non-null). Any key that is not
    // a single bare filename segment must now degrade to null (D-03
    // no-policy), never an out-of-directory file read.
    expect(loadOraclePolicy("../oracle-policy/agda-unimath")).toBeNull();
    expect(loadOraclePolicy("../../../etc/passwd")).toBeNull();
    expect(loadOraclePolicy("..")).toBeNull();
    expect(loadOraclePolicy(".")).toBeNull();
    expect(loadOraclePolicy("foo/bar")).toBeNull();
    expect(loadOraclePolicy("")).toBeNull();
  });
});

// ── walkClosureFiles / scanClosure: transitive dependency closure ──

describe("walkClosureFiles + scanClosure", () => {
  test("the closure includes an upstream dependency, not just the target file", () => {
    const { dir } = buildClosureFixture("upstreamAxiom");
    const files = walkClosureFiles(dir, "Downstream.agda", undefined);
    expect(files).toEqual(expect.arrayContaining(["Downstream.agda", "Upstream.agda"]));
  });

  test("scanClosure finds the postulate declared in the upstream file, tagged with its own path", () => {
    const { dir } = buildClosureFixture("upstreamAxiom");
    const findings = scanClosure(dir, "Downstream.agda", undefined, null);
    const postulateFinding = findings.find(
      (f: { kind: string; detail: string }) => f.kind === "postulate" && f.detail === "upstreamAxiom",
    );
    expect(postulateFinding).toBeDefined();
    expect(postulateFinding.file).toBe("Upstream.agda");
  });

  test("CR-02: an absolute or ..-escaping target file is contained, never read from outside repoRoot", () => {
    const dir = mkdtempSync(join(tmpdir(), "orcl-02-escape-"));
    // A capture whose data.file is an absolute path outside the repo
    // root: the vulnerable code seeded the closure with it and read it;
    // now the closure is empty (nothing safely scannable).
    expect(walkClosureFiles(dir, "/etc/hosts", undefined)).toEqual([]);
    expect(scanClosure(dir, "/etc/hosts", undefined, null)).toEqual([]);
    // A `..`-climbing relative target is likewise contained.
    expect(walkClosureFiles(dir, "../../../../../../etc/hosts", undefined)).toEqual([]);
    expect(scanClosure(dir, "../../../../../../etc/hosts", undefined, null)).toEqual([]);
  });
});

// ── diffAgainstWhitelist: sanctioned-axiom / D-08 residual-hole gate ──

describe("diffAgainstWhitelist", () => {
  test("marks every finding unsanctioned when policy is null (D-03: caller routes to no-policy)", () => {
    const findings = [{ file: "Upstream.agda", line: 3, kind: "postulate", detail: "upstreamAxiom" }];
    const diffed = diffAgainstWhitelist(findings, null, null);
    expect(diffed[0].sanctioned).toBe(false);
  });

  test("a residual-hole finding is sanctioned iff the warm classification is ok-with-holes (D-08)", () => {
    const finding = { file: "HoleOnly.agda", line: 3, kind: "residual-hole", detail: "?" };
    const policy = loadOraclePolicy("agda-unimath");
    const excused = diffAgainstWhitelist([finding], policy, "ok-with-holes");
    const notExcused = diffAgainstWhitelist([finding], policy, "ok-complete");
    const noClassification = diffAgainstWhitelist([finding], policy, null);
    expect(excused[0].sanctioned).toBe(true);
    expect(notExcused[0].sanctioned).toBe(false);
    expect(noClassification[0].sanctioned).toBe(false);
  });
});

// ── judgeOrcl02: the standalone-runnable ORCL-02 predicate ──

describe("judgeOrcl02", () => {
  test("Test 1: no-policy — the closure walk catches a postulate declared in an upstream dependency", async () => {
    const { artifactPath } = buildClosureFixture("upstreamAxiom");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: null });
    expect(outcome.kind).toBe("no-policy");
    const postulateFindings = outcome.findings.filter((f: { kind: string }) => f.kind === "postulate");
    expect(postulateFindings.some((f: { detail: string }) => f.detail === "upstreamAxiom")).toBe(true);
  });

  test("Test 2: clean — a postulate whose name IS in the policy's sanctionedAxioms", async () => {
    const { artifactPath } = buildClosureFixture("univalence");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: "agda-unimath" });
    expect(outcome.kind).toBe("clean");
  });

  test("Test 3: cheat-flagged — a postulate whose name is NOT in the policy's sanctionedAxioms", async () => {
    const { artifactPath } = buildClosureFixture("notWhitelistedAxiom");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: "agda-unimath" });
    expect(outcome.kind).toBe("cheat-flagged");
    const finding = outcome.findings.find(
      (f: { kind: string; detail: string }) => f.kind === "postulate" && f.detail === "notWhitelistedAxiom",
    );
    expect(finding?.sanctioned).toBe(false);
  });

  test("Test 4: cheat-flagged — LibBase/WithKOverride --with-K override, regardless of sanctionedAxioms", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orcl-02-withk-"));
    writeFileSync(join(dir, "LibBase.agda"), readFixture("LibBase.agda"), "utf8");
    writeFileSync(join(dir, "WithKOverride.agda"), readFixture("WithKOverride.agda"), "utf8");
    const artifactPath = writeCaptureArtifact(dir, "WithKOverride.agda", "ok-complete");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: "agda-unimath" });
    expect(outcome.kind).toBe("cheat-flagged");
    const finding = outcome.findings.find((f: { kind: string }) => f.kind === "with-k-override");
    expect(finding).toBeDefined();
    expect(finding.sanctioned).toBe(false);
  });

  test("Test 5 (D-08 gate): a residual hole is NOT a cheat when the warm classification is ok-with-holes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orcl-02-hole-"));
    writeFileSync(join(dir, "HoleOnly.agda"), "module HoleOnly where\n\nholeOnly : Set\nholeOnly = ?\n", "utf8");
    const artifactPath = writeCaptureArtifact(dir, "HoleOnly.agda", "ok-with-holes");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: "agda-unimath" });
    expect(outcome.kind).toBe("clean");
  });

  test("Test 6 (D-08 gate, contrast): the SAME residual hole IS a cheat when the warm classification is ok-complete", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orcl-02-hole-"));
    writeFileSync(join(dir, "HoleOnly.agda"), "module HoleOnly where\n\nholeOnly : Set\nholeOnly = ?\n", "utf8");
    const artifactPath = writeCaptureArtifact(dir, "HoleOnly.agda", "ok-complete");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: "agda-unimath" });
    expect(outcome.kind).toBe("cheat-flagged");
    const finding = outcome.findings.find((f: { kind: string }) => f.kind === "residual-hole");
    expect(finding?.sanctioned).toBe(false);
  });

  test("judgeOrcl02 returns no-target when there is no load-family recorded action", async () => {
    const dir = mkdtempSync(join(tmpdir(), "orcl-02-notarget-"));
    const artifactPath = join(dir, "capture.json");
    writeFileSync(
      artifactPath,
      JSON.stringify({ manifest: { repoRoot: dir, agdaVersion: null }, recordedActions: [] }),
      "utf8",
    );
    const outcome = await judgeOrcl02(artifactPath, { policyKey: null });
    expect(outcome.kind).toBe("no-target");
  });

  test("derives the policy key from the project's .agda-lib name field when options.policyKey is omitted", async () => {
    const { dir, artifactPath } = buildClosureFixture("univalence");
    writeFileSync(join(dir, "project.agda-lib"), "name: agda-unimath\ndepend:\ninclude: .\n", "utf8");
    const outcome = await judgeOrcl02(artifactPath, {});
    expect(outcome.kind).toBe("clean");
  });
});

// ── Policy resolution is case-exact and loud (POLICY-01) ────────────
//
// D-02: never case-normalize — a case-mismatched key is a MISMATCH,
// not an ABSENCE, and must reject identically on every platform
// (case-insensitive macOS APFS vs. case-sensitive Linux ext4). D-03:
// an EXPECTED-but-unresolvable key (explicit --policy, or a derived
// key whose file exists but fails to load) is a loud hard failure; a
// genuinely-no-policy-anywhere repo keeps v1.0's no-policy outcome.
// These tests encode the REAL CHG shape (.agda-lib name
// Codex-Homotopy-Group vs on-disk codex-homotopy-group.json) per
// REQUIREMENTS.md's own literal wording, and run UNGATED (no
// integration-test environment gate, no Agda subprocess) so they
// prove themselves on ubuntu-latest CI's case-sensitive ext4 — the
// phase's hard acceptance gate (success criterion 2).

describe("policy resolution is case-exact and loud (POLICY-01)", () => {
  test("Test A: a derived key from a real CHG-shaped .agda-lib name (Codex-Homotopy-Group) rejects with a case-mismatch PolicyResolutionError", async () => {
    const { dir, artifactPath } = buildClosureFixture("upstreamAxiom");
    writeFileSync(join(dir, "project.agda-lib"), "name: Codex-Homotopy-Group\ndepend:\ninclude: .\n", "utf8");

    await expect(judgeOrcl02(artifactPath, {})).rejects.toThrow(PolicyResolutionError);
    await expect(judgeOrcl02(artifactPath, {})).rejects.toThrow(/Codex-Homotopy-Group/);
    await expect(judgeOrcl02(artifactPath, {})).rejects.toThrow(/codex-homotopy-group\.json/);
    await expect(judgeOrcl02(artifactPath, {})).rejects.toThrow(/oracle-policy/);
  });

  test("Test B: an explicit --policy value with the same mismatched case (Codex-Homotopy-Group) rejects the same way as the derived path", async () => {
    const { artifactPath } = buildClosureFixture("upstreamAxiom");

    await expect(judgeOrcl02(artifactPath, { policyKey: "Codex-Homotopy-Group" })).rejects.toThrow(
      PolicyResolutionError,
    );
    await expect(judgeOrcl02(artifactPath, { policyKey: "Codex-Homotopy-Group" })).rejects.toThrow(
      /codex-homotopy-group\.json/,
    );
    await expect(judgeOrcl02(artifactPath, { policyKey: "Codex-Homotopy-Group" })).rejects.toThrow(/oracle-policy/);
  });

  test("Test C: an explicit --policy value with the exact on-disk case (codex-homotopy-group) resolves the real policy normally", async () => {
    const { artifactPath } = buildClosureFixture("univalence");
    const outcome = await judgeOrcl02(artifactPath, { policyKey: "codex-homotopy-group" });
    expect(outcome.kind).toBe("clean");
  });

  test("Test D: an explicit key with no on-disk file and no case variant rejects, naming the key and the oracle-policy dir", async () => {
    const { artifactPath } = buildClosureFixture("upstreamAxiom");

    await expect(judgeOrcl02(artifactPath, { policyKey: "no-such-policy-zzz" })).rejects.toThrow(
      PolicyResolutionError,
    );
    await expect(judgeOrcl02(artifactPath, { policyKey: "no-such-policy-zzz" })).rejects.toThrow(
      /no-such-policy-zzz/,
    );
    await expect(judgeOrcl02(artifactPath, { policyKey: "no-such-policy-zzz" })).rejects.toThrow(/oracle-policy/);
  });

  test("Test E (v1.0 semantics preserved): a derived key with no on-disk file and no case variant returns kind no-policy, never a throw", async () => {
    const { dir, artifactPath } = buildClosureFixture("upstreamAxiom");
    writeFileSync(
      join(dir, "project.agda-lib"),
      "name: totally-unknown-project-zzz\ndepend:\ninclude: .\n",
      "utf8",
    );

    const outcome = await judgeOrcl02(artifactPath, {});
    expect(outcome.kind).toBe("no-policy");
    expect(outcome.findings.length).toBeGreaterThan(0);
  });

  test("Test F (CR-01 upgrade): an explicit traversal-shaped key rejects loudly; a derived traversal-shaped name still degrades to no-policy (unchanged)", async () => {
    const { artifactPath: explicitArtifactPath } = buildClosureFixture("upstreamAxiom");
    await expect(judgeOrcl02(explicitArtifactPath, { policyKey: "../evil" })).rejects.toThrow(
      PolicyResolutionError,
    );

    const { dir, artifactPath } = buildClosureFixture("upstreamAxiom");
    writeFileSync(join(dir, "project.agda-lib"), "name: ../evil\ndepend:\ninclude: .\n", "utf8");
    const outcome = await judgeOrcl02(artifactPath, {});
    expect(outcome.kind).toBe("no-policy");
  });
});
