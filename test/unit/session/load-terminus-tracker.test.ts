import { test, expect } from "vitest";

import {
  createLoadTerminusState,
  recordLoadTerminusResponse,
  isLoadTerminusSatisfied,
} from "../../../src/session/load-terminus-tracker.js";

// ── Mode resolution ──────────────────────────────────────────────────

test("createLoadTerminusState resolves loadTerminusMode directly", () => {
  expect(createLoadTerminusState({ loadTerminusMode: "strict" }).mode).toBe("strict");
  expect(createLoadTerminusState({ loadTerminusMode: "metas" }).mode).toBe("metas");
});

test("createLoadTerminusState resolves the awaitGoalTerminus alias to metas", () => {
  expect(createLoadTerminusState({ awaitGoalTerminus: true }).mode).toBe("metas");
});

test("createLoadTerminusState resolves to null when neither option is set", () => {
  expect(createLoadTerminusState({}).mode).toBeNull();
  expect(createLoadTerminusState().mode).toBeNull();
});

test("createLoadTerminusState prefers loadTerminusMode over the awaitGoalTerminus alias when both are present", () => {
  expect(
    createLoadTerminusState({ loadTerminusMode: "strict", awaitGoalTerminus: true }).mode,
  ).toBe("strict");
});

test("createLoadTerminusState starts every tracking flag false regardless of mode", () => {
  const state = createLoadTerminusState({ loadTerminusMode: "strict" });
  expect(state.sawInteractionPoints).toBe(false);
  expect(state.sawAllGoalsWarnings).toBe(false);
  expect(state.sawLoadError).toBe(false);
});

// ── D-02 strict-mode false-RED guard ─────────────────────────────────

test("isLoadTerminusSatisfied: strict mode is NOT satisfied by the metas-style positive signal", () => {
  // A clean strict Cmd_load_no_metas load never emits InteractionPoints
  // / AllGoalsWarnings — if this predicate ever returned true here, the
  // extraction would have silently re-imposed the metas gate on the
  // strict path and every clean strict load would be false-RED'd.
  expect(
    isLoadTerminusSatisfied({
      mode: "strict",
      sawInteractionPoints: true,
      sawAllGoalsWarnings: true,
      sawLoadError: false,
    }),
  ).toBe(false);
});

test("isLoadTerminusSatisfied: strict mode IS satisfied by sawLoadError alone", () => {
  expect(
    isLoadTerminusSatisfied({
      mode: "strict",
      sawInteractionPoints: false,
      sawAllGoalsWarnings: false,
      sawLoadError: true,
    }),
  ).toBe(true);
});

// ── Metas-mode parity with today's inline expression ─────────────────

test("isLoadTerminusSatisfied: metas mode requires both InteractionPoints and AllGoalsWarnings", () => {
  expect(
    isLoadTerminusSatisfied({
      mode: "metas",
      sawInteractionPoints: true,
      sawAllGoalsWarnings: true,
      sawLoadError: false,
    }),
  ).toBe(true);
});

test("isLoadTerminusSatisfied: metas mode is NOT satisfied by only one of the two positive signals", () => {
  expect(
    isLoadTerminusSatisfied({
      mode: "metas",
      sawInteractionPoints: true,
      sawAllGoalsWarnings: false,
      sawLoadError: false,
    }),
  ).toBe(false);
  expect(
    isLoadTerminusSatisfied({
      mode: "metas",
      sawInteractionPoints: false,
      sawAllGoalsWarnings: true,
      sawLoadError: false,
    }),
  ).toBe(false);
});

test("isLoadTerminusSatisfied: metas mode short-circuits on sawLoadError", () => {
  expect(
    isLoadTerminusSatisfied({
      mode: "metas",
      sawInteractionPoints: false,
      sawAllGoalsWarnings: false,
      sawLoadError: true,
    }),
  ).toBe(true);
});

// ── recordLoadTerminusResponse ───────────────────────────────────────

test("recordLoadTerminusResponse is a no-op when mode is null", () => {
  const state = createLoadTerminusState();
  recordLoadTerminusResponse(state, { kind: "InteractionPoints" });
  recordLoadTerminusResponse(state, { kind: "DisplayInfo", info: { kind: "AllGoalsWarnings" } });
  recordLoadTerminusResponse(state, { kind: "DisplayInfo", info: { kind: "Error" } });

  expect(state.sawInteractionPoints).toBe(false);
  expect(state.sawAllGoalsWarnings).toBe(false);
  expect(state.sawLoadError).toBe(false);
});

test("recordLoadTerminusResponse tracks InteractionPoints, AllGoalsWarnings, and Error independently", () => {
  const state = createLoadTerminusState({ loadTerminusMode: "metas" });

  recordLoadTerminusResponse(state, { kind: "InteractionPoints", interactionPoints: [0] });
  expect(state.sawInteractionPoints).toBe(true);
  expect(state.sawAllGoalsWarnings).toBe(false);
  expect(state.sawLoadError).toBe(false);

  recordLoadTerminusResponse(state, { kind: "DisplayInfo", info: { kind: "AllGoalsWarnings" } });
  expect(state.sawAllGoalsWarnings).toBe(true);
  expect(state.sawLoadError).toBe(false);

  recordLoadTerminusResponse(state, { kind: "DisplayInfo", info: { kind: "Error" } });
  expect(state.sawLoadError).toBe(true);
});

test("recordLoadTerminusResponse ignores DisplayInfo responses whose info.kind is neither AllGoalsWarnings nor Error", () => {
  const state = createLoadTerminusState({ loadTerminusMode: "strict" });
  recordLoadTerminusResponse(state, { kind: "DisplayInfo", info: { kind: "CurrentGoal" } });

  expect(state.sawAllGoalsWarnings).toBe(false);
  expect(state.sawLoadError).toBe(false);
});
