/**
 * PRD §7.2's anomaly levels, as a pure function so the thresholds can be
 * tested without a database. This is the decision that fires (or withholds) a
 * push notification, and PRD §4.2 makes 誤報率 the metric that kills the
 * product if it goes wrong — an off-by-one at a boundary here is not a
 * cosmetic bug.
 */

export type AnomalyLevel = "unknown" | "normal" | "watch" | "anomaly";

export interface BaselineBucket {
  p75: number;
  p90: number;
  sampleSize: number;
}

/**
 * Percentiles from a handful of readings are arithmetic, not evidence: the
 * P90 of three samples is just the largest of the three. PRD §14 (M0) asks
 * for ≥4 weeks, which at a 5-minute cadence is ~12 readings per
 * (weekday × 15-minute) bucket — so a bucket under 8 is treated as having no
 * usable baseline at all rather than one that happens to be thin.
 */
export const MIN_SAMPLES_FOR_BASELINE = 8;

export interface Classification {
  level: AnomalyLevel;
  /** Whether the bucket had enough history for the level to mean anything. */
  reliable: boolean;
  /** Observed ÷ P50-equivalent reference, for message copy. Null when unknown. */
  ratioToP75: number | null;
}

/**
 * Levels follow PRD §7.2 exactly: ≤P75 normal, >P75 and ≤P90 watch, >P90
 * anomaly. The comparisons are deliberately inclusive at the lower edge —
 * a reading sitting exactly on P75 is, by definition, within the normal
 * three-quarters and must not be escalated.
 *
 * With too little history the answer is "unknown", never "normal". They are
 * not the same claim: "normal" tells a commuter their route is fine today,
 * and saying that from no evidence is how a product that exists to be
 * trusted stops being trusted (PRD §7.3, §11 資料誠實).
 */
export function classifyAgainstBaseline(
  observedMinutes: number,
  baseline: BaselineBucket | null | undefined,
): Classification {
  if (!baseline || baseline.sampleSize < MIN_SAMPLES_FOR_BASELINE) {
    return { level: "unknown", reliable: false, ratioToP75: null };
  }

  const ratioToP75 = baseline.p75 > 0 ? observedMinutes / baseline.p75 : null;

  if (observedMinutes > baseline.p90) {
    return { level: "anomaly", reliable: true, ratioToP75 };
  }
  if (observedMinutes > baseline.p75) {
    return { level: "watch", reliable: true, ratioToP75 };
  }
  return { level: "normal", reliable: true, ratioToP75 };
}

/**
 * A known roadworks or closure on the route raises the floor regardless of
 * measured time (PRD §7.2: "或路線上有已知施工" / "或有事故／封閉事件").
 * Applied as a separate step so the measured and the announced parts of a
 * verdict stay distinguishable — PRD §6.2 requires telling the user which is
 * which, and §11 requires never presenting one as the other.
 */
export function raiseForIncident(level: AnomalyLevel, incident: "none" | "roadworks" | "closure"): AnomalyLevel {
  if (incident === "closure") return "anomaly";
  if (incident === "roadworks") {
    // Never downgrade: a measured anomaly stays an anomaly.
    return level === "anomaly" ? "anomaly" : "watch";
  }
  return level;
}
