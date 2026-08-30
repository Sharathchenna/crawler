import { suggestedSince } from "../../shared/freshness";

export type ArxivPaper = {
  title: string;
  url: string;
  summary: string;
  publishedAt: number | null;
};

const ARXIV_HEADERS = {
  Accept: "application/atom+xml",
  "User-Agent": "parchment-crawler/1.0 (personal reading list)",
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAtom(xml: string): ArxivPaper[] {
  const entries = xml.split("<entry>").slice(1);
  const papers: ArxivPaper[] = [];

  for (const entry of entries) {
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const summary = decodeXml(
      entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "",
    );
    const id = (entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? "").trim();
    const link =
      entry.match(/<link[^>]+href="(https?:\/\/arxiv\.org\/abs\/[^"]+)"/)?.[1] ??
      id;
    const published = (
      entry.match(/<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/)?.[1] ??
      ""
    ).trim();
    if (!title || !link) {
      continue;
    }
    papers.push({
      title,
      url: link.replace("http://", "https://"),
      summary,
      publishedAt: published ? Date.parse(published) : null,
    });
  }

  return papers;
}

async function fetchAtom(url: string): Promise<ArxivPaper[]> {
  const response = await fetch(url, { headers: ARXIV_HEADERS });
  if (!response.ok) {
    throw new Error(`arxiv_${response.status}`);
  }
  return parseAtom(await response.text());
}

export async function fetchArxivPapers(): Promise<ArxivPaper[]> {
  const query =
    "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:cs.DC+OR+cat:cs.SE&start=0&max_results=25&sortBy=submittedDate&sortOrder=descending";
  const feeds = [
    query,
    "https://rss.arxiv.org/atom/cs.AI",
    "https://rss.arxiv.org/atom/cs.LG",
  ];

  let papers: ArxivPaper[] = [];
  for (const url of feeds) {
    try {
      papers = await fetchAtom(url);
      if (papers.length > 0) {
        break;
      }
    } catch (error) {
      console.error("arxiv feed failed", url, error);
    }
  }

  return papers.filter((paper) => {
    if (!paper.publishedAt) {
      return true;
    }
    return paper.publishedAt >= suggestedSince();
  });
}
