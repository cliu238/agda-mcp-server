// MIT License — see LICENSE
//
// Write-capable proof-action goal tools: case split, give, refine,
// refine_exact, intro, auto. Split out of goal-tools.ts (which stays
// as a thin barrel covering the read-only goal/context/checked-term
// queries) once the CR-01/CR-02/CR-03 rejection-detection call sites
// pushed goal-tools.ts past the project's 500-line-per-file ceiling —
// the same barrel/focused-sibling pattern already used by
// src/agda/agent-ux.ts and src/tools/agent-ux-tools.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgdaSession } from "../agda-process.js";
import { registerGoalTextTool, giveRejectedError, throwIfWriteRejected } from "./tool-helpers.js";
import { applyEditAndReload } from "../session/reload-and-diagnose.js";
import { hasReplacementText } from "../protocol/responses/proof-actions.js";
import { buildAutoSearchPayload } from "../agda/agent-ux.js";
import { goalIdSchema } from "./tool-schemas.js";

// Appended to every write-capable proof-action tool description so
// MCP clients surface the 512 KiB guard in their introspection. The
// cap is shared with `agda_apply_edit` and the raw edit primitives
// in `apply-proof-edit.ts`; see `MAX_AGDA_SOURCE_BYTES` there.
const WRITE_LIMITS_NOTE =
  " File writes are capped at 512 KiB of Agda source; larger files are refused.";

