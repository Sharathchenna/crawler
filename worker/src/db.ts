import { suggestedSince } from "../../shared/freshness";
import {
  EMPTY_SIGNALS,
  avoidedDomains,
  rankForSuggested,
  signalsFromReactions,
  type PreferenceSignals,
} from "../../shared/preference";
import type {
  ContentType,
  Origin,
  PostDetail,
  PostSummary,
  ReactionKind,
  SourceKind,
  Topic,
} from "../../shared/types";
import type { Env } from "./env";

export async function alreadySeen(
  db: D1Database,
  canonicalUrl: string,
): Promise<boolean> {
  const existing = await db
    .prepare(
      "SELECT 1 AS ok FROM posts WHERE canonical_url = ? UNION SELECT 1 FROM crawl_jobs WHERE url = ? LIMIT 1",
    )
    .bind(canonicalUrl, canonicalUrl)
    .first();
  return Boolean(existing);
}

export async function findByCanonical(
  db: D1Database,
  canonicalUrl: string,
): Promise<number | null> {
  const row = await db
    .prepare("SELECT id FROM posts WHERE canonical_url = ?")
    .bind(canonicalUrl)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function markJob(
  db: D1Database,
  url: string,
  status: "queued" | "fetching" | "done" | "skipped" | "error",
  error?: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO crawl_jobs (url, status, attempts, last_error, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         status = excluded.status,
         attempts = crawl_jobs.attempts + 1,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .bind(url, status, error ?? null, now)
    .run();
}

export async function upsertSource(
  db: D1Database,
  domain: string,
  kind: SourceKind,
): Promise<number> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO sources (domain, kind, last_crawled)
       VALUES (?, ?, ?)
       ON CONFLICT(domain) DO UPDATE SET last_crawled = excluded.last_crawled`,
    )
    .bind(domain, kind, now)
    .run();
  const row = await db
    .prepare("SELECT id FROM sources WHERE domain = ?")
    .bind(domain)
    .first<{ id: number }>();
  if (!row) {
    throw new Error("source_insert_failed");
  }
  return row.id;
}

const SELECT_SUMMARY = `posts.id, posts.url, posts.title, posts.excerpt, posts.site, posts.topic, posts.content_type, posts.score, posts.word_count, posts.published_at, posts.discovered_via, posts.image_url, posts.created_at, reactions.kind AS reaction`;

const FROM_POSTS = `FROM posts LEFT JOIN reactions ON reactions.post_id = posts.id`;

export async function insertPost(
  db: D1Database,
  post: {
    url: string;
    canonicalUrl: string;
    sourceId: number;
    title: string;
    excerpt: string;
    site: string;
    topic: Topic;
    contentType: ContentType;
    publishedAt: number | null;
    wordCount: number;
    score: number;
    r2Key: string | null;
    discoveredVia: string;
    imageUrl?: string | null;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO posts (
         url, canonical_url, source_id, title, excerpt, site, topic, content_type,
         published_at, word_count, score, r2_key, discovered_via, created_at, image_url
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(canonical_url) DO UPDATE SET
         title = excluded.title,
         excerpt = excluded.excerpt,
         score = excluded.score,
         word_count = excluded.word_count,
         r2_key = excluded.r2_key,
         content_type = excluded.content_type,
         image_url = COALESCE(excluded.image_url, posts.image_url),
         discovered_via = CASE
           WHEN excluded.discovered_via = 'saved' THEN 'saved'
           ELSE posts.discovered_via
         END
       RETURNING id`,
    )
    .bind(
      post.url,
      post.canonicalUrl,
      post.sourceId,
      post.title,
      post.excerpt,
      post.site,
      post.topic,
      post.contentType,
      post.publishedAt,
      post.wordCount,
      post.score,
      post.r2Key,
      post.discoveredVia,
      Date.now(),
      post.imageUrl ?? null,
    )
    .first<{ id: number }>();

  if (!result) {
    throw new Error("post_insert_failed");
  }
  return result.id;
}

type SummaryRow = {
  id: number;
  url: string;
  title: string;
  excerpt: string;
  site: string;
  topic: Topic;
  content_type: ContentType;
  score: number;
  word_count: number;
  published_at: number | null;
  discovered_via: string;
  image_url: string | null;
  created_at: number;
  reaction: ReactionKind | null;
};

function toSummary(row: SummaryRow): PostSummary {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    excerpt: row.excerpt,
    site: row.site,
    topic: row.topic,
    contentType: row.content_type,
    score: row.score,
    wordCount: row.word_count,
    publishedAt: row.published_at,
    discoveredVia: row.discovered_via,
    imageUrl: row.image_url,
    reaction: row.reaction,
  };
}

