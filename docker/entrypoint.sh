#!/bin/sh
# App entrypoint: wait for Postgres, push the Prisma Postgres schema
# (idempotent), optionally seed once, then run the given command.
set -e

echo "[entry] waiting for postgres..."
node -e "
const { Client } = require('pg');
(async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      await c.end();
      process.exit(0);
    } catch (e) { await new Promise((r) => setTimeout(r, 1000)); }
  }
  console.error('[entry] postgres unreachable after 60s');
  process.exit(1);
})();
"

echo "[entry] pushing schema..."
npx prisma db push --schema prisma/schema.docker.prisma --accept-data-loss --skip-generate

if [ "$INIT_SEED" = "1" ]; then
  echo "[entry] seeding demo data..."
  node docker/seed.mjs || echo "[entry] seed already applied (or failed) — continuing"
fi

exec "$@"
