// MIT License — see LICENSE
//
// QUEUE-02's forced priority ordering: false-green > crash >
// wrong-result > missing-feature, ties broken by recurrence
// descending (higher recurrence sorts first within the same band).
// `DEFECT_KIND_WEIGHT` is the ONE place this ordering weight lives —
// both this module's own `comparePriority`/`sortByPriority` AND
// scripts/queue/dashboard.mjs (which imports `sortByPriority` from
// here rather than re-deriving its own ordering) read the same table
// indirectly, so the two can never drift apart.
//
// Priority is deliberately never persisted on a FixQueueEntry
// (test/fixtures/fix-queue.ts's own header comment) — it is always
// computed on the fly from `defectKind` + `recurrence` by this
// module, so it can never independently drift out of sync with the
// data it derives from.
//
// Pure, deterministic, no filesystem/subprocess access — every input
// is an already-captured { defectKind, recurrence } pair (or a full
// FixQueueEntry, which is a superset), never re-derived or fetched
// here.

/**
 * The ONE place QUEUE-02's ordering weight lives. Lower number = higher
 * priority. Every consumer (this module's own comparePriority/
 * sortByPriority, and scripts/queue/dashboard.mjs indirectly via
 * sortByPriority) reads this SAME frozen table rather than each
 * independently re-deriving an ordering, so the two can never drift
 * apart.
 */
export const DEFECT_KIND_WEIGHT = Object.freeze({
  "false-green": 0,
  crash: 1,
  "wrong-result": 2,
  "missing-feature": 3,
});

/**
 * Compare two queue entries (or minimal { defectKind, recurrence }
 * pairs) for QUEUE-02's forced priority ordering: the false-green >
 * crash > wrong-result > missing-feature band always wins first; only
 * within the SAME band does higher recurrence sort first. Pure and
 * side-effect-free — reads only `defectKind`/`recurrence` off each
 * argument, never mutates either.
 */
export function comparePriority(a, b) {
  // An unknown/unweighted defectKind sorts LAST (never NaN — a NaN
  // comparator silently breaks Array.sort's total-order contract).
  const weightOf = (kind) => DEFECT_KIND_WEIGHT[kind] ?? Number.MAX_SAFE_INTEGER;
  const bandDiff = weightOf(a.defectKind) - weightOf(b.defectKind);
  if (bandDiff !== 0) {
    return bandDiff;
  }
  return b.recurrence - a.recurrence;
}

/**
 * Return a NEW array of `entries` sorted by `comparePriority` — never
 * mutates the caller's own array. `Array.prototype.sort` sorts in
 * place, so this spreads into a fresh copy first.
 */
export function sortByPriority(entries) {
  return [...entries].sort(comparePriority);
}
