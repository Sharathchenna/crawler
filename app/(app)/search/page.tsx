"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/components/api";

type Hit = {
  id: string;
  kind: "item" | "note";
  title: string;
  snippet: string;
  type: string;
  sourceUrl?: string | null;
  via?: "keyword" | "fuzzy" | "semantic";
};

const SCOPES = [
  { label: "All", types: "" },
  { label: "Notes", types: "note" },
  { label: "Tweets", types: "x" },
  { label: "Repos", types: "repo" },
  { label: "Articles", types: "page,pdf" },
] as const;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<(typeof SCOPES)[number]>(SCOPES[0]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (scope.types) params.set("type", scope.types);
        const res = await fetch(`/api/search?${params}`);
        if (res.ok) setHits(await apiJson<Hit[]>(res));
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, scope]);

  const notes = hits.filter((h) => h.kind === "note");
  const items = hits.filter((h) => h.kind === "item");

  function group(title: string, list: Hit[], base: string) {
    if (!list.length) return null;
    return (
      <>
        <h2 className="mt-5 font-mono text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{title}</h2>
        <ul className="mt-2 overflow-hidden rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)]">
          {list.map((h, i) => (
            <li key={h.id} className={`px-3 py-2.5 hover:bg-[var(--bg-hover)] ${i !== list.length - 1 ? "border-b border-[var(--border-soft)]" : ""}`}>
              <span className="flex items-center gap-2">
                <Link href={`${base}/${h.id}`} className="block truncate text-[13px] font-medium text-[var(--text)] hover:underline">
                  {h.title}
                </Link>
                {h.via && h.via !== "keyword" && (
                  <span className="shrink-0 rounded-[6px] bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-faint)]">
                    {h.via}
                  </span>
                )}
              </span>
              <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{h.snippet}</p>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Search</h1>
      <div className="elevated mt-3 flex items-center gap-2 rounded-[10px] px-3">
        <span aria-hidden className="font-mono text-[11px] text-[var(--text-faint)]">⌘K</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles and Markdown…  (press ⌘K anywhere)"
          aria-label="Search your library"
          autoFocus
          className="w-full bg-transparent py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Search scope">
        {SCOPES.map((s) => (
          <button
            key={s.label}
            onClick={() => setScope(s)}
            aria-pressed={scope.label === s.label}
            className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium ${
              scope.label === s.label
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--text-faint)]">
        {busy ? "Searching…" : q ? `${notes.length} notes · ${items.length} items` : "Type to search."}
      </div>
      {group("Notes", notes, "/notes")}
      {group("Items", items, "/items")}
    </div>
  );
}
