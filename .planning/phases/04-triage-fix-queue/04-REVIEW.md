---
phase: 04-triage-fix-queue
reviewed: 2026-07-02T23:05:30Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - scripts/queue/mirror-github.mjs
  - scripts/queue/intake.mjs
  - scripts/queue/priority.mjs
  - scripts/queue/dashboard.mjs
  - scripts/queue/seed-initial-cargo.mjs
  - src/agda/session-capture/triage-derivation.ts
  - src/agda/session-capture/artifact-types.ts
  - src/agda/session-capture/dedup-index.ts
  - src/tools/register-capture-session.ts
  - test/fixtures/fix-queue.ts
  - test/fixtures/fix-queue.json
  - test/unit/tools/queue-mirror-github.test.ts
  - test/unit/tools/queue-intake.test.ts
  - test/unit/tools/queue-priority.test.ts
  - test/unit/tools/queue-dashboard.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-02T23:05:30Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 4 builds an in-repo fix queue: a git-tracked JSON SSOT + zod loader, four queue scripts (intake/priority/dashboard/mirror), a one-time seed, and an additive `triage` field on `CaptureArtifact`. The security-critical surface — the GitHub mirror — is well built: **dry-run is genuinely the default** (no `execFileSync` is reachable before the `options.execute !== true` early-return at `mirror-github.mjs:155`), every real `gh` call uses an argv array with `shell: false` (`:59`, `:65`, `:177`, `:185`), the D-11 payload whitelist reads exactly six fields, create-vs-update routing correctly treats a pre-existing `entry.issue[]` as already-linked (`:153`), and the whole test suite is mocked through a `deps.execFileSync` seam that never touches the committed `fix-queue.json`. I confirmed (not assumed) that `triage-derivation.ts`'s `normalizedResponse.data.errors` path is a *real* runtime shape (`register-agda-load.ts:263` emits `errors` at `data.errors`; `tool-registration.ts:204` records the full envelope), so the QUEUE-03 enrichment is not silently dead. No hand-built IOTCM strings exist in scope, and all touched `src/` files are far under the 500-line ceiling (max 234).

One real defect blocks: the mirror's D-12 backlink-persistence path reuses `upsertQueueEntry`, whose update semantics **always bump `recurrence`** — so the very first real `--execute` run silently increments the recurrence of every eligible entry in the committed SSOT, corrupting the priority ordering and compounding through the dedup index. Two lower-severity robustness gaps (a NaN-returning comparator for unknown defect kinds; incomplete markdown-table escaping) round out the findings.

## Critical Issues

### CR-01: `--execute` mirror run silently bumps `recurrence` on the committed SSOT

**File:** `scripts/queue/mirror-github.mjs:234-240` (root cause: `scripts/queue/intake.mjs:61-81`)

**Issue:** On a real `--execute` run, `scriptMain` persists the newly-established GitHub backlink by calling `upsertQueueEntry({ ...entry, githubIssue: result.githubIssue }, queueJsonPath)` against the **real committed** `test/fixtures/fix-queue.json`. But `entry` is drawn from `fixQueue`, which is loaded *from that same file*, so `upsertQueueEntry` always takes its **update** branch — and that branch unconditionally sets `recurrence: existing[existingIndex].recurrence + 1` (`intake.mjs:68`), ignoring the caller's value by design.

The mirror's stated intent (header, `:23-27`) is to persist the backlink "back onto the entry" — a publish action, not a re-observation of the defect. Bumping `recurrence` here is an unintended side effect of overloading the intake primitive:

- On the first `--execute`, every eligible (status ≠ `new`) entry that has a `linkedIssue` or gets freshly created has its `recurrence` silently incremented `1 → 2`. For the seeded cargo that is entries 1–5 (the flagship + the four re-verified defects — the highest-value rows).
- `recurrence` is QUEUE-02's tie-break (`priority.mjs:51`), so the queue's priority ordering shifts.
- It **compounds through dedup**: `dedup-index.ts:64` derives `kind` as `recurrence > 1 ? "update" : "new-bug"`, and a subsequent live re-capture routes to `recurrence + 1` (`dedup-index.ts:87`), so the corruption grows on every future sighting.
- It is untested: the D-12 test (`queue-mirror-github.test.ts:232-276`) asserts `persisted.githubIssue` but never `persisted.recurrence`, so it silently passes while the bump occurs (the persisted entry there is in fact at `recurrence: 2`).

The seed header (`seed-initial-cargo.mjs:28-31`) explicitly names `recurrence: 2` as the "diverging" state the plan's tests do not expect — this path produces exactly that divergence via the documented primary action of the tool.

**Fix:** Persist the backlink without re-observing the defect. Give `upsertQueueEntry` an explicit switch so recurrence-preserving writes are possible, and have the mirror use it:

