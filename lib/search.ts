import { getDb } from "./db";
import Fuse from "fuse.js";
import { semanticIds } from "./embeddings";

export type SearchHit = {
  id: string;
  kind: "item" | "note";
  title: string;
  snippet: string;
  type: string;
  sourceUrl?: string | null;
  /** Which engine produced the hit. Additive — old clients ignore it. */
  via?: "keyword" | "fuzzy" | "semantic";
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
export async function searchAll(
  userId: string,
  q: string,
  limit = 20,
  types: string[] = []
): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];
  const take = Math.min(Math.max(limit, 1), 50);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return [];
  const wantNotes = !types.length || types.includes("note");
  const itemTypes = types.filter((t) => t !== "note");
  // When a type filter is set, items match only the listed item types —
  // types=["note"] must exclude items entirely (in: [] matches nothing).
  const itemTypeFilter = types.length ? { type: { in: itemTypes } } : {};
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  const push = (h: SearchHit) => {
    const key = `${h.kind}:${h.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(h);
  };

  // 1. Keyword: every term must appear somewhere (AND across terms).
  const termClauses = terms.map((t) => ({
    OR: [{ title: { contains: t } }, { markdown: { contains: t } }, { excerpt: { contains: t } }],
  }));
  const [kwItems, kwNotes] = await Promise.all([
    getDb().item.findMany({
      where: {
        userId,
        AND: termClauses,
        ...itemTypeFilter,
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    wantNotes
      ? getDb().note.findMany({
          where: {
            userId,
            AND: terms.map((t) => ({ OR: [{ title: { contains: t } }, { markdown: { contains: t } }] })),
          },
          orderBy: { updatedAt: "desc" },
          take,
        })
      : [],
  ]);
  for (const it of kwItems) {
    push({
      id: it.id,
      kind: "item",
      title: it.title,
      snippet: snippetAround(`${it.title}\n${it.excerpt}\n${it.markdown}`, query),
      type: it.type,
      sourceUrl: it.sourceUrl,
      via: "keyword",
    });
  }
  for (const n of kwNotes) {
    push({
      id: n.id,
      kind: "note",
      title: n.title,
      snippet: snippetAround(`${n.title}\n${n.markdown}`, query),
      type: "note",
      sourceUrl: null,
      via: "keyword",
    });
  }

  // 2. Semantic: nearest neighbours from Vectorize (owner-scoped at read).
  if (true) {
    const ids = await semanticIds(query, userId, 30);
    if (ids.length) {
      const [semItems, semNotes] = await Promise.all([
        getDb().item.findMany({
          where: {
            userId,
            id: { in: ids },
            ...itemTypeFilter,
          },
          take: 30,
        }),
        wantNotes
          ? getDb().note.findMany({ where: { userId, id: { in: ids } }, take: 30 })
          : [],
      ]);
      const byId = new Map<string, (typeof semItems)[number] | (typeof semNotes)[number]>();
      for (const it of semItems) byId.set(`item:${it.id}`, it);
      for (const n of semNotes) byId.set(`note:${n.id}`, n);
      for (const id of ids) {
        const row = byId.get(`item:${id}`) ?? byId.get(`note:${id}`);
        if (!row) continue;
        if ("excerpt" in row) {
          push({
            id: row.id,
            kind: "item",
            title: row.title,
            snippet: snippetAround(`${row.title}\n${row.excerpt}\n${row.markdown}`, query),
            type: row.type,
            sourceUrl: row.sourceUrl,
            via: "semantic",
          });
        } else {
          push({
            id: row.id,
            kind: "note",
            title: row.title,
            snippet: snippetAround(`${row.title}\n${row.markdown}`, query),
            type: "note",
            sourceUrl: null,
            via: "semantic",
          });
        }
        if (hits.length >= take + 10) break;
      }
    }
  }

  // 3. Fuzzy: typo-tolerant match on titles + excerpts only (bounded CPU —
  // full bodies stay keyword-only). Capped extras past the exact hits.
  const [fzItems, fzNotes] = await Promise.all([
    getDb().item.findMany({
      where: {
        userId,
        ...itemTypeFilter,
      },
      select: { id: true, title: true, excerpt: true, type: true, sourceUrl: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    wantNotes
      ? getDb().note.findMany({
          where: { userId },
          select: { id: true, title: true },
          orderBy: { updatedAt: "desc" },
          take: 200,
        })
      : [],
  ]);
  const fuse = new Fuse(
    [
      ...fzItems.map((it) => ({ ...it, kind: "item" as const, body: it.excerpt })),
      ...fzNotes.map((n) => ({ ...n, kind: "note" as const, body: "", type: "note", sourceUrl: null })),
    ],
    {
      keys: [
        { name: "title", weight: 2 },
        { name: "body", weight: 1 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      includeScore: true,
    }
  );
  let fuzzyAdded = 0;
  // Fuse itself filters gibberish (no match at all); this gate only trims
  // the weakest tail. Typo corrections score ~0.55–0.65.
  for (const r of fuse.search(query)) {
    if (fuzzyAdded >= 5 || (r.score ?? 1) > 0.75) continue;
    const row = r.item;
    if (row.kind === "item") {
      const full = await getDb().item.findFirst({
        where: { id: row.id, userId },
        select: { title: true, excerpt: true, markdown: true },
      });
      push({
        id: row.id,
        kind: "item",
        title: row.title,
        snippet: full ? snippetAround(`${full.title}\n${full.excerpt}\n${full.markdown}`, query) : row.body,
        type: row.type,
        sourceUrl: row.sourceUrl,
        via: "fuzzy",
      });
    } else {
      push({
        id: row.id,
        kind: "note",
        title: row.title,
        snippet: row.title,
        type: "note",
        sourceUrl: null,
        via: "fuzzy",
      });
    }
    fuzzyAdded++;
  }

  return hits.slice(0, take);
}
