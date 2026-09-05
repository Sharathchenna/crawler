import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { extractUrl } from "@/lib/extract";
import { parseArxivId } from "@/lib/arxiv";
import { indexDoc } from "@/lib/embeddings";

export const runtime = "nodejs";

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function attachTags(userId: string, itemId: string, tags: string[] | undefined) {
  const names = [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  if (!names.length) return;
  for (const name of names) {
    const tag = await getDb().tag.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name },
      update: {},
    });
    await getDb().itemTag.upsert({
      where: { itemId_tagId: { itemId, tagId: tag.id } },
      create: { itemId, tagId: tag.id },
      update: {},
    });
  }
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  let body: { url?: string; text?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a URL to save it." }, { status: 400 });
  }

  // Raw-text capture (Share Extension text / CLI)
  if (!body.url && body.text) {
    const title = (body.title ?? body.text.slice(0, 80)).slice(0, 300) || "Untitled";
    const item = await getDb().item.create({
      data: {
        userId: user.id,
        type: "note",
        title,
        markdown: `# ${title}\n\n${body.text.slice(0, 100_000)}`,
        excerpt: body.text.slice(0, 280),
        status: "inbox",
      },
    });
    return NextResponse.json(item, { status: 201 });
  }

  const url = (body.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Paste a full URL starting with http(s) and we'll save it." }, { status: 400 });
  }

  // The source URL is the canonical identifier: re-saving refreshes the
  // existing document instead of creating a duplicate.
  const existing = await getDb().item.findFirst({ where: { userId: user.id, sourceUrl: url } });

  try {
    const ex = await extractUrl(url);
    const data = {
      type: ex.type,
      title: ex.title,
      markdown: ex.markdown,
      excerpt: ex.excerpt,
      author: ex.author ?? null,
      publishedAt: toDate(ex.publishedAt),
      extractedAt: toDate(ex.extractedAt) ?? new Date(),
      extractionError: null,
    };
    if (existing) {
      const item = await getDb().item.update({ where: { id: existing.id }, data });
      await attachTags(user.id, item.id, ex.tags);
      await indexDoc({
        id: item.id, title: item.title, excerpt: item.excerpt,
        userId: user.id, kind: "item", type: item.type,
      });
      return NextResponse.json({ ...item, reprocessed: true });
    }
    const item = await getDb().item.create({ data: { ...data, userId: user.id, sourceUrl: url, status: "inbox" } });
    await attachTags(user.id, item.id, ex.tags);
    await indexDoc({
      id: item.id, title: item.title, excerpt: item.excerpt,
      userId: user.id, kind: "item", type: item.type,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    // Fail gracefully: never 500 on a bad page.
    // A fresh URL becomes a bookmark; an existing document keeps its content
    // and just records the error so the reader can fall back to the original.
    const message = e instanceof Error ? e.message : "Couldn't read that page.";
    console.error("[capture] extraction failed:", e);
    if (existing) {
      const item = await getDb().item.update({
        where: { id: existing.id },
        data: { extractionError: message },
      });
      return NextResponse.json({ ...item, reprocessed: true, captureWarning: message });
    }
    let domain = url;
    try {
      domain = new URL(url).hostname;
    } catch {}
    // Failed arXiv saves keep the paper type so papers stay filterable.
    const failedType = parseArxivId(url) ? "pdf" : "page";
    const item = await getDb().item.create({
      data: {
        userId: user.id,
        type: failedType,
        title: domain,
        sourceUrl: url,
        markdown: `# ${domain}\n\n[Original](${url})\n\n_${message}_`,
        excerpt: message,
        status: "inbox",
        extractedAt: new Date(),
        extractionError: message,
      },
    });
    return NextResponse.json({ ...item, captureWarning: message }, { status: 201 });
  }
}
