import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boundedJson, normalizeArticles, parseDiscoveryInput, publicBlogUrl, record } from "@/lib/discovery";
import { getDiscoveryRun, startDiscovery, tinyfishConfigured } from "@/lib/tinyfish";
import { completeDigest } from "@/lib/discovery-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const message = (error: unknown) => error instanceof Error ? error.message : "Discovery is temporarily unavailable.";

async function excludedUrls(userId: string): Promise<string[]> {
  const db = getDb();
  const [saved, seen] = await Promise.all([
    db.item.findMany({ where: { userId, sourceUrl: { not: null } }, orderBy: { createdAt: "desc" }, take: 200, select: { sourceUrl: true } }),
    db.discoveryArticle.findMany({ where: { digest: { userId, day: { lt: today() } } }, orderBy: { digest: { day: "desc" } }, take: 200, select: { url: true } }),
  ]);
  return [...new Set([...saved.map((s) => s.sourceUrl), ...seen.map((s) => s.url)]
    .map(publicBlogUrl).filter((url): url is string => Boolean(url)))];
}

async function view(userId: string) {
  const db = getDb();
  const digest = await db.discoveryDigest.findUnique({
    where: { userId_day: { userId, day: today() } },
    include: { articles: { orderBy: { position: "asc" } } },
  });
  const previous = digest ?? await db.discoveryDigest.findFirst({ where: { userId }, orderBy: { day: "desc" } });
  const items = digest?.articles.length ? await db.item.findMany({
    where: { userId, sourceUrl: { in: digest.articles.map((a) => a.url) } }, select: { id: true, sourceUrl: true },
  }) : [];
  return {
    configured: tinyfishConfigured(),
    preferences: previous ? { topics: previous.topics, seeds: JSON.parse(previous.seeds), budget: previous.budget } : null,
    digest: digest ? {
      id: digest.id, day: digest.day, topics: digest.topics, seeds: digest.seeds,
      budget: digest.budget, status: digest.status, attempts: digest.attempts, error: digest.error,
      articles: digest.articles.map((a) => ({
        id: a.id, url: a.url, title: a.title, author: a.author, summary: a.summary,
        reason: a.reason, minutes: a.minutes, status: a.status,
        itemId: items.find((item) => item.sourceUrl === a.url)?.id ?? null,
      })),
    } : null,
  };
}

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Sign in to discover articles." }, 401);
  const db = getDb();
  try {
    const digest = await db.discoveryDigest.findUnique({ where: { userId_day: { userId: user.id, day: today() } } });
    if (digest?.status === "starting" && Date.now() - digest.startedAt.getTime() > 120_000) {
      await db.discoveryDigest.updateMany({ where: { id: digest.id, status: "starting", startedAt: digest.startedAt }, data: {
        status: "failed", error: "The crawl could not be started. You can retry once today.",
      } });
    }
    if (digest?.status === "running" && digest.runId) {
      // Database-backed polling lease: parallel tabs cannot flood Tinyfish, and
      // one failed polling request does not discard the durable provider run ID.
      const lease = await db.discoveryDigest.updateMany({
        where: { id: digest.id, status: "running", runId: digest.runId,
          OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: new Date(Date.now() - 30_000) } }] },
        data: { lastPolledAt: new Date() },
      });
      if (lease.count) {
        const run = await getDiscoveryRun(digest.runId);
        if (run.status === "COMPLETED") {
          try {
            const articles = normalizeArticles(run.result ?? { resultJson: run.resultJson }, digest.budget, new Set(await excludedUrls(user.id)));
            await completeDigest(digest.id, digest.runId, articles);
          } catch (error) {
            // Invalid provider output is a failure, never a fabricated digest.
            if (error instanceof Error && error.message.startsWith("Tinyfish returned")) {
              await db.discoveryDigest.updateMany({ where: { id: digest.id, status: "running", runId: digest.runId }, data: { status: "failed", error: error.message } });
            } else throw error;
          }
        } else if (run.status === "FAILED" || run.status === "CANCELLED") {
          const code = record(run.error).code;
          await db.discoveryDigest.updateMany({ where: { id: digest.id, status: "running", runId: digest.runId }, data: {
            status: "failed", error: `Tinyfish ${run.status === "CANCELLED" ? "cancelled" : "could not finish"} this crawl${typeof code === "string" ? ` (${code.slice(0, 80)})` : ""}. Check your Tinyfish dashboard; you can retry once today.`,
          } });
        } else if (!["PENDING", "RUNNING"].includes(String(run.status))) {
          throw new Error("Tinyfish returned an unknown run status. Check again shortly.");
        }
      }
    }
    return json(await view(user.id));
  } catch (error) {
    console.error(JSON.stringify({ event: "discovery_poll_failed", message: message(error) }));
    return json({ error: message(error) }, 502);
  }
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Sign in to discover articles." }, 401);
  if (!tinyfishConfigured()) return json({ error: "Set TINYFISH_API_KEY on the server to enable discovery." }, 503);
  let input;
  try { input = parseDiscoveryInput(await boundedJson(req, 8_192)); }
  catch (error) { return json({ error: message(error) }, 400); }
  const db = getDb();
  const day = today();
  let digestId: string | null = null;
  try {
    const existing = await db.discoveryDigest.findUnique({ where: { userId_day: { userId: user.id, day } } });
    if (existing) {
      // Compare-and-swap makes retry safe across tabs. A ready edition cannot
      // be rerolled; failed runs get only one explicit retry.
      const claim = await db.discoveryDigest.updateMany({ where: { id: existing.id, status: "failed", attempts: { lt: 2 } }, data: {
        status: "starting", attempts: { increment: 1 }, topics: input.topics, seeds: JSON.stringify(input.seeds),
        budget: input.budget, startedAt: new Date(), runId: null, lastPolledAt: null, error: null,
      } });
      if (!claim.count) return json(await view(user.id));
      digestId = existing.id;
    } else {
      try {
        const created = await db.discoveryDigest.create({ data: {
          userId: user.id, day, topics: input.topics, seeds: JSON.stringify(input.seeds), budget: input.budget,
        } });
        digestId = created.id;
      } catch (error) {
        if (record(error).code === "P2002") return json(await view(user.id));
        throw error;
      }
    }
    const runId = await startDiscovery(input, await excludedUrls(user.id), day);
    await db.discoveryDigest.update({ where: { id: digestId }, data: { runId, status: "running" } });
    return json(await view(user.id), 202);
  } catch (error) {
    if (digestId) await db.discoveryDigest.updateMany({ where: { id: digestId, status: "starting" }, data: { status: "failed", error: message(error) } });
    console.error(JSON.stringify({ event: "discovery_start_failed", message: message(error) }));
    return json({ error: message(error) }, 502);
  }
}

export async function PATCH(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Sign in to update your reading list." }, 401);
  let body;
  try { body = record(await boundedJson(req, 2_048)); }
  catch { return json({ error: "Send an article ID and status." }, 400); }
  if (typeof body.id !== "string" || typeof body.status !== "string" || !["unread", "read", "skipped", "saved"].includes(body.status)) {
    return json({ error: "Choose unread, read, skipped, or saved." }, 400);
  }
  const db = getDb();
  const article = await db.discoveryArticle.findFirst({ where: { id: body.id, digest: { userId: user.id } } });
  if (!article) return json({ error: "Article not found." }, 404);
  if (body.status === "saved" && !await db.item.findFirst({ where: { userId: user.id, sourceUrl: article.url } })) {
    return json({ error: "Save the article to your library first." }, 400);
  }
  await db.discoveryArticle.update({ where: { id: article.id }, data: { status: body.status } });
  return json(await view(user.id));
}
