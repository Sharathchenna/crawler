import { tweetHandleFromUrl, tweetStatusId } from "./tweet";

export type BookmarkImport = {
  url: string;
  title?: string;
  excerpt?: string;
  publishedAt?: number | null;
};

const STATUS_IN_TEXT =
  /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:[A-Za-z0-9_]+|i\/web)\/status\/(\d+)/gi;
const MAX_ITEMS = 200;
const MAX_WALK = 4000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d{8,}$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function handleOf(value: unknown): string | null {
  const direct =
    asString(value) ??
    asString(asRecord(value)?.username) ??
    asString(asRecord(value)?.handle) ??
    asString(asRecord(value)?.screen_name) ??
    asString(asRecord(value)?.screenName);
  if (!direct) {
    return null;
  }
  return direct.replace(/^@/, "");
}

function publishedOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  const text = asString(value);
  if (!text) {
    return null;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function tweetUrlFrom(id: string, handle: string | null): string {
  const user = handle && handle !== "i" && handle !== "web" ? handle : "i";
  return `https://x.com/${user}/status/${id}`;
}

function parseLooseJson(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const assignment = trimmed.match(
    /^(?:window\.)?YTD\.[A-Za-z0-9_.]+\s*=\s*([\s\S]+)$/,
  );
  const body = assignment?.[1]?.replace(/;\s*$/, "") ?? trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return undefined;
    }
    const rows: unknown[] = [];
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        return undefined;
      }
    }
    return rows;
  }
}

function collectFromRecord(row: Record<string, unknown>): BookmarkImport | null {
  const nestedTweet = asRecord(row.tweet) ?? asRecord(row.bookmark);
  const source = nestedTweet ?? row;
  const author =
    asRecord(source.author) ??
    asRecord(source.user) ??
    asRecord(row.author) ??
    asRecord(row.user);
  const handle =
    handleOf(source.username) ??
    handleOf(source.handle) ??
    handleOf(source.screen_name) ??
    handleOf(author) ??
    tweetHandleFromUrl(
      asString(source.url) ??
        asString(source.canonicalUrl) ??
        asString(source.canonical_url) ??
        asString(row.url) ??
        "",
    );
  const id =
    asId(source.id) ??
    asId(source.tweetId) ??
    asId(source.tweet_id) ??
    asId(source.status_id) ??
    tweetStatusId(
      asString(source.url) ??
        asString(source.canonicalUrl) ??
        asString(source.canonical_url) ??
        asString(row.url) ??
        "",
    );
  const rawUrl =
    asString(source.canonicalUrl) ??
    asString(source.canonical_url) ??
    asString(source.url) ??
    asString(source.permalink) ??
    asString(row.url) ??
    (id ? tweetUrlFrom(id, handle) : null);
  if (!rawUrl || !tweetStatusId(rawUrl)) {
    return null;
  }
  const name = asString(author?.name) ?? handle;
  const excerpt =
    asString(source.plainText) ??
    asString(source.full_text) ??
    asString(source.text) ??
    asString(source.markdown) ??
    asString(row.plainText) ??
    asString(row.text);
  const title =
    name && handle
      ? `${name} (@${handle})`
      : handle
        ? `@${handle}`
        : undefined;
  return {
    url: rawUrl,
    title,
    excerpt: excerpt ?? undefined,
    publishedAt:
      publishedOf(source.created_at) ??
      publishedOf(source.createdAt) ??
      publishedOf(source.created_timestamp) ??
      publishedOf(source.publishedAt) ??
      null,
  };
}

function walk(value: unknown, into: BookmarkImport[], seen: Set<string>): void {
  if (into.length >= MAX_ITEMS || seen.size > MAX_WALK) {
    return;
  }
  if (typeof value === "string") {
    STATUS_IN_TEXT.lastIndex = 0;
    let match: RegExpExecArray | null = STATUS_IN_TEXT.exec(value);
    while (match) {
      const url = match[0];
      const id = match[1];
      if (id && !seen.has(id)) {
        seen.add(id);
        const handle = tweetHandleFromUrl(url);
        into.push({ url: tweetUrlFrom(id, handle) });
      }
      if (into.length >= MAX_ITEMS) {
        return;
      }
      match = STATUS_IN_TEXT.exec(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, into, seen);
      if (into.length >= MAX_ITEMS) {
        return;
      }
    }
    return;
  }
  const row = asRecord(value);
  if (!row) {
    return;
  }
  const parsed = collectFromRecord(row);
  if (parsed) {
    const id = tweetStatusId(parsed.url);
    if (id && !seen.has(id)) {
      seen.add(id);
      into.push(parsed);
    }
  }
  const nested = row.data ?? row.items ?? row.tweets ?? row.results ?? row.bookmarks;
  if (nested !== undefined) {
    walk(nested, into, seen);
  }
  if (into.length >= MAX_ITEMS) {
    return;
  }
  for (const [key, child] of Object.entries(row)) {
    if (key === "data" || key === "items" || key === "tweets") {
      continue;
    }
    if (child && typeof child === "object") {
      walk(child, into, seen);
      if (into.length >= MAX_ITEMS) {
        return;
      }
    }
  }
}

export function extractBookmarkImports(input: unknown): BookmarkImport[] {
  const items: BookmarkImport[] = [];
  const seen = new Set<string>();
  if (typeof input === "string") {
    const parsed = parseLooseJson(input);
    if (parsed !== undefined) {
      walk(parsed, items, seen);
    } else {
      walk(input, items, seen);
    }
  } else {
    walk(input, items, seen);
  }
  return items.slice(0, MAX_ITEMS);
}
