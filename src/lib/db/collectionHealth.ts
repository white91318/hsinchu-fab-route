import { neon } from "@neondatabase/serverless";

/**
 * Read-only health report over whatever the M0 collector has stored so far.
 *
 * Its job is to make the collection itself falsifiable early. The baseline
 * (PRD §7.1) genuinely needs the ≥4 weeks §14 asks for — percentiles per
 * segment × day-of-week × 15-minute bucket can't be computed from a few
 * days. But everything that could make those 4 weeks *wasted* is visible
 * within a day or two: a collector that silently stopped, sections that
 * vanish overnight, absurd travel times, timestamps that don't line up.
 * Checking those late is how you discover at week four that you have three
 * weeks of nothing.
 */

function requireSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

export interface CollectionHealth {
  coverage: {
    rows: number;
    sections: number;
    firstReading: string | null;
    lastReading: string | null;
    /** Wall-clock span of collection, in hours — how far into the ≥4 weeks we are. */
    spanHours: number | null;
  };
  /**
   * Measured over collection *attempts*, not stored rows. A collector that is
   * polling fine but reading unchanged upstream data stores nothing, and
   * against row counts alone looks exactly like a collector that has died —
   * so the gap that matters is between attempts.
   *
   * `duplicateRate` separates the two cases: high means the collector is
   * healthy but polling faster than the upstream updates (or reading a cached
   * response), low means each poll genuinely brings something new.
   */
  continuity: {
    attempts: number;
    longestGapMinutes: number | null;
    medianGapMinutes: number | null;
    lastAttempt: string | null;
    duplicateRate: number | null;
    /** Distinct minutes that actually produced rows — the old measure, kept for contrast. */
    productiveMinutes: number;
  };
  /** Per section: sample count and the spread of travel times, to catch absurd values. */
  sections: Array<{
    sectionId: string;
    sectionName: string;
    samples: number;
    minMinutes: number | null;
    medianMinutes: number | null;
    maxMinutes: number | null;
  }>;
  /**
   * Congestion by hour of day (Asia/Taipei). Three weekdays is already enough
   * to see whether the commute peaks PRD §1.3 claims are real actually show
   * up, and whether they land where traffic/model.ts currently assumes
   * (08:00, 15:48, 23:30) — which is the single most valuable thing to learn
   * early, because the whole product rests on that claim.
   *
   * Each reading is divided by its own section's median, so 1.0 means
   * "normal for this road" and 1.4 means "40% slower than this road usually
   * is". Raw minutes can't answer this: sections here run from 1.2 to 9.3
   * minutes, so a median across them is dominated by the mid-length roads.
   *
   * Both a middle and a tail statistic, because they answer different
   * questions and the first alone is misleading. `congestionIndex` (median
   * across sections) says whether the whole corridor is slow; `worstIndex`
   * plus `worstSection` says whether *anything* is jammed. A real
   * single-direction jam — 新竹→竹北 at 2.3x during the evening peak, while
   * the opposite direction ran normally — moved `worstIndex` and left
   * `congestionIndex` sitting at exactly 1.0. PRD §7.2 defines an anomaly
   * per segment, so the tail is the number that matters.
   */
  hourlyShape: Array<{
    hour: number;
    samples: number;
    congestionIndex: number | null;
    worstIndex: number | null;
    worstSection: string | null;
    medianMinutes: number | null;
  }>;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function readCollectionHealth(): Promise<CollectionHealth> {
  const sql = requireSql();

  const [coverageRow] = (await sql`
    SELECT
      COUNT(*)::int                       AS rows,
      COUNT(DISTINCT section_id)::int     AS sections,
      MIN(ts)                             AS first_reading,
      MAX(ts)                             AS last_reading,
      EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600 AS span_hours
    FROM traffic_snapshot
  `) as Array<Record<string, unknown>>;

  // Gaps come from collection_run (every attempt), not traffic_snapshot
  // (only attempts that stored something) — see the type's comment.
  const [gapRow] = (await sql`
    WITH gaps AS (
      SELECT
        ran_at,
        EXTRACT(EPOCH FROM (ran_at - LAG(ran_at) OVER (ORDER BY ran_at))) / 60 AS gap
      FROM collection_run
    )
    SELECT
      (SELECT COUNT(*)::int FROM collection_run)                        AS attempts,
      (SELECT MAX(ran_at) FROM collection_run)                          AS last_attempt,
      (SELECT
         CASE WHEN SUM(fetched) > 0
           THEN SUM(duplicates)::float / SUM(fetched)
         END
       FROM collection_run)                                             AS duplicate_rate,
      MAX(gap)                                                          AS longest_gap,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)                  AS median_gap
    FROM gaps
    WHERE gap IS NOT NULL
  `) as Array<Record<string, unknown>>;

  const [productiveRow] = (await sql`
    SELECT COUNT(*)::int AS productive_minutes
    FROM (SELECT DISTINCT date_trunc('minute', collected_at) FROM traffic_snapshot) m
  `) as Array<Record<string, unknown>>;

  const sectionRows = (await sql`
    SELECT
      section_id,
      MAX(section_name) AS section_name,
      COUNT(*)::int     AS samples,
      MIN(travel_minutes) AS min_minutes,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_minutes) AS median_minutes,
      MAX(travel_minutes) AS max_minutes
    FROM traffic_snapshot
    GROUP BY section_id
    ORDER BY samples DESC, section_id
  `) as Array<Record<string, unknown>>;

  // Each reading is normalised against its own section's median before being
  // aggregated, so a jam on one road actually moves the number instead of
  // being averaged away against roads of a completely different length.
  const hourRows = (await sql`
    WITH section_median AS (
      SELECT
        section_id,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_minutes) AS median_minutes
      FROM traffic_snapshot
      GROUP BY section_id
    )
    ratios AS (
      SELECT
        EXTRACT(HOUR FROM t.ts AT TIME ZONE 'Asia/Taipei')::int AS hour,
        t.section_name,
        t.travel_minutes,
        t.travel_minutes / NULLIF(m.median_minutes, 0) AS ratio
      FROM traffic_snapshot t
      JOIN section_median m ON m.section_id = t.section_id
    ),
    -- The single slowest-relative-to-itself reading in each hour, and which
    -- road it was: a corridor-wide median hides exactly the single-segment
    -- jam this product exists to catch.
    worst AS (
      SELECT DISTINCT ON (hour) hour, section_name, ratio
      FROM ratios
      WHERE ratio IS NOT NULL
      ORDER BY hour, ratio DESC
    )
    SELECT
      r.hour,
      COUNT(*)::int AS samples,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.ratio) AS congestion_index,
      MAX(w.ratio) AS worst_index,
      MAX(w.section_name) AS worst_section,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.travel_minutes) AS median_minutes
    FROM ratios r
    JOIN worst w ON w.hour = r.hour
    GROUP BY r.hour
    ORDER BY r.hour
  `) as Array<Record<string, unknown>>;

  return {
    coverage: {
      rows: num(coverageRow?.rows) ?? 0,
      sections: num(coverageRow?.sections) ?? 0,
      firstReading: (coverageRow?.first_reading as string | null) ?? null,
      lastReading: (coverageRow?.last_reading as string | null) ?? null,
      spanHours: num(coverageRow?.span_hours),
    },
    continuity: {
      attempts: num(gapRow?.attempts) ?? 0,
      longestGapMinutes: num(gapRow?.longest_gap),
      medianGapMinutes: num(gapRow?.median_gap),
      lastAttempt: (gapRow?.last_attempt as string | null) ?? null,
      duplicateRate: num(gapRow?.duplicate_rate),
      productiveMinutes: num(productiveRow?.productive_minutes) ?? 0,
    },
    sections: sectionRows.map((r) => ({
      sectionId: String(r.section_id),
      sectionName: String(r.section_name ?? ""),
      samples: num(r.samples) ?? 0,
      minMinutes: num(r.min_minutes),
      medianMinutes: num(r.median_minutes),
      maxMinutes: num(r.max_minutes),
    })),
    hourlyShape: hourRows.map((r) => ({
      hour: num(r.hour) ?? 0,
      samples: num(r.samples) ?? 0,
      congestionIndex: num(r.congestion_index),
      worstIndex: num(r.worst_index),
      worstSection: (r.worst_section as string | null) ?? null,
      medianMinutes: num(r.median_minutes),
    })),
  };
}
