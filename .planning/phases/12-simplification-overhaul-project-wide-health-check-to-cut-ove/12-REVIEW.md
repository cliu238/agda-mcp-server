---
phase: 12-simplification-overhaul-project-wide-health-check-to-cut-ove
document: 12-REVIEW.md
status: clean
reviewed: 2026-07-06
depth: inline-proportionate
---

# Phase 12 Code Review

**Verdict: clean — no issues.**

## Scope

The phase executed 6 fork-owned cuts; only one produced net-new source (all others are deletions or comment/doc repoints). The single reviewable code change is **CUT-01** — extraction of the duplicated `assertSafeRunId` guard into a shared module. Reviewed inline (proportionate to a ~40-line dev-tooling refactor) rather than via the full multi-agent `gsd-code-review`, because the change is small, fully test-covered, and the phase verifier already independently scanned all 10 touched files (zero anti-pattern markers).

Changed source files:
- `scripts/dogfood/run-id.mjs` (new, exported `assertSafeRunId`)
- `scripts/dogfood/dogfood-run.mjs`, `scripts/dogfood/dogfood-wrapup.mjs` (inline copies → import)
- `test/unit/tools/dogfood-run-id.test.ts` (new, 7 cases)
- `test/unit/tools/dogfood-wrapup-argv-parsing.test.ts` (2 assertions updated to match unified message)

## Findings

- **Faithful extraction (no behavior regression):** the shared `assertSafeRunId` preserves the original guard condition exactly — rejects `--`-prefixed (flag-shaped) tokens, `/` and `\` path separators, and `.`/`..`. Behavior is unchanged apart from the intentional message-text unification (`invalid run-id` → `invalid --run-id value`), which the two test assertions were updated to match in the same commit (as CUT-01 required).
- **Security rationale preserved:** the module's header retains the IN-01 path-traversal / flag-injection reasoning; the guard is called unconditionally at both CLIs' arg-parse sites before any `join(runsRoot, runId)`.
- **Dedup goal achieved:** the two previously-drifted copies are collapsed to one definition, so a future validation-rule change can no longer land in only one CLI — exactly the CUT-01 objective.
- **Coverage:** new `dogfood-run-id.test.ts` (7 cases) plus the updated argv-parsing assertions; full phase-level gate green (2045 tests, 0 failures).

## Notes (not defects)

- The guard does not cap length or reject NUL bytes; the module comment explicitly flags these as *possible future additions*, not current gaps — out of scope for this extraction.
- No `src/` (shipped-server) code changed this phase; the review surface is confined to `scripts/dogfood/` dev tooling.
