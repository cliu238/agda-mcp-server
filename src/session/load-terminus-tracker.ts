// MIT License — see LICENSE
//
// Load-terminus tracking, extracted from `agda-transport.ts` so that
// file stays under the 500-line ceiling declared in `ARCHITECTURE.md` /
// `AGENTS.md`. A metas `Cmd_load` has a positive success terminus
// (InteractionPoints + AllGoalsWarnings) to await; a strict
// `Cmd_load_no_metas` load has none — a clean strict load emits
// highlighting and then nothing further, ever — so success there can
// only be inferred from silence (the widened idle window in
// `command-completion.ts`) once the one signal a strict load DOES
// reliably emit on failure (`sawLoadError`) has been ruled out.

import type { AgdaResponse } from "../agda/types.js";

export type LoadTerminusMode = "metas" | "strict" | null;

export interface LoadTerminusOptions {
  awaitGoalTerminus?: boolean;
  loadTerminusMode?: LoadTerminusMode;
}

export interface LoadTerminusState {
  mode: LoadTerminusMode;
  sawInteractionPoints: boolean;
  sawAllGoalsWarnings: boolean;
  sawLoadError: boolean;
}

/**
 * Resolve the effective mode from a per-call options bag —
 * `loadTerminusMode` wins when present, falling back to the
 * `awaitGoalTerminus` boolean alias (`true` -> "metas") for backward
 * compatibility, and `null` when neither is set — and return a
 * freshly-initialized state. Callable with no argument at all (the
 * `destroy()` / `sendFireAndForgetCommand()` reset shape) or with the
 * real per-call options bag (the `sendCommand()` reset shape); both
 * collapse to the same one-line reset at each call site.
 */
export function createLoadTerminusState(options: LoadTerminusOptions = {}): LoadTerminusState {
  return {
    mode: options.loadTerminusMode ?? (options.awaitGoalTerminus ? "metas" : null),
    sawInteractionPoints: false,
    sawAllGoalsWarnings: false,
    sawLoadError: false,
  };
}

/** Track the documented Cmd_load goal-state terminus (InteractionPoints
 *  + AllGoalsWarnings, or a DisplayInfo Error). Cheap field reads — no
 *  schema parse — since we only need the response/info kind. No-op
 *  when `state.mode` is null (not a load command at all). */
export function recordLoadTerminusResponse(state: LoadTerminusState, response: AgdaResponse): void {
  if (!state.mode) return;
  if (response.kind === "InteractionPoints") {
    state.sawInteractionPoints = true;
  } else if (response.kind === "DisplayInfo") {
    const infoKind = (response.info as { kind?: unknown } | undefined)?.kind;
    if (infoKind === "AllGoalsWarnings") state.sawAllGoalsWarnings = true;
    else if (infoKind === "Error") state.sawLoadError = true;
  }
}

/**
 * The mode-dependent terminus predicate — the D-02 asymmetry lives
 * here. "metas" needs both InteractionPoints and AllGoalsWarnings
 * (order varies across Agda versions), or short-circuits on a
 * DisplayInfo Error. "strict" has no positive success event to await
 * — a clean Cmd_load_no_metas load emits only highlighting, then
 * nothing further, ever — so it is satisfied ONLY by sawLoadError.
 * Silence after the widened idle window (see `command-completion.ts`'s
 * `configuredGoalTerminusIdleMs`) is what ultimately signals a clean
 * strict success; this predicate alone must never treat the
 * metas-style positive signal as satisfying the strict mode, or a
 * genuinely goal-less strict load would be false-RED'd.
 */
export function isLoadTerminusSatisfied(state: LoadTerminusState): boolean {
  if (state.mode === "strict") {
    return state.sawLoadError;
  }
  return state.sawLoadError || (state.sawInteractionPoints && state.sawAllGoalsWarnings);
}
