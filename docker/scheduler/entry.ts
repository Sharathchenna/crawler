// Standalone discovery scheduler for Docker/VPS deployments.
//
// Mirrors workers/discovery.ts (the Cloudflare cron Worker) against Postgres
// via `pg` instead of the native D1 API. Same semantics: claim the current
// 3-hour slot per enabled schedule, collect feeds + HN, one Tinyfish run per
// edition, attributed feed-previews fallback. Atomic completion uses a real
// Postgres transaction (stronger than the D1 batch it replaces).
//
// Built with esbuild at image build time; runs as the `scheduler` service.
import { Pool, type PoolClient } from "pg";
import { normalizeArticles, publicBlogUrl } from "../../lib/discovery";
import { collectCandidates, feedFallback, shortlist } from "../../lib/discovery-feeds";
import { slotOf, type Candidate } from "../../lib/discovery-sources";
import { getDiscoveryRun, startDiscovery } from "../../lib/tinyfish";

type Schedule = { userId: string; topics: string; budget: number; sourceIds: string };
type Pending = {
  id: string; userId: string; day: string; slot: number; status: string;
  runId: string | null; candidates: string; budget: number; startedAt: string | Date | number;
};
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 300) : "Scheduled discovery failed";

async function exclusions(pool: Pool, userId: string, day: string, slot: number): Promise<Set<string>> {
  const [saved, seen] = await Promise.all([
    pool.query<{ url: string }>(
      `SELECT "sourceUrl" AS url FROM items WHERE "userId" = $1 AND "sourceUrl" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 200`,
      [userId]
    ),
    pool.query<{ url: string }>(
      `SELECT a.url FROM discovery_articles a JOIN discovery_digests d ON a."digestId" = d.id
       WHERE d."userId" = $1 AND NOT (d.day = $2 AND d.slot = $3)
       ORDER BY d.day DESC, d.slot DESC LIMIT 200`,
      [userId, day, slot]
    ),
  ]);
  return new Set(
    [...saved.rows, ...seen.rows]
      .map((row) => publicBlogUrl(row.url))
      .filter((url): url is string => Boolean(url))
  );
}

async function completeDigestTx(client: PoolClient, id: string, runId: string, articles: ReturnType<typeof normalizeArticles>, notice: string | null) {
  for (const [position, article] of articles.entries()) {
    await client.query(
      `INSERT INTO discovery_articles (id, "digestId", url, title, author, summary, reason, minutes, position, status, "imageUrl")
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, 'unread', $10
       WHERE EXISTS (SELECT 1 FROM discovery_digests WHERE id = $2 AND "runId" = $11 AND status = 'running')`,
      [crypto.randomUUID(), id, article.url, article.title, article.author, article.summary,
        article.reason, article.minutes, position, article.imageUrl ?? "", runId]
    );
  }
  await client.query(
    `UPDATE discovery_digests SET status = 'ready', error = $1 WHERE id = $2 AND "runId" = $3 AND status = 'running'`,
    [notice, id, runId]
  );
}

