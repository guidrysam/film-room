import { NextResponse } from "next/server";
import { isEmailSendingConfigured } from "@/lib/email/resend";
import { requireVerifiedTeamActor } from "@/lib/firebase-admin";
import { sendParentInviteEmailAdmin } from "@/lib/parent-invite-send-server";

type Body = {
  teamId?: string;
  targetId?: string;
  targetIds?: string[];
};

export async function POST(request: Request) {
  try {
    if (!isEmailSendingConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email sending is not configured. Add RESEND_API_KEY (and optionally PARENT_INVITE_FROM_EMAIL) in Vercel / .env.local.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as Body;
    const teamId = body.teamId?.trim() ?? "";
    if (!teamId) {
      return NextResponse.json({ error: "teamId is required." }, { status: 400 });
    }

    const actor = await requireVerifiedTeamActor(request, teamId);
    if (!actor.canCoach) {
      return NextResponse.json(
        { error: "Only coaches and admins can send parent invites." },
        { status: 403 },
      );
    }

    const targetIds = [
      ...(body.targetId?.trim() ? [body.targetId.trim()] : []),
      ...(Array.isArray(body.targetIds)
        ? body.targetIds
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter(Boolean)
        : []),
    ];
    const uniqueIds = [...new Set(targetIds)];
    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: "targetId or targetIds is required." },
        { status: 400 },
      );
    }
    if (uniqueIds.length > 50) {
      return NextResponse.json(
        { error: "Send at most 50 invites at a time." },
        { status: 400 },
      );
    }

    const results = [];
    for (const targetId of uniqueIds) {
      results.push(
        await sendParentInviteEmailAdmin({
          request,
          teamId,
          targetId,
          createdBy: actor.uid,
        }),
      );
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    return NextResponse.json({
      sent,
      failed,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SEND_FAILED";
    if (message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "TEAM_NOT_FOUND") {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    if (message === "TEAM_ACCESS_DENIED") {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    console.error("[parent-invites/send]", error);
    return NextResponse.json(
      { error: "Could not send parent invite." },
      { status: 500 },
    );
  }
}
