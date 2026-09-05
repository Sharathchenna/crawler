// Per-request Prisma client (OpenNext pattern): no global client, since
// connection reuse across requests is not allowed on Workers. React cache()
// dedupes within one request. Works in route handlers, server components,
// and (via initOpenNextCloudflareForDev) `next dev` with local bindings.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { cache } from "react";

export const getDb = cache(() => {
  const { env } = getCloudflareContext();
  return new PrismaClient({ adapter: new PrismaD1(env.DB) });
});

export const getDbAsync = async () => {
  const { env } = await getCloudflareContext({ async: true });
  return new PrismaClient({ adapter: new PrismaD1(env.DB) });
};
