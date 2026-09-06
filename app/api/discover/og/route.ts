import { NextResponse } from "next/server";
import { DOMParser } from "linkedom";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { boundedText, publicBlogUrl } from "@/lib/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, max-age=86400" },
});

/** Resolve a possibly-relative image reference against the article URL. */
function resolveImage(ref: string, pageUrl: string): string | null {
  const value = ref.trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    return publicBlogUrl(new URL(value, pageUrl).toString());
  } catch {
    return null;
  }
}

/**
 * Lazy lead-image resolver for Discover cards. Cards created before the
 * imageUrl column (or Tinyfish runs that omit it) fetch through here once;
 * a found image is persisted onto the user's matching article so later
 * loads come straight from the digest view with no extra subrequest.
 * Never 500s on a bad page — returns { imageUrl: null } instead.
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return json({ error: "Sign in to discover articles." }, 401);
  const pageUrl = publicBlogUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!pageUrl) return json({ error: "Send a public article URL." }, 400);
  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Hoard-Discovery/1.0 (personal RSS reader)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return json({ imageUrl: null });
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      await response.body?.cancel();
      return json({ imageUrl: null });
    }
    const html = await boundedText(response, 1_500_000);
    const doc = new DOMParser().parseFromString(html, "text/html") as unknown as Document;
    const meta = (selector: string, attr: string): string | null => {
      const el = doc.querySelector(selector) as unknown as {
        getAttribute?: (n: string) => string | null;
        content?: string;
      } | null;
      const value = el?.getAttribute?.(attr) ?? (attr === "content" ? el?.content : undefined);
      return typeof value === "string" && value.trim() ? value : null;
    };
    const candidates = [
      meta('meta[property="og:image:secure_url"]', "content"),
      meta('meta[property="og:image"]', "content"),
      meta('meta[name="twitter:image:src"]', "content"),
      meta('meta[name="twitter:image"]', "content"),
      meta('meta[property="twitter:image"]', "content"),
      meta('link[rel="image_src"]', "href"),
    ];
    let imageUrl: string | null = null;
    for (const ref of candidates) {
      if (!ref) continue;
      imageUrl = resolveImage(ref, pageUrl);
      if (imageUrl) break;
    }
    if (imageUrl) {
      // Best-effort backfill so the next digest view already carries it.
      try {
        await getDb().discoveryArticle.updateMany({
          where: { url: pageUrl, digest: { userId: user.id }, imageUrl: "" },
          data: { imageUrl },
        });
      } catch {
        // Read path stays available even if the backfill fails.
      }
    }
    return json({ imageUrl });
  } catch {
    return json({ imageUrl: null });
  }
}
