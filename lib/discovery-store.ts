import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DiscoveredArticle } from "./discovery";

/** Prisma's D1 adapter does not provide transactions. Use a native D1 batch
 * so the completed edition and all its articles become visible atomically. */
export async function completeDigest(id: string, runId: string, articles: DiscoveredArticle[]) {
  const { env } = getCloudflareContext();
  const statements = articles.map((article, position) => env.DB.prepare(`
    INSERT INTO discovery_articles (id, digestId, url, title, author, summary, reason, minutes, position, status)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread'
    WHERE EXISTS (SELECT 1 FROM discovery_digests WHERE id = ? AND runId = ? AND status = 'running')
  `).bind(crypto.randomUUID(), id, article.url, article.title, article.author, article.summary,
    article.reason, article.minutes, position, id, runId));
  statements.push(env.DB.prepare(`
    UPDATE discovery_digests SET status = 'ready', error = NULL
    WHERE id = ? AND runId = ? AND status = 'running'
  `).bind(id, runId));
  await env.DB.batch(statements);
}
