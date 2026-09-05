import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { visit } from "unist-util-visit";
import hljs from "highlight.js";
import type { BundledLanguage } from "shiki";
import type { HighlighterCore } from "shiki/core";
import { getHighlighter, SHIKI_THEMES } from "./shiki";

// Languages the reader highlights (canonical Shiki ids). Common fence
// aliases map to these; anything else falls back to plaintext —
// no guessing, no wrong labels.
const HIGHLIGHT_LANGS: BundledLanguage[] = [
  "python",
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "shellscript",
  "json",
  "jsonc",
  "yaml",
  "toml",
  "sql",
  "html",
  "css",
  "markdown",
  "diff",
  "docker",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "lua",
  "xml",
  "ini",
  "powershell",
];

const LANG_ALIASES: Record<string, BundledLanguage> = {
  py: "python",
  js: "javascript",
  ts: "typescript",
  sh: "shellscript",
  bash: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  console: "shellscript",
  yml: "yaml",
  md: "markdown",
  dockerfile: "docker",
  ps1: "powershell",
  "c++": "cpp",
  "c#": "csharp",
  html: "html",
  vue: "html",
};

// Tags that are explicitly not code: never highlight, never detect.
const EXPLICIT_PLAIN = new Set([
  "plaintext",
  "plain",
  "text",
  "txt",
  "nohighlight",
  "no-highlight",
  "output",
  "log",
]);

// highlight.js ids eligible for detection. Kept to languages Shiki can
// render (mapped below) and common in articles; confusable rarities
// (dart, perl, scala, …) are excluded so they can't steal labels.
const DETECT_SUBSET = [
  "python", "javascript", "typescript", "bash", "shell", "json", "yaml",
  "sql", "css", "xml", "markdown", "diff", "dockerfile", "go", "rust",
  "java", "c", "cpp", "csharp", "php", "ruby", "swift", "kotlin", "lua",
  "powershell", "ini", "http", "makefile", "nginx", "toml",
].filter((l) => hljs.getLanguage(l));

const HLJS_TO_SHIKI: Record<string, BundledLanguage> = {
  bash: "shellscript",
  shell: "shellscript",
  dockerfile: "docker",
};

const MIN_DETECT_CHARS = 20;
const MIN_DETECT_RELEVANCE = 5;
// Marginal guesses (e.g. short YAML) are accepted only with a clear margin
// over the runner-up — this keeps stack traces and prose out while
// admitting terse-but-decisive snippets.
const MIN_MARGINAL_RELEVANCE = 4;
const MIN_MARGIN = 2;

/**
 * Guess the language of an untagged (or mistagged) block with
 * highlight.js, gated for precision over coverage: short samples and
 * low-relevance guesses stay plaintext. Returns a canonical Shiki id or
 * null. Never throws.
 */
function detectLanguage(text: string): BundledLanguage | null {
  try {
    const sample = text.slice(0, 4000);
    if (sample.trim().length < MIN_DETECT_CHARS) return null;
    const result = hljs.highlightAuto(sample, DETECT_SUBSET);
    if (!result.language) return null;
    const top = result.relevance;
    const second = result.secondBest?.relevance ?? 0;
    const confident =
      top >= MIN_DETECT_RELEVANCE ||
      (top >= MIN_MARGINAL_RELEVANCE && top - second >= MIN_MARGIN);
    if (!confident) return null;
    const canonical = (HLJS_TO_SHIKI[result.language] ?? result.language) as BundledLanguage;
    if (!(HIGHLIGHT_LANGS as readonly string[]).includes(canonical)) return null;
    return canonical;
  } catch {
    return null;
  }
}

function codeText(node: any): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === "text") parts.push(n.value);
    else if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(node);
  return parts.join("");
}

