import { clipPage } from "./clipper";
import { parseArxivId, arxivAbsUrl, fetchArxivHtml, fetchArxivMetadata, type ArxivRef } from "./arxiv";
import { convertToMarkdown, isCloudflareConversionConfigured } from "./cloudflare";

export type Extracted = {
  title: string;
  markdown: string;
  excerpt: string;
  type: string;
  author?: string | null;
  /** ISO date string when the page reports a publish date, else null. */
  publishedAt?: string | null;
  /** ISO date string of when extraction ran. */
  extractedAt: string;
  /** Suggested tags (e.g. arXiv categories). */
  tags?: string[];
};

function detectType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "video";
  if (u.endsWith(".pdf")) return "pdf";
  if (u.includes("x.com") || u.includes("twitter.com")) return "x";
  if (u.match(/\.(mp3|wav|m4a|ogg|flac)($|\?)/)) return "audio";
  if (u.match(/\.(png|jpe?g|gif|webp|svg)($|\?)/)) return "file";
  return "page";
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function toISODate(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * arXiv extraction: ar5iv HTML through the clipper for full text, merged
 * with authoritative export-API metadata. Falls back to the abstract page,
 * then to a bookmark — never throws anything but Error (handled upstream).
 */
async function extractArxiv(url: string, ref: ArxivRef, extractedAt: string): Promise<Extracted> {
  const fail = (): never => {
    throw new Error(`Couldn't parse that paper cleanly. Saved as a bookmark so you don't lose it.`);
  };
  const meta = await fetchArxivMetadata(ref);
  const authors = meta?.authors?.length
    ? meta.authors
    : [];
  const author = authors.length ? authors.join(", ") : null;
  const tags = [...new Set(meta?.categories ?? [])].slice(0, 10);

  // 1. Full text via ar5iv.
  const page = await fetchArxivHtml(ref);
  if (page) {
    try {
      const clip = await clipPage(page.html, page.url);
      const v = clip.variables;
      const body = (clip.content || "").trim();
      if (body && !isFailedConversion(body) && stripMarkdown(body).length >= 50) {
        const title = (
          meta?.title ||
          (v["{{title}}"] || "").trim() ||
          clip.noteName ||
          ref.id
        ).slice(0, 300);
        const clipAuthors = ((v["{{author}}"] || "").trim() || null);
        const abstract = meta?.abstract || (v["{{description}}"] || "").trim();
        const markdown = `# ${title}\n\n[Original](${url})\n\n${body}`.slice(0, 200_000);
        return {
          title,
          markdown,
          excerpt: (abstract || stripMarkdown(body)).slice(0, 280),
          type: "pdf",
          author: author ?? clipAuthors,
          publishedAt: toISODate(meta?.published),
          extractedAt,
          tags,
        };
      }
    } catch {
      // Fall through to the abstract page.
    }
  }

  // 2. Cloudflare conversion of the actual PDF (gap-filler for ar5iv
  //    misses, and higher-fidelity tables/formulas). Merged with API meta.
  try {
    const pdfRes = await fetch(`https://arxiv.org/pdf/${ref.id}${ref.version ?? ""}`, {
      headers: {
        "User-Agent": "Hoard/0.1 (+https://hoard.local; save-for-later)",
        Accept: "application/pdf",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    if (pdfRes.ok) {
      const converted = await convertResponseFile(url, pdfRes, "pdf", extractedAt, {
        title: meta?.title ?? null,
        excerpt: meta?.abstract ?? null,
      });
      if (converted) {
        return {
          ...converted,
          author: author ?? converted.author,
          publishedAt: toISODate(meta?.published),
          tags,
        };
      }
    }
  } catch {
    // Fall through to the abstract page.
  }

  // 3. Abstract page: readable title + abstract at minimum.
  try {
    const absUrl = arxivAbsUrl(ref);
    const res = await fetch(absUrl, {
      headers: {
        "User-Agent": "Hoard/0.1 (+https://hoard.local; save-for-later)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const html = await res.text();
      const clip = await clipPage(html, absUrl);
      const v = clip.variables;
      const rawBody = (clip.content || "").trim();
      const body = isFailedConversion(rawBody) ? "" : rawBody;
      const title = (meta?.title || (v["{{title}}"] || "").trim() || clip.noteName || ref.id).slice(0, 300);
      const abstract = meta?.abstract || (v["{{description}}"] || "").trim() || stripMarkdown(body);
      if (title && abstract) {
        return {
          title,
          markdown: `# ${title}\n\n[Original](${url})\n\n> ${abstract}\n\n${body}`.slice(0, 200_000),
          excerpt: abstract.slice(0, 280),
          type: "pdf",
          author: author || ((v["{{author}}"] || "").trim() || null),
          publishedAt: toISODate(meta?.published),
          extractedAt,
          tags,
        };
      }
    }
  } catch {
    // Fall through to bookmark.
  }
  return fail();
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`|~\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Defuddle's converter returns this sentinel + raw HTML when Turndown
 * fails. It is long, so length gates won't catch it — reject explicitly
 * or raw HTML ends up stored as "markdown".
 */
function isFailedConversion(body: string): boolean {
  return body.includes("Partial conversion completed with errors");
}

const MAX_CONVERT_BYTES = 32 * 1024 * 1024;

function filenameOf(url: string, fallback: string): string {
  try {
    return (new URL(url).pathname.split("/").pop() || fallback).slice(0, 120) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Convert a fetched file (PDF, office doc, …) to a full Markdown document
 * via Cloudflare Workers AI toMarkdown. Returns null when unconfigured,
 * oversized, or conversion fails — callers fall back to link bookmarks.
 * Never throws.
 */
async function convertResponseFile(
  url: string,
  res: Response,
  type: string,
  extractedAt: string,
  overrides?: { title?: string | null; excerpt?: string | null }
): Promise<Extracted | null> {
  try {
    if (!isCloudflareConversionConfigured()) return null;
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_CONVERT_BYTES) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim() || "application/octet-stream";
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CONVERT_BYTES) return null;
    const converted = await convertToMarkdown({
      bytes,
      filename: filenameOf(url, "document.pdf"),
      mimeType,
    });
    if (!converted) return null;
    const body = converted.markdown.trim();
    if (!body) return null;
    const base = filenameOf(url, domainOf(url)).replace(/\.[a-z0-9]+$/i, "");
    const title = (overrides?.title || base || domainOf(url)).slice(0, 300);
    return {
      title,
      markdown: `# ${title}\n\n[Original](${url})\n\n${body}`.slice(0, 200_000),
      excerpt: (overrides?.excerpt || stripMarkdown(body)).slice(0, 280),
      type,
      author: null,
      publishedAt: null,
      extractedAt,
    };
  } catch {
    return null;
  }
}

export async function extractUrl(url: string): Promise<Extracted> {
  const extractedAt = new Date().toISOString();

  // arXiv papers get the full treatment: ar5iv HTML through the clipper
  // (full text as Markdown) plus authoritative API metadata. Type is
  // normalized to "pdf" so papers stay filterable as one kind.
  const arxivRef = parseArxivId(url);
  if (arxivRef) {
    return extractArxiv(url, arxivRef, extractedAt);
  }

  const type = detectType(url);

  // Fetch is the caller's responsibility (per the clipper's api.ts contract).
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Hoard/0.1 (+https://hoard.local; save-for-later)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(`Couldn't reach that page (${domainOf(url)}). Saved as a bookmark so you don't lose it.`);
  }
  if (!res.ok) {
    throw new Error(`That page returned ${res.status}. Saved as a bookmark so you don't lose it.`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("text")) {
    // Non-HTML: full Markdown via Cloudflare conversion when available,
    // otherwise a file bookmark.
    const converted = await convertResponseFile(url, res, type, extractedAt);
    if (converted) return converted;
    return {
      title: url.split("/").pop() || domainOf(url),
      markdown: `# ${url.split("/").pop() || domainOf(url)}\n\n[Original file](${url})\n\n_Saved as a file link — preview isn't available yet._`,
      excerpt: `File link from ${domainOf(url)}`,
      type: contentType.includes("pdf") ? "pdf" : type,
      author: null,
      publishedAt: null,
      extractedAt,
    };
  }
  const html = await res.text();

  // THEIR pipeline: clip() runs Defuddle extraction, Markdown conversion,
  // and template compilation from the vendored Web Clipper (api.ts).
  const clip = await clipPage(html, url);
  const v = clip.variables;
  const body = (clip.content || "").trim();
  if (!body || isFailedConversion(body) || stripMarkdown(body).length < 50) {
    throw new Error(`Couldn't parse that page cleanly. Saved as a bookmark so you don't lose it.`);
  }
  const title = (v["{{title}}"] || clip.noteName || domainOf(url)).trim().slice(0, 300) || domainOf(url);
  const excerpt =
    (v["{{description}}"] || "").trim().slice(0, 280) || stripMarkdown(body).slice(0, 280);
  const markdown = `# ${title}\n\n[Original](${url})\n\n${body}`.slice(0, 200_000);
  return {
    title,
    markdown,
    excerpt,
    type,
    author: (v["{{author}}"] || "").trim() || null,
    publishedAt: toISODate((v["{{published}}"] || "").trim()),
    extractedAt,
  };
}
