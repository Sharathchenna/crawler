"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiJson } from "@/components/api";

const NAV = [
  { href: "/library", label: "Library", icon: "▤" },
  { href: "/inbox", label: "Inbox", icon: "◉" },
  { href: "/notes", label: "Notes", icon: "✎" },
  { href: "/search", label: "Search", icon: "⌕" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

type PaletteHit = { id: string; kind: string; title: string; snippet: string };

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open ]);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setHits(await apiJson<PaletteHit[]>(res));
      } catch {}
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const actions = NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase()));
  const total = actions.length + hits.length;

  const go = useCallback(
    (index: number) => {
      if (index < actions.length) {
        router.push(actions[index].href);
        onClose();
      } else {
        const h = hits[index - actions.length];
        if (h) {
          router.push(h.kind === "note" ? `/notes/${h.id}` : `/items/${h.id}`);
          onClose();
        }
      }
    },
    [actions, hits, router, onClose]
  );

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[18vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="elevated w-[min(100%-3rem,36rem)] overflow-hidden rounded-[10px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-soft)] px-3">
          <span aria-hidden className="font-mono text-xs text-[var(--text-faint)]">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, Math.max(total - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                go(sel);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search or jump to…"
            aria-label="Search or jump to"
            className="w-full bg-transparent py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-72 overflow-y-auto p-1.5">
          {actions.map((a, i) => (
            <li
              key={a.href}
              role="option"
              aria-selected={sel === i}
              onClick={() => go(i)}
              onMouseEnter={() => setSel(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm ${
                sel === i ? "bg-[var(--accent)] text-white" : "text-[var(--text-body)]"
              }`}
            >
              <span aria-hidden className="font-mono text-xs opacity-70">{a.icon}</span>
              Go to {a.label}
            </li>
          ))}
          {hits.map((h, j) => {
            const i = actions.length + j;
            return (
              <li
                key={h.id}
                role="option"
                aria-selected={sel === i}
                onClick={() => go(i)}
                onMouseEnter={() => setSel(i)}
                className={`cursor-pointer rounded-[8px] px-2.5 py-2 ${
                  sel === i ? "bg-[var(--accent)] text-white" : ""
                }`}
              >
                <span className={`block truncate text-sm ${sel === i ? "text-white" : "text-[var(--text)]"}`}>
                  {h.title}
                </span>
                <span className={`block truncate font-mono text-[11px] ${sel === i ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                  {h.kind} · {h.snippet.slice(0, 90)}
                </span>
              </li>
            );
          })}
          {total === 0 && q && (
            <li className="px-2.5 py-3 font-mono text-xs text-[var(--text-muted)]">No matches.</li>
          )}
          {total === 0 && !q && (
            <li className="px-2.5 py-3 font-mono text-xs text-[var(--text-muted)]">
              Type to search · ↑↓ to move · ↵ to open · esc to close
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Animate the Fetching → Extracting → Converting pipeline state while capturing.
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t1 = setTimeout(() => setStage(1), 900);
    const t2 = setTimeout(() => setStage(2), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [busy]);

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await apiJson<{ error?: string; title?: string; reprocessed?: boolean }>(res);
      if (!res.ok) {
        setStatus(data.error ?? "Couldn't save that. Try again.");
      } else {
        setStage(3);
        setStatus(`Ready — ${data.reprocessed ? "updated" : "saved"}: ${data.title ?? ""}`);
        setUrl("");
        router.refresh();
        // Lists are client components (unaffected by router.refresh),
        // so tell them to refetch explicitly.
        window.dispatchEvent(new Event("hoard:items-changed"));
      }
    } catch {
      setStatus("Network hiccup — check you're online and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Sign-out lives with the identity provider (Cloudflare Access).
  function logout() {
    window.location.href = "/cdn-cgi/access/logout";
  }

  return (
    <div className="flex min-h-screen">
      {/* Fixed left rail ~240px, anchored to the viewport edge */}
      <aside
        className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-[var(--bg-raised)] px-3 py-5"
        aria-label="Primary"
        style={{ borderRight: "1px solid var(--border-soft)" }}
      >
        <div className="px-2">
          <Link
            href="/library"
            className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]"
          >
            Hoard
          </Link>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-faint)]">{email}</p>
        </div>

        {/* Capture pinned near top */}
        <form onSubmit={capture} className="mt-4 flex flex-col gap-1.5 px-1" aria-label="Quick capture">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a URL → save"
            aria-label="Paste a URL to save"
            className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--accent-hi)] hover:shadow-[0_0_12px_var(--accent-glow)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              aria-label="Open command palette"
            >
              ⌘K
            </button>
          </div>
          <div aria-live="polite" className="min-h-4 px-1 font-mono text-[11px] text-[var(--text-muted)]">
            {busy ? `${["Fetching", "Extracting", "Converting"][stage] ?? "Fetching"}…` : status}
          </div>
        </form>

        <nav className="mt-2 flex flex-col gap-0.5" aria-label="Sections">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-[13px] ${
                  active
                    ? "bg-[var(--bg-active)] font-medium text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent)]"
                  />
                )}
                <span aria-hidden className="w-4 text-center font-mono text-xs">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between border-t border-[var(--border-soft)] px-2 pt-3">
          <button
            onClick={() => {
              const light = document.documentElement.classList.toggle("light");
              try {
                localStorage.setItem("hoard-theme", light ? "light" : "dark");
              } catch {}
            }}
            className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            aria-label="Toggle theme"
          >
            theme
          </button>
          <button
            onClick={logout}
            className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          >
            logout
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1" role="main">
        <div className="mx-auto w-full max-w-4xl px-8 py-8">{children}</div>
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

export function TypeIcon({ type }: { type: string }) {
  const map: Record<string, string> = {
    page: "◱",
    pdf: "▤",
    x: "✕",
    video: "▶",
    audio: "♪",
    file: "❏",
    note: "✎",
  };
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--bg-hover)] font-mono text-xs text-[var(--text-muted)]"
    >
      {map[type] ?? "◱"}
    </span>
  );
}

export function domainOf(u?: string | null) {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
