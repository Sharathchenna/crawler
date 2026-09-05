import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { indexDocs, isSemanticConfigured } from "@/lib/embeddings";

// POST /api/reindex — (re)build this user's semantic index: embed every
// item + note and upsert into Vectorize. Idempotent; bounded at 200 each,
// embedded and upserted in batches. Without credentials it reports
// semantic: false and does nothing.
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!isSemanticConfigured()) {
    return NextResponse.json({
      indexed: 0,
      total: 0,
      semantic: false,
      message:
        "Semantic search isn't configured (needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN and a hoard-embeddings index). Keyword and fuzzy search still work.",
    });
  }
  const [items, notes] = await Promise.all([
    getDb().item.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, excerpt: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getDb().note.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, markdown: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);
  const docs = [
    ...items.map((it) => ({
      id: it.id,
      title: it.title,
      excerpt: it.excerpt,
      userId: user.id,
      kind: "item" as const,
      type: it.type,
    })),
    ...notes.map((n) => ({
      id: n.id,
      title: n.title,
      excerpt: n.markdown.slice(0, 280),
      userId: user.id,
      kind: "note" as const,
      type: "note",
    })),
  ];
  const indexed = await indexDocs(docs);
  return NextResponse.json({
    indexed,
    total: docs.length,
    semantic: indexed > 0,
    message:
      indexed > 0
        ? `Indexed ${indexed} of ${docs.length} documents for semantic search.`
        : "Indexing failed — check the Vectorize index exists and the token has Vectorize + Workers AI permissions.",
  });
}
