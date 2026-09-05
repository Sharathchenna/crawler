import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your notes are private to you." }, { status: 401 });
  const notes = await getDb().note.findMany({
    where: { userId: user.id },
    include: { _count: { select: { revisions: true, sources: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json(notes);
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your notes are private to you." }, { status: 401 });
  let body: { title?: string; markdown?: string; project?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a title to start the note." }, { status: 400 });
  }
  const title = (body.title ?? "Untitled").trim().slice(0, 300) || "Untitled";
  const markdown = (body.markdown ?? "").slice(0, 200_000);
  const note = await getDb().note.create({
    data: {
      userId: user.id,
      title,
      markdown,
      project: (body.project ?? "").slice(0, 80),
      kind: (body.kind ?? "note").slice(0, 40),
      revisions: { create: [{ version: 1, author: "You", summary: "Created", markdown }] },
    },
    include: { revisions: true },
  });
  return NextResponse.json(note, { status: 201 });
}
