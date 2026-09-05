import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueAgentToken, verifyPassword } from "@/lib/auth";

// Mobile + headless login: exchange email/password for a bearer token.
export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send your email and password to sign in." }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(body.password ?? "", user.password)) {
    return NextResponse.json({ error: "Wrong email or password. Try again." }, { status: 401 });
  }
  const token = issueAgentToken();
  await db.agentToken.create({ data: { userId: user.id, token, client: "ios", scopes: "read,write" } });
  return NextResponse.json({ token });
}
