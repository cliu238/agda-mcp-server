# Pitfalls Research

**Domain:** Reproducible agent dogfooding / self-improvement loop ("Loop ②") + regression harness around a stateful external Agda subprocess
**Researched:** 2026-07-01
**Confidence:** HIGH for domain-specific pitfalls (grounded in this repo's CONCERNS.md, issues #58/#61/#64/#65/#66, commit `e38f90a`); MEDIUM for the general dogfooding-loop / triage-graveyard failure modes (established engineering-process wisdom, not tool-specific).

This file is scoped to the *process* of building the loop, not to the Agda protocol internals themselves (those are already mapped in `.planning/codebase/CONCERNS.md`). Where a process pitfall is amplified by a known code fragility, the link is called out explicitly.

---

## Critical Pitfalls

### Pitfall 1: Non-reproducible captures — the report can't be replayed

**What goes wrong:**
A dogfooding session surfaces a real defect, `bug-report.ts` produces a bundle with a fingerprint, but nobody can later reproduce the failure from the bundle alone. The bug depended on ambient state that wasn't captured: the exact Agda version, `commandLineOptions`, `.agda-lib`/`.agdai` cache contents, working-directory layout, the *sequence* of prior commands in the long-lived session, and environment timing knobs (`AGDA_MCP_IDLE_COMPLETION_MS`, `AGDA_MCP_LOAD_TERMINUS_IDLE_MS`, `AGDA_MCP_COMMAND_TIMEOUT_MS`). The captured report becomes an anecdote, not a repro.

**Why it happens:**
The failure is a function of a *stateful* subprocess plus *heuristic* completion detection (idle timers), not a pure input→output pair. A single `agda_load` call's outcome depends on interfaces already resident in the running Agda process (see #64 transitive-staleness) and on wall-clock idle windows. Teams capture the final tool call and its output but not the session lineage or the environment that made timing land a particular way.

**How to avoid:**
- Make the capture bundle a **full replay manifest**, not a snapshot: pin `agda --version` output verbatim, the resolved project root, `.agda-mcp.json` merged config, all `AGDA_MCP_*` env overrides in effect, and the ordered list of prior commands in the session (the session's command log), not just the failing one.
- Record whether the failure required a *warm* session (prior loads) vs. reproduces from a cold start. #64-class bugs only reproduce warm.
- Store the actual source fixture(s) inline in the bundle (the repo already does this for `LargeDeepHole.agda` / `NamedHole.agda` / `NestedWhereHole.agda`), never a path reference to mutable on-disk files.
- Add a `agda-mcp replay <bundle>` path so a capture is proven reproducible *at capture time* — a bundle that can't self-replay is rejected, not queued.

**Warning signs:**
"Works on my machine / can't repro it now"; a queued report with no attached fixture; fingerprints that differ run-to-run for the same logical bug (timing leaking into the fingerprint); a fix that "makes it go away" but can't be demonstrated to have addressed the captured case.

**Phase to address:**
The capture phase (the phase that extends `bug-report.ts` into one-click capture). Reproducibility is the *definition of done* for capture — do not advance to the regression-test phase until captured bundles self-replay.

---

### Pitfall 2: Version drift makes captures and regression tests version-locked in disguise

**What goes wrong:**
A capture taken against Agda 2.9.0 encodes 2.9.0-specific response *ordering* (2.7–2.8 emit goal-state events before `Status`; 2.9.0 emits them after — CONCERNS.md / #58). A regression test asserting on that byte stream passes on the pinned version and fails spuriously on any other supported version (2.6.4.3–2.9.0), or worse, silently stops exercising the real defect. The harness looks green but only covers one point in a 5-version support window.

**Why it happens:**
Completion detection is a heuristic idle-timer with no protocol-guaranteed "done" tag; parsing branches on response *kind and order*. CI is pinned to 2.9.0 only (issue #41 blocked on `setup-agda@v2`), so cross-version variance is invisible until a version bump reintroduces a #65/#66-class bug.

**How to avoid:**
- Tag every capture and every regression fixture with the Agda version it was recorded against, and treat the assertion as "this behavior on this version," not "the behavior."
- Prefer asserting on the **normalized `ToolResult` envelope** (classification, goal IDs, diagnostic severity) rather than raw wire bytes or timing — the envelope is the stable contract; the wire order is not.
- Cross-check any parse-response change against `tooling/protocol/data/official-cross-version-notes.json` (the SSOT for cross-version ordering), as CONCERNS.md already mandates for `parse-load-responses.ts`.
- Design the harness so a future multi-version matrix (#41) can run the *same* fixtures across versions without rewrites — parameterize the version, don't fork the test.

**Warning signs:**
Tests that assert on raw JSON arrays in a fixed order; a fixture with no version annotation; a green suite while a version bump is pending; env-timer knobs baked into a test as literals.

**Phase to address:**
Regression-test phase. Establish the "assert on envelope, annotate the version" convention before writing the first regression test; leave a documented seam for the #41 matrix even though it's out of scope now.

---

### Pitfall 3: Timing/idle-completion nondeterminism captured as a "bug" (or masking one)

**What goes wrong:**
Two failure directions, both from the idle-timer completion heuristic. (a) A capture records a *transient* timeout/truncation — a compute gap during a large module's load looked like "done" (exactly the #65/#66 root cause) — and it gets filed as a logic bug, sending the fix queue chasing a phantom. (b) The opposite: a real trailing error/goal-state event is dropped because the idle window closed early, and the harness records a *clean* result, ossifying a false-green.

**Why it happens:**
`configuredIdleCompletionMs` (250ms), `configuredPostStatusIdleCompletionMs` (50ms), and `configuredGoalTerminusIdleMs` (2000ms) are wall-clock heuristics. On a loaded CI box or a network filesystem, the same command lands differently. The `AgdaTransport` shared-mutable-state cluster (#58) means a late event from a dying/previous command can also contaminate the capture.

**How to avoid:**
- Before filing, **re-run the capture N times** (e.g. 3–5) and classify: deterministic (same envelope every time) → real defect; flaky → tag as `timing/nondeterministic` and route to the transport/terminus track (#58), not the general fix queue.
- Where a command family has a documented terminal event, assert on the *terminus* (the `awaitGoalTerminus` mechanism: `InteractionPoints` + `AllGoalsWarnings`, or a `DisplayInfo` Error), not on elapsed idle — extend terminus tracking rather than tuning timers.
- Give the harness a "slow-environment" mode via the existing env knobs so a legitimately slow machine doesn't manufacture flaky captures.
- Never let wall-clock timing enter the bug fingerprint.

**Warning signs:**
A captured bug that only reproduces sometimes; fix-queue items described as "sometimes times out"; a regression test that flakes in CI but not locally; needing to bump an `AGDA_MCP_*_MS` value to make a test pass (that's a signal to switch to terminus-based assertion, not a fix).

**Phase to address:**
Capture phase (add the re-run/classify gate) and regression-test phase (terminus-based assertions). This pitfall is the single biggest reproducibility risk given the codebase's own history.

---

### Pitfall 4: Regression tests that ossify buggy behavior (golden-master trap)

**What goes wrong:**
The fastest way to "capture a failure as a regression test" is to snapshot the current output and assert it never changes. But if the captured output *is itself the bug* (e.g. an `ok-complete` that should have been an error, per #61/#64 false-green), the snapshot test now *locks the bug in* and will fail the day someone fixes it. The harness actively defends the defect.

**Why it happens:**
Golden/snapshot capture is mechanical and tempting for a "one-click" workflow. The distinction between "reproduce the defect" and "assert current output" is subtle and easy to collapse under time pressure — especially for false-green bugs where the wrong output *looks* successful.

**How to avoid:**
- A regression test must encode the **desired** behavior (xfail → fix → pass), not the observed-buggy behavior. Capture the defect as a **failing/xfail test first** (red), then the fix turns it green. This is the "capture → lock" contract done correctly.
- For false-green bugs specifically (#61/#64), the assertion must be "this file that a fresh `agda` rejects must NOT report `ok-complete`" — i.e. cross-check the interactive session's verdict against a from-scratch `agda` invocation as ground truth.
- Ban bare `toMatchSnapshot()` on tool output for defect regressions; require an explicit expected-value assertion tied to the bug's correct behavior.

**Warning signs:**
Regression tests authored green on first run (a real defect capture should start red); heavy use of snapshot files; a "fix" PR that has to *update* a snapshot to pass; a reviewer unable to state what correct behavior the test defends.

**Phase to address:**
Regression-test phase, with the convention set in the capture phase (capture must produce a *failing* test that the fix later flips). Bake "starts red" into the loop's definition of a valid regression case.

---

### Pitfall 5: Over-brittle regression tests (the mirror image)

**What goes wrong:**
Reacting to Pitfall 4/2, tests over-assert on incidental detail — exact diagnostic wording, full goal-context pretty-printing, byte-exact positions, timing — so they break on every benign Agda output tweak or refactor. The suite becomes high-maintenance noise, developers start `--skip`-ing or deleting tests, and real coverage erodes.

**Why it happens:**
It's hard to know which part of a captured envelope is the *essence* of the bug versus incidental. Auto-generated captures include everything, so tests assert on everything.

**How to avoid:**
- Assert on the **minimal invariant that defines the bug**: the classification (`ok-complete` vs `error`), presence/absence of a goal ID (#66's "hole with no goal ID" is exactly a presence assertion), a specific diagnostic *code/severity*, not its full prose.
- Normalize volatile fields (paths, timings, meta numbers) before asserting.
- Keep the raw bundle attached for forensic value, but the *test* asserts a narrow contract.

**Warning signs:**
Tests failing on Agda patch bumps that changed only wording; frequent "just update the expected string" commits; assertions spanning dozens of lines of pretty-printed context.

**Phase to address:**
Regression-test phase — define the "assert the invariant, normalize the rest" rubric alongside Pitfall 4's "starts red" rule; they're two halves of the same convention.

---

### Pitfall 6: Triage/fix queue becomes a write-only graveyard

**What goes wrong:**
Capture is frictionless, so hundreds of reports pour in, but nothing pulls from the queue. Duplicates aren't merged (many files sharing one root-cause failure — the "30-file survey" cascade problem in CONCERNS.md's missing `agda_bulk_status`), stale items rot, and the queue's signal-to-noise collapses. The loop's "surface → capture" half runs a thousand times while "fix → lock" runs twice.

**Why it happens:**
Capture is automatable and satisfying; triage and fixing are human, slow, and unglamorous. Without dedup (fingerprints exist but cascade-clustering doesn't yet) and without a WIP limit, intake outpaces throughput. This is the classic bug-tracker-bankruptcy failure mode, amplified because an *agent* can generate reports far faster than a human maintainer fixes them.

**How to avoid:**
- Use the existing fingerprints for **dedup on capture** — increment a count on the existing item rather than creating a new one; surface "top N by frequency."
- Impose a **WIP limit / pull-based** discipline: cap open items; capture is allowed to *merge into* or *bump* existing items but the loop's health metric is throughput (items closed with a locked regression test), not intake.
- Make "close" mean "fixed + regression test green," so the queue length directly measures unhardened surface area.
- Since fuel is organic and agent-driven, expect high-volume near-duplicates; cascade clustering (dedup by shared root-cause failure) is the antidote — even a manual clustering step in v1.

**Warning signs:**
Queue length monotonically increasing; same defect filed under many fingerprints; items older than the milestone with no owner; more time spent reading the queue than fixing from it; agents happily filing but no throughput metric tracked.

**Phase to address:**
The triage/fix-queue phase. Design the queue with dedup + WIP limit + a throughput (close-rate) metric from day one; don't ship a capture firehose before the queue has backpressure.

---

### Pitfall 7: Over-automation before the manual loop is proven

**What goes wrong:**
Building auto-capture, auto-classification, auto-regression-generation, or (worse) auto-PR before a human has manually run the full loop enough times to know what a *good* capture, a *good* triage decision, and a *good* regression test look like. The automation then encodes wrong heuristics at scale — auto-filing flaky timing captures (Pitfall 3), auto-generating golden-master tests that ossify bugs (Pitfall 4), auto-clustering wrong.

**Why it happens:**
Automation is the exciting part and the stated north-star. But the loop's judgment calls (real defect vs. flake, essence vs. incidental, duplicate vs. distinct) are exactly what you don't yet have calibrated data for on a brand-new loop.

**How to avoid:**
- v1 is explicitly the **reproducible manual scaffold** (PROJECT.md already scopes this) — honor it. Run the loop by hand end-to-end on real proofs enough times that the *format* of captures/tests/queue entries stabilizes.
- Keep a human in the loop at each transition (capture → keep?, triage → which bucket?, test → does it start red and assert the invariant?) and *record those decisions*; they become the spec for future automation, not before.
- Treat each automation step as earned only after the manual step it replaces has a documented, stable rubric.

**Warning signs:**
Wanting to write a classifier before ~10 real manual triages exist; auto-generated tests nobody reviews; the phrase "we'll just automate this" applied to a step done manually zero times; automation code volume exceeding the manual-loop usage that justifies it.

**Phase to address:**
This is a *roadmap ordering* pitfall, not a single phase — enforce it in phase sequencing: capture → manual triage → manual regression authoring → (only then, and mostly v2+) automation. Success criteria for the manual phases must include "rubric documented" so automation has a spec.

---

### Pitfall 8: Scope creep into knowledge accumulation / auto-PR (out-of-scope pull)

**What goes wrong:**
The loop naturally invites "while we're capturing sessions, let's build a learned corpus / pattern memory" or "let's auto-open the PR that fixes it." Both are explicitly v2+ (PROJECT.md Out of Scope). Starting them now means the reproducible-scaffold core ships late or half-built, and the accumulation/auto-PR systems get built on an unproven capture format that will churn.

**Why it happens:**
The compounding-value framing makes accumulation feel like the point, and auto-PR feels like the obvious next automation. Both are downstream of a *stable, trustworthy* capture+test format that v1 exists to establish.

**How to avoid:**
- Hold the line on PROJECT.md's Out of Scope list. v1 stops at "use → surface → capture → fix → lock → repeat" working reliably *by hand*.
- Design capture bundles to be *forward-compatible* with a future corpus (structured, fingerprinted, self-contained) so v2 accumulation is additive — but build no accumulation logic now.
- Explicitly gate auto-PR behind "the manual fix→lock cycle is boringly repeatable," which requires the scaffold to exist first (also stated in PROJECT.md rationale).

**Warning signs:**
Design docs referencing a "sessions database" or "pattern store" in v1; PRs adding schema for learned data; anyone building auto-PR before a human has manually closed several loop cycles; v1 slipping while v2 features grow.

**Phase to address:**
Roadmap scoping / milestone boundary. Every phase's success criteria should be checkable *without* knowledge accumulation or auto-PR; if a criterion needs them, it belongs in v2.

---

### Pitfall 9: Trusting `ok-complete` as ground truth for the loop itself

**What goes wrong:**
The loop's own tooling (e.g. "did our fix work?") trusts the interactive session's `ok-complete` classification. But #64/#61 document that a warm session can report `ok-complete` for code a fresh `agda` rejects (transitive `.agdai` staleness; unescalated warnings). A regression test that reloads in the *same* warm session to "verify the fix" can therefore report false-green — the loop validates itself against a compromised oracle.

**Why it happens:**
`.agdai` cache staleness is not consulted by the load/typecheck path (CONCERNS.md); `forceRecompile` busts only the named file, not transitive deps; warnings aren't escalated unless `--warning=error` is passed. It's the "single most dangerous class of bug for a verification tool."

**How to avoid:**
- Regression tests that assert "this now type-checks" or "this correctly errors" must use a **cold/from-scratch `agda` invocation as the oracle**, or at minimum a fresh session, not a warm long-lived one — especially for any test touching dependency edits.
- Where CI runs `-Werror`, default the loop's verification to `commandLineOptions: ["--warning=error"]` so warning-class false-greens surface.
- Add the missing transitive-staleness fixture (dependency + consumer, dep edited mid-session) — CONCERNS.md flags this as the highest-priority coverage gap and it's directly a loop-correctness concern.

**Warning signs:**
A fix "verified" only by warm-session reload; regression tests that never spawn a fresh Agda; passing tests for a bug whose whole nature is false-green; no fixture exercising transitive staleness.

**Phase to address:**
Regression-test phase and capture phase — the oracle choice (cold vs warm) is a core convention, and the transitive-staleness fixture should be an early regression case since it's both a known bug and a loop-integrity risk.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Snapshot/golden-master the current tool output as the regression test | One-click capture→test | Ossifies buggy output (esp. false-green #61/#64); breaks on benign changes | Never for defect regressions; OK only for genuinely-correct outputs as characterization tests, clearly labeled |
| Assert on raw wire JSON / response order | Directly reflects what was captured | Version-locked to 2.9.0 ordering (#58); brittle across 2.6.4.3–2.9.0 | Never — assert on the `ToolResult` envelope instead |
| Bump an `AGDA_MCP_*_MS` timer to make a flaky test pass | Test goes green now | Hides the completion-heuristic problem; regresses on other machines/versions | Only as a documented slow-environment override, never as a "fix" for a captured bug |
| Verify fixes via the warm long-lived session | Fast, no respawn | Validates against a compromised oracle (#64 false-green) | Only for bugs provably unrelated to cache/session state; prefer cold `agda` |
| Capture without a full replay manifest | Faster capture | Non-reproducible reports; graveyard fodder | Never — reproducibility is capture's definition of done |
| Let capture create a new queue item every time | Simple intake | Duplicate flood, write-only graveyard | Only with fingerprint dedup that bumps existing items |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `agda` CLI subprocess (stateful, long-lived) | Treating a tool call as a pure input→output for repro | Capture full session lineage (prior commands, warm/cold, version, config, env timers) |
| `agda --interaction-json` protocol | Assuming a fixed response order / a "done" tag | Assert on documented terminus events; cross-check `official-cross-version-notes.json`; no per-response completion tag exists |
| `.agdai` interface cache | Assuming `ok-complete` reflects on-disk source | Cross-check with cold `agda`; walk import graph for transitive staleness (#64) |
| Dogfooding agents (Codex, Claude Code) | Letting agents file reports faster than humans triage | Fingerprint dedup + WIP-limited pull queue; throughput metric, not intake |
| CI (pinned Agda 2.9.0 only) | Believing green CI covers 2.6.4.3–2.9.0 | Version-annotate fixtures; design for the #41 multi-version matrix seam |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Global idle-timer bump to fix one slow load | Whole integration matrix slows (~2000ms/step, 69s total per the #65/#66 fix note) | Scope longer waits to the specific command family via terminus tracking | As soon as any timer is raised matrix-wide instead of per-path |
| `reconcileGoalsViaMetas` extra round-trip on every clean load | Second send/receive on the common path | Skip when the load already carried a complete goal-ID set | Large modules, high call frequency |
| Re-running captures N times for flake detection | Slower capture step | Gate N-reruns to the classify decision, not every capture; run in parallel | Only if capture volume is very high |
| Cold-`agda` oracle for every regression assertion | Slow test suite | Reserve cold spawn for cache/session-sensitive bugs; warm is fine for pure-parse bugs | Large regression suites run per-commit |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| New capture/replay code adds its own file read/write path | TOCTOU symlink race, path escape, OOM on huge files | Reuse `src/session/safe-source-io.ts` (`O_NOFOLLOW`, 512 KiB cap, atomic rename) — never a parallel ad-hoc path |
| Storing captured fixtures from untrusted proof projects unsandboxed | Path escape when replaying; walking above repo root | Keep the `findAgdaProjectRoot` repo-root sandbox boundary for replayed bundles |
| Assuming stderr classification catches all fatal cases | Fatal Agda stderr not matching the 3 regexes passes through as non-fatal | Revisit `throwOnFatalProtocolStderr` patterns when pinning new Agda versions |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Capture requires many manual fields | Friction kills the loop; captures don't happen | Near-one-click on top of `bug-report.ts`; auto-fill lineage/version/config |
| Fix queue shows raw dumps, no dedup/frequency | Maintainer can't see what matters | Cluster by fingerprint, show top-by-frequency, one-line summaries |
| Regression failures give opaque byte diffs | Hard to tell real regression from noise | Assert named invariants with human-readable failure messages |
| No signal that a bug was a flake vs. real | Wasted triage on phantoms | Tag `timing/nondeterministic` from the N-rerun classify step |

## "Looks Done But Isn't" Checklist

- [ ] **Capture bundle:** Often missing the *session lineage* and *env timers* — verify a captured bundle self-replays from cold on a different machine
- [ ] **Regression test:** Often starts green (ossifying a bug) — verify it started RED before the fix and asserts the *correct* behavior
- [ ] **Fix verification:** Often uses the warm session — verify cache/dependency-sensitive fixes are checked against a cold `agda` invocation
- [ ] **Cross-version:** Often only tried on 2.9.0 — verify the fixture is version-annotated and the assertion is on the envelope, not wire order
- [ ] **Triage queue:** Often has intake but no throughput — verify dedup works and a close-rate metric exists
- [ ] **Flake classification:** Often skipped — verify captures were re-run N times before filing as a logic bug
- [ ] **Scope:** Often creeping — verify no phase criterion secretly requires knowledge accumulation or auto-PR (v2+)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Non-reproducible captures already filed | MEDIUM | Add replay-manifest fields; mark legacy captures "unverified"; re-capture live ones; reject non-self-replaying bundles going forward |
| Golden-master tests ossified a bug | MEDIUM | Convert to invariant assertions; for false-green cases add cold-`agda` oracle; delete pure snapshots for defect regressions |
| Triage graveyard formed | HIGH | Declare bug-bankruptcy on stale items; retro-cluster by fingerprint; impose WIP limit + close-rate metric before reopening intake |
| Over-automation encoded wrong heuristics | HIGH | Freeze automation; re-derive rubric from manual runs; rebuild the automated step against the documented rubric |
| Version-locked regression suite | MEDIUM | Re-express assertions on the envelope; annotate versions; leave the #41 matrix seam |
| Warm-session false-green in the harness | MEDIUM–HIGH | Switch affected verifications to cold `agda`; add the transitive-staleness fixture; default `-Werror` where CI does |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Non-reproducible captures | Capture phase | Captured bundle self-replays from cold on a second machine |
| 2. Version drift / version-locked tests | Regression-test phase | Fixtures version-annotated; assertions on envelope; #41 seam documented |
| 3. Timing/idle nondeterminism | Capture + regression phases | N-rerun classify gate exists; terminus-based assertions used |
| 4. Ossifying buggy behavior | Regression-test phase | Every defect regression started RED; no bare snapshots |
| 5. Over-brittle tests | Regression-test phase | Assertions target the minimal invariant; volatile fields normalized |
| 6. Triage graveyard | Triage/fix-queue phase | Dedup bumps existing items; WIP limit + close-rate metric tracked |
| 7. Over-automation too early | Roadmap ordering | Manual-loop rubric documented before any automation phase |
| 8. Scope creep (accumulation/auto-PR) | Roadmap scoping / milestone boundary | No phase criterion requires v2+ features |
| 9. `ok-complete` false-green oracle | Capture + regression phases | Cache-sensitive fixes verified against cold `agda`; transitive-staleness fixture exists |

## Sources

- `.planning/PROJECT.md` — milestone scope, Out of Scope list, key decisions (HIGH)
- `.planning/codebase/CONCERNS.md` — `AgdaTransport` shared-state cluster (#58), idle-timer completion heuristic, false-green #64/#61, load-classification fragility #65/#66, cross-version ordering, test-coverage gaps (HIGH)
- Repo issues/commits referenced in CONCERNS.md: #39, #41, #58, #61, #64, #65, #66; commit `e38f90a` (HIGH)
- `tooling/protocol/data/official-cross-version-notes.json` — cross-version response-ordering SSOT (referenced, HIGH)
- General engineering-process wisdom on golden-master/characterization-test ossification, bug-tracker bankruptcy / write-only queues, and WIP-limited pull systems (MEDIUM — established practice, not tool-specific)

---
*Pitfalls research for: reproducible agent dogfooding loop + regression harness around a stateful Agda subprocess*
*Researched: 2026-07-01*
