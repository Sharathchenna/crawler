# Parchment

A cream-paper PWA that finds the web’s better blogs. The Next.js app is the reading room. A Cloudflare Worker searches with TinyFish, pulls Hacker News favorites, fetches clean markdown, and keeps only the pieces that pass a quality gate.

## Develop

```bash
bun install
bun run db:migrate:local
bun run dev:crawler   # Worker + D1 + Queue at http://127.0.0.1:8787
bun run dev           # PWA at http://localhost:3000
```

Copy `worker/.dev.vars.example` to `worker/.dev.vars` and set `TINYFISH_API_KEY` (from [TinyFish API keys](https://agent.tinyfish.ai/api-keys)). Without a key, Hacker News discovery still runs; TinyFish search/fetch is skipped.

`CRAWLER_ORIGIN` defaults to `http://127.0.0.1:8787` (see `.env.example`).

## Deploy the crawler

```bash
bunx wrangler d1 create parchment
# paste the database_id into worker/wrangler.jsonc
bunx wrangler r2 bucket create parchment-posts
bunx wrangler queues create parchment-fetch
bun run db:migrate
bunx wrangler secret put TINYFISH_API_KEY --config worker/wrangler.jsonc
bun run deploy:crawler
```

Then set `CRAWLER_ORIGIN` to the Worker URL.

Deploy the PWA to Cloudflare Workers with vinext (after `wrangler login` and creating the `VINEXT_KV_CACHE` namespace listed in root `wrangler.jsonc`):

```bash
bun run deploy:vinext
```

Cron runs every six hours (`0 */6 * * *`). You can also `POST /api/discover` on the Worker to kick a run.
