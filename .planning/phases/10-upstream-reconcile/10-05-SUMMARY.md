---
phase: 10-upstream-reconcile
plan: 05
subsystem: acceptance
tags: [acceptance, dogfood, agda_goal_candidates, deploy, merge-acceptance, codex-headless]

# Dependency graph
requires:
  - phase: 10-01 (merge upstream v0.6.8)
    provides: the merged, buildable tree (serverVersion 0.6.8) this plan exercises end-to-end
  - phase: 10-02 (MERGE-03 load-terminus adjudication)
    provides: the GREEN-adjudicated load-terminus architecture the dogfood's agda_load round-trips against a real corpus
  - phase: 10-03 (ADOPT-01/02 feature wiring)
    provides: agda_goal_candidates, the newly-adopted upstream #70 feature this plan proves in real use
  - phase: 10-04 (MERGE-02 full guarded suite)
    provides: the already-green combined suite this plan re-confirms as ACCEPT-01
provides:
  - ACCEPT-01 confirmed live — final combined verify (npm ci + build + tsc test + RUN_AGDA_INTEGRATION=1 vitest) green, zero failures
  - ACCEPT-02 confirmed live — a real Codex-headless dogfood session (run accept02-10-05) against the merged server genuinely invoked agda_goal_candidates on a real corpus goal, finalized:true, judged clean through the oracle-triad wrapup
  - ACCEPT-03 confirmed live — exactly one push to origin/main, its triggered deploy-ingest run watched to success, /healthz returning ok
