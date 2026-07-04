// MIT License — see LICENSE
//
// Goal interaction tools: type/context queries and checked/inferred-
// term lookups (read-only). Write-capable proof actions (case split,
// give, refine, refine_exact, intro, auto) live in
// goal-write-tools.ts — split out once this file approached the
// project's 500-line-per-file ceiling; see that file's header for the
// CR-01/CR-02/CR-03 rejection-detection work that triggered the
// split.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AgdaSession } from "../agda-process.js";
import { registerGoalTextTool } from "./tool-helpers.js";
import { goalIdSchema } from "./tool-schemas.js";
import { register as registerGoalWriteTools } from "./goal-write-tools.js";

export function register(
  server: McpServer,
  session: AgdaSession,
  repoRoot: string,
): void {
  registerGoalTextTool({
    server,
    session,
    name: "agda_goal_type",
    description: "Show the type and local context for a specific goal. Requires a file to be loaded first via agda_load.",
    category: "proof",
    protocolCommands: ["Cmd_goal_type_context"],
    inputSchema: { goalId: goalIdSchema.describe("The goal ID (from agda_load output)") },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      goalType: z.string(),
      context: z.array(z.string()),
    }),
    callback: async ({ goalId }) => {
      const info = await session.goal.typeContext(goalId);
      let output = `## Goal ?${goalId}\n\n`;
      if (info.context.length > 0) {
        output += `### Context\n\`\`\`agda\n${info.context.join("\n")}\n\`\`\`\n\n`;
      }
      output += `### Goal type\n\`\`\`agda\n${info.type || "(unknown)"}\n\`\`\`\n`;
      return {
        text: output,
        data: { goalType: info.type ?? "", context: info.context },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_goal",
    description: "Show only the current goal type for a specific goal, using Agda's exact Cmd_goal_type query.",
    category: "proof",
    protocolCommands: ["Cmd_goal_type"],
    inputSchema: { goalId: goalIdSchema.describe("The goal ID (from agda_load output)") },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      goalType: z.string(),
    }),
    callback: async ({ goalId }) => {
      const info = await session.goal.type(goalId);
      const text = `## Goal ?${goalId}\n\n### Goal type\n\`\`\`agda\n${info.type || "(unknown)"}\n\`\`\`\n`;
      return { text, data: { goalType: info.type ?? "" } };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_context",
    description: "Show only the local context for a specific goal, using Agda's exact Cmd_context query.",
    category: "proof",
    protocolCommands: ["Cmd_context"],
    inputSchema: { goalId: goalIdSchema.describe("The goal ID (from agda_load output)") },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      context: z.array(z.string()),
    }),
    callback: async ({ goalId }) => {
      const info = await session.goal.context(goalId);
      let output = `## Context for ?${goalId}\n\n`;
      output += info.context.length > 0
        ? `\`\`\`agda\n${info.context.join("\n")}\n\`\`\`\n`
        : "(empty context)\n";
      return { text: output, data: { context: info.context } };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_goal_type_context_check",
    description: "Show the goal context, goal type, and checked elaborated term for an expression in a goal context.",
    category: "proof",
    protocolCommands: ["Cmd_goal_type_context_check"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID for context"),
      expr: z.string().describe("The Agda expression to check against the goal type"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      expr: z.string(),
      goalType: z.string(),
      context: z.array(z.string()),
      checkedExpr: z.string(),
    }),
    callback: async ({ goalId, expr }) => {
      const result = await session.goal.typeContextCheck(goalId, expr as string);
      let output = `## Goal ?${goalId}, context, and checked term\n\n`;
      if (result.context.length > 0) {
        output += `### Context\n\n\`\`\`agda\n${result.context.join("\n")}\n\`\`\`\n\n`;
      }
      output += `### Goal type\n\n\`\`\`agda\n${result.goalType || "(unknown)"}\n\`\`\`\n\n`;
      output += `### Checked term for \`${expr}\`\n\n\`\`\`agda\n${result.checkedExpr || "(no checked term returned)"}\n\`\`\`\n`;
      return {
        text: output,
        data: {
          expr: expr as string,
          goalType: result.goalType ?? "",
          context: result.context,
          checkedExpr: result.checkedExpr ?? "",
        },
      };
    },
  });

  registerGoalTextTool({
    server,
    session,
    name: "agda_goal_type_context_infer",
    description: "Show the goal context, goal type, and inferred type of an expression in a goal context.",
    category: "proof",
    protocolCommands: ["Cmd_goal_type_context_infer"],
    inputSchema: {
      goalId: goalIdSchema.describe("The goal ID for context"),
      expr: z.string().describe("The Agda expression to infer in context"),
    },
    outputDataSchema: z.object({
      text: z.string(),
      goalId: goalIdSchema,
      expr: z.string(),
      goalType: z.string(),
      context: z.array(z.string()),
      inferredType: z.string(),
    }),
    callback: async ({ goalId, expr }) => {
      const result = await session.query.goalTypeContextInfer(goalId, expr as string);
      let output = `## Goal ?${goalId}, context, and inferred type\n\n`;
      if (result.context.length > 0) {
        output += `### Context\n\n\`\`\`agda\n${result.context.join("\n")}\n\`\`\`\n\n`;
      }
      output += `### Goal type\n\n\`\`\`agda\n${result.goalType || "(unknown)"}\n\`\`\`\n\n`;
      output += `### Inferred type for \`${expr}\`\n\n\`\`\`agda\n${result.inferredType || "(unable to infer)"}\n\`\`\`\n`;
      return {
        text: output,
        data: {
          expr: expr as string,
          goalType: result.goalType ?? "",
          context: result.context,
          inferredType: result.inferredType ?? "",
        },
      };
    },
  });

  registerGoalWriteTools(server, session, repoRoot);
}
