"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiJson } from "@/components/api";

type Revision = { version: number; author: string; summary: string; createdAt: string };
type Note = {
  id: string;
  title: string;
  markdown: string;
  project: string;
  kind: string;
  revisions: Revision[];
  sources: { item: { id: string; title: string } }[];
};

export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/notes/${id}`);
    const data = await apiJson<Note & { error?: string }>(res);
    if (!res.ok) {
      setError(data.error ?? "Couldn't find that note.");
      return;
    }
    setNote(data);
    setDraft(data.markdown);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setStatus("Saving…");
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: draft, summary: summary || "Edited" }),
    });
    const data = await apiJson<Note & { error?: string }>(res);
    if (!res.ok) {
      setStatus(null);
      setError(data.error ?? "Couldn't save.");
      return;
    }
    setNote(data);
    setSummary("");
    setStatus(`Saved v${data.revisions.length}`);
  }

  if (error) return <p role="alert" className="text-[13px] text-[var(--red)]">{error}</p>;
  if (!note) return <p className="font-mono text-[12px] text-[var(--text-faint)]">Loading…</p>;

  return (
    <div>
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">{note.title}</h1>
      <p className="mb-4 font-mono text-[11px] text-[var(--text-faint)]">
        {note.project && `project: ${note.project} · `}kind: {note.kind} · {note.sources.length} sources
      </p>
      <div className="mb-2 flex gap-1.5">
        <button
          onClick={() => setPreview(!preview)}
          className="rounded-[6px] border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
        >
          {preview ? "Edit" : "Preview"}
        </button>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Revision summary (optional)"
          aria-label="Revision summary"
          className="flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-1 font-mono text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          onClick={save}
          className="rounded-[6px] bg-[var(--accent)] px-3 py-1 text-[13px] font-medium text-white hover:bg-[var(--accent-hi)] hover:shadow-[0_0_12px_var(--accent-glow)]"
        >
          Save
        </button>
      </div>
      <div aria-live="polite" className="mb-2 font-mono text-[11px] text-[var(--green)]">{status}</div>
      {preview ? (
        <div className="reader-body whitespace-pre-wrap rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 text-[13px] leading-6 text-[var(--text-body)]">
          {draft || "Nothing yet."}
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={18}
          aria-label="Note Markdown"
          className="reader-body w-full rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-raised)] p-4 font-mono text-[13px] leading-6 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
        />
      )}
      <h2 className="mt-6 font-mono text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Activity</h2>
      <ul className="mt-2 overflow-hidden rounded-[10px] border border-[var(--border-soft)]">
        {[...note.revisions].reverse().map((r) => (
          <li key={r.version} className="border-b border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)] last:border-0">
            <span className="text-[var(--text)]">v{r.version}</span> · {new Date(r.createdAt).toLocaleString()} · {r.author} · {r.summary}
          </li>
        ))}
      </ul>
    </div>
  );
}
