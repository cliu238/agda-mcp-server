// MIT License — see LICENSE
//
// Tool invocation error type and helpers. Tools throw a
// ToolInvocationError when they want a specific classification,
// diagnostic list, and data payload surfaced in the error envelope;
// the wrappers in tool-registration.ts catch that exception shape and
// translate it into a final ToolResult via makeTextToolErrorResult.

import { PathSandboxError } from "../repo-root.js";

import {
  errorDiagnostic,
  infoDiagnostic,
  errorEnvelope,
  makeToolResult,
  type ToolDiagnostic,
  type ToolResult,
} from "./tool-envelope.js";

export class ToolInvocationError<T extends Record<string, unknown> = Record<string, unknown>> extends Error {
  classification: string;
  diagnostics: ToolDiagnostic[];
  data: T;
  text?: string;

  constructor(args: {
    message: string;
    classification?: string;
    diagnostics?: ToolDiagnostic[];
    data?: T;
    text?: string;
  }) {
    super(args.message);
    this.name = "ToolInvocationError";
    this.classification = args.classification ?? "tool-error";
    this.diagnostics = args.diagnostics ?? [errorDiagnostic(args.message)];
    this.data = args.data ?? ({} as T);
    this.text = args.text;
  }
}

export function missingPathToolError(kind: "file" | "directory", path: string): ToolInvocationError<{ path: string }> {
  const message = `${kind === "file" ? "File" : "Directory"} not found: ${path}`;
  return new ToolInvocationError({
    message,
    classification: "not-found",
    diagnostics: [
      errorDiagnostic(
        message,
        "not-found",
        kind === "file"
          ? "Confirm the path is relative to PROJECT_ROOT (or absolute and within it). " +
            "Use `agda_list_modules` to enumerate modules in a tier or " +
            "`agda_search_definitions` to locate a file by symbol name."
          : "Confirm the directory exists relative to PROJECT_ROOT. " +
            "Use `agda_list_modules` to enumerate available tiers and modules.",
      ),
      infoDiagnostic(
        "Check the file path relative to the project root.",
        "path-hint",
      ),
    ],
    data: { path },
  });
}

/**
 * A rejected `agda_give`: Agda declined the expression (an Error
 * DisplayInfo with no confirmed replacement), so the file was left
 * untouched. Classification `give-rejected` lets callers branch on
 * this specific outcome instead of a generic `tool-error`
 * (fingerprint bfcba437f5426fd6).
 */
export function giveRejectedError(
  goalId: number,
  expr: string,
  rejectionText: string | null,
): ToolInvocationError<{
  goalId: number;
  expr: string;
  result: string;
  replacementText: string | null;
  written: boolean;
}> {
  const message = `Agda rejected \`${expr}\` for goal ?${goalId} — the expression does not satisfy the goal type.`;
  return new ToolInvocationError({
    message,
    classification: "give-rejected",
    diagnostics: [
      errorDiagnostic(
        rejectionText ?? message,
        "give-rejected",
        "Inspect the goal with agda_goal_type_context_check, adjust the expression, and retry. The file was not modified.",
      ),
    ],
    data: { goalId, expr, result: rejectionText ?? "", replacementText: null, written: false },
  });
}

/**
 * Generalized `giveRejectedError` for give()'s sibling write-capable
 * proof actions (refine/refineExact/intro/case-split/auto): Agda
 * declined the request (an Error DisplayInfo with no confirmed
 * success action), so the source file was left untouched.
 * `classification` is derived from `tool` (`agda_case_split` ->
 * `case-split-rejected`) so callers can branch on the specific
 * rejecting tool instead of a generic `tool-error` — the same
 * "ok wraps a real Agda rejection" shape `giveRejectedError` closes
 * for `agda_give`, now closed for its sibling tools (CR-01/CR-02/
 * CR-03). `extraData` merges tool-specific fields (e.g. `clauses: []`
 * for case-split) onto the shared `{ goalId, written: false }` base;
 * the error envelope's `data` is not schema-validated, so this is
 * safe even though each tool's `outputDataSchema` differs.
 */
export function writeActionRejectedError(
  tool: string,
  goalId: number,
  attempted: string,
  rejectionText: string | null,
  extraData: Record<string, unknown> = {},
): ToolInvocationError<Record<string, unknown>> {
  const classification = `${tool.replace(/^agda_/, "").replace(/_/g, "-")}-rejected`;
  const message = attempted.length > 0
    ? `Agda rejected \`${attempted}\` for goal ?${goalId}.`
    : `Agda rejected the request for goal ?${goalId}.`;
  return new ToolInvocationError({
    message,
    classification,
    diagnostics: [
      errorDiagnostic(
        rejectionText ?? message,
        classification,
        "Inspect the goal with agda_goal_type_context_check, adjust the input, and retry. The file was not modified.",
      ),
    ],
    data: { goalId, written: false, ...extraData },
  });
}

/**
 * Throws `writeActionRejectedError(tool, ...)` iff `result.rejected`
 * is true; a no-op otherwise. Centralizes the branch-and-throw so
 * each write-capable proof-action callback in goal-tools.ts needs a
 * single call instead of an inline `if` block — goal-tools.ts sits at
 * the project's 500-line-per-file ceiling (CR-01/CR-02/CR-03).
 */
export function throwIfWriteRejected(
  tool: string,
  goalId: number,
  attempted: string,
  result: { rejected?: boolean; rejectionText?: string | null },
): void {
  if (!result.rejected) return;
  throw writeActionRejectedError(tool, goalId, attempted, result.rejectionText ?? null);
}

export function toToolInvocationError(err: unknown): ToolInvocationError {
  if (err instanceof ToolInvocationError) {
    return err;
  }

  if (err instanceof PathSandboxError) {
    return new ToolInvocationError({
      message: err.message,
      classification: "invalid-path",
      diagnostics: [errorDiagnostic(
        err.message,
        "invalid-path",
        "The path resolved outside the project sandbox (PROJECT_ROOT / AGDA_MCP_ROOT). " +
        "Pass a relative path or an absolute path inside the project root.",
      )],
      data: { path: err.targetPath },
    });
  }

  const message = err instanceof Error ? err.message : String(err);
  return new ToolInvocationError({
    message: `Error: ${message}`,
    classification: "tool-error",
    diagnostics: [errorDiagnostic(
      `Error: ${message}`,
      "unexpected-error",
      "Inspect the error message above. If it references the Agda subprocess, " +
      "run `agda_show_version` to verify the toolchain is reachable.",
    )],
  });
}

export function makeTextToolErrorResult(
  tool: string,
  err: unknown,
  defaultData: Record<string, unknown>,
): ToolResult<Record<string, unknown>> {
  const toolError = toToolInvocationError(err);
  return makeToolResult(
    errorEnvelope({
      tool,
      summary: toolError.message,
      classification: toolError.classification,
      data: { ...defaultData, ...toolError.data },
      diagnostics: toolError.diagnostics,
    }),
    toolError.text ?? toolError.message,
  );
}
