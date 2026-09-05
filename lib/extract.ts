import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

export type Extracted = {
  title: string;
  markdown: string;
  excerpt: string;
  type: string;
};

function detectType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "video";
  if (u.endsWith(".pdf")) return "pdf";
  if (u.includes("x.com") || u.includes("twitter.com")) return "x";
  if (u.match(/\.(mp3|wav|m4a|ogg|flac)($|\?)/)) return "audio";
  if (u.match(/\.(png|jpe?g|gif|webp|svg)($|\?)/)) return "file";
  return "page";
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function extractUrl(url: string): Promise<Extracted> {
  const type = detectType(url);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Hoard/0.1 (+https://hoard.local; save-for-later)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } catch (e) {
    throw new Error(`Couldn't reach that page (${domainOf(url)}). Saved as a bookmark so you don't lose it.`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    throw new Error(`That page returned ${res.status}. Saved as a bookmark so you don't lose it.`);
  }
  if (!contentType.includes("html") && !contentType.includes("text")) {
    // Non-HTML: save as file bookmark
    return {
      title: url.split("/").pop() || domainOf(url),
      markdown: `[Original file](${url})\n\n_Saved as a file link — preview isn't available yet._`,
      excerpt: `File link from ${domainOf(url)}`,
      type: contentType.includes("pdf") ? "pdf" : type,
    };
  }
  const html = await res.text();
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const titleEl = doc.querySelector("title")?.textContent?.trim();
    const reader = new Readability(doc);
    const article = reader.parse();
    if (!article?.content) {
      const text = doc.body?.textContent?.slice(0, 4000) ?? "";
      const md = `# ${titleEl || domainOf(url)}\n\n[Original](${url})\n\n${text}`;
      return { title: titleEl || domainOf(url), markdown: md, excerpt: text.slice(0, 200), type };
    }
    const mdBody = turndown.turndown(article.content);
    const title = (article.title || titleEl || domainOf(url)).trim().slice(0, 300);
    const markdown = `# ${title}\n\n[Original](${url})\n\n${mdBody}`.slice(0, 200_000);
    const excerpt = (article.excerpt || article.textContent || "").trim().slice(0, 280);
    return { title, markdown, excerpt, type };
  } catch {
    throw new Error(`Couldn't parse that page cleanly. Saved as a bookmark so you don't lose it.`);
  }
}
