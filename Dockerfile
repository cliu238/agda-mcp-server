# syntax=docker/dockerfile:1
#
# agda-mcp-server ingest/cron-judge image (Phase 8, DEPLOY-01).
# Two stages: build a real, version-verified Agda 2.8.0 from source (cabal),
# then assemble the final Node 24 runtime image with that Agda binary,
# git, and all 4 pinned fuel-corpus source clones baked in (no _build
# caches — D-10, CACHE theme deleted from v1.1).

# ---------------------------------------------------------------------------
# Stage 1: agda-builder — compile Agda 2.8.0 with GHC 9.10.3 via cabal.
# ---------------------------------------------------------------------------
# Digest resolved live via `docker buildx imagetools inspect haskell:9.10-bookworm`
# on 2026-07-04. This tag carries GHC 9.10.3, which Hackage's own
# Agda-2.8.0.cabal `tested-with` field lists explicitly — do not substitute a
# different GHC line without re-checking that field first.
FROM haskell:9.10-bookworm@sha256:c8c84efbcf7bd7106b94d8e83ae150489adb57116ec01d67cd547bb967fd9e69 AS agda-builder

# -f-enable-cluster-counting disables Agda's optional text-icu dependency
# (only needed for LaTeX cluster-counting output, irrelevant to a headless
# MCP judge). This deliberately avoids a cross-Debian-release ICU ABI
# mismatch that could otherwise arise between this build stage and the final
# stage below — both stages are bookworm-based here, but pinning the flag
# keeps that true even if either base image line drifts in the future.
#
# WR-06: the Hackage index is pinned to the same date the base-image
# digests were resolved (2026-07-04), so Agda-2.8.0's TRANSITIVE
# dependency solve is reproducible too. Without it, every deliberately
# no-cache rebuild re-resolves against the latest index — a newly
# published (broken or malicious) transitive dep would change the
# shipped judge binary with no diff in this repo, the one unpinned link
# in an otherwise fully digest/SHA-pinned supply chain. Bump this
# timestamp deliberately, together with the image-digest pins.
RUN cabal update 'hackage.haskell.org,2026-07-04T00:00:00Z' && \
    cabal install Agda-2.8.0 \
      --install-method=copy \
      --installdir=/agda-bin \
      --overwrite-policy=always \
      -f-enable-cluster-counting

# ---------------------------------------------------------------------------
# Stage 2: final — Node 24 runtime + the Agda binary built above + fuel corpora.
# ---------------------------------------------------------------------------
# Same digest-pinning discipline as stage 1 (resolved live 2026-07-04). Both
# stages are bookworm-based, so no libc/ICU ABI mismatch survives the
# COPY --from=agda-builder below.
FROM node:24-slim@sha256:b31e7a42fdf8b8aa5f5ed477c72d694301273f1069c5a2f71d53c6482e99a2fc AS final

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=agda-builder /agda-bin/agda /usr/local/bin/agda
COPY --from=agda-builder /agda-bin/agda-mode /usr/local/bin/agda-mode

# Fixed UID/GID 2231 — dictated by the target cluster's existing Ceph
# directory ownership (see .claude/skills/agda-mcp-k8s-deploy/SKILL.md),
# not a convention this Dockerfile invents.
RUN groupadd -g 2231 agdamcp && \
    useradd -u 2231 -g 2231 -m -d /home/agdamcp -s /usr/sbin/nologin agdamcp

ENV AGDA_MCP_FUEL_ROOT=/opt/agda-mcp-fuel

WORKDIR /app

# Layer-cache discipline: only re-run npm ci when the lockfile changes.
COPY package.json package-lock.json ./
# Intentionally NOT trimming devDependencies here: tsx and typescript are
# devDependencies that every scripts/*.mjs file needs at runtime, not just
# at build time (.planning/research/ARCHITECTURE.md §2's explicit Dockerfile
# note). Skipping them would break scripts/team/*.mjs inside this image.
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p "$AGDA_MCP_FUEL_ROOT"

# Clones all 4 pinned fuel corpora (scripts/data/fuel-corpora.json) into
# AGDA_MCP_FUEL_ROOT using Plan 08-01's clone-fuel-corpora.mjs VERBATIM (D-04's
# clone convention, same script, different root value — the same "one code
# path, one env var, two values" pattern AGDA_MCP_TEAM_STORAGE_DIR already
# established). The BuildKit secret mount keeps the private-repo token out of
# ENV/ARG/docker history. The token's other escape path — git persisting the
# credentialed clone URL into each clone's .git/config, which IS layer
# content — is closed by 08-01's post-clone `remote set-url` scrub. Verify
# inside the built image with:
#   git -C /opt/agda-mcp-fuel/<key> config --get remote.origin.url
# which must show the clean (token-free) URL.
RUN --mount=type=secret,id=fuel_corpora_token \
    sh -c 'GH_TOKEN="$(cat /run/secrets/fuel_corpora_token 2>/dev/null || true)" node scripts/team/clone-fuel-corpora.mjs --root "$AGDA_MCP_FUEL_ROOT"'

RUN chown -R agdamcp:agdamcp /app "$AGDA_MCP_FUEL_ROOT"

USER agdamcp

EXPOSE 4000

CMD ["node", "dist/index.js"]
