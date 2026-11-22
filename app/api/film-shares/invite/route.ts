import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { createAndSendFilmShareInvite } from "@/lib/film-share-invite-server";
import { isValidInviteEmail, normalizeInviteEmail } from "@/lib/film-share-invites";

type Body = {
  email?: string;
  ownerLabel?: string;
};

export async function POST(request: Request) {
  try {
    const { uid, email: actorEmail } = await requireBearerUser(request);
    const body = (await request.json().catch(() => ({}))) as Body;
    const inviteeEmail = normalizeInviteEmail(body.email ?? "");
    if (!isValidInviteEmail(inviteeEmail)) {
      return NextResponse.json(
        { error: "Enter a valid coach email." },
        { status: 400 },
      );
    }
    if (
      actorEmail &&
      normalizeInviteEmail(actorEmail) === inviteeEmail
    ) {
      return NextResponse.json(
        { error: "You can’t invite your own email." },
        { status: 400 },
      );
    }

    let ownerLabel =
      typeof body.ownerLabel === "string" ? body.ownerLabel.trim() : "";
    if (!ownerLabel) {
      const userSnap = await adminFirestore.collection("users").doc(uid).get();
      const raw = userSnap.data() ?? {};
      ownerLabel =
        (typeof raw.displayName === "string" && raw.displayName.trim()) ||
        (typeof raw.name === "string" && raw.name.trim()) ||
        (actorEmail ? actorEmail.split("@")[0]! : "") ||
        "Film Room";
    }

    const result = await createAndSendFilmShareInvite({
      request,
      ownerUid: uid,
      ownerLabel,
      inviteeEmail,
    });

    return NextResponse.json({
      ok: true,
      code: result.code,
      joinUrl: result.joinUrl,
      emailSent: result.emailSent,
      ...(result.emailError ? { emailError: result.emailError } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVITE_FAILED";
    if (message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "INVALID_EMAIL") {
      return NextResponse.json(
        { error: "Enter a valid coach email." },
        { status: 400 },
      );
    }
    console.error("[film-shares/invite]", error);
    return NextResponse.json(
      { error: "Could not create film share invite." },
      { status: 500 },
    );
  }
}
