# Codebase Structure

**Analysis Date:** 2026-07-04

This repository holds two co-located systems (see `ARCHITECTURE.md` for the
full explanation): the published MCP server (`src/`, compiled to `dist/`)
and an unpublished self-improvement pipeline (`scripts/`) that dogfoods,
captures, judges, and — as of v1.1 — ingests teammates' sessions into a
tracked fix queue. `package.json#files` only ever lists `dist`, `README.md`,
`LICENSE`, `schemas` — `scripts/` never ships.

## Directory Layout

```
agda-mcp-server/
├── src/                        # TypeScript source (compiled to dist/ via tsc) — the published server
│   ├── index.ts                # Server entrypoint — CLI flags, session, tool registration, shutdown
│   ├── agda-process.ts         # Backward-compat barrel re-exporting src/agda/session.ts + types
│   ├── json-data.ts            # loadJsonData() — SSOT loader for static *.json data tables
│   ├── repo-root.ts            # PROJECT_ROOT / SERVER_REPO_ROOT resolution + PathSandboxError
│   ├── server-version.ts       # Server version + Agda supported-range classification
│   ├── agda/                   # Agda subprocess + protocol-aware domain operations
│   │   ├── session.ts          # AgdaSession class (lifecycle facade, SSOT)
│   │   ├── session-process-lifecycle.ts
│   │   ├── session-command-dispatch.ts
│   │   ├── session-load-impl.ts
│   │   ├── session-load-helpers.ts   # Result builders, option validation, Cmd_metas reconciliation
│   │   ├── agda-process-spawn.ts
│   │   ├── agda-version-detection.ts, agda-version.ts
│   │   ├── binary-discovery.ts       # Resolves AGDA_BIN / PATH / tooling/scripts/run-pinned-agda.sh
│   │   ├── goal-operations.ts        # give/refine/refineExact/intro/caseSplit/autoOne + rejection detection
│   │   ├── expression-operations.ts, advanced-queries.ts, display-operations.ts
│   │   ├── backend-operations.ts, backend-expression.ts
│   │   ├── agent-ux.ts          # barrel → error-classifier/source-parsers/refactor-helpers/clause-fixity
│   │   ├── error-classifier.ts, source-parsers.ts, refactor-helpers.ts, clause-fixity.ts
│   │   ├── types.ts             # Shared result types (LoadResult, GiveResult, CaseSplitResult, etc.)
│   │   ├── response-parsing.ts, normalize-response.ts, parse-load-responses.ts
│   │   ├── goal-analysis.ts, goal-merging.ts
│   │   ├── library-registration.ts, agdai-cache.ts
│   │   ├── completeness.ts, protocol-errors.ts, version-support.ts
│   │   ├── import-graph.ts, source-path-utils.ts
│   │   ├── logger.ts, session-constants.ts
│   │   ├── session-capture/     # Replay-manifest + action-log recorder for agda_capture_session
│   │   │   ├── session-capture.ts        # barrel
│   │   │   ├── artifact-types.ts         # CaptureArtifact / ReplayManifest / CaptureReference contract
│   │   │   ├── recorded-transport.ts     # AGDA_MCP_CAPTURE=1-gated ring buffer
│   │   │   ├── manifest-builder.ts       # buildReplayManifest() off the live AgdaSession
│   │   │   ├── import-closure-hash.ts, dedup-index.ts, triage-derivation.ts, oracle-substrate.ts
│   │   └── data/                # Static JSON tables (source extensions, feature flags, fixities)
│   ├── session/                 # Load orchestration, project config, proof-edit appliers
│   │   ├── agda-transport.ts    # IOTCM transport — response collection, completion detection
│   │   ├── load-terminus-tracker.ts  # metas-vs-strict load success-signal state (extracted sibling)
│   │   ├── command-completion.ts
│   │   ├── project-config.ts, project-config-diagnostics.ts
│   │   ├── apply-proof-edit.ts  # barrel → safe-source-io/apply-goal-edit/apply-batch-edits/apply-text-edit
│   │   ├── safe-source-io.ts, apply-goal-edit.ts, apply-batch-edits.ts, apply-text-edit.ts
│   │   ├── goal-positions.ts, goal-state.ts, goal-catalog.ts
│   │   ├── reload-and-diagnose.ts, load-tool-shared.ts
│   │   ├── load-tool-registration.ts, process-tool-registration.ts
│   │   ├── register-agda-load.ts, register-agda-load-no-metas.ts
│   │   ├── register-agda-typecheck.ts, register-agda-apply-edit.ts
│   │   ├── session-namespaces.ts, session-state.ts, session-snapshot.ts
│   │   ├── stdout-line.ts, tool-presentation.ts, tool-recommendation.ts
│   │   └── literate/            # Literate-Agda format detection/extraction (md, LaTeX, org, reST, tree)
│   ├── protocol/                # Pure IOTCM wire-format functions — no side effects
│   │   ├── command-builder.ts   # SSOT for IOTCM string assembly
│   │   ├── command-line-options.ts, command-line-suggestions.ts, profile-options.ts
│   │   ├── command-registry.ts, metadata.ts, parity-matrix.ts, response-schemas.ts
│   │   ├── responses/           # Per-`kind` response decoders
│   │   │   ├── proof-actions.ts       # Shared detectDisplayInfoError() + success-marker predicates
│   │   │   ├── display-info.ts, load-display.ts, goal-display.ts, goal-expression-display.ts
│   │   │   ├── expression-display.ts, backend.ts, search-about.ts, process-controls.ts
│   │   │   └── process-output.ts, text-display.ts
│   │   └── data/                # Protocol command registry, parity overrides, command-line-options.json
│   ├── tools/                   # MCP adapter layer — thin registration files (two-tier composition)
│   │   ├── register-core-tools.ts     # Top-level: wires 13 register() groups (main() call site)
│   │   ├── session.ts, expression-tools.ts, query-tools.ts, scope-tools.ts
│   │   ├── display.ts, backend.ts, analysis-tools.ts, cache-tools.ts, impact-tool.ts
│   │   ├── goal-tools.ts        # Read-only goal/context/checked-term queries; delegates writes below
│   │   ├── goal-write-tools.ts  # case_split/give/refine/refine_exact/intro/auto + rejection handling
│   │   ├── file-tools.ts        # barrel → file/*.ts
│   │   ├── file/                # read-module, list-modules, search-definitions, check-postulates, shared
│   │   ├── agent-ux-tools.ts    # barrel → agent-ux/*.ts
│   │   ├── agent-ux/            # migration-tools, edit-tools, import-tools, options-tools, project-tools, shared
│   │   ├── reporting-tools.ts   # 2nd-tier barrel → register-{tools-catalog,protocol-parity,bug-bundles,
│   │   │                        #   capture-session,session-snapshot,goal-catalog,tool-recommend}.ts
│   │   ├── register-bug-bundles.ts, register-capture-session.ts, register-goal-catalog.ts
│   │   ├── register-protocol-parity.ts, register-session-snapshot.ts, register-tool-recommend.ts
│   │   ├── register-tools-catalog.ts
│   │   ├── manifest.ts          # Runtime SSOT for exposed tools/categories/schema field names
│   │   ├── tool-envelope.ts     # ToolResult / ToolDiagnostic shape + envelope builders
│   │   ├── tool-registration.ts # wrapStructuredHandler / wrapStructuredGoalHandler etc.
│   │   ├── tool-errors.ts       # ToolInvocationError + write-rejection helpers (throwIfWriteRejected, ...)
│   │   ├── tool-gates.ts, tool-helpers.ts, tool-schemas.ts, tool-provenance.ts, tool-family-examples.ts
│   │   ├── path-utils.ts, reporting-schemas.ts
│   │   └── data/                # tool-family-examples.json
│   └── reporting/
│       └── bug-report.ts        # Structured bug-bundle construction + fingerprints
├── scripts/                     # Loop ② — dogfood/capture/judge/team-channel pipeline. NEVER published.
│   ├── dogfood/
│   │   ├── dogfood-run.mjs          # Recording proxy: spawns dist/index.js, gates on a task manifest,
│   │   │                            #   writes an incremental (finalized:false → true) run-report.json
│   │   ├── transcript-writer.mjs    # NDJSON transcript + per-tool tallies + staged-capture list
│   │   ├── task-manifest.mjs        # loadTaskManifest() — the D-03 mechanical pre-flight hard gate
│   │   ├── dogfood-wrapup.mjs       # Per-capture judge: oracle triad → flake gate → file/side-channel;
│   │   │                            #   D-12 unconditional upload-chain tail
│   │   ├── flake-classify.mjs       # N-rerun warm-replay anti-phantom gate
│   │   ├── upload-run.mjs           # TEAM-02: tar.gz pack + fail-open Bearer POST + bounded retry queue
│   │   ├── agent-log-selection.mjs  # Claude Code / Codex session-log discovery for a run's time window
│   │   └── install-dogfood-skill.mjs # Symlinks .agents/skills/agda-dogfooding into .claude/skills/
│   ├── oracle/                      # The Phase-2 oracle triad
│   │   ├── run-oracle.mjs           # Composes ORCL-01+02+03, writes a verdict sidecar + metrics line
│   │   ├── orcl-01-differential.mjs # Cold-replay server-faithfulness differential
│   │   ├── orcl-02-soundness-scan.mjs # Static postulate/unsafe-pragma/hole soundness-hygiene scan
│   │   ├── orcl-03-conformance.mjs  # Advisory proven-vs-expected-signature conformance proxy
│   │   ├── cold-agda-session.mjs    # Shared disposable cold-Agda lifecycle + environment probes
│   │   └── verdict-schema.mjs       # composeVerdict() — the shared ORCL-01/02/03 -> trueGreen contract
│   ├── queue/                       # The Phase-4 fix queue
│   │   ├── intake.mjs               # readQueueFile/upsertQueueEntry — the ONLY writer of the SSOT
│   │   ├── priority.mjs             # QUEUE-02 forced ordering (false-green > crash > wrong-result > ...)
│   │   ├── dashboard.mjs            # Derived, regenerated Markdown view (docs/FIX-QUEUE-DASHBOARD.md)
│   │   ├── mirror-github.mjs        # Optional, one-way, dry-run-by-default GitHub Issues publisher
│   │   └── seed-initial-cargo.mjs   # One-off seeding of the v1.0 flagship + CHG backlog entries
│   ├── team/                        # v1.1 team feedback channel (TEAM-01..04)
│   │   ├── issue-key.mjs            # TEAM-01: mint/rotate/revoke/verify Bearer keys, consent statement
│   │   ├── ingest-server.mjs        # TEAM-03: node:http endpoint, Bearer auth, streamed size cap
│   │   ├── archive-extract.mjs      # TEAM-04 Task 1: two-layer sandboxed tar extraction
│   │   ├── cron-ingest-wrapup.mjs   # TEAM-04 Task 2: unattended judge + git commit/push write-back
│   │   └── data/
│   │       └── team-keys.json       # GITIGNORED — hash-only key registry (secret, not a data table)
│   ├── data/
│   │   ├── fuel-corpora.json        # Pinned corpus commits + policyKey lookup column
│   │   └── oracle-policy/           # Per-corpus sanctioned-axiom/flag whitelists (ORCL-02 input)
│   ├── copy-json-assets.mjs         # Post-tsc build step: copies src/**/*.json into dist/
│   ├── mcp-local-client.mjs         # stdio MCP harness CLI (npm run mcp:local)
│   ├── emit-regression.mjs          # LOCK-01/02: capture + verdict -> regression matrix entry + fixtures
│   ├── refresh-official-protocol-references.mjs
│   ├── test-all-continuing.mjs, test-with-sentinel.mjs, test-release-full.mjs
├── test/                        # Vitest test suite
│   ├── unit/                    # Fast, no live Agda — mirrors src/ subtree, plus scripts/-testing dirs
│   │   ├── agda/                # incl. session-capture/ (mirrors src/agda/session-capture/)
│   │   ├── session/, protocol/, reporting/, fixtures/, helpers/
│   │   └── tools/                # ALSO where every scripts/*.mjs script is unit-tested (dogfood-*,
│   │                             #   oracle-*, queue-*, team-*) — never a subprocess "run the CLI" test
│   ├── integration/              # Live Agda / real MCP server required (RUN_AGDA_INTEGRATION=1)
│   │   ├── agda/                 # Direct AgdaSession integration tests
│   │   └── mcp/                  # Built-server MCP e2e, incl. dogfood-proxy-passthrough.test.ts
│   ├── property/                 # fast-check property-based tests — agda/, protocol/, reporting/, session/, tools/
│   ├── examples/                 # Extension-catalog / example-based tests
│   ├── fixtures/                 # Agda source fixtures + typed JSON-matrix SSOTs
│   │   ├── agda/                 # .agda fixture files, FixtureDeps/ (cross-module import fixtures)
│   │   ├── e2e/                  # mcp-tool-coverage.json/.ts — SSOT mapping tools to MCP e2e scenarios
│   │   ├── fix-queue.json + .ts       # THE tracked fix-queue SSOT + its zod schema/typed constant
│   │   ├── fuel-corpora.json + .ts    # Pinned dogfooding corpora + policyKey column
│   │   ├── task-manifest-schema.ts    # PROC-01 task-manifest zod schema
│   │   ├── capture-regression-matrix.ts, release-bug-matrix.ts
│   ├── helpers/                  # Shared test helpers (mcp-harness, isolated-agda-dir, repo-root, etc.)
├── schemas/                      # agda-mcp.schema.json — JSON Schema for .agda-mcp.json ($schema autocomplete)
├── docs/                         # extensions.md, assistant-workflows.md, FIX-QUEUE-DASHBOARD.md (generated
│                                 #   view, do not hand-edit), literate-agda-assessment.md, release-0.7.0-triage.md
├── examples/extensions/          # Example external extension modules (AGDA_MCP_EXTENSION_MODULES)
├── tooling/protocol/data/        # Cross-version Agda protocol reference metadata
├── .agents/skills/agda-dogfooding/   # TRACKED Skill: the PROC-01 dogfooding runbook (Codex-native discovery)
├── .agda-mcp/                    # GITIGNORED runtime data root (emit-only, out-of-repo)
│   ├── runs/<run-id>/            # dogfood-run.mjs: transcript.jsonl, run-report.json/.md, flaky-captures.jsonl
│   ├── captures/                 # agda_capture_session: staged CaptureArtifact JSON files
│   └── team/                     # v1.1: upload-queue.jsonl, storage/<person>/<date>/*.tar.gz, cron-runs/
├── ARCHITECTURE.md               # Root-level architecture doc (authoritative source for src/ layering)
├── AGENTS.md                     # Agent/contributor guidance — conventions, testing, TDD discipline
├── CONTRIBUTING.md, CHANGELOG.md, SECURITY.md, README.md
└── package.json                  # dist/index.js bin entry; "files" never lists scripts/ — Loop ② is unpublished
```

