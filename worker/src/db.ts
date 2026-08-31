import { suggestedSince } from "../../shared/freshness";
import type {
  ContentType,
  Origin,
  PostDetail,
  PostSummary,
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

const SELECT_SUMMARY = `id, url, title, excerpt, site, topic, content_type, score, word_count, published_at, discovered_via, image_url`;

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
  };
}

function originClause(origin?: Origin): { sql: string; binds: string[] } {
  if (origin === "saved") {
    return { sql: "discovered_via = ?", binds: ["saved"] };
  }
  if (origin === "suggested") {
    return { sql: "discovered_via != ?", binds: ["saved"] };
  }
  return { sql: "", binds: [] };
}

function applyShelfFilters(
  filters: string[],
  binds: Array<string | number>,
  options: {
    topic?: Topic;
    contentType?: ContentType;
    origin?: Origin;
    since?: number;
  },
): void {
  if (options.contentType) {
    filters.push("content_type = ?");
    binds.push(options.contentType);
  }
  if (options.topic) {
    filters.push("topic = ?");
    binds.push(options.topic);
  }
  const origin = originClause(options.origin);
  if (origin.sql) {
    filters.push(origin.sql);
    binds.push(...origin.binds);
  }
  const since = options.since ?? suggestedSince();
  if (options.origin === "suggested") {
    filters.push("COALESCE(published_at, created_at) >= ?");
    binds.push(since);
  } else if (options.origin === undefined) {
    filters.push(
      "(discovered_via = 'saved' OR COALESCE(published_at, created_at) >= ?)",
    );
    binds.push(since);
  }
}

export async function pruneStaleSuggested(db: D1Database): Promise<number> {
  const since = suggestedSince();
  const result = await db
    .prepare(
      `DELETE FROM posts
       WHERE discovered_via != 'saved'
         AND COALESCE(published_at, created_at) < ?`,
    )
    .bind(since)
    .run();
  return result.meta.changes ?? 0;
}

async function querySummaries(
  db: D1Database,
  options: {
    topic?: Topic;
    contentType?: ContentType;
    origin?: Origin;
    limit: number;
  },
): Promise<PostSummary[]> {
  const limit = Math.min(Math.max(options.limit, 1), 50);
  const filters: string[] = [];
  const binds: Array<string | number> = [];
  applyShelfFilters(filters, binds, options);
  binds.push(limit);
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const recencyFirst = options.origin !== "saved";
  const rows = await db
    .prepare(
      `SELECT ${SELECT_SUMMARY} FROM posts
       ${where}
       ORDER BY ${recencyFirst ? "COALESCE(published_at, created_at) DESC, score DESC" : "score DESC, created_at DESC"}
       LIMIT ?`,
    )
    .bind(...binds)
    .all<SummaryRow>();
  return (rows.results ?? []).map(toSummary);
}

async function listSuggestedMix(
  db: D1Database,
  options: {
    topic?: Topic;
    origin?: Origin;
    limit: number;
  },
): Promise<PostSummary[]> {
  const types: ContentType[] = ["blog", "paper", "tweet", "hn"];
  const buckets = await Promise.all(
    types.map((contentType) =>
      querySummaries(db, { ...options, contentType, origin: "suggested", limit: options.limit }),
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
  options: {
    topic?: Topic;
    contentType?: ContentType;
    origin?: Origin;
    limit: number;
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
  options: { topic?: Topic; contentType?: ContentType; origin?: Origin } = {},
): Promise<PostSummary[]> {
  const like = `%${query.replaceAll("%", "").replaceAll("_", "")}%`;
  const filters: string[] = [
    "(title LIKE ? OR excerpt LIKE ? OR site LIKE ? OR url LIKE ?)",
  ];
  const binds: Array<string | number> = [like, like, like, like];
  applyShelfFilters(filters, binds, options);
  binds.push(40);

  const rows = await db
    .prepare(
      `SELECT ${SELECT_SUMMARY} FROM posts
       WHERE ${filters.join(" AND ")}
       ORDER BY COALESCE(published_at, created_at) DESC, score DESC LIMIT ?`,
    )
    .bind(...binds)
    .all<SummaryRow>();
  return (rows.results ?? []).map(toSummary);
}

export async function catalogStats(
  db: D1Database,
): Promise<{ suggested: number; saved: number }> {
  const since = suggestedSince();
  const saved = await db
    .prepare("SELECT COUNT(*) AS n FROM posts WHERE discovered_via = 'saved'")
    .first<{ n: number }>();
  const suggested = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM posts
       WHERE discovered_via != 'saved'
         AND COALESCE(published_at, created_at) >= ?`,
    )
    .bind(since)
    .first<{ n: number }>();
  return {
    saved: saved?.n ?? 0,
    suggested: suggested?.n ?? 0,
  };
}

export async function getPostRow(
  env: Env,
  id: number,
): Promise<PostDetail | null> {
  const row = await env.DB.prepare(
    `SELECT ${SELECT_SUMMARY}, r2_key FROM posts WHERE id = ?`,
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
