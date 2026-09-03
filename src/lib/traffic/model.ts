import { SEGMENTS } from "@/lib/data/segments";
import type { LiveSegmentReading } from "@/lib/live/types";
import type { CongestionLevel, SegmentId, SegmentStatus } from "@/lib/traffic/types";

/**
 * POC congestion model: each segment's travel time multiplier is 1 + a set of
 * Gaussian "bumps" centered on the day's peak periods, plus an optional
 * constant offset (e.g. a permanent lane closure). This is a simulation
 * standing in for real traffic data — see PRD §6.2, "從模擬到真實".
 */
function bump(hour: number, center: number, width: number, amp: number): number {
  if (!amp) return 0;
  let d = Math.abs(hour - center);
  d = Math.min(d, 24 - d);
  return amp * Math.exp(-(d * d) / (2 * width * width));
}

const AM = { c: 8.0, w: 0.75 };
const PM = { c: 15.8, w: 0.75 };
const NIGHT = { c: 23.5, w: 0.6 };

export const LEVEL_LABEL: Record<CongestionLevel, string> = {
  good: "順暢",
  warning: "略壅塞",
  critical: "壅塞",
};

/** Maps a congestion level to the CSS custom property carrying its color. */
export function levelVar(level: CongestionLevel): string {
  return level === "good" ? "var(--good)" : level === "warning" ? "var(--warning-fill)" : "var(--critical)";
}

/** Congestion banding from PRD §6.3: <1.15x free-flow good, <1.45x warning, else critical. */
function levelFromRatio(minutes: number, base: number): CongestionLevel {
  const mult = minutes / base;
  return mult < 1.15 ? "good" : mult < 1.45 ? "warning" : "critical";
}

type PeakKey = "am" | "pm" | "night";

export function segStatus(id: SegmentId, hour: number, weekday: boolean): SegmentStatus {
  const seg = SEGMENTS[id];
  const amps = seg.amps || {};
  const zeroed = seg.weekdayOnly && !weekday;
  const amAmp = zeroed ? 0 : amps.am || 0;
  const pmAmp = zeroed ? 0 : amps.pm || 0;
  const nightAmp = amps.night || 0;

  const vAm = bump(hour, AM.c, AM.w, amAmp);
  const vPm = bump(hour, PM.c, PM.w, pmAmp);
  const vNight = bump(hour, NIGHT.c, NIGHT.w, nightAmp);

  const mult = 1 + (seg.constOffset || 0) + vAm + vPm + vNight;
  const minutes = Math.round(seg.base * mult * 10) / 10;
  const level = levelFromRatio(minutes, seg.base);

  let best: PeakKey | "base" = "base";
  let bestVal = 0.05;
  const cand: Record<PeakKey, number> = { am: vAm, pm: vPm, night: vNight };
  (Object.keys(cand) as PeakKey[]).forEach((k) => {
    if (cand[k] > bestVal) {
      bestVal = cand[k];
      best = k;
    }
  });
  const reason = seg.phrases[best] || seg.phrases.base || "順暢";

  return { id, name: seg.name, base: seg.base, level, reason, minutes, source: "simulated" };
}

/** Overlays a live reading onto a segment's simulated baseline (same `id`/`base`). */
export function applyLiveReading(baseline: SegmentStatus, reading: LiveSegmentReading): SegmentStatus {
  const minutes = reading.travelTimeMinutes;
  const level = levelFromRatio(minutes, baseline.base);
  const speedText = reading.speedKmh !== undefined ? `,平均車速約 ${Math.round(reading.speedKmh)} km/h` : "";
  return {
    ...baseline,
    minutes,
    level,
    reason: `高速公路局即時路況${speedText}`,
    source: "live",
    asOf: reading.asOf,
  };
}

/**
 * Builds the full segment→status map for a point in time, overlaying any
 * live readings supplied (keyed by segment id) onto the simulated baseline.
 */
export function computeSegmentStatuses(
  hour: number,
  weekday: boolean,
  liveReadings: Partial<Record<SegmentId, LiveSegmentReading>> = {},
): Record<SegmentId, SegmentStatus> {
  const statuses: Record<SegmentId, SegmentStatus> = {};
  Object.keys(SEGMENTS).forEach((id) => {
    const baseline = segStatus(id, hour, weekday);
    const reading = liveReadings[id];
    statuses[id] = reading ? applyLiveReading(baseline, reading) : baseline;
  });
  return statuses;
}
