"use client";

import { useEffect, useState } from "react";

/**
 * True once the client confirms the viewport is at least `minWidthPx` wide.
 * Starts `false` on every render (server included) so SSR output is
 * deterministic, then upgrades after mount — mirrors the "now" pattern in
 * useCommuteState. Never downgrades a user's explicit choice; callers that
 * need a manual override should track that separately.
 */
export function useIsWideViewport(minWidthPx: number): boolean {
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${minWidthPx}px)`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsWide(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [minWidthPx]);

  return isWide;
}
