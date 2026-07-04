// MIT License — see LICENSE
//
// A minimal stand-in for the real `dist/index.js` Agda MCP server,
// used ONLY by test/unit/tools/dogfood-run-report-checkpoint.test.ts
// (via scripts/dogfood/dogfood-run.mjs's AGDA_MCP_DOGFOOD_TEST_CHILD_ENTRY
// test-only override) to exercise dogfood-run.mjs's real OS-process
// signal handling — hard SIGKILL and graceful SIGTERM — without
// needing a real Agda binary, a real `npm run build`, or real MCP
// protocol negotiation.
//
// dogfood-run.mjs is a byte-blind line tee: it never inspects MCP
// semantics beyond correlating a `tools/call` request id to its
// response (scripts/dogfood/transcript-writer.mjs's
// recordToServerLine/recordToClientLine). So this fixture only needs
// to speak that much of the wire: read one newline-delimited JSON-RPC
// line from stdin, and if it looks like a `tools/call` request, write
// back a matching trivial success response carrying the same id.
// Anything else on stdin is silently ignored (mirrors a real server's
// tolerance for lines it doesn't specifically act on).
//
// Deliberately NEVER exits on its own (no periodic timers, no
// self-termination) — the whole point of the tests that spawn this
// fixture is to observe what happens to the OUTER proxy process when
// IT is killed while this inner child is still running.
//
// WR-07 regression fixture support: with
// AGDA_MCP_DOGFOOD_TEST_CHILD_IGNORE_SIGTERM=1 set, this fixture
// installs a no-op SIGTERM handler, simulating a wedged child (or one
// itself blocked on an unresponsive Agda grandchild) that does not die
// within dogfood-run.mjs's own finalize() grace window — forcing its
// SIGKILL-escalation path to actually engage. SIGKILL itself can never
// be ignored (installing a handler for it is not even possible), so
// this fixture still dies once escalation fires; it only refuses the
// FIRST, gentler signal. Off by default — every OTHER test using this
// fixture is unaffected.

import { createInterface } from "node:readline";

if (process.env.AGDA_MCP_DOGFOOD_TEST_CHILD_IGNORE_SIGTERM === "1") {
  process.on("SIGTERM", () => {});
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }

  if (parsed?.method === "tools/call" && parsed.id !== undefined) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: parsed.id,
        result: { structuredContent: { data: {} } },
      })}\n`,
    );
  }
});
