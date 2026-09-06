"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { domainOf } from "@/components/Shell";
import { DeleteButton } from "@/components/DeleteButton";
import { apiJson } from "@/components/api";
import { markdownHeadings, uniqueSlugs } from "@/lib/slug";

export type ReaderItem = {
  id: string;
  type: string;
  title: string;
  sourceUrl?: string | null;
  markdown: string;
  status: string;
  tags: string[];
  author?: string | null;
  publishedAt?: string | null;
  extractedAt?: string | null;
  extractionError?: string | null;
};

type Highlight = { id: string; quote: string; note: string; createdAt: string };
type Related = { id: string; kind: string; title: string; snippet: string; via?: string };

const FONT_SIZES = {
  s: { label: "S", size: 13, leading: 1.7 },
  m: { label: "M", size: 14, leading: 1.75 },
  l: { label: "L", size: 16, leading: 1.8 },
} as const;
type FontKey = keyof typeof FONT_SIZES;

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function readingMinutes(md: string): number {
  const words = (md || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const posKey = (id: string) => `hoard:pos:${id}`;

export function ItemReader({ initialItem, initialHtml }: { initialItem: ReaderItem; initialHtml: string }) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [html, setHtml] = useState(initialHtml);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"reader" | "original" | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reMsg, setReMsg] = useState<string | null>(null);
  const [font, setFont] = useState<FontKey>("m");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selQuote, setSelQuote] = useState<{ text: string; top: number; left: number } | null>(null);
  const [related, setRelated] = useState<Related[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const savePosAt = useRef(0);

  // Fresh props when navigating between items.
  useEffect(() => {
    setItem(initialItem);
    setHtml(initialHtml);
    setView(null);
    setReMsg(null);
    setHighlights([]);
    setRelated([]);
    setSelQuote(null);
    try {
      const f = localStorage.getItem("hoard:reader-font");
      if (f === "s" || f === "m" || f === "l") setFont(f);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItem.id]);

  // Resume reading position (per item, this browser).
  useEffect(() => {
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(posKey(initialItem.id)) ?? 0) || 0;
    } catch {}
    if (saved > 200) {
      const t = setTimeout(() => window.scrollTo(0, saved), 60);
      return () => clearTimeout(t);
    }
  }, [initialItem.id]);

  // Progress bar (direct DOM write — no rerenders on scroll) + throttled
  // position autosave.
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (barRef.current) barRef.current.style.width = `${Math.round(pct * 100)}%`;
      const now = Date.now();
      if (now - savePosAt.current > 1000) {
        savePosAt.current = now;
        try {
          localStorage.setItem(posKey(initialItem.id), String(Math.round(window.scrollY)));
        } catch {}
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [initialItem.id]);

  const loadHighlights = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${initialItem.id}/highlights`, { cache: "no-store" });
      if (res.ok) setHighlights(await apiJson<Highlight[]>(res));
    } catch {}
  }, [initialItem.id]);

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  // Related reads via the existing hybrid search (title as the query).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/search?q=${encodeURIComponent(initialItem.title)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const hits = await apiJson<Related[]>(res);
        if (!cancelled) setRelated(hits.filter((h) => h.kind === "item" && h.id !== initialItem.id).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialItem.id, initialItem.title]);

  const toc = useMemo(() => {
    const heads = markdownHeadings(item.markdown);
    if (heads.length < 3) return [];
    const ids = uniqueSlugs(heads.map((h) => h.text));
    return heads.map((h, i) => ({ ...h, id: ids[i] }));
  }, [item.markdown]);

  const minutes = useMemo(() => readingMinutes(item.markdown), [item.markdown]);

  function onSelect() {
    const sel = window.getSelection();
    const container = bodyRef.current;
    if (!sel || sel.isCollapsed || !container || !sel.anchorNode || !container.contains(sel.anchorNode)) {
      setSelQuote(null);
      return;
    }
    const text = sel.toString().trim().slice(0, 2000);
    if (!text) {
      setSelQuote(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelQuote({ text, top: rect.top + window.scrollY, left: Math.min(rect.left, window.innerWidth - 160) });
  }

  async function saveHighlight() {
    if (!selQuote) return;
    try {
      const res = await fetch(`/api/items/${item.id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: selQuote.text }),
      });
      if (res.ok) {
        window.getSelection()?.removeAllRanges();
        setSelQuote(null);
        await loadHighlights();
      }
    } catch {}
  }

  async function deleteHighlight(hid: string) {
    try {
      const res = await fetch(`/api/items/${item.id}/highlights/${hid}`, { method: "DELETE" });
      if (res.ok) setHighlights((prev) => prev.filter((h) => h.id !== hid));
    } catch {}
  }

  async function reprocess() {
    // Honest pending state: one flag, no staged theater.
    setReprocessing(true);
    setReMsg(null);
    try {
      const r = await fetch(`/api/items/${item.id}/reprocess`, { method: "POST" });
      const d = await apiJson<ReaderItem & { error?: string; reprocessed?: boolean; captureWarning?: string; html?: string }>(r);
      if (!r.ok) {
        setReMsg(d.error ?? "Couldn't reprocess that page.");
        return;
      }
      setItem(d);
      if (typeof d.html === "string" && d.html) setHtml(d.html);
      setReMsg(d.reprocessed ? "Ready — document refreshed." : d.captureWarning ?? "Couldn't refresh — showing the saved copy.");
      if (!d.extractionError) setView("reader");
      setTimeout(() => setReMsg(null), 4000);
    } catch {
      setReMsg("Network hiccup — try again.");
    } finally {
      setReprocessing(false);
    }
  }

  async function setStatus(status: string) {
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    window.dispatchEvent(new Event("hoard:items-changed"));
    router.push("/library");
  }

  async function remove() {
    await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("hoard:items-changed"));
    router.push("/library");
  }

  const activeView = view ?? (item.extractionError ? "original" : "reader");
  const published = formatDate(item.publishedAt);
  const extracted = formatDate(item.extractedAt);
  const meta = [item.author, published ? `Published ${published}` : null, extracted ? `Saved ${extracted}` : null, `~${minutes} min read`]
    .filter(Boolean)
    .join(" · ");
  const fs = FONT_SIZES[font];

  return (
    <article>
      <div ref={barRef} aria-hidden className="fixed left-0 top-0 z-40 h-[2px] bg-[var(--accent)]" style={{ width: "0%" }} />
      <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
        {item.type} {item.sourceUrl && `· ${domainOf(item.sourceUrl)}`}
      </p>
      <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[var(--text)]">{item.title}</h1>
      {meta && <p className="mt-1 font-mono text-[11px] text-[var(--text-faint)]">{meta}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {item.sourceUrl && (
          <div role="tablist" aria-label="Reader or original" className="flex rounded-[6px] border border-[var(--border)] bg-[var(--bg-raised)] p-0.5">
            {(["reader", "original"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={activeView === v}
                onClick={() => setView(v)}
                className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium ${
                  activeView === v ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {v === "reader" ? "Reader" : "Original"}
              </button>
            ))}
          </div>
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
        {item.sourceUrl && (
          <button
            onClick={reprocess}
            disabled={reprocessing}
            className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)] disabled:opacity-50"
          >
            {reprocessing ? "Reprocessing…" : "Reprocess"}
          </button>
        )}
        <div role="group" aria-label="Text size" className="flex rounded-[6px] border border-[var(--border)] p-0.5">
          {(Object.keys(FONT_SIZES) as FontKey[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setFont(k);
                try {
                  localStorage.setItem("hoard:reader-font", k);
                } catch {}
              }}
              aria-pressed={font === k}
              aria-label={`Text size ${FONT_SIZES[k].label}`}
              className={`rounded-[6px] px-2 py-1 font-mono text-[11px] ${
                font === k ? "bg-[var(--bg-active)] text-[var(--text)]" : "text-[var(--text-faint)] hover:text-[var(--text-body)]"
              }`}
            >
              {FONT_SIZES[k].label}
            </button>
          ))}
        </div>
        <button onClick={() => setStatus("archived")} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)]">Archive</button>
        <button onClick={() => setStatus("done")} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)]">Done</button>
        <DeleteButton label={item.title} onDelete={remove} />
      </div>

      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
        {reprocessing && "Reprocessing — fetching a fresh copy…"}
        {reMsg && !reprocessing && ` ${reMsg}`}
      </div>

      {item.tags.length > 0 && (
        <p className="mt-1 font-mono text-[11px] text-[var(--text-faint)]">tagged: {item.tags.join(", ")}</p>
      )}

      {toc.length > 0 && activeView === "reader" && (
        <details className="mt-3 rounded-[8px] border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-2">
          <summary className="cursor-pointer font-mono text-[11px] text-[var(--text-muted)]">Contents · {toc.length} sections</summary>
          <ul className="mt-2 space-y-1 pb-1">
            {toc.map((h) => (
              <li key={h.id} style={{ marginLeft: `${(h.level - 1) * 0.9}rem` }}>
                <a href={`#${h.id}`} className="text-[13px] text-[var(--text-body)] hover:text-[var(--accent)] hover:underline">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      {item.extractionError && activeView === "reader" && (
        <p className="mt-3 rounded-[8px] border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[13px] text-[var(--text-muted)]">
          Reader isn't available for this page yet ({item.extractionError}). Showing the saved copy — try Reprocess or read the original.
        </p>
      )}

      {activeView === "original" && item.sourceUrl ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <p className="font-mono text-[11px] text-[var(--text-faint)]">Original webpage — some sites block embedding.</p>
            <a href={item.sourceUrl} target="_blank" rel="noopener" className="font-mono text-[11px] text-[var(--text)] underline">
              Open in new tab ↗
            </a>
          </div>
          <iframe
            src={item.sourceUrl}
            title={`Original webpage: ${item.title}`}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            className="h-[70vh] w-full rounded-[10px] border border-[var(--border-soft)] bg-white"
          />
        </div>
      ) : (
        <div
          ref={bodyRef}
          onMouseUp={onSelect}
          className="reader-body mt-4 max-w-none"
          style={{ fontSize: `${fs.size}px`, lineHeight: fs.leading }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {selQuote && activeView === "reader" && (
        <button
          onClick={saveHighlight}
          className="fixed z-40 rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white shadow-lg hover:bg-[var(--accent-hi)]"
          style={{ top: `${Math.max(selQuote.top - 44, 8)}px`, left: `${Math.max(selQuote.left, 8)}px` }}
        >
          Save highlight
        </button>
      )}
      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--green)]">
        {copied ? "Markdown copied." : ""}
      </div>

      {highlights.length > 0 && (
        <section aria-label="Your highlights" className="mt-8 border-t border-[var(--border-soft)] pt-4">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Your highlights · {highlights.length}</h2>
          <ul className="mt-2 space-y-2">
            {highlights.map((h) => (
              <li key={h.id} className="rounded-[8px] border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-2">
                <blockquote className="border-l-2 border-[var(--accent)] pl-2 text-[13px] leading-6 text-[var(--text-body)]">{h.quote}</blockquote>
                <button
                  onClick={() => deleteHighlight(h.id)}
                  aria-label="Delete highlight"
                  className="mt-1 font-mono text-[11px] text-[var(--text-faint)] hover:text-[var(--text-body)] hover:underline"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section aria-label="More like this" className="mt-8 border-t border-[var(--border-soft)] pt-4">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-[var(--text-faint)]">More like this</h2>
          <ul className="mt-2 space-y-1">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/items/${r.id}`} className="text-[13px] text-[var(--text-body)] hover:text-[var(--accent)] hover:underline">
                  {r.title}
                </Link>
                {r.via && <span className="ml-2 font-mono text-[11px] text-[var(--text-faint)]">via {r.via}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
