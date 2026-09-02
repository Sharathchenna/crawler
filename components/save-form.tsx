"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONTENT_TYPE_LABELS, CONTENT_TYPES, type ContentType } from "@/shared/types";

export function SaveForm() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="w-full"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const url = String(data.get("url") ?? "").trim();
        const contentType = String(data.get("type") ?? "") as ContentType | "";
        if (!url) {
          return;
        }
        setPending(true);
        setStatus(null);
        try {
          const response = await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              contentType: contentType || undefined,
            }),
          });
          const body = (await response.json()) as { error?: string; id?: number };
          if (!response.ok) {
            setStatus(body.error ?? "Could not save that link.");
            return;
          }
          form.reset();
          setStatus("Saved to Yours.");
          router.refresh();
        } catch {
          setStatus("Could not reach the library.");
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="sr-only" htmlFor="url">
        Save a URL
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="Paste a URL — blog, paper, tweet, anything"
          className="min-w-0 flex-1 border-0 border-b border-rule bg-transparent pb-2 text-lg text-ink outline-none placeholder:text-muted/70 focus:border-terracotta"
        />
        <select
          name="type"
          defaultValue=""
          className="border-0 border-b border-rule bg-paper pb-2 text-sm text-muted outline-none focus:border-terracotta"
        >
          <option value="">Auto-detect shelf</option>
          {CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium uppercase tracking-[0.16em] text-terracotta disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
    </form>
  );
}
