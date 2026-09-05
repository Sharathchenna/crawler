# Vendored: Obsidian Web Clipper

Source: https://github.com/obsidianmd/obsidian-clipper
Upstream commit: `a9d33ce919fb156beda390d2fc60cbc1e0ed9141`
License: MIT (see `LICENSE`), copyright Obsidian.

This is a copy of the upstream repository (only `.git` removed), plus one
documented adaptation in `src/api.ts` (see below).
Do not otherwise edit files in here — all Hoard-side adaptation lives
outside this directory (see `lib/clipper.ts`).

## What Hoard uses from it

- `src/api.ts` — `clip()`: the clipper's environment-agnostic extraction
  pipeline (Defuddle → `createMarkdownContent` → template variables →
  compiled note). The canonical "their code" integration point.
- `src/types/types.ts` — `Template` / `Property` types only.
- `src/utils/cli-stubs.ts` — stubbed extension settings, aliased as
  `webextension-polyfill` in `next.config.ts` (same trick as the clipper's
  own `scripts/build-cli.mjs`).

Everything `clip()` needs at runtime (`knap`, `dayjs`, `defuddle`,
`linkedom`) is a regular dependency of this app.

## Adaptation (one line, in `src/api.ts`)

`clip()` fed Defuddle `doc.documentElement || doc`. Verified against
defuddle@0.19.3 + linkedom that *element* input extracts to empty (no
title/content) while the full *document* works — including document
internals like `documentElement.getAttribute` for language detection.
The call now passes `doc` directly; everything downstream is untouched.
(`src/cli.ts:210` has the same upstream pattern but is not on Hoard's
execution path, so it was left as-is.)

## What Hoard does NOT use (and why)

Fetching, storage, API routes, and UI have no counterpart in the clipper
(a browser extension): `lib/extract.ts` only calls `clip()` for the
fetch → extract → Markdown step, exactly the responsibility `api.ts`
assigns to the caller ("The caller is responsible for: fetching the HTML…").
