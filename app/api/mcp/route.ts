import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bearerUserFromToken } from "@/lib/auth";
import { searchAll } from "@/lib/search";

export const runtime = "nodejs";

const SERVER = { name: "hoard", version: "0.1.0" };

const TOOLS = [
  {
    name: "search_items",
    description: "Keyword-search saved items and notes. Returns Markdown-ready hits.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_item",
    description: "Read one saved item as clean Markdown with its source URL.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Item id" } },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description: "Create a note (starts at revision v1).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        markdown: { type: "string" },
        project: { type: "string" },
      },
      required: ["title", "markdown"],
    },
  },
  {
    name: "update_note",
    description: "Update a note's Markdown. Writes a new revision authored by the agent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        markdown: { type: "string" },
        summary: { type: "string" },
      },
      required: ["id", "markdown"],
    },
  },
  {
    name: "list_tags",
    description: "List the user's tags.",
    inputSchema: { type: "object", properties: {} },
  },
];

type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcErr(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function textResult(text: string) {
  return { content: [{ type: "text", text }] };
}

async function handleOne(body: RpcReq, req: Request) {
  const id = body.id ?? null;
  const method = body.method ?? "";

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 202 });
  }
  if (method === "initialize") {
    return NextResponse.json(
      rpcOk(id, {
        protocolVersion: "2024-11-05",
        serverInfo: SERVER,
        capabilities: { tools: {} },
      })
    );
  }

  // Everything else needs a bearer token.
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^bearer\s+(.+)$/i);
  if (!m) return NextResponse.json(rpcErr(id, -32001, "Missing bearer token. Issue one in Hoard → Settings → Agent tokens."), { status: 401 });
  const user = await bearerUserFromToken(m[1].trim());
  if (!user) return NextResponse.json(rpcErr(id, -32001, "Invalid token. Issue a fresh one in Hoard → Settings."), { status: 401 });

  if (method === "tools/list") {
    return NextResponse.json(rpcOk(id, { tools: TOOLS }));
  }

  if (method === "tools/call") {
    const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const name = params.name ?? "";
    const args = params.arguments ?? {};
    try {
      switch (name) {
        case "search_items": {
          const query = String(args.query ?? "");
          const limit = Number(args.limit ?? 10) || 10;
          const hits = await searchAll(user.id, query, Math.min(limit, 30));
          const md =
            hits.length === 0
              ? `No matches for "${query}".`
              : hits.map((h) => `## ${h.title}\n_kind: ${h.kind} · id: \`${h.id}\`_${h.sourceUrl ? ` · [source](${h.sourceUrl})` : ""}\n\n${h.snippet}`).join("\n\n---\n\n");
          return NextResponse.json(rpcOk(id, textResult(md)));
        }
        case "get_item": {
          const itemId = String(args.id ?? "");
          const item = await getDb().item.findFirst({ where: { id: itemId, userId: user.id } });
          if (!item) return NextResponse.json(rpcErr(id, -32002, "Item not found."));
          const md = `# ${item.title}\n\n${item.sourceUrl ? `[Original](${item.sourceUrl})\n\n` : ""}${item.markdown}`;
          return NextResponse.json(rpcOk(id, textResult(md)));
        }
        case "create_note": {
          const title = String(args.title ?? "Untitled").slice(0, 300);
          const markdown = String(args.markdown ?? "").slice(0, 200_000);
          const project = String(args.project ?? "").slice(0, 80);
          const note = await getDb().note.create({
            data: {
              userId: user.id,
              title,
              markdown,
              project,
              revisions: { create: [{ version: 1, author: "Agent", summary: "Created via MCP", markdown }] },
            },
          });
          return NextResponse.json(rpcOk(id, textResult(`Saved note "${note.title}" (id: \`${note.id}\`, v1).`)));
        }
        case "update_note": {
          const noteId = String(args.id ?? "");
          const markdown = String(args.markdown ?? "").slice(0, 200_000);
          const summary = String(args.summary ?? "Updated via MCP").slice(0, 200);
          const note = await getDb().note.findFirst({
            where: { id: noteId, userId: user.id },
            include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
          });
          if (!note) return NextResponse.json(rpcErr(id, -32002, "Note not found."));
          const next = (note.revisions[0]?.version ?? 0) + 1;
          await getDb().$transaction([
            getDb().noteRevision.create({ data: { noteId, version: next, author: "Agent", summary, markdown } }),
            getDb().note.update({ where: { id: noteId }, data: { markdown } }),
          ]);
          return NextResponse.json(rpcOk(id, textResult(`Updated note "${note.title}" → v${next}.`)));
        }
        case "list_tags": {
          const tags = await getDb().tag.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
          const md = tags.length ? tags.map((t) => `- ${t.name}`).join("\n") : "No tags yet.";
          return NextResponse.json(rpcOk(id, textResult(md)));
        }
        default:
          return NextResponse.json(rpcErr(id, -32601, `Unknown tool: ${name}`));
      }
    } catch (e) {
      return NextResponse.json(rpcErr(id, -32603, e instanceof Error ? e.message : "Tool failed."));
    }
  }

  return NextResponse.json(rpcErr(id, -32601, `Unknown method: ${method}`));
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON." } }, { status: 400 });
  }
  if (Array.isArray(body)) {
    const out: unknown[] = [];
    for (const b of body.slice(0, 25)) {
      const r = await handleOne(b as RpcReq, req);
      if (r.status === 202) continue;
      out.push(await r.json());
    }
    return NextResponse.json(out, { headers: { "Content-Type": "application/json" } });
  }
  const r = await handleOne(body as RpcReq, req);
  return r;
}

export async function GET() {
  return NextResponse.json({ name: "hoard", mcp: true, endpoint: "/api/mcp", transport: "streamable-http" });
}
