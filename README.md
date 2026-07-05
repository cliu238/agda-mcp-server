# agda-mcp-server

`agda-mcp-server` is a stateful [Model Context Protocol](https://modelcontextprotocol.io)
server for interactive [Agda](https://agda.readthedocs.io/) proof development. It keeps a
long-lived `agda --interaction-json` process alive so an AI agent can load a file, inspect
goals, and iterate on a proof — case-split, refine, give, compute, search — without
restarting Agda per request.

## Why this fork exists

This fork tracks [InvariantHoldings/agda-mcp-server](https://github.com/InvariantHoldings/agda-mcp-server)
but runs its own closed self-improvement loop on top of it: use the server on a real proof
session, capture any defect that surfaces, judge it, fix it, lock the fix in with a
regression test, then reuse the hardened server on the next session. That loop needs a live
team feedback channel (an ingest endpoint on a JHU cluster) and a pinned-environment
distribution model, both of which require controlling release cadence and infrastructure
that upstream does not provide. Active development happens here, and fixes land in this
fork first — sync between the two repos is one-way, upstream to fork only. If you just want
the plain upstream server without this workflow, use the upstream repo directly.

## Using it

### Requirements

- Node.js `>= 24`
- `git`
- Agda `2.6.4.3`–`2.9.0` on `PATH`

### Install

This is a git install, not an npm package — this fork is never installed globally via npm
and holds no npm account anywhere in its distribution model.

```bash
git clone https://github.com/cliu238/agda-mcp-server.git
cd agda-mcp-server
git fetch --tags
git checkout "$(git tag --list 'v*' | sort -V | tail -1)"
npm ci
npm run build
```

Teammates joining the feedback loop (dogfooding + uploads) run
`bash scripts/team/install-pinned-env.sh` instead and follow
[docs/TEAM-ONBOARDING.md](docs/TEAM-ONBOARDING.md) (that path pins Agda 2.8.0; the two
private research corpora are only needed if you personally work on that research —
add `--public-only` to skip them).

### Run it

```bash
npm run build
AGDA_MCP_ROOT=/path/to/your/agda/project node dist/index.js
```

`AGDA_MCP_ROOT` defaults to the current working directory if omitted.

### Connect an MCP client

For example, a Claude Code `mcpServers` entry:

```json
{
  "mcpServers": {
    "agda": {
      "command": "node",
      "args": ["/absolute/path/to/agda-mcp-server/dist/index.js"],
      "env": {
        "AGDA_MCP_ROOT": "/path/to/your/agda/project"
      }
    }
  }
}
```

Or for Codex:

```bash
codex mcp add agda \
  --env AGDA_MCP_ROOT=/path/to/your/agda/project \
  -- node /absolute/path/to/agda-mcp-server/dist/index.js
```

Any stdio-capable MCP client works the same way: command `node`, args pointing at
`dist/index.js`, env setting `AGDA_MCP_ROOT` to the target project root.

### What it can do

The server exposes tools across load/typecheck, goal inspection (`agda_goal_type`,
`agda_metas`, `agda_goal_catalog`), proof actions (`agda_case_split`, `agda_give`,
`agda_refine`, `agda_auto`, `agda_goal_candidates` for type-directed term search /
Mimer auto-fix), expression queries (`agda_compute`, `agda_infer`),
navigation/search, and session capture for bug reports. For the full current tool list,
call the `agda_tools_catalog` MCP tool itself — it is manifest-derived and always in sync
with the running server, unlike a hand-maintained doc.

## Developing

```bash
npm install
npm run build
npm test
npm run verify
```

Integration tests need a real Agda binary: run them with
`RUN_AGDA_INTEGRATION=1 npm run test:integration`. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the layering/module map and [AGENTS.md](AGENTS.md) for repo conventions for coding
agents (`CLAUDE.md` mirrors the same constraints for Claude Code specifically). Constraints
worth knowing up front: Node >= 24, TypeScript strict/ESM, a 500-line-per-file ceiling in
`src/`, tests via `vitest`. Extension authors should see
[docs/extensions.md](docs/extensions.md) and the
[examples/extensions/README.md](examples/extensions/README.md) sample catalog.

## License

MIT — see [LICENSE](LICENSE).
