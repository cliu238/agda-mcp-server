---
phase: 09-residual-v1-0-debt-sweep
plan: 06
subsystem: testing
tags: [typescript, tsc, ci-gate, vitest, mock-typing, technical-debt, decision-records]

# Dependency graph
requires:
  - phase: 09-residual-v1-0-debt-sweep
    provides: "Plans 09-01 through 09-05's tsc-clean fixes across the rest of the repo (this plan's Task 2 re-verifies the whole repo is clean once those land)"
provides:
  - "test/unit/session/agda-transport.test.ts compiles cleanly under tsconfig.test.json (all 13 mock-shape type errors resolved, type-only diff)"
  - "npx tsc -p tsconfig.test.json --noEmit exits 0 across the entire repository"
  - "Permanent typecheck:test npm script + CI step in the verify job's fast-fail position (before audit/build/pack)"
  - "D-09/DEBT-07 deferral recorded in PROJECT.md Key Decisions (map-codebase refresh left to the orchestrator)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Omit<Partial<NodeBuiltin>, 'conflictingKey'> & { conflictingKey: LooserShape } for typing minimal Node builtin mocks (ChildProcess) whose own overloaded members (Writable.write, EventEmitter.once) a lightweight test double can never fully satisfy structurally"
    - "Explicit (...args: any[]): any signatures on both the declared mock type AND the object-literal method implementation itself (not just the header) -- TypeScript infers a method's own return type from its body regardless of the surrounding contextual/declared type"

key-files:
  created: []
  modified:
    - test/unit/session/agda-transport.test.ts
    - package.json
    - .github/workflows/ci.yml
    - .planning/PROJECT.md

key-decisions:
  - "Used Omit<Partial<ChildProcess>, \"stdin\" | \"once\"> intersected with each mock's own loose stdin/once shapes, rather than a bare Partial<ChildProcess> & {...} intersection, because Partial<ChildProcess> alone forces full Writable/EventEmitter-overload structural conformance on those two properties regardless of what the custom type declares"
  - "Added the loosened (...args: any[]): any signature to the write() method literals themselves, not just the header type -- a method's inferred return type comes from its own body/signature, not the surrounding declared type, so the header-only fix left the literals returning void against Writable's required boolean"
  - "Cast closeListener back to its own declared type at its one call-site read (line 547) to work around a TypeScript control-flow-analysis limitation: the only reassignment happens inside the once() closure, which CFA does not track across function boundaries, so the read otherwise narrows to literal null and the optional call becomes uncallable (never)"
  - "typecheck:test CI step placed in the existing verify job (not a new parallel job), positioned right after \"Install dependencies\" and before \"Audit dependencies\" so a type regression fails fast"
  - "D-09/DEBT-07 (.planning/codebase/ map refresh) recorded as deferred to the orchestrator's /gsd:map-codebase run in PROJECT.md's Key Decisions table; not executed by this plan"

patterns-established:
  - "Omit-then-intersect pattern for typing minimal ChildProcess-shaped mocks in transport-layer tests"

requirements-completed: [DEBT-06, DEBT-07]

# Metrics
duration: 20min
completed: 2026-07-04
---

# Phase 9 Plan 6: agda-transport.test.ts tsc fix, full-repo tsc gate, DEBT-07 deferral Summary

