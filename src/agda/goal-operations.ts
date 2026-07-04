// MIT License — see LICENSE
//
// Goal-oriented Agda interaction commands.

import type {
  AgdaCommandContext,
  AgdaResponse,
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
  hasReplacementText,
  resolveGiveReplacementText,
} from "../protocol/responses/proof-actions.js";
import { decodeDisplayInfoEvents } from "../protocol/responses/display-info.js";
import { decodeLoadDisplayResponses } from "../protocol/responses/load-display.js";
import { decodeGoalExpressionDisplayResponses } from "../protocol/responses/goal-expression-display.js";
import {
  displayInfoResponseSchema,
  parseResponseWithSchema,
} from "../protocol/response-schemas.js";
import {
  goalCommand,
  modeGoalCommand,
  quoted,
  rewriteTopLevelCommand,
  rewriteGoalCommand,
} from "../protocol/command-builder.js";
import { throwOnFatalProtocolStderr } from "./protocol-errors.js";

/**
 * Scan `responses` for an Agda-reported Error DisplayInfo — the same
 * `info.kind === "Error"` idiom used by parse-load-responses.ts and
 * src/protocol/responses/backend.ts. Returns the decoded error text,
 * or null when no Error display is present.
 *
 * give() uses this because an ill-typed expression arrives as a
 * normal DisplayInfo response, not a fatal stderr line —
 * throwOnFatalProtocolStderr never sees it (fingerprint
 * bfcba437f5426fd6).
 */
function detectResponseError(responses: AgdaResponse[]): string | null {
  for (const resp of responses) {
    if (resp.kind !== "DisplayInfo") continue;
    const display = parseResponseWithSchema(displayInfoResponseSchema, resp);
    if (!display) continue;
    if (display.info.kind === "Error") {
      return decodeDisplayInfoEvents([resp]).at(-1)?.text ?? "";
    }
  }
  return null;
}

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
 * detectResponseError(), fingerprint bfcba437f5426fd6).
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
  const errorText = detectResponseError(responses);
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

/** Case-split on a variable in a goal. */
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
  return { clauses: decodeCaseSplitResponses(responses) };
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
  const errorText = detectResponseError(responses);
  const rejected = errorText !== null && !hasReplacementText(replacementText);
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText,
    rejected,
    rejectionText: rejected ? errorText : null,
  };
}

/** Refine a goal — apply a function and create subgoals. */
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
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText: resolveGiveReplacementText(responses, expr),
  };
}

/** Refine a goal using Agda's exact Cmd_refine command. */
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
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText: resolveGiveReplacementText(responses, expr),
  };
}

/** Introduce a lambda or constructor using Agda's exact Cmd_intro command. */
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
  return {
    result: decodeGiveLikeResponse(responses),
    replacementText: resolveGiveReplacementText(responses, expr),
  };
}

/** Auto-solve a single goal. */
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
  return { solution: decodeGiveLikeResponse(responses) };
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
