import path from "node:path";
import { fileURLToPath } from "node:url";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const root = path.dirname(fileURLToPath(import.meta.url));
const originHttp = path.join(root, "lib/origin-http.ts");

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/lib/origin": originHttp,
      "@/lib/origin.ts": originHttp,
      [path.join(root, "lib/origin")]: originHttp,
      [path.join(root, "lib/origin.ts")]: originHttp,
    };
    return config;
  },
};

export default withSerwist(nextConfig);
