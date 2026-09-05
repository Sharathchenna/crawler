// arXiv helpers: turn abstract/PDF URLs into full-text Markdown via the
// vendored Web Clipper. The clipper consumes HTML, so arXiv PDFs go through
// ar5iv (https://ar5iv.org/html/<id>), which renders the paper as HTML.
// Metadata comes from the export.arxiv.org API (title, authors, abstract,
// version dates, categories).

export type ArxivRef = { id: string; version: string | null };

const ID = String.raw`([a-z-]+\/\d{7}|\d{4}\.\d{4,5})`;

export function parseArxivId(url: string): ArxivRef | null {
  const patterns = [
    new RegExp(`arxiv\\.org\\/(?:abs|pdf)\\/${ID}(v\\d+)?(\\.pdf)?`, "i"),
    new RegExp(`ar5iv\\.org\\/html\\/${ID}(v\\d+)?`, "i"),
    new RegExp(`export\\.arxiv\\.org\\/api\\/query\\?.*id_list=${ID}(v\\d+)?`, "i"),
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return { id: m[1], version: m[2] ?? null };
  }
  return null;
}

export function arxivAbsUrl(ref: ArxivRef): string {
  return `https://arxiv.org/abs/${ref.id}${ref.version ?? ""}`;
}

const FETCH_HEADERS = {
  "User-Agent": "Hoard/0.1 (+https://hoard.local; save-for-later)",
  Accept: "text/html,application/xhtml+xml",
};

export type ArxivMetadata = {
  title: string | null;
  authors: string[];
  abstract: string | null;
  published: string | null;
  updated: string | null;
  categories: string[];
};

/** Authoritative metadata from the export.arxiv.org API (Atom feed). */
export async function fetchArxivMetadata(ref: ArxivRef): Promise<ArxivMetadata | null> {
  try {
    const qid = `${ref.id}${ref.version ?? ""}`;
    const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(qid)}`, {
      headers: { "User-Agent": FETCH_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entry) return null;
    const e = entry[1];
    const one = (re: RegExp): string | null => {
      const m = e.match(re);
      return m ? m[1].replace(/\s+/g, " ").trim() || null : null;
    };
    const authors = [...e.matchAll(/<author>\s*<name>([^<]*)<\/name>/g)]
      .map((m) => m[1].replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const categories = [...e.matchAll(/<category\s+term="([^"]*)"/g)].map((m) => m[1]);
    return {
      title: one(/<title>([\s\S]*?)<\/title>/),
      authors,
      abstract: one(/<summary>([\s\S]*?)<\/summary>/),
      published: one(/<published>([^<]*)<\/published>/),
      updated: one(/<updated>([^<]*)<\/updated>/),
      categories,
    };
  } catch {
    return null;
  }
}

/** Full-text HTML rendering of the paper, versioned first then latest. */
export async function fetchArxivHtml(ref: ArxivRef): Promise<{ html: string; url: string } | null> {
  const candidates = ref.version
    ? [`https://ar5iv.org/html/${ref.id}${ref.version}`, `https://ar5iv.org/html/${ref.id}`]
    : [`https://ar5iv.org/html/${ref.id}`];
  for (const u of candidates) {
    try {
      const res = await fetch(u, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("html") && !ct.includes("text")) continue;
      const html = await res.text();
      if (html.length < 2000) continue;
      return { html, url: u };
    } catch {
      continue;
    }
  }
  return null;
}
