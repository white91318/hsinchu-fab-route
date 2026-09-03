import { findCityTrafficDatasets } from "@/lib/live/hccgClient";
import { fetchFreewayLiveReadings } from "@/lib/live/freewayClient";
import type { LiveTrafficResult } from "@/lib/live/types";

export async function fetchLiveTraffic(): Promise<LiveTrafficResult> {
  const [freeway, city] = await Promise.all([fetchFreewayLiveReadings(), findCityTrafficDatasets()]);

  return {
    readings: freeway.readings,
    freeway: freeway.health,
    city: { ...city, fetchedAt: new Date().toISOString() },
  };
}
