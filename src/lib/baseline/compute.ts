import { neon } from "@neondatabase/serverless";

import { MIN_SAMPLES_FOR_BASELINE, type BaselineBucket } from "./classify";

/**
 * The batch that turns raw snapshots into PRD §9's Baseline: per section, per
 * day of week, per 15-minute bucket, the p50/p75/p90 of travel time.
 *
 * Recomputed in full from a trailing window rather than updated incrementally.
 * Percentiles are not incrementally maintainable without keeping the whole
 * sample anyway, and a full recompute means the table can never drift away
 * from what `traffic_snapshot` actually says — a mismatch there would be
 * invisible and would poison every later comparison.
 */

function requireSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

/**
 * Eight weeks. PRD §14 (M0) sets ≥4 weeks as the floor for a usable baseline,
 * and doubling it gives each bucket a fuller sample without reaching so far
 * back that a road that genuinely changed (a new interchange, a finished
 * roadworks) keeps being compared against how it used to be.
 */
export const BASELINE_WINDOW_DAYS = 56;

export interface BaselineComputeResult {
  windowDays: number;
  /** Buckets written this run. */
  buckets: number;
  /** Of those, how many cleared MIN_SAMPLES_FOR_BASELINE — the only ones that can actually classify anything. */
  reliableBuckets: number;
  sections: number;
  samples: number;
  /** Rows dropped because the window no longer contains any reading for them. */
  removedStale: number;
  computedAt: string;
}

/**
 * The whole computation is one INSERT … ON CONFLICT DO UPDATE. Doing it as
 * DELETE-then-INSERT would leave a window in which the baseline table is
 * empty, and anything classifying during that window would answer "unknown"
 * for every road — a self-inflicted outage of the product's only real claim.
 */
export async function computeBaselines(
  windowDays: number = BASELINE_WINDOW_DAYS,
): Promise<BaselineComputeResult> {
  const sql = requireSql();

  // Taken from the database clock, not the app's: the rows below stamp
  // computed_at with the database's now(), so comparing against an app
  // timestamp would mean a few seconds of clock skew could delete rows this
  // very run had just written.
  const [{ run_start: runStart }] = (await sql`
    SELECT now() AS run_start
  `) as Array<Record<string, unknown>>;

  const written = (await sql`
    INSERT INTO baseline (section_id, dow, bucket, p50, p75, p90, sample_size, computed_at)
    SELECT
      section_id,
      EXTRACT(ISODOW FROM ts AT TIME ZONE 'Asia/Taipei')::smallint,
      (EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Taipei')::int * 4
        + FLOOR(EXTRACT(MINUTE FROM ts AT TIME ZONE 'Asia/Taipei') / 15)::int)::smallint,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY travel_minutes),
      percentile_cont(0.75) WITHIN GROUP (ORDER BY travel_minutes),
      percentile_cont(0.90) WITHIN GROUP (ORDER BY travel_minutes),
      COUNT(*)::int,
      now()
    FROM traffic_snapshot
    WHERE ts >= now() - (${windowDays}::int * INTERVAL '1 day')
      -- A zero or negative travel time is a broken reading, never a fast
      -- road; leaving them in would drag every percentile down and make
      -- normal traffic look like an anomaly. Nothing else is filtered: an
      -- implausibly *slow* reading is usually a real jam, which is precisely
      -- what the p90 is here to remember.
      AND travel_minutes > 0
    GROUP BY 1, 2, 3
    ON CONFLICT (section_id, dow, bucket) DO UPDATE SET
      p50         = EXCLUDED.p50,
      p75         = EXCLUDED.p75,
      p90         = EXCLUDED.p90,
      sample_size = EXCLUDED.sample_size,
      computed_at = EXCLUDED.computed_at
    RETURNING section_id, sample_size
  `) as Array<Record<string, unknown>>;

  // Any bucket the current window no longer supports still carries its old
  // numbers, and an untouched row is indistinguishable from a fresh one to
  // every reader. Dropping them keeps "what the baseline says" and "what the
  // data supports" the same statement.
  const stale = (await sql`
    DELETE FROM baseline WHERE computed_at < ${runStart} RETURNING section_id
  `) as Array<Record<string, unknown>>;

  const sizes = written.map((r) => Number(r.sample_size) || 0);
  return {
    windowDays,
    buckets: written.length,
    reliableBuckets: sizes.filter((n) => n >= MIN_SAMPLES_FOR_BASELINE).length,
    sections: new Set(written.map((r) => String(r.section_id))).size,
    samples: sizes.reduce((a, b) => a + b, 0),
    removedStale: stale.length,
    computedAt: new Date().toISOString(),
  };
}

export interface BaselineRow extends BaselineBucket {
  sectionId: string;
  dow: number;
  bucket: number;
  p50: number;
}

/**
 * The buckets for one moment across many sections — the shape a live
 * classification needs (`taipeiBucket(now)` gives the key). Sections with no
 * row are simply absent; `classifyAgainstBaseline` already treats a missing
 * bucket as "unknown", so callers must not substitute a neighbouring bucket
 * or a section-wide average to fill the hole.
 */
export async function readBaselineFor(
  sectionIds: string[],
  dow: number,
  bucket: number,
): Promise<Map<string, BaselineRow>> {
  if (sectionIds.length === 0) return new Map();
  const sql = requireSql();
  const rows = (await sql`
    SELECT section_id, dow, bucket, p50, p75, p90, sample_size
    FROM baseline
    WHERE dow = ${dow} AND bucket = ${bucket}
      AND section_id = ANY(${sectionIds}::text[])
  `) as Array<Record<string, unknown>>;

  return new Map(
    rows.map((r) => [
      String(r.section_id),
      {
        sectionId: String(r.section_id),
        dow: Number(r.dow),
        bucket: Number(r.bucket),
        p50: Number(r.p50),
        p75: Number(r.p75),
        p90: Number(r.p90),
        sampleSize: Number(r.sample_size),
      },
    ]),
  );
}

export interface BaselineReadiness {
  buckets: number;
  reliableBuckets: number;
  sections: number;
  /** Sections with at least one usable bucket — i.e. roads we can say anything about at all. */
  readySections: number;
  lastComputedAt: string | null;
}

/** How far the baseline is from being able to answer, for M0's exit check. */
export async function readBaselineReadiness(): Promise<BaselineReadiness> {
  const sql = requireSql();
  const [row] = (await sql`
    SELECT
      COUNT(*)::int                                                          AS buckets,
      COUNT(*) FILTER (WHERE sample_size >= ${MIN_SAMPLES_FOR_BASELINE})::int AS reliable_buckets,
      COUNT(DISTINCT section_id)::int                                        AS sections,
      COUNT(DISTINCT section_id) FILTER (WHERE sample_size >= ${MIN_SAMPLES_FOR_BASELINE})::int AS ready_sections,
      MAX(computed_at)                                                       AS last_computed_at
    FROM baseline
  `) as Array<Record<string, unknown>>;

  return {
    buckets: Number(row?.buckets) || 0,
    reliableBuckets: Number(row?.reliable_buckets) || 0,
    sections: Number(row?.sections) || 0,
    readySections: Number(row?.ready_sections) || 0,
    lastComputedAt: (row?.last_computed_at as string | null) ?? null,
  };
}
