// Minimal ambient declaration for the Cloudflare Workers runtime module.
// The Next.js/webpack build type-checks every file (including this Worker-only
// path, which is pulled in via lib/origin.ts) but does not ship the Cloudflare
// Workers types. At runtime this module is provided by the vinext/Workers build;
// the Next build reaches the crawler over HTTP instead (see next.config.ts alias).
declare module "cloudflare:workers" {
  export const env: unknown;
}
