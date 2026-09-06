// Shared, runtime-validated discovery contract. No provider credentials here.
export type DiscoveryInput = { topics: string; seeds: string[]; budget: number };
export type DiscoveredArticle = {
  url: string; title: string; author: string; summary: string; reason: string; minutes: number;
  imageUrl: string;
};
export type DigestView = {
  id: string; day: string; slot: number; topics: string; seeds: string; budget: number;
  status: string; error: string | null; attempts: number;
  origin: string;
  articles: (DiscoveredArticle & { id: string; status: string; itemId: string | null })[];
};
export type DiscoveryResponse = {
  configured: boolean; digest: DigestView | null; preferences: DiscoveryInput | null;
  editionDay: string; editionSlot: number;
  editions: { day: string; slot: number; status: string }[];
  schedule: { enabled: boolean; topics: string; budget: number; sourceIds: string[]; nextRunAt: string; lastRunAt: string | null; lastError: string | null; sourceHealth: import("./discovery-sources").SourceHealth[] } | null;
};

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function publicBlogUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    // Only public hostnames, never credentials, IP literals or local destinations.
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      !host.includes(".") || host.includes(":") || /^[\d.]+$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
      /(^|\.)(x\.com|twitter\.com|t\.co|facebook\.com|instagram\.com|tiktok\.com)$/.test(host)) return null;
    url.hostname = host;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch { return null; }
}

export function parseDiscoveryInput(value: unknown): DiscoveryInput {
  const body = record(value);
  const topics = typeof body.topics === "string" ? body.topics.trim() : "";
  if (topics.length < 3 || topics.length > 500) throw new Error("Describe your interests in 3–500 characters.");
  if (!Array.isArray(body.seeds) || body.seeds.length > 3) throw new Error("Add up to three favourite blog URLs.");
  const seeds = body.seeds.map(publicBlogUrl);
  if (seeds.some((url) => !url)) throw new Error("Use full public blog URLs (https://…), without social feeds or local addresses.");
  if (typeof body.budget !== "number" || ![10, 20, 30].includes(body.budget)) throw new Error("Choose a 10, 20, or 30 minute reading budget.");
  return { topics, seeds: [...new Set(seeds as string[])], budget: body.budget };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeArticles(result: unknown, budget: number, excluded: Set<string> = new Set()): DiscoveredArticle[] {
  let payload = record(result);
  // Older Tinyfish responses may wrap JSON in resultJson or result.result.
  if (!Array.isArray(payload.articles)) {
    const nested = payload.resultJson ?? payload.result;
    if (typeof nested === "string") {
      try { payload = record(JSON.parse(nested)); } catch { /* invalid result below */ }
    } else if (nested) payload = record(nested);
  }
  if (!Array.isArray(payload.articles)) throw new Error("Tinyfish returned no usable article list. Try again with more specific interests.");
  const articles: DiscoveredArticle[] = [];
  const seen = new Set(excluded);
  const domains = new Map<string, number>();
  let remaining = budget;
  for (const raw of payload.articles.slice(0, 50)) {
    const item = record(raw);
    const url = publicBlogUrl(item.url);
    const title = text(item.title, 300);
    const summary = text(item.summary, 900);
    const reason = text(item.reason, 400);
    if (!url || !title || !summary || !reason || seen.has(url)) continue;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if ((domains.get(host) ?? 0) >= 2) continue;
    const minutes = typeof item.minutes === "number" && Number.isFinite(item.minutes)
      ? Math.max(1, Math.ceil(item.minutes)) : 5;
    if (minutes > remaining) continue;
    // Optional lead image (og:image reported by Tinyfish, or feed enclosure).
    // Validated like article URLs (no local/credential targets); "" when absent.
    const rawImage = typeof item.imageUrl === "string" ? item.imageUrl
      : typeof item.image === "string" ? item.image
      : typeof item.ogImage === "string" ? item.ogImage : "";
    const imageUrl = publicBlogUrl(rawImage) ?? "";
    articles.push({ url, title, author: text(item.author, 200), summary, reason, minutes, imageUrl });
    seen.add(url);
    domains.set(host, (domains.get(host) ?? 0) + 1);
    remaining -= minutes;
    if (articles.length === 5) break;
  }
  return articles;
}

/** Bound bodies even when Content-Length is absent or inaccurate. */
export async function boundedText(message: Request | Response, maxBytes: number): Promise<string> {
  if (!message.body) throw new Error("Empty JSON response.");
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let content = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("JSON body is too large.");
      }
      content += decoder.decode(value, { stream: true });
    }
    return content + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function boundedJson(message: Request | Response, maxBytes: number): Promise<unknown> {
  return JSON.parse(await boundedText(message, maxBytes));
}
