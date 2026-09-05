// Semantic search layer: Workers AI embeddings + Vectorize, both over
// plain HTTPS (same pattern as lib/cloudflare.ts).
//
// Deliberately NOT via Worker bindings: declaring vectorize/ai bindings
// forces wrangler into remote mode and breaks local dev with no local
// emulator. REST works identically from Node, workerd, preview, and prod —
// and degrades to keyword search whenever creds or the index are missing.
//
// Setup (one time, on the account):
//   wrangler vectorize create hoard-embeddings --dimensions=384 --metric=cosine
// Token needs Workers AI (run) + Vectorize (read + write) permissions.

const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";
const INDEX_ENV = "VECTORIZE_INDEX_NAME";
const DEFAULT_INDEX = "hoard-embeddings";

type CfConfig = { accountId: string; token: string; index: string };

function config(): CfConfig | null {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (!accountId || !token) return null;
  const index = (process.env[INDEX_ENV] ?? "").trim() || DEFAULT_INDEX;
  return { accountId, token, index };
}

export function isSemanticConfigured(): boolean {
  return config() !== null;
}

function api(path: string, cfg: CfConfig, init: RequestInit, timeoutMs: number) {
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export function embeddingText(title: string, excerpt: string): string {
  return `${title ?? ""}\n${excerpt ?? ""}`.slice(0, 1500);
}

async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  const cfg = config();
  const empty = texts.map(() => null);
  if (!cfg || !texts.length) return empty;
  try {
    const res = await api(
      `/ai/run/${EMBED_MODEL}`,
      cfg,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: texts }),
      },
      60_000
    );
    if (!res.ok) return embedSingles(cfg, texts);
    const json = (await res.json()) as { result?: { data?: unknown } };
    const rows = json?.result?.data;
    if (!Array.isArray(rows)) return embedSingles(cfg, texts);
    return rows.map((r) => (Array.isArray(r) && r.every((v) => typeof v === "number") ? (r as number[]) : null));
  } catch {
    return empty;
  }
}

async function embedSingles(cfg: CfConfig, texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = [];
  for (const text of texts) {
    try {
      const res = await api(
        `/ai/run/${EMBED_MODEL}`,
        cfg,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
        30_000
      );
      if (!res.ok) {
        out.push(null);
        continue;
      }
      const json = (await res.json()) as { result?: { data?: unknown } };
      const data = json?.result?.data;
      const row = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : data;
      out.push(
        Array.isArray(row) && (row as unknown[]).every((v) => typeof v === "number") ? (row as number[]) : null
      );
    } catch {
      out.push(null);
    }
  }
  return out;
}

export async function embedText(text: string): Promise<number[] | null> {
  const rows = await embedMany([text]);
  return rows[0] ?? null;
}

type DocMeta = { id: string; title: string; excerpt: string; userId: string; kind: "item" | "note"; type: string };

function ndjson(docs: DocMeta[], vectors: (number[] | null)[]): string {
  const lines: string[] = [];
  docs.forEach((d, i) => {
    const values = vectors[i];
    if (!values) return;
    lines.push(
      JSON.stringify({
        id: d.id,
        values,
        metadata: { userId: d.userId, kind: d.kind, type: d.type },
      })
    );
  });
  return lines.join("\n");
}

async function upsertNdjson(ndjsonBody: string): Promise<boolean> {
  const cfg = config();
  if (!cfg || !ndjsonBody) return false;
  try {
    const form = new FormData();
    form.append("body", new Blob([ndjsonBody], { type: "application/x-ndjson" }), "vectors.ndjson");
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/vectorize/v2/indexes/${cfg.index}/upsert`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json?.success !== false;
  } catch {
    return false;
  }
}

export async function indexDocs(docs: DocMeta[]): Promise<number> {
  if (!config() || !docs.length) return 0;
  let indexed = 0;
  // Bounded batches: keep each invocation well under subrequest limits.
  for (let i = 0; i < docs.length; i += 25) {
    const batch = docs.slice(i, i + 25);
    const vectors = await embedMany(batch.map((d) => embeddingText(d.title, d.excerpt)));
    if (await upsertNdjson(ndjson(batch, vectors))) {
      indexed += vectors.filter(Boolean).length;
    }
  }
  return indexed;
}

export async function indexDoc(doc: DocMeta): Promise<boolean> {
  return (await indexDocs([doc])) === 1;
}

export async function unindexDoc(id: string): Promise<void> {
  const cfg = config();
  if (!cfg || !id) return;
  try {
    await api(
      `/vectorize/v2/indexes/${cfg.index}/delete_by_ids`,
      cfg,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      },
      30_000
    );
  } catch {
    // Stale vectors are filtered at read time anyway.
  }
}

/** Nearest-neighbour ids for this user (ordered by similarity). */
export async function semanticIds(q: string, userId: string, topK = 30): Promise<string[]> {
  const cfg = config();
  const query = (q ?? "").trim();
  if (!cfg || !userId || !query) return [];
  try {
    const values = await embedText(query);
    if (!values) return [];
    const res = await api(
      `/vectorize/v2/indexes/${cfg.index}/query`,
      cfg,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vector: values,
          topK: Math.min(Math.max(topK, 1), 50),
          filter: { userId: { $eq: userId } },
          returnValues: false,
          returnMetadata: "none",
        }),
      },
      30_000
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { result?: { matches?: { id?: unknown }[] } };
    return ((json?.result?.matches ?? []) as { id?: unknown }[])
      .map((m) => String(m?.id ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}
