import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boundedJson, normalizeArticles, parseDiscoveryInput, publicBlogUrl, record } from "@/lib/discovery";
import { getDiscoveryRun, startDiscovery, tinyfishConfigured } from "@/lib/tinyfish";
import { completeDigest } from "@/lib/discovery-store";
import { DEFAULT_TOPICS, DISCOVERY_SOURCES, nextEditionAt, slotOf } from "@/lib/discovery-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const message = (error: unknown) => error instanceof Error ? error.message : "Discovery is temporarily unavailable.";

async function excludedUrls(userId: string, currentDigestId: string | null): Promise<string[]> {
  const db = getDb();
  const [saved, seen] = await Promise.all([
    db.item.findMany({ where: { userId, sourceUrl: { not: null } }, orderBy: { createdAt: "desc" }, take: 200, select: { sourceUrl: true } }),
    // Every other edition — including earlier slots today — so slots never repeat links.
    db.discoveryArticle.findMany({ where: { digest: { userId, NOT: { id: currentDigestId ?? "none" } } }, orderBy: { digest: { day: "desc" } }, take: 200, select: { url: true } }),
  ]);
  return [...new Set([...saved.map((s) => s.sourceUrl), ...seen.map((s) => s.url)]
    .map(publicBlogUrl).filter((url): url is string => Boolean(url)))];
}

async function view(userId: string, day: string, slot: number) {
  const db = getDb();
  const schedule = await db.discoverySchedule.findUnique({ where: { userId } });
  const digest = await db.discoveryDigest.findUnique({
    where: { userId_day_slot: { userId, day, slot } },
    include: { articles: { orderBy: { position: "asc" } } },
  });
  const previous = digest ?? await db.discoveryDigest.findFirst({ where: { userId }, orderBy: [{ day: "desc" }, { slot: "desc" }] });
  const items = digest?.articles.length ? await db.item.findMany({
    where: { userId, sourceUrl: { in: digest.articles.map((a) => a.url) } }, select: { id: true, sourceUrl: true },
  }) : [];
  return {
    configured: tinyfishConfigured(),
    editionDay: day,
    editionSlot: slot,
    editions: await db.discoveryDigest.findMany({ where: { userId }, orderBy: [{ day: "desc" }, { slot: "desc" }], take: 30, select: { day: true, slot: true, status: true } }),
    preferences: previous ? { topics: previous.topics, seeds: JSON.parse(previous.seeds), budget: previous.budget } : null,
    schedule: schedule ? { enabled: schedule.enabled, topics: schedule.topics, budget: schedule.budget,
      sourceIds: JSON.parse(schedule.sourceIds), nextRunAt: nextEditionAt(), lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
      lastError: schedule.lastError, sourceHealth: JSON.parse(schedule.sourceHealth) } : null,
    digest: digest ? {
      id: digest.id, day: digest.day, slot: digest.slot, topics: digest.topics, seeds: digest.seeds,
      budget: digest.budget, status: digest.status, attempts: digest.attempts, error: digest.error,
      origin: digest.origin,
      articles: digest.articles.map((a) => ({
        id: a.id, url: a.url, title: a.title, author: a.author, summary: a.summary,
        reason: a.reason, minutes: a.minutes, status: a.status,
        imageUrl: (a as { imageUrl?: string }).imageUrl ?? "",
        itemId: items.find((item) => item.sourceUrl === a.url)?.id ?? null,
      })),
    } : null,
  };
}

