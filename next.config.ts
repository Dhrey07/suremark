import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  agentRules: false,
  async rewrites() {
    return [{ source: "/platform/login", destination: "/platform-auth" }];
  },
};

export default nextConfig;
