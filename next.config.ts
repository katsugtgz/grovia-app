import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next 15 drops the whole chunk that crosses this global middleware cap.
    // Leave room above the 64 KiB handler cap for Bun's 512 KiB socket reads
    // (Node's HTTP parser reads 64 KiB), so truncated bodies still return 413.
    middlewareClientMaxBodySize: 640 * 1024,
  },
};

export default nextConfig;
