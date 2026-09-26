import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nognog/domain"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    staleTimes: { dynamic: 600, static: 600 },
  },
};

export default nextConfig;
