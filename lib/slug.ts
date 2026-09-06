// Shared heading-slug algorithm: used server-side (rehype plugin in
// markdown-html.ts) and client-side (TOC in reader-client.tsx). Both sides
// must produce identical ids, so keep this pure and dependency-free.
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_{}[\]()#+\-.!]/g, "")
    .replace(/[^a-z0-9\u00C0-\u024F\u4E00-\u9FFF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "section";
}

/** Assign unique ids (`slug`, `slug-1`, …) to an ordered list of headings. */
export function uniqueSlugs(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const base = slugifyHeading(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  });
}

/** Fence-aware extraction of ATX headings (levels 1–3) from Markdown.
 * Skips fenced code blocks so `# comments` in code never become TOC entries
 * (mirrors what the server renderer sees: real headings only). */
export function markdownHeadings(md: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  let fenced = false;
  for (const line of (md || "").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].slice(0, 200) });
  }
  return out;
}