async function finish(pool: Pool, digest: Pending, result: unknown, notice: string | null = null) {
  const candidates: Candidate[] = JSON.parse(digest.candidates);
  const excluded = await exclusions(pool, digest.userId, digest.day, digest.slot);
  let articles: ReturnType<typeof normalizeArticles> = [];
  if (!notice) {
    try {
      const allowed = new Set(candidates.map((item) => item.url));
      articles = normalizeArticles(result, digest.budget, excluded).filter((item) => allowed.has(item.url));
    } catch { /* Fall back to attributed feed previews. */ }
    if (!articles.length) notice = "Tinyfish did not return usable summaries. Showing publisher previews from today's collected links.";
  }
  if (!articles.length) articles = feedFallback(candidates, digest.budget, excluded);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await completeDigestTx(client, digest.id, digest.runId ?? "feed-only", articles, notice);
    await client.query(`UPDATE discovery_schedules SET "lastError" = $1 WHERE "userId" = $2`, [notice, digest.userId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function finalizePending(pool: Pool, env: { TINYFISH_API_KEY?: string }, now: Date) {
  const pending = await pool.query<Pending>(
    `SELECT id, "userId", day, slot, status, "runId", candidates, budget, "startedAt"
     FROM discovery_digests WHERE origin = 'scheduled' AND status IN ('starting', 'running')
     ORDER BY day, slot LIMIT 10`
  );
  for (const digest of pending.rows) {
    const age = now.getTime() - new Date(digest.startedAt).getTime();
    if (digest.status === "starting") {
      if (age < 5 * 60_000) continue;
      const claimed = await pool.query(
        `UPDATE discovery_digests SET status = 'running', "runId" = 'feed-only' WHERE id = $1 AND status = 'starting'`,
        [digest.id]
      );
      if (claimed.rowCount) await finish(pool, { ...digest, runId: "feed-only" }, null, "The browser crawl could not start. Showing publisher previews where available.");
      continue;
    }
    const lease = await pool.query(
      `UPDATE discovery_digests SET "lastPolledAt" = $1 WHERE id = $2 AND status = 'running'
       AND ("lastPolledAt" IS NULL OR "lastPolledAt" < $3)`,
      [now.toISOString(), digest.id, new Date(now.getTime() - 90_000).toISOString()]
    );
    if (!lease.rowCount) continue;
    try {
      if (!digest.runId || digest.runId === "feed-only") {
        await finish(pool, digest, null, "Showing publisher previews; browser summaries were unavailable.");
        continue;
      }
      const run = await getDiscoveryRun(digest.runId, env.TINYFISH_API_KEY);
      if (run.status === "COMPLETED") await finish(pool, digest, run.result ?? { resultJson: run.resultJson });
      else if (run.status === "FAILED" || run.status === "CANCELLED" || age > 30 * 60_000) {
        await finish(pool, digest, null, "Tinyfish could not finish this edition. Showing publisher previews from the collected links.");
      }
    } catch (error) {
      if (age > 30 * 60_000) await finish(pool, digest, null, "Tinyfish is unavailable. Showing publisher previews from the collected links.");
      else await pool.query(`UPDATE discovery_schedules SET "lastError" = $1 WHERE "userId" = $2`, [errorMessage(error), digest.userId]);
      console.error(JSON.stringify({ event: "scheduled_discovery_poll_error", digestId: digest.id, message: errorMessage(error) }));
    }
  }
}

export async function runScheduledDiscovery(pool: Pool, env: { TINYFISH_API_KEY?: string }, now = new Date()) {
  await finalizePending(pool, env, now);
  const { day, slot } = slotOf(now);
  const schedules = await pool.query<Schedule>(
    `SELECT "userId", topics, budget, "sourceIds" FROM discovery_schedules s
     WHERE enabled = true AND NOT EXISTS (SELECT 1 FROM discovery_digests d WHERE d."userId" = s."userId" AND d.day = $1 AND d.slot = $2)
     ORDER BY "userId" LIMIT 10`,
    [day, slot]
  );
  for (const schedule of schedules.rows) {
    const id = crypto.randomUUID();
    // Atomic claim on the unique (userId, day, slot) index.
    const claim = await pool.query(
      `INSERT INTO discovery_digests (id, "userId", day, slot, topics, seeds, budget, status, attempts, "startedAt", origin, candidates)
       SELECT $1, "userId", $2, $3, topics, '[]', budget, 'starting', 1, $4, 'scheduled', '[]'
       FROM discovery_schedules WHERE "userId" = $5 AND enabled = true
       ON CONFLICT ("userId", day, slot) DO NOTHING RETURNING id`,
      [id, day, slot, now.toISOString(), schedule.userId]
    );
    if (!claim.rowCount) continue;
    let candidates: Candidate[] = [];
    try {
      const excluded = await exclusions(pool, schedule.userId, day, slot);
      const collected = await collectCandidates(JSON.parse(schedule.sourceIds), now);
      candidates = shortlist(collected.candidates, excluded, schedule.topics, day);
      await pool.query(
        `UPDATE discovery_digests SET candidates = $1 WHERE id = $2 AND status = 'starting'`,
        [JSON.stringify(candidates), id]
      );
      await pool.query(
        `UPDATE discovery_schedules SET "lastRunAt" = $1, "lastError" = NULL, "sourceHealth" = $2 WHERE "userId" = $3`,
        [now.toISOString(), JSON.stringify(collected.health), schedule.userId]
      );
      const digest: Pending = { id, userId: schedule.userId, day, slot, status: "running", runId: "feed-only", candidates: JSON.stringify(candidates), budget: schedule.budget, startedAt: now.getTime() };
      if (!candidates.length || !env.TINYFISH_API_KEY) {
        await pool.query(`UPDATE discovery_digests SET status = 'running', "runId" = 'feed-only' WHERE id = $1 AND status = 'starting'`, [id]);
        const notice = candidates.length ? "Tinyfish is not configured. Showing publisher previews." : collected.health.every((source) => source.error) ? "All sources were unavailable today. The scheduler will try again tomorrow." : "No new unseen links were available from the selected sources today.";
        await finish(pool, digest, null, notice);
      } else {
        const runId = await startDiscovery({ topics: schedule.topics, seeds: [], budget: schedule.budget }, [...excluded], day, env.TINYFISH_API_KEY, candidates);
        await pool.query(`UPDATE discovery_digests SET "runId" = $1, status = 'running' WHERE id = $2 AND status = 'starting'`, [runId, id]);
      }
      console.log(JSON.stringify({ event: "scheduled_discovery_started", digestId: id, candidates: candidates.length, sources: collected.health.length }));
    } catch (error) {
      await pool.query(`UPDATE discovery_digests SET status = 'running', "runId" = 'feed-only', candidates = $1 WHERE id = $2 AND status = 'starting'`, [JSON.stringify(candidates), id]);
      await finish(pool, { id, userId: schedule.userId, day, slot, status: "running", runId: "feed-only", candidates: JSON.stringify(candidates), budget: schedule.budget, startedAt: now.getTime() }, null, `Browser summaries unavailable: ${errorMessage(error)}. Showing publisher previews.`);
      console.error(JSON.stringify({ event: "scheduled_discovery_start_error", digestId: id, message: errorMessage(error) }));
    }
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const env = { TINYFISH_API_KEY: process.env.TINYFISH_API_KEY };

async function tick() {
  try {
    await runScheduledDiscovery(pool, env);
  } catch (error) {
    console.error(JSON.stringify({ event: "scheduler_tick_failed", message: errorMessage(error) }));
  }
}

console.log(JSON.stringify({ event: "scheduler_started", everyMs: 5 * 60_000 }));
void tick();
// No unref: the interval is what keeps this container alive.
setInterval(() => void tick(), 5 * 60_000);
