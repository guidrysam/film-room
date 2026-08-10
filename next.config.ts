import type { NextConfig } from "next";

const FIREBASE_AUTH_PROXY_ORIGIN = "https://film-room-b7780.firebaseapp.com";

const nextConfig: NextConfig = {
  // Keep native / CJS packages outside the bundler for Node on Vercel.
  serverExternalPackages: ["firebase-admin", "youtubei.js", "ffmpeg-static"],
  /**
   * Same-origin Firebase Auth helpers so Safari can finish Google sign-in
   * (see Firebase redirect best practices, Option 3). Requires
   * authDomain = film-room-gray.vercel.app and OAuth redirect URI:
   * https://film-room-gray.vercel.app/__/auth/handler
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
