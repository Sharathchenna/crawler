import { crawlerFetch } from "@/lib/origin";
import {
  isContentType,
  isOrigin,
  isTopic,
  type ContentType,
  type Origin,
  type PostDetail,
  type PostSummary,
  type Topic,
} from "@/shared/types";

type ListOptions = {
  topic?: Topic;
  contentType?: ContentType;
  origin?: Origin;
  limit?: number;
};

export async function listPosts(
  options: ListOptions = {},
): Promise<PostSummary[]> {
  const params = new URLSearchParams();
  if (options.topic) {
    params.set("topic", options.topic);
  }
  if (options.contentType) {
    params.set("type", options.contentType);
  }
  if (options.origin) {
    params.set("origin", options.origin);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const remote = await crawlerFetch<{ posts: PostSummary[] }>(
    `/api/posts${query ? `?${query}` : ""}`,
  );

  return remote?.posts ?? [];
}

export async function searchPosts(
  query: string,
  options: { topic?: Topic; contentType?: ContentType; origin?: Origin } = {},
): Promise<PostSummary[]> {
  const trimmed = query.trim();
  if (!trimmed && !options.topic && !options.contentType && !options.origin) {
    return listPosts();
  }

  const params = new URLSearchParams();
  if (trimmed) {
    params.set("q", trimmed);
  }
  if (options.topic) {
    params.set("topic", options.topic);
  }
  if (options.contentType) {
    params.set("type", options.contentType);
  }
  if (options.origin) {
    params.set("origin", options.origin);
  }

  const remote = await crawlerFetch<{ posts: PostSummary[] }>(
    `/api/search?${params.toString()}`,
  );

  return remote?.posts ?? [];
}

export async function getStats(): Promise<{ suggested: number; saved: number } | null> {
  return crawlerFetch<{ suggested: number; saved: number }>("/api/stats");
}

export async function getPost(id: number): Promise<PostDetail | null> {
  const remote = await crawlerFetch<PostDetail>(`/api/posts/${id}`);
  return remote?.id ? remote : null;
}

export function parseTopicParam(
  value: string | string[] | undefined,
): Topic | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }
  return isTopic(raw) ? raw : undefined;
}

export function parseTypeParam(
  value: string | string[] | undefined,
): ContentType | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }
  return isContentType(raw) ? raw : undefined;
}

export function parseOriginParam(
  value: string | string[] | undefined,
): Origin | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }
  return isOrigin(raw) ? raw : undefined;
}

export function parseQueryParam(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}
