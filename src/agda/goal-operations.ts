// MIT License — see LICENSE
//
// Goal-oriented Agda interaction commands.

import type {
  AgdaCommandContext,
  AgdaGoal,
  GoalInfo,
  GoalTypeResult,
  ContextResult,
  GoalTypeContextCheckResult,
  CaseSplitResult,
  GiveResult,
  AutoResult,
} from "./types.js";
import { decodeGoalDisplayResponses } from "../protocol/responses/goal-display.js";
import {
  decodeCaseSplitResponses,
  decodeGiveLikeResponse,
  detectDisplayInfoError,
  hasGiveActionResponse,
  hasMakeCaseResponse,
  hasReplacementText,
  resolveGiveReplacementText,
} from "../protocol/responses/proof-actions.js";
import { decodeDisplayInfoEvents } from "../protocol/responses/display-info.js";
import { decodeLoadDisplayResponses } from "../protocol/responses/load-display.js";
import { decodeGoalExpressionDisplayResponses } from "../protocol/responses/goal-expression-display.js";
import {
  goalCommand,
  modeGoalCommand,
  quoted,
  rewriteTopLevelCommand,
  rewriteGoalCommand,
} from "../protocol/command-builder.js";
import { throwOnFatalProtocolStderr } from "./protocol-errors.js";

/** Get the type and local context for a specific goal. */
export async function goalTypeContext(
  ctx: AgdaCommandContext,
  goalId: number,
): Promise<GoalInfo> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_goal_type_context", "Normalised", goalId, quoted(""))),
  );
  const decoded = decodeGoalDisplayResponses(responses);
  return { goalId, type: decoded.goalType, context: decoded.context };
}

/** Get only the current goal type for a specific goal. */
export async function goalType(
  ctx: AgdaCommandContext,
  goalId: number,
): Promise<GoalTypeResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_goal_type", "Normalised", goalId, quoted(""))),
  );
  const decoded = decodeGoalDisplayResponses(responses);
  return { goalId, type: decoded.goalType };
}

/** Get only the local context for a specific goal. */
export async function context(
  ctx: AgdaCommandContext,
  goalId: number,
): Promise<ContextResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_context", "Normalised", goalId, quoted(""))),
  );
  const decoded = decodeGoalDisplayResponses(responses);
  return { goalId, context: decoded.context };
}

/**
 * Get goal, context, and checked elaborated term for an expression in
 * a goal.
 *
 * A rejected `expr` (NotInScope, UnequalTerms, ...) arrives as a
 * normal Error DisplayInfo response, not a fatal stderr line — with no
 * dedicated schema match, `decodeGoalDisplayResponses`'s catch-all
 * falls back to dumping the raw error text into `goalType` while
 * `checkedExpr` stays empty, so the caller must reject it explicitly
 * up front instead of decoding a success shape around it (fingerprint
 * eaea6321183bdf7b; same `info.kind === "Error"` idiom as give()'s
 * detectDisplayInfoError(), fingerprint bfcba437f5426fd6).
 */
export async function goalTypeContextCheck(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<GoalTypeContextCheckResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_goal_type_context_check", "Normalised", goalId, quoted(expr))),
  );
  const errorText = detectDisplayInfoError(responses);
  if (errorText !== null) {
    throw new Error(errorText);
  }
  const decoded = decodeGoalExpressionDisplayResponses(responses);
  return {
    goalType: decoded.goalType,
    context: decoded.context,
    checkedExpr: decoded.checkedExpr,
  };
}

/**
 * Case-split on a variable in a goal.
 *
 * decodeCaseSplitResponses() falls back to raw DisplayInfo text
 * whenever no MakeCase response is present — exactly the shape a
 * rejected/invalid Cmd_make_case takes. Without a rejection check,
 * that fallback text (Agda's own error message) can be written into
 * the source file as a fabricated case-split clause, replacing a real
 * function clause (CR-02). rejected requires BOTH an Error display
 * AND no genuine MakeCase response, the same two-sided guard give()
 * uses via hasReplacementText().
 */
