/** Show developer diagnostics in the UI (room overlays, stream JSON dumps, etc.). */
export function isDebugUiEnabled(debugParam: string | null | undefined): boolean {
  if (debugParam === "1" || debugParam === "true") return true;
  return process.env.NODE_ENV === "development";
}
