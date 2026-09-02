# Parchment

A cream-paper PWA that is a **link library**, not a reader. Cards open the original URL.

Two shelves:

- **Yours** — anything you paste (tweet, paper, blog, repo).
- **Suggested** — what the crawler found in the last **7 days**: recent Hacker News, new arXiv papers, and company / personal longform via TinyFish. Ranked as a mix, not all-time HN classics.

Like, pass, or mark a card **read** and it leaves those shelves for **Archive**, so they stay unread. Likes and passes also steer Suggested ranking (site / topic / type, plus Vectorize similarity when AI is bound). Passes stop the crawler from refetching that domain.

Import X bookmarks from [birdclaw](https://birdclaw.sh/) (`birdclaw search tweets --bookmarked --json`) into Yours. Light / dark / system theme is in the sidebar.

Live: [crawler.sharathchenna87.workers.dev](https://crawler.sharathchenna87.workers.dev) (Cloudflare Access) talking to [parchment-crawler](https://parchment-crawler.sharathchenna87.workers.dev).

## How it is put together

```
Next.js PWA  ──HTTP──►  crawler Worker (local)
     │
     └──service binding──►  parchment-crawler (Cloudflare)
                              D1 catalog · R2 bodies · fetch queue
                              Vectorize + Workers AI embeddings
                              TinyFish search/fetch · HN · arXiv
```

- **PWA** (`app/`, `components/`) — Next.js 16 App Router, Inter, cream `#F4EDE0`, Serwist PWA. Local: `bun run dev` (webpack). Production: vinext on a Worker named `crawler`.
- **Crawler** (`worker/`) — Worker `parchment-crawler`. Cron `0 */6 * * *`. `POST /api/discover` kicks a run immediately (the **Find more** button).

Local Next cannot import `cloudflare:workers`, so webpack aliases `@/lib/origin` to HTTP `fetch(CRAWLER_ORIGIN)`. The vinext build aliases the same module to `env.CRAWLER.fetch` (Worker-to-Worker on `*.workers.dev` does not work without that binding).

## Develop

Needs [Bun](https://bun.sh) and two terminals.

```bash
bun install
cp .env.example .env.local          # CRAWLER_ORIGIN=http://127.0.0.1:8787
cp worker/.dev.vars.example worker/.dev.vars
# optional: TinyFish key in worker/.dev.vars — HN still runs without it
bun run db:migrate:local
bun run dev:crawler                 # http://127.0.0.1:8787
bun run dev                         # http://localhost:3000
```

Get a TinyFish key at [agent.tinyfish.ai/api-keys](https://agent.tinyfish.ai/api-keys). Without `TINYFISH_API_KEY`, discover still pulls HN (and arXiv when the feed is reachable).

## Deploy

Already wired in this repo: D1 `parchment`, R2 `parchment-posts`, queue `parchment-fetch`, Vectorize `parchment-links`, KV `VINEXT_KV_CACHE`. After `wrangler login`:

```bash
bunx wrangler secret put TINYFISH_API_KEY --config worker/wrangler.jsonc
bun run db:migrate
bun run deploy:crawler
bun run build
bun run deploy:vinext
```

Root `wrangler.jsonc` sets `CRAWLER_ORIGIN`, the `CRAWLER` service binding to `parchment-crawler`, and `preview_urls`. `bun run build` is vinext: it writes `dist/` and `.wrangler/deploy/config.json` so Workers Builds can run `npx wrangler versions upload` on PRs. `bun run build:next` is webpack.

On a new Cloudflare account, create those resources first, paste IDs into `worker/wrangler.jsonc` and `wrangler.jsonc`, then deploy crawler before the PWA.

## Discover and search

Discover (cron or **Find more**) prunes Suggested older than 7 days, then enqueues HN from the last week, arXiv, and TinyFish queries over company blogs and essays. Tweets are stored as links only (no X API).

Search tries Vectorize (`@cf/baai/bge-base-en-v1.5`, 768d) and falls back to SQL `LIKE` if AI / Vectorize is missing.

Crawler HTTP (CORS open): `GET /api/posts`, `GET /api/search`, `GET /api/stats`, `POST /api/save`, `POST /api/import`, `POST /api/discover`, `POST /api/react`, `DELETE /api/react`, `GET /health`.

## Layout

```
app/            PWA routes, PWA icons, service worker
components/     shelves, save/search, sidebar
lib/            crawler client (HTTP vs service binding)
shared/         types, URL classify, D1 migrations, 7-day window
worker/         discover, ingest, D1, embeddings
wrangler.jsonc  PWA Worker
```
