// MIT License — see LICENSE
//
// The regression-test emitter (LOCK-01/LOCK-02, Phase 3 Plan 02): turns
// a captured defect + a FRESH oracle verdict into ONE capture-
// regression matrix entry (D-01 — data, never a generated per-defect
// .test.ts) plus the fixture files that entry points at, materialized
// under the tracked test/fixtures/agda/ tree. Refuses to lock a
// capture whose ORCL-01 is inconclusive, whose ORCL-02 is cheat-
// flagged or no-policy-with-non-empty-findings (D-06), or whose
// observed replay already matches the proposed expected value (D-05 —
// nothing to demonstrate RED with).
//
// Ships as a `scripts/` + repo-data-dir artifact per D-05 (see
// .planning/phases/03-.../03-CONTEXT.md) — no new MCP verb, no new
// src/ tool surface.
//
// Run with: npx tsx scripts/emit-regression.mjs <path-to-artifact.json> [flags]
// (NOT plain `node` — this script's src/ + test/ imports use
// .js-suffixed specifiers pointing at sibling .ts files; Node's native
// TS type-stripping does not rewrite .js -> .ts, so plain node fails
// with ERR_MODULE_NOT_FOUND on the first such import. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file — see orcl-01-differential.mjs's
// header for the same note.)

import { dirname, extname, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { isMainModule } from "./test-with-sentinel.mjs";
import { runOracle } from "./oracle/run-oracle.mjs";
import { findWarmLoadTuple } from "./oracle/orcl-01-differential.mjs";

import { PathSandboxError, resolveFileWithinRoot, SERVER_REPO_ROOT } from "../src/repo-root.js";
import { writeFileAtomic } from "../src/session/safe-source-io.js";
import { captureRegressionEntrySchema } from "../test/fixtures/capture-regression-matrix.js";
import { replayCaptureRegressionEntry } from "../test/helpers/capture-regression-runner.js";

// ── judgeRefusal ─────────────────────────────────────────────────────

/**
 * Decide whether a fresh D-02 verdict may ever become a permanent
 * capture-regression lock (D-06). Returns a human-readable refusal
 * reason string, or `null` when nothing blocks locking. Checked in a
 * fixed order — the first three conditions ALWAYS refuse regardless of
 * `options.force`; only the fourth ("nothing meaningful to lock") is
 * overridable, since it is a "there is nothing to prove RED for" call
 * rather than a soundness/trustworthiness concern.
 *
 * `verdict.orcl03` is NEVER read here — ORCL-03 is advisory in every
 * state (D-02/D-06) and can never gate this decision.
 */
export function judgeRefusal(verdict, options = {}) {
  if (verdict.orcl01.kind === "inconclusive") {
    return `ORCL-01 inconclusive (probe: ${verdict.orcl01.probe}) — no trustworthy expected value`;
  }
  if (verdict.orcl02.kind === "cheat-flagged") {
    return "ORCL-02 flagged a cheat — never golden-master a postulate/flag cheat as correct";
  }
  if (verdict.orcl02.kind === "no-policy" && verdict.orcl02.findings.length > 0) {
    return "ORCL-02 has no whitelist policy AND non-empty findings — cannot distinguish cheat from sanctioned axiom";
  }
  if (verdict.orcl01.kind !== "server-false-green-candidate") {
    if (options.force !== true) {
      return `ORCL-01 outcome "${verdict.orcl01.kind}" has nothing meaningful to lock — pass --force to override`;
    }
    // --force was given, but only a server-false-green-candidate carries
    // a coldTuple/coldCategories (the expected RED value composeEntry
    // locks against). Every outcome --force newly permits here (pass /
    // skip) has none, so --force can never actually produce an entry —
    // fail closed with a clear reason BEFORE any fixture write, rather
    // than materializing files and then crashing in composeEntry (CR-02).
    if (verdict.orcl01.coldTuple === undefined) {
      return `ORCL-01 outcome "${verdict.orcl01.kind}" has no cold differential (coldTuple) to lock — --force cannot fabricate an expected RED value`;
    }
  }
  return null;
}

// ── stripFixtureDirPrefix (internal, defensive-only) ────────────────

/**
 * `primaryArtifact.manifest.inlinedFirstPartySources[].path` values are
 * recorded relative to the CAPTURING SESSION's own `repoRoot`
 * (`src/agda/session-capture/manifest-builder.ts`). When that
 * `repoRoot` CONTAINS `fixtureDir` as a subdirectory (the real
 * flagship shape — the harness's `projectRoot` is an outer mkdtemp
 * root, and the loaded file lives at `<root>/<fixtureDir>/Main.agda`),
 * every captured path is ALREADY `fixtureDir`-prefixed. This strips
 * that prefix so a bare filename (matching the matrix schema's
 * `entryFile`/`mutation.*` contract) is used everywhere else — never
 * assumes the prefix is present, since some captures may already
 * record bare paths (the defensive fallback, Test G3).
 */
function stripFixtureDirPrefix(path, fixtureDir) {
  if (path === fixtureDir || path.startsWith(`${fixtureDir}/`)) {
    return path.slice(fixtureDir.length + 1);
  }
  return path;
}

// ── materializeFixtureFiles ──────────────────────────────────────────

/** `Dep.agda` -> `Dep.broken.agda`; a directory-prefixed bare path
 *  (`sub/Dep.agda`) keeps its directory (`sub/Dep.broken.agda`); a
 *  bare path with no extension gets a trailing `.broken`. */
function insertBrokenSuffix(barePath) {
  const slashIdx = barePath.lastIndexOf("/");
  const dir = slashIdx === -1 ? "" : barePath.slice(0, slashIdx + 1);
  const filename = slashIdx === -1 ? barePath : barePath.slice(slashIdx + 1);
  const ext = extname(filename);
  if (ext === "") {
    return `${dir}${filename}.broken`;
  }
  const stem = filename.slice(0, filename.length - ext.length);
  return `${dir}${stem}.broken${ext}`;
}

/**
 * Write `content` to `test/fixtures/agda/<fixtureDir>/<barePath>`
 * under `repoRoot`, sandboxed via `resolveFileWithinRoot` (D-08's NEW
 * containment site: the TRACKED repo tree, not a tmpdir). A `barePath`
 * that escapes the sandbox is silently skipped (never written anywhere
 * — mirrors `materializeCaptureEnvironment`'s existing skip-on-
 * traversal behavior) and this returns `null`; otherwise returns the
 * absolute path actually written, so callers can track/roll back every
 * write this function performs.
 */
function writeFixtureFile(repoRoot, fixtureDir, barePath, content) {
  // The sandbox root MUST equal the intended write base
  // (test/fixtures/agda/), not the whole repoRoot — otherwise a
  // `..`-laden artifact-controlled path escapes the fixtures tree while
  // staying inside the repo and overwrites arbitrary tracked files
  // (CR-01). Contain the untrusted fixtureDir within test/fixtures/agda
  // first, then contain barePath within that fixture base. Mirrors the
  // sibling oracle module's correct pattern (sandbox root == write base,
  // orcl-01-differential.mjs).
  const fixturesRoot = join(repoRoot, "test/fixtures/agda");
  let dest;
  try {
    const fixtureBase = resolveFileWithinRoot(fixturesRoot, fixtureDir);
    dest = resolveFileWithinRoot(fixtureBase, barePath);
  } catch (err) {
    if (err instanceof PathSandboxError) {
      return null;
    }
    throw err;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, "utf8");
  return dest;
}

/**
 * Materialize a captured defect's inlined first-party sources into the
 * tracked `test/fixtures/agda/<fixtureDir>/` tree, deriving a bare
 * `mutation` (when a `baselineArtifact` reveals exactly one differing
 * file) and a bare `entryFile` (from the primary artifact's last
 * load-family recorded action). Every write is sandboxed; an escaping
 * path is skipped, never written (D-08). Returns
 * `{ mutation?, entryFile?, writtenFiles }` — `writtenFiles` is the
 * absolute-path write list (used for D-05 self-check rollback).
 *
 * Ambiguity guard: if MORE than one raw path differs between the
 * baseline and primary artifacts, this throws rather than silently
 * picking one — this emitter version supports exactly one mutated
 * file, matching the flagship's verified shape.
 */
export function materializeFixtureFiles({ primaryArtifact, baselineArtifact, fixtureDir, repoRoot }) {
  const primarySources = Array.isArray(primaryArtifact?.manifest?.inlinedFirstPartySources)
    ? primaryArtifact.manifest.inlinedFirstPartySources
    : [];
  const baselineSources = Array.isArray(baselineArtifact?.manifest?.inlinedFirstPartySources)
    ? baselineArtifact.manifest.inlinedFirstPartySources
    : [];

  const baselineContentByPath = new Map();
  for (const source of baselineSources) {
    if (typeof source?.path === "string" && typeof source?.content === "string") {
      baselineContentByPath.set(source.path, source.content);
    }
  }

  // First pass: find every RAW path present in both primary and
  // baseline whose content differs — compared un-stripped, since both
  // artifacts share the same capturing session's repoRoot.
  const differingRawPaths = [];
  if (baselineArtifact) {
    for (const source of primarySources) {
      if (typeof source?.path !== "string" || typeof source?.content !== "string") continue;
      const baselineContent = baselineContentByPath.get(source.path);
      if (baselineContent !== undefined && baselineContent !== source.content) {
        differingRawPaths.push(source.path);
      }
    }
  }
  if (differingRawPaths.length > 1) {
    const bareNames = differingRawPaths.map((rawPath) => stripFixtureDirPrefix(rawPath, fixtureDir));
    throw new Error(
      `materializeFixtureFiles: ambiguous mutation — more than one path differs between baseline and primary: ${bareNames.join(", ")}`,
    );
  }
  const mutatedRawPath = differingRawPaths[0];

  const writtenFiles = [];
  let mutation;

  for (const source of primarySources) {
    if (typeof source?.path !== "string" || typeof source?.content !== "string") continue;
    const barePath = stripFixtureDirPrefix(source.path, fixtureDir);

    if (mutatedRawPath !== undefined && source.path === mutatedRawPath) {
      const brokenBarePath = insertBrokenSuffix(barePath);
      // The BASELINE's (healthy) content lands at the target's own bare
      // path — this is what stays checked in as the "before" state.
      const targetDest = writeFixtureFile(repoRoot, fixtureDir, barePath, baselineContentByPath.get(source.path));
      if (targetDest !== null) writtenFiles.push(targetDest);
      // The PRIMARY's (differing) content is the mutation PAYLOAD —
      // never loaded directly, only spliced over the target mid-replay.
      const brokenDest = writeFixtureFile(repoRoot, fixtureDir, brokenBarePath, source.content);
      if (brokenDest !== null) writtenFiles.push(brokenDest);
      mutation = { targetFile: barePath, sourceFile: brokenBarePath };
      continue;
    }

    const dest = writeFixtureFile(repoRoot, fixtureDir, barePath, source.content);
    if (dest !== null) writtenFiles.push(dest);
  }

  const warm = findWarmLoadTuple(primaryArtifact);
  const entryFile = warm !== null ? stripFixtureDirPrefix(warm.file, fixtureDir) : undefined;

  return { mutation, entryFile, writtenFiles };
}

// ── composeEntry ─────────────────────────────────────────────────────

/**
 * Build a `CaptureRegressionEntry` from the caller-supplied identity
 * fields (`id`/`issue`/`tool`/`fixtureDir`) plus `materializeFixtureFiles`'s
 * own output (`entryFile`/`mutation`, passed through untouched — this
 * function does no path derivation of its own) and the fresh verdict's
 * `orcl01` outcome. `expected` is copied VERBATIM from
 * `verdict.orcl01.coldTuple`/`coldCategories` — never transformed or
 * re-derived — and `status` is always `"red"` (this emitter never
 * writes `"locked"`; that flip is a later, manual one-line edit).
 * Validated against `captureRegressionEntrySchema` before being
 * returned — an invalid candidate throws the zod error verbatim rather
 * than producing an entry no consumer can trust.
 */
export function composeEntry({ id, issue, tool, fixtureDir, entryFile, mutation, serverEnv, verdict }) {
  // Defensive guard: only a server-false-green-candidate carries a
  // coldTuple. judgeRefusal already fails closed before reaching here,
  // but throw a clear Error (not a raw `undefined.classification`
  // TypeError) so any future caller path that skips the gate still fails
  // loudly and legibly (CR-02).
  const cold = verdict.orcl01.coldTuple;
  if (cold === undefined) {
    throw new Error(
      `composeEntry: ORCL-01 outcome "${verdict.orcl01.kind}" has no coldTuple to lock; --force cannot fabricate an expected RED value.`,
    );
  }
  const candidate = {
    id,
    issue,
    status: "red",
    tool,
    fixtureDir,
    entryFile,
    mutation,
    serverEnv,
    expected: {
      classification: cold.classification,
      success: cold.success,
      goalCount: cold.goalCount,
      invisibleGoalCount: cold.invisibleGoalCount,
      hasHoles: cold.hasHoles,
      errorCategories: verdict.orcl01.coldCategories,
    },
  };
  return captureRegressionEntrySchema.parse(candidate);
}

// ── writeMatrixEntry ─────────────────────────────────────────────────

/**
 * Append `entry` to the JSON array at `matrixJsonPath` (treating a
 * missing or empty file as `[]`), refusing when an entry with the same
 * `id` already exists. Writes the WHOLE array back via `writeFileAtomic`
 * (same-directory temp file + rename) rather than plain `writeFileSync`
 * — this matrix is repeatedly hand-run-and-updated, exactly the
 * category of file `run-oracle.mjs`'s own sidecar write already
 * prefers atomicity for.
 */
export async function writeMatrixEntry(entry, matrixJsonPath) {
  let existing = [];
  if (existsSync(matrixJsonPath)) {
    const raw = readFileSync(matrixJsonPath, "utf8").trim();
    existing = raw.length > 0 ? JSON.parse(raw) : [];
  }
  if (existing.some((existingEntry) => existingEntry.id === entry.id)) {
    throw new Error(`writeMatrixEntry: an entry with id "${entry.id}" already exists in ${matrixJsonPath}`);
  }
  const updated = [...existing, entry];
  await writeFileAtomic(matrixJsonPath, `${JSON.stringify(updated, null, 2)}\n`);
}

// ── matchesExpected ──────────────────────────────────────────────────

const EXPECTED_SCALAR_FIELDS = ["classification", "success", "goalCount", "invisibleGoalCount", "hasHoles"];

/**
 * The ONE place field/array-equality comparison logic for a replay's
 * observed result vs. a matrix entry's `expected` value lives — the
 * D-05 self-check below AND Wave-3's vitest runner both call this SAME
 * function, so the two can never independently drift on what counts as
 * a match. Mirrors `runColdLoadAndDiff`'s own `tupleMatches`/
 * `categoriesMatch` logic (`scripts/oracle/orcl-01-differential.mjs`)
 * exactly — same-length + same-index array equality on
 * `errorCategories`, never a set-equality shortcut.
 */
export function matchesExpected(observed, expected) {
  const scalarsMatch = EXPECTED_SCALAR_FIELDS.every((field) => observed[field] === expected[field]);
  const observedCategories = Array.isArray(observed.errorCategories) ? observed.errorCategories : [];
  const expectedCategories = Array.isArray(expected.errorCategories) ? expected.errorCategories : [];
  const categoriesMatch =
    observedCategories.length === expectedCategories.length
    && observedCategories.every((category, index) => category === expectedCategories[index]);
  return scalarsMatch && categoriesMatch;
}

// ── CLI ──────────────────────────────────────────────────────────────

function flagValue(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

/** Collects every repeated `--server-env KEY=VALUE` flag into a
 *  `Record<string,string>`; malformed entries (no `=`) are skipped. */
function parseServerEnvFlags(argv) {
  const serverEnv = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--server-env" && i + 1 < argv.length) {
      const raw = argv[i + 1];
      const eqIdx = raw.indexOf("=");
      if (eqIdx > 0) {
        serverEnv[raw.slice(0, eqIdx)] = raw.slice(eqIdx + 1);
      }
    }
  }
  return serverEnv;
}

