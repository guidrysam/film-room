import Link from "next/link";

const pageBgClass =
  "min-h-screen bg-[radial-gradient(circle_at_top,_rgba(40,40,55,0.35)_0%,_rgba(3,3,6,1)_55%)] px-4 py-16 text-zinc-50";

const shellClass = "mx-auto w-full max-w-4xl";

const cardClass =
  "rounded-2xl border border-white/[0.07] bg-zinc-950/40 p-6 shadow-xl shadow-black/40 ring-1 ring-white/[0.04] backdrop-blur-sm sm:p-8";

const sectionTitleClass =
  "mb-4 text-lg font-semibold tracking-tight text-white sm:text-xl";

const bodyClass = "text-sm leading-relaxed text-zinc-200 sm:text-base";

const mutedClass = "text-zinc-400";

const linkClass =
  "inline-flex rounded-sm text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306]";

const workflowSteps = [
  {
    title: "1. Start a session",
    body: "Paste a YouTube link.",
  },
  {
    title: "2. Prepare your session",
    body: "Add clips if needed, and add chapters for key moments, mistakes, or teaching points.",
  },
  {
    title: "3. Share the session",
    body: "Copy the session link and send it to your players, students, or team.",
  },
  {
    title: "4. Run the session",
    body: "Press Play to begin together, pause to teach or discuss, and use chapters to jump between moments.",
  },
  {
    title: "5. Stay in control",
    body: "If things drift, press Sync. Use Prev / Next Chapter to move quickly, and use -10s for quick replays.",
  },
  {
    title: "6. Teach, don’t manage tech",
    body: "Focus on coaching. The system handles the rest.",
  },
];

const useCases = [
  {
    title: "Team Film Review",
    body: "Load full game film, add chapters for key plays, and walk through it with your team in real time.",
  },
  {
    title: "Watching a Film Edit",
    body: "Review a highlight reel or edited breakdown, jump between sections, and explain decisions as you go.",
  },
  {
    title: "Training Sessions / Lessons",
    body: "Queue multiple videos, use chapters like bookmarks, and run a structured lesson without losing the group.",
  },
  {
    title: "1-on-1 Coaching",
    body: "Share a link directly with a player or student, then pause, draw, and explain specific moments together.",
  },
  {
    title: "Music / Creative Review",
    body: "Break down performances, arrangements, or reference videos section by section with the same live workflow.",
  },
];

export default function AboutPage() {
  return (
    <main className={pageBgClass}>
      <div className={shellClass}>
        <header className="mb-10 text-center">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room
          </p>
          <h1 className="mb-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Watch film together, anywhere.
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-zinc-200 sm:text-base">
            Film Room lets coaches, teachers, and teams teach from video in real
            time. The host controls playback, speed, chapters, clips, and
            telestration — everyone else stays in sync.
          </p>
        </header>

        <div className="space-y-6">
          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Example Workflow</h2>
            <div className="space-y-5">
              {workflowSteps.map((step) => (
                <div key={step.title}>
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className={`${bodyClass} mt-2 ${mutedClass}`}>{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Using Film Room with YouTube</h2>

            <p className={bodyClass}>
              Film Room is a <span className="font-semibold text-white">YouTube companion</span> — it
              lets you use YouTube videos as a shared teaching experience.
            </p>

            <div className="mt-6">
              <h3 className="font-semibold text-white">Basic workflow</h3>
              <ol className={`mt-3 list-decimal space-y-2 pl-5 ${bodyClass} ${mutedClass}`}>
                <li>Choose a YouTube video.</li>
                <li>Paste the link into Film Room.</li>
                <li>Build your session with clips and chapters.</li>
                <li>Share the session link.</li>
                <li>Run your session live.</li>
              </ol>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold text-white">Privacy &amp; control</h3>
              <p className={`${bodyClass} mt-2 ${mutedClass}`}>
                If you’re using your own content, upload it to YouTube and set it
                to <span className="font-semibold text-zinc-200">Unlisted</span>. Only people with the
                link can view it, which makes it easy to keep team film private
                until you’re ready to share it.
              </p>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold text-white">Ads &amp; playback</h3>
              <p className={`${bodyClass} mt-2 ${mutedClass}`}>
                Because Film Room uses YouTube, ads may appear depending on the
                video. Ads can interrupt playback and affect sync temporarily.
              </p>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold text-white">Best experience</h3>
              <p className={`${bodyClass} mt-2 ${mutedClass}`}>
                You can use any YouTube video in Film Room. For the smoothest
                sessions, use your own uploads when possible, or use
                <span className="font-semibold text-zinc-200"> YouTube Premium</span>.
              </p>
              <p className={`${bodyClass} mt-3 ${mutedClass}`}>
                If both the coach and viewers have YouTube Premium, you get the
                best uninterrupted experience across all content. If not, Film
                Room still works — you may just encounter ads.
              </p>
              <p className={`${bodyClass} mt-4`}>
                <span className="font-semibold text-white">Pro tip:</span>{" "}
                <span className={mutedClass}>
                  Use fullscreen for the best viewing quality and focus during sessions.
                </span>
              </p>
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Use Cases</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {useCases.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className={`${bodyClass} mt-2 ${mutedClass}`}>{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={sectionTitleClass}>Building a Program with Film Room</h2>
            <p className={bodyClass}>
              Film Room isn’t just for one-off sessions. With saved sessions, a
              coach or teacher can build a lesson once, organize clips and
              chapters into a structured flow, and reuse it any time.
            </p>
            <p className={`${bodyClass} mt-4 ${mutedClass}`}>
              That turns Film Room into a repeatable teaching system — not just a
              live session tool. Over time, you can build a full program that is
              already prepared, structured, and ready to run.
            </p>
          </section>
        </div>

        <div className="mt-10 text-center">
          <Link href="/" className={linkClass}>
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