export async function caseSplit(
  ctx: AgdaCommandContext,
  goalId: number,
  variable: string,
): Promise<CaseSplitResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(goalCommand("Cmd_make_case", goalId, quoted(variable))),
  );
  throwOnFatalProtocolStderr(responses);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasMakeCaseResponse(responses);
  return {
    clauses: decodeCaseSplitResponses(responses),
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/**
 * Give (fill) a goal with an expression.
 *
 * An ill-typed `expr` is rejected by Agda via a normal DisplayInfo
 * response, not a thrown protocol error — `rejected`/`rejectionText`
 * surface that outcome so callers (agda_give) can report ok:false
 * instead of silently wrapping the rejection text in a success
 * envelope (fingerprint bfcba437f5426fd6). A rejection requires BOTH
 * an Error display AND no confirmed replacement text — a successful
 * give that merely emitted an unrelated warning display must not be
 * misclassified as rejected.
 */
export async function give(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<GiveResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_give", "WithoutForce", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const replacementText = resolveGiveReplacementText(responses, expr);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasReplacementText(replacementText);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText,
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/**
 * Refine a goal — apply a function and create subgoals.
 *
 * Same rejection-detection shape as give() (CR-01): a rejected `expr`
 * arrives as an Error DisplayInfo response the same way a rejected
 * give() does, so refine() must scan for it explicitly instead of
 * always returning a success-shaped GiveResult (fingerprint
 * bfcba437f5426fd6).
 */
export async function refine(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<GiveResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_refine_or_intro", "True", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const replacementText = resolveGiveReplacementText(responses, expr);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasReplacementText(replacementText);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText,
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/** Refine a goal using Agda's exact Cmd_refine command. Same rejection-detection shape as refine() (CR-01). */
export async function refineExact(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<GiveResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(goalCommand("Cmd_refine", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const replacementText = resolveGiveReplacementText(responses, expr);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasReplacementText(replacementText);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText,
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/** Introduce a lambda or constructor using Agda's exact Cmd_intro command. Same rejection-detection shape as refine() (CR-01). */
export async function intro(
  ctx: AgdaCommandContext,
  goalId: number,
  expr = "",
): Promise<GiveResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_intro", "True", goalId, quoted(expr))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const replacementText = resolveGiveReplacementText(responses, expr);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasReplacementText(replacementText);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText,
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/**
 * Auto-solve a single goal.
 *
 * decodeGiveLikeResponse() falls back to the last DisplayInfo event's
 * text whenever no GiveAction response is present — both Error-kind
 * and Auto-kind DisplayInfo responses decode to non-empty text
 * through that same fallback, so a rejection/internal-failure result
 * (e.g. a NotInScope hint — the exact shape empirically observed in
 * fix-queue.json fingerprints 5abecc959e43fef3/004d161b839ce725) can
 * otherwise be written into the goal's hole as a fabricated
 * "solution" (CR-03). rejected requires BOTH an Error display AND no
 * genuine GiveAction response, the same two-sided guard give() uses
 * via hasReplacementText(). This closes only the Error-kind half of
 * the gap; an Auto-kind "no solution found" message still flows
 * through the fallback as a truthy `solution` — see REVIEW.md CR-03
 * for why that sub-case is deferred pending a live-Agda probe.
 */
export async function autoOne(
  ctx: AgdaCommandContext,
  goalId: number,
  payload = "",
): Promise<AutoResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(rewriteGoalCommand("Cmd_autoOne", "Normalised", goalId, quoted(payload))),
  );
  throwOnFatalProtocolStderr(responses);
  ctx.syncGoalIdsFromResponses(responses);
  const errorText = detectDisplayInfoError(responses);
  const rejected = errorText !== null && !hasGiveActionResponse(responses);
  return {
    solution: decodeGiveLikeResponse(responses),
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/** List all unsolved metavariables (goals). */
export async function metas(
  ctx: AgdaCommandContext,
): Promise<{ goals: AgdaGoal[]; text: string; errors: string[]; warnings: string[] }> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(rewriteTopLevelCommand("Cmd_metas", "Normalised")),
  );
  throwOnFatalProtocolStderr(responses);

  const decoded = decodeLoadDisplayResponses(responses);
  const text = decodeDisplayInfoEvents(responses)
    .map((event) => event.text)
    .filter(Boolean)
    .at(-1) ?? "";
  const goals = decoded.visibleGoals.map((goal) => ({
    goalId: goal.goalId,
    type: goal.type,
    context: [] as string[],
  }));

  const derivedGoalIds = decoded.visibleGoals.map((goal) => goal.goalId);
  ctx.syncGoalIdsFromResponses(responses);

  // Fall back only when Cmd_metas produced no goal-state evidence at all.
  if (goals.length === 0 && derivedGoalIds.length === 0 && ctx.goalIds.length > 0) {
    goals.push(...ctx.goalIds.map((id) => ({ goalId: id, type: "?", context: [] as string[] })));
  }

  return {
    goals,
    text,
    errors: decoded.errors,
    warnings: decoded.warnings,
  };
}
