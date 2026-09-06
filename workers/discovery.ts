import { normalizeArticles, publicBlogUrl } from "../lib/discovery";
import { timingSafeEqual } from "node:crypto";
import { collectCandidates, feedFallback, shortlist } from "../lib/discovery-feeds";
import { slotOf, type Candidate } from "../lib/discovery-sources";
import { completeDigestInDb } from "../lib/discovery-persistence";
import { getDiscoveryRun, startDiscovery } from "../lib/tinyfish";

type Schedule = { userId: string; topics: string; budget: number; sourceIds: string };
type Pending = { id: string; userId: string; day: string; slot: number; status: string; runId: string | null; candidates: string; budget: number; startedAt: string | number };
type SchedulerEnv = Pick<DiscoveryWorkerEnv, "DB" | "TINYFISH_API_KEY" | "CRON_SECRET">;
const errorMessage = (error: unknown) => error instanceof Error ? error.message.slice(0, 300) : "Scheduled discovery failed";

async function exclusions(db: D1Database, userId: string, day: string, slot: number): Promise<Set<string>> {
  const [saved, seen] = await Promise.all([
    db.prepare("SELECT sourceUrl AS url FROM items WHERE userId = ? AND sourceUrl IS NOT NULL ORDER BY createdAt DESC LIMIT 200").bind(userId).all<{ url: string }>(),
    // Every other edition — including earlier slots today — so slots never repeat links.
    db.prepare("SELECT a.url FROM discovery_articles a JOIN discovery_digests d ON a.digestId = d.id WHERE d.userId = ? AND NOT (d.day = ? AND d.slot = ?) ORDER BY d.day DESC, d.slot DESC LIMIT 200").bind(userId, day, slot).all<{ url: string }>(),
  ]);
  return new Set([...saved.results, ...seen.results].map((row) => publicBlogUrl(row.url)).filter((url): url is string => Boolean(url)));
}

async function finish(db: D1Database, digest: Pending, result: unknown, notice: string | null = null) {
  const candidates: Candidate[] = JSON.parse(digest.candidates);
  const excluded = await exclusions(db, digest.userId, digest.day, digest.slot);
  let articles: ReturnType<typeof normalizeArticles> = [];
  if (!notice) {
    try {
      const allowed = new Set(candidates.map((item) => item.url));
      articles = normalizeArticles(result, digest.budget, excluded).filter((item) => allowed.has(item.url));
    } catch { /* Fall back to attributed feed previews. */ }
    if (!articles.length) notice = "Tinyfish did not return usable summaries. Showing publisher previews from today's collected links.";
  }
  if (!articles.length) articles = feedFallback(candidates, digest.budget, excluded);
  await completeDigestInDb(db, digest.id, digest.runId ?? "feed-only", articles, notice);
  await db.prepare("UPDATE discovery_schedules SET lastError = ? WHERE userId = ?").bind(notice, digest.userId).run();
}

async function finalizePending(env: SchedulerEnv, now: Date) {
  const pending = await env.DB.prepare("SELECT id, userId, day, slot, status, runId, candidates, budget, startedAt FROM discovery_digests WHERE origin = 'scheduled' AND status IN ('starting', 'running') ORDER BY day, slot LIMIT 10").all<Pending>();
  for (const digest of pending.results) {
    const age = now.getTime() - new Date(digest.startedAt).getTime();
    if (digest.status === "starting") {
      if (age < 5 * 60_000) continue;
      const claimed = await env.DB.prepare("UPDATE discovery_digests SET status = 'running', runId = 'feed-only' WHERE id = ? AND status = 'starting'").bind(digest.id).run();
      if (claimed.meta.changes) await finish(env.DB, { ...digest, runId: "feed-only" }, null, "The browser crawl could not start. Showing publisher previews where available.");
      continue;
    }
    const lease = await env.DB.prepare("UPDATE discovery_digests SET lastPolledAt = ? WHERE id = ? AND status = 'running' AND (lastPolledAt IS NULL OR lastPolledAt < ?)")
      .bind(now.toISOString(), digest.id, new Date(now.getTime() - 90_000).toISOString()).run();
    if (!lease.meta.changes) continue;
    try {
      if (!digest.runId || digest.runId === "feed-only") {
        await finish(env.DB, digest, null, "Showing publisher previews; browser summaries were unavailable.");
        continue;
      }
      const run = await getDiscoveryRun(digest.runId, env.TINYFISH_API_KEY);
      if (run.status === "COMPLETED") await finish(env.DB, digest, run.result ?? { resultJson: run.resultJson });
      else if (run.status === "FAILED" || run.status === "CANCELLED" || age > 30 * 60_000) {
        await finish(env.DB, digest, null, "Tinyfish could not finish this edition. Showing publisher previews from the collected links.");
      }
    } catch (error) {
      if (age > 30 * 60_000) await finish(env.DB, digest, null, "Tinyfish is unavailable. Showing publisher previews from the collected links.");
      else await env.DB.prepare("UPDATE discovery_schedules SET lastError = ? WHERE userId = ?").bind(errorMessage(error), digest.userId).run();
      console.error(JSON.stringify({ event: "scheduled_discovery_poll_error", digestId: digest.id, message: errorMessage(error) }));
    }
  }
}

