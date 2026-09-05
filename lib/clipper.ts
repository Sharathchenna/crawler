// Hoard adapter over the vendored Obsidian Web Clipper
// (vendor/obsidian-clipper, MIT). This is the integration point for THEIR
// extraction pipeline: src/api.ts -> clip().
//
// Environment shims mirror the *intent* of the clipper's own
// scripts/build-cli.mjs banner, adapted for a Next.js server (see
// clipperApi() and primeClipperDOM() below).

import type {
  ClipResult,
  Template,
} from "../vendor/obsidian-clipper/src/api";
import { parseHTML } from "linkedom";

type ClipperApi = typeof import("../vendor/obsidian-clipper/src/api");

let apiPromise: Promise<ClipperApi> | null = null;

async function clipperApi(): Promise<ClipperApi> {
  if (!apiPromise) {
    // Minimal shims, mirroring the *intent* of the clipper's
    // scripts/build-cli.mjs banner. Deliberately NOT its `window` /
    // `document` globals: those poison server/client environment detection
    // (verified: breaks unrelated routes). Only two bare globals are always
    // safe (read at call time, never at module init):
    //   - DEBUG_MODE, read by src/utils/debug.ts on import;
    //   - DOMParser, read by defuddle fallback paths per conversion.
    // Turndown (bundled in defuddle/full) additionally needs a working
    // DOMParser visible as `window.DOMParser` AT ITS OWN MODULE INIT, so on
    // first init we expose a minimal fake window ({ DOMParser } only — no
    // document/location, so framework env detection stays server-side) and
    // delete it right after evaluation. Runs once per isolate; afterwards
    // apiPromise is set and no global is ever touched per request.
    // instrumentation.ts also calls primeClipperDOM() at boot so this path
    // is usually already warm before any request arrives.
    const g = globalThis as unknown as Record<string, unknown>;
    if (typeof g["DEBUG_MODE"] === "undefined") g["DEBUG_MODE"] = false;
    if (typeof g["DOMParser"] === "undefined") g["DOMParser"] = linkedomParser();
    const hadWindow = typeof g["window"] !== "undefined";
    if (!hadWindow) g["window"] = { DOMParser: g["DOMParser"] };
    try {
      apiPromise = import("../vendor/obsidian-clipper/src/api");
      await apiPromise;
    } finally {
      if (!hadWindow) delete g["window"];
    }
  }
  return apiPromise;
}

function linkedomParser(): unknown {
  const LP = function (this: unknown) {};
  (LP.prototype as Record<string, unknown>).parseFromString = function (html: string) {
    return parseHTML(html).document;
  };
  return LP;
}

// The clipper's default template (mirrors createDefaultTemplate() in
// vendor/obsidian-clipper/src/managers/template-manager.ts). Inlined rather
// than imported because that module pulls the extension's settings/storage/
// i18n graph (chrome.*), which has no meaning on the server.
function defaultTemplate(): Template {
  return {
    id: "hoard-default",
    name: "Default",
    behavior: "create",
    noteNameFormat: "{{title}}",
    path: "Clippings",
    noteContentFormat: "{{content}}",
    context: "",
    properties: [
      { name: "title", value: "{{title}}" },
      { name: "source", value: "{{url}}" },
      { name: "author", value: '{{author|split:", "|wikilink|join}}' },
      { name: "published", value: "{{published}}" },
      { name: "created", value: "{{date}}" },
      { name: "description", value: "{{description}}" },
      { name: "tags", value: "clippings" },
    ],
    triggers: [],
  };
}

/**
 * Parse HTML for the clipper pipeline (linkedom, mirroring the clipper's
 * own CLI in src/cli.ts).
 */
function parseForClipper(html: string): any {
  return parseHTML(html).document;
}

/**
 * Prime the clipper's bundled Turndown with a working DOMParser.
 *
 * Turndown resolves its HTML parser ONCE, at its own module init, from
 * `window.DOMParser` — and its window-less fallback is broken in Node
 * (every conversion degrades to "Partial conversion... Original HTML").
 * So this exposes a minimal fake window `{ DOMParser }` (linkedom-backed,
 * same as the clipper's CLI banner), forces evaluation of the clipper
 * graph, then deletes the global again.
 *
 * Call ONLY from instrumentation.ts at server startup, before any request
 * is served: a `window` global visible during requests would poison
 * server/client environment detection. Lazy per-request priming would have
 * the same hazard under concurrent first requests.
 */
export async function primeClipperDOM(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g["DOMParser"] === "undefined") g["DOMParser"] = linkedomParser();
  // Already evaluated (e.g. by instrumentation at boot): touch nothing —
  // setting even a temporary window during requests risks poisoning.
  if (apiPromise) return;
  const hadWindow = typeof g["window"] !== "undefined";
  if (!hadWindow) {
    g["window"] = { DOMParser: g["DOMParser"] };
  }
  try {
    await clipperApi();
  } finally {
    if (!hadWindow) delete g["window"];
  }
}

/**
 * Run a page through the Web Clipper pipeline: Defuddle main-content
 * extraction -> createMarkdownContent -> template variables -> compiled
 * note (name, frontmatter, content, properties, variables).
 * The caller (lib/extract.ts) owns fetching, as api.ts assigns it.
 */
export async function clipPage(html: string, url: string): Promise<ClipResult> {
  const api = await clipperApi();
  return api.clip({
    html,
    url,
    template: defaultTemplate(),
    documentParser: {
      parseFromString: (h: string) => parseForClipper(h),
    },
  });
}

export type { ClipResult };
