import { fetchConstructionNotices } from "@/lib/live/constructionClient";
import { fetchTdxFreewayReadings } from "@/lib/live/tdx/freeway";
import type { LiveTrafficResult } from "@/lib/live/types";
import { fetchWeather } from "@/lib/weather/openMeteo";

/**
 * The three sources are independent, so they run concurrently and each
 * degrades on its own: a dead freeway feed still leaves the weather backdrop
 * and the construction notices. None of them ever throws (see each client), so
 * there is no try/catch here to swallow anything.
 */
export async function fetchLiveTraffic(): Promise<LiveTrafficResult> {
  const [freeway, construction, weather] = await Promise.all([
    fetchTdxFreewayReadings(),
    fetchConstructionNotices(),
    fetchWeather(),
  ]);

  return {
    readings: freeway.readings,
    freeway: freeway.health,
    construction,
    weather,
  };
}

/** Same fetch, plus the raw shape breadcrumbs — used only by /api/diagnostics. */
export async function fetchLiveTrafficWithDiagnostics() {
  const [freeway, construction, weather] = await Promise.all([
    fetchTdxFreewayReadings(),
    fetchConstructionNotices(),
    fetchWeather(),
  ]);
  return { freeway, construction, weather };
}
