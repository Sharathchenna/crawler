import { suggestedSince } from "../../shared/freshness";
import { originOf, type ContentType, type Origin, type PostSummary, type Topic } from "../../shared/types";
import type { Env } from "./env";

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

function embedText(post: {
  title: string;
  excerpt: string;
  site: string;
  url: string;
}): string {
  return `${post.title}\n${post.excerpt}\n${post.site}\n${post.url}`.slice(0, 6000);
}

async function embeddingOf(
  ai: Ai,
  text: string,
): Promise<number[] | null> {
  try {
    const result = await ai.run(EMBED_MODEL, { text: [text] });
    const data =
      result && typeof result === "object" && "data" in result
        ? (result as { data?: number[][] }).data
        : undefined;
    const values = data?.[0];
    return values && values.length > 0 ? values : null;
  } catch (error) {
    console.error("embed failed", error);
    return null;
  }
}

export async function indexPost(
  env: Env,
  postId: number,
  post: { title: string; excerpt: string; site: string; url: string },
): Promise<void> {
  if (!env.AI || !env.VECTORIZE) {
    return;
  }
  const values = await embeddingOf(env.AI, embedText(post));
  if (!values) {
    return;
  }
  await env.VECTORIZE.upsert([
    { id: String(postId), values, metadata: { postId } },
  ]);
}

export async function semanticIds(
  env: Env,
  query: string,
): Promise<number[] | null> {
  if (!env.AI || !env.VECTORIZE) {
    return null;
  }
  const values = await embeddingOf(env.AI, query);
  if (!values) {
    return null;
  }
  try {
    const result = await env.VECTORIZE.query(values, { topK: 24 });
    return result.matches
      .map((match) => Number(match.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch (error) {
    console.error("vectorize query failed", error);
    return null;
  }
}

export async function postsByIds(
  db: D1Database,
  ids: number[],
  options: { contentType?: ContentType; origin?: Origin } = {},
): Promise<PostSummary[]> {
  if (ids.length === 0) {
    return [];
  }
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT id, url, title, excerpt, site, topic, content_type, score, word_count, published_at, discovered_via, image_url
       FROM posts WHERE id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<{
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
    }>();

  const byId = new Map(
    (rows.results ?? []).map((row) => [
      row.id,
      {
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
      } satisfies PostSummary,
    ]),
  );

  return ids
    .map((id) => byId.get(id))
    .filter((post): post is PostSummary => Boolean(post))
    .filter((post) => (options.contentType ? post.contentType === options.contentType : true))
    .filter((post) => (options.origin ? originOf(post.discoveredVia) === options.origin : true))
    .filter((post) => {
      if (options.origin === "saved") {
        return true;
      }
      if (!post.publishedAt) {
        return true;
      }
      return post.publishedAt >= suggestedSince();
    });
}
