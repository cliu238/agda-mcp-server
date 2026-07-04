# RT1-RT8 Re-Verification vs Current Main (Phase 6, REVERIFY-01)

**Date:** 2026-07-04
**`agda --version`:** `Agda version 2.8.0`
**Current-main commit:** `a8e1512278c6424719b41b59f35815a0e166c381` (branch `main`)
**Node/tsx used for driver:** Node `v22.22.0` via `npx tsx v4.22.4` (per D-06, the driver connects THROUGH `scripts/dogfood/dogfood-run.mjs`, never a bare `node` harness)
**Build:** `npm run build` completed with exit 0 before any session ran.
**Pipeline used:** every RT session below was driven live through `scripts/dogfood/dogfood-run.mjs` (recording proxy) -> `agda_capture_session` -> `scripts/dogfood/dogfood-wrapup.mjs` (oracle triad + N=3 flake gate), per D-06 — not an ad-hoc harness script. Fixtures are small, disposable, gitignored Agda files under `tmp/rt-reverify/` (D-05 — reusing `test/fixtures/agda/{HoleQuestionMark,NavigationQueries,WriteCaseSplit}.agda`, never the CHG corpus).

This plan (06-02) covers **RT1-RT4**. Task 1 (below) covers RT1-RT2; RT3-RT4 are filled by Task 2. RT5-RT8: see continuation (plan 06-03).

## Summary

| Spec | Fingerprint | Verdict | Run-id(s) | One-line finding |
|---|---|---|---|---|
| RT1: visible hole must never yield a completeness claim | `03f7c711c0209369` | **cannot-reproduce** | `rt1-20260703` | `agda_load` on a bare `?` hole correctly reports `classification: "ok-with-holes"`, `hasHoles: true`, `isComplete: false`. |
| RT2: not-in-scope query must return `ok:false`/NotInScope | `e5f6de1fa365b887` | **CONFIRMED** | `rt2-20260703` | Both `agda_infer` and `agda_compute` (top-level) return `ok:true`/`classification:"ok"` for an out-of-scope identifier, wrapping `"(unable to infer)"` / `"(no result)"`. |
| RT3: failing context-check must never say "no checked term" inside success | `eaea6321183bdf7b` | pending (Task 2) | — | — |
| RT4: `agda_auto` must not treat CLI-flag hints as a term or a diagnostic as a solution | `004d161b839ce725` | pending (Task 2) | — | — |

D-08 duplicate sweep (RT1/RT2 so far): `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` returns **0** across both wrapup runs below (`rt1-20260703`, `rt2-20260703`). Both `dogfood-wrapup.mjs` runs reported `0 filed` (see per-RT Observed sections) — the current oracle triad's two auto-filing predicates (ORCL-01 differential, ORCL-02 soundness scan) are not designed to catch this bug class (a deterministic response-envelope/schema defect that reproduces identically warm and cold, not a staleness differential or an unsanctioned-axiom/flag soundness violation), so nothing was ever staged for the manual-merge procedure D-08 anticipates. This is a legitimate, expected outcome, not a gap in the sweep — the verdicts above come from direct inspection of the driver's printed envelopes (quoted below), which is the mechanism the RT specs themselves require.

---

## RT1: a visible hole must never yield a completeness claim

**Fingerprint:** `03f7c711c0209369`
**Verdict:** cannot-reproduce

**v0.6.7 claim:** A file with at least one visible interaction hole (`{!!}` or `?`) is reported with a completeness claim (`fileComplete:true` in the v0.6.7-era response shape).

**Repro:** Corpus `tmp/rt-reverify/rt1/` (gitignored), fixture `test/fixtures/agda/HoleQuestionMark.agda` (`question : Nat; question = ?`) copied in verbatim. Task manifest: `{ target: "RT1 visible-hole completeness", expectedSignature: "question : Nat", corpus: "rt-local-fixture" }`. Session driven via `tmp/rt-driver.mjs` (`RT_SPEC=rt1`, run-id `rt1-20260703`): a single `agda_load { file: "HoleQuestionMark.agda" }` call, then `agda_capture_session { expectedSignature: "question : Nat", note: "RT1 re-verification..." }`.

**Observed (current main):**

```json
{
  "classification": "ok-with-holes",
  "data": {
    "success": true,
    "goalIds": [0],
    "goalCount": 1,
    "hasHoles": true,
    "isComplete": false,
    "classification": "ok-with-holes"
  },
  "diagnostics": [
    { "severity": "info", "message": "Detected 1 visible goals and 0 invisible goals.", "code": "completeness" }
  ]
}
```

