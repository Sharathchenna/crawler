# Hoard on Docker (multi-stage). Build from the repo root:
#   docker build -f docker/Dockerfile -t hoard .
# Or via compose (recommended): see docker/compose.yml
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate --schema prisma/schema.docker.prisma

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy URL: only used if something touches the DB at build time (nothing should).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate --schema prisma/schema.docker.prisma
RUN npm run build
# npm run build regenerates the default (sqlite) client as a side effect —
# regenerate the postgres client last so the image actually ships it.
RUN npx prisma generate --schema prisma/schema.docker.prisma
# Bundle the standalone discovery scheduler (TS lib -> plain node CJS).
RUN npx esbuild docker/scheduler/entry.ts --bundle --platform=node --format=cjs --packages=external --outfile=scheduler-dist/scheduler.cjs

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db
COPY --from=builder /app/scheduler-dist ./scheduler
COPY docker/entrypoint.sh docker/seed.mjs docker/ensure-pgvector.mjs ./docker/
RUN chmod +x ./docker/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
