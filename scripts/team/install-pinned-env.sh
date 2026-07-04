#!/usr/bin/env bash
# MIT License — see LICENSE
#
# TEAM-05 bootstrap entry point. A fresh teammate has neither `npm ci`
# nor `tsx` yet, so this thin POSIX-bash wrapper gates on Node itself
# existing (and being >= 24) BEFORE ever handing off to
# install-pinned-env.mjs, which does the real work (Agda locate+
# verify, run-pinned-agda.sh generation, fuel-corpus clone, npm ci).
#
# Run with: bash scripts/team/install-pinned-env.sh
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found — install Node >= 24 (nvm/fnm/homebrew: https://nodejs.org/), then re-run this script." >&2
  exit 1
fi

NODE_MAJOR="$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Detected Node major version ${NODE_MAJOR}, but Node >= 24 is required. Install Node >= 24 (nvm/fnm/homebrew: https://nodejs.org/), then re-run this script." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git not found — install git (e.g. https://git-scm.com/downloads or your OS package manager), then re-run this script." >&2
  exit 1
fi

# Resolve the .mjs relative to THIS script's own location (not a
# hardcoded repo path) so this wrapper works regardless of how/where
# it was invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/install-pinned-env.mjs" "$@"
