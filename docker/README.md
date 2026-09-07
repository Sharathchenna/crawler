# Hoard on a VPS (Docker + nginx + Cloudflare SSL)

Runs the same Next.js app against Postgres instead of D1. Cloudflare stays
in the picture for DNS, edge TLS, and (optionally) Access — the VPS only
serves origin traffic, and there are no per-request CPU limits.

## Architecture

- `app` — Next.js (`next start`), Postgres via Prisma (`schema.docker.prisma`).
  Keyword search uses the LIKE fallback (no FTS tables on Postgres);
  semantic search keeps working over the Cloudflare REST APIs.
- `scheduler` — the 5-minute discovery loop, ported to Postgres
  (`docker/scheduler/`). Real SQL transactions replace the D1 batch.
- `db` — `pgvector/pgvector:pg16`. pgvector is **used**: chunked bge-small
  embeddings live in `item_embeddings` (created at boot by
  `docker/ensure-pgvector.mjs`), replacing Vectorize on this backend.
  Same embedding model, same RRF fusion — plus full-document chunking
  qmd-style, so long papers match on content, not just excerpts.
- `nginx` — terminates TLS with your Cloudflare Origin CA cert, proxies to `app`.

## What you need

- A VPS with ~2 GB RAM (1 vCPU is fine): Hetzner CX22/CX32, DigitalOcean
  basic droplet, or equivalent — roughly €4–6/mo. 20 GB disk is plenty
  (the app image is ~2 GB, data is tiny).
- Docker + the Compose plugin on the VPS (`docker --version` should print
  both). Most images need nothing else: `apt install docker.io docker-compose-plugin`.
- A domain already on Cloudflare (for DNS + edge TLS + Access).
- This repo cloned on the VPS.

## Step by step

### 1. DNS (Cloudflare dashboard)

Add `A hoard.example.com -> <vps-ip>` with the proxy **on** (orange cloud).
SSL/TLS → Overview → encryption mode: **Full (strict)**. The orange cloud
is load-bearing: origin certificates below are trusted only by Cloudflare.

### 2. Origin certificate (Cloudflare dashboard)

SSL/TLS → Origin Server → Create Certificate: RSA, 15 years, hostnames
`hoard.example.com` + `*.example.com`. Save the two blocks on the VPS as:

- `docker/certs/origin.pem` (certificate)
- `docker/certs/origin.key` (private key, `chmod 600`)

These never go into git (already ignored). Lose them and you just generate
new ones — nothing else depends on the specific files.

### 3. Environment

```bash
cp docker/.env.example docker/.env
# then edit docker/.env
```

| Variable | Required | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Long random string. Also builds `DATABASE_URL`. |
| `APP_URL` | yes | `https://hoard.example.com` |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | for Access login | Same values as `wrangler.jsonc`. Omit both for a public instance (not recommended). |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | for semantic search + file conversion | Same REST creds as Workers. |
| `TINYFISH_API_KEY` | for Discover crawls | Same key as Workers. |
| `INIT_SEED` | first boot only | `1` loads demo data, then unset it. |

Never set `DEV_ACCESS_EMAIL` here — it impersonates any user with no login.

### 4. First boot

```bash
docker compose -f docker/compose.yml up -d --build
docker compose -f docker/compose.yml logs -f app   # watch it come up
```

Boot order is handled for you: Postgres healthcheck → schema push
(`prisma db push`, idempotent) → pgvector table → optional seed → app.
Then open `https://hoard.example.com`.

Backfill semantic vectors for existing items after migrating data:
Settings → Rebuild index (or `POST /api/reindex`).

### 5. Access login (recommended)

Same as Workers: Zero Trust → Access → Applications → add the hostname,
allow policy for yourself, and set the two `CF_ACCESS_*` vars above. The
app validates the Access JWT itself; no code changes from the Workers setup.

## Operating it

```bash
# Follow logs
docker compose -f docker/compose.yml logs -f [app|scheduler|nginx|db]
# Update to latest
git pull && docker compose -f docker/compose.yml up -d --build
# Restart one service
docker compose -f docker/compose.yml restart app
# Postgres shell
docker compose -f docker/compose.yml exec db psql -U hoard
```

**Backups.** The one thing D1 did for you: `pgdata` is a named volume.
Back it up on a schedule, e.g. a cron job running
`docker run --rm -v hoard_pgdata:/data -v /backup:/backup alpine
tar czf /backup/pgdata-$(date +%F).tgz /data`. Test restores occasionally.

**Updates.** Pull + rebuild as above. The entrypoint re-applies schema on
every boot, so model changes land automatically (data-preserving for
additive changes).

## Continuous deployment (main branch)

Pushes to `main` run `.github/workflows/deploy.yml`:

1. Build and push `ghcr.io/sharathchenna/hoard:latest` (and `:sha`) to GHCR.
2. SSH to the VPS, `git pull`, pull the new image, restart `app` + `scheduler`.

Required GitHub repo secrets (Settings → Secrets → Actions):

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | VPS public IP or hostname |
| `DEPLOY_USER` | SSH user (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private key authorized on the VPS |
| `GHCR_TOKEN` | PAT or `gh` token with `read:packages` (for `docker pull` on the VPS) |

Manual redeploy on the VPS:

```bash
cd /home/ubuntu/crawler
GHCR_TOKEN=… ./docker/deploy.sh
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Browser TLS error on direct VPS IP | Expected — origin certs only work through Cloudflare's proxy. Always use the hostname. |
| `525 SSL handshake failure` | `origin.pem/key` missing or mismatched in `docker/certs/`. |
| `POSTGRES_PASSWORD ... missing` | `docker/.env` doesn't exist — copy from `.env.example`. |
| App 500s on every route | `DATABASE_URL` wrong, or `db` unhealthy — check `logs db`. |
| Discover empty, scheduler quiet | `TINYFISH_API_KEY` unset (feed previews still work), or schedule paused in Discover preferences. |
| App pages 404 (not login) | No Cloudflare Access JWT reaching the app. Create a **Self-hosted** Access application for your hostname (Workers-type apps do not inject JWT to a VPS origin). Copy its AUD tag into `CF_ACCESS_AUD`, then recreate `app`. |

## Differences from Workers (by design)

- No `wrangler` needed for anything at runtime; no D1/Vectorize bindings.
- `schema.docker.prisma` mirrors `prisma/schema.prisma` with a postgres
  provider — after changing the data model, update **both** files.
- Keyword search uses the LIKE fallback until Postgres FTS lands
  (tracked future work; semantic + fuzzy carry it).
- Migrating data out of D1 is manual for now: `wrangler d1 execute hoard
  --remote --command "SELECT ..." --json` per table, then import.
