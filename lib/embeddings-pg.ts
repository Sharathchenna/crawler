// pgvector semantic layer (Docker/VPS deployments only).
//
// Same bge-small embeddings as the Vectorize path, but stored in Postgres:
// chunked documents (qmd-style windows, not title+excerpt stubs), cosine
// distance queries, owner-scoped. No new native dependencies — vectors come
// from the existing Workers AI REST call, storage is plain SQL.
//
// Table DDL lives in docker/ensure-pgvector.mjs (run at boot). This module
// only reads/writes rows, so importing it is safe everywhere (Workers too);
// every function is a no-op-or-throw-safe when the table is absent.
import { getDb } from "./db";
import { embedMany } from "./embeddings";

export const PG_VECTOR_DIMS = 384;
const MAX_CHUNKS_PER_DOC = 12;

/** qmd-style windows: ~900 tokens at ~4 chars/token, 15% overlap, cut on
 * word boundaries. Pure function — unit-testable without a database. */
export function chunkText(text: string, maxChars = 3600, overlap = 540): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const space = clean.lastIndexOf(" ", end);
      if (space > start + maxChars / 2) end = space;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
    if (chunks.length >= MAX_CHUNKS_PER_DOC) break;
  }
  return chunks.filter(Boolean);
}

type PgDoc = { id: string; title: string; excerpt: string; userId: string; kind: "item" | "note"; type: string; body?: string };

function docText(d: PgDoc): string {
  const body = (d.body ?? "").slice(0, 30_000);
  return `${d.title ?? ""}\n${body || d.excerpt || ""}`.trim();
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

/** (Re)index documents: chunk, embed, replace rows. Returns docs indexed. */
export async function pgIndexDocs(docs: PgDoc[]): Promise<number> {
  if (!docs.length) return 0;
  const db = getDb();
  const chunked = docs.map((d) => ({ doc: d, chunks: chunkText(docText(d)) }));
  const flat: { doc: PgDoc; chunk: number; text: string }[] = [];
  chunked.forEach(({ doc, chunks }) => chunks.forEach((text, chunk) => flat.push({ doc, chunk, text })));
  const vectors = await embedMany(flat.map((f) => f.text));
  // Replace per doc so re-indexing never duplicates chunks.
  const byDoc = new Map<string, { chunk: number; text: string; values: number[] }[]>();
  flat.forEach((f, i) => {
    const values = vectors[i];
    if (!values || values.length !== PG_VECTOR_DIMS) return;
    const list = byDoc.get(f.doc.id) ?? [];
    list.push({ chunk: f.chunk, text: f.text, values });
    byDoc.set(f.doc.id, list);
  });
  let indexed = 0;
  for (const [docId, rows] of byDoc) {
    const meta = docs.find((d) => d.id === docId)!;
    try {
      await db.$executeRawUnsafe(`DELETE FROM item_embeddings WHERE doc_id = $1`, docId);
      for (const row of rows) {
        await db.$executeRawUnsafe(
          `INSERT INTO item_embeddings (doc_id, user_id, kind, chunk, text, embedding)
           VALUES ($1, $2, $3, $4, $5, $6::vector)`,
          docId, meta.userId, meta.kind, row.chunk, row.text.slice(0, 4000), toVectorLiteral(row.values)
        );
      }
      indexed++;
    } catch {
      // Table missing (non-Docker DB) or transient failure: skip silently,
      // keyword + fuzzy search carry on.
    }
  }
  return indexed;
}

export async function pgUnindexDoc(id: string): Promise<void> {
  if (!id) return;
  try {
    await getDb().$executeRawUnsafe(`DELETE FROM item_embeddings WHERE doc_id = $1`, id);
  } catch { /* see above */ }
}

/** Nearest-neighbour doc ids for this user, best chunk per doc wins. */
export async function pgSemanticIds(q: string, userId: string, topK = 30): Promise<string[]> {
  const query = (q ?? "").trim();
  if (!userId || !query) return [];
  try {
    const values = (await embedMany([query]))[0];
    if (!values || values.length !== PG_VECTOR_DIMS) return [];
    const limit = Math.min(Math.max(topK, 1), 50) * 3;
    const rows = (await getDb().$queryRawUnsafe(
      `SELECT doc_id AS id FROM item_embeddings
       WHERE user_id = $1
       ORDER BY embedding <=> $2::vector LIMIT $3`,
      userId, toVectorLiteral(values), limit
    )) as { id: string }[];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const row of rows) {
      const id = String(row?.id ?? "");
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      if (ids.length >= Math.min(Math.max(topK, 1), 50)) break;
    }
    return ids;
  } catch {
    return [];
  }
}
