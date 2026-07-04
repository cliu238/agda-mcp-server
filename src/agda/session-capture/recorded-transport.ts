// MIT License — see LICENSE
//
// CAP-04's bounded ring-buffer recorder: captures ordered
// `{tool, args, timestamp, normalizedResponse}` triples at the MCP
// tool-call boundary, gated by `AGDA_MCP_CAPTURE=1` (default OFF, per
// D-06). Zero-cost when disabled — no array mutation, no Date.now()
// call, no object allocation beyond the env check.
//
// Per D-05, the recorder must already be running before the agent
// knows there is a problem — a surprise defect (the common case) must
// never produce an empty action log. Module-level state is the
// correct scope here: exactly one AgdaSession per server process
// (issue #39), so there is never a need to key the buffer by session
// instance.
//
// Truncation policy is drop-newest-once-full, NOT the naive drop-
// oldest ring buffer: losing the FIRST actions of a long dogfooding
// session (which set up the reproduction) is the worse failure mode
// than losing the tail (see RESEARCH.md Pattern 3).

import type { RecordedAction } from "./artifact-types.js";

/**
 * Buffer capacity: generous sizing so a realistic dogfooding session's
 * early actions are not lost before the agent notices a problem and
 * calls `agda_capture_session`.
 */
export const MAX_RECORDED_ACTIONS = 2000;

/**
 * Test-only capacity override, threaded through `recordAction` so
 * tests can exercise the drop-newest-once-full path without waiting
 * for 2000 calls. Production call sites never pass this.
 */
export interface RecordedActionCapacityOverride {
  capacity: number;
}

let buffer: RecordedAction[] = [];
let truncated = false;
let droppedCount = 0;

/**
 * Record one tool-call action. A zero-cost no-op unless
 * `AGDA_MCP_CAPTURE=1` — returns immediately before touching the
 * buffer, `Date.now()`, or allocating anything.
 *
 * Once the buffer reaches capacity, further actions are dropped
 * (drop-newest) rather than evicting the oldest entry — the earliest
 * actions of a long session are the ones a dogfooding agent is most
 * likely to need for reproduction.
 */
export function recordAction(
  action: RecordedAction,
  capacityOverride?: RecordedActionCapacityOverride,
): void {
  if (process.env.AGDA_MCP_CAPTURE !== "1") return;

  const capacity = capacityOverride?.capacity ?? MAX_RECORDED_ACTIONS;
  if (buffer.length >= capacity) {
    droppedCount += 1;
    truncated = true;
    return;
  }
  buffer.push(action);
}

/**
 * Read-only snapshot of the current recorder state. Does NOT clear
 * the buffer — only `resetRecordedActions()` (blanket clear) or
 * `commitDrainedActions()` (clear exactly what was drained) do. Safe
 * to call repeatedly (e.g. once per `agda_capture_session` invocation
 * without losing data for a subsequent capture).
 */
export function drainRecordedActions(): {
  actions: RecordedAction[];
  truncated: boolean;
  droppedCount: number;
} {
  return {
    actions: [...buffer],
    truncated,
    droppedCount,
  };
}

/**
 * Commit exactly the actions a caller already read via
 * `drainRecordedActions()`, without touching anything recorded since.
 * `drainedCount` is the length of that caller's own snapshot
 * (`actions.length`), NOT re-derived here — this function trusts the
 * caller to pass the count it actually consumed.
 *
 * Unlike `resetRecordedActions()`'s blanket `buffer = []`, this slices
 * off only the first `drainedCount` entries. The MCP SDK this server
 * uses does not serialize tool-call dispatch across different tool
 * names (`StdioServerTransport.processReadBuffer()` calls `onmessage`
 * synchronously per buffered request without awaiting the handler),
 * so a second, concurrently in-flight tool call can land a
 * `recordAction()` in the window between a capture's drain and its
 * eventual write completing. A blanket reset there would silently
 * discard that action forever (WR-01 concurrent-drop fix); slicing
 * off only the drained prefix lets it survive into the next capture.
 *
 * `truncated`/`droppedCount` describe whether the buffer has EVER
 * overflowed capacity for the actions still pending commit. They are
 * only cleared once the buffer is genuinely back to empty after this
 * slice — a window carried forward by a concurrent action must not
 * lose its own truncation signal just because an earlier window's
 * actions were committed.
 */
export function commitDrainedActions(drainedCount: number): void {
  buffer = buffer.slice(drainedCount);
  if (buffer.length === 0) {
    truncated = false;
    droppedCount = 0;
  }
}

/**
 * Clear the buffer, truncated flag, and dropped count back to their
 * initial empty state. Used for test isolation only — the per-capture
 * commit path uses `commitDrainedActions()` instead (WR-01), which
 * removes exactly what was drained rather than blanket-clearing a
 * buffer that may already hold newer, concurrently-recorded actions.
 */
export function resetRecordedActions(): void {
  buffer = [];
  truncated = false;
  droppedCount = 0;
}
