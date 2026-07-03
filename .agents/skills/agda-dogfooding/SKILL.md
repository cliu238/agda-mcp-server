---
name: agda-dogfooding
description: Use when proving theorems against a real Agda corpus (agda-stdlib, agda-unimath, or a project built on them, per scripts/data/fuel-corpora.json) through the agda-mcp-server MCP tools, to reliably capture defects instead of silently working around them.
---

# Agda dogfooding runbook

This Skill packages `agda-mcp-server`'s Loop ② dogfooding runbook + driver-prompt
(PROC-01): how to prove real theorems through the `agda-mcp-server` MCP tools
against a pinned real corpus, and — critically — when to reach for
`agda_capture_session` so that what you find turns into a structured report
instead of evaporating into an unrecorded chat transcript. That evaporation is
not hypothetical: a real multi-week Codex-Homotopy-Group dogfooding campaign
against this server produced zero structured captures despite good
intentions, because the instructions to capture existed only as prose no one
consulted mid-session. This Skill exists to close that gap mechanically.

## 1. Before you start (the hard gate)

This session's MCP server was launched through `scripts/dogfood/dogfood-run.mjs`,
a recording proxy that REFUSES to start unless a task manifest listing every
target's expected top-level signature was supplied up front (PROC-01's D-03
mechanical hard gate — enforced by the orchestrator itself, not just prose).

If you do not know your target's expected top-level signature, STOP and ask
the maintainer. Do not guess one after the fact: a signature you invent
yourself makes section 3's `expectedSignature` capture field — and Phase 2's
ORCL-03 conformance check that reads it — vacuous. You would only be checking
your own proof against your own guess of what it should prove.

## 2. Launching a dogfood session

The dogfood proxy is not part of the published npm package — `package.json`'s
`"files"` field never lists `scripts/`. You always launch it from a LOCAL git
checkout of this repo, with `npm run build` already run (the proxy spawns the
compiled `dist/index.js` as its own child server).

For Codex:

```
codex mcp add agda-dogfood \
  --env AGDA_MCP_CAPTURE=1 \
  -- npx tsx /path/to/agda-mcp-server/scripts/dogfood/dogfood-run.mjs \
       --manifest /path/to/task-manifest.json \
       --corpus-root /path/to/target-corpus
```

For Claude Code:

```
claude mcp add --transport stdio agda-dogfood \
  --env AGDA_MCP_CAPTURE=1 \
  -- npx tsx /path/to/agda-mcp-server/scripts/dogfood/dogfood-run.mjs \
       --manifest /path/to/task-manifest.json \
       --corpus-root /path/to/target-corpus
```

Notes:

- `/path/to/agda-mcp-server` must be a LOCAL checkout with `npm run build`
  already run. `npx agda-mcp-server@<ver>` (the launch line for the BARE
  server on its own) is still valid in general, but it cannot be substituted
  here for the dogfooding proxy specifically — the proxy script itself is
  never published to npm.
- Launch the proxy via `npx tsx` (or a resolved `node_modules/.bin/tsx`),
  never plain `node` — `dogfood-run.mjs` imports TypeScript siblings (like
  `src/repo-root.ts`) through `.js`-suffixed specifiers that only `tsx`'s
  resolver rewrites correctly.
- The proxy sets `AGDA_MCP_CAPTURE=1` on its own child unconditionally — the
  explicit `--env` above is for documentation clarity, not strictly required
  by the proxy's own behavior.
