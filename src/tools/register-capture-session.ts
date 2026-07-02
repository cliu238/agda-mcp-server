// MIT License — see LICENSE
//
// agda_capture_session registration (CAP-03). The walking-skeleton
// emit-only capture verb: state-agnostic (D-01 — callable from any
// session state, including zero prior interaction), stages the full
// CaptureArtifact out-of-repo under a gitignored .agda-mcp/captures/
// directory, and returns a lightweight CaptureReference in
// ToolResult.data (D-09/P2) — never the full artifact.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AgdaSession } from "../agda-process.js";
import {
  buildReplayManifest,
  fingerprintBugReport,
  readDedupIndex,
  routeDedup,
} from "../agda/session-capture/session-capture.js";
import type { CaptureArtifact, CaptureReference } from "../agda/session-capture/session-capture.js";
import { writeFileAtomic } from "../session/safe-source-io.js";

import { errorEnvelope, makeToolResult, okEnvelope, registerStructuredTool } from "./tool-helpers.js";

const captureReferenceDataSchema = z.object({
  stagedPath: z.string(),
  fingerprint: z.string(),
  kind: z.enum(["new-bug", "update"]),
  recurrence: z.number(),
  summary: z.string(),
  keyDiagnostics: z.array(z.string()),
  nextAction: z.string(),
  sessionClassification: z.string().nullable(),
});

export function registerCaptureSession(
  server: McpServer,
  session: AgdaSession,
  repoRoot: string,
): void {
  registerStructuredTool({
    server,
    name: "agda_capture_session",
    description:
      "Snapshot the current session — stuck, failed, or a suspicious 'green' — into a self-replaying capture artifact. State-agnostic: does not judge whether the session is correct, only records it (that judgment belongs to Phase 2's oracle). Emit-only: writes nothing into the repo tree; the full artifact is staged out-of-repo and this tool returns a lightweight reference to it.",
    category: "reporting",
    requiresLoadedSession: false,
    inputSchema: {
      note: z.string().optional().describe(
        "Optional free-text note about why this session is being captured",
      ),
    },
    outputDataSchema: captureReferenceDataSchema,
    callback: async (inputs: { note?: string }) => {
      try {
        const manifest = buildReplayManifest(session);
        // D-10 guardrail: the underlying session's load/typecheck
        // verdict must be threaded into the returned reference, not
        // just used internally to compute the fingerprint.
        const sessionClassification = session.getLastClassification() ?? null;

        const fingerprint = fingerprintBugReport({
          kind: "new-bug",
          affectedTool: "agda_capture_session",
          classification: sessionClassification ?? "unknown",
          observed: inputs.note ?? "session capture",
          expected: "",
          reproduction: [],
          serverVersion: manifest.serverVersion,
        });

        const index = readDedupIndex(repoRoot);
        const dedup = routeDedup(index, fingerprint);

        const artifact: CaptureArtifact = {
          capturedAt: new Date().toISOString(),
          manifest,
          recordedActions: [],
          oracleSubstrate: null,
          dedup,
          note: inputs.note,
        };

        const captureDir = join(repoRoot, ".agda-mcp", "captures");
        mkdirSync(captureDir, { recursive: true });
        const stagedPath = join(captureDir, `${dedup.fingerprint}-${dedup.recurrence}.json`);
        await writeFileAtomic(stagedPath, JSON.stringify(artifact, null, 2));

        const data: CaptureReference = {
          stagedPath,
          fingerprint: dedup.fingerprint,
          kind: dedup.kind,
          recurrence: dedup.recurrence,
          summary: `${dedup.kind} capture ${dedup.fingerprint} (session: ${sessionClassification ?? "no-load"})`,
          keyDiagnostics: [],
          nextAction:
            "Phase 2's oracle triad will judge this capture once implemented; for now it is recorded for later replay.",
          sessionClassification,
        };

        return makeToolResult(
          okEnvelope({
            tool: "agda_capture_session",
            summary: data.summary,
            classification: "captured",
            data: { ...data },
          }),
          data.summary,
        );
      } catch (err) {
        const message = `Session capture failed: ${err instanceof Error ? err.message : String(err)}`;
        return makeToolResult(
          errorEnvelope({
            tool: "agda_capture_session",
            summary: message,
            classification: "tool-error",
            data: {},
          }),
          message,
        );
      }
    },
  });
}