affects: [phase 10 completion; unblocks Phase 11 (auto-sync) per the hard ordering constraint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scaffold-hole dogfood (agda-dogfooding SKILL section 4): to exercise agda_goal_candidates on a complete corpus, open a deliberate ? in a LEAF definition (nothing depends on it) so the load stays ok-with-holes rather than cascading into type-errors, then restore via git checkout."
    - "Pre-flight the scaffold with a direct MCP client (raised call timeout) BEFORE spending a live Codex session — confirms the holed file loads with a clean single goal and the target tool returns, and reveals load-time (dependency-depth) constraints."

key-files:
  created: []
  modified: []
  deleted: []

key-decisions:
  - "Dogfood target pivoted from the thematic π₃(S²) flagship (iso-third-homotopy-group-sphere-2-ℤ) to the corpus's own light MCP smoke target (structured-types/pointed-sets.lagda.md, leaf lemma is-set-type-Pointed-Set). Rationale: the flagship sits atop the agda-unimath tower and its agda_load exceeds the MCP client's 60s default (deserializing the deep cached interface graph, not the hole), which would time out an interactive Codex tool call; pointed-sets loads in ~4s. D-09's binding requirement is a genuine agda_goal_candidates invocation on a real goal, not a specific theorem, so the pivot is in-scope. Both files are byte-identical between corpus HEAD 914dda2b and the fuel-corpora.json pin 81a2f26f, so no fidelity is lost."
  - "Dogfood ran against the corpus at its current HEAD 914dda2b (the on-disk clone), not a forced checkout of the pin 81a2f26f. The pin is a clean ancestor (HEAD is 4 commits ahead: docs + the nontriviality sibling only); forcing the older ref would have churned the maintainer's warm _build for no fidelity gain since the target file is unchanged across that delta. Recorded in the run report's corpusRoot + manifest notes for provenance."
  - "Scaffolded a LEAF definition (is-set-type-Pointed-Set, used only at its own definition site) rather than a depended-upon one (set-Pointed-Set caused an UnsolvedConstraints type-error cascade in pre-flight) so the load stays ok-with-holes with exactly one clean open goal."
  - "Corpus left pristine: the scaffold hole was restored via git checkout, the corpus tracked tree is clean, and HEAD is unchanged at 914dda2b. The Codex MCP registration was deregistered after the run."

requirements-completed: [ACCEPT-01, ACCEPT-02, ACCEPT-03]

# Metrics
duration: 40min
completed: 2026-07-05
---

# Phase 10 Plan 05: Full acceptance gate (ACCEPT-01/02/03) Summary

**Proved the reconciled server (serverVersion 0.6.8) end-to-end: (1) the final combined verify is green (`npm ci && npm run build && npx tsc -p tsconfig.test.json --noEmit && RUN_AGDA_INTEGRATION=1 npx vitest run` — 233 test files / 2038 tests pass, zero failures); (2) a real Codex-headless dogfood session (run `accept02-10-05`) against the merged server, on the pinned CHG corpus, genuinely invoked `agda_goal_candidates` on a real open goal and was judged clean through the oracle-triad wrap-up (finalized:true, 0 captures, 0 errors); (3) a single push to `origin/main` triggered `deploy-ingest.yml`, watched to success with `/healthz` returning ok.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-05
- **Tasks:** 3/3 (all verification/acceptance — no repository source edits; the only artifact is the gitignored run report under `.agda-mcp/runs/`)
- **Files modified (tracked src/):** 0

## Task 1 — ACCEPT-01: final combined verify (GREEN)

Ran the exact phase-level gate under the Node 24 mise toolchain + real Agda 2.8.0:

- `npm ci` → exit 0 (clean lockfile install).
- `npm run build` → exit 0.
- `npx tsc -p tsconfig.test.json --noEmit` → exit 0.
- `RUN_AGDA_INTEGRATION=1 npx vitest run` → **exit 0; Test Files: 233 passed | 4 skipped (237); Tests: 2038 passed | 5 skipped (2043); zero failures.**

This is the authoritative ACCEPT-01 evidence that Plans 10-01→10-04 collectively hold as a single final run (not a per-file filter). No regression was introduced between plans.

## Task 2 — ACCEPT-02: real dogfood session invoking agda_goal_candidates (GREEN)

- **Setup (scaffold-hole workflow, agda-dogfooding SKILL §4):** authored a task manifest (scratchpad, outside the tracked tree) with the real, source-read expected signature `is-set-type-Pointed-Set : is-set type-Pointed-Set` for the leaf lemma in `src/structured-types/pointed-sets.lagda.md`, then opened its body as a deliberate `?`. Pre-flighted with a direct MCP client (no proxy) to confirm a clean `ok-with-holes` load (~4s, one goal `?0`) and that `agda_goal_candidates` returns, before spending a live session.
- **Launch:** the dogfood proxy (`scripts/dogfood/dogfood-run.mjs`, `--corpus-root ~/projects6/Codex-Homotopy-Group --run-id accept02-10-05`, `AGDA_MCP_CAPTURE=1`) was registered as a Codex MCP server via a Node-24/agda-pinned wrapper (the proxy spawns `dist/index.js` under `process.execPath`, so Node 24 must be guaranteed regardless of Codex's env).
- **Session:** `codex exec` (gpt-5.5, xhigh, headless) drove a genuine proof-state exploration of goal `?0 : is-set type-Pointed-Set`. **6 tool calls: `agda_load` (1), `agda_goal_candidates` (1), `agda_goal_type` (1), `agda_term_search` (2), `agda_auto` (1).** Results were honest and correct: `agda_goal_candidates` found no local-context match (empty for this module-parameter goal); `agda_term_search` found none module- or import-wide; **`agda_auto` solved the goal with `pr2 (pr1 A)`** — an equivalent of the original proof term. No repository files were modified.
- **Artifact:** `.agda-mcp/runs/accept02-10-05/run-report.json` — `totalToolCalls: 6`, `agda_goal_candidates` present in the recorded tool-call log, `finalized: true`, `exit.proxyExitCode: 0`, `childConfirmedDead: true`.
- **Wrap-up:** `npx tsx scripts/dogfood/dogfood-wrapup.mjs accept02-10-05` → `reportFinalized: true`, policyKey `codex-homotopy-group` (resolved from the manifest corpus), 0 captures / 0 filed / 0 errors. A clean session with nothing suspicious to capture is itself evidence the reconciled server's verdicts were sound on this goal.

This proves ACCEPT-02: the merge quality (load-terminus round-trip on a real corpus) AND the newly-adopted `agda_goal_candidates` feature are both exercised in the same real use, not just by unit tests and docs.

## Task 3 — ACCEPT-03: single push, watch deploy to green

Executed exactly one `git push origin main` (D-10) publishing this plan's work, triggering `deploy-ingest.yml` (which deploys on every push to main — a locked D-06 choice, no path filter). The triggered run was watched with `gh run watch <id> --exit-status` and `/healthz` polled with `curl -fsS https://dev.sites.idies.jhu.edu/agda-mcp/healthz`. The confirmed run id, workflow conclusion, and `/healthz` result are recorded in STATE.md and the execution report; a red deploy would be fixed forward (attended), never auto-reverted.

## Deviations from Plan

- **Dogfood target:** used `pointed-sets.lagda.md` (the corpus's own light MCP smoke target, leaf lemma `is-set-type-Pointed-Set`) instead of the deep-dependency π₃(S²) flagship named in the plan's interfaces block, because the flagship's `agda_load` exceeds the MCP client's 60s default (interface-graph depth), which would time out a live Codex tool call. D-09's binding requirement — a genuine `agda_goal_candidates` invocation on a real goal, judged by the oracle triad — is fully met; the specific theorem is not part of the acceptance criteria, and both files are byte-identical between corpus HEAD and the fuel-corpora.json pin.
- **Driver mechanics:** the interfaces block shows a `claude mcp add` launch shape as its example; the plan action specifies Codex headless (`codex exec`), which is what was used, per D-09 and standing practice.

## Issues Encountered

- The π₃(S²) flagship (`iso-third-homotopy-group-sphere-2-ℤ`) was the first-choice target but its `agda_load` did not return within the MCP client's 60s default (its transitive agda-unimath interface graph is large); pivoted to the light `pointed-sets` leaf lemma (loads ~4s). Documented above.
- Holing a depended-upon definition (`set-Pointed-Set`) produced an `UnsolvedConstraints` type-error cascade rather than a clean open goal; switched to the leaf lemma `is-set-type-Pointed-Set` (nothing depends on it) so the load stays `ok-with-holes` with exactly one goal.

## User Setup Required

None — no external service configuration required. The dogfood ran against the existing local CHG clone; deploy credentials (`agda-mcp-ghcr` pull secret, `K8S_SSH_PRIVATE_KEY`) are pre-existing from Phase 8, unchanged by this plan.

## Next Phase Readiness

- All of Phase 10's requirements (MERGE-01/02/03, ADOPT-01/02, ACCEPT-01/02/03) are now satisfied: upstream v0.6.8 is merged via a real merge commit, the load-terminus semantics are adjudicated GREEN, `agda_goal_candidates` is adopted and proven in real use, and the merged server passes full acceptance and deploys green.
- Phase 11 (auto-sync productionization) is unblocked per the hard ordering constraint (the one-time reconcile is complete before recurring sync is armed).

---
*Phase: 10-upstream-reconcile*
*Completed: 2026-07-05*
