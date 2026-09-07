"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiJson } from "@/components/api";
import { domainOf } from "@/components/Shell";
import type { DiscoveryResponse, DigestView } from "@/lib/discovery";
import { DEFAULT_TOPICS, DISCOVERY_SOURCES, slotLabel } from "@/lib/discovery-sources";

type Article = DigestView["articles"][number];
type Edition = { day: string; slot: number };

/** Lead-image thumbnail with lazy og:image resolution. Stored imageUrl (feed
 * enclosure or Tinyfish og:image) renders immediately; cards missing one ask
 * /api/discover/og once, which backfills the article for later loads.
 * Falls back to a domain-initial badge — no third-party favicon service. */
function ArticleThumb({ article }: { article: Article }) {
  const [src, setSrc] = useState(article.imageUrl || "");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(article.imageUrl || "");
    setFailed(false);
    if (article.imageUrl) return;
    let cancelled = false;
    fetch(`/api/discover/og?url=${encodeURIComponent(article.url)}`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json().catch(() => null)) as { imageUrl?: string | null } | null;
        if (!cancelled && data?.imageUrl) setSrc(data.imageUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [article.id, article.imageUrl, article.url]);
  if (!src || failed) {
    const host = domainOf(article.url);
    return <div aria-hidden="true" className="flex h-36 w-full shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-[var(--bg)] font-mono text-xl text-[var(--text-faint)] sm:h-28 sm:w-40">{(host[0] ?? "?").toUpperCase()}</div>;
  }
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-36 w-full shrink-0 rounded-md border border-[var(--border-soft)] object-cover sm:h-28 sm:w-40" />;
}
const button = "rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)] disabled:opacity-50";
const field = "mt-1.5 w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none";
const editionKey = (e: Edition) => `${e.day}|${e.slot}`;

