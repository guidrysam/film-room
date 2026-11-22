import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/auth";
import { acceptFilmShareInvite } from "@/lib/film-share-invite-server";

type Body = { code?: string };

export async function POST(request: Request) {
  try {
    const { uid, email } = await requireBearerUser(request);
    if (!email?.trim()) {
      return NextResponse.json(
        {
          error:
            "Your Google account needs an email to accept this invite.",
        },
        { status: 400 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as Body;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      return NextResponse.json({ error: "Invite code required." }, { status: 400 });
    }

    const result = await acceptFilmShareInvite({
      code,
      coachUid: uid,
      coachEmail: email,
    });

    return NextResponse.json({
      ok: true,
      ownerUid: result.ownerUid,
      ownerLabel: result.ownerLabel,
      imported: result.imported,
      skipped: result.skipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ACCEPT_FAILED";
    if (message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "EMAIL_MISMATCH") {
      return NextResponse.json(
        {
          error:
            "Sign in with the email this invite was sent to, then try again.",
        },
        { status: 403 },
      );
    }
    if (message === "INVITE_EXPIRED") {
      return NextResponse.json(
        { error: "This invite has expired. Ask for a new one." },
        { status: 410 },
      );
    }
    if (message === "INVITE_REVOKED") {
      return NextResponse.json(
        { error: "This invite was revoked." },
        { status: 410 },
      );
    }
    if (message === "INVALID_INVITE") {
      return NextResponse.json(
        { error: "This invite link is not valid." },
        { status: 404 },
      );
    }
    if (message === "CANNOT_SHARE_SELF") {
      return NextResponse.json(
        { error: "You can’t accept your own film share." },
        { status: 400 },
      );
    }
    console.error("[film-shares/accept]", error);
    return NextResponse.json(
      { error: "Could not accept film share invite." },
      { status: 500 },
    );
  }
}
