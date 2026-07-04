import type { AgdaResponse } from "../../agda/types.js";
import {
  displayInfoResponseSchema,
  giveActionResponseSchema,
  makeCaseResponseSchema,
  parseResponseWithSchema,
  solveAllResponseSchema,
} from "../response-schemas.js";
import { decodeDisplayInfoEvents } from "./display-info.js";

/**
 * True iff `obj` is a non-null object that owns the named property
 * directly (i.e. not inherited from the prototype chain). Used in
 * place of `"key" in obj` when we're testing an untrusted parse
 * result — the `in` operator walks the prototype chain, so a
 * process-wide pollution of `Object.prototype.paren` would fool the
 * original check. `Object.hasOwn` never looks past the object
 * itself.
 */
function hasOwnKey<K extends string>(
  obj: unknown,
  key: K,
): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && Object.hasOwn(obj, key);
}

/**
 * Render a GiveResult value as human-readable text.
 *
 * Agda 2.9.0 serializes GiveResult as `{"paren":true}` or `{"paren":false}`.
 * After wire normalization this arrives as the string `'{"paren":false}'`.
 * We detect this pattern and return a meaningful message instead of raw JSON.
 */
function renderGiveResult(val: string): string {
  try {
    const parsed = JSON.parse(val);
    if (hasOwnKey(parsed, "paren")) {
      return "Term accepted";
    }
  } catch {
    // Not JSON — use as-is
  }
  return val;
}

/**
 * Scan `responses` for an Agda-reported Error DisplayInfo — the same
 * `info.kind === "Error"` idiom used by parse-load-responses.ts and
 * src/protocol/responses/backend.ts. Returns the decoded error text,
 * or null when no Error display is present.
 *
 * Shared across every function that has to distinguish "Agda
 * rejected/errored the request" from "Agda produced a real result":
 * give()/refine()/refineExact()/intro()/caseSplit()/autoOne() (all in
 * goal-operations.ts, fingerprint bfcba437f5426fd6, CR-01/CR-02/
 * CR-03) and autoAll()/elaborate() (advanced-queries.ts, CR-04) — an
 * ill-typed expression arrives as a normal DisplayInfo response, not
 * a fatal stderr line, so throwOnFatalProtocolStderr never sees it.
 * Promoted from a goal-operations.ts-private helper to this shared
 * module so advanced-queries.ts can reuse it without duplicating the
 * scan (CR-04).
 */
