import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const tags = await getDb().tag.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
  return NextResponse.json(tags);
}
