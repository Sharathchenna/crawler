import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/lib/origin": path.join(root, "lib/origin-cloudflare.ts"),
      [path.join(root, "lib/origin.ts")]: path.join(root, "lib/origin-cloudflare.ts"),
    },
  },
  plugins: [
    vinext({
      cache: { data: kvDataAdapter(), cdn: cdnAdapter() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
