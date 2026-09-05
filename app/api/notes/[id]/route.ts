import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

async function owned(userId: string, id: string) {
  return db.note.findFirst({
    where: { id, userId },
    include: { revisions: { orderBy: { version: "asc" } }, sources: { include: { item: true } } },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your notes are private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const note = await owned(user.id, id);
  if (!note) return NextResponse.json({ error: "Couldn't find that note." }, { status: 404 });
  return NextResponse.json(note);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your notes are private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const note = await owned(user.id, id);
  if (!note) return NextResponse.json({ error: "Couldn't find that note." }, { status: 404 });
  let body: { title?: string; markdown?: string; project?: string; kind?: string; summary?: string; author?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the change you'd like to make." }, { status: 400 });
  }
  const nextVersion = (note.revisions.at(-1)?.version ?? 0) + 1;
  const markdown = (body.markdown ?? note.markdown).slice(0, 200_000);
  // Every PATCH writes a new NoteRevision, version auto-incremented.
  const updated = await db.$transaction(async (tx) => {
    await tx.noteRevision.create({
      data: {
        noteId: id,
        version: nextVersion,
        author: (body.author ?? "You").slice(0, 80),
        summary: (body.summary ?? "Edited").slice(0, 200),
        markdown,
      },
    });
    return tx.note.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.slice(0, 300) } : {}),
        markdown,
        ...(body.project !== undefined ? { project: body.project.slice(0, 80) } : {}),
        ...(body.kind !== undefined ? { kind: body.kind.slice(0, 40) } : {}),
      },
      include: { revisions: { orderBy: { version: "asc" } }, sources: { include: { item: true } } },
    });
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your notes are private to you." }, { status: 401 });
  const { id } = await ctx.params;
  const note = await owned(user.id, id);
  if (!note) return NextResponse.json({ error: "Couldn't find that note." }, { status: 404 });
  await db.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
