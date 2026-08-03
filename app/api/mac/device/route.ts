import {
  completeMacDeviceSession,
  pollMacDeviceSession,
  startMacDeviceSession,
} from "@/lib/mac-device-auth";
import { requireBearerUid } from "@/lib/ai/auth";
import { verifyFirebaseIdTokenRest } from "@/lib/firebase-id-token";

export const runtime = "nodejs";

function authError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : "UNKNOWN";
  if (msg === "AUTH_REQUIRED") {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  if (
    msg === "USER_CODE_REQUIRED" ||
    msg === "DEVICE_CODE_REQUIRED" ||
    msg === "DEVICE_CODE_INVALID" ||
    msg === "DEVICE_CODE_EXPIRED" ||
    msg === "DEVICE_SESSION_INCOMPLETE"
  ) {
    return Response.json({ error: msg }, { status: 400 });
  }
  console.error("[mac/device]", err);
  return Response.json({ error: "Device link failed." }, { status: 500 });
}

/** POST /api/mac/device/start — Mac begins link flow. */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "start";

    if (action === "start") {
      const session = await startMacDeviceSession();
      return Response.json(session);
    }

    if (action === "poll") {
      const body = (await request.json().catch(() => null)) as {
        deviceCode?: unknown;
      } | null;
      const deviceCode =
        typeof body?.deviceCode === "string" ? body.deviceCode : "";
      const result = await pollMacDeviceSession(deviceCode);
      return Response.json(result);
    }

    if (action === "complete") {
      const uid = await requireBearerUid(request);
      const body = (await request.json().catch(() => null)) as {
        userCode?: unknown;
      } | null;
      const userCode =
        typeof body?.userCode === "string" ? body.userCode : "";
      // Enrich email/name from token lookup when possible.
      const authHeader = request.headers.get("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";
      let email: string | undefined;
      try {
        const decoded = await verifyFirebaseIdTokenRest(token);
        email = decoded.email;
      } catch {
        /* ignore */
      }
      await completeMacDeviceSession({ uid, userCode, email });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return authError(err);
  }
}
