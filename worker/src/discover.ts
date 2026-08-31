import { classifyUrl } from "../../shared/classify";
import type { SourceKind } from "../../shared/types";
import { fetchArxivPapers } from "./arxiv";
import { alreadySeen, avoidedSiteSet, markJob, pruneStaleSuggested } from "./db";
import type { Env } from "./env";
import { fetchHnFavorites } from "./hn";
import { queriesForThisRun } from "./queries";
import { saveLink } from "./save";
import { tinyfishSearch } from "./tinyfish";
import { canonicalize, hostnameOf, isBlocked } from "./urls";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DiscoverResult = {
  enqueued: number;
  hn: { fetched: number; created: number };
  arxiv: { fetched: number; created: number };
  tinyfish: { ran: boolean; created: number; reason?: string };
};

export async function enqueueUrl(
  env: Env,
  rawUrl: string,
  discoveredVia: string,
  sourceKind: SourceKind,
  depth: number,
  avoided?: Set<string>,
): Promise<boolean> {
  const canonical = canonicalize(rawUrl);
  if (!canonical || isBlocked(canonical)) {
    return false;
  }
  const skipSites = avoided ?? (await avoidedSiteSet(env.DB));
  if (skipSites.has(hostnameOf(canonical))) {
    await markJob(env.DB, canonical, "skipped", "passed_site");
    return false;
  }
  if (classifyUrl(canonical, discoveredVia) === "tweet") {
    const result = await saveLink(env, {
      url: canonical,
      discoveredVia,
      contentType: "tweet",
      fetch: false,
    });
    return result.created;
  }
  if (await alreadySeen(env.DB, canonical)) {
    return false;
  }
  await markJob(env.DB, canonical, "queued");
  await env.FETCH_QUEUE.send({
    url: canonical,
    discoveredVia,
    sourceKind,
    depth,
  });
  return true;
}

export async function discover(env: Env): Promise<DiscoverResult> {
  const result: DiscoverResult = {
    enqueued: 0,
    hn: { fetched: 0, created: 0 },
    arxiv: { fetched: 0, created: 0 },
    tinyfish: { ran: false, created: 0 },
  };
  const apiKey = env.TINYFISH_API_KEY?.trim();
  await pruneStaleSuggested(env.DB);
  const avoided = await avoidedSiteSet(env.DB);

  try {
    const stories = await fetchHnFavorites();
    result.hn.fetched = stories.length;
    for (const story of stories) {
      const host = hostnameOf(story.url);
      if (host && avoided.has(host)) {
        continue;
      }
      const saved = await saveLink(env, {
        url: story.url,
        title: story.title,
        excerpt: `${story.points} points · ${story.comments} comments on Hacker News`,
        discoveredVia: "hn",
        publishedAt: story.createdAt,
        score: Math.min(99, 50 + story.points / 20),
        fetch: Boolean(apiKey),
      });
      if (saved.created) {
        result.hn.created += 1;
        result.enqueued += 1;
      }
    }
  } catch (error) {
    console.error("hn discover failed", error);
  }

  try {
    const papers = await fetchArxivPapers();
    result.arxiv.fetched = papers.length;
    for (const paper of papers) {
      const saved = await saveLink(env, {
        url: paper.url,
        title: paper.title,
        excerpt: paper.summary.slice(0, 400),
        discoveredVia: "arxiv",
        contentType: "paper",
        publishedAt: paper.publishedAt,
        score: 88,
        fetch: false,
      });
      if (saved.created) {
        result.arxiv.created += 1;
        result.enqueued += 1;
      }
    }
  } catch (error) {
    console.error("arxiv discover failed", error);
  }

  if (!apiKey) {
    console.warn("TINYFISH_API_KEY missing; skipping TinyFish search");
    result.tinyfish = { ran: false, created: 0, reason: "missing_key" };
    return result;
  }

  result.tinyfish.ran = true;
  for (const item of queriesForThisRun()) {
    try {
      const hits = await tinyfishSearch(
        apiKey,
        item.query,
        item.includeDomains,
      );
      for (const hit of hits) {
        if (await enqueueUrl(env, hit.url, "tinyfish", item.sourceKind, 0, avoided)) {
          result.tinyfish.created += 1;
          result.enqueued += 1;
        }
      }
      await sleep(2200);
    } catch (error) {
      console.error("tinyfish search failed", item.query, error);
      if (String(error).includes("rate_limited")) {
        await sleep(5000);
      }
    }
  }

  return result;
}
