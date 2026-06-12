import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client render, then `true`.
 *
 * Lets a component read client-only stores (localStorage) via lazy state
 * initializers without tripping React hydration mismatches: render a stable
 * shell until this flips true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
