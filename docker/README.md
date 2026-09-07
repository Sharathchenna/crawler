# Hoard on a VPS (Docker + nginx + Cloudflare SSL)

Runs the same Next.js app against Postgres instead of D1. Cloudflare stays
in the picture for DNS, edge TLS, and (optionally) Access — the VPS only
serves origin traffic.

## Architecture

- `app` — Next.js (`next start`), Postgres via Prisma (`schema.docker.prisma`).
  Keyword search uses the LIKE fallback (no FTS tables on Postgres);
  semantic search keeps working over the Cloudflare REST APIs.
- `scheduler` — the 5-minute discovery loop, ported to Postgres (`docker/scheduler/`).
- `db` — `pgvector/pgvector:pg16`. pgvector is **used**: chunked bge-small
  embeddings live in `item_embeddings` (created at boot by
  `docker/ensure-pgvector.mjs`), replacing Vectorize on this backend.
  Same embedding model, same RRF fusion — plus full-document chunking
  qmd-style, so long papers match on content, not just excerpts.
- `nginx` — terminates TLS with your Cloudflare Origin CA cert, proxies to `app`.

## First deploy

1. Point DNS at the VPS: `A hoard.example.com -> <vps-ip>`, **proxied**
   (orange cloud). SSL/TLS mode: **Full (strict)**.
2. Origin cert: dashboard SSL/TLS -> Origin Server -> Create Certificate
   (RSA). Save as `docker/certs/origin.pem` + `docker/certs/origin.key`.
3. `cp docker/.env.example docker/.env` and fill it in. Set `INIT_SEED=1`
   for demo data on first boot (unset after).
4. `docker compose -f docker/compose.yml up -d --build`
5. Open `https://hoard.example.com`. Sign-in is Cloudflare Access if you
   configured an application for the hostname (same as Workers); otherwise
   the app is public — put Access in front.

## Notes

- `schema.docker.prisma` mirrors `prisma/schema.prisma` with a postgres
  provider. After changing the data model, update **both** files.
- Schema is applied with `prisma db push` on every boot (idempotent).
- Migrating data out of D1 is manual for now: `wrangler d1 execute hoard
  --remote --command "SELECT ..." --json` per table, then import.
- Logs: `docker compose -f docker/compose.yml logs -f [app|scheduler|nginx]`.
- Update: `git pull && docker compose -f docker/compose.yml up -d --build`.
