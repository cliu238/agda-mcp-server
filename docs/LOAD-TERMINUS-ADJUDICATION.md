# Load-Terminus Adjudication

Durable record of the MERGE-03 empirical adjudication (Phase 10 — Upstream
Reconcile, Plan 10-02). Upstream v0.6.8 (commits through `d4497a2`, merged as
`1f91f33`) reworked the same seam our Phase 03.1 flagship fix (#61/#64
transitive-staleness) hardened: how a `Cmd_load`/`Cmd_load_no_metas` round
trip decides it has actually finished, rather than resolving on a guessed
idle window. Per D-04 (`.planning/phases/10-upstream-reconcile/10-CONTEXT.md`),
the decision for each sub-behavior is made ONLY from running our from-RED
regression locks as referee against upstream's candidate implementation —
never from code-reading or taste. This file records that referee run and its
outcome, once, so future 3-day auto-sync escalations (Phase 11) don't have to
re-derive "why are the semantics the way they are."

## Referee command

```bash
export PATH="/Users/eric/.local/share/mise/installs/node/24/bin:$PATH"
RUN_AGDA_INTEGRATION=1 npx vitest run \
  test/integration/mcp/capture-regression.test.ts \
  test/integration/agda/agda-stale-dependency.test.ts
```

Run live on 2026-07-05 against Plan 10-01's merge candidate (upstream's
whole-file architecture for `agda-transport.ts` / `command-completion.ts` /
`session-load-impl.ts`, with Plan 10-01's two unconditional CLAUDE.md/
regression corrections already applied — return-based
`loadIncompleteNoTerminus` and the ported goal-ID recovery block). Node 24
(mise) and a real `agda` (2.8.0, `/Users/eric/.nix-profile/bin/agda`) were
confirmed on `PATH`; both matrix entries and upstream's own regression test
ran for real (not `test.skip`'d) and all three passed:

| Referee test                                                                                                                             | Result        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `capture-regression.test.ts` > `issue-64-61-transitive-staleness: agda_load_no_metas matches ORCL-01 cold expected value`                | PASS (2306ms) |
| `capture-regression.test.ts` > `guard-no-metas-clean-load-under-fault-injection: agda_load_no_metas matches ORCL-01 cold expected value` | PASS (2281ms) |
| `agda-stale-dependency.test.ts` > `a broken dependency reloads as type-error, not a stale false-green`                                   | PASS (6581ms) |

**Verdict: GREEN on all three.** Per D-04, green means: adopt upstream's
implementation for all three sub-behaviors below, and confirm our parallel
`load-terminus-tracker.ts` implementation was correctly deleted in Plan 10-01
rather than kept as a hybrid. No RED-branch revert/graft work was needed in
this plan — that whole branch (restore `git show 1f91f33^1:PATH`, re-widen
`LoadTerminusOptions`, graft the fatal-stderr/inactivity-watchdog hardening
onto the restored implementation) is documented in the plan text as the
fallback path, unused here.

## Decision table

| Sub-behavior                                                                                                                       | Decision              | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Referee evidence                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completion-signal detection (how a load round trip knows it has actually finished, vs. resolving on a guessed idle window)         | **Theirs** (upstream) | Upstream's `src/agda/session-load-impl.ts` routes the strict load (`runLoadNoMetas`) through `Cmd_load` (not `Cmd_load_no_metas`) with `awaitGoalTerminus: true`, the same real goal-state terminus (`InteractionPoints` + `AllGoalsWarnings`/`Error`) our #61/#64 fix required — eliminating the parallel `load-terminus-tracker.ts` heuristic entirely (one less implementation = permanently smaller conflict surface on every future sync, per the milestone's divergence-stops-accumulating goal). Both from-RED locks passed against this architecture unmodified. | `capture-regression.test.ts`'s two `agda_load_no_metas` matrix entries (`issue-64-61-transitive-staleness`, `guard-no-metas-clean-load-under-fault-injection`) both PASS; `agda-stale-dependency.test.ts` (upstream's own #61/#64-class regression, metas path) PASS. Command above, run 2026-07-05. |
| Fatal-stderr handling (a fatal protocol-level stderr line unblocking a load early instead of waiting out the full command timeout) | **Theirs** (upstream) | Ships bundled in the same adopted `src/session/agda-transport.ts`/`command-completion.ts` file swap — not a separately toggleable behavior. `test/unit/session/agda-transport.test.ts`'s upstream-authored `"a fatal protocol stderr completes a load instead of hanging until timeout"` test passes as-is against the merged implementation, with `isFatalProtocolStderr`/`throwOnFatalProtocolStderr` (`src/agda/protocol-errors.ts`) unconflicted and preserved from Plan 10-01.                                                                                      | `test/unit/session/agda-transport.test.ts` full suite (19/19) PASS, including this test, unmodified. Same command family as above, no source edit needed this plan.                                                                                                                                  |
| Inactivity timeout (a silence-reset watchdog vs. a fixed absolute `timeoutMs`)                                                     | **Theirs** (upstream) | Also bundled in the same file swap, stated explicitly here per the plan's requirement to cover it even in the GREEN branch: this is not separately adjudicated, it ships as part of the same `agda-transport.ts` architecture that won the completion-signal-detection referee above. `resetInactivityTimer`/re-arm-on-each-response replaces the fixed-timeout semantics our pre-merge transport used.                                                                                                                                                                  | `test/unit/session/agda-transport.test.ts`'s upstream-authored `"inactivity watchdog keeps a steadily-progressing load alive past the timeout window"` test passes as-is, unmodified, in the same 19/19 full-suite run above.                                                                        |

## Codebase state after this plan

- `src/session/agda-transport.ts`, `src/session/command-completion.ts`,
  `src/agda/session-load-impl.ts` — upstream's candidate stands unchanged
  from Plan 10-01 (no further source edit was needed; the referee was GREEN).
- `src/session/load-terminus-tracker.ts` and its unit test remain deleted
  (Plan 10-01) — confirmed correct by this adjudication, not merely assumed.
- `test/unit/agda/session-load-impl.test.ts` — corrected in this plan
  (unconditionally, independent of the referee verdict, per Plan 10-01's own
  CLAUDE.md-forced return-based `loadIncompleteNoTerminus` shape): both
  truncation tests (`runLoad`, `runLoadNoMetas`) now assert a _returned_
  `load-incomplete-no-terminus` classification and a non-null
  `session.lastClassification` instead of `rejects.toThrow(...)`, and the
  pre-merge `"runLoad recovers dropped visible goal IDs via a metas re-query
when source has holes"` test — dropped by the auto-merge — is restored
  verbatim alongside upstream's own `"runLoadNoMetas accepts a clean strict
load reporting an empty goal state"` test (the two coexist; upstream's
  strict path, unlike the pre-merge D-02 asymmetry, now also awaits the
  terminus, so its "clean strict load" test needed no assertion changes).
- No hybrid state exists: the codebase runs exactly one load-terminus
  implementation (upstream's), with fatal-stderr and inactivity-watchdog
  hardening present as part of that same implementation, not grafted
  separately.

## Scope note

RT6 (five-state load conflation) and RT7 (timeout diagnostics) are
deliberately out of scope for this adjudication even though they touch the
same seam — see `.planning/REQUIREMENTS.md` Out of Scope and D-11
(`10-CONTEXT.md`). They are re-evaluated only after the whole Phase 10 merge
lands.
