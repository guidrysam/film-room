import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-12 text-white">
      <div className="w-full max-w-lg text-center">
        <h1 className="mb-2 text-4xl font-bold">Film Room</h1>

        <p className="mb-8 text-gray-400">Watch film together, anywhere.</p>

        <p className="mb-10 text-left text-sm leading-relaxed text-gray-300 sm:text-base">
          Film Room lets coaches and players watch video together in real time.
          The coach controls playback, speed, and telestration — the player
          follows instantly.
        </p>

        <ol className="mb-12 space-y-6 text-left text-sm text-gray-300 sm:text-base">
          <li>
            <span className="font-semibold text-white">1. Start a session</span>
            <p className="mt-1 text-gray-400">
              Paste a YouTube link and click &quot;Start Film Session&quot;.
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">2. Share the link</span>
            <p className="mt-1 text-gray-400">
              Send the viewer link to your player or team.
            </p>
          </li>
          <li>
            <span className="font-semibold text-white">
              3. Coach in real time
            </span>
            <p className="mt-1 text-gray-400">
              Play, pause, slow down, and draw on the video — everyone stays in
              sync.
            </p>
          </li>
        </ol>

        <Link
          href="/"
          className="text-sm text-gray-500 underline-offset-4 hover:text-gray-400 hover:underline"
        >
          ← Back
        </Link>
      </div>
    </div>
  );
}
