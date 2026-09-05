import type { NextConfig } from "next";
import path from "node:path";

// next.config.ts is always evaluated with cwd = project root.
const clipperStubs = path.join(process.cwd(), "vendor/obsidian-clipper/src/utils/cli-stubs.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["defuddle", "linkedom", "knap", "dayjs", "@prisma/client", ".prisma/client"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // Same trick as the clipper's own scripts/build-cli.mjs: the extraction
      // graph imports webextension-polyfill, which can't load in Node.
      "webextension-polyfill": clipperStubs,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      "webextension-polyfill": clipperStubs,
    },
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
