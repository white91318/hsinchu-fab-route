"use client";

import { useEffect, useState } from "react";
import type { ConstructionResult, LiveSegmentReading, LiveTrafficResult } from "@/lib/live/types";
import type { WeatherReading } from "@/lib/weather/types";
import type { SegmentId } from "@/lib/traffic/types";

const POLL_INTERVAL_MS = 120_000;

export type LiveStatus = "connecting" | "live" | "not-configured" | "unavailable";

export interface LiveTrafficState {
  readings: Partial<Record<SegmentId, LiveSegmentReading>>;
  status: LiveStatus;
  lastUpdated: string | null;
  /** Why the freeway feed isn't live, when it isn't — shown verbatim to the user. */
  reason: string | null;
  construction: ConstructionResult | null;
  /** Null until the first successful read; a failed poll keeps the last sky. */
  weather: WeatherReading | null;
}

const INITIAL_STATE: LiveTrafficState = {
  readings: {},
  status: "connecting",
  lastUpdated: null,
  reason: null,
  construction: null,
  weather: null,
};

/**
 * Polls our own /api/live-traffic proxy (which holds the TDX credentials
 * server-side) every two minutes. On a failed poll it keeps whatever readings
 * it already had — PRD's "離線容忍" requirement: show the last successful
 * value with its timestamp, never a blank or a fabricated one.
 */
export function useLiveTraffic(): LiveTrafficState {
  const [state, setState] = useState<LiveTrafficState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/live-traffic", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LiveTrafficResult;
        if (cancelled) return;

        const readings: Partial<Record<SegmentId, LiveSegmentReading>> = {};
        data.readings.forEach((r) => {
          readings[r.segmentId] = r;
        });
        const gotReadings = data.freeway.status === "ok" && data.readings.length > 0;
        const status: LiveStatus = gotReadings
          ? "live"
          : data.freeway.status === "not-configured"
            ? "not-configured"
            : "unavailable";

        setState((prev) => ({
          readings: gotReadings ? readings : prev.readings,
          status,
          lastUpdated: gotReadings ? data.freeway.fetchedAt : prev.lastUpdated,
          reason: data.freeway.status === "ok" ? null : data.freeway.error,
          construction: data.construction,
          // Keep the sky we already have if this poll couldn't read the weather,
          // rather than snapping the backdrop back to a default.
          weather: data.weather.status === "ok" ? data.weather.reading : prev.weather,
        }));
      } catch {
        if (cancelled) return;
        setState((prev) => ({ ...prev, status: "unavailable", reason: "無法連線到本站的資料代理" }));
      }
    }

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}
