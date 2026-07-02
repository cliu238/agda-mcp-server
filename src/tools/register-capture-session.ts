// MIT License — see LICENSE
//
// agda_capture_session registration (CAP-01..CAP-05). The capstone
// capture verb: state-agnostic (D-01 — callable from any session
// state, including zero prior interaction), stages a full-fidelity
// CaptureArtifact (replay manifest + recorded action log + oracle
// substrate) out-of-repo under a gitignored .agda-mcp/captures/
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
import type {
  CaptureArtifact,
  CaptureReference,
} from "../agda/session-capture/session-capture.js";
import {
  drainRecordedActions,
  resetRecordedActions,
} from "../agda/session-capture/recorded-transport.js";
import { buildOracleSubstrate } from "../agda/session-capture/oracle-substrate.js";
import { writeFileAtomic } from "../session/safe-source-io.js";

import {
  errorEnvelope,
  makeToolResult,
  okEnvelope,
  registerStructuredTool,
  warningDiagnostic,
  type ToolDiagnostic,
} from "./tool-helpers.js";

// Per-process monotonic sequence counter appended to every staged
// capture filename. Two captures in the same session can share the
// identical fingerprint/recurrence pair (the dedup index only
// advances via the manual, out-of-band scripts/promote-capture.mjs)
// - without this counter both would collide on the same stagedPath
// and writeFileAtomic's rename would silently clobber the first
// artifact (closes 01-VERIFICATION.md CR-03 BLOCKER).
let stagedFileSequence = 0;

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
      note: z
        .string()
        .optional()
        .describe(
          "Optional free-text note about why this session is being captured",
        ),
      expectedSignature: z
        .string()
        .optional()
        .describe(
          "Task-authored expected top-level signature - optional, but ORCL-03 conformance is vacuous without it (D-02)",
        ),
      beforeSource: z
        .string()
        .optional()
        .describe(
          "Source text before the agent's edits, for the diff substrate - falls back to git HEAD when omitted and the file is tracked (D-04)",
        ),
    },
    outputDataSchema: captureReferenceDataSchema,
    callback: async (inputs: {
      note?: string;
      expectedSignature?: string;
      beforeSource?: string;
    }) => {
      try {
        const manifest = buildReplayManifest(session);
        // D-10 guardrail: the underlying session's load/typecheck
        // verdict must be threaded into the returned reference, not
        // just used internally to compute the fingerprint.
        const sessionClassification = session.getLastClassification() ?? null;

        // Drain-then-reset: each capture gets a fresh recording window
        // going forward, so two captures in the same session never
        // double-report the same actions (Task 1 spec).
        const { actions, truncated, droppedCount } = drainRecordedActions();
        resetRecordedActions();

        const oracleSubstrate = await buildOracleSubstrate(session, {
          expectedSignature: inputs.expectedSignature,
          beforeSource: inputs.beforeSource,
        });

        const diagnostics: ToolDiagnostic[] = [];
        if (actions.length === 0 && process.env.AGDA_MCP_CAPTURE !== "1") {
          diagnostics.push(
            warningDiagnostic(
              "No recorded actions - AGDA_MCP_CAPTURE was not enabled for this session.",
              "capture-recording-disabled",
              "Re-run this session with AGDA_MCP_CAPTURE=1 set for a full action log.",
            ),
          );
        }
        if (truncated) {
          diagnostics.push(
            warningDiagnostic(
              `${droppedCount} recorded action(s) were dropped past the ring-buffer capacity.`,
              "capture-recording-truncated",
              "Capture sooner in long dogfooding sessions, or treat the recorded actions as a partial log.",
            ),
          );
        }
        if (inputs.expectedSignature === undefined) {
          diagnostics.push(
            warningDiagnostic(
              "No expected top-level signature supplied - Phase 2's ORCL-03 conformance proxy will be vacuous for this capture.",
              "capture-no-expected-signature",
              "Re-run with expectedSignature set, or supply one later when this capture is promoted (P3).",
            ),
          );
        }

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
          recordedActions: actions,
          oracleSubstrate,
          dedup,
          note: inputs.note,
        };

        const captureDir = join(repoRoot, ".agda-mcp", "captures");
        mkdirSync(captureDir, { recursive: true });
        const stagedPath = join(
          captureDir,
          `${dedup.fingerprint}-${dedup.recurrence}-${stagedFileSequence++}.json`,
        );
        await writeFileAtomic(stagedPath, JSON.stringify(artifact, null, 2));

        const data: CaptureReference = {
          stagedPath,
          fingerprint: dedup.fingerprint,
          kind: dedup.kind,
          recurrence: dedup.recurrence,
          summary: `${dedup.kind} capture ${dedup.fingerprint} (session: ${sessionClassification ?? "no-load"})`,
          keyDiagnostics: diagnostics.map((d) => d.message),
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
            diagnostics,
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
