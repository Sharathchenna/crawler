"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { domainOf } from "@/components/Shell";
import { apiJson } from "@/components/api";

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

const STAGES = ["Fetching", "Extracting", "Converting", "Ready"] as const;

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ItemReader({ initialItem, initialHtml }: { initialItem: ReaderItem; initialHtml: string }) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [html, setHtml] = useState(initialHtml);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"reader" | "original" | null>(null);
  const [stage, setStage] = useState<number | null>(null);
  const [reMsg, setReMsg] = useState<string | null>(null);

  // Fresh props when navigating between items.
  useEffect(() => {
    setItem(initialItem);
    setHtml(initialHtml);
    setView(null);
    setReMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItem.id]);

  // Animate the Fetching → Extracting → Converting → Ready pipeline state.
  useEffect(() => {
    if (stage === null || stage >= STAGES.length - 1) return;
    const t = setTimeout(() => setStage((s) => (s === null ? s : s + 1)), 900);
    return () => clearTimeout(t);
  }, [stage]);

  async function reprocess() {
    setStage(0);
    setReMsg(null);
    try {
      const r = await fetch(`/api/items/${item.id}/reprocess`, { method: "POST" });
      const d = await apiJson<ReaderItem & { error?: string; reprocessed?: boolean; captureWarning?: string; html?: string }>(r);
      if (!r.ok) {
        setReMsg(d.error ?? "Couldn't reprocess that page.");
        setStage(null);
        return;
      }
      setItem(d);
      if (typeof d.html === "string" && d.html) setHtml(d.html);
      setStage(STAGES.length - 1);
      setReMsg(d.reprocessed ? "Ready — document refreshed." : d.captureWarning ?? "Couldn't refresh — showing the saved copy.");
      if (!d.extractionError) setView("reader");
      setTimeout(() => setStage(null), 2500);
    } catch {
      setReMsg("Network hiccup — try again.");
      setStage(null);
    }
  }

  async function setStatus(status: string) {
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.push("/library");
  }

  const activeView = view ?? (item.extractionError ? "original" : "reader");
  const published = formatDate(item.publishedAt);
  const extracted = formatDate(item.extractedAt);
  const meta = [item.author, published ? `Published ${published}` : null, extracted ? `Saved ${extracted}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article>
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
            disabled={stage !== null && stage < STAGES.length - 1}
            className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)] disabled:opacity-50"
          >
            Reprocess
          </button>
        )}
        <button onClick={() => setStatus("archived")} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)]">Archive</button>
        <button onClick={() => setStatus("done")} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-body)]">Done</button>
      </div>

      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
        {stage !== null && `Reprocessing: ${STAGES[stage]}${stage < STAGES.length - 1 ? "…" : ""}`}
        {reMsg && stage === null && ` ${reMsg}`}
      </div>

      {item.tags.length > 0 && (
        <p className="mt-1 font-mono text-[11px] text-[var(--text-faint)]">tagged: {item.tags.join(", ")}</p>
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
          className="reader-body mt-4 max-w-none text-[14px] leading-7 text-[var(--text-body)]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--green)]">
        {copied ? "Markdown copied." : ""}
      </div>
    </article>
  );
}
