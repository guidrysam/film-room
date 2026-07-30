import "server-only";

export function appBaseUrlFromRequest(request: Request): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}