```js
// intake.mjs
export async function upsertQueueEntry(entryData, queueJsonPath, { bumpRecurrence = true } = {}) {
  const existing = readQueueFile(queueJsonPath);
  const existingIndex = existing.findIndex((e) => e.fingerprint === entryData.fingerprint);
  const candidate =
    existingIndex === -1
      ? entryData
      : {
          ...existing[existingIndex],
          ...entryData,
          recurrence: bumpRecurrence
            ? existing[existingIndex].recurrence + 1
            : existing[existingIndex].recurrence,
        };
  // ...validate + atomic write unchanged...
}

// mirror-github.mjs scriptMain (the backlink persist is not a recurrence event)
await upsertQueueEntry({ ...entry, githubIssue: result.githubIssue }, queueJsonPath, {
  bumpRecurrence: false,
});
```

Then extend the D-12 test to assert `persisted.recurrence` is unchanged after the backlink write.

## Warnings

### WR-01: `comparePriority` returns `NaN` for an unknown `defectKind`, making the sort non-deterministic

**File:** `scripts/queue/priority.mjs:47-52`

**Issue:** `DEFECT_KIND_WEIGHT[a.defectKind] - DEFECT_KIND_WEIGHT[b.defectKind]` yields `NaN` whenever either `defectKind` is not one of the four frozen keys (a typo, a future kind, or any not-yet-validated input). `if (bandDiff !== 0)` is `true` for `NaN`, so `comparePriority` returns `NaN` — and a comparator returning `NaN` violates the `Array.prototype.sort` contract, producing implementation-defined (effectively non-deterministic) ordering. The module's own header advertises acceptance of a "minimal `{ defectKind, recurrence }` pair," which carries no validation guarantee, and `sortByPriority` is imported by `dashboard.mjs`. Today every real call site passes zod-validated data, so this is latent rather than live — but it is a genuine total-order violation one un-validated caller away.

**Fix:** Give unknown kinds a deterministic fallback weight so the result stays a total order:

```js
export function comparePriority(a, b) {
  const wa = DEFECT_KIND_WEIGHT[a.defectKind] ?? Number.MAX_SAFE_INTEGER;
  const wb = DEFECT_KIND_WEIGHT[b.defectKind] ?? Number.MAX_SAFE_INTEGER;
  const bandDiff = wa - wb;
  if (bandDiff !== 0) return bandDiff;
  return b.recurrence - a.recurrence;
}
```

### WR-02: dashboard table-cell escaping handles `|` but not newlines, so a free-text `title` can break the table structure

**File:** `scripts/queue/dashboard.mjs:44-46` (used at `:51`)

**Issue:** `escapeTableCell` exists specifically "so free-text fields (e.g. `title`) can never break the surrounding markdown table's column structure" (its own docstring), but it only escapes the column delimiter `|`. A newline is equally structure-breaking in a GitHub-flavored markdown table — it terminates the row — and `title` is `z.string().min(1)` (`fix-queue.ts:62`), which permits embedded `\n`. A future intake-sourced title containing a newline would inject spurious rows / corrupt the rendered dashboard, defeating the helper's stated guarantee. Impact is confined to a local regenerated doc (no XSS — this is never served to a browser), hence WARNING not BLOCKER.

**Fix:** Neutralize row-breaking characters as well:

```js
function escapeTableCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
}
```

## Info

### IN-01: `DedupIndexEntry.kind` is derived but never consumed

**File:** `src/agda/session-capture/dedup-index.ts:64` (interface `:29-32`)

**Issue:** `readDedupIndex` computes `kind: recurrence > 1 ? "update" : "new-bug"` for every map entry, but the sole consumer, `routeDedup` (`:79-88`), reads only `prior.recurrence` and always returns `kind: "update"` for a present fingerprint. The map's `kind` field is therefore presentational-only dead data (it *is* exercised by `dedup-index.test.ts:41`, but no production path reads it). This is harmless but invites confusion between the two distinct "kind" vocabularies (stored-state vs. routing decision).

**Fix:** Either drop `kind` from `DedupIndexEntry` and store a bare `recurrence`, or add a short comment on the interface noting the field is informational and not used by `routeDedup`.

### IN-02: `renderIssueBody` shares the same unescaped-newline free-text handling (cosmetic on GitHub)

**File:** `scripts/queue/mirror-github.mjs:106-117`

**Issue:** The issue body interpolates `payload.summary`/`payload.title` verbatim into markdown. Unlike the dashboard (WR-02), the blast radius here is benign: this is argv-safe (published via `execFileSync` + `shell: false`, so no shell metacharacter can escape an argv element) and GitHub sanitizes issue-body markdown, so an embedded newline renders as a line break, not an injection. Noted only for parity with WR-02 — no code execution or leak risk. The D-11 whitelist itself is correctly enforced (six fields, verified).

**Fix:** Optional. If the dashboard escaping is centralized, reuse the same newline-normalizing helper here for consistent free-text rendering.

---

_Reviewed: 2026-07-02T23:05:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