function toRankable(row: SummaryRow) {
  return {
    id: row.id,
    site: row.site,
    topic: row.topic,
    contentType: row.content_type,
    score: row.score,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function originClause(origin?: Origin): { sql: string; binds: string[] } {
  if (origin === "saved") {
    return { sql: "posts.discovered_via = ?", binds: ["saved"] };
  }
  if (origin === "suggested") {
    return { sql: "posts.discovered_via != ?", binds: ["saved"] };
  }
  return { sql: "", binds: [] };
}

type ShelfOptions = {
  topic?: Topic;
  contentType?: ContentType;
  origin?: Origin;
  reaction?: ReactionKind;
  since?: number;
};

function applyShelfFilters(
  filters: string[],
  binds: Array<string | number>,
  options: ShelfOptions,
): void {
  if (options.contentType) {
    filters.push("posts.content_type = ?");
    binds.push(options.contentType);
  }
  if (options.topic) {
    filters.push("posts.topic = ?");
    binds.push(options.topic);
  }
  const origin = originClause(options.origin);
  if (origin.sql) {
    filters.push(origin.sql);
    binds.push(...origin.binds);
  }
  if (options.origin === "archived") {
    filters.push("reactions.post_id IS NOT NULL");
  } else if (options.origin === "saved" || options.origin === "suggested") {
    filters.push("reactions.post_id IS NULL");
  }
  if (options.reaction) {
    filters.push("reactions.kind = ?");
    binds.push(options.reaction);
  }
  if (options.origin === "archived") {
    return;
  }
  const since = options.since ?? suggestedSince();
  if (options.origin === "suggested") {
    filters.push("COALESCE(posts.published_at, posts.created_at) >= ?");
    binds.push(since);
  } else if (options.origin === undefined) {
    filters.push(
      "(posts.discovered_via = 'saved' OR COALESCE(posts.published_at, posts.created_at) >= ? OR reactions.post_id IS NOT NULL)",
    );
    binds.push(since);
  }
}

function orderClause(origin?: Origin): string {
  if (origin === "archived") {
    return "reactions.created_at DESC, posts.created_at DESC";
  }
  if (origin === "saved") {
    return "posts.score DESC, posts.created_at DESC";
  }
  return "COALESCE(posts.published_at, posts.created_at) DESC, posts.score DESC";
}

export async function pruneStaleSuggested(db: D1Database): Promise<number> {
  const since = suggestedSince();
  const result = await db
    .prepare(
      `DELETE FROM posts
       WHERE discovered_via != 'saved'
         AND COALESCE(published_at, created_at) < ?
         AND id NOT IN (SELECT post_id FROM reactions)`,
    )
    .bind(since)
    .run();
  return result.meta.changes ?? 0;
}

async function querySummaries(
  db: D1Database,
  options: ShelfOptions & {
    limit: number;
    signals?: PreferenceSignals;
  },
): Promise<PostSummary[]> {
  const limit = Math.min(Math.max(options.limit, 1), 50);
  const rankSuggested = options.origin === "suggested";
  const fetchLimit = rankSuggested ? Math.min(50, Math.max(limit * 3, limit)) : limit;
  const filters: string[] = [];
  const binds: Array<string | number> = [];
  applyShelfFilters(filters, binds, options);
  binds.push(fetchLimit);
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT ${SELECT_SUMMARY} ${FROM_POSTS}
       ${where}
       ORDER BY ${orderClause(options.origin)}
       LIMIT ?`,
    )
    .bind(...binds)
    .all<SummaryRow>();
  const results = rows.results ?? [];
  const ranked =
    rankSuggested && options.signals
      ? rankForSuggested(results.map(toRankable), options.signals).map(
          (item) => results.find((row) => row.id === item.id)!,
        )
      : results;
  return ranked.slice(0, limit).map(toSummary);
}

async function listSuggestedMix(
  db: D1Database,
  options: {
    topic?: Topic;
    origin?: Origin;
    limit: number;
    signals?: PreferenceSignals;
  },
): Promise<PostSummary[]> {
  const types: ContentType[] = ["blog", "paper", "tweet", "hn"];
  const buckets = await Promise.all(
    types.map((contentType) =>
      querySummaries(db, {
        ...options,
        contentType,
        origin: "suggested",
        limit: options.limit,
        signals: options.signals,
      }),
    ),
  );
  const seen = new Set<number>();
  const mixed: PostSummary[] = [];
  let progressed = true;
  while (mixed.length < options.limit && progressed) {
    progressed = false;
    for (const bucket of buckets) {
      const next = bucket.find((post) => !seen.has(post.id));
      if (!next) {
        continue;
      }
      seen.add(next.id);
      mixed.push(next);
      progressed = true;
      if (mixed.length >= options.limit) {
        break;
      }
    }
  }
  if (mixed.length < options.limit) {
    const rest = await querySummaries(db, {
      ...options,
      origin: "suggested",
      limit: options.limit,
      signals: options.signals,
    });
    for (const post of rest) {
      if (seen.has(post.id)) {
        continue;
      }
      mixed.push(post);
      if (mixed.length >= options.limit) {
        break;
      }
    }
  }
  return mixed;
}

export async function listPosts(
  db: D1Database,
  options: ShelfOptions & {
    limit: number;
    signals?: PreferenceSignals;
  },
): Promise<PostSummary[]> {
  const limit = Math.min(Math.max(options.limit, 1), 50);
  if (options.origin === "suggested" && !options.contentType) {
    return listSuggestedMix(db, { ...options, limit });
  }
  return querySummaries(db, { ...options, limit });
}

export async function searchPosts(
  db: D1Database,
  query: string,
  options: ShelfOptions = {},
): Promise<PostSummary[]> {
  const like = `%${query.replaceAll("%", "").replaceAll("_", "")}%`;
  const filters: string[] = [
    "(posts.title LIKE ? OR posts.excerpt LIKE ? OR posts.site LIKE ? OR posts.url LIKE ?)",
  ];
  const binds: Array<string | number> = [like, like, like, like];
  applyShelfFilters(filters, binds, options);
  binds.push(40);

  const rows = await db
    .prepare(
      `SELECT ${SELECT_SUMMARY} ${FROM_POSTS}
       WHERE ${filters.join(" AND ")}
       ORDER BY ${orderClause(options.origin)} LIMIT ?`,
    )
    .bind(...binds)
    .all<SummaryRow>();
  return (rows.results ?? []).map(toSummary);
}

export async function catalogStats(
  db: D1Database,
): Promise<{ suggested: number; saved: number; archived: number }> {
  const since = suggestedSince();
  const saved = await db
    .prepare(
      `SELECT COUNT(*) AS n ${FROM_POSTS}
       WHERE posts.discovered_via = 'saved' AND reactions.post_id IS NULL`,
    )
    .first<{ n: number }>();
  const suggested = await db
    .prepare(
      `SELECT COUNT(*) AS n ${FROM_POSTS}
       WHERE posts.discovered_via != 'saved'
         AND COALESCE(posts.published_at, posts.created_at) >= ?
         AND reactions.post_id IS NULL`,
    )
    .bind(since)
    .first<{ n: number }>();
  const archived = await db
    .prepare("SELECT COUNT(*) AS n FROM reactions")
    .first<{ n: number }>();
  return {
    saved: saved?.n ?? 0,
    suggested: suggested?.n ?? 0,
    archived: archived?.n ?? 0,
  };
}

export async function getPostRow(
  env: Env,
  id: number,
): Promise<PostDetail | null> {
  const row = await env.DB.prepare(
    `SELECT ${SELECT_SUMMARY}, posts.r2_key ${FROM_POSTS} WHERE posts.id = ?`,
  )
    .bind(id)
    .first<SummaryRow & { r2_key: string | null }>();

  if (!row) {
    return null;
  }

  let body = row.excerpt;
  if (row.r2_key) {
    const object = await env.POSTS.get(row.r2_key);
    if (object) {
      body = await object.text();
    }
  }

  return {
    ...toSummary(row),
    body,
  };
}

export async function setReaction(
  db: D1Database,
  postId: number,
  kind: ReactionKind,
): Promise<boolean> {
  const existing = await db
    .prepare("SELECT id FROM posts WHERE id = ?")
    .bind(postId)
    .first<{ id: number }>();
  if (!existing) {
    return false;
  }
  await db
    .prepare(
      `INSERT INTO reactions (post_id, kind, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         kind = excluded.kind,
         created_at = excluded.created_at`,
    )
    .bind(postId, kind, Date.now())
    .run();
  return true;
}

export async function clearReaction(
  db: D1Database,
  postId: number,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM reactions WHERE post_id = ?")
    .bind(postId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function loadPreferenceSignals(
  db: D1Database,
  similarIds: number[] = [],
): Promise<PreferenceSignals> {
  const rows = await db
    .prepare(
      `SELECT reactions.kind AS kind, posts.site AS site, posts.topic AS topic,
              posts.content_type AS content_type
       FROM reactions
       JOIN posts ON posts.id = reactions.post_id`,
    )
    .all<{
      kind: ReactionKind;
      site: string;
      topic: Topic;
      content_type: ContentType;
    }>();
  const mapped = (rows.results ?? []).map((row) => ({
    kind: row.kind,
    site: row.site,
    topic: row.topic,
    contentType: row.content_type,
  }));
  if (mapped.length === 0 && similarIds.length === 0) {
    return EMPTY_SIGNALS;
  }
  return signalsFromReactions(mapped, similarIds);
}

export async function likedPostTexts(
  db: D1Database,
  limit = 8,
): Promise<Array<{ id: number; title: string; excerpt: string }>> {
  const rows = await db
    .prepare(
      `SELECT posts.id AS id, posts.title AS title, posts.excerpt AS excerpt
       FROM reactions
       JOIN posts ON posts.id = reactions.post_id
       WHERE reactions.kind = 'like'
       ORDER BY reactions.created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: number; title: string; excerpt: string }>();
  return rows.results ?? [];
}

export async function avoidedSiteSet(db: D1Database): Promise<Set<string>> {
  const signals = await loadPreferenceSignals(db);
  return avoidedDomains(signals);
}
