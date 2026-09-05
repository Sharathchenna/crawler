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

export function ItemList({
  statusFilter,
  typeFilter,
  emptyHint,
}: {
  statusFilter?: string;
  typeFilter?: string;
  emptyHint: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      const qs = params.size ? `?${params}` : "";
      const res = await fetch(`/api/items${qs}`);
      const data: unknown = await res.json();
      const list: Item[] = Array.isArray(data) ? data : [];
      setItems(statusFilter ? list : list.filter((i) => i.status !== "archived"));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // The sidebar capture bar notifies here (router.refresh doesn't
    // re-run client-component fetches, so this event is the refresh).
    const onChange = () => load();
    window.addEventListener("hoard:items-changed", onChange);
    return () => window.removeEventListener("hoard:items-changed", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  async function setStatus(id: string, status: string) {
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="font-mono text-[12px] text-[var(--text-faint)]">Loading…</p>;
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
          <TypeIcon type={it.type} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/items/${it.id}`}
              className="block truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--text)] hover:underline"
            >
              {it.title}
            </Link>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-faint)]">
              {domainOf(it.sourceUrl)}{domainOf(it.sourceUrl) && " · "}{timeAgo(it.createdAt)} · {it.status}
              {it.tags.length ? ` · ${it.tags.join(", ")}` : ""}
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
