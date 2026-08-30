import { classifyUrl } from "../../shared/classify";
import type { FetchJob } from "./jobs";
import { findByCanonical, insertPost, markJob, upsertSource } from "./db";
import { enqueueUrl } from "./discover";
import { indexPost } from "./embeddings";
import type { Env } from "./env";
import {
  excerptFrom,
  guessTopic,
  heuristicOk,
  heuristicScore,
  scoreWithAi,
  wordCount,
} from "./score";
import { tinyfishFetch } from "./tinyfish";
import { canonicalize, hostnameOf, isExpandableLink, urlHash } from "./urls";

const SCORE_THRESHOLD = 70;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function processFetchBatch(
  batch: MessageBatch<FetchJob>,
  env: Env,
): Promise<void> {
  const apiKey = env.TINYFISH_API_KEY?.trim();
  if (!apiKey) {
    console.warn("TINYFISH_API_KEY missing; cannot fetch");
    for (const message of batch.messages) {
      await markJob(env.DB, message.body.url, "skipped", "missing_tinyfish_key");
      message.ack();
    }
    return;
  }

  const byUrl = new Map<string, Message<FetchJob>[]>();
  for (const message of batch.messages) {
    const canonical = canonicalize(message.body.url) ?? message.body.url;
    const list = byUrl.get(canonical) ?? [];
    list.push(message);
    byUrl.set(canonical, list);
  }

  for (const group of chunk([...byUrl.keys()], 10)) {
    try {
      const { pages, errors } = await tinyfishFetch(apiKey, group);

      for (const page of pages) {
        const canonical = canonicalize(page.url) ?? page.url;
        const messages = byUrl.get(canonical) ?? byUrl.get(page.url) ?? [];
        const job = messages[0]?.body;
        try {
          await ingestPage(env, page, job);
          for (const message of messages) {
            message.ack();
          }
        } catch (error) {
          console.error("ingest failed", canonical, error);
          for (const message of messages) {
            message.retry();
          }
        }
      }

      for (const failure of errors) {
        const canonical = canonicalize(failure.url) ?? failure.url;
        await markJob(env.DB, canonical, "error", failure.error);
        for (const message of byUrl.get(canonical) ?? []) {
          message.retry();
        }
      }
    } catch (error) {
      console.error("tinyfish fetch batch failed", error);
      for (const url of group) {
        for (const message of byUrl.get(url) ?? []) {
          message.retry();
        }
      }
    }
  }
}

async function ingestPage(
  env: Env,
  page: { url: string; title: string; text: string; links: string[] },
  job: FetchJob | undefined,
): Promise<void> {
  const canonical = canonicalize(page.url);
  if (!canonical) {
    return;
  }

  const title = page.title.trim() || hostnameOf(canonical);
  const body = page.text.trim();
  const contentType = classifyUrl(canonical, job?.discoveredVia);
  const existing = await findByCanonical(env.DB, canonical);
  await markJob(env.DB, canonical, "fetching");

  if (!existing && contentType === "blog" && !heuristicOk(title, body)) {
    await markJob(env.DB, canonical, "skipped", "heuristic");
    return;
  }

  if (!existing && contentType === "paper" && wordCount(body) < 120) {
    await markJob(env.DB, canonical, "skipped", "thin_paper");
    return;
  }

  const ai = env.AI ? await scoreWithAi(env.AI, title, body) : null;
  const score = ai?.score ?? heuristicScore(body);
  const topic = ai?.topic ?? guessTopic(title, body);

  if (!existing && contentType === "blog" && score < SCORE_THRESHOLD) {
    await markJob(env.DB, canonical, "skipped", `score:${score}`);
    return;
  }

  const site = hostnameOf(canonical);
  const sourceKind = job?.sourceKind ?? "personal";
  const sourceId = await upsertSource(env.DB, site, sourceKind);
  const r2Key = `posts/${await urlHash(canonical)}.md`;
  await env.POSTS.put(r2Key, body, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });

  const excerpt = excerptFrom(body);
  const id = await insertPost(env.DB, {
    url: page.url,
    canonicalUrl: canonical,
    sourceId,
    title,
    excerpt,
    site,
    topic,
    contentType,
    publishedAt: null,
    wordCount: wordCount(body),
    score,
    r2Key,
    discoveredVia: job?.discoveredVia ?? "tinyfish",
  });
  await markJob(env.DB, canonical, "done");
  await indexPost(env, id, { title, excerpt, site, url: canonical });

  if ((job?.depth ?? 0) === 0) {
    for (const link of page.links.slice(0, 12)) {
      if (isExpandableLink(canonical, link)) {
        await enqueueUrl(env, link, "expand", sourceKind, 1);
      }
    }
  }
}
