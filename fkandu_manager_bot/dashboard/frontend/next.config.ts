import type { NextConfig } from "next";

const apiBase = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const allowedDevOrigins = (
  process.env.ALLOWED_DEV_ORIGINS ||
  "localhost,127.0.0.1,2.26.249.118,192.168.1.9"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);


const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
