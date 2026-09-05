// Auth: Cloudflare Access is the identity provider — there are no
// passwords in Hoard. Web users arrive with a validated Access JWT
// (auto-provisioned below); machines send a Hoard bearer token issued in
// Settings (plus Access service-token headers, which the edge checks).
// Session cookies are gone; signing out happens at /cdn-cgi/access/logout.
import { getDb } from "./db";
import { verifyAccessJWT, devAccessEmail } from "./access";

export function issueAgentToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `hoard_${[...bytes].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export type AuthedUser = { id: string; email: string; plan: string };

async function provisionByEmail(email: string): Promise<AuthedUser | null> {
  const db = getDb();
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  let user = await db.user.findUnique({ where: { email: clean } });
  if (!user) {
    try {
      user = await db.user.create({
        data: { email: clean, password: "managed-by-access", plan: "starter" },
      });
    } catch {
      user = await db.user.findUnique({ where: { email: clean } });
    }
  }
  if (!user) return null;
  return { id: user.id, email: user.email, plan: user.plan };
}

async function touchToken(tokenId: string): Promise<void> {
  await getDb()
    .agentToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}

/** Resolve the caller from headers: Hoard bearer → Access JWT → dev email. */
export async function userFromHeaders(headers: Headers): Promise<AuthedUser | null> {
  const db = getDb();
  // 1. Bearer token (agents / CLI / MCP / iOS — issued in Settings).
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const row = await db.agentToken.findUnique({
        where: { token },
        include: { user: true },
      });
      if (row) {
        await touchToken(row.id);
        return { id: row.user.id, email: row.user.email, plan: row.user.plan };
      }
      return null;
    }
  }
  // 2. Cloudflare Access identity (browser users).
  const identity = await verifyAccessJWT(headers);
  if (identity) return provisionByEmail(identity.email);
  // 3. Local dev impersonation (never set in production).
  const dev = devAccessEmail();
  if (dev) return provisionByEmail(dev);
  return null;
}

export async function requireUser(req: Request): Promise<AuthedUser | null> {
  return userFromHeaders(req.headers);
}

export async function bearerUserFromToken(token: string): Promise<AuthedUser | null> {
  const db = getDb();
  const row = await db.agentToken.findUnique({ where: { token }, include: { user: true } });
  if (!row) return null;
  await touchToken(row.id);
  return { id: row.user.id, email: row.user.email, plan: row.user.plan };
}