**Closed the final 13 tsc errors (all in one file's fake-ChildProcess mocks) with a type-only diff, confirmed `npx tsc -p tsconfig.test.json --noEmit` exits 0 across the whole repository, wired a permanent `typecheck:test` CI step into the verify job, and recorded DEBT-07's map-codebase refresh as an explicit orchestrator-level deferral in PROJECT.md.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-04T20:22:00Z
- **Completed:** 2026-07-04T20:41:18Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- Resolved all 13 tsc errors in `test/unit/session/agda-transport.test.ts` (6 fake-`ChildProcess` mock object literals across 6 tests) with a strictly type-only diff -- confirmed by manual diff review (no changed string/numeric literals or body statements outside type-annotation positions)
- `npx vitest run test/unit/session/agda-transport.test.ts` reports the identical 19 passed / 0 failed both before and after the fix
- `npx tsc -p tsconfig.test.json --noEmit` exits 0 across the entire repository (re-verified fresh, not just for this file, catching any post-planning drift -- none found)
- Added the `typecheck:test` npm script and a "Typecheck tests" CI step in `.github/workflows/ci.yml`'s `verify` job, positioned after "Install dependencies" and before "Audit dependencies" for fast-fail
- `npm test` (1803 tests passed, 178 skipped, 0 failed) and `npm run build` both pass with zero regressions
- D-09/DEBT-07 deferral recorded in `PROJECT.md`'s Key Decisions table

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix agda-transport.test.ts's remaining mock-shape type errors (type-only, zero runtime change)** - `00a052c` (fix)
2. **Task 2: Full tsc-clean verification, permanent CI gate, and DEBT-07 deferral** - `689b3aa` (feat)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified
- `test/unit/session/agda-transport.test.ts` - loosened `stdin.write`/`once` mock type annotations (both the declared header and the literal method signatures) across 6 fake-`ChildProcess` objects; excluded `stdin`/`once` from the `Partial<ChildProcess>` side of each intersection via `Omit`; cast `closeListener` back to its declared type at its one call site
- `package.json` - added `"typecheck:test": "tsc -p tsconfig.test.json --noEmit"` script, placed near `"build"`
- `.github/workflows/ci.yml` - added a "Typecheck tests" step to the `verify` job, running `npm run typecheck:test` between "Install dependencies" and "Audit dependencies"
- `.planning/PROJECT.md` - appended the D-09/DEBT-07 deferral row to the Key Decisions table

## Decisions Made
- `Omit<Partial<ChildProcess>, "stdin" | "once"> & { stdin: {...}; once(...): ...; kill(...): ... }` replaces the bare `Partial<ChildProcess> & {...}` intersection in all 6 mock declarations. Rationale: `Partial<ChildProcess>`'s own `stdin?: Writable | null` and `once` (EventEmitter's overloaded signatures) apply independently of any custom type intersected alongside them -- loosening only the custom type's own declared shape does not exempt the literal from also having to satisfy `Writable`'s full ~38-property surface and boolean-returning `write` overloads. Excluding the two conflicting keys before intersecting makes the custom loose shapes the sole authority for those two properties.
- The `write()` method literals themselves were given the explicit `(...args: any[]): any` signature (not just the type header), because a method's own inferred return type comes from its body/signature, independent of the surrounding declared/contextual type -- the header-only version still left the literal returning `void`, incompatible with `Writable.write`'s required `boolean` return.
- `closeListener?.()` (used once, at the end of the "does NOT terminate a proc that exits cleanly" test) required an explicit `as (() => void) | null` cast at the read site. This is a genuine TypeScript control-flow-analysis limitation, empirically isolated in a minimal repro during this plan's execution: a `let` variable's reassignment inside a nested closure (here, the `once()` mock method) is invisible to the outer scope's narrowing, so a bare read after the closure narrows to the literal initializer value (`null`), collapsing the call to `never`. This is unrelated to the mock-shape loosening and pre-existed in the original 13-error baseline; it needed its own independent, still type-only fix (the plan's own Task 1 action text anticipated this exact possibility: "re-run tsc ... to see if it resolves as a side effect before treating it as independent" -- it did not resolve as a side effect after any of the mock-shape fixes, so it was fixed independently per that same instruction).
- DEBT-07's `.planning/codebase/` refresh via `/gsd:map-codebase` was NOT run by this plan -- per the phase context (D-09) and this plan's explicit instructions, that refresh is an orchestrator-level workflow (spawns dedicated STACK/ARCHITECTURE/CONVENTIONS/etc. mapping subagents outside a single execute-phase task's scope) and is deferred to the phase orchestrator/user to invoke after all of Phase 9's plans are merged, so it captures a final, non-immediately-stale snapshot. The deferral itself is recorded in PROJECT.md's Key Decisions table (this plan's scope), not just in this SUMMARY.

