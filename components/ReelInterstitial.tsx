"use client";

export type ReelInterstitialProps = {
  card:
    | {
        kind: "title";
        headline: string;
        subtitle?: string;
        logoUrl?: string;
      }
    | {
        kind: "stat";
        headline?: string;
        lines: string[];
      };
};

/**
 * Full-frame card on black for reel title screens and goal/assist attribution.
 */
export default function ReelInterstitial({ card }: ReelInterstitialProps) {
  if (card.kind === "title") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
        {card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.logoUrl}
            alt=""
            className="mb-5 h-20 w-20 rounded-full object-cover ring-2 ring-white/20"
          />
        ) : null}
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
          Highlight reel
        </p>
        <h2 className="mt-2 max-w-[90%] text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {card.headline}
        </h2>
        {card.subtitle ? (
          <p className="mt-3 max-w-[85%] text-sm leading-relaxed text-zinc-300">
            {card.subtitle}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 text-center">
      {card.headline ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
          {card.headline}
        </p>
      ) : null}
      <ul className={`space-y-2 ${card.headline ? "mt-4" : ""}`}>
        {card.lines.map((line) => (
          <li
            key={line}
            className="text-xl font-semibold tracking-wide text-white sm:text-2xl"
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
