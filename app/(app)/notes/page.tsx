"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/components/Shell";

type Note = {
  id: string;
  title: string;
  project: string;
  updatedAt: string;
  _count?: { revisions: number; sources: number };
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const router = useRouter();

  async function load() {
    const res = await fetch("/api/notes");
    if (res.ok) setNotes(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Untitled" }),
    });
    if (res.ok) {
      const n = await res.json();
      router.push(`/notes/${n.id}`);
    }
  }

  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Notes</h1>
      <p className="mb-4 text-[13px] text-[var(--text-muted)]">Living documents. Every save keeps a revision.</p>
      <form onSubmit={create} className="mb-4 flex gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New note title…"
          aria-label="New note title"
          className="flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button className="rounded-[6px] bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hi)] hover:shadow-[0_0_12px_var(--accent-glow)]">
          New note
        </button>
      </form>
      <ul className="overflow-hidden rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)]" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
        {notes.map((n, idx) => (
          <li key={n.id} className={`px-3 py-2.5 hover:bg-[var(--bg-hover)] ${idx !== notes.length - 1 ? "border-b border-[var(--border-soft)]" : ""}`}>
            <Link href={`/notes/${n.id}`} className="block truncate text-[13px] font-medium text-[var(--text)] hover:underline">
              {n.title}
            </Link>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--text-faint)]">
              {n.project && `${n.project} · `}{timeAgo(n.updatedAt)}
              {n._count && ` · v${n._count.revisions} · ${n._count.sources} sources`}
            </p>
          </li>
        ))}
        {!notes.length && (
          <li className="p-8 text-center text-[13px] text-[var(--text-muted)]">
            No notes yet. Start one above — it becomes an agent-editable doc.
          </li>
        )}
      </ul>
    </div>
  );
}
