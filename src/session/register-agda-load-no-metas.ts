// MIT License — see LICENSE
//
// agda_load_no_metas tool registration.
//
// Strict variant of agda_load: it fails the load if any hole or unsolved
// metavariable remains. Implemented over Cmd_load (which emits a real
// goal-state terminus) with strict rejection applied at the
// classification layer — a clean Cmd_load_no_metas emits no terminus, so
// its completion could only be guessed from an idle gap and a slow
// module's silent type-check could resolve it mid-load as a false
// success. profileOptions is deliberately not exposed here — callers who
// need profiling should use agda_load.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { existsSync } from "node:fs";
import { relative } from "node:path";

import { AgdaSession, filePathDescription } from "../agda-process.js";
import {
  errorDiagnostic,
  infoDiagnostic,
  makeToolResult,
  okEnvelope,
  registerStructuredTool,
  type ToolDiagnostic,
  warningDiagnostic,
} from "../tools/tool-helpers.js";
import { loadDataSchema, renderLoadLikeText } from "./tool-presentation.js";
import { PathSandboxError, resolveExistingPathWithinRoot } from "../repo-root.js";

import {
  invalidPathResult,
  missingFileResult,
  processErrorResult,
  resolveRequestedFilePath,
  type PathResolver,
} from "./load-tool-shared.js";

export function registerAgdaLoadNoMetas(
  server: McpServer,
  session: AgdaSession,
  repoRoot: string,
  resolveInputFile: PathResolver,
): void {
  registerStructuredTool({
    server,
    name: "agda_load_no_metas",
    description: "Load and type-check an Agda file strictly, failing if any hole or unsolved metavariable remains after loading. Profiling options are not supported here; use agda_load with profileOptions for profiled type-checking.",
    category: "session",
    protocolCommands: ["Cmd_load"],
    requiresLoadedSession: false,
    inputSchema: {
      file: z.string().describe(filePathDescription(session.getAgdaVersion() ?? undefined)),
    },
    outputDataSchema: loadDataSchema,
    callback: async ({ file }: { file: string }) => {
      const startMs = performance.now();
      let requestedFilePath: string;
      try {
        requestedFilePath = resolveRequestedFilePath(repoRoot, file, resolveInputFile);
      } catch (err) {
        if (!(err instanceof PathSandboxError)) {
          throw err;
        }
        return invalidPathResult("agda_load_no_metas", file);
      }
      if (!existsSync(requestedFilePath)) {
        return missingFileResult("agda_load_no_metas", requestedFilePath);
      }

      try {
        const filePath = resolveExistingPathWithinRoot(repoRoot, requestedFilePath);

        // Same session-history read agda_load performs (register-agda-load.ts)
        // — fingerprint 3306edf4c2d01c53 (RT8): this tool previously
        // hardcoded reloaded/staleBeforeLoad to false and never
        // surfaced previousClassification, so a genuine reload
        // regression (a dependency changed underneath an
        // already-loaded file) was reported identically to a
        // first-ever load. Report-side only — no new session-state
        // tracking is introduced here.
        const previousFile = session.getLoadedFile();
        const isReload = previousFile === filePath;
        const wasStale = isReload && session.isFileStale();
        const previousClassification = isReload
          ? (session.getLastClassification?.() ?? null)
          : null;
        const previousLoadedAtMs = isReload
          ? (session.getLastLoadedAt?.() ?? null)
          : null;

        const result = await session.loadNoMetas(filePath);
        const relPath = relative(repoRoot, requestedFilePath);
        const elapsedMs = Math.round(performance.now() - startMs);

        const diagnostics: ToolDiagnostic[] = [
          ...result.errors.map((message) => errorDiagnostic(message, "agda-error")),
          ...result.warnings.map((message) => warningDiagnostic(message, "agda-warning")),
        ];

        const previousWasSuccess = previousClassification === "ok-complete"
          || previousClassification === "ok-with-holes";
        if (isReload && previousWasSuccess && !result.success) {
          const ageSeconds = previousLoadedAtMs !== null
            ? Math.max(0, Math.round((Date.now() - previousLoadedAtMs) / 1000))
            : null;
          const ageSuffix = ageSeconds !== null ? ` ${ageSeconds}s ago` : "";
          diagnostics.push(
            infoDiagnostic(
              `Regression: this file loaded as ${previousClassification}${ageSuffix}. `
                + "It may have been modified since, or a dependency may have changed.",
              "session-regression",
            ),
          );
        }

        const text = renderLoadLikeText({
          heading: "Loaded without metas",
          file: relPath,
          success: result.success,
          classification: result.classification,
          goalIds: result.goals.map((goal) => goal.goalId),
          goalCount: result.goalCount,
          invisibleGoalCount: result.invisibleGoalCount,
          errors: result.errors,
          warnings: result.warnings,
          reloaded: isReload,
          staleBeforeLoad: wasStale,
          profiling: result.profiling,
          elapsedMs,
        });

        return makeToolResult(
          okEnvelope({
            tool: "agda_load_no_metas",
            summary: `Strictly loaded ${relPath} with classification ${result.classification} (${elapsedMs}ms).`,
            classification: result.classification,
            data: {
              file: relPath,
              success: result.success,
              goalIds: result.goals.map((goal) => goal.goalId),
              goalCount: result.goalCount,
              invisibleGoalCount: result.invisibleGoalCount,
              hasHoles: result.hasHoles,
              isComplete: result.isComplete,
              classification: result.classification,
              errors: result.errors,
              warnings: result.warnings,
              reloaded: isReload,
              staleBeforeLoad: wasStale,
              profiling: result.profiling,
              previousClassification,
              previousLoadedAtMs,
            },
            diagnostics,
            stale: session.isFileStale() || undefined,
            provenance: { file: filePath, protocolCommands: ["Cmd_load"] },
            elapsedMs,
          }),
          text,
        );
      } catch (err) {
        if (err instanceof PathSandboxError) {
          return invalidPathResult("agda_load_no_metas", file);
        }
        return processErrorResult(
          "agda_load_no_metas",
          file,
          `Agda strict load failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  });
}