/** Default view: the latest edition, falling back to the current slot. */
async function latestEdition(userId: string): Promise<{ day: string; slot: number }> {
  const latest = await getDb().discoveryDigest.findFirst({
    where: { userId }, orderBy: [{ day: "desc" }, { slot: "desc" }], select: { day: true, slot: true },
  });
  return latest ?? slotOf();
}

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Sign in to discover articles." }, 401);
  const db = getDb();
  const params = new URL(req.url).searchParams;
  const fallback = await latestEdition(user.id);
  const day = params.get("day") ?? fallback.day;
  const slot = params.has("slot") ? Number(params.get("slot")) : fallback.slot;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today() || !Number.isInteger(slot) || slot < 0 || slot > 7) {
    return json({ error: "Choose an existing edition." }, 400);
  }
  try {
    const digest = await db.discoveryDigest.findUnique({ where: { userId_day_slot: { userId: user.id, day, slot } } });
    if (digest?.origin !== "scheduled" && digest?.status === "starting" && Date.now() - digest.startedAt.getTime() > 120_000) {
      await db.discoveryDigest.updateMany({ where: { id: digest.id, status: "starting", startedAt: digest.startedAt }, data: {
        status: "failed", error: "The crawl could not be started. You can retry once for this edition.",
      } });
    }
    if (digest?.origin !== "scheduled" && digest?.status === "running" && digest.runId) {
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
            const articles = normalizeArticles(run.result ?? { resultJson: run.resultJson }, digest.budget, new Set(await excludedUrls(user.id, digest.id)));
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
            status: "failed", error: `Tinyfish ${run.status === "CANCELLED" ? "cancelled" : "could not finish"} this crawl${typeof code === "string" ? ` (${code.slice(0, 80)})` : ""}. Check your Tinyfish dashboard; you can retry once for this edition.`,
          } });
        } else if (!["PENDING", "RUNNING"].includes(String(run.status))) {
          throw new Error("Tinyfish returned an unknown run status. Check again shortly.");
        }
      }
    }
    return json(await view(user.id, day, slot));
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
  const { day, slot } = slotOf();
  let digestId: string | null = null;
  try {
    const existing = await db.discoveryDigest.findUnique({ where: { userId_day_slot: { userId: user.id, day, slot } } });
    if (existing) {
      // Compare-and-swap makes retry safe across tabs. A ready edition cannot
      // be rerolled; failed runs get only one explicit retry.
      const claim = await db.discoveryDigest.updateMany({ where: { id: existing.id, status: "failed", attempts: { lt: 2 } }, data: {
        status: "starting", attempts: { increment: 1 }, topics: input.topics, seeds: JSON.stringify(input.seeds),
        budget: input.budget, startedAt: new Date(), runId: null, lastPolledAt: null, error: null,
      } });
      if (!claim.count) return json(await view(user.id, day, slot));
      digestId = existing.id;
    } else {
      try {
        const created = await db.discoveryDigest.create({ data: {
          userId: user.id, day, slot, topics: input.topics, seeds: JSON.stringify(input.seeds), budget: input.budget,
        } });
        digestId = created.id;
      } catch (error) {
        if (record(error).code === "P2002") return json(await view(user.id, day, slot));
        throw error;
      }
    }
    const runId = await startDiscovery(input, await excludedUrls(user.id, digestId), day);
    await db.discoveryDigest.update({ where: { id: digestId }, data: { runId, status: "running" } });
    return json(await view(user.id, day, slot), 202);
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
  const article = await db.discoveryArticle.findFirst({ where: { id: body.id, digest: { userId: user.id } }, include: { digest: { select: { day: true, slot: true } } } });
  if (!article) return json({ error: "Article not found." }, 404);
  if (body.status === "saved" && !await db.item.findFirst({ where: { userId: user.id, sourceUrl: article.url } })) {
    return json({ error: "Save the article to your library first." }, 400);
  }
  await db.discoveryArticle.update({ where: { id: article.id }, data: { status: body.status } });
  return json(await view(user.id, article.digest.day, article.digest.slot));
}

export async function PUT(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Sign in to update your daily schedule." }, 401);
  try {
    const body = record(await boundedJson(req, 8_192));
    if (typeof body.enabled !== "boolean") throw new Error("Choose whether daily discovery is enabled.");
    const input = parseDiscoveryInput({ topics: body.topics ?? DEFAULT_TOPICS, budget: body.budget ?? 30, seeds: [] });
    const allowed = new Set<string>(DISCOVERY_SOURCES.map((source) => source.id));
    if (!Array.isArray(body.sourceIds) || !body.sourceIds.length || body.sourceIds.length > allowed.size || body.sourceIds.some((id) => typeof id !== "string" || !allowed.has(id))) throw new Error("Choose at least one source from the collection.");
    const data = { enabled: body.enabled, topics: input.topics, budget: input.budget, sourceIds: JSON.stringify([...new Set(body.sourceIds)]) };
    await getDb().discoverySchedule.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    const fallback = await latestEdition(user.id);
    return json(await view(user.id, fallback.day, fallback.slot));
  } catch (error) { return json({ error: message(error) }, 400); }
}
