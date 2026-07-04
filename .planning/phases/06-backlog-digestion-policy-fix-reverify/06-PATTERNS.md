# Phase 6: Backlog Digestion (Policy Fix + Reverify) - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 17 (all modify-existing; this phase creates very few brand-new files — it is a surgical-fix phase, not a scaffolding phase)
**Analogs found:** 17 / 17

Role vocabulary adapted to this project's own layering (protocol → agda → session → tools) and script/test conventions: `src/tools/*` = **controller** (thin MCP tool adapter), `src/agda/*` = **service** (domain logic), `scripts/*.mjs` pipeline orchestrators = **service**, `scripts/*.mjs` pure comparators = **utility**, `test/fixtures/*.ts` zod schemas = **model**, `test/fixtures/*.json` / `scripts/data/*.json` = **config**, `test/fixtures/agda/*.agda` = **config** (fixture data).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/oracle/run-oracle.mjs` | service | batch | `scripts/oracle/orcl-02-soundness-scan.mjs`'s own `--policy` CLI flag (named analog in CONTEXT.md) | exact |
| `scripts/dogfood/dogfood-wrapup.mjs` | service | batch | same `--policy` flag pattern + its own `parseWrapupArgv` | exact |
| `scripts/oracle/orcl-02-soundness-scan.mjs` (D-02 exact-case check) | utility | file-I/O | its own `resolveDefaultPolicyKey` (readdir exact-match idiom, same file) | exact (self-pattern) |
| `scripts/data/fuel-corpora.json` (read, not modified) | config | file-I/O | `scripts/data/oracle-policy/*.json` (sibling data dir) | exact |
| `test/fixtures/task-manifest-schema.ts` (discretionary) | model | file-I/O | `test/fixtures/fuel-corpora.ts` / `test/fixtures/fix-queue.ts` (zod + `loadValidatedJsonData` idiom) | exact |
| POLICY-01 regression test (new or extends existing) | test | file-I/O | `test/unit/tools/oracle-orcl-02.test.ts`'s `.agda-lib`-derivation test + `test/unit/agda/library-registration.test.ts` | exact |
| RT1–RT8 fixture files (new, `test/fixtures/agda/*.agda`) | config | file-I/O | existing small single-symptom fixtures (`HoleQuestionMark.agda`, `TypeError.agda`, `ImportedTypeError.agda`, `WriteCaseSplit.agda`, `WithHoles.agda`) | exact |
| RT task-manifest JSON (new, per re-verification session) | config | file-I/O | `test/fixtures/task-manifest-schema.ts` (schema only, no committed instance exists — by design) | role-match |
| `src/agda/refactor-helpers.ts` (`buildAutoSearchPayload`) | service | transform | `src/protocol/command-builder.ts`'s `quoted()`/`escapeAgdaString` escaping idiom | role-match |
| `src/agda/goal-operations.ts` (`give()`) | service | request-response | `src/agda/parse-load-responses.ts`'s `info.kind === "Error"` detection idiom | role-match |
| `src/tools/goal-tools.ts` (`agda_give` callback) | controller | request-response | `src/tools/file/search-definitions.ts`'s `ToolInvocationError` throw pattern | exact |
| `src/tools/file/search-definitions.ts` (drop hardcoded `agda/`) | controller | batch | `src/tools/agent-ux/project-tools.ts`'s `agda_project_progress` optional `directory` param | exact |
| `src/tools/analysis-tools.ts` (`agda_proof_status` label fix) | controller | request-response | self (localized conditional fix) + `src/session/tool-presentation.ts`'s `previousClassification` combined-state precedent | exact |
| Unit tests for the 4 `src/` fixes | test | request-response | `test/unit/tools/analysis-tools.test.ts` / `test/unit/tools/file-tools.test.ts` fake-server harness | exact |
| `test/fixtures/capture-regression-matrix.json` (new locked entries) | config | batch | flagship entry `issue-64-61-transitive-staleness` (same file) | exact |
| `test/fixtures/fix-queue.json` (status transitions) | config | CRUD | `scripts/queue/intake.mjs`'s `upsertQueueEntry` (the SSOT mutator, already unchanged-reused) | exact |
| Fix order (no new file, decision only) | — | — | `scripts/queue/priority.mjs`'s `comparePriority`/`sortByPriority` | exact |

---

## Pattern Assignments

### POLICY-01 — `--policy` passthrough

#### `scripts/oracle/run-oracle.mjs` (service, batch)

**Analog:** `scripts/oracle/orcl-02-soundness-scan.mjs`'s own CLI (canonical_refs names this explicitly: "its own CLI already has `--policy`").

**The exact flag-parsing pattern to replicate** (`scripts/oracle/orcl-02-soundness-scan.mjs:574-591`):
```js
export async function scriptMain(argv = process.argv.slice(2)) {
  const artifactPath = argv[0];
  if (!artifactPath) {
    process.stderr.write(
      "Usage: node scripts/oracle/orcl-02-soundness-scan.mjs <path-to-artifact.json> [--policy <key>]\n",
    );
    process.exitCode = 1;
    return;
  }

  const policyFlagIndex = argv.indexOf("--policy");
  const policyKey = policyFlagIndex !== -1 ? argv[policyFlagIndex + 1] : undefined;

  try {
    const outcome = await judgeOrcl02(artifactPath, policyKey !== undefined ? { policyKey } : {});
```

**run-oracle.mjs's current `--only` flag idiom to mirror** (`scripts/oracle/run-oracle.mjs:272-279`, same `argv.indexOf` style, already in this exact file):
```js
const onlyFlagIndex = argv.indexOf("--only");
const only =
  onlyFlagIndex !== -1
    ? argv[onlyFlagIndex + 1]
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;
```