/** Best-effort delete of every path `materializeFixtureFiles` wrote —
 *  used to roll back a materialization that turned out NOT to
 *  demonstrate RED (D-05), or a `--dry-run` invocation's own writes.
 *  Never masks the real refusal reason with a cleanup failure. */
function rollbackWrittenFiles(writtenFiles) {
  for (const filePath of writtenFiles) {
    try {
      rmSync(filePath, { force: true });
    } catch {
      // Best-effort only.
    }
  }
}

/**
 * CLI entry point: positional arg 1 = primary artifact path. Flags:
 * `--baseline <path>`, `--id <string>`, `--issue <n,n,...>`,
 * `--fixture-dir <relative-dir>`, `--tool <name>`,
 * `--server-env KEY=VALUE` (repeatable), `--force`, `--dry-run`. No
 * `--entry-file` flag — `entryFile` is always derived by
 * `materializeFixtureFiles` from the artifact itself, never accepted as
 * CLI input.
 *
 * Flow: (a) fresh `runOracle` + `judgeRefusal` — refuse-and-return
 * before writing anything. (b) `materializeFixtureFiles` — write
 * fixture files, derive bare `entryFile`/`mutation`. (c) `composeEntry`
 * — build + validate the matrix entry. (d) D-05 self-check via
 * `replayCaptureRegressionEntry` + `matchesExpected` — roll back and
 * refuse if the assertion would currently PASS (not RED). (e) On
 * `--dry-run`, print + roll back, never touching the matrix file.
 * (f) Otherwise `writeMatrixEntry`.
 */
