// MIT License — see LICENSE
//
// Plan 05-02's run-recorder interface: an append-only NDJSON
// transcript of every line the proxy relays in either direction, plus
// a per-tool-call tally and a "which agda_capture_session results were
// observed" list, condensed at proxy exit into a JSON + Markdown run
// report under .agda-mcp/runs/<run-id>/ (D-05/D-08). Ships as a
// scripts/ + repo-data-dir artifact — no new MCP verb, no new src/
// tool surface.
//
// D-06's two-record design: this module owns the PROXY's OWN
// transcript + run report (an outside-the-server observer of the
// wire). The in-server ring-buffer recorder
// (src/agda/session-capture/recorded-transport.ts), gated separately
// by AGDA_MCP_CAPTURE=1, is a DIFFERENT record for a DIFFERENT
// consumer (agda_capture_session's own recordedActions) — per Pitfall
// 7, this module never reads from or writes to that recorder, and
// never imports AgdaSession or anything from src/agda/ (#39 — this is
// a passive line observer, not a second session).
//
// Must be imported via `npx tsx` (not plain `node`) by any CLI
// wrapper: SERVER_REPO_ROOT is imported from a .ts sibling
// (src/repo-root.ts) via a .js-suffixed specifier, and Node's native
// TS type-stripping does not rewrite .js -> .ts. tsx resolves this
// correctly, and so does vitest's own resolver when this module is
// imported from a .test.ts file.

import { appendFileSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "../../src/session/safe-source-io.js";
import { SERVER_REPO_ROOT } from "../../src/repo-root.js";

/**
 * Resolve the root directory dogfooding run artifacts (transcript +
 * run report) are written under. `AGDA_MCP_DOGFOOD_RUNS_ROOT`
 * overrides the default — tests use this to redirect run artifacts
 * away from the real repo's own `.agda-mcp/runs/` (D-05: gitignored,
 * machine-local staging).
 */
export function resolveRunsRoot() {
  const override = process.env.AGDA_MCP_DOGFOOD_RUNS_ROOT?.trim();
  if (override) {
    return override;
  }
  return join(SERVER_REPO_ROOT, ".agda-mcp", "runs");
}

/** Escapes a literal `|` and collapses newlines, mirroring
 *  scripts/queue/dashboard.mjs's escapeTableCell — free-text fields
 *  (tool names are safe, but this guards defensively) can never break
 *  the surrounding markdown table's column structure. */
function escapeTableCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/[\r\n]+/gu, " ");
}

/**
 * Append one NDJSON transcript line (`{ direction, ts, raw }`) to
 * `transcriptPath`. Single-writer, out-of-band, append-only stream —
 * `appendFileSync` (not `writeFileAtomic`) matches this project's own
 * scripts/oracle/run-oracle.mjs metrics-line precedent for this exact
 * category of file (many small writes, never a single mutable file).
 */
function appendTranscriptLine(transcriptPath, direction, raw) {
  appendFileSync(transcriptPath, `${JSON.stringify({ direction, ts: Date.now(), raw })}\n`, "utf8");
}

/**
 * Create a run recorder closing over three pieces of module-local
 * state for ONE proxy run: `pendingRequests` (in-flight `tools/call`
 * requests awaiting their response, keyed by JSON-RPC `id`), `perTool`
 * (call-count + total-elapsed tallies per tool name), and
 * `stagedCaptures` (every `agda_capture_session` result observed on
 * the wire, in order).
 *
 * Every line in either direction is recorded to the transcript file
 * unconditionally, even lines this recorder cannot or does not
 * attribute to any tool call (malformed JSON, an unmatched response
 * id, a non-tools/call request) — the transcript is a complete,
 * unbounded record of the wire; `perTool`/`stagedCaptures` are a best-
 * effort DERIVED summary of it.
 */
