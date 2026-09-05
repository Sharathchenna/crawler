import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const VALID_STATUS = new Set(["inbox", "saved", "archived", "done"]);

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const types = (searchParams.get("type") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const items = await getDb().item.findMany({
    where: {
      userId: user.id,
      ...(status && VALID_STATUS.has(status) ? { status } : {}),
      ...(types.length ? { type: { in: types } } : {}),
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(
    items.map((it) => ({ ...it, tags: it.tags.map((t) => t.tag.name) }))
  );
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  let body: { title?: string; markdown?: string; type?: string; sourceUrl?: string; tags?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a title and some Markdown to save it." }, { status: 400 });
  }
  const title = (body.title ?? "").trim().slice(0, 300);
  if (!title) return NextResponse.json({ error: "Give it a title first." }, { status: 400 });
  const item = await getDb().item.create({
    data: {
      userId: user.id,
      title,
      markdown: (body.markdown ?? "").slice(0, 200_000),
      excerpt: (body.markdown ?? "").slice(0, 280),
      type: body.type ?? "note",
      sourceUrl: body.sourceUrl ?? null,
      status: "inbox",
    },
  });
  if (body.tags?.length) {
    for (const name of body.tags.slice(0, 10)) {
      const clean = name.trim().toLowerCase().slice(0, 40);
      if (!clean) continue;
      const tag = await getDb().tag.upsert({
        where: { userId_name: { userId: user.id, name: clean } },
        create: { userId: user.id, name: clean },
        update: {},
      });
      await getDb().itemTag.upsert({
        where: { itemId_tagId: { itemId: item.id, tagId: tag.id } },
        create: { itemId: item.id, tagId: tag.id },
        update: {},
      });
    }
  }
  return NextResponse.json(item, { status: 201 });
}
