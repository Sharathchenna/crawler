#!/usr/bin/env node
// hoard CLI — talks to the same backend agents use over MCP.
// Config: ~/.hoard/config.json { apiUrl, token, client, cfAccessId?, cfAccessSecret? }
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";

const DIR = join(homedir(), ".hoard");
const CONFIG_PATH = join(DIR, "config.json");

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveConfig(cfg) {
  await mkdir(DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function needToken(cfg) {
  if (!cfg.token) {
    console.error("Not logged in. Run `hoard login <client>` first (grab a token from Hoard → Settings → Agent tokens).");
    process.exit(1);
  }
}

async function accessHeaders(cfg) {
  // Cloudflare Access service-token headers (checked at the edge).
  // Needed only when the API sits behind Access; harmless otherwise.
  const id = cfg.cfAccessId ?? process.env.HOARD_CF_ACCESS_ID ?? "";
  const secret = cfg.cfAccessSecret ?? process.env.HOARD_CF_ACCESS_SECRET ?? "";
  if (!id || !secret) return {};
  return { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret };
}

async function api(cfg, path, opts = {}) {
  const url = `${cfg.apiUrl.replace(/\/$/, "")}${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
        ...(await accessHeaders(cfg)),
        ...(opts.headers ?? {}),
      },
    });
  } catch {
    console.error(`Couldn't reach ${url}.\nFix: check --api-url and that the Hoard server is running.`);
    process.exit(1);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(data.error ?? `Request failed (${res.status}).`);
    process.exit(1);
  }
  return data;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => {
    rl.close();
    resolve(a.trim());
  }));
}

function parseFlags(args) {
  const out = { apiUrl: null, type: null, rest: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--api-url" && args[i + 1]) {
      out.apiUrl = args[++i];
    } else if ((args[i] === "--type" || args[i] === "-t") && args[i + 1]) {
      out.type = args[++i];
    } else {
      out.rest.push(args[i]);
    }
  }
  return out;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "untitled";
}

const [cmd, ...rawArgs] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help") {
  console.log(`hoard — save anything as Markdown

Usage:
  hoard login <client> [--api-url URL]     Connect (paste a token from Settings → Tokens)
  hoard search "<query>" [--type x|repo|page|note]   Search notes + items
  hoard save <url>                         Capture a URL
  hoard export [dir]                       Export everything as .md files
`);
  process.exit(0);
}

if (cmd === "login") {
  const { apiUrl, rest } = parseFlags(rawArgs);
  const clientName = rest[0] ?? "cli";
  const cfg = await loadConfig();
  const base = apiUrl ?? cfg.apiUrl ?? process.env.HOARD_API_URL ?? "http://localhost:3000";
  let token = process.env.HOARD_TOKEN ?? "";
  if (!token && !process.stdin.isTTY) {
    // allow piping: echo TOKEN | hoard login
    token = (await new Promise((resolve) => {
      let s = "";
      process.stdin.on("data", (d) => (s += d));
      process.stdin.on("end", () => resolve(s.trim()));
    }));
  }
  if (!token) token = await prompt("Paste your Hoard token (Settings → Agent tokens): ");
  if (!token) {
    console.error("No token given. Issue one in Hoard → Settings → Agent tokens.");
    process.exit(1);
  }
  // Cloudflare Access service token (only needed if the API sits behind
  // Access; create one in Zero Trust → Access → Service Tokens).
  const next = { apiUrl: base, token, client: clientName };
  const cfId = (await prompt("Access Client ID (empty to skip): ")) || cfg.cfAccessId || "";
  const cfSecret = cfId ? await prompt("Access Client Secret: ") : cfg.cfAccessSecret || "";
  if (cfId && cfSecret) {
    next.cfAccessId = cfId;
    next.cfAccessSecret = cfSecret;
  }
  // whoami-style verify
  await api(next, `/api/search?q=${encodeURIComponent("a")}`).catch(() => {});
  // verify more strictly: search worked or token endpoint reachable; fall back to tags
  try {
    await api(next, "/api/tags");
  } catch {
    process.exit(1);
  }
  await saveConfig(next);
  console.log(`→ ${clientName} connected with read and write access`);
  process.exit(0);
}