## Directory Purposes

**`src/agda/`:**
- Purpose: Owns the Agda subprocess (`agda --interaction-json`) and every operation that speaks the IOTCM protocol at the domain level (goals, expressions, backend/compile, scope, search), plus the recorder behind `agda_capture_session`.
- Contains: The `AgdaSession` class and its lifecycle/dispatch/load helper siblings, domain operation modules (`*-operations.ts`, `advanced-queries.ts`), the `agent-ux.ts` helper barrel, shared types, static JSON data (`data/`), and the `session-capture/` subdirectory.
- Key files: `src/agda/session.ts`, `src/agda/session-process-lifecycle.ts`, `src/agda/types.ts`, `src/agda/session-capture/artifact-types.ts`.

**`src/agda/session-capture/`:**
- Purpose: Everything `agda_capture_session` needs to stage a self-replaying, judgeable artifact — replay manifest, action-log ring buffer, dedup routing, triage, oracle substrate.
- Contains: A barrel (`session-capture.ts`) plus 7 focused sibling modules, none exceeding ~175 lines.
- Key files: `manifest-builder.ts` (`buildReplayManifest`), `recorded-transport.ts` (the capture ring buffer), `artifact-types.ts` (the full type contract).

**`src/session/`:**
- Purpose: Project-aware semantics layered on top of `src/agda/` — config merging, proof-edit application, goal-position resolution, MCP registration support for load/process tools, literate-Agda extraction.
- Contains: Project config loader, edit-applicator modules, goal-position/state helpers, load-tool registration wrappers, the IOTCM transport (+ its extracted `load-terminus-tracker.ts` sibling), literate-format subdirectory.
- Key files: `src/session/agda-transport.ts`, `src/session/project-config.ts`, `src/session/apply-proof-edit.ts`.

