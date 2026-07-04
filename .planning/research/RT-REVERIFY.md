# RT1-RT8 Re-Verification vs Current Main (Phase 6, REVERIFY-01)

**Date:** 2026-07-04
**`agda --version`:** `Agda version 2.8.0`
**Current-main commit:** `a8e1512278c6424719b41b59f35815a0e166c381` (branch `main`; plan 06-02's base)
**Node/tsx used for driver:** Node `v22.22.0` via `npx tsx v4.22.4` (per D-06, the driver connects THROUGH `scripts/dogfood/dogfood-run.mjs`, never a bare `node` harness)
**Build:** `npm run build` completed with exit 0 before any session ran.
**Pipeline used:** every RT session below was driven live through `scripts/dogfood/dogfood-run.mjs` (recording proxy) -> `agda_capture_session` -> `scripts/dogfood/dogfood-wrapup.mjs` (oracle triad + N=3 flake gate), per D-06 — not an ad-hoc harness script. Fixtures are small, disposable, gitignored Agda files under `tmp/rt-reverify/` (D-05 — reusing `test/fixtures/agda/{HoleQuestionMark,NavigationQueries,WriteCaseSplit,WriteGiveSimple,MixedGoalsErrors,MixedVisibleInvisible}.agda`, never the CHG corpus).

Plan 06-02 covered **RT1-RT4** (below). Plan 06-03 (base commit `2fbbab4a68305305e6ac9bab15fe8db068a12b08`, same Agda/Node/tsx versions, same rig reused verbatim per the 06-02 handoff) is completing **RT5-RT8** in this same file, per the 06-02 handoff instruction to extend rather than replace this report. This commit covers RT5+RT6; RT7+RT8 follow in the next commit of the same plan.

## Summary

| Spec | Fingerprint | Verdict | Run-id(s) | One-line finding |
|---|---|---|---|---|
| RT1: visible hole must never yield a completeness claim | `03f7c711c0209369` | **cannot-reproduce** | `rt1-20260703` | `agda_load` on a bare `?` hole correctly reports `classification: "ok-with-holes"`, `hasHoles: true`, `isComplete: false`. |
| RT2: not-in-scope query must return `ok:false`/NotInScope | `e5f6de1fa365b887` | **CONFIRMED** | `rt2-20260703` | Both `agda_infer` and `agda_compute` (top-level) return `ok:true`/`classification:"ok"` for an out-of-scope identifier, wrapping `"(unable to infer)"` / `"(no result)"`. |
| RT3: failing context-check must never say "no checked term" inside success | `eaea6321183bdf7b` | **CONFIRMED** | `rt3-20260703b` (`rt3-20260703` superseded — see below) | `agda_goal_type_context_check` returns `ok:true`/`classification:"ok"` while `data.goalType` embeds a raw NotInScope/UnequalTerms error and `data.checkedExpr` renders `"(no checked term returned)"`. |
| RT4: `agda_auto` must not treat CLI-flag hints as a term or a diagnostic as a solution | `004d161b839ce725` | **CONFIRMED** | `rt4-20260703` | `data.searchPayload` came back as `"-d 5 --list-candidates -h -t 999999 -x --unsafe"` and `hasSolution:true` while `data.solution` is Agda's own NotInScope rejection text — byte-for-byte the same shape as the already-triaged `5abecc959e43fef3` entry. |
| RT5: a mutation tool that fails to reload must return partial/failure with post-reload diagnostics | `a0ae86c7deb9754e` | **CONFIRMED** | `rt5-20260703` | `agda_apply_edit` wrote an ill-typed replacement and returned `ok:true`/`applied:true`/`"Goal diff: solved ?0, ?1, ?2"` while the reload actually failed with a raw `NotInScope` error — no structured field distinguishes this from a real success. |
| RT6: `agda_load` must distinguish visible goals/hidden metas/constraints/source holes/file-completeness | `ad2b6d31f58f1759` | **CONFIRMED** (missing-feature) | `rt6-20260703` | Source hole syntax has no field of its own (folded into `hasHoles`, and can go fully invisible — `goalCount:0, hasHoles:false` — when a real hole co-occurs with an unrelated hard error later in the file); `constraints` has no field on `agda_load` at all. |
| RT7-RT8 | — | — | — | see the next commit's continuation of this file |

D-08 duplicate sweep (plan 06-02's five runs): `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` returns **0** across all five wrapup runs below (`rt1-20260703`, `rt2-20260703`, `rt3-20260703`, `rt3-20260703b`, `rt4-20260703`). Every `dogfood-wrapup.mjs` run reported `0 filed` (see per-RT Observed sections) — the current oracle triad's two auto-filing predicates (ORCL-01 differential, ORCL-02 soundness scan) are not designed to catch this bug class (a deterministic response-envelope/schema defect that reproduces identically warm and cold, not a staleness differential or an unsanctioned-axiom/flag soundness violation), so nothing was ever staged for the manual-merge procedure D-08 anticipates. This is a legitimate, expected outcome, not a gap in the sweep — the verdicts above come from direct inspection of the driver's printed envelopes (quoted below), which is the mechanism the RT specs themselves require.

D-08 duplicate sweep (plan 06-03's RT5+RT6 runs, `rt5-20260703` and `rt6-20260703`): **this time 2 were auto-filed** (`1b612dfeb1d31ea9` from `rt5-20260703`, `1220f2840142aab8` from `rt6-20260703`) — both are the SAME staged capture their respective manual RT5/RT6 verdicts are based on, independently flagged by ORCL-01's warm/cold differential, not a second incident. Per D-08, neither was left as a disconnected `new` row: both are cross-referenced via `relatedFingerprint` to their originating RT entry (`a0ae86c7deb9754e`, `ad2b6d31f58f1759`) with the mechanism explained in each entry's own `notes`. See RT5's and RT6's sections below for the full detail, including RT6's auto-file turning out to be a genuine fidelity gap in the ORACLE tooling itself (`scripts/oracle/orcl-01-differential.mjs`), not a second independent server defect.

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

## Methodology notes

- **RT3's first-attempt control probe was not ill-typed as originally worded.** The plan's own action text suggested "give a Nat-typed goal the expr `true`" as an ill-typed control, but `WriteCaseSplit.agda`'s two goals both have `Bool` return type, so `true` is well-typed in either. Caught and corrected in-session (`rt3-20260703b`, using `zero` — a genuine `Nat`-into-`Bool` mismatch) rather than reporting a misleading "control probe passed" data point. Both run-ids' pipeline artifacts remain on disk as evidence.
- **The oracle triad did not auto-file any of RT1-RT4** (`0 filed` on every one of the five wrapup runs). This is expected, not a gap: ORCL-01 (differential) only compares a warm vs. a cold reload of the *same, unmutated* file and only for load-family tools, so it cannot catch a schema/labeling defect that is deterministic across both warm and cold; ORCL-02 (soundness scan) targets unsanctioned postulates/unsafe flags/residual holes in a proof's *own source content*, not a response-envelope mislabeling or a CLI-argument-injection pattern. All four verdicts above come from direct inspection of the driver's printed `structuredContent` envelopes, which is exactly what the RT specs themselves demand.
- **D-08 manual-merge sweep result: nothing to merge.** `grep -c '"title": "Dogfood-surfaced' test/fixtures/fix-queue.json` is 0 both before and after this plan's five wrapup runs — no disconnected duplicate rows were ever staged, so there was nothing to cross-reference into the seeded RT1-RT4 entries beyond the run-ids recorded directly in this report and in each entry's own `notes` field.
- Raw driver output (`tmp/rt-driver.mjs`, gitignored), corpus fixtures, and pipeline run artifacts (`.agda-mcp/runs/rt{1,2,3,4}-20260703{,b}/`, including `wrapup-report.json` for each) all live under gitignored paths per the established evidence convention; only this report and the `test/fixtures/fix-queue.json` transitions are committed.

---

*Investigation artifacts (driver script, fixture corpora, raw run/wrapup JSON) live under gitignored `tmp/rt-reverify/`, `tmp/rt-driver.mjs`, and `.agda-mcp/runs/`; only this report and the fix-queue.json transitions are committed. RT5-RT8: see continuation (plan 06-03).*
