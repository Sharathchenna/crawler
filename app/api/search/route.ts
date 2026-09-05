import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { searchAll } from "@/lib/search";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json([]);
  const hits = await searchAll(user.id, q, 20);
  return NextResponse.json(hits);
}
