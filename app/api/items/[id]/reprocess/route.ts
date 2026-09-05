import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { extractUrl } from "@/lib/extract";
import { renderMarkdownHtml } from "@/lib/markdown-html";

export const runtime = "nodejs";

// POST /api/items/[id]/reprocess — refetch the source URL and refresh the
// stored Markdown document in place. Never 500s: failures record
// extractionError on the item and return the existing document so the reader
// can fall back to the original webpage.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const item = await getDb().item.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: "Couldn't find that item. It may be archived or deleted." }, { status: 404 });
  if (!item.sourceUrl) {
    return NextResponse.json({ error: "Only saved links can be reprocessed — this one has no source URL." }, { status: 400 });
  }

  try {
    const ex = await extractUrl(item.sourceUrl);
    const updated = await getDb().item.update({
      where: { id },
      data: {
        type: ex.type,
        title: ex.title,
        markdown: ex.markdown,
        excerpt: ex.excerpt,
        author: ex.author ?? null,
        publishedAt: ex.publishedAt ? new Date(ex.publishedAt) : null,
        extractedAt: new Date(ex.extractedAt),
        extractionError: null,
      },
    });
    // Freshly rendered so the reader can swap HTML without refetching.
    const html = await renderMarkdownHtml(updated.markdown);
    return NextResponse.json({ ...updated, reprocessed: true, html });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't read that page.";
    const updated = await getDb().item.update({
      where: { id },
      data: { extractionError: message },
    });
    return NextResponse.json({ ...updated, reprocessed: false, captureWarning: message });
  }
}
