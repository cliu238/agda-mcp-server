# RT1-RT8 Re-Verification vs Current Main (Phase 6, REVERIFY-01)

**Date:** 2026-07-04
**`agda --version`:** `Agda version 2.8.0`
**Current-main commit:** `a8e1512278c6424719b41b59f35815a0e166c381` (branch `main`; plan 06-02's base)
**Node/tsx used for driver:** Node `v22.22.0` via `npx tsx v4.22.4` (per D-06, the driver connects THROUGH `scripts/dogfood/dogfood-run.mjs`, never a bare `node` harness)
**Build:** `npm run build` completed with exit 0 before any session ran.
**Pipeline used:** every RT session below was driven live through `scripts/dogfood/dogfood-run.mjs` (recording proxy) -> `agda_capture_session` -> `scripts/dogfood/dogfood-wrapup.mjs` (oracle triad + N=3 flake gate), per D-06 — not an ad-hoc harness script. Fixtures are small, disposable, gitignored Agda files under `tmp/rt-reverify/` (D-05 — reusing `test/fixtures/agda/{HoleQuestionMark,NavigationQueries,WriteCaseSplit,WriteGiveSimple,MixedGoalsErrors,MixedVisibleInvisible}.agda` and the committed `test/fixtures/agda/FixtureDeps/TransitiveStaleness/` tree, never the CHG corpus).

Plan 06-02 covered **RT1-RT4** (below). Plan 06-03 (base commit `2fbbab4a68305305e6ac9bab15fe8db068a12b08`, same Agda/Node/tsx versions, same rig reused verbatim per the 06-02 handoff) completes **RT5-RT8** in this same file, per the 06-02 handoff instruction to extend rather than replace this report.

## Summary

| Spec | Fingerprint | Verdict | Run-id(s) | One-line finding |
|---|---|---|---|---|
| RT1: visible hole must never yield a completeness claim | `03f7c711c0209369` | **cannot-reproduce** | `rt1-20260703` | `agda_load` on a bare `?` hole correctly reports `classification: "ok-with-holes"`, `hasHoles: true`, `isComplete: false`. |
| RT2: not-in-scope query must return `ok:false`/NotInScope | `e5f6de1fa365b887` | **CONFIRMED** | `rt2-20260703` | Both `agda_infer` and `agda_compute` (top-level) return `ok:true`/`classification:"ok"` for an out-of-scope identifier, wrapping `"(unable to infer)"` / `"(no result)"`. |
| RT3: failing context-check must never say "no checked term" inside success | `eaea6321183bdf7b` | **CONFIRMED** | `rt3-20260703b` (`rt3-20260703` superseded — see below) | `agda_goal_type_context_check` returns `ok:true`/`classification:"ok"` while `data.goalType` embeds a raw NotInScope/UnequalTerms error and `data.checkedExpr` renders `"(no checked term returned)"`. |
| RT4: `agda_auto` must not treat CLI-flag hints as a term or a diagnostic as a solution | `004d161b839ce725` | **CONFIRMED** | `rt4-20260703` | `data.searchPayload` came back as `"-d 5 --list-candidates -h -t 999999 -x --unsafe"` and `hasSolution:true` while `data.solution` is Agda's own NotInScope rejection text — byte-for-byte the same shape as the already-triaged `5abecc959e43fef3` entry. |
| RT5: a mutation tool that fails to reload must return partial/failure with post-reload diagnostics | `a0ae86c7deb9754e` | **CONFIRMED** | `rt5-20260703` | `agda_apply_edit` wrote an ill-typed replacement and returned `ok:true`/`applied:true`/`"Goal diff: solved ?0, ?1, ?2"` while the reload actually failed with a raw `NotInScope` error — no structured field distinguishes this from a real success. |
| RT6: `agda_load` must distinguish visible goals/hidden metas/constraints/source holes/file-completeness | `ad2b6d31f58f1759` | **CONFIRMED** (missing-feature) | `rt6-20260703` | Source hole syntax has no field of its own (folded into `hasHoles`, and can go fully invisible — `goalCount:0, hasHoles:false` — when a real hole co-occurs with an unrelated hard error later in the file); `constraints` has no field on `agda_load` at all. |
| RT7: a timeout must identify whether Agda exited, is still running, or produced no protocol response | `b6821f42952c6ff8` | **CONFIRMED** | `rt7-20260703` | A 300ms-timeout `agda_load` that had already received 15 real protocol responses (incl. a terminal `InteractionPoints`) still surfaces `nextAction: "The Agda subprocess crashed or could not be started..."` — a specific, wrong causal claim. |
| RT8: a stale reload must report the previous+new classification together with the reason | `3306edf4c2d01c53` | **CONFIRMED** | `rt8-20260703` | `agda_load_no_metas` hardcodes `reloaded:false`/`staleBeforeLoad:false` and never reports `previousClassification`, even across a genuine dependency-caused regression; `agda_load` on the identical maneuver correctly reports both plus a `session-regression` diagnostic. |

D-08 duplicate sweep (plan 06-02's five runs): `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` returns **0** across all five wrapup runs below (`rt1-20260703`, `rt2-20260703`, `rt3-20260703`, `rt3-20260703b`, `rt4-20260703`). Every `dogfood-wrapup.mjs` run reported `0 filed` (see per-RT Observed sections) — the current oracle triad's two auto-filing predicates (ORCL-01 differential, ORCL-02 soundness scan) are not designed to catch this bug class (a deterministic response-envelope/schema defect that reproduces identically warm and cold, not a staleness differential or an unsanctioned-axiom/flag soundness violation), so nothing was ever staged for the manual-merge procedure D-08 anticipates. This is a legitimate, expected outcome, not a gap in the sweep — the verdicts above come from direct inspection of the driver's printed envelopes (quoted below), which is the mechanism the RT specs themselves require.

D-08 duplicate sweep (plan 06-03's four runs, `rt5-20260703` through `rt8-20260703`): **this time 2 were auto-filed** (`1b612dfeb1d31ea9` from `rt5-20260703`, `1220f2840142aab8` from `rt6-20260703`; `rt7-20260703` and `rt8-20260703` filed nothing) — both are the SAME staged capture their respective manual RT5/RT6 verdicts are based on, independently flagged by ORCL-01's warm/cold differential, not a second incident. Per D-08, neither was left as a disconnected `new` row: both are cross-referenced via `relatedFingerprint` to their originating RT entry (`a0ae86c7deb9754e`, `ad2b6d31f58f1759`) with the mechanism explained in each entry's own `notes`. See RT5's and RT6's sections below for the full detail, including RT6's auto-file turning out to be a genuine fidelity gap in the ORACLE tooling itself (`scripts/oracle/orcl-01-differential.mjs`), not a second independent server defect.

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

## RT5: a mutation tool that fails to reload must return partial/failure with post-reload diagnostics

**Fingerprint:** `a0ae86c7deb9754e`
**Verdict:** CONFIRMED

**v0.6.7 claim:** Per the UX report's Finding #3 ("State-changing tools could report success after creating reload errors", affected tools in evidence: `agda_case_split`, `agda_refine`, `agda_refine_exact`, one `agda_auto` case): a state-changing tool wrote a replacement, then reported text such as `Reloaded with errors: 0 goal(s) remaining` while the same payload contained parse/split errors, with the client-visible headline still reading success. `affectedTool` was recorded as `agda_apply_edit` (best-inferred mutation-tool family).

**Repro:** Corpus `tmp/rt-reverify/rt5/` (gitignored), fixture `test/fixtures/agda/WriteGiveSimple.agda` copied in verbatim (`myZero : Nat; myZero = {!!}` plus a two-clause `add`, both clauses also `{!!}`). Task manifest: `{ target: "RT5 mutation-tool reload failure", expectedSignature: "myZero : Nat", corpus: "rt-local-fixture" }`. Driver (`RT_SPEC=rt5`, run-id `rt5-20260703`): `agda_load` (baseline, `ok-with-holes`, 3 goals), then `agda_apply_edit { file: "WriteGiveSimple.agda", oldText: "myZero = {!!}", newText: "myZero = definitelyNotInScopeXyz" }`, then `agda_capture_session`. `agda_apply_edit` was chosen as the deterministic probe over `agda_give`/`agda_case_split`/`agda_refine` per the plan's own documented fallback: a `give`'s accept path requires the expression to already type-check against the goal, so a WRITTEN give cannot independently fail to reload under normal conditions — `agda_apply_edit`'s raw text substitution has no such precondition, letting the probe deterministically force a real post-write reload failure. `registerGoalTextTool`/`registerTextTool` (`src/tools/tool-registration.ts`) share the identical unconditional-`okEnvelope`-unless-throw wrapping used by `agda_case_split`/`agda_give`/`agda_refine`/`agda_refine_exact`/`agda_intro`/`agda_auto`, confirmed by direct source inspection — so this is the same defect class the UX report's evidence tools exhibit, reached via the most deterministic available probe.

**Observed (current main):**

```json
{
  "tool": "agda_apply_edit",
  "ok": true,
  "classification": "ok",
  "data": {
    "text": "## Apply edit to `WriteGiveSimple.agda`\n\nApplied edit at line 9.\n\nReloaded with errors: 0 goal(s) remaining.\n**Errors:** .../WriteGiveSimple.agda:9.10-33: error: [NotInScope]\nNot in scope:\n  definitelyNotInScopeXyz\n  ...\nGoal diff: solved ?0, ?1, ?2.\n",
    "file": "WriteGiveSimple.agda",
    "applied": true,
    "sandboxRejected": false,
    "message": "Applied edit at line 9."
  },
  "diagnostics": []
}
```

Top-level `ok:true`/`classification:"ok"`/`data.applied:true` — success-shaped in every structured field. The reload failure (a genuine `NotInScope` error) and the misleading `"Goal diff: solved ?0, ?1, ?2"` line (implying all three goals were solved, when in fact the file no longer type-checks at all) exist ONLY inside `data.text`'s free-form prose — `diagnostics` is empty, and no structured field (`applied`, `sandboxRejected`, or anything else) reflects the failure. Root cause: `reloadAndDiagnose()` (`src/session/reload-and-diagnose.ts`) reports a failed reload only via appended prose (`"Reloaded with errors: ..."`), never a structured field, and `registerTextTool`'s wrapper (`src/tools/tool-registration.ts`) always returns `okEnvelope(...)` unless the callback throws — which it never does here, since the edit itself DID apply successfully; only the subsequent reload failed.

`dogfood-wrapup.mjs rt5-20260703`: `orcl01=server-false-green-candidate orcl02=no-policy orcl03=conformance-flagged trueGreen=false` — **1 filed** (auto-filed as `1b612dfeb1d31ea9`, see below), classified `deterministic` (survived the N=3 flake gate).

**Implication:** CONFIRMED -> `needsReverify: false`, `status: "new" -> "triaged"`. `defectKind` corrected from the seeded `wrong-result` to `false-green`, matching this queue's own established usage for an `ok:true` response wrapping a real failure (`bfcba437f5426fd6`, `5abecc959e43fef3`/`004d161b839ce725` are the identical shape). Fix direction (future wave): give write-capable proof tools a structured `reloadOk`/`postReloadDiagnostics` field (the UX report's own Finding #3 suggested split — `editApplied`/`reloadOk`/`postReloadGoalCount`/`postReloadDiagnostics`/`solvedGoals`) and have the envelope's `ok`/`classification` reflect a failed reload, not just a successful edit.

**D-08 auto-file:** `dogfood-wrapup.mjs` independently auto-filed this SAME staged capture as `1b612dfeb1d31ea9`, an ORCL-01 server-false-green-candidate: the differential's `warmTuple` (`success:true, classification:"ok-with-holes"`) is the LAST load-family-**named** tool call (the original `agda_load`, before the mutation), while `coldTuple` (`success:false, classification:"type-error"`) is a fresh read of the file as it exists on disk now, after `agda_apply_edit` silently mutated it. `findWarmLoadTuple()` (`scripts/oracle/orcl-01-differential.mjs`) only matches `/^agda_(load|typecheck)/`-named recorded actions; `agda_apply_edit` performs a real internal reload but isn't in that family, so the oracle's own notion of "the warm state" went stale relative to disk truth. This is the SAME incident as RT5 itself, not a second defect — kept as its own queue row per D-08 (cross-referenced via `relatedFingerprint`, not merged), consistent with this queue's `5abecc959e43fef3`/`004d161b839ce725` and `fdc90bfde12fb938`/`ad2b6d31f58f1759` precedent.

---

## RT6: `agda_load` must distinguish visible goals, hidden metas, constraints, source hole syntax, and complete file acceptance

**Fingerprint:** `ad2b6d31f58f1759`
**Verdict:** CONFIRMED (missing-feature)

**v0.6.7 claim:** Per the UX report's Finding #4 ("Hole/completeness accounting was ambiguous", observed count 151): `agda_load` returned `classification: "ok-with-holes"`, `hasHoles: true`, `goalCount: 0`, `invisibleGoalCount: 0` — an internally-contradictory combination (holes exist, but neither visible nor invisible goals do). The suggested schema direction wants distinct fields for source hole syntax, visible interaction goals, hidden/invisible goals, unsolved metas, constraints, and final file completeness. `relatedFingerprint` links this entry to `fdc90bfde12fb938` (the `agda_proof_status` "no-goals-but-constraints-hold-an-error" sub-case, fixed separately).

**Repro:** Corpus `tmp/rt-reverify/rt6/` (gitignored), fixtures `test/fixtures/agda/MixedGoalsErrors.agda` (one valid `hole1 = {!!}` PLUS an unrelated hard type error, `wrong = true : Nat`) and `test/fixtures/agda/MixedVisibleInvisible.agda` (a top-level hole plus one inside an `abstract` block; both report as visible on Agda 2.8.0 per the fixture's own comment). Task manifest: two entries, `{ target: "RT6a hole+type-error conflation...", expectedSignature: "hole1 : Nat" }` and `{ target: "RT6b mixed visible/invisible holes...", expectedSignature: "topLevel : Nat" }`, both `corpus: "rt-local-fixture"`. Driver (`RT_SPEC=rt6`, run-id `rt6-20260703`): `agda_load MixedGoalsErrors.agda` -> `agda_capture_session` (RT6a) -> `agda_load MixedVisibleInvisible.agda` -> `agda_capture_session` (RT6b).

**Observed (current main, RT6a — `MixedGoalsErrors.agda`):**

```json
{
  "classification": "type-error",
  "data": {
    "success": false, "goalIds": [], "goalCount": 0, "invisibleGoalCount": 0,
    "hasHoles": false, "isComplete": false, "classification": "type-error",
    "errors": [".../MixedGoalsErrors.agda:17.9-13: error: [UnequalTerms]\nBool !=< Nat\n..."]
  },
  "diagnostics": [
    { "severity": "error", "message": "...UnequalTerms...", "code": "agda-error" },
    { "severity": "info", "message": "Earliest diagnostic location in this load: line 17. ...", "code": "scope-check-extent" }
  ]
}
```

This LIVE reproduces the UX report's Finding #4 symptom exactly: the file genuinely contains a valid, syntactically-correct `hole1 = {!!}` (line 10-11), yet the response shows `goalCount:0, invisibleGoalCount:0, hasHoles:false` — the hole is completely invisible to the client. Root cause: `classifyLoadResult()`'s `sourceHoleCount` input (`src/agda/session-load-helpers.ts`) is the ONLY place source-hole-syntax feeds the response, and `runLoad()`'s `needsExplicitHoleScan` gate (`src/agda/session-load-impl.ts`) only invokes `countExplicitSourceHoles()` when `parsed.success` is true — since this file has an unrelated hard error, `parsed.success` is `false`, the source-hole scan never runs, and the genuinely-present hole vanishes from every field. **`agda_load`'s response schema also has no `constraints` field whatsoever** (that signal exists only on a different tool, `agda_proof_status`, already tracked separately as `fdc90bfde12fb938`).

**Observed (current main, RT6b — `MixedVisibleInvisible.agda`):** `goalCount: 2, invisibleGoalCount: 0, hasHoles: true, classification: "ok-with-holes"` — both the top-level and abstract-block holes report as visible interaction points on Agda 2.8.0, confirming the visible/hidden-metas distinction works correctly WHEN Agda's own protocol reports both consistently (not itself a defect — an Agda-version behavior note, per the fixture's own comment).

`dogfood-wrapup.mjs rt6-20260703`: RT6a — `orcl01=server-false-green-candidate orcl02=no-policy orcl03=conformance-flagged trueGreen=false`, **1 filed** (auto-filed as `1220f2840142aab8`, see below). RT6b — `orcl01=pass orcl02=no-policy orcl03=consistent trueGreen=false`, `0 filed`.

**Implication:** CONFIRMED as `missing-feature` -> `needsReverify: false`, `status: "new" -> "triaged"`. Of the five asked-for distinctions, `agda_load` already exposes visible goals (`goalCount`/`goalIds`), hidden metas (`invisibleGoalCount`), and file completeness (`isComplete`/`classification`) directly — but **source hole syntax** (folded into a derived boolean with no count of its own, and demonstrably losable per RT6a above) and **constraints** (absent from this tool's schema entirely) remain conflated/missing. The plausible fix is the UX report's "Suggested Schema Direction" response-schema rework — a deferred-ideas re-triage candidate (D-10); the DISPOSITION (fix vs re-triage) belongs to plan 06-06, not here.

**D-08 auto-file, WITH AN IMPORTANT CORRECTION:** `dogfood-wrapup.mjs` auto-filed RT6a's capture as `1220f2840142aab8`. Its `warmTuple`/`coldTuple` agree on `success`/`goalCount`/`invisibleGoalCount`/`classification` — the ONLY differing field is `hasHoles` (warm: `false`, cold: `true`). Root-cause analysis: `runColdLoadAndDiff()` (`scripts/oracle/orcl-01-differential.mjs`) computes `sourceHoleCount = countExplicitSourceHoles(materializedPath)` **unconditionally**, then feeds it to `classifyLoadResult()` — it does NOT replicate the live server's own `needsExplicitHoleScan` gate described above. Since this capture's load failed, the REAL live server never scans for source holes here at all (as shown in RT6a's own observed envelope); the oracle's cold-side reimplementation simply skips that gate, producing a spurious mismatch. **This is a newly-discovered fidelity gap in the ORACLE TOOLING itself (`scripts/oracle/orcl-01-differential.mjs`), not a second independent client-facing `agda_load` defect** — it is a side effect of investigating the exact same `hasHoles`/`sourceHoleCount` mechanism RT6 itself is about. Cross-referenced via `relatedFingerprint` to `ad2b6d31f58f1759` (kept as its own row per D-08, not merged). Flagged loudly for plan 06-06: the likely fix is a one-line change making `runColdLoadAndDiff`'s hole scan match `runLoad`'s own gate — a `scripts/` change, out of this plan's committed file scope (06-03 is scoped to `test/fixtures/fix-queue.json` and this report only).

---

## RT7: a timeout must identify whether Agda exited, is still running, or produced no protocol response

**Fingerprint:** `b6821f42952c6ff8`
**Verdict:** CONFIRMED

**v0.6.7 claim:** Per the UX report's Finding #6 ("Timeout/process errors were real but diagnostics were too coarse", 9 of 10 observed timeout diagnostics suggested the subprocess may have crashed or failed to start, even though the direct evidence was a command timeout with no protocol response). Affected tools in evidence: `agda_load`, `agda_typecheck`, `agda_auto_all`. The suggested fix distinguishes: subprocess failed to start; subprocess exited; protocol produced no response before timeout; Agda is still running; Agda is checking a specific file; user/client cancelled.

**Repro:** Corpus `tmp/rt-reverify/rt7/` (gitignored), fixture `test/fixtures/agda/HoleQuestionMark.agda`. Task manifest: `{ target: "RT7 timeout identification", expectedSignature: "question : Nat", corpus: "rt-local-fixture" }`. Driver (`RT_SPEC=rt7`, run-id `rt7-20260703`) spawned with `AGDA_MCP_COMMAND_TIMEOUT_MS=300` set ONLY on that one-off shell invocation (never exported globally, per T-06-09's mitigation) — the plan's suggested starting value (300ms) reliably timed out on the first attempt, so the fallback to 50ms was not needed. `agda_load { file: "HoleQuestionMark.agda" }` -> `agda_capture_session` (direct capture succeeded; the reload-then-capture fallback branch was not needed).

**Observed (current main):**

```json
{
  "tool": "agda_load", "ok": false, "classification": "process-error",
  "summary": "Agda load failed: sendCommand timed out after 300ms (received 15 responses: {\"Status\":2,\"ClearRunningInfo\":1,\"ClearHighlighting\":1,\"RunningInfo\":1,\"HighlightingInfo\":8,\"DisplayInfo\":1,\"InteractionPoints\":1})",
  "diagnostics": [{
    "severity": "error", "code": "process-error",
    "message": "Agda load failed: sendCommand timed out after 300ms (received 15 responses: ...)",
    "nextAction": "The Agda subprocess crashed or could not be started. Run `agda --version` to confirm it is installed and on PATH (or set AGDA_BIN), then retry the load."
  }]
}
```

The server's own debug log (stderr, `AGDA_MCP_DEBUG` trace-independent `logger.warn`) confirms the process was alive and actively progressing: `responseCount:15`, `sawStatusDone:true`, `lastResponseKind:"InteractionPoints"` (a TERMINAL goal-state event), `msSinceLastResponse:96` — the last response arrived only 96ms before the 300ms deadline. Despite this, the surfaced `nextAction` asserts **"The Agda subprocess crashed or could not be started"** — a specific, wrong causal claim directly contradicted by the response's own evidence. `classification: "process-error"` cannot distinguish "timed out while alive and progressing" from "crashed on its own" from "never started" from "produced no protocol response at all" — all four collapse to the identical classification and (in three of the four cases, misleading) diagnostic. Root cause: `processErrorResult()` (`src/session/load-tool-shared.ts`) hardcodes this crash/startup `nextAction` text for EVERY `session.load()` throw, including the timeout `Error` thrown by `AgdaTransport.sendCommand` (`src/session/agda-transport.ts`) — which itself already calls `terminateAgdaProcess(proc)` on timeout, a fact never communicated to the caller either.

`dogfood-wrapup.mjs rt7-20260703` (run with `AGDA_MCP_COMMAND_TIMEOUT_MS` unset, normal env, per T-06-09): `orcl01=skip` (a `process-error` classification has no load-family completeness tuple to diff against — `judgeOrcl01`'s own `COMPLETENESS_CLASSIFICATIONS` check), `orcl02=no-policy`, `orcl03=conformance-flagged`, `0 filed`. The pipeline pass itself is fully documented in `.agda-mcp/runs/rt7-20260703/wrapup-report.json` even though nothing was auto-filed — satisfying D-06 (a failed load legitimately leaves no load-family tuple for the flake gate to act on; the RT7 evidence is the recorded envelope above, not an auto-filed queue row).

**Implication:** CONFIRMED -> `needsReverify: false`, `status: "new" -> "triaged"`. This is byte-for-byte the same shape the UX report's Finding #6 recorded in v0.6.7 — still alive on current main, same wrong "crashed or could not be started" framing, now surfaced via the generic `process-error` path. Fix direction (future wave): a dedicated `timeout` classification (or a `processState` field distinguishing alive/exited/never-started/no-response) fed from the actual `responseCount`/`sawStatusDone` evidence `AgdaTransport` already collects and logs, rather than a hardcoded crash-assuming `nextAction`.

---

## RT8: a stale reload must report the previous and new classification together with the reason

**Fingerprint:** `3306edf4c2d01c53` (relatedFingerprint: `e6f0c1169032b9d5`, the flagship — stays `locked` and untouched)
**Verdict:** CONFIRMED

**v0.6.7 claim:** Per the UX report's Finding #8 ("Reload/staleness transitions were hard to interpret", observed count 63) and RT8's own cross-reference to the re-verified flagship transitive-staleness false-green: re-verify whether `agda_load_no_metas` and related tools in this family still lack a combined previous+new classification report, given current-main `agda_load` already attaches a `session-regression` diagnostic with `previousClassification` (per `.planning/research/CHG-REVERIFY.md` Defect 1's own warm-inject baseline).

**Repro:** Corpus `tmp/rt-reverify/rt8/` (gitignored), the committed `test/fixtures/agda/FixtureDeps/TransitiveStaleness/{Main,Dep,Dep.broken}.agda` tree copied in with its `FixtureDeps/TransitiveStaleness/` nesting preserved. Task manifest: `{ target: "RT8 stale-reload combined classification...", expectedSignature: "useValue : Nat", corpus: "rt-local-fixture" }`. Driver (`RT_SPEC=rt8`, run-id `rt8-20260703`), all in one session:

1. `agda_load_no_metas Main.agda` (clean `Dep.agda`) -> `ok-complete`.
2. Out-of-band: `writeFileSync` overwrites `Dep.agda` with `Dep.broken.agda`'s content (mirrors CHG-REVERIFY's raw-`writeFileSync` convention).
3. `agda_load_no_metas Main.agda` again -> `type-error` (the RT8 probe proper).
4. Out-of-band: `Dep.agda` restored to its clean content.
5. `agda_load Main.agda` (comparison row A) -> `ok-complete`, `reloaded:true`.
6. Out-of-band: `Dep.agda` overwritten with `Dep.broken.agda`'s content again.
7. `agda_load Main.agda` (comparison row B) -> `type-error`, `reloaded:true`.
8. `agda_capture_session`.

**Observed (current main):**

`agda_load_no_metas`, call 3 (Dep.agda broken):
```json
{
  "classification": "type-error",
  "data": {
    "success": false, "classification": "type-error",
    "errors": [".../Main.agda:10.12-20: error: [UnequalTerms]\nBool !=< Nat\nwhen checking that the expression getValue has type Nat"],
    "reloaded": false, "staleBeforeLoad": false
  },
  "diagnostics": [{ "severity": "error", "code": "agda-error", "message": "...UnequalTerms..." }]
}
```

No `previousClassification` field anywhere in `data` (the field doesn't even exist on `agda_load_no_metas`'s constructed response object), and `reloaded`/`staleBeforeLoad` are hardcoded `false` — factually wrong here, since this genuinely is a reload of an already-loaded file whose dependency just regressed. No diagnostic of any kind hints at the regression.

`agda_load`, call 7 (identical corruption maneuver, comparison row B):
```json
{
  "classification": "type-error",
  "data": {
    "success": false, "classification": "type-error",
    "reloaded": true, "staleBeforeLoad": false,
    "previousClassification": "ok-complete", "previousLoadedAtMs": 1783128758174
  },
  "diagnostics": [
    { "severity": "error", "code": "agda-error", "message": "...UnequalTerms..." },
    { "severity": "info", "code": "session-regression", "message": "Regression: this file loaded as ok-complete 0s ago. It may have been modified since, or a dependency may have changed." },
    { "severity": "info", "code": "scope-check-extent", "message": "Earliest diagnostic location in this load: line 10. ..." }
  ]
}
```

`agda_load`, on the IDENTICAL corruption maneuver applied to the IDENTICAL fixture in the SAME session, correctly reports `previousClassification`, `reloaded:true`, AND fires the `session-regression` diagnostic naming the reason. Root cause confirmed by source inspection: `registerAgdaLoadNoMetas` (`src/session/register-agda-load-no-metas.ts`) hardcodes `reloaded: false, staleBeforeLoad: false` unconditionally and never calls `session.getLastClassification()`/`getLastLoadedAt()` at all — unlike `agda_load`'s own registration. This is a 100% deterministic code-path gap, not a timing-dependent one. (`staleBeforeLoad` stays `false` for `agda_load` too, throughout — `Main.agda`'s own mtime never changed, only `Dep.agda`'s did; the naive same-file mtime check cannot detect transitive-only staleness, consistent with CHG-REVERIFY.md Defect 1's own finding. `previousClassification` + the `session-regression` diagnostic carry the real signal instead, independent of that check.)

`dogfood-wrapup.mjs rt8-20260703`: `orcl01=pass orcl02=clean orcl03=conformance-flagged trueGreen=true` — `0 filed` (the final on-disk state at capture time was already correctly reported broken by the last-recorded load-family action, so ORCL-01's differential agrees warm-vs-cold; no D-08 manual-merge needed for this run).

**Implication:** CONFIRMED -> `needsReverify: false`, `status: "new" -> "triaged"`. Fix direction (future wave): `registerAgdaLoadNoMetas` should read and report the same `previousClassification`/`previousLoadedAtMs`/`reloaded`/`staleBeforeLoad`/`session-regression` fields `agda_load` already computes — the underlying `session.lastClassification`/`session.lastLoadedAt` state is set identically by `runLoadNoMetas()` (`src/agda/session-load-impl.ts`), so the fix is a report-side change only, no new session-state tracking required. The flagship (`e6f0c1169032b9d5`) stays `locked` and untouched, per the plan's instruction — this entry documents a distinct, still-open gap in a sibling tool, not a regression of the flagship's own fix.

---

## Methodology notes

- **RT3's first-attempt control probe was not ill-typed as originally worded.** The plan's own action text suggested "give a Nat-typed goal the expr `true`" as an ill-typed control, but `WriteCaseSplit.agda`'s two goals both have `Bool` return type, so `true` is well-typed in either. Caught and corrected in-session (`rt3-20260703b`, using `zero` — a genuine `Nat`-into-`Bool` mismatch) rather than reporting a misleading "control probe passed" data point. Both run-ids' pipeline artifacts remain on disk as evidence.
- **The oracle triad did not auto-file any of RT1-RT4** (`0 filed` on every one of the five wrapup runs). This is expected, not a gap: ORCL-01 (differential) only compares a warm vs. a cold reload of the *same, unmutated* file and only for load-family tools, so it cannot catch a schema/labeling defect that is deterministic across both warm and cold; ORCL-02 (soundness scan) targets unsanctioned postulates/unsafe flags/residual holes in a proof's *own source content*, not a response-envelope mislabeling or a CLI-argument-injection pattern. All four verdicts above come from direct inspection of the driver's printed `structuredContent` envelopes, which is exactly what the RT specs themselves demand.
- **D-08 manual-merge sweep result: nothing to merge.** `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` is 0 both before and after this plan's five wrapup runs — no disconnected duplicate rows were ever staged, so there was nothing to cross-reference into the seeded RT1-RT4 entries beyond the run-ids recorded directly in this report and in each entry's own `notes` field.
- Raw driver output (`tmp/rt-driver.mjs`, gitignored), corpus fixtures, and pipeline run artifacts (`.agda-mcp/runs/rt{1,2,3,4}-20260703{,b}/`, including `wrapup-report.json` for each) all live under gitignored paths per the established evidence convention; only this report and the `test/fixtures/fix-queue.json` transitions are committed.

### Plan 06-03 additions (RT5-RT8)

- **The oracle triad auto-filed 2 of the 4 RT5-RT8 sessions this time** (`rt5-20260703` -> `1b612dfeb1d31ea9`, `rt6-20260703` -> `1220f2840142aab8`), unlike 06-02's clean `0 filed` across all five of its runs. Both were investigated per D-08 rather than assumed to be independent new defects: RT5's auto-file is a genuine, on-topic corroboration of the same session's manual finding (ORCL-01's warm-tuple lookup only tracks load-family-*named* tools, so `agda_apply_edit`'s own internal reload left the recorder's "warm" reference stale); RT6's auto-file turned out to be a fidelity gap inside the ORACLE's own cold-replay reimplementation (`scripts/oracle/orcl-01-differential.mjs` does not replicate `runLoad()`'s `needsExplicitHoleScan` gate), not a second independent client-facing defect. Both are cross-referenced via `relatedFingerprint` into their originating RT5/RT6 entries rather than left as disconnected `new` rows — see each entry's own section above and `notes` field for the full analysis.
- **RT7's timeout-injection env var (`AGDA_MCP_COMMAND_TIMEOUT_MS=300`) was set ONLY on the single one-off shell invocation that ran the `rt7` driver spec**, verified unset (`env | grep` returned nothing) before running `dogfood-wrapup.mjs rt7-20260703` in a fresh command — per T-06-09's mitigation, so the fault-injection lever never leaked into the oracle's own cold-spawn probes for that run or any other.
- **RT8's driver performs the out-of-band `Dep.agda` corruption maneuver twice** (once for `agda_load_no_metas`, once for `agda_load`) in the same session, rather than only once, specifically so the "previous+new+reason" comparison is apples-to-apples: both tools are tested against the byte-identical corruption on the byte-identical fixture, in the same session, rather than inferring `agda_load`'s behavior from a separate historical measurement (CHG-REVERIFY.md's Defect 1) alone.
- **Verdicts for RT5-RT8 were reached the same way as RT1-RT4**: direct inspection of the driver's printed `structuredContent` envelopes against each spec's literal predicate, corroborated in three of four cases (RT5, RT6, RT8) by matching source-code inspection of the exact function responsible (`reloadAndDiagnose`/`registerTextTool`, `classifyLoadResult`/`needsExplicitHoleScan`, `registerAgdaLoadNoMetas`) — every verdict above is reproducible by a future maintainer from source alone, independent of this specific session's timing.

---

## REVERIFY-01 acceptance

All 8 `needsReverify` RT defect specs (RT1-RT8) now have a definitive, pipeline-measured, evidence-backed verdict against current main: RT1 `cannot-reproduce`; RT2, RT3, RT4, RT5, RT7, RT8 `CONFIRMED`; RT6 `CONFIRMED` as `missing-feature`. The mechanical gate is green: `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` returns **0** (verified after plan 06-03's edits), and `npx vitest run test/unit/fixtures/fix-queue.test.ts` passes (10/10). Every formerly-`needsReverify` entry now sits in a schema-valid terminal-for-this-phase state: `rejected`/`cannot-reproduce`/`closedAt` set (RT1) or `triaged`/`needsReverify:false` (RT2-RT8). Two additional entries (`1b612dfeb1d31ea9`, `1220f2840142aab8`) were auto-filed by the oracle triad during RT5/RT6's live sessions and are cross-referenced per D-08, not double-counted against the 8-spec gate. REVERIFY-01 is complete; the D-12 gate for waves 3+ (fix -> lock) is open — all 8 pre-fix measurements are on record, per D-09's confirmed set now standing at the 4 named entries (`5abecc959e43fef3`, `bfcba437f5426fd6`, `eb7439cb3ed9d6b9`, `fdc90bfde12fb938`) plus RT2-RT8's 6 confirmed specs (RT1 excluded as cannot-reproduce) plus the 2 auto-filed oracle-tooling/differential findings, as input to REVERIFY-02's fix-order planning.

---

*Investigation artifacts (driver script, fixture corpora, raw run/wrapup JSON) live under gitignored `tmp/rt-reverify/`, `tmp/rt-driver.mjs`, and `.agda-mcp/runs/`; only this report and the fix-queue.json transitions are committed.*

---

## Phase 6 closeout (plan 06-06): REVERIFY-02 final disposition + acceptance sweep

**Date:** 2026-07-04
**Scope:** flip the four D-09-named confirmed entries plus RT4 to `locked` (Task 1); disposition every remaining RT-confirmed entry and the 2 oracle-auto-filed entries — fix and lock where the fix is an evident <=2-src-file change with an obvious from-RED unit test, otherwise defer with a recorded reason (Task 2); run the phase's final acceptance sweep.

### Final disposition table

| Fingerprint | Title (short) | End state | Lock/deferral reference |
|---|---|---|---|
| `e6f0c1169032b9d5` | Flagship: transitive dependency staleness false-green (#64/#61) | locked (pre-existing, Phase 3.1 — untouched) | `matrixEntryId: issue-64-61-transitive-staleness`; unchanged per this plan's own instruction |
| `5abecc959e43fef3` | agda_auto CLI-flag hint injection | **locked** | Regression lock: `test/unit/agda/agent-ux.test.ts` (3 `buildAutoSearchPayload` throw cases) + `test/unit/tools/goal-tools-give.test.ts`; commits `26f8356`/`235b0b2` (plan 06-04) |
| `bfcba437f5426fd6` | agda_give ok:true-wrapping-rejection | **locked** | Regression lock: `test/unit/agda/goal-operations-give.test.ts` + `test/unit/tools/goal-tools-give.test.ts`; commits `c9c9b5b`/`e11211c` (plan 06-04) |
| `eb7439cb3ed9d6b9` | agda_search_definitions hardcoded agda/ layout | **locked** | Regression lock: `test/unit/tools/file-tools.test.ts` (directory-param cases); commit `67d40a6` (plan 06-05) |
| `fdc90bfde12fb938` | agda_proof_status "All goals solved" over live constraints | **locked** | Regression lock: `test/unit/tools/analysis-tools.test.ts`; commit `6caa279` (plan 06-05) |
| `03f7c711c0209369` | RT1: visible hole must never yield completeness | rejected / cannot-reproduce (plan 06-02 — unchanged) | `closedAt` set; evidence in the RT1 section above |
| `e5f6de1fa365b887` | RT2: not-in-scope query returns bare success | **locked** | Regression lock: `test/unit/agda/expression-operations.test.ts` (4 throw cases across compute/computeTopLevel/infer/inferTopLevel); this plan (06-06), commit `f7c0daa` — `throwOnDisplayError()` added to `src/agda/expression-operations.ts` after empirically verifying the rejection arrives as an Error DisplayInfo, not stderr |
| `eaea6321183bdf7b` | RT3: failing context-check inside a success result | **locked** | Regression lock: `test/unit/agda/goal-operations-context-check.test.ts` (2 throw cases); this plan (06-06), commit `3abddab` — `goalTypeContextCheck()` now reuses give()'s `detectResponseError()` |
| `004d161b839ce725` | RT4: agda_auto CLI-flag hints (shared root cause) | **locked** | Same lock references as `5abecc959e43fef3` (cross-ref, D-08, not double-counted) |
| `a0ae86c7deb9754e` | RT5: mutation-tool reload failure reported as success | **DEFERRED (Phase 6)** | Large-redesign class — shared root cause spans 7 write-capable proof tools (case_split/give/refine/refine_exact/intro/auto/apply_edit); needs a response-schema-level fix (e.g. reloadOk/postReloadDiagnostics) exceeding this wave's <=2-src-file appetite (D-10) |
| `ad2b6d31f58f1759` | RT6: agda_load five-state conflation | **DEFERRED (Phase 6)** | Pre-approved deferral class — the UX report's "Suggested Schema Direction" response-schema rework |
| `b6821f42952c6ff8` | RT7: timeout diagnostics misidentify subprocess state | **DEFERRED (Phase 6)** | Pre-approved deferral class — needs a dedicated timeout/processState taxonomy, a diagnostic-design decision, not a mechanical fix |
| `3306edf4c2d01c53` | RT8: agda_load_no_metas silent on stale-reload transitions | **locked** | Regression lock: `test/unit/session/register-agda-load-no-metas.test.ts`; this plan (06-06), commit `6991916` — mirrors `register-agda-load.ts`'s session-history read, report-side only |
| `1b612dfeb1d31ea9` | Oracle-auto-filed (RT5 corroboration, same incident) | **DEFERRED (Phase 6)** | Follows `a0ae86c7deb9754e`'s own deferral (D-08, not a separate defect) |
| `1220f2840142aab8` | Oracle-auto-filed (RT6 investigation byproduct — oracle-tooling fidelity gap) | **DEFERRED (Phase 6)** | Not a live server defect; the `scripts/oracle/orcl-01-differential.mjs` fix is a `scripts/`-only change out of this wave's committed file scope, deferred alongside RT6 |

15 of 15 queue rows accounted for (13 originally-seeded + 2 oracle-auto-filed) — exceeds the >= 12-row disposition-table requirement.

### Acceptance-gate outputs

- `grep -c '"needsReverify": true' test/fixtures/fix-queue.json` → **0**
- `grep -c '"status": "new"' test/fixtures/fix-queue.json` → **0**
- `grep -c '"status": "locked"' test/fixtures/fix-queue.json` → **9** (flagship, pre-existing, + 8 entries fixed across Phase 6 waves 3-4)
- `grep -c '"status": "triaged"' test/fixtures/fix-queue.json` → **5** (every row's notes carry the literal `DEFERRED (Phase 6):` prefix, verified row-by-row)
- `grep -c '"status": "rejected"' test/fixtures/fix-queue.json` → **1** (RT1, `cannot-reproduce`, unchanged)
- `npx vitest run test/unit/fixtures/fix-queue.test.ts` → 10/10 passing (the `locked`/`rejected` `closedAt` superRefine and `rejected` → `rejectedReason` invariants hold for every row)
- `npx vitest run` (full suite) → 197 test files passed, 16 skipped; 1627 tests passed, 179 skipped — zero failures
- `npm run build` → exit 0
- `npx tsc -p tsconfig.json --noEmit` → exit 0 (clean, no diagnostics)

### Emit-regression applicability

No load-family false-green candidate was confirmed during this plan's disposition pass. RT2/RT3/RT8's fixes (compute/infer and goalTypeContextCheck's Error-DisplayInfo detection; agda_load_no_metas's session-history report) are all non-load-family or report-side-only changes, and the 4 named entries plus RT4 were already established as non-load-family defects in wave 3. **The emit-regression path had no applicable cargo this phase** — every lock in this closeout uses the from-RED vitest mechanism instead (see the D-11 mechanism note below).

### D-11 mechanism note (condensed from this plan's objective)

D-11 names the Phase-3 emit-regression pipeline as the lock mechanism "per the flagship precedent," but that pipeline's own contracts (`judgeRefusal`, `replayCaptureRegressionEntry`) apply ONLY to load-family false-green candidates carrying an ORCL-01 `server-false-green-candidate` verdict and a `coldTuple`. None of the defects locked in Phase 6 (the 4 named entries, RT4, RT2, RT3, RT8) are load-family tool-envelope defects — forcing them through the emitter would require either fabricating a cold expected value (forbidden by Phase 3's D-06 anti-golden-master refusal) or building new matrix machinery (out of this phase's "cargo, not machinery" scope). Every non-load-family lock in this queue therefore uses its from-RED vitest regression test(s) as the durable lock artifact, with `matrixEntryId` left `null` (the frozen schema in `test/fixtures/fix-queue.ts` requires only `closedAt` for a `locked` status) and the mechanism recorded explicitly in the entry's own `notes` field, per the exact "Regression lock:" grep-able prefix.

### REVERIFY-02 acceptance

Every one of the 4 named entries (`5abecc959e43fef3`, `bfcba437f5426fd6`, `eb7439cb3ed9d6b9`, `fdc90bfde12fb938`) is `locked` with `closedAt` set and notes naming its regression-lock test(s), all of which pass. Every RT-confirmed entry (RT2-RT8, RT4, plus the 2 oracle-auto-filed corroborations) ends `locked` or explicitly `DEFERRED (Phase 6):` with a recorded reason — none silently stalled. Zero entries remain `needsReverify: true` and zero sit in an undocumented non-terminal state. Both of the phase's REVERIFY success criteria (zero `needsReverify`; every confirmed live defect locked or explicitly re-triaged) are now mechanically demonstrated on a green tree.