**`src/protocol/`:**
- Purpose: Pure, side-effect-free IOTCM wire-format construction and decoding.
- Contains: Command-string builders, per-response-`kind` decoders (`responses/`, including the shared rejection-detection scanner `proof-actions.ts`), flag/option validators, static protocol data (`data/`).
- Key files: `src/protocol/command-builder.ts` (SSOT — no other module hand-builds command strings), `src/protocol/responses/proof-actions.ts` (SSOT for the Error-DisplayInfo two-sided rejection guard).

**`src/tools/`:**
- Purpose: MCP adapter layer — every exposed tool (`agda_load`, `agda_case_split`, `agda_give`, `agda_capture_session`, etc.) is registered here as a thin Zod-validated wrapper around `session`/`agda` calls.
- Contains: Per-domain registration files, two second-tier composition barrels with their own sibling `register-*.ts` files (`reporting-tools.ts`, `agent-ux-tools.ts`), two split-by-read/write siblings (`goal-tools.ts` / `goal-write-tools.ts`), the tool-envelope/registration/error/gate infrastructure, the runtime manifest, `file/` sub-group.
- Key files: `src/tools/register-core-tools.ts` (top-level composition root), `src/tools/manifest.ts` (runtime SSOT for tool inventory), `src/tools/tool-envelope.ts`, `src/tools/tool-errors.ts` (write-rejection helpers).

