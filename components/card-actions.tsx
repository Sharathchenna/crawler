"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  REACTION_LABELS,
  type PostSummary,
  type ReactionKind,
} from "@/shared/types";

async function sendReact(id: number, kind: ReactionKind): Promise<boolean> {
  const response = await fetch("/api/react", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, kind }),
  });
  return response.ok;
}

async function sendRestore(id: number): Promise<boolean> {
  const response = await fetch("/api/react", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return response.ok;
}

export function CardActions({
  post,
  shelf,
  onGone,
}: {
  post: PostSummary;
  shelf: "live" | "archive";
  onGone: (id: number) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: ReactionKind | "restore") {
    setPending(kind);
    setError(null);
    try {
      const ok =
        kind === "restore"
          ? await sendRestore(post.id)
          : await sendReact(post.id, kind);
      if (!ok) {
        setError("Could not update that link.");
        return;
      }
      onGone(post.id);
      router.refresh();
    } catch {
      setError("Could not reach the library.");
    } finally {
      setPending(null);
    }
  }

  if (shelf === "archive") {
    const label = post.reaction ? REACTION_LABELS[post.reaction] : "Archived";
    return (
      <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </p>
        <button
          type="button"
          disabled={pending !== null}
          className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-terracotta disabled:opacity-50"
          onClick={() => void act("restore")}
        >
          {pending === "restore" ? "Restoring…" : "Restore"}
        </button>
        {error ? <span className="sr-only">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-4 py-2.5">
      <button
        type="button"
        disabled={pending !== null}
        className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-terracotta disabled:opacity-50"
        onClick={() => void act("like")}
      >
        {pending === "like" ? "Liking…" : "Like"}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink disabled:opacity-50"
        onClick={() => void act("dislike")}
      >
        {pending === "dislike" ? "Passing…" : "Pass"}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink disabled:opacity-50"
        onClick={() => void act("read")}
      >
        {pending === "read" ? "Filing…" : "Read"}
      </button>
      {error ? (
        <p className="basis-full text-xs text-muted">{error}</p>
      ) : null}
    </div>
  );
}
