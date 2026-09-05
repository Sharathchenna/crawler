import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { extractUrl } from "@/lib/extract";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first — your library is private to you." }, { status: 401 });
  let body: { url?: string; text?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a URL to save it." }, { status: 400 });
  }

  // Raw-text capture (Share Extension text / CLI)
  if (!body.url && body.text) {
    const title = (body.title ?? body.text.slice(0, 80)).slice(0, 300) || "Untitled";
    const item = await db.item.create({
      data: {
        userId: user.id,
        type: "note",
        title,
        markdown: `# ${title}\n\n${body.text.slice(0, 100_000)}`,
        excerpt: body.text.slice(0, 280),
        status: "inbox",
      },
    });
    return NextResponse.json(item, { status: 201 });
  }

  const url = (body.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Paste a full URL starting with http(s) and we'll save it." }, { status: 400 });
  }

  try {
    const ex = await extractUrl(url);
    const item = await db.item.create({
      data: {
        userId: user.id,
        type: ex.type,
        title: ex.title,
        sourceUrl: url,
        markdown: ex.markdown,
        excerpt: ex.excerpt,
        status: "inbox",
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    // Fail gracefully: never 500 on a bad page — save a bookmark instead.
    const message = e instanceof Error ? e.message : "Couldn't read that page.";
    let domain = url;
    try {
      domain = new URL(url).hostname;
    } catch {}
    const item = await db.item.create({
      data: {
        userId: user.id,
        type: "page",
        title: domain,
        sourceUrl: url,
        markdown: `# ${domain}\n\n[Original](${url})\n\n_${message}_`,
        excerpt: message,
        status: "inbox",
      },
    });
    return NextResponse.json({ ...item, captureWarning: message }, { status: 201 });
  }
}
