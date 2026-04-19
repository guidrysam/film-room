import Link from "next/link";

const cardClass =
  "rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-8 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-10";

const linkClass =
  "inline-flex text-sm text-zinc-500 transition hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-zinc-100">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Film Room
          </p>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            About
          </h1>
          <p className="text-zinc-400">Watch film together, anywhere.</p>
        </div>

        <div className={`${cardClass} mb-10`}>
          <p className="mb-8 text-left text-sm leading-relaxed text-zinc-300 sm:text-base">
            Film Room lets coaches and players watch video together in real time.
            The coach controls playback, speed, and telestration — the player
            follows instantly.
          </p>

          <ol className="space-y-8 text-left text-sm text-zinc-300 sm:text-base">
            <li>
              <span className="font-semibold text-white">1. Start a session</span>
              <p className="mt-2 leading-relaxed text-zinc-500">
                Paste a YouTube link and click &quot;Start Film Session&quot;.
              </p>
            </li>
            <li>
              <span className="font-semibold text-white">2. Share the link</span>
              <p className="mt-2 leading-relaxed text-zinc-500">
                Send the viewer link to your player or team.
              </p>
            </li>
            <li>
              <span className="font-semibold text-white">
                3. Coach in real time
              </span>
              <p className="mt-2 leading-relaxed text-zinc-500">
                Play, pause, slow down, and draw on the video — everyone stays in
                sync.
              </p>
            </li>
          </ol>
        </div>

        <p className="text-center">
          <Link href="/" className={linkClass}>
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
