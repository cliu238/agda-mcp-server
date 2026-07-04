# RT1-RT8 Re-Verification vs Current Main (Phase 6, REVERIFY-01)

**Date:** 2026-07-04
**`agda --version`:** `Agda version 2.8.0`
**Current-main commit:** `a8e1512278c6424719b41b59f35815a0e166c381` (branch `main`)
**Node/tsx used for driver:** Node `v22.22.0` via `npx tsx v4.22.4` (per D-06, the driver connects THROUGH `scripts/dogfood/dogfood-run.mjs`, never a bare `node` harness)
**Build:** `npm run build` completed with exit 0 before any session ran.
**Pipeline used:** every RT session below was driven live through `scripts/dogfood/dogfood-run.mjs` (recording proxy) -> `agda_capture_session` -> `scripts/dogfood/dogfood-wrapup.mjs` (oracle triad + N=3 flake gate), per D-06 — not an ad-hoc harness script. Fixtures are small, disposable, gitignored Agda files under `tmp/rt-reverify/` (D-05 — reusing `test/fixtures/agda/{HoleQuestionMark,NavigationQueries,WriteCaseSplit}.agda`, never the CHG corpus).

This plan (06-02) covers **RT1-RT4**. RT5-RT8: see continuation (plan 06-03).

## Summary

| Spec | Fingerprint | Verdict | Run-id(s) | One-line finding |
|---|---|---|---|---|
| RT1: visible hole must never yield a completeness claim | `03f7c711c0209369` | **cannot-reproduce** | `rt1-20260703` | `agda_load` on a bare `?` hole correctly reports `classification: "ok-with-holes"`, `hasHoles: true`, `isComplete: false`. |
| RT2: not-in-scope query must return `ok:false`/NotInScope | `e5f6de1fa365b887` | **CONFIRMED** | `rt2-20260703` | Both `agda_infer` and `agda_compute` (top-level) return `ok:true`/`classification:"ok"` for an out-of-scope identifier, wrapping `"(unable to infer)"` / `"(no result)"`. |
| RT3: failing context-check must never say "no checked term" inside success | `eaea6321183bdf7b` | **CONFIRMED** | `rt3-20260703b` (`rt3-20260703` superseded — see below) | `agda_goal_type_context_check` returns `ok:true`/`classification:"ok"` while `data.goalType` embeds a raw NotInScope/UnequalTerms error and `data.checkedExpr` renders `"(no checked term returned)"`. |
| RT4: `agda_auto` must not treat CLI-flag hints as a term or a diagnostic as a solution | `004d161b839ce725` | **CONFIRMED** | `rt4-20260703` | `data.searchPayload` came back as `"-d 5 --list-candidates -h -t 999999 -x --unsafe"` and `hasSolution:true` while `data.solution` is Agda's own NotInScope rejection text — byte-for-byte the same shape as the already-triaged `5abecc959e43fef3` entry. |

D-08 duplicate sweep: `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` returns **0** across all five wrapup runs below (`rt1-20260703`, `rt2-20260703`, `rt3-20260703`, `rt3-20260703b`, `rt4-20260703`). Every `dogfood-wrapup.mjs` run reported `0 filed` (see per-RT Observed sections) — the current oracle triad's two auto-filing predicates (ORCL-01 differential, ORCL-02 soundness scan) are not designed to catch this bug class (a deterministic response-envelope/schema defect that reproduces identically warm and cold, not a staleness differential or an unsanctioned-axiom/flag soundness violation), so nothing was ever staged for the manual-merge procedure D-08 anticipates. This is a legitimate, expected outcome, not a gap in the sweep — the verdicts above come from direct inspection of the driver's printed envelopes (quoted below), which is the mechanism the RT specs themselves require.

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

## RT3: a failing context-check must never say "no checked term" inside a success result

**Fingerprint:** `eaea6321183bdf7b`
**Verdict:** CONFIRMED

**v0.6.7 claim:** A failing context/type-check is reported inside an `ok:true` result whose text says "no checked term," rather than as a failure. `affectedTool` was recorded as the placeholder `agda_context` (no such tool exists — "best-inferred").

