import type { SegmentId } from "@/lib/traffic/types";

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
  | { status: "unavailable"; fetchedAt: string; error: string; triedUrls: string[] };

export interface CandidateDataset {
  title: string;
  url: string;
}

export interface LiveTrafficResult {
  readings: LiveSegmentReading[];
  freeway: SourceHealth;
  city: {
    status: "candidates-found" | "no-candidates" | "unavailable";
    fetchedAt: string;
    candidateDatasets: CandidateDataset[];
    error?: string;
  };
}
