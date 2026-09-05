import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword, sessionCookie } from "@/lib/auth";

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send an email and password to get started." }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!isEmail(email)) return NextResponse.json({ error: "That email doesn't look right. Check it and try again." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  const existing = await getDb().user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "That email is already registered. Sign in instead." }, { status: 409 });
  const user = await getDb().user.create({ data: { email, password: await hashPassword(password), plan: "starter" } });
  const res = NextResponse.json({ id: user.id, email: user.email });
  res.headers.set("Set-Cookie", await sessionCookie(user.id));
  return res;
}
