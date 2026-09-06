import { DOMParser } from "linkedom";
import { boundedJson, boundedText, publicBlogUrl, record, normalizeArticles } from "./discovery";
import { DISCOVERY_SOURCES, type Candidate, type SourceHealth } from "./discovery-sources";

function plain(value: string): string {
  const doc = new DOMParser().parseFromString(`<html><body>${value}</body></html>`, "text/html");
  doc.querySelectorAll("script,style").forEach((el: { remove(): void }) => el.remove());
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** First usable lead image for a feed entry: enclosures, Media RSS, iTunes
 * image, then the first inline <img> in the item body. SSRF-safe via
 * publicBlogUrl; "" when absent. */
function feedImage(entry: Element, rawBody: string): string {
  const attrOf = (tag: string, attr: string): string | null => {
    const el = entry.getElementsByTagName(tag)[0] as unknown as { getAttribute?: (n: string) => string | null } | undefined;
    const value = el?.getAttribute?.(attr) ?? null;
    return typeof value === "string" && value ? value : null;
  };
  const textOf = (tag: string): string | null => {
    const text = entry.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
    return text || null;
  };
  // Enclosure must look like an image (type or extension); audio/video
  // enclosures (podcasts) are not article thumbnails.
  const enclosure = entry.getElementsByTagName("enclosure")[0] as unknown as {
    getAttribute?: (n: string) => string | null;
  } | undefined;
  const enclosureUrl = enclosure?.getAttribute?.("url") ?? null;
  const enclosureType = enclosure?.getAttribute?.("type") ?? "";
  if (enclosureUrl && (/^image\//i.test(enclosureType) || /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(enclosureUrl))) {
    const valid = publicBlogUrl(enclosureUrl);
    if (valid) return valid;
  }
  for (const tag of ["media:content", "media:thumbnail", "content", "thumbnail"]) {
    const url = attrOf(tag, "url") ?? attrOf(tag, "src") ?? attrOf(tag, "href");
    if (url) {
      const valid = publicBlogUrl(url);
      if (valid) return valid;
    }
  }
  const itunes = attrOf("itunes:image", "href");
  if (itunes) {
    const valid = publicBlogUrl(itunes);
    if (valid) return valid;
  }
  const imageText = textOf("image");
  if (imageText && /^https?:\/\//i.test(imageText)) {
    const valid = publicBlogUrl(imageText);
    if (valid) return valid;
  }
  // Inline body image, e.g. Substack content:encoded <img>.
  const bodyImg = /<img[^>]+src=["']([^"']+)["']/i.exec(rawBody)?.[1];
  if (bodyImg) {
    const valid = publicBlogUrl(bodyImg);
    if (valid) return valid;
  }
  return "";
}

export function parseFeed(xml: string, source: typeof DISCOVERY_SOURCES[number], now = new Date()): Candidate[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (!doc.querySelector("rss,feed,RDF")) throw new Error("Not an RSS or Atom feed");
  return [...doc.querySelectorAll("item,entry")].slice(0, 30).flatMap((entry) => {
    const value = (tag: string) => entry.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
    const link = [...entry.getElementsByTagName("link")].find((el) => !el.getAttribute("rel") || el.getAttribute("rel") === "alternate");
    const url = publicBlogUrl(link?.getAttribute("href") || link?.textContent?.trim());
    const title = plain(value("title")).slice(0, 300);
    const published = new Date(value("pubDate") || value("published") || value("updated") || value("dc:date"));
    const age = now.getTime() - published.getTime();
    if (!url || !title || !Number.isFinite(age) || age < -86_400_000 || age > 30 * 86_400_000) return [];
    const rawBody = (value("description") || value("summary") || value("content:encoded") || value("content")).slice(0, 20_000);
    const excerpt = plain(rawBody).slice(0, 700);
    return [{ url, title, author: plain(value("dc:creator") || value("author")).slice(0, 200), excerpt,
      source: source.name, category: source.category, publishedAt: published.toISOString(), score: 100 - age / 86_400_000,
      imageUrl: feedImage(entry, rawBody) }];
  }).slice(0, 5);
}

async function fetchSource(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "Hoard-Discovery/1.0 (personal RSS reader)", Accept: "application/atom+xml,application/rss+xml,application/json,text/xml" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
  return response;
}

async function hackerNews(now: Date): Promise<Candidate[]> {
  const ids = await boundedJson(await fetchSource("https://hacker-news.firebaseio.com/v0/topstories.json"), 50_000);
  if (!Array.isArray(ids)) throw new Error("Invalid Hacker News response");
  const result: Candidate[] = [];
  // 16 stories + 12 feeds stays within a small, predictable subrequest budget.
  for (let start = 0; start < 16; start += 4) {
    const stories = await Promise.all(ids.slice(start, start + 4).filter((id) => Number.isSafeInteger(id)).map(async (id) => {
      try { return record(await boundedJson(await fetchSource(`https://hacker-news.firebaseio.com/v0/item/${id}.json`), 100_000)); }
      catch { return {}; }
    }));
    for (const item of stories) {
      const url = publicBlogUrl(item.url);
      const published = typeof item.time === "number" ? new Date(item.time * 1000) : null;
      if (!url || item.type !== "story" || item.dead || item.deleted || !published || typeof item.title !== "string" ||
        typeof item.score !== "number" || item.score < 20 || now.getTime() - published.getTime() > 3 * 86_400_000) continue;
      result.push({ url, title: plain(item.title).slice(0, 300), author: "", excerpt: "", source: "Hacker News", category: "Broad tech",
        publishedAt: published.toISOString(), score: 100 + Math.min(item.score, 500) / 100 });
    }
  }
  return result;
}

export async function collectCandidates(sourceIds: string[], now = new Date()): Promise<{ candidates: Candidate[]; health: SourceHealth[] }> {
  const selected = DISCOVERY_SOURCES.filter((source) => sourceIds.includes(source.id));
  const candidates: Candidate[] = [];
  const health: SourceHealth[] = [];
  for (let i = 0; i < selected.length; i += 3) {
    await Promise.all(selected.slice(i, i + 3).map(async (source) => {
      try {
        const items = source.id === "hn" ? await hackerNews(now) : parseFeed(await boundedText(await fetchSource(source.feed), 2_000_000), source, now);
        candidates.push(...items);
        health.push({ id: source.id, count: items.length, error: null });
      } catch (error) {
        health.push({ id: source.id, count: 0, error: error instanceof Error ? error.message.slice(0, 150) : "Feed unavailable" });
      }
    }));
  }
  return { candidates, health };
}

/** Take fresh, unseen links with category and publisher diversity. Rotate
 * categories deterministically each day so AI does not always get first slot. */
export function shortlist(candidates: Candidate[], excluded: Set<string>, topics: string, day: string): Candidate[] {
  const terms = topics.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 3);
  const score = (item: Candidate) => item.score + terms.filter((term) => `${item.title} ${item.category} ${item.excerpt}`.toLowerCase().includes(term)).length * 3;
  const sorted = [...candidates].filter((item) => !excluded.has(item.url)).sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url));
  const categories = [...new Set(sorted.map((item) => item.category))].sort();
  const offset = Number(day.replaceAll("-", "")) % Math.max(categories.length, 1);
  const order = [...categories.slice(offset), ...categories.slice(0, offset)];
  const selected: Candidate[] = [];
  const seen = new Set<string>();
  const domains = new Set<string>();
  const add = (item: Candidate) => {
    const host = new URL(item.url).hostname.replace(/^www\./, "");
    if (seen.has(item.url) || domains.has(host) || selected.length >= 8) return;
    selected.push(item); seen.add(item.url); domains.add(host);
  };
  for (const category of order) {
    const first = sorted.find((item) => item.category === category && !domains.has(new URL(item.url).hostname.replace(/^www\./, "")));
    if (first) add(first);
  }
  for (const item of sorted) add(item);
  return selected;
}

export function feedFallback(candidates: Candidate[], budget: number, excluded = new Set<string>()) {
  return normalizeArticles({ articles: candidates.map((item) => ({
    url: item.url, title: item.title, author: item.author, minutes: 5,
    summary: item.excerpt ? `Publisher preview: ${item.excerpt}` : "Link discovered on Hacker News. Open the original to read the full article.",
    reason: `${item.source} · ${item.category}. Feed preview, not an AI-verified summary; reading time is a placeholder estimate.`,
    imageUrl: item.imageUrl ?? "",
  })) }, budget, excluded);
}
