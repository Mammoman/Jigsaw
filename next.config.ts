import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default.
  // partykit is in devDependencies so it won't be bundled in production.
  turbopack: {},
};

export default nextConfig;
