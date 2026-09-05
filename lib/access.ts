// Cloudflare Access as the identity provider.
//
// When Access fronts the app, every approved request carries a
// `Cf-Access-Jwt-Assertion` header: a JWT signed by Cloudflare identifying
// the user (email claim). This module validates it (RS256 against the
// team's certs, audience + expiry checked) and maps it to a local user,
// auto-provisioning on first sight. No passwords anywhere.
//
// Non-browser clients (CLI, iOS, MCP) can't complete the interactive login,
// so they use Access *service tokens* (CF-Access-Client-Id/Secret headers),
// which Access validates at the edge. The app needs no code for those —
// machines additionally send a Hoard bearer token (issued in Settings)
// for identity, which requireUser() checks first.
//
// Env: CF_ACCESS_TEAM_DOMAIN (e.g. xyz.cloudflareaccess.com),
// CF_ACCESS_AUD (the Access application's AUD tag). For local dev with no
// Access in front, DEV_ACCESS_EMAIL impersonates one address — NEVER set it
// in production: anyone could claim any library.

type CertCache = { keys: AccessJwk[]; fetchedAt: number };
let certCache: CertCache | null = null;
const CERT_TTL_MS = 6 * 60 * 60 * 1000;

// JsonWebKey per TS lib lacks kid/n/e here (workerd types narrow it).
type AccessJwk = JsonWebKey & { kid?: string; n?: string; e?: string };

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function teamCerts(teamDomain: string): Promise<AccessJwk[]> {
  const now = Date.now();
  if (certCache && now - certCache.fetchedAt < CERT_TTL_MS) return certCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Access certs fetch failed (${res.status})`);
  const keys = ((await res.json()) as { keys?: AccessJwk[] }).keys ?? [];
  certCache = { keys, fetchedAt: now };
  return keys;
}

export type AccessIdentity = { email: string };

export async function verifyAccessJWT(headers: Headers): Promise<AccessIdentity | null> {
  try {
    const team = (process.env.CF_ACCESS_TEAM_DOMAIN ?? "").trim();
    const aud = (process.env.CF_ACCESS_AUD ?? "").trim();
    const token = headers.get("cf-access-jwt-assertion");
    if (!team || !aud || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))) as {
      kid?: string;
      alg?: string;
    };
    if (header.alg !== "RS256" || !header.kid) return null;
    const jwk = (await teamCerts(team)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(parts[2]), data);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as {
      email?: string;
      aud?: string | string[];
      exp?: number;
      iss?: string;
    };
    if (!payload.email) return null;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return null;
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp + 30) return null;
    return { email: payload.email.toLowerCase() };
  } catch {
    return null;
  }
}

/** Local-dev impersonation. Production must leave DEV_ACCESS_EMAIL unset. */
export function devAccessEmail(): string | null {
  const e = (process.env.DEV_ACCESS_EMAIL ?? "").trim().toLowerCase();
  return e || null;
}
