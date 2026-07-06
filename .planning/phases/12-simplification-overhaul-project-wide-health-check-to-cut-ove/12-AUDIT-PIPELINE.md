# Phase 12 Plan 01: Pipeline Audit Report

**Audit date:** 2026-07-06
**Scope:** `scripts/{dogfood,oracle,queue,team}/*.mjs` (25 files, confirmed count). Read-only audit — this plan creates exactly this one new artifact and modifies nothing under `scripts/`, `src/`, `docs/`, or `test/`.
**Feeds:** Plan 12-06's consolidated `12-HEALTH-REPORT.md` — its Task 1 transcribes this doc's Cut-List Candidates rows verbatim into a "Pipeline (scripts/)" section (this plan's own `key_links`).
**Methodology:** Every known-debt item below was re-verified by re-reading the exact current file/line range the original finding cites, per `12-RESEARCH.md`'s Pattern 1 ("re-verify, don't recite") — not by re-citing `CONCERNS.md`'s 2026-07-04 prose.

## Severity Scale

No repo-wide severity convention exists (`12-PATTERNS.md` "No Analog Found" — `fix-queue.json` uses `status`/`triageClass`, not a severity tier; `CONCERNS.md` uses an ad hoc `Priority: High/Medium/Low` field only in one section). Defined once here, reused verbatim by Plan 12-06's consolidation:

- **critical** — actively produces an incorrect result, a security exposure, or violates C-01/C-02/C-04 if left unaddressed; would block the phase gate.
- **high** — a confirmed, reproducible defect or duplication that has already caused (not merely risked) a real incident, or sits on a deploy-relevant path where a mishandled cut would break production.
- **medium** — a genuine, evidenced redundancy or gap with a clear, low-risk fix; no active harm yet, but the risk the finding warns about has already started to materialize (observed drift) or would materialize on the very next unrelated edit.
- **low** — surface-level cleanup (an orphaned one-off script, a stale doc line) whose removal has zero functional impact and saves only incidental future attention.

## Known Pipeline Debt Re-Verification

Five findings re-verified against current `HEAD` this session (2026-07-06): the `assertSafeRunId` duplication, the three named oracle-tooling defects, and the two open fix-queue fingerprints combined into one status-recheck row. None was found resolved; two were found to have a materially different current shape than their original description (`severity-changed`).

### 1. `assertSafeRunId` duplicated across both dogfood CLIs

- **Original source:** `CONCERNS.md` lines 25-29.
- **Re-verification method:** read `scripts/dogfood/dogfood-run.mjs:101-116` and `scripts/dogfood/dogfood-wrapup.mjs:425-440` directly against current HEAD — the exact file/line range, not the prose description.
- **Current evidence — `dogfood-run.mjs:110-116`:**
  ```javascript
  function assertSafeRunId(runId) {
    if (runId.startsWith("--") || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
      throw new Error(
        `invalid --run-id value "${runId}": must not start with "--" or contain a path separator`,
      );
    }
  }
  ```
- **Current evidence — `dogfood-wrapup.mjs:434-440`:**
  ```javascript
  function assertSafeRunId(runId) {
    if (runId.startsWith("--") || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
      throw new Error(
        `invalid run-id "${runId}": must not start with "--" or contain a path separator`,
      );
    }
  }
  ```
- **Diff:** the condition body is byte-identical between both copies (same four checks, same operator precedence). The error-message text is **not**: `dogfood-run.mjs` throws `invalid --run-id value "X": ...`; `dogfood-wrapup.mjs` throws `invalid run-id "X": ...`.
- **Status:** `severity-changed` (re-verified 2026-07-06). `CONCERNS.md` line 28 stated "both copies verified byte-identical" — that claim is false as of current HEAD (independently reconfirmed here by direct re-read; matches `12-PATTERNS.md` Pattern 3's own prior finding). Validation *logic* remains identical and correct in both copies; the *message text* has already drifted — the exact divergence `CONCERNS.md`'s own "Impact" field called a "latent source of divergence" is no longer hypothetical, it has happened.

### 2. Oracle tooling: `.agda-lib` never re-materialized for multi-include-root corpora

- **Original source:** `CONCERNS.md` lines 33-37; fix-queue fingerprint `2eb1768df88bfb07`.
- **Re-verification method:** read `scripts/oracle/orcl-01-differential.mjs`'s `materializeCaptureEnvironment()` (current lines 87-133) end to end, plus its new doc-comment (lines 61-75).
- **Current evidence:** the function writes every `artifact.manifest.inlinedFirstPartySources` entry into a fresh temp dir (lines 92-111) and replays `artifact.manifest.agdaDirContents` — the *global* `AGDA_DIR` `libraries`/`defaults` registration files, not the project-local file — into a second temp dir (lines 113-123). At no point does it write a project-local `.agda-lib` file into the materialized source root. `test/unit/tools/oracle-orcl-01.test.ts:198-210` (`"inlineFirstPartySources never includes .agda-lib; neither does the materialized replay dir"`) explicitly asserts this absence as current, intended behavior. A doc-comment now sits above the function (lines 61-75) rationalizing a **narrower, different** point — that the cold run falls back to Agda's legacy per-file `.agdai` cache placement instead of the versioned `_build/<agda-version>/` layout, which the comment calls "an accepted fidelity nuance, not a soundness gap" for the *cache-layout* question specifically. That reasoning does not address, and does not resolve, the multi-include-root `include:` path resolution gap fingerprint `2eb1768df88bfb07` actually describes.
- **Status:** `confirmed-still-present` (re-verified 2026-07-06). The specific defect (a cold replay of a project with `include: src, agda-unimath/src` has no project file telling Agda about the second include root, producing a spurious `FileNotFound` cold-side classification) is unchanged.

### 3. Oracle tooling: cold-replay hole-scan is unconditional, unlike the live server's gated scan

- **Original source:** `CONCERNS.md` lines 39-43; fix-queue fingerprint `1220f2840142aab8`.
- **Re-verification method:** compare `scripts/oracle/orcl-01-differential.mjs`'s current `runColdLoadAndDiff()` (line 483) against `src/agda/session-load-impl.ts`'s current gates (lines 127-129 and 224-226 — both call sites in the live server, confirmed by direct read of both).
- **Current evidence:** `orcl-01-differential.mjs:483` still reads `const sourceHoleCount = countExplicitSourceHoles(materializedPath);` — unconditional, no gate. `session-load-impl.ts:127-129` reads `const needsExplicitHoleScan = parsed.success && goals.length === 0 && parsed.invisibleGoalCount === 0; const sourceHoleCount = needsExplicitHoleScan ? countExplicitSourceHoles(absPath) : 0;`, and the second call site at `:224-226` is the same shape (`parsed.goalCount === 0` instead of `goals.length === 0` — same semantics, different local variable name). Both live-server call sites remain gated; the oracle's cold-replay call remains unconditional.
- **Status:** `confirmed-still-present` (re-verified 2026-07-06). The two code paths remain divergent exactly as described; a failed load with an unrelated syntactically-valid hole elsewhere in the file still produces a cold/warm `hasHoles` mismatch.

### 4. Oracle tooling: postulate-block parser mis-splits multi-line type signatures

- **Original source:** `CONCERNS.md` lines 45-49; part of fix-queue fingerprint `2eb1768df88bfb07`.
- **Re-verification method:** traced the actual parser CONCERNS.md attributes to `orcl-02-soundness-scan.mjs` itself — found it no longer defines the detector locally. It now imports `extractPostulateSites` from `../../src/agda/source-parsers.js` (line 28), called at line 233. Read that function's current implementation (`src/agda/source-parsers.ts:129-171`) against the `is-trunc-type-trunc :\n    {l : Level} ...`-shaped example CONCERNS.md cites.
- **Current evidence:** the block-form branch (`source-parsers.ts:148-167`) walks every line more deeply indented than the `postulate` keyword and, for **each** such line, splits on `:` and tokenizes the left-hand side as a fresh declaration-name list — there is no logic distinguishing "a new name at this block's own declaration indent" from "a continuation of the previous line's still-open type signature." Tracing the cited example: line 1 (`is-trunc-type-trunc :`) yields declaration `is-trunc-type-trunc` (correct); line 2 (`    {l : Level} ...`) is *also* indented deeper than `postulate`, so the identical branch fires again, splits on the first `:`, and yields a second bogus "declaration" `{l` — reproducing exactly the garbled non-identifier fragments (`"{l"`, `"(trunc"`, `"k"`, `"A)"`) CONCERNS.md and fix-queue `2eb1768df88bfb07` describe.
- **Severity-relevant new fact:** `extractPostulateSites` is no longer scripts/oracle-only. It is a shared `src/agda/` helper with two additional call sites in `src/tools/agent-ux/project-tools.ts` (lines 117 and 231), which back the live, registered MCP tool `agda_postulate_closure`. The identical mis-parse therefore also affects a real, client-facing tool's postulate-closure listing on any multi-line postulate signature — not merely this audit's internal oracle-fidelity tooling.
- **Status:** `severity-changed` (re-verified 2026-07-06). The parsing defect itself is unchanged, but its blast radius has grown since `CONCERNS.md` was written: this is now a shared `src/agda/source-parsers.ts` bug consumed by both `scripts/oracle/` (fidelity-only impact) and a live `src/tools/` MCP tool (client-facing correctness impact). A future fix belongs to `src/agda/source-parsers.ts` — out of this plan's pipeline-only scope to fix, and out of scope for this audit's cut list (it is a bug, not redundant/duplicate code — see Cut-List Candidates' Reasoned Exclusions), but the classification must not understate it as scripts/-only.

### 5. Fix-queue fingerprints `2eb1768df88bfb07` / `1220f2840142aab8` — queue-status re-check

- **Original source:** `test/fixtures/fix-queue.json`.
- **Re-verification method:** read both entries' current `status`/`closedAt`/`needsReverify`/`recurrence` fields in full, not just the notes prose. Also read the read_first-flagged fingerprint `fb57abbe7df6dfe8`'s own notes for cross-reference.
- **Current evidence:** `2eb1768df88bfb07` — `status: "triaged"`, `closedAt: null`, `needsReverify: false`, `recurrence: 2`. `1220f2840142aab8` — `status: "triaged"`, `closedAt: null`, `recurrence: 1`, `relatedFingerprint: ["ad2b6d31f58f1759"]` (RT6). Neither has been silently resolved, closed, or reclassified since filing. Cross-reference per the read_first pointer: `fb57abbe7df6dfe8`'s own notes document a **structurally similar but factually unrelated** correction pattern (its initial filing named 6 Linux-CI-failing test files; a 2026-07-04 follow-up correction narrowed this to the real 5, and a second correction fixed a log-sampling misread about `oracle-orcl-01`/`03`) — this is prior art for the same "an auto-derived/initial claim gets corrected via a follow-up note, never silently" discipline the queue already applies to `2eb1768df88bfb07` itself, but it is a separate, pre-existing Linux-platform-delta item, not a third oracle-tooling defect. No action required from this pipeline audit beyond noting it.
- **Status:** `confirmed-still-present` (re-verified 2026-07-06). Both fingerprints remain open and visible in the queue; this report does not mark either resolved.

### Calibration-note correction (`12-PATTERNS.md`)

`12-PATTERNS.md`'s calibration note claims: *"Spot-checking all 8 files in `scripts/dogfood/` found `install-dogfood-skill.mjs` has no corresponding test file under `test/`."* Re-checked this session via `find test -iname "*install-dogfood-skill*"` and `test -f test/unit/tools/dogfood-install-skill.test.ts`: **that claim is incorrect as of current HEAD.** `test/unit/tools/dogfood-install-skill.test.ts` exists and is confirmed present. All 8 `scripts/dogfood/*.mjs` files have dedicated test coverage (see inventory table below) — `12-CONTEXT.md`'s Established Patterns claim ("every `scripts/*.mjs` is unit-tested under `test/unit/tools/`") holds without exception for `scripts/dogfood/`, contrary to `12-PATTERNS.md`'s calibration note. (The note's *other* claim — the `assertSafeRunId` message-text drift — is independently reconfirmed above in Finding 1, and remains correct.)

## Pipeline Script Inventory (25/25)

Cross-referenced by direct `find test/unit/tools -iname "*<name>*"` per file — not assumed from the `<prefix>-<basename>` naming convention. **Loop②-stage:** `oracle` = judge, `queue` = file, `team` = ingest/lock (per `12-RESEARCH.md`'s Deployment & Runtime Surface table); `dogfood` = capture-adjacent tooling, not itself a required Loop② stage (C-02). **Deploy-relevant** follows `12-RESEARCH.md`'s Deployment & Runtime Surface table verbatim (`oracle/**`, `queue/intake.mjs`, `team/**` = yes; everything else = no) — this audit does not run `npx knip` (see Methodology Note below).

| Script Path | Has Dedicated Test | Deploy-Relevant | Loop②-Stage |
|---|---|---|---|
| scripts/dogfood/agent-log-selection.mjs | yes — `dogfood-agent-log-selection.test.ts` | no | dogfood (not a required stage) |
| scripts/dogfood/dogfood-run.mjs | yes — `dogfood-run-report-checkpoint.test.ts`, `dogfood-run-spawn-options.test.ts` | no | dogfood (not a required stage) |
| scripts/dogfood/dogfood-wrapup.mjs | yes — `dogfood-wrapup-argv-parsing.test.ts`, `dogfood-wrapup-corrupt-capture-entry.test.ts`, `dogfood-wrapup-filing.test.ts`, `dogfood-wrapup-nonfinalized-report.test.ts`, `dogfood-wrapup-upload-chain.test.ts` | no | dogfood (not a required stage) |
| scripts/dogfood/flake-classify.mjs | yes — `dogfood-flake-classify.test.ts` | no | dogfood (not a required stage) |
| scripts/dogfood/install-dogfood-skill.mjs | yes — `dogfood-install-skill.test.ts` (corrects `12-PATTERNS.md`'s calibration note — see above) | no | dogfood (not a required stage) |
| scripts/dogfood/task-manifest.mjs | yes — `dogfood-task-manifest.test.ts` | no | dogfood (not a required stage) |
| scripts/dogfood/transcript-writer.mjs | yes — `dogfood-transcript-writer.test.ts` | no | dogfood (not a required stage) |
| scripts/dogfood/upload-run.mjs | yes — `dogfood-upload-run.test.ts` | no | dogfood (not a required stage) |
| scripts/oracle/cold-agda-session.mjs | yes — `oracle-cold-agda-session.test.ts` | yes | judge |
| scripts/oracle/orcl-01-differential.mjs | yes — `oracle-orcl-01.test.ts` | yes | judge |
| scripts/oracle/orcl-02-soundness-scan.mjs | yes — `oracle-orcl-02.test.ts` | yes | judge |
| scripts/oracle/orcl-03-conformance.mjs | yes — `oracle-orcl-03.test.ts` | yes | judge |
| scripts/oracle/run-oracle.mjs | yes — `oracle-run-oracle.test.ts` | yes | judge |
| scripts/oracle/verdict-schema.mjs | yes — `oracle-verdict-schema.test.ts` | yes | judge |
| scripts/queue/dashboard.mjs | yes — `queue-dashboard.test.ts` | no | file |
| scripts/queue/intake.mjs | yes — `queue-intake.test.ts` | yes | file |
| scripts/queue/mirror-github.mjs | yes — `queue-mirror-github.test.ts` | no | file |
| scripts/queue/priority.mjs | yes — `queue-priority.test.ts` | no | file |
| scripts/queue/seed-initial-cargo.mjs | **NO dedicated test file** (confirmed via `find test -iname "*seed-initial-cargo*"` — zero results) | no | file (one-off historical seed; does not touch `intake.mjs`'s own writer mechanism) |
| scripts/team/archive-extract.mjs | yes — `team-archive-extract.test.ts` | yes | ingest/lock |
| scripts/team/clone-fuel-corpora.mjs | yes — `team-clone-fuel-corpora.test.ts` | yes | ingest/lock |
| scripts/team/cron-ingest-wrapup.mjs | yes — `team-cron-ingest-wrapup.test.ts` | yes | ingest/lock |
| scripts/team/ingest-server.mjs | yes — `team-ingest-server.test.ts` | yes | ingest/lock |
| scripts/team/install-pinned-env.mjs | yes — `team-install-pinned-env.test.ts` | yes (see footnote) | ingest/lock |
| scripts/team/issue-key.mjs | yes — `team-issue-key.test.ts` | yes | ingest/lock |

**Totals:** 25/25 scripts classified. 24/25 have dedicated test coverage; only `scripts/queue/seed-initial-cargo.mjs` has none (see Cut-List Candidates). 0/25 are wired as a `package.json` `scripts` entry — confirmed via `grep -n "dogfood/\|oracle/\|queue/\|team/" package.json`: no matches; only top-level utilities (`scripts/test-all-continuing.mjs`, `scripts/test-with-sentinel.mjs`, `scripts/mcp-local-client.mjs`, `scripts/copy-json-assets.mjs`, `scripts/refresh-official-protocol-references.mjs`, `scripts/test-release-full.mjs`) are wired there, none of which are among these 25.

**Footnote on `scripts/team/install-pinned-env.mjs`'s Deploy-Relevant column:** classified `yes` here to match `12-RESEARCH.md`'s table (which buckets all of `scripts/team/*` together, and which Plan 12-08 already reads as its own execution filter). For precision: this specific file is invoked by teammates on their own machines via the `scripts/team/install-pinned-env.sh` wrapper (`docs/TEAM-ONBOARDING.md` lines 10, 53, 58) — it is not itself a k8s workload entrypoint or a Docker build step (unlike `clone-fuel-corpora.mjs`, confirmed baked into the image build at `Dockerfile:116`, and `ingest-server.mjs`/`cron-ingest-wrapup.mjs`, confirmed as the two k8s workload commands). A cut here would need a watched redeploy only if it also happens to break the shared `team/` test suite gating the image build's own CI checks — this nuance does not change the column value, only its interpretation.

## Cut-List Candidates

### Candidate A: Extract `assertSafeRunId` to a shared module

- **Issue:** Identical run-id validation *logic* is duplicated verbatim in two CLI scripts (`scripts/dogfood/dogfood-run.mjs` and `scripts/dogfood/dogfood-wrapup.mjs`); the copies have already begun to drift (error-message text differs — confirmed above in Finding 1), meaning a future validation-rule change (e.g. a length cap, rejecting NUL bytes) applied to only one copy would silently leave the other CLI under-validated.
  - **Files:** `scripts/dogfood/dogfood-run.mjs:101-116`, `scripts/dogfood/dogfood-wrapup.mjs:425-440` (both reduced to an import); new `scripts/dogfood/run-id.mjs` (created); new `test/unit/tools/dogfood-run-id.test.ts`; `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts:23,27` (existing regex assertions must be updated in the same commit — see Impact).
  - **Impact:** Low blast radius, but not zero — flagging a real gap `12-PATTERNS.md`'s own Pattern 3 write-up does not mention. Both CLIs' argv-parsing *behavior* is unchanged (the guard body is call-convention-agnostic, confirmed in Pattern 3). Adopting the more-informative `--run-id`-flag-shaped message (Pattern 3's own recommendation) for the shared module changes `dogfood-wrapup.mjs`'s user-visible error text from `invalid run-id "X": ...` to `invalid --run-id value "X": ...` — an admitted behavior change, not a pure refactor. This concretely **breaks** `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts:23` (`expect(...).toThrow(/invalid run-id/)`) and `:27` (same regex) unless those two assertions are updated in the same commit — confirmed via direct read of both the test file and the message text; the substring `"invalid run-id"` does not appear inside `"invalid --run-id value \"X\""`. `dogfood-run.mjs`'s own tests (`dogfood-run-spawn-options.test.ts:179,183`, asserting `/invalid --run-id/`) are unaffected since they already match the adopted message shape.
  - **Fix approach:** Extract to `scripts/dogfood/run-id.mjs` exporting `assertSafeRunId`, following `12-PATTERNS.md` Pattern 3 (module content, MIT-header/why-comment convention, same-directory sibling-import placement — no `scripts/lib/`/`scripts/shared/` convention exists in this repo) and Pattern 4 (the exact call-site swap in both CLIs) verbatim. Keep the `--run-id`-flag-shaped message text per Pattern 3's own recommendation. Add `test/unit/tools/dogfood-run-id.test.ts` per Pattern 3's `dogfood-<basename>.test.ts` naming convention. Update the two regex assertions in `dogfood-wrapup-argv-parsing.test.ts` (lines 23, 27) to match the new message text in the **same** commit — this is the one addition beyond Pattern 3/4's own text.
  - **Severity:** medium (duplication is real and has already measurably drifted — no longer a purely hypothetical risk — but current functional correctness is unaffected in both copies today).
  - **Deploy-relevant:** no (`scripts/dogfood/*` per `12-RESEARCH.md`'s Deployment & Runtime Surface table — dev-machine-only recording proxy, never invoked by a k8s workload).
  - **Loop②-stage risk:** none — dogfood tooling is capture-adjacent, not itself a required Loop② stage (C-02); this candidate does not touch `oracle/`, `queue/intake.mjs`, or `team/`.

### Candidate B: Delete `scripts/queue/seed-initial-cargo.mjs`

- **Issue:** `scripts/queue/seed-initial-cargo.mjs` is a one-off historical seeding script (its own header: "must NOT be run for real a second time against the committed test/fixtures/fix-queue.json") that already completed its entire job — every one of its 13 seeded fingerprints (confirmed via `grep -n "fingerprint:"`) already exists durably in `test/fixtures/fix-queue.json`, the actual queue SSOT — and it is the only one of the 25 pipeline scripts with zero dedicated test coverage.
  - **Files:** `scripts/queue/seed-initial-cargo.mjs` (355 lines, sole file to remove); `.planning/codebase/STRUCTURE.md:123,217` (one-line mentions to update in the same commit).
  - **Impact:** None functionally, in either direction. Confirmed zero importers besides its own file (`grep -rln "seed-initial-cargo"` across `.mjs`/`.ts`/`.md`, excluding `.planning/`, returns only itself); not wired in `package.json` (confirmed above); not deploy-relevant (grouped with `dashboard`/`mirror-github`/`priority` in `12-RESEARCH.md`'s table as dev-machine-only). Its only runtime dependency, `scripts/queue/intake.mjs`'s `upsertQueueEntry`, is untouched by this cut — the "file" stage's real writer keeps working identically. The 13 fingerprints it transcribes remain permanently recorded in `test/fixtures/fix-queue.json` regardless of whether this script exists; the seeding rationale (why each field was set as it was) is preserved in git history at the commit that introduced it — this script's own Entry-1 comment cites exactly this convention verbatim ("D-02: git history remains the authoritative audit trail").
  - **Fix approach:** Delete outright per `12-PATTERNS.md` Shared Pattern A's script-deletion checklist: `git rm scripts/queue/seed-initial-cargo.mjs`; no other `scripts/**/*.mjs` file imports it (confirmed via grep above, nothing to fix); no test file exists to remove (this row's own finding); no `package.json` entry to remove (confirmed above). Update `.planning/codebase/STRUCTURE.md`'s two one-line mentions (line 123's directory-tree comment, line 217's prose description) in the same commit — Shared Pattern A's checklist doesn't itself call out `.planning/codebase/` prose, but leaving a structural map describing a deleted file would be exactly the kind of stale-doc residue D-01 targets.
  - **Severity:** low (pure cleanup; zero functional or deploy risk either way).
  - **Deploy-relevant:** no.
  - **Loop②-stage risk:** none — this script only ever ran once, historically, through `queue/intake.mjs`'s own public `upsertQueueEntry` API; deleting it does not touch `intake.mjs` itself (the actual "file" stage mechanism), so the stage's writer is fully preserved (C-02).

### Reasoned Exclusions (considered, not listed as cut-list candidates)

- **The three oracle-tooling defects (Findings 2-4 above) are not cut-list candidates.** They are correctness bugs in fidelity-critical tooling, not redundant/duplicated/orphaned implementation detail — the Cut-List's own row shape ("what is redundant/duplicated/orphaned") does not fit a bug fix. All three remain properly tracked in `test/fixtures/fix-queue.json` (`triaged`, re-verified still-open above) for a future oracle-triad hardening wave, exactly as D-04 does for RT6/RT7 elsewhere in this phase. Simplifying `scripts/oracle/` must not silently absorb or mask any of the three (per `12-CONTEXT.md`'s own audit-seed note).
- **`npx knip` was not run for this inventory.** `12-RESEARCH.md`'s own Environment Availability table and Package Legitimacy Audit confirm the manual/`find`-based inventory methodology used above is sufficient at this repo's size (25 files); `knip`'s package identity is tagged `[ASSUMED]` (WebSearch-discovered, not Context7-verified), and running it would require a `checkpoint:human-verify` gate this autonomous plan does not carry (per this plan's own `<threat_model>` T-12-SC). Treated as an explicit, justified exclusion, not an oversight.
- **`scripts/team/clone-fuel-corpora.mjs` and `scripts/team/install-pinned-env.mjs` are not flagged as redundant** despite the coarse "all of `team/` is deploy-relevant" bucketing above — both have real, distinct consumers (the Docker image build; teammate onboarding respectively, see inventory footnote) and dedicated test coverage. No evidence of redundancy was found for any `scripts/team/*` or `scripts/oracle/*` file during this audit.

## Sources

- `.planning/codebase/CONCERNS.md` lines 25-49 (original findings, re-verified above).
- `test/fixtures/fix-queue.json` fingerprints `2eb1768df88bfb07`, `1220f2840142aab8`, `fb57abbe7df6dfe8` (read in full).
- `scripts/dogfood/dogfood-run.mjs:101-116`, `scripts/dogfood/dogfood-wrapup.mjs:425-440`, `scripts/oracle/orcl-01-differential.mjs:59-133,460-497`, `scripts/oracle/orcl-02-soundness-scan.mjs:190-267`, `src/agda/source-parsers.ts:113-171`, `src/agda/session-load-impl.ts:120-132,218-230`, `src/tools/agent-ux/project-tools.ts:95-140` (direct source re-reads).
- `test/unit/tools/oracle-orcl-01.test.ts:198-210`, `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts:1-42`, `test/unit/tools/dogfood-run-spawn-options.test.ts:179-183` (test-suite cross-checks).
- `12-RESEARCH.md` Deployment & Runtime Surface table, Environment Availability table, Package Legitimacy Audit.
- `12-PATTERNS.md` Pattern 1-4, Shared Pattern A, calibration note.
- `Dockerfile:96,102,116`, `docs/TEAM-ONBOARDING.md:10,53,58`, `.github/workflows/deploy-ingest.yml:86-127` (deploy-surface cross-checks).
- `package.json` `scripts` block, `.planning/codebase/STRUCTURE.md:123,217` (wiring/doc cross-checks).
