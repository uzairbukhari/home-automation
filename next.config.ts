import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables `Dockerfile`'s minimal production image (see docker-compose.yml,
  // the VPS upgrade path from the default Vercel deployment).
  output: "standalone",
  // Analytics and Savings were merged into the Solar page.
  redirects() {
    return [
      { source: "/analytics", destination: "/solar", permanent: true },
      { source: "/savings", destination: "/solar", permanent: true },
    ];
  },
};

export default nextConfig;
