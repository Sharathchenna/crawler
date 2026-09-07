// Ensures the pgvector semantic-search table on Docker/VPS deployments.
// Idempotent; exits 0 when DATABASE_URL is not postgres (Workers/D1 path).
import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("postgres")) {
  console.log("[pgvector] skipping (not a postgres DATABASE_URL)");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS item_embeddings (
      doc_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'item',
      chunk INT NOT NULL DEFAULT 0,
      text TEXT NOT NULL DEFAULT '',
      embedding vector(384) NOT NULL,
      PRIMARY KEY (doc_id, chunk)
    )`);
  await client.query(`
    CREATE INDEX IF NOT EXISTS item_embeddings_hnsw
    ON item_embeddings USING hnsw (embedding vector_cosine_ops)`);
  console.log("[pgvector] item_embeddings ready");
} catch (e) {
  console.error("[pgvector] ensure failed:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
