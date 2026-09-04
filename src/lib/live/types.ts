import type { SegmentId } from "@/lib/traffic/types";
import type { WeatherResult } from "@/lib/weather/types";

export interface LiveSegmentReading {
  segmentId: SegmentId;
  travelTimeMinutes: number;
  speedKmh?: number;
  /** ISO timestamp this reading reflects (upstream-reported, or fetch time as fallback). */
  asOf: string;
  /** Upstream section id/name we matched, kept for debugging/display. */
  matchedSection?: string;
}

export type SourceHealth =
  | { status: "ok"; fetchedAt: string; url: string }
  | { status: "unavailable"; fetchedAt: string; error: string; triedUrls: string[] }
  /** Distinct from a failure: the source is wired up but has no credentials yet. */
  | { status: "not-configured"; fetchedAt: string; error: string };

export interface CandidateDataset {
  title: string;
  url: string;
}

/** One construction / road-closure announcement from the city public works office. */
export interface ConstructionNotice {
  title: string;
  /** Publication date as printed on the source page, normalised to YYYY-MM-DD when parseable. */
  date: string | null;
  url: string;
  /** True when `date` is today in Taiwan time — the "今日施工" filter. */
  isToday: boolean;
}

export interface ConstructionResult {
  status: "ok" | "unavailable";
  fetchedAt: string;
  notices: ConstructionNotice[];
  todayCount: number;
  error?: string;
  /** Diagnostic breadcrumbs — how much HTML came back and what we could see in it. */
  probe?: {
    htmlLength: number;
    anchorCount: number;
    sampleTitles: string[];
  };
}

export interface LiveTrafficResult {
  readings: LiveSegmentReading[];
  freeway: SourceHealth;
  construction: ConstructionResult;
  weather: WeatherResult;
}
