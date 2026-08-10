import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native / CJS packages outside the bundler for Node on Vercel.
  serverExternalPackages: ["firebase-admin", "youtubei.js", "ffmpeg-static"],
};

export default nextConfig;
