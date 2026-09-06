import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8_000_000;
const CACHE_TTL = 60 * 60 * 24 * 7;

/** SSRF guard for image targets: public http(s) hosts only. */
function publicImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.port || !host.includes(".") ||
      /^[\d.]+$/.test(host) || host.includes(":") ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    url.hostname = host;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Edge-cached image proxy for reader content. Article <img> tags point at
 * original hosts that often block hotlinking and collect referrers; routing
 * through here (server-side fetch, no referrer) fixes both, and
 * caches.default makes repeat views free. Auth required so it can't be
 * used as an open proxy. Not a 500 path: bad targets are 4xx/502.
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const target = publicImageUrl(new URL(req.url).searchParams.get("url"));
  if (!target) return NextResponse.json({ error: "Send a public image URL." }, { status: 400 });
  // caches.default exists on Workers; plain Node (next dev) has no Cache
  // API at all, so guard the global itself — not just the property.
  const cache: Cache | undefined =
    typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(new URL(`/api/img?url=${encodeURIComponent(target)}`, req.url).toString());
  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) return cached;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "Hoard/0.1 (+https://hoard.local; image-proxy)", Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach that image." }, { status: 502 });
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !contentType.startsWith("image/")) {
    await upstream.body?.cancel();
    return NextResponse.json({ error: "That URL isn't an image." }, { status: 502 });
  }
  const len = Number(upstream.headers.get("content-length") ?? "0");
  if (len > MAX_BYTES) {
    await upstream.body?.cancel();
    return NextResponse.json({ error: "That image is too large." }, { status: 502 });
  }
  const bytes = await upstream.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large." }, { status: 502 });
  }
  const res = new Response(bytes, {
    headers: {
      "Content-Type": contentType.split(";")[0].trim(),
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
      "Content-Length": String(bytes.byteLength),
    },
  });
  await cache?.put(cacheKey, res.clone());
  return res;
}
