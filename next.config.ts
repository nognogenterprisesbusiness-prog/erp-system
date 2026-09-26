import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nognog/domain"],
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    staleTimes: { dynamic: 120, static: 120 },
  },
};

export default nextConfig;
