import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  outputFileTracingIncludes: {
    "/api/*": ["./prod-ca-2021.crt"],
  },
};

export default nextConfig;
