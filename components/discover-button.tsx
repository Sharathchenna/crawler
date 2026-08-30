"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DiscoverButton() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="text-xs font-medium uppercase tracking-[0.16em] text-terracotta disabled:opacity-50"
        onClick={async () => {
          setPending(true);
          setStatus(null);
          try {
            const response = await fetch("/api/discover", { method: "POST" });
            const body = (await response.json()) as {
              enqueued?: number;
              tinyfish?: { ran?: boolean; reason?: string };
              error?: string;
            };
            if (!response.ok) {
              setStatus(body.error ?? "Crawler is not running.");
              return;
            }
            const parts: string[] = [];
            if (body.enqueued) {
              parts.push(
                `Found ${body.enqueued} new link${body.enqueued === 1 ? "" : "s"}.`,
              );
            } else {
              parts.push("No new links — those sources were already in the library.");
            }
            if (body.tinyfish && !body.tinyfish.ran) {
              parts.push("Open-web search is off until TINYFISH_API_KEY is set.");
            }
            setStatus(parts.join(" "));
            router.refresh();
          } catch {
            setStatus("Could not reach the crawler.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Looking…" : "Find more"}
      </button>
      {status ? <p className="mt-2 text-sm text-muted">{status}</p> : null}
    </div>
  );
}
