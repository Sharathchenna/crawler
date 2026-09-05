# Hoard — save anything as clean Markdown

A personal library that saves web pages, X threads, PDFs, images, audio, and YouTube links as **clean Markdown** that humans and AI agents can search, read, and update over **web, MCP, CLI, API, and iOS**.

Runs on **Cloudflare Workers** (Next.js via OpenNext, Prisma + D1, auth with WebCrypto — no Node-only APIs).

- Web app: auth, capture bar, Library, Inbox, Notes, Repos, Tweets, Articles, reader,
  notes editor with revisions, search (keyword + fuzzy + semantic), settings/tokens.
- Backend: Next.js 15 route handlers + Prisma over **D1** (per-request clients, no global connection).
- MCP server: `POST /api/mcp` (JSON-RPC 2.0 / streamable HTTP).
- CLI: `hoard login|search|save|export` (points at any deployment via `--api-url`).
- iOS: native SwiftUI + Share Extension, same API, same look.

## Quickstart (local)

```bash
cp .env.example .env      # set DEV_ACCESS_EMAIL to sign in locally (no Access in front)
npm install
npm run setup             # migrate + seed local D1 (demo@hoard.local + seeded items)
npm run dev               # http://localhost:3000, local D1 via bindings
```

Demo: set `DEV_ACCESS_EMAIL="demo@hoard.local"` in `.env` and open `/library` —
no password form exists. Identity comes from Cloudflare Access in production;
locally the dev email impersonates one address (never set it in production).
Seeded with ~6 items, 2 tags, 1 note with 3 revisions.

To preview the real Workers runtime locally (workerd, same as production):

```bash
npm run preview           # builds + serves on http://localhost:8787
```

## Deploy to Cloudflare Workers

Prereqs: a Cloudflare account + `wrangler login`.

```bash
# 1. Create the production database and point wrangler at it
wrangler d1 create hoard
# → paste the returned database_id into wrangler.jsonc (d1_databases)

# 2. Migrate + seed production
wrangler d1 execute hoard --remote --file=db/migrations/0001_init.sql
wrangler d1 execute hoard --remote --file=db/seed.sql

# 3. Secrets (dashboard works too; --keep-vars preserves them on deploy)
# (no AUTH_SECRET anymore — sessions are gone; identity is the Access JWT)
# optional, enables file→Markdown conversion:
wrangler secret put CLOUDFLARE_API_TOKEN
# + set CLOUDFLARE_ACCOUNT_ID as a plain var (wrangler.jsonc vars or dashboard)

# 4. Ship it
npm run deploy            # or: connect the repo in Workers Builds (git push to deploy)
```

Notes:
- Runtime env comes from the dashboard/`wrangler secret`, not `.env` (local-only). `process.env` reads keep working because OpenNext populates them.
- `npm run deploy` uses `--keep-vars` semantics via `opennextjs-cloudflare deploy`; add `-- --keep-vars` if you set vars outside wrangler.jsonc.
- Plan fit: HTTP invocations have no wall-clock cap (long captures fine); CPU is 10ms free / 30s default paid — heavy pages want Paid. Subrequests are 50/invocation free (a capture uses ~6–10). Memory is 128MB/isolate.

## Cloudflare Access setup (identity)

There are no passwords. An Access application must front the hostname:

1. Zero Trust → Access → Applications → add `crawler.<you>.top` (or keep yours).
2. Copy the app's **AUD tag** → set `CF_ACCESS_AUD` (var) and
   `CF_ACCESS_TEAM_DOMAIN` (e.g. `xyz.cloudflareaccess.com`) in dashboard vars.
3. Machines (CLI, iOS, MCP clients) can't do the browser login: create a
   **service token** (Access → Service Tokens), add it to the app's Allow
   policy, and configure its Client ID + Secret in each client. The edge
   checks those headers; Hoard checks the bearer token.
4. First browser visit auto-provisions the user (plan `starter`).

Without a valid JWT/bearer (and without `DEV_ACCESS_EMAIL`, local only),
every API call 401s and app pages 404 — fail-closed by design.

## Sections

The sidebar curates the library into sections — no manual filing needed,
capture auto-classifies by URL and type:

- **Repos** (`/repos`) — `github.com/<owner>/<repo>` links, detected at capture.
- **Tweets** (`/tweets`) — X posts and threads (`type: x`).
- **Articles** (`/articles`) — pages + PDFs.
- Notes keep their own page; Library stays the full firehose.

Filter programmatically with `GET /api/items?type=x,repo` and
`GET /api/search?q=…&type=…`, `hoard search "…" --type …`, or MCP
`search_items(query, type?)`.

## Search

Three engines merge per query (each hit carries a `via` tag, additive):

1. **Keyword** — every term must appear (AND) across title/body/excerpt.
2. **Semantic** — Workers AI embeddings (`bge-small`) + Vectorize, owner-scoped.
   Needs one-time setup (see below); absent → skipped silently.
3. **Fuzzy** — typo-tolerant match on titles + excerpts (Fuse.js), capped extras.

The `/search` page adds scope chips (All, Notes, Tweets, Repos, Articles)
hitting the same `type` filter.

### Enabling semantic search

```bash
# 1. Create the index (384 dims = bge-small, cosine)
npx wrangler vectorize create hoard-embeddings --dimensions=384 --metric=cosine
# 2. Token needs Workers AI (run) + Vectorize (read + write):
#    CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (env / secrets)
# 3. Backfill: Settings → Rebuild index (or POST /api/reindex)
```

New saves index automatically; deletes unindex. Without credentials the
whole layer is inert — keyword + fuzzy carry on, `/api/reindex` says so.

## Tokens + MCP

