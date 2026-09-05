import { renderMarkdownHtml } from "./lib/markdown-html.ts";
import { getHighlighter } from "./lib/shiki.ts";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/hl") {
        await getHighlighter();
        return Response.json({ highlighter: "ok" });
      }
      const html = await renderMarkdownHtml("# T\n\n```python\ndef f():\n    return 1\n```\n");
      return Response.json({ ok: true, shiki: html.includes("shiki-themes"), len: html.length, head: html.slice(0, 150) });
    } catch (e) {
      return Response.json({ ok: false, error: String(e && e.stack || e).slice(0, 2000) }, { status: 500 });
    }
  },
};
