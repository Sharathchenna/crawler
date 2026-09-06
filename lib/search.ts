import { getDb } from "./db";
import Fuse from "fuse.js";
import { semanticIds } from "./embeddings";
import { buildFtsQuery, extractSnippet, ftsSearch, rrfFuse, rankByFusion, tokenizeQuery } from "./qmd";

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

/**
 * Hybrid search in the spirit of qmd (tobi/qmd, MIT):
 * BM25 FTS5 (weight 2) + Vectorize semantic (weight 1) + Fuse fuzzy (0.7),
 * fused with Reciprocal Rank Fusion (k=60) plus top-rank bonus. LIKE-AND is
 * kept only as a fallback when the FTS tables are missing (pre-0003 DBs).
 */
export async function searchAll(
  userId: string,
  q: string,
  limit = 20,
  types: string[] = []
): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];
  const take = Math.min(Math.max(limit, 1), 50);
  const terms = tokenizeQuery(query);
  if (!terms.length) return [];
  const wantNotes = !types.length || types.includes("note");
  const itemTypes = types.filter((t) => t !== "note");
  // When a type filter is set, items match only the listed item types —
  // types=["note"] must exclude items entirely (in: [] matches nothing).
  const itemTypeFilter = types.length ? { type: { in: itemTypes } } : {};

  // 1. BM25 via D1 FTS5 (title boosted 2x at query time). Falls back to
  // LIKE-AND on DBs without migration 0003.
  const ftsQuery = buildFtsQuery(query);
  let ftsItemIds: string[] = [];
  let ftsNoteIds: string[] = [];
  let ftsAvailable = false;
  if (ftsQuery) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = getCloudflareContext() as unknown as {
        env: { DB: Parameters<typeof ftsSearch>[0] };
      };
      const [itemHits, noteHits] = await Promise.all([
        ftsSearch(env.DB, "items_fts", userId, ftsQuery, 30),
        wantNotes ? ftsSearch(env.DB, "notes_fts", userId, ftsQuery, 30) : Promise.resolve([]),
      ]);
      ftsItemIds = itemHits.map((h) => h.id);
      ftsNoteIds = noteHits.map((h) => h.id);
      ftsAvailable = true;
    } catch {
      ftsAvailable = false;
    }
  }

  // LIKE-AND fallback (exact old behavior, capped) when FTS is unavailable.
  let likeItemIds: string[] = [];
  let likeNoteIds: string[] = [];
  if (!ftsAvailable) {
    const likeTerms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    const termClauses = likeTerms.map((t) => ({
      OR: [{ title: { contains: t } }, { markdown: { contains: t } }, { excerpt: { contains: t } }],
    }));
    const [kwItems, kwNotes] = await Promise.all([
      getDb().item.findMany({
        where: { userId, AND: termClauses, ...itemTypeFilter },
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      wantNotes
        ? getDb().note.findMany({
            where: {
              userId,
              AND: likeTerms.map((t) => ({ OR: [{ title: { contains: t } }, { markdown: { contains: t } }] })),
            },
            select: { id: true },
            orderBy: { updatedAt: "desc" },
            take: 30,
          })
        : [],
    ]);
    likeItemIds = kwItems.map((r) => r.id);
    likeNoteIds = kwNotes.map((r) => r.id);
  }

  // 2. Semantic: nearest neighbours from Vectorize (owner-scoped at read).
  const semIds = await semanticIds(query, userId, 30).catch(() => [] as string[]);
  const semItemIds = semIds.length
    ? (
        await getDb().item.findMany({
          where: { userId, id: { in: semIds }, ...itemTypeFilter },
          select: { id: true },
          take: 30,
        })
      ).map((r) => r.id)
    : [];
  // Preserve vector order for the surviving ids.
  semItemIds.sort((a, b) => semIds.indexOf(a) - semIds.indexOf(b));
  let semNoteIds: string[] = [];
  if (wantNotes && semIds.length) {
    const rows = await getDb().note.findMany({
      where: { userId, id: { in: semIds } },
      select: { id: true },
      take: 30,
    });
    const keep = new Set(rows.map((r) => r.id));
    // Notes and items share one id-space list; keep vector order.
    semNoteIds = semIds.filter((id) => keep.has(id));
  }

  // 3. Fuzzy: typo-tolerant match on titles + excerpts only (bounded CPU).
  const [fzItems, fzNotes] = await Promise.all([
    getDb().item.findMany({
      where: { userId, ...itemTypeFilter },
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
  const fuzzyItemIds: string[] = [];
  const fuzzyNoteIds: string[] = [];
  for (const r of fuse.search(query)) {
    if ((r.score ?? 1) > 0.75) continue;
    if (r.item.kind === "item") fuzzyItemIds.push(r.item.id);
    else fuzzyNoteIds.push(r.item.id);
    if (fuzzyItemIds.length + fuzzyNoteIds.length >= 10) break;
  }

  // 4. RRF fusion per kind (item ids and note ids live in separate spaces).
  const itemScores = rrfFuse(
    [
      ...(ftsAvailable ? [{ ids: ftsItemIds, weight: 2 }] : [{ ids: likeItemIds, weight: 2 }]),
      { ids: semItemIds, weight: 1 },
      { ids: fuzzyItemIds, weight: 0.7 },
    ].filter((l) => l.ids.length)
  );
  const noteScores = wantNotes
    ? rrfFuse(
        [
          ...(ftsAvailable ? [{ ids: ftsNoteIds, weight: 2 }] : [{ ids: likeNoteIds, weight: 2 }]),
          { ids: semNoteIds, weight: 1 },
          { ids: fuzzyNoteIds, weight: 0.7 },
        ].filter((l) => l.ids.length)
      )
    : new Map<string, number>();
  const rankedItemIds = rankByFusion(itemScores).slice(0, take + 10);
  const rankedNoteIds = rankByFusion(noteScores).slice(0, take + 10);

  const [topItems, topNotes] = await Promise.all([
    rankedItemIds.length
      ? getDb().item.findMany({ where: { userId, id: { in: rankedItemIds }, ...itemTypeFilter } })
      : Promise.resolve([]),
    rankedNoteIds.length && wantNotes
      ? getDb().note.findMany({ where: { userId, id: { in: rankedNoteIds } } })
      : Promise.resolve([]),
  ]);
  const itemById = new Map(topItems.map((it) => [it.id, it]));
  const noteById = new Map(topNotes.map((n) => [n.id, n]));

  const primaryVia = (id: string, kind: "item" | "note"): NonNullable<SearchHit["via"]> => {
    const fts = kind === "item" ? ftsItemIds : ftsNoteIds;
    const like = kind === "item" ? likeItemIds : likeNoteIds;
    const sem = kind === "item" ? semItemIds : semNoteIds;
    if (fts.includes(id) || like.includes(id)) return "keyword";
    if (sem.includes(id)) return "semantic";
    return "fuzzy";
  };

  // Merge the two ranked lists by fused score for the final ordering.
  const merged: { key: string; score: number }[] = [];
  for (const id of rankedItemIds) {
    const row = itemById.get(id);
    if (row) merged.push({ key: `item:${id}`, score: itemScores.get(id) ?? 0 });
  }
  for (const id of rankedNoteIds) {
    const row = noteById.get(id);
    if (row) merged.push({ key: `note:${id}`, score: noteScores.get(id) ?? 0 });
  }
  merged.sort((a, b) => b.score - a.score);

  const hits: SearchHit[] = [];
  for (const { key } of merged.slice(0, take)) {
    const [kind, id] = key.split(":") as ["item" | "note", string];
    if (kind === "item") {
      const it = itemById.get(id);
      if (!it) continue;
      hits.push({
        id: it.id,
        kind: "item",
        title: it.title,
        snippet: extractSnippet(it.title, it.excerpt, it.markdown, query) || snippetAround(`${it.title}\n${it.excerpt}`, query),
        type: it.type,
        sourceUrl: it.sourceUrl,
        via: primaryVia(it.id, "item"),
      });
    } else {
      const n = noteById.get(id);
      if (!n) continue;
      hits.push({
        id: n.id,
        kind: "note",
        title: n.title,
        snippet: extractSnippet(n.title, "", n.markdown, query) || snippetAround(n.title, query),
        type: "note",
        sourceUrl: null,
        via: primaryVia(n.id, "note"),
      });
    }
  }
  return hits;
}
