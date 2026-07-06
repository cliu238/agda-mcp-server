# Phase 12 Plan 05: C-01 Regression-Lock Exclusion List + RT6/RT7 Verdicts

**Produced:** 2026-07-06
**Status:** Read-only audit artifact — no `test/`, `src/`, or `fix-queue.json` file was modified while producing this document.

This document is the single foundational precondition every other Phase 12 plan
depends on for its own C-01 ("no simplification may delete or weaken any
from-RED regression-locked test") safety check, and the definitive D-04
re-evaluation verdict for RT6 and RT7. It has two independent parts:

1. **Regression-Lock Exclusion List** — every test file/test-case the phase's
   cuts must never delete or weaken, built from a full manual read of every
   `locked`-status `test/fixtures/fix-queue.json` entry's `notes` field plus
   both `test/fixtures/capture-regression-matrix.json` entries (not the matrix
   file alone — RESEARCH.md Pitfall 5 confirms the matrix under-counts).
2. **RT6 / RT7 Verdicts** — independent, HEAD-grounded, definitive re-evaluation
   verdicts per D-04. Implementation is explicitly out of scope for both.

---

## Regression-Lock Exclusion List

### Methodology

Both phrasings the fix-queue uses for a regression lock were searched:
**"Regression lock:"** (used in 8 of the 10 locked entries) and
**"Regression evidence:"** (used in fingerprint `0bc76d15c2fec8df`, the one
entry that phrases it differently). The RESEARCH.md Code Examples Python
regex snippet was run verbatim, extended to match both phrasings, against the
live `test/fixtures/fix-queue.json`. Independently of the regex, **every one
of the 10 locked entries' full `notes` field was read end-to-end in this
session, in full, not sampled** — this caught one entry (`e6f0c1169032b9d5`)
whose lock is matrix-driven prose ("Backfilled: matches
capture-regression-matrix.json's ...") rather than a `Regression lock:`/
`Regression evidence:` line, and one under-count in `0bc76d15c2fec8df`'s own
paraphrase (see Flagged Discrepancy below) that the regex alone would have
missed entirely.

Every extracted test file path was existence-checked directly (`test -f`)
against the real test tree — see the per-file "Existence check" line in each
Detail entry below. Beyond file existence, every individually quoted
vitest test-case string was **also** verified byte-for-byte present via
`grep -F` against its file's current contents, so this list does not merely
trust the fix-queue's prose to still be accurate.

### Locked-entry count (re-confirmed live, not assumed)

A fresh read of `test/fixtures/fix-queue.json` in this session confirms
**exactly 10 entries with `"status": "locked"`**, matching the plan's
planning-time count with no drift:

`e6f0c1169032b9d5`, `5abecc959e43fef3`, `bfcba437f5426fd6`,
`eb7439cb3ed9d6b9`, `fdc90bfde12fb938`, `e5f6de1fa365b887`,
`eaea6321183bdf7b`, `004d161b839ce725`, `3306edf4c2d01c53`,
`0bc76d15c2fec8df`.

`test/fixtures/capture-regression-matrix.json` contains exactly **2** entries,
both `"status": "locked"`: `issue-64-61-transitive-staleness` and
`guard-no-metas-clean-load-under-fault-injection`. Both map to fix-queue
fingerprint `e6f0c1169032b9d5`'s "Backfilled" note.

**Total exclusion-list rows: 12** (10 locked fix-queue entries + 2 matrix
entries) — matching the acceptance criteria exactly.

### Summary Table

| # | ID | Kind | Status | File(s) | Test-lock count | Existence check |
|---|----|------|--------|---------|------------------|------------------|
| 1 | `e6f0c1169032b9d5` | fix-queue (flagship) | locked | (matrix-driven — see rows 11–12) | 0 own; 2 via matrix | N/A — lock lives in the matrix rows |
| 2 | `5abecc959e43fef3` | fix-queue | locked | `test/unit/agda/agent-ux.test.ts`, `test/unit/tools/goal-tools-give.test.ts` | 4 | FOUND, all 4 strings verbatim-verified |
| 3 | `bfcba437f5426fd6` | fix-queue | locked | `test/unit/agda/goal-operations-give.test.ts`, `test/unit/tools/goal-tools-give.test.ts` | 2 | FOUND, both strings verbatim-verified |
| 4 | `eb7439cb3ed9d6b9` | fix-queue | locked | `test/unit/tools/file-tools.test.ts` | 2 | FOUND, both strings verbatim-verified |
| 5 | `fdc90bfde12fb938` | fix-queue | locked | `test/unit/tools/analysis-tools.test.ts` | 1 | FOUND, string verbatim-verified |
| 6 | `e5f6de1fa365b887` (RT2) | fix-queue | locked | `test/unit/agda/expression-operations.test.ts` | 4 | FOUND, all 4 strings verbatim-verified |
| 7 | `eaea6321183bdf7b` (RT3) | fix-queue | locked | `test/unit/agda/goal-operations-context-check.test.ts` | 2 | FOUND, both strings verbatim-verified |
| 8 | `004d161b839ce725` (RT4) | fix-queue | locked | `test/unit/agda/agent-ux.test.ts`, `test/unit/tools/goal-tools-give.test.ts` | 4 (== row 2, shared) | FOUND (identical set to row 2) |
| 9 | `3306edf4c2d01c53` (RT8) | fix-queue | locked | `test/unit/session/register-agda-load-no-metas.test.ts` | 1 | FOUND, string verbatim-verified |
| 10 | `0bc76d15c2fec8df` | fix-queue | locked | `test/unit/tools/dogfood-run-report-checkpoint.test.ts`, `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts` | **8 actual** (notes describe only 6 — see Flagged Discrepancy) | FOUND — both files exist; every actual `test()`/`testPosix()` in both enumerated by direct read |
| 11 | `issue-64-61-transitive-staleness` | matrix (→ `e6f0c1169032b9d5`) | locked | `test/integration/mcp/capture-regression.test.ts` | 1 | FOUND, generated test name verified against the file's own template literal |
| 12 | `guard-no-metas-clean-load-under-fault-injection` | matrix (→ `e6f0c1169032b9d5`) | locked | `test/integration/mcp/capture-regression.test.ts` | 1 | FOUND, generated test name verified against the file's own template literal |

### Detail

#### 1. `e6f0c1169032b9d5` — flagship #64/#61 transitive-staleness

- **Notes-cited lock:** none in its own `notes` field beyond: *"Backfilled:
  matches capture-regression-matrix.json's issue-64-61-transitive-staleness
  entry (status locked by Phase 3.1)."* No `Regression lock:`/`Regression
  evidence:` line — this entry's lock mechanism **is** the matrix, not a
  hand-named vitest test. Its two matrix rows (11, 12 below) carry the actual
  runnable test names.
- **Existence check:** N/A directly (see rows 11–12).
- **Proves:** a dependency file's on-disk change while its dependent is
  already loaded is detected as a real failure on the next
  `agda_load_no_metas`/`agda_load` call, never reported as a false
  "ok-complete" (the flagship #64/#61 transitive-staleness false-green Phase
  3.1 fixed).

#### 2. `5abecc959e43fef3` — `agda_auto` CLI-flag-injection guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a flag-shaped hints token instead of injecting it into the payload`
  - `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a flag-shaped excludeHints token instead of injecting it into the payload`
  - `test/unit/agda/agent-ux.test.ts` :: `buildAutoSearchPayload > rejects a hint token containing whitespace (would split into a second Agsy token)`
  - `test/unit/tools/goal-tools-give.test.ts` :: `agda_auto rejects a flag-shaped hint before calling session.goal.autoOne`
- **Existence check:** FOUND — both files exist (`test -f`); all 4 quoted
  strings verified byte-for-byte present via `grep -F`.
- **Proves:** `agda_auto`'s `hints`/`excludeHints` are rejected before
  reaching the Agsy CLI payload if they look like a flag or contain
  whitespace, so a flag-shaped hint can never be silently executed as an
  injected Agsy flag.

#### 3. `bfcba437f5426fd6` — `agda_give` ok-wrapping-a-rejection guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/goal-operations-give.test.ts` :: `give() marks an Agda rejection (Error DisplayInfo, no GiveAction) as rejected`
  - `test/unit/tools/goal-tools-give.test.ts` :: `agda_give surfaces a rejected expression as ok:false / give-rejected`
- **Existence check:** FOUND — both files exist; both strings verified
  byte-for-byte present.
- **Proves:** an Agda-rejected `agda_give` expression surfaces as
  `ok:false`/`give-rejected`, never as a false `ok:true` wrapping the
  rejection text.

#### 4. `eb7439cb3ed9d6b9` — `agda_search_definitions` src/-layout guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/tools/file-tools.test.ts` :: `agda_search_definitions searches a caller-supplied directory for src/-layout projects`
  - `test/unit/tools/file-tools.test.ts` :: `agda_search_definitions rejects a directory parameter that escapes the project root`
- **Existence check:** FOUND — file exists; both strings verified
  byte-for-byte present.
- **Proves:** `agda_search_definitions` can search a caller-supplied
  `directory` (for `src/`-layout projects) and still rejects one that
  escapes the project root.

#### 5. `fdc90bfde12fb938` — `agda_proof_status` mislabel guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/tools/analysis-tools.test.ts` :: `agda_proof_status reports NOT confirmed complete when goals are empty but constraints remain`
- **Existence check:** FOUND — file exists; string verified byte-for-byte
  present.
- **Proves:** `agda_proof_status`'s prose summary never claims "All goals
  solved" when `constraintsText` still holds a real error.

#### 6. `e5f6de1fa365b887` (RT2) — compute/infer throw-on-Error-DisplayInfo guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/expression-operations.test.ts` :: `computeTopLevel throws instead of returning ok on an Error DisplayInfo (NotInScope)`
  - `test/unit/agda/expression-operations.test.ts` :: `inferTopLevel throws instead of returning ok on an Error DisplayInfo (NotInScope)`
  - `test/unit/agda/expression-operations.test.ts` :: `compute() (goal-scoped) throws instead of returning ok on an Error DisplayInfo (NotInScope)`
  - `test/unit/agda/expression-operations.test.ts` :: `infer() (goal-scoped) throws instead of returning ok on an Error DisplayInfo (NotInScope)`
- **Existence check:** FOUND — file exists; all 4 strings verified
  byte-for-byte present.
- **Proves:** both the top-level and goal-scoped `compute`/`infer`
  operations throw (never silently return an `ok:true` envelope) when Agda
  reports a `NotInScope`-class `Error` `DisplayInfo`.

#### 7. `eaea6321183bdf7b` (RT3) — `goalTypeContextCheck` throw guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/agda/goal-operations-context-check.test.ts` :: `goalTypeContextCheck throws on a NotInScope Error DisplayInfo instead of embedding it in goalType`
  - `test/unit/agda/goal-operations-context-check.test.ts` :: `goalTypeContextCheck throws on a genuinely ill-typed (UnequalTerms) Error DisplayInfo`
- **Existence check:** FOUND — file exists; both strings verified
  byte-for-byte present.
- **Proves:** `goalTypeContextCheck` throws on any `Error DisplayInfo`
  (NotInScope or a genuine type mismatch) instead of embedding the raw error
  text inside `goalType` under an `ok:true` envelope.

#### 8. `004d161b839ce725` (RT4) — cross-referenced to row 2

- **Quoted regression lock (verbatim from notes):** identical text to
  `5abecc959e43fef3` (row 2) — same root cause, same fix
  (`assertValidAutoHint()`), same 4 tests. The fix-queue's own
  `relatedFingerprint` convention keeps this as its own row rather than
  merging it into row 2.
- **Existence check:** FOUND (identical to row 2's result).
- **Proves:** the identical guarantee as `5abecc959e43fef3` — deleting or
  weakening these 4 tests would silently un-lock **both** fingerprints, not
  just one.

#### 9. `3306edf4c2d01c53` (RT8) — `agda_load_no_metas` session-regression guard

- **Quoted regression lock (verbatim from notes):**
  - `test/unit/session/register-agda-load-no-metas.test.ts` :: `agda_load_no_metas surfaces regression diagnostic and previousClassification when reload drops from ok-complete to failure`
- **Existence check:** FOUND — file exists; string verified byte-for-byte
  present.
- **Proves:** `agda_load_no_metas` surfaces a `previousClassification` +
  session-regression diagnostic on an ok-complete-to-failure transition,
  matching `agda_load`'s own pre-existing behavior.

#### 10. `0bc76d15c2fec8df` — dogfood-run.mjs checkpoint guard (see Flagged Discrepancy)

- **Notes-cited lock (paraphrased, not literally quoted — "Regression
  evidence:" phrasing):** *"test/unit/tools/dogfood-run-report-checkpoint.test.ts
  (3 tests: startup checkpoint, SIGKILL-to-process-group leaves
  finalized:false, SIGTERM-to-process-group finalizes with exit metadata)
  and test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts (3 tests:
  loud warning on finalized:false, silent on finalized:true, silent on the
  pre-fix schema's absent field) -- all 6 green."*
- **Actual test-case strings found by direct file read (all verified
  byte-for-byte present):**
  - `test/unit/tools/dogfood-run-report-checkpoint.test.ts` (5 `testPosix(...)` registrations, not 3):
    1. `writes an initial run-report.json (finalized:false, zero tool calls) immediately at startup, before any tool call is made`
    2. `a hard SIGKILL delivered to the whole process group after one recorded action still leaves run-report.json on disk with finalized:false (the primary SIGKILL defense)`
    3. `a graceful SIGTERM delivered to the whole process group finalizes the report (finalized:true) with exit metadata`
    4. `a child that ignores SIGTERM is escalated to SIGKILL after the grace window, and the report reflects a CONFIRMED (not merely assumed) clean exit (WR-07, from-RED)`
    5. `finalize()'s SIGKILL escalation kills the WHOLE process group, including a genuine grandchild the inner child spawns itself, not just the immediate child (WR-09, from-RED)`
  - `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts` (3 `test(...)` registrations, matches notes):
    1. `checkReportFinalized: a finalized:false report prints a loud stderr warning and returns false`
    2. `checkReportFinalized: a finalized:true report is silent and returns true`
    3. `checkReportFinalized: a report with no finalized field at all (pre-fix schema) is treated as finalized, silently`
- **Existence check:** FOUND — both files exist; all 8 actual test-case
  strings verified byte-for-byte present via `grep -F`.
- **Proves:** `dogfood-run.mjs` always leaves a `run-report.json` behind —
  incrementally checkpointed (`finalized:false`) after every recorded action
  and finalized on graceful shutdown — even under a hard, whole-process-group
  `SIGKILL` with zero cooperating exit path (tests 1–3), that a wedged child
  ignoring `SIGTERM` is correctly escalated to a confirmed `SIGKILL` (test 4),
  and that the escalation reaches a genuine grandchild process, not just the
  immediate child (test 5) — so a Codex-hard-killed dogfooding run can still
  enter the fix-queue loop, and `dogfood-wrapup.mjs` warns loudly (never
  silently) on an unfinalized report instead of misreading it as complete.

#### 11. `issue-64-61-transitive-staleness` (matrix entry, → `e6f0c1169032b9d5`)

- **Test lock:** `test/integration/mcp/capture-regression.test.ts` generates
  one `it(...)` per matrix entry via the template literal
  `` `${entry.id}: ${entry.tool} ${expectMatch ? "matches" : "does NOT yet match"} ORCL-01 cold expected value` ``
  (file lines 45–55). With this entry's `status: "locked"` (`expectMatch =
  true`), the generated, runnable test name is exactly:
  `issue-64-61-transitive-staleness: agda_load_no_metas matches ORCL-01 cold expected value`
  — matching `docs/LOAD-TERMINUS-ADJUDICATION.md`'s own referee-run citation
  verbatim.
- **Existence check:** FOUND — file exists; the generating template literal
  itself was read directly, not assumed.
- **Proves:** the same flagship guarantee as `e6f0c1169032b9d5`, replayed
  through the shared ORCL-01 matrix-replay runner
  (`replayCaptureRegressionEntry` + `matchesExpected`) against one
  oracle-vetted `expected` value, rather than a hand-written ad hoc
  assertion.

#### 12. `guard-no-metas-clean-load-under-fault-injection` (matrix entry, → `e6f0c1169032b9d5`)

- **Test lock:** same generating file/template as row 11. Generated,
  runnable test name:
  `guard-no-metas-clean-load-under-fault-injection: agda_load_no_metas matches ORCL-01 cold expected value`
- **Existence check:** FOUND — same file as row 11.
- **Proves:** a genuinely clean strict load (`agda_load_no_metas`) still
  reports `ok-complete` correctly even with the fault-injection env levers
  (`AGDA_MCP_IDLE_COMPLETION_MS`/`AGDA_MCP_POST_STATUS_IDLE_MS`, both fixture-set
  to `1`ms) pushed to their most aggressive values — i.e. the strict-load fix
  does not produce a false negative under timing pressure.

### Flagged Discrepancy: `0bc76d15c2fec8df`'s notes undercount its own regression lock

`0bc76d15c2fec8df`'s `notes` field states *"all 6 green"* (3 tests in
`dogfood-run-report-checkpoint.test.ts` + 3 in
`dogfood-wrapup-nonfinalized-report.test.ts`). A direct read of
`dogfood-run-report-checkpoint.test.ts` found **5** `testPosix(...)`
registrations, not 3 — the notes name only the first three ("startup
checkpoint", "SIGKILL...finalized:false", "SIGTERM...finalizes with exit
metadata"). The two additional tests (`WR-07`'s SIGKILL-escalation-after-a-
wedged-SIGTERM-ignoring-child test, and `WR-09`'s whole-process-group-reaches-
a-real-grandchild test) reference different fix identifiers (`WR-07`, `WR-09`)
than this entry's own (`0bc76d15c2fec8df`) — they were evidently added to the
same file in a later hardening pass but never folded into this fingerprint's
own notes text.

**Resolution for this exclusion list: all 8 actual tests across both files
are included** (row 10 above lists all 8), not just the 6 the notes describe
— per T-12-09's own mitigation (dual-method construction, full manual read),
under-listing here is exactly the failure mode the exclusion list exists to
prevent. This is reported as a discrepancy, not silently corrected in
`fix-queue.json` itself (out of this plan's scope per the plan's own
`<action>` instruction for Task 2, and this finding is about Task 1's
artifact, not Task 2's).

### Quick-reference file list (for every back-half execution plan's `read_first`)

Any cut touching one of these 11 files, or any of the 26 individually-named
test cases quoted above inside them, is **out of scope for deletion or
weakening** in this phase:

1. `test/integration/mcp/capture-regression.test.ts`
2. `test/unit/agda/agent-ux.test.ts`
3. `test/unit/tools/goal-tools-give.test.ts`
4. `test/unit/agda/goal-operations-give.test.ts`
5. `test/unit/tools/file-tools.test.ts`
6. `test/unit/tools/analysis-tools.test.ts`
7. `test/unit/agda/expression-operations.test.ts`
8. `test/unit/agda/goal-operations-context-check.test.ts`
9. `test/unit/session/register-agda-load-no-metas.test.ts`
10. `test/unit/tools/dogfood-run-report-checkpoint.test.ts`
11. `test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts`

This list is a floor, not a ceiling: a back-half plan that discovers a new
`locked` fix-queue entry (e.g. a fix that lands mid-phase) must re-derive its
own lock set the same way, not assume this snapshot is still exhaustive.

---

## RT6 Verdict

**Fingerprint:** `ad2b6d31f58f1759`
**Current status:** `triaged` (unchanged by this plan, per D-04/this plan's
own instruction — recording any status change is Plan 12-06's Task 2
responsibility).

**Original finding:** `agda_load`'s response conflates five states (visible
goals, hidden metas, constraints, source-hole syntax, file completeness) into
one signal; two of the five remain genuinely conflated even after Phase 6's
partial fixes — (1) source-hole syntax has no field of its own (folded into
the single `hasHoles` boolean, with a gate that misses a hole co-occurring
with an unrelated hard error), and (2) `constraints` is absent from
`agda_load`'s own schema entirely (it exists only on `agda_proof_status`,
cross-referenced via the already-fixed `fdc90bfde12fb938`).

**HEAD re-reproduction check (this session, against current merged HEAD,
post-Phase-10):**

- `src/agda/session-load-impl.ts` lines 124–129 (`runLoad`) and lines
  224–226 (`runLoadNoMetas`) both still gate the source-hole scan behind
  `parsed.success`:
  `const needsExplicitHoleScan = parsed.success && goals.length === 0 && parsed.invisibleGoalCount === 0;`
  (`runLoad`'s exact variable name; `runLoadNoMetas` uses
  `parsed.goalCount === 0` in place of `goals.length === 0`, same shape).
  This is the exact gate the original finding names as the root cause of the
  "a hole co-occurring with an unrelated hard error is never scanned for"
  symptom — **reproduces unchanged, byte-for-byte the same conditional, at
  current HEAD.**
- `src/agda/session-load-helpers.ts`'s `classifyLoadResult` (lines 170–183)
  still only derives a boolean `hasHoles`, `isComplete`, `classification`
  triple from `sourceHoleCount` — there is no field that surfaces the count
  itself, and no `constraints` input at all.
- `src/session/tool-presentation.ts`'s `loadDataSchema` (lines 9–32, the
  actual Zod schema `agda_load` returns to clients) confirms this
  client-visible: it exposes `goalCount`, `invisibleGoalCount`, `hasHoles`,
  `isComplete`, `classification` — **no `sourceHoleCount`, no `constraints`
  field exists on `agda_load`'s response at current HEAD.**

**Citation into `docs/LOAD-TERMINUS-ADJUDICATION.md` (Phase 10's decision):**
The adjudication's Decision table has exactly three rows — completion-signal
detection, fatal-stderr handling, inactivity timeout — all decided **Theirs
(upstream)**, and its own "Codebase state after this plan" section lists only
`src/session/agda-transport.ts`, `src/session/command-completion.ts`,
`src/agda/session-load-impl.ts` (plus the deleted
`load-terminus-tracker.ts`) as touched. `src/agda/session-load-helpers.ts`
and `src/session/tool-presentation.ts` — the two files RT6's own gap
actually lives in — are **not** on that list; they were untouched by the
merge. The adjudication's own "Scope note" states RT6 was "deliberately out
of scope for this adjudication even though they touch the same seam ... They
are re-evaluated only after the whole Phase 10 merge lands" — confirming
Phase 10 never attempted to resolve RT6, and the trigger firing means the
architecture RT6 sits downstream of is now stable, not that RT6 itself
changed.

**Verdict: HOW.** RT6's conflation is real, reproduces unchanged at current
HEAD, and is orthogonal to everything Phase 10 adjudicated — a future phase
should implement it. Target-shape sketch (schema addition, no implementation
here):

1. Add a `sourceHoleCount: number` field to `LoadResult` / `loadDataSchema`
   (today the count is computed internally by `countExplicitSourceHoles()`
   but only ever folds into the single `hasHoles` boolean — never surfaced
   on its own).
2. Add a `constraints`-shaped field to `agda_load`'s own response schema
   (today only `agda_proof_status` exposes anything constraint-shaped; RT6's
   cross-referenced sub-case `fdc90bfde12fb938` fixed `agda_proof_status`'s
   own mislabeling, but `agda_load` itself still has no constraints field at
   all).
3. Broaden the `needsExplicitHoleScan` gate in both `runLoad` and
   `runLoadNoMetas` (`src/agda/session-load-impl.ts`) so the source-hole scan
   also runs when `parsed.success` is false but `goals`/`invisibleGoalCount`
   are both zero — today's `parsed.success &&` term is exactly what hides a
   hole that co-occurs with an unrelated hard type error elsewhere in the
   same file.
4. This is a genuine breaking response-shape change on a widely-consumed
   schema (`loadDataSchema`), not a mechanical ≤2-file fix — it belongs to
   its own dedicated future phase, matching the fix-queue's own existing
   DEFERRED framing for this entry.

**Severity/urgency now that Phase 10 has landed:** unchanged from the
original filing — `missing-feature`, not a false-green (the file's overall
`classification` is still correctly `type-error` in the co-occurring-hole
case, so no incorrect "your proof is done" signal is ever given). Not
urgent/blocking, but the blind spot can cost an agent a wasted turn
concluding "nothing to fix here but the type error" when a valid,
syntactically-present hole is also waiting in the same file. A real,
mechanically-scoped candidate for a future phase; no change to its priority
relative to the rest of the backlog is warranted by Phase 10 landing.

---

## RT7 Verdict

**Fingerprint:** `b6821f42952c6ff8`
**Current status:** `triaged` (unchanged by this plan).

**Original finding:** on a command timeout, `agda_load`'s response collapses
"timed out while Agda was still alive and mid-flight," "crashed," "never
started," and "produced no protocol response at all" into one
`classification: "process-error"` with one hardcoded `nextAction` diagnostic
("The Agda subprocess crashed or could not be started. Run `agda --version`
...") — even when the transport's own evidence
(`responseCount`/`sawStatusDone`/`lastResponseKind`) proves the process was
alive and actively responding right up to the deadline.

**HEAD re-reproduction check (this session, against current merged HEAD,
post-Phase-10):**

- `src/session/agda-transport.ts`'s `onTimeout` handler (lines 299–311, part
  of the upstream-adopted, Phase-10-merged transport) still computes
  `responseCount`/`responseKinds` at the moment of timeout and embeds them
  only as free-text inside the rejected `Error`'s `.message`:
  `` `sendCommand timed out after ${timeoutMs}ms of inactivity (received ${responseCount} responses: ${JSON.stringify(responseKinds)})` ``
  — this evidence exists and is collected (confirmed also present:
  `sawStatusDone`, `lastResponseKind` as private fields feeding
  `waitDiagnostics`/`onDone`), but nothing structured carries it past this
  point.
- `src/session/load-tool-shared.ts`'s `processErrorResult` (lines 67–87)
  still **hardcodes** `classification: "process-error"` and the fixed
  crash/startup `nextAction` diagnostic text for every call, regardless of
  what `message` string it receives — **the exact same wording quoted
  verbatim in this fingerprint's own fix-queue notes is still the exact
  wording emitted today.**
- `src/session/register-agda-load.ts`'s catch site (lines 282–291) confirms
  the call pattern: any thrown error (including the now-detailed timeout
  `Error`) is funneled through `processErrorResult("agda_load", file,
  \`Agda load failed: ${err.message}\`)` — the raw message text lands in
  `data.errors[0]`, but `classification` and the actionable `nextAction` hint
  stay generic. The same call pattern repeats identically in
  `register-agda-load-no-metas.ts` and `register-agda-typecheck.ts`.
- **This reproduces RT7's original finding unchanged, at current HEAD, with
  the identical misleading `nextAction` text.**

**Citation into `docs/LOAD-TERMINUS-ADJUDICATION.md` (Phase 10's decision):**
Same reasoning as RT6 — the adjudication's three decided sub-behaviors
(completion-signal detection, fatal-stderr handling, inactivity timeout)
concern the *transport's* internal completion/timeout mechanism (when to
resolve or reject a command), not the *error-translation* layer
(`src/session/load-tool-shared.ts`'s `processErrorResult`) that turns a
rejected promise into the client-visible classification/diagnostic.
`load-tool-shared.ts` is one layer up from every file the adjudication's
"Codebase state after this plan" section lists as touched, and is absent
from that list — confirming it was untouched by the merge.
`src/session/command-completion.ts` (read in full this session) is
exclusively about idle-timing/terminus-detection math
(`idleCompletionDelay`, `trailingResponseDelay`, `shouldResolveOnIdle`) and
contains no classification or diagnostic-text logic whatsoever — further
confirming RT7's gap is orthogonal to everything Phase 10 touched.

**Verdict: HOW.** RT7's diagnostic-taxonomy gap is real, reproduces unchanged
(with the identical wording) at current HEAD, and is orthogonal to Phase 10's
adjudication — a future phase should implement it. Target-shape sketch (no
implementation here):

1. Add a structured discriminator (e.g. `processState:
   "timed-out-while-alive" | "crashed" | "never-started" |
   "no-protocol-response"`) fed from the evidence `agda-transport.ts`'s
   `onTimeout`/`waitDiagnostics` already collects
   (`responseCount`/`sawStatusDone`/`lastResponseKind`), instead of
   collapsing every `session.load()`-family throw into one
   `"process-error"` classification.
2. Thread this new field through `processErrorResult`'s single
   implementation (`src/session/load-tool-shared.ts`) so the fix is
   centralized once, not duplicated across the three identical call sites in
   `register-agda-load.ts`, `register-agda-load-no-metas.ts`, and
   `register-agda-typecheck.ts`.
3. Make the `nextAction` diagnostic conditional on the new discriminator:
   keep the existing "crashed or could not be started, run `agda --version`"
   hint only for the genuine crash/never-started cases; add a distinct,
   correct hint for the timed-out-while-alive case (e.g. suggesting a larger
   `AGDA_MCP_COMMAND_TIMEOUT_MS` or splitting the module) instead of
   misdirecting the agent toward checking an installation that is
   demonstrably fine.
4. This is a breaking response-shape change (a new discriminated field
   alongside `classification`), not a mechanical ≤2-file fix — belongs to
   its own dedicated future phase, matching the fix-queue's own existing
   DEFERRED framing.

**Severity/urgency now that Phase 10 has landed:** slightly elevated
relative to a pure missing-feature framing. The current `nextAction` is not
merely silent on the distinction — it is **actively wrong** in the
timed-out-while-alive case, directing the agent to verify an Agda
installation that is demonstrably present and mid-flight. That directly cuts
against this project's own documented `nextAction` "self-healing hint"
convention (`CLAUDE.md` Error Handling: "`nextAction` should point the
calling agent at the next MCP tool to call to resolve the issue") and its
dogfooding-agent-ergonomics constraint. Recommend this be scheduled ahead of
purely-cosmetic backlog items when a future phase picks up the diagnostic-
taxonomy work — but it remains fully deferred, with zero implementation, per
D-04 in this plan.

---

## Provenance / Self-Check

- Regression-lock extraction: RESEARCH.md's Python regex snippet, extended to
  match `Regression evidence:` as well as `Regression lock:`, run live this
  session against `test/fixtures/fix-queue.json` — confirmed 10 locked
  entries and extracted 9 matches (all locked; `e6f0c1169032b9d5` is the
  10th, matrix-driven, non-matching-by-design entry).
- Every one of the 10 locked entries' full `notes` field, and both matrix
  entries, were read completely in this session (not sampled).
- All 11 distinct test files existence-checked via `test -f`; all 26
  individually-named test-case strings verified byte-for-byte present via
  `grep -F` against current file contents (except the 2 matrix-generated
  names, verified against their generating template literal in
  `test/integration/mcp/capture-regression.test.ts` instead, since they are
  not literal source text).
- RT6 HEAD evidence read: `src/agda/session-load-impl.ts` (full),
  `src/agda/session-load-helpers.ts` (full), `src/session/tool-presentation.ts`
  (full), `src/agda/types.ts` (`LoadResult`, lines 1–150).
- RT7 HEAD evidence read: `src/session/agda-transport.ts` (lines 255–335 in
  detail, full-file `wc -l`/grep sweep otherwise), `src/session/load-tool-shared.ts`
  (full), `src/session/register-agda-load.ts` (lines 255–294),
  `src/session/command-completion.ts` (full).
- `docs/LOAD-TERMINUS-ADJUDICATION.md` read in full for both verdicts'
  citation.
- No file under `test/`, `src/`, or `test/fixtures/fix-queue.json` was
  modified while producing this document.