- `--corpus-root` is the pinned fuel corpus you are proving against (becomes
  the child server's `AGDA_MCP_ROOT`) — always a DIFFERENT path from
  `/path/to/agda-mcp-server` itself.

## 3. When to capture

Call `agda_capture_session` (not `agda_bug_report_bundle`) whenever:

- a tool result looks successful but something about it feels wrong — a
  "green" you don't fully trust. Capturing a SUSPICIOUS green is explicitly
  in scope, not just outright failures.
- you are stuck after 2-3 attempts at the same goal.
- `agda_load`/`agda_typecheck` disagrees with what you expected given a
  recent edit to a DEPENDENCY (not just the file itself) — this is the
  #64/#61 transitive-staleness shape this whole server exists to catch.

```
agda_capture_session {
  "expectedSignature": "join-assoc : (a b c : A) -> join a (join b c) == join (join a b) c",
  "note": "agda_load reported ok-complete but I edited a dependency two files up and expected a stale-cache warning"
}
```

ALWAYS pass `expectedSignature` (the exact string from your task manifest)
when calling `agda_capture_session` for a proving task. Do not skip this
because it feels redundant — it is optional-but-strongly-nagged at capture
time (the server warns, it never blocks) specifically so crash/failure
captures — which inherently have no expected signature — are never prevented
from being captured. But a proving-task capture without it makes ORCL-03
vacuous: there is nothing to check the proof's conformance against.

## 4. What is NOT a defect: the scaffold-hole workflow

Placing a deliberate `{!!}` plus a file-level `--allow-unsolved-metas` while
you build out a proof's shape is normal, in-progress work — NOT a defect.

Only capture a hole as suspicious when:

- you believe the proof is COMPLETE and the server is still reporting a hole, or
- a hole appears somewhere you did not deliberately place one.

The scaffold-hole workflow is how real proofs get built incrementally. Do not
treat every open goal as a bug.

## 5. Do not trust "ok" blindly (yet)

This is a RETRACTION GOAL, not a permanent warning. Codex-Homotopy-Group's own
`.codex/skills/agda-unimath-skills/SKILL.md` currently carries a "do not
trust MCP ok-complete" warning, born from a MEASURED false-green: an injected
`UnequalTerms` error was reported as zero errors by every verdict tool
(`agda_load`/`agda_typecheck`/`agda_load_no_metas`/`agda_proof_status`) in a
past version of this server. This Loop-② scaffold's measurable win is
retracting that warning once enough real dogfood runs accumulate evidence the
server's verdicts are trustworthy again.

Until then: treat a surprising "ok" on a freshly-edited dependency as
capture-worthy (per section 3 above), not as ground truth.

## 6. The pinned fuel corpora

Four corpora are pinned at fixed commits in `scripts/data/fuel-corpora.json`
(PROC-02):

| Key | Repo | Access | Notes |
|---|---|---|---|
| `agda-stdlib` | `agda/agda-stdlib` | public | Pinned to the CI-aligned `v2.1.1` commit. |
| `agda-unimath` | `UniMath/agda-unimath` | public | Host of the Hopf/π₃(S²) work. |
| `codex-homotopy-group` | `emilyriehl/Codex-Homotopy-Group` | private | Directly dogfoods this server; ready-made sanctioned-axiom/flag policy facts. |
| `autoformalizing-hopf` | `emilyriehl/autoformalizing-hopf` | private | The motivating Hopf/π₃(S²) paper repo, also built on agda-unimath. |

`codex-homotopy-group` is the FIRST OFFICIAL dogfood-run target: it already
has a measured false-green against this exact server and its policy facts
(sanctioned axioms + required flags) are ready-made — it is the corpus most
likely to surface a real defect immediately.

## 7. After the session: wrap-up

When the proxy session ends, it prints the exact next command as its own
exit message (a `<run-id>` you copy from that message). From your local
checkout, run:

```
npx tsx scripts/dogfood/dogfood-wrapup.mjs <run-id>
```

This judges every staged capture from the run through the oracle triad
(server-faithfulness differential + soundness scan + conformance check),
re-runs any load-family candidate N times to rule out timing/idle phantoms,
and auto-files confirmed defects into the fix queue as `new`. Flaky
classifications are tagged in a gitignored side-channel file — never silently
dropped, and never filed as a confirmed defect.
