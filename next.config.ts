import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingIncludes: {
    "/api/chat": ["./src/chat/data/knowledge-index.json"],
  },
};

export default nextConfig;
