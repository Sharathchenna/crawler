// Auth: WebCrypto-only (SubtleCrypto + getRandomValues) so it runs
// identically on Node.js and Cloudflare Workers (no node:crypto, no Buffer).
// Passwords: PBKDF2-HMAC-SHA256, 210k iterations, 16-byte salt.
// Sessions: HMAC-SHA256 signed httpOnly cookie (`userId.signature`).
import { getDb } from "./db";

export const SESSION_COOKIE = "hoard_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30d
const PBKDF2_ITERATIONS = 210_000;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 16) throw new Error("AUTH_SECRET must be set (32+ chars recommended)");
  return s;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function unhex(s: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(s.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return hex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2(password, salt);
  return `$pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Current format only ($pbkdf2$...). Legacy scrypt hashes (salt:hash)
  // cannot verify on Workers (no scrypt) — reset those passwords.
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[1] !== "pbkdf2") return false;
  const iterations = Number(parts[2]);
  const salt = parts[3];
  if (!Number.isFinite(iterations) || !salt) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations },
    key,
    256
  );
  return timingSafeEqualHex(hex(bits), parts[4]);
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return hex(sig);
}

export async function signSession(userId: string): Promise<string> {
  return `${userId}.${await hmacHex(userId)}`;
}

export async function verifySession(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const idx = value.indexOf(".");
  if (idx <= 0) return null;
  const userId = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = await hmacHex(userId);
  if (!timingSafeEqualHex(sig, expected)) return null;
  return userId;
}

export async function sessionCookie(userId: string): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
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
  return `hoard_${hex(crypto.getRandomValues(new Uint8Array(24)))}`;
}

export type AuthedUser = { id: string; email: string; plan: string };

export async function requireUser(req: Request): Promise<AuthedUser | null> {
  const db = getDb();
  // 1. Bearer token (agents / CLI / MCP / iOS)
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const row = await getDb().agentToken.findUnique({
        where: { token },
        include: { user: true },
      });
      if (row) {
        await getDb().agentToken.update({
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
  const userId = await verifySession(raw);
  if (!userId) return null;
  const user = await getDb().user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return { id: user.id, email: user.email, plan: user.plan };
}

export async function bearerUserFromToken(token: string): Promise<AuthedUser | null> {
  const db = getDb();
  const row = await getDb().agentToken.findUnique({ where: { token }, include: { user: true } });
  if (!row) return null;
  await getDb().agentToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: row.user.id, email: row.user.email, plan: row.user.plan };
}
