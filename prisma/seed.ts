import { db } from "../lib/db";
import { hashPassword, issueAgentToken } from "../lib/auth";

async function main() {
  const email = "demo@hoard.local";
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Demo user already exists:", email);
    return;
  }
  const user = await db.user.create({
    data: { email, password: hashPassword("password"), plan: "personal" },
  });

  const [reading, ideas] = await Promise.all([
    db.tag.create({ data: { userId: user.id, name: "reading" } }),
    db.tag.create({ data: { userId: user.id, name: "ideas" } }),
  ]);

  const itemsData = [
    {
      type: "page",
      title: "The design of everyday memory",
      sourceUrl: "https://example.com/everyday-memory",
      markdown: "# The design of everyday memory\n\n[Original](https://example.com/everyday-memory)\n\nTools that remember for us should be boring and fast. Capture first, organize later.",
      excerpt: "Tools that remember for us should be boring and fast.",
      status: "saved",
      tags: [reading.id],
    },
    {
      type: "x",
      title: "Thread: small models, big context",
      sourceUrl: "https://x.com/example/status/123",
      markdown: "# Thread: small models, big context\n\n[Original](https://x.com/example/status/123)\n\n1/ Give the model your notes, not the internet.\n2/ Markdown beats screenshots.\n3/ Search is the UI.",
      excerpt: "Give the model your notes, not the internet.",
      status: "inbox",
      tags: [ideas.id],
    },
    {
      type: "pdf",
      title: "Field notes — research methods (PDF)",
      sourceUrl: "https://example.com/methods.pdf",
      markdown: "# Field notes — research methods\n\n[Original](https://example.com/methods.pdf)\n\n_Write your own summary here after importing the PDF._",
      excerpt: "Imported PDF placeholder with room for your summary.",
      status: "saved",
      tags: [reading.id],
    },
    {
      type: "video",
      title: "Why capture beats curation",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      markdown: "# Why capture beats curation\n\n[Original](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\nKey idea: saving is cheap, refinding is the product.",
      excerpt: "Saving is cheap, refinding is the product.",
      status: "inbox",
      tags: [] as string[],
    },
    {
      type: "audio",
      title: "Voice memo: launch checklist",
      sourceUrl: null,
      markdown: "# Voice memo: launch checklist\n\n- Ship capture first\n- Search second\n- Sync third",
      excerpt: "Ship capture first, search second, sync third.",
      status: "saved",
      tags: [ideas.id],
    },
    {
      type: "page",
      title: "Markdown as an API",
      sourceUrl: "https://example.com/markdown-api",
      markdown: "# Markdown as an API\n\n[Original](https://example.com/markdown-api)\n\nIf an agent can read it and write it, it's an interface. Markdown is the interface.",
      excerpt: "If an agent can read it and write it, it's an interface.",
      status: "inbox",
      tags: [reading.id, ideas.id],
    },
  ];

  const createdItems = [];
  for (const d of itemsData) {
    const { tags, ...rest } = d;
    const item = await db.item.create({ data: { ...rest, userId: user.id } });
    for (const tagId of tags) {
      await db.itemTag.create({ data: { itemId: item.id, tagId } });
    }
    createdItems.push(item);
  }

  const note = await db.note.create({
    data: {
      userId: user.id,
      title: "Hoard launch notes",
      markdown: "# Hoard launch notes\n\n## v3\n\nShip MCP + CLI + Share Extension. Web reader is clean.\n\n## v2\n\nAdded revisions. Every save keeps history.\n\n## v1\n\nCapture works. Library lists everything.",
      project: "hoard",
      kind: "project",
    },
  });
  const revisions = [
    { version: 1, author: "You", summary: "First capture notes", markdown: "# Hoard launch notes\n\nCapture works. Library lists everything." },
    { version: 2, author: "You", summary: "Added revision history", markdown: "# Hoard launch notes\n\nAdded revisions. Every save keeps history." },
    { version: 3, author: "You", summary: "MCP + CLI plan", markdown: "# Hoard launch notes\n\nShip MCP + CLI + Share Extension. Web reader is clean." },
  ];
  for (const r of revisions) {
    await db.noteRevision.create({ data: { ...r, noteId: note.id } });
  }
  await db.noteSource.create({ data: { noteId: note.id, itemId: createdItems[0].id } });

  await db.agentToken.create({
    data: { userId: user.id, token: issueAgentToken(), client: "seed", scopes: "read,write" },
  });

  console.log("Seeded demo user demo@hoard.local / password");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
