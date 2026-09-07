#!/usr/bin/env bash
# Pull the latest Hoard image and restart app + scheduler.
# Called by GitHub Actions CD and usable manually on the VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker/compose.yml -f docker/compose.prod.yml --project-name hoard"

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  echo "[deploy] logging in to ghcr.io..."
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-Sharathchenna}" --password-stdin
fi

echo "[deploy] pulling latest image..."
$COMPOSE pull app scheduler

echo "[deploy] restarting app + scheduler..."
$COMPOSE up -d --force-recreate app scheduler

echo "[deploy] done."
$COMPOSE ps app scheduler
