import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/ai/auth";
import {
  revokeFilmShareGrant,
  revokePendingFilmShareInvite,
} from "@/lib/film-share-invite-server";

type Body = {
  coachUid?: string;
  code?: string;
};

export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const body = (await request.json().catch(() => ({}))) as Body;
    const coachUid =
      typeof body.coachUid === "string" ? body.coachUid.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";

    if (coachUid) {
      await revokeFilmShareGrant({ ownerUid: uid, coachUid });
      return NextResponse.json({ ok: true, revoked: "grant" });
    }
    if (code) {
      await revokePendingFilmShareInvite({ ownerUid: uid, code });
      return NextResponse.json({ ok: true, revoked: "invite" });
    }
    return NextResponse.json(
      { error: "coachUid or code is required." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "REVOKE_FAILED";
    if (message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "GRANT_NOT_FOUND" || message === "INVALID_INVITE") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (message === "ACCESS_DENIED" || message === "NOT_PENDING") {
      return NextResponse.json({ error: "Cannot revoke." }, { status: 403 });
    }
    console.error("[film-shares/revoke]", error);
    return NextResponse.json(
      { error: "Could not revoke film share." },
      { status: 500 },
    );
  }
}