**Repro:** Corpus `tmp/rt-reverify/rt3/`, fixture `test/fixtures/agda/WriteCaseSplit.agda` (two open goals: `not : Bool -> Bool` and `isZero : Nat -> Bool`, both `{!!}`). Task manifest: `{ target: "RT3 failing context-check no-checked-term", expectedSignature: "isZero : Nat -> Bool", corpus: "rt-local-fixture" }`. First attempt (run-id `rt3-20260703`) probed goal 0 with a not-in-scope expr, then an `expr: "true"` control — which turned out to be well-typed against BOTH of this fixture's goals (both have `Bool` return type), so it was not a genuine ill-typed control. Corrected and re-run as `rt3-20260703b` with `expr: "zero"` (a `Nat` constructor) as the second, genuinely ill-typed probe against the same `Bool`-typed goal 0. Both run-ids' `wrapup-report.json` exist on disk; `rt3-20260703b` is the evidence of record for the ill-typed sub-case, `rt3-20260703` already fully confirms the not-in-scope sub-case identically.

**Observed (current main, `rt3-20260703b`):**

```json
// agda_goal_type_context_check ?0, expr: "definitelyNotInScopeXyz"
{ "ok": true, "classification": "ok",
  "data": {
    "goalType": "1.1-24: error: [NotInScope]\nNot in scope:\n  definitelyNotInScopeXyz at 1.1-24\nwhen scope checking definitelyNotInScopeXyz",
    "checkedExpr": ""
  },
  "text": "...### Checked term for `definitelyNotInScopeXyz`\n\n```agda\n(no checked term returned)\n```\n" }

// agda_goal_type_context_check ?0, expr: "zero" (Nat literal into a Bool goal)
{ "ok": true, "classification": "ok",
  "data": {
    "goalType": "1.1-5: error: [UnequalTerms]\nNat !=< Bool\nwhen checking that the expression zero has type Bool",
    "checkedExpr": ""
  },
  "text": "...### Checked term for `zero`\n\n```agda\n(no checked term returned)\n```\n" }
```

Both a NotInScope and a genuinely ill-typed (`UnequalTerms`) probe come back `ok:true`/`classification:"ok"`, embedding Agda's own raw error text inside `data.goalType`, with `data.checkedExpr` empty — rendering the literal string `"(no checked term returned)"` inside a reported-success result, exactly the RT3 shape, doubly confirmed. Code-level root cause: `goalTypeContextCheck()` (`src/agda/goal-operations.ts:75-90`) is the one goal-operation in that file that never calls `throwOnFatalProtocolStderr(responses)` — every sibling (`caseSplit`, `give`, etc.) does.

`dogfood-wrapup.mjs`: both `rt3-20260703` and `rt3-20260703b` report `orcl01=pass orcl02=no-policy orcl03=consistent trueGreen=false`, `0 filed`.

**Implication:** CONFIRMED -> `needsReverify: false`, `status: "new" -> "triaged"`. `affectedTool` corrected from the placeholder `agda_context` to the real tool name `agda_goal_type_context_check`. Fix direction (future wave): call `throwOnFatalProtocolStderr(responses)` in `goalTypeContextCheck()` (matching the rest of `src/agda/goal-operations.ts`), or have the tool callback treat an embedded `error: [` pattern in `goalType`/`checkedExpr` as a failure classification.

---

## RT4: `agda_auto` must not treat CLI-flag-shaped hints as a term or report a diagnostic as a solution

**Fingerprint:** `004d161b839ce725` (relatedFingerprint: `5abecc959e43fef3`)
**Verdict:** CONFIRMED (pre-fix measurement, per D-12/D-08 — this measurement must land before the `agda_auto` fix does)

**v0.6.7 claim:** Same root cause as the already re-verified-alive `5abecc959e43fef3` entry (`.planning/research/CHG-REVERIFY.md` Defect 2): CLI-flag-shaped `hints`/`excludeHints` values are concatenated unescaped into the Agsy search payload, and a diagnostic/rejection can be reported as `hasSolution:true`.

