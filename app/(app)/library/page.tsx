"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ItemList } from "@/components/ItemList";

const STATUSES = [
  { id: "", label: "All" },
  { id: "inbox", label: "Inbox" },
  { id: "saved", label: "Saved" },
  { id: "done", label: "Done" },
  { id: "archived", label: "Archived" },
];

function LibraryBrowser() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tag = searchParams.get("tag") ?? "";
  const [status, setStatus] = useState("");

  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Library</h1>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">Everything you kept, newest first.</p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatus(s.id)}
            aria-pressed={status === s.id}
            className={`rounded-[6px] px-2.5 py-1 font-mono text-[11px] ${
              status === s.id
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
        {tag && (
          <button
            onClick={() => router.push("/library")}
            aria-label={`Clear tag filter ${tag}`}
            className="rounded-[6px] border border-[var(--accent)] px-2.5 py-1 font-mono text-[11px] text-[var(--accent)] hover:bg-[var(--bg-hover)]"
          >
            #{tag} ×
          </button>
        )}
      </div>
      <ItemList
        statusFilter={status || undefined}
        tagFilter={tag || undefined}
        emptyHint={tag ? `No items tagged "${tag}" yet.` : "Paste a URL above — your first save takes two seconds."}
      />
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<p className="font-mono text-[12px] text-[var(--text-faint)]">Loading…</p>}>
      <LibraryBrowser />
    </Suspense>
  );
}
