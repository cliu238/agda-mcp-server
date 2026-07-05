# Deferred Items — Phase 10 (Upstream Reconcile)

Out-of-scope discoveries logged per the executor's SCOPE BOUNDARY rule — not fixed,
just recorded for later triage.

## Plan 10-03

- **`test/unit/tools/team-install-pinned-env.test.ts`** — 6 pre-existing failures
  observed while running the full `test/unit test/property` suite as a broader sanity
  check beyond this plan's own required verification set. All 6 are unrelated to
  `agda_goal_candidates` wiring/docs (this plan's only files:
  `src/tools/register-core-tools.ts`, `src/session/tool-recommendation.ts`,
  `src/tools/data/tool-family-examples.json`, `README.md`,
  `docs/assistant-workflows.md`) and instead stem from the local sandbox environment:
  - 2 failures assert `corpus NOT ready` messaging the local run doesn't produce
    (network/corpora-fetch dependent).
  - 2 `--public-only` clone-count assertions receive empty stdout (also
    network/corpora-fetch dependent).
  - 1 failure is a bare Node-version mismatch inside a spawned child script
    (`Detected Node major version 22, but Node >= 24 is required` — the spawned
    `bash`/child process is picking up a different Node than the one running the
    test harness; environmental, not a code defect this plan introduced).
  - Out of scope for Plan 10-03; not investigated further here. Flag for Plan 10-04
    (full acceptance) or a follow-up `/gsd-quick` if it recurs there.
