import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Branding assets are served from /public (e.g. /logo.png).
  // No remote image domains are configured or required.
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