**`src/reporting/`:**
- Purpose: Structured bug-bundle/fingerprint construction for issue reporting tools.
- Contains: `bug-report.ts` — also the repo's only prior-art `node:crypto` usage (`createHash`), later extended by `scripts/team/issue-key.mjs`'s `randomBytes`/`timingSafeEqual`.

**`scripts/dogfood/`:**
- Purpose: The dogfooding session lifecycle — launch, record, wrap up, upload.
- Contains: `dogfood-run.mjs` (the recording proxy) + `transcript-writer.mjs` (its recorder), `task-manifest.mjs` (the pre-flight gate), `dogfood-wrapup.mjs` + `flake-classify.mjs` (the judge), `upload-run.mjs` + `agent-log-selection.mjs` (TEAM-02's uploader), `install-dogfood-skill.mjs` (dev-machine setup helper).
- Key files: `dogfood-run.mjs`, `dogfood-wrapup.mjs`.

**`scripts/oracle/`:**
- Purpose: The automated Phase-2 "is this a real server defect" oracle triad — cold-replay differential, static soundness scan, advisory conformance.
- Contains: `run-oracle.mjs` (composer/CLI), one file per predicate, `cold-agda-session.mjs` (shared cold-process infrastructure both ORCL-01 and ORCL-03 consume), `verdict-schema.mjs` (the composed-verdict contract).
- Key files: `run-oracle.mjs`, `verdict-schema.mjs`.

**`scripts/queue/`:**
- Purpose: The Phase-4 fix queue — the single tracked SSOT every stage of Loop ② eventually writes into.
- Contains: `intake.mjs` (the only writer), `priority.mjs` (ordering), `dashboard.mjs` (a regenerated, never-hand-edited Markdown view), `mirror-github.mjs` (optional one-way visibility publisher), `seed-initial-cargo.mjs` (one-off historical seeding script).
- Key files: `intake.mjs`.

**`scripts/team/`:**
- Purpose: v1.1's team feedback channel — the network-facing half of Loop ②, entirely new in this milestone.
- Contains: `issue-key.mjs` (key registry + CLI), `ingest-server.mjs` (the `node:http` endpoint), `archive-extract.mjs` (sandboxed extraction, imported by the cron judge, no CLI of its own), `cron-ingest-wrapup.mjs` (the unattended judge + git write-back), `data/team-keys.json` (gitignored secret).
- Key files: `ingest-server.mjs`, `cron-ingest-wrapup.mjs`, `issue-key.mjs`.

**`scripts/data/`:**
- Purpose: Pinned, tracked reference data Loop ② scripts read (never a secret — contrast with `scripts/team/data/`).
- Contains: `fuel-corpora.json` (pinned dogfooding corpora, commit SHAs, `policyKey` column), `oracle-policy/*.json` (one sanctioned-axiom/flag whitelist per corpus, ORCL-02's input).

**`test/`:**
- Purpose: Vitest suite split by test type, mirroring `src/` subdirectory names within `unit/` and `property/` — and ALSO where every `scripts/*.mjs` script gets its own unit tests (there is no separate `test/scripts/` tree; they live under `test/unit/tools/` with a `dogfood-`/`oracle-`/`queue-`/`team-` filename prefix).
- Contains: `unit/` (fast, no live Agda/subprocess/network cost — scripts are tested via dependency-injected exported functions, never by spawning the real CLI), `integration/` (requires `RUN_AGDA_INTEGRATION=1`, real Agda subprocess or built-server MCP harness, including `dogfood-proxy-passthrough.test.ts`), `property/` (fast-check generative tests), `examples/`, `fixtures/` (Agda source fixtures + typed JSON-matrix SSOTs, including `fix-queue.ts`/`fuel-corpora.ts`/`task-manifest-schema.ts`), `helpers/` (shared harness code).
- Key files: `test/fixtures/agda/fixture-matrix.ts` (SSOT for the Agda fixture matrix), `test/fixtures/fix-queue.json` (the tracked fix-queue SSOT itself, not just its schema), `test/fixtures/e2e/mcp-tool-coverage.ts`, `test/helpers/mcp-harness.ts`.

**`scripts/` (build/maintenance, not Loop ²-specific):**
- Purpose: Node maintenance scripts invoked from `package.json` — build asset copying, protocol reference refresh, continuing test runners, local MCP debugging client.
- Contains: `copy-json-assets.mjs`, `mcp-local-client.mjs`, `test-all-continuing.mjs`, `test-with-sentinel.mjs`, `test-release-full.mjs`, `refresh-official-protocol-references.mjs`, `emit-regression.mjs` (Phase 3's capture-to-fixture regression lock emitter).

**`docs/`:**
- Purpose: Longer-form reference documentation not part of the enforced architecture doc.
- Contains: `extensions.md` (`AGDA_MCP_EXTENSION_MODULES` API), `assistant-workflows.md` (recommended agent usage patterns), `FIX-QUEUE-DASHBOARD.md` (generated by `scripts/queue/dashboard.mjs` — never hand-edit), `literate-agda-assessment.md`, `release-0.7.0-triage.md`.

**`schemas/`:**
- Purpose: JSON Schema shipped with the npm package for `.agda-mcp.json` editor autocomplete.
- Contains: `agda-mcp.schema.json`.
- Generated: No. Committed: Yes.

**`.agents/skills/agda-dogfooding/`:**
- Purpose: The canonical, TRACKED Codex/Claude-Code Skill packaging the dogfooding runbook (when/how to launch `dogfood-run.mjs`, when to call `agda_capture_session`, the pinned fuel corpora table). Confirmed NOT excluded by `.gitignore` (unlike `.claude/` and `.codex/`, which are both wholesale-excluded) — `scripts/dogfood/install-dogfood-skill.mjs` symlinks it into the gitignored `.claude/skills/` so Claude Code's own project-skill discovery finds the same tracked content.

**`tooling/protocol/data/`:**
- Purpose: Cross-version Agda protocol reference metadata used by `npm run protocol:refresh:official`.
- Contains: `official-reference-sources.json`, `official-cross-version-notes.json`, `official-response-families.json`.

## Key File Locations

**Entry Points:**
- `src/index.ts`: MCP server process entrypoint (`node dist/index.js`, bin name `agda-mcp-server`).
- `src/tools/register-core-tools.ts`: Tool-registration composition root called from `main()`.
- `scripts/dogfood/dogfood-run.mjs`: Dogfooding session entrypoint (spawns `dist/index.js` as a child).
- `scripts/team/ingest-server.mjs`: Team-channel HTTP ingest entrypoint (long-running, `node:http`).
- `scripts/team/cron-ingest-wrapup.mjs`: Unattended judge entrypoint (cron-invoked in v1.1, k8s CronJob in Phase 8).
- `scripts/team/issue-key.mjs`: Maintainer key-management CLI entrypoint.

**Configuration:**
- `schemas/agda-mcp.schema.json`: JSON Schema for `.agda-mcp.json` project config.
- `src/session/project-config.ts`: Loader/merger/cache for `.agda-mcp.json` + `AGDA_MCP_DEFAULT_FLAGS`.
- `scripts/data/fuel-corpora.json` / `test/fixtures/fuel-corpora.ts`: Pinned dogfooding corpora + policy keys.
- `tsconfig.json`, `tsconfig.test.json`, `package.json`: Build/toolchain configuration.

**Core Logic:**
- `src/agda/session.ts`: Stateful Agda process manager — treat transport/completion changes here as high-risk.
- `src/protocol/command-builder.ts`: Typed Agda command construction — prefer over hand-built command strings.
- `src/protocol/responses/proof-actions.ts`: The Error-DisplayInfo two-sided rejection-detection SSOT.
- `src/tools/manifest.ts`: Runtime SSOT for exposed tools, categories, and schema field names.
- `scripts/queue/intake.mjs`: The only writer of the tracked fix-queue SSOT.
- `scripts/oracle/run-oracle.mjs`: The oracle-triad composition entry point every judge call goes through.

**Testing:**
- `test/fixtures/agda/fixture-matrix.ts`: SSOT for the expanding Agda fixture matrix.
- `test/fixtures/fix-queue.json`: The tracked fix-queue SSOT (also used directly by tests as fixture data).
- `test/fixtures/e2e/mcp-tool-coverage.ts`: SSOT for which built-server MCP scenario covers each exposed core tool.
- `test/helpers/mcp-harness.ts`: Shared MCP stdio test harness — also the basis for `dogfood-run.mjs`'s own child-spawn parameters (`buildHarnessServerParameters`).

## Naming Conventions

**Files:**
- Kebab-case throughout, both `src/*.ts` and `scripts/*.mjs`: `session-command-dispatch.ts`, `apply-goal-edit.ts`, `cron-ingest-wrapup.mjs`, `archive-extract.mjs`.
- Barrel files carry the group's collective name and re-export from focused siblings (e.g. `src/agda/agent-ux.ts`, `src/session/apply-proof-edit.ts`, `src/tools/agent-ux-tools.ts`, `src/agda/session-capture/session-capture.ts`).
- `register*` prefix identifies MCP tool-registration entry functions (`register-agda-load.ts`, `register-core-tools.ts`, `register-capture-session.ts`, `register-tool-recommend.ts`).
- `*.test.ts` suffix for all Vitest test files, colocated under `test/{unit,integration,property,examples}/<mirrored-subtree>/`; a script's own test file is named `<script-domain>-<concern>.test.ts` under `test/unit/tools/` (e.g. `team-cron-ingest-wrapup.test.ts`, `dogfood-upload-run.test.ts`, `oracle-run-oracle.test.ts`, `queue-intake.test.ts`) rather than mirroring `scripts/`'s own directory layout.
- Static data tables use `*.json` and live under a sibling `data/` directory (`src/agda/data/`, `src/protocol/data/`, `src/tools/agent-ux/data/`, `scripts/data/`, `scripts/team/data/`).
- Every `scripts/*.mjs` file that imports a `src/*.ts` sibling does so via a `.js`-suffixed specifier (`../../src/repo-root.js`) — this is required for `tsx`'s resolver, not a typo.

**Directories:**
- Top-level `src/` subdirectories are named after architectural layers (`agda/`, `session/`, `protocol/`, `tools/`, `reporting/`), not features.
- Top-level `scripts/` subdirectories are named after Loop ② pipeline stages (`dogfood/`, `oracle/`, `queue/`, `team/`), each independently importable and independently unit-testable.
- `test/` mirrors `src/` layer names one level down inside `unit/` and `property/` (e.g. `test/unit/session/`, `test/property/protocol/`); it does NOT mirror `scripts/`'s directory names — all script tests live flat under `test/unit/tools/`.
- Grouped tool sub-features get their own directory under `src/tools/` (`file/`, `agent-ux/`) once a group exceeds a few files; a two-file split (read/write) stays as flat siblings instead (`goal-tools.ts` / `goal-write-tools.ts`) rather than a new subdirectory.

## Where to Add New Code

**New MCP tool (exposed to clients):**
- Registration: Add to the relevant existing `src/tools/*.ts` file if it fits a current group (session, goal, expression, query, file, scope, display, backend, analysis, reporting, cache, impact, agent-ux); only create a new top-level file for a genuinely new tool family, and wire it into `src/tools/register-core-tools.ts` (or the relevant second-tier barrel, e.g. `reporting-tools.ts`, if the new tool belongs to an existing composed group).
- Manifest entry: `registerManifestEntry` call inside the tool-registration wrapper (see `src/tools/manifest.ts` and `src/tools/tool-registration.ts`) — required so `agda_tools_catalog` / tool-recommendation stay accurate.
- Tests: Unit test under `test/unit/tools/`; if the tool touches live Agda, add integration coverage under `test/integration/mcp/` and register it in `test/fixtures/e2e/mcp-tool-coverage.ts`.

**New write-capable proof action (case-split/give/refine-shaped):**
- Implementation: Add the domain function to `src/agda/goal-operations.ts` (or `advanced-queries.ts` for a whole-file/no-single-goal action), following the two-sided rejection-detection guard (`detectDisplayInfoError()` + a success-marker predicate from `src/protocol/responses/proof-actions.ts`) — never decode a "success" shape before checking for rejection.
- Tool registration: `src/tools/goal-write-tools.ts`, calling `throwIfWriteRejected()` (or the dedicated `giveRejectedError()` for `agda_give`-shaped tools) before touching any "success" field.
- Tests: `test/unit/agda/goal-operations-*.test.ts` for the domain function, `test/unit/tools/goal-tools-write-rejected.test.ts`-style coverage for the tool-layer rejection path.

**New Agda domain operation (new IOTCM command, read-only):**
- Implementation: Add to the matching `src/agda/*-operations.ts` file (goal, expression, advanced-queries, display, backend) using `src/protocol/command-builder.ts` for command assembly — never hand-build the IOTCM string.
- Response decoding: Add a decoder under `src/protocol/responses/` keyed on the Agda response `kind`.
- Types: Extend `src/agda/types.ts` with the new result shape.
- Tests: `test/unit/agda/`, plus a new fixture in `test/fixtures/agda/fixture-matrix.ts` if the behavior depends on real Agda semantics; add live coverage under `test/integration/agda/`.

**New project-config option or load-side behavior:**
- Implementation: `src/session/project-config.ts` (schema/merge logic) + `schemas/agda-mcp.schema.json` (update the JSON Schema in lockstep).
- Tests: `test/unit/session/`, `test/property/session/` for merge-invariant coverage.

**New Loop ② / team-channel script or oracle predicate:**
- Implementation: Add to the matching `scripts/{dogfood,oracle,queue,team}/` subdirectory — never inside `src/`. Reuse existing pipeline functions via direct ESM import (never `spawn`/`execFileSync`-reinvoke a sibling script's own CLI). Every real subprocess/network/filesystem-writing function should accept an `options.deps.<fnName>` override so tests never pay real Agda/tar/git/network cost.
- If it touches an untrusted archive/upload: apply the layered-defense pattern in `scripts/team/archive-extract.mjs` (pre-list rejection + bounded/polled extraction + post-extraction realpath containment) rather than trusting a single guard.
- If it resolves an ORCL-02 policy key: reuse `resolveWrapupPolicyKey()`/`resolveCronPolicyKey()`'s explicit-first, loud-on-failure resolution — never derive from a corpus's `.agda-lib` `name:` field (the W2 anti-pattern).
- Tests: `test/unit/tools/<domain>-<concern>.test.ts`, using `mkdtempSync`-per-test + `afterEach` cleanup and the `// @ts-expect-error script module lacks types` comment immediately above every `scripts/*.mjs` import.

**Utilities / shared helpers:**
- Cross-layer envelope/registration helpers: `src/tools/tool-helpers.ts`, `src/tools/tool-envelope.ts`.
- Shared test helpers: `test/helpers/`.
- Static reference data: new `*.json` under the relevant `src/<area>/data/` directory (loaded via `src/json-data.ts`'s `loadJsonData()`) or `scripts/data/` (loaded via a typed `test/fixtures/*.ts` constant, resolved through `tsx`'s `.js`->`.ts` specifier mapping — NOT interchangeable with `loadJsonData()` for the same file).

**Module-size constraint when adding code:**
- Every file under `src/` must stay ≤ 500 lines. If a change would push an existing file over the limit, extract a sibling module using the established pattern: free functions that accept the owning object (e.g. `AgdaSession`) as their first argument and mutate its module-internal fields, following `session-process-lifecycle.ts` / `session-load-impl.ts` / `session-command-dispatch.ts`, or a read/write split like `goal-tools.ts` / `goal-write-tools.ts`, as the reference shape. `scripts/*.mjs` files have no such ceiling — several intentionally exceed 500 lines.

## Special Directories

**`.agda-mcp/` (repo root, and also created inside any corpus a dogfooding run targets):**
- Purpose: The single gitignored root for every piece of Loop ② runtime state — `runs/<run-id>/` (dogfood-run.mjs artifacts), `captures/` (`agda_capture_session` staged artifacts), `team/` (upload retry queue, local ingest storage, cron-run summaries).
- Generated: Yes, entirely at runtime.
- Committed: No (`.gitignore`: `.agda-mcp/`).

**`scripts/team/data/team-keys.json`:**
- Purpose: The hash-only Bearer-key registry (never plaintext keys).
- Generated: Yes, by `scripts/team/issue-key.mjs issue <person>`.
- Committed: No — specifically gitignored by name (`.gitignore`: `scripts/team/data/team-keys.json`), distinct from the rest of `scripts/data/`, which IS tracked.

**`test/fixtures/`:**
- Purpose: Real `.agda` source fixtures plus typed JSON matrices describing expected coverage, AND the live, tracked fix-queue SSOT (`fix-queue.json`) itself.
- Generated: No (fix-queue.json is machine-appended by `scripts/queue/intake.mjs`/the cron judge, but hand-editable and always committed).
- Committed: Yes.

**`.local-reference/agda-protocol/` (produced by `npm run protocol:refresh:official`, not present by default):**
- Purpose: Gitignored local cache of official Agda documentation pages used as the protocol-parity SSOT during protocol work.
- Generated: Yes (via `scripts/refresh-official-protocol-references.mjs`).
- Committed: No.

**`dist/` (build output, not present in source tree until built):**
- Purpose: Compiled JS + copied JSON assets (via `scripts/copy-json-assets.mjs`) that `package.json#main`/`#bin` point to — also the exact artifact `scripts/dogfood/dogfood-run.mjs` spawns as its own child.
- Generated: Yes (`npm run build` = `tsc -p tsconfig.json && node scripts/copy-json-assets.mjs`).
- Committed: No.

**`examples/extensions/`:**
- Purpose: Example external MCP extension modules demonstrating the `AGDA_MCP_EXTENSION_MODULES` register-function contract described in `docs/extensions.md`.
- Generated: No.
- Committed: Yes.

**`.agents/skills/agda-dogfooding/`:**
- Purpose: The tracked source of truth for the dogfooding Skill; `.claude/skills/agda-dogfooding` is a gitignored symlink to it, not a second copy.
- Generated: No (the symlink is generated by `install-dogfood-skill.mjs`; the Skill content itself is hand-authored).
- Committed: Yes (the `.agents/` copy only).

---

*Structure analysis: 2026-07-04*
