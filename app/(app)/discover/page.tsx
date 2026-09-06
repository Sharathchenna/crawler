"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/components/api";
import { domainOf } from "@/components/Shell";
import type { DiscoveryResponse, DigestView } from "@/lib/discovery";

type Article = DigestView["articles"][number];
const button = "rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)] disabled:opacity-50";
const field = "mt-1.5 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none";

export default function DiscoverPage() {
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [topics, setTopics] = useState("");
  const [seeds, setSeeds] = useState("");
  const [budget, setBudget] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  const load = useCallback(async (initialize = false, signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/discover", { cache: "no-store", signal });
      const next = await apiJson<DiscoveryResponse & { error?: string }>(response);
      if (!response.ok) throw new Error(next.error ?? "Could not load discovery.");
      setData(next);
      setError("");
      if (initialize && next.preferences) {
        setTopics(next.preferences.topics);
        setSeeds(next.preferences.seeds.join("\n"));
        setBudget(next.preferences.budget);
      }
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load discovery.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(true, controller.signal);
    return () => controller.abort();
  }, [load]);

  const digest = data?.digest;
  const running = digest?.status === "starting" || digest?.status === "running";
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    // Slow polling is deliberate: there is no live feed to keep watching.
    const timer = setInterval(() => { void load(false, controller.signal); }, 35_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [running, load]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy("crawl"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/discover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics, seeds: seeds.split(/\n/).map((s) => s.trim()).filter(Boolean), budget }),
      });
      const next = await apiJson<DiscoveryResponse & { error?: string }>(response);
      if (!response.ok) {
        await load();
        throw new Error(next.error ?? "Could not start discovery.");
      }
      setData(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start discovery."); }
    finally { setBusy(null); }
  }

  async function update(article: Article, status: string) {
    const response = await fetch("/api/discover", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: article.id, status }),
    });
    const next = await apiJson<DiscoveryResponse & { error?: string }>(response);
    if (!response.ok) throw new Error(next.error ?? "Could not update article.");
    setData(next);
  }

  async function act(article: Article, action: string) {
    setBusy(article.id); setError(""); setNotice("");
    try {
      if (action === "save") {
        const response = await fetch("/api/capture", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: article.url }),
        });
        const item = await apiJson<{ error?: string; captureWarning?: string }>(response);
        if (!response.ok) throw new Error(item.error ?? "Could not save article.");
        setNotice(item.captureWarning ? "Saved as a bookmark; the page could not be fully extracted. Open the original from your library." : "Saved to your library. Open it in the reader whenever you're ready.");
        window.dispatchEvent(new Event("hoard:items-changed"));
        await update(article, "saved");
      } else await update(article, action);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update article."); }
    finally { setBusy(null); }
  }

  const remaining = digest?.articles.filter((a) => a.status === "unread") ?? [];
  const finished = digest?.articles.filter((a) => a.status !== "unread") ?? [];
  const canStart = !digest || (digest.status === "failed" && digest.attempts < 2);

  return (
    <div className="space-y-6 text-[var(--text)]">
      <header>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-[var(--accent)]">A little curiosity. A clear stopping point.</p>
        <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Discover</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">Thoughtful blogs, found for you by Tinyfish. Up to five reads a day, within your reading budget. Save what matters, then get on with your day.</p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-[var(--border)] p-3 text-sm">{error} <button className="ml-2 underline" onClick={() => void load(!data)}>Check again</button></div>}
      {notice && <p role="status" className="text-sm text-[var(--text-muted)]">{notice}</p>}
      {!data && !error && <p role="status" className="text-sm text-[var(--text-muted)]">Loading your daily edition…</p>}

      {data && !data.configured && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-5">
          <h2 className="font-medium">Connect Tinyfish</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Add <code>TINYFISH_API_KEY</code> to your server environment and restart the app. For Cloudflare, add it as a Worker secret. Your key stays on the server.</p>
          <a href="https://agent.tinyfish.ai/api-keys" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-[var(--accent)] underline">Get a Tinyfish API key ↗</a>
        </section>
      )}

      {data && canStart && (
        <form onSubmit={start} className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-5">
          <label className="block text-[13px] font-medium">What do you want to learn about?
            <textarea className={field} rows={3} required minLength={3} maxLength={500} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="e.g. building AI agents, independent software, thoughtful engineering write-ups" />
          </label>
          <label className="block text-[13px] font-medium">Favourite blogs <span className="font-normal text-[var(--text-muted)]">· optional, up to 3, one URL per line</span>
            <textarea className={field} rows={3} maxLength={6200} value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder={"https://simonwillison.net/\nhttps://jvns.ca/"} />
          </label>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="text-[13px] font-medium">Daily reading budget
              <select className={field} value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
                {[10, 20, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}
              </select>
            </label>
            <button type="submit" disabled={!!busy || !data.configured} className="rounded-[6px] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hi)] disabled:opacity-50">
              {busy === "crawl" ? "Starting…" : digest?.status === "failed" ? "Retry today's crawl" : "Find today's reads"}
            </button>
          </div>
          <p className="text-xs leading-5 text-[var(--text-faint)]">One edition per UTC day. Each crawl uses your Tinyfish account credits and runs for up to five minutes. Reading times are estimates.</p>
        </form>
      )}

      {digest?.status === "failed" && <p role="status" className="text-sm text-[var(--text-muted)]">{digest.error} {digest.attempts >= 2 && "Today's two attempts are used. A fresh edition is available tomorrow (UTC)."}</p>}

      {running && <section role="status" className="rounded-lg border border-[var(--border)] p-6">
        <h2 className="text-lg font-medium">Tinyfish is out reading.</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Finding blogs and checking articles about {digest?.topics}. This usually takes a few minutes. You can leave this page and come back; your crawl will still be here.</p>
        <button className={`${button} mt-4`} onClick={() => void load()}>Check progress</button>
      </section>}

      {digest?.status === "ready" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-3">
            <h2 className="text-sm font-medium">Your {digest.day} edition <span className="text-[var(--text-faint)]">· UTC</span></h2>
            <p className="font-mono text-xs text-[var(--text-muted)]">{remaining.length} left · ~{remaining.reduce((sum, a) => sum + a.minutes, 0)} min</p>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{digest.topics} · {digest.budget}-minute budget</p>
          {remaining.length === 0 && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-7">
            <h3 className="text-xl font-medium">{digest.articles.length ? "You're done for today." : "Nothing worth adding today."}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{digest.articles.length ? "Your reading list has an end. Take something you learned and go make something." : "No new articles met your filters and reading budget. A short list beats filler."} Come back tomorrow for a fresh edition.</p>
            <Link href="/articles" className="mt-4 inline-block text-sm text-[var(--accent)] underline">Open your saved articles →</Link>
          </div>}
          {(showFinished ? digest.articles : remaining).map((article) => (
            <article key={article.id} className="rounded-lg border border-[var(--border)] p-5">
              <div className="mb-2 flex flex-wrap gap-2 font-mono text-[11px] text-[var(--text-faint)]">
                <span>{domainOf(article.url)}</span><span>· ~{article.minutes} min</span>
                {article.author && <span>· {article.author}</span>}
                {article.status !== "unread" && <span>· {article.status}</span>}
              </div>
              <h3 className="text-lg font-medium leading-7"><a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)]">{article.title} ↗</a></h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-body)]">{article.summary}</p>
              <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]"><span className="font-medium text-[var(--accent)]">Why this read: </span>{article.reason}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {article.itemId ? <Link className={button} href={`/items/${article.itemId}`}>Open reader</Link> : <button className={button} disabled={!!busy} onClick={() => void act(article, "save")}>{busy === article.id ? "Working…" : "Save to library"}</button>}
                {article.status === "unread" ? <>
                  <button className={button} disabled={!!busy} onClick={() => void act(article, "read")}>Mark read</button>
                  <button className={button} disabled={!!busy} onClick={() => void act(article, "skipped")}>Skip</button>
                </> : <button className={button} disabled={!!busy} onClick={() => void act(article, "unread")}>Back to today's list</button>}
              </div>
            </article>
          ))}
          {finished.length > 0 && <button className="text-xs text-[var(--text-muted)] underline" onClick={() => setShowFinished(!showFinished)}>{showFinished ? "Hide finished articles" : `Show ${finished.length} saved, read or skipped`}</button>}
          <p className="pt-2 text-center font-mono text-[11px] text-[var(--text-faint)]">End of edition. No more to load.</p>
        </section>
      )}
    </div>
  );
}
