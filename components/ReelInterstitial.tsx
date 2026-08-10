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
      }
    | {
        kind: "thanks";
        headline: string;
        subtitle?: string;
        logos: Array<{ logoUrl: string; name?: string }>;
      };
};

/**
 * Full-frame card on black for reel title, attribution, and sponsor thanks.
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

  if (card.kind === "thanks") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center sm:px-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
          Sponsors
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {card.headline}
        </h2>
        {card.subtitle ? (
          <p className="mt-2 max-w-[90%] text-sm text-zinc-300">{card.subtitle}</p>
        ) : null}
        <ul
          className={`mt-6 grid w-full max-w-lg gap-4 ${
            card.logos.length === 1
              ? "grid-cols-1 place-items-center"
              : card.logos.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {card.logos.map((logo, i) => (
            <li
              key={`${logo.logoUrl.slice(0, 24)}_${i}`}
              className="flex flex-col items-center gap-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.logoUrl}
                alt={logo.name || "Sponsor"}
                className="h-16 w-16 rounded-xl bg-white/95 object-contain p-1.5 shadow-lg shadow-black/40 sm:h-20 sm:w-20"
              />
              {logo.name ? (
                <span className="max-w-[7rem] truncate text-[10px] font-medium text-zinc-400">
                  {logo.name}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
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
