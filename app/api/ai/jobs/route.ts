import { NextResponse } from "next/server";
import { requireCoachForGame } from "@/lib/ai/auth";
import { getAiJob, listAiJobsForGame } from "@/lib/ai/jobs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId")?.trim() ?? "";
    const jobId = searchParams.get("jobId")?.trim() ?? "";
    if (!gameId) {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    await requireCoachForGame(request, gameId);

    if (jobId) {
      const job = await getAiJob(gameId, jobId);
      if (!job) {
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, job });
    }

    const jobs = await listAiJobsForGame(gameId, 15);
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (msg === "TEAM_ACCESS_DENIED" || msg === "GAME_NOT_FOUND") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