## Deviations from Plan

None - plan executed as written. Two non-obvious implementation techniques (the `Omit`-based intersection and the literal-level `write()` signature) were required to actually achieve what the plan's `<interfaces>` section described ("loosen ONLY its inline structural type annotation ... to accept variadic, loosely-typed signatures") -- these are documented above under Decisions Made and in Issues Encountered below, since they were problem-solving within Task 1's existing scope, not unplanned additions.

## Issues Encountered

- **`Writable`/`EventEmitter` full-structural-conformance surprise:** loosening only the custom intersection member's declared type (e.g. `stdin: { write(...args: any[]): any }`) was insufficient -- `Partial<ChildProcess>`'s own `stdin?: Writable | null` requirement applies independently via the intersection, and a value must satisfy each intersected type separately. First iteration (header-only loosening) left 7 of the 13 errors in place; second iteration (also loosening the literal method signatures) turned those into a *different* error (missing ~38 `Writable` instance properties) because a plain object literal can never structurally satisfy the full `Writable` class shape. Resolved by excluding `stdin`/`once` from the `Partial<ChildProcess>` side via `Omit` before intersecting, so only the custom loose shapes govern those two properties. Each iteration was verified against a fresh `npx tsc -p tsconfig.test.json --noEmit` run before proceeding to the next, per the plan's own "re-run tsc after each block's fix" guidance.
- **Line 547 `TS2349` (`closeListener?.()`) was not a knock-on effect:** the plan flagged this as "very likely" a side effect of the other mock-shape fixes and instructed investigating it last. It was investigated last, after all `once`/`stdin` fixes landed, and did not resolve. Isolated via a minimal standalone repro (outside the actual test file, in the scratch directory) down to a pure TypeScript control-flow-analysis limitation unrelated to the mock shapes: reassigning a `let` variable inside a nested closure is invisible to the outer scope's flow-based narrowing, so a later bare read narrows to the literal initializer (`null`) and collapses to `never` on a call. Confirmed with a battery of isolated repros (with/without closures, `null` vs `undefined`, conditional vs unconditional reassignment) that direct outer-scope reassignment avoids the issue but closure-only reassignment always triggers it, regardless of any of this plan's other changes. Fixed with a single explicit type-assertion cast back to the variable's own declared type at the read site, with an inline comment explaining why.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 9 (Residual v1.0 Debt Sweep) close-out: this was the phase finale plan. `npx tsc -p tsconfig.test.json --noEmit` is now permanently enforced in CI for every future push/PR, closing the gap that let the type-debt drift from 2 error families to 68 errors across 16 files in the first place (D-02/D-03).
- DEBT-07's `.planning/codebase/` refresh remains outstanding and is explicitly NOT done by this plan -- the orchestrator (or user) should invoke `/gsd:map-codebase` after all Phase 9 plans (09-01 through 09-06) are merged, per the D-09 decision recorded in PROJECT.md.
- No blockers for phase completion from this plan's scope.

---
*Phase: 09-residual-v1-0-debt-sweep*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: test/unit/session/agda-transport.test.ts
- FOUND: package.json
- FOUND: .github/workflows/ci.yml
- FOUND: .planning/PROJECT.md
- FOUND: .planning/phases/09-residual-v1-0-debt-sweep/09-06-SUMMARY.md
- FOUND: commit 00a052c (Task 1)
- FOUND: commit 689b3aa (Task 2)
- FOUND: "typecheck:test" in package.json
- FOUND: "Typecheck tests" in .github/workflows/ci.yml
- FOUND: "DEBT-07" row in .planning/PROJECT.md
