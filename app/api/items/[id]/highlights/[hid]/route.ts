import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; hid: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id, hid } = await ctx.params;
  const row = await getDb().highlight.findFirst({ where: { id: hid, itemId: id, item: { userId: user.id } } });
  if (!row) return NextResponse.json({ error: "Couldn't find that highlight." }, { status: 404 });
  await getDb().highlight.delete({ where: { id: hid } });
  return NextResponse.json({ ok: true });
}