No completeness claim of any kind co-occurs with `hasHoles: true`. `classifyLoadResult()` (`src/agda/session-load-helpers.ts:168-181`) derives `isComplete = success && !hasHoles` structurally — the field cannot independently disagree with `hasHoles` in the current schema, since it is computed from it in the same function, not sourced from a separate signal that could drift.

`dogfood-wrapup.mjs rt1-20260703`: `orcl01=pass orcl02=no-policy orcl03=consistent trueGreen=false` — `1 capture(s) judged — 0 filed, 0 flaky, 0 replay-inconclusive, 1 not-a-candidate, 0 error(s)`. (ORCL-02's `no-policy` finding correctly flags the residual `?` hole as `sanctioned:false` — expected for an intentionally-incomplete fixture with no policy file, not evidence of the RT1 defect itself.)

**Implication:** cannot-reproduce -> `rejected` / `rejectedReason: "cannot-reproduce"`. The response schema has been restructured since the v0.6.7 measurement (`classification`/`hasHoles`/`isComplete` replacing whatever produced a standalone `fileComplete` boolean); on current main the three fields are structurally consistent and Agda's own interactive protocol assigns a goal ID to a bare `?` exactly as it does for `{!!}`, so `goalCount > 0` already drives `hasHoles: true` correctly. Per the 260702-29k calibration rule, this is recorded as "does not reproduce under current conditions," not "never existed."

---

## RT2: a not-in-scope query must return `ok:false`/NotInScope, never a bare success

**Fingerprint:** `e5f6de1fa365b887`
**Verdict:** CONFIRMED

**v0.6.7 claim:** A query referencing an out-of-scope identifier returns a bare successful envelope instead of `ok:false` with a structured NotInScope classification. `affectedTool` was recorded as the placeholder `agda_query` (no such tool exists in the manifest — "best-inferred (query-family)").

**Repro:** Corpus `tmp/rt-reverify/rt2/`, fixture `test/fixtures/agda/NavigationQueries.agda`. Task manifest: `{ target: "RT2 not-in-scope query", expectedSignature: "add : Nat -> Nat -> Nat", corpus: "rt-local-fixture" }`. Driver (`RT_SPEC=rt2`, run-id `rt2-20260703`): `agda_load`, then two top-level (no `goalId`) probes against an identifier that does not exist anywhere in the fixture — `agda_infer { expr: "definitelyNotInScopeXyz" }` and `agda_compute { expr: "definitelyNotInScopeXyz" }` — then `agda_capture_session`.

**Observed (current main):**

```json
// agda_infer (top-level, out-of-scope)
{ "ok": true, "classification": "ok",
  "data": { "expr": "definitelyNotInScopeXyz", "inferredType": "(unable to infer)" } }

// agda_compute (top-level, out-of-scope)
{ "ok": true, "classification": "ok",
  "data": { "expr": "definitelyNotInScopeXyz", "normalForm": "(no result)" } }
```

Both tools return the top-level envelope's `ok: true` / `classification: "ok"` — a bare successful envelope wrapping a placeholder string, exactly the RT2 shape, on **both** probed tools. Code-level root cause: `computeTopLevel()` and `inferTopLevel()` (`src/agda/expression-operations.ts:32-77`) never call `throwOnFatalProtocolStderr()`, so an Agda-level NotInScope rejection decodes to an empty `normalForm`/`inferredType` rather than throwing; `agda_compute`/`agda_infer` (`src/tools/expression-tools.ts`) only produce an `errorEnvelope` when the underlying call *throws*.

`dogfood-wrapup.mjs rt2-20260703`: `orcl01=pass orcl02=no-policy orcl03=consistent trueGreen=false` — `0 filed` (`agda_infer`/`agda_compute` are not load-family tools, so ORCL-01's differential has no warm/cold tuple to diff against them).

**Implication:** CONFIRMED -> `needsReverify: false`, `status: "new" -> "triaged"`. `affectedTool` corrected from the placeholder `agda_query` to `agda_infer` (the notes record that `agda_compute` reproduces identically). Fix direction (future wave): both top-level expression tools should treat an empty/failed decode as a `NotInScope`-classified failure rather than a bare `ok:true`.

---

*RT3-RT4 continue in this same file (Task 2 of plan 06-02). Investigation artifacts (driver script, fixture corpora, raw run/wrapup JSON) live under gitignored `tmp/rt-reverify/`, `tmp/rt-driver.mjs`, and `.agda-mcp/runs/`; only this report and the fix-queue.json transitions are committed.*
