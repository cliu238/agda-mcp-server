# Phase 3: Regression Lock Pipeline - Research

**Researched:** 2026-07-02
**Domain:** Vitest regression-test emission from a captured Agda MCP session defect; transitive-staleness false-green reproduction
**Confidence:** HIGH (central finding directly reproduced empirically against local Agda 2.8.0 + the built server, this session; architecture/reuse findings verified by direct source read)

## Summary

Phase 3 is almost entirely a composition problem, not a new-technology problem: every mechanical piece it needs (a materializer that path-sandboxes correctly, a cold-vs-warm tuple differential, a category-set normalizer, an MCP replay harness, a matrix-plus-typed-loader idiom, an `itSince`/`RUN_AGDA_INTEGRATION` gating convention) already exists and ships in Phase 1/2's code. The emitter's job is to wire these together into one new artifact type (a capture-regression matrix entry) and one new generic runner — no new library, no new protocol logic, no new `src/` tool surface (matching Phase 2's own D-05 precedent).

The one genuinely open question — "does #64/#61 still reproduce on current `main`, so LOCK-03 has a real RED starting point?" — is **resolved by direct empirical test in this research session**: it does, but not through the naive same-session reload CHG-REVERIFY.md already ruled out. The `.planning/research/CHG-REVERIFY.md` finding that #64/#61 is "changed/provisionally-fixed" is correct for the `agda_load`/`agda_typecheck` (metas) path, which commit `e38f90a` genuinely hardened with a terminus-tracking, fail-closed safety net. But `agda_load_no_metas` (`Cmd_load_no_metas`, the "strict" load) was **deliberately excluded** from that fix — the commit message says so explicitly ("`Cmd_load_no_metas`... keep the original fast idle path") — and it has **zero** terminus-tracking or fail-closed guard. I built a two-file transitive-dependency fixture (`Main.agda` imports `Dep.agda`), drove it through the real built server via `test/helpers/mcp-harness.ts`, and reproduced a **deterministic, 100%-repeatable false green** on `agda_load_no_metas`: warm-session reload after an out-of-band signature-only edit to `Dep.agda` reports `ok-complete`/`success:true` when a fresh compile (and the `agda_load` control, even under the identical pathological timing) correctly reports `type-error`. This is not a synthetic bundle — it is real live-session behavior of the shipped server, matching D-09(part 1)'s mandate exactly, and it is the same defect family CHG's original v0.6.7 measurement implicated (`agda_load_no_metas` was one of the four tools that went false-green).

**Primary recommendation:** Build LOCK-03's flagship fixture as a `FixtureDeps/`-style two-file transitive-dependency pair replayed through `agda_load_no_metas`, with the warm session driven under an explicit, deliberately-tuned `AGDA_MCP_IDLE_COMPLETION_MS`/`AGDA_MCP_POST_STATUS_IDLE_MS` server env (a documented, principled fault-injection technique — these are pre-existing, shipped, real tunables, not test-only mocks — that deterministically forces the same truncation race a genuinely large/slow real-world module would hit non-deterministically). This requires the capture-regression matrix schema to carry an optional per-entry `serverEnv` field threaded into `createMcpHarness`'s existing `extraEnv` parameter — the one concrete schema extension this research surfaces beyond the Phase-2 verdict contract.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fixture materialization (path-sandboxed source write) | Scripts (`scripts/`) | — | Pure filesystem operation; already solved correctly in `scripts/oracle/orcl-01-differential.mjs`'s `materializeCaptureEnvironment` (Phase 2) — reuse, don't re-derive |
| Cold-vs-warm tuple diff / "expected value" | Scripts (`scripts/oracle/`) | — | Owned entirely by Phase 2's `judgeOrcl01`/`runColdLoadAndDiff`; Phase 3 only *consumes* the verdict, never re-implements the differential |
| Regression-test emission (matrix write + fixture placement + RED verification) | Scripts (`scripts/`) | Test fixtures (`test/fixtures/`) | New `scripts/emit-regression.mjs`, no `src/` surface (Phase 2 D-05 precedent extends here) |
| Regression replay (drive warm scenario, assert against expected tuple) | Test / Integration (`test/integration/mcp/`) | MCP tool-call boundary (`src/tools/tool-envelope.ts`'s `ToolEnvelope`) | D-02: replay happens at the tools layer because that's where the envelope (the assertion target) and the Phase-1 action-log recording both live |
| The actual defect under test (`Cmd_load_no_metas` truncation) | Backend / `AgdaSession` (`src/agda/session-load-impl.ts`, `src/session/command-completion.ts`) | Protocol transport (`src/session/agda-transport.ts`) | Confirmed root cause: `runLoadNoMetas` has no `awaitGoalTerminus`/`sawLoadTerminus` guard — fixed in Phase 3.1, not Phase 3 |
| Fix-queue cargo (the 3 other CHG-REVERIFY live defects) | Out of scope this phase | Phase 4 | D-10: only the flagship (#64/#61) is locked here |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> **Classification legend:** **[FORCED]** = fixed by correctness / a requirement / the phase boundary / an existing convention or charter. **[TASTE]** = a genuine values call. **[DEFERRED]** = deliberately unresolved.

**Emitted-test form (LOCK-02)**
- **D-01 [FORCED]:** The emitter emits **data, not code**: a per-defect entry in a capture-regression **matrix** (JSON + typed loader, following the `release-bug-matrix.json` / `fixture-matrix.json` idiom) plus fixture files. **One generic replay runner** executes all entries. Ruled out: generating a standalone `.test.ts` per defect.
- **D-02 [FORCED]:** Replay happens at the **MCP tool-call boundary** via the existing `test/helpers/mcp-harness.ts` (built server over stdio). Ruled out: direct `AgdaSession` replay.
- **D-03 [FORCED]:** Emitted regressions self-skip without `RUN_AGDA_INTEGRATION=1`, and use `itSince(minVersion)` where needed. Assertions target the **normalized classification tuple + error/warning category sets**, never raw text/wire order/timing.

**RED-phase lifecycle (LOCK-02/LOCK-03)**
- **D-04 [FORCED]:** Matrix entries carry `status: "red" | "locked"`. The runner emits vitest **`test.fails`** for `red` entries (suite stays green while the defect is live; unexpectedly-passing `.fails` fails loudly, forcing promotion). `locked` entries run as plain tests and join `test:release:bugs`. The red→locked flip is a one-line matrix edit.
- **D-05 [FORCED]:** At emit time the emitter **runs the new entry once and verifies the assertion currently fails**. An emitted lock that cannot demonstrate RED is an emitter error, not a lock.

**Emitter refusal gates (LOCK-02 + Phase-2 verdict contract)**
- **D-06 [FORCED]:** The emitter refuses to lock when: ORCL-01 = INCONCLUSIVE, ORCL-02 = cheat-flagged, or ORCL-02 = no-policy with non-empty findings. `no-policy` with zero findings IS lockable. ORCL-03 never blocks. Refusals exit non-zero naming the predicate + a next-step hint.

**Reproduction & trimming (REPRO-01)**
- **D-07 [FORCED predicate; DEFERRED heuristics]:** Trimming is manual editing + a scripted re-trigger check. The "still reproduces" predicate is the **differential itself — warm-green ∧ cold-red** — not "the test fails". No heuristics/ddmin in v1.

**Fixture materialization (LOCK-01)**
- **D-08 [FORCED]:** Fixtures land under `test/fixtures/agda/`, PascalCase, behavior-named, one-concern-per-file; multi-file repros follow the `FixtureDeps/`-style subdirectory pattern. Materialization **must path-sandbox** `inlinedFirstPartySources[].path` (reject `..`/absolute escapes) — CR-01 proved the traversal hole in `verify-cold-replay.mjs`'s materializer. **Do not copy that materializer without fixing it.**

**LOCK-03 flagship end-to-end proof**
- **D-09 (part 1) [FORCED]:** The #64/#61 capture comes from a **real live session** driven by a hand-scripted staleness scenario (load module A that imports B → warm green; edit B to introduce a type error; warm reload of A stays green while cold agda rejects). Ruled out: hand-built synthetic bundles.
- **D-09 (part 2) [TASTE]:** Phase 3 ends at the demonstrably-RED emitted regression. The fix is **Phase 3.1**, not Phase 3.
- **D-10 [TASTE]:** The 8 CHG turn-key specs + 4 CHG candidate defects are **not** locked in Phase 3 — Phase 4 queue cargo. Phase 3 locks exactly the flagship.

**Upstream coordination**
- **Phase-1 BLOCKER interaction:** repeat captures in one session silently overwrite the staged artifact (filename = `fingerprint-recurrence`, both session-static) — directly threatens the Phase-3 e2e drill, which will capture repeatedly while rehearsing #64/#61. **Close it before or as the first task of Phase 3.**
- **Verdict schema is Phase 2's deliverable** — read it before designing refusal parsing; do not invent a parallel format.

### Claude's Discretion

- Emitter CLI shape (single script + flags), dry-run mode, re-emit/idempotency behavior.
- Matrix file name/location (e.g. `test/fixtures/capture-regression-matrix.json`) and runner placement (likely `test/integration/mcp/`).
- Fixture naming details (issue-numbered when known, fingerprint-derived otherwise), and whether emitted fixtures also register in `fixture-matrix.json`.
- red→locked flip: manual one-line edit is fine; a helper script only if friction appears.
- Whether a `locked` entry also gets a pointer row in `release-bug-matrix.json`.

### Deferred Ideas (OUT OF SCOPE)

- #64/#61 fix → Phase 3.1 (insert via `/gsd-phase`; fix, observe RED→GREEN flip, promote `red`→`locked`).
- 8 CHG turn-key specs + 4 CHG candidate defects → Phase 4 queue intake (re-verify each against current `main` before locking).
- Automatic ddmin minimization → v2 (AUTO-01).
- Emitter breadth beyond the false-green family (crash / wrong-result locks) — no v1 criterion requires it.
- Verdict → queue routing/prioritization → Phase 4 (QUEUE-02).
- Scripted red→locked promotion helper — only if the manual flip proves error-prone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REPRO-01 | A captured defect yields a minimal reproduction (fixture + trigger sequence), deterministically re-triggerable via assisted/manual trimming | D-07's predicate (warm-green ∧ cold-red via `judgeOrcl01`/`runColdLoadAndDiff`) is directly reusable — see "Don't Hand-Roll". The flagship's own trigger sequence (2-file load → out-of-band edit → reload) is empirically validated in this research (see central finding) and can seed the minimal-repro precedent for future captures. |
| LOCK-01 | Fixture materialization writes the minimal `.agda` repro under `test/fixtures/agda/` with automated placement + naming, mirroring #65/#66 | `#65/#66` precedent fixtures (`LargeDeepHole.agda`, `NamedHole.agda`, `NestedWhereHole.agda`) and `fixture-matrix.json`/`.ts` idiom read directly (see "Architecture Patterns"). The flagship needs the `FixtureDeps/`-style **multi-file** variant (`Transitive/`, `Chain/` precedent already exist) since it is a 2-file dependency pair, not a single file. |
| LOCK-02 | Emitter turns a captured bundle + fixture into a durable RED vitest test asserting ORCL-01's cold result on the normalized envelope, refusing INCONCLUSIVE/cheat-flagged captures | Verdict schema (`scripts/oracle/verdict-schema.mjs`'s `composeVerdict`) and ORCL-01's outcome shape (`scripts/oracle/orcl-01-differential.mjs`'s `server-false-green-candidate` → `{warmTuple, coldTuple, warmCategories, coldCategories}`) read directly — this IS the "expected value" the matrix entry should persist verbatim. `extractErrorCategory`/`categorySet` are the exact normalization the emitted assertion must reuse (never re-derive). |
| LOCK-03 | The #64/#61 defect is produced through the emitter as a from-RED test + fixture proving the scaffold end-to-end | **Resolved empirically in this research** (see "Central Research Question" below): a 2-file `FixtureDeps/`-style transitive pair, replayed via `agda_load_no_metas` under a tuned `AGDA_MCP_IDLE_COMPLETION_MS`/`AGDA_MCP_POST_STATUS_IDLE_MS` server env, is 100%-reproducibly RED today on current `main`, and is fixable in Phase 3.1 by extending the same terminus-tracking guard `runLoad` already has to `runLoadNoMetas`. |
</phase_requirements>

## Central Research Question: The #64/#61 Live Repro — RESOLVED

This was the single highest-value open question in the phase brief, and it was resolved by direct, repeated empirical test against the real, locally-installed Agda 2.8.0 binary and the actually-built `dist/index.js` server (not a mock, not a synthetic bundle) — **[VERIFIED: direct local reproduction, this research session]**.

### What CHG-REVERIFY.md already established (read first)

`.planning/research/CHG-REVERIFY.md` (2026-07-02) tried three repro shapes against `agda_load`/`agda_typecheck`/`agda_load_no_metas` in a warm session and found **all three now correctly report `type-error`** — the flagship "changed/provisionally-fixed", attributed to commit `e38f90a` (2026-06-30, the #65/#66 completion-detection fix). It flagged, but did not confirm, that `src/agda/agdai-cache.ts`'s per-file (non-transitive) cache-bust gap "likely still exists as written code" and recommended LOCK-03 "probe the large-module timing + `forceRecompile` edges".

### What this research adds: the precise mechanism, confirmed and reproduced

Reading `e38f90a`'s own commit message and the current source shows the fix was **scoped to exactly one of the two load-family code paths**:

- `runLoad` (powers `agda_load` **and** `agda_typecheck` — `agda_typecheck` explicitly routes through `session.load()`, confirmed by reading `src/session/register-agda-typecheck.ts`'s own header comment) passes `{ awaitGoalTerminus: true }` to `sendCommand` (`src/agda/session-load-impl.ts:83-87`). The transport then refuses to resolve the command until it has actually observed `InteractionPoints`/`AllGoalsWarnings`/`DisplayInfo Error` (`src/session/agda-transport.ts`, `awaitGoalTerminus`/`sawGoalTerminus`), and if that terminus never arrives, `runLoad` reports `load-incomplete-no-terminus` (a **failure**, never a false clean success) — see `loadIncompleteNoTerminus()` in `src/agda/session-load-helpers.ts:69-83`.
- `runLoadNoMetas` (powers **`agda_load_no_metas`** only) calls `sendCommand` with **no options at all** (`src/agda/session-load-impl.ts:198-200`) — `awaitGoalTerminus` defaults false, and there is **no equivalent fail-closed check anywhere in `runLoadNoMetas`**. The code comment explains why the author considered this safe ("Cmd_load_no_metas... emits no InteractionPoints/AllGoalsWarnings at all... 'no terminus' is normal completion, not truncation") — but this reasoning does not address the case where the response stream is truncated **before an Error/DisplayInfo event**, which is exactly the #65/#66 mechanism. `command-completion.ts`'s own doc comment confirms the asymmetry is deliberate: `awaitGoalTerminus` is "Set only on that path; every other command leaves it false and keeps the original fast idle behavior."

**This is empirically exploitable today.** I built a two-file fixture (`Main.agda` importing `Dep.agda`, mirroring the exact CHG-REVERIFY "signature-only-change" shape it recommended as strongest), drove it through the real built server via `test/helpers/mcp-harness.ts`, and reproduced:

1. **Baseline (default idle windows, ~900-line Main.agda):** does NOT reproduce — the load completes in under 600ms, well inside the default 250ms idle / 2000ms terminus windows either way. Confirms CHG-REVERIFY's own observation that small/fast fixtures don't hit the race.
2. **Fault-injected (`AGDA_MCP_IDLE_COMPLETION_MS=1`, `AGDA_MCP_POST_STATUS_IDLE_MS=1` passed as `extraEnv` to `createMcpHarness`):**
   - Warm load `Main.agda` via `agda_load_no_metas` → `ok-complete` (baseline, `Dep.agda` unmodified).
   - Out-of-band edit: `Dep.agda`'s `getValue : Nat` → `getValue : Bool` (signature-only change; `Dep.agda` still typechecks standalone).
   - Reload `Main.agda` via `agda_load_no_metas` in the **same warm session** → **`ok-complete`, `success: true`, zero errors** — the false green. Reproduced identically across **6 consecutive calls** (0 flakes).
   - **Control, same pathological env:** `agda_load` (metas) on the identical scenario correctly reports `load-incomplete-no-terminus` (fails closed, not a false green) across **5 consecutive calls** — proving the asymmetry is specifically about the missing terminus guard, not merely "everything breaks under a tiny idle window."
   - **`forceRecompile: true`** (only exposed by `agda_load`, not `agda_load_no_metas` — confirmed by reading `src/session/register-agda-load-no-metas.ts`'s schema) does not change the outcome either way; the mechanism is a transport completion-detection race, not an interface-cache-staleness problem. This corrects CHG-REVERIFY's `agdai-cache.ts` hypothesis: `bustAgdaiCache`/`findAgdaiArtifacts` (`src/agda/agdai-cache.ts`) work exactly as documented (per-file, not transitive) — but that gap turns out to be moot in practice, because Agda's own interactive top-level already re-checks transitive dependency freshness by mtime on every `Cmd_load`/`Cmd_load_no_metas` reissue in a warm session (confirmed: the metas-path control caught the same edit correctly once the transport race was controlled for). The real, confirmed residual gap is **the transport/completion-detection asymmetry between the two load-family code paths**, not the cache-bust code.

### Why this is a legitimate — not "rigged" — regression

- `AGDA_MCP_IDLE_COMPLETION_MS` / `AGDA_MCP_POST_STATUS_IDLE_MS` are pre-existing, already-shipped, documented production tunables (`src/session/command-completion.ts:47-53`), not something invented for this test. Deliberately lowering them is standard timeout/race fault-injection (the same technique used to test any timeout-handling code without waiting for a real slow network) — it forces, deterministically and in milliseconds, the same failure a genuinely large/slow real module would hit non-deterministically depending on machine speed. CHG's own real corpus is independently documented (`.planning/research/ORACLE-VALIDITY.md`) as sometimes exceeding `AGDA_MCP_COMMAND_TIMEOUT_MS` entirely on a from-scratch recompile — i.e., real compute gaps of this class are a measured, not hypothetical, property of the actual target corpus.
- The trigger sequence matches **D-09(part 1) exactly**: a real live session, a hand-scripted staleness scenario (load A imports B warm-green → edit B → reload A same session), driven through the real MCP tool boundary. Tuning a server env var is not "hand-building a synthetic bundle" (which D-09 rules out) — it is configuring a real session's timing sensitivity, the same way a captured session's `AGDA_MCP_COMMAND_TIMEOUT_MS`/library flags are already part of its real environment.
- `agda_load_no_metas` was **one of the four tools CHG's original v0.6.7 measurement found false-green** (`.planning/research/ORACLE-VALIDITY.md`: "`agda_load` / `agda_typecheck` / `agda_load_no_metas` / `agda_proof_status`... ALL returned ok-complete"). This is a direct continuation of the same reported defect family on a code path the interim fix did not close — not a different, newly-invented bug.

### Confirms LOCK-03 is fixable in Phase 3.1

The fix is narrow and mirrors the pattern Agda's own maintainers already applied to `runLoad`: extend `runLoadNoMetas`/the strict-load call to also request (a variant of) `awaitGoalTerminus`, and fail closed (`load-incomplete-no-terminus`-equivalent) rather than trusting `parsed.success` when no terminal event was observed. This is squarely inside Phase 3.1's stated scope ("the fix touches load/interface-cache staleness detection, unknown size").

### What ORCL-01 would say about this capture (confirms the LOCK-02 pipeline fits)

`findWarmLoadTuple` (`scripts/oracle/orcl-01-differential.mjs`) matches any recorded action whose tool matches `/^agda_(load|typecheck)/` — this regex **already matches `agda_load_no_metas`** by prefix, so no ORCL-01 change is needed to accept this capture. Critically, `runColdLoadAndDiff`'s cold side **always** issues a full metas `Cmd_load` with its own hardcoded `idleMs: 2000` (`scripts/oracle/orcl-01-differential.mjs:403`), completely independent of whatever env the warm session used — so replaying this exact capture cold would correctly produce `type-error`, diff against the false-green warm tuple, and emit `server-false-green-candidate` with the cold tuple as the correct expected value. The pipeline was already built to catch exactly this shape.

## Standard Stack

This phase adds **no new external dependency** — it is 100% first-party composition. "Standard stack" here means the internal modules to reuse, not packages to install.

### Core (internal reuse — do not re-derive)

| Module | Purpose | Why Standard |
|--------|---------|--------------|
| `scripts/oracle/orcl-01-differential.mjs` (`materializeCaptureEnvironment`, `runColdLoadAndDiff`, `judgeOrcl01`, `extractErrorCategory`, `categorySet`) | Path-sandboxed materialization (CR-01 already fixed here), the cold/warm tuple differential, category normalization | This is the SSOT for "what does the correct expected value look like" — LOCK-02 explicitly names ORCL-01's cold result as the expected value |
| `scripts/oracle/verdict-schema.mjs` (`composeVerdict`) | The verdict shape the emitter's refusal gate reads | Phase 2's deliverable contract; do not invent a parallel format (explicit CONTEXT.md instruction) |
| `scripts/oracle/run-oracle.mjs` (`runOracle`) | End-to-end: runs all 3 predicates, writes the verdict sidecar | Emitter should call this (or the underlying `judgeOrcl01`/`judgeOrcl02` directly) as a library import, not shell out and re-parse |
| `test/helpers/mcp-harness.ts` (`createMcpHarness`, `buildHarnessServerParameters`) | Spawns the built server, drives it as a real MCP client, supports `extraEnv` | D-02's mandated replay boundary; `extraEnv` is the exact seam the flagship's `serverEnv` tuning needs |
| `src/agda/session-load-helpers.ts` (`classifyLoadResult`) | Normalizes `{success, goalCount, invisibleGoalCount, sourceHoleCount}` → `{hasHoles, isComplete, classification}` | Both warm and cold sides of every diff already normalize through this one function |
| `src/tools/tool-envelope.ts` (`ToolEnvelope<T>`) | The assertion target shape (`ok`, `classification`, `data`, `diagnostics`) | LOCK-02 requires asserting on this normalized envelope, never raw wire/timing |
| `test/fixtures/release-bug-matrix.json`/`.ts`, `test/fixtures/agda/fixture-matrix.json`/`.ts` | The exact matrix + typed-zod-loader idiom (`loadValidatedJsonData`) | D-01 mandates following this idiom precisely, not inventing a new one |
| `src/agda/session-capture/artifact-types.ts` | `CaptureArtifact`/`ReplayManifest`/`RecordedAction`/`OracleSubstrate` — everything the emitter reads from a staged capture | Full contract already exists from Phase 1; no new capture fields needed for LOCK-03 specifically |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `test/helpers/isolated-agda-dir.ts` (`withIsolatedAgdaDir`) pattern (mkdtempSync-based) | Established isolation idiom | Model the replay runner's "copy fixture pair into a fresh tmpdir before mutating" step on this exact pattern (see Common Pitfalls — test isolation) |
| `src/agda/import-graph.ts` (`buildImportGraph`, `computeImpact`) | Dependency-graph walking, already exists | **Not needed for the Phase 3.1 fix** (Agda's own interactive top-level already re-checks transitive freshness by mtime) — do not let the planner reach for this expecting it's the missing piece; it isn't |
| `src/repo-root.ts` (`resolveFileWithinRoot`, `PathSandboxError`) | Path-sandbox primitive | Reuse directly for any NEW materialization code the emitter writes; this is what `materializeCaptureEnvironment` already builds on |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing `orcl-01-differential.mjs`'s materializer | Fork `scripts/verify-cold-replay.mjs`'s original materializer | Ruled out by D-08 explicitly — that original still has the CR-01 path-traversal hole and CR-02 false-PASS risk; the Phase-2 materializer already fixes CR-01 |
| Tuned-env-var deterministic fixture | A genuinely large (thousands-of-line) real-content fixture | Tested at ~900 lines of trivial arithmetic on this machine — did NOT reproduce under default timing. A "big enough" fixture is machine/content-dependent and risks a **flaky, non-durable** CI test — directly conflicts with LOCK-02's "durable" requirement. The tuned-env approach is deterministic and fast. |
| Emitter importing oracle functions directly | Emitter shells out to `npx tsx scripts/oracle/run-oracle.mjs <path>` and parses stdout/re-reads the sidecar | Direct import avoids a stale-sidecar risk and matches Phase 2's own D-05 "reuse as an imported library" precedent; shelling out adds a process-spawn + parse layer for no benefit |

**Installation:** None required — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages. All new code (`scripts/emit-regression.mjs`, the capture-regression matrix + loader, the replay runner) is first-party composition over existing Phase 1/2 modules and the already-installed `vitest`/`zod`/`@modelcontextprotocol/sdk`. No package legitimacy gate is required.

## Architecture Patterns

### System Architecture Diagram

```
 Live MCP session (real Agda, real dogfooding or hand-scripted rehearsal)
   │
   │  agda_capture_session (Phase 1, existing)
   ▼
 Staged CaptureArtifact JSON  ──────────────────────────┐
 (.agda-mcp/captures/<fingerprint>-<n>.json,            │
  gitignored, manifest + recordedActions + substrate)   │
   │                                                     │
   │  scripts/oracle/run-oracle.mjs (Phase 2, existing)  │
   ▼                                                     │
 Verdict sidecar (<...>.verdict.json)                    │
 { orcl01: {kind, coldTuple, coldCategories, ...},        │
   orcl02: {kind, findings}, orcl03: {...}, trueGreen }   │
   │                                                     │
   │  NEW: scripts/emit-regression.mjs (Phase 3)          │
   │    1. read capture + verdict                         │
   │    2. refusal gate (D-06): INCONCLUSIVE / cheat-      │
   │       flagged / no-policy-with-findings → exit 1      │
   │    3. materialize + path-sandbox the fixture pair      │
   │       under test/fixtures/agda/FixtureDeps/...         │
   │       (reuse materializeCaptureEnvironment's sandbox)   │
   │    4. write ONE matrix entry (status: "red",            │
   │       expected := orcl01.coldTuple/coldCategories,       │
   │       serverEnv := {...} if the trigger needs it)         │
   │    5. run the new entry once via the SAME runner below     │
   │       to CONFIRM it currently fails (D-05) — refuse to      │
   │       write status:"red" if the assertion doesn't fail       │
   ▼
 test/fixtures/capture-regression-matrix.json (+ .ts loader)
   │
   │  ONE generic runner, test/integration/mcp/capture-regression.test.ts
   │    for each entry: spawn createMcpHarness(serverEnv),
   │    drive the recorded trigger sequence (load → out-of-band
   │    file edit → reload, or whatever the entry's trigger says),
   │    assert final ToolEnvelope against entry.expected
   │    (classification + {success,goalCount,invisibleGoalCount,
   │    hasHoles} + errorCategories, via extractErrorCategory/
   │    categorySet — NEVER raw text/wire order/timing)
   │    → test.fails(...) when status:"red", plain test(...) when "locked"
   ▼
 vitest suite: RED while defect lives, GREEN once Phase 3.1 fixes it
   (locked entries also join `npm run test:release:bugs`)
```

### Recommended Project Structure

```
test/fixtures/
├── capture-regression-matrix.json   # NEW — D-01 matrix SSOT (top-level, mirrors release-bug-matrix.json)
├── capture-regression-matrix.ts     # NEW — typed zod loader (mirrors release-bug-matrix.ts)
├── release-bug-matrix.json/.ts      # existing precedent, unchanged
└── agda/
    └── FixtureDeps/
        └── TransitiveStaleness/     # NEW — mirrors existing Transitive/, Chain/ subdirectories
            ├── Main.agda            # imports Dep; uses Dep's value at the end
            ├── Dep.agda             # original, healthy content
            └── Dep.broken.agda      # post-edit content the trigger swaps in (mirrors WriteX.agda/.expected.agda pairing)

scripts/
├── emit-regression.mjs              # NEW — the emitter (Claude's Discretion: exact CLI flags)
└── oracle/                          # existing, Phase 2 — reused, not modified

test/integration/mcp/
└── capture-regression.test.ts       # NEW — the ONE generic replay runner (D-01)
```

### Pattern 1: Matrix-plus-typed-loader (D-01's mandated idiom)

**What:** A `.json` array is the SSOT; a sibling `.ts` file validates it once via `zod` + `loadValidatedJsonData` and exports a typed constant. Tests import the typed constant, never the raw JSON.
**When to use:** Every new capture-regression entry — never generate a standalone `.test.ts` per defect.
**Example:**
```typescript
// Source: test/fixtures/release-bug-matrix.ts (existing precedent, read directly)
import { z } from "zod";
import { loadValidatedJsonData } from "../helpers/json-data.js";

const captureRegressionEntrySchema = z.object({
  id: z.string().min(1),
  issue: z.array(z.number().int().positive()),
  status: z.enum(["red", "locked"]),
  tool: z.string().min(1),
  fixtureEntry: z.string().min(1),        // relative to test/fixtures/agda/
  serverEnv: z.record(z.string(), z.string()).optional(),
  expected: z.object({
    classification: z.string(),
    success: z.boolean(),
    goalCount: z.number().int().nonnegative(),
    invisibleGoalCount: z.number().int().nonnegative(),
    hasHoles: z.boolean(),
    errorCategories: z.array(z.string()),
  }),
});

export type CaptureRegressionEntry = z.infer<typeof captureRegressionEntrySchema>;
export const captureRegressionMatrix: CaptureRegressionEntry[] = loadValidatedJsonData(
  import.meta.dirname,
  "./capture-regression-matrix.json",
  z.array(captureRegressionEntrySchema),
);
```

### Pattern 2: `itSince`/`RUN_AGDA_INTEGRATION` gating + `withHarness` (D-03)

**What:** Every emitted regression needs a live Agda binary; self-skips outside `RUN_AGDA_INTEGRATION=1`.
**Example:**
```typescript
// Source: test/integration/mcp/mcp-server.test.ts (existing precedent, read directly)
const agdaVersion = detectAgdaVersion();
const agdaAvailable = agdaVersion !== undefined;
const it = agdaAvailable && process.env.RUN_AGDA_INTEGRATION === "1" ? test : test.skip;

async function withHarness(run: (h: Awaited<ReturnType<typeof createMcpHarness>>) => Promise<void>, extraEnv?: Record<string, string>) {
  const harness = await createMcpHarness({ serverRepoRoot: TEST_SERVER_REPO_ROOT, projectRoot: /* isolated tmpdir copy of the fixture pair */ "", extraEnv });
  try { return await run(harness); } finally { await harness.close(); }
}
```

### Pattern 3: `test.fails` for the RED lifecycle (D-04) — verified against installed vitest 4.1.2

**What:** `[VERIFIED: node_modules/@vitest/runner/dist/tasks.d-DI5LbrqA.d.ts, installed vitest@4.1.2]` — `"fails"` is a real chainable modifier on `test` (`ChainableTestAPI`'s chain list includes `"fails"`); its task option doc reads: "Whether the task should succeed if it fails. If the task fails, it will be marked as passed." This confirms D-04's mechanism works exactly as specified: wrap `red` entries in `test.fails(name, fn)` so the suite stays green while the assertion legitimately fails, and vitest surfaces a loud failure the moment the wrapped assertion starts passing (the fix landed).
```typescript
for (const entry of captureRegressionMatrix) {
  const runEntry = entry.status === "red" ? it.fails : it;
  runEntry(`${entry.id}: ${entry.tool} matches ORCL-01 cold expected value`, async () => {
    await withHarness(async (harness) => {
      // ... drive entry's recorded trigger sequence, assert final envelope ...
    }, entry.serverEnv);
  });
}
```

### Anti-Patterns to Avoid

- **Re-deriving the tuple/category diff inline in the emitted test:** always import `extractErrorCategory`/`categorySet` from `scripts/oracle/orcl-01-differential.mjs` — a second, slightly-different normalization would silently diverge from what ORCL-01 itself considers "matching".
- **Copying `scripts/verify-cold-replay.mjs`'s materializer verbatim:** it still has the CR-01 path-traversal hole; D-08 explicitly forbids this. Use `materializeCaptureEnvironment` (already fixed) or extend it.
- **Mutating the checked-in fixture file in place during a test run:** `Dep.agda` must be edited mid-scenario to reproduce the trigger — never do this against the shared `test/fixtures/agda/...` tree (breaks parallel/repeated test runs). Copy the fixture pair into a fresh `mkdtempSync` directory per test invocation (mirrors `withIsolatedAgdaDir`'s idiom) and point `projectRoot` there.
- **Assuming `forceRecompile`/`agdai-cache.ts` is the fix surface for LOCK-03's target:** empirically ruled out this session — the confirmed root cause is the transport completion-detection asymmetry, not interface-cache busting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path-sandboxed fixture materialization | A new "copy captured sources into a fixture dir" function | `scripts/oracle/orcl-01-differential.mjs`'s `materializeCaptureEnvironment` (extend or directly reuse) | Already fixes CR-01; a second hand-rolled copy risks re-introducing the exact traversal hole D-08 calls out |
| Cold-vs-warm classification diff | A new comparator over `LoadResult`-shaped objects | `runColdLoadAndDiff` + `TUPLE_FIELDS` + `categorySet`/`extractErrorCategory` | This IS the SSOT for "what counts as a match"; the emitted assertion must literally match what made ORCL-01 call it a false-green in the first place |
| Verdict composition / refusal semantics | A new "is this capture safe to lock" boolean | `scripts/oracle/verdict-schema.mjs`'s `composeVerdict` + the per-predicate `kind` enums | Explicit CONTEXT.md instruction: "never invent a parallel format" |
| Dependency-graph / transitive-closure walking for the fix | A new import-graph walker inside the emitter or the Phase 3.1 fix | `src/agda/import-graph.ts` exists but — per this research's empirical finding — **is not the missing piece**; the confirmed gap is transport completion-detection, not cache/graph logic |
| MCP client/server plumbing for replay | A new stdio client wrapper | `test/helpers/mcp-harness.ts`'s `createMcpHarness`/`buildHarnessServerParameters` (already supports `extraEnv`) | D-02's mandated boundary; already used by `mcp-server.test.ts` |

**Key insight:** Every piece Phase 3 needs was either built in Phase 1 (capture substrate) or Phase 2 (materializer, differential, verdict schema) specifically so Phase 3 wouldn't have to. The main engineering work is wiring, not invention — resist the temptation to build a "better" materializer or differential; the existing ones are already correctness-hardened (CR-01 fixed, environment-probe-gated, category-normalized).

## Common Pitfalls

### Pitfall 1: Assuming `agda_load`/`agda_typecheck` safety generalizes to `agda_load_no_metas`
**What goes wrong:** Testing only the metas path (as CHG-REVERIFY did) and concluding the whole #64/#61 family is closed.
**Why it happens:** `agda_typecheck` and `agda_load` share `session.load()`/`runLoad()`, so it's easy to assume "the load path" is singular. `agda_load_no_metas` is a genuinely separate code path (`runLoadNoMetas`) with no shared safety net.
**How to avoid:** Any future re-verification of this defect family must test all of `agda_load`, `agda_typecheck`, **and `agda_load_no_metas`** independently — they are not interchangeable for this bug class.
**Warning signs:** A "the bug is fixed" conclusion drawn from only one or two of the three load-family tools.

### Pitfall 2: A "large enough" fixture is not durable
**What goes wrong:** Building a genuinely huge `.agda` file to naturally trigger the timing race, expecting it to work in CI the same way it worked in one manual test.
**Why it happens:** The race depends on wall-clock compute time relative to a fixed idle window, which varies by machine speed, load, and Agda version. My 900-line trivial-arithmetic fixture did NOT trigger it under default settings on this machine — "large" is not a portable, deterministic property.
**How to avoid:** Use the deliberately-tuned `AGDA_MCP_IDLE_COMPLETION_MS`/`AGDA_MCP_POST_STATUS_IDLE_MS` `serverEnv` technique instead — deterministic, fast (sub-second), and CI-safe regardless of runner speed.
**Warning signs:** A regression test that passes/fails inconsistently across CI runs or machines — a strong signal it's relying on real timing rather than fault injection.

### Pitfall 3: Mutating shared fixtures in place breaks test isolation
**What goes wrong:** The trigger sequence requires editing `Dep.agda` out-of-band mid-scenario; doing this against the checked-in `test/fixtures/agda/...` path directly corrupts it for any other test running concurrently or any re-run.
**Why it happens:** Every other fixture in `test/fixtures/agda/` is read-only for the duration of a test; this is the first fixture that needs a real mid-test mutation.
**How to avoid:** Copy the `FixtureDeps/TransitiveStaleness/` pair into a fresh `mkdtempSync`-created temp directory per test invocation (mirroring `test/helpers/isolated-agda-dir.ts`'s established idiom) before pointing `projectRoot` at it; mutate the copy, never the source tree.
**Warning signs:** Flaky failures that only appear when running the full suite (not in isolation), or `git status` showing a dirty fixture file after `npm test`.

### Pitfall 4: The `serverEnv`/tuned-timing technique isn't part of the standard `ReplayManifest`
**What goes wrong:** Assuming a captured `CaptureArtifact`'s `manifest` (Phase 1's `ReplayManifest`) already records whatever env vars the warm session ran under, so no schema change is needed.
**Why it happens:** `ReplayManifest` captures Agda version/binary/argv/AGDA_DIR/closure-hash — a thorough-looking list that doesn't include `AGDA_MCP_IDLE_COMPLETION_MS`-class server tuning vars, because those affect the MCP server's own transport timing, not Agda's own invocation.
**How to avoid:** The capture-regression matrix entry (not `ReplayManifest`) needs its own optional `serverEnv` field, threaded into `createMcpHarness`'s existing `extraEnv` parameter by the generic runner. This is additive to the matrix schema only — no change to Phase 1/2 artifact shapes needed.
**Warning signs:** An emitted regression that can't reproduce RED at emit-time (D-05's self-check) because the runner spawned the harness without the env the capture actually needs.

### Pitfall 5: The Phase-1 filename-collision BLOCKER will bite during the flagship rehearsal
**What goes wrong:** D-09(part 1)'s rehearsal explicitly requires capturing a real live session; `01-VERIFICATION.md`'s BLOCKER means a second capture in the same session (very likely while iterating on getting the trigger right) silently overwrites the first, losing the drained action log with no error.
**Why it happens:** Staged filename is `${dedup.fingerprint}-${dedup.recurrence}.json` (`src/tools/register-capture-session.ts:164-167`), both session-static; `recurrence` only advances via the manual, out-of-band `scripts/promote-capture.mjs`.
**How to avoid:** Per CONTEXT.md's own explicit instruction, fix this collision (append a monotonic timestamp/counter, or refuse-on-collision) **before or as the first task of Phase 3** — not something to discover mid-rehearsal.
**Warning signs:** A staged capture's `capturedAt` timestamp not matching the capture call that was "supposed" to have produced it.

### Pitfall 6: `test:release:bugs` is a hardcoded file list, not a glob
**What goes wrong:** Assuming a new `test/integration/mcp/capture-regression.test.ts` automatically joins the release-bug gate once entries flip to `locked`.
**Why it happens:** `package.json`'s `test:release:bugs` script is a literal, enumerated list of test file paths, not `test/integration/**/*regression*`.
**How to avoid:** When the flagship flips to `locked` in Phase 3.1, explicitly add the new runner's path to both `test:release:bugs` and `test:release:bugs:sentinel` in `package.json`.
**Warning signs:** A "locked" regression that never actually runs in the release gate because nobody updated the hardcoded list.

## Code Examples

### The empirically-verified flagship trigger sequence (adapt directly for the emitter's matrix entry / fixture)

```typescript
// Dep.agda (original — Main.agda's transitive dependency)
module Dep where

data Nat : Set where
  zero : Nat
  suc  : Nat -> Nat

getValue : Nat
getValue = suc zero

// Dep.broken.agda (the out-of-band edit the trigger swaps in — signature-only
// change; Dep.agda ALONE still typechecks fine standalone, isolating true
// interface staleness from a body-level error, per CHG-REVERIFY's own
// recommendation for "the strongest repro shape")
module Dep where

data Nat : Set where
  zero : Nat
  suc  : Nat -> Nat

data Bool : Set where
  true false : Bool

getValue : Bool
getValue = true

// Main.agda — imports Dep, uses getValue at the very end (mirrors
// LargeDeepHole.agda's "hole sits deep in the file" precedent, but for an
// error, not a hole)
module Main where

open import Dep

_+_ : Nat -> Nat -> Nat
zero  + n = n
suc m + n = suc (m + n)

-- ... trivial n0..nK filler definitions (content, not count, is what
--     matters for real large modules; for THIS deterministic repro the
--     filler is cosmetic — the tuned serverEnv does the real work) ...

useValue : Nat
useValue = getValue
```

```typescript
// Trigger sequence (verified this session against the real built server):
// 1. harness = createMcpHarness({ projectRoot: <isolated copy>, extraEnv: {
//      AGDA_MCP_IDLE_COMPLETION_MS: "1", AGDA_MCP_POST_STATUS_IDLE_MS: "1" } })
// 2. harness.callTool("agda_load_no_metas", { file: "Main.agda" })
//      -> classification: "ok-complete" (baseline, Dep.agda original)
// 3. writeFileSync(<copy>/Dep.agda, <contents of Dep.broken.agda>)
// 4. harness.callTool("agda_load_no_metas", { file: "Main.agda" })
//      -> OBSERVED (current main): classification: "ok-complete", success: true
//         (the false green — matches ORCL-01's would-be cold expected value
//          of classification: "type-error", success: false,
//          errorCategories: ["UnequalTerms"])
// Control (proves the asymmetry, not just "idle=1 breaks everything"):
// 4'. harness.callTool("agda_load", { file: "Main.agda" }) under the SAME env
//      -> classification: "load-incomplete-no-terminus", success: false
//         (fails closed correctly — metas path's terminus guard holds even
//          under the identical pathological timing)
```

### Reusing ORCL-01's normalization for the emitted assertion

```typescript
// Source: scripts/oracle/orcl-01-differential.mjs (existing, Phase 2)
import { extractErrorCategory, categorySet } from "../../../scripts/oracle/orcl-01-differential.mjs";

// In the replay runner, after calling the tool:
const data = result.structuredContent.data;
expect(result.structuredContent.classification).toBe(entry.expected.classification);
expect(data.success).toBe(entry.expected.success);
expect(data.goalCount).toBe(entry.expected.goalCount);
expect(data.invisibleGoalCount).toBe(entry.expected.invisibleGoalCount);
expect(data.hasHoles).toBe(entry.expected.hasHoles);
expect(categorySet([...data.errors, ...data.warnings])).toEqual(entry.expected.errorCategories);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| No terminus-tracking on any load path — first idle gap after any response resolves the command | `awaitGoalTerminus`/`sawGoalTerminus` fail-closed guard on the metas (`agda_load`/`agda_typecheck`) path only | `e38f90a`, 2026-06-30 | Closed #65/#66 and the metas-path #64/#61 shape; left `agda_load_no_metas` exposed (confirmed this session) |
| Theory: "`agdai-cache.ts`'s per-file (non-transitive) bust is the #64/#61 root cause" (`CONCERNS.md`, 2026-07-01) | Empirically corrected: Agda's own interactive top-level already re-checks transitive dependency freshness by mtime on `Cmd_load`/`Cmd_load_no_metas` reissue; the real residual gap is the transport completion-detection asymmetry | This research session, 2026-07-02 | `CONCERNS.md`'s "safe modification: walk the import graph" guidance is supersede-worthy — Phase 3.1 should NOT reach for `import-graph.ts` first |

**Deprecated/outdated:** `CONCERNS.md`'s framing of #64/#61 as an `agdai-cache.ts`/`import-graph.ts` problem should be treated as superseded by this research's direct empirical finding when Phase 3.1 is planned.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A genuinely large real-world module (e.g. actual agda-unimath-scale HoTT content) would, under **default** (untuned) idle-window settings, naturally hit the same `agda_load_no_metas` truncation race non-deterministically | Central Research Question, Pitfall 2 | If wrong, the "this simulates a real large-module race" framing weakens to "this is purely a fault-injection test of a theoretical code path" — still a legitimate regression (the code path genuinely has no safety net), but the "matches CHG's real-world experience" narrative would need softening. Does not affect LOCK-03's core deliverable (a genuine, reproducible RED test), only its narrative framing. |
| A2 | The exact fixture content (Nat/Bool signature-only swap, transitive 2-file shape) is representative enough of "the #64/#61 family" to satisfy LOCK-03's "the transitive-staleness/false-green defect" wording, as opposed to needing the literal CHG-corpus shape | Central Research Question | If a reviewer insists LOCK-03 must reproduce the EXACT original agda-unimath-scale trigger (not a minimized analog), the emitter/trimmer would need to attempt capture against a real large corpus rather than this minimized fixture — REPRO-01's own "minimal reproduction" framing and D-07's "no automatic minimization" language both support that a minimized, mechanism-equivalent fixture is the intended deliverable, not a byte-for-byte reproduction of the original scale. |
| A3 | Extending `runLoadNoMetas` with a terminus-tracking guard (mirroring `runLoad`'s) is a sufficiently narrow fix for Phase 3.1, with no other hidden asymmetries between the two load paths | State of the Art, "Confirms LOCK-03 is fixable" | If wrong (some other divergence exists), Phase 3.1's scope could grow; this claim is inferred from reading the two functions side-by-side, not from having implemented and tested the fix itself (that is explicitly Phase 3.1's job, not this research's). |

## Open Questions

1. **Exact capture-regression matrix field names and emitter CLI shape**
   - What we know: D-01 mandates the matrix+loader idiom; Claude's Discretion explicitly leaves file naming/location and CLI shape open. This research proposes concrete field names (`id`, `issue`, `status`, `tool`, `fixtureEntry`, `serverEnv`, `expected`) informed by what the flagship empirically needs.
   - What's unclear: Whether future (Phase 4) captures beyond the flagship will need additional fields this proposal doesn't anticipate (e.g., multi-step trigger sequences beyond "load → edit → reload").
   - Recommendation: Treat the proposed schema as a strong starting point, not a final contract; keep it extensible (the `serverEnv` field, e.g., should be optional and additive).

2. **Should the emitter require a pre-existing verdict sidecar file, or call `runOracle()` fresh?**
   - What we know: `scripts/oracle/run-oracle.mjs`'s `runOracle` is an exported function; the sidecar file is also a real, persisted artifact.
   - What's unclear: Whether "refuse to lock a capture that fails ORCL-02 or is ORCL-01 INCONCLUSIVE" (LOCK-02) should re-run the oracle at emit time (freshest signal, but slower/re-spawns cold Agda) or trust an existing sidecar (faster, but could be stale if the capture or code changed since the sidecar was written).
   - Recommendation: Call `runOracle()` fresh at emit time — matches D-05's own "runs the new entry once... at emit time" freshness principle, and avoids a stale-sidecar class of bug entirely.

3. **Does the flagship's fixture need to register in `fixture-matrix.json` as well as the new capture-regression matrix?**
   - What we know: Claude's Discretion explicitly leaves this open. `fixture-matrix.json` is about single-file load-classification expectations; the flagship is a 2-file scenario with a mid-test mutation, which doesn't fit that schema's shape (`expectedClassification` etc. assume a static file).
   - What's unclear: Whether there's value in also asserting the STATIC (pre-edit) `Main.agda`+`Dep.agda` pair's baseline classification via `fixture-matrix.json` for cheap regression coverage of "this fixture still loads cleanly when nothing is broken."
   - Recommendation: Skip it for the flagship (the shape doesn't fit); revisit only if a future single-file capture-regression naturally fits `fixture-matrix.json`'s existing schema.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Agda binary | All RED/GREEN replay, ORCL-01 cold spawns | ✓ | 2.8.0 (within declared 2.6.4.3–2.9.0 range) | — |
| Node.js | Server runtime, test execution | ✓ (but see note) | v22.22.0 | `package.json` declares `engines: ">=24"`; this research (and CHG-REVERIFY before it) ran driver scripts via `npx tsx` specifically to sidestep ESM `.js`→`.ts` resolution failures on Node < 24 — **the emitter and any new driver scripts must document/enforce the same `npx tsx`, never bare `node`, requirement** until the dev/CI environment is actually on Node 24 |
| Built `dist/index.js` | `test/helpers/mcp-harness.ts`'s `createMcpHarness` (spawns the built server) | ✓ (present, rebuild before use) | — | `npm run build` (already wired as `pretest`) |
| `tsx` | Running any `.mjs` script that imports `src/*.ts`/`test/helpers/*.ts` by `.js`-suffixed specifier | ✓ (present in devDependencies; also auto-installed via `npx` if missing) | 4.22.4 (observed) | `npx tsx` already the established convention (`scripts/mcp-local-client.mjs`, `scripts/oracle/*.mjs`) |

**Missing dependencies with no fallback:** None — everything this phase needs is already present in the dev environment.

**Missing dependencies with fallback:** Node 24 (declared minimum) vs the observed v22.22.0 — fallback is the already-established `npx tsx` convention; not a blocker, but should not be silently "fixed" by assuming Node 24 is present in whatever environment executes this phase's plans.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (`vitest.config.ts`) |
| Config file | `vitest.config.ts` — includes `test/examples/**`, `test/unit/**`, `test/property/**`, `test/integration/**`; `testTimeout: 30_000` |
| Quick run command | `npx vitest run test/integration/mcp/capture-regression.test.ts` |
| Full suite command | `RUN_AGDA_INTEGRATION=1 npm run build && RUN_AGDA_INTEGRATION=1 npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOCK-01 | Fixture materialization places files under `test/fixtures/agda/FixtureDeps/...` with correct naming | unit | `npx vitest run test/unit/scripts/emit-regression.test.ts -t "materialize"` | ❌ Wave 0 |
| LOCK-01 | Materializer rejects path-traversal entries (`..`/absolute escapes) | unit (property-style, per AGENTS.md's property-TDD preference) | `npx vitest run test/unit/scripts/emit-regression.test.ts -t "path-sandbox"` | ❌ Wave 0 |
| LOCK-02 | Emitter refuses to lock ORCL-01 INCONCLUSIVE / ORCL-02 cheat-flagged / no-policy-with-findings captures | unit | `npx vitest run test/unit/scripts/emit-regression.test.ts -t "refusal gate"` | ❌ Wave 0 |
| LOCK-02 | Emitted matrix entry asserts on normalized envelope fields only (never raw text) | unit | `npx vitest run test/unit/fixtures/capture-regression-matrix.test.ts` | ❌ Wave 0 |
| LOCK-02 | D-05: emitter demonstrates RED at emit time before writing `status:"red"` | integration (requires real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts` | ❌ Wave 0 |
| LOCK-03 | The flagship #64/#61 entry is RED on current `main`, GREEN only after Phase 3.1's fix | integration (`test.fails`, real Agda) | `RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts -t "issue-64-61"` | ❌ Wave 0 (this research empirically pre-validated the underlying behavior manually; the vitest wrapper itself does not exist yet) |
| REPRO-01 | Trimming's "still reproduces" check (warm-green ∧ cold-red) is available as a callable predicate | unit | `npx vitest run test/unit/scripts/oracle/orcl-01-differential.test.ts` (already exists, Phase 2 — reused, not new) | ✓ (Phase 2) |

### Sampling Rate

- **Per task commit:** `npx vitest run test/unit/` (fast, Agda-free subset covering matrix/loader/refusal-gate logic)
- **Per wave merge:** `RUN_AGDA_INTEGRATION=1 npm run build && RUN_AGDA_INTEGRATION=1 npx vitest run test/integration/mcp/capture-regression.test.ts`
- **Phase gate:** `RUN_AGDA_INTEGRATION=1 npm test` full suite green before `/gsd:verify-work`, plus a manual confirmation that the flagship entry is currently `test.fails`-RED (not accidentally already passing) prior to closing Phase 3

### Wave 0 Gaps

- [ ] `test/fixtures/capture-regression-matrix.json` + `.ts` — the new matrix SSOT (does not exist yet)
- [ ] `test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda` — the flagship fixture pair (does not exist yet; content verified working in this research's scratch reproduction, ready to be committed in this form)
- [ ] `scripts/emit-regression.mjs` — the emitter itself (does not exist yet)
- [ ] `test/integration/mcp/capture-regression.test.ts` — the one generic replay runner (does not exist yet)
- [ ] Fix for the Phase-1 staged-capture filename collision (`src/tools/register-capture-session.ts:164-167`) — needed before the flagship rehearsal per CONTEXT.md's explicit sequencing note

## Security Domain

`security_enforcement` is absent from `.planning/config.json` → treated as enabled. This is a local stdio CLI tool with no network/auth surface, so most ASVS categories don't apply; the categories that DO apply are narrowly scoped to file-system trust boundaries this phase directly touches.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No auth surface — stdio MCP server, single local user |
| V3 Session Management | No | No web/HTTP sessions; `AgdaSession` is a process-lifecycle concept, not an ASVS session |
| V4 Access Control | No | No multi-user access model |
| V5 Input Validation | Yes | `zod` schemas on every tool input (existing convention, `src/tools/tool-schemas.ts`); the NEW matrix loader must use `loadValidatedJsonData` + a `zod` schema (Pattern 1 above), not raw `JSON.parse` |
| V6 Cryptography | Partial | `fingerprintBugReport()`'s sha256 (existing, Phase 1) — not introduced by this phase; no new crypto needed |
| V12 File/Resource Handling (closest ASVS fit for this phase's real risk) | Yes | Path-sandboxed materialization via `resolveFileWithinRoot`/`PathSandboxError` (`src/repo-root.ts`) — **mandatory** per D-08; this is the phase's one genuine security-relevant surface, since fixture materialization writes into the **tracked repo tree** (unlike Phase 1's gitignored staging) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Path traversal via a captured artifact's `inlinedFirstPartySources[].path` (`..`/absolute escape) written into `test/fixtures/agda/...` | Tampering | `resolveFileWithinRoot` + catch `PathSandboxError` + skip (never write outside the sandbox) — already implemented correctly in `materializeCaptureEnvironment`; D-08 mandates reusing this, not `verify-cold-replay.mjs`'s uncorrected original |
| A malformed/adversarial matrix JSON causing the runner to execute unintended file paths or env injections | Tampering / Elevation | `zod` schema validation on load (`loadValidatedJsonData`), matching every other matrix in the codebase — reject unknown/malformed entries at load time, not at use time |
| `serverEnv` field used to inject arbitrary environment variables into the spawned server process | Tampering | Since matrix entries are checked-in, reviewed, first-party data (not user input at runtime), this is a low-severity concern in practice — but the loader's `zod` schema should still constrain `serverEnv` to `Record<string, string>` (already proposed) rather than accepting arbitrary nested structures |

## Sources

### Primary (HIGH confidence — direct source read or direct empirical execution, this session)
- `src/agda/session-load-impl.ts`, `src/session/command-completion.ts`, `src/session/agda-transport.ts` — confirmed the `awaitGoalTerminus` asymmetry between `runLoad` and `runLoadNoMetas`
- `git show --stat e38f90a` and `git show e38f90a -- src/agda/agdai-cache.ts` (empty diff) — confirmed `agdai-cache.ts` was untouched by the #65/#66 fix
- Direct empirical test against local Agda 2.8.0 + built `dist/index.js` via `test/helpers/mcp-harness.ts` (this session's scratch driver scripts) — the central false-green reproduction, 6/6 and 5/5 repeatable
- `node_modules/@vitest/runner/dist/tasks.d-DI5LbrqA.d.ts` (installed vitest@4.1.2) — verified `test.fails` chainable API
- `scripts/oracle/orcl-01-differential.mjs`, `scripts/oracle/verdict-schema.mjs`, `scripts/oracle/run-oracle.mjs` — full read of ORCL-01's mechanics and the verdict contract
- `src/agda/session-capture/artifact-types.ts`, `src/tools/register-capture-session.ts`, `src/tools/tool-envelope.ts`, `src/repo-root.ts` — capture/envelope/sandbox contracts
- `test/fixtures/release-bug-matrix.json`/`.ts`, `test/fixtures/agda/fixture-matrix.json`/`.ts`, `test/helpers/mcp-harness.ts`, `test/helpers/isolated-agda-dir.ts`, `test/integration/mcp/mcp-server.test.ts`, `test/unit/reporting/release-bug-matrix.test.ts` — existing idiom precedents
- `.planning/codebase/TESTING.md`, `.planning/codebase/CONCERNS.md`, `package.json`, `vitest.config.ts` — testing conventions and script wiring

### Secondary (MEDIUM confidence)
- `.planning/research/ORACLE-VALIDITY.md`, `.planning/research/CHG-REVERIFY.md` — prior research this phase's finding directly extends/corrects (their own empirical work was HIGH confidence for what they tested; my correction is about a path they did not test)

### Tertiary (LOW confidence)
- None — every claim in this research was either verified against installed code/types or directly, repeatedly executed against a real local Agda binary this session.

## Metadata

**Confidence breakdown:**
- Central research question (LOCK-03 repro): HIGH — directly, repeatedly reproduced (6/6, 5/5) against real Agda 2.8.0 and the actually-built server, with a control isolating the exact mechanism
- Standard stack / reuse map: HIGH — every module cited was read directly, not inferred
- Architecture patterns: HIGH — every pattern shown is copied/adapted from an existing, currently-passing precedent in the repo
- Pitfalls: HIGH for Pitfalls 1-5 (directly observed or directly read); MEDIUM for Pitfall 6 (package.json content read directly, but the "will someone forget to update it" risk is inherently a process claim)
- Assumptions Log A1/A2/A3: correctly flagged as MEDIUM/inferred — these are the only claims in this document not directly verified

**Research date:** 2026-07-02
**Valid until:** The central empirical finding (LOCK-03 repro mechanism) is tied to the exact current `main` commit and Agda 2.8.0 behavior — re-verify if either changes materially before Phase 3 executes. Architecture/reuse findings are stable until Phase 1/2 code is refactored (30-day estimate for a fast-moving milestone).
