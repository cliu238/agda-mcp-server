// MIT License — see LICENSE
//
// Expression-level Agda commands: compute (normalize) and infer (type-check).

import type {
  AgdaCommandContext,
  AgdaResponse,
  ComputeResult,
  InferResult,
} from "./types.js";
import { modeGoalCommand, modeTopLevelCommand, quoted } from "../protocol/command-builder.js";
import { decodeExpressionDisplayResponses } from "../protocol/responses/expression-display.js";
import { decodeDisplayInfoEvents } from "../protocol/responses/display-info.js";
import {
  displayInfoResponseSchema,
  parseResponseWithSchema,
} from "../protocol/response-schemas.js";

/**
 * Scan `responses` for an Agda-reported Error DisplayInfo — the same
 * `info.kind === "Error"` idiom used by goal-operations.ts's
 * detectResponseError() (fingerprint bfcba437f5426fd6) and
 * parse-load-responses.ts/backend.ts. A rejected compute/infer (e.g. a
 * NotInScope identifier) arrives this way, not via stderr, so
 * throwOnFatalProtocolStderr never sees it and the decoded
 * normalForm/inferredType silently stays "" — every caller here must
 * check explicitly instead (fingerprint e5f6de1fa365b887).
 */
function throwOnDisplayError(responses: AgdaResponse[]): void {
  for (const resp of responses) {
    if (resp.kind !== "DisplayInfo") continue;
    const display = parseResponseWithSchema(displayInfoResponseSchema, resp);
    if (!display) continue;
    if (display.info.kind === "Error") {
      throw new Error(decodeDisplayInfoEvents([resp]).at(-1)?.text ?? "Agda reported an error");
    }
  }
}

/**
 * Normalize (evaluate) a term in a goal context.
 */
export async function compute(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<ComputeResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_compute", "DefaultCompute", goalId, quoted(expr))),
  );
  throwOnDisplayError(responses);
  const decoded = decodeExpressionDisplayResponses(responses);
  return { normalForm: decoded.normalForm };
}

/**
 * Normalize a top-level expression (not in a goal context).
 */
export async function computeTopLevel(
  ctx: AgdaCommandContext,
  expr: string,
): Promise<ComputeResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeTopLevelCommand("Cmd_compute_toplevel", "DefaultCompute", quoted(expr))),
  );
  throwOnDisplayError(responses);
  const decoded = decodeExpressionDisplayResponses(responses);
  return {
    normalForm: decoded.normalForm,
  };
}

/**
 * Infer the type of an expression in a goal context.
 */
export async function infer(
  ctx: AgdaCommandContext,
  goalId: number,
  expr: string,
): Promise<InferResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeGoalCommand("Cmd_infer", "Normalised", goalId, quoted(expr))),
  );
  throwOnDisplayError(responses);
  const decoded = decodeExpressionDisplayResponses(responses);
  return { type: decoded.inferredType };
}

/**
 * Infer the type of a top-level expression.
 */
export async function inferTopLevel(
  ctx: AgdaCommandContext,
  expr: string,
): Promise<InferResult> {
  ctx.requireFile();
  const responses = await ctx.sendCommand(
    ctx.iotcm(modeTopLevelCommand("Cmd_infer_toplevel", "Normalised", quoted(expr))),
  );
  throwOnDisplayError(responses);
  const decoded = decodeExpressionDisplayResponses(responses);
  return {
    type: decoded.inferredType,
  };
}
