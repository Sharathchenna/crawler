const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "source",
];

const BLOCKED_HOSTS = new Set([
  "pinterest.com",
  "www.pinterest.com",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "facebook.com",
  "www.facebook.com",
  "news.ycombinator.com",
  "linkedin.com",
  "www.linkedin.com",
  "quora.com",
  "www.quora.com",
]);

const SKIP_PATH =
  /\/(login|signin|signup|pricing|careers|jobs|privacy|terms|cookie|cart|checkout|account|subscribe)\b/i;

export function canonicalize(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of TRACKING_PARAMS) {
      url.searchParams.delete(key);
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isBlocked(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (BLOCKED_HOSTS.has(parsed.hostname)) {
      return true;
    }
    return SKIP_PATH.test(parsed.pathname);
  } catch {
    return true;
  }
}

export function isExpandableLink(fromUrl: string, candidate: string): boolean {
  try {
    const origin = new URL(fromUrl);
    const next = new URL(candidate, fromUrl);
    if (next.hostname !== origin.hostname) {
      return false;
    }
    if (SKIP_PATH.test(next.pathname)) {
      return false;
    }
    return /\/(blog|essays?|posts?|articles?|engineering|news|stories|writing|journal)\b/i.test(
      next.pathname,
    );
  } catch {
    return false;
  }
}

export async function urlHash(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}
