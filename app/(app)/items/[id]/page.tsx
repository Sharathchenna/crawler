"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { domainOf } from "@/components/Shell";

type Item = {
  id: string;
  type: string;
  title: string;
  sourceUrl?: string | null;
  markdown: string;
  status: string;
  tags: string[];
};

function renderMarkdown(md: string) {
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/^### (.*)$/gm, "<h3 class='mt-4 text-[16px] font-semibold tracking-[-0.02em]'>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2 class='mt-5 text-[20px] font-semibold tracking-[-0.02em]'>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1 class='mt-2 text-[24px] font-semibold tracking-[-0.02em]'>$1</h1>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a class='underline' target='_blank' href='$2'>$1</a>")
    .replace(/`([^`]+)`/g, "<code class='rounded-[6px] bg-[var(--bg-hover)] px-1 font-mono text-[13px]'>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.*)$/gm, "<li class='ml-5 list-disc'>$1</li>")
    .replace(/\n\n/g, "<br/><br/>");
}

export default function ItemReaderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/items/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) setError(d.error ?? "Couldn't find that item.");
        else setItem(d);
      })
      .catch(() => setError("Couldn't reach the server."));
  }, [id]);

  async function setStatus(status: string) {
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.push("/library");
  }

  if (error) return <p role="alert" className="text-[13px] text-[var(--red)]">{error}</p>;
  if (!item) return <p className="font-mono text-[12px] text-[var(--text-faint)]">Loading…</p>;

  return (
    <article>
      <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
        {item.type} {item.sourceUrl && `· ${domainOf(item.sourceUrl)}`}
      </p>
      <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[var(--text)]">{item.title}</h1>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
          >
            Open source ↗
          </a>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(item.markdown).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
        >
          {copied ? "Copied" : "Copy Markdown"}
        </button>
        <button onClick={() => setStatus("archived")} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)]">Archive</button>
        <button onClick={() => setStatus("done")} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)]">Done</button>
      </div>
      {item.tags.length > 0 && (
        <p className="mt-3 font-mono text-[11px] text-[var(--text-faint)]">tagged: {item.tags.join(", ")}</p>
      )}
      <div
        className="reader-body mt-6 max-w-none text-[14px] leading-7 text-[var(--text-body)]"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(item.markdown) }}
      />
      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--green)]">
        {copied ? "Markdown copied." : ""}
      </div>
    </article>
  );
}
