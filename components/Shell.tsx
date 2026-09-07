"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiJson } from "@/components/api";

const NAV = [
  { href: "/discover", label: "Discover", icon: "✦" },
  { href: "/library", label: "Library", icon: "▤" },
  { href: "/inbox", label: "Inbox", icon: "◉" },
  { href: "/notes", label: "Notes", icon: "✎" },
  { href: "/repos", label: "Repos", icon: "⎇" },
  { href: "/tweets", label: "Tweets", icon: "✕" },
  { href: "/articles", label: "Articles", icon: "◱" },
  { href: "/papers", label: "Research papers", icon: "◈" },
  { href: "/search", label: "Search", icon: "⌕" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

const MOBILE_NAV = [
  { href: "/discover", label: "Discover", icon: "✦" },
  { href: "/library", label: "Library", icon: "▤" },
  { href: "/inbox", label: "Inbox", icon: "◉" },
  { href: "/search", label: "Search", icon: "⌕" },
];

type PaletteHit = { id: string; kind: string; title: string; snippet: string };

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [sel, setSel] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setSel(0);
      setSaveMsg("");
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

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
  const isUrl = /^https?:\/\/\S+$/i.test(q.trim());
  const total = actions.length + hits.length + (isUrl ? 1 : 0);

  async function saveUrl() {
    const url = q.trim();
    if (saving || !url) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await apiJson<{ error?: string; title?: string; reprocessed?: boolean }>(res);
      if (!res.ok) {
        setSaveMsg(data.error ?? "Couldn't save that.");
      } else {
        setSaveMsg(`Saved: ${data.title ?? url}`);
        window.dispatchEvent(new Event("hoard:items-changed"));
        setTimeout(onClose, 900);
      }
    } catch {
      setSaveMsg("Network hiccup — try again.");
    } finally {
      setSaving(false);
    }
  }

  const go = useCallback(
    (index: number) => {
      let i = index;
      if (isUrl) {
        if (i === 0) {
          void saveUrl();
          return;
        }
        i -= 1;
      }
      if (i < actions.length) {
        router.push(actions[i].href);
        onClose();
      } else {
        const h = hits[i - actions.length];
        if (h) {
          router.push(h.kind === "note" ? `/notes/${h.id}` : `/items/${h.id}`);
          onClose();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, hits, isUrl, router, onClose]
  );

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-3 pt-[10vh] sm:pt-[18vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="elevated w-full max-w-xl overflow-hidden rounded-[10px]"
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
        {saveMsg && (
          <p role="status" className="border-b border-[var(--border-soft)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
            {saveMsg}
          </p>
        )}
        <ul role="listbox" aria-label="Results" className="max-h-[min(18rem,50vh)] overflow-y-auto p-1.5 sm:max-h-72">
          {isUrl && (
            <li
              role="option"
              aria-selected={sel === 0}
              onClick={() => go(0)}
              onMouseEnter={() => setSel(0)}
              className={`flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm ${
                sel === 0 ? "bg-[var(--accent)] text-white" : "text-[var(--text-body)]"
              }`}
            >
              <span aria-hidden className="font-mono text-xs opacity-70">＋</span>
              {saving ? "Saving…" : `Save ${q.trim().slice(0, 60)}`}
            </li>
          )}
          {actions.map((a, ai) => {
            const i = ai + (isUrl ? 1 : 0);
            return (
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
            );
          })}
          {hits.map((h, j) => {
            const i = actions.length + (isUrl ? 1 : 0) + j;
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

function NavLinks({
  path,
  onNavigate,
  className = "",
}: {
  path: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={`flex flex-col gap-0.5 ${className}`} aria-label="Sections">
      {NAV.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-[44px] items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] ${
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
  );
}

function CaptureForm({
  url,
  setUrl,
  busy,
  stage,
  status,
  onSubmit,
  onOpenPalette,
  compact = false,
}: {
  url: string;
  setUrl: (v: string) => void;
  busy: boolean;
  stage: number;
  status: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onOpenPalette: () => void;
  compact?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className={`flex flex-col gap-1.5 ${compact ? "" : "px-1"}`} aria-label="Quick capture">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a URL → save"
        aria-label="Paste a URL to save"
        className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[13px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none sm:py-1.5"
      />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={busy}
          className="min-h-[44px] flex-1 rounded-[6px] bg-[var(--accent)] px-2.5 py-2 text-[13px] font-medium text-white hover:bg-[var(--accent-hi)] hover:shadow-[0_0_12px_var(--accent-glow)] disabled:opacity-50 sm:min-h-0 sm:py-1.5"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          className="min-h-[44px] rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] sm:min-h-0 sm:px-2.5 sm:py-1.5"
          aria-label="Open command palette"
        >
          <span className="hidden sm:inline">⌘K</span>
          <span className="sm:hidden" aria-hidden>⌕</span>
        </button>
      </div>
      <div aria-live="polite" className="min-h-4 px-1 font-mono text-[11px] text-[var(--text-muted)]">
        {busy ? `${["Fetching", "Extracting", "Converting"][stage] ?? "Fetching"}…` : status}
      </div>
    </form>
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
  const [navOpen, setNavOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

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

  useEffect(() => {
    setNavOpen(false);
    setCaptureOpen(false);
  }, [path]);

  useEffect(() => {
    document.body.style.overflow = navOpen || captureOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen, captureOpen]);

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
        window.dispatchEvent(new Event("hoard:items-changed"));
        setCaptureOpen(false);
      }
    } catch {
      setStatus("Network hiccup — check you're online and try again.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.location.href = "/cdn-cgi/access/logout";
  }

  const closeNav = () => setNavOpen(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <header
        className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          aria-label="Open menu"
        >
          <span aria-hidden className="text-lg">☰</span>
        </button>
        <Link href="/library" className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
          Hoard
        </Link>
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] font-mono text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          aria-label="Search"
        >
          ⌕
        </button>
      </header>

      {/* Mobile nav drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={closeNav}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(100%,18rem)] flex-col bg-[var(--bg-raised)] px-3 py-4 shadow-xl"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
            aria-label="Primary navigation"
          >
            <div className="flex items-start justify-between px-2">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">Hoard</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-faint)]">{email}</p>
              </div>
              <button
                type="button"
                onClick={closeNav}
                className="flex h-10 w-10 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="mt-4">
              <CaptureForm
                url={url}
                setUrl={setUrl}
                busy={busy}
                stage={stage}
                status={status}
                onSubmit={capture}
                onOpenPalette={() => {
                  closeNav();
                  setPalette(true);
                }}
              />
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <NavLinks path={path} onNavigate={closeNav} />
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-[var(--border-soft)] px-2 pt-3">
              <button
                onClick={() => {
                  const light = document.documentElement.classList.toggle("light");
                  try {
                    localStorage.setItem("hoard-theme", light ? "light" : "dark");
                  } catch {}
                }}
                className="min-h-[44px] rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                aria-label="Toggle theme"
              >
                theme
              </button>
              <button
                onClick={logout}
                className="min-h-[44px] rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              >
                logout
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[var(--bg-raised)] px-3 py-5 lg:flex"
        aria-label="Primary"
        style={{ borderRight: "1px solid var(--border-soft)" }}
      >
        <div className="px-2">
          <Link href="/library" className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            Hoard
          </Link>
          <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-faint)]">{email}</p>
        </div>
        <div className="mt-4">
          <CaptureForm
            url={url}
            setUrl={setUrl}
            busy={busy}
            stage={stage}
            status={status}
            onSubmit={capture}
            onOpenPalette={() => setPalette(true)}
          />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto">
          <NavLinks path={path} />
        </div>
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
          <button onClick={logout} className="rounded-[6px] px-2 py-1 font-mono text-[11px] text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            logout
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pt-14 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pt-0 lg:pb-0" role="main">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-[var(--border-soft)] bg-[var(--bg-raised)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Quick navigation"
      >
        {MOBILE_NAV.map((n) => {
          const active = path === n.href || path.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] ${
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
              }`}
            >
              <span aria-hidden className="font-mono text-base leading-none">{n.icon}</span>
              <span className="truncate">{n.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] text-[var(--text-muted)]"
          aria-label="Save a URL"
        >
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] font-mono text-sm text-white">＋</span>
          <span>Save</span>
        </button>
      </nav>

      {/* Mobile capture sheet */}
      {captureOpen && (
        <div className="fixed inset-0 z-40 flex items-end lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close capture" onClick={() => setCaptureOpen(false)} />
          <div
            className="relative w-full rounded-t-[12px] border-t border-[var(--border-soft)] bg-[var(--bg-raised)] p-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            role="dialog"
            aria-modal="true"
            aria-label="Save a URL"
          >
            <p className="mb-3 text-sm font-medium text-[var(--text)]">Save to library</p>
            <CaptureForm
              url={url}
              setUrl={setUrl}
              busy={busy}
              stage={stage}
              status={status}
              onSubmit={capture}
              onOpenPalette={() => {
                setCaptureOpen(false);
                setPalette(true);
              }}
              compact
            />
          </div>
        </div>
      )}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

export function TypeIcon({ type }: { type: string }) {
  const map: Record<string, string> = {
    page: "◱",
    pdf: "▤",
    x: "✕",
    repo: "⎇",
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