1. Sign in → **Settings → Agent tokens → Issue token** (shown once — copy it).
2. Pick your client in **Settings → Connect an MCP client**, copy the snippet.
   - CLI shapes: `claude mcp add --transport http hoard <APP_URL>/api/mcp`, `codex mcp add hoard --url …`, `amp mcp add hoard …`
   - JSON shapes for Cursor/JetBrains/LM Studio/Trae/BoltAI/Crush/Amazon Q/Kiro, VS Code/Copilot, Windsurf/Antigravity, Cline/Kilo/Roo, Gemini/Qwen, OpenCode — all generated by one `buildConfig(slug, name, url)` in `lib/mcp-config.ts`.
3. If the client asks for headers, add `Authorization: Bearer hoard_…`.

MCP tools: `search_items`, `get_item`, `create_note`, `update_note` (writes a `NoteRevision` as `Agent`), `list_tags`. Test:

```bash
curl -X POST $APP_URL/api/mcp -H "Authorization: Bearer hoard_…" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_items","arguments":{"query":"markdown"}}}'
```

## Reader pipeline (cloned Web Clipper + Shiki)

Saving a URL runs an automatic pipeline — the capture bar shows
`Fetching → Extracting → Converting → Ready`:

1. **Fetch** the page (20s timeout, follows redirects, browser User-Agent).
2. **Extract** with the real **Obsidian Web Clipper**, cloned into
   `vendor/obsidian-clipper` (MIT, upstream commit recorded in
   `vendor/obsidian-clipper/INTEGRATION.md`). `lib/clipper.ts` calls its
   environment-agnostic `clip()` (`src/api.ts`) with the default template
   (title, source, author, published, created, description, tags): Defuddle
   main-content extraction → `createMarkdownContent` Markdown conversion
   (headings, lists, links, code blocks, tables, blockquotes, images with
   original URLs — assets are never downloaded) → compiled note.
3. **Render** server-side (`lib/markdown-html.ts`): unified + remark-gfm for
   full Markdown, Shiki (VS Code-grade, JS regex engine — the only engine
   workerd allows) for code highlighting with a card + language label per
   block. Untagged fences get highlight.js-based language detection gated
   for precision (short/low-confidence stays plaintext — no wrong labels).
4. **Files (PDFs, office docs)** go through Cloudflare Workers AI
   `toMarkdown` (`lib/cloudflare.ts`) when `CLOUDFLARE_ACCOUNT_ID` +
   `CLOUDFLARE_API_TOKEN` are set — the same REST call works from Node
   today or Workers later. Unset or failed conversions fall back to link
   bookmarks.
5. **arXiv papers** get the full treatment in `lib/arxiv.ts`: any
   abstract/PDF/ar5iv URL → ar5iv HTML through the clipper for full text,
   merged with export.arxiv.org metadata (authors, version dates,
   categories → tags); the real PDF via Cloudflare conversion fills ar5iv
   gaps before falling back to the abstract page and then a bookmark.

Two server adaptations were required (both documented in code): the
clipper's `window`/`document` globals poison server runtimes, so
`lib/clipper.ts` installs only bare `DOMParser`/`DEBUG_MODE` globals (plus
a one-time guarded priming for Turndown), and `instrumentation.ts` warms
the pipeline at boot. There is also a one-line fix in vendored `src/api.ts`
(pass the full Document to Defuddle; element input extracts to empty with
linkedom).

The **source URL is the canonical identifier**: re-saving a URL refreshes the
existing document (same id, `reprocessed: true`) instead of duplicating it.
`POST /api/items/[id]/reprocess` does the same on demand from the reader.

The reader defaults to the extracted **Reader** view (distraction-free,
metadata line, copy-Markdown) with an **Original** tab for the live page.
Failed extractions record `extractionError` and fall back to the original —
never an empty document, never a 500.

## CLI

```bash
cd cli && npm install -g ./        # installs `hoard`
hoard login my-laptop --api-url https://hoard.<you>.workers.dev
hoard search "markdown"
hoard save https://example.com
hoard export ./hoard-export        # front-matter .md files
```

Config lives at `~/.hoard/config.json` (`{ apiUrl, token, client, cfAccessId?, cfAccessSecret? }`).
`login` prompts for the Hoard token plus, only if the API sits behind Access,
a service-token pair (Zero Trust → Access → Service Tokens; or env
`HOARD_CF_ACCESS_ID` / `HOARD_CF_ACCESS_SECRET` — see `hoard help`). No token →
it tells you to run `login`. Network error → it prints the URL it tried and the fix.

## API

- No password routes. Sign-in happens at Cloudflare Access; first sight auto-provisions
  the user. Machines use bearer tokens from Settings (+ service-token headers past Access).
- `POST /api/capture` `{ url }` or `{ text, title }` — never 500s on a bad page (saves a bookmark instead). Accepts session **or** bearer.
- `GET/POST /api/items`, `GET/PATCH/DELETE /api/items/[id]` (status: inbox|saved|archived|done)
- `GET/POST /api/notes`, `GET/PATCH/DELETE /api/notes/[id]` (every PATCH → new `NoteRevision`)
- `GET /api/search?q=`, `GET/POST /api/tokens`, `GET /api/tags`

Every query is owner-scoped by `userId`. Auth is Cloudflare Access JWTs (`lib/access.ts`: RS256 certs, AUD + expiry
checked) mapped to local users, plus Hoard bearer tokens for machines
(`lib/auth.ts`). Sessions/cookies are gone — sign out at
`/cdn-cgi/access/logout`. Search is keyword today (D1 has no pgvector;
Vectorize is the future seam).

## iOS

See `README-ios.md` + `ios/` (KeepKit package, SwiftUI app, Share Extension, XcodeGen `project.yml`). Point `HoardAPIBaseURL` at the deployed Worker URL.
