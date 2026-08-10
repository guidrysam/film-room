import type { NextConfig } from "next";

const FIREBASE_AUTH_PROXY_ORIGIN = "https://film-room-b7780.firebaseapp.com";

const nextConfig: NextConfig = {
  // Keep native / CJS packages outside the bundler for Node on Vercel.
  serverExternalPackages: ["firebase-admin", "youtubei.js", "ffmpeg-static"],
  /**
   * Same-origin Firebase Auth helpers (Option 3 in Firebase redirect best
   * practices). Required so Safari / ITP can complete Google redirect sign-in.
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/__/auth/:path*",
          destination: `${FIREBASE_AUTH_PROXY_ORIGIN}/__/auth/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
