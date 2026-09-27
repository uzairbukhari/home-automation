import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables `Dockerfile`'s minimal production image (see docker-compose.yml,
  // the VPS upgrade path from the default Vercel deployment).
  output: "standalone",
};

export default nextConfig;
