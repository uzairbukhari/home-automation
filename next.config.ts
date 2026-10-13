import type { NextConfig } from "next";
import path from "node:path";

// The default build targets Cloudflare Workers (vinext). Setting NEXT_ON_VERCEL=1 builds with plain Next.js
// and swaps the Cloudflare-only `cloudflare:workers` import for process.env.
const shim = path.resolve(process.cwd(), "vercel/cloudflare-workers.ts");
const nextConfig: NextConfig = process.env.NEXT_ON_VERCEL ? {
  turbopack: { resolveAlias: { "cloudflare:workers": "./vercel/cloudflare-workers.ts" } },
  webpack(config) { config.resolve.alias = { ...config.resolve.alias, "cloudflare:workers": shim }; return config; },
} : {};

export default nextConfig;