**The exact call site that needs `policyKey` threaded through** (`scripts/oracle/run-oracle.mjs:220-222` — currently drops any policy override on the floor):
```js
// ORCL-02 is fully independent (no subprocess, no shared state with
// ORCL-01/ORCL-03) — run it as-is whenever included.
const orcl02Outcome = runOrcl02 ? await judgeOrcl02(artifactPath) : EXCLUDED_SKIP_PLACEHOLDER;
```
`judgeOrcl02(artifactPath, options)` (`orcl-02-soundness-scan.mjs:539-551`) already accepts `options.policyKey` — `runOracle`'s own `options` object (`run-oracle.mjs:183-194`, JSDoc'd with `options.only`/`options.deps`) is the natural place to add `options.policyKey` and pass it straight through, following the EXACT same "accept an options bag, pass fields through unchanged" shape `options.deps.spawnColdAgdaSession` already uses two lines below.

---

#### `scripts/dogfood/dogfood-wrapup.mjs` (service, batch)

**Analog 1 (flag parsing):** its own `parseWrapupArgv` (`scripts/dogfood/dogfood-wrapup.mjs:260-282`) — extend this SAME function, same style, rather than inventing a second parser:
```js
function parseWrapupArgv(argv) {
  const runId = argv[0];

  const rerunNFlagIndex = argv.indexOf("--rerun-n");
  const rerunNRaw =
    rerunNFlagIndex !== -1
      ? argv[rerunNFlagIndex + 1]
      : (process.env.AGDA_MCP_DOGFOOD_RERUN_N ?? "3");
  const rerunN = Number(rerunNRaw);
  if (!Number.isInteger(rerunN) || rerunN < 1) {
    throw new Error(
      `--rerun-n / AGDA_MCP_DOGFOOD_RERUN_N must be a positive integer, got "${rerunNRaw}"`,
    );
  }

  const queuePathFlagIndex = argv.indexOf("--queue-path");
  const queueJsonPath =
    queuePathFlagIndex !== -1
      ? argv[queuePathFlagIndex + 1]
      : join(SERVER_REPO_ROOT, "test/fixtures/fix-queue.json");

  return { runId, rerunN, queueJsonPath };
}
```
A `--policy` flag (and, if the planner chooses a `--corpus` CLI arg over reading the run report's own manifest, a `--corpus` flag) slots into this same "throw loudly on a bad value, never silently default to something dangerous" idiom — mirrors the `rerunN` validation exactly (D-03: an expected-but-unresolvable policy key must hard-error, never silently degrade).

**Analog 2 (corpus → policyKey resolution, the reusable schema-validated asset named in code_context):** `test/fixtures/fuel-corpora.ts` — full file, this IS the "already schema-validated by tests" `policyKey` column CONTEXT.md refers to:
```ts
// test/fixtures/fuel-corpora.ts:29-50
export const fuelCorpusEntrySchema = z.object({
  key: z.string().min(1),
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  access: z.enum(["public", "private"]),
  pinnedRef: z.string().regex(/^[0-9a-f]{40}$/i),
  // Cross-references a scripts/data/oracle-policy/<policyKey>.json
  // sibling, resolved at runtime via the unchanged loadOraclePolicy().
  policyKey: z.string().min(1),
  notes: z.string().optional(),
});

export type FuelCorpusEntry = z.infer<typeof fuelCorpusEntrySchema>;

export const fuelCorpora: FuelCorpusEntry[] = loadValidatedJsonData(
  import.meta.dirname,
  "../../scripts/data/fuel-corpora.json",
  z.array(fuelCorpusEntrySchema),
);
```
`dogfood-wrapup.mjs` should `import { fuelCorpora } from "../../test/fixtures/fuel-corpora.js"` and do `fuelCorpora.find((c) => c.key === corpus)?.policyKey` — this is the SAME "script imports a typed `test/fixtures/*.ts` constant via a `.js`-suffixed specifier" convention `scripts/emit-regression.mjs` already uses for `captureRegressionEntrySchema` (`scripts/emit-regression.mjs:35`) and `scripts/queue/intake.mjs` already uses for `fixQueueEntrySchema` (`scripts/queue/intake.mjs:26`). **Load-bearing warning from the SAME file's header** (`test/fixtures/fuel-corpora.ts:16-23`) — there are TWO non-interchangeable JSON loaders in this codebase, do not conflate them:
```
// scripts/oracle/orcl-02-soundness-scan.mjs's existing loadOraclePolicy()
// already reads sibling *policy* files from that same
// scripts/data/oracle-policy/ tree at runtime via a DIFFERENT loader —
// src/json-data.ts's loadJsonData(relativePath, schema, baseUrl), not
// this file's test/helpers/json-data.ts's
// loadValidatedJsonData(moduleDir, relativePath, schema). The two
// loaders are NOT interchangeable — do not conflate them.
```

**Analog 3 (precedence chain / strict priority ordering style):** `wrapUpCapture`'s own STRICT-order-checked-top-to-bottom branching (`scripts/dogfood/dogfood-wrapup.mjs:205-241`) is the established style for D-01's "explicit `--policy` flag > corpus-derived `policyKey` > `.agda-lib` fallback" precedence — first-match-wins `if / else if / else`, never a fall-through default silently chosen:
```js
// STRICT priority order, checked top to bottom, first match wins —
// see the header comment for why this precedence is itself the
// blocker fix.
let shouldFile;
if (verdict.orcl02.kind === "cheat-flagged") {
  shouldFile = true;
} else if (verdict.orcl01.kind === "server-false-green-candidate") {
  ...
} else {
  shouldFile = false;
}
```

**Analog 4 (the call site to fix):** `scripts/dogfood/dogfood-wrapup.mjs:203` — `const verdict = await runOracleFn(artifactPath);` currently never passes any policy override; the resolved `policyKey` (from the precedence chain above) needs to become `runOracleFn(artifactPath, { policyKey })`.

---

#### `scripts/oracle/orcl-02-soundness-scan.mjs` — D-02 exact-case verification (new small helper in this same file)

**Analog:** its OWN `resolveDefaultPolicyKey` — the directory-listing-for-exact-match idiom already lives in this file, just pointed at the wrong directory for this purpose (`scripts/oracle/orcl-02-soundness-scan.mjs:468-487`):
```js
function resolveDefaultPolicyKey(repoRoot) {
  if (!repoRoot || !existsSync(repoRoot)) return null;
  let entries;
  try {
    entries = readdirSync(repoRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".agda-lib")) continue;
    try {
      const contents = readFileSync(resolve(repoRoot, entry.name), "utf8");
      const name = parseAgdaLibraryName(contents);
      if (name) return name;
    } catch {
      continue;
    }
  }
  return null;
}
```
The SAME `readdirSync(dir, { withFileTypes: true })` + exact `entry.name` string compare loop, pointed at `scripts/data/oracle-policy/` and comparing against `${policyKey}.json`, is what D-02 needs: confirm a case-EXACT filename exists before calling `loadOraclePolicy(policyKey)`, so macOS's case-insensitive APFS (which currently makes `Codex-Homotopy-Group.json` silently resolve to the on-disk `codex-homotopy-group.json`) is forced to behave like Linux's case-sensitive ext4 (which already fails this open, but currently only into the quiet `null` → `no-policy` route, D-03's "genuinely no policy" branch — the wrong branch for a MISMATCHED, not ABSENT, key). A second concrete precedent for the same idiom, one layer down in `src/`: `src/agda/library-registration.ts`'s `discoverProjectLibraries` (`src/agda/library-registration.ts:96-120`) does an identical `readdirSync(..., {withFileTypes:true})` + `entry.name.endsWith(...)` filter.

**Current (buggy) resolution chain to change** (`orcl-02-soundness-scan.mjs:63-76`):
```js
export function loadOraclePolicy(projectKey) {
  if (
    typeof projectKey !== "string"
    || !/^[A-Za-z0-9._-]+$/u.test(projectKey)
    || !/[A-Za-z0-9_-]/u.test(projectKey)
  ) {
    return null;
  }
  try {
    return loadJsonData(`../data/oracle-policy/${projectKey}.json`, oraclePolicySchema, import.meta.url);
  } catch {
    return null;
  }
}
```
`loadJsonData` (`src/json-data.ts:4-12`) resolves via `new URL(relativePath, baseUrl)` + `readFileSync` — case-insensitive on macOS's default APFS, case-sensitive on Linux. The fix must make BOTH platforms fail the SAME way on a real case mismatch (D-02), which requires the directory-listing check above rather than relying on `readFileSync`'s OS-dependent case behavior.

---

#### POLICY-01 regression test (new, or extends an existing describe block)

**Analog 1:** `test/unit/tools/oracle-orcl-02.test.ts:367-372` — the EXISTING `.agda-lib`-name-derivation test, to extend with a case-mismatched sibling scenario:
```ts
test("derives the policy key from the project's .agda-lib name field when options.policyKey is omitted", async () => {
  const { dir, artifactPath } = buildClosureFixture("univalence");
  writeFileSync(join(dir, "project.agda-lib"), "name: agda-unimath\ndepend:\ninclude: .\n", "utf8");
  const outcome = await judgeOrcl02(artifactPath, {});
  expect(outcome.kind).toBe("clean");
});
```
The new test should write `name: Codex-Homotopy-Group` (capitalized, the REAL CHG shape per REQUIREMENTS.md's literal text) and assert the loud unresolved/mismatched error — not a `no-policy` outcome.

**Analog 2 (matrix-driven fixture-materialization style, useful if the planner wants a data-table test instead of one-off):** `test/unit/agda/library-registration.test.ts:38-74` iterates a `libraryRegistrationMatrix` fixture array, `materializeLibraryRegistrationScenario` on disk, asserts, cleans up — same "one JSON/TS fixture table drives N materialized-on-disk scenarios" shape already used for `.agda-lib` name handling elsewhere in this repo.

**D-04 venue constraint:** plain `vitest` `test()`, no `RUN_AGDA_INTEGRATION` gate (this is a pure filesystem-and-string-comparison test, no Agda subprocess) — proven on `ubuntu-latest` per `.github/workflows/ci.yml:10,32` (case-sensitive ext4), which is what makes this test meaningful without a local Docker requirement.

---

### REVERIFY-01 — RT1–RT8 re-verification through the shipped pipeline

#### RT fixture files (new, `test/fixtures/agda/*.agda`)

**Analogs (existing small single-symptom fixtures, one per RT flavor):**
- RT1 (visible hole must never yield `fileComplete:true`) → `test/fixtures/agda/HoleQuestionMark.agda`, `MultipleHoles.agda`
- RT2 (not-in-scope query) → `test/fixtures/agda/NavigationQueries.agda`, `ExpressionQueries.agda`
- RT3 ("no checked term" mislabeling) → `test/fixtures/agda/TypeError.agda`, `ImportedTypeError.agda`
- RT4 (agda_auto CLI-flag hint) → same root cause as the already-confirmed agda_auto entry below; no new fixture logic needed beyond a hint string shaped like a flag
- RT5 (mutation tool failing to reload) → `test/fixtures/agda/WriteCaseSplit.agda`/`.expected.agda`, `WriteGiveSimple.agda`/`.expected.agda` (the `Write*.agda` + `.expected.agda` pair convention)
- RT6 (five-state conflation) → `test/fixtures/agda/MixedGoalsErrors.agda`, `MixedVisibleInvisible.agda`
- RT7 (timeout identification) → no static fixture — this is a live-timing repro, drive through `dogfood-run.mjs` against any slow-loading fixture
- RT8 (stale reload combined classification) → `test/fixtures/agda/FixtureDeps/TransitiveStaleness/` (the flagship's OWN fixture dir, already `Main.agda` + `Dep.agda`/`Dep.broken.agda`, referenced by `test/fixtures/capture-regression-matrix.json:10-15`)

**Match quality:** exact — these are the same "one small file, one symptom, no HoTT knowledge required" shape the UX report itself specifies (per D-05, quoted verbatim in CONTEXT.md line 23).

#### RT task-manifest JSON (new, per re-verification session)

**Analog:** `test/fixtures/task-manifest-schema.ts` (full file, 34 lines) — schema only, deliberately no committed instance:
```ts
export const taskManifestEntrySchema = z.object({
  target: z.string().min(1),
  expectedSignature: z.string().min(1),
  corpus: z.string().min(1),
  notes: z.string().optional(),
});

export const taskManifestSchema = z.array(taskManifestEntrySchema).min(1);
```
Loaded/validated by `scripts/dogfood/task-manifest.mjs`'s `loadTaskManifest(manifestPath)` (`scripts/dogfood/task-manifest.mjs:46-73`) — throws (never silently degrades) on missing path / bad JSON / schema failure / empty array. Each RT's manifest entry needs a `target`/`expectedSignature`/`corpus` triple; `corpus` should reference a `fuel-corpora.json` `key` (by convention only, not schema-enforced per the schema file's own comment on lines 24-27).

#### Driving each RT through the pipeline

**Analog:** `scripts/dogfood/dogfood-run.mjs`'s `runDogfoodProxy` (full file already read; key sequencing at lines 140-147) — `loadTaskManifest` is called and allowed to throw BEFORE any run directory or child process exists; this ordering is load-bearing and must not be re-derived incorrectly. CLI flags to reuse verbatim: `--manifest`, `--corpus-root`, `--run-id` (`dogfood-run.mjs:80-106`). Then `scripts/dogfood/dogfood-wrapup.mjs <run-id>` (already covered above) closes the loop. Both scripts are reused UNCHANGED for REVERIFY-01 except for the `--policy` plumbing already covered under POLICY-01 — "REVERIFY work is cargo through it, not new machinery" (code_context, Established Patterns).

---

### REVERIFY-02 — the 4 confirmed + RT-confirmed fixes

#### `src/agda/refactor-helpers.ts` — `buildAutoSearchPayload()` (fingerprint `5abecc959e43fef3`, RT4 `004d161b839ce725`)

**The exact injection site** (`src/agda/refactor-helpers.ts:107-131`):
```ts
export function buildAutoSearchPayload(options: AutoSearchOptions): string {
  const flags: string[] = [];
  if (options.depth !== undefined) {
    flags.push(`-d ${Math.max(0, Math.trunc(options.depth))}`);
  }
  if (options.listCandidates) {
    flags.push("--list-candidates");
  }
  for (const hint of options.hints ?? []) {
    if (hint.trim().length > 0) {
      flags.push(`-h ${hint.trim()}`);
    }
  }
  for (const excluded of options.excludeHints ?? []) {
    if (excluded.trim().length > 0) {
      flags.push(`-x ${excluded.trim()}`);
    }
  }
  return flags.join(" ").trim();
}
```
A `hint` value of `"-t 999999"` is concatenated verbatim after `-h `, producing `-h -t 999999` — Agsy reads this as two more flags, not one hint token. This function is pure (no I/O), so the fix is pure too: reject/escape any hint whose trimmed value starts with `-` (or contains whitespace that would split into a second token) before it reaches `flags.push`.

**Analog for "reject/escape an untrusted value before it enters a wire payload" in THIS codebase** (the SSOT escaping pattern, `src/protocol/command-builder.ts:13-15`):
```ts
export function quoted(text: string): string {
  return `"${escapeAgdaString(text)}"`;
}
```
`buildAutoSearchPayload` is a DIFFERENT wire format (Agsy space-separated CLI flags, not an IOTCM string), so `quoted()` itself is not directly reusable — but it is the established precedent for "never trust a caller-supplied string into a command payload verbatim; validate/escape at the boundary function," which is exactly this fix's shape.

**Existing test to extend:** `test/unit/agda/agent-ux.test.ts:139-152`:
```ts
describe("buildAutoSearchPayload", () => {
  test("renders configurable payload", () => {
    const payload = buildAutoSearchPayload({
      depth: 5,
      listCandidates: true,
      hints: ["helper"],
      excludeHints: ["bad"],
    });
    expect(payload).toContain("-d 5");
    ...
  });
});
```
Add a case with `hints: ["-t 999999"]` asserting the flag-shaped hint is rejected or escaped, never emitted as a bare `-h -t 999999`.

---

#### `src/agda/goal-operations.ts` — `give()` (fingerprint `bfcba437f5426fd6`)

**The exact under-classified call site** (`src/agda/goal-operations.ts:106-122`):
```ts
/** Give (fill) a goal with an expression. */
export async function give(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<GiveResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_give", "WithoutForce", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText: resolveGiveReplacementText(responses, expr),
  };
}
```
`throwOnFatalProtocolStderr` (`src/agda/protocol-errors.ts`, full file) ONLY matches three stderr regexes (`/^cannot read:/i`, `/^failed to parse/i`, `/^invalid\b/i`) — an ill-typed `give` doesn't hit stderr at all; Agda returns its rejection as a normal `DisplayInfo` response, which `decodeGiveLikeResponse` (`src/protocol/responses/proof-actions.ts:97-117`) happily renders as `result` text with no error signal:
```ts
export function decodeGiveLikeResponse(responses: AgdaResponse[]): string {
  let result = "";
  const displayMessages = decodeDisplayInfoEvents(responses)
    .map((event) => event.text)
    .filter(Boolean);

  for (const resp of responses) {
    const give = parseResponseWithSchema(giveActionResponseSchema, resp);
    if (give) {
      const val = give.giveResult ?? give.result ?? "";
      if (val) result = renderGiveResult(val);
      continue;
    }
    if (parseResponseWithSchema(displayInfoResponseSchema, resp)) {
      continue;
    }
  }
  return result || displayMessages.at(-1) || "";
}
```

**Analog — the established `info.kind === "Error"` detection idiom, used TWICE elsewhere in this exact protocol layer** (`src/agda/parse-load-responses.ts:113-127`):
```ts
for (const resp of responses) {
  // ── DisplayInfo ──────────────────────────────────────
  if (resp.kind === "DisplayInfo") {
    const display = parseResponseWithSchema(displayInfoResponseSchema, resp);
    if (!display) continue;
    const info = display.info;

    if (info.kind === "Error") {
      success = false;
      const text = decodeDisplayInfoEvents([resp]).at(-1)?.text ?? "";
      if (text) {
        errors.push(text);
      }
    }
  }
}
```
The same `info.kind === "Error"` check also appears in `src/protocol/responses/backend.ts:26`. `give()`'s fix should apply this SAME check to its own `responses` array and surface a rejected/error signal on `GiveResult` (`src/agda/types.ts:191-195`, currently `{ result: string; replacementText?: string | null }`, no `rejected`/`success` field) rather than always returning a bare success-shaped string.

**Architectural note (500-line ceiling, layering):** `src/tools/goal-tools.ts` is already at **494 / 500 lines** — the domain-logic fix (detecting the rejection) belongs in `src/agda/goal-operations.ts`/`GiveResult` (228 lines, room to grow), NOT in the tool adapter, both to respect the line ceiling and because "fat tool handlers with embedded domain logic" is this project's own named anti-pattern (root `ARCHITECTURE.md`/CLAUDE.md). `src/tools/goal-tools.ts`'s `agda_give` callback (`src/tools/goal-tools.ts:167-195`) should only need a couple of lines to read the new field and adjust `classification`/throw — see next entry.

---

#### `src/tools/goal-tools.ts` — `agda_give` callback (same fingerprint `bfcba437f5426fd6`)

**Current unconditional-success call site** (`src/tools/goal-tools.ts:167-195`):
```ts
callback: async ({ goalId, expr, writeToFile }) => {
  const shouldWrite = writeToFile !== false;
  const exprStr = expr as string;
  const goalIdsBefore = session.getGoalIds();
  const result = await session.goal.give(goalId, exprStr);
  let output = `## Give \`${exprStr}\` to ?${goalId}\n\n`;
  output += result.result ? `**Result:** \`${result.result}\`\n` : `Expression accepted.\n`;

  let written = false;
  if (shouldWrite && session.currentFile) {
    if (hasReplacementText(result.replacementText)) {
      output += await applyEditAndReload(session, goalIdsBefore, {
        kind: "replace-hole", goalId, expr: result.replacementText,
      });
      written = true;
    } else {
      output += `\nAgda did not return a confirmed replacement. Apply the expression manually if appropriate, then call \`agda_load\`.\n`;
    }
  }
  return {
    text: output,
    data: { expr: exprStr, result: result.result ?? "", replacementText: result.replacementText ?? null, written },
  };
},
```
This already has a `hasReplacementText(result.replacementText)` false-branch (lines 177-184) that DOES surface a warning when Agda declined to give a confirmed replacement — but it still returns a plain `ok:true` envelope either way (`registerGoalTextTool` wraps any non-throwing return as success). The rejection-signal fix (once `give()` surfaces it per the entry above) needs a THIRD branch here that sets a non-`ok` classification / throws, rather than silently falling into the "Expression accepted" text.

**Analog for signaling an expected-failure state from a tool callback (throw, not silent return):** `src/tools/file/search-definitions.ts:73-87`:
```ts
if (actualQuery.length === 0) {
  throw new ToolInvocationError({
    message: "Provide either `query` or `typePattern`.",
    classification: "invalid-input",
    diagnostics: [
      {
        severity: "error",
        message: "Provide either `query` or `typePattern`.",
        code: "invalid-input",
        nextAction: "Pass `query` for a substring search across module / definition names, or `typePattern` for a token-pattern match against type signatures (e.g. `Nat → _ → Nat`).",
      },
    ],
    data: { query: actualQuery, tier },
  });
}
```
Imported from `src/tools/tool-helpers.js` (`ToolInvocationError`, `missingPathToolError`, `registerTextTool`). A rejected `give` is closer to a **domain-level "failure" value** than an exceptional input error though — per this project's own Error Handling convention (CLAUDE.md): *"Domain-level 'failure' values ... are returned as plain data objects with a `classification` string field rather than thrown, since a failed [operation] is an expected outcome, not an exceptional one."* The planner should weigh `ToolInvocationError` (throw) against a `classification: "rejected"` data field on the SAME `ok:true`-shaped envelope (mirroring `LoadResult`'s own `classification` field, `src/agda/session-load-helpers.ts`'s `failedLoadResult()`), consistent with how a failed `agda_load` is already NOT thrown.

---

#### `src/tools/file/search-definitions.ts` — hardcoded `agda/` layout (fingerprint `eb7439cb3ed9d6b9`)

**The exact hardcoded lines** (`src/tools/file/search-definitions.ts:88-90`):
```ts
const requestedSearchRoot = tier
  ? resolveFileWithinRoot(repoRoot, join("agda", tier))
  : resolveFileWithinRoot(repoRoot, "agda");
```

**Analog — an EXISTING sibling tool that already solved this exact problem with an optional override parameter** (`src/tools/agent-ux/project-tools.ts:154-189`, `agda_project_progress`):
```ts
registerStructuredTool({
  server,
  name: "agda_project_progress",
  description: "Project-wide static progress summary by subdirectory: ...",
  category: "analysis",
  inputSchema: {
    directory: z.string().optional().describe("Directory under project root to scan (default: agda/)"),
  },
  ...
  callback: async ({ directory }: { directory?: string }) => {
    const requested = directory ?? "agda";
    const scanRoot = resolveExistingPathWithinRoot(repoRoot, resolveFileWithinRoot(repoRoot, requested));
    const files = walkAgdaFiles(scanRoot, session.getAgdaVersion() ?? undefined);
    ...
```
This is the strongest available analog: same tool-adapter layer, same `resolveFileWithinRoot`/`resolveExistingPathWithinRoot` sandboxing, same "default to `agda/`, let the caller override" shape — already shipped and tested elsewhere in this codebase. `search-definitions.ts`'s fix should add the SAME optional `directory` (or reuse `tier` in a src/-layout-aware way) input, defaulting to `"agda"` for backward compatibility but resolving `"src"` (or any caller-supplied root) for a src/-layout project like agda-unimath. Note: this exact `"agda"` hardcoding ALSO appears in `src/tools/file/list-modules.ts:44,94` and `src/tools/agent-ux/shared.ts:168` and `project-tools.ts:188,309` — those are OUT OF SCOPE for this phase's confirmed-entry set (D-09/D-10 name only `agda_search_definitions`), but the planner should be aware the same root cause is broader than this one file.

**Existing test file + harness to extend** (`test/unit/tools/file-tools.test.ts:1-45, 265-293`):
```ts
function createCapturingServer() {
  const registrations = new Map<string, { name: string; spec: unknown; callback: (args: any) => any }>();
  return {
    registerTool(name: string, spec: unknown, callback: (args: any) => any) {
      registrations.set(name, { name, spec, callback });
    },
    get(name: string) { return registrations.get(name); },
  };
}
...
test("agda_search_definitions skips symlinked files that resolve outside the project root", async (ctx) => {
  clearToolManifest();
  const fixture = ensureRepoSymlink(ctx);
  ...
  registerFileTools(server as unknown as McpServer, { getAgdaVersion: () => null } as any, fixture.linkedRepoRoot);
  const safeResult = await server.get("agda_search_definitions")!.callback({ query: "foo", tier: "Kernel" });
  ...
});
```
Real `mkdtempSync` filesystem fixtures (not mocked fs) — a new test should create a `src/` (not `agda/`) directory with a `.agda` file and assert the query now succeeds where it previously returned `ok:false`/not-found.

---

#### `src/tools/analysis-tools.ts` — `agda_proof_status` mislabeling (fingerprint `fdc90bfde12fb938`, relates RT6 `ad2b6d31f58f1759`)

**The exact bug** (`src/tools/analysis-tools.ts:57-82`):
```ts
const metas = await session.goal.metas();
const constraints = await session.query.constraints();

let output = `## Proof Status\n\n`;
output += `**File:** ${file}\n`;
output += `**Goals:** ${metas.goals.length} unsolved\n`;
if (constraints.text) {
  output += `**Constraints:** yes\n`;
}
output += "\n";

if (metas.goals.length > 0) {
  output += "### Goals\n\n";
  for (const g of metas.goals) {
    output += `- **?${g.goalId}** : \`${g.type}\`\n`;
  }
  output += "\n";
}

if (constraints.text) {
  output += `### Constraints\n\n\`\`\`\n${constraints.text}\n\`\`\`\n`;
}

if (metas.goals.length === 0) {
  output += "All goals solved.\n";
}
```
The final `if` only checks `metas.goals.length === 0`, ignoring `constraints.text` entirely — a stale reload that surfaces a real error into `constraintsText` (`hasConstraints: true`) still gets the "All goals solved." tagline appended right after the constraints block that just printed the error. The fix is a localized condition change: `if (metas.goals.length === 0 && !constraints.text)`.

**Relevant existing precedent for "combined previous+new state" reporting** (RT6/RT8 both cross-reference this), confirming `previousClassification` already exists on the load-result schema (`src/session/tool-presentation.ts:23`):
```ts
previousClassification: z.string().nullable().optional(),
previousLoadedAtMs: z.number().nullable().optional(),
```
Useful context for the planner when re-verifying RT6/RT8 (whether `agda_load`/`agda_load_no_metas` already satisfy the "report previous+new classification together" ask) — not a pattern this specific fix needs to copy, since `agda_proof_status`'s bug is a same-call-cycle labeling bug, not a previous-vs-current comparison.

**Existing test file (currently has NO `agda_proof_status` coverage — confirmed gap):** `test/unit/tools/analysis-tools.test.ts:1-52` — same `createCapturingServer` + fake `session` object harness as `file-tools.test.ts`:
```ts
function createCapturingServer() {
  const registrations = new Map<string, { callback: (args: any) => any }>();
  return {
    registerTool(name: string, _spec: unknown, callback: (args: any) => any) {
      registrations.set(name, { callback });
    },
    get(name: string) { return registrations.get(name); },
  };
}

test("agda_term_search imported scope labels candidates as imported", async () => {
  clearToolManifest();
  const server = createCapturingServer();
  const session = {
    getGoalIds: () => [1],
    getLastClassification: () => null,
    getLoadedFile: () => "/repo/Example.agda",
    isFileStale: () => false,
    goal: { typeContext: async () => ({ type: "Nat", context: ["x : Nat"] }) },
    query: { searchAbout: async () => ({ query: "Nat", results: [...], text: "" }) },
    load: async () => ({ ... }),
  } as any;

  registerAnalysisTools(server as unknown as McpServer, session, "/repo");
  const result = await server.get("agda_term_search")!.callback({ goalId: 1, scope: "imported" });
  expect(result.isError).toBe(false);
  expect(result.content[0].text).toContain("(imported)");
});
```
A new `agda_proof_status` test needs `session.goal.metas` returning `{ goals: [] }` AND `session.query.constraints` returning `{ text: "some real error" }`, asserting the output text does NOT contain "All goals solved."

---

## Shared Patterns

### CLI flag parsing (`--flag value` over `argv`)
**Source:** `scripts/oracle/orcl-02-soundness-scan.mjs:584-585` (simplest form, exactly two lines, the canonical_refs-named pattern):
```js
const policyFlagIndex = argv.indexOf("--policy");
const policyKey = policyFlagIndex !== -1 ? argv[policyFlagIndex + 1] : undefined;
```
**Apply to:** `run-oracle.mjs`'s `scriptMain`, `dogfood-wrapup.mjs`'s `parseWrapupArgv`. (Repeatable-flag variant, if ever needed: `scripts/emit-regression.mjs:339-352`'s `parseServerEnvFlags`, a `for` loop collecting every `--server-env KEY=VALUE` occurrence.)

### Dependency-injection `deps` seam for testability
**Source:** `scripts/oracle/run-oracle.mjs:183-185,203` (`options.deps?.spawnColdAgdaSession`) and `scripts/dogfood/dogfood-wrapup.mjs:198-201` (`config.deps?.runOracle ?? runOracle`, etc.):
```js
const runOracleFn = config.deps?.runOracle ?? runOracle;
const classifyFn = config.deps?.classifyFlakiness ?? classifyFlakiness;
const upsertFn = config.deps?.upsertQueueEntry ?? upsertQueueEntry;
const appendFlakyFn = config.deps?.appendFlakyLog ?? appendFlakyLog;
```
**Apply to:** any new test exercising `runOracle`'s or `wrapUpCapture`'s policy-resolution branch without real Agda/subprocess cost — inject fakes exactly like `test/unit/tools/dogfood-wrapup-filing.test.ts:93-111` and `test/unit/tools/oracle-run-oracle.test.ts:232-241` already do.

### Dual JSON-loader convention — do not conflate
**Source:** `test/fixtures/fuel-corpora.ts:13-23` (see full excerpt above under dogfood-wrapup.mjs). `src/json-data.ts`'s `loadJsonData(relativePath, schema, baseUrl)` is the RUNTIME loader (used by `scripts/*.mjs` and `src/*.ts` at server-run time); `test/helpers/json-data.ts`'s `loadValidatedJsonData(moduleDir, relativePath, schema)` is the TEST-SIDE typed-constant loader (used by `test/fixtures/*.ts` schema files). **Apply to:** any new code path that reads `fuel-corpora.json`, `fix-queue.json`, or `oracle-policy/*.json` — pick the loader matching WHERE the code runs, never assume they're interchangeable.

### Path sandboxing
**Source:** `src/repo-root.ts` — `resolveFileWithinRoot(root, target)`, `resolveExistingPathWithinRoot(root, target)`, `PathSandboxError`, `SERVER_REPO_ROOT`/`PROJECT_ROOT`. Used throughout `orcl-02-soundness-scan.mjs` (CR-01/CR-02 comments), `emit-regression.mjs` (`writeFixtureFile`), `search-definitions.ts`, `project-tools.ts`. **Apply to:** `search-definitions.ts`'s new `directory` override input — MUST route through the same `resolveFileWithinRoot`/`resolveExistingPathWithinRoot` pair, never a bare `join`/`resolve`.

### Tool-adapter error signaling
**Source:** `src/tools/tool-helpers.ts`'s `ToolInvocationError` (thrown for invalid-input/exceptional states, e.g. `search-definitions.ts:73-87`) vs. domain-level `classification` fields on a normally-returned data object (e.g. `LoadResult`'s `classification`, `src/agda/session-load-helpers.ts`). **Apply to:** the `agda_give` rejection-signal fix — pick ONE of these two per this project's own documented convention (CLAUDE.md Error Handling section), not an ad hoc third shape.

### Directory-listing exact-match idiom
**Source:** `scripts/oracle/orcl-02-soundness-scan.mjs:468-487` (`resolveDefaultPolicyKey`) and `src/agda/library-registration.ts:96-120` (`discoverProjectLibraries`) — both `readdirSync(dir, { withFileTypes: true })` + exact `entry.name`/`entry.isFile()` filtering. **Apply to:** the new D-02 case-exactness check.

### QUEUE-02 priority ordering
**Source:** `scripts/queue/priority.mjs:31-55` (full excerpt above). **Apply to:** REVERIFY-02's fix order (D-11) — `comparePriority`/`sortByPriority` are the single frozen ordering table; the fix sequence should follow `sortByPriority` output over the confirmed+RT-confirmed set, not a hand-picked order.

### Lock mechanism (matrix entry + backlink)
**Source:** `scripts/emit-regression.mjs`'s `judgeRefusal` (lines 52-77), `composeEntry` (250-281), `writeMatrixEntry` (294-305); flagship shape in `test/fixtures/capture-regression-matrix.json:2-30`:
```json
{
  "id": "issue-64-61-transitive-staleness",
  "issue": [64, 61],
  "status": "locked",
  "tool": "agda_load_no_metas",
  "fixtureDir": "FixtureDeps/TransitiveStaleness",
  "entryFile": "Main.agda",
  "mutation": { "targetFile": "Dep.agda", "sourceFile": "Dep.broken.agda" },
  "expected": { "classification": "type-error", "success": false, "goalCount": 0, "invisibleGoalCount": 0, "hasHoles": false, "errorCategories": ["UnequalTerms"] }
}
```
`test/fixtures/fix-queue.json`'s own flagship entry backlinks via `"matrixEntryId": "issue-64-61-transitive-staleness"` (`test/fixtures/fix-queue.json:14`). **Apply to:** every REVERIFY-02 fix that reaches `locked` — run `npx tsx scripts/emit-regression.mjs <artifact> --id <slug> --issue <n> --fixture-dir <dir> --tool <tool>`, then set the corresponding `fix-queue.json` entry's `matrixEntryId` to the new `id` and flip `status` to `locked` (with `closedAt` set — `test/fixtures/fix-queue.ts:94-100`'s `superRefine` enforces this or the file fails validation).

### Queue status transitions (SSOT mutator)
**Source:** `scripts/queue/intake.mjs:66-93` (`upsertQueueEntry`) — the ONLY sanctioned mutator for `fix-queue.json`, whether filing a brand-new entry or flipping an existing one's `status`:
```js
export async function upsertQueueEntry(entryData, queueJsonPath, options = {}) {
  const bumpRecurrence = options.bumpRecurrence !== false;
  const existing = readQueueFile(queueJsonPath);
  const existingIndex = existing.findIndex((entry) => entry.fingerprint === entryData.fingerprint);
  const candidate = existingIndex === -1 ? entryData : { ...existing[existingIndex], ...entryData, recurrence: ... };
  const validated = fixQueueEntrySchema.parse(candidate);
  ...
  await writeFileAtomic(queueJsonPath, `${JSON.stringify(updated, null, 2)}\n`);
  return validated;
}
```
For a metadata-only status flip (no new recurrence), pass `{ bumpRecurrence: false }`. **Apply to:** every REVERIFY-01 confirm/reject transition and every REVERIFY-02 `triaged → fixing → locked` transition — via this function OR an equally-valid direct hand-edit of the tracked JSON array (it is deliberately a flat, git-audited SSOT, not a generated artifact — `test/fixtures/fix-queue.ts`'s own header comment).

### Mock-server + fake-session unit test harness
**Source:** `test/unit/tools/analysis-tools.test.ts:7-17` and `test/unit/tools/file-tools.test.ts:11-22` — near-identical `createCapturingServer()` (a `Map`-backed fake `McpServer` capturing `registerTool` callbacks) plus an inline fake `session` object typed `as any`, no real Agda subprocess. **Apply to:** all new unit tests for the `goal-tools.ts`/`analysis-tools.ts`/`search-definitions.ts` fixes.

---

## No Analog Found

None — every file/change in this phase has at least a role-match analog already in the codebase. This is expected: Phase 6 is explicitly scoped as "pure CLI/options plumbing" (ROADMAP.md, research skipped) plus surgical fixes to already-shipped tools, not new subsystem construction.

## Metadata

**Analog search scope:** `scripts/oracle/`, `scripts/dogfood/`, `scripts/queue/`, `scripts/emit-regression.mjs`, `scripts/data/`, `src/agda/`, `src/tools/`, `src/tools/file/`, `src/tools/agent-ux/`, `src/protocol/`, `src/session/`, `test/fixtures/`, `test/unit/tools/`, `test/unit/agda/`
**Files scanned (read in full or targeted range):** `scripts/oracle/orcl-02-soundness-scan.mjs`, `scripts/oracle/run-oracle.mjs`, `scripts/dogfood/dogfood-wrapup.mjs`, `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/task-manifest.mjs`, `scripts/queue/intake.mjs`, `scripts/queue/priority.mjs`, `scripts/emit-regression.mjs`, `scripts/data/fuel-corpora.json`, `scripts/data/oracle-policy/codex-homotopy-group.json`, `src/json-data.ts`, `src/repo-root.ts`, `src/agda/library-registration.ts`, `src/agda/refactor-helpers.ts`, `src/agda/goal-operations.ts`, `src/agda/protocol-errors.ts`, `src/agda/parse-load-responses.ts`, `src/protocol/command-builder.ts`, `src/protocol/responses/proof-actions.ts`, `src/tools/goal-tools.ts` (targeted), `src/tools/analysis-tools.ts`, `src/tools/file/search-definitions.ts`, `src/tools/agent-ux/project-tools.ts` (targeted), `src/session/tool-presentation.ts` (targeted), `test/fixtures/fix-queue.json`, `test/fixtures/fix-queue.ts`, `test/fixtures/fuel-corpora.ts`, `test/fixtures/task-manifest-schema.ts`, `test/fixtures/capture-regression-matrix.json`, `test/unit/tools/oracle-run-oracle.test.ts`, `test/unit/tools/oracle-orcl-02.test.ts` (targeted), `test/unit/tools/dogfood-wrapup-filing.test.ts` (targeted), `test/unit/agda/library-registration.test.ts`, `test/unit/agda/agent-ux.test.ts` (targeted), `test/unit/tools/analysis-tools.test.ts`, `test/unit/tools/file-tools.test.ts` (targeted)
**Pattern extraction date:** 2026-07-03
