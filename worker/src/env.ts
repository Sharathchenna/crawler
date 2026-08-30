import type { FetchJob } from "./jobs";

export interface Env {
  DB: D1Database;
  POSTS: R2Bucket;
  FETCH_QUEUE: Queue<FetchJob>;
  AI?: Ai;
  VECTORIZE?: VectorizeIndex;
  TINYFISH_API_KEY?: string;
}
