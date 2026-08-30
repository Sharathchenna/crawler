import { discover } from "./discover";
import type { Env } from "./env";
import { handleRequest } from "./http";
import { processFetchBatch } from "./ingest";
import type { FetchJob } from "./jobs";

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      discover(env).then((result) => {
        console.log("scheduled discover", result);
      }),
    );
  },

  async queue(batch, env) {
    await processFetchBatch(batch, env);
  },
} satisfies ExportedHandler<Env, FetchJob>;