**Repro:** Corpus `tmp/rt-reverify/rt4/`, fixture `test/fixtures/agda/HoleQuestionMark.agda`. Task manifest: `{ target: "RT4 agda_auto CLI-flag-shaped hints", expectedSignature: "question : Nat", corpus: "rt-local-fixture" }`. Driver (`RT_SPEC=rt4`, run-id `rt4-20260703`): `agda_load`, then the EXACT CHG-REVERIFY Defect-2 shape — `agda_auto { goalId, depth: 5, listCandidates: true, hints: ["-t 999999"], excludeHints: ["--unsafe"], writeToFile: false }` — then a reload (the documented CHG-REVERIFY deviation: `agda_auto` can close a goal in Agda's own in-memory interactive state even with `writeToFile: false`), then `agda_capture_session`.

**Observed (current main):**

```json
{
  "ok": true,
  "classification": "ok",
  "data": {
    "solution": "1.1-3: error: [NotInScope]\nNot in scope:\n  -d at 1.1-3\nwhen scope checking -d",
    "hasSolution": true,
    "searchPayload": "-d 5 --list-candidates -h -t 999999 -x --unsafe",
    "written": false
  }
}
```

`data.searchPayload` is exactly `"-d 5 --list-candidates -h -t 999999 -x --unsafe"` — the `hints` value `"-t 999999"` and `excludeHints` value `"--unsafe"` concatenated verbatim after `-h `/`-x ` with zero escaping, byte-for-byte the same shape `5abecc959e43fef3` recorded on 2026-07-02. `hasSolution: true` while `data.solution` is Agda's own `NotInScope` rejection of the injected `-d` flag, not a real proof term. The reload afterward (`previousClassification: "ok-with-holes"`, `hasHoles: true`, unchanged goal count) confirms the on-disk file and interactive goal state were both left untouched — `writeToFile: false` correctly prevented a file mutation, but the response's own `ok:true`/`hasSolution:true` fields still misreport the outcome.

`dogfood-wrapup.mjs rt4-20260703`: `orcl01=pass orcl02=no-policy orcl03=consistent trueGreen=false` — `0 filed` (the last load-family action, the reload, correctly agrees warm-vs-cold since the file was never mutated; ORCL-02's soundness scan targets unsanctioned postulates/flags/holes in the *file's own content*, not a CLI-argument-injection pattern inside a tool call's search payload — this bug class is outside both predicates' coverage, same as RT1-RT3).

**Implication:** CONFIRMED -> `needsReverify: false`, `status: "new" -> "triaged"`. This is the D-12-mandated pre-fix measurement for RT4, recorded here BEFORE any `agda_auto` fix lands (D-08's no-race rule — the fix plan is gated behind this plan's wave). The fresh run-id/evidence is cross-attached to `5abecc959e43fef3`'s own notes (same root cause, `buildAutoSearchPayload()` in `src/agda/refactor-helpers.ts`); `5abecc959e43fef3`'s status remains `triaged` (unchanged) per the plan's instruction not to flip it here.

---

## Methodology notes

- **RT3's first-attempt control probe was not ill-typed as originally worded.** The plan's own action text suggested "give a Nat-typed goal the expr `true`" as an ill-typed control, but `WriteCaseSplit.agda`'s two goals both have `Bool` return type, so `true` is well-typed in either. Caught and corrected in-session (`rt3-20260703b`, using `zero` — a genuine `Nat`-into-`Bool` mismatch) rather than reporting a misleading "control probe passed" data point. Both run-ids' pipeline artifacts remain on disk as evidence.
- **The oracle triad did not auto-file any of RT1-RT4** (`0 filed` on every one of the five wrapup runs). This is expected, not a gap: ORCL-01 (differential) only compares a warm vs. a cold reload of the *same, unmutated* file and only for load-family tools, so it cannot catch a schema/labeling defect that is deterministic across both warm and cold; ORCL-02 (soundness scan) targets unsanctioned postulates/unsafe flags/residual holes in a proof's *own source content*, not a response-envelope mislabeling or a CLI-argument-injection pattern. All four verdicts above come from direct inspection of the driver's printed `structuredContent` envelopes, which is exactly what the RT specs themselves demand.
- **D-08 manual-merge sweep result: nothing to merge.** `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` is 0 both before and after this plan's five wrapup runs — no disconnected duplicate rows were ever staged, so there was nothing to cross-reference into the seeded RT1-RT4 entries beyond the run-ids recorded directly in this report and in each entry's own `notes` field.
- Raw driver output (`tmp/rt-driver.mjs`, gitignored), corpus fixtures, and pipeline run artifacts (`.agda-mcp/runs/rt{1,2,3,4}-20260703{,b}/`, including `wrapup-report.json` for each) all live under gitignored paths per the established evidence convention; only this report and the `test/fixtures/fix-queue.json` transitions are committed.

---

*Investigation artifacts (driver script, fixture corpora, raw run/wrapup JSON) live under gitignored `tmp/rt-reverify/`, `tmp/rt-driver.mjs`, and `.agda-mcp/runs/`; only this report and the fix-queue.json transitions are committed. RT5-RT8: see continuation (plan 06-03).*