export function register(
  server: McpServer,
  session: AgdaSession,
  _repoRoot: string,
): void {
  registerGoalTextTool({
    server,
    session,
    name: "agda_case_split",
    description: "Case-split on a variable in a goal. Returns the new function clauses that replace the current clause. By default, writes changes to the file and reloads." + WRITE_LIMITS_NOTE,
    category: "proof",
    protocolCommands: ["Cmd_make_case"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID to case-split in"),
      variable: z.string().describe("The variable name to case-split on"),
      writeToFile: z.boolean().optional().describe("Write changes to the file and reload (default: true)"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      variable: z.string(),
      clauses: z.array(z.string()),
      written: z.boolean(),
    }),
    callback: async ({ goalId, variable, writeToFile }) => {
      const shouldWrite = writeToFile !== false;
      const goalIdsBefore = session.getGoalIds();
      const result = await session.goal.caseSplit(goalId, variable as string);
      throwIfWriteRejected("agda_case_split", goalId, variable as string, result);
      let output = `## Case split on \`${variable}\` in ?${goalId}\n\n`;
      let written = false;
      if (result.clauses.length > 0) {
        output += `### New clauses\n\`\`\`agda\n${result.clauses.join("\n")}\n\`\`\`\n`;

        if (shouldWrite && session.currentFile) {
          output += await applyEditAndReload(session, goalIdsBefore, {
            kind: "replace-line", goalId, clauses: result.clauses,
          });
          written = true;
        } else {
          output += `\nReplace the original clause with these, then call \`agda_load\` to reload.\n`;
        }
      } else {
        output += `No clauses generated. The variable may not be splittable.\n`;
      }
      return {
        text: output,
        data: {
          variable: variable as string,
          clauses: result.clauses,
          written,
        },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_give",
    description: "Fill a goal with an expression. If the expression type-checks against the goal type, the goal is solved. By default, writes the change to the file and reloads." + WRITE_LIMITS_NOTE,
    category: "proof",
    protocolCommands: ["Cmd_give"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID to fill"),
      expr: z.string().describe("The Agda expression to give"),
      writeToFile: z.boolean().optional().describe("Write changes to the file and reload (default: true)"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      expr: z.string(),
      result: z.string(),
      replacementText: z.string().nullable(),
      written: z.boolean(),
    }),
    callback: async ({ goalId, expr, writeToFile }) => {
      const shouldWrite = writeToFile !== false;
      const exprStr = expr as string;
      const goalIdsBefore = session.getGoalIds();
      const result = await session.goal.give(goalId, exprStr);
      if (result.rejected) {
        throw giveRejectedError(goalId, exprStr, result.rejectionText ?? null);
      }
      let output = `## Give \`${exprStr}\` to ?${goalId}\n\n`;
      output += result.result ? `**Result:** \`${result.result}\`\n` : `Expression accepted.\n`;

      let written = false;
      if (shouldWrite && session.currentFile) {
        if (hasReplacementText(result.replacementText)) {
          output += await applyEditAndReload(session, goalIdsBefore, {
            kind: "replace-hole", goalId, expr: result.replacementText,
          });
          written = true;
        } else {
          output += `\nAgda did not return a confirmed replacement. Apply the expression manually if appropriate, then call \`agda_load\`.\n`;
        }
      }
      return {
        text: output,
        data: {
          expr: exprStr,
          result: result.result ?? "",
          replacementText: result.replacementText ?? null,
          written,
        },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_refine",
    description: "Refine a goal by applying a function. Creates new subgoals for the function's arguments. By default, writes changes to the file and reloads." + WRITE_LIMITS_NOTE,
    category: "proof",
    protocolCommands: ["Cmd_refine_or_intro"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID to refine"),
      expr: z.string().describe("The expression to refine with (can be empty to let Agda choose)"),
      writeToFile: z.boolean().optional().describe("Write changes to the file and reload (default: true)"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      expr: z.string(),
      result: z.string(),
      replacementText: z.string().nullable(),
      written: z.boolean(),
    }),
    callback: async ({ goalId, expr, writeToFile }) => {
      const shouldWrite = writeToFile !== false;
      const exprStr = expr as string;
      const goalIdsBefore = session.getGoalIds();
      const result = await session.goal.refine(goalId, exprStr);
      throwIfWriteRejected("agda_refine", goalId, exprStr, result);
      let output = `## Refine ?${goalId} with \`${exprStr || "(auto)"}\`\n\n`;
      output += result.result
        ? `**Result:** \`${result.result}\`\n`
        : `Refinement applied. Call \`agda_metas\` to see new goals.\n`;

      let written = false;
      if (shouldWrite && session.currentFile) {
        if (hasReplacementText(result.replacementText)) {
          output += await applyEditAndReload(session, goalIdsBefore, {
            kind: "replace-hole", goalId, expr: result.replacementText,
          });
          written = true;
        } else {
          output += `\nNo concrete replacement text was returned, so the file was not modified.\n`;
        }
      }
      return {
        text: output,
        data: {
          expr: exprStr,
          result: result.result ?? "",
          replacementText: result.replacementText ?? null,
          written,
        },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_refine_exact",
    description: "Refine a goal using Agda's exact Cmd_refine command. By default, writes changes to the file and reloads." + WRITE_LIMITS_NOTE,
    category: "proof",
    protocolCommands: ["Cmd_refine"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID to refine"),
      expr: z.string().describe("The expression to refine with"),
      writeToFile: z.boolean().optional().describe("Write changes to the file and reload (default: true)"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      expr: z.string(),
      result: z.string(),
      replacementText: z.string().nullable(),
      written: z.boolean(),
    }),
    callback: async ({ goalId, expr, writeToFile }) => {
      const shouldWrite = writeToFile !== false;
      const exprStr = expr as string;
      const goalIdsBefore = session.getGoalIds();
      const result = await session.goal.refineExact(goalId, exprStr);
      throwIfWriteRejected("agda_refine_exact", goalId, exprStr, result);
      let output = `## Exact refine ?${goalId} with \`${exprStr}\`\n\n`;
      output += result.result
        ? `**Result:** \`${result.result}\`\n`
        : "Refinement applied. Call `agda_metas` to inspect resulting goals.\n";

      let written = false;
      if (shouldWrite && session.currentFile) {
        if (hasReplacementText(result.replacementText)) {
          output += await applyEditAndReload(session, goalIdsBefore, {
            kind: "replace-hole", goalId, expr: result.replacementText,
          });
          written = true;
        } else {
          output += `\nNo confirmed replacement text was returned by Agda, so the file was left unchanged. Apply the refinement manually if needed.\n`;
        }
      }
      return {
        text: output,
        data: {
          expr: exprStr,
          result: result.result ?? "",
          replacementText: result.replacementText ?? null,
          written,
        },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_intro",
    description: "Introduce a lambda or constructor using Agda's exact Cmd_intro command. By default, writes changes to the file and reloads." + WRITE_LIMITS_NOTE,
    category: "proof",
    protocolCommands: ["Cmd_intro"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID to introduce into"),
      expr: z.string().optional().describe("Optional existing goal contents to use as input"),
      writeToFile: z.boolean().optional().describe("Write changes to the file and reload (default: true)"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      result: z.string(),
      replacementText: z.string().nullable(),
      written: z.boolean(),
    }),
    callback: async ({ goalId, expr, writeToFile }) => {
      const shouldWrite = writeToFile !== false;
      const exprStr = (expr as string | undefined) ?? "";
      const goalIdsBefore = session.getGoalIds();
      const result = await session.goal.intro(goalId, exprStr);
      throwIfWriteRejected("agda_intro", goalId, exprStr, result);
      let output = `## Intro ?${goalId}\n\n`;
      output += result.result
        ? `**Result:** \`${result.result}\`\n`
        : "Introduction applied. Call `agda_metas` to inspect resulting goals.\n";

      let written = false;
      if (shouldWrite && session.currentFile) {
        if (hasReplacementText(result.replacementText)) {
          output += await applyEditAndReload(session, goalIdsBefore, {
            kind: "replace-hole", goalId, expr: result.replacementText,
          });
          written = true;
        } else {
          output += `\nAgda did not return a confirmed replacement, so the file was left unchanged.\n`;
        }
      }
      return {
        text: output,
        data: {
          result: result.result ?? "",
          replacementText: result.replacementText ?? null,
          written,
        },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_auto",
    description: "Attempt to automatically solve a goal using Agda's proof search. By default, writes the solution to the file and reloads." + WRITE_LIMITS_NOTE,
    category: "proof",
    protocolCommands: ["Cmd_autoOne"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID to auto-solve"),
      depth: z.number().int().min(0).max(50).optional().describe("Optional search depth"),
      listCandidates: z.boolean().optional().describe("List candidate terms when no direct solution is found"),
      excludeHints: z.array(z.string()).optional().describe("Hints/modules to exclude from search"),
      hints: z.array(z.string()).optional().describe("Hints/modules to prioritize during search"),
      writeToFile: z.boolean().optional().describe("Write changes to the file and reload (default: true)"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      solution: z.string(),
      hasSolution: z.boolean(),
      searchPayload: z.string(),
      written: z.boolean(),
    }),
    callback: async ({ goalId, writeToFile, depth, listCandidates, excludeHints, hints }) => {
      const shouldWrite = writeToFile !== false;
      const goalIdsBefore = session.getGoalIds();
      const payload = buildAutoSearchPayload({
        depth: depth as number | undefined,
        listCandidates: listCandidates as boolean | undefined,
        excludeHints: excludeHints as string[] | undefined,
        hints: hints as string[] | undefined,
      });
      const result = await session.goal.autoOne(goalId, payload);
      throwIfWriteRejected("agda_auto", goalId, payload, result);
      let output = `## Auto-solve ?${goalId}\n\n`;
      output += result.solution ? `**Solution:** \`${result.solution}\`\n` : `No automatic solution found.\n`;
      if (payload.length > 0) {
        output += `\nSearch payload: \`${payload}\`\n`;
      }

      let written = false;
      if (shouldWrite && session.currentFile) {
        if (hasReplacementText(result.solution)) {
          output += await applyEditAndReload(session, goalIdsBefore, {
            kind: "replace-hole", goalId, expr: result.solution,
          });
          written = true;
        } else {
          output += `\nAuto returned no solution, so the file was left unchanged.\n`;
        }
      }
      return {
        text: output,
        data: {
          solution: result.solution ?? "",
          hasSolution: Boolean(result.solution),
          searchPayload: payload,
          written,
        },
      };
    },
  });
}
