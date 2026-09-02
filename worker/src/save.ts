import { extractBookmarkImports, type BookmarkImport } from "../../shared/birdclaw";
import { classifyUrl, tweetTitleFromUrl } from "../../shared/classify";
import { fetchTweetPreview, tweetEmbedImageUrl } from "../../shared/tweet";
import type { ContentType, SourceKind } from "../../shared/types";
import { findByCanonical, insertPost, markJob, upsertSource } from "./db";
import { indexPost } from "./embeddings";
import type { Env } from "./env";
import { guessTopic } from "./score";
import { tinyfishFetch } from "./tinyfish";
import { canonicalize, hostnameOf } from "./urls";

function sourceKindFor(contentType: ContentType): SourceKind {
  if (contentType === "hn") {
    return "hn";
  }
  if (contentType === "blog") {
    return "company_blog";
  }
  return "personal";
}

export async function saveLink(
  env: Env,
  input: {
    url: string;
    title?: string;
    excerpt?: string;
    discoveredVia: string;
    contentType?: ContentType;
    publishedAt?: number | null;
    score?: number;
    fetch?: boolean;
    preview?: boolean;
  },
): Promise<{ id: number; created: boolean }> {
  const canonical = canonicalize(input.url);
  if (!canonical) {
    throw new Error("invalid_url");
  }

  const existing = await findByCanonical(env.DB, canonical);
  const contentType = input.contentType ?? classifyUrl(canonical, input.discoveredVia);
  const site = hostnameOf(canonical);
  const tweet =
    contentType === "tweet" && input.preview !== false
      ? await fetchTweetPreview(canonical)
      : null;
  const title =
    input.title?.trim() ||
    (tweet
      ? `${tweet.name} (@${tweet.handle})`
      : contentType === "tweet"
        ? tweetTitleFromUrl(canonical)
        : site);
  const excerpt =
    (contentType === "tweet" && tweet?.text ? tweet.text : input.excerpt?.trim()) ||
    canonical;
  const sourceId = await upsertSource(env.DB, site, sourceKindFor(contentType));

  const id = await insertPost(env.DB, {
    url: canonical,
    canonicalUrl: canonical,
    sourceId,
    title,
    excerpt,
    site,
    topic: guessTopic(title, excerpt),
    contentType,
    publishedAt: tweet?.publishedAt ?? input.publishedAt ?? null,
    wordCount: excerpt.split(/\s+/).filter(Boolean).length,
    score: input.score ?? 80,
    r2Key: null,
    discoveredVia: input.discoveredVia,
    imageUrl:
      contentType === "tweet"
        ? (tweet?.imageUrl ?? tweetEmbedImageUrl(canonical))
        : null,
  });

  await markJob(env.DB, canonical, "done");
  await indexPost(env, id, { title, excerpt, site, url: canonical });

  const shouldFetch =
    input.fetch !== false &&
    contentType !== "tweet" &&
    Boolean(env.TINYFISH_API_KEY?.trim());

  if (shouldFetch && !existing) {
    await env.FETCH_QUEUE.send({
      url: canonical,
      discoveredVia: input.discoveredVia,
      sourceKind: sourceKindFor(contentType),
      depth: 1,
    });
  }

  return { id, created: !existing };
}

export async function saveFromFetch(
  env: Env,
  rawUrl: string,
): Promise<{ id: number; created: boolean }> {
  const canonical = canonicalize(rawUrl);
  if (!canonical) {
    throw new Error("invalid_url");
  }
  const apiKey = env.TINYFISH_API_KEY?.trim();
  if (!apiKey) {
    return saveLink(env, { url: canonical, discoveredVia: "saved" });
  }

  const { pages, errors } = await tinyfishFetch(apiKey, [canonical]);
  const page = pages[0];
  if (!page) {
    const err = errors[0]?.error ?? "fetch_failed";
    throw new Error(err);
  }

  const contentType = classifyUrl(page.url || canonical, "saved");
  return saveLink(env, {
    url: page.url || canonical,
    title: page.title,
    excerpt: page.text.slice(0, 400),
    discoveredVia: "saved",
    contentType,
    fetch: false,
  });
}

const IMPORT_LIMIT = 80;

export async function saveImported(
  env: Env,
  input: { text?: string; items?: BookmarkImport[] },
): Promise<{
  saved: number;
  skipped: number;
  failed: number;
  total: number;
}> {
  const parsed = [
    ...(input.items ?? []),
    ...(input.text ? extractBookmarkImports(input.text) : []),
  ];
  const unique = new Map<string, BookmarkImport>();
  for (const item of parsed) {
    const canonical = canonicalize(item.url);
    if (!canonical) {
      continue;
    }
    if (!unique.has(canonical)) {
      unique.set(canonical, { ...item, url: canonical });
    }
  }
  const batch = [...unique.values()].slice(0, IMPORT_LIMIT);
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of batch) {
    try {
      const existing = await findByCanonical(env.DB, item.url);
      const result = await saveLink(env, {
        url: item.url,
        title: item.title,
        excerpt: item.excerpt,
        publishedAt: item.publishedAt,
        discoveredVia: "saved",
        contentType: "tweet",
        fetch: false,
        preview: !item.excerpt,
      });
      if (existing || !result.created) {
        skipped += 1;
      } else {
        saved += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { saved, skipped, failed, total: batch.length };
}
