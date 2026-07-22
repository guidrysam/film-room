import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep firebase-admin outside the bundler so CJS/ESM interop matches Node on Vercel.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
