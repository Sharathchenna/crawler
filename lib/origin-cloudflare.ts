import { env } from "cloudflare:workers";
import {
  crawlerFetch as httpCrawlerFetch,
  crawlerOrigin,
  crawlerRequest as httpCrawlerRequest,
} from "./origin-http";

type CrawlerEnv = {
  CRAWLER?: Fetcher;
  CRAWLER_ORIGIN?: string;
};

function workerEnv(): CrawlerEnv {
  return env as CrawlerEnv;
}

export { crawlerOrigin };

export async function crawlerRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const cf = workerEnv();
  if (!cf.CRAWLER) {
    return httpCrawlerRequest(path, init);
  }

  const origin = cf.CRAWLER_ORIGIN || "https://parchment-crawler.internal";
  return cf.CRAWLER.fetch(
    new Request(`${origin}${path}`, {
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    }),
  );
}

export async function crawlerFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const cf = workerEnv();
  if (!cf.CRAWLER) {
    return httpCrawlerFetch<T>(path, init);
  }

  try {
    const response = await crawlerRequest(path, {
      signal: AbortSignal.timeout(8000),
      ...init,
    });

    if (!response.ok) {
      console.error("crawler fetch failed", response.status, path);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("crawler fetch error", path, error);
    return null;
  }
}
