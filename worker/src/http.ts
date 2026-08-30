import { classifyUrl } from "../../shared/classify";
import { isContentType, isOrigin, isTopic } from "../../shared/types";
import { catalogStats, getPostRow, listPosts, searchPosts } from "./db";
import { discover } from "./discover";
import { postsByIds, semanticIds } from "./embeddings";
import type { Env } from "./env";
import { saveFromFetch, saveLink } from "./save";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cors,
    },
  });
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") {
    return json({ ok: true });
  }

  if (path === "/api/posts" && request.method === "GET") {
    const topicRaw = url.searchParams.get("topic") ?? "";
    const typeRaw = url.searchParams.get("type") ?? "";
    const originRaw = url.searchParams.get("origin") ?? "";
    const topic = isTopic(topicRaw) ? topicRaw : undefined;
    const contentType = isContentType(typeRaw) ? typeRaw : undefined;
    const origin = isOrigin(originRaw) ? originRaw : undefined;
    const limit = Number(url.searchParams.get("limit") ?? "24");
    const posts = await listPosts(env.DB, {
      topic,
      contentType,
      origin,
      limit: Number.isFinite(limit) ? limit : 24,
    });
    return json({ posts });
  }

  if (path === "/api/stats" && request.method === "GET") {
    const stats = await catalogStats(env.DB);
    return json(stats);
  }

  if (path === "/api/search" && request.method === "GET") {
    const q = url.searchParams.get("q")?.trim() ?? "";
    const topicRaw = url.searchParams.get("topic") ?? "";
    const typeRaw = url.searchParams.get("type") ?? "";
    const originRaw = url.searchParams.get("origin") ?? "";
    const topic = isTopic(topicRaw) ? topicRaw : undefined;
    const contentType = isContentType(typeRaw) ? typeRaw : undefined;
    const origin = isOrigin(originRaw) ? originRaw : undefined;
    if (!q) {
      const posts = await listPosts(env.DB, {
        topic,
        contentType,
        origin,
        limit: 24,
      });
      return json({ posts });
    }
    const ids = await semanticIds(env, q);
    const posts = ids
      ? await postsByIds(env.DB, ids, { contentType, origin })
      : await searchPosts(env.DB, q, { topic, contentType, origin });
    return json({
      posts,
      mode: ids ? "semantic" : "keyword",
    });
  }

  if (path === "/api/save" && request.method === "POST") {
    let payload: { url?: string; contentType?: string } = {};
    try {
      payload = (await request.json()) as { url?: string; contentType?: string };
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const raw = payload.url?.trim() ?? "";
    if (!raw) {
      return json({ error: "url_required" }, 400);
    }
    const rawType = payload.contentType ?? "";
    const contentType = isContentType(rawType) ? rawType : undefined;
    try {
      const type = contentType ?? classifyUrl(raw, "saved");
      const result =
        type === "tweet"
          ? await saveLink(env, {
              url: raw,
              discoveredVia: "saved",
              contentType: "tweet",
              fetch: false,
            })
          : await saveFromFetch(env, raw).catch(() =>
              saveLink(env, {
                url: raw,
                discoveredVia: "saved",
                contentType: type,
                fetch: false,
              }),
            );
      return json({ ...result, contentType: type });
    } catch (error) {
      const message = error instanceof Error ? error.message : "save_failed";
      return json({ error: message }, 400);
    }
  }

  const postMatch = path.match(/^\/api\/posts\/(\d+)$/);
  if (postMatch && request.method === "GET") {
    const post = await getPostRow(env, Number(postMatch[1]));
    if (!post) {
      return json({ error: "not_found" }, 404);
    }
    return json(post);
  }

  if (path === "/api/discover" && request.method === "POST") {
    const result = await discover(env);
    return json(result);
  }

  return json({ error: "not_found" }, 404);
}
