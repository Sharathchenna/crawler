#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Parchment PWA + crawler Worker.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Install the pinned Bun toolchain (packageManager: bun@1.3.14) if missing.
BUN_VERSION="1.3.14"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
if [ "$(bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi

# 2. Install JS dependencies exactly as locked.
bun install --frozen-lockfile

# 3. Seed local-only env files (gitignored) if they are not present yet.
[ -f .env.local ] || cp .env.example .env.local
[ -f worker/.dev.vars ] || cp worker/.dev.vars.example worker/.dev.vars

# 4. Apply local D1 migrations (wrangler tracks applied migrations, so this is idempotent).
bun run db:migrate:local
