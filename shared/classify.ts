import type { ContentType } from "./types";

const PAPER_HOSTS = [
  "arxiv.org",
  "export.arxiv.org",
  "openreview.net",
  "aclanthology.org",
  "papers.nips.cc",
  "proceedings.mlr.press",
  "dl.acm.org",
  "ieeexplore.ieee.org",
  "nature.com",
  "science.org",
  "biorxiv.org",
  "medrxiv.org",
  "ssrn.com",
];

export function classifyUrl(
  rawUrl: string,
  discoveredVia?: string,
): ContentType {
  let hostname = "";
  let pathname = "";
  try {
    const parsed = new URL(rawUrl);
    hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return discoveredVia === "hn" ? "hn" : "other";
  }

  if (
    (hostname === "x.com" || hostname === "twitter.com") &&
    pathname.includes("/status/")
  ) {
    return "tweet";
  }

  if (PAPER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return "paper";
  }

  if (pathname.endsWith(".pdf") && /arxiv|paper|proc|conf|journal/.test(rawUrl)) {
    return "paper";
  }

  if (
    /\/(blog|essays?|posts?|articles?|engineering|journal|writing)\b/.test(pathname) ||
    hostname.startsWith("blog.") ||
    hostname.endsWith(".engineering") ||
    hostname.endsWith(".tech") ||
    discoveredVia === "tinyfish" ||
    discoveredVia === "seed"
  ) {
    return "blog";
  }

  if (discoveredVia === "hn") {
    return "hn";
  }

  return "other";
}

export function tweetTitleFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const handle = parts[0] ?? "tweet";
    return `Tweet by @${handle}`;
  } catch {
    return "Tweet";
  }
}
