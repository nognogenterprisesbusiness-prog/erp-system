import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nognog/domain"],
  poweredByHeader: false,
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/mobile/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:8083" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    staleTimes: { dynamic: 600, static: 600 },
  },
};

export default nextConfig;
