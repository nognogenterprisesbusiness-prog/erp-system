import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nognog/domain"],
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
