import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite locates its WASM at runtime; bundling breaks that path.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
