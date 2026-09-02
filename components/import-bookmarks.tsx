"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { extractBookmarkImports } from "@/shared/birdclaw";

export function ImportBookmarks() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const previewCount = text.trim() ? extractBookmarkImports(text).length : 0;

  async function importText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const body = (await response.json()) as {
        error?: string;
        saved?: number;
        skipped?: number;
        failed?: number;
        total?: number;
      };
      if (!response.ok) {
        setStatus(body.error ?? "Could not import those bookmarks.");
        return;
      }
      setText("");
      setStatus(
        `Imported ${body.saved ?? 0} to Yours` +
          (body.skipped ? `, ${body.skipped} already there` : "") +
          (body.failed ? `, ${body.failed} failed` : "") +
          ".",
      );
      router.refresh();
    } catch {
      setStatus("Could not reach the library.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        className="text-xs font-medium uppercase tracking-[0.16em] text-muted hover:text-terracotta"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide bookmark import" : "Import X bookmarks"}
      </button>
      {open ? (
        <form
          className="mt-4 rounded-xl border border-rule bg-paper-deep/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void importText(text);
          }}
        >
          <p className="text-sm leading-relaxed text-muted">
            Birdclaw keeps bookmarks in local SQLite. Sync them, then paste the
            JSON here — or drop a{" "}
            <code className="text-ink">bookmarks.jsonl</code> / tweet URL list.
          </p>
          <pre className="mt-3 overflow-x-auto text-[0.7rem] leading-relaxed text-muted">
            {`birdclaw sync bookmarks --mode auto --all --json
birdclaw search tweets --bookmarked --limit 200 --json`}
          </pre>
          <label className="sr-only" htmlFor="bookmark-import">
            Birdclaw JSON or tweet URLs
          </label>
          <textarea
            id="bookmark-import"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            placeholder="Paste birdclaw --json output, JSONL, or x.com/status URLs"
            className="mt-3 w-full resize-y rounded-lg border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-terracotta"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || previewCount === 0}
              className="text-sm font-medium uppercase tracking-[0.16em] text-terracotta disabled:opacity-50"
            >
              {pending
                ? "Importing…"
                : previewCount
                  ? `Save ${Math.min(previewCount, 80)} to Yours`
                  : "Save to Yours"}
            </button>
            <label className="cursor-pointer text-xs font-medium uppercase tracking-[0.16em] text-muted hover:text-ink">
              Upload file
              <input
                type="file"
                accept=".json,.jsonl,.txt,.js"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  const raw = await file.text();
                  setText(raw);
                  void importText(raw);
                }}
              />
            </label>
            {previewCount ? (
              <span className="text-xs text-muted">
                {previewCount} tweet{previewCount === 1 ? "" : "s"} found
                {previewCount > 80 ? " (first 80 this pass)" : ""}
              </span>
            ) : null}
          </div>
          {status ? <p className="mt-3 text-sm text-muted">{status}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
