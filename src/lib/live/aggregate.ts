import { fetchConstructionNotices } from "@/lib/live/constructionClient";
import { fetchTdxFreewayReadings } from "@/lib/live/tdx/freeway";
import type { LiveTrafficResult } from "@/lib/live/types";

/**
 * Both sources are independent, so they run concurrently and each degrades on
 * its own: a dead freeway feed still leaves construction notices, and vice
 * versa. Neither ever throws (see the two clients), so there is no try/catch
 * here to swallow anything.
 */
export async function fetchLiveTraffic(): Promise<LiveTrafficResult> {
  const [freeway, construction] = await Promise.all([
    fetchTdxFreewayReadings(),
    fetchConstructionNotices(),
  ]);

  return {
    readings: freeway.readings,
    freeway: freeway.health,
    construction,
  };
}

/** Same fetch, plus the raw shape breadcrumbs — used only by /api/diagnostics. */
export async function fetchLiveTrafficWithDiagnostics() {
  const [freeway, construction] = await Promise.all([
    fetchTdxFreewayReadings(),
    fetchConstructionNotices(),
  ]);
  return { freeway, construction };
}
