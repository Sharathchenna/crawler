// qmd-style hybrid search core, ported for Cloudflare Workers.
//
// Upstream: https://github.com/tobi/qmd (MIT) — on-device hybrid search over
// Markdown (BM25 FTS5 + vector + RRF fusion + top-rank bonus + snippet
// extraction). qmd itself cannot run on Workers: it needs better-sqlite3,
// sqlite-vec, node-llama-cpp GGUF models, and a local filesystem. This module
// ports only the Workers-safe ideas (pure TS, no native deps) onto Hoard's
// existing stack:
//
//   - BM25: D1 FTS5 tables (db/migrations/0003_qmd_fts.sql), porter unicode61.
//   - Vector: existing Workers AI + Vectorize layer (lib/embeddings.ts).
//   - Fusion: Reciprocal Rank Fusion (k=60) with qmd's top-rank bonus.
//   - Snippets: best-window extraction around query terms.
//
// The `hoard export` CLI already writes front-matter .md files, so a local
// qmd sidecar can index the same library:
//   hoard export ./hoard-export
//   qmd collection add ./hoard-export --name hoard && qmd embed
// See README "qmd interop".

export const RRF_K = 60;
export const TOP_RANK_BONUS_FIRST = 0.05;
export const TOP_RANK_BONUS_TOP3 = 0.02;

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Space out CJK runs so FTS5's unicode61 tokenizer can match them. Matches qmd. */
export function normalizeCjkForFts(text: string): string {
  return (text ?? "").replace(CJK_RUN, (run) => ` ${Array.from(run).join(" ")} `);
}

export function tokenizeQuery(q: string, maxTerms = 8): string[] {
  return (q ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af_+.@#-]+/iu)
    .map((t) => t.trim().replace(/^[.+@#-]+|[.+@#-]+$/g, ""))
    .filter((t) => t.length >= 2 || CJK_CHAR.test(t))
    .slice(0, maxTerms);
}

function sanitizeTerm(term: string): string {
  // FTS5 specials must go; dotted tokens (1.0.21) split into phrase parts.
  if (term.includes(".")) {
    const parts = term
      .split(".")
      .map((p) => p.replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af_+-]+/giu, ""))
      .filter(Boolean);
    if (parts.length > 1) return parts.map((p) => `"${p}"`).join(" ");
    term = parts[0] ?? "";
  }
  return term.replace(/["*:()^]/g, "");
}

/**
 * Build a recall-oriented FTS5 MATCH string: OR of terms, prefix match on the
 * last term for as-you-type. Returns null when nothing searchable remains.
 */
export function buildFtsQuery(query: string): string | null {
  const terms = tokenizeQuery(query);
  if (!terms.length) return null;
  const clauses: string[] = [];
  terms.forEach((raw, i) => {
    const clean = sanitizeTerm(raw);
    if (!clean) return;
    if (clean.includes(" ")) {
      clauses.push(`(${clean})`);
      return;
    }
    const isLast = i === terms.length - 1;
    const prefix = isLast && clean.length >= 3 && !CJK_CHAR.test(clean) ? "*" : "";
    clauses.push(`"${clean}"${prefix}`);
  });
  if (!clauses.length) return null;
  return normalizeCjkForFts(clauses.join(" OR "));
}

export type RankedList = { ids: string[]; weight?: number };

/**
 * Reciprocal Rank Fusion with qmd's top-rank bonus.
 * Each list is ordered best-first. Original-query lists should pass weight 2.
 */
export function rrfFuse(lists: RankedList[], k = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const { ids, weight = 1 } of lists) {
    ids.forEach((id, rank) => {
      if (!id) return;
      let bonus = 0;
      if (rank === 0) bonus = TOP_RANK_BONUS_FIRST;
      else if (rank <= 2) bonus = TOP_RANK_BONUS_TOP3;
      const contrib = weight * (1 / (k + rank + 1) + bonus);
      scores.set(id, (scores.get(id) ?? 0) + contrib);
    });
  }
  return scores;
}

export function rankByFusion(scores: Map<string, number>): string[] {
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function snippetWindow(text: string, queryTerms: string[], radius = 90): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (!queryTerms.length) return clean.slice(0, 180);
  const lower = clean.toLowerCase();
  // Score candidate windows by term-hit count, then earliest position.
  let best = { hits: -1, idx: 0 };
  const step = 20;
  for (let i = 0; i < lower.length; i += step) {
    const window = lower.slice(i, i + radius * 2);
    let hits = 0;
    for (const t of queryTerms) {
      if (t && window.includes(t.toLowerCase())) hits++;
    }
    if (hits > best.hits) {
      best = { hits, idx: i };
      if (hits === queryTerms.length) break;
    }
  }
  const start = Math.max(0, best.idx - radius);
  const end = Math.min(clean.length, best.idx + radius * 2);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

/** qmd-style snippet: best window over title + excerpt + body. */
export function extractSnippet(title: string, excerpt: string, body: string, query: string): string {
  const terms = tokenizeQuery(query, 8);
  const text = `${title ?? ""}\n${excerpt ?? ""}\n${body ?? ""}`;
  const snippet = snippetWindow(text, terms);
  return snippet || (excerpt ?? "").slice(0, 180) || (title ?? "").slice(0, 180);
}

// --- D1 FTS5 access (raw binding; triggers keep the index in sync) ---

export type FtsHit = { id: string; rank: number };

type D1Binding = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => { all: () => Promise<{ results?: unknown[] }> };
  };
};

/**
 * BM25-ordered ids for one FTS table. Throws when the table is missing so
 * callers can fall back to LIKE — old DBs without migration 0003 keep working.
 */
export async function ftsSearch(
  db: D1Binding,
  table: "items_fts" | "notes_fts",
  userId: string,
  matchQuery: string,
  limit = 30
): Promise<FtsHit[]> {
  const stmt = db
    .prepare(
      `SELECT id, bm25("${table}", 2.0, 1.0) AS rank FROM "${table}" WHERE "${table}" MATCH ? AND userId = ? ORDER BY rank LIMIT ?`
    )
    .bind(matchQuery, userId, Math.min(Math.max(limit, 1), 50));
  const { results } = await stmt.all();
  const rows = (results ?? []) as { id?: unknown; rank?: unknown }[];
  return rows
    .map((r) => ({ id: String(r?.id ?? ""), rank: Number(r?.rank ?? 0) }))
    .filter((r) => r.id);
}
