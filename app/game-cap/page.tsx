import Link from "next/link";

const linkBack =
  "text-sm text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030306] rounded-sm";

const stepCard =
  "rounded-xl border border-white/[0.07] bg-zinc-950/45 p-4 shadow-lg shadow-black/30 ring-1 ring-white/[0.04]";

const steps = [
  {
    n: 1,
    title: "Create or select a Game",
    body: "Every capture lands in a Game container so sources, marks, and perspectives stay together.",
  },
  {
    n: 2,
    title: "Record video",
    body: "Capture footage from the sideline. Recording isn't wired up yet — this is the next milestone.",
    pending: true,
  },
  {
    n: 3,
    title: "Coach Mark",
    body: "Mark events live (goal, save, corner…) to build a timeline while you capture.",
    href: "/coach-mark",
    cta: "Open Coach Mark",
  },
  {
    n: 4,
    title: "Attach the source",
    body: "Send the captured footage into the Game as a Video Source, aligned to game time.",
    pending: true,
  },
];

export default function GameCapPage() {
  return (
    <div className="min-h-screen px-4 py-10 text-zinc-50">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 border-b border-white/[0.06] pb-6">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
            Film Room Sports
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Game Cap
            </h1>
            <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
              Early workflow
            </span>
          </div>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-300">
            Record games, create timelines, and send footage into a Game. The
            capture pipeline is being built — here&apos;s the workflow it will
            follow.
          </p>
        </div>

        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.n} className={stepCard}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-xs font-semibold text-zinc-200">
                  {s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">
                      {s.title}
                    </h2>
                    {s.pending ? (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-400">
                        Coming next
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {s.body}
                  </p>
                  {s.href ? (
                    <Link
                      href={s.href}
                      className="mt-2 inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400/55 hover:bg-emerald-950/60"
                    >
                      {s.cta}
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <Link href="/app" className={`${linkBack} mt-10 inline-block`}>
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
