"use client";

import {
  SELECTOR_SPORTS,
  canonicalizeSportForStorage,
} from "@/lib/sports";

const selectClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-50 focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

export type SportSelectProps = {
  value: string;
  onChange: (sportIdOrEmpty: string) => void;
  /** Include empty "optional" choice. Default true. */
  allowEmpty?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Soccer / Basketball selector. Value is canonical id or "".
 */
export default function SportSelect({
  value,
  onChange,
  allowEmpty = true,
  id,
  className,
  disabled,
}: SportSelectProps) {
  const canonical = canonicalizeSportForStorage(value) ?? "";
  return (
    <select
      id={id}
      value={
        SELECTOR_SPORTS.some((s) => s.id === canonical) ? canonical : ""
      }
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? selectClass}
      aria-label="Sport"
    >
      {allowEmpty ? <option value="">Sport (optional)</option> : null}
      {SELECTOR_SPORTS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
