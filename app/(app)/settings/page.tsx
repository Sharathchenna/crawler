"use client";

import { useEffect, useState } from "react";
import { MCP_CLIENTS, buildConfig } from "@/lib/mcp-config";

type TokenRow = { id: string; client: string; createdAt: string; lastUsedAt?: string | null };

export default function SettingsPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [client, setClient] = useState("claude-code");
  const [copied, setCopied] = useState<string | null>(null);
  const [mcpName, setMcpName] = useState("hoard");
  const [origin, setOrigin] = useState("");

  async function load() {
    const res = await fetch("/api/tokens");
    if (res.ok) setTokens(await res.json());
  }
  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, []);

  async function issue() {
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: "web" }),
    });
    const data = await res.json();
    if (res.ok) {
      setFresh(data.token);
      load();
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const mcpUrl = `${origin}/api/mcp`;
  const cfg = buildConfig(client, mcpName || "hoard", mcpUrl);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text)]">Settings</h1>
        <p className="text-[13px] text-[var(--text-muted)]">Plan: personal · Markdown-first, agent-ready.</p>
      </section>

      <section className="elevated rounded-[10px] p-4">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text)]">Agent tokens</h2>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Tokens let the CLI, MCP clients, and the iOS app read and write as you. Shown once — copy it now.
        </p>
        <button
          onClick={issue}
          className="mt-3 rounded-[6px] bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--accent-hi)] hover:shadow-[0_0_12px_var(--accent-glow)]"
        >
          Issue token
        </button>
        {fresh && (
          <div className="mt-3 rounded-[8px] border border-[var(--green)] p-3">
            <p className="break-all font-mono text-[12px] text-[var(--text)]">{fresh}</p>
            <button
              onClick={() => copy(fresh, "token")}
              className="mt-2 rounded-[6px] border border-[var(--border)] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
            >
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        <ul className="mt-3 flex flex-col gap-1">
          {tokens.map((t) => (
            <li key={t.id} className="font-mono text-[11px] text-[var(--text-faint)]">
              {t.client} · {new Date(t.createdAt).toLocaleDateString()}
              {t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}` : " · never used"}
            </li>
          ))}
          {!tokens.length && <li className="font-mono text-[11px] text-[var(--text-faint)]">No tokens yet.</li>}
        </ul>
      </section>

      <section className="elevated rounded-[10px] p-4">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text)]">Connect an MCP client</h2>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">Pick your agent, copy the snippet, paste it into the client.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            aria-label="MCP client"
            className="rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          >
            {MCP_CLIENTS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} — {c.hint}
              </option>
            ))}
          </select>
          <input
            value={mcpName}
            onChange={(e) => setMcpName(e.target.value)}
            aria-label="Server name"
            placeholder="server name"
            className="rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
        <p className="mt-3 font-mono text-[11px] text-[var(--text-faint)]">{cfg.label}</p>
        <pre className="mt-1 overflow-x-auto rounded-[8px] bg-[var(--bg)] p-3 font-mono text-[12px] text-[var(--text-body)]">{cfg.snippet}</pre>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">{cfg.instruction}</p>
        <button
          onClick={() => copy(cfg.snippet, "snippet")}
          className="mt-2 rounded-[6px] border border-[var(--border)] px-2 py-1 font-mono text-[11px] text-[var(--text-body)] hover:bg-[var(--bg-hover)]"
        >
          {copied === "snippet" ? "Copied" : "Copy snippet"}
        </button>
        <div aria-live="polite" className="mt-2 font-mono text-[11px] text-[var(--text-faint)]">
          Needs a token: add `Authorization: Bearer hoard_…` in your client if it asks for headers.
        </div>
      </section>
    </div>
  );
}
