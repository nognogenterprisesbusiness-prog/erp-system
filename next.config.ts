import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nognog/domain"],
  poweredByHeader: false,
};

export default nextConfig;
