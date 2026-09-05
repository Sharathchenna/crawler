import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { issueAgentToken, requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const tokens = await getDb().agentToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, client: true, scopes: true, createdAt: true, lastUsedAt: true },
  });
  return NextResponse.json(tokens);
}

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { client?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const token = issueAgentToken();
  const row = await getDb().agentToken.create({
    data: { userId: user.id, token, client: (body.client ?? "agent").slice(0, 40), scopes: "read,write" },
  });
  // Show the token value once on creation only.
  return NextResponse.json({ id: row.id, token, client: row.client }, { status: 201 });
}