/**
 * Rehype plugin: wrap every fenced block in the reader's card chrome, with
 * a language label header when the tag is known. Runs BEFORE syntax
 * highlighting (which only rewrites the inner <code>), so it reads the
 * reliable `language-*` class from remark. Unknown/unlabeled fences get the
 * same card (consistent surface + containment) with plaintext content and
 * no label — no guessing, no wrong labels.
 */
function codeChrome() {
  return (tree: any) => {
    visit(tree, "element", (node: any, index: number | undefined, parent: any) => {
      if (node.tagName !== "pre" || !Array.isArray(node.children)) return;
      const code = node.children.find((c: any) => c.tagName === "code");
      if (!code) return;
      const classes: string[] = code?.properties?.className ?? [];
      const langClass = classes.find((c) => c.startsWith("language-"));
      const raw = langClass?.slice("language-".length).toLowerCase() ?? "";
      const setClass = (id: string | null) => {
        if (!code?.properties) return;
        const rest = (classes as string[]).filter((c) => c !== langClass);
        code.properties.className = id ? [...rest, `language-${id}`] : rest;
      };
      let label = "";
      if (raw && EXPLICIT_PLAIN.has(raw)) {
        setClass(null);
      } else {
        const mapped = (LANG_ALIASES[raw] ?? raw) as BundledLanguage;
        if (raw && (HIGHLIGHT_LANGS as readonly string[]).includes(mapped)) {
          // Known tag (aliases normalized so the loader finds the grammar).
          if (mapped !== raw) setClass(mapped);
          label = mapped;
        } else {
          // Untagged or mistagged fence: detect, else plaintext.
          const detected = detectLanguage(codeText(code));
          if (detected) {
            setClass(detected);
            label = detected;
          } else {
            setClass(null);
          }
        }
      }
      if (!parent || index == null) return;
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: { className: ["codeblock"] },
        children: [
          ...(label
            ? [
                {
                  type: "element",
                  tagName: "div",
                  properties: { className: ["codeblock-head"] },
                  children: [
                    {
                      type: "element",
                      tagName: "span",
                      properties: {},
                      children: [{ type: "text", value: label }],
                    },
                  ],
                },
              ]
            : []),
          node,
        ],
      };
    });
  };
}

let processorPromise: Promise<ReturnType<typeof buildProcessor>> | null = null;

// HighlighterCore's generics don't satisfy HighlighterGeneric<any, any>
// under strict variance (a types-only artifact — the runtime shape is
// proven working on workerd), so the single handoff is asserted.
function buildProcessor(highlighter: HighlighterCore) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(codeChrome)
    .use(
      rehypeShikiFromHighlighter,
      highlighter as Parameters<typeof rehypeShikiFromHighlighter>[0],
      {
        // Dual themes: dark is the default canvas; light wins under html.light
        // (see the [data-theme] rules in globals.css).
        themes: SHIKI_THEMES,
        defaultLanguage: "plaintext",
        fallbackLanguage: "plaintext",
        // A single bad block must never fail the whole document.
        onError: () => {},
      }
    )
    .use(rehypeStringify);
}

async function processor() {
  if (!processorPromise) {
    processorPromise = getHighlighter().then((highlighter) => buildProcessor(highlighter));
  }
  return processorPromise;
}

/**
 * Render stored Markdown to reader HTML (server-side): full GFM support
 * (tables, task lists, strikethrough, autolinks) with Shiki (VS Code-grade)
 * syntax highlighting. Raw HTML in the source is escaped, never executed.
 * Never throws: on renderer failure it returns escaped plaintext so a bad
 * document can never 500 the reader.
 */
export async function renderMarkdownHtml(md: string): Promise<string> {
  try {
    const file = await (await processor()).process(md || "");
    return String(file);
  } catch (e) {
    console.error("[markdown-html] render failed:", e);
    const err = (e instanceof Error ? e.message : String(e)).replace(/-->/g, "--&gt;");
    const esc = (md || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return (
      `<!--markdown-fallback:${err}-->` +
      esc
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("")
    );
  }
}
