import { computePath } from "@/lib/routing/computePath";
import type { AdjacencyEntry, ComputedPath } from "@/lib/traffic/types";

export interface RouteSelection {
  best?: ComputedPath;
  other?: ComputedPath;
  /** True when origin/dest are selected but no simple path connects them yet. */
  noRouteFound: boolean;
}

/**
 * Picks the two fastest *distinct* routes (by edge set) out of every simple
 * path found between origin and dest. If every path collapses to the same
 * edge signature, `other` stays undefined and callers should show a single
 * route with no comparison (PRD §5.1 AC: "兩點之間若只有單一路徑,不顯示比較").
 */
export function selectTopRoutes(
  rawPaths: AdjacencyEntry[][],
  hour: number,
  weekday: boolean,
): RouteSelection {
  if (!rawPaths.length) return { noRouteFound: true };

  const computed = rawPaths.map((p) => computePath(p, hour, weekday));
  computed.sort((a, b) => a.total - b.total);

  const seen = new Set<string>();
  const top: ComputedPath[] = [];
  computed.forEach((c) => {
    const key = c.edgeIds.slice().sort().join(",");
    if (seen.has(key)) return;
    seen.add(key);
    if (top.length < 2) top.push(c);
  });

  return { best: top[0], other: top[1], noRouteFound: false };
}