export default function DiscoverPage() {
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [topics, setTopics] = useState("");
  const [seeds, setSeeds] = useState("");
  const [budget, setBudget] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  // Null = latest edition (server default); otherwise a pinned {day, slot}.
  const [edition, setEdition] = useState<Edition | null>(null);
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [dailyTopics, setDailyTopics] = useState(DEFAULT_TOPICS);
  const [dailyBudget, setDailyBudget] = useState(30);
  const [sourceIds, setSourceIds] = useState<string[]>(DISCOVERY_SOURCES.map((source) => source.id));

  const load = useCallback(async (initialize = false, signal?: AbortSignal) => {
    try {
      const qs = edition ? `?day=${edition.day}&slot=${edition.slot}` : "";
      const response = await fetch(`/api/discover${qs}`, { cache: "no-store", signal });
      const next = await apiJson<DiscoveryResponse & { error?: string }>(response);
      if (!response.ok) throw new Error(next.error ?? "Could not load discovery.");
      setData(next);
      setError("");
      if (initialize && next.preferences) {
        setTopics(next.preferences.topics);
        setSeeds(next.preferences.seeds.join("\n"));
        setBudget(next.preferences.budget);
      }
      if (initialize && next.schedule) {
        setDailyEnabled(next.schedule.enabled); setDailyTopics(next.schedule.topics);
        setDailyBudget(next.schedule.budget); setSourceIds(next.schedule.sourceIds);
      }
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load discovery.");
    }
  }, [edition]);

  useEffect(() => {
    const controller = new AbortController();
    void load(true, controller.signal);
    return () => controller.abort();
  }, [load]);

  const digest = data?.digest;
  const running = digest?.status === "starting" || digest?.status === "running";
  useEffect(() => {
    if (!running && !data?.schedule?.enabled) return;
    const controller = new AbortController();
    // Slow polling is deliberate: there is no live feed to keep watching.
    const timer = setInterval(() => { void load(false, controller.signal); }, running ? 35_000 : 300_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [running, data?.schedule?.enabled, load]);

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
      setEdition(null);
      setData(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start discovery."); }
    finally { setBusy(null); }
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault(); setBusy("schedule"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/discover", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: dailyEnabled, topics: dailyTopics, budget: dailyBudget, sourceIds }),
      });
      const next = await apiJson<DiscoveryResponse & { error?: string }>(response);
      if (!response.ok) throw new Error(next.error ?? "Could not save schedule.");
      setData(next);
      setNotice(dailyEnabled ? "Discovery is enabled. A fresh edition lands every 3 hours, automatically." : "Scheduled editions are paused.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save schedule."); }
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
  const latest = data?.editions[0];
  const viewingLatest = !edition || (latest !== undefined && editionKey(edition) === editionKey(latest));
  const canStart = viewingLatest && (!digest || (digest.origin !== "scheduled" && digest.status === "failed" && digest.attempts < 2));

  function pickEdition(value: string) {
    setShowFinished(false);
    if (!value) {
      setEdition(null);
      return;
    }
    const [day, slot] = value.split("|");
    setEdition({ day, slot: Number(slot) });
  }

  return (
    <div className="space-y-6 text-[var(--text)]">
      <header>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-[var(--accent)]">A little curiosity. A clear stopping point.</p>
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] sm:text-[26px]">Discover</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">Hacker News, independent blogs and tech newsletters, collected every three hours. Tinyfish reads a shortlist for you. Up to five reads per edition, then get on with your day.</p>
      </header>

      {data && data.editions.length > 0 && <label className="block text-sm text-[var(--text-muted)]">Edition
        <select className={field} value={edition ? editionKey(edition) : ""} onChange={(e) => pickEdition(e.target.value)}>
          <option value="">Latest</option>
          {data.editions.map((e) => <option key={editionKey(e)} value={editionKey(e)}>{slotLabel(e.day, e.slot)} · {e.status}</option>)}
        </select>
      </label>}

      {error && <div role="alert" className="rounded-lg border border-[var(--border)] p-3 text-sm">{error} <button className="ml-2 underline" onClick={() => void load(!data)}>Check again</button></div>}
      {notice && <p role="status" className="text-sm text-[var(--text-muted)]">{notice}</p>}
      {!data && !error && <p role="status" className="text-sm text-[var(--text-muted)]">Loading your latest edition…</p>}

      {data && <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{data.schedule?.enabled ? "Scheduled discovery is on" : "Automatic discovery every 3 hours"}</h2>
          <span className="font-mono text-xs text-[var(--text-muted)]">00 · 03 · 06 · 09 · 12 · 15 · 18 · 21 UTC</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{data.schedule?.enabled ? "Your sources are checked automatically, even when this page is closed. Each edition is usually ready ~15 minutes after its slot starts." : "Enable once to get a fresh edition every 3 hours, without starting a crawl yourself."}</p>
        {data.schedule?.enabled && <p className="mt-2 text-xs text-[var(--text-faint)]">Next edition: {new Date(data.schedule.nextRunAt).toLocaleString()} (your timezone). {data.schedule.lastRunAt && `Last checked: ${new Date(data.schedule.lastRunAt).toLocaleString()}.`}</p>}
        {data.schedule?.lastError && <p className="mt-2 text-xs text-[var(--text-muted)]" role="status">{data.schedule.lastError}</p>}
        <details className="mt-4" open={!data.schedule}>
          <summary className="cursor-pointer text-sm text-[var(--accent)]">Sources and schedule preferences</summary>
          <form onSubmit={saveSchedule} className="mt-4 space-y-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dailyEnabled} onChange={(e) => setDailyEnabled(e.target.checked)} /> Automatically prepare an edition every 3 hours</label>
            <label className="block text-sm">Interests<textarea className={field} rows={3} minLength={3} maxLength={500} required value={dailyTopics} onChange={(e) => setDailyTopics(e.target.value)} /></label>
            <label className="block text-sm">Reading budget<select className={field} value={dailyBudget} onChange={(e) => setDailyBudget(Number(e.target.value))}>{[10, 20, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-medium">Your source collection</legend>
              {DISCOVERY_SOURCES.map((source) => {
                const health = data.schedule?.sourceHealth.find((entry) => entry.id === source.id);
                return <div key={source.id} className="flex items-start gap-2">
                  <input id={`source-${source.id}`} className="mt-1" type="checkbox" checked={sourceIds.includes(source.id)} onChange={(e) => setSourceIds((ids) => e.target.checked ? [...ids, source.id] : ids.filter((id) => id !== source.id))} />
                  <div className="text-sm"><label htmlFor={`source-${source.id}`} className="font-medium">{source.name}</label> <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${source.name}`} className="text-[var(--accent)]">↗</a>
                    <p className="text-xs leading-5 text-[var(--text-muted)]">{source.description}</p>
                    {health && <p className="text-[11px] text-[var(--text-faint)]">{health.error ? `Last check: ${health.error}` : `${health.count} recent links on last check`}</p>}
                  </div>
                </div>;
              })}
            </fieldset>
            <p className="text-xs leading-5 text-[var(--text-faint)]">Public feeds and Hacker News need no API key. One Tinyfish run per edition, up to five browser minutes. If it fails, clearly labelled publisher previews still appear. Paid newsletter content is not unlocked.</p>
            <button className={button} type="submit" disabled={!!busy || !sourceIds.length}>{busy === "schedule" ? "Saving…" : "Save preferences"}</button>
          </form>
        </details>
      </section>}

      {data && !data.configured && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-5">
          <h2 className="font-medium">Connect Tinyfish</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Add <code>TINYFISH_API_KEY</code> to your server environment and restart the app. For Cloudflare, add it as a Worker secret. Your key stays on the server.</p>
          <a href="https://agent.tinyfish.ai/api-keys" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-[var(--accent)] underline">Get a Tinyfish API key ↗</a>
        </section>
      )}

      {data && canStart && !data.schedule?.enabled && (
        <form onSubmit={start} className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-5">
          <label className="block text-[13px] font-medium">What do you want to learn about?
            <textarea className={field} rows={3} required minLength={3} maxLength={500} value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="e.g. building AI agents, independent software, thoughtful engineering write-ups" />
          </label>
          <label className="block text-[13px] font-medium">Favourite blogs <span className="font-normal text-[var(--text-muted)]">· optional, up to 3, one URL per line</span>
            <textarea className={field} rows={3} maxLength={6200} value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder={"https://simonwillison.net/\nhttps://jvns.ca/"} />
          </label>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="text-[13px] font-medium">Reading budget
              <select className={field} value={budget} onChange={(e) => setBudget(Number(e.target.value))}>
                {[10, 20, 30].map((n) => <option key={n} value={n}>{n} minutes</option>)}
              </select>
            </label>
            <button type="submit" disabled={!!busy || !data.configured} className="rounded-[6px] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hi)] disabled:opacity-50">
              {busy === "crawl" ? "Starting…" : digest?.status === "failed" ? "Retry this edition" : "Find today's reads"}
            </button>
          </div>
          <p className="text-xs leading-5 text-[var(--text-faint)]">One edition per 3-hour slot. Each crawl uses your Tinyfish account credits and runs for up to five minutes. Reading times are estimates.</p>
        </form>
      )}

      {digest?.status === "failed" && <p role="status" className="text-sm text-[var(--text-muted)]">{digest.error} {digest.attempts >= 2 && "This edition's two attempts are used. The next slot starts fresh."}</p>}

      {data?.schedule?.enabled && !digest && <p role="status" className="text-sm text-[var(--text-muted)]">This slot's edition hasn't started yet. The scheduler checks every five minutes; you don't need to keep this page open.</p>}

      {running && <section role="status" className="rounded-lg border border-[var(--border)] p-6">
        <h2 className="text-lg font-medium">Tinyfish is out reading.</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Finding blogs and checking articles about {digest?.topics}. This usually takes a few minutes. You can leave this page and come back; your crawl will still be here.</p>
        <button className={`${button} mt-4`} onClick={() => void load()}>Check progress</button>
      </section>}

      {digest?.status === "ready" && (
        <section className="space-y-4">
          {digest.error && <p role="status" className="text-sm text-[var(--text-muted)]">{digest.error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-3">
            <h2 className="text-sm font-medium">Your {slotLabel(digest.day, digest.slot)} edition</h2>
            <p className="font-mono text-xs text-[var(--text-muted)]">{remaining.length} left · ~{remaining.reduce((sum, a) => sum + a.minutes, 0)} min</p>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{digest.topics} · {digest.budget}-minute budget</p>
          {remaining.length === 0 && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-7">
            <h3 className="text-xl font-medium">{digest.articles.length ? "You're done with this edition." : "Nothing worth adding this time."}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{digest.articles.length ? "Your reading list has an end. Take something you learned and go make something." : "No new articles met your filters and reading budget. A short list beats filler."} The next edition lands on the next slot.</p>
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
              <div className="mt-2 flex flex-col gap-4 sm:flex-row">
                <ArticleThumb article={article} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-[var(--text-body)]">{article.summary}</p>
                  <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]"><span className="font-medium text-[var(--accent)]">Why this read: </span>{article.reason}</p>
                </div>
              </div>
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
