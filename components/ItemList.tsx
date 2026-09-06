"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TypeIcon, domainOf, timeAgo } from "@/components/Shell";
import { DeleteButton } from "@/components/DeleteButton";

type Item = {
  id: string;
  type: string;
  title: string;
  sourceUrl?: string | null;
  excerpt: string;
  status: string;
  createdAt: string;
  tags: string[];
};

const HIDDEN_WHEN_UNFILTERED = new Set(["archived", "done"]);

/** Publisher favicon with zero backend cost; falls back to the type icon
 * when the host has none (privacy-preserving: browser→site, same as a
 * click, no third-party icon service in the middle). */
function RowThumb({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  const host = domainOf(item.sourceUrl);
  if (!host || failed) return <TypeIcon type={item.type} />;
  return (
    <img
      src={`https://${host}/favicon.ico`}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-[6px] border border-[var(--border-soft)] object-contain p-1"
    />
  );
}

export function ItemList({
  statusFilter,
  typeFilter,
  tagFilter,
  emptyHint,
}: {
  statusFilter?: string;
  typeFilter?: string;
  tagFilter?: string;
  emptyHint: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (tagFilter) params.set("tag", tagFilter);
      const qs = params.size ? `?${params}` : "";
      // no-store: a cached list is exactly how a just-saved item goes missing.
      const res = await fetch(`/api/items${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const list: Item[] = Array.isArray(data) ? data : [];
      setItems(statusFilter ? list : list.filter((i) => !HIDDEN_WHEN_UNFILTERED.has(i.status)));
    } catch {
      setError("Couldn't load items — check you're online, then retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // The sidebar capture bar notifies here (router.refresh doesn't
    // re-run client-component fetches, so this event is the refresh).
    // focus/visibility covers the cross-tab case: saving in one tab leaves
    // another tab's list stale, and same-window events don't cross tabs.
    const onChange = () => load();
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("hoard:items-changed", onChange);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("hoard:items-changed", onChange);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, tagFilter]);

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      // Optimistic: drop rows that no longer match this list, then reconcile.
      setItems((prev) =>
        prev.filter((i) => {
          if (i.id !== id) return true;
          if (statusFilter) return status === statusFilter;
          return !HIDDEN_WHEN_UNFILTERED.has(status);
        })
      );
    }
    load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    load();
  }

  if (loading) return <p className="font-mono text-[12px] text-[var(--text-faint)]">Loading…</p>;
  // Errors are shown, never swallowed into an empty list.
  if (error && !items.length)
    return (
      <div className="rounded-[10px] border border-[var(--border)] p-10 text-center">
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">Couldn't load items.</p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">{error}</p>
        <button
          onClick={load}
          className="mt-4 rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
        >
          Retry
        </button>
      </div>
    );
  if (!items.length)
    return (
      <div className="hero-glow rounded-[10px] border border-dashed border-[var(--border)] p-10 text-center">
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">Nothing here yet.</p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">{emptyHint}</p>
      </div>
    );

  // Dense rows, not cards — hover reveals actions on the right.
  return (
    <ul className="overflow-hidden rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)]" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
      {items.map((it, idx) => (
        <li
          key={it.id}
          className={`group flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] ${
            idx !== items.length - 1 ? "border-b border-[var(--border-soft)]" : ""
          }`}
        >
          <RowThumb item={it} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/items/${it.id}`}
              className="block truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--text)] hover:underline"
            >
              {it.title}
            </Link>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-faint)]">
              {domainOf(it.sourceUrl)}{domainOf(it.sourceUrl) && " · "}{timeAgo(it.createdAt)} · {it.status}
              {it.tags.length ? (
                <>
                  {" · "}
                  {it.tags.map((t, ti) => (
                    <span key={t}>
                      {ti > 0 && ", "}
                      <Link
                        href={`/library?tag=${encodeURIComponent(t)}`}
                        className="hover:text-[var(--accent)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t}
                      </Link>
                    </span>
                  ))}
                </>
              ) : ""}
            </p>
            {it.excerpt && (
              <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{it.excerpt}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
            {it.status === "inbox" && (
              <button
                onClick={() => setStatus(it.id, "saved")}
                className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-active)]"
                aria-label={`Save ${it.title}`}
              >
                Save
              </button>
            )}
            <button
              onClick={() => setStatus(it.id, "done")}
              className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-active)]"
              aria-label={`Mark done ${it.title}`}
            >
              Done
            </button>
            <button
              onClick={() => setStatus(it.id, "archived")}
              className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-active)] hover:text-[var(--text-body)]"
              aria-label={`Archive ${it.title}`}
            >
              Archive
            </button>
            <DeleteButton label={it.title} onDelete={() => remove(it.id)} />
          </div>
        </li>
      ))}
    </ul>
  );
}