export function createRunRecorder({ transcriptPath }) {
  const pendingRequests = new Map();
  const perTool = {};
  const stagedCaptures = [];

  return {
    /** A line the AGENT sent TOWARD the server (via the proxy). */
    recordToServerLine(raw) {
      appendTranscriptLine(transcriptPath, "to-server", raw);

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Malformed JSON on the wire — recorded above, never crashes
        // the proxy, never attributed to any tool call.
        return;
      }

      if (
        parsed?.method === "tools/call"
        && parsed.id !== undefined
        && typeof parsed.params?.name === "string"
      ) {
        pendingRequests.set(parsed.id, { toolName: parsed.params.name, startedAt: Date.now() });
      }
    },

    /** A line the SERVER sent TOWARD the agent (via the proxy). */
    recordToClientLine(raw) {
      appendTranscriptLine(transcriptPath, "to-client", raw);

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return undefined;
      }

      if (!parsed || parsed.id === undefined) {
        return undefined;
      }

      const pending = pendingRequests.get(parsed.id);
      if (!pending) {
        // A response whose id was never seen in a prior request line
        // (out-of-band notification, or a request this recorder's own
        // recordToServerLine call somehow missed) — recorded above,
        // never throws, never affects perTool/stagedCaptures.
        return undefined;
      }
      pendingRequests.delete(parsed.id);

      const { toolName, startedAt } = pending;
      const elapsedMs = Date.now() - startedAt;

      const tally = perTool[toolName] ?? { count: 0, totalElapsedMs: 0 };
      tally.count += 1;
      tally.totalElapsedMs += elapsedMs;
      perTool[toolName] = tally;

      const isCaptureSession = toolName === "agda_capture_session";
      if (isCaptureSession) {
        const data = parsed?.result?.structuredContent?.data;
        if (data && typeof data.stagedPath === "string") {
          stagedCaptures.push({
            stagedPath: data.stagedPath,
            fingerprint: data.fingerprint,
            kind: data.kind,
            recurrence: data.recurrence,
          });
        }
      }

      return { toolName, elapsedMs, isCaptureSession };
    },

    /** Read-only reference to the same array `recordToClientLine`
     *  pushes onto — lets a caller inspect the most-recently-staged
     *  capture (`.at(-1)`) immediately, without waiting for
     *  `getReport()`. */
    stagedCaptures,

    getReport({ runId, startedAt, corpusRoot, manifestPath }) {
      let totalToolCalls = 0;
      for (const tally of Object.values(perTool)) {
        totalToolCalls += tally.count;
      }
      return {
        schemaVersion: 1,
        runId,
        startedAt,
        endedAt: new Date().toISOString(),
        corpusRoot,
        manifestPath,
        totalToolCalls,
        perTool,
        stagedCaptures,
        transcriptPath,
      };
    },
  };
}

/**
 * Pure function: `report` -> Markdown string. No `Date.now()`/live
 * timestamp beyond what `report` itself already carries, so the same
 * report always renders identically (testable without faking the
 * clock).
 */
export function renderRunReportMarkdown(report) {
  const lines = [];
  lines.push(`# Dogfood run report: ${report.runId}`);
  lines.push("");
  lines.push(`- **corpusRoot:** ${report.corpusRoot}`);
  lines.push(`- **manifestPath:** ${report.manifestPath}`);
  lines.push(`- **startedAt:** ${report.startedAt}`);
  lines.push(`- **endedAt:** ${report.endedAt}`);
  lines.push(`- **totalToolCalls:** ${report.totalToolCalls}`);
  lines.push("");
  lines.push("## Per-tool tallies");
  lines.push("");

  const toolNames = Object.keys(report.perTool);
  if (toolNames.length === 0) {
    lines.push("(no tool calls observed)");
  } else {
    lines.push("| Tool | Count | Avg duration (ms) |");
    lines.push("| --- | --- | --- |");
    for (const toolName of toolNames) {
      const tally = report.perTool[toolName];
      const avgMs = tally.count > 0 ? Math.round(tally.totalElapsedMs / tally.count) : 0;
      lines.push(`| ${escapeTableCell(toolName)} | ${tally.count} | ${avgMs} |`);
    }
  }

  lines.push("");
  lines.push("## Captures staged");
  lines.push("");
  if (report.stagedCaptures.length === 0) {
    lines.push("none");
  } else {
    for (const capture of report.stagedCaptures) {
      lines.push(`- ${capture.fingerprint} (${capture.kind}, recurrence ${capture.recurrence})`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Write both `run-report.json` and `run-report.md` into `runDir`, via
 * `writeFileAtomic` (single-shot artifact writes — never
 * `fs.writeFileSync` directly, matching this project's own
 * scripts/oracle/run-oracle.mjs verdict-sidecar precedent).
 */
export async function writeRunReport(runDir, report) {
  await writeFileAtomic(join(runDir, "run-report.json"), JSON.stringify(report, null, 2));
  await writeFileAtomic(join(runDir, "run-report.md"), renderRunReportMarkdown(report));
}
