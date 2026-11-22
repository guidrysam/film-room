import { NextResponse } from "next/server";
import { requireBearerUid } from "@/lib/ai/auth";
import { syncFilmShareFromOwner } from "@/lib/film-share-invite-server";

type Body = { ownerUid?: string };

export async function POST(request: Request) {
  try {
    const uid = await requireBearerUid(request);
    const body = (await request.json().catch(() => ({}))) as Body;
    const ownerUid =
      typeof body.ownerUid === "string" ? body.ownerUid.trim() : "";
    if (!ownerUid) {
      return NextResponse.json(
        { error: "ownerUid is required." },
        { status: 400 },
      );
    }

    const result = await syncFilmShareFromOwner({
      coachUid: uid,
      ownerUid,
    });

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SYNC_FAILED";
    if (message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (message === "GRANT_NOT_FOUND") {
      return NextResponse.json(
        {
          error:
            "Access was revoked or never accepted. Imported clips stay in your Film Room.",
        },
        { status: 403 },
      );
    }
    console.error("[film-shares/sync]", error);
    return NextResponse.json(
      { error: "Could not sync shared film." },
      { status: 500 },
    );
  }
}
