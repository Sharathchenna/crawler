import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedItem(userId: string, id: string) {
  return getDb().item.findFirst({ where: { id, userId } });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!await ownedItem(user.id, id)) return NextResponse.json({ error: "Couldn't find that item." }, { status: 404 });
  const rows = await getDb().highlight.findMany({ where: { itemId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!await ownedItem(user.id, id)) return NextResponse.json({ error: "Couldn't find that item." }, { status: 404 });
  let body: { quote?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the quote to save." }, { status: 400 });
  }
  const quote = (body.quote ?? "").trim().slice(0, 2000);
  if (!quote) return NextResponse.json({ error: "Select some text first." }, { status: 400 });
  const row = await getDb().highlight.create({
    data: { itemId: id, quote, note: (body.note ?? "").trim().slice(0, 500) },
  });
  return NextResponse.json(row, { status: 201 });
}