export async function runScheduledDiscovery(env: SchedulerEnv, now = new Date()) {
  await finalizePending(env, now);
  // No start-hour gate: editions run round the clock, one per 3-hour slot.
  const { day, slot } = slotOf(now);
  const schedules = await env.DB.prepare(`SELECT userId, topics, budget, sourceIds FROM discovery_schedules s
    WHERE enabled = 1 AND NOT EXISTS (SELECT 1 FROM discovery_digests d WHERE d.userId = s.userId AND d.day = ? AND d.slot = ?)
    ORDER BY userId LIMIT 10`).bind(day, slot).all<Schedule>();
  for (const schedule of schedules.results) {
    const id = crypto.randomUUID();
    // Atomic claim, shared unique index with manual /api/discover starts.
    const claim = await env.DB.prepare(`INSERT OR IGNORE INTO discovery_digests
      (id, userId, day, slot, topics, seeds, budget, status, attempts, startedAt, origin, candidates)
      SELECT ?, userId, ?, ?, topics, '[]', budget, 'starting', 1, ?, 'scheduled', '[]'
      FROM discovery_schedules WHERE userId = ? AND enabled = 1`)
      .bind(id, day, slot, now.toISOString(), schedule.userId).run();
    if (!claim.meta.changes) continue;
    let candidates: Candidate[] = [];
    try {
      const excluded = await exclusions(env.DB, schedule.userId, day, slot);
      const collected = await collectCandidates(JSON.parse(schedule.sourceIds), now);
      candidates = shortlist(collected.candidates, excluded, schedule.topics, day);
      await env.DB.batch([
        env.DB.prepare("UPDATE discovery_digests SET candidates = ? WHERE id = ? AND status = 'starting'").bind(JSON.stringify(candidates), id),
        env.DB.prepare("UPDATE discovery_schedules SET lastRunAt = ?, lastError = NULL, sourceHealth = ? WHERE userId = ?")
          .bind(now.toISOString(), JSON.stringify(collected.health), schedule.userId),
      ]);
      const digest: Pending = { id, userId: schedule.userId, day, slot, status: "running", runId: "feed-only", candidates: JSON.stringify(candidates), budget: schedule.budget, startedAt: now.getTime() };
      if (!candidates.length || !env.TINYFISH_API_KEY) {
        await env.DB.prepare("UPDATE discovery_digests SET status = 'running', runId = 'feed-only' WHERE id = ? AND status = 'starting'").bind(id).run();
        const notice = candidates.length ? "Tinyfish is not configured. Showing publisher previews." : collected.health.every((source) => source.error) ? "All sources were unavailable today. The scheduler will try again tomorrow." : "No new unseen links were available from the selected sources today.";
        await finish(env.DB, digest, null, notice);
      } else {
        const runId = await startDiscovery({ topics: schedule.topics, seeds: [], budget: schedule.budget }, [...excluded], day, env.TINYFISH_API_KEY, candidates);
        await env.DB.prepare("UPDATE discovery_digests SET runId = ?, status = 'running' WHERE id = ? AND status = 'starting'").bind(runId, id).run();
      }
      console.log(JSON.stringify({ event: "scheduled_discovery_started", digestId: id, candidates: candidates.length, sources: collected.health.length }));
    } catch (error) {
      // Do not repeatedly launch paid runs. Preserve collected candidates and
      // finish a usable feed-only edition on this or the next cron tick.
      await env.DB.prepare("UPDATE discovery_digests SET status = 'running', runId = 'feed-only', candidates = ? WHERE id = ? AND status = 'starting'").bind(JSON.stringify(candidates), id).run();
      await finish(env.DB, { id, userId: schedule.userId, day, slot, status: "running", runId: "feed-only", candidates: JSON.stringify(candidates), budget: schedule.budget, startedAt: now.getTime() }, null, `Browser summaries unavailable: ${errorMessage(error)}. Showing publisher previews.`);
      console.error(JSON.stringify({ event: "scheduled_discovery_start_error", digestId: id, message: errorMessage(error) }));
    }
  }
}

async function authorized(req: Request, secret: string): Promise<boolean> {
  if (!secret) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([secret, req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? ""].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

export default {
  async scheduled(_controller: ScheduledController, env: DiscoveryWorkerEnv) {
    await runScheduledDiscovery(env);
  },
  async fetch(req: Request, env: DiscoveryWorkerEnv): Promise<Response> {
    // Authenticated operational trigger for deployment checks; no public data.
    if (req.method !== "POST" || new URL(req.url).pathname !== "/run" || !await authorized(req, env.CRON_SECRET)) return new Response("Not found", { status: 404 });
    await runScheduledDiscovery(env);
    return Response.json({ ok: true });
  },
} satisfies ExportedHandler<DiscoveryWorkerEnv>;
