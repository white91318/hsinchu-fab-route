"use client";

import { useEffect, useState } from "react";
import type { LiveSegmentReading, LiveTrafficResult } from "@/lib/live/types";
import type { SegmentId } from "@/lib/traffic/types";

const POLL_INTERVAL_MS = 120_000;

export interface LiveTrafficState {
  readings: Partial<Record<SegmentId, LiveSegmentReading>>;
  status: "connecting" | "live" | "unavailable";
  lastUpdated: string | null;
  cityDiagnostics: LiveTrafficResult["city"] | null;
}

const INITIAL_STATE: LiveTrafficState = {
  readings: {},
  status: "connecting",
  lastUpdated: null,
  cityDiagnostics: null,
};

/**
 * Polls our own /api/live-traffic proxy (which in turn hits the freeway
 * bureau feed server-side) every two minutes. On a failed poll it keeps
 * whatever readings it already had — PRD's "離線容忍" requirement: show the
 * last successful value with its timestamp, never a blank or fabricated one.
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
        setState((prev) => ({
          readings: gotReadings ? readings : prev.readings,
          status: gotReadings ? "live" : "unavailable",
          lastUpdated: gotReadings ? data.freeway.fetchedAt : prev.lastUpdated,
          cityDiagnostics: data.city,
        }));
      } catch {
        if (cancelled) return;
        setState((prev) => ({ ...prev, status: "unavailable" }));
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
