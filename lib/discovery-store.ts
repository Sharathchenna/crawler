import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { DiscoveredArticle } from "./discovery";
import { completeDigestInDb } from "./discovery-persistence";

/** Prisma's D1 adapter does not provide transactions. Use a native D1 batch
 * so the completed edition and all its articles become visible atomically. */
export async function completeDigest(id: string, runId: string, articles: DiscoveredArticle[]) {
  const { env } = getCloudflareContext();
  await completeDigestInDb(env.DB, id, runId, articles);
}
