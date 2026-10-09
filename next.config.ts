import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nognog/domain"],
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/suppliers/categories", destination: "/suppliers", permanent: true }];
  },
  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/mobile/:path*",
        headers: [
          // Dev only: Expo web runs on any local port or LAN IP. Mobile auth is a
          // bearer token, not cookies, so a wildcard origin exposes nothing.
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
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
