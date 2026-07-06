# Upstream Deviations Ledger

**Policy (owner instruction, 2026-07-05):** This repo is a fork of
`InvariantHoldings/agda-mcp-server` and must stay cleanly mergeable (the v1.2
Upstream Reconcile milestone depends on it). **Avoid modifying upstream-origin
files** — anything that also exists upstream, which is most of `src/`. Prefer
fork-only surfaces: `scripts/`, `.planning/`, `.agents/skills/`, fork-authored
`docs/`.

When touching an upstream file is genuinely necessary:

1. Keep the change **minimal** and self-contained.
2. **Record it here** with rationale, so it can later be submitted as an
   **upstream PR** and thereby stop being fork-only divergence.
3. Every fork-only edit to an upstream file is permanent merge-conflict surface
   until it is upstreamed or reverted — so this ledger is the backlog of PRs
   that would shrink that surface.

Companion records: root `CLAUDE.md` → Constraints (`Upstream compatibility`),
`.planning/PROJECT.md` → Constraints + Key Decisions, and the auto-memory
`upstream-file-edit-policy`.

## How to tell if a file is upstream-origin

```sh
# Exists upstream? (upstream remote must be fetched)
git cat-file -e upstream/main:<path> && echo upstream || echo fork-only
```

`CLAUDE.md`, `.planning/**`, `.agents/skills/**`, and most `scripts/**` are
fork-only. Most of `src/**`, `test/**`, and the top-level config files are
upstream-origin — treat those as protected.

## Deviations

| Date | File(s) | What changed | Why it was necessary | Upstream-PR status |
|------|---------|--------------|----------------------|--------------------|
| 2026-07-06 | `.gitignore` | Appended 2 lines — `graphify-out/` and `.planning/graphs/` (fork-local knowledge-graph tooling output). | ~30 MB of regenerable `/graphify` + `/gsd-graphify` output (311 untracked files) cluttered `git status` and risked accidental commit; owner instruction (2026-07-06) to gitignore. Matches Phase 12 audit item CUT-09 (deferred at D-03 sign-off, now authorized). | **N/A — not upstreamable.** Both paths are fork-only (upstream has no graphify/GSD tooling), so these additive lines cannot conflict with upstream's `.gitignore` and represent zero real merge-conflict surface. Kept for completeness, not as a PR candidate. |
