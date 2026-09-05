import { getDb } from "./db";

export type SearchHit = {
  id: string;
  kind: "item" | "note";
  title: string;
  snippet: string;
  type: string;
  sourceUrl?: string | null;
};

function snippetAround(text: string, q: string, radius = 90): string {
  const lower = text.toLowerCase();
  const needle = q.toLowerCase().split(/\s+/)[0] || q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return text.slice(0, 180);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + needle.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

// TODO: pgvector semantic search — when DATABASE_URL moves to PostgreSQL,
// add an embedding column + ivfflat index and blend vector hits with these keyword hits.
export async function searchAll(userId: string, q: string, limit = 20): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];
  const take = Math.min(Math.max(limit, 1), 50);
  const [items, notes] = await Promise.all([
    getDb().item.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query } },
          { markdown: { contains: query } },
          { excerpt: { contains: query } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    getDb().note.findMany({
      where: {
        userId,
        OR: [{ title: { contains: query } }, { markdown: { contains: query } }],
      },
      orderBy: { updatedAt: "desc" },
      take,
    }),
  ]);
  const hits: SearchHit[] = [
    ...items.map((it) => ({
      id: it.id,
      kind: "item" as const,
      title: it.title,
      snippet: snippetAround(`${it.title}\n${it.excerpt}\n${it.markdown}`, query),
      type: it.type,
      sourceUrl: it.sourceUrl,
    })),
    ...notes.map((n) => ({
      id: n.id,
      kind: "note" as const,
      title: n.title,
      snippet: snippetAround(`${n.title}\n${n.markdown}`, query),
      type: "note",
      sourceUrl: null,
    })),
  ];
  return hits.slice(0, take);
}
