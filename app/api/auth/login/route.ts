import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionCookie, verifyPassword } from "@/lib/auth";

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
  const res = NextResponse.json({ id: user.id, email: user.email });
  res.headers.set("Set-Cookie", sessionCookie(user.id));
  return res;
}