if (cmd === "search") {
  const { apiUrl, type, rest } = parseFlags(rawArgs);
  const cfg = await loadConfig();
  if (apiUrl) cfg.apiUrl = apiUrl;
  needToken(cfg);
  const q = rest.join(" ");
  if (!q) {
    console.error('Usage: hoard search "<query>" [--type x|repo|page|note]');
    process.exit(1);
  }
  const params = new URLSearchParams({ q });
  if (type) params.set("type", type);
  const hits = await api(cfg, `/api/search?${params}`);
  const notes = hits.filter((h) => h.kind === "note");
  const items = hits.filter((h) => h.kind === "item");
  console.log(`${notes.length} notes · ${items.length} items`);
  for (const h of hits) {
    const via = h.via && h.via !== "keyword" ? ` ~${h.via}` : "";
    console.log(`- [${h.kind}] ${h.title} (${h.id})${via}`);
    if (h.snippet) console.log(`    ${h.snippet.slice(0, 140)}`);
  }
  process.exit(0);
}

if (cmd === "save") {
  const { apiUrl, rest } = parseFlags(rawArgs);
  const cfg = await loadConfig();
  if (apiUrl) cfg.apiUrl = apiUrl;
  needToken(cfg);
  const url = rest[0];
  if (!url) {
    console.error("Usage: hoard save <url>");
    process.exit(1);
  }
  const item = await api(cfg, "/api/capture", { method: "POST", body: JSON.stringify({ url }) });
  console.log(`Saved: ${item.title}`);
  process.exit(0);
}

if (cmd === "export") {
  const { apiUrl, rest } = parseFlags(rawArgs);
  const cfg = await loadConfig();
  if (apiUrl) cfg.apiUrl = apiUrl;
  needToken(cfg);
  const dir = rest[0] ?? "hoard-export";
  await mkdir(dir, { recursive: true });
  const extraHeaders = await accessHeaders(cfg);
  const [itemsRes, notesRes] = await Promise.all([
    fetch(`${cfg.apiUrl.replace(/\/$/, "")}/api/items`, { headers: { Authorization: `Bearer ${cfg.token}`, ...extraHeaders } }),
    fetch(`${cfg.apiUrl.replace(/\/$/, "")}/api/notes`, { headers: { Authorization: `Bearer ${cfg.token}`, ...extraHeaders } }),
  ]);
  const items = await itemsRes.json();
  const notes = await notesRes.json();
  let count = 0;
  const front = (title, source, date, extra = {}) => {
    const lines = [`title: ${JSON.stringify(title)}`];
    if (source) lines.push(`source: ${JSON.stringify(source)}`);
    lines.push(`date: ${JSON.stringify(date)}`);
    if (extra.author) lines.push(`author: ${JSON.stringify(extra.author)}`);
    if (extra.published) lines.push(`published: ${JSON.stringify(extra.published)}`);
    if (extra.extracted) lines.push(`extracted: ${JSON.stringify(extra.extracted)}`);
    return `---\n${lines.join("\n")}\n---\n\n`;
  };
  for (const it of items) {
    const full = await api(cfg, `/api/items/${it.id}`);
    const name = `${slug(full.title)}-${full.id.slice(-6)}.md`;
    await writeFile(join(dir, name), `${front(full.title, full.sourceUrl ?? "", full.createdAt ?? "", { author: full.author ?? "", published: full.publishedAt ?? "", extracted: full.extractedAt ?? "" })}${full.markdown ?? ""}`);
    count++;
  }
  for (const n of notes) {
    const full = await api(cfg, `/api/notes/${n.id}`);
    const name = `note-${slug(full.title)}-${full.id.slice(-6)}.md`;
    await writeFile(join(dir, name), `${front(full.title, "", full.updatedAt ?? "")}${full.markdown ?? ""}`);
    count++;
  }
  console.log(`${count} files written to ${dir}/`);
  process.exit(0);
}

console.error(`Unknown command: ${cmd}. Run \`hoard help\`.`);
process.exit(1);
