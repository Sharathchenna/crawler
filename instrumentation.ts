// Next.js server startup hook: runs once per `next dev` / `next start`
// boot, before any request is served, in the server process.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Prime the vendored Web Clipper's bundled Turndown with a working
    // DOMParser (see primeClipperDOM docs). Must happen here — never
    // per-request — so no `window` global is ever visible to requests.
    const { primeClipperDOM } = await import("./lib/clipper");
    await primeClipperDOM();
    console.log("[hoard] reader pipeline primed (obsidian-clipper)");
  }
}
