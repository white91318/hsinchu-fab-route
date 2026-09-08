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
   * Distinct collection minutes and the largest silence between them. A
   * collector meant to run every 5 minutes that shows a 90-minute gap has
   * been down, and no amount of later data repairs that hole in the baseline.
   */
  continuity: {
    collectionRuns: number;
    longestGapMinutes: number | null;
    medianGapMinutes: number | null;
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
   * Median travel time by hour of day (Asia/Taipei), summed across sections.
   * Three weekdays is already enough to see whether the commute peaks PRD
   * §1.3 claims are real actually show up — and whether they land where
   * traffic/model.ts currently assumes (08:00, 15:48, 23:30).
   */
  hourlyShape: Array<{ hour: number; samples: number; medianMinutes: number | null }>;
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

  // Gaps are measured between distinct collection minutes, not between rows:
  // one run writes ~28 rows at the same instant, which would otherwise read
  // as ~28 zero-length gaps and drown the real ones.
  const [gapRow] = (await sql`
    WITH runs AS (
      SELECT DISTINCT date_trunc('minute', collected_at) AS minute
      FROM traffic_snapshot
    ),
    gaps AS (
      SELECT EXTRACT(EPOCH FROM (minute - LAG(minute) OVER (ORDER BY minute))) / 60 AS gap
      FROM runs
    )
    SELECT
      (SELECT COUNT(*)::int FROM runs)                              AS collection_runs,
      MAX(gap)                                                      AS longest_gap,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)              AS median_gap
    FROM gaps
    WHERE gap IS NOT NULL
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

  const hourRows = (await sql`
    SELECT
      EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Taipei')::int AS hour,
      COUNT(*)::int AS samples,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_minutes) AS median_minutes
    FROM traffic_snapshot
    GROUP BY hour
    ORDER BY hour
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
      collectionRuns: num(gapRow?.collection_runs) ?? 0,
      longestGapMinutes: num(gapRow?.longest_gap),
      medianGapMinutes: num(gapRow?.median_gap),
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
      medianMinutes: num(r.median_minutes),
    })),
  };
}