export function detectDisplayInfoError(responses: AgdaResponse[]): string | null {
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

/**
 * Guard used by every proof-action tool before writing a result to
 * the source file. A write should only happen when the candidate is
 * a non-null, non-empty string. An empty string would remove the
 * hole marker without replacing it, silently corrupting the source.
 *
 * Unified helper to eliminate drift between give/refine/refine_exact/
 * intro/auto callbacks (each was subtly different — see PR #37
 * audit H4).
 */
export function hasReplacementText(
  candidate: string | null | undefined,
): candidate is string {
  return typeof candidate === "string" && candidate.length > 0;
}

/**
 * Determine the replacement text for a give-like action.
 *
 * Agda's GiveResult tells us:
 * - Give_String s  → replace the hole with string `s`
 * - Give_Paren     → keep the input expression, parenthesized
 * - Give_NoParen   → keep the input expression as-is
 *
 * Returns the text that should replace the hole in the source file,
 * or null if no GiveAction was found in the responses.
 */
export function resolveGiveReplacementText(
  responses: AgdaResponse[],
  inputExpr: string,
): string | null {
  for (const resp of responses) {
    const give = parseResponseWithSchema(giveActionResponseSchema, resp);
    if (!give) continue;
    const val = give.giveResult ?? give.result ?? "";
    if (!val) return inputExpr;

    try {
      const parsed = JSON.parse(val);
      if (hasOwnKey(parsed, "paren")) {
        return parsed.paren ? `(${inputExpr})` : inputExpr;
      }
    } catch {
      // Not JSON — treat as Give_String
    }
    // Give_String: Agda returned the actual replacement text
    return val;
  }
  return null;
}

export function decodeGiveLikeResponse(responses: AgdaResponse[]): string {
  let result = "";
  const displayMessages = decodeDisplayInfoEvents(responses)
    .map((event) => event.text)
    .filter(Boolean);

  for (const resp of responses) {
    const give = parseResponseWithSchema(giveActionResponseSchema, resp);
    if (give) {
      const val = give.giveResult ?? give.result ?? "";
      if (val) result = renderGiveResult(val);
      continue;
    }

    if (parseResponseWithSchema(displayInfoResponseSchema, resp)) {
      continue;
    }
  }

  return result || displayMessages.at(-1) || "";
}

/**
 * True iff `responses` contains at least one schema-conformant
 * GiveAction response WITH a non-empty payload — i.e. Agda actually
 * accepted/produced a term (give, refine-like, or a successful
 * auto-solve), as opposed to decodeGiveLikeResponse()'s raw-DisplayInfo
 * fallback (which fires on a rejected/errored command too). autoOne()/
 * autoAll() use this to require BOTH an Error display AND no genuine
 * GiveAction response before classifying a result as rejected — the
 * same two-sided guard give()/refine() use via hasReplacementText()
 * (CR-03/CR-04).
 *
 * Checks payload non-emptiness (`giveResult`/`result`), not just
 * response-kind presence: `giveActionResponseSchema` permits both
 * fields to be absent/empty, and decodeGiveLikeResponse() only treats
 * the response as a real result when `val` (`giveResult ?? result`) is
 * truthy — mirroring that same check here closes a gap where a
 * schema-conformant-but-empty-payload GiveAction could co-occur with
 * an Error DisplayInfo in the same batch and be misread as "a genuine
 * action is present" (WR-04).
 */
export function hasGiveActionResponse(responses: AgdaResponse[]): boolean {
  return responses.some((resp) => {
    const give = parseResponseWithSchema(giveActionResponseSchema, resp);
    return give !== null && Boolean(give.giveResult ?? give.result);
  });
}

/** Extract structured solutions from SolveAll responses. */
export function decodeSolveRawSolutions(
  responses: AgdaResponse[],
): Array<{ goalId: number; expr: string }> {
  const results: Array<{ goalId: number; expr: string }> = [];
  for (const resp of responses) {
    const solveAll = parseResponseWithSchema(solveAllResponseSchema, resp);
    if (solveAll) {
      for (const solution of solveAll.solutions ?? []) {
        if (solution.expression) {
          results.push({ goalId: solution.interactionPoint, expr: solution.expression });
        }
      }
    }
  }
  return results;
}

export function decodeSolveResponses(responses: AgdaResponse[]): string[] {
  const solutions: string[] = [];

  for (const resp of responses) {
    const solveAll = parseResponseWithSchema(solveAllResponseSchema, resp);
    if (solveAll) {
      for (const solution of solveAll.solutions ?? []) {
        if (solution.expression) {
          solutions.push(`?${solution.interactionPoint} := ${solution.expression}`);
        }
      }
      continue;
    }

    if (parseResponseWithSchema(displayInfoResponseSchema, resp)) {
      continue;
    }
  }

  if (solutions.length === 0) {
    solutions.push(
      ...decodeDisplayInfoEvents(responses)
        .map((event) => event.text)
        .filter(Boolean),
    );
  }

  return solutions;
}

export function decodeCaseSplitResponses(responses: AgdaResponse[]): string[] {
  const clauses: string[] = [];

  for (const response of responses) {
    const makeCase = parseResponseWithSchema(makeCaseResponseSchema, response);
    if (!makeCase) {
      continue;
    }

    clauses.push(...(makeCase.clauses ?? []).filter(Boolean));
  }

  if (clauses.length > 0) {
    return clauses;
  }

  return decodeDisplayInfoEvents(responses)
    .map((event) => event.text)
    .filter(Boolean);
}

/**
 * True iff `responses` contains at least one schema-conformant
 * MakeCase response WITH at least one non-empty clause — i.e. Agda
 * actually produced new clauses, as opposed to
 * decodeCaseSplitResponses()'s raw-DisplayInfo fallback (which fires
 * on a rejected/invalid Cmd_make_case too — a rejected case-split has
 * no MakeCase response at all, only an Error DisplayInfo). caseSplit()
 * uses this to require BOTH an Error display AND no genuine MakeCase
 * response before classifying a result as rejected, the same
 * two-sided guard give()/refine() use via hasReplacementText()
 * (CR-02).
 *
 * Checks clause non-emptiness, not just response-kind presence:
 * `makeCaseResponseSchema` permits `clauses` to be absent/empty, and
 * decodeCaseSplitResponses() only treats the response as real clauses
 * when at least one survives its own `.filter(Boolean)` — mirroring
 * that same check here closes a gap where a schema-conformant-but-
 * empty-clauses MakeCase response could co-occur with an Error
 * DisplayInfo in the same batch and be misread as "a genuine split is
 * present" (WR-04).
 */
export function hasMakeCaseResponse(responses: AgdaResponse[]): boolean {
  return responses.some((resp) => {
    const makeCase = parseResponseWithSchema(makeCaseResponseSchema, resp);
    return makeCase !== null && (makeCase.clauses ?? []).some(Boolean);
  });
}
