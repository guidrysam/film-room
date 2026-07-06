import { extractFacebookVideoRef } from "@/lib/facebook-video-url";

export const runtime = "nodejs";

/** Follow fb.watch redirects and return a parsed numeric Facebook video ref. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim();
  if (!url) {
    return Response.json({ ok: false, error: "Missing url." }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FilmRoom/1.0; +https://film-room.app)",
      },
    });
    const finalUrl = res.url || url;
    const ref = extractFacebookVideoRef(finalUrl);
    if (!ref || ref.videoKey.startsWith("fbwatch:")) {
      return Response.json(
        { ok: false, error: "Could not resolve Facebook video." },
        { status: 422 },
      );
    }
    return Response.json({ ok: true, ref });
  } catch {
    return Response.json(
      { ok: false, error: "Could not resolve Facebook video." },
      { status: 502 },
    );
  }
}
