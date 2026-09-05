import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

export const SESSION_COOKIE = "hoard_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30d

function secret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 16) throw new Error("AUTH_SECRET must be set (32+ chars recommended)");
  return s;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function signSession(userId: string): string {
  const sig = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function verifySession(value: string | undefined | null): string | null {
  if (!value) return null;
  const idx = value.indexOf(".");
  if (idx <= 0) return null;
  const userId = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = createHmac("sha256", secret()).update(userId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return userId;
}

export function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE}=${signSession(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function issueAgentToken(): string {
  return `hoard_${randomBytes(24).toString("hex")}`;
}

export type AuthedUser = { id: string; email: string; plan: string };

export async function requireUser(req: Request): Promise<AuthedUser | null> {
  // 1. Bearer token (agents / CLI / MCP / iOS)
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const row = await db.agentToken.findUnique({
        where: { token },
        include: { user: true },
      });
      if (row) {
        await db.agentToken.update({
          where: { id: row.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});
        return { id: row.user.id, email: row.user.email, plan: row.user.plan };
      }
      return null;
    }
  }
  // 2. Session cookie (web)
  const cookieHeader = req.headers.get("cookie");
  const raw = getCookie(cookieHeader, SESSION_COOKIE);
  const userId = verifySession(raw);
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return { id: user.id, email: user.email, plan: user.plan };
}

export async function bearerUserFromToken(token: string): Promise<AuthedUser | null> {
  const row = await db.agentToken.findUnique({ where: { token }, include: { user: true } });
  if (!row) return null;
  await db.agentToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: row.user.id, email: row.user.email, plan: row.user.plan };
}
