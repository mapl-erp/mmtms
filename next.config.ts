import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pdf-lib", "jszip"],
};

export default nextConfig;
