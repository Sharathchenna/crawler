import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const VALID_STATUS = new Set(["inbox", "saved", "archived", "done"]);

async function owned(userId: string, id: string) {
  return getDb().item.findFirst({ where: { id, userId }, include: { tags: { include: { tag: true } } } });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const item = await owned(user.id, id);
  if (!item) return NextResponse.json({ error: "Couldn't find that item. It may be archived or deleted." }, { status: 404 });
  return NextResponse.json({ ...item, tags: item.tags.map((t) => t.tag.name) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await owned(user.id, id);
  if (!existing) return NextResponse.json({ error: "Couldn't find that item. It may be archived or deleted." }, { status: 404 });
  let body: { title?: string; markdown?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the change you'd like to make." }, { status: 400 });
  }
  if (body.status && !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ error: "Unknown status. Use inbox, saved, archived, or done." }, { status: 400 });
  }
  const updated = await getDb().item.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title.slice(0, 300) } : {}),
      ...(body.markdown !== undefined ? { markdown: body.markdown.slice(0, 200_000), excerpt: body.markdown.slice(0, 280) } : {}),
      ...(body.status ? { status: body.status } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await owned(user.id, id);
  if (!existing) return NextResponse.json({ error: "Couldn't find that item. It may already be deleted." }, { status: 404 });
  await getDb().item.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
