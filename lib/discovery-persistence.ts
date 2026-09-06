import type { DiscoveredArticle } from "./discovery";

/** D1 batch is atomic; the Prisma D1 adapter's nested writes are not. */
export async function completeDigestInDb(db: D1Database, id: string, runId: string, articles: DiscoveredArticle[], notice: string | null = null) {
  const statements = articles.map((article, position) => db.prepare(`
    INSERT INTO discovery_articles (id, digestId, url, title, author, summary, reason, minutes, position, status, imageUrl)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?
    WHERE EXISTS (SELECT 1 FROM discovery_digests WHERE id = ? AND runId = ? AND status = 'running')
  `).bind(crypto.randomUUID(), id, article.url, article.title, article.author, article.summary,
    article.reason, article.minutes, position, article.imageUrl ?? "", id, runId));
  statements.push(db.prepare(`
    UPDATE discovery_digests SET status = 'ready', error = ?
    WHERE id = ? AND runId = ? AND status = 'running'
  `).bind(notice, id, runId));
  await db.batch(statements);
}
