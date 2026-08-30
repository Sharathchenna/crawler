export function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return "Recently found";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

export function formatWordCount(wordCount: number): string {
  if (wordCount < 1000) {
    return `${wordCount} words`;
  }

  return `${(wordCount / 1000).toFixed(1).replace(/\.0$/, "")}k words`;
}

export function siteLabel(site: string): string {
  return site.replace(/^www\./, "");
}

export function faviconUrl(site: string): string {
  return `https://icons.duckduckgo.com/ip3/${siteLabel(site)}.ico`;
}

export function screenshotUrl(url: string): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=720`;
}

export function tweetHandle(url: string, title: string): string {
  const fromTitle = title.match(/@[\w.]+/);
  if (fromTitle?.[0]) {
    return fromTitle[0];
  }
  try {
    const handle = new URL(url).pathname.split("/").filter(Boolean)[0];
    return handle ? `@${handle}` : "@tweet";
  } catch {
    return "@tweet";
  }
}
