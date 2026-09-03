import { SEGMENTS } from "@/lib/data/segments";
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
  const level: CongestionLevel = mult < 1.15 ? "good" : mult < 1.45 ? "warning" : "critical";

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
  const minutes = Math.round(seg.base * mult * 10) / 10;

  return { id, name: seg.name, base: seg.base, level, reason, minutes };
}
