import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      { key: "Cache-Control", value: "no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return ["/sign-in", "/auth/:path*", "/onboarding", "/app", "/api/auth/:path*"]
      .map((source) => ({ source, headers }));
  },
};

export default nextConfig;
