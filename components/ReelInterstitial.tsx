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
    const single = card.logos.length === 1;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center sm:px-6">
        {card.headline.trim() ? (
          <p className="mb-5 max-w-[92%] text-balance text-lg font-semibold tracking-tight text-white sm:mb-6 sm:text-2xl">
            {card.headline}
          </p>
        ) : null}
        <ul
          className={`grid w-full max-w-2xl place-items-center gap-6 ${
            single
              ? "grid-cols-1"
              : card.logos.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3"
          }`}
        >
          {card.logos.map((logo, i) => (
            <li
              key={`${logo.logoUrl.slice(0, 24)}_${i}`}
              className="flex flex-col items-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.logoUrl}
                alt=""
                className={
                  single
                    ? "h-[min(48vh,16rem)] w-[min(48vh,16rem)] rounded-3xl bg-white object-contain p-4 shadow-2xl shadow-black/55 sm:h-[min(52vh,18rem)] sm:w-[min(52vh,18rem)]"
                    : "h-28 w-28 rounded-2xl bg-white object-contain p-2.5 shadow-xl shadow-black/45 sm:h-32 sm:w-32"
                }
              />
            </li>
          ))}
        </ul>
        {card.subtitle?.trim() ? (
          <p className="mt-4 max-w-[85%] text-sm text-zinc-300">
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