export async function scriptMain(argv = process.argv.slice(2)) {
  const primaryPath = argv[0];
  if (!primaryPath) {
    process.stderr.write(
      "Usage: npx tsx scripts/emit-regression.mjs <path-to-artifact.json> [--baseline <path>] [--id <string>] [--issue <n,n,...>] [--fixture-dir <relative-dir>] [--tool <name>] [--server-env KEY=VALUE]... [--force] [--dry-run]\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const baselinePath = flagValue(argv, "--baseline");
    const id = flagValue(argv, "--id");
    const issueRaw = flagValue(argv, "--issue");
    const issue = issueRaw
      ? issueRaw
          .split(",")
          .map((entry) => Number.parseInt(entry.trim(), 10))
          .filter((n) => Number.isFinite(n))
      : [];
    const fixtureDir = flagValue(argv, "--fixture-dir");
    const tool = flagValue(argv, "--tool");
    const serverEnvRaw = parseServerEnvFlags(argv);
    const serverEnv = Object.keys(serverEnvRaw).length > 0 ? serverEnvRaw : undefined;
    const force = argv.includes("--force");
    const dryRun = argv.includes("--dry-run");

    // (a) Fresh oracle run — never trust a pre-existing .verdict.json
    // sidecar (Open Question 2's resolution: freshness matches D-05's
    // own principle).
    const verdict = await runOracle(primaryPath);
    const refusal = judgeRefusal(verdict, { force });
    if (refusal !== null) {
      process.stderr.write(`emit-regression refused: ${refusal}\n`);
      process.exitCode = 1;
      return;
    }

    const primaryArtifact = JSON.parse(readFileSync(primaryPath, "utf8"));
    const baselineArtifact = baselinePath ? JSON.parse(readFileSync(baselinePath, "utf8")) : undefined;

    // (b) Materialize fixture files + derive bare entryFile/mutation.
    const { mutation, entryFile, writtenFiles } = materializeFixtureFiles({
      primaryArtifact,
      baselineArtifact,
      fixtureDir,
      repoRoot: SERVER_REPO_ROOT,
    });

    // (c) Compose + validate the matrix entry.
    const entry = composeEntry({ id, issue, tool, fixtureDir, entryFile, mutation, serverEnv, verdict });

    // (d) D-05 self-check: the entry must currently be RED.
    const fixturesRoot = join(SERVER_REPO_ROOT, "test/fixtures/agda");
    const { observed } = await replayCaptureRegressionEntry(entry, fixturesRoot);

    if (matchesExpected(observed, entry.expected)) {
      rollbackWrittenFiles(writtenFiles);
      process.stderr.write(
        "emit-regression refused: cannot demonstrate RED — the observed result already matches the expected value; nothing to lock\n",
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write(
      `RED evidence — observed vs expected:\n${JSON.stringify({ observed, expected: entry.expected }, null, 2)}\n`,
    );

    // (e) --dry-run stops here: print, roll back, never touch the matrix.
    if (dryRun) {
      rollbackWrittenFiles(writtenFiles);
      process.stdout.write(
        `[dry-run] would write fixture files:\n${writtenFiles.join("\n")}\n[dry-run] composed entry:\n${JSON.stringify(entry, null, 2)}\n`,
      );
      return;
    }

    // (f) Persist the one matrix entry.
    const matrixJsonPath = join(SERVER_REPO_ROOT, "test/fixtures/capture-regression-matrix.json");
    await writeMatrixEntry(entry, matrixJsonPath);
    process.stdout.write(`Locked ${entry.id} into ${matrixJsonPath}\n`);
  } catch (err) {
    process.stderr.write(`emit-regression failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  await scriptMain();
}
