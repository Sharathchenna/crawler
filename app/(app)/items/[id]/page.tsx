import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { renderMarkdownHtml } from "@/lib/markdown-html";
import { ItemReader } from "./reader-client";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await cookies();
  const userId = await verifySession(store.get("hoard_session")?.value);
  if (!userId) redirect("/login");

  const item = await getDb().item.findFirst({
    where: { id, userId },
    include: { tags: { include: { tag: true } } },
  });
  if (!item) notFound();

  const html = await renderMarkdownHtml(item.markdown);

  return (
    <ItemReader
      initialItem={{
        id: item.id,
        type: item.type,
        title: item.title,
        sourceUrl: item.sourceUrl,
        markdown: item.markdown,
        status: item.status,
        tags: item.tags.map((t) => t.tag.name),
        author: item.author,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        extractedAt: item.extractedAt?.toISOString() ?? null,
        extractionError: item.extractionError,
      }}
      initialHtml={html}
    />
  );
}
